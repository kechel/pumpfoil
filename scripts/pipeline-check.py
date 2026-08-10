#!/usr/bin/env python3
"""Misst die Zahlen nach, die in docs/DATA-PIPELINE.md zitiert werden. REIN LESEND.

Warum das Skript existiert: die Doku nennt konkrete Zahlen (wie viele Sessions auf welcher
Zeitachse laufen, welche Geraete unter die 15-Hz-Schwelle fallen, …). Der Bestand waechst
laufend, also veralten sie. Statt zu raten oder zu glauben: neu messen.

    cd server && .venv/bin/python ../scripts/pipeline-check.py

Erwartet `server/.env` mit DATABASE_URL im Arbeitsverzeichnis (also aus `server/` starten).
Schreibt NICHTS in die DB und beruehrt keine Dateien.
"""
import collections
import json
import os
import re
import statistics as st
import sys

FR55 = "006-B3869-00"
FR955 = "006-B4024-00"


def lade_env() -> None:
    if not os.path.exists(".env"):
        sys.exit("Kein .env im Arbeitsverzeichnis — bitte aus server/ starten.")
    env = dict(l.split("=", 1) for l in open(".env") if "=" in l and not l.startswith("#"))
    if "DATABASE_URL" not in env:
        sys.exit("DATABASE_URL fehlt in .env")
    os.environ["DATABASE_URL"] = env["DATABASE_URL"].strip().strip('"')


def main() -> None:
    lade_env()
    from sqlalchemy import create_engine, text

    with create_engine(os.environ["DATABASE_URL"]).connect() as c:
        rows = c.execute(text("""
            select s.id, coalesce(d.platform,'(kein Geraet)') p, s.accel_hz, s.gps_hz,
                   s.accel_scale, coalesce(s.device_model, d.part_number, '(unbekannt)') modell,
                   a.metrics_json, a.segments_json
            from sessions s
            join analysis_results a on a.session_id = s.id
            left join device_tokens d on d.id = s.device_id
            where s.deleted = false""")).all()

    print(f"§ Stand: {len(rows)} analysierte Sessions (nicht geloescht)\n")

    print("§2  gps_hz / accel_scale — sollten je einen einzigen Wert haben")
    print(f"     gps_hz {dict(collections.Counter(r[3] for r in rows))}"
          f"   accel_scale {dict(collections.Counter(r[4] for r in rows))}")

    print("\n§3  Sessions je Plattform")
    for p, n in collections.Counter(r[1] for r in rows).most_common():
        extra = ""
        if p == "garmin":
            extra = "  angefordert: " + str(dict(collections.Counter(
                r[2] for r in rows if r[1] == "garmin")))
        print(f"     {p:16} {n:>5}{extra}")

    tb = collections.Counter()
    gruende = collections.Counter()
    liefert = collections.defaultdict(list)
    pro_modell = collections.defaultdict(list)
    for r in rows:
        m = json.loads(r[6])
        quelle = m.get("time_base") or "(fehlt)"
        tb[quelle] += 1
        for n in (m.get("time_base_notes") or []):
            if re.match(r"\d+ von \d+ Chunks ohne t0_ms", n):
                gruende["ohne t0_ms"] += 1
            elif "streng wachsend" in n:
                gruende["nicht streng wachsend"] += 1
            elif "Bandes" in n:
                gruende["ausserhalb des Bandes (§9.1)"] += 1
            elif "GPS-Ende" in n:
                gruende["ueber GPS-Ende"] += 1
            elif "unplausibel" in n:
                gruende["Rate unplausibel"] += 1
        hz = m.get("accel_hz")
        if hz:
            pro_modell[(r[1], r[5])].append(float(hz))
            if quelle == "exact_chunks" and r[2]:
                liefert[(r[1], int(r[2]))].append(float(hz))

    print("\n§5  Herkunft der Accel-Zeitachse")
    for k, n in tb.most_common():
        print(f"     {k:16} {n:>5}")
    print("\n§5  Warum die exakte Achse verworfen wurde")
    for k, n in gruende.most_common():
        print(f"     {k:30} {n:>5}")
    summe_ersatz = tb["measured_rate"] + tb["uncertain"]
    ok = "OK" if sum(gruende.values()) == summe_ersatz else "ABWEICHUNG!"
    print(f"     Summe {sum(gruende.values())} vs. measured_rate+uncertain {summe_ersatz}  -> {ok}")

    print("\n§3  Geliefert vs. angefordert (nur exact_chunks — sonst ist die Rate geschaetzt)")
    for k, v in sorted(liefert.items()):
        hoch = [x for x in v if x / k[1] >= 1.8]
        print(f"     {k[0]:16} {k[1]:>3} Hz angefordert  n={len(v):>4}  median {st.median(v):>7.2f} Hz"
              f"  >=1.8x: {len(hoch):>3}")

    print("\n§6.1  15-Hz-Schwelle (MODEL_MIN_ACCEL_HZ)")
    unter = {k: sum(1 for x in v if x < 15.0) for k, v in pro_modell.items()}
    mit_accel = sum(len(v) for v in pro_modell.values())
    print(f"     Sessions mit Accel-Rate: {mit_accel}, davon unter 15 Hz: {sum(unter.values())}")
    for pn, name in ((FR55, "Forerunner 55"), (FR955, "Forerunner 955")):
        v = pro_modell.get(("garmin", pn), [])
        if v:
            print(f"     {name:16} n={len(v):>4} median {st.median(v):>7.2f} Hz"
                  f" min {min(v):>6.2f}  unter 15 Hz: {unter[('garmin', pn)]}")
    rest = [(k, v) for k, v in pro_modell.items() if k[0] == "garmin" and k[1] not in (FR55, FR955)]
    if rest:
        print(f"     Garmin sonst     {len(rest)} Modelle, {sum(len(v) for _, v in rest)} Sessions,"
              f" min {min(min(v) for _, v in rest):.2f} Hz,"
              f" unter 15 Hz: {sum(unter[k] for k, _ in rest)}")
    for pf in ("wear", "apple", "(kein Geraet)"):
        v = [x for k, vv in pro_modell.items() if k[0] == pf for x in vv]
        if v:
            u = sum(1 for k, vv in pro_modell.items() if k[0] == pf for x in vv if x < 15.0)
            print(f"     {pf:16} n={len(v):>4} median {st.median(v):>7.2f} Hz"
                  f" min {min(v):>6.2f}  unter 15 Hz: {u}")
    bekannt = sum(1 for r in rows if r[5] != "(unbekannt)")
    print(f"     Modell/Part-Number bekannt: {bekannt} von {len(rows)}")

    print("\n§1/§6  Achsen-Beispiel (erste Session mit >=10 Laeufen)")
    for r in rows:
        segs = json.loads(r[7] or "[]")
        if len(segs) >= 10 and segs[9].get("t_start_session_ms") is not None:
            s9 = segs[9]
            print(f"     #{r[0]}: {len(segs)} Laeufe, {len(s9.keys())} Felder je Lauf")
            print(f"     Lauf 10 (Index 9): Sample-Index {s9['i_start']}..{s9['i_end']}"
                  f" | rebasiert {s9['t_start_ms']}..{s9['t_end_ms']}"
                  f" | Session {s9['t_start_session_ms']}..{s9['t_end_session_ms']}")
            break


if __name__ == "__main__":
    main()
