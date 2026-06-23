"""Minimaler E-Mail-Versand via SMTP (stdlib). Ohne konfigurierten SMTP_HOST wird
nicht versendet, sondern der Inhalt geloggt — so funktioniert der Reset-Flow auch,
bevor die SMTP-Zugangsdaten eingetragen sind."""
from __future__ import annotations

import logging
import smtplib
import ssl
from email.message import EmailMessage

from .config import get_settings

log = logging.getLogger("mailer")
settings = get_settings()


def send_email(to: str, subject: str, body: str) -> bool:
    """Sendet eine Plaintext-Mail. Gibt True bei Versand, False wenn nur geloggt/fehlgeschlagen."""
    if not settings.smtp_host:
        log.warning("SMTP nicht konfiguriert — Mail an %s NICHT gesendet:\n%s\n%s", to, subject, body)
        return False
    msg = EmailMessage()
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    try:
        ctx = ssl.create_default_context()
        # Port 465 = direktes SSL (SMTPS); 587/25 = Klartext + STARTTLS.
        if settings.smtp_port == 465:
            smtp = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=15, context=ctx)
        else:
            smtp = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15)
        with smtp as s:
            if settings.smtp_port != 465 and settings.smtp_starttls:
                s.starttls(context=ctx)
            if settings.smtp_user:
                s.login(settings.smtp_user, settings.smtp_pass)
            s.send_message(msg)
        return True
    except Exception:  # noqa: BLE001
        log.exception("SMTP-Versand an %s fehlgeschlagen", to)
        return False
