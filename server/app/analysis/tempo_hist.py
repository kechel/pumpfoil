"""Tempo-Verteilung je Session (Jan 24.11.2026, Anregung aus einer Nutzermeldung; Plan docs/TEMPO-VERTEILUNG.md).

Sekunden auf dem Foil je Tempo-Stufe: aus dem gespeicherten Ergebnis (Segmente + `track_geojson.properties.speeds["1"]`,
nur INNERHALB der Laeufe — Paddeln, Laufen, Liegen zaehlen nicht.
Zusaetzlich getrennt: wie viele dieser Sekunden in einer erkannten Gleitphase lagen (pg-1, `pg_glides` je Lauf). Nur
Laeufe mit pg-1-Ergebnis liefern Gleiten; wo es fehlt (andere Sportart, ohne Accel, aeltere Fassung), steht `g` auf
None, damit die Anzeige nicht „0 s Gleiten" behauptet. Die Gleiterkennung findet etwa die Haelfte der echten
Gleitphasen — die Anzeige sagt das dazu.

Index ist NICHT Sekunde (docs/DATA-PIPELINE.md, Falle 2): GPS hat Loecher, gemessen 24.11.2026 z. B. ein Lauf von 39 s
mit 12 Punkten. Jeder Punkt eines Laufs zaehlt deshalb `duration_s / (i_end - i_start)` Sekunden — die Laufdauer
gleichmaessig auf seine Punkte verteilt; die Summe je Session ist damit die Foil-Zeit.

Kein Detektor-Parameter, keine bestehende Zahl aendert sich. Gecacht in `analysis_results.tempo_hist_json`
(run_analysis setzt es zurueck wie low_end_json; nachgerechnet von den Abrufen bzw. scripts/tempo-hist-nachtragen.py).

Format: {"v": 1, "a": [float]*STUFEN, "g": [float]*STUFEN | None} — Sekunden je Stufe, Stufe k = [k*BREITE, (k+1)*BREITE)
km/h, die letzte nimmt alles darueber auf. Kompakt: ~300 Byte je Session."""
from __future__ import annotations

import json

VERSION = 1
BREITE_KMH = 0.5
STUFEN = 80          # 0 … 40 km/h; schneller faellt in die letzte Stufe


def stufe(v_mps: float) -> int:
    return min(max(int(v_mps * 3.6 / BREITE_KMH), 0), STUFEN - 1)


def berechne(segments: list, speeds_1s: list) -> dict:
    a = [0.0] * STUFEN
    g = [0.0] * STUFEN
    mit_gleiten = False
    n = len(speeds_1s)
    for sg in segments or []:
        if not isinstance(sg, dict):
            continue
        i, j = sg.get("i_start"), sg.get("i_end")
        if i is None or j is None or j <= i or i >= n:
            continue
        j = min(j, n - 1)
        gleit = set()
        if sg.get("pg_pumps") is not None and sg.get("pg_glides") is not None:
            mit_gleiten = True
            for gl in sg.get("pg_glides") or []:
                try:
                    gleit.update(range(int(gl[0]), int(gl[1])))
                except (TypeError, ValueError, IndexError):
                    continue
        # Halboffen [i, j): der Endpunkt gehoert schon nicht mehr dazu.
        try:
            w = float(sg.get("duration_s") or 0.0) / (j - i)
        except (TypeError, ValueError):
            continue
        for k in range(i, j):
            v = speeds_1s[k]
            if v is None:
                continue
            b = stufe(float(v))
            a[b] += w
            if k in gleit:
                g[b] += w
    rund = lambda xs: [round(x, 1) for x in xs]   # noqa: E731
    return {"v": VERSION, "a": rund(a), "g": rund(g) if mit_gleiten else None}


def aus_ergebnis(segments_json: str | None, track_geojson: str | None) -> dict:
    try:
        segs = json.loads(segments_json or "[]")
        v = (json.loads(track_geojson or "{}").get("properties") or {}).get("speeds", {}).get("1") or []
    except (ValueError, AttributeError):
        return {"v": VERSION, "a": [0.0] * STUFEN, "g": None}
    return berechne(segs if isinstance(segs, list) else [], v)


def lies(js: str | None) -> dict | None:
    """Gecachter Wert oder None (fehlt / alte Fassung -> neu rechnen)."""
    if not js:
        return None
    try:
        d = json.loads(js)
    except ValueError:
        return None
    return d if isinstance(d, dict) and d.get("v") == VERSION else None


def fuellen(db, ar_ids: list[int], grenze: int = 300) -> dict[int, dict]:
    """Fehlende Werte rechnen und speichern (hoechstens `grenze` je Aufruf, damit kein Abruf haengt). Gibt die neuen
    Werte zurueck. Muster wie community._low_end_je_foil."""
    from ..models import AnalysisResult as AR
    neu: dict[int, dict] = {}
    for ar_id in ar_ids[:grenze]:
        row = db.query(AR.segments_json, AR.track_geojson).filter(AR.id == ar_id).one_or_none()
        if row is None:
            continue
        neu[ar_id] = aus_ergebnis(row[0], row[1])
        db.query(AR).filter(AR.id == ar_id).update({AR.tempo_hist_json: json.dumps(neu[ar_id], separators=(",", ":"))},
                                                   synchronize_session=False)
    if neu:
        db.commit()
    return neu


def summe(hists: list[dict]) -> dict:
    a = [0.0] * STUFEN
    g = [0.0] * STUFEN
    g_basis = [0.0] * STUFEN      # Sekunden der Laeufe, fuer die Gleiten ueberhaupt bekannt ist
    for h in hists:
        for k, x in enumerate(h.get("a") or []):
            a[k] += x
            if h.get("g") is not None:
                g_basis[k] += x
        for k, x in enumerate(h.get("g") or []):
            g[k] += x
    r = lambda xs: [round(x, 1) for x in xs]   # noqa: E731
    return {"a": r(a), "g": r(g), "g_basis": r(g_basis)}
