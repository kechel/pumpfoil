"""Konto-Reife: „frische" Konten (jünger als NEW_ACCOUNT_AGE_S).

Eine Quelle der Wahrheit für (a) das Anti-Spam-Neukonto-Gate in der Chat-Engine
und (b) das „neu"-Badge in Community & Chat. Beide nutzen dieselbe Schwelle,
damit ein Konto, das noch gedrosselt wird, auch sichtbar als neu markiert ist.
"""
from __future__ import annotations

from datetime import datetime, timezone

NEW_ACCOUNT_AGE_S = 24 * 3600  # < 24 h = "neu"


def is_new_account(created_at: datetime | None) -> bool:
    if created_at is None:
        return False
    return (datetime.now(timezone.utc) - created_at).total_seconds() < NEW_ACCOUNT_AGE_S

# Domains, unter denen Google/Firebase ihre AUTOMATISCHEN Pruefkonten anlegen. Dort sitzt per
# Definition kein Mensch — anders als bei gmail.com, wo dieselben Roboter Wegwerf-Adressen
# benutzen, die von echten Nutzern nicht zu unterscheiden sind.
#
# Anlass (19.09.2026): Googles Pre-Launch-Report faehrt die App vor jeder Freigabe ab und tippt
# gefundene Zeichenketten in jedes Textfeld — dabei landete unser eigenes Store-Testlogin als
# oeffentliche Nachricht in vier Spot-Chats. Ein solches Konto kam von
# `…-lvl-00@cloudtestlabaccounts.com` (das `-lvl-00` ist die Durchlaufnummer der Testmatrix).
#
# BEWUSST NUR DIESE DOMAINS. Die Adress-Heuristik „vorname+nachname.NNNNN@gmail.com" haette
# 33 Konten getroffen, von denen beweisbar nur drei Roboter sind — Jan hat sie deshalb verworfen:
# „die anderen sind regulaere, echte Google-User, die halt nur noch keine Session hochgeladen
# haben. Aber die kommen ja vielleicht wieder."
STORE_ROBOTER_DOMAINS = ("cloudtestlabaccounts.com",)


def ist_store_roboter_adresse(email: str | None) -> bool:
    """Gehoert diese Adresse einem automatischen Store-Pruefkonto?"""
    e = (email or "").strip().lower()
    return any(e.endswith("@" + d) for d in STORE_ROBOTER_DOMAINS)
