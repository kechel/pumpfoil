#!/usr/bin/env python3
"""Was zeigt die Uhr als Hoechstgeschwindigkeit, und was der Server? (rein lesend)

Anlass (Jan, 10.11.2026): die V-max auf der Apple Watch wurde mehrfach als falsch gemeldet. Die Uhr-Apps (Garmin
SessionRecorder.mc, Apple Recorder.swift) nehmen den hoechsten 1-s-Wert der ganzen Aufnahme (nach Qualitaets-Gate,
Burst-Regel und 32-km/h-Deckel). Der Server nimmt den hoechsten Wert der 3-s-Median-Kurve INNERHALB der Laeufe
(gps.py `_seg_fields`). Dieses Skript rechnet die Uhr-Anzeige aus den hochgeladenen GPS-Punkten nach und stellt sie
neben den Server-Wert, je Plattform, dazu Alternativen fuer die Anzeige.

Varianten (km/h):
  uhr      = heutige Anzeige: max ueber maxKandidat(1-s-Wert), ganze Aufnahme
  med3     = max der 3-s-Median-Kurve (wie die Live-Anzeige speed3s), ganze Aufnahme
  med3lauf = max der 3-s-Median-Kurve nur in den Server-Laeufen (Naeherung „nur im Lauf")
  k3lauf   = wie med3lauf, aber Median ueber die maxKandidat-Werte (Burst-Regel + Deckel vorher)
  k5lauf   = dasselbe mit 5-s-Median
  server   = analysis_results.max_speed_mps

Aufruf:  cd server && .venv/bin/python ../scripts/uhr-vmax-messen.py [--limit N] [--csv out.csv]
"""
import argparse, csv, json, os, sys
from pathlib import Path

HIER = Path(__file__).resolve().parent
SERVER = HIER.parent / "server"
sys.path.insert(0, str(SERVER))
for z in (SERVER / ".env").read_text().splitlines():
    if "=" in z and not z.lstrip().startswith("#"):
        k, v = z.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())

import numpy as np  # noqa: E402
from sqlalchemy import text  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app import storage  # noqa: E402

GATE_ACC_M = 20.0


def max_kandidat_reihe(v):
    """maxKandidat() aus Recorder.swift / SessionRecorder.mc, Wert je Fix."""
    ring = [-1.0] * 15
    pos = 0
    out = []
    for x in v:
        ring[pos] = x
        pos = (pos + 1) % 15
        vals = sorted(r for r in ring if r >= 0)
        med = vals[len(vals) // 2] if vals else 0.0
        w = x
        if w > med + 5.0 and w > 28.0 / 3.6:
            w = med
        out.append(0.0 if w > 32.0 / 3.6 else w)
    return np.array(out)


def median3(t, v, fenster_ms=3000):
    """Live-speed3s: Median der Fixes der letzten 3 s (Recorder.swift spWin)."""
    out = np.zeros(len(v))
    j = 0
    for i in range(len(v)):
        while t[i] - t[j] > fenster_ms:
            j += 1
        out[i] = np.median(v[j:i + 1])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int)
    ap.add_argument("--csv")
    ap.add_argument("--seit", default="2026-08-01")
    ap.add_argument("--plattform", default="apple,garmin,wear")
    a = ap.parse_args()
    db = SessionLocal()
    rows = db.execute(text(
        "select s.id, s.session_uuid, coalesce(d.platform,'?'), s.device_model, a.max_speed_mps, a.segments_json "
        "from sessions s join analysis_results a on a.session_id = s.id left join device_tokens d on d.id = s.device_id "
        "where s.sport_class = 'pumpfoil' and not coalesce(s.deleted,false) and s.merged_into is null "
        "and s.started_at >= :seit and coalesce(d.platform,'') = any(:pl) order by s.id desc"
        + (f" limit {int(a.limit)}" if a.limit else "")), {"seit": a.seit, "pl": a.plattform.split(",")}).fetchall()
    erg = []
    for sid, uuid, plat, modell, vmax, segj in rows:
        try:
            g = storage.load_gps(uuid)
            segs = json.loads(segj or "[]")
        except Exception:
            continue
        if len(g) < 60 or not segs:
            continue
        server = float(vmax or 0) * 3.6
        if server <= 0:
            continue
        t = np.array([float(p[0]) for p in g])
        sp = np.array([max(0.0, float(p[3] or 0)) if len(p) > 3 and p[3] is not None else 0.0 for p in g])
        acc = np.array([float(p[5]) if len(p) > 5 and p[5] is not None else 5.0 for p in g])
        sp = np.where((acc > GATE_ACC_M) | (acc <= 0), 0.0, sp)
        uhr = float(max_kandidat_reihe(sp).max()) * 3.6
        m3 = median3(t, sp)
        med3 = float(m3.max()) * 3.6
        in_lauf = np.zeros(len(t), bool)
        for s in segs:
            a0, a1 = s.get("t_start_session_ms"), s.get("t_end_session_ms")
            if a0 is None or a1 is None:
                continue
            in_lauf |= (t >= a0) & (t <= a1)
        med3lauf = float(m3[in_lauf].max()) * 3.6 if in_lauf.any() else 0.0
        k3 = median3(t, max_kandidat_reihe(sp))
        k3lauf = float(k3[in_lauf].max()) * 3.6 if in_lauf.any() else 0.0
        m5 = median3(t, max_kandidat_reihe(sp), 5000)
        k5lauf = float(m5[in_lauf].max()) * 3.6 if in_lauf.any() else 0.0
        erg.append(dict(id=sid, plat=plat, modell=modell or "", server=round(server, 1), uhr=round(uhr, 1),
                        med3=round(med3, 1), med3lauf=round(med3lauf, 1), k3lauf=round(k3lauf, 1), k5lauf=round(k5lauf, 1),
                        hz=round(len(t) / max(1.0, (t[-1] - t[0]) / 1000), 2)))
    if a.csv:
        with open(a.csv, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(erg[0].keys()))
            w.writeheader()
            w.writerows(erg)
    print(f"{len(erg)} Sessions\n")
    print(f"{'Plattform':9} {'n':>4} {'GPS-Hz':>6} | Abstand zum Server (km/h), Median / 90-%-Quantil / Anteil > +3 km/h")
    for plat in ("apple", "garmin", "wear"):
        e = [x for x in erg if x["plat"] == plat]
        if not e:
            continue
        zeile = f"{plat:9} {len(e):4} {np.median([x['hz'] for x in e]):6.2f} |"
        for k in ("uhr", "med3lauf", "k3lauf", "k5lauf"):
            d = np.array([x[k] - x["server"] for x in e])
            zeile += f"  {k}: {np.median(d):+5.1f} / {np.percentile(d, 90):+5.1f} / {np.mean(d > 3) * 100:3.0f} %"
        print(zeile)


if __name__ == "__main__":
    main()
