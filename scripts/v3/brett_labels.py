#!/usr/bin/env python3
"""Brett-Labels pump / gleiten / aus je Brett-Aufnahme + Messung der Uhr daran. REIN LESEND (DB).

Entstanden 10.10.2026 mit Jan (Gleitphasen am Laufende). Definition, je 1/25 s:
  pump     Hub-Zyklus (Gipfel->Gipfel im Hub 0,5-3 Hz), der ENERGIE hineinbringt: Kopplung
           mean(schnelles Nicken x Hubgeschwindigkeit) > 0,3 des Medians der Zyklen desselben
           Laufs. Das trennt echte Pumps (auch kleine „bis zum Steg") von Nachschwingen und
           Ausgleichsbewegungen (Jan: „bringt keine Energie ins System -> kein Pump, sondern gleiten").
           Gemessen an Jans Laeufen: Fahrt-Zyklen 93 % mit Energie, schwache Endzyklen 17 %, Treiben 0 %.
  gleiten  auf dem Foil ohne Energie: vom Laufstart bis zum Aufsetzen, ausser pump.
  aus      sonst. Aufsetzen = erster ECHTER GPS-Punkt (Vorgaenger <= 1,5 s) ab Laufende-15 s unter
           max(8 km/h, 0,6 x Fahrt-Tempo), minus 0,7 s Doppler-Nachlauf; ohne GPS das erkannte Ende.
Grenzen: Naeherung, keine Leistungsmessung; relativ zum eigenen Pumpen im selben Lauf; Montage
muss fest sein (Lage nur IN den Laeufen pruefen, s. paare_ausrichten.py BRETT_OHNE_UHR).

Paare und Versatz aus server/data/ml/v3/paare.json (paare_ausrichten.py). Ausgabe:
  server/data/ml/v3/brett_labels.json    {brett_id: {t_ms, label (0/1/2), fahrer}}
  server/data/ml/v3/uhr_gegen_brett.json je Paar: Pump-Treffer der Uhr, Gleit-/Pump-Sekunden im Uhren-Lauf

Aufruf (aus server/): DATABASE_URL=... .venv/bin/python ../scripts/v3/brett_labels.py
"""
import os, sys, json, pickle, pathlib
os.environ.setdefault("OMP_NUM_THREADS", "1")
import numpy as np
from scipy.signal import find_peaks
W = pathlib.Path("/home/jan/garmin-connect-iq")
sys.path.insert(0, str(W / "server")); sys.path.insert(0, str(W / "scripts/v3"))
from app.db import SessionLocal
from app import models, storage
from app.api.sessions import _lage_antwort
import gleiten_pruefen as GP
HZ = 25.0; OUT = W / "server" / "data" / "ml" / "v3"
def bp(x, lo, hi):
    X = np.fft.rfft(x - np.mean(x)); f = np.fft.rfftfreq(x.size, 1 / HZ); X[(f < lo) | (f > hi)] = 0
    return np.fft.irfft(X, n=x.size)
db = SessionLocal()
paare = json.load(open(W / "server/data/ml/v3/paare.json"))
ergebnis = []; labels = {}; gier_stat = {"pump": [], "passiv_mitte": []}
cache = {}
for p in paare:
    bid, uid, vers = p["brett"], p["uhr"], p["versatz_ms"]
    s = db.get(models.Session, bid)
    if bid not in cache:
        dauer = (s.ended_at - s.started_at).total_seconds() * 1000
        r = _lage_antwort(db, s, from_ms=0, to_ms=int(dauer), pad_s=0.0, hz=HZ)
        if not r.get("ok") or not r.get("hub_cm"):
            print(bid, "keine Lage/Hub"); cache[bid] = None; continue
        t = np.asarray(r["t_ms"], float); hub = np.nan_to_num(np.asarray(r["hub_cm"], float))
        pitch = np.nan_to_num(np.asarray(r["pitch_deg"], float)); gier = np.nan_to_num(np.asarray(r["gier_delta_deg"], float))
        g = np.asarray(storage.load_gps(s.session_uuid), float)
        laeufe = [(x["t_start_session_ms"], x["t_end_session_ms"]) for x in json.loads(s.result.segments_json or "[]")]
        hb = bp(hub, 0.5, 3.0); pf = bp(pitch, 0.5, 3.0); vz = np.gradient(hb) * HZ
        gr = np.abs(np.gradient(bp(gier, 0, 1.0)) * HZ)                        # Gier-Rate Grad/s
        pk, _ = find_peaks(hb, prominence=0.5, distance=int(0.35 * HZ))
        lab = np.zeros(t.size, dtype=np.int8)                                  # 0 aus, 1 gleiten, 2 pump
        zyklen = []
        gt, gv = g[:, 0], np.nan_to_num(g[:, 3]) * 3.6
        for a, b in laeufe:
            # Aufsetzen wie in messen2: erster echter GPS-Punkt unter max(8, 0,6*Fahrt) ab b-15 s
            m = (gt >= a + 3000) & (gt <= b - 5000); td = b
            if m.sum() >= 5:
                grenze = max(8.0, 0.6 * np.median(gv[m]))
                for i in np.where((gt >= b - 15000) & (gt <= b + 10000))[0]:
                    if gv[i] < grenze and i > 0 and gt[i] - gt[i - 1] <= 1500:
                        td = gt[i] - 700; break
            ia, itd = np.searchsorted(t, a), np.searchsorted(t, td)
            lab[ia:itd] = 1
            zs = [(pk[i], pk[i + 1], np.mean(pf[pk[i]:pk[i + 1]] * vz[pk[i]:pk[i + 1]])) for i in range(len(pk) - 1)
                  if a <= t[pk[i]] and t[pk[i + 1]] <= td and t[pk[i + 1]] - t[pk[i]] <= 1600]
            if len(zs) < 5: continue
            wref = np.median([w for _, _, w in zs]); sg = np.sign(wref) or 1
            for p0, p1, w in zs:
                rel = sg * w / abs(wref)
                if rel > 0.3:
                    lab[p0:p1] = 2; zyklen.append((p0, p1))
                    if s.user_id == 2: gier_stat["pump"].append(np.mean(gr[p0:p1]))
                elif s.user_id == 2 and a + 3000 < t[p0] < td - 8000:
                    gier_stat["passiv_mitte"].append(np.mean(gr[p0:p1]))
        cache[bid] = (t, lab, s.user_id, zyklen)
    if cache.get(bid) is None: continue
    t, lab, fahrer, zyklen = cache[bid]
    labels[bid] = {"t_ms": t.astype(int).tolist(), "label": lab.tolist(), "fahrer": int(fahrer)}
    # Uhr messen
    try:
        ul = GP.uhr_pumps(db, uid)
    except Exception as e:
        print(bid, uid, "Uhr nicht lesbar:", e); continue
    upumps = np.concatenate([q for _, _, q in ul]) + vers if ul else np.zeros(0)
    uruns = [(x + vers, y + vers) for x, y, _ in ul]
    inrun = np.zeros(t.size, bool)
    for x, y in uruns: inrun[(t >= x) & (t <= y)] = True
    dt = 1 / HZ
    bloecke = zyklen
    treffer = sum(1 for (i0, i1) in bloecke if np.any((upumps >= t[i0]) & (upumps < t[i1])))
    foil = lab > 0
    falsch = int(np.sum([(not foil[min(np.searchsorted(t, u), t.size - 1)]) for u in upumps]))
    ergebnis.append(dict(brett=bid, uhr=uid, fahrer=int(fahrer), uhr_modell=(p["uhr_modell"] or "Garmin")[:14],
        pumps_brett=len(bloecke), pumps_uhr_im_foil=int(len(upumps) - falsch), treffer=treffer, uhr_pumps_ausserhalb=falsch,
        pump_s=float(np.sum(lab == 2) * dt), gleit_s=float(np.sum(lab == 1) * dt),
        gleit_in_uhrlauf=float(np.mean(inrun[lab == 1])) if np.any(lab == 1) else np.nan,
        pump_in_uhrlauf=float(np.mean(inrun[lab == 2])) if np.any(lab == 2) else np.nan,
        aus_in_uhrlauf_s=float(np.sum(inrun & (lab == 0)) * dt)))
json.dump(labels, open(OUT / "brett_labels.json", "w"))
json.dump(ergebnis, open(OUT / "uhr_gegen_brett.json", "w"))
print(f"{'Paar':13} {'F':>4} {'Uhr':14} {'Pumps Brett':>11} {'Uhr trifft':>10} {'Uhr-Pumps':>9} {'Pump s':>6} {'Gleit s':>7} {'Gleit in Uhr-Lauf':>17} {'Pump in Uhr-Lauf':>16} {'aus, aber Uhr-Lauf':>18}")
for e in ergebnis:
    print(f"{e['brett']}/{e['uhr']:<6} u{e['fahrer']:<3} {e['uhr_modell']:14} {e['pumps_brett']:11} {e['treffer']/max(e['pumps_brett'],1):10.0%} {e['pumps_uhr_im_foil']:9} {e['pump_s']:6.0f} {e['gleit_s']:7.0f} {e['gleit_in_uhrlauf']:17.0%} {e['pump_in_uhrlauf']:16.0%} {e['aus_in_uhrlauf_s']:16.0f} s")
for k, v in gier_stat.items():
    if v: print(f"Gier-Rate (Jan) {k}: median {np.median(v):.1f} Grad/s (n={len(v)})")
