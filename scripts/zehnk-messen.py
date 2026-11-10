#!/usr/bin/env python3
"""10K Freefoil Challenge: welche Sessions wuerden die Vorpruefung (app/zehnk.py) bestehen? (rein lesend)

Geht ueber alle Pumpfoil-Sessions mit mindestens --min-km auf dem Foil und listet je Ergebnis die URLs:
geschafft, Fremdkraft erkannt, knapp verfehlt (zwei von drei Regeln).

Aufruf:  cd server && .venv/bin/python ../scripts/zehnk-messen.py [--min-km 7] [--seit 2026-06-01] [--csv out.csv]
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

from sqlalchemy import text  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app import storage, models  # noqa: E402
from app.analysis import auto_fahrt_fenster  # noqa: E402
from app.zehnk import pruefe  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--min-km", type=float, default=7.0)
    ap.add_argument("--seit", default="2026-01-01")
    ap.add_argument("--csv")
    a = ap.parse_args()
    db = SessionLocal()
    rows = db.execute(text(
        "select s.id, a.segments_json, a.foiling_distance_m, s.started_at, s.user_id "
        "from sessions s join analysis_results a on a.session_id = s.id "
        "where s.sport_class = 'pumpfoil' and not coalesce(s.needs_classification,false) and not coalesce(s.deleted,false) and s.merged_into is null "
        "and a.foiling_distance_m >= :m and s.started_at >= :seit order by s.started_at"),
        {"m": a.min_km * 1000, "seit": a.seit}).fetchall()
    erg = []
    for sid, segj, foil, started, uid in rows:
        s = db.get(models.Session, sid)
        try:
            g = storage.load_gps(s.session_uuid)
            segs = json.loads(segj or "[]")
        except Exception:
            continue
        r = pruefe(g, segs, auto_fahrt_fenster(s))
        regeln = (r["foil_m"] >= 10000) + (r["weg_fixes"] >= 3) + bool(r["zurueck"])
        erg.append(dict(id=sid, datum=str(started)[:10], user=uid, status=r["status"], foil_km=round(r["foil_m"] / 1000, 2),
                        luftlinie_km=round(r["max_luftlinie_m"] / 1000, 2), weg_fixes=r["weg_fixes"],
                        zurueck=r["zurueck"], regeln=regeln,
                        fremd="; ".join(f"{f['art']} {f.get('m', '')}m {f['kmh']}km/h @{f['t_von'] // 60000}min" for f in r["fremd"]),
                        url=f"https://pumpfoil.org/sessions/{sid}"))
    if a.csv and erg:
        with open(a.csv, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(erg[0].keys()))
            w.writeheader()
            w.writerows(erg)
    print(f"{len(erg)} Sessions mit >= {a.min_km} km auf dem Foil seit {a.seit}\n")
    gruppen = [("GESCHAFFT", [e for e in erg if e["status"] == "geschafft"]),
               ("FREMDKRAFT (sonst geschafft)", [e for e in erg if e["status"] == "fremdkraft"]),
               ("KNAPP (2 von 3 Regeln)", [e for e in erg if e["status"] == "fehlt" and e["regeln"] == 2])]
    for titel, liste in gruppen:
        print(f"== {titel}: {len(liste)} Sessions, {len({e['user'] for e in liste})} Fahrer")
        for e in liste:
            fehlt = [] if e["status"] != "fehlt" else (["<10 km"] if e["foil_km"] < 10 else []) + \
                (["<2 km weg"] if e["weg_fixes"] < 3 else []) + ([] if e["zurueck"] else ["nicht zurueck"])
            print(f"  {e['url']:42} {e['datum']} u{e['user']:<5} foil {e['foil_km']:5.2f} km  luft {e['luftlinie_km']:4.2f} km"
                  f"  {' '.join(fehlt)}  {e['fremd']}")
        print()


if __name__ == "__main__":
    main()
