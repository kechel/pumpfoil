"""Equipment je Sportart (19.10.2026): Standard der Sportart nur fuer unberuehrte Felder."""
import json
from types import SimpleNamespace


def _user(st):
    return SimpleNamespace(settings_json=json.dumps(st))


ST = {"foil_id": 1, "stab_id": 10, "mast_len_cm": 85,
      "equipment_je_sport": {"wingfoil": {"foil_id": 2, "mast_len_cm": 95}}}


def test_umstellen_ersetzt_nur_unberuehrtes():
    from app.equipment_sport import umstellen
    s = SimpleNamespace(foil_id=1, board_id=None, stab_id=10, mast_len_cm=85)
    assert sorted(umstellen(s, _user(ST), "pumpfoil", "wingfoil")) == ["foil_id", "mast_len_cm"]
    assert (s.foil_id, s.stab_id, s.mast_len_cm) == (2, 10, 95)   # Stab hat keinen Wing-Eintrag
    # Von Hand gewaehltes Foil bleibt
    s2 = SimpleNamespace(foil_id=7, board_id=None, stab_id=10, mast_len_cm=85)
    umstellen(s2, _user(ST), "pumpfoil", "wingfoil")
    assert s2.foil_id == 7 and s2.mast_len_cm == 95
    # Zurueck auf Pumpfoil: Pumpfoil hat keinen eigenen Eintrag -> nichts aendert sich (kein Raten)
    assert umstellen(s, _user(ST), "wingfoil", "pumpfoil") == []


def test_ohne_einstellung_keine_aenderung():
    from app.equipment_sport import beim_anlegen, umstellen
    st = {"foil_id": 1}
    s = SimpleNamespace(foil_id=1, board_id=None, stab_id=None, mast_len_cm=None)
    assert umstellen(s, _user(st), "pumpfoil", "wingfoil") == [] and s.foil_id == 1
    assert beim_anlegen(_user(st), "wingfoil", {"foil_id": 1}) == {"foil_id": 1}


def test_beim_anlegen():
    from app.equipment_sport import beim_anlegen
    assert beim_anlegen(_user(ST), "wingfoil", {"foil_id": 1, "mast_len_cm": 85, "stab_id": 10}) == \
        {"foil_id": 2, "mast_len_cm": 95, "stab_id": 10}
    # Auf der Uhr bewusst anderes Foil -> bleibt
    assert beim_anlegen(_user(ST), "wingfoil", {"foil_id": 5})["foil_id"] == 5
    # Pumpfoil-Session: unveraendert
    assert beim_anlegen(_user(ST), "pumpfoil", {"foil_id": 1}) == {"foil_id": 1}


def test_settings_bereinigt(client):
    r = client.post("/api/auth/register", json={"email": "equip@t.de", "password": "supersecret"})
    auth = {"Authorization": f"Bearer {r.json()['access_token']}"}
    roh = {"wingfoil": {"foil_id": "3", "mast_len_cm": 999, "x": 1}, "quatsch": {"foil_id": 1}, "kitefoil": {"foil_id": None}}
    assert client.put("/api/settings", headers=auth, json={"equipment_je_sport": roh}).status_code == 200
    st = client.get("/api/settings", headers=auth).json()
    assert st["equipment_je_sport"] == {"wingfoil": {"foil_id": 3}}


def test_fremdes_board_wird_nicht_uebernommen(client):
    """Security-Review 29.10.2026: ueber equipment_je_sport liessen sich fremde private Boards ins eigene
    Setup holen (Name/Volumen erschienen dann in setup.board)."""
    from app import models
    from app.db import SessionLocal

    def konto(mail):
        r = client.post("/api/auth/register", json={"email": mail, "password": "supersecret"})
        kopf = {"Authorization": f"Bearer {r.json()['access_token']}"}
        return kopf, client.get("/api/auth/me", headers=kopf).json()["id"]
    ich, mein_id = konto("equip-ich@t.de")
    _fremd, fremd_id = konto("equip-fremd@t.de")
    db = SessionLocal()
    try:
        fremdes = models.Board(user_id=fremd_id, name="Geheimbrett")
        eigenes = models.Board(user_id=mein_id, name="Mein Brett")
        db.add_all([fremdes, eigenes]); db.commit()
        f_id, e_id = fremdes.id, eigenes.id
    finally:
        db.close()
    roh = {"wingfoil": {"board_id": f_id, "mast_len_cm": 90}, "kitefoil": {"board_id": e_id}}
    assert client.put("/api/settings", headers=ich, json={"equipment_je_sport": roh}).status_code == 200
    st = client.get("/api/settings", headers=ich).json()["equipment_je_sport"]
    assert st == {"wingfoil": {"mast_len_cm": 90}, "kitefoil": {"board_id": e_id}}, st
