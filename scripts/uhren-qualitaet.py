#!/usr/bin/env python3
"""Uhren-Qualitaet aus unseren eigenen Aufzeichnungen messen. REIN LESEND.

    cd server && .venv/bin/python ../scripts/uhren-qualitaet.py            # Tabelle
    cd server && .venv/bin/python ../scripts/uhren-qualitaet.py --json out.json

Idee (Jan, 05.09.2026): nicht Herstellerangaben vergleichen, sondern was die Geraete bei
UNS wirklich abliefern — vor allem **Puls-Aussetzer** und **stehende Ortung**.

Woher die Zahlen kommen
- Modell: `sessions.device_id` -> `device_tokens`. Garmin meldet es modellgenau, Wear OS und
  Amazfit meist, **Apple Watch gar nicht** (alle melden „Apple Watch") — deshalb steht Apple
  als eine Zeile da und nicht je Modell.
- Rohpunkte: `storage.load_gps()`, je Punkt `[t_ms, lat, lon, speed, hr, hacc]`.
- Analyse-Kennzahlen: `analysis_results.metrics_json` (`accel_hz_measured`, `detection`).

Was gemessen wird, und warum genau so
- **Puls-Aussetzer**: Anteil der Punkte OHNE Puls, und die laengste Kette mit exakt
  demselben Wert. Ein eingefrorener Puls ist naemlich schlimmer als gar keiner: er sieht
  gueltig aus und hat bis vor kurzem echte Laeufe als „nicht aus eigener Kraft" aussortiert.
  Ab `PULS_STARR_S` gilt eine Kette als Aussetzer.
- **Stehende Ortung**: Anteil der Punkte, die exakt dieselbe Position wie ihr Vorgaenger
  tragen. Auf dem Wasser bewegt man sich immer ein Stueck — identische Koordinaten heissen,
  die Uhr schreibt einen alten Fix weiter.
- **Ortungsgenauigkeit**: Median der gemeldeten `hacc` in Metern. Das ist die Selbstauskunft
  des Geraets, keine Wahrheit — aber sie ist ueber viele Sessions hinweg vergleichbar.
- **Beschleunigung**: Median der GEMESSENEN Rate (`accel_hz_measured`, nicht der
  angeforderten) und der Anteil der Sessions, die mangels brauchbarer Accel-Daten auf
  `gps_only` zurueckfallen mussten.

Faire Vergleiche: Modelle unter `MIN_SESSIONS` kommen nicht in die Tabelle, und je Zeile
steht die Zahl der Sessions UND der Nutzer dabei — zehn Sessions eines einzigen Nutzers an
einem einzigen Spot sagen wenig ueber ein Modell aus.
"""
from __future__ import annotations

import json
import os
import re
import sys
from collections import defaultdict
from statistics import median

BASIS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
MIN_SESSIONS = 8          # darunter ist eine Zeile Zufall, keine Aussage
MIN_PUNKTE = 120          # Sessions unter 2 Minuten gar nicht erst bewerten
PULS_STARR_S = 60.0       # so lange derselbe Wert = Aussetzer (die Analyse nimmt 120 s)


def env_laden() -> None:
    import pathlib
    for z in pathlib.Path(os.path.join(BASIS, "server/.env")).read_text().splitlines():
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)=(.*)$", z.strip())
        if m:
            os.environ.setdefault(m.group(1), m.group(2).strip().strip('"').strip("'"))


def messen(samples: list) -> dict | None:
    """Eine Session -> Kennzahlen. None, wenn zu kurz zum Bewerten."""
    if len(samples) < MIN_PUNKTE:
        return None
    n = len(samples)
    dauer_s = max(1.0, (samples[-1][0] - samples[0][0]) / 1000.0)
    rate = n / dauer_s                       # Punkte je Sekunde (meist 1)

    ohne_puls = 0
    laengste_kette = 0
    kette = 0
    letzter_puls = None
    doppelte_position = 0
    haccs = []
    letzte_pos = None

    for s in samples:
        hr = s[4] if len(s) > 4 else None
        if not hr:
            ohne_puls += 1
            kette = 0
            letzter_puls = None
        else:
            if hr == letzter_puls:
                kette += 1
                laengste_kette = max(laengste_kette, kette)
            else:
                kette = 0
            letzter_puls = hr
        pos = (s[1], s[2])
        if letzte_pos is not None and pos == letzte_pos:
            doppelte_position += 1
        letzte_pos = pos
        h = s[5] if len(s) > 5 else None
        if isinstance(h, (int, float)) and h > 0:
            haccs.append(float(h))

    return {
        "punkte": n,
        "dauer_s": dauer_s,
        "puls_fehlt": ohne_puls / n,
        "puls_starr_s": laengste_kette / rate,
        "ortung_steht": doppelte_position / max(1, n - 1),
        "hacc": median(haccs) if haccs else None,
    }


def main() -> None:
    env_laden()
    sys.path.insert(0, os.path.join(BASIS, "server"))
    from sqlalchemy import create_engine, text
    from app import storage

    eng = create_engine(os.environ["DATABASE_URL"])
    je_modell: dict[tuple, list] = defaultdict(list)
    nutzer: dict[tuple, set] = defaultdict(set)

    with eng.connect() as c:
        zeilen = c.execute(text("""
            SELECT s.session_uuid, s.user_id, dt.platform, dt.label, dt.part_number,
                   a.metrics_json, a.detection
            FROM sessions s
            JOIN device_tokens dt ON dt.id = s.device_id
            LEFT JOIN analysis_results a ON a.session_id = s.id
            WHERE s.deleted = false AND dt.platform IS NOT NULL
        """)).fetchall()

    print(f"{len(zeilen)} Sessions mit bekanntem Geraet — messe …", file=sys.stderr)
    for i, (uuid, uid, plattform, label, part, metrics, detection) in enumerate(zeilen):
        if i % 200 == 0 and i:
            print(f"   {i} …", file=sys.stderr)
        try:
            samples = storage.load_gps(uuid)
        except Exception:                     # noqa: BLE001 — eine kaputte Session stoppt nichts
            continue
        w = messen(samples)
        if w is None:
            continue
        m = metrics if isinstance(metrics, dict) else (json.loads(metrics) if metrics else {})
        w["accel_hz"] = m.get("accel_hz_measured")
        w["gps_only"] = (detection == "gps_only")
        schluessel = (plattform, (label or "?").strip(), part)
        je_modell[schluessel].append(w)
        nutzer[schluessel].add(uid)

    aus = []
    for schluessel, liste in je_modell.items():
        if len(liste) < MIN_SESSIONS:
            continue
        plattform, label, part = schluessel
        hz = [w["accel_hz"] for w in liste if w["accel_hz"]]
        hacc = [w["hacc"] for w in liste if w["hacc"] is not None]
        aus.append({
            "plattform": plattform, "modell": label, "part_number": part,
            "sessions": len(liste), "nutzer": len(nutzer[schluessel]),
            "stunden": round(sum(w["dauer_s"] for w in liste) / 3600.0, 1),
            # Anteil der SESSIONS mit dem jeweiligen Problem — nicht der Punkte: eine Session
            # mit 40 % fehlendem Puls ist fuer den Nutzer ein Ausfall, egal wie viele Punkte.
            "puls_fehlt_med": round(median(w["puls_fehlt"] for w in liste) * 100, 1),
            "puls_ausfall_anteil": round(
                sum(1 for w in liste if w["puls_fehlt"] > 0.10) / len(liste) * 100, 1),
            "puls_starr_anteil": round(
                sum(1 for w in liste if w["puls_starr_s"] >= PULS_STARR_S) / len(liste) * 100, 1),
            "puls_starr_med_s": round(median(w["puls_starr_s"] for w in liste), 1),
            "ortung_steht_med": round(median(w["ortung_steht"] for w in liste) * 100, 2),
            "ortung_steht_anteil": round(
                sum(1 for w in liste if w["ortung_steht"] > 0.05) / len(liste) * 100, 1),
            "hacc_med": round(median(hacc), 1) if hacc else None,
            "accel_hz_med": round(median(hz), 1) if hz else None,
            "gps_only_anteil": round(sum(1 for w in liste if w["gps_only"]) / len(liste) * 100, 1),
        })

    aus.sort(key=lambda r: (-r["sessions"]))
    if "--json" in sys.argv:
        ziel = sys.argv[sys.argv.index("--json") + 1]
        open(ziel, "w").write(json.dumps(aus, ensure_ascii=False, indent=1))
        print("geschrieben:", ziel)
        return

    kopf = (f"{'Plattform':9s} {'Modell':34s} {'Sess':>5s} {'Nutz':>5s} {'Std':>6s} "
            f"{'Puls fehlt':>11s} {'Puls starr':>11s} {'Ortung steht':>13s} "
            f"{'hacc':>6s} {'Accel':>7s} {'gps-only':>9s}")
    print(kopf)
    print("-" * len(kopf))
    for r in aus:
        print(f"{r['plattform'][:9]:9s} {r['modell'][:34]:34s} {r['sessions']:5d} {r['nutzer']:5d} "
              f"{r['stunden']:6.1f} {r['puls_ausfall_anteil']:10.1f}% {r['puls_starr_anteil']:10.1f}% "
              f"{r['ortung_steht_anteil']:12.1f}% "
              f"{(str(r['hacc_med']) if r['hacc_med'] is not None else '–'):>6s} "
              f"{(str(r['accel_hz_med']) + ' Hz' if r['accel_hz_med'] else '–'):>7s} "
              f"{r['gps_only_anteil']:8.1f}%")


if __name__ == "__main__":
    main()
