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
