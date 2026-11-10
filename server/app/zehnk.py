"""10K Freefoil Challenge — Vorpruefung einer Session (rein lesend, ausserhalb der Analyse-Pipeline).

Regeln (Challenge-Betreiber, 22./26.10.2026; Jan 10.11.2026):
  1. 10 km auf dem Foil = Summe der erkannten Laeufe (Stuerze/Relaunches erlaubt, Schwimmen zaehlt nicht).
  2. mind. 2 km Luftlinie vom Startpunkt — mehrere Fixes im Lauf, damit ein GPS-Ausreisser nicht reicht.
  3. nachdem 1. und 2. erfuellt sind: auf dem Foil innerhalb 150 m vom Startpunkt.
Zusatz gegen Fremdkraft (Jan 10.11.): keine aktive Autofahrt in der Session, und zwischen zwei Laeufen kein
Versatz, der schneller ist, als man schwimmt oder geht (> FREMD_KMH ueber > FREMD_M, auch ueber GPS-Luecken).

Rueckweg auf dem Foil (Jan 10.11., Session mit 12 km Rueckweg paddelnd und 127-m-Lauf am Start): ab dem fernsten
Punkt darf die Annaeherung an den Start ausserhalb der Laeufe hoechstens 25 % dieser Entfernung betragen, mindestens
500 m (Schwimmen zum naechsten Startplatz und viele Relaunches ja, Zurueckpaddeln/-laufen/-fahren nein, auch langsam).
Gemessen 10.11.: Rueckpaddler 91-100 %+, echte Rueckwege 0-5 %.

Startpunkt = erster brauchbarer Fix des ersten Laufs (die Uhr laeuft oft schon an Land).
Pumpfoil zeigt nur „vermutlich geschafft"; ob jemand den Sticker bekommt, entscheidet der Betreiber.
"""
from __future__ import annotations

import math

ZIEL_M = 10_000.0
WEG_M = 2_000.0
HEIM_M = 150.0
WEG_FIXES = 3        # Fixes im Lauf, die >= WEG_M entfernt sein muessen
HEIM_FIXES = 2       # Fixes im Lauf innerhalb HEIM_M nach Erfuellung von 1 + 2
GATE_ACC_M = 20.0
FREMD_KMH = 8.0      # Versatz zwischen zwei Laeufen schneller als das = Fremdkraft (Boot, Auto, Rad)
FREMD_M = 300.0
RUECK_OHNE_FOIL_ANTEIL = 0.25  # Rueckweg ab dem fernsten Punkt: hoechstens dieser Anteil der Entfernung ausserhalb der Laeufe,
RUECK_OHNE_FOIL_MIN_M = 500.0  # mindestens aber so viel (jede Luecke traegt auch ~22 m abgeschnittenen Laufweg, p90 64 m)


def _m(lat1, lon1, lat2, lon2) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def _gut(p) -> bool:
    if len(p) < 3 or p[1] is None or p[2] is None:
        return False
    acc = p[5] if len(p) > 5 and p[5] is not None else 5.0
    return 0 < acc <= GATE_ACC_M


def pruefe(gps: list, segmente: list, auto_fahrten: list | None = None) -> dict:
    """gps: Punkte [t_session_ms, lat, lon, speed, _, acc]; segmente: segments_json; auto_fahrten: [(a, b, kmh)]
    der aktiven Autofahrten. Ergebnis mit `status` geschafft | fremdkraft | fehlt und den Zwischenwerten."""
    laeufe = sorted((s for s in segmente or [] if s.get("t_start_session_ms") is not None
                     and s.get("t_end_session_ms") is not None), key=lambda s: s["t_start_session_ms"])
    erg = {"status": "fehlt", "foil_m": 0.0, "max_luftlinie_m": 0.0, "weg_fixes": 0, "zurueck": False,
           "rueck_ohne_foil_m": 0.0, "t_10k": None, "t_weg": None, "t_heim": None, "fremd": [], "laeufe": len(laeufe)}
    if not laeufe:
        return erg
    # Punkte je Lauf (nur brauchbare Fixes)
    je_lauf = []
    j = 0
    pts = [p for p in gps if _gut(p)]
    for s in laeufe:
        a, b = s["t_start_session_ms"], s["t_end_session_ms"]
        while j < len(pts) and pts[j][0] < a:
            j += 1
        k = j
        lp = []
        while k < len(pts) and pts[k][0] <= b:
            lp.append(pts[k])
            k += 1
        je_lauf.append(lp)
    start = next((lp[0] for lp in je_lauf if lp), None)
    if start is None:
        return erg
    s_lat, s_lon = start[1], start[2]

    # 1. Foil-Strecke, Zeitpunkt der 10 km (innerhalb des Laufs anteilig nach Punktweg verteilt)
    summe = 0.0
    for s, lp in zip(laeufe, je_lauf):
        d = float(s.get("distance_m") or 0.0)
        if erg["t_10k"] is None and summe + d >= ZIEL_M:
            rest = ZIEL_M - summe
            weg = [0.0]
            for p, q in zip(lp, lp[1:]):
                weg.append(weg[-1] + _m(p[1], p[2], q[1], q[2]))
            skala = d / weg[-1] if len(lp) > 1 and weg[-1] > 0 else 0.0
            erg["t_10k"] = next((p[0] for p, w in zip(lp, weg) if w * skala >= rest), s["t_end_session_ms"])
        summe += d
    erg["foil_m"] = round(summe, 1)

    # 2. Luftlinie
    for lp in je_lauf:
        for p in lp:
            e = _m(s_lat, s_lon, p[1], p[2])
            erg["max_luftlinie_m"] = max(erg["max_luftlinie_m"], e)
            if e >= WEG_M:
                erg["weg_fixes"] += 1
                if erg["weg_fixes"] == WEG_FIXES:
                    erg["t_weg"] = p[0]
    erg["max_luftlinie_m"] = round(erg["max_luftlinie_m"], 1)

    # 3. zurueck am Start, auf dem Foil, nach 1 + 2
    if erg["t_10k"] is not None and erg["t_weg"] is not None:
        ab = max(erg["t_10k"], erg["t_weg"])
        n = 0
        for lp in je_lauf:
            for p in lp:
                if p[0] >= ab and _m(s_lat, s_lon, p[1], p[2]) <= HEIM_M:
                    n += 1
                    if n == HEIM_FIXES:
                        erg["t_heim"] = p[0]
                        erg["zurueck"] = True
                        break
            if erg["zurueck"]:
                break

    # Fremdkraft: Autofahrten und schnelle Versaetze zwischen Laeufen
    for a, b, kmh in auto_fahrten or []:
        erg["fremd"].append({"art": "autofahrt", "t_von": int(a), "t_bis": int(b), "kmh": round(float(kmh), 1)})
    for (s0, l0), (s1, l1) in zip(zip(laeufe, je_lauf), list(zip(laeufe, je_lauf))[1:]):
        if not l0 or not l1:
            continue
        p, q = l0[-1], l1[0]
        d = _m(p[1], p[2], q[1], q[2])
        dt = max(1.0, (q[0] - p[0]) / 1000.0)
        kmh = d / dt * 3.6
        if d > FREMD_M and kmh > FREMD_KMH:
            erg["fremd"].append({"art": "versatz", "t_von": int(p[0]), "t_bis": int(q[0]), "m": round(d), "kmh": round(kmh, 1)})

    # Rueckweg: Annaeherung an den Start zwischen den Laeufen, ab dem Lauf mit dem fernsten Punkt
    voll = [lp for lp in je_lauf if lp]
    fern = max(range(len(voll)), key=lambda i: max(_m(s_lat, s_lon, p[1], p[2]) for p in voll[i]))
    an = 0.0
    for l0, l1 in zip(voll[fern:], voll[fern + 1:]):
        an += max(0.0, _m(s_lat, s_lon, l0[-1][1], l0[-1][2]) - _m(s_lat, s_lon, l1[0][1], l1[0][2]))
    erg["rueck_ohne_foil_m"] = round(an, 1)
    fern_m = max(_m(s_lat, s_lon, p[1], p[2]) for p in voll[fern])
    if an > max(RUECK_OHNE_FOIL_MIN_M, RUECK_OHNE_FOIL_ANTEIL * fern_m) and erg["zurueck"]:
        erg["fremd"].append({"art": "rueckweg_ohne_foil", "t_von": int(voll[fern][-1][0]), "t_bis": int(voll[-1][0][0]),
                             "m": round(an), "kmh": 0.0})

    if erg["fremd"]:
        erg["status"] = "fremdkraft" if erg["zurueck"] else "fehlt"
    if erg["zurueck"] and not erg["fremd"]:
        erg["status"] = "geschafft"
    return erg
