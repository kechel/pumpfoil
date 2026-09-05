#!/usr/bin/env python3
"""Welche Uhr taugt fuer Pumpfoil? Gemessen an UNSEREN eigenen Aufzeichnungen. REIN LESEND.

    cd server && .venv/bin/python ../scripts/uhren-qualitaet.py
    cd server && .venv/bin/python ../scripts/uhren-qualitaet.py --json ../analyse/uhren.json

Nicht Herstellerangaben vergleichen, sondern was die Geraete bei uns wirklich abliefern
(Jan, 05.09.2026). Vier Kategorien, dazu ein Urteil je Modell.

NUR EIGENE AUFNAHMEN
Bewertet wird ausschliesslich, was MIT UNSERER APP aufgezeichnet wurde (Jan, 05.09.2026).
Ein importierter Garmin-FIT oder eine ueber Suunto hereingeholte Session wuerde sonst eine
Uhr bewerten, ohne dass unsere App je darauf lief — die Datei sagt nichts darueber, wie gut
UNSERE Aufzeichnung funktioniert. Zwei Sperren:
- Der Join auf `device_tokens` faellt bei Importen ohnehin durch: `fit-`, `suunto-`, `polar-`,
  `imp-` tragen keine `device_id` (nachgezaehlt am 05.09.: 480 + 294 + 41 + 86 Sessions, alle
  ohne Geraet). Trotzdem steht die Bedingung ausdruecklich in der Abfrage — sonst haengt die
  Richtigkeit daran, dass das SO BLEIBT.
- **Zusammengefuehrte Sessions (`merge-`) fliegen ebenfalls raus**, und die traegen sehr wohl
  ein Geraet: 52 Stueck, davon 20 am fēnix 7X Pro. Eine Zusammenfuehrung kann Aufnahmen von
  ZWEI Uhren enthalten (die Doppeluhr-Messungen), haengt aber an einer — die Zuordnung waere
  also falsch.

WOHER DIE MODELLE KOMMEN
`sessions.device_id` -> `device_tokens`. Garmin meldet modellgenau, Wear OS und Amazfit
meist, **Apple Watch gar nicht** — dort steht bei allen 51 Geraeten nur „Apple Watch".
Ab App 1.1.31 schickt auch die Apple Watch ihr Modell mit; bis dahin bleibt sie EINE Zeile.

DIE VIER KATEGORIEN
1. **Pump-Erkennung.** Die wichtigste. Ohne brauchbare Beschleunigung faellt die Analyse auf
   `gps_only` zurueck: Laeufe und Strecke stimmen dann noch, Pumps werden aber nicht gezaehlt.
   Gemessen wird die WIRKLICHE Rate (`accel_hz_measured`), nicht die angeforderte, und der
   Anteil Sessions, die trotzdem auf `gps_only` landeten.
2. **Ortung.** Zwei Zahlen: der Anteil Punkte, die exakt die Position ihres Vorgaengers
   tragen (die Uhr schreibt einen alten Fix weiter — auf dem Wasser bewegt man sich immer),
   und die Guete. **Die Guete ist NICHT vergleichbar zwischen den Welten:** Connect IQ
   liefert eine Stufe (`Position.Quality`, 4 = GOOD), Apple/Wear/Handy liefern Meter.
   Deshalb zwei getrennte Spalten und niemals eine gemeinsame Rangfolge daraus.
3. **Puls.** Gemessen an den **Wertwechseln je Minute**, nicht am Anteil fehlender Werte.
   Das ist entscheidend: bis 1.1.29 schrieb die Apple-App den letzten bekannten Puls in JEDEN
   Punkt (auf Wear OS derselbe Fehler von 1.2.21 bis 1.2.25). Wer den ANTEIL fehlender Werte
   misst, sieht davon nichts — 99,5 % der Apple-Punkte tragen einen Wert, er ist nur alt.
   Wertwechsel dagegen entstehen NUR, wenn wirklich neu gemessen wurde; ein weitergeschriebener
   Wert aendert sich nicht. Damit ist die Zahl von unserem Fehler unabhaengig und ueber alle
   Plattformen und App-Versionen hinweg vergleichbar.
   Zum Einordnen: Garmin 18,3 Wechsel/min (etwa alle 3 s), Apple Watch 4,4 (etwa alle 14 s).
   `PULS_TOT_PRO_MIN` markiert, ab wann eine Session als Aussetzer gilt.
4. **Speicher.** `device_tokens.storage_full_count`/`crash_count`. Bewusst nur als Hinweis:
   nur je zehn Geraete haben ueberhaupt etwas gemeldet, das traegt keine Statistik.

FAIRNESS — „ein Nutzer, eine Stimme"
Je Modell fahren oft ein oder zwei Leute die meisten Sessions. Wuerde man einfach ueber alle
Sessions mitteln, bewertet man deren Setup, nicht das Modell. Belegt am fēnix 6X Pro: ueber
Sessions gerechnet fehlte dort in 86,7 % der Faelle der Puls — das kam von EINEM Nutzer mit
77 von 85 Sessions (87,8 % ohne Puls), die anderen vier Nutzer lagen bei 0 %.
Deshalb wird zuerst je NUTZER zusammengefasst und dann ueber die Nutzer gemittelt. Modelle
unter `MIN_SESSIONS` fallen raus; bei nur einem Nutzer steht das in der Zeile.
"""
from __future__ import annotations

import json
import os
import re
import sys
from collections import defaultdict
from statistics import median

BASIS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
MIN_SESSIONS = 8
MIN_PUNKTE = 120
PULS_STARR_PUNKTE = 60      # >= so viele gleiche Werte am Stueck = eingefroren
PULS_TOT_PRO_MIN = 1.0      # weniger als ein neuer Wert je Minute = die Messung steht
ACCEL_MIN_HZ = 15.0         # darunter reicht es nicht fuers Pump-Modell (s. analysis/__init__)
BEWEGT_MPS = 1.0            # ab hier gilt "in Bewegung" — darunter zaehlt Stillstand nicht als Fehler


def env_laden() -> None:
    import pathlib
    for z in pathlib.Path(os.path.join(BASIS, "server/.env")).read_text().splitlines():
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)=(.*)$", z.strip())
        if m:
            os.environ.setdefault(m.group(1), m.group(2).strip().strip('"').strip("'"))


def version(v: str | None) -> tuple:
    """'1.2.23' -> (1,2,23); Unbekanntes wird zu (0,0,0)."""
    if not v:
        return (0, 0, 0)
    teile = re.findall(r"\d+", v)[:3]
    return tuple(int(t) for t in teile) + (0,) * (3 - len(teile))


def puls_verwertbar(plattform: str, v: str | None) -> bool:
    """Darf diese Session in die Puls-Spalte? (s. Kategorie 3 in der Kopfzeile)"""
    n = version(v)
    if plattform == "apple":
        return n >= (1, 1, 30)          # der Fix; bis 1.1.29 schrieb die App alte Werte mit
    if plattform == "wear":
        return n < (1, 2, 21) or n >= (1, 2, 26)
    return True                          # Garmin/Amazfit: nie betroffen


def messen(samples: list) -> dict | None:
    if len(samples) < MIN_PUNKTE:
        return None
    n = len(samples)
    ohne_puls = kette = laengste = doppelt = bewegt = 0
    letzter_puls = None
    letzte_pos = None
    haccs = []
    for s in samples:
        hr = s[4] if len(s) > 4 else None
        if not hr:
            ohne_puls += 1
            kette, letzter_puls = 0, None
        else:
            kette = kette + 1 if hr == letzter_puls else 0
            laengste = max(laengste, kette)
            letzter_puls = hr
        # Stehende Ortung NUR in Bewegung zaehlen. Wer am Ufer steht, liefert voellig zu Recht
        # denselben Punkt — ohne diese Bedingung misst die Spalte die Pausen des Fahrers statt
        # das Verhalten der Uhr, und derselbe Hersteller landete zwischen 0,1 % und 41 %.
        pos = (s[1], s[2])
        tempo = s[3] if len(s) > 3 and isinstance(s[3], (int, float)) else None
        if letzte_pos is not None and tempo is not None and tempo > BEWEGT_MPS:
            bewegt += 1
            if pos == letzte_pos:
                doppelt += 1
        letzte_pos = pos
        h = s[5] if len(s) > 5 else None
        if isinstance(h, (int, float)) and h > 0:
            haccs.append(float(h))
    # Wertwechsel je Minute: die einzige Puls-Zahl, die UNSER Padding nicht verfaelscht
    # (s. Kategorie 3). Nur ueber die Punkte, die ueberhaupt einen Wert tragen.
    werte = [s[4] for s in samples if len(s) > 4 and s[4]]
    dauer_min = max(1.0, (samples[-1][0] - samples[0][0]) / 60000.0)
    wechsel = sum(1 for a, b in zip(werte, werte[1:]) if a != b) / dauer_min if werte else 0.0
    return {"punkte": n, "dauer_s": max(1.0, (samples[-1][0] - samples[0][0]) / 1000.0),
            "puls_wechsel": wechsel if werte else None,
            "puls_fehlt": ohne_puls / n, "puls_starr": laengste,
            "ortung_steht": (doppelt / bewegt) if bewegt >= 60 else None,
            "hacc": median(haccs) if haccs else None,
            "guete_gut": (sum(1 for h in haccs if h >= 4) / len(haccs)) if haccs else None}


def main() -> None:
    env_laden()
    sys.path.insert(0, os.path.join(BASIS, "server"))
    from sqlalchemy import create_engine, text
    from app import storage

    eng = create_engine(os.environ["DATABASE_URL"])
    with eng.connect() as c:
        zeilen = c.execute(text("""
            SELECT s.session_uuid, s.user_id, s.app_version, dt.platform, dt.label,
                   a.metrics_json, a.detection
            FROM sessions s
            JOIN device_tokens dt ON dt.id = s.device_id
            LEFT JOIN analysis_results a ON a.session_id = s.id
            WHERE s.deleted = false AND dt.platform IS NOT NULL
              -- s. „NUR EIGENE AUFNAHMEN" in der Kopfzeile
              AND s.session_uuid NOT LIKE 'fit-%'
              AND s.session_uuid NOT LIKE 'imp-%'
              AND s.session_uuid NOT LIKE 'suunto-%'
              AND s.session_uuid NOT LIKE 'polar-%'
              AND s.session_uuid NOT LIKE 'coros-%'
              AND s.session_uuid NOT LIKE 'strava-%'
              AND s.session_uuid NOT LIKE 'merge-%'
        """)).fetchall()
        warn = {(r[0], r[1] or "?"): (r[2], r[3]) for r in c.execute(text("""
            SELECT platform, label, sum(coalesce(storage_full_count,0)),
                   sum(coalesce(crash_count,0))
            FROM device_tokens WHERE platform IS NOT NULL GROUP BY 1,2"""))}

    # (Modell, Nutzer) -> Sessions. Erst je Nutzer zusammenfassen, dann ueber die Nutzer
    # mitteln — s. „ein Nutzer, eine Stimme" in der Kopfzeile.
    je_nutzer: dict[tuple, list] = defaultdict(list)
    print(f"{len(zeilen)} Sessions mit bekanntem Geraet — messe …", file=sys.stderr)
    for i, (uuid, uid, appv, plattform, label, metrics, detection) in enumerate(zeilen):
        if i and i % 300 == 0:
            print(f"   {i} …", file=sys.stderr)
        try:
            w = messen(storage.load_gps(uuid))
        except Exception:                       # noqa: BLE001
            continue
        if w is None:
            continue
        m = metrics if isinstance(metrics, dict) else (json.loads(metrics) if metrics else {})
        w["accel_hz"] = m.get("accel_hz_measured")
        w["gps_only"] = (detection == "gps_only")
        w["puls_zaehlt"] = puls_verwertbar(plattform, appv)
        je_nutzer[(plattform, (label or "?").strip(), uid)].append(w)

    # Stufe 1: je Nutzer und Modell einen Wert je Kennzahl.
    je_modell: dict[tuple, list] = defaultdict(list)
    for (plattform, label, uid), L in je_nutzer.items():
        def med(feld, filt=lambda w: True):
            werte = [w[feld] for w in L if filt(w) and w[feld] is not None]
            return median(werte) if werte else None
        puls = [w for w in L if w["puls_zaehlt"]]
        je_modell[(plattform, label)].append({
            "sessions": len(L),
            "stunden": sum(w["dauer_s"] for w in L) / 3600.0,
            "accel_hz": med("accel_hz"),
            "gps_only": sum(1 for w in L if w["gps_only"]) / len(L),
            "ortung_steht": med("ortung_steht"),
            "guete_gut": med("guete_gut"),
            "hacc": med("hacc"),
            "puls_sessions": len(L),
            "puls_wechsel": (median(x) if (x := [w["puls_wechsel"] for w in L
                                                 if w["puls_wechsel"] is not None]) else None),
            "puls_tot": sum(1 for w in L if (w["puls_wechsel"] or 0) < PULS_TOT_PRO_MIN) / len(L),
            "puls_fehlt": (median(w["puls_fehlt"] for w in puls) if puls else None),
            "puls_starr": (sum(1 for w in puls if w["puls_starr"] >= PULS_STARR_PUNKTE) / len(puls)
                           if puls else None),
        })

    def ueber_nutzer(N, feld):
        werte = [n[feld] for n in N if n.get(feld) is not None]
        return median(werte) if werte else None

    aus = []
    for (plattform, label), N in je_modell.items():
        L = N                                   # eine Zeile je NUTZER, nicht je Session
        if sum(n["sessions"] for n in N) < MIN_SESSIONS:
            continue
        voll, crash = warn.get((plattform, label), (0, 0))
        g = ueber_nutzer(N, "guete_gut")
        h = ueber_nutzer(N, "hacc")
        pf = ueber_nutzer(N, "puls_fehlt")
        pw = ueber_nutzer(N, "puls_wechsel")
        pt = ueber_nutzer(N, "puls_tot")
        ps = ueber_nutzer(N, "puls_starr")
        o = ueber_nutzer(N, "ortung_steht")
        hz = ueber_nutzer(N, "accel_hz")
        aus.append({
            "plattform": plattform, "modell": label,
            "sessions": sum(n["sessions"] for n in N), "nutzer": len(N),
            "stunden": round(sum(n["stunden"] for n in N), 1),
            "accel_hz": round(hz, 1) if hz else None,
            "gps_only": round((ueber_nutzer(N, "gps_only") or 0) * 100, 1),
            "ortung_steht": round(o * 100, 1) if o is not None else None,
            "guete_gut": round(g * 100, 1) if plattform == "garmin" and g is not None else None,
            "hacc_m": round(h, 1) if plattform != "garmin" and h is not None else None,
            "puls_sessions": sum(n["puls_sessions"] for n in N),
            "puls_fehlt": round(pf * 100, 1) if pf is not None else None,
            "puls_wechsel": round(pw, 1) if pw is not None else None,
            "puls_tot": round(pt * 100, 1) if pt is not None else None,
            "puls_starr": round(ps * 100, 1) if ps is not None else None,
            "speicher_voll": voll, "abstuerze": crash,
        })

    # Urteil: die Pump-Erkennung entscheidet — dafuer ist die App da.
    for r in aus:
        if r["accel_hz"] is None or r["gps_only"] >= 50:
            r["urteil"] = "nur GPS"
        elif r["accel_hz"] < ACCEL_MIN_HZ:
            r["urteil"] = "nur GPS"
        elif r["gps_only"] >= 10 or (r["ortung_steht"] or 0) >= 10:
            r["urteil"] = "mit Abstrichen"
        else:
            r["urteil"] = "empfohlen"
    rang = {"empfohlen": 0, "mit Abstrichen": 1, "nur GPS": 2}
    aus.sort(key=lambda r: (rang[r["urteil"]], -r["sessions"]))

    if "--json" in sys.argv:
        ziel = sys.argv[sys.argv.index("--json") + 1]
        # Stand und Datenbasis MIT hineinschreiben: die Seite zeigt beides an, damit man weiss,
        # worauf die Aussage beruht und wie alt sie ist (Jan, 05.09.2026). Der Snapshot wird
        # alle paar Wochen neu erzeugt — ohne Datum waere nicht erkennbar, ob das noch gilt.
        import datetime
        paket = {
            "stand": datetime.date.today().isoformat(),
            "sessions": sum(r["sessions"] for r in aus),
            "nutzer": sum(r["nutzer"] for r in aus),
            "stunden": round(sum(r["stunden"] for r in aus)),
            "modelle": aus,
        }
        open(ziel, "w").write(json.dumps(paket, ensure_ascii=False, indent=1))
        print(f"geschrieben: {ziel} — Stand {paket['stand']}, "
              f"{paket['sessions']} Sessions, {paket['stunden']} Stunden")
        return

    kopf = (f"{'Urteil':15s} {'Modell':34s} {'Sess':>5s} {'Nutz':>4s} {'Accel':>8s} "
            f"{'gps-only':>9s} {'Ortung steht':>13s} {'Guete/hacc':>11s} {'Puls fehlt':>11s} "
            f"{'Puls starr':>11s}")
    print(kopf); print("-" * len(kopf))
    for r in aus:
        g = (f"{r['guete_gut']:.0f}% GOOD" if r["guete_gut"] is not None
             else (f"{r['hacc_m']:.1f} m" if r["hacc_m"] is not None else "–"))
        pf = f"{r['puls_wechsel']:.1f}" if r["puls_wechsel"] is not None else "–"
        ps = f"{r['puls_tot']:.1f}%" if r["puls_tot"] is not None else "–"
        print(f"{r['urteil']:15s} {r['modell'][:34]:34s} {r['sessions']:5d} {r['nutzer']:4d} "
              f"{(str(r['accel_hz']) + ' Hz' if r['accel_hz'] else '–'):>8s} {r['gps_only']:8.1f}% "
              f"{(f'{r["ortung_steht"]:.1f}%' if r["ortung_steht"] is not None else '–'):>13s} "
              f"{g:>11s} {pf:>9s} {ps:>9s}")


if __name__ == "__main__":
    main()
