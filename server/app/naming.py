"""Einheitlicher Anzeigename fuer Nutzer ohne gesetzten display_name.

Fallback = "User #<id>": stabil (immer derselbe Nutzer), eindeutig, verraet nichts
ausser der internen ID. Ueberall verwenden, wo ein Besitzer-/Autorenname ausgegeben wird.
"""
from __future__ import annotations

from sqlalchemy import String, cast, func


def owner_label(display_name: str | None, user_id: int | None) -> str | None:
    if display_name:
        return display_name
    return f"User #{user_id}" if user_id else None


def owner_label_sql(U):
    """SQL-Ausdruck: COALESCE(display_name, 'User #' || id) — als SELECT-Spalte nutzbar."""
    return func.coalesce(U.display_name, func.concat("User #", cast(U.id, String)))
