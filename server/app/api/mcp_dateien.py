"""Rohdaten einer Aufnahme als Datei, fuer einen KI-Agenten mit eigener Code-Ausfuehrung.

WARUM (Jan, 26.09.2026): „die sollen ja nicht im Kontext landen, aber irgendwie zum Download
bereitstehen, damit … mit einem Skript die auswerten koennte". Ein MCP-Werkzeug liefert deshalb
NICHT die Daten, sondern einen kurzlebigen, signierten Link. Der Agent laedt ihn per Skript und
rechnet dort — in seinem Kontext steht nur die Beschreibung der Datei.

Je Datenart ein eigener Link („ruhig aber getrennte Aufrufe, man muss ja nicht immer gleich alles
laden"): `gps` (Position, Tempo, Puls, Genauigkeit), `accel`, `gyro`. CSV, weil das jedes Skript
ohne Zusatzbibliothek liest.

DIE GRENZE bleibt dieselbe wie in `mcp.py`: nur eigene, gueltige Aufnahmen (`_eigene`), nur
lesend, und „Ort verbergen" gilt — dann wird die Spur wie ueberall sonst nach Point Nemo
versetzt. Geprueft wird beim Ausstellen UND beim Abruf: wird die Aufnahme dazwischen geloescht
oder aussortiert, oder der KI-Zugang widerrufen, ist der Link tot.

Der Link braucht keine Anmeldung (das Skript des Agenten hat keine). Deshalb kurz: 15 Minuten.
"""
from __future__ import annotations

import io
import logging
from datetime import datetime, timedelta, timezone

import jwt
import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from .. import models, ortverbergen, storage
from ..config import get_settings
from ..db import get_db

log = logging.getLogger("app.mcp_dateien")
router = APIRouter(tags=["mcp"])

GUELTIG = timedelta(minutes=15)
_AUD = "pumpfoil-mcp-datei"
ARTEN = ("gps", "accel", "gyro")
# Feste Skala des Kreisels (Vertrag, docs/data-format.md): 1024 Schritte je rad/s.
GYRO_SCALE = 1024.0


def _geheim() -> str:
    # Eigener Ableger des App-Schluessels: ein Datei-Link darf nie als Anmelde-Token taugen und
    # umgekehrt. Die `aud` ist der zweite Riegel.
    return get_settings().jwt_secret + "|mcp-datei"


def _zugang_aktiv(db: Session, user_id: int) -> bool:
    """Hat der Nutzer noch einen nicht widerrufenen KI-Zugang? Sonst gilt kein Link mehr."""
    from .mcp_oauth import RESOURCE
    jetzt = datetime.now(timezone.utc)
    return db.query(models.OAuthToken).filter(
        models.OAuthToken.user_id == user_id,
        models.OAuthToken.resource == RESOURCE,
        models.OAuthToken.revoked_at.is_(None),
        models.OAuthToken.expires_at > jetzt,
    ).first() is not None


def _eigene(db: Session, user_id: int):
    from .mcp import _eigene as basis
    return basis(db, user_id)


def verfuegbar(s: models.Session) -> list[str]:
    """Welche Datenarten es fuer diese Aufnahme gibt — nur die, die auch Inhalt haetten."""
    d = storage.session_dir(s.session_uuid)
    aus = []
    for art in ARTEN:
        sub = d / art
        if sub.is_dir() and any(sub.glob("*.json" if art == "gps" else "*.bin")):
            aus.append(art)
    return aus


def _beschreibung(art: str, s: models.Session, verborgen: bool) -> dict:
    if art == "gps":
        return {"spalten": ["t_ms", "lat", "lon", "speed_mps", "hr_bpm", "h_acc_m"],
                "bedeutung": "Ein Punkt je GPS-Fix (rund 1 je Sekunde). t_ms = Millisekunden ab "
                             "Aufnahmebeginn. Leere Zelle = kein Wert. Puls ROH, also auch "
                             "stehengebliebene Werte (get_session nimmt sie heraus).",
                "ort": ("VERSETZT nach Point Nemo (der Nutzer verbirgt den Ort). Form und "
                        "Abstaende der Spur stimmen, die Lage nicht." if verborgen else "echt")}
    if art == "accel":
        return {"spalten": ["t_ms", "ax_g", "ay_g", "az_g"],
                "bedeutung": "Beschleunigung in g je Achse, Geraete-Koordinaten. t_ms ist GEBAUT "
                             "(Beschleunigungswerte haben keine eigenen Zeitstempel) — wie, sagt "
                             "time_base in get_session. Ganze Aufnahme, ohne Zuschnitt.",
                "rate_angefordert_hz": s.accel_hz, "accel_scale": s.accel_scale}
    return {"spalten": ["t_ms", "gx_rad_s", "gy_rad_s", "gz_rad_s"],
            "bedeutung": "Drehrate in rad/s je Achse, nur Handy-Aufnahmen. t_ms wie bei accel "
                         "gebaut, aus den eigenen Blockzeiten des Kreisels (er laeuft auf "
                         "manchen Handys mit anderer Rate als der Accel). Ganze Aufnahme."}


def link_ausstellen(db: Session, user_id: int, s: models.Session, art: str) -> dict:
    """Den signierten Link samt Beschreibung. Von `mcp.get_download_link` aufgerufen."""
    ablauf = datetime.now(timezone.utc) + GUELTIG
    token = jwt.encode({"sid": s.id, "uid": user_id, "art": art, "aud": _AUD,
                        "exp": ablauf}, _geheim(), algorithm="HS256")
    verborgen = ortverbergen.ist_verborgen(s, ortverbergen.profil_verbirgt(s.user))
    name = f"pumpfoil-{s.id}-{art}.csv"
    return {
        "session_id": s.id, "datei": art, "dateiname": name, "format": "text/csv",
        "url": f"{get_settings().base_url}/api/mcp/datei/{token}",
        "gueltig_bis": ablauf.isoformat(),
        "hinweis": "Den Link per Skript laden (z. B. pandas.read_csv(url)), nicht in den "
                   "Kontext holen. Er gilt 15 Minuten; danach einfach neu anfordern.",
        **_beschreibung(art, s, verborgen),
    }


# --- Inhalt ------------------------------------------------------------------------------------

def _csv(kopf: list[str], spalten: list[np.ndarray], formate: list[str]) -> bytes:
    puffer = io.StringIO()
    puffer.write(",".join(kopf) + "\n")
    if spalten and len(spalten[0]):
        np.savetxt(puffer, np.column_stack(spalten), delimiter=",", fmt=formate)
    # Leere Zellen statt „nan": so liest es auch ein Tabellenprogramm als „kein Wert".
    return puffer.getvalue().replace("nan", "").encode()


def _gps_csv(s: models.Session, verborgen: bool) -> bytes:
    gps = storage.load_gps(s.session_uuid)

    def spalte(i: int) -> np.ndarray:
        return np.array([float(r[i]) if len(r) > i and r[i] is not None else np.nan
                         for r in gps], dtype=float)

    t, lat, lon, v, hr, hacc = (spalte(i) for i in range(6))
    if verborgen and gps:
        # Dieselbe Versetzung wie Karte und Export der App: die Form bleibt, die Lage nicht.
        ok = ~np.isnan(lat) & ~np.isnan(lon)
        neu = ortverbergen.versetzen(list(zip(lat[ok].tolist(), lon[ok].tolist())))
        lat[ok] = [p[0] for p in neu]
        lon[ok] = [p[1] for p in neu]
    return _csv(["t_ms", "lat", "lon", "speed_mps", "hr_bpm", "h_acc_m"],
                [t, lat, lon, v, hr, hacc], ["%.0f", "%.7f", "%.7f", "%.3f", "%.0f", "%.1f"])


def _achse(s: models.Session, werte: np.ndarray, kind: str) -> np.ndarray:
    """Zeitachse des Kanals wie in der Analyse (`timebase`), aber ohne Zuschnitt: Rohdaten sind
    die ganze Aufnahme. Blockzeiten und -laengen aus dem EIGENEN Verzeichnis des Kanals."""
    from ..analysis.timebase import build_timebase
    t0 = storage.load_accel_t0(s.session_uuid) if kind == "accel" else storage.load_gyro_t0(s.session_uuid)
    tb = build_timebase(storage.load_gps(s.session_uuid), werte, s.accel_scale or 1,
                        s.accel_hz, chunk_counts=storage.chunk_laengen(s.session_uuid, kind),
                        t0_by_index=t0)
    return tb.t_accel_ms.astype(float)


def _sensor_csv(s: models.Session, kind: str) -> bytes:
    if kind == "accel":
        roh = storage.load_accel(s.session_uuid)
        skala, kopf = float(s.accel_scale or 1), ["t_ms", "ax_g", "ay_g", "az_g"]
    else:
        roh = storage.load_gyro(s.session_uuid)
        skala, kopf = GYRO_SCALE, ["t_ms", "gx_rad_s", "gy_rad_s", "gz_rad_s"]
    if not roh.shape[0]:
        return _csv(kopf, [], [])
    t = _achse(s, roh, kind)
    n = min(len(t), roh.shape[0])     # die Achse kann Proben am Rand verwerfen
    w = roh[:n].astype(float) / skala
    return _csv(kopf, [t[:n], w[:, 0], w[:, 1], w[:, 2]], ["%.1f", "%.5f", "%.5f", "%.5f"])


@router.get("/api/mcp/datei/{token}")
def datei(token: str, db: Session = Depends(get_db)):
    try:
        z = jwt.decode(token, _geheim(), algorithms=["HS256"], audience=_AUD)
        sid, uid, art = int(z["sid"]), int(z["uid"]), str(z["art"])
    except (jwt.PyJWTError, KeyError, ValueError):
        # Abgelaufen, veraendert oder nie ausgestellt — fuer den Aufrufer alles dasselbe.
        raise HTTPException(404, "Link ungueltig oder abgelaufen. Neu anfordern.")
    if art not in ARTEN or not _zugang_aktiv(db, uid):
        raise HTTPException(404, "Link ungueltig oder abgelaufen. Neu anfordern.")
    s = _eigene(db, uid).filter(models.Session.id == sid).first()
    if s is None:
        raise HTTPException(404, "Link ungueltig oder abgelaufen. Neu anfordern.")
    verborgen = ortverbergen.ist_verborgen(s, ortverbergen.profil_verbirgt(s.user))
    inhalt = _gps_csv(s, verborgen) if art == "gps" else _sensor_csv(s, art)
    log.info("MCP-Datei: Nutzer %s, Session %s, %s, %d Bytes", uid, sid, art, len(inhalt))
    return Response(content=inhalt, media_type="text/csv; charset=utf-8", headers={
        "Content-Disposition": f'attachment; filename="pumpfoil-{sid}-{art}.csv"',
        "Cache-Control": "private, no-store",
    })
