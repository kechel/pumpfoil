"""Medien neuer Konten erst nach Freigabe fuer alle sichtbar (Jan, 12.11.2026).

Anlass: ein am Vortag angelegtes Konto hing einen Werbe-Link als „Video" an eine Session, er stand sofort im Feed
„Neueste Medien". Jan: „neue user [sollen] das einfach machen koennen, diese medien dann aber nur mir im admin bereich
angezeigt werden in einer ansicht 'medien uploads neuer user' die ich dann einzeln freigeben oder die user gleich
blockieren kann / shadow bannen. die user die selber was hochgeladen haben sollen das aber garnicht sehen sondern im
prinzip nur die medien dieser neuen user nicht allen angezeigt werden aber dem uploader selber schon".

Regel: Fotos und Videos von Konten, die juenger als NEU_TAGE sind, bekommen beim Anlegen `freigabe_offen = True`.
Solche Medien sieht nur der Uploader selbst (und Admins in der Pruef-Ansicht); fuer alle anderen fehlen sie ueberall
— Feed, Session-Details, Galerie, Foiler-Seite, Listen-Vorschaubild, geteilte Links. Kein Hinweis fuer den Uploader.
Freigabe setzt `freigabe_offen = False` (api/admin_medienfreigabe.py).

Wer schaut gerade? `betrachter()` liest die Nutzer-ID aus dem Bearer-Token der Anfrage (ASGI-Middleware wie der
Freunde-Filter, damit die Abfragen keinen zusaetzlichen Parameter brauchen). Ohne Token (oeffentlicher Link) = None.
"""
from __future__ import annotations

import contextvars
from datetime import datetime, timedelta, timezone

from sqlalchemy import or_

NEU_TAGE = 7
_BETRACHTER: contextvars.ContextVar[int | None] = contextvars.ContextVar("medien_betrachter", default=None)


def betrachter() -> int | None:
    return _BETRACHTER.get()


def sichtbar(M):
    """SQL-Bedingung: Medium (SessionPhoto/SessionVideo) fuer den aktuellen Betrachter sichtbar (Freigabe-Sicht)."""
    v = betrachter()
    if v is None:
        return M.freigabe_offen.isnot(True)
    return or_(M.freigabe_offen.isnot(True), M.user_id == v)


def braucht_freigabe(user) -> bool:
    """Neues Konto (juenger als NEU_TAGE) und kein Admin -> Medien erst nach Freigabe fuer andere sichtbar."""
    if user is None or getattr(user, "is_admin", False):
        return False
    seit = user.created_at
    if seit is None:
        return False
    if seit.tzinfo is None:
        seit = seit.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - seit < timedelta(days=NEU_TAGE)


class BetrachterKontext:
    """ASGI-Middleware: Nutzer-ID aus dem Bearer-Token in die Kontextvariable (nur /api; ungueltig -> None)."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http" or not scope.get("path", "").startswith("/api"):
            return await self.app(scope, receive, send)
        uid = None
        for k, wert in scope.get("headers") or []:
            if k == b"authorization":
                roh = wert.decode("latin-1")
                if roh.lower().startswith("bearer "):
                    from .security import decode_access_token
                    try:
                        uid = decode_access_token(roh[7:].strip())
                    except Exception:  # noqa: BLE001
                        uid = None
                break
        token = _BETRACHTER.set(uid)
        try:
            await self.app(scope, receive, send)
        finally:
            _BETRACHTER.reset(token)
