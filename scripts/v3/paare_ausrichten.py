#!/usr/bin/env python3
"""Erkennung v3, Schritt 2: Uhr und Brett-Handy auf Zehntel ausrichten. REIN LESEND.

Verfahren wie docs/GROUND-TRUTH.md §12a/§12d:
  1. grob aus den Startzeiten der beiden Aufnahmen,
  2. mittel aus den Laeufen (Partner mit Start UND Ende innerhalb ±10 s, Median der Startversaetze),
  3. fein je Lauf per Kreuzkorrelation der Pumpbewegung (Betrag der Beschleunigung, Pump-Band
     0,8-2,5 Hz) in ±1 s um den mittleren Versatz — ENG, weil der Pumptakt (~0,7 s) mehrdeutig
     ist (§12d: Nebenmaximum 3,5 Pumps daneben) —, dann Median ueber die Laeufe.
Ergebnis je Paar nach server/data/ml/v3/paare.json: Versatz (Uhr-Session-ms -> Brett-Session-ms),
Streuung ueber die Laeufe, r je Lauf. Nur DERSELBE Fahrer (Brett-Handy + eigene Uhr).

PAARE FINDEN SICH SELBST (seit 10.10.2026, `paare_finden`): Brett-Session (placement board + Kreisel +
Analyse) und jede zeitlich ueberlappende Session DESSELBEN Fahrers, die nicht selbst am Brett lag und
Beschleunigungsdaten hat. Vorher stand hier eine Liste von Hand, und neue Parallelfahrten fehlten,
bis jemand daran dachte (Jan, 03.10.: „ist die zu den Trainingsdaten ergaenzt?" — war sie nicht).
Gegen die Handliste geprueft: findet alle 18 Paare, dazu nur #9484/#9485 (s. AUSGESCHLOSSEN).
Die Wanduhr-Ueberlappung ist bewusst nur ein Grob-Filter (#13055/#13051 ueberlappen laut
Start/Ende nur 2 % und richten sich trotzdem sauber aus); ueber die Qualitaet entscheidet die
Ausrichtung — die Auswertungen nehmen nur Paare mit Streuung <= 400 ms.

Aufruf (aus server/): DATABASE_URL=... .venv/bin/python ../scripts/v3/paare_ausrichten.py [--liste]
  --liste   nur die gefundenen Paare und Brett-Sessions ohne Uhr zeigen, nichts ausrichten/schreiben
"""
import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
import json
import pathlib
import sys

import numpy as np

WURZEL = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(WURZEL / "server"))
ML = WURZEL / "server" / "data" / "ml"
HZ = 25.0

# Brett-Sessions, die NIE ein Paar sind, mit Grund. Alles andere findet `paare_finden`.
AUSGESCHLOSSEN = {
    9484: "Dropstart-Experiment, keine normale Fahrt (Uhr #9485)",
    9656: "u5, Handy zwischen den Laeufen absichtlich gedreht (Montage nicht fest)",
}
# Vermerke zu einzelnen Sessions (frueher an der Handliste, gelesen wird davon nichts):
#   #14073 u574 09.10.: Brett-Handy war als „phone" markiert, lag laut Lage flach und fest am Brett
#     -> auf „board" korrigiert. Die Wear-OS-Uhr #14072 lieferte nur 7,7 Hz Beschleunigung.
#   #13908 u244 07.10.: bewusst gefahrene Gleitphasen mitten in und am Ende von Laeufen (Fahrer-Meldung).
#   #10968 u2 02.10.: zwei echte kurze Startversuche 16:44:12 / 16:44:31 Ortszeit, nur von der Uhr gefunden.
#   #15004 u683 12.10.2026: iPhone am Brett + Apple Watch Series 10 (#15003), erstes Paar mit Apple Watch.
#     Handy QUER und um ~17° geneigt montiert -> die alte Brett-Frage (Achse <= 15°) fragte nicht; der
#     Fahrer bestaetigte im Chat „phone on the board", auf Jans OK als board markiert. Ausrichtung
#     Streuung 0 ms, r 0,51-0,82 je Lauf. Beleg, dass die Neigungs-Pruefung zu eng ist (TODO Brett-Frage).
#   #14062 u808 (Brett ohne Uhr): Montage nicht bestaetigt (Nachfrage per DM 10.10. offen); in den Laeufen
#     wie ein festes Brett (75 % Nicken, kein Klappern). Meldet u808 etwas Loses -> in AUSGESCHLOSSEN.

# Handy BESTAETIGT am Koerper (Hosentasche o. ae.), NICHT am Brett — Gegenbeispiele fuer die
# automatische Brett-Erkennung (docs/TODO.md, „Am Brett automatisch erkennen"). `placement` kennt nur
# board/phone, und „phone" ist zugleich der Standard: eine unangeschaute Session sieht aus wie eine
# bewusste Taschen-Aufnahme. Darum zaehlen als Taschen-Wahrheit NUR die hier eingetragenen, jeweils
# mit Beleg. {Handy-Session: Vermerk}
TASCHE = {
    16736: "u5 14.10.2026, Handy in der Hosentasche (Jans Meldung), 6 Laeufe, Kreisel, 51 Hz; dazu "
           "Uhr #16735 (FR55, 1.0.92, record_mode lite -> 0 Accel-Chunks, nur GPS)",
}

# Handy AM BRETT bei einer ANDEREN Sportart als Pumpfoil — Wahrheit fuer Sportart-/Antriebs-Erkennung,
# NICHT fuer Pump-Zaehlung/Gleiten (dort wuerde der Antrieb als Pumpen gelernt). Gelesen wird davon
# noch nichts; `paare_finden` fasst sie nur nicht an, solange `placement` nicht „board" ist.
# {Handy-Session: Vermerk}
ANDERE_SPORTART = {
    16729: "u267 14.10.2026, foil_scoot, Jans Meldung „phone on board“; Handy als „phone“ markiert, "
           "laut Lage in den Laeufen flach (Schwerkraft ~z, 6 von 8 Laeufen), Kreisel + Magnetfeld, "
           "53,5 Hz, 1 h 47 min, 8 Laeufe (bis 21 min lang); dazu Garmin #16719 (1.0.93, 24,9 Hz, 8 Laeufe). "
           "Lauf ab 3774 s: Accel 14 s eingefroren (std 0). Fehlstart-Session #16709 (7 s) ignorieren.",
}

def paare_finden(db) -> tuple[list[tuple[int, int]], list[int]]:
    """(Paare (Brett, Uhr), Brett-Sessions ohne Uhr) aus der Datenbank. Liest nur."""
    from datetime import timedelta
    from app import models, storage
    S = models.Session

    def spanne(s):
        ende = s.ended_at or (s.started_at + timedelta(milliseconds=storage.gps_last_ms(s.session_uuid) or 0))
        return s.started_at, ende

    paare, ohne = [], []
    bretter = (db.query(S).filter(S.placement == "board", S.deleted.isnot(True), S.merged_into.is_(None))
               .order_by(S.id).all())
    for b in bretter:
        if b.id in AUSGESCHLOSSEN or b.result is None or not storage.chunk_laengen(b.session_uuid, "gyro"):
            continue
        ba, be = spanne(b)
        kand = (db.query(S).filter(S.user_id == b.user_id, S.id != b.id, S.deleted.isnot(True),
                                   S.merged_into.is_(None), S.started_at < be,
                                   S.started_at > ba - timedelta(hours=12))
                .order_by(S.id).all())
        treffer = [u.id for u in kand
                   if (u.placement or "") != "board" and u.result is not None
                   and spanne(u)[1] > ba and storage.chunk_laengen(u.session_uuid, "accel")]
        paare += [(b.id, u) for u in treffer]
        if not treffer:
            ohne.append(b.id)
    return paare, ohne


def bandpass(x, lo=0.8, hi=2.5):
    X = np.fft.rfft(x - x.mean())
    f = np.fft.rfftfreq(x.size, 1 / HZ)
    X[(f < lo) | (f > hi)] = 0
    return np.fft.irfft(X, n=x.size)


def laden(db, sid):
    from app import models
    from app.analysis.timebase import build_timebase_for_session
    from app.analysis.v3 import merkmale as M
    s = db.get(models.Session, sid)
    d = {"id": sid, "user": s.user_id, "start": s.started_at.timestamp() * 1000,
         "model": s.device_model, "placement": s.placement,
         "laeufe": [(x["t_start_session_ms"], x["t_end_session_ms"])
                    for x in json.loads(s.result.segments_json or "[]")] if s.result else []}
    tb = build_timebase_for_session(M.ganze_aufnahme({"uuid": s.session_uuid, "accel_hz": s.accel_hz,
                                                      "accel_scale": s.accel_scale}))
    r = M.raster(tb)
    d["t0"] = float(tb.window_start_ms)
    d["mag"] = np.linalg.norm(r / (tb.accel_scale or 2048), axis=1) if r.shape[0] else np.zeros(0)
    return d


def ausschnitt(d, a_ms, b_ms):
    i0 = int((a_ms - d["t0"]) / 1000 * HZ); i1 = int((b_ms - d["t0"]) / 1000 * HZ)
    i0 = max(i0, 0); i1 = min(i1, d["mag"].size)
    return d["mag"][i0:i1] if i1 - i0 > 2 * HZ else None


def ausrichten(B, U):
    grob = U["start"] - B["start"]                     # Uhr-ms + grob = Brett-ms (Wanduhr)
    # mittel: Lauf-Partner
    d = []
    for a, b in B["laeufe"]:
        for c, e in U["laeufe"]:
            ca, ce = c + grob, e + grob
            if abs(ca - a) <= 10000 and abs(ce - b) <= 10000:
                d.append(a - ca)
    mittel = grob + (float(np.median(d)) if d else 0.0)
    # fein: je Brett-Lauf MIT 8 s Rand (Anfahrt und Sturz sind einmalig, der Pumptakt nicht) und
    # OHNE Bandpass (sonst verschwinden genau diese Stoesse), Suche ±3 s um den mittleren Versatz.
    # Zusaetzlich alle Laeufe GEMEINSAM: die Summe der Korrelationen je Versatz — ein falscher
    # Gipfel in einem Lauf setzt sich so nicht durch.
    RAND_MS, SUCHE = 8000, int(3.0 * HZ)
    fein, rs, summe = [], [], None
    lags = np.arange(-SUCHE, SUCHE + 1)
    for a, b in B["laeufe"]:
        xb = ausschnitt(B, a - RAND_MS, b + RAND_MS)
        xu = ausschnitt(U, a - RAND_MS - mittel - 3500, b + RAND_MS - mittel + 3500)
        if xb is None or xu is None:
            continue
        xb = xb - np.convolve(xb, np.ones(int(3 * HZ)) / (3 * HZ), mode="same")
        xu = xu - np.convolve(xu, np.ones(int(3 * HZ)) / (3 * HZ), mode="same")
        rand = int(3.5 * HZ)
        kurve = np.full(lags.size, np.nan)
        for k, lag in enumerate(lags):
            s0 = rand + lag
            if 0 <= s0 and s0 + xb.size <= xu.size:
                kurve[k] = np.corrcoef(xb, xu[s0:s0 + xb.size])[0, 1]
        if np.all(np.isnan(kurve)):
            continue
        k = int(np.nanargmax(kurve))
        fein.append(lags[k] / HZ * 1000); rs.append(float(kurve[k]))
        summe = np.nan_to_num(kurve) if summe is None else summe + np.nan_to_num(kurve)
    gemeinsam = float(lags[int(np.argmax(summe))] / HZ * 1000) if summe is not None else None
    if not fein:
        return {"grob_ms": grob, "mittel_ms": mittel, "versatz_ms": None, "laeufe_partner": len(d)}
    # lag > 0: die Uhr ist spaeter dran -> Uhr-Zeit = Brett-Zeit - mittel + lag
    versatz = mittel - gemeinsam
    return {"grob_ms": round(grob), "mittel_ms": round(mittel), "versatz_ms": round(versatz),
            "gemeinsam_ms": round(gemeinsam),
            "fein_je_lauf_ms": [round(x) for x in fein], "r_je_lauf": [round(x, 2) for x in rs],
            "streuung_ms": round(float(np.std(fein))), "laeufe_partner": len(d)}


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--liste", action="store_true")
    args = ap.parse_args()
    from app import db
    S = db.SessionLocal()
    out = []
    try:
        paare, ohne = paare_finden(S)
        print(f"{len(paare)} Paare: {paare}", flush=True)
        print(f"Brett ohne Uhr: {ohne} · ausgeschlossen: {sorted(AUSGESCHLOSSEN)}", flush=True)
        if args.liste:
            return
        for b_id, u_id in paare:
            B, U = laden(S, b_id), laden(S, u_id)
            erg = ausrichten(B, U)
            erg.update({"brett": b_id, "uhr": u_id, "fahrer_brett": B["user"], "fahrer_uhr": U["user"],
                        "brett_modell": B["model"], "uhr_modell": U["model"],
                        "brett_laeufe": len(B["laeufe"]), "uhr_laeufe": len(U["laeufe"])})
            out.append(erg)
            f = erg.get("fein_je_lauf_ms")
            print(f"#{b_id} (u{B['user']}, {B['placement']}) + #{u_id} (u{U['user']}, {U['model'] or 'Garmin'}): "
                  f"Laeufe {len(B['laeufe'])}/{len(U['laeufe'])}, Partner {erg['laeufe_partner']} · "
                  f"mittel {erg['mittel_ms'] - erg['grob_ms']:+.0f} ms · fein je Lauf {f} r {erg.get('r_je_lauf')} "
                  f"-> gemeinsam {erg.get('gemeinsam_ms')} ms, Streuung {erg.get('streuung_ms')} ms", flush=True)
    finally:
        S.rollback(); S.close()
    if args.liste:
        return
    (ML / "v3").mkdir(parents=True, exist_ok=True)
    (ML / "v3" / "paare.json").write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
