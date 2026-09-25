"""„Ort verbergen": die Spur bleibt formtreu, der Ort wird ersetzt.

Geprueft wird genau das, was beim Versetzen schiefgehen KANN und niemandem auffallen wuerde: dass
sich die Laengen aendern. Wer Koordinaten in Grad addiert, staucht oder streckt die Spur je nach
Breitengrad — die gezeichnete Strecke passte dann nicht mehr zu den Zahlen daneben.
"""
from __future__ import annotations

import math

from app.ortverbergen import NEMO_LAT, NEMO_LON, ist_verborgen, versetzen

_R = 6_371_000.0


def _meter(a: tuple[float, float], b: tuple[float, float]) -> float:
    dlat = math.radians(b[0] - a[0])
    dlon = math.radians(b[1] - a[1]) * math.cos(math.radians((a[0] + b[0]) / 2))
    return _R * math.hypot(dlat, dlon)


def _quadrat(lat: float, lon: float, kante_m: float = 500.0):
    d = kante_m / (math.pi * _R / 180.0)
    dl = d / math.cos(math.radians(lat))
    return [(lat, lon), (lat + d, lon), (lat + d, lon + dl), (lat, lon + dl), (lat, lon)]


def test_laengen_bleiben_erhalten():
    """Der eigentliche Test. 54° Nord nach 49° Sued: in Grad gerechnet waere die Ost-West-Kante
    rund 14 % zu lang."""
    spur = _quadrat(54.0, 10.0)
    neu = versetzen(spur)
    for i in range(len(spur) - 1):
        vorher, nachher = _meter(spur[i], spur[i + 1]), _meter(neu[i], neu[i + 1])
        assert abs(nachher - vorher) < 1.0, (i, vorher, nachher)


def test_funktioniert_auf_beiden_halbkugeln_und_am_aequator():
    for lat, lon in ((54.0, 10.0), (-33.9, 151.2), (0.5, 73.0), (64.1, -21.9)):
        spur = _quadrat(lat, lon)
        neu = versetzen(spur)
        for i in range(len(spur) - 1):
            assert abs(_meter(neu[i], neu[i + 1]) - _meter(spur[i], spur[i + 1])) < 1.0, (lat, i)


def test_mittelpunkt_landet_auf_point_nemo():
    neu = versetzen(_quadrat(54.0, 10.0))
    assert abs(sum(p[0] for p in neu) / len(neu) - NEMO_LAT) < 1e-6
    assert abs(sum(p[1] for p in neu) / len(neu) - NEMO_LON) < 1e-6


def test_zwei_verschiedene_orte_landen_am_selben_fleck():
    """Sonst liesse sich aus der Lage zweier verborgener Aufnahmen ihr Abstand ablesen."""
    a = versetzen(_quadrat(54.0, 10.0))
    b = versetzen(_quadrat(-33.9, 151.2))
    assert _meter((sum(p[0] for p in a) / len(a), sum(p[1] for p in a) / len(a)),
                  (sum(p[0] for p in b) / len(b), sum(p[1] for p in b) / len(b))) < 1.0


def test_norden_bleibt_norden():
    """Gedreht wird NICHT — die Beziehung zwischen Spur und Windrichtung bleibt lesbar."""
    spur = [(54.0, 10.0), (54.01, 10.0)]     # exakt nach Norden
    neu = versetzen(spur)
    assert neu[1][0] > neu[0][0]
    assert abs(neu[1][1] - neu[0][1]) < 1e-9


def test_leere_spur_bleibt_leer():
    assert versetzen([]) == []


class _S:
    def __init__(self, wert):
        self.ort_sichtbarkeit = wert


def test_drei_zustaende_in_beide_richtungen():
    """Der Grund fuer drei statt zwei Zustaenden: NULL heisst „folgt dem Profil", nicht „nein"."""
    assert ist_verborgen(_S(None), True) is True      # Profil verbirgt -> auch alte Aufnahmen
    assert ist_verborgen(_S(None), False) is False
    assert ist_verborgen(_S("show"), True) is False   # einzelne Freigabe trotz Profil
    assert ist_verborgen(_S("hide"), False) is True   # einzelnes Verbergen trotz Profil


# --- Am echten Ausgabeweg ----------------------------------------------------------------------

def _konto(client, mail):
    r = client.post("/api/auth/register", json={"email": mail, "password": "supersecret"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _session_mit_spur(uid, **f):
    import json as _json
    import secrets
    from datetime import datetime, timedelta, timezone

    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        s = models.Session(session_uuid=secrets.token_hex(16), user_id=uid,
                           started_at=datetime.now(timezone.utc) - timedelta(hours=2),
                           ended_at=datetime.now(timezone.utc) - timedelta(hours=1),
                           sport="pumpfoil", is_pumpfoil=True, status="done",
                           place_name="Jettkofen", place_water="Federsee",
                           place_lat=48.07, place_lon=9.35, spot_id=f.pop("spot_id", 42), **f)
        db.add(s); db.flush()
        db.add(models.AnalysisResult(
            # `num_runs`/`detection` gesetzt, sonst faellt die Aufnahme aus dem Community-Feed:
            # der nimmt nur, was eine erkannte Fahrt ist (s. `_community`).
            session_id=s.id, algo_version="test", detection="model", num_runs=1,
            foiling_distance_m=400.0, foiling_time_s=120.0,
            track_geojson=_json.dumps({"type": "LineString",
                                       "coordinates": [[9.35, 48.07], [9.351, 48.071]]})))
        db.commit()
        return s.id
    finally:
        db.close()


def _detail(client, kopf, sid):
    r = client.get(f"/api/sessions/{sid}", headers=kopf)
    assert r.status_code == 200, r.text
    return r.json()


def test_sichtbar_solange_niemand_etwas_umstellt(client):
    kopf = _konto(client, "ort-normal@b.de")
    uid = client.get("/api/auth/me", headers=kopf).json()["id"]
    d = _detail(client, kopf, _session_mit_spur(uid))
    assert d["place_name"] == "Jettkofen" and d["spot_id"] == 42
    assert d["ort_verborgen"] is False
    assert d["analysis"]["track_geojson"]["coordinates"][0] == [9.35, 48.07]


def test_einzelne_aufnahme_verbergen(client):
    kopf = _konto(client, "ort-einzeln@b.de")
    uid = client.get("/api/auth/me", headers=kopf).json()["id"]
    d = _detail(client, kopf, _session_mit_spur(uid, ort_sichtbarkeit="hide"))
    assert d["ort_verborgen"] is True
    assert d["place_name"] == "Point Nemo"
    assert d["place_water"] is None, "der Gewaessername waere ein Hinweis"
    assert d["spot_id"] is None, "sonst haengt sie weiter an der echten Spot-Seite"
    lon, lat = d["analysis"]["track_geojson"]["coordinates"][0]
    assert lat < -40 and lon < -100, (lat, lon)


def test_profil_verbirgt_rueckwirkend_und_einzeln_freigeben_geht(client):
    """Der Fall, der zaehlt: der Schalter im Profil erreicht auch ALTE Aufnahmen."""
    kopf = _konto(client, "ort-profil@b.de")
    uid = client.get("/api/auth/me", headers=kopf).json()["id"]
    alt = _session_mit_spur(uid)                              # laengst hochgeladen
    frei = _session_mit_spur(uid, ort_sichtbarkeit="show")    # ausdruecklich freigegeben
    assert _detail(client, kopf, alt)["ort_verborgen"] is False

    r = client.put("/api/settings", headers=kopf, json={"hide_location": True})
    assert r.status_code == 200, r.text
    assert _detail(client, kopf, alt)["ort_verborgen"] is True
    assert _detail(client, kopf, frei)["ort_verborgen"] is False


def test_besitzer_sieht_sich_selbst_an_point_nemo(client):
    """Jan, 25.09.2026: „dann sieht man sich selber an Point Nemo und weiss: so darf auch jeder
    andere sehen." Kein Sonderweg fuer den Besitzer — das IST die Verifikation."""
    kopf = _konto(client, "ort-selbst@b.de")
    uid = client.get("/api/auth/me", headers=kopf).json()["id"]
    sid = _session_mit_spur(uid, ort_sichtbarkeit="hide")
    assert _detail(client, kopf, sid)["place_name"] == "Point Nemo"


def test_feed_zeigt_point_nemo_statt_des_spots(client):
    """Der Community-Feed ist der Weg, auf den es ankommt: dort lesen ANDERE mit."""
    kopf = _konto(client, "ort-feed@b.de")
    uid = client.get("/api/auth/me", headers=kopf).json()["id"]
    offen = _session_mit_spur(uid)
    verborgen = _session_mit_spur(uid, ort_sichtbarkeit="hide")

    from app.api import community
    community._VERBERGER_CACHE.update({"zeit": 0.0, "ids": frozenset()})   # Cache nicht mitschleppen

    r = client.get("/api/community/sessions?period=all&accel_only=false", headers=kopf)
    assert r.status_code == 200, r.text
    je_id = {z["session_id"]: z for z in r.json()}
    assert je_id[offen]["spot"] == "Jettkofen"
    assert je_id[verborgen]["spot"] == "Point Nemo"
    assert je_id[verborgen]["ort_verborgen"] is True
    # Eine Ortszeit IST eine Ortsangabe — sie verraet grob den Laengengrad.
    assert je_id[verborgen]["tz"] == "UTC"


def test_mcp_verbirgt_ebenfalls(client):
    """Jan, 25.09.2026: „wir bleiben stringent … auch die Daten gehen ja an irgendeine
    Drittfirma und das koennte einen dann ueberraschen." Ein Kanal, der die Daten aus dem Haus
    gibt, ist der letzte, bei dem man eine Ausnahme macht."""
    from app.api import mcp
    from app.db import SessionLocal
    kopf = _konto(client, "ort-mcp@b.de")
    uid = client.get("/api/auth/me", headers=kopf).json()["id"]
    sid = _session_mit_spur(uid, ort_sichtbarkeit="hide")
    db = SessionLocal()
    try:
        zeilen = mcp._list_sessions(db, uid, {})["sessions"]
    finally:
        db.close()
    zeile = [z for z in zeilen if z["session_id"] == sid][0]
    assert zeile["spot"] == "Point Nemo"
    assert zeile["ort_verborgen"] is True


def test_spot_filter_verraet_nichts_und_point_nemo_sammelt(client):
    """Die gefaehrlichste Stelle des Features: wer nach dem echten Spot filtert, darf eine
    verborgene Aufnahme NICHT bekommen — sonst ist die Filterung selbst der Verrat.

    Und die Gegenrichtung (Jan, 25.09.2026): „alle Location-anonymisierten Sessions sollen dann
    nur fuer diesen Spot zaehlen und nicht da, wo sie eigentlich waren."
    """
    from app.api import community
    kopf = _konto(client, "ort-spotfilter@b.de")
    uid = client.get("/api/auth/me", headers=kopf).json()["id"]
    offen = _session_mit_spur(uid)
    verborgen = _session_mit_spur(uid, ort_sichtbarkeit="hide")
    community._VERBERGER_CACHE.update({"zeit": 0.0, "ids": frozenset()})

    def ids(spot):
        r = client.get(f"/api/community/sessions?period=all&accel_only=false&spot={spot}",
                       headers=kopf)
        assert r.status_code == 200, r.text
        return {z["session_id"] for z in r.json()}

    am_echten_spot = ids("Jettkofen")
    assert offen in am_echten_spot
    assert verborgen not in am_echten_spot, "die Filterung haette den Ort verraten"

    bei_nemo = ids("Point%20Nemo")
    assert verborgen in bei_nemo
    assert offen not in bei_nemo


def test_sql_und_python_sagen_dasselbe(client):
    """`_verborgen_cond` (SQL) und `ist_verborgen` (Python) muessen deckungsgleich sein — sonst
    verbirgt die Liste etwas anderes als die Detailansicht, und niemand merkt es."""
    from app.api import community
    from app.db import SessionLocal
    from app import models
    from app.ortverbergen import ist_verborgen, profil_verbirgt

    kopf = _konto(client, "ort-deckung@b.de")
    uid = client.get("/api/auth/me", headers=kopf).json()["id"]
    a = _session_mit_spur(uid)                            # folgt dem Profil (aus)
    b = _session_mit_spur(uid, ort_sichtbarkeit="hide")
    c = _session_mit_spur(uid, ort_sichtbarkeit="show")
    client.put("/api/settings", headers=kopf, json={"hide_location": True})
    community._VERBERGER_CACHE.update({"zeit": 0.0, "ids": frozenset()})

    db = SessionLocal()
    try:
        laut_sql = {r[0] for r in db.query(models.Session.id).filter(
            models.Session.user_id == uid, community._verborgen_cond(db)).all()}
        laut_python = set()
        for s in db.query(models.Session).filter(models.Session.user_id == uid).all():
            if ist_verborgen(s, profil_verbirgt(s.user)):
                laut_python.add(s.id)
    finally:
        db.close()
    assert laut_sql == laut_python == {a, b}, (laut_sql, laut_python, {"a": a, "b": b, "c": c})


def test_umschalter_am_endpunkt(client):
    """Der Schalter in der Session: "" muss NULL ergeben („wie im Profil"), nicht "show"."""
    kopf = _konto(client, "ort-schalter@b.de")
    uid = client.get("/api/auth/me", headers=kopf).json()["id"]
    sid = _session_mit_spur(uid)

    r = client.patch(f"/api/sessions/{sid}/meta", headers=kopf, json={"ort_sichtbarkeit": "hide"})
    assert r.status_code == 200 and r.json()["ort_verborgen"] is True

    r = client.patch(f"/api/sessions/{sid}/meta", headers=kopf, json={"ort_sichtbarkeit": ""})
    assert r.status_code == 200
    assert r.json()["ort_sichtbarkeit"] in (None, ""), "leer heisst „wie im Profil\", nicht „zeigen\""
    # Und das ist der Unterschied: jetzt greift das Profil wieder.
    client.put("/api/settings", headers=kopf, json={"hide_location": True})
    assert client.get(f"/api/sessions/{sid}", headers=kopf).json()["ort_verborgen"] is True

    r = client.patch(f"/api/sessions/{sid}/meta", headers=kopf, json={"ort_sichtbarkeit": "quatsch"})
    assert r.status_code == 400


def test_teilen_link_verbirgt_ebenfalls(client):
    """Beim normalen Teilen geht der ausdrueckliche Wunsch vor (25.09., Jan). Beim verborgenen
    ORT nicht: ein Link, der ihn doch zeigt, umgeht genau das, was der Schalter verspricht."""
    kopf = _konto(client, "ort-teilen@b.de")
    uid = client.get("/api/auth/me", headers=kopf).json()["id"]
    sid = _session_mit_spur(uid, ort_sichtbarkeit="hide")
    pfad = client.post(f"/api/sessions/{sid}/share", headers=kopf).json()["path"]
    token = pfad.rsplit("/", 1)[-1]

    r = client.get(f"/api/public/session/{token}")     # OHNE Login
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["place_name"] == "Point Nemo"
    assert d["ort_verborgen"] is True
    lon, lat = d["analysis"]["track_geojson"]["coordinates"][0]
    assert lat < -40 and lon < -100, (lat, lon)


def test_rohdaten_sind_ebenfalls_versetzt(client):
    """Der direkteste Weg an die Koordinaten — hier ist die Versetzung am wichtigsten."""
    kopf = _konto(client, "ort-roh@b.de")
    uid = client.get("/api/auth/me", headers=kopf).json()["id"]
    sid = _session_mit_spur(uid, ort_sichtbarkeit="hide")

    from app import models, storage
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        uuid = db.get(models.Session, sid).session_uuid
    finally:
        db.close()
    storage.save_gps_chunk(uuid, 0, [[0, 48.07, 9.35, 5.0, 120, 3.0],
                                     [1000, 48.071, 9.351, 5.2, 121, 3.0]])

    r = client.get(f"/api/sessions/{sid}/raw", headers=kopf)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["gps_lat"] and d["gps_lat"][0] < -40, d["gps_lat"]
    assert d["gps_lon"][0] < -100, d["gps_lon"]


def test_spotkarte_zaehlt_verborgene_nicht_mit(client):
    """Weder in der Zahl am Marker noch im Mittel seiner Koordinaten — sonst verschoebe eine
    verborgene Aufnahme den Spot und liesse sich daran ablesen."""
    from app.api import community
    kopf = _konto(client, "ort-karte@b.de")
    uid = client.get("/api/auth/me", headers=kopf).json()["id"]
    # Ohne spot_id: die Karte gruppiert solche Aufnahmen nach `place_name` und braucht keine
    # Spot-Stammdaten (zu einer erfundenen spot_id gibt es keine, der Marker fiele weg).
    _session_mit_spur(uid, spot_id=None)                              # offen
    _session_mit_spur(uid, spot_id=None, ort_sichtbarkeit="hide")     # verborgen
    community._VERBERGER_CACHE.update({"zeit": 0.0, "ids": frozenset()})

    r = client.get("/api/community/spot-map?accel_only=false&sport=all", headers=kopf)
    assert r.status_code == 200, r.text
    meiner = [m for m in r.json() if (m.get("spot") or "") == "Jettkofen"]
    assert meiner, "der offene Spot fehlt ganz"
    assert meiner[0]["sessions"] == 1, meiner[0]
    # Und keiner der Marker liegt im Pazifik.
    assert not [m for m in r.json() if m.get("lat", 0) < -40], "Point Nemo gehoert nicht auf die Uebersichtskarte"
