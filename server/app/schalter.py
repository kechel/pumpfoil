"""Globale Schalter, die ohne neuen App-Build umgelegt werden — per Eintrag in `server/.env`
(systemd liest sie per EnvironmentFile), danach `sudo systemctl restart foil-server`.

Muster wie `DETECTOR_V3` (analysis/v3/nachbearbeitung.py): fehlt der Eintrag, gilt AUS.
"""
from __future__ import annotations

import os


def _an(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in ("1", "true", "yes", "on")


def chat_fotos_fuer_alle() -> bool:
    """Bilder im Chat fuer ALLE statt nur fuer Admins (`CHAT_PHOTOS_ALL=1`).

    Jan, 01.10.2026: „das anhängen von Bildern im chat muss ein Schalter am server sein, das will
    ich dann aktivieren sobald die apps eine woche oder so ausgerollt sind die das auch koennen,
    bis dahin sollen das nur admins koennen". Grund: wer eine App ohne Bildanzeige hat, saehe eine
    Nachricht nur aus Bildern als leere Blase. ANZEIGEN koennen alle Clients die Bilder immer; der
    Schalter regelt nur das Anhaengen. Die Clients fragen ihn ueber `/api/me` (`chat_photos`) ab,
    nicht ueber `is_admin` — so braucht das Umlegen keinen neuen App-Build.
    """
    return _an("CHAT_PHOTOS_ALL")


def darf_chat_fotos(user) -> bool:
    return bool(getattr(user, "is_admin", False)) or chat_fotos_fuer_alle()
