#!/usr/bin/env python3
"""Rechnet REIN LESEND die Zahlen nach, auf denen die Foil-Baender der Community-Rekorde stehen.

    cd server && .venv/bin/python ../scripts/foil-bands-check.py

Warum es das gibt: die Baender in `server/app/api/community.py` (FOIL_BANDS) sind an der Flotte
vom 01.09.2026 ausgerichtet. Die wandert — die heute gefahrenen Fluegel sind nicht die von 2027.
Vor jeder Verschiebung der Grenzen hier nachrechnen, statt zu schaetzen.

Es prueft die vier Aussagen, die das Design tragen:
  1. Wo faehrt die Flotte? (Verteilung der Flaeche, sessiongewichtet)
  2. Sind Flaeche und AR unabhaengig? (Korrelation — war -0,12; DESHALB beides und nicht nur eins)
  3. Taugen feste AR-Baender? (war: 46 / 822 / 70 / 105 — nein)
  4. Wie gross wird `mine` (+/-15 % Flaeche, +/-2 AR) fuer die meistgefahrenen Fluegel?
     (war 317-466 Sessions; ohne die AR-Bedingung 468-761 mit AR 4,4-21,0, also beliebig)
"""
import os
import statistics as st
import sys

MINE_FLAECHE_REL = 0.15
MINE_AR_ABS = 2.0


def main() -> int:
    if not os.path.exists(".env"):
        sys.exit("Bitte aus server/ starten (server/.env wird gelesen).")
    env = dict(l.split("=", 1) for l in open(".env") if "=" in l and not l.startswith("#"))
    os.environ["DATABASE_URL"] = env["DATABASE_URL"].strip().strip('"')
    from sqlalchemy import create_engine, text
    eng = create_engine(os.environ["DATABASE_URL"])

    with eng.connect() as c:
        rows = c.execute(text("""
            SELECT f.brand, f.model, f.size, f.area_cm2, f.span_cm,
                   count(s.id), count(DISTINCT s.user_id)
            FROM sessions s JOIN foils f ON f.id = s.foil_id
            WHERE s.deleted IS NOT TRUE AND s.is_pumpfoil IS TRUE
              AND f.area_cm2 IS NOT NULL AND f.span_cm IS NOT NULL
            GROUP BY 1,2,3,4,5""")).fetchall()
        ohne = c.execute(text("""
            SELECT count(*) FROM sessions
            WHERE deleted IS NOT TRUE AND is_pumpfoil IS TRUE AND foil_id IS NULL""")).scalar()

    D = [(float(r[3]), float(r[4]) ** 2 / float(r[3]), r[5], "%s %s %s" % (r[0], r[1], r[2]))
         for r in rows]
    ges = sum(x[2] for x in D)
    print(f"{ges} Sessions mit hinterlegtem Foil (Flaeche UND Spannweite bekannt), "
          f"{ohne} ohne Foil ({100 * ohne / (ges + ohne):.0f} %).\n")

    print("1) Wo faehrt die Flotte? (Flaeche, sessiongewichtet)")
    eimer: dict[int, int] = {}
    for a, _, n, _ in D:
        k = int(a // 200) * 200
        eimer[k] = eimer.get(k, 0) + n
    breit = max(eimer.values())
    for k in sorted(eimer):
        print(f"   {k:5d}-{k + 200:5d} cm²: {eimer[k]:5d}  " + "#" * max(1, round(40 * eimer[k] / breit)))

    xs = [a for a, _, n, _ in D for _ in range(n)]
    ys = [ar for _, ar, n, _ in D for _ in range(n)]
    mx, my = st.mean(xs), st.mean(ys)
    cov = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / len(xs)
    r = cov / (st.pstdev(xs) * st.pstdev(ys))
    print(f"\n2) Korrelation Flaeche <-> AR: r = {r:+.2f}"
          f"   (Median {st.median(xs):.0f} cm², AR {st.median(ys):.1f})")
    print("   |r| klein => unabhaengig => die Flaeche allein sagt nichts ueber die AR.")

    print("\n3) Feste AR-Baender")
    for lo, hi, name in [(0, 9, "unter 9"), (9, 13, "9-13"), (13, 16, "13-16"), (16, 99, "ueber 16")]:
        n = sum(x[2] for x in D if lo <= x[1] < hi)
        print(f"   {name:10s} {n:5d} Sessions ({100 * n / ges:4.1f} %)")

    print("\n4) `mine` (+/-15 % Flaeche, +/-2 AR) fuer die meistgefahrenen Fluegel")
    for a, ar, n, name in sorted(D, key=lambda x: -x[2])[:8]:
        mit = [x for x in D if abs(x[0] - a) / a <= MINE_FLAECHE_REL and abs(x[1] - ar) <= MINE_AR_ABS]
        nur_a = [x for x in D if abs(x[0] - a) / a <= MINE_FLAECHE_REL]
        ars = [x[1] for x in nur_a]
        print(f"   {name[:30]:30s} ({a:4.0f} cm², AR {ar:4.1f})  Gruppe {sum(x[2] for x in mit):4d}"
              f"  |  ohne AR-Bedingung {sum(x[2] for x in nur_a):4d} (AR {min(ars):.1f}-{max(ars):.1f})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
