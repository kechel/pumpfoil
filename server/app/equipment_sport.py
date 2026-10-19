"""Equipment je Sportart: Vorauswahl + Standard (19.10.2026, Stand-Buch: equipment_je_sport).

Anlass Oerni (Wing + Pumpfoil): stellt er eine Session nachtraeglich auf Wingfoil um, bleibt das
Pumpfoil-Foil eingetragen und er muss es von Hand aendern. Jetzt kann jede Sportart ihren eigenen
Standard haben — `settings_json.equipment_je_sport = {sportart: {foil_id, board_id, stab_id,
mast_len_cm}}`. Nur eingetragene Felder zaehlen; was fehlt, faellt auf den allgemeinen Standard
(`foil_id`, `stab_id`, … in den Einstellungen) zurueck.

GRUNDSATZ: von Hand gewaehlte Ausruestung wird NIE ueberschrieben. Ersetzt wird ein Feld nur, wenn
es leer ist oder noch genau dem Standard der vorigen Sportart entspricht — dann hat es niemand
bewusst gesetzt. Wer nichts je Sportart einstellt, merkt keinen Unterschied.
"""
from __future__ import annotations

import json

FELDER = ("foil_id", "board_id", "stab_id", "mast_len_cm")


def einstellungen(user) -> dict:
    if user is None or not getattr(user, "settings_json", None):
        return {}
    try:
        return json.loads(user.settings_json) or {}
    except ValueError:
        return {}


def je_sport(st: dict, sport: str | None) -> dict:
    return ((st.get("equipment_je_sport") or {}).get(sport or "pumpfoil") or {})


def standard(st: dict, sport: str | None, feld: str):
    """Was fuer `feld` bei dieser Sportart als Standard gilt: der Eintrag je Sportart, sonst der
    allgemeine Standard."""
    eig = je_sport(st, sport)
    return eig[feld] if feld in eig else st.get(feld)


def umstellen(session, user, alt: str | None, neu: str | None) -> list[str]:
    """Sportart einer Session wechselt von `alt` auf `neu`: unberuehrte Felder auf den Standard der
    neuen Sportart setzen. Gibt die geaenderten Felder zurueck."""
    if (alt or "pumpfoil") == (neu or "pumpfoil"):
        return []
    st = einstellungen(user)
    ziel = je_sport(st, neu)
    geaendert = []
    for f in FELDER:
        if f not in ziel:
            continue
        cur = getattr(session, f, None)
        if cur is None or cur == standard(st, alt, f):
            if cur != ziel[f]:
                setattr(session, f, ziel[f])
                geaendert.append(f)
    return geaendert


def beim_anlegen(user, sport: str | None, werte: dict) -> dict:
    """Werte einer NEUEN Session (foil_id + Setup-Schnappschuss) an die Sportart anpassen: wo der
    Wert leer ist oder dem allgemeinen Standard entspricht, gilt der Standard der Sportart."""
    st = einstellungen(user)
    eig = je_sport(st, sport)
    out = dict(werte)
    for f in FELDER:
        if f in eig and (out.get(f) is None or out.get(f) == st.get(f)):
            out[f] = eig[f]
    return out


def bereinigen(roh, sports) -> dict:
    """Eingabe aus PUT /settings pruefen: nur bekannte Sportarten und Felder, Ganzzahlen bzw. None."""
    out: dict = {}
    if not isinstance(roh, dict):
        return out
    for sp, v in roh.items():
        if sp not in sports or not isinstance(v, dict):
            continue
        e: dict = {}
        for f in FELDER:
            if f not in v:
                continue
            x = v[f]
            if x in (None, ""):
                continue        # leer = kein eigener Standard fuer dieses Feld
            try:
                x = int(x)
            except (TypeError, ValueError):
                continue
            if f == "mast_len_cm" and not 20 <= x <= 200:
                continue
            e[f] = x
        if e:
            out[sp] = e
    return out
