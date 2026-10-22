"""Tanz-Abschnitte der Tanz-App (watch-dance/Tanz.mc, Jan 21.10.2026).

NUR fuer Sessions mit sport == "dance". Nichts hier beruehrt die Pumpfoil-Auswertung (Regel „nur
Pumpfoil -> Tanz", CLAUDE.md). Die Uhr erkennt Abschnitte und schlaegt einen Tanz vor, Jan bestaetigt
oder aendert ihn am Handgelenk oder spaeter im Web — gesammelt wird die Wahrheit fuer eine bessere
Erkennung. Abgelegt in den Tabellen tanz_sessions/tanz_abschnitte/tanz_fenster/tanz_orte (models.py);
bis 22.10.2026 als data/<uuid>/tanz.json (uebernommen von scripts/tanz_json_in_db.py, Dateien bleiben liegen).

Format je Abschnitt: start_ms, ende_ms (Session-ms, wie die Accel-Zeitachse), vorschlag (Uhr, oder
None bei manuell), gewaehlt (None = unbestaetigt),
quelle (auto|bestaetigt|geaendert|manuell|nachtraeglich|marker|web),
tempo (Auf-und-ab-Bewegungen je min, Median), dreh (Anteil gedrehter Fenster in %).
"""
from __future__ import annotations

from datetime import datetime, timezone

from . import models

TAENZE = ("lw", "tango", "ww", "slowfox", "quickstep", "samba", "chacha", "rumba", "paso", "jive",
          "salsa", "bachata", "discofox", "boogie", "kein")
# 4 nur Tanz-App 0.4; 5 = Marker (ab 0.5 jede Bestaetigung): nur ein Hinweis, gedeutet wird hier, nicht auf der Uhr.
QUELLEN_UHR = {0: "auto", 1: "bestaetigt", 2: "geaendert", 3: "manuell", 4: "nachtraeglich", 5: "marker"}
MAX_ABSCHNITTE = 500
_ZEILE = ("start_ms", "ende_ms", "vorschlag", "gewaehlt", "quelle", "tempo", "dreh")


def _key(v):
    return v if isinstance(v, str) and v in TAENZE else None


def _int(v, lo=0, hi=10 ** 9):
    try:
        i = int(v)
    except (TypeError, ValueError):
        return None
    return i if lo <= i <= hi else None


def aus_uhr(roh) -> list[dict]:
    """Liste der Uhr ([start, ende, vorschlag, gewaehlt, quelle, tempo, dreh]) -> bereinigte Abschnitte."""
    out = []
    for z in (roh or [])[:MAX_ABSCHNITTE]:
        if not isinstance(z, list) or len(z) < 5:
            continue
        start = _int(z[0])
        ende = _int(z[1], -1)
        if start is None or ende is None:
            continue
        out.append({
            "start_ms": start, "ende_ms": (ende if ende >= start else None),
            "vorschlag": _key(z[2]), "gewaehlt": _key(z[3]),
            "quelle": QUELLEN_UHR.get(_int(z[4], 0, 9), "auto"),
            "tempo": _int(z[5], 0, 400) if len(z) > 5 else None,
            "dreh": _int(z[6], 0, 100) if len(z) > 6 else None,
        })
    return out


def fenster_entpacken(roh) -> dict | None:
    """Rhythmus-Verlauf der Uhr (Tanz.mc _packen): {"t0": ms, "w": [zahl, ...]} -> Liste je 10-s-Fenster
    {t_ms, tempo, klar, quer, umdr} — zum Abgleich Uhr gegen Server-Rechnung und fuer spaetere Auswertung."""
    if not isinstance(roh, dict) or not isinstance(roh.get("w"), list):
        return None
    t0 = _int(roh.get("t0"), 0)
    if t0 is None:
        return None
    out = []
    for i, z in enumerate(roh["w"][:2000]):
        z = _int(z, 0, 2 ** 31 - 1)
        if z is None:
            continue
        u = (z >> 23) & 0xFF
        out.append({"t_ms": t0 + i * 10000, "tempo": z & 0xFF, "klar": ((z >> 8) & 0x7F) / 100,
                    "quer": ((z >> 15) & 0xFF) / 100, "umdr": None if u == 254 else u / 100})
    return {"fenster": out}


def orte_entpacken(roh) -> list[dict] | None:
    """GPS-Fixe der Tanz-App (TanzSensoren.mc, alle 30 min ein Einzel-Fix, 21.10.2026):
    `[[t_ms, lat, lon, genauigkeit], ...]`. Liegen NUR hier (tanz_orte, Besitzer), nie im GPS-Kanal —
    keine Karte, kein Spot; Jans Fernbild ist ohnehin nur Stadt/Ortsteil."""
    if not isinstance(roh, list):
        return None
    out = []
    for z in roh[:200]:
        if not (isinstance(z, list) and len(z) >= 3 and all(isinstance(x, (int, float)) for x in z[:3])):
            continue
        t, lat, lon = int(z[0]), float(z[1]), float(z[2])
        if not (-90 <= lat <= 90 and -180 <= lon <= 180) or (lat == 0 and lon == 0):
            continue
        q = z[3] if len(z) > 3 and isinstance(z[3], int) else None
        out.append({"t_ms": t, "lat": round(lat, 6), "lon": round(lon, 6), "genauigkeit": q})
    return out


def laden(db, session_id: int) -> dict | None:
    """Alles zu einer Tanz-Session in der frueheren Form: abschnitte, uhr, fenster_uhr, orte, quelle, stand.
    None, wenn es keine Tanz-Auswertung gibt."""
    kopf = db.get(models.TanzSession, session_id)
    if kopf is None:
        return None
    ab = db.query(models.TanzAbschnitt).filter_by(session_id=session_id).order_by(models.TanzAbschnitt.pos).all()
    fe = db.query(models.TanzFenster).filter_by(session_id=session_id).order_by(models.TanzFenster.t_ms).all()
    orte = db.query(models.TanzOrt).filter_by(session_id=session_id).order_by(models.TanzOrt.t_ms).all()
    zeile = lambda a: {k: getattr(a, k) for k in _ZEILE}
    uhr = [zeile(a) for a in ab if a.uhr]
    return {
        "abschnitte": [zeile(a) for a in ab if not a.uhr],
        "uhr": uhr or None,
        "fenster_uhr": [{"t_ms": f.t_ms, "tempo": f.tempo, "klar": f.klar, "quer": f.quer, "umdr": f.umdr}
                        for f in fe] or None,
        "orte": [{"t_ms": o.t_ms, "lat": o.lat, "lon": o.lon, "genauigkeit": o.genauigkeit} for o in orte] or None,
        "quelle": kopf.quelle, "stand": kopf.stand.isoformat() if kopf.stand else None, "notiz": kopf.notiz,
    }


def sperren(db, session_id: int) -> models.TanzSession | None:
    """Kopfzeile mit SELECT … FOR UPDATE: gleichzeitige Korrekturen warten bis zum Commit aufeinander
    (22.10.2026: vier parallele Web-Korrekturen haben die fruehere tanz.json zerschrieben)."""
    return db.query(models.TanzSession).filter_by(session_id=session_id).with_for_update().one_or_none()


def speichern(db, session_id: int, abschnitte: list[dict], quelle: str, fenster_uhr: list | None = None,
              orte: list | None = None, uhr: list | None = None) -> dict:
    """Aktuelle Tabelle ersetzen; das Uhr-Original wird nur beim ersten Mal geschrieben (bzw. mit `uhr`
    ausdruecklich), Fenster und Orte nur, wenn mitgegeben. Committet NICHT — das macht der Aufrufer."""
    kopf = sperren(db, session_id)
    if kopf is None:
        kopf = models.TanzSession(session_id=session_id, quelle=quelle)
        db.add(kopf)
    kopf.quelle = quelle
    kopf.stand = datetime.now(timezone.utc)
    T = models.TanzAbschnitt
    hat_uhr = db.query(T.id).filter_by(session_id=session_id, uhr=True).first() is not None
    if uhr is None and not hat_uhr and quelle == "uhr":
        uhr = abschnitte
    if uhr is not None:
        db.query(T).filter_by(session_id=session_id, uhr=True).delete()
        db.add_all(T(session_id=session_id, uhr=True, pos=i, **{k: a.get(k) for k in _ZEILE}) for i, a in enumerate(uhr))
    db.query(T).filter_by(session_id=session_id, uhr=False).delete()
    db.add_all(T(session_id=session_id, uhr=False, pos=i, **{k: a.get(k) for k in _ZEILE}) for i, a in enumerate(abschnitte))
    if fenster_uhr is not None:
        db.query(models.TanzFenster).filter_by(session_id=session_id).delete()
        db.add_all(models.TanzFenster(session_id=session_id, **{k: f.get(k) for k in ("t_ms", "tempo", "klar", "quer", "umdr")})
                   for f in fenster_uhr)
    if orte is not None:
        db.query(models.TanzOrt).filter_by(session_id=session_id).delete()
        db.add_all(models.TanzOrt(session_id=session_id, **{k: o.get(k) for k in ("t_ms", "lat", "lon", "genauigkeit")})
                   for o in orte)
    db.flush()
    return laden(db, session_id)


def aus_web(neu, alt: list[dict]) -> list[dict]:
    """Web-Korrektur: je Abschnitt (per Index) nur `gewaehlt` aendern; Zeiten bleiben die der Uhr."""
    out = [dict(a) for a in alt]
    for e in (neu or [])[:MAX_ABSCHNITTE]:
        if not isinstance(e, dict):
            continue
        i = _int(e.get("index"), 0, len(out) - 1)
        if i is None:
            continue
        g = _key(e.get("gewaehlt"))
        if g != out[i].get("gewaehlt"):
            out[i]["gewaehlt"] = g
            out[i]["quelle"] = "web"
    return out
