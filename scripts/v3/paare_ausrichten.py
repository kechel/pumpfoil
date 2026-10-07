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

Aufruf (aus server/): DATABASE_URL=... .venv/bin/python ../scripts/v3/paare_ausrichten.py
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

# (Brett-Handy, Uhr) — derselbe Fahrer. Aus der Paar-Suche (Inventar 29.09.) und GROUND-TRUTH §12c/d.
PAARE = [(9528, 9529), (9535, 9534), (9650, 9648), (9650, 9649), (10195, 10194),
         (10248, 10250), (10328, 10326), (10874, 10873), (10875, 10873),
         # nachgetragen 03.10.2026 (Jan: „fuer ein zukuenftiges v4-Modell"): 30.09. u2 (Pixel + Uhr),
         # 30.09. u574 (Samsung am Brett + Wear OS), 02.10. u2 Illmensee (Pixel UND iPhone am Brett +
         # fenix 7X Pro). Zu 02.10.: zwei echte kurze Startversuche 16:44:12 / 16:44:31 Ortszeit,
         # nur von der Uhr gefunden — Labels fuer ein Brett-Modell, s. docs/TODO.md.
         (10968, 10969), (10993, 10979), (12610, 12608), (12611, 12608),
         # nachgetragen 06.10.2026: 03.10. u2 Illmensee (iPhone + fenix), 03./04.10. u574 Steinberger See
         (12687, 12722), (12738, 12737), (13055, 13051),
         # nachgetragen 07.10.2026: u244 (Samsung am Brett + Garmin), mit bewusst gefahrenen Gleitphasen
         # mitten in und am Ende von Laeufen (Fahrer-Meldung im Chat) — Kandidat fuer Gleit-Labels.
         (13908, 13909)]


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
    from app import db
    S = db.SessionLocal()
    out = []
    try:
        for b_id, u_id in PAARE:
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
    (ML / "v3").mkdir(parents=True, exist_ok=True)
    (ML / "v3" / "paare.json").write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
