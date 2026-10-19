"""Zusatzzahlen je Sportart (19.10.2026, Stand-Buch Stufe 2 + „Fahrten").

NUR ANZEIGE, beim Ausliefern der Session aus den vorhandenen Laeufen und der Spur berechnet —
die Erkennung bleibt unangetastet, keine Neuberechnung noetig, gilt sofort fuer alle Sessions.

- **Fahrten** (Wind): aufeinanderfolgende Laeufe gehoeren zu EINER Fahrt, solange die Pause
  dazwischen hoechstens FAHRT_PAUSE_S dauert. Jan, 19.10.2026: „mach die pause auf 5min, in 5min
  geht man nicht an Land und wieder raus, dann hat es nur etwas laenger gedauert." Kurze Stuerze,
  Wenden und Wasserstarts zerlegen eine Wing-Ausfahrt sonst in Dutzende Laeufe (#17478: 57).
  845 Wing-Sessions: bei 5 min im Median 1 Fahrt je Session.
- **Fahrzeit in Bewegung**: Sekunden mit Tempo >= BEWEGT_KMH (Spur ist 1 Hz).
- **Tempo ueber die ganze Fahrt**: Gesamtstrecke / Fahrzeit in Bewegung.
- **On-Foil-Anteil**: Foiling-Zeit / Fahrzeit in Bewegung.

Nur fuer Wind, Motor und Welle (sportprofil.GRUPPE) — beim Pumpen sind Laeufe die richtige Einheit.

Welle (19.10.2026, Stand-Buch wellen / welle_paddeln / downwind_strecke / downwind_verbunden):
- **Wave**: jeder Lauf ist eine Welle -> Zahl der Wellen, laengste Welle (Zeit + Strecke), Zeit auf
  der Welle gegen die uebrige Fahrzeit in Bewegung (= Rauspaddeln/Zurueck).
- **Downwind**: Fahrten wie bei Wind, je Fahrt zusaetzlich die Luftlinie von A nach B, das Tempo
  darauf und der Anteil der Strecke auf dem Foil (wie gut die Wellen verbunden wurden).
"""
from __future__ import annotations

import math

FAHRT_PAUSE_S = 300.0
BEWEGT_KMH = 4.0
GRUPPEN = ("wind", "motor", "welle")


def _schritt(a, b) -> float:
    x = (b[0] - a[0]) * 111320.0 * math.cos(math.radians(a[1]))
    y = (b[1] - a[1]) * 111320.0
    d = math.hypot(x, y)
    return d if d <= 200.0 else 0.0   # Spruenge (GPS-Luecke) nicht mitzaehlen, wie die Karte


def _luftlinie(a, b) -> float:
    x = (b[0] - a[0]) * 111320.0 * math.cos(math.radians(a[1]))
    y = (b[1] - a[1]) * 111320.0
    return math.hypot(x, y)


def berechnen(gruppe: str, segments: list[dict] | None, track: dict | None,
              total_m: float | None, foil_s: float | None, sport: str | None = None) -> dict | None:
    if gruppe not in GRUPPEN or not track:
        return None
    coords = (track.get("geometry") or {}).get("coordinates") or []
    props = track.get("properties") or {}
    speeds = props.get("speeds_mps") or (props.get("speeds") or {}).get("1") or []
    if len(coords) < 2:
        return None
    fahrzeit = sum(1 for v in speeds if v is not None and v * 3.6 >= BEWEGT_KMH) if speeds else None
    out: dict = {}
    if fahrzeit:
        out["fahrzeit_s"] = int(fahrzeit)
        if total_m:
            out["tempo_kmh"] = round(total_m / fahrzeit * 3.6, 1)
        if foil_s is not None:
            out["foil_anteil"] = round(min(1.0, foil_s / fahrzeit), 3)
    if sport == "surf_wave" and segments:
        dauer = [float(g.get("duration_s") or 0) for g in segments]
        strecke = [float(g.get("distance_m") or 0) for g in segments]
        i = max(range(len(dauer)), key=lambda k: dauer[k])
        reiten = sum(dauer)
        out["wellen"] = {"anzahl": len(segments), "laengste_s": round(dauer[i]), "laengste_m": round(strecke[i]),
                         "reiten_s": round(reiten),
                         "paddeln_s": round(max(0.0, fahrzeit - reiten)) if fahrzeit else None}
    if (gruppe == "wind" or sport == "surf_downwind") and segments:
        segs = sorted(segments, key=lambda g: g.get("t_start_ms") or 0)
        fahrten: list[list[dict]] = []
        for g in segs:
            if fahrten:
                v = fahrten[-1][-1]
                ende = (v.get("t_start_ms") or 0) + 1000.0 * (v.get("duration_s") or 0)
                if (g.get("t_start_ms") or 0) - ende <= FAHRT_PAUSE_S * 1000.0:
                    fahrten[-1].append(g)
                    continue
            fahrten.append([g])
        liste = []
        for f in fahrten:
            a, z = f[0], f[-1]
            i0 = max(0, int(a.get("i_start") or 0))
            i1 = min(len(coords) - 1, int(z.get("i_end") or 0))
            strecke = sum(_schritt(coords[i], coords[i + 1]) for i in range(i0, i1))
            start = a.get("t_start_ms") or 0
            ende = (z.get("t_start_ms") or 0) + 1000.0 * (z.get("duration_s") or 0)
            liste.append({
                "laeufe": len(f), "lauf_von": segs.index(a), "lauf_bis": segs.index(z),
                "t_start_ms": int(start), "dauer_s": round((ende - start) / 1000.0),
                "strecke_m": round(strecke), "foil_m": round(sum(x.get("distance_m") or 0 for x in f)),
                "foil_s": round(sum(x.get("duration_s") or 0 for x in f)),
            })
            if sport == "surf_downwind":
                ab = _luftlinie(coords[i0], coords[i1])
                d = liste[-1]
                d["ab_m"] = round(ab)
                d["ab_kmh"] = round(ab / d["dauer_s"] * 3.6, 1) if d["dauer_s"] > 0 else None
                d["foil_anteil"] = round(min(1.0, d["foil_m"] / strecke), 3) if strecke > 0 else None
        out["fahrten"] = liste
        out["fahrt_pause_s"] = int(FAHRT_PAUSE_S)
    return out or None
