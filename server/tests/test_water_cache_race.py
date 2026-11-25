"""Wasserflaechen-Cache: zwei gleichzeitige Auswertungen am selben Ort duerfen nicht scheitern.

25.11.2026: drei Aufnahmen vom selben, noch nicht gecachten Ort kamen innerhalb von 18 s an und wurden
gleichzeitig ausgewertet. Jede fand keinen Cache-Eintrag, fragte Overpass (~20 s), die erste schrieb, die
anderen scheiterten mit UniqueViolation auf ix_water_polygons_grid_key und blieben auf `complete` haengen.
Hier wird der Verlierer nachgestellt: waehrend des (abgeklemmten) Overpass-Abrufs schreibt eine zweite
DB-Sitzung denselben Rasterschluessel.
"""
from app import models
from app.analysis import _water_rings_cached
from app.db import SessionLocal

RINGE = [[[8.0, 47.0], [8.001, 47.0], [8.001, 47.001], [8.0, 47.0]]]


def test_verlierer_des_wettlaufs_scheitert_nicht(client, monkeypatch):
    gps = [[i * 1000, 47.1234, 8.5678, 0.0] for i in range(30)]
    key = "47.123,8.568"

    def zweiter_schreibt_zuerst(lat, lon):
        andere = SessionLocal()
        try:
            andere.add(models.WaterPolygon(grid_key=key, rings_json="[]"))
            andere.commit()
        finally:
            andere.close()
        return RINGE

    monkeypatch.setattr("app.places.lookup_water_rings", zweiter_schreibt_zuerst)
    db = SessionLocal()
    try:
        db.query(models.WaterPolygon).filter_by(grid_key=key).delete()
        db.commit()
        assert _water_rings_cached(db, gps) == RINGE   # eigene Ringe, kein IntegrityError
        assert db.query(models.WaterPolygon).filter_by(grid_key=key).count() == 1
    finally:
        db.query(models.WaterPolygon).filter_by(grid_key=key).delete()
        db.commit()
        db.close()
