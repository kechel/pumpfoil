"""Erkennungs-Empfindlichkeit ohne Einfluss auf die Lauflaenge (Jan, 11.11.2026).

Jan: „die run-detection an sich einstellbar ist, das aber nie die lauflaenge veraendert … ich wuerde die
standard-grenzen lassen fuer alle, bei events genauso".

Bis dahin rechnete die Empfindlichkeit (light/attempts, analysis/gps.SENSITIVITY_PRESETS) die GANZE Erkennung mit
niedrigeren Ein-/Austrittsschwellen: dieselben Laeufe wurden 1-3 s laenger (am Event 07./08.11. bis 10 % mehr Strecke
bei langsamen Fahrern), und die Auswertung eines Laufs hing von einer Profil-Einstellung ab.

JETZT: die Grenzen jedes Laufs kommen immer aus der Standard-Erkennung. Die Empfindlichkeit fuegt nur Laeufe hinzu,
die die Standard-Erkennung GAR NICHT findet (keine zeitliche Ueberlappung mit einem Standard-Lauf) — kurze, langsame
Startversuche von Anfaengern und leichten Fahrern. Solche Laeufe tragen `nur_empfindlich: true`. Ein Lauf, den beide
finden, ist damit unabhaengig von der Einstellung gleich lang; Events, Rekorde und Profil lesen dieselbe Auswertung.

AUSSORTIERTES GILT AUCH (Jan, 11.11.2026, Anlass #19553): die empfindliche Erkennung sieht eine Motor-/Wingfahrt oft als
EIN langes Stueck und sortiert es als Fremdkraft aus; die Standard-Erkennung zerlegt dasselbe in kurze Stuecke, die
durch die Fremdkraft-Pruefung rutschen. Liegt ein Standard-Lauf zu mindestens UEBERLAPP_FREMD in so einem Abschnitt, wird
er ebenfalls aussortiert — mit Grund in metrics.fremdkraft_laeufe und wie jeder andere mit einem Tipp zurueckholbar.
"""
from __future__ import annotations


def _spanne(seg: dict) -> tuple[float, float]:
    a = float(seg.get("t_start_session_ms") if seg.get("t_start_session_ms") is not None else seg.get("t_start_ms") or 0)
    if seg.get("t_end_session_ms") is not None:
        return a, float(seg["t_end_session_ms"])
    return a, a + float(seg.get("duration_s") or 0) * 1000.0


UEBERLAPP_FREMD = 0.5


def _summen_neu(res: dict) -> None:
    alle = res.get("segments") or []
    m = res.setdefault("metrics", {})
    res["foiling_time_s"] = round(sum(float(s.get("duration_s") or 0) for s in alle), 1)
    res["foiling_distance_m"] = round(sum(float(s.get("distance_m") or 0) for s in alle), 1)
    res["max_speed_mps"] = round(max([float(s.get("max_speed_mps") or 0) for s in alle] or [0.0]), 2)
    m["num_segments"] = len(alle)
    m["longest_segment_s"] = round(max((float(s.get("duration_s") or 0) for s in alle), default=0.0), 1)
    m["farthest_segment_m"] = round(max((float(s.get("distance_m") or 0) for s in alle), default=0.0), 1)


def fremdkraft_uebernehmen(standard: dict, empfindlich: dict) -> int:
    """Standard-Laeufe, die in einem von der empfindlichen Erkennung aussortierten Fremdkraft-Abschnitt liegen,
    ebenfalls aussortieren. Gibt die Zahl zurueck."""
    fremd = [f for f in ((empfindlich.get("metrics") or {}).get("fremdkraft_laeufe") or [])
             if f.get("quelle") != "fahrt" and f.get("t_start_ms") is not None and f.get("t_end_ms") is not None]
    if not fremd:
        return 0
    bleiben, raus = [], []
    for s in standard.get("segments") or []:
        a, b = _spanne(s)
        dauer = max(b - a, 1.0)
        f = next((f for f in fremd if (min(b, f["t_end_ms"]) - max(a, f["t_start_ms"])) / dauer >= UEBERLAPP_FREMD), None)
        if f is None:
            bleiben.append(s)
            continue
        raus.append({"t_start_ms": int(a), "t_end_ms": int(b), "dauer_s": round((b - a) / 1000.0, 1),
                     "kmh": round(float(s.get("max_speed_mps") or 0) * 3.6, 1), "quelle": "empfindlich",
                     "grund": f"Teil eines aussortierten Abschnitts: {f.get('grund') or 'Fremdkraft'}"})
    if raus:
        m = standard.setdefault("metrics", {})
        m["fremdkraft_laeufe"] = list(m.get("fremdkraft_laeufe") or []) + raus
        standard["segments"] = bleiben
        _summen_neu(standard)
    return len(raus)


def zusammenfuehren(standard: dict, empfindlich: dict) -> dict:
    """Standard-Auswertung + die Laeufe, die nur die empfindliche Erkennung findet. Gibt `standard` (veraendert) zurueck."""
    standard.setdefault("metrics", {})["empfindlich_fremd"] = fremdkraft_uebernehmen(standard, empfindlich)
    basis = list(standard.get("segments") or [])
    spannen = [_spanne(s) for s in basis]
    extra = []
    for s in empfindlich.get("segments") or []:
        a, b = _spanne(s)
        if b <= a or any(x < b and a < y for x, y in spannen):
            continue
        s = dict(s, nur_empfindlich=True)
        extra.append(s)
    m = standard.setdefault("metrics", {})
    m["empfindlich_extra"] = len(extra)
    if not extra:
        return standard
    alle = sorted(basis + extra, key=lambda s: _spanne(s)[0])
    standard["segments"] = alle
    standard["foiling_time_s"] = round(float(standard.get("foiling_time_s") or 0)
                                       + sum(float(s.get("duration_s") or 0) for s in extra), 1)
    standard["foiling_distance_m"] = round(float(standard.get("foiling_distance_m") or 0)
                                           + sum(float(s.get("distance_m") or 0) for s in extra), 1)
    standard["max_speed_mps"] = round(max([float(standard.get("max_speed_mps") or 0)]
                                          + [float(s.get("max_speed_mps") or 0) for s in extra]), 2)
    m["num_segments"] = len(alle)
    m["longest_segment_s"] = round(max((float(s.get("duration_s") or 0) for s in alle), default=0.0), 1)
    m["farthest_segment_m"] = round(max((float(s.get("distance_m") or 0) for s in alle), default=0.0), 1)
    return standard
