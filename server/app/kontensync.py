"""Verknuepfte Konten synchronisieren — Polar, Suunto, COROS.

Bis zum 06.09.2026 gab es KEINEN automatischen Sync: `sync()` haengt in `LinkedAccounts.tsx`
ausschliesslich am Knopf. Wer sein Konto verknuepfte und danach nie wieder auf die Seite ging,
bekam seine Trainings nie zu sehen. Aufgefallen an einem COROS-Training, das an einem inzwischen
behobenen Parser-Fehler gescheitert war — ohne Zufall haette das niemand bemerkt.

Zwei Ausloeser nutzen diese Stelle, damit es nur EINE Definition von „faellig" gibt:
  * Anmeldung (Jan: „sync bei verknuepften Konten sollten wir wenigstens immer selber aufrufen,
    wenn sich der user in der app anmeldet") — laeuft als Hintergrundaufgabe, die Anmeldung
    wartet also nicht darauf.
  * `foil-account-sync.timer`, taeglich, ueber `scripts/verknuepfte-konten-syncen.py` — fuer
    alle, die sich laengere Zeit nicht anmelden.

Kontingent: alle drei Schnittstellen fragen ab `link.last_sync_at`. Kam seither nichts dazu, ist
die Liste leer und es wird keine einzige Datei geladen. COROS erlaubt 50 FIT-Dateien je Konto und
Tag, wir holen hoechstens 25 je Lauf — mit `MINDESTABSTAND_H` ist das nicht zu erreichen.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

log = logging.getLogger(__name__)

# (Anzeigename, Modellklasse in models, Modul mit der sync-Funktion)
ANBIETER: tuple[tuple[str, str, str], ...] = (
    ("Polar", "PolarLink", "app.api.polar"),
    ("Suunto", "SuuntoLink", "app.api.suunto"),
    ("COROS", "CorosMcpLink", "app.api.coros_mcp"),
)

# Stunden seit dem letzten Sync, ab denen erneut geholt wird. 20 statt 24, damit ein taeglicher
# Lauf nicht daran scheitert, dass er ein paar Minuten frueher dran ist als am Vortag.
MINDESTABSTAND_H = 20


def _faellig(zeit, grenze) -> bool:
    if zeit is None:
        return True
    if zeit.tzinfo is None:
        zeit = zeit.replace(tzinfo=timezone.utc)
    return zeit < grenze


def faellige_nutzer(mindestabstand_h: int = MINDESTABSTAND_H) -> dict[str, list[int]]:
    """Je Anbieter die Nutzer, deren letzter Sync lange genug her ist. Rein lesend."""
    from . import models
    from .db import SessionLocal

    grenze = datetime.now(timezone.utc) - timedelta(hours=mindestabstand_h)
    aus: dict[str, list[int]] = {}
    db = SessionLocal()
    try:
        for name, modell, _ in ANBIETER:
            Link = getattr(models, modell, None)
            if Link is None:
                continue
            aus[name] = [l.user_id for l in db.query(Link).all()
                         if _faellig(l.last_sync_at, grenze)]
    finally:
        db.close()
    return aus


def fuer_nutzer(user_id: int, mindestabstand_h: int = MINDESTABSTAND_H) -> dict[str, object]:
    """Alle faelligen Anbieter EINES Nutzers synchronisieren. Eigene DB-Sitzung, wirft nie.

    Gedacht als Hintergrundaufgabe: der Aufrufer (Anmeldung) darf davon nichts merken, weder
    zeitlich noch wenn ein Anbieter gerade stoert. Deshalb wird jeder Fehler nur protokolliert.
    """
    import importlib

    from . import models
    from .db import SessionLocal

    grenze = datetime.now(timezone.utc) - timedelta(hours=mindestabstand_h)
    ergebnis: dict[str, object] = {}
    for name, modell, modul in ANBIETER:
        Link = getattr(models, modell, None)
        if Link is None:
            continue
        db = SessionLocal()
        try:
            link = db.query(Link).filter_by(user_id=user_id).first()
            if link is None or not _faellig(link.last_sync_at, grenze):
                continue
            nutzer = db.get(models.User, user_id)
            if nutzer is None or getattr(nutzer, "blocked", False):
                continue
            ergebnis[name] = importlib.import_module(modul).sync(user=nutzer, db=db)
            log.info("kontensync: %s fuer user %s -> %s", name, user_id, ergebnis[name])
        except Exception as exc:  # noqa: BLE001 — ein Anbieter stoppt die anderen nicht
            ergebnis[name] = f"{type(exc).__name__}: {exc}"
            log.warning("kontensync: %s fuer user %s gescheitert: %s", name, user_id, exc)
        finally:
            db.close()
    return ergebnis
