#!/usr/bin/env python3
"""Was der Server von einer Zepp-Uhr gesehen hat — nach jedem Emulator-Testschritt. REIN LESEND.

    cd server && .venv/bin/python ../scripts/zepp-testlauf-stand.py            # neueste Zepp-Uhr
    cd server && .venv/bin/python ../scripts/zepp-testlauf-stand.py --dev 42   # bestimmte Uhr
    cd server && .venv/bin/python ../scripts/zepp-testlauf-stand.py --n 5      # mehr Sessions

WOZU: der Testplan in `watch-zepp/TESTPLAN-EMULATOR.md` besteht aus zwei Dutzend Schritten, nach
denen jeweils dieselbe Frage steht — hat der Server die Meldung bekommen, und stimmt sie? Auf dem
Uhrenbildschirm laesst sich das nicht beantworten (die App laeuft nach einem Kill gar nicht mehr).
Die Antwort steht in `device_tokens` und `ingest_chunks`.

GELESEN WIRD:
  * Absturz-Waechter: `crash_count` / `crash_phase` / `crash_at`. ACHTUNG, entprellt auf 60 s
    (`SF_DEBOUNCE_S`) — zwei Kills kurz hintereinander zaehlen als EINER. Die Phase und der
    Zeitpunkt werden trotzdem jedes Mal frisch gesetzt, danach also schauen, nicht auf den Zaehler.
  * Speichermessung: `mem_peak_kb` ist der GROESSTE je gemeldete Wert dieser Uhr (GREATEST), sinkt
    also nie wieder. Fuer einen Vergleich zwischen zwei Faellen eine frische Uhr paaren.
  * Je Session: Bloecke je Art, Luecken in der Nummerierung, GPS-Punkte, Dauer und die
    GPS-DICHTE — Punkte geteilt durch Aufnahmesekunden. Das ist die Zahl aus dem GPS-Befund vom
    22.09.2026 (Zepp 0,23 · Garmin 0,84 · Apple 0,86); an ihr haengt, ob 1.0.12 etwas gebracht hat.

Schreibt NICHTS und beruehrt keine Dateien.
"""
from __future__ import annotations

import argparse
import os
import sys


def lade_env() -> None:
    if not os.path.exists(".env"):
        sys.exit("Kein .env im Arbeitsverzeichnis — bitte aus server/ starten.")
    env = dict(l.split("=", 1) for l in open(".env") if "=" in l and not l.startswith("#"))
    if "DATABASE_URL" not in env:
        sys.exit("DATABASE_URL fehlt in .env")
    os.environ["DATABASE_URL"] = env["DATABASE_URL"].strip().strip('"')


def luecken(indizes: list[int]) -> str:
    """-> '' wenn 0..n-1 lueckenlos, sonst eine Beschreibung. Doppelte kann es nicht geben
    (UniqueConstraint uq_chunk), Luecken schon — und genau die sind der Schaden."""
    if not indizes:
        return "keine"
    fehlt = sorted(set(range(max(indizes) + 1)) - set(indizes))
    if not fehlt:
        return ""
    kurz = ", ".join(str(x) for x in fehlt[:8])
    return f"LUECKE bei {kurz}{' …' if len(fehlt) > 8 else ''} ({len(fehlt)} von {max(indizes)+1})"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dev", type=int, help="device_tokens.id")
    ap.add_argument("--n", type=int, default=3, help="wie viele Sessions (Vorgabe 3)")
    args = ap.parse_args()
    lade_env()
    from sqlalchemy import create_engine, text

    with create_engine(os.environ["DATABASE_URL"]).connect() as c:
        if args.dev:
            wo, p = "d.id = :i", {"i": args.dev}
        else:
            wo, p = "d.platform = 'zepp'", {}
        d = c.execute(text(f"""
            select d.id, d.label, d.platform, d.app_version, d.part_number, d.user_id,
                   d.crash_count, d.crash_phase, d.crash_at, d.mem_peak_kb, d.mem_total_kb,
                   d.last_seen_at, u.email
            from device_tokens d left join users u on u.id = d.user_id
            where {wo} order by d.last_seen_at desc nulls last limit 1"""), p).first()
        if d is None:
            print("Keine passende Uhr gefunden.")
            return 1

        PHASE = {1: "App-Start", 2: "Leerlauf", 3: "Aufnahme", 4: "Upload"}
        print(f"UHR  #{d.id}  {d.label or '(ohne Namen)'}  ·  {d.platform}  ·  App {d.app_version or '?'}"
              f"  ·  Modell {d.part_number or '?'}")
        print(f"     Konto {d.email or d.user_id}   zuletzt gesehen {d.last_seen_at}")
        if d.crash_count:
            print(f"     ABSTURZ: {d.crash_count}x gezaehlt · zuletzt Phase {d.crash_phase} "
                  f"({PHASE.get(d.crash_phase, '?')}) um {d.crash_at}")
        else:
            print("     ABSTURZ: nichts gemeldet (crash_count = 0)")
        if d.mem_peak_kb or d.mem_total_kb:
            anteil = (100.0 * d.mem_peak_kb / d.mem_total_kb) if d.mem_total_kb else 0
            print(f"     SPEICHER: Spitze {d.mem_peak_kb} KB von {d.mem_total_kb} KB"
                  + (f"  ({anteil:.0f} %)" if anteil else "")
                  + "   (hoechster je gemeldeter Wert, sinkt nie)")
        else:
            print("     SPEICHER: nichts gemeldet (Uhr kann kein getPerformance, oder App < 1.0.12)")

        sess = c.execute(text("""
            select s.id, s.session_uuid, s.status, s.started_at, s.ended_at, s.app_version,
                   s.accel_hz, s.expected_chunks, s.total_chunks,
                   extract(epoch from (s.ended_at - s.started_at)) as dauer_s
            from sessions s where s.device_id = :i and s.deleted = false
            order by s.id desc limit :n"""), {"i": d.id, "n": args.n}).all()
        if not sess:
            print("\nKeine Sessions von dieser Uhr.")
            return 0

        for s in sess:
            print(f"\nSESSION #{s.id}  {s.status}  ·  {s.started_at} → {s.ended_at or '(offen)'}"
                  f"  ·  App {s.app_version or '?'}"
                  + (f"  ·  angekuendigt {s.expected_chunks} Bloecke" if s.expected_chunks else ""))
            for kind in ("gps", "accel"):
                r = c.execute(text("""
                    select index, sample_count from ingest_chunks
                    where session_id = :i and kind = :k order by index"""),
                    {"i": s.id, "k": kind}).all()
                if not r:
                    print(f"     {kind:5s}: keine Bloecke")
                    continue
                idx = [x.index for x in r]
                punkte = sum(x.sample_count or 0 for x in r)
                lk = luecken(idx)
                print(f"     {kind:5s}: {len(r)} Bloecke (0..{max(idx)}), {punkte} Punkte"
                      + (f"   {lk}" if lk else "   lueckenlos"))
                if kind == "gps":
                    dauer = s.dauer_s or 0
                    if dauer:
                        dichte = punkte / dauer
                        urteil = ("GUT" if dichte >= 0.7 else
                                  "SCHWACH" if dichte >= 0.4 else "SCHLECHT")
                        print(f"            GPS-DICHTE {dichte:.2f} Punkte/s ueber {dauer:.0f} s"
                              f"  → {urteil}   (Zepp 1.0.11 lag bei 0,23 · Garmin 0,84)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
