"""Tanz-Abschnitte ansehen und korrigieren (nur Besitzer, nur sport == "dance"). Siehe app/tanz.py."""
from __future__ import annotations

import math
from functools import lru_cache

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, storage, tanz, tanz_server
from ..db import get_db
from .deps import current_user

router = APIRouter(prefix="/api/sessions", tags=["tanz"])


def _eigene_tanz_session(db, sid: int, user) -> models.Session:
    s = db.get(models.Session, sid)
    # Auch aeltere Tanz-Sessions aus der Pumpfoil-App (vor der Tanz-App), sobald es eine Auswertung gibt.
    if s is None or s.deleted or s.user_id != user.id or (
            (s.sport or "") != "dance" and db.get(models.TanzSession, s.id) is None):
        raise HTTPException(404, "Keine eigene Tanz-Session")
    return s


@lru_cache(maxsize=8)
def _server_fenster(uuid: str, scale: int, _bloecke: int) -> tuple:
    a = storage.load_accel(uuid).astype(float) / scale
    g = storage.load_gyro(uuid).astype(float)
    g = g[:len(a)] / 1024 * 180 / math.pi if len(g) else None
    return tuple(tanz_server.fenster(a, g)) if len(a) else ()


def _antwort(s: models.Session, abschnitte: list[dict]) -> dict:
    """Tabelle plus Server-Vorschlag (app/tanz_server.py) je Zeile — eigene Spalte neben der Uhr."""
    try:
        bloecke = len(list((storage.session_dir(s.session_uuid) / "accel").glob("*.bin")))
        fs = list(_server_fenster(s.session_uuid, s.accel_scale or 1000, bloecke))
        zf = tanz_server.zeilen_fenster(fs, abschnitte) if fs else [[] for _ in abschnitte]
    except (OSError, ValueError):
        zf = [[] for _ in abschnitte]
    # Je Zeile die drei besten mit Sicherheit in % (Jan, 25.10.2026): was die Uhr-Rechnung (Tanz.mc) und was
    # das Server-Modell sagen wuerde, beide aus den Rohdaten. server_vorschlag = Platz 1 (aeltere Clients).
    def _liste(top):
        return [{"tanz": k, "prozent": p} for k, p in top]
    rows = []
    for r, ws in zip(abschnitte, zf):
        st = tanz_server.top3(ws) if ws else []
        rows.append({**r, "server_vorschlag": st[0][0] if st else None, "server_top3": _liste(st),
                     "uhr_top3": _liste(tanz_server.uhr_top3(ws)) if ws else []})
    return {"abschnitte": rows, "taenze": list(tanz.TAENZE), "server_version": tanz_server.VERSION}


@router.get("/{sid}/tanz")
def tanz_lesen(sid: int, db: Session = Depends(get_db), user=Depends(current_user)):
    s = _eigene_tanz_session(db, sid, user)
    d = tanz.laden(db, s.id) or {"abschnitte": []}
    return _antwort(s, d.get("abschnitte") or [])


@router.put("/{sid}/tanz")
def tanz_korrigieren(sid: int, body: dict = Body(...), db: Session = Depends(get_db), user=Depends(current_user)):
    s = _eigene_tanz_session(db, sid, user)
    if tanz.sperren(db, s.id) is None:          # Zeilensperre bis zum Commit (parallele Korrekturen warten)
        return _antwort(s, [])
    alt = tanz.laden(db, s.id)["abschnitte"]
    d = tanz.speichern(db, s.id, tanz.aus_web(body.get("abschnitte"), alt), "web")
    db.commit()
    return _antwort(s, d["abschnitte"])
