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


# ---------------------------------------------------------------------------
# Anzeigename einer UHR, wenn im Token nur eine Gattung steht statt eines Modells.
#
# Die vom Geraet GEMELDETE Plattform ist die verlaessliche Quelle: nur die Garmin-App schickt
# kein `p=`, Wear/Apple/Zepp melden ihre alle (s. devices._plat_fuer_hinweis). Das LABEL dagegen
# kommt vom pairenden Client und ist dort teils fest verdrahtet — `Api.pairClaim` in der iOS-App
# schickt immer "Garmin" mit. Folge: 17 Apple Watches von 8 Nutzern standen als „Garmin" in der
# Geraeteliste UND unter jeder ihrer Aufnahmen im Community-Feed (gefunden 11.09.2026, aelteste
# vom 23.07., ueber die iOS-Versionen 1.1.15 bis 1.1.31).
#
# Deshalb wird hier beim LESEN korrigiert und nicht nur beim Schreiben: so sieht es sofort fuer
# alle richtig aus, auch fuer Tokens, die nie wieder einchecken. Ein echter Modellname
# ("fenix 6 Pro", "SM-R915F") bleibt immer unangetastet — ersetzt wird nur eine Gattung.
PLATTFORM_GERAET = {"garmin": "Garmin", "wear": "Wear OS", "apple": "Apple Watch", "zepp": "Amazfit"}

# Alles, was KEIN Modell ist, sondern nur die Marke/Gattung — in der Schreibweise, in der es die
# verschiedenen Clients bisher geschickt haben.
_GATTUNGEN = {"garmin", "wear", "wear os", "wearos", "apple", "apple watch", "watch", "amazfit", "zepp"}


def geraete_label(label: str | None, platform: str | None) -> str | None:
    """Uhr-Bezeichnung fuer die Anzeige: Gattungs-Label durch die gemeldete Plattform ersetzen."""
    echt = PLATTFORM_GERAET.get(platform or "")
    if not echt:
        return label
    if not label or not label.strip() or label.strip().lower() in _GATTUNGEN:
        return echt
    return label
