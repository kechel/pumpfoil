"""GPS-Kunst-Event — „Wer malt das coolste Bild aufs Wasser?" (Jan 10.11.2026, Regeln 18.11.2026).

Ein Team-Event mit Vorlage „gpskunst" statt Bestenlisten (docs/TEAMS.md „Event-Idee: GPS-Kunst"):

- **Runden:** das Eventfenster wird in Runden zu `runden_tage` Tagen geteilt (die letzte endet mit dem Event). Ein
  Advents-Event ueber 4 Wochen mit 7 Tagen = 4 Runden; ein Event ueber 1 Woche = 1 Runde. Nach jeder Runde folgen
  `abstimmen_tage` Tage Abstimmung, waehrenddessen laeuft schon die naechste Runde (Jan: „alle paar tage … gekuert werden
  … waehrend das event aber noch weiterlaeuft").
- **Einreichen:** je Fahrer und Runde EIN Bild, bis Rundenende austauschbar. Nur eigene Sessions, die in der Runde
  gestartet sind, alle Sportarten, auch an Land (Jan 18.11.). Der Fahrer waehlt ein Stueck (von/bis) und dreht es.
- **Speichern:** nur die normierte Linie (metrisch projiziert, gedreht, auf 0..1000 eingepasst) — die Galerie verraet
  keinen Spot und keine Groesse.
- **Abstimmen:** anonym (nur die Linie), Reihenfolge je Betrachter zufaellig aber stabil, bis zu HERZEN_JE_RUNDE
  Herzen je Runde, nie fuers eigene Bild. Zwischenstand verborgen bis zum Ende der Abstimmung (Jan 18.11.).
- **Aufloesung:** danach Platz, Herzen, Name, Spot (nur wenn der Ort nicht verborgen ist) und Link zur Session.
- **Moderation:** Humor bleibt, nur Verbotenes (§86a u. Ae.) fliegt raus (Jan 10.11.). Melden kann jeder, entfernen
  koennen Admins und Leitung/Moderation des Teams — mit Grund, den der Fahrer sieht.
"""
from __future__ import annotations

import hashlib
import json
import math
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from . import models

VORLAGE = "gpskunst"
HERZEN_JE_RUNDE = 3
# Nachfrist zum Einreichen nach Rundenende: bewusst KEINE (Jan 18.11.2026: „keine nachfrist") — eingereicht wird bis
# Rundenende, danach beginnt die Abstimmung. Der Schalter bleibt, falls es spaeter doch eine braucht.
NACHFRIST = timedelta(0)
RUNDEN_TAGE_STANDARD = 7
ABSTIMMEN_TAGE_STANDARD = 2
# Ausgeschlossene Sportarten: keine (Jan 18.11.2026: „ALL sports are allowed … auch land" — Snowkite, Kite-ATB und Buggy
# zaehlen mit). Erst hiess es „alle Sportarten auf dem Wasser".
NICHT_WASSER: set[str] = set()
MIN_PUNKTE = 10
MIN_AUSDEHNUNG_M = 20.0
LINIE_MAX_PUNKTE = 800
SPUR_MAX_PUNKTE = 2500
BOX = 1000


def ist_kunst(e: models.TeamEvent | None) -> bool:
    return bool(e) and getattr(e, "vorlage", None) == VORLAGE


def _aware(d: datetime) -> datetime:
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def einstellungen(e: models.TeamEvent) -> dict:
    try:
        k = json.loads(e.kunst_json or "{}") or {}
    except ValueError:
        k = {}
    rt = int(k.get("runden_tage") or RUNDEN_TAGE_STANDARD)
    at = int(k.get("abstimmen_tage") if k.get("abstimmen_tage") is not None else ABSTIMMEN_TAGE_STANDARD)
    return {"runden_tage": max(1, min(rt, 62)), "abstimmen_tage": max(1, min(at, 14)),
            # Testmodus (Jan 18.11.2026, nur Admins): jede eigene Session der letzten TEST_TAGE zaehlt, und die Phase jeder
            # Runde laesst sich von Hand setzen — so sind alle Stufen an einem Abend pruefbar, ohne auf Rundenenden zu warten.
            "test": bool(k.get("test")), "phasen": {str(a): b for a, b in (k.get("phasen") or {}).items() if b in PHASEN},
            # Feste Zusatz-Sessions im Testmodus (Jan 22.11.2026, Werbevideo: der Track hinter dem Sessions-Icon ist vom
            # 08.06.): zaehlen unabhaengig vom Zeitfenster und stehen in der Auswahl oben — nur fuer ihren Besitzer.
            "test_sessions": [int(x) for x in (k.get("test_sessions") or []) if str(x).isdigit()]}


PHASEN = ("kommt", "einreichen", "abstimmen", "fertig")
TEST_TAGE = 60


def runden(e: models.TeamEvent, jetzt: datetime | None = None) -> list[dict]:
    """[{nr, start, ende, einreichen_bis, abstimmen_bis, phase}] — phase: kommt | einreichen | abstimmen | fertig.
    `ende` begrenzt die Sessions der Runde, `einreichen_bis` (= ende + NACHFRIST) das Einreichen."""
    jetzt = jetzt or datetime.now(timezone.utc)
    k = einstellungen(e)
    a, z = _aware(e.start), _aware(e.ende)
    schritt = timedelta(days=k["runden_tage"])
    out, nr, s = [], 1, a
    while s < z and nr <= 60:
        en = min(s + schritt, z)
        # Kein Mini-Rest am Ende (Jan 18.11.2026: 10 Tage / 3 ergab eine 1-Tages-Runde 4): ein Rest unter einer halben
        # Runde wird der letzten Runde zugeschlagen.
        if z - en < schritt / 2:
            en = z
        ab = en + timedelta(days=k["abstimmen_tage"])
        eb = en + NACHFRIST
        phase = "kommt" if jetzt < s else "einreichen" if jetzt < eb else "abstimmen" if jetzt < ab else "fertig"
        if k["test"] and str(nr) in k["phasen"]:
            phase = k["phasen"][str(nr)]
        out.append({"nr": nr, "start": s, "ende": en, "einreichen_bis": eb, "abstimmen_bis": ab, "phase": phase})
        s, nr = en, nr + 1
    return out


def runde(e: models.TeamEvent, nr: int) -> dict | None:
    return next((r for r in runden(e) if r["nr"] == nr), None)


# ------------------------------------------------------------------------------------------------ Geometrie ----

def _projiziert(gps: list) -> list[tuple[float, float, float]]:
    """[(t, x_m, y_m)] lokal metrisch (aequirektangular um den ersten Punkt) — genug fuer ein paar Kilometer."""
    pts = [(float(p[0]), float(p[1]), float(p[2])) for p in gps
           if len(p) >= 3 and p[1] is not None and p[2] is not None and abs(float(p[1])) > 1e-6]
    if not pts:
        return []
    lat0, lon0 = pts[0][1], pts[0][2]
    kx = 111_320.0 * math.cos(math.radians(lat0))
    return [(t, (lon - lon0) * kx, (lat - lat0) * 110_540.0) for t, lat, lon in pts]


def _rdp(p: list[tuple[float, float]], eps: float) -> list[tuple[float, float]]:
    """Douglas-Peucker (iterativ)."""
    if len(p) < 3:
        return p
    behalten = [False] * len(p)
    behalten[0] = behalten[-1] = True
    stapel = [(0, len(p) - 1)]
    while stapel:
        i, j = stapel.pop()
        (x1, y1), (x2, y2) = p[i], p[j]
        dx, dy = x2 - x1, y2 - y1
        n = math.hypot(dx, dy)
        best, bi = -1.0, -1
        for k in range(i + 1, j):
            # Geschlossene Formen (Herz, Kreis): Anfang == Ende -> Abstand zum Punkt statt zur (leeren) Strecke,
            # sonst schrumpft die ganze Schleife auf zwei Punkte.
            d = (abs(dy * (p[k][0] - x1) - dx * (p[k][1] - y1)) / n) if n > 1e-6 else math.hypot(p[k][0] - x1, p[k][1] - y1)
            if d > best:
                best, bi = d, k
        if best > eps and bi > 0:
            behalten[bi] = True
            stapel += [(i, bi), (bi, j)]
    return [q for q, b in zip(p, behalten) if b]


def laeufe(segments_json: str | None) -> list[tuple[int, int]]:
    """Erkannte Laeufe als [(von, bis)] in GPS-ms (`t_start_session_ms`, gleiche Achse wie gps[i][0] — NICHT i_start,
    das zeigt in track_geojson). Gezeichnet wird nur auf dem Foil (Jan 18.11.2026: „nur die on-foil strecken")."""
    try:
        segs = json.loads(segments_json or "[]") or []
    except ValueError:
        return []
    out = []
    for g in segs:
        a, z = g.get("t_start_session_ms"), g.get("t_end_session_ms")
        if a is not None and z is not None and z > a:
            out.append((int(a), int(z)))
    return sorted(out)


def spur(gps: list) -> list[list[float]]:
    """Ganze Session fuers Zuschneiden: [[t_ms, x_m, y_m], ...], hoechstens SPUR_MAX_PUNKTE (gleichmaessig ausgeduennt).
    Relative Meter — nur fuer den Besitzer, aber auch so ohne Koordinaten."""
    p = _projiziert(gps)
    if len(p) > SPUR_MAX_PUNKTE:
        s = len(p) / SPUR_MAX_PUNKTE
        p = [p[int(i * s)] for i in range(SPUR_MAX_PUNKTE)] + [p[-1]]
    return [[int(t), round(x, 1), round(y, 1)] for t, x, y in p]


def linie(gps: list, von_ms: int, bis_ms: int, drehung: int, max_punkte: int = LINIE_MAX_PUNKTE,
          fenster: list[tuple[int, int]] | None = None) -> list[list[list[int]]]:
    """Normierte Linie des Stuecks [von, bis] als STRICHE [[[x, y], ...], ...]: mit `fenster` (Laeufe) ein Strich je Lauf,
    dazwischen nichts; ohne `fenster` ein einziger Strich. Gedreht (Grad, im Uhrzeigersinn), Seitenverhaeltnis erhalten,
    mittig in 0..BOX eingepasst, y nach unten (SVG). ValueError, wenn zu wenig Punkte oder zu klein."""
    striche: list[list[tuple[float, float]]] = []
    akt, akt_f = [], None
    for t, x, y in _projiziert(gps):
        if not (von_ms <= t <= bis_ms):
            continue
        if fenster is not None:
            f = next((i for i, (a, z) in enumerate(fenster) if a <= t <= z), None)
            if f is None:
                continue
        else:
            f = 0
        if f != akt_f and akt:
            striche.append(akt)
            akt = []
        akt_f = f
        akt.append((x, y))
    if akt:
        striche.append(akt)
    striche = [st for st in striche if len(st) >= 2]
    if sum(len(st) for st in striche) < MIN_PUNKTE:
        raise ValueError("zu_wenig_punkte")
    w = math.radians(drehung % 360)
    c, s_ = math.cos(w), math.sin(w)
    # Bildschirm-Koordinaten (Norden oben, y nach unten): sx = x, sy = -y. Die Matrix [[c, -s], [s, c]] dreht dort im
    # Uhrzeigersinn — genau wie in der Vorschau des Web-Editors.
    q = [[(x * c - (-y) * s_, x * s_ + (-y) * c) for x, y in st] for st in striche]
    xs = [a for st in q for a, _ in st]
    ys = [b for st in q for _, b in st]
    bx, by = max(xs) - min(xs), max(ys) - min(ys)
    if max(bx, by) < MIN_AUSDEHNUNG_M:
        raise ValueError("zu_klein")
    m = max(bx, by)
    rand = BOX * 0.04
    f_ = (BOX - 2 * rand) / m
    ox = (BOX - bx * f_) / 2 - min(xs) * f_
    oy = (BOX - by * f_) / 2 - min(ys) * f_
    r = [[(x * f_ + ox, y * f_ + oy) for x, y in st] for st in q]
    eps = 0.6
    while True:
        z = [_rdp(st, eps) for st in r]
        if sum(len(st) for st in z) <= max_punkte or eps > 200:
            break
        eps *= 1.6
    return [[[int(round(x)), int(round(y))] for x, y in st] for st in z]


def lauf_werte(gps: list, von_ms: int, bis_ms: int, fenster: list[tuple[int, int]] | None) -> list[dict]:
    """Dauer (s) und Laenge (m) je Strich — dieselbe Aufteilung wie `linie` (ein Strich je Lauf, Striche mit < 2 Punkten
    fallen weg), damit Index i zum i-ten Strich der Linie passt. Fuer den Zaehler beim Abspielen (Jan 19.11.2026)."""
    striche: list[list[tuple[float, float, float]]] = []
    akt, akt_f = [], None
    for t, x, y in _projiziert(gps):
        if not (von_ms <= t <= bis_ms):
            continue
        if fenster is not None:
            f = next((i for i, (a, z) in enumerate(fenster) if a <= t <= z), None)
            if f is None:
                continue
        else:
            f = 0
        if f != akt_f and akt:
            striche.append(akt)
            akt = []
        akt_f = f
        akt.append((t, x, y))
    if akt:
        striche.append(akt)
    out = []
    for st in (st for st in striche if len(st) >= 2):
        m = sum(math.hypot(st[i][1] - st[i - 1][1], st[i][2] - st[i - 1][2]) for i in range(1, len(st)))
        out.append({"s": round((st[-1][0] - st[0][0]) / 1000.0, 1), "m": round(m)})
    return out


def karte(gps: list, von_ms: int, bis_ms: int, fenster: list[tuple[int, int]], max_je_strich: int = 600,
          mit_tempo: bool = False) -> list[list[list[float]]]:
    """Der echte Track zum Bild (Aufloesung, Jan 18.11.2026): dieselben Striche wie `linie`, aber als [lat, lon] ohne
    Drehung — Norden oben auf der Karte. Nur Punkte in Laeufen, je Strich gleichmaessig ausgeduennt."""
    striche, akt, akt_f = [], [], None
    for p in gps:
        if len(p) < 3 or p[1] is None or p[2] is None or abs(float(p[1])) < 1e-6:
            continue
        t = float(p[0])
        if not (von_ms <= t <= bis_ms):
            continue
        f = next((i for i, (a, z) in enumerate(fenster) if a <= t <= z), None)
        if f is None:
            continue
        if f != akt_f and akt:
            striche.append(akt)
            akt = []
        akt_f = f
        pt = [round(float(p[1]), 6), round(float(p[2]), 6)]
        if mit_tempo:   # [lat, lon, m/s] — nur fuers Kartenbild (Speed-Farben); die JSON-Antwort bleibt [lat, lon]
            pt.append(float(p[3]) if len(p) > 3 and p[3] is not None and float(p[3]) > 0 else 0.0)
        akt.append(pt)
    if akt:
        striche.append(akt)
    out = []
    for st in striche:
        if len(st) < 2:
            continue
        if len(st) > max_je_strich:
            k = len(st) / max_je_strich
            st = [st[int(i * k)] for i in range(max_je_strich)] + [st[-1]]
        out.append(st)
    return out


# ---------------------------------------------------------------------------------------------- Wer darf was ----

def darf_teilnehmen(db: Session, user: models.User, e: models.TeamEvent) -> bool:
    """Einreichen, Galerie sehen, abstimmen: globales Event = alle; Event mehrerer Teams = Mitglieder der beteiligten;
    sonst Mitglieder des Teams."""
    from . import teams as T
    if user.blocked:
        return False
    if T.ist_global(e):
        return True
    mehr = T.darf_event_sehen(db, user.id, e)
    if mehr is not None:
        return bool(mehr)
    return user.id in T.mitglieder_ids(db, e.team_id)


def darf_moderieren(db: Session, user: models.User, e: models.TeamEvent) -> bool:
    from . import teams as T
    if user.is_admin:
        return True
    m = db.query(models.TeamMitglied).filter(models.TeamMitglied.team_id == e.team_id,
                                             models.TeamMitglied.user_id == user.id).first()
    return T.darf_verwalten(m)


def fenster(e: models.TeamEvent, r: dict) -> tuple[datetime, datetime]:
    """Aus welcher Zeit Sessions zaehlen: die Runde — im Testmodus die letzten TEST_TAGE."""
    if einstellungen(e)["test"]:
        jetzt = datetime.now(timezone.utc)
        return jetzt - timedelta(days=TEST_TAGE), jetzt + timedelta(minutes=1)
    return r["start"], r["ende"]


def session_passt(s: models.Session | None, user_id: int, r: dict, e: models.TeamEvent | None = None) -> bool:
    if s is None or s.user_id != user_id or s.deleted or s.started_at is None:
        return False
    if (s.sport_class or "") in NICHT_WASSER:
        return False
    if e is not None:
        k = einstellungen(e)
        if k["test"] and s.id in k["test_sessions"]:
            return True
    a, z = fenster(e, r) if e is not None else (r["start"], r["ende"])
    return a <= _aware(s.started_at) < z


def reihenfolge(betrachter: int, bild_id: int) -> str:
    """Zufaellig je Betrachter, aber stabil (sonst springt die Galerie bei jedem Laden) — sonst gewaennen fruehe Bilder."""
    return hashlib.sha1(f"kunst:{betrachter}:{bild_id}".encode()).hexdigest()


def verdeckt(db: Session, uids) -> set[int]:
    """Konten, deren Bilder und Herzen fuer andere nicht zaehlen: versteckt (Shadowban/Testkonto) oder gesperrt."""
    uids = {u for u in uids if u is not None}
    if not uids:
        return set()
    return {i for (i,) in db.query(models.User.id).filter(models.User.id.in_(uids),
                                                         (models.User.hidden.is_(True)) | (models.User.blocked.is_(True)))}


def sieht_bild(owner: int, betrachter: models.User | None, verdeckte: set[int]) -> bool:
    """Shadowban richtig (Jan 19.11.2026): Bilder versteckter/gesperrter Konten sieht nur der Besitzer selbst und Admins;
    der Besitzer merkt nichts."""
    return owner not in verdeckte or (betrachter is not None and (betrachter.is_admin or betrachter.id == owner))


def zaehlt_herz(voter: int, betrachter: models.User | None, verdeckte: set[int]) -> bool:
    """Herzen versteckter/gesperrter Konten zaehlen nur in der eigenen Sicht (und fuer Admins) — sonst merkte es der Betroffene."""
    return voter not in verdeckte or (betrachter is not None and (betrachter.is_admin or betrachter.id == voter))


def ergebnis(db: Session, e: models.TeamEvent, nr: int, betrachter: models.User | None = None) -> list[dict]:
    """Rangliste einer fertigen Runde: [{bild_id, platz, herzen, user_id, session_id}] (Gleichstand = gleicher Platz).
    Je Betrachter: Bilder und Herzen versteckter/gesperrter Konten nur fuer sie selbst und Admins (s. sieht_bild)."""
    B, H = models.KunstBild, models.KunstHerz
    bilder = (db.query(B.id, B.user_id, B.session_id)
              .filter(B.event_id == e.id, B.runde == nr, B.entfernt_grund.is_(None)).all())
    herzen = db.query(H.bild_id, H.user_id).filter(H.event_id == e.id, H.runde == nr).all()
    verdeckte = verdeckt(db, {u for _, u, _ in bilder} | {u for _, u in herzen})
    zahl: dict[int, int] = {}
    for bid, voter in herzen:
        if zaehlt_herz(voter, betrachter, verdeckte):
            zahl[bid] = zahl.get(bid, 0) + 1
    zeilen = [(bid, uid, sid, zahl.get(bid, 0)) for bid, uid, sid in bilder if sieht_bild(uid, betrachter, verdeckte)]
    zeilen.sort(key=lambda z: (-z[3], z[0]))
    out, platz, vorher = [], 0, None
    for i, (bid, uid, sid, n) in enumerate(zeilen):
        if n != vorher:
            platz, vorher = i + 1, n
        out.append({"bild_id": bid, "platz": platz, "herzen": int(n), "user_id": uid, "session_id": sid})
    return out


# ---------------------------------------------------------------------------------------------- Karte als Bild ----

KARTE_PX = 900          # Kantenlaenge des Kartenbildes (quadratisch wie die Linie)
KARTE_FASSUNG = 3       # hochzaehlen, wenn sich das Aussehen aendert -> neuer Cache-Name


def karte_png(striche: list[list[list[float]]], ebene: str = "satellit", groesse: int = KARTE_PX) -> bytes:
    """Der echte Track als fertiges Bild (Jan 19.11.2026: „hier ist das overkill" — keine interaktive Karte im Event,
    zoomen geht in den Session-Details). Kacheln wie das Teilen-Bild ueber `maptiles` (Plattencache, User-Agent,
    stiller Rueckfall auf Nachtblau); die Quellennennung wird wie dort FEST ins Bild gebrannt. Norden oben,
    flache Naeherung wie `sharecard` (ueber einen Spot genau genug, s. maptiles.hintergrund)."""
    import colorsys
    import io
    import math
    from PIL import Image, ImageDraw
    from . import maptiles
    from .sharecard import _font
    W = H = groesse
    img = Image.new("RGB", (W, H), (11, 26, 51))
    pkte = [p for st in striche for p in st]
    if len(pkte) >= 2:
        latref = sorted(p[0] for p in pkte)[len(pkte) // 2]
        mx, my = 111320.0 * math.cos(math.radians(latref)), 111320.0
        xs, ys = [p[1] * mx for p in pkte], [p[0] * my for p in pkte]
        minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
        rand = 0.12 * W
        sc = min((W - 2 * rand) / max(maxx - minx, 1.0), (H - 2 * rand) / max(maxy - miny, 1.0))
        sc = min(sc, W / 120.0)          # winzige Spuren nicht endlos aufblasen: mindestens ~120 m Bildbreite
        cx, cy = (minx + maxx) / 2, (miny + maxy) / 2
        def xy(lat, lon): return (W / 2 + (lon * mx - cx) * sc, H / 2 - (lat * my - cy) * sc)
        def geo(sx, sy): return (cy - (sy - H / 2) / sc) / my, (cx + (sx - W / 2) / sc) / mx
        lat_o, lon_l = geo(0, 0)
        lat_u, lon_r = geo(W, H)
        hg = maptiles.hintergrund(lat_o, lat_u, lon_l, lon_r, W, H, ebene) if ebene in maptiles.EBENEN else None
        if hg is not None:
            img = hg.convert("RGB")
        d = ImageDraw.Draw(img)
        dick = max(3, round(W / 110))
        # Speed-Farben (Jan 19.11.2026) wie die Session-Karte im Web (trackColors.rampColor: hsl 240 -> 0, 85 %, 55 %),
        # relativ zur Spur; 5./95. Perzentil, damit ein Doppler-Ausreisser die Skala nicht verzieht. Ohne Tempo: Cyan.
        tempi = sorted(p[2] for p in pkte if len(p) > 2 and p[2] > 0)
        lo, hi = (tempi[int(len(tempi) * 0.05)], tempi[int(len(tempi) * 0.95) - 1 if len(tempi) > 1 else 0]) if tempi else (0, 0)
        def farbe_bei(v):
            if hi <= lo:
                return (34, 211, 238)
            c = max(0.0, min(1.0, (v - lo) / (hi - lo)))
            r, g, b = colorsys.hls_to_rgb((1 - c) * 240 / 360, 0.55, 0.85)
            return (round(r * 255), round(g * 255), round(b * 255))
        def rund(q, br, f):   # runde Enden/Gelenke wie stroke-linecap: round
            d.ellipse((q[0] - br / 2, q[1] - br / 2, q[0] + br / 2, q[1] + br / 2), fill=f)
        rand = dick * 2 + 4
        for st in striche:    # dunkler Rand darunter, sonst verschwindet die Linie auf hellem Wasser/Sand
            if len(st) >= 2:
                pts = [xy(p[0], p[1]) for p in st]
                d.line(pts, fill=(11, 26, 51), width=rand, joint="curve")
                rund(pts[0], rand, (11, 26, 51)); rund(pts[-1], rand, (11, 26, 51))
        for st in striche:
            if len(st) >= 2:
                pts = [xy(p[0], p[1]) for p in st]
                for j in range(1, len(pts)):
                    v = (st[j - 1][2] + st[j][2]) / 2 if len(st[j]) > 2 else 0
                    f = farbe_bei(v)
                    d.line((pts[j - 1], pts[j]), fill=f, width=dick)
                    rund(pts[j], dick, f)
                rund(pts[0], dick, farbe_bei(st[0][2] if len(st[0]) > 2 else 0))
        if hg is not None:
            fs = max(12, round(W / 36))
            d.text((round(W * 0.025), H - round(W * 0.025) - fs), maptiles.nennung(ebene), font=_font(fs, False),
                   fill=(255, 255, 255), stroke_width=max(1, fs // 10), stroke_fill=(0, 0, 0))
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    return buf.getvalue()
