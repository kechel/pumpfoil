"""Tanz-Abschnitte der Tanz-App (watch-dance/Tanz.mc, Jan 21.10.2026).

NUR fuer Sessions mit sport == "dance". Nichts hier beruehrt die Pumpfoil-Auswertung (Regel „nur
Pumpfoil -> Tanz", CLAUDE.md). Die Uhr erkennt Abschnitte und schlaegt einen Tanz vor, Jan bestaetigt
oder aendert ihn am Handgelenk oder spaeter im Web — gesammelt wird die Wahrheit fuer eine bessere
Erkennung. Abgelegt als data/<uuid>/tanz.json (keine DB-Spalte: create_all legt keine Spalten an).

Format je Abschnitt: start_ms, ende_ms (Session-ms, wie die Accel-Zeitachse), vorschlag (Uhr, oder
None bei manuell), gewaehlt (None = unbestaetigt),
quelle (auto|bestaetigt|geaendert|manuell|nachtraeglich|marker|web),
tempo (Auf-und-ab-Bewegungen je min, Median), dreh (Anteil gedrehter Fenster in %).
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from . import storage

TAENZE = ("lw", "tango", "ww", "slowfox", "quickstep", "samba", "chacha", "rumba", "paso", "jive",
          "salsa", "bachata", "discofox", "boogie", "kein")
# 4 nur Tanz-App 0.4; 5 = Marker (ab 0.5 jede Bestaetigung): nur ein Hinweis, gedeutet wird hier, nicht auf der Uhr.
QUELLEN_UHR = {0: "auto", 1: "bestaetigt", 2: "geaendert", 3: "manuell", 4: "nachtraeglich", 5: "marker"}
MAX_ABSCHNITTE = 500


def _key(v):
    return v if isinstance(v, str) and v in TAENZE else None


def _int(v, lo=0, hi=10 ** 9):
    try:
        i = int(v)
    except (TypeError, ValueError):
        return None
    return i if lo <= i <= hi else None


def aus_uhr(roh) -> list[dict]:
    """Liste der Uhr ([start, ende, vorschlag, gewaehlt, quelle, tempo, dreh]) -> bereinigte Abschnitte."""
    out = []
    for z in (roh or [])[:MAX_ABSCHNITTE]:
        if not isinstance(z, list) or len(z) < 5:
            continue
        start = _int(z[0])
        ende = _int(z[1], -1)
        if start is None or ende is None:
            continue
        out.append({
            "start_ms": start, "ende_ms": (ende if ende >= start else None),
            "vorschlag": _key(z[2]), "gewaehlt": _key(z[3]),
            "quelle": QUELLEN_UHR.get(_int(z[4], 0, 9), "auto"),
            "tempo": _int(z[5], 0, 400) if len(z) > 5 else None,
            "dreh": _int(z[6], 0, 100) if len(z) > 6 else None,
        })
    return out


def fenster_entpacken(roh) -> dict | None:
    """Rhythmus-Verlauf der Uhr (Tanz.mc _packen): {"t0": ms, "w": [zahl, ...]} -> Liste je 10-s-Fenster
    {t_ms, tempo, klar, quer, umdr} — zum Abgleich Uhr gegen Server-Rechnung und fuer spaetere Auswertung."""
    if not isinstance(roh, dict) or not isinstance(roh.get("w"), list):
        return None
    t0 = _int(roh.get("t0"), 0)
    if t0 is None:
        return None
    out = []
    for i, z in enumerate(roh["w"][:2000]):
        z = _int(z, 0, 2 ** 31 - 1)
        if z is None:
            continue
        u = (z >> 23) & 0xFF
        out.append({"t_ms": t0 + i * 10000, "tempo": z & 0xFF, "klar": ((z >> 8) & 0x7F) / 100,
                    "quer": ((z >> 15) & 0xFF) / 100, "umdr": None if u == 254 else u / 100})
    return {"fenster": out}


def orte_entpacken(roh) -> list[dict] | None:
    """GPS-Fixe der Tanz-App (TanzSensoren.mc, alle 30 min ein Einzel-Fix, 21.10.2026):
    `[[t_ms, lat, lon, genauigkeit], ...]`. Liegen NUR hier (tanz.json, Besitzer), nie im GPS-Kanal —
    keine Karte, kein Spot; Jans Fernbild ist ohnehin nur Stadt/Ortsteil."""
    if not isinstance(roh, list):
        return None
    out = []
    for z in roh[:200]:
        if not (isinstance(z, list) and len(z) >= 3 and all(isinstance(x, (int, float)) for x in z[:3])):
            continue
        t, lat, lon = int(z[0]), float(z[1]), float(z[2])
        if not (-90 <= lat <= 90 and -180 <= lon <= 180) or (lat == 0 and lon == 0):
            continue
        q = z[3] if len(z) > 3 and isinstance(z[3], int) else None
        out.append({"t_ms": t, "lat": round(lat, 6), "lon": round(lon, 6), "genauigkeit": q})
    return out


def laden(uuid: str) -> dict | None:
    p = storage.session_dir(uuid) / "tanz.json"
    try:
        return json.loads(p.read_text())
    except (OSError, ValueError):
        return None


def speichern(uuid: str, abschnitte: list[dict], quelle: str, fenster_uhr: list | None = None,
              orte: list | None = None) -> dict:
    d = {"abschnitte": abschnitte, "quelle": quelle, "stand": datetime.now(timezone.utc).isoformat()}
    alt = laden(uuid)
    if orte is not None:
        d["orte"] = orte
    elif alt and alt.get("orte") is not None:
        d["orte"] = alt["orte"]
    if fenster_uhr is not None:
        d["fenster_uhr"] = fenster_uhr
    elif alt and alt.get("fenster_uhr") is not None:
        d["fenster_uhr"] = alt["fenster_uhr"]
    if alt and alt.get("uhr") is not None:
        d["uhr"] = alt["uhr"]                       # Original der Uhr bleibt fuer den Vergleich erhalten
    elif quelle == "uhr":
        d["uhr"] = abschnitte
    p = storage.ensure_session_dir(uuid) / "tanz.json"
    p.write_text(json.dumps(d, ensure_ascii=False))
    return d


def aus_web(neu, alt: list[dict]) -> list[dict]:
    """Web-Korrektur: je Abschnitt (per Index) nur `gewaehlt` aendern; Zeiten bleiben die der Uhr."""
    out = [dict(a) for a in alt]
    for e in (neu or [])[:MAX_ABSCHNITTE]:
        if not isinstance(e, dict):
            continue
        i = _int(e.get("index"), 0, len(out) - 1)
        if i is None:
            continue
        g = _key(e.get("gewaehlt"))
        if g != out[i].get("gewaehlt"):
            out[i]["gewaehlt"] = g
            out[i]["quelle"] = "web"
    return out
