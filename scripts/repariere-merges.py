#!/usr/bin/env python3
"""Baut die Accel-Spur zusammengeführter Sessions aus ihren Teilen NEU — mit Zeitankern.

    cd server && .venv/bin/python ../scripts/repariere-merges.py [--dry] [--only 1596]

Hintergrund (docs/DATA-PIPELINE.md §9.5): `merge.py` legte die Accel-Teile bis 2026-08-10 an
`off_ms/1000 · getaggte_Rate` und schrieb einen einzigen Block OHNE `t0`-Sidecar. Liefert die Uhr
das Doppelte der angekündigten Rate (Wear/Apple), sind diese Offsets um Faktor 2 falsch — die Teile
überschrieben sich — und ohne Sidecar kann die Analyse die Achse nie exakt rekonstruieren.

Dieses Skript nutzt DENSELBEN Code wie das Zusammenführen (`merge._trimmed_mit_achse` +
`merge._save_accel_mit_ankern`), damit es nur eine Wahrheit gibt.

SICHERHEIT:
  * Die neu berechnete GPS-Spur muss ZEICHENGLEICH zur gespeicherten sein. Weicht sie ab, wird die
    Session NICHT angefasst (dann stimmen die Offsets nicht mit dem gespeicherten Track überein).
  * Der alte `accel/`-Ordner wird vorher nach `accel.vor-reparatur/` kopiert, nichts geht verloren.
  * Teile ohne Accel-Rohdaten -> Session wird uebersprungen.
"""
import argparse
import json
import os
import shutil
import sys


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--only", type=int, default=0)
    args = ap.parse_args()

    if not os.path.exists(".env"):
        sys.exit("Bitte aus server/ starten.")
    env = dict(l.split("=", 1) for l in open(".env") if "=" in l and not l.startswith("#"))
    for k, v in env.items():
        os.environ.setdefault(k.strip(), v.strip().strip('"'))
    os.environ["DATABASE_URL"] = env["DATABASE_URL"].strip().strip('"')
    sys.path.insert(0, ".")

    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import Session as OrmSession
    from app import models, storage
    from app.analysis import run_analysis
    from app.merge import GAP_MS, _save_accel_mit_ankern, _trimmed_mit_achse

    eng = create_engine(os.environ["DATABASE_URL"])
    with eng.connect() as c:
        ziele = [r[0] for r in c.execute(text(
            "select distinct merged_into from sessions where merged_into is not null "
            "and merged_into in (select id from sessions where deleted = false) order by 1"))]
    if args.only:
        ziele = [args.only] if args.only in ziele else []
        if not ziele:
            sys.exit(f"{args.only} ist keine (nicht geloeschte) zusammengefuehrte Session")

    print(f"{len(ziele)} zusammengefuehrte Sessions{'  [TROCKENLAUF]' if args.dry else ''}\n")
    gemacht = uebersprungen = 0
    for zid in ziele:
        with OrmSession(eng) as db:
            ziel = db.get(models.Session, zid)
            teile = db.query(models.Session).filter(
                models.Session.merged_into == zid).order_by(models.Session.started_at).all()

            gps_neu, accel_teile, off_ms, fehlt = [], [], 0, []
            for t in teile:
                g, a, ax = _trimmed_mit_achse(t)
                if not g:
                    fehlt.append(f"#{t.id} ohne GPS")
                    continue
                if a is None or not a.shape[0]:
                    fehlt.append(f"#{t.id} ohne Accel")
                for row in g:
                    gps_neu.append([row[0] + off_ms] + list(row[1:]))
                if a is not None and a.shape[0] and ax.size == a.shape[0]:
                    accel_teile.append((a, ax + float(off_ms)))
                off_ms += int(g[-1][0]) + GAP_MS

            if fehlt:
                print(f"#{zid}: UEBERSPRUNGEN — {', '.join(fehlt)}")
                uebersprungen += 1
                continue

            # Sicherheitsprüfung: rekonstruierte GPS-Spur == gespeicherte?
            gps_alt = storage.load_gps(ziel.session_uuid)
            gleich = (len(gps_alt) == len(gps_neu)
                      and all(int(a[0]) == int(b[0]) and abs(a[1] - b[1]) < 1e-9
                              and abs(a[2] - b[2]) < 1e-9 for a, b in zip(gps_alt, gps_neu)))
            if not gleich:
                print(f"#{zid}: UEBERSPRUNGEN — GPS-Spur weicht ab "
                      f"({len(gps_alt)} gespeichert vs. {len(gps_neu)} rekonstruiert)")
                uebersprungen += 1
                continue

            d = storage.session_dir(ziel.session_uuid)
            alt_dir, sicher = d / "accel", d / "accel.vor-reparatur"
            n_alt = len(list(alt_dir.iterdir())) if alt_dir.is_dir() else 0
            if args.dry:
                print(f"#{zid}: waere reparierbar — {len(teile)} Teile, "
                      f"{sum(int(a.shape[0]) for a, _ in accel_teile)} Accel-Samples, "
                      f"bisher {n_alt} Datei(en)")
                gemacht += 1
                continue

            if alt_dir.is_dir() and not sicher.exists():
                shutil.copytree(alt_dir, sicher)          # Sicherung, nichts wird geloescht
            for f in sorted(alt_dir.glob("*.bin")) + sorted(alt_dir.glob("*.t0")):
                f.unlink()
            n_neu = _save_accel_mit_ankern(ziel.session_uuid, accel_teile)

            vor = db.execute(text("select metrics_json, segments_json from analysis_results "
                                 "where session_id=:i"), {"i": zid}).one()
            vm, vs = json.loads(vor[0]), json.loads(vor[1])
            res = run_analysis(db, ziel, final=True)
            db.commit()
            nm, ns = json.loads(res.metrics_json or "{}"), json.loads(res.segments_json or "[]")
            print(f"#{zid}: {n_alt} -> {n_neu} Chunks · Achse "
                  f"{vm.get('accel_axis') or vm.get('time_base')} -> {nm.get('accel_axis')} "
                  f"@ {nm.get('accel_hz_effective')} Hz")
            print(f"      Laeufe {len(vs)}->{len(ns)} · Pumps "
                  f"{sum(g.get('pumps') or 0 for g in vs)}->{sum(g.get('pumps') or 0 for g in ns)}"
                  f" · maxGlide {max([g.get('longest_glide_s') or 0 for g in vs], default=0):.2f}"
                  f"->{max([g.get('longest_glide_s') or 0 for g in ns], default=0):.2f}")
            gemacht += 1
    print(f"\n{gemacht} repariert{'/reparierbar' if args.dry else ''}, {uebersprungen} uebersprungen")


if __name__ == "__main__":
    main()
