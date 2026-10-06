#!/usr/bin/env python3
"""Sportart-Merkmale je Session — Grundlage fuer spaetere REGELN ohne KI (Jan, 06.10.2026: „anhand der
Klassifikation Regeln finden, z. B. Richtungsaenderungen, Geschwindigkeiten … automatisch ohne KI zuordnen,
mit KI nur pruefen und den Algorithmus verbessern"). REIN LESEND.

Je Session aus den gespeicherten Laeufen (Start-/Endpunkt, Tempo, Dauer) und den GPS-Rohpunkten:
  laeufe, tempo_med / tempo_p90 (km/h, Lauf-Schnitt), dauer_med / dauer_max (s), anteil_foil (Foil-Zeit / Aufnahme),
  richtung_einheit (0..1: wie einheitlich die Laufrichtungen sind — Welle ~1, Kite/Wing hin und her ~0),
  richtung_paare (Anteil der Laufrichtungen, die zu zwei GEGENlaeufigen Haeufungen gehoeren — Kreuzen am Wind),
  puls_med, tempo_max_roh (km/h, 5-Punkt-Median aus Positionen), flaeche_km (Ausdehnung der Laufstarts).
Aufruf (aus server/): .venv/bin/python ../scripts/sport/merkmale.py --nutzer 798 [--json]
"""
import argparse, json, math, pathlib, sys
import numpy as np
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "server"))


def kurs(a, b):
    dy = (b[1] - a[1]) * 111000; dx = (b[0] - a[0]) * 111000 * math.cos(math.radians(a[1]))
    return (math.degrees(math.atan2(dx, dy)) % 360, math.hypot(dx, dy))


def verlauf(g, segs):
    """Tempoverlauf IN den Laeufen und Bewegung ZWISCHEN ihnen (Session-ms auf beiden Seiten).
    Idee (06.10.2026, noch Vermutung): Welle = schnell angeschoben, dann abfallend, danach weit
    zurueckpaddeln; Pumpen = gleichmaessig, danach kurz zum Steg zurueck.
      abfall      Median je Lauf: (Tempo erstes Drittel - letztes Drittel) / Lauf-Schnitt
      spitze_pos  Median je Lauf: wo im Lauf (0..1) das hoechste Tempo liegt
      tempo_cv    Median je Lauf: Streuung / Schnitt
      zw_weg_m    Median Luftlinie Laufende -> naechster Laufstart
      zw_kmh      Median Tempo dazwischen (Weg entlang der Punkte / Zeit)"""
    t = np.array([r[0] for r in g if len(r) > 3 and r[3] is not None], float)
    v = np.array([r[3] for r in g if len(r) > 3 and r[3] is not None], float) * 3.6
    if len(t) < 10 or not segs:
        return {}
    ab, sp, cv = [], [], []
    for x in segs:
        a, b = x.get("t_start_session_ms", x["t_start_ms"]), x.get("t_end_session_ms", x["t_start_ms"] + x["duration_s"] * 1000)
        m = (t >= a) & (t <= b)
        vv = v[m]
        if len(vv) < 6 or vv.mean() <= 0:
            continue
        d = max(1, len(vv) // 3)
        ab.append((vv[:d].mean() - vv[-d:].mean()) / vv.mean())
        sp.append(int(np.argmax(vv)) / (len(vv) - 1))
        cv.append(vv.std() / vv.mean())
    out = {}
    if ab:
        out.update(abfall=round(float(np.median(ab)), 2), spitze_pos=round(float(np.median(sp)), 2),
                   tempo_cv=round(float(np.median(cv)), 2))
    rows = [r for r in g if len(r) > 2 and r[1] is not None]
    tt = np.array([r[0] for r in rows], float); la = np.array([r[1] for r in rows]); lo = np.array([r[2] for r in rows])
    weg, kmh = [], []
    for x, y in zip(segs, segs[1:]):
        if x.get("end_pt") and y.get("start_pt"):
            weg.append(kurs(x["end_pt"], y["start_pt"])[1])
        a, b = x.get("t_end_session_ms"), y.get("t_start_session_ms")
        if a is None or b is None or b - a < 5000:
            continue
        m = (tt >= a) & (tt <= b)
        if m.sum() < 3:
            continue
        dy = np.diff(la[m]) * 111000; dx = np.diff(lo[m]) * 111000 * math.cos(math.radians(la[m][0]))
        kmh.append(float(np.hypot(dx, dy).sum()) / ((b - a) / 1000) * 3.6)
    if weg: out["zw_weg_m"] = round(float(np.median(weg)))
    if kmh: out["zw_kmh"] = round(float(np.median(kmh)), 1)
    return out


def merkmale(s, ar):
    from app import storage
    segs = json.loads(ar.segments_json or "[]") if ar else []
    dauer_auf = ((s.ended_at - s.started_at).total_seconds() if s.ended_at else 0) or 1
    out = {"id": s.id, "nutzer": s.user_id, "sport_tag": s.sport, "klasse": s.sport_class, "quelle": s.sport_source,
           "qualitaet": s.data_quality, "pumpfoil": s.is_pumpfoil, "override": s.pumpfoil_override,
           "geraet": s.device_model, "lage": s.placement, "ort": s.place_name, "laeufe": len(segs)}
    if segs:
        v = np.array([g["avg_speed_mps"] * 3.6 for g in segs]); d = np.array([g["duration_s"] for g in segs])
        out.update(tempo_med=round(float(np.median(v)), 1), tempo_p90=round(float(np.percentile(v, 90)), 1),
                   dauer_med=round(float(np.median(d))), dauer_max=round(float(d.max())),
                   anteil_foil=round(float(d.sum()) / dauer_auf, 2))
        ks = [kurs(g["start_pt"], g["end_pt"]) for g in segs if g.get("start_pt") and g.get("end_pt")]
        ks = [k for k, m in ks if m > 15]
        if len(ks) >= 3:
            r = np.radians(ks)
            out["richtung_einheit"] = round(float(math.hypot(np.cos(r).mean(), np.sin(r).mean())), 2)
            # Gegenlaeufige Paare: Richtungen verdoppelt -> zwei entgegengesetzte Haeufungen fallen zusammen
            out["richtung_paare"] = round(float(math.hypot(np.cos(2 * r).mean(), np.sin(2 * r).mean())), 2)
        starts = np.array([g["start_pt"] for g in segs if g.get("start_pt")])
        if len(starts) > 1:
            out["flaeche_km"] = round(float(np.hypot((starts[:, 1].max() - starts[:, 1].min()) * 111,
                                                      (starts[:, 0].max() - starts[:, 0].min()) * 111 * math.cos(math.radians(starts[0, 1])))), 2)
    g = storage.load_gps(s.session_uuid)
    hr = [r[4] for r in g if len(r) > 4 and r[4]]
    if hr: out["puls_med"] = int(np.median(hr))
    out.update(verlauf(g, segs))
    if len(g) > 10:
        from app.analysis import autofahrt as A
        _, vv = A._tempo_kmh(g)
        out["tempo_max_roh"] = round(float(vv.max()), 1)
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--nutzer", type=int); ap.add_argument("--ids"); ap.add_argument("--json", action="store_true")
    ap.add_argument("--aus", help="JSONL-Datei (gehoert nach server/data/, gitignored — nie ins Repo)")
    a = ap.parse_args()
    from app.db import SessionLocal
    from app import models
    db = SessionLocal()
    q = db.query(models.Session).filter(models.Session.deleted.isnot(True))
    if a.nutzer: q = q.filter(models.Session.user_id == a.nutzer)
    if a.ids: q = q.filter(models.Session.id.in_([int(x) for x in a.ids.split(",")]))
    aus = open(a.aus, "w", encoding="utf-8") if a.aus else None
    n = 0
    for s in q.order_by(models.Session.started_at).yield_per(200):
        try:
            m = merkmale(s, s.result)
        except Exception as e:  # eine kaputte Session haelt den Lauf nicht an, wird aber gezaehlt
            m = {"id": s.id, "fehler": repr(e)[:200]}
        n += 1
        if aus:
            aus.write(json.dumps(m, ensure_ascii=False) + "\n")
            if n % 500 == 0: print(n, flush=True)
            continue
        print(json.dumps(m, ensure_ascii=False) if a.json else
              f"#{m['id']} {m['sport_tag'][:12]:12s} {m['klasse'][:9]:9s} {str(m.get('ort'))[:16]:16s} L{m['laeufe']:3d} "
              f"v {m.get('tempo_med','-')}/{m.get('tempo_p90','-')} d {m.get('dauer_med','-')}/{m.get('dauer_max','-')} foil {m.get('anteil_foil','-')} "
              f"einheit {m.get('richtung_einheit','-')} paare {m.get('richtung_paare','-')} puls {m.get('puls_med','-')} vmax {m.get('tempo_max_roh','-')} fl {m.get('flaeche_km','-')}")
    if aus: aus.close(); print("fertig:", n)
    db.close()
