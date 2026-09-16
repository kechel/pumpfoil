"""Kartenhintergrund im Teilen-Bild (`bg=satellit|karte`).

Freigabe Jan (16.09.2026): „teilen der satteliten Bilder mit leaflet Nennung im Bild wie in der
pwa ist ok". Die Nennung ist damit die BEDINGUNG, nicht ein Detail — deshalb steht hier fest,
dass sie gezeichnet wird, sobald eine Karte im Bild ist.

Der zweite Grund fuer diese Datei ist der Ausfall. Das Teilen-Bild haengt jetzt an einem FREMDEN
Server (Esri bzw. OpenStreetMap). Ist der langsam oder weg, darf das Bild nicht scheitern und
erst recht nicht haengen — es entsteht dann eben ohne Karte. Die Tests hier laufen bewusst OHNE
Netz: `maptiles.hintergrund` wird ersetzt.
"""
from __future__ import annotations

import io as _io

import pytest
from PIL import Image

from app import maptiles, sharecard


class _AR:
    """Minimales Analyse-Ergebnis: eine Spur ueber ein paar hundert Meter."""
    def __init__(self):
        pts = [[9.3660 + i * 0.0002, 47.9000 + i * 0.0001] for i in range(40)]
        self.track_geojson = (
            '{"geometry": {"coordinates": %s}, "properties": {"speeds": {"3": %s}}}'
            % (pts, [5.0] * 40)
        )
        self.segments_json = '[{"i_start": 0, "i_end": 39}]'
        for f in ("foiling_distance_m", "foiling_time_s", "pump_count", "num_runs",
                  "max_speed_mps", "best_distance_m"):
            setattr(self, f, 100.0)


class _S:
    place_name = "Testspot"

    def __init__(self):
        from datetime import datetime, timezone
        self.started_at = datetime(2026, 9, 16, 12, 0, tzinfo=timezone.utc)


def _bild(png: bytes) -> Image.Image:
    return Image.open(_io.BytesIO(png))


def test_ohne_karte_bleibt_alles_wie_bisher():
    a = sharecard.render_share_png(_S(), _AR(), None, bg="navy")
    assert _bild(a).format == "PNG"


@pytest.mark.parametrize("ebene", ["satellit", "karte"])
def test_karte_landet_im_bild_und_wird_genannt(monkeypatch, ebene):
    gerufen = {}

    def fake(lat_o, lat_u, lon_l, lon_r, b, h, e):
        gerufen.update(lat_o=lat_o, lat_u=lat_u, lon_l=lon_l, lon_r=lon_r, ebene=e)
        return Image.new("RGB", (b, h), (200, 200, 200))   # hell -> Schleier muss greifen

    monkeypatch.setattr(maptiles, "hintergrund", fake)
    info: dict = {}
    png = sharecard.render_share_png(_S(), _AR(), None, bg=ebene, info=info)

    assert gerufen["ebene"] == ebene
    # Der Ausschnitt muss das GANZE Bild abdecken, also oben noerdlicher als unten und
    # links westlicher als rechts — eine vertauschte Ecke faellt sonst niemandem auf.
    assert gerufen["lat_o"] > gerufen["lat_u"]
    assert gerufen["lon_l"] < gerufen["lon_r"]
    # Heller Grund -> kraeftiger Schleier, sonst waeren die Texte unlesbar.
    assert info["dim"] > 0.5
    assert info["format"] == "jpeg"          # Fotohintergrund -> JPEG statt 1-MB-PNG
    assert _bild(png).format == "JPEG"


def test_dunkler_grund_bekommt_nur_den_mindestschleier(monkeypatch):
    monkeypatch.setattr(maptiles, "hintergrund",
                        lambda *a, **k: Image.new("RGB", (a[4], a[5]), (10, 14, 22)))
    info: dict = {}
    sharecard.render_share_png(_S(), _AR(), None, bg="satellit", info=info)
    assert info["dim"] == pytest.approx(0.25)


def test_fester_dim_schlaegt_die_messung(monkeypatch):
    monkeypatch.setattr(maptiles, "hintergrund",
                        lambda *a, **k: Image.new("RGB", (a[4], a[5]), (240, 240, 240)))
    info: dict = {}
    sharecard.render_share_png(_S(), _AR(), None, bg="satellit", dim=0.3, info=info)
    assert info["dim"] == pytest.approx(0.3)


def test_kachelserver_weg_ergibt_trotzdem_ein_bild(monkeypatch):
    """Der wichtigste Test: ein fremder Server darf das Teilen nie kaputtmachen."""
    monkeypatch.setattr(maptiles, "hintergrund", lambda *a, **k: None)
    info: dict = {}
    png = sharecard.render_share_png(_S(), _AR(), None, bg="satellit", info=info)
    assert _bild(png).format == "PNG"        # faellt auf den navy-Weg zurueck
    assert "dim" not in info                 # kein Schleier ohne Karte
    assert _bild(png).size == (1080, 1080)


def test_nennung_ist_fuer_jede_ebene_hinterlegt():
    for e in maptiles.EBENEN:
        assert "Leaflet" in maptiles.nennung(e) and "©" in maptiles.nennung(e)


def test_unbekannte_ebene_holt_nichts():
    assert maptiles.hintergrund(48.0, 47.9, 9.3, 9.4, 100, 100, "mondkarte") is None
