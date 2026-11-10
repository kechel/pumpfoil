#!/usr/bin/env python3
"""Wo schneidet die Tempo-Bandgrenze der Lauferkennung echte Pumpfoil-Laeufe ab? (rein lesend)

Anlass (Jan, 10.11.2026, Sprint-Event): „nicht das wir jetzt bei 40km/h abschneiden, ich glaube das koennte ggf.
gebrochen werden". Fuer Pumpfoil/Foil Scoot gelten Bandgrenze 25 km/h (geglaettetes Tempo, Sekunden darueber fliegen
aus dem Lauf) und Lauf-Spitze 32 km/h (Lauf ganz verworfen), gps.MAX_FOIL_SPEED / RUN_MAX_PLAUSIBLE_KMH.

Gesucht werden Stuecke mit geglaettetem Tempo ueber der Bandgrenze, die an einen erkannten Lauf grenzen (Laufende oder
-anfang hoechstens --nah Sekunden entfernt) — dort hat die Grenze den Lauf zerschnitten oder beendet. Dazu die Laeufe,
die nach der Spitze verworfen wurden (metrics.fremdkraft_laeufe, quelle "tempo").

Aufruf:  cd server && OMP_NUM_THREADS=1 .venv/bin/python ../scripts/bandgrenze-messen.py [--detection model] [--csv out.csv]
         Event-Ueberwachung: ... --detection alle --seit "2026-11-14 05:00+01" --bis "2026-11-15 16:00+01"
Liest .env selbst (DATABASE_URL). Schreibt NICHTS in die DB.
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
from app.analysis import gps as v1  # noqa: E402
from app.analysis.detect_v2 import _clean_speed  # noqa: E402


def stuecke(maske):
    """Zusammenhaengende True-Bereiche -> [(i0, i1_exkl)]."""
    d = np.diff(np.concatenate([[0], maske.astype(int), [0]]))
    return list(zip(np.flatnonzero(d == 1), np.flatnonzero(d == -1)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--detection", default="model", help="model | gps_only | alle")
    ap.add_argument("--sport", default="pumpfoil,foil_scoot")
    ap.add_argument("--band", type=float, default=v1.MAX_FOIL_SPEED * 3.6, help="km/h")
    ap.add_argument("--nah", type=float, default=5.0, help="max. Abstand Stueck <-> Laufgrenze in s")
    ap.add_argument("--min-s", type=float, default=2.0, help="Mindestlaenge eines Stuecks ueber der Grenze")
    ap.add_argument("--csv")
    ap.add_argument("--limit", type=int)
    # Waehrend eines Events (Jan, 10.11.2026: „schon waehrend des events … ueberwachen die daten"): nur Sessions, die im
    # Zeitfenster beginnen, z. B. --seit "2026-11-14 05:00+01" --bis "2026-11-15 16:00+01" (Flying Sprint Weekend, Event 11).
    ap.add_argument("--seit", help="Startzeit ab (ISO, mit Zone)")
    ap.add_argument("--bis", help="Startzeit bis (ISO, mit Zone)")
    a = ap.parse_args()

    db = SessionLocal()
    sql = ("select s.id, s.session_uuid, s.gps_hz, s.trim_start_ms, s.sport_class, a.detection, a.segments_json, "
           "a.metrics_json from sessions s join analysis_results a on a.session_id = s.id "
           "where s.sport_class = any(:sp) and not coalesce(s.deleted, false)")
    if a.detection != "alle":
        sql += " and a.detection = :det"
    if a.seit:
        sql += " and s.started_at >= cast(:seit as timestamptz)"
    if a.bis:
        sql += " and s.started_at <= cast(:bis as timestamptz)"
    sql += " order by s.id"
    if a.limit:
        sql += f" limit {int(a.limit)}"
    rows = db.execute(text(sql), {"sp": a.sport.split(","), "det": a.detection, "seit": a.seit, "bis": a.bis}).fetchall()
    band = a.band / 3.6

    treffer, verworfen, n_sess, n_mit = [], [], 0, set()
    for sid, uuid, hz, trim0, sport, det, segj, metj in rows:
        n_sess += 1
        try:
            segs = json.loads(segj or "[]")
            met = json.loads(metj or "{}")
        except ValueError:
            continue
        for f in met.get("fremdkraft_laeufe") or []:
            if f.get("quelle") == "tempo":
                verworfen.append({"session": sid, "det": det, "spitze_kmh": f.get("kmh"),
                                  "schnitt_kmh": f.get("schnitt_kmh"), "dauer_s": f.get("dauer_s"),
                                  "t0_s": round((f.get("t_start_ms") or 0) / 1000)})
        if not segs:
            continue
        try:
            g = storage.load_gps(uuid)
        except Exception:
            continue
        if len(g) < 10:
            continue
        hz = hz or 1
        t = np.array([float(x[0]) for x in g])
        lat = np.array([float(x[1]) for x in g]); lon = np.array([float(x[2]) for x in g])
        lat, lon = v1._fill_invalid_coords(lat, lon)
        lat, lon = v1._repair_spikes(lat, lon, t)
        _step, v_pos = v1.plausible_steps(lat, lon, t, hz)
        roh = np.array([float(x[3]) if len(x) > 3 and x[3] is not None else np.nan for x in g])
        speed = _clean_speed(np.where(np.isnan(roh), v_pos, roh), hz)
        vs = v1._running_median(speed, max(int(round(v1.SMOOTH_WINDOW_S * hz)), 1))
        off = float(trim0 or 0)
        grenzen = []
        for s in segs:
            grenzen.append((float(s["t_start_ms"]) + off, float(s["t_end_ms"]) + off, s))
        for i0, i1 in stuecke(vs > band):
            ta, tb = t[i0], t[i1 - 1]
            if (tb - ta) / 1000 + 1 / hz < a.min_s:
                continue
            nah = [(x, y, s) for x, y, s in grenzen
                   if abs(ta - y) <= a.nah * 1000 or abs(tb - x) <= a.nah * 1000]
            if not nah:
                continue
            n_mit.add(sid)
            lauf = max(nah, key=lambda z: z[1] - z[0])
            # Positions-Tempo im Stueck als Gegenprobe (Doppler vs. Position)
            vp = float(np.nanmedian(v_pos[i0:i1])) * 3.6 if i1 > i0 else float("nan")
            treffer.append({"session": sid, "det": det, "t0_s": round((ta - off) / 1000),
                            "dauer_s": round((tb - ta) / 1000 + 1 / hz, 1),
                            "spitze_kmh": round(float(np.nanmax(vs[i0:i1])) * 3.6, 1),
                            "schnitt_kmh": round(float(np.nanmean(vs[i0:i1])) * 3.6, 1),
                            "pos_kmh": round(vp, 1),
                            "lauf_s": round((lauf[1] - lauf[0]) / 1000), "lauf_schnitt_kmh":
                            round(float(lauf[2].get("avg_speed_mps") or 0) * 3.6, 1)})
    db.close()

    print(f"Sessions: {n_sess} ({a.sport}, detection={a.detection}), Bandgrenze {a.band:.1f} km/h")
    print(f"Stuecke ueber der Grenze direkt an einem Lauf: {len(treffer)} in {len(n_mit)} Sessions")
    if treffer:
        d = np.array([x["dauer_s"] for x in treffer]); sp = np.array([x["spitze_kmh"] for x in treffer])
        print(f"  Dauer  Median {np.median(d):.0f} s, p90 {np.percentile(d, 90):.0f} s, max {d.max():.0f} s")
        print(f"  Spitze Median {np.median(sp):.1f}, p90 {np.percentile(sp, 90):.1f}, max {sp.max():.1f} km/h")
        for lo, hi in ((25, 28), (28, 30), (30, 35), (35, 45), (45, 999)):
            k = [x for x in treffer if lo <= x["spitze_kmh"] < hi]
            print(f"  Spitze {lo}-{hi if hi < 999 else '..'} km/h: {len(k)} Stuecke, "
                  f"{len({x['session'] for x in k})} Sessions")
    print(f"Nach der Spitze verworfene Laeufe: {len(verworfen)}")
    for x in sorted(treffer, key=lambda z: -z["dauer_s"])[:25]:
        print("  ", x)
    if a.csv:
        with open(a.csv, "w", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=list(treffer[0].keys()) if treffer else ["session"])
            w.writeheader(); w.writerows(treffer)
        with open(a.csv.replace(".csv", "-verworfen.csv"), "w", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=list(verworfen[0].keys()) if verworfen else ["session"])
            w.writeheader(); w.writerows(verworfen)


if __name__ == "__main__":
    main()
