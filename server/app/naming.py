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


def ist_gattung(label: str | None) -> bool:
    """True, wenn das Label nur die Marke/Gattung nennt und kein Geraetemodell."""
    return not label or not label.strip() or label.strip().lower() in _GATTUNGEN


def geraete_label(label: str | None, platform: str | None) -> str | None:
    """Uhr-Bezeichnung fuer die Anzeige: Gattungs-Label durch die gemeldete Plattform ersetzen."""
    echt = PLATTFORM_GERAET.get(platform or "")
    if not echt:
        return label
    return echt if ist_gattung(label) else label


# ---------------------------------------------------------------------------
# Apple Watch: Hardware-Kennung -> lesbarer Name.
#
# Warum das hier braucht: `WKInterfaceDevice.model` gibt IMMER nur "Apple Watch" zurueck, die
# Serie steht ausschliesslich in `utsname.machine` ("Watch7,12"). Unsere Uhr-App schickt die
# Kennung seit 1.1.30 mit JEDER Aufnahme (`sessions.device_model`, Form "Watch7,12 · watchOS 26.6"),
# beim Pairing dagegen gar nicht — deshalb setzen wir das Label aus der ersten Aufnahme.
#
# QUELLEN (recherchiert 12.09.2026, zwei unabhaengige, in allen gemeinsamen Eintraegen deckungs-
# gleich — Apple selbst veroeffentlicht diese Zuordnung nicht maschinenlesbar):
#   1. DeviceKit, Source/Device.generated.swift (MIT) — https://github.com/devicekit/DeviceKit
#      Reicht bis Watch7,20 und liefert als Einzige die GehaeuseGROESSEN.
#   2. pluwen/apple-device-model-list — https://github.com/pluwen/apple-device-model-list
#      Reicht weiter (Watch8,x), dafuer ohne Groessen.
# Watch8,2-8,5 (Series 12) ist durch beide Recherchewege belegt; Watch8,1 (Ultra 4) steht nur in
# Quelle 2 und folgt dem Muster der Ultra-Reihe (6,18 / 7,5 / 7,12 = je eine eigene Kennung).
# UNBEKANNTE Kennung faellt auf "Apple Watch" zurueck — nie raten, lieber die Gattung.
APPLE_WATCH_MODELLE = {
    "Watch1,1": "Apple Watch (1. Gen) 38 mm", "Watch1,2": "Apple Watch (1. Gen) 42 mm",
    "Watch2,6": "Apple Watch Series 1 38 mm", "Watch2,7": "Apple Watch Series 1 42 mm",
    "Watch2,3": "Apple Watch Series 2 38 mm", "Watch2,4": "Apple Watch Series 2 42 mm",
    "Watch3,1": "Apple Watch Series 3 38 mm", "Watch3,3": "Apple Watch Series 3 38 mm",
    "Watch3,2": "Apple Watch Series 3 42 mm", "Watch3,4": "Apple Watch Series 3 42 mm",
    "Watch4,1": "Apple Watch Series 4 40 mm", "Watch4,3": "Apple Watch Series 4 40 mm",
    "Watch4,2": "Apple Watch Series 4 44 mm", "Watch4,4": "Apple Watch Series 4 44 mm",
    "Watch5,1": "Apple Watch Series 5 40 mm", "Watch5,3": "Apple Watch Series 5 40 mm",
    "Watch5,2": "Apple Watch Series 5 44 mm", "Watch5,4": "Apple Watch Series 5 44 mm",
    "Watch5,9": "Apple Watch SE 40 mm", "Watch5,11": "Apple Watch SE 40 mm",
    "Watch5,10": "Apple Watch SE 44 mm", "Watch5,12": "Apple Watch SE 44 mm",
    "Watch6,1": "Apple Watch Series 6 40 mm", "Watch6,3": "Apple Watch Series 6 40 mm",
    "Watch6,2": "Apple Watch Series 6 44 mm", "Watch6,4": "Apple Watch Series 6 44 mm",
    "Watch6,6": "Apple Watch Series 7 41 mm", "Watch6,8": "Apple Watch Series 7 41 mm",
    "Watch6,7": "Apple Watch Series 7 45 mm", "Watch6,9": "Apple Watch Series 7 45 mm",
    "Watch6,10": "Apple Watch SE (2. Gen) 40 mm", "Watch6,12": "Apple Watch SE (2. Gen) 40 mm",
    "Watch6,11": "Apple Watch SE (2. Gen) 44 mm", "Watch6,13": "Apple Watch SE (2. Gen) 44 mm",
    "Watch6,14": "Apple Watch Series 8 41 mm", "Watch6,16": "Apple Watch Series 8 41 mm",
    "Watch6,15": "Apple Watch Series 8 45 mm", "Watch6,17": "Apple Watch Series 8 45 mm",
    "Watch6,18": "Apple Watch Ultra",
    "Watch7,1": "Apple Watch Series 9 41 mm", "Watch7,3": "Apple Watch Series 9 41 mm",
    "Watch7,2": "Apple Watch Series 9 45 mm", "Watch7,4": "Apple Watch Series 9 45 mm",
    "Watch7,5": "Apple Watch Ultra 2",
    "Watch7,8": "Apple Watch Series 10 42 mm", "Watch7,10": "Apple Watch Series 10 42 mm",
    "Watch7,9": "Apple Watch Series 10 46 mm", "Watch7,11": "Apple Watch Series 10 46 mm",
    "Watch7,12": "Apple Watch Ultra 3",
    "Watch7,13": "Apple Watch SE (3. Gen) 40 mm", "Watch7,14": "Apple Watch SE (3. Gen) 40 mm",
    "Watch7,15": "Apple Watch SE (3. Gen) 44 mm", "Watch7,16": "Apple Watch SE (3. Gen) 44 mm",
    "Watch7,17": "Apple Watch Series 11 42 mm", "Watch7,19": "Apple Watch Series 11 42 mm",
    "Watch7,18": "Apple Watch Series 11 46 mm", "Watch7,20": "Apple Watch Series 11 46 mm",
    "Watch8,1": "Apple Watch Ultra 4",
    "Watch8,2": "Apple Watch Series 12", "Watch8,3": "Apple Watch Series 12",
    "Watch8,4": "Apple Watch Series 12", "Watch8,5": "Apple Watch Series 12",
}

# Werte, die KEIN Geraet benennen. "Simulator"/"arm64" meldet die Uhr-App im Simulator
# (Recorder.deviceModel faengt das schon ab, aeltere Aufnahmen tragen es noch).
_KEIN_MODELL = {"", "simulator", "arm64", "x86_64", "i386", "unknown"}


def modell_aus_session(device_model: str | None) -> str | None:
    """Uhr-Bezeichnung aus `sessions.device_model` ("Watch7,12 · watchOS 26.6").

    Nur der Teil VOR dem Trenner ist das Geraet, dahinter steht das Betriebssystem. Apple-
    Kennungen werden uebersetzt, alles andere (Wear: "SM-R915F") ist schon ein Modellname.
    Gibt None zurueck, wenn nichts Brauchbares drinsteht — dann bleibt das bisherige Label.
    """
    if not device_model:
        return None
    teil = device_model.split("·")[0].strip()
    if not teil or teil.lower() in _KEIN_MODELL:
        return None
    if teil.startswith("Watch") and "," in teil:
        # Unbekannte Apple-Kennung NICHT als Label durchreichen ("Watch9,3" sagt niemandem etwas).
        return APPLE_WATCH_MODELLE.get(teil, "Apple Watch")
    return teil[:120]
