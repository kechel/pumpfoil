#!/usr/bin/env python3
"""Baut die Zeitachse bereits zusammengefuehrter Sessions auf die Wanduhr um.

    cd server && DETECTOR_V2=1 .venv/bin/python ../scripts/merge-timeaxis-repair.py            # TROCKEN
    cd server && DETECTOR_V2=1 .venv/bin/python ../scripts/merge-timeaxis-repair.py --scharf   # schreibt
    cd server && DETECTOR_V2=1 .venv/bin/python ../scripts/merge-timeaxis-repair.py --scharf 3159

Hintergrund: `merge.py` legte die Teile bis zum 31.08.2026 mit
`off_ms += Laenge(voriger Teil) + 20 s` hintereinander und rebaste jeden Teil vorher auf 0, gab der
neuen Session aber `started_at` des ERSTEN Teils. Damit fielen der weggetrimmte Kopf jedes Teils
und die echte Pause zwischen den Aufnahmen aus der Achse — `started_at + Session-ms` war NICHT die
Uhrzeit, und der Fehler war je Teil verschieden. `merge.py` ist repariert; dieses Skript zieht die
48 bereits bestehenden Sessions nach.

Es baut GPS und Accel aus den QUELLEN neu auf (die liegen unveraendert vor, `merged_into` zeigt auf
die zusammengefuehrte Session) und laesst danach die Analyse neu laufen.

OHNE `--scharf` wird NICHTS geschrieben — dann rechnet es nur vor, wie weit sich die Achse
verschiebt. Vor einem scharfen Lauf eine Sicherung anlegen (Rohdaten + analysis_results).
WICHTIG: `DETECTOR_V2=1` muss im Env stehen, sonst schreibt `run_analysis` still v1-Ergebnisse.
"""
import os
import sys
from datetime import timedelta


def _env():
    if not os.path.exists(".env"):
        sys.exit("Bitte aus server/ starten (server/.env wird gelesen).")
    env = dict(l.split("=", 1) for l in open(".env") if "=" in l and not l.startswith("#"))
    os.environ["DATABASE_URL"] = env["DATABASE_URL"].strip().strip('"')
    if os.environ.get("DETECTOR_V2") != "1":
        sys.exit("DETECTOR_V2=1 fehlt im Env — sonst schreibt run_analysis still v1-Ergebnisse.")


def main() -> int:
    scharf = "--scharf" in sys.argv
    rest = [a for a in sys.argv[1:] if not a.startswith("--")]
    nur = int(rest[0]) if rest else None
    _env()
    sys.path.insert(0, ".")
    import numpy as np
    from app import models, storage
    from app.db import SessionLocal
    from app.merge import _save_accel_mit_ankern, _trimmed_mit_achse

    db = SessionLocal()
    q = db.query(models.Session).filter(
        models.Session.session_uuid.like("merge-%"),
        models.Session.deleted.isnot(True))
    if nur:
        q = q.filter(models.Session.id == nur)
    ziele = q.order_by(models.Session.id).all()
    print(f"{len(ziele)} zusammengefuehrte Session(s), Modus: "
          f"{'SCHARF (schreibt)' if scharf else 'TROCKEN (schreibt nichts)'}\n")

    geaendert = uebersprungen = 0
    for ns in ziele:
        teile = (db.query(models.Session).filter(models.Session.merged_into == ns.id)
                 .order_by(models.Session.started_at).all())
        # VERSCHACHTELTE Zusammenfuehrungen: wurde mehrfach nacheinander zusammengefuehrt, zeigt
        # `merged_into` aller Beteiligten flach auf das ENDERGEBNIS — Zwischenstufen stehen also
        # neben ihren eigenen Teilen in derselben Liste und wuerden dieselben Daten ein zweites Mal
        # beisteuern (belegt an s1910: Punktzahl verdreifachte sich).
        #
        # Nicht am TYP entscheiden, sondern an der ABDECKUNG: erst alle echten Aufnahmen nehmen,
        # dann eine Zwischenstufe nur dann noch dazu, wenn sie Zeit beisteuert, die noch niemand
        # abdeckt. Sonst faellt Substanz weg — bei s458/s741/s1723 enthaelt die Zwischenstufe
        # AUFNAHMEN, die sonst nirgends stehen (dort kostete die Typ-Regel bis zu 2453 Punkte).
        blaetter = [x for x in teile if not (x.session_uuid or "").startswith("merge-")]
        stufen = [x for x in teile if (x.session_uuid or "").startswith("merge-")]
        if stufen and blaetter:
            def _spanne(x):
                return (x.started_at, x.ended_at or x.started_at)
            abgedeckt = [_spanne(x) for x in blaetter]
            behalten = list(blaetter)
            for st in sorted(stufen, key=lambda x: x.started_at):
                a, b = _spanne(st)
                frei = (b - a).total_seconds()
                for ca, cb in abgedeckt:
                    frei -= max(0.0, (min(b, cb) - max(a, ca)).total_seconds())
                if frei > 60:                      # steuert echte Zeit bei -> behalten
                    behalten.append(st)
                    abgedeckt.append((a, b))
                else:
                    print(f"  s{ns.id}: Zwischenstufe s{st.id} steckt schon in den Teilen "
                          f"({frei:.0f} s eigene Zeit) — ausgelassen")
            teile = sorted(behalten, key=lambda x: x.started_at)
        if not teile:
            print(f"  s{ns.id}: keine Quellen mehr — uebersprungen")
            uebersprungen += 1
            continue

        alt_gps = storage.load_gps(ns.session_uuid) or []
        alt_ende = alt_gps[-1][0] if alt_gps else 0

        combined: list = []
        accel_parts: list = []
        versatz = []
        for s in teile:
            g, a, t = _trimmed_mit_achse(s)
            if not g:
                continue
            off = int((s.started_at - ns.started_at).total_seconds() * 1000) + int(s.trim_start_ms or 0)
            versatz.append((s.id, off))
            for row in g:
                combined.append([row[0] + off] + list(row[1:]))
            if a is not None and a.shape[0] and t.size == a.shape[0]:
                accel_parts.append((a, t + float(off)))
        if not combined:
            print(f"  s{ns.id}: keine GPS-Daten in den Quellen — uebersprungen")
            uebersprungen += 1
            continue

        # Harte Sicherung: die Achse MUSS aufsteigen. Ueberlappende Teile ergaeben eine Spur, die
        # zeitlich zurueckspringt — daraus kann die Analyse nichts Vernuenftiges bauen. Lieber
        # auslassen und melden als stillschweigend Unsinn schreiben.
        zeiten = [row[0] for row in combined]
        if any(b < a for a, b in zip(zeiten, zeiten[1:])):
            rueck = sum(1 for a, b in zip(zeiten, zeiten[1:]) if b < a)
            print(f"  s{ns.id}: ACHSE NICHT MONOTON ({rueck} Ruecksprunge) — uebersprungen, "
                  f"Teile ueberlappen sich zeitlich")
            uebersprungen += 1
            continue

        neu_ende = combined[-1][0]
        print(f"  s{ns.id}: {len(teile)} Teile | GPS-Ende {alt_ende/60000:6.1f} min → "
              f"{neu_ende/60000:6.1f} min | Punkte {len(alt_gps)} → {len(combined)} | "
              f"Versaetze {[v for _, v in versatz]}")

        if not scharf:
            continue

        # Alte Spuren wegraeumen, sonst mischen sich alte und neue Chunks.
        d = storage.session_dir(ns.session_uuid)
        for unter in ("gps", "accel"):
            p = d / unter
            if p.exists():
                for f in p.iterdir():
                    if f.is_file():
                        f.unlink()
        storage.ensure_session_dir(ns.session_uuid)
        storage.save_gps_chunk(ns.session_uuid, 0, combined)
        _save_accel_mit_ankern(ns.session_uuid, accel_parts)
        geaendert += 1

    if scharf:
        # Analyse erst NACH allen Umbauten — run_analysis committet selbst.
        from app.analysis import run_analysis
        print(f"\n{geaendert} Session(en) umgebaut, jetzt Analyse …")
        for ns in ziele:
            try:
                run_analysis(db, ns)
                print(f"  s{ns.id}: analysiert")
            except Exception as ex:                       # noqa: BLE001
                print(f"  s{ns.id}: FEHLER {type(ex).__name__}: {ex}")
    print(f"\nfertig — {geaendert} umgebaut, {uebersprungen} uebersprungen")
    db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
