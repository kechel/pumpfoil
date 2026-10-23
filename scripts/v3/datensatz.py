#!/usr/bin/env python3
"""Erkennung v3, Stufe A: Datensatz je GPS-Sekunde bauen. REIN LESEND gegen DB und Rohdaten.

Schreibt je Session server/data/ml/v3/ds/<id>.npz (t, X, y, quelle) und eine Uebersicht.
Label y: 1 = auf dem Foil, 0 = nicht, -1 = unsicher (geht nicht ins Training).

Woher die Labels kommen (Vertrauen absteigend) — Regeln und Begruendung in docs/DETECTION-V3.md:
  mensch   von Nutzern aussortierte Bereiche -> 0
  sicht    Sichtpruefung der Laeufe an Land (land_urteil_sicht.json): land -> 0, wasser -> 1
  fremd    foil_status einer anderen App (100 Sessions, 16 Fahrer) -> 0/1
  lauf     heutiger Lauf, nahe JRC-Wasser, <= 40 km/h -> 1
  land     klar an Land (kein JRC-Wasser in ±60 m), in Bewegung, KEIN heutiger Lauf -> 0
  ruhe     Stillstand < 1 m/s -> 0 (verduennt), auf Wasser < 2 m/s ausserhalb eines Laufs -> 0
  fortsetzung  langsames Weiterpumpen vor/nach einem Lauf (fortsetzung_labels.py; Guillaume u350,
           „Laeufe zu kurz") -> 1, nur nahe Wasser. Eigene Quelle, damit sie sich getrennt messen
           und im Training an- und abschalten laesst.
Alles andere ist unsicher: auf Wasser in Fahrt ohne Lauf (vielleicht ein verpasster Lauf).

Aufruf (aus server/): DATABASE_URL=... .venv/bin/python ../scripts/v3/datensatz.py [--jobs 20]

Neubau r7 (23.10.2026) — alle Standardwerte wie bisher, neu nur ueber Schalter:
  --baseline/--labels/--punkte/--wasser  eigene Eingaben (data/ml/v3/r7/...)
  --ds DIR        Ausgabe-Verzeichnis (statt data/ml/v3/ds)
  --ohne-ds DIR   Sessions, die in DIR schon liegen, ueberspringen (alter Datensatz vom 29.09.)
  --lauf-v2       „lauf"/„land"/„ruhe" an FRISCH gerechneten v2-Laeufen (ganze Aufnahme, Empfindlichkeit
                  des Besitzers) statt an den gespeicherten: seit 30.09. sind die gespeicherten Laeufe
                  v3-r4 — daran zu lernen hiesse, r4 nachzulernen. Der alte Datensatz stand auf v2.
  --negativ-sessionen  die geloeschten Negativbeispiele aus data/ml/v3/negativ_sessions/ (LIESMICH dort)
                  als y=0 (Quelle „mensch") nach <ds>/negs-<id>.npz
"""
import os
# EIN Rechen-Thread je Prozess: sonst vervielfacht sich die interne Parallelitaet von
# numpy/sklearn mit der Prozesszahl (29.09.2026: Last 264 auf 26 Kernen, VM mit anderen Diensten).
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
import argparse
import gzip
import json
import os
import pathlib
import sys
from multiprocessing import Pool

import numpy as np

WURZEL = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(WURZEL / "server"))
ML = WURZEL / "server" / "data" / "ml"
DS = ML / "v3" / "ds"

QUELLEN = ["mensch", "sicht", "fremd", "lauf", "land", "ruhe", "fortsetzung"]


CFG = {"baseline": "", "labels": "", "punkte": "", "wasser": "", "ds": "", "lauf_v2": False}


def _laden():
    b = json.load(gzip.open(CFG["baseline"] or sorted(ML.glob("baseline-*.json.gz"))[-1]))
    L = json.load(gzip.open(CFG["labels"] or sorted(ML.glob("labels-*.json.gz"))[-1]))
    sicht = json.loads((ML / "land_urteil_sicht.json").read_text())
    an_land = {}
    for x in json.loads((ML / "laeufe_an_land.json").read_text()):
        an_land.setdefault(x[0], []).append((x[3], x[4]))
    ausg = {x["session"]: x["bereiche"] for x in L["nutzer_aussortiert"]}
    p = np.load(CFG["punkte"] or ML / "punkte.npz")
    w = np.load(CFG["wasser"] or ML / "wasser.npz")
    fp = ML / "v3" / "labels_fortsetzung.json"
    fort = {int(k): v["bereiche_ms"] for k, v in json.loads(fp.read_text())["sessions"].items()} if fp.exists() else {}
    return b, sicht, an_land, ausg, p, w, fort


G = {}


def _init(cfg=None):
    if cfg:
        CFG.update(cfg)
        global DS
        if CFG["ds"]:
            DS = pathlib.Path(CFG["ds"])
    G["b"], G["sicht"], G["an_land"], G["ausg"], p, w, G["fort"] = _laden()
    ses = p["session"]
    u, idx = np.unique(ses, return_index=True)
    ende = list(idx[1:]) + [ses.size]
    G["punkte"] = {int(s): (a, e) for s, a, e in zip(u, idx, ende)}
    G["pt"], G["occ"], G["occmax"] = p["t_ms"], w["occ"], w["occ_max"]


def eine(s):
    from app.analysis.timebase import build_timebase_for_session
    from app.analysis.v3 import merkmale as M
    sid = s["id"]
    if sid not in G["punkte"]:
        return None
    try:
        tb = build_timebase_for_session(M.ganze_aufnahme(s))
        t, X = M.merkmale(tb)
    except Exception as e:
        return (sid, "fehler", str(e)[:120])
    if t.size == 0:
        return None
    # Wasser je Sekunde: die exportierten Punkte sind dieselben GPS-Samples (gleiche Zeiten)
    a, e = G["punkte"][sid]
    pt, occ, occmax = G["pt"][a:e], G["occ"][a:e], G["occmax"][a:e]
    j = np.clip(np.searchsorted(pt, t), 0, pt.size - 1)
    passt = np.abs(pt[j] - t) <= 500
    occ_t = np.where(passt, occ[j], -1)
    occmax_t = np.where(passt, occmax[j], -1)
    v = X[:, 0]
    y = np.full(t.size, -1, dtype=np.int8)
    q = np.full(t.size, -1, dtype=np.int8)
    def setze(m, wert, quelle, nur_frei=True):
        m = m & ((y == -1) if nur_frei else np.ones_like(m))
        y[m] = wert
        q[m] = QUELLEN.index(quelle)
    im_lauf = np.zeros(t.size, bool)
    runs = s["runs"]
    if CFG["lauf_v2"]:
        from app.analysis import detect_v2
        from app.analysis.gps import SENSITIVITY_PRESETS
        sens = s.get("sensitivity") or "normal"
        kw = dict(SENSITIVITY_PRESETS.get(sens) or {}) if sens != "normal" else {}
        try:
            res = detect_v2.analyze_session_v2(M.ganze_aufnahme(s), rebase=False,
                                               judge_fremdkraft=(s.get("sport_class") or "pumpfoil") == "pumpfoil", **kw)
            runs = [{"t0": x.get("t_start_session_ms", x["t_start_ms"]), "t1": x.get("t_end_session_ms", x["t_end_ms"])}
                    for x in res["segments"]]
        except Exception as e:
            return (sid, "fehler", "v2: " + str(e)[:120])
    for r in runs:
        im_lauf |= (t >= r["t0"]) & (t <= r["t1"])
    sicht = G["sicht"]
    # 1) Mensch: aussortiert
    for b0, b1 in G["ausg"].get(sid, []):
        setze((t >= b0) & (t <= b1), 0, "mensch", nur_frei=False)
    # 2) Sicht: die roten Laeufe dieser Session
    for b0, b1 in G["an_land"].get(sid, []):
        m = (t >= b0) & (t <= b1)
        if sid in sicht["land"]:
            setze(m, 0, "sicht")
        elif sid in sicht["wasser"]:
            setze(m, 1, "sicht")
        # unklar: bleibt -1
    # 2b) langsames Weiterpumpen am Lauf (nur nahe Wasser — an Land waere es Gehen)
    for b0, b1, _seite in G["fort"].get(sid, []):
        setze((t >= b0) & (t <= b1) & (occmax_t > 0), 1, "fortsetzung")
    # 3) foil_status der anderen App
    fs = WURZEL / "server" / "data" / s["uuid"] / "foil_status.json"
    if fs.exists():
        f = np.asarray(json.loads(fs.read_text()), dtype=float)
        if f.size == len(tb.gps):
            setze(f >= 0.5, 1, "fremd")
            setze(f < 0.5, 0, "fremd")
    # 4) Lauf nahe Wasser
    nah_wasser = (occmax_t > 0) | (sid in sicht["wasser"])
    setze(im_lauf & nah_wasser & (v <= 11.1), 1, "lauf")
    # 5) klar an Land, bewegt, kein Lauf (nicht in Sessions auf schmalem Wasser)
    if sid not in sicht["wasser"] and sid not in sicht["unklar"]:
        setze((occmax_t == 0) & (v > 1.5) & ~im_lauf, 0, "land")
    # 6) Ruhe
    rng = np.random.default_rng(sid)
    setze((v < 1.0) & ~im_lauf & (rng.random(t.size) < 0.15), 0, "ruhe")
    setze((occ_t >= 50) & (v < 2.0) & ~im_lauf, 0, "ruhe")
    DS.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(DS / f"{sid}.npz", t=t, X=X.astype(np.float32), y=y, q=q,
                        im_lauf=im_lauf, occ=occ_t.astype(np.int16))
    return (sid, "ok", int((y == 1).sum()), int((y == 0).sum()), int((y == -1).sum()))


def negativ_sessionen(ds):
    """Geloeschte Negativbeispiele (Rohdaten-Kopie unter data/ml/v3/negativ_sessions/<id>/) -> y=0."""
    from app.analysis.timebase import build_timebase_for_session
    from app.analysis.v3 import merkmale as M
    ds.mkdir(parents=True, exist_ok=True)
    for d in sorted((ML / "v3" / "negativ_sessions").iterdir()):
        mf = d / "meta.json"
        if not mf.exists():
            continue
        m = json.loads(mf.read_text())
        tb = build_timebase_for_session(M.ganze_aufnahme({"uuid": m["session_uuid"], "accel_hz": m.get("accel_hz")}))
        t, X = M.merkmale(tb)
        y = np.zeros(t.size, dtype=np.int8)
        q = np.full(t.size, QUELLEN.index("mensch"), dtype=np.int8)
        np.savez_compressed(ds / f"negs-{m['session_id']}.npz", t=t, X=X.astype(np.float32), y=y, q=q,
                            im_lauf=np.zeros(t.size, bool), occ=np.full(t.size, -1, np.int16),
                            user_id=np.int32(m["user_id"]))
        print(f"  #{m['session_id']}: {t.size} s als 'kein Pumpfoil' ({tb.accel_hz:.0f} Hz)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", type=int, default=20)
    ap.add_argument("--fit-negativ", action="store_true")
    for k in ("baseline", "labels", "punkte", "wasser", "ds"):
        ap.add_argument(f"--{k}", default="")
    ap.add_argument("--ohne-ds", dest="ohne_ds", default="")
    ap.add_argument("--lauf-v2", dest="lauf_v2", action="store_true")
    ap.add_argument("--negativ-sessionen", dest="negativ_sessionen", action="store_true")
    a = ap.parse_args()
    cfg = {k: getattr(a, k) for k in ("baseline", "labels", "punkte", "wasser", "ds", "lauf_v2")}
    CFG.update(cfg)
    if a.negativ_sessionen:
        negativ_sessionen(pathlib.Path(a.ds) if a.ds else DS)
        return
    b, *_ = _laden()
    schon = {p.stem for p in pathlib.Path(a.ohne_ds).glob("*.npz")} if a.ohne_ds else set()
    auswahl = [s for s in b if (s["accel_hz"] or 0) >= 15 and s["detection"] == "model"
               and s.get("placement") != "board" and s.get("uuid") and str(s["id"]) not in schon]
    print("Sessions:", len(auswahl), flush=True)
    with Pool(a.jobs, initializer=_init, initargs=(cfg,)) as pool:
        res = [r for r in pool.imap_unordered(eine, auswahl, chunksize=4) if r]
    ok = [r for r in res if r[1] == "ok"]
    fehl = [r for r in res if r[1] == "fehler"]
    print("fertig:", len(ok), "Fehler:", len(fehl), fehl[:5])
    print("Sekunden y=1:", sum(r[2] for r in ok), " y=0:", sum(r[3] for r in ok), " unsicher:", sum(r[4] for r in ok))


if __name__ == "__main__" and "--fit-negativ" not in sys.argv:
    main()


# --- Zusaetzliche Negativ-Beispiele aus FIT-Dateien (Jan, 29.09.2026) ---------------------------
# „Ostrach, alle kein Pumpfoiling, sondern mal Spaziergang, mal auch aus Versehen im Auto". Nur
# Dateien MIT Beschleunigung (SensorLogging). Offline gelesen, NICHT importiert (keine DB).
NEG_FIT = WURZEL / "server" / "data" / "ml" / "v3" / "negativ_fit"


def fit_negative(pfade, user_id=2):
    """FIT-/ZIP-Dateien -> je Datei ein Datensatz mit y=0 (Quelle „mensch") in ds/neg-<name>.npz."""
    import io, zipfile
    from app.fitimport import parse_fit_bytes
    from app.analysis.timebase import build_timebase
    from app.analysis.v3 import merkmale as M
    DS.mkdir(parents=True, exist_ok=True)
    for p in pfade:
        roh = pathlib.Path(p).read_bytes()
        if roh[:2] == b"PK":
            z = zipfile.ZipFile(io.BytesIO(roh))
            roh = z.read([n for n in z.namelist() if n.lower().endswith(".fit")][0])
        f = parse_fit_bytes(roh)
        acc = np.frombuffer(f.get("accel_bytes") or b"", dtype="<i2").reshape(-1, 3)
        if acc.shape[0] < 500 or len(f["gps_samples"]) < 60:
            print(f"  {pathlib.Path(p).name}: zu wenig Daten, uebersprungen"); continue
        tb = build_timebase(f["gps_samples"], acc, 2048, f.get("accel_hz"))
        t, X = M.merkmale(tb)
        y = np.zeros(t.size, dtype=np.int8)
        q = np.full(t.size, QUELLEN.index("mensch"), dtype=np.int8)
        name = pathlib.Path(p).stem
        np.savez_compressed(DS / f"neg-{name}.npz", t=t, X=X.astype(np.float32), y=y, q=q,
                            im_lauf=np.zeros(t.size, bool), occ=np.full(t.size, -1, np.int16),
                            user_id=np.int32(user_id))
        print(f"  {name}: {t.size} s als 'kein Pumpfoil' ({tb.accel_hz:.0f} Hz)")


if __name__ == "__main__" and "--fit-negativ" in sys.argv:
    fit_negative(sorted(NEG_FIT.glob("*.zip")) + sorted(NEG_FIT.glob("*.fit")))
