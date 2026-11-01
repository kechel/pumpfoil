"""Low End je Lauf (Feedback foiling_fabs, 01.11.2026; Jans OK am selben Tag): das langsamste Tempo, aus dem der
Fahrer wieder herauskam — Grundlage der Spalte „Low End" in den Foil-Stats.

Je Lauf: langsamstes 10-s-Mittel der 1-s-Geschwindigkeit, ohne die ersten 5 s (dort wirkt noch der Absprung), und nur
wenn danach noch mindestens 15 s im Lauf folgen und das 10-s-Mittel wieder um mindestens 0,3 m/s steigt — das Ende
eines Laufs (langsamer werden, fallen) ist kein Low End, davon erholt man sich nicht. Laeufe, die das nicht hergeben
(zu kurz, nie wieder schneller), liefern nichts.

Rein aus dem gespeicherten Ergebnis (Segmente + `track_geojson.properties.speeds["1"]`, ein Punkt je Sekunde, s.
docs/DATA-PIPELINE.md: `gps_hz` ist immer 1); kein Detektor-Parameter, keine bestehende Zahl aendert sich. Gecacht in
`analysis_results.low_end_json` (wie die Carve-Zahlen: run_analysis setzt es zurueck, die Foil-Stats rechnen nach).
Die Grenze der Erkennung (unter ~8 km/h endet jeder Lauf) deckelt den Wert nach unten — bei sehr grossen Fluegeln
liegt das echte Low End womoeglich darunter."""
import numpy as np

FENSTER_S = 10
START_S = 5
NACH_S = 15
ANSTIEG_MPS = 0.3


def lauf_low_ends(segments: list, speeds_1s: list) -> list[float]:
    """Low End (m/s) je Lauf, der eins hergibt; Laeufe ohne Low End fehlen in der Liste."""
    v = np.asarray(speeds_1s, dtype=float)
    out: list[float] = []
    for sg in segments or []:
        i, j = sg.get("i_start"), sg.get("i_end")
        if i is None or j is None or j >= v.size or j <= i:
            continue
        r = v[i:j + 1]
        if r.size < START_S + FENSTER_S + NACH_S:
            continue
        m = np.convolve(r, np.ones(FENSTER_S) / FENSTER_S, mode="valid")   # m[k] = Mittel von r[k:k+FENSTER_S]
        # Hoechstes Mittel NACH jedem k (rueckwaerts kumuliert), damit „wieder schneller" in einem Durchgang geht.
        spaeter = np.maximum.accumulate(m[::-1])[::-1]
        best = None
        for k in range(START_S, m.size - 1):
            if k + FENSTER_S + NACH_S > r.size:
                break
            if spaeter[k + 1] >= m[k] + ANSTIEG_MPS and (best is None or m[k] < best):
                best = float(m[k])
        if best is not None:
            out.append(round(best, 3))
    return out


def aus_ergebnis(segments_json: str | None, track_geojson: str | None) -> list[float]:
    import json
    try:
        segs = json.loads(segments_json or "[]")
        v = (json.loads(track_geojson or "{}").get("properties") or {}).get("speeds", {}).get("1") or []
    except (ValueError, AttributeError):
        return []
    return lauf_low_ends(segs if isinstance(segs, list) else [], v)
