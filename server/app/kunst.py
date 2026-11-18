"""GPS-Kunst-Event — „Wer malt das coolste Bild aufs Wasser?" (Jan 10.11.2026, Regeln 18.11.2026).

Ein Team-Event mit Vorlage „gpskunst" statt Bestenlisten (docs/TEAMS.md „Event-Idee: GPS-Kunst"):

- **Runden:** das Eventfenster wird in Runden zu `runden_tage` Tagen geteilt (die letzte endet mit dem Event). Ein
  Advents-Event ueber 4 Wochen mit 7 Tagen = 4 Runden; ein Event ueber 1 Woche = 1 Runde. Nach jeder Runde folgen
  `abstimmen_tage` Tage Abstimmung, waehrenddessen laeuft schon die naechste Runde (Jan: „alle paar tage … gekuert werden
  … waehrend das event aber noch weiterlaeuft").
- **Einreichen:** je Fahrer und Runde EIN Bild, bis Rundenende austauschbar. Nur eigene Sessions, die in der Runde
  gestartet sind, alle Sportarten auf dem Wasser (Jan 18.11.). Der Fahrer waehlt ein Stueck (von/bis) und dreht es.
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
RUNDEN_TAGE_STANDARD = 7
ABSTIMMEN_TAGE_STANDARD = 2
# Nicht auf dem Wasser (Jan 18.11.: „alle Sportarten auf dem Wasser").
NICHT_WASSER = {"snowkite", "kite_atb", "kitebuggy"}
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
            "test": bool(k.get("test")), "phasen": {str(a): b for a, b in (k.get("phasen") or {}).items() if b in PHASEN}}


PHASEN = ("kommt", "einreichen", "abstimmen", "fertig")
TEST_TAGE = 60


def runden(e: models.TeamEvent, jetzt: datetime | None = None) -> list[dict]:
    """[{nr, start, ende, abstimmen_bis, phase}] — phase: kommt | einreichen | abstimmen | fertig."""
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
        phase = "kommt" if jetzt < s else "einreichen" if jetzt < en else "abstimmen" if jetzt < ab else "fertig"
        if k["test"] and str(nr) in k["phasen"]:
            phase = k["phasen"][str(nr)]
        out.append({"nr": nr, "start": s, "ende": en, "abstimmen_bis": ab, "phase": phase})
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


def karte(gps: list, von_ms: int, bis_ms: int, fenster: list[tuple[int, int]], max_je_strich: int = 600) -> list[list[list[float]]]:
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
        akt.append([round(float(p[1]), 6), round(float(p[2]), 6)])
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
    a, z = fenster(e, r) if e is not None else (r["start"], r["ende"])
    return a <= _aware(s.started_at) < z


def reihenfolge(betrachter: int, bild_id: int) -> str:
    """Zufaellig je Betrachter, aber stabil (sonst springt die Galerie bei jedem Laden) — sonst gewaennen fruehe Bilder."""
    return hashlib.sha1(f"kunst:{betrachter}:{bild_id}".encode()).hexdigest()


def ergebnis(db: Session, e: models.TeamEvent, nr: int) -> list[dict]:
    """Rangliste einer fertigen Runde: [{bild_id, platz, herzen, user_id, session_id}] (Gleichstand = gleicher Platz)."""
    from sqlalchemy import func
    B, H = models.KunstBild, models.KunstHerz
    zeilen = (db.query(B.id, B.user_id, B.session_id, func.count(H.id))
              .outerjoin(H, H.bild_id == B.id)
              .filter(B.event_id == e.id, B.runde == nr, B.entfernt_grund.is_(None))
              .group_by(B.id).all())
    zeilen = sorted(zeilen, key=lambda z: (-int(z[3]), z[0]))
    out, platz, vorher = [], 0, None
    for i, (bid, uid, sid, n) in enumerate(zeilen):
        if n != vorher:
            platz, vorher = i + 1, n
        out.append({"bild_id": bid, "platz": platz, "herzen": int(n), "user_id": uid, "session_id": sid})
    return out
