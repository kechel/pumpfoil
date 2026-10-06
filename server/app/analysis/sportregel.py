"""Sportart per REGEL statt KI — Gegenprobe zur aktuellen Einordnung (Jan, 06.10.2026).

Ziel (Jan): „anhand der Klassifikation Regeln finden … um das automatisch ohne KI zuordnen zu koennen,
und nur mit KI pruefen und den Algorithmus verbessern". Hergeleitet und gemessen mit
scripts/sport/merkmale.py + scripts/sport/regeln_pruefen.py ueber den ganzen Bestand (Labels und
Sessiondaten bleiben auf der VM, im Repo stehen nur Regel und Auswertung).

Stand v6: Pump je Fahrer 97,2 %, Wind 85,5 %, Welle 92,4 % (Fahrer gleich gewichtet).

Die Regel AENDERT NICHTS von selbst. Sie liefert ein Urteil; der Admin-Bereich listet, wo es von der
aktuellen Sportart abweicht, und nur ein Admin wendet es an — dann ueber den Auto-Weg
(`sport_source` „auto" + Begruendung in `sport_auto_json`), damit der Besitzer in der Session SIEHT,
dass automatisch eingeordnet wurde, und es mit einem Klick ueberstimmen kann. Ein Besitzer-Urteil
(`owner`) wird nie angefasst.

Gruppen statt Sportarten: die Regel trennt Pump / Wind / Welle. Kite gegen Wing trennt sie NICHT
(beide ~21 km/h, Laeufe ~150 s) — das waehlt der Admin beim Anwenden.
"""
from __future__ import annotations

import json
import math
import pathlib
import threading

import numpy as np

VERSION = "v6"
GRUPPE = {"pumpfoil": "pump", "wingfoil": "wind", "kitefoil": "wind", "parawing": "wind",
          "surf_wave": "welle"}

GEO = pathlib.Path(__file__).resolve().parents[2] / "data" / "geo"
KUESTE_GEOJSON = GEO / "ne_10m_coastline.geojson"
KUESTE_NPY = GEO / "kueste_xyz.npy"
_KUESTE = None
_KUESTE_LOCK = threading.Lock()


def kueste_bauen(abstand_km: float = 1.0) -> int:
    """Natural-Earth-Kuestenlinie (Public Domain) einmalig in ein kompaktes float32-Feld von Punkten
    auf der Einheitskugel umrechnen (~15 MB statt ~400 MB Spitze beim Lesen des GeoJSON — das soll
    nicht in jedem der vier Worker passieren). Aufruf: scripts/sport/kueste-bauen.py."""
    pts = []
    for f in json.load(open(KUESTE_GEOJSON, encoding="utf-8"))["features"]:
        gm = f["geometry"]
        linien = gm["coordinates"] if gm["type"] == "MultiLineString" else [gm["coordinates"]]
        for ln in linien:
            for (lo1, la1), (lo2, la2) in zip(ln, ln[1:]):
                km = math.hypot((la2 - la1) * 111, (lo2 - lo1) * 111 * math.cos(math.radians(la1)))
                n = max(1, int(km / abstand_km))
                for k in range(n):
                    pts.append((la1 + (la2 - la1) * k / n, lo1 + (lo2 - lo1) * k / n))
            pts.append((ln[-1][1], ln[-1][0]))
    p = np.radians(np.array(pts))
    xyz = np.c_[np.cos(p[:, 0]) * np.cos(p[:, 1]), np.cos(p[:, 0]) * np.sin(p[:, 1]), np.sin(p[:, 0])]
    np.save(KUESTE_NPY, xyz.astype(np.float32))
    return len(xyz)


def kueste_km(lat: float, lon: float) -> float | None:
    """Abstand zur MEERESkueste in km. Binnenseen sind keine Kueste. None, wenn die Kuestendatei auf
    diesem Server fehlt — dann sagt die Regel nie „Welle", sonst aendert sich nichts."""
    global _KUESTE
    if _KUESTE is None:
        with _KUESTE_LOCK:
            if _KUESTE is None:
                if KUESTE_NPY.exists():
                    from scipy.spatial import cKDTree
                    _KUESTE = cKDTree(np.load(KUESTE_NPY).astype(np.float64))
                else:
                    _KUESTE = False
    if _KUESTE is False:
        return None
    la, lo = math.radians(lat), math.radians(lon)
    d, _ = _KUESTE.query([math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la)])
    return round(2 * math.asin(min(1.0, d / 2)) * 6371.0, 1)


def _abstand_m(a, b) -> float:
    """Luftlinie zwischen zwei [lon, lat]-Punkten (Laufstart/-ende im Segment-Format)."""
    dy = (b[1] - a[1]) * 111000
    dx = (b[0] - a[0]) * 111000 * math.cos(math.radians(a[1]))
    return math.hypot(dx, dy)


def merkmale(segs: list, gps: list, dauer_aufnahme_s: float) -> dict:
    """Die Zahlen, auf denen die Regel steht — aus den gespeicherten Laeufen und den GPS-Rohpunkten
    [t_ms (Session-ms), lat, lon, v_mps, …]. Gleiche Definitionen wie scripts/sport/merkmale.py."""
    out: dict = {"laeufe": len(segs)}
    if not segs:
        return out
    v = np.array([float(g.get("avg_speed_mps") or 0) * 3.6 for g in segs])
    d = np.array([float(g.get("duration_s") or 0) for g in segs])
    out.update(tempo_med=round(float(np.median(v)), 1), dauer_med=round(float(np.median(d))),
               anteil_foil=round(float(d.sum()) / (dauer_aufnahme_s or 1), 2))
    starts = np.array([g["start_pt"] for g in segs if g.get("start_pt")], float)
    if len(starts) > 1:
        out["flaeche_km"] = round(float(np.hypot(
            (starts[:, 1].max() - starts[:, 1].min()) * 111,
            (starts[:, 0].max() - starts[:, 0].min()) * 111 * math.cos(math.radians(starts[0, 1])))), 2)
    if len(starts):
        out["kueste_km"] = kueste_km(float(np.median(starts[:, 1])), float(np.median(starts[:, 0])))
    # Zwischen den Laeufen: rauspaddeln (Welle, weit + zuegig) gegen kurz zum Steg (Pump).
    weg = [_abstand_m(x["end_pt"], y["start_pt"]) for x, y in zip(segs, segs[1:])
           if x.get("end_pt") and y.get("start_pt")]
    if weg:
        out["zw_weg_m"] = round(float(np.median(weg)))
    rows = [r for r in gps if len(r) > 2 and r[1] is not None and r[2] is not None]
    if rows:
        tt = np.array([r[0] for r in rows], float)
        la = np.array([r[1] for r in rows], float)
        lo = np.array([r[2] for r in rows], float)
        kmh = []
        for x, y in zip(segs, segs[1:]):
            a, b = x.get("t_end_session_ms"), y.get("t_start_session_ms")
            if a is None or b is None or b - a < 5000:
                continue
            m = (tt >= a) & (tt <= b)
            if m.sum() < 3:
                continue
            dy = np.diff(la[m]) * 111000
            dx = np.diff(lo[m]) * 111000 * math.cos(math.radians(la[m][0]))
            kmh.append(float(np.hypot(dx, dy).sum()) / ((b - a) / 1000) * 3.6)
        if kmh:
            out["zw_kmh"] = round(float(np.median(kmh)), 1)
    return out


def regel_v5(m: dict) -> str:
    """Wind = schnell UND lange Laeufe, oder viel Foil-Zeit ueber eine grosse Flaeche ab 15 km/h.
    Welle = an der Meereskueste (<= 2 km) UND kurze Ritte bei >= 11 km/h, wenig Foil-Zeit, verteilte
    Starts (Line-up statt Steg), zwischen den Ritten >= 20 m bei >= 2,5 km/h zurueck. Sonst Pump."""
    v = m.get("tempo_med") or 0
    d = m.get("dauer_med") or 0
    a = m.get("anteil_foil") or 0
    fl = m.get("flaeche_km") or 0
    if (v >= 17 and d >= 60) or (a >= 0.3 and fl >= 0.4 and v >= 15):
        return "wind"
    kue = m.get("kueste_km")
    if (kue is not None and kue <= 2.0 and v >= 11 and d <= 60 and a <= 0.3 and fl >= 0.05
            and (m.get("zw_weg_m") or 0) >= 20 and (m.get("zw_kmh") or 0) >= 2.5):
        return "welle"
    return "pump"


def regel(m: dict, andere_am_spot: list[str] | None = None) -> str:
    """v6 = v5 + Spot-Gegenprobe NUR fuer Welle: mindestens 2 ANDERE Fahrer am Spot, davon >= 80 %
    Pumper -> Pump (Hafenbecken an der Kueste, z. B. Barcelona Forum). Fuer Wind gemessen und
    verworfen — Wing und Pump teilen sich viele Seen."""
    g = regel_v5(m)
    andere = andere_am_spot or []
    if g == "welle" and len(andere) >= 2 and andere.count("pump") / len(andere) >= 0.8:
        return "pump"
    return g


def spot_stimmen(db, spot_id: int | None, ohne_nutzer: int) -> list[str]:
    """Je anderem Fahrer am Spot EINE Stimme: seine haeufigste Gruppe dort, nur aus Urteilen, die
    als Label taugen (Mensch, oder unbestrittenes Pumpfoil). Der Fahrer der Session zaehlt nie mit."""
    if not spot_id:
        return []
    from sqlalchemy import text
    rows = db.execute(text(
        "SELECT user_id, sport_class, count(*) FROM sessions "
        "WHERE spot_id = :sp AND user_id <> :u AND NOT coalesce(deleted, false) "
        "AND coalesce(data_quality, 'ok') = 'ok' "
        "AND (sport_source IN ('admin', 'owner') OR (sport_class = 'pumpfoil' AND sport_source = 'default')) "
        "GROUP BY 1, 2"), {"sp": spot_id, "u": ohne_nutzer}).fetchall()
    je: dict = {}
    for u, k, n in rows:
        g = GRUPPE.get(k)
        if g:
            je.setdefault(u, {}).setdefault(g, 0)
            je[u][g] += n
    return [max(c, key=c.get) for c in je.values()]


def urteil(db, session, result) -> dict | None:
    """Urteil der Regel fuer eine fertig analysierte Session, oder None (keine/zu wenige Laeufe)."""
    from .. import storage
    if result is None or not result.segments_json:
        return None
    segs = json.loads(result.segments_json or "[]")
    if len(segs) < 3:
        return None
    dauer = ((session.ended_at - session.started_at).total_seconds()
             if session.ended_at and session.started_at else 0)
    m = merkmale(segs, storage.load_gps(session.session_uuid), dauer)
    andere = spot_stimmen(db, session.spot_id, session.user_id)
    return {"gruppe": regel(m, andere), "gruppe_v5": regel_v5(m), "merkmale": m,
            "spot_andere": len(andere), "spot_pump": andere.count("pump"), "version": VERSION}


def grund_text(gruppe: str, m: dict) -> str:
    """Deutscher Klartext fuer Admin/Support (nie in der Nutzer-UI — die baut ihren Text selbst)."""
    if gruppe == "welle":
        return (f"Regel {VERSION}: kurze Ritte (Median {m.get('dauer_med')} s) bei {m.get('tempo_med')} km/h, "
                f"{m.get('kueste_km')} km vor der Meereskueste, Starts ueber {m.get('flaeche_km')} km verteilt, "
                f"zwischen den Ritten {m.get('zw_weg_m')} m bei {m.get('zw_kmh')} km/h zurueck.")
    if gruppe == "wind":
        return (f"Regel {VERSION}: Laeufe im Median {m.get('dauer_med')} s bei {m.get('tempo_med')} km/h, "
                f"{round((m.get('anteil_foil') or 0) * 100)} % der Zeit auf dem Foil, Starts ueber "
                f"{m.get('flaeche_km')} km verteilt.")
    return f"Regel {VERSION}: Pump-Muster (Laeufe {m.get('dauer_med')} s bei {m.get('tempo_med')} km/h)."
