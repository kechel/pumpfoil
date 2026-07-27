"""Push-Benachrichtigungen rund um eine fertig ausgewertete Session."""
from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from . import models
from .push import push_enabled, send_push, wants

log = logging.getLogger("notify")


def notify_session_analyzed(db: Session, session: "models.Session") -> None:
    """Owner EINMAL benachrichtigen, dass die Session ausgewertet ist. Idempotent über das
    `analyzed_notified`-Flag: `/complete` wird von den Uhren mehrfach gesendet (Retry/Watchdog/
    Reconnect) und Re-Analysen können erneut hier landen — trotzdem genau EINE Push-Nachricht.
    Rekord-Pushes laufen NICHT mehr hier, sondern über den täglichen Snapshot (app/records.py)."""
    if not push_enabled():
        return
    if session.analyzed_notified:   # schon gepusht -> nie erneut
        return
    # Vor dem Versand markieren (auch wenn der Nutzer Push deaktiviert hat oder er fehlschlägt):
    # der „ausgewertet"-Moment ist genau einmal, egal wie oft /complete erneut feuert.
    session.analyzed_notified = True
    try:
        if wants(db, session.user_id, "analyzed"):
            send_push(db, session.user_id, "Pumpfoil",
                      "Deine Session ist ausgewertet 📊", f"/sessions/{session.id}")
    except Exception as e:  # noqa: BLE001 – Benachrichtigung darf nie den Flow brechen
        log.warning("notify_session_analyzed failed: %s", e)
    db.commit()
