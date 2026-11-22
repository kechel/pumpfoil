"""Uhren-Statistik fuer den MCP-Server: genau die Tabellen von /watch-stats, sonst nichts.

Jan, 22.11.2026: „per mcp koennten wir die watch-stats und die uhren-stats foiling per watch und how well do they
record eigentlich zugaenglich machen, aber nicht mehr … ein aufruf zum suchen nach name … und ein aufruf fuer genau
die details die da auch in der tabelle angezeigt werden, dynamisch". Dazu: „modelle mit 1-3 fahrern lassen wir dann
da weg".

DIE EINZIGE AUSNAHME von der MCP-Grenze „nur eigene Daten" (Memory mcp-server-scope): die Uhren-Tabelle steht ohnehin
fuer jeden Angemeldeten auf /watch-stats. Nichts darueber hinaus — keine Gewichte, keine Spots, keine Zeitraeume,
keine Fahrer.

DYNAMISCH: beide Teile kommen aus denselben Quellen wie die Seite (`community.watch_stats`, Snapshot hinter
`/api/app/watch-quality`). Jedes Feld geht durch, ausser denen in `VERBORGEN` (stehen im Snapshot, die Seite zeigt sie
bewusst nicht). Ein NEUES Feld kommt also von selbst mit; `test_mcp_uhren.py` verlangt dafuer eine Zeile in
`ERKLAERUNG` oder `VERBORGEN`, damit niemand eine Spalte nach aussen gibt, ohne es zu merken.

WENIG FAHRER: Modelle mit hoechstens `MIN_FAHRER_AUSSCHLUSS` Fahrern fehlen ganz — bei einem Fahrer waere die
„Bestleistung des Modells" seine eigene, und ueber MCP laesst sich das systematisch abfragen.
"""
from __future__ import annotations

import unicodedata

from sqlalchemy.orm import Session

from . import models

MIN_FAHRER_AUSSCHLUSS = 3      # <= 3 Fahrer: Modell fehlt
MAX_TREFFER = 25

# Im Snapshot, auf der Seite aber nicht gezeigt (das Urteil hat die Seite am 05.09. bewusst abgeschafft).
VERBORGEN = frozenset({"urteil", "abstuerze", "speicher_voll", "puls_tot", "puls_starr", "puls_fehlt",
                       "puls_sessions"})

ERKLAERUNG = {
    # Foiling je Uhr (community.watch_stats)
    "watch": "Uhr-Modell, wie die Uhr es meldet.",
    "sessions": "Zahl der Aufnahmen.",
    "users": "Zahl der Fahrer mit diesem Modell.",
    "foiling_km": "Summe der Strecke auf dem Foil, km.",
    "avg_speed_kmh": "Durchschnittstempo auf dem Foil (Strecke/Zeit), km/h.",
    "best_distance_m": "Laengster einzelner Lauf aller Fahrer dieses Modells, m.",
    "best_speed_kmh": "Hoechstes Tempo aller Fahrer dieses Modells, km/h.",
    "avg_pump_hz": "Mittlerer Pumptakt, Hz (nur Aufnahmen mit Bewegungsdaten).",
    # Wie gut nehmen sie auf (scripts/uhren-qualitaet.py)
    "plattform": "garmin, apple, wear, zepp, huawei …",
    "modell": "Uhr-Modell.",
    "weg": "app = mit unserer App aufgenommen und hochgeladen; gc = mit unserer App aufgenommen, kam aber als Garmins "
           "eigene Datei ueber die Garmin-Connect-Verknuepfung.",
    "nutzer": "Zahl der Fahrer mit diesem Modell.",
    "stunden": "Gemessene Stunden auf dem Wasser.",
    "accel_hz": "Tatsaechlich gemessene Rate der Bewegungsdaten (nicht die angeforderte), Hz. Spalte „Pump detection“.",
    "gps_only": "Anteil Aufnahmen, die ohne brauchbare Bewegungsdaten auf reine GPS-Auswertung fielen (keine Pumps), %.",
    "mit_accel": "Anteil Aufnahmen mit brauchbaren Bewegungsdaten, %.",
    "accel_ab": "Gilt ab dieser App-Version (aeltere Aufnahmen zaehlen nicht mehr, die Aufnahme hat sich da geaendert).",
    "accel_alt": "Wahr: nur Aufnahmen aelterer App-Versionen vorhanden.",
    "vollstaendig": "Anteil Aufnahmen, die ganz ankamen: keine fehlenden Teile, keine GPS-Luecke ueber 3 min in "
                    "Bewegung, %. Je Fahrer gemittelt.",
    "laengste_accel_s": "Laengste vollstaendige Aufnahme mit Bewegungsdaten, s.",
    "ortung_steht": "Anteil GPS-Punkte, die die Position des Vorgaengers wiederholen (Uhr schreibt alten Fix weiter), %.",
    "guete_gut": "Nur Garmin: Anteil Punkte mit Guete-Stufe GOOD, %. NICHT mit hacc_m vergleichbar.",
    "hacc_m": "Nur Apple/Wear/Handy: mittlere gemeldete Genauigkeit, m. NICHT mit guete_gut vergleichbar.",
    "puls_wechsel": "Neue Pulswerte je Minute (Wertwechsel, nicht Anteil fehlender Punkte) — wie oft die Uhr wirklich "
                    "misst.",
    "puls_ab": "Puls gilt ab dieser App-Version.",
    "puls_alt": "Wahr: Puls nur aus aelteren App-Versionen.",
}


def _norm(s: str | None) -> str:
    s = unicodedata.normalize("NFKD", (s or "").replace("®", "").replace("™", ""))
    return " ".join("".join(c for c in s if not unicodedata.combining(c)).lower().split())


def _qualitaet() -> tuple[str, list[dict]]:
    from .api.appmeta import watch_quality
    d = watch_quality() or {}
    zeilen = list(d.get("modelle") or []) + list(d.get("modelle_konto") or [])
    return d.get("stand") or "", [{k: v for k, v in z.items() if k not in VERBORGEN} for z in zeilen
                                  if (z.get("nutzer") or 0) > MIN_FAHRER_AUSSCHLUSS]


def _foiling(db: Session, nutzer: models.User) -> list[dict]:
    from .api.community import watch_stats
    return [z for z in watch_stats(_user=nutzer, db=db) if (z.get("users") or 0) > MIN_FAHRER_AUSSCHLUSS]


def _felder(*zeilen_listen: list[dict]) -> dict:
    da = {k for zl in zeilen_listen for z in zl for k in z}
    return {k: ERKLAERUNG.get(k, "") for k in sorted(da)}


HINWEIS = ("Nur Modelle mit mehr als " + str(MIN_FAHRER_AUSSCHLUSS) + " Fahrern. Dieselben Zahlen wie auf "
           "pumpfoil.org/watch-stats. Prozentwerte 0–100.")


def suchen(db: Session, nutzer: models.User, arg: dict) -> dict:
    q = _norm(arg.get("name"))
    stand, qual = _qualitaet()
    foil = _foiling(db, nutzer)
    namen: dict[str, dict] = {}
    for z in foil:
        e = namen.setdefault(z["watch"], {"name": z["watch"], "fahrer": z.get("users"), "aufnahmen": z.get("sessions"),
                                          "tabellen": []})
        e["tabellen"].append("foiling")
    for z in qual:
        e = namen.setdefault(z["modell"], {"name": z["modell"], "fahrer": z.get("nutzer"),
                                           "aufnahmen": z.get("sessions"), "tabellen": []})
        if "aufnahme_qualitaet" not in e["tabellen"]:
            e["tabellen"].append("aufnahme_qualitaet")
    treffer = [e for e in namen.values() if not q or q in _norm(e["name"])]
    treffer.sort(key=lambda e: -(e["aufnahmen"] or 0))
    return {"treffer": treffer[:MAX_TREFFER], "gesamt": len(treffer), "hinweis": HINWEIS + " Den Namen woertlich an "
            "get_watch_stats uebergeben.", "stand_aufnahme_qualitaet": stand}


def details(db: Session, nutzer: models.User, arg: dict) -> dict:
    gesucht = _norm(arg.get("name"))
    if not gesucht:
        return {"fehler": "name fehlt — erst list_watches aufrufen."}
    stand, qual = _qualitaet()
    foil = [z for z in _foiling(db, nutzer) if _norm(z["watch"]) == gesucht]
    qual = [z for z in qual if _norm(z["modell"]) == gesucht]
    if not foil and not qual:
        return {"fehler": "Kein Modell mit diesem Namen (oder hoechstens " + str(MIN_FAHRER_AUSSCHLUSS) +
                " Fahrer). list_watches liefert die gueltigen Namen."}
    return {"foiling": foil[0] if foil else None,
            # je Weg (App / Garmin Connect) eine Zeile
            "aufnahme_qualitaet": qual,
            "stand_aufnahme_qualitaet": stand,
            "felder": _felder(foil, qual),
            "hinweis": HINWEIS}
