"""Push-Benachrichtigungen rund um eine fertig ausgewertete Session."""
from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from . import models
from .push import push_enabled, send_push, wants

log = logging.getLogger("notify")


def notify_session_analyzed(db: Session, session: "models.Session") -> None:
    """Owner benachrichtigen, dass die Session ausgewertet ist. Rekord-Pushes laufen NICHT mehr hier,
    sondern über den täglichen Snapshot (app/records.py) — fairer (kein „Erster-am-Kalendertag gewinnt")."""
    if not push_enabled():
        return
    try:
        if wants(db, session.user_id, "analyzed"):
            send_push(db, session.user_id, "Pumpfoil",
                      "Deine Session ist ausgewertet 📊", f"/sessions/{session.id}")
    except Exception as e:  # noqa: BLE001 – Benachrichtigung darf nie den Flow brechen
        log.warning("notify_session_analyzed failed: %s", e)
