"""FIT-Import: ZIP wird nur bis MAX_ENTPACKT_BYTES entpackt (Security-Review 29.10.2026)."""
from __future__ import annotations

import io
import zipfile

import pytest
from fastapi import HTTPException

from app.api import sessions


def _zip(groesse: int) -> bytes:
    puffer = io.BytesIO()
    with zipfile.ZipFile(puffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("bombe.fit", b"\0" * groesse)
    return puffer.getvalue()


def test_bombe_wird_abgelehnt(monkeypatch):
    monkeypatch.setattr(sessions, "MAX_ENTPACKT_BYTES", 1024)
    daten = _zip(10_000)
    assert len(daten) < 1024, "komprimiert klein, entpackt gross — genau der Fall"
    with pytest.raises(HTTPException) as e:
        sessions._fit_bytes_from_upload(daten, "x.zip")
    assert e.value.status_code == 413


def test_normale_datei_geht(monkeypatch):
    monkeypatch.setattr(sessions, "MAX_ENTPACKT_BYTES", 1024)
    assert sessions._fit_bytes_from_upload(_zip(1000), "x.zip") == b"\0" * 1000


def test_xml_mit_entities_wird_abgelehnt():
    """TCX/GPX ueber defusedxml (Security-Review 29.10.2026): Entity-Vervielfachung -> ValueError, kein 500."""
    from app.tcximport import parse_track_bytes
    bombe = (b'<?xml version="1.0"?><!DOCTYPE gpx [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;">]>'
             b'<gpx><trk><name>&b;</name></trk></gpx>')
    with pytest.raises(ValueError):
        parse_track_bytes(bombe, "x.gpx")


@pytest.mark.parametrize("url", ["https://evil.de\\\\@youtube.com/watch?v=x", "https://a:b@youtube.com/x",
                                 "https://evil.de\\\\.youtube.com/x"])
def test_video_link_tricks_abgelehnt(url):
    with pytest.raises(HTTPException):
        sessions._clean_youtube(url)


def test_video_link_normal():
    assert sessions._clean_youtube("youtu.be/abc") == "https://youtu.be/abc"


def test_ingest_zu_gross_wird_abgelehnt(client):
    """S-026 (29.10.2026): riesige Aufnahme-Anfragen werden vor dem Lesen abgewiesen, riesige Bloecke
    bei der Pruefung."""
    from app import schemas
    import pytest as _pt
    from pydantic import ValidationError
    r = client.post("/api/ingest/session/x/chunks", content=b"{}",
                    headers={"Content-Length": str(64 * 1024 * 1024), "Content-Type": "application/json"})
    assert r.status_code == 413
    with _pt.raises(ValidationError):
        schemas.ChunkIn(index=0, kind="accel", encoding="int16-b64", data="A" * (schemas.CHUNK_MAX_ZEICHEN + 1))
    assert schemas.ChunkIn(index=0, kind="accel", encoding="int16-b64", data="A" * 1000).data
