"""Foil-Statistik fuer den MCP-Server: genau die Tabelle von /foil-stats, sonst nichts.

Jan, 22.11.2026: „ja genau, gleiche grenze, natuerlich nie fahrerdetails" — wie die Uhren (app/mcp_uhren.py):
- nur die Tabelle der Seite (`community.foil_stats`, mit Foil-Scoot-Zeile wie die Seite), Felder dynamisch durchgereicht;
  `test_mcp_foils.py` verlangt fuer jede neue Spalte eine Erklaerung;
- jeder Teil, hinter dem hoechstens `MIN_FAHRER_AUSSCHLUSS` Fahrer stehen, fehlt: der Pumpfoil-Teil (`users`), die
  Foil-Scoot-Zeile (`scoot.users`) und Low End (`low_end_fahrer`) einzeln; bleibt nichts uebrig, fehlt das Foil ganz;
- NIE die Detailseite /foil-stats/<id> (Rekorde und Sessions einzelner Fahrer mit Namen).
Die beiden Schalter der Seite (nur Handy am Brett, Mindestlauflaenge) gibt es auch hier — sie veraendern nur, welche
Aufnahmen in die Summen eingehen, und die Fahrer-Grenze gilt danach.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from . import models
from .mcp_uhren import MIN_FAHRER_AUSSCHLUSS, _norm

MAX_TREFFER = 25
MAX_MIN_LAUF_S = 600

# Kennzahlen des Pumpfoil-Teils; fehlen sie (zu wenige Fahrer), werden genau diese Felder herausgenommen.
_PUMP_FELDER = ("sessions", "users", "avg_speed_kmh", "meters_per_pump", "best_distance_m", "best_duration_s",
                "avg_pump_hz", "laeufe")
_LOW_END_FELDER = ("low_end_kmh", "low_end_laeufe", "low_end_fahrer")

ERKLAERUNG = {
    "foil_id": "Kennung des Foils im Katalog; kann statt des Namens an get_foil_stats gehen.",
    "brand": "Hersteller.",
    "model": "Modell.",
    "size": "Groesse, wie der Hersteller sie nennt.",
    "aspect_ratio": "Streckung (Spannweite² / Flaeche) aus dem Katalog.",
    "sessions": "Pumpfoil-Aufnahmen mit diesem Foil.",
    "users": "Fahrer mit diesem Foil (Pumpfoil).",
    "avg_speed_kmh": "Durchschnittstempo auf dem Foil, km/h.",
    "meters_per_pump": "Strecke je Pump, m — Mass fuer Gleitfaehigkeit (nur Aufnahmen mit Bewegungsdaten).",
    "best_distance_m": "Laengster einzelner Lauf aller Fahrer mit diesem Foil, m.",
    "best_duration_s": "Laengster einzelner Lauf aller Fahrer mit diesem Foil, s.",
    "avg_pump_hz": "Mittlerer Pumptakt, Hz.",
    "laeufe": "Zahl der Laeufe (nur bei gesetzter Mindestlauflaenge).",
    "low_end_kmh": "Low End: langsamstes Tempo (10-s-Mittel), aus dem Fahrer auf diesem Foil wieder herauskamen — Ende "
                   "eines Laufs zaehlt nicht; der Wert, unter dem 10 % der Laeufe liegen, auf 75 kg umgerechnet, km/h. "
                   "Leer, wenn zu wenige Daten.",
    "low_end_laeufe": "Laeufe, aus denen Low End stammt.",
    "low_end_fahrer": "Fahrer, aus denen Low End stammt.",
    "scoot": "Dieselben Kennzahlen aus Foil-Scoot-Aufnahmen (ohne Low End).",
}

HINWEIS = ("Dieselben Zahlen wie auf pumpfoil.org/foil-stats. Jeder Teil (Pumpfoil, Foil Scoot, Low End) erscheint "
           "nur, wenn mehr als " + str(MIN_FAHRER_AUSSCHLUSS) + " Fahrer dahinterstehen. Nur Aufnahmen, bei denen "
           "der Fahrer sein Foil ausgewaehlt hat.")


def _zeilen(db: Session, nutzer: models.User, arg: dict) -> list[dict]:
    from .api.community import foil_stats
    nur_brett = bool(arg.get("nur_brett"))
    try:
        min_lauf = max(0, min(int(arg.get("min_lauf_s") or 0), MAX_MIN_LAUF_S))
    except (TypeError, ValueError):
        min_lauf = 0
    aus = []
    for z in foil_stats(only_board=nur_brett, min_run_s=min_lauf, mit_scoot=True, _user=nutzer, db=db):
        z = dict(z)
        pump_ok = (z.get("users") or 0) > MIN_FAHRER_AUSSCHLUSS
        if not pump_ok:
            for k in _PUMP_FELDER:
                z.pop(k, None)
        if not pump_ok or (z.get("low_end_fahrer") or 0) <= MIN_FAHRER_AUSSCHLUSS:
            for k in _LOW_END_FELDER:
                z.pop(k, None)
        sc = z.get("scoot")
        if sc is not None and (sc.get("users") or 0) <= MIN_FAHRER_AUSSCHLUSS:
            z.pop("scoot")
        if pump_ok or "scoot" in z:
            aus.append(z)
    return aus


def _name(z: dict) -> str:
    return " ".join(x for x in (z.get("brand"), z.get("model"), z.get("size")) if x)


def suchen(db: Session, nutzer: models.User, arg: dict) -> dict:
    q = _norm(arg.get("name"))
    treffer = [{"foil_id": z["foil_id"], "name": _name(z), "fahrer": z.get("users"), "aufnahmen": z.get("sessions"),
                "foil_scoot_fahrer": (z.get("scoot") or {}).get("users")}
               for z in _zeilen(db, nutzer, arg) if not q or all(w in _norm(_name(z)) for w in q.split())]
    treffer.sort(key=lambda t: -(t["aufnahmen"] or 0))
    return {"treffer": treffer[:MAX_TREFFER], "gesamt": len(treffer),
            "hinweis": HINWEIS + " foil_id oder Namen an get_foil_stats uebergeben."}


def details(db: Session, nutzer: models.User, arg: dict) -> dict:
    fid = arg.get("foil_id")
    q = _norm(arg.get("name"))
    if fid is None and not q:
        return {"fehler": "foil_id oder name fehlt — erst list_foils aufrufen."}
    zeilen = _zeilen(db, nutzer, arg)
    if fid is not None:
        try:
            fid = int(fid)
        except (TypeError, ValueError):
            return {"fehler": "foil_id muss eine Zahl sein."}
        gefunden = [z for z in zeilen if z["foil_id"] == fid]
    else:
        gefunden = [z for z in zeilen if _norm(_name(z)) == q]
    if len(gefunden) != 1:
        return {"fehler": "Kein eindeutiges Foil (oder hoechstens " + str(MIN_FAHRER_AUSSCHLUSS) + " Fahrer). "
                "list_foils liefert foil_id und Namen."}
    z = gefunden[0]
    da = set(z) | set(z.get("scoot") or {})
    return {"foil": z, "felder": {k: ERKLAERUNG.get(k, "") for k in sorted(da)}, "hinweis": HINWEIS}
