"""Alle Anmeldungen eines Kontos beenden — Passwortwechsel, Zuruecksetzen, „ueberall abmelden".

Security-Review 29.10.2026: `deps.current_user` prueft seit langem `users.session_epoch` (Tokens, die
davor ausgestellt wurden, gelten nicht mehr), gesetzt hat die Spalte aber niemand. Ein neues Passwort
beendete deshalb keine einzige Sitzung, und weil sich Tokens bei Benutzung verlaengern, blieb ein
entwendetes Token unbegrenzt gueltig.

Was NICHT beendet wird: die Kopplung der Uhren (`DeviceToken`). Eine Uhr meldet sich nicht neu an,
sie wuerde einfach nichts mehr hochladen, und der Nutzer merkte es erst nach der naechsten Session.
Uhren entkoppelt man einzeln unter „Geraete".
"""
from __future__ import annotations

from datetime import datetime, timezone

from . import models
from .security import create_access_token


def alle_beenden(db, user: models.User) -> str:
    """Sitzungen, offene Reset-Links und Agenten-Zugaenge (MCP) des Kontos beenden.

    Gibt ein FRISCHES Token zurueck, damit das Geraet, das die Aenderung ausgeloest hat, angemeldet
    bleibt (Clients uebernehmen es aus `X-Refresh-Token`, s. `deps.current_user`). Die Epoche liegt
    auf der vollen Sekunde: `iat` im Token ist ganzzahlig, und `current_user` vergleicht mit `<` —
    ein im selben Moment ausgestelltes Token bleibt damit gueltig. Committet NICHT.
    """
    jetzt = datetime.now(timezone.utc).replace(microsecond=0)
    user.session_epoch = jetzt
    db.query(models.PasswordReset).filter(models.PasswordReset.user_id == user.id,
                                          models.PasswordReset.used_at.is_(None)).update(
        {models.PasswordReset.used_at: jetzt}, synchronize_session=False)
    db.query(models.OAuthToken).filter(models.OAuthToken.user_id == user.id,
                                       models.OAuthToken.revoked_at.is_(None)).update(
        {models.OAuthToken.revoked_at: jetzt}, synchronize_session=False)
    return create_access_token(user.id)
