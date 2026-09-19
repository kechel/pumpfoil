"""Ein Nutzerkonto restlos loeschen — DSGVO.

WARUM ES DIESES MODUL GIBT (19.09.2026): `DELETE /api/auth/me` raeumte genau acht Tabellen ab,
waehrend **44 Fremdschluessel** auf `users` zeigen. Jede Loeschung eines Kontos, das je einen
Chatraum geoeffnet, ein Geraet verknuepft oder eine Rueckmeldung geschrieben hatte, endete
deshalb in einem `ForeignKeyViolation` und HTTP 500 — der Nutzer blieb in der Datenbank.

Schlimmer: `_purge_session` loescht die Rohdaten-Verzeichnisse MITTEN in der Transaktion. Beim
Rollback kamen die Zeilen zurueck, die Dateien nicht. Genau so geschehen bei u588 am 18.09.
10:07: 142 Sessions verloren ihre GPS-Spuren, die Datenbankzeilen blieben stehen, das Konto
existiert weiter — und der Mensch dachte, er sei geloescht.

ZWEI REGELN, die daraus folgen:

1. **Erst die Datenbank, dann die Dateien.** Dateipfade werden gesammelt und ERST NACH einem
   erfolgreichen Commit entfernt. Schlaegt etwas fehl, ist nichts verloren.
2. **Die Aufraeumliste wird nicht gepflegt, sondern abgeleitet.** Eine von Hand gefuehrte Liste
   veraltet mit der naechsten neuen Tabelle — genau das ist hier passiert. Stattdessen laeuft der
   Code ueber die Metadaten aller Modelle und raeumt jeden Verweis auf `users.id` selbst ab:
   Spalte NOT NULL -> Zeile loeschen, Spalte nullable -> auf NULL setzen (so bleiben etwa
   Rekord-Historien erhalten, nur ohne Personenbezug).
"""
from __future__ import annotations

import shutil
from pathlib import Path

from sqlalchemy import delete, update
from sqlalchemy.orm import Session

from . import models, storage
from .media import delete_media


def _verweise_auf_users() -> list[tuple[object, object]]:
    """Alle (Tabelle, Spalte), die auf `users.id` zeigen — aus den Modellen abgeleitet.

    Dadurch faellt eine kuenftige Tabelle nicht mehr durchs Raster: sie wird automatisch
    mit abgeraeumt, sobald sie einen Fremdschluessel auf `users` hat.
    """
    raus = []
    for tabelle in models.Base.metadata.sorted_tables:
        if tabelle.name == "users":
            continue
        for spalte in tabelle.columns:
            for fk in spalte.foreign_keys:
                if fk.column.table.name == "users":
                    raus.append((tabelle, spalte))
    return raus


def konto_loeschen(db: Session, user: models.User) -> dict:
    """Konto + alle Daten entfernen. Gibt eine kleine Bilanz zurueck (fuers Protokoll).

    Der Aufrufer committet NICHT selbst — das passiert hier, und erst danach fallen die Dateien.
    """
    uid = user.id
    dateien: list[Path] = []
    medien: list[str] = []

    # 1) Sessions samt Anhaengseln. Verzeichnisse nur EINSAMMELN, nicht loeschen.
    for s in db.query(models.Session).filter_by(user_id=uid).all():
        sid = s.id
        db.query(models.AnalysisResult).filter_by(session_id=sid).delete()
        db.query(models.Label).filter_by(session_id=sid).delete()
        db.query(models.SessionLike).filter_by(session_id=sid).delete()
        db.query(models.SessionVote).filter_by(session_id=sid).delete()
        db.query(models.SessionVideo).filter_by(session_id=sid).delete()
        for p in db.query(models.SessionPhoto).filter_by(session_id=sid).all():
            medien.append(p.url)
            db.delete(p)
        try:
            d = storage.session_dir(s.session_uuid)
            if d.exists():
                dateien.append(d)
        except ValueError:
            pass
        db.delete(s)

    # 2) Eigene Spot-Beschreibungen mit ihren Bildern (eigener Weg wegen der Dateien).
    from .api.spotnotes import _note_weg
    for n in db.query(models.SpotNote).filter_by(user_id=uid).all():
        _note_weg(db, n)

    if user.avatar_url:
        medien.append(user.avatar_url)
    db.flush()

    # 3) Alles Uebrige, abgeleitet statt aufgezaehlt.
    geleert: dict[str, int] = {}
    for tabelle, spalte in _verweise_auf_users():
        if spalte.nullable:
            r = db.execute(update(tabelle).where(spalte == uid).values({spalte.name: None}))
        else:
            r = db.execute(delete(tabelle).where(spalte == uid))
        if r.rowcount:
            geleert[f"{tabelle.name}.{spalte.name}"] = int(r.rowcount)

    db.delete(user)
    db.commit()

    # 4) ERST JETZT die Dateien — nach diesem Punkt kann nichts mehr zurueckgerollt werden.
    for d in dateien:
        shutil.rmtree(d, ignore_errors=True)
    for m in medien:
        delete_media(m)
    return {"sessions": len(dateien), "medien": len(medien), "tabellen": geleert}
