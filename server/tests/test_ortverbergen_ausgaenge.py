"""„Ort verbergen" an ALLEN Ausgaengen — Security-Review 29.10.2026.

Der Schalter war im Feed, in der Detailseite, in MCP und den Rohdaten dicht, an anderen Stellen nicht:
Startversuche und Carves lieferten echte Koordinaten, Rekorde/Fotos/Spot-Vergleich/Foiler-Titel den echten
Spot samt Zeitzone, das Wetter fuer „Point Nemo" den Mittelpunkt der echten Orte. Jede Stelle baute die
Regel selbst nach, und genau dort fehlte sie. Dieser Test geht deshalb den anderen Weg: EINE verborgene
Aufnahme mit unverwechselbarem Ortsnamen und Koordinaten, dann jeden Endpunkt abfragen, der Ort, Zeitzone
oder Koordinaten ausgibt, und im rohen Antworttext nach dem echten Ort suchen. Wer einen neuen Endpunkt mit
Ortsbezug baut, haengt ihn an `ENDPUNKTE` an.
"""
from __future__ import annotations

import json
import secrets
from datetime import datetime, timedelta, timezone

import pytest

from app import models, ortverbergen, storage
from app.db import SessionLocal

ORT = "Geheimweiher"
LAT, LON = 47.613579, 9.246802      # unverwechselbar; Zeitzone Europe/Zurich bzw. Berlin
# Ortsname und Koordinaten im ROHTEXT; die Zeitzone wird je Eintrag geprueft (andere Tests legen Sessions
# in Europa an, „Europe/" steht deshalb in jeder Community-Antwort).
SPUREN = ("Geheimweiher", "47.613", "9.246")


def _konto(client, mail):
    mail = mail.replace("@", f"-{secrets.token_hex(3)}@")   # die Test-DB ueberdauert Laeufe
    r = client.post("/api/auth/register", json={"email": mail, "password": "supersecret"})
    assert r.status_code in (200, 201), (mail, r.status_code, r.text)
    kopf = {"Authorization": f"Bearer {r.json()['access_token']}"}
    return kopf, client.get("/api/auth/me", headers=kopf).json()["id"]


def _spot():
    db = SessionLocal()
    try:
        sp = models.Spot(name=ORT + "-" + secrets.token_hex(3), lat=LAT, lon=LON)
        db.add(sp); db.commit()
        return sp.id
    finally:
        db.close()


def _verborgene_session(uid, spot_id):
    """Haelt mit absurden Bestwerten jeden Rekord, hat ein Foto, eine Spur und GPS-Rohdaten mit
    einem misslungenen Startversuch (keine Laeufe -> alles ist Versuch)."""
    db = SessionLocal()
    try:
        t0 = datetime.now(timezone.utc) - timedelta(hours=3)
        s = models.Session(session_uuid=secrets.token_hex(16), user_id=uid, started_at=t0,
                           ended_at=t0 + timedelta(minutes=10), sport="pumpfoil", is_pumpfoil=True,
                           status="done", place_name=ORT, place_lat=LAT, place_lon=LON, spot_id=spot_id,
                           ort_sichtbarkeit="hide", gps_hz=1)
        db.add(s); db.flush()
        db.add(models.AnalysisResult(
            session_id=s.id, algo_version="test", detection="model", num_runs=1,
            foiling_distance_m=9_999_000.0, foiling_time_s=99_999.0, pump_count=999_999,
            best_distance_m=9_999_000.0, best_distance_idx=0, best_duration_s=99_999.0, best_duration_idx=0,
            best_speed_mps=99.0, best_speed_idx=0, best_glide_s=999.0, best_glide_idx=0,
            track_geojson=json.dumps({"type": "LineString",
                                      "coordinates": [[LON, LAT], [LON + 0.002, LAT + 0.001]]})))
        db.add(models.SessionPhoto(session_id=s.id, user_id=uid, url="/media/test-ortverbergen.jpg"))
        db.commit()
        sid, uuid = s.id, s.session_uuid
    finally:
        db.close()
    # Stehen, 25 s anschieben auf 5 m/s nach Osten, stehen — ein Versuch ohne Lauf.
    zeilen, lon = [], LON
    for i in range(80):
        v = 5.0 if 20 <= i < 45 else 0.0
        lon += v / 75_000.0
        zeilen.append([i * 1000, LAT, lon, v, 120, 3.0])
    storage.save_gps_chunk(uuid, 0, zeilen)
    _ANGELEGT.append(sid)
    return sid


_ANGELEGT: list[int] = []


@pytest.fixture(autouse=True)
def _aufraeumen():
    """Die Testaufnahme haelt mit absurden Werten jeden Rekord — danach weg damit, sonst kippen die
    Rekord-Tests, die spaeter in derselben DB laufen (test_rekord_push_frisch, 29.10.2026)."""
    yield
    if _ANGELEGT:
        db = SessionLocal()
        try:
            db.query(models.Session).filter(models.Session.id.in_(_ANGELEGT)).update(
                {models.Session.deleted: True}, synchronize_session=False)
            db.commit()
        finally:
            db.close()
        _ANGELEGT.clear()


def _cache_leeren():
    from app.api import community
    community._VERBERGER_CACHE.update({"zeit": 0.0, "ids": frozenset()})
    community._wx_cache.clear()


def test_kein_endpunkt_verraet_den_echten_ort(client):
    kopf, uid = _konto(client, "ort-ausgaenge@b.de")
    fremd, _ = _konto(client, "ort-ausgaenge-leser@b.de")
    client.put("/api/settings", headers=kopf, json={"public_profile": {"enabled": True, "titles": True,
                                                                       "media": True, "spots": True}})
    sid = _verborgene_session(uid, _spot())
    _cache_leeren()

    endpunkte = [
        f"/api/sessions/{sid}",
        f"/api/sessions/{sid}/attempts",
        f"/api/sessions/{sid}/carves",
        "/api/community/sessions?period=all&accel_only=false",
        "/api/community/records?accel_only=false&sport=pumpfoil",
        "/api/community/records?accel_only=true&sport=pumpfoil",
        "/api/community/spot-records?spot=Point%20Nemo&accel_only=false&sport=pumpfoil",
        "/api/community/latest-photos?limit=20",
        "/api/community/spot-compare?accel_only=false",
        "/api/community/spot-map?accel_only=false&sport=all",
        f"/api/community/foiler/{uid}",
    ]
    for url in endpunkte:
        r = client.get(url, headers=fremd)
        assert r.status_code == 200, (url, r.status_code, r.text[:300])
        for spur in SPUREN:
            assert spur not in r.text, f"{url} verraet {spur!r}"

    def eintraege(knoten):
        if isinstance(knoten, dict):
            if knoten.get("session_id") == sid:
                yield knoten
            for w in knoten.values():
                yield from eintraege(w)
        elif isinstance(knoten, list):
            for w in knoten:
                yield from eintraege(w)
    for url in endpunkte[3:]:
        for e in eintraege(client.get(url, headers=fremd).json()):
            assert e.get("tz") in (None, "UTC"), (url, e)
            assert e.get("spot") in (None, "Point Nemo"), (url, e)

    # Der Rekord haelt die verborgene Aufnahme weiterhin — nur eben an Point Nemo, in UTC.
    rec = client.get("/api/community/records?accel_only=false&sport=pumpfoil", headers=fremd).json()
    dist = rec["all"]["distance"]
    assert dist["session_id"] == sid and dist["spot"] == "Point Nemo" and dist["tz"] == "UTC", dist

    # Point Nemo hat kein Wetter — der Mittelwert der verborgenen Orte waere der echte Ort.
    r = client.get("/api/community/spot/weather?spot=Point%20Nemo", headers=fremd)
    assert r.status_code == 404, r.text

    # Detailseite: Zeitzone UTC, auch fuer den Besitzer selbst.
    assert client.get(f"/api/sessions/{sid}", headers=kopf).json()["tz"] == "UTC"


def test_startversuche_und_rohspur_liegen_an_point_nemo(client):
    kopf, uid = _konto(client, "ort-versuche@b.de")
    sid = _verborgene_session(uid, _spot())
    _cache_leeren()
    versuche = client.get(f"/api/sessions/{sid}/attempts", headers=kopf).json()["attempts"]
    assert versuche, "Testspur ohne Startversuch — der Test prueft dann nichts"
    for v in versuche:
        assert all(p[0] < -40 and p[1] < -100 for p in v["points"]), v["points"][:2]
    roh = client.get(f"/api/sessions/{sid}/raw-track", headers=kopf).json()["punkte"]
    assert roh and all(p[1] < -40 and p[2] < -100 for p in roh), roh[:2]
    assert isinstance(roh[0][0], int), "Spalte 0 bleibt die Zeit"


def test_teile_einer_aufnahme_behalten_ihren_abstand_zur_spur():
    """Versuche/Carves werden mit dem Mittelpunkt der SPUR versetzt — sonst landeten sie alle auf
    demselben Fleck statt neben ihrem Lauf."""
    spur = [(LAT, LON), (LAT + 0.002, LON + 0.002)]
    bezug = ortverbergen._mittelpunkt(spur)
    neben = (LAT + 0.01, LON)                                   # gut 1 km noerdlich
    (a, _b), = ortverbergen.versetzen([neben], bezug)
    m_nord = (a - ortverbergen.NEMO_LAT) * 111_195.0
    assert abs(m_nord - (neben[0] - bezug[0]) * 111_195.0) < 1.0, m_nord


def test_teilen_karte_zeichnet_point_nemo(client, monkeypatch):
    """share.png ist zum oeffentlichen Teilen da: Name und Spur muessen an Point Nemo ankommen."""
    from app import sharecard
    gesehen = {}

    def fake(session, ar, rings, **kw):
        gesehen.update(name=session.place_name, gj=json.loads(ar.track_geojson), rings=rings)
        return b"png"
    monkeypatch.setattr(sharecard, "render_share_png", fake)
    kopf, uid = _konto(client, "ort-teilen@b.de")
    sid = _verborgene_session(uid, _spot())
    r = client.get(f"/api/sessions/{sid}/share.png", headers=kopf)
    assert r.status_code == 200, r.text
    assert gesehen["name"] == "Point Nemo"
    lon, lat = gesehen["gj"]["coordinates"][0]
    assert lat < -40 and lon < -100, (lat, lon)
    assert not gesehen["rings"], "die Uferform waere der Ort"


def test_mcp_uebersicht_und_filter_kennen_nur_point_nemo(client):
    from app.api import mcp
    kopf, uid = _konto(client, "ort-mcp-uebersicht@b.de")
    sid = _verborgene_session(uid, _spot())
    db = SessionLocal()
    try:
        je_spot = [z["wert"] for z in mcp._get_overview(db, uid, {})["je_spot"]]
        echt = mcp._list_sessions(db, uid, {"spot": ORT})["sessions"]
        nemo = mcp._list_sessions(db, uid, {"spot": "Point Nemo"})["sessions"]
    finally:
        db.close()
    assert je_spot == ["Point Nemo"], je_spot
    assert not echt, "der Filter auf den echten Ort darf die verborgene Aufnahme nicht finden"
    assert [z["session_id"] for z in nemo] == [sid]


def test_session_chat_label_nennt_point_nemo(client):
    from app.api.chat import _scope_label_db
    kopf, uid = _konto(client, "ort-chat@b.de")
    sid = _verborgene_session(uid, _spot())
    db = SessionLocal()
    try:
        label = _scope_label_db(db, f"session:{sid}")
    finally:
        db.close()
    assert "Point Nemo" in label and ORT not in label, label
