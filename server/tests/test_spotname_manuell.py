"""Von Hand vergebene Spot-Namen bleiben (Jan, 06.10.2026): weder das automatische Zusammenfuehren
noch das Aufraeumen der Zaehler-Suffixe darf sie zuruecksetzen oder aendern."""
from __future__ import annotations


def _spot(db, name, src, lat=47.0, lon=9.0):
    from app import models
    sp = models.Spot(name=name, name_source=src, lat=lat, lon=lon)
    db.add(sp); db.flush()
    return sp


def test_zusammenfuehren_behaelt_den_handnamen():
    from app.db import SessionLocal
    from app.spots import _merge_spot_rows
    db = SessionLocal()
    try:
        ziel = _spot(db, "Oberaegeri", "town")          # mehr Sessions -> wird Ziel
        hand = _spot(db, "Aegerisee Sued", "manual")     # von Hand umbenannt, wird Quelle
        _merge_spot_rows(db, ziel, [hand], 47.0)
        assert ziel.name == "Aegerisee Sued" and ziel.name_source == "manual"
        assert hand.merged_into == ziel.id

        # Ist das Ziel selbst von Hand benannt, bleibt SEIN Name.
        ziel2 = _spot(db, "Le Jolla", "manual")
        quelle2 = _spot(db, "La Jolla", "manual")
        _merge_spot_rows(db, ziel2, [quelle2], 47.0)
        assert ziel2.name == "Le Jolla"
    finally:
        db.rollback(); db.close()


def test_zaehler_aufraeumen_laesst_handnamen_stehen():
    from app import models
    from app.db import SessionLocal
    from app.spots import repair
    db = SessionLocal()
    try:
        hand = _spot(db, "Steg 3", "manual", lat=10.0, lon=10.0)
        auto = _spot(db, "Testort 2", "town", lat=11.0, lon=11.0)
        db.commit()
        rep = repair(db, apply=True, reassign_limit=0)
        db.refresh(hand); db.refresh(auto)
        assert hand.name == "Steg 3"                     # von Hand -> unberuehrt
        assert auto.name == "Testort"                    # automatisch -> wie bisher aufgeraeumt
        assert not any(r["id"] == hand.id for r in rep.get("renamed", []))
    finally:
        db.query(models.Spot).filter(models.Spot.name.in_(("Steg 3", "Testort", "Testort 2"))).delete()
        db.commit(); db.close()
