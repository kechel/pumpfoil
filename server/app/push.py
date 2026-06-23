"""Web-Push (VAPID) – Versand an gespeicherte Subscriptions."""
from __future__ import annotations

import json
import logging

from sqlalchemy.orm import Session

from . import models
from .config import get_settings

log = logging.getLogger("push")


def push_enabled() -> bool:
    s = get_settings()
    return bool(s.vapid_public_key and s.vapid_private_key)


def wants(db: Session, user_id: int, ntype: str) -> bool:
    """Hat der Nutzer Push für diesen Typ aktiviert? (Default: ja)."""
    u = db.get(models.User, user_id)
    if u is None:
        return False
    prefs = {}
    if u.settings_json:
        try:
            prefs = (json.loads(u.settings_json) or {}).get("notify_prefs") or {}
        except ValueError:
            prefs = {}
    return bool(prefs.get(ntype, True))


def send_push(db: Session, user_id: int, title: str, body: str, url: str = "/") -> int:
    """Push an alle Subscriptions eines Nutzers. Tote (404/410) werden gelöscht.
    Best-effort: Fehler werden geloggt, nie geworfen. Gibt die Anzahl Zustellungen."""
    if not push_enabled():
        return 0
    try:
        from pywebpush import webpush, WebPushException
    except Exception:  # noqa: BLE001
        return 0
    s = get_settings()
    subs = db.query(models.PushSubscription).filter_by(user_id=user_id).all()
    payload = json.dumps({"title": title, "body": body, "url": url})
    sent = 0
    for sub in subs:
        try:
            webpush(
                subscription_info={"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
                data=payload,
                vapid_private_key=s.vapid_private_key,
                vapid_claims={"sub": s.vapid_subject},
                timeout=10,
            )
            sent += 1
        except WebPushException as e:  # noqa: PERF203
            code = getattr(getattr(e, "response", None), "status_code", None)
            if code in (404, 410):
                db.delete(sub)  # Subscription abgelaufen -> entfernen
            else:
                log.warning("push failed (%s): %s", code, e)
        except Exception as e:  # noqa: BLE001
            log.warning("push error: %s", e)
    db.commit()
    return sent
