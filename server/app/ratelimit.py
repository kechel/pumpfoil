"""DB-gestützter Rate-Limiter (Sliding Window) je Client-IP + Scope bzw. je User + Stufe.

Über die Tabelle `rate_events` → konsistent über MEHRERE uvicorn-Worker (früher In-Memory,
nur für einen Prozess korrekt). Schützt vor Brute-Force auf Login/Registrierung/Pairing und
begrenzt Chat-Spam. Hinter dem Apache-Proxy liefert uvicorn (--proxy-headers
--forwarded-allow-ips) die echte Client-IP. Geblockte Versuche verlängern das Fenster nicht.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from .db import get_db
from .models import RateEvent


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _too_many(retry_s: int, msg: str) -> HTTPException:
    return HTTPException(
        status.HTTP_429_TOO_MANY_REQUESTS, msg,
        headers={"Retry-After": str(max(retry_s, 1))},
    )


def _check_and_hit(db: Session, keys_limits: list[tuple[str, int, int]], msg: str) -> None:
    """Prüft ALLE (key, max_hits, window_s) erst; ist eine Stufe ausgelastet -> 429 (kein
    Eintrag). Sonst pro Key genau einen Treffer eintragen. Alte Einträge je Key aufräumen."""
    now = _now()
    for key, max_hits, window_s in keys_limits:
        cutoff = now - timedelta(seconds=window_s)
        db.query(RateEvent).filter(RateEvent.key == key, RateEvent.created_at < cutoff).delete(synchronize_session=False)
        cnt = db.query(func.count(RateEvent.id)).filter(RateEvent.key == key, RateEvent.created_at >= cutoff).scalar() or 0
        if cnt >= max_hits:
            earliest = db.query(func.min(RateEvent.created_at)).filter(
                RateEvent.key == key, RateEvent.created_at >= cutoff).scalar()
            retry = int((earliest + timedelta(seconds=window_s) - now).total_seconds()) + 1 if earliest else window_s
            db.commit()
            raise _too_many(retry, msg)
    for key, _m, _w in keys_limits:
        db.add(RateEvent(key=key, created_at=now))
    # gelegentliche globale Aufräumung verwaister Keys, ~2 % der Aufrufe.
    if now.microsecond < 20000:
        db.query(RateEvent).filter(RateEvent.created_at < now - timedelta(hours=2)).delete(synchronize_session=False)
    db.commit()


def rate_limit(max_hits: int, window_s: int, scope: str):
    """FastAPI-Dependency: erlaubt max_hits pro window_s je Client-IP und Scope, sonst 429."""

    def dep(request: Request, db: Session = Depends(get_db)) -> None:
        _check_and_hit(db, [(f"{scope}:{_client_ip(request)}", max_hits, window_s)],
                       "Zu viele Versuche. Bitte kurz warten und erneut versuchen.")

    return dep


def enforce_user_tiers(db: Session, user_id: int, tiers: list[tuple[int, int]], scope: str,
                       msg: str = "Zu viele Nachrichten. Bitte kurz warten.") -> None:
    """Mehrstufiges Per-User-Limit (z. B. 5/10 s UND 30/5 min). Alle Stufen werden erst geprüft."""
    _check_and_hit(db, [(f"{scope}:u{user_id}:{i}", m, w) for i, (m, w) in enumerate(tiers)], msg)
