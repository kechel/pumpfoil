"""Zugangsdaten von Polar, Suunto, COROS und Strava verschluesselt in der DB (S-016, 29.10.2026).

WARUM: Diese Tokens oeffnen fremde Konten (Trainings mit GPS und Puls). Standen sie im Klartext,
reichte ein DB- oder Backup-Leck fuer den Zugriff. Jetzt verschluesselt die Spaltenart
`Verschluesselt` beim Schreiben und entschluesselt beim Lesen — der uebrige Code merkt nichts.

Schluessel: `FOIL_TOKEN_KEY` in server/.env (Fernet, AES-128-CBC + HMAC). Er liegt bewusst NICHT
in der DB, und er wandert mit server/.env in die GPG-verschluesselte Sicherung
(deploy/backup-secrets.sh) — ohne ihn sind die gespeicherten Tokens wertlos, alle muessten neu
verbinden. Also: Schluessel nie wechseln oder loeschen, ohne vorher umzuschluesseln.

Altbestand (Klartext, ohne Praefix) wird weiter gelesen; db._tokens_verschluesseln schreibt ihn
einmalig verschluesselt zurueck. Fehlt der Schluessel (z. B. ein Skript ohne .env), wird im
Klartext GESCHRIEBEN und laut gewarnt — lieber ein lesbares Token als ein verlorenes.
"""
from __future__ import annotations

import logging
import os

from sqlalchemy.types import Text, TypeDecorator

log = logging.getLogger(__name__)

PRAEFIX = "enc1:"
_fernet = None
_gewarnt = False


def _f():
    global _fernet
    if _fernet is None:
        schluessel = os.environ.get("FOIL_TOKEN_KEY", "").strip()
        if not schluessel:
            return None
        from cryptography.fernet import Fernet
        _fernet = Fernet(schluessel.encode())
    return _fernet


def verschluesseln(klar: str | None) -> str | None:
    global _gewarnt
    if not klar or klar.startswith(PRAEFIX):
        return klar
    f = _f()
    if f is None:
        if not _gewarnt:
            log.error("FOIL_TOKEN_KEY fehlt — Anbieter-Token wird UNVERSCHLUESSELT gespeichert")
            _gewarnt = True
        return klar
    return PRAEFIX + f.encrypt(klar.encode()).decode()


def entschluesseln(wert: str | None) -> str | None:
    if not wert or not wert.startswith(PRAEFIX):
        return wert                      # Altbestand im Klartext
    f = _f()
    if f is None:
        raise RuntimeError("FOIL_TOKEN_KEY fehlt — verschluesseltes Anbieter-Token nicht lesbar")
    return f.decrypt(wert[len(PRAEFIX):].encode()).decode()


class Verschluesselt(TypeDecorator):
    """Text-Spalte, die in der DB verschluesselt steht."""
    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        return verschluesseln(value)

    def process_result_value(self, value, dialect):
        return entschluesseln(value)
