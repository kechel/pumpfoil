"""Performance-Reiter (18.11.2026): eigene Tagesplatzierung gegen alle Fahrer derselben Sportart am selben Tag."""
import json
import secrets
from datetime import datetime, timedelta, timezone


def _konto(client, mail):
    r = client.post("/api/auth/register", json={"email": mail, "password": "supersecret"})
    kopf = {"Authorization": f"Bearer {r.json()['access_token']}"}
    return client.get("/api/auth/me", headers=kopf).json()["id"], kopf


def _nutzer(mail):
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        u = models.User(email=mail, password_hash="x", display_name=mail.split("@")[0])
        db.add(u); db.commit()
        return u.id
    finally:
        db.close()


def _session(uid, tag, sprint_mps, dist_m, foil_s=None):
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        s = models.Session(session_uuid=secrets.token_hex(16), user_id=uid, started_at=tag,
                           ended_at=tag + timedelta(minutes=30), sport="pumpfoil", sport_class="pumpfoil",
                           is_pumpfoil=True, status="analyzed", data_quality="ok")
        db.add(s); db.flush()
        db.add(models.AnalysisResult(session_id=s.id, algo_version="test", detection="model", num_runs=3,
                                     best_distance_m=dist_m, best_duration_s=dist_m / 4, best_speed_mps=sprint_mps + 1,
                                     foiling_time_s=foil_s, best_distance_idx=2,
                                     sprint_100m_mps=sprint_mps, sprint_60s_mps=None,
                                     sprint_json=json.dumps({"v": 7, "best": {"sprint_100m": sprint_mps},
                                                             "lauf": {"sprint_100m": 1}})))
        db.commit()
        return s.id
    finally:
        db.close()


def test_platz_feld_und_mindestfeld(client):
    from app.api import community
    community._PERF_CACHE.clear()
    k = secrets.token_hex(3)
    tag = datetime(2026, 9, 3, 10, tzinfo=timezone.utc)
    ich, kopf = _konto(client, f"perf-ich-{k}@t.de")
    andere = [_nutzer(f"perf-{i}-{k}@t.de") for i in range(5)]   # direkt angelegt (Registrierung ist gedrosselt)
    sid = _session(ich, tag, 5.0, 300.0)
    for i, uid in enumerate(andere):          # 4.0, 4.5, 5.5, 6.0, 6.5 -> ich bin 4. von 6 beim Sprint
        _session(uid, tag, [4.0, 4.5, 5.5, 6.0, 6.5][i], 100.0 + i)
    # zweiter Tag mit nur mir: Feld 1 < Mindestfeld -> zaehlt nicht
    _session(ich, tag + timedelta(days=1), 7.0, 500.0)
    d = client.get("/api/community/performance?sport=pumpfoil", headers=kopf).json()
    sp = [z for z in d["kategorien"]["sprint_100m"] if z["tag"] == "2026-09-03"]
    assert sp and sp[0]["platz"] == 4 and sp[0]["feld"] >= 6 and sp[0]["session_id"] == sid
    assert not [z for z in d["kategorien"]["sprint_100m"] if z["tag"] == "2026-09-04"]
    ld = [z for z in d["kategorien"]["run_distance"] if z["tag"] == "2026-09-03"][0]
    assert ld["platz"] == 1 and ld["perzentil"] == 100.0
    # Einzel-Lauf-Kategorien verweisen auf den Lauf, die Tagessumme nicht
    assert sp[0]["run_idx"] == 1 and ld["run_idx"] == 2


def test_performance_foil_scoot_nur_mit_pumpfoil(client):
    """Foil Scoot gibt es nur als Mischung mit Pumpfoil (Jan 18.11.2026); ein altes `foil_scoot` landet dort."""
    _, kopf = _konto(client, f"perf-mix-{secrets.token_hex(3)}@t.de")
    for frage, sport in (("foil_scoot", "pumpfoil+foil_scoot"), ("pumpfoil%2Bfoil_scoot", "pumpfoil+foil_scoot"),
                         ("pumpfoil+foil_scoot", "pumpfoil+foil_scoot"), ("wingfoil", "pumpfoil")):
        assert client.get(f"/api/community/performance?sport={frage}", headers=kopf).json()["sport"] == sport



def test_zeit_auf_dem_foil_ist_tagessumme(client):
    """Kategorie `foil_time_day` (Vorschlag eines Fahrers, 19.11.2026): Summe der Zeit auf dem Foil aller Sessions des Tages,
    nicht der Bestwert einer Session. `run_time` bleibt fuer aeltere Apps in der Antwort."""
    from app.api import community
    community._PERF_CACHE.clear()
    k = secrets.token_hex(3)
    tag = datetime(2026, 9, 10, 9, tzinfo=timezone.utc)
    ich, kopf = _konto(client, f"perf-ft-{k}@t.de")
    andere = [_nutzer(f"perf-ft-{i}-{k}@t.de") for i in range(5)]
    _session(ich, tag, 5.0, 300.0, foil_s=400)                    # zwei Sessions: 400 + 500 = 900 s
    gross = _session(ich, tag + timedelta(hours=3), 5.0, 200.0, foil_s=500)
    for i, uid in enumerate(andere):                              # 600, 700, 800, 1000, 1100 s an einem Stueck
        _session(uid, tag, 4.0, 100.0, foil_s=[600, 700, 800, 1000, 1100][i])
    d = client.get("/api/community/performance?sport=pumpfoil", headers=kopf).json()
    z = [x for x in d["kategorien"]["foil_time_day"] if x["tag"] == "2026-09-10"][0]
    assert "run_idx" not in z
    assert z["wert"] == 900 and z["platz"] == 3 and z["session_id"] == gross     # Summe schlaegt 600/700/800
    assert "run_time" in d["kategorien"]


def test_saison_punkte(client):
    """Saison-Punkte (ab 1.1.2027): Platz 1-10 je Kategorie und Tag 25/20/16/…, nur ab Mindestfeld; +1 je Tag auf dem Wasser,
    auch an kleinen Tagen. Hier an einem eigenen Tag 2026 nachgerechnet (die Saison selbst startet erst 2027)."""
    from app.api import community
    from app.db import SessionLocal
    community._PERF_CACHE.clear()
    community._SAISON_CACHE.clear()
    k = secrets.token_hex(3)
    tag = datetime(2026, 9, 20, 9, tzinfo=timezone.utc)
    ich, kopf = _konto(client, f"saison-{k}@t.de")
    andere = [_nutzer(f"saison-{i}-{k}@t.de") for i in range(5)]
    _session(ich, tag, 7.0, 900.0, foil_s=1200)                 # ueberall vorne: 100 m, Strecke, Zeit auf dem Foil
    for i, uid in enumerate(andere):
        _session(uid, tag, 4.0 + i * 0.3, 100.0 + i, foil_s=300 + i)
    _session(ich, tag + timedelta(days=1), 5.0, 100.0, foil_s=100)   # allein: nur der Mitmach-Punkt
    db = SessionLocal()
    try:
        tab = community._saison_tabelle(db, "pumpfoil", "2026-09-20", "2026-09-21")
    finally:
        db.close()
    e = tab[ich]
    assert e["platzpunkte"] == 25 * 3          # 100 m, laengster Lauf, Zeit auf dem Foil (Minute fehlt in den Testdaten)
    assert e["tage"] == 2 and e["punkte"] == 75 + 2
    assert tab[andere[4]]["platzpunkte"] == 20 * 3 and tab[andere[0]]["platzpunkte"] == 9 * 3
    d = client.get("/api/community/performance?sport=pumpfoil", headers=kopf).json()
    s = d["saison"]
    assert s["jahr"] == 2027 and s["regel"]["platz"][:3] == [25, 20, 16] and s["regel"]["max_tag"] == 101
    if not s["gestartet"]:
        assert s["punkte"] == 0 and s["rang"] is None


def test_heute_ist_vorlaeufig(client):
    """Der laufende Tag (UTC) traegt `vorlaeufig` (Web/Apps hinterlegen ihn gelb), vergangene Tage nicht."""
    from app.api import community
    community._PERF_CACHE.clear()
    k = secrets.token_hex(3)
    jetzt = datetime.now(timezone.utc).replace(hour=0, minute=5, second=0, microsecond=0)
    ich, kopf = _konto(client, f"perf-heute-{k}@t.de")
    andere = [_nutzer(f"perf-h{i}-{k}@t.de") for i in range(5)]
    for t in (jetzt, jetzt - timedelta(days=1)):
        _session(ich, t, 5.0, 300.0)
        for i, uid in enumerate(andere):
            _session(uid, t, 4.0 + i * 0.1, 100.0 + i)
    d = client.get("/api/community/performance?sport=pumpfoil", headers=kopf).json()
    z = {x["tag"]: x for x in d["kategorien"]["sprint_100m"]}
    assert z[jetzt.date().isoformat()].get("vorlaeufig") is True
    assert "vorlaeufig" not in z[(jetzt - timedelta(days=1)).date().isoformat()]
    assert d["aktualisierung_min"] == 10
