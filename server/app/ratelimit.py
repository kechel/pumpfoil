"""Einfacher In-Memory-Rate-Limiter (Sliding Window) je Client-IP + Scope.

Reicht für einen einzelnen uvicorn-Prozess (so läuft der Server). Schützt vor
Brute-Force auf Login/Registrierung/Pairing. Hinter dem Apache-Proxy liefert
uvicorn (--proxy-headers --forwarded-allow-ips) die echte Client-IP.
"""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

_lock = threading.Lock()
_hits: dict[str, deque[float]] = defaultdict(deque)


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _too_many(retry_s: int, msg: str) -> HTTPException:
    return HTTPException(
        status.HTTP_429_TOO_MANY_REQUESTS, msg,
        headers={"Retry-After": str(max(retry_s, 1))},
    )


def _gc(cutoff: float) -> None:
    """Selten globale Leichen aufräumen, damit der Speicher nicht wächst."""
    if len(_hits) > 10000:
        for k in [k for k, v in list(_hits.items()) if not v or v[-1] < cutoff]:
            _hits.pop(k, None)


def rate_limit(max_hits: int, window_s: int, scope: str):
    """FastAPI-Dependency: erlaubt max_hits pro window_s je Client-IP und Scope,
    sonst HTTP 429 mit Retry-After. Geblockte Versuche verlängern das Fenster nicht."""

    def dep(request: Request) -> None:
        key = f"{scope}:{_client_ip(request)}"
        now = time.monotonic()
        cutoff = now - window_s
        with _lock:
            dq = _hits[key]
            while dq and dq[0] < cutoff:
                dq.popleft()
            if len(dq) >= max_hits:
                raise _too_many(
                    int(dq[0] + window_s - now) + 1,
                    "Zu viele Versuche. Bitte kurz warten und erneut versuchen.",
                )
            dq.append(now)
            _gc(now - window_s)

    return dep


def enforce_user_tiers(user_id: int, tiers: list[tuple[int, int]], scope: str,
                       msg: str = "Zu viele Nachrichten. Bitte kurz warten.") -> None:
    """Mehrstufiges Per-User-Limit (z. B. 5/10 s UND 30/5 min). Prüft ALLE Stufen
    erst und zählt den Treffer nur, wenn keine Stufe ausgelastet ist — ein
    geblockter Versuch verlängert kein Fenster. Sonst HTTP 429 mit Retry-After.
    Pro (user, scope, Stufe) eine eigene Sliding-Window-Queue."""
    now = time.monotonic()
    with _lock:
        dqs = []
        for i, (max_hits, window_s) in enumerate(tiers):
            dq = _hits[f"{scope}:u{user_id}:{i}"]
            cutoff = now - window_s
            while dq and dq[0] < cutoff:
                dq.popleft()
            if len(dq) >= max_hits:
                raise _too_many(int(dq[0] + window_s - now) + 1, msg)
            dqs.append(dq)
        for dq in dqs:
            dq.append(now)
        _gc(now - max(w for _, w in tiers))
