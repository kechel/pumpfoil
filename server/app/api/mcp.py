"""Der MCP-Server: die eigenen Aufnahmen, lesbar fuer einen KI-Agenten.

JSON-RPC 2.0 ueber HTTP („Streamable HTTP"), wie es `coros_mcp.py` auf der anderen Seite spricht.
Angemeldet wird ueber unseren eigenen OAuth-Server (`mcp_oauth.py`).

================================================================================================
DIE GRENZE. Jan, 25.09.2026, woertlich:

    „NUR LESEND, NUR EIGENE SESSIONS, keine rekorde oder infos ueber andere aus dem bestand oder
     gleichen spot, kein zugriff auf chats oder feedback oder bewertungen oder medien oder
     bilder, nur die surfspezifischen daten"
    „auch keine aussortierten sessions oder geloeschte"
    „oeffentlich bei uns heisst benutzer mit login, aber nicht ‚fremde ki firmen', denen gibt man
     genau darauf dann den zugriff auf nur genau die eigenen daten"

Deshalb gibt es `_eigene()` weiter unten, und JEDES Werkzeug baut darauf auf. Keines stellt seine
eigene Abfrage. Wer ein Werkzeug ergaenzt, ergaenzt es dort — sonst vergisst das fuenfte Werkzeug
eine der drei Bedingungen, und niemand merkt es.

NICHT erreichbar, auch nicht „nur als Vergleichswert": fremde Aufnahmen, Community- und
Spot-Rekorde, Bestenlisten, Chats, Feedback, Bewertungen, Fotos, Videos, Vorschaubilder,
aussortierte und geloeschte Aufnahmen. Und nichts Schreibendes.
================================================================================================
"""
from __future__ import annotations

import json
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db
from .. import ortverbergen
from ..ratelimit import enforce_user_tiers
from ..tzlookup import tz_name
from .mcp_oauth import RESOURCE, SCOPE, access_token_pruefen

router = APIRouter(tags=["mcp"])

# Jans Vorgabe: 200 Aufrufe je Stunde und NUTZER (25.09.2026 von 100 angehoben, nachdem eine
# echte Wochenauswertung ueber 50 Abrufe brauchte und in die Grenze lief). Die zweite Stufe faengt
# den Fall ab, dass ein Agent in einer Schleife haengt — 200 in einer Stunde sind in Ordnung,
# 200 in einer Minute nicht.
LIMITS = [(200, 3600), (20, 60)]

# Jeder Lauf einzeln kostet Platz im Kontextfenster des Agenten. Mehr als das gibt eine Antwort
# nicht her; wer mehr will, blaettert.
MAX_SESSIONS = 50
# Mit allen Laeufen einzeln wird eine Zeile schnell zehnmal so lang — eine Aufnahme mit 40 Laeufen
# traegt 40 Bloecke. Deshalb ein eigenes, viel kleineres Limit fuer diesen Fall.
MAX_MIT_LAEUFEN = 10


def _eigene(db: Session, user_id: int):
    """DIE Basisabfrage. Alles, was der MCP je zu sehen bekommt, kommt hier durch.

    Drei Bedingungen, alle drei aus Jans Grenze oben:
      * `user_id` — nur die eigenen,
      * `deleted` — nichts Geloeschtes,
      * `is_pumpfoil is True` — nichts Aussortiertes. Bewusst `is_(True)` und nicht `isnot(False)`:
        eine noch nicht eingeordnete Aufnahme (NULL) ist ebenfalls nichts, was der Agent sehen
        soll — sie koennte die Autofahrt heim sein.
    """
    return (db.query(models.Session)
              .filter(models.Session.user_id == user_id,
                      models.Session.deleted.isnot(True),
                      models.Session.is_pumpfoil.is_(True)))


def _zaehlen(db: Session, user_id: int, werkzeug: str) -> None:
    """Betriebszaehler fuer die Admin-Ansicht: ein Eintrag je Tag, Nutzer und Werkzeug."""
    stmt = pg_insert(models.McpCallStat).values(
        tag=datetime.now(timezone.utc).date(), user_id=user_id, werkzeug=werkzeug[:48], zahl=1)
    db.execute(stmt.on_conflict_do_update(
        index_elements=["tag", "user_id", "werkzeug"],
        set_={"zahl": models.McpCallStat.zahl + 1}))
    db.commit()


# --- Die Erklaerung fuer den Agenten -----------------------------------------------------------
#
# Der wichtigste Text hier. Ohne ihn rechnet ein Agent selbstbewussten Unsinn aus unseren Zahlen,
# und es faellt niemandem auf — am wenigsten dem Nutzer, der die Antwort glaubt. Alles darin ist
# belegt in docs/DATA-PIPELINE.md und docs/GROUND-TRUTH.md; wer dort etwas aendert, aendert es
# hier mit.

ANLEITUNG = """Pumpfoil.org — die eigenen Aufnahmen eines Pumpfoil-Fahrers.

WO MAN ANFAENGT
Rufe ZUERST `get_overview` auf. Es sagt in einer Antwort, was es ueberhaupt gibt — Aufnahmen je
Sportart, Spot, Geraet und Jahr, der Zeitraum, und wie viele davon am Brett aufgenommen wurden.
Die Werte darin sind genau die, die `list_sessions` als Filter erwartet. Ohne diesen Schritt raetst
du Spot- und Sportartnamen oder ziehst erst einmal alles; beides kostet Platz und liefert
schlechtere Antworten.

WAS HIER ZU HABEN IST
Nur die Aufnahmen des Nutzers, der diesen Zugang genehmigt hat, und nur lesend. Keine Daten
anderer Fahrer, keine Rekorde, keine Bestenlisten, keine Vergleichswerte vom selben Spot — auch
nicht aggregiert. Keine Fotos, Videos, Chats oder Bewertungen. Aussortierte und geloeschte
Aufnahmen fehlen ebenfalls. Wenn eine Frage Vergleichsdaten braeuchte, sage das, statt zu raten.

WAS GEMESSEN IST UND WAS GERECHNET
Jede Zahl traegt, woher sie kommt. Achte darauf, bevor du sie deutest:

* `accel_hz` ist die ANFORDERUNG an die Uhr, keine Messung. Die tatsaechliche Rate steht in
  `accel_hz_measured`. Rechne NIE mit der angeforderten — Garmin haelt 25 Hz ein, Wear und Apple
  liefern geraetespezifisch auch 50 Hz, Handys 100 bis 125 Hz.
* Beschleunigungswerte haben KEINE Zeitstempel. Die Zeitachse wird gebaut, und `time_base` sagt
  wie: `exact_chunks` (aus echten Blockzeiten, genau) oder `measured_rate` (eine
  Durchschnittsrate, Probe 0 bei t=0). Bei `measured_rate` sind Aussagen zu einzelnen Zeitpunkten
  unsicher, Aussagen ueber Verteilungen bleiben brauchbar.
* `longest_glide_s` ist die laengste LUECKE ZWISCHEN ZWEI ERKANNTEN PUMPS, keine gemessene
  Gleitphase. Ein hoher Wert heisst in der Praxis meist „hier wurden Pumps nicht erkannt" und
  gerade NICHT „hier wurde lange geglitten". Benutze ihn nicht als Leistungsmass.
* Die Pumpzaehlung ist an EINEM Fahrer geeicht und unterzaehlt ungefaehr um das Doppelte. Sie
  taugt fuer den Vergleich einer Aufnahme mit einer anderen desselben Fahrers, nicht als
  absolute Zahl.
* Eine Gleit-Erkennung gibt es NICHT. Wo „Gleiten" steht, ist immer die Luecke zwischen Pumps
  gemeint.
* `detection` sagt, worauf die Lauferkennung stand: `gps_only` heisst, es gab keine brauchbaren
  Beschleunigungsdaten — dann sind Pumps und Takt nicht vorhanden, nicht null.

LAGE DES BRETTS (nur wenn das Handy am Brett sass) — `get_board_attitude(session_id)`
Diese Zahlen stehen NICHT in `get_session` — sie werden bei jedem Abruf aus den Rohdaten
gerechnet und haben deshalb einen eigenen Aufruf. `get_session` sagt im Feld `lage_je_lauf`, ob es
sie fuer die Aufnahme gibt.

Nicken und Rollen kommen aus einem komplementaeren Filter ueber Beschleunigung und Kreisel. Wie
das Handy montiert war, wird JE LAUF aus den Daten bestimmt, nicht vom Nutzer angegeben. Der Hub
(die Auf-/Abbewegung) erscheint nur, wenn der Pumptakt sicher erkannt war; sonst fehlt er, und
das Fehlen ist die ehrliche Antwort. Gieren wird bewusst nicht ausgewertet: es ist die frei
gewaehlte Route und sagt nichts ueber Technik.

PULS
`get_session` traegt je Aufnahme und je Lauf Durchschnitt, Hoechstwert und den tiefsten Wert,
`list_sessions` mit `mit_laeufen` ebenso je Lauf. Die Reihe selbst — ein Wert je Sekunde oder je
10 Sekunden — gibt es nur ueber `get_run_heart_rate(session_id, lauf, intervall_s)`; `lauf` ist
genau das Feld `lauf` aus `laeufe_einzeln` (ab 0; in der App heisst er „Lauf lauf+1").
* Einen echten RUHEPULS messen wir nicht (der wird morgens in Ruhe erhoben). `tiefster_puls` ist
  der niedrigste Wert der Aufnahme, meist in einer Pause am Ufer; `start_puls` eines Laufs ist der
  erste Messwert darin, also der Ausgangspuls, von dem aus der Lauf anstieg.
* Stehengebliebene Werte (derselbe Wert zwei Minuten lang: der Sensor hing) sind herausgenommen
  und erscheinen als `null` — sie waeren kein Messwert.
* Der Puls haengt an den GPS-Punkten, also rund einer pro Sekunde. Feiner gibt es ihn nicht.

AUSRUESTUNG
Bei Foils, Stabilisatoren und Boards steht je Mass, ob es aus dem Herstellerkatalog stammt oder
geschaetzt ist (`geschaetzt: true`). Rechne nichts Physikalisches ohne diesen Blick — eine
geratene Rumpflaenge traegt keine Auftriebsrechnung.

EINHEITEN
Meter, Sekunden, Meter je Sekunde, Grad, Hertz. Zeiten sind ISO-8601 mit Zeitzone. Geschwindigkeit
NIE in km/h, ausser es steht ausdruecklich im Feldnamen.
"""


# --- Werkzeuge ---------------------------------------------------------------------------------

WERKZEUGE = [
    {"name": "get_overview",
     "description": "ZUERST DIESE AUFRUFEN. Ein Ueberblick ueber den ganzen Bestand des Nutzers: "
                    "wie viele Aufnahmen es je Sportart, Spot, Geraet und Jahr gibt, von wann bis "
                    "wann, und was davon auswertbar ist. Die Werte in den Listen sind GENAU die, "
                    "die `list_sessions` als Filter erwartet — damit laesst sich jede weitere "
                    "Abfrage gezielt stellen, statt zu raten.",
     "inputSchema": {"type": "object", "properties": {}}},
    {"name": "list_sessions",
     "description": "Die eigenen Aufnahmen, neueste zuerst. Ohne Angaben die letzten 20.",
     "inputSchema": {"type": "object", "properties": {
         "von": {"type": "string", "description": "Datum ab, JJJJ-MM-TT"},
         "bis": {"type": "string", "description": "Datum bis, JJJJ-MM-TT"},
         "sportart": {"type": "string"},
         "spot": {"type": "string", "description": "Teil des Ortsnamens"},
         "limit": {"type": "integer", "minimum": 1, "maximum": MAX_SESSIONS},
         "offset": {"type": "integer", "minimum": 0},
         "mit_laeufen": {"type": "boolean",
                         "description": "Jeden Lauf einzeln mitliefern statt nur die Summen. "
                                        "Das ist VIEL mehr Text — deshalb gilt dann ein Limit "
                                        "von hoechstens " + str(MAX_MIT_LAEUFEN) + " Aufnahmen "
                                        "je Abruf. Fuer eine Uebersicht ueber viele Aufnahmen "
                                        "reichen die Summen und der beste Lauf, die ohnehin in "
                                        "jeder Zeile stehen."}}}},
    {"name": "get_session",
     "description": "Eine eigene Aufnahme mit allem, was wir dazu gerechnet haben: Kennzahlen, "
                    "Laeufe einzeln, Lage des Bretts je Lauf (falls das Handy am Brett sass), "
                    "Ausruestung, und die Herkunft jeder Zahl.",
     "inputSchema": {"type": "object", "properties": {
         "session_id": {"type": "integer"}}, "required": ["session_id"]}},
    {"name": "get_board_attitude",
     "description": "Nicken und Rollen JE LAUF fuer eine Aufnahme, die mit dem Handy am Brett "
                    "entstanden ist. Wird bei jedem Aufruf frisch gerechnet (die Rohdaten stehen "
                    "nicht als Ergebnis in der Datenbank), deshalb ein eigener Aufruf und nicht "
                    "Teil von get_session. Nur sinnvoll, wenn `am_brett` wahr ist — sonst misst "
                    "das Geraet den Fahrer und nicht das Brett.",
     "inputSchema": {"type": "object", "properties": {
         "session_id": {"type": "integer"}}, "required": ["session_id"]}},
    {"name": "get_run_heart_rate",
     "description": "Der Puls EINES Laufs als Reihe: ein Wert je Sekunde oder je 10 Sekunden "
                    "(Mittel der Messwerte im Abschnitt). `lauf` ist das Feld `lauf` aus "
                    "`laeufe_einzeln` in get_session. Die Zusammenfassung je Lauf (Durchschnitt, "
                    "Hoechstwert, Start) steht schon in get_session — diesen Aufruf nur fuer den "
                    "Verlauf im Lauf.",
     "inputSchema": {"type": "object", "properties": {
         "session_id": {"type": "integer"},
         "lauf": {"type": "integer", "minimum": 0},
         "intervall_s": {"type": "integer", "enum": [1, 10],
                         "description": "1 oder 10 Sekunden je Wert; ohne Angabe 10."}},
         "required": ["session_id", "lauf"]}},
    {"name": "get_stats",
     "description": "Summen und Bestwerte des Nutzers ueber einen Zeitraum — damit man nicht "
                    "jede Aufnahme einzeln ziehen muss.",
     "inputSchema": {"type": "object", "properties": {
         "von": {"type": "string"}, "bis": {"type": "string"}}}},
    {"name": "list_equipment",
     "description": "Die eigene Ausruestung: Foils, Stabilisatoren, Boards — je Mass mit der "
                    "Angabe, ob es aus dem Katalog stammt oder geschaetzt ist.",
     "inputSchema": {"type": "object", "properties": {}}},
]


def _iso(d: datetime | None) -> str | None:
    return d.isoformat() if d else None


def _tag(s: str | None) -> date | None:
    try:
        return date.fromisoformat(s) if s else None
    except ValueError:
        return None


def _kurz(s: models.Session, ar: models.AnalysisResult | None) -> dict:
    """Eine Zeile fuer `list_sessions`. Bewusst schmal — der Agent holt Details einzeln nach."""
    verborgen = ortverbergen.ist_verborgen(
        s, ortverbergen.profil_verbirgt(getattr(s, "user", None)))
    return {
        "session_id": s.id,
        "start": _iso(s.started_at),
        "ende": _iso(s.ended_at),
        # `tz` ist KEINE Spalte, sondern wird aus der Position abgeleitet (wie
        # ueberall sonst in der API). Ohne Position gibt es keine — dann bleibt UTC.
        # Bei verborgenem Ort faellt sie weg: eine Ortszeit IST eine Ortsangabe.
        "zeitzone": ("UTC" if verborgen else tz_name(s.place_lat, s.place_lon)),
        "ort_verborgen": verborgen,
        "sportart": s.sport,
        # „ORT VERBERGEN" GILT AUCH HIER (Jan, 25.09.2026). Erst war der MCP ausgenommen — es
        # fragt ja der Besitzer seine eigenen Daten ab. Jans Einwand kurz darauf gab den
        # Ausschlag: „wir bleiben stringent … auch die Daten gehen ja an irgendeine Drittfirma
        # und das koennte einen dann ueberraschen."
        # Genau das ist der Punkt. Der Schalter ist ein Versprechen ueber den ORT, nicht ueber
        # einen bestimmten Kanal — und ein Kanal, der die Daten aus dem Haus gibt, ist der
        # letzte, bei dem man eine Ausnahme machen sollte.
        "spot": (ortverbergen.NEMO_NAME if verborgen else s.place_name),
        "geraet": s.device_model,
        "am_brett": s.placement == "board",
        "laeufe": (ar.num_runs if ar else None),
        "strecke_m": (ar.total_distance_m if ar else None),
        "foil_strecke_m": (ar.foiling_distance_m if ar else None),
        "foil_zeit_s": (ar.foiling_time_s if ar else None),
        "max_speed_mps": (ar.max_speed_mps if ar else None),
        "pumps": (ar.pump_count if ar else None),
        "erkennung": (ar.detection if ar else None),
        # DER BESTE LAUF GEHOERT IN DIE ZEILE (25.09.2026). Jans Agent brauchte die laengste
        # Lauf-Dauer je Aufnahme, fand sie nur in `get_session` und rief deshalb ueber fuenfzig
        # Mal einzeln an — bis das Kontingent griff. Die Werte stehen als Spalten in derselben
        # Analyse-Zeile, die hier ohnehin schon geladen ist: sie kosten nichts.
        "bester_lauf_dauer_s": (ar.best_duration_s if ar else None),
        "bester_lauf_strecke_m": (ar.best_distance_m if ar else None),
        "bester_lauf_max_speed_mps": (ar.best_speed_mps if ar else None),
    }


def _list_sessions(db: Session, user_id: int, arg: dict) -> dict:
    q = _eigene(db, user_id)
    von, bis = _tag(arg.get("von")), _tag(arg.get("bis"))
    if von:
        q = q.filter(models.Session.started_at >= datetime(von.year, von.month, von.day,
                                                           tzinfo=timezone.utc))
    if bis:
        q = q.filter(models.Session.started_at < datetime(bis.year, bis.month, bis.day,
                                                          tzinfo=timezone.utc).replace(hour=23, minute=59, second=59))
    if arg.get("sportart"):
        q = q.filter(models.Session.sport == str(arg["sportart"])[:40])
    if arg.get("spot"):
        q = q.filter(models.Session.place_name.ilike(f"%{str(arg['spot'])[:80]}%"))
    gesamt = q.count()
    mit_laeufen = bool(arg.get("mit_laeufen"))
    obergrenze = MAX_MIT_LAEUFEN if mit_laeufen else MAX_SESSIONS
    limit = max(1, min(int(arg.get("limit") or (5 if mit_laeufen else 20)), obergrenze))
    offset = max(0, int(arg.get("offset") or 0))
    zeilen = q.order_by(models.Session.started_at.desc()).offset(offset).limit(limit).all()
    ars = {a.session_id: a for a in db.query(models.AnalysisResult).filter(
        models.AnalysisResult.session_id.in_([z.id for z in zeilen]))} if zeilen else {}
    sessions = []
    for z in zeilen:
        zeile = _kurz(z, ars.get(z.id))
        if mit_laeufen:
            zeile["laeufe_einzeln"] = _laeufe(ars.get(z.id), int(z.trim_start_ms or 0),
                                              _puls_reihe(z))
        sessions.append(zeile)
    aus = {"gesamt": gesamt, "offset": offset, "sessions": sessions}
    if offset + len(zeilen) < gesamt:
        aus["weiter"] = (f"Es gibt mehr: naechste Seite mit offset={offset + len(zeilen)}. "
                         f"Hoechstens {obergrenze} Aufnahmen je Abruf"
                         + (" mit `mit_laeufen`." if mit_laeufen else "."))
    return aus


def _herkunft(s: models.Session, m: dict) -> dict:
    """Woher die Zahlen dieser Aufnahme kommen. Steht in JEDER Antwort von `get_session`.

    Ohne das deutet ein Agent `accel_hz` als Messung und die Zeitachse als exakt. Beides waere
    falsch, und beides faellt niemandem auf (s. docs/DATA-PIPELINE.md).
    """
    return {
        "accel_hz_angefordert": s.accel_hz,
        "accel_hz_gemessen": m.get("accel_hz_measured"),
        "time_base": m.get("time_base"),
        "time_base_bedeutung": (
            "exact_chunks = Zeitachse aus echten Blockzeiten, genau. "
            "measured_rate = aus einer Durchschnittsrate gebaut, Probe 0 bei t=0 — "
            "Aussagen zu einzelnen Zeitpunkten sind dann unsicher."),
        "geraet": s.device_model,
        "app_version": s.app_version,
        "placement": s.placement,
        "trim_start_ms": s.trim_start_ms,
    }


def _puls_reihe(s: models.Session):
    """(t_ms, puls) der ganzen Aufnahme auf DERSELBEN Achse wie die Auswertung, oder None.

    Session-Millisekunden aus `timebase` (wie Export und Analyse), damit die Laufgrenzen aus
    `segments_json` ohne Umrechnung passen. Stehengebliebene Werte sind herausgenommen — dieselbe
    Funktion wie in der Erkennung (`puls_ohne_eingefrorene`), sonst stuenden hier Werte, die
    Kacheln und Kurve der App gar nicht zeigen. Accel wird nicht geladen (leeres Array): der
    Puls haengt an den GPS-Punkten.
    """
    import numpy as np
    from ..analysis.detect_v2 import puls_ohne_eingefrorene
    from ..analysis.timebase import build_timebase_for_session
    if not s.hr_samples:
        return None
    try:
        tb = build_timebase_for_session(s, accel=np.empty((0, 3), dtype=np.int16))
    except Exception:
        return None
    if not tb.gps:
        return None
    t = tb.t_gps_ms.astype(float)
    hr = np.array([float(p[4]) if len(p) > 4 and p[4] else np.nan for p in tb.gps])
    hr = puls_ohne_eingefrorene(t, hr)
    if np.isnan(hr).all():
        return None
    return t, hr


def _puls_zusammen(t, hr, a_ms: float | None = None, b_ms: float | None = None) -> dict:
    """Durchschnitt, Hoechstwert, tiefster und erster Messwert im Fenster (ganz ohne Fenster:
    die ganze Aufnahme). Ohne Messwert alles None — nicht 0, das waere ein Messwert."""
    import numpy as np
    m = np.ones(t.shape, dtype=bool)
    if a_ms is not None:
        m &= t >= a_ms
    if b_ms is not None:
        m &= t <= b_ms
    w = hr[m]
    w = w[~np.isnan(w)]
    if not w.size:
        return {"avg_puls": None, "max_puls": None, "tiefster_puls": None, "start_puls": None}
    return {"avg_puls": int(round(float(w.mean()))), "max_puls": int(w.max()),
            "tiefster_puls": int(w.min()), "start_puls": int(w[0])}


def _laeufe(ar: models.AnalysisResult | None, off: int, puls=None) -> list[dict]:
    if ar is None or not ar.segments_json:
        return []
    try:
        segmente = json.loads(ar.segments_json)
    except ValueError:
        return []
    aus = []
    for i, g in enumerate(segmente):
        start = g.get("t_start_session_ms", (g.get("t_start_ms") or 0) + off)
        ende = g.get("t_end_session_ms", (g.get("t_end_ms") or 0) + off)
        aus.append({
            "lauf": i,
            # Die App zaehlt ab 1 — ohne diese Zeile spricht der Agent von „Lauf 3", wo der
            # Nutzer „Lauf 4" sieht.
            "lauf_nr_in_app": i + 1,
            "start_ms_ab_sessionbeginn": start,
            "ende_ms_ab_sessionbeginn": ende,
            "dauer_s": round((ende - start) / 1000.0, 1),
            "strecke_m": g.get("distance_m"),
            "max_speed_mps": g.get("max_speed_mps"),
            "avg_speed_mps": g.get("avg_speed_mps"),
            "pumps": g.get("pump_count"),
            "takt_hz": g.get("cadence_hz"),
        })
        if puls is not None:
            z = _puls_zusammen(puls[0], puls[1], start, ende)
            aus[-1].update({"avg_puls": z["avg_puls"], "max_puls": z["max_puls"],
                            "start_puls": z["start_puls"]})
    return aus


def _get_session(db: Session, user_id: int, arg: dict) -> dict:
    s = _eigene(db, user_id).filter(models.Session.id == int(arg["session_id"])).first()
    if s is None:
        # Bewusst dieselbe Antwort fuer „gibt es nicht", „gehoert jemand anderem", „aussortiert"
        # und „geloescht": sonst waere der MCP ein Orakel, mit dem man fremde IDs abklopfen kann.
        return {"fehler": "Diese Aufnahme gibt es fuer dich nicht."}
    ar = db.query(models.AnalysisResult).filter(
        models.AnalysisResult.session_id == s.id).first()
    try:
        m = json.loads(ar.metrics_json) if ar and ar.metrics_json else {}
    except ValueError:
        m = {}
    aus = _kurz(s, ar)
    puls = _puls_reihe(s)
    puls_ges = None
    if puls is not None:
        z = _puls_zusammen(puls[0], puls[1])
        # Durchschnitt und Hoechstwert wie in der App (metrics_json), der tiefste aus der Reihe.
        puls_ges = {"avg_puls": m.get("avg_hr", z["avg_puls"]),
                    "max_puls": m.get("max_hr", z["max_puls"]),
                    "tiefster_puls": z["tiefster_puls"]}
    # `device_model` ist bei aelteren Aufnahmen leer — dann steht die Beschriftung nur am Token.
    # Ohne diesen Rueckfall musste Jans Agent am 25.09.2026 aus der Abtastrate erraten, welche
    # Uhr eine Aufnahme gemacht hat („25 Hz, also wohl Garmin"). Raten soll er hier nie muessen.
    etikett = None
    if s.device_id:
        dev = db.get(models.DeviceToken, s.device_id)
        if dev is not None and dev.label:
            etikett = dev.label.split("/")[0].strip()
    aus.update({
        "geraet_etikett": etikett,
        "dauer_s": ((s.ended_at - s.started_at).total_seconds()
                    if s.ended_at and s.started_at else None),
        "avg_cadence_hz": (ar.avg_cadence_hz if ar else None),
        "bester_lauf": {
            "strecke_m": (ar.best_distance_m if ar else None),
            "dauer_s": (ar.best_duration_s if ar else None),
            "max_speed_mps": (ar.best_speed_mps if ar else None),
            "laengste_pumppause_s": (ar.best_glide_s if ar else None),
        },
        "laengste_pumppause_s_hinweis":
            "Luecke zwischen zwei ERKANNTEN Pumps, keine gemessene Gleitphase. Ein hoher Wert "
            "heisst meist, dass Pumps nicht erkannt wurden.",
        "puls_quelle": s.hr_source,
        "puls_proben": s.hr_samples,
        # Puls als ZAHLEN (26.09.2026). Bis dahin standen hier nur Quelle und Probenzahl — ein
        # Agent sah, DASS es 2.000 Pulswerte gab, aber keinen einzigen davon.
        "puls": puls_ges,
        "puls_hinweis": ("Kein Puls in dieser Aufnahme." if puls is None else
                         "tiefster_puls ist der niedrigste Wert der Aufnahme, kein echter "
                         "Ruhepuls. Verlauf je Lauf: get_run_heart_rate(session_id, lauf, "
                         "intervall_s=1 oder 10) mit `lauf` aus laeufe_einzeln."),
        "laeufe_einzeln": _laeufe(ar, int(s.trim_start_ms or 0), puls),
        # Der Agent soll nicht schliessen muessen, dass es Lage-Daten gibt — er soll es lesen.
        # Jans Agent hielt sie am 25.09.2026 fuer fehlend, weil hier nichts davon stand.
        "lage_je_lauf": ("Mit get_board_attitude(session_id) abrufbar." if s.placement == "board"
                         else "Nicht vorhanden: diese Aufnahme entstand nicht mit dem Handy am Brett."),
        "ausruestung": _ausruestung_der_session(db, s),
        "herkunft": _herkunft(s, m),
    })
    return aus


# Obergrenze der Reihe: eine Stunde im Sekundentakt. Laengere Laeufe gibt es praktisch nicht,
# und eine Antwort soll das Kontextfenster des Agenten nicht fluten.
MAX_PULS_WERTE = 3600


def _get_run_heart_rate(db: Session, user_id: int, arg: dict) -> dict:
    """Der Puls eines Laufs als Reihe, je 1 oder 10 s. Details auf Abruf — die Zusammenfassung
    steht in get_session (Jan, 26.09.2026: „die details nur per zusaetzlicher abfrage")."""
    import numpy as np
    s = _eigene(db, user_id).filter(models.Session.id == int(arg["session_id"])).first()
    if s is None:
        return {"fehler": "Diese Aufnahme gibt es fuer dich nicht."}
    ar = db.query(models.AnalysisResult).filter(
        models.AnalysisResult.session_id == s.id).first()
    laeufe = _laeufe(ar, int(s.trim_start_ms or 0))
    nr = int(arg["lauf"])
    if not 0 <= nr < len(laeufe):
        return {"fehler": f"Einen Lauf {nr} gibt es in dieser Aufnahme nicht "
                          f"({len(laeufe)} Laeufe, `lauf` 0 bis {len(laeufe) - 1})."}
    schritt = 1 if int(arg.get("intervall_s") or 10) == 1 else 10
    lauf = laeufe[nr]
    a, b = float(lauf["start_ms_ab_sessionbeginn"]), float(lauf["ende_ms_ab_sessionbeginn"])
    puls = _puls_reihe(s)
    aus = {"session_id": s.id, "lauf": nr, "lauf_nr_in_app": nr + 1, "intervall_s": schritt,
           "start_ms_ab_sessionbeginn": int(a), "dauer_s": lauf["dauer_s"]}
    if puls is None:
        return {**aus, "werte": [], "hinweis": "Kein Puls in dieser Aufnahme."}
    t, hr = puls
    m = (t >= a) & (t <= b)
    tl, hl = (t[m] - a) / 1000.0, hr[m]
    n = min(int((b - a) / 1000.0 // schritt) + 1, MAX_PULS_WERTE)
    werte = []
    for k in range(n):
        w = hl[(tl >= k * schritt) & (tl < (k + 1) * schritt)]
        w = w[~np.isnan(w)]
        werte.append({"t_s": k * schritt, "puls": int(round(float(w.mean()))) if w.size else None})
    aus["werte"] = werte
    aus["werte_bedeutung"] = ("t_s = Sekunden ab Laufbeginn; puls = Mittel der Messwerte in "
                              f"[t_s, t_s+{schritt}) in bpm, null = kein Messwert.")
    return aus


def _foil_dict(f: models.Foil | None) -> dict | None:
    if f is None:
        return None
    return {
        "id": f.id, "marke": f.brand, "modell": f.model, "groesse": f.size,
        "spannweite_cm": f.span_cm, "flaeche_cm2": f.area_cm2,
        "dicke_mm": f.thickness_mm,
        # Zwei getrennte Flaggen, weil sie Verschiedenes bedeuten — so steht es im Modell:
        # `specs_estimated` ist der strengere Fall, dort haengt die ganze Zeile an einer Annahme.
        "geschaetzt": bool(f.specs_estimated),
        "dicke_geschaetzt": bool(f.thickness_estimated),
    }


def _stab_dict(s: models.Stab | None) -> dict | None:
    if s is None:
        return None
    return {"id": s.id, "marke": s.brand, "modell": s.model, "groesse": s.size,
            "spannweite_cm": s.span_cm, "flaeche_cm2": s.area_cm2,
            "geschaetzt": bool(s.specs_estimated)}


def _board_dict(b: models.Board | None) -> dict | None:
    if b is None:
        return None
    # Boards legt der Nutzer selbst an — es gibt keinen Katalog und damit auch nichts zu schaetzen.
    return {"id": b.id, "name": b.name, "volumen_l": b.volume_l, "laenge_cm": b.length_cm,
            "geschaetzt": False}


def _ausruestung_der_session(db: Session, s: models.Session) -> dict:
    return {
        "foil": _foil_dict(db.get(models.Foil, s.foil_id) if s.foil_id else None),
        "stab": _stab_dict(db.get(models.Stab, s.stab_id) if s.stab_id else None),
        "board": _board_dict(db.get(models.Board, s.board_id) if s.board_id else None),
        "mast_cm": s.mast_len_cm,
        "hinweis": "Ein Foil je LAUF gibt es noch nicht — fuer alle Laeufe einer Aufnahme gilt "
                   "dasselbe Material.",
    }


def _list_equipment(db: Session, user_id: int, _arg: dict) -> dict:
    """Die Ausruestung, die in den EIGENEN Aufnahmen wirklich vorkommt.

    Nicht der Katalog: der gehoert allen und waere Bestandsdaten. Gezeigt wird, was der Nutzer
    selbst gefahren ist, mit der Zahl seiner Aufnahmen darauf.
    """
    q = _eigene(db, user_id)
    foils = dict(q.with_entities(models.Session.foil_id, func.count(models.Session.id))
                  .filter(models.Session.foil_id.isnot(None))
                  .group_by(models.Session.foil_id).all())
    stabs = dict(q.with_entities(models.Session.stab_id, func.count(models.Session.id))
                  .filter(models.Session.stab_id.isnot(None))
                  .group_by(models.Session.stab_id).all())
    boards = dict(q.with_entities(models.Session.board_id, func.count(models.Session.id))
                   .filter(models.Session.board_id.isnot(None))
                   .group_by(models.Session.board_id).all())
    return {
        "foils": [dict(_foil_dict(db.get(models.Foil, i)) or {}, aufnahmen=n)
                  for i, n in foils.items() if db.get(models.Foil, i)],
        "stabs": [dict(_stab_dict(db.get(models.Stab, i)) or {}, aufnahmen=n)
                  for i, n in stabs.items() if db.get(models.Stab, i)],
        "boards": [dict(_board_dict(db.get(models.Board, i)) or {}, aufnahmen=n)
                   for i, n in boards.items() if db.get(models.Board, i)],
    }


def _get_stats(db: Session, user_id: int, arg: dict) -> dict:
    """Summen und Bestwerte des Nutzers. AUSDRUECKLICH ohne jeden Vergleich mit anderen."""
    q = _eigene(db, user_id)
    von, bis = _tag(arg.get("von")), _tag(arg.get("bis"))
    if von:
        q = q.filter(models.Session.started_at >= datetime(von.year, von.month, von.day,
                                                           tzinfo=timezone.utc))
    if bis:
        q = q.filter(models.Session.started_at <= datetime(bis.year, bis.month, bis.day, 23, 59, 59,
                                                           tzinfo=timezone.utc))
    ids = [r[0] for r in q.with_entities(models.Session.id).all()]
    if not ids:
        return {"sessions": 0}
    A = models.AnalysisResult
    z = (db.query(func.count(A.id), func.sum(A.num_runs), func.sum(A.total_distance_m),
                  func.sum(A.foiling_distance_m), func.sum(A.foiling_time_s),
                  func.sum(A.pump_count), func.max(A.max_speed_mps),
                  func.max(A.best_distance_m), func.max(A.best_duration_s))
           .filter(A.session_id.in_(ids)).one())
    return {
        "sessions": len(ids),
        "ausgewertet": z[0], "laeufe": z[1], "strecke_m": z[2],
        "foil_strecke_m": z[3], "foil_zeit_s": z[4], "pumps": z[5],
        "max_speed_mps": z[6],
        "bester_lauf_strecke_m": z[7], "bester_lauf_dauer_s": z[8],
        "hinweis": "Nur die eigenen Aufnahmen. Vergleichswerte anderer Fahrer gibt es hier "
                   "grundsaetzlich nicht.",
    }


def _get_board_attitude(db: Session, user_id: int, arg: dict) -> dict:
    """Nicken und Rollen je Lauf — dieselbe Rechnung, die die Lage-Ansicht der Website benutzt.

    Auf Abruf gerechnet und NICHT in `get_session` mit drin: die Rechnung liest die vollen
    Beschleunigungs- und Kreiseldaten. Eine Stunde bei 120 Hz sind 430.000 Werte je Achse; das
    gehoert weder in die Analyse-Tabelle noch in jede Session-Antwort (so steht es auch am
    Endpunkt in `api/sessions.py`).

    **Gebaut am 25.09.2026, nachdem Jans Agent danach gefragt hatte** („the API doesn't return
    any pitch or roll values"). Er hatte recht: die Zahlen gab es laengst, sie kamen nur nie am
    MCP an.
    """
    s = _eigene(db, user_id).filter(models.Session.id == int(arg["session_id"])).first()
    if s is None:
        return {"fehler": "Diese Aufnahme gibt es fuer dich nicht."}
    if s.placement != "board":
        return {"session_id": s.id, "am_brett": False,
                "hinweis": "Diese Aufnahme ist nicht als „Handy am Brett\" markiert. Nicken und "
                           "Rollen waeren hier die Bewegung des Fahrers, nicht die des Bretts."}

    import hashlib

    import numpy as np
    from .. import storage
    from ..analysis import lage

    ar = db.query(models.AnalysisResult).filter(
        models.AnalysisResult.session_id == s.id).first()

    # Fingerabdruck aller Eingaben. Passt er, steht das Ergebnis schon da; passt er nicht, ist es
    # ueberholt und wird neu gerechnet. Ein veralteter Eintrag kann so gar nicht gelesen werden,
    # und es gibt nichts, was jemand haendisch leeren muesste (s. models.BoardAttitudeCache).
    schluessel = hashlib.sha256("|".join([
        str(getattr(ar, "algo_version", None)),
        str(s.trim_start_ms), str(s.attitude_rot_deg),
        hashlib.sha256((getattr(ar, "segments_json", None) or "").encode()).hexdigest(),
    ]).encode()).hexdigest()
    treffer = db.query(models.BoardAttitudeCache).filter(
        models.BoardAttitudeCache.session_id == s.id).first()
    if treffer is not None and treffer.schluessel == schluessel:
        return {**json.loads(treffer.daten), "session_id": s.id, "am_brett": True,
                "aus_zwischenspeicher": True,
                "wie_gerechnet": _LAGE_ERKLAERUNG, "gieren_hinweis": _GIEREN_HINWEIS}

    uuid = s.session_uuid
    acc = storage.load_accel(uuid)
    if len(acc) < 4:
        return {"session_id": s.id, "fehler": "Keine Beschleunigungsdaten."}
    t_acc = lage.zeitachse(storage.load_accel_t0(uuid), storage.chunk_laengen(uuid, "accel"))
    if len(t_acc) != len(acc):
        # Ohne `.t0`-Beiwerk laesst sich keine exakte Zeitachse bauen. Lieber nichts liefern als
        # eine geratene — dieselbe Regel wie im Lage-Endpunkt (s. docs/DATA-PIPELINE.md).
        return {"session_id": s.id,
                "fehler": "Keine exakte Zeitachse — fuer diese Aufnahme nicht berechenbar."}
    gyr = storage.load_gyro(uuid)
    t_gyr = lage.zeitachse(storage.load_gyro_t0(uuid), storage.chunk_laengen(uuid, "gyro"))
    hat_kreisel = len(gyr) >= 4 and len(t_gyr) == len(gyr)
    if not hat_kreisel:
        gyr, t_gyr = np.empty((0, 3)), np.empty(0)

    try:
        segmente = json.loads(ar.segments_json) if ar and ar.segments_json else []
    except ValueError:
        segmente = []
    if not segmente:
        return {"session_id": s.id, "laeufe": [],
                "hinweis": "In dieser Aufnahme wurde kein Lauf erkannt."}

    off = int(s.trim_start_ms or 0)
    bereiche = lage.laufbereiche(segmente, off)
    starts = [float(g.get("t_start_session_ms", float(g["t_start_ms"]) + off))
              for g in segmente if g.get("t_start_ms") is not None]
    kennzahlen = lage.kennzahlen_je_lauf(
        acc, t_acc, gyr, t_gyr, bereiche, starts, gps=storage.load_gps(uuid),
        rot_vorgabe=(float(s.attitude_rot_deg) if s.attitude_rot_deg is not None else None))

    laeufe = []
    for i, ((a, b), k) in enumerate(zip(bereiche, kennzahlen)):
        if not k.get("ok"):
            laeufe.append({"lauf": i, "auswertbar": False,
                           "grund": "Zu kurz oder zu wenig Daten fuer eine Lage-Rechnung."})
            continue
        sicher = bool(k.get("hub_sicher"))
        laeufe.append({
            "lauf": i,
            "auswertbar": True,
            "dauer_s": round((b - a) / 1000.0, 1),
            # 95. Perzentil des Betrags, nicht der Groesstwert: ein einzelner Ausschlag soll die
            # Zahl nicht bestimmen.
            "nicken_amplitude_deg": k.get("pitch_amplitude_deg"),
            "rollen_amplitude_deg": k.get("roll_amplitude_deg"),
            "gier_rate_rms_deg_s": k.get("gier_rms_deg_s"),
            # Takt und Hub NUR, wenn die Rechnung sie selbst fuer belastbar haelt. Sonst steht
            # hier null, und das ist die ehrliche Antwort — nicht die Zahl.
            "pump_takt_hz": k.get("pitch_hz") if sicher else None,
            "hub_pp_cm": k.get("hub_pp_cm") if sicher else None,
            "takt_und_hub_belastbar": sicher,
            # Wie das Handy in DIESEM Lauf auf dem Brett lag — aus den Daten bestimmt, nicht
            # angegeben. Dreht sich das von Lauf zu Lauf stark, sass es locker.
            "montage_drehung_deg": k.get("rot_deg"),
        })

    ergebnis = {"kreiseldaten": hat_kreisel, "laeufe": laeufe}
    # Zwei Arbeiter koennen dasselbe gleichzeitig rechnen — dann gewinnt der letzte, und das ist
    # egal: bei gleichem Schluessel ist das Ergebnis dasselbe.
    roh = json.dumps(ergebnis, ensure_ascii=False)
    db.execute(pg_insert(models.BoardAttitudeCache)
               .values(session_id=s.id, schluessel=schluessel, daten=roh)
               .on_conflict_do_update(index_elements=["session_id"],
                                      set_={"schluessel": schluessel, "daten": roh}))
    db.commit()
    return {**ergebnis, "session_id": s.id, "am_brett": True,
            "aus_zwischenspeicher": False,
            "wie_gerechnet": _LAGE_ERKLAERUNG, "gieren_hinweis": _GIEREN_HINWEIS}


# Die beiden Erklaerungen stehen neben der Rechnung, nicht darin: sie gehen bei JEDER Antwort mit
# raus, auch bei einer aus dem Zwischenspeicher — gespeichert werden nur die Zahlen.
_LAGE_ERKLAERUNG = (
    "Nicken und Rollen kommen aus einem komplementaeren Filter ueber Beschleunigung und "
    "Kreisel; die Werte sind das 95. Perzentil des Betrags ueber den Lauf, in Grad — "
    "also die Auslenkung, NICHT eine Winkelgeschwindigkeit. Eine Rate in Grad je Sekunde "
    "gibt es bisher nur fuers Gieren (`gier_rate_rms_deg_s`). Die Montage-Drehung wird je "
    "Lauf aus den Daten bestimmt. Ohne Kreiseldaten (`kreiseldaten: false`) stuetzt sich "
    "alles allein auf die Beschleunigung und ist traeger.")

_GIEREN_HINWEIS = (
    "Gieren ist die gefahrene Route und sagt nichts ueber Technik oder Effizienz — es "
    "steht hier als Zusatz, nicht als Guetemass.")


def _get_overview(db: Session, user_id: int, _arg: dict) -> dict:
    """Der Einstieg. Sagt, WAS es gibt — und mit welchen Werten man danach fragt.

    Jan, 25.09.2026: „vielleicht brauchen wir noch eine einleitungs-mcp abfrage, die sowas wie
    ‚wieviel sessions je sportart' inkl. der keys fuer die abfrage danach". Genau das: jede Liste
    hier nennt den Wert SO, wie `list_sessions` ihn als Filter erwartet. Ohne diesen Aufruf raet
    ein Agent Spot- und Sportartnamen oder zieht erst einmal alles — beides kostet Kontext und
    liefert schlechtere Antworten.

    Dass er zuerst kommen soll, steht an zwei Stellen: in der Beschreibung des Werkzeugs und in
    der Anleitung. Mehr sieht ein Agent nicht — MCP kennt keine Reihenfolge, nur Text.
    """
    q = _eigene(db, user_id)
    S = models.Session
    gesamt = q.count()
    if not gesamt:
        return {"sessions": 0,
                "hinweis": "Noch keine auswertbaren Aufnahmen auf diesem Konto."}

    def zaehlen(spalte, grenze: int = 40) -> list[dict]:
        zeilen = (q.with_entities(spalte, func.count(S.id))
                   .group_by(spalte).order_by(func.count(S.id).desc()).limit(grenze).all())
        return [{"wert": w, "aufnahmen": int(n)} for w, n in zeilen if w is not None]

    erste, letzte = q.with_entities(func.min(S.started_at), func.max(S.started_at)).one()
    jahre = (q.with_entities(func.extract("year", S.started_at), func.count(S.id))
              .group_by(func.extract("year", S.started_at))
              .order_by(func.extract("year", S.started_at)).all())
    ids = [r[0] for r in q.with_entities(S.id).all()]
    A = models.AnalysisResult
    erkennung = (db.query(A.detection, func.count(A.id))
                   .filter(A.session_id.in_(ids)).group_by(A.detection).all())
    am_brett = q.filter(S.placement == "board").count()

    aus = {
        "sessions": gesamt,
        "erste_aufnahme": _iso(erste),
        "letzte_aufnahme": _iso(letzte),
        "je_jahr": [{"jahr": int(j), "aufnahmen": int(n)} for j, n in jahre],
        # Die Werte unten sind die FILTER von list_sessions — woertlich so uebergeben.
        "je_sportart": zaehlen(S.sport),
        "je_spot": zaehlen(S.place_name),
        "je_geraet": zaehlen(S.device_model),
        "am_brett_aufgenommen": am_brett,
        "je_erkennung": [{"wert": d, "aufnahmen": int(n)} for d, n in erkennung if d],
        "filter_hinweis": (
            "`je_sportart[].wert` gehoert in list_sessions(sportart=…), `je_spot[].wert` in "
            "list_sessions(spot=…). `je_erkennung` sagt, worauf die Lauferkennung stand: bei "
            "`gps_only` gibt es weder Pumps noch Takt — das ist kein Nullwert, sondern eine "
            "Leerstelle. `am_brett_aufgenommen` sind die Aufnahmen mit dem Handy am Brett; nur "
            "fuer die gibt es Nicken und Rollen."),
    }
    return aus


_HANDLER = {
    "get_overview": lambda db, uid, arg: _get_overview(db, uid, arg),
    "list_sessions": _list_sessions,
    "get_session": _get_session,
    "get_board_attitude": lambda db, uid, arg: _get_board_attitude(db, uid, arg),
    "get_run_heart_rate": _get_run_heart_rate,
    "get_stats": _get_stats,
    "list_equipment": _list_equipment,
}


# --- JSON-RPC ----------------------------------------------------------------------------------

def _rpc_fehler(id_, code: int, nachricht: str) -> dict:
    return {"jsonrpc": "2.0", "id": id_, "error": {"code": code, "message": nachricht}}


def _401() -> JSONResponse:
    """Ohne gueltiges Token: 401 MIT dem Kopf, der auf unsere Metadaten zeigt.

    Genau daran findet ein MCP-Client den Autorisierungsserver (RFC 9728) — ohne diesen Kopf
    weiss er nicht, wo er fragen soll, und die Anmeldung kommt gar nicht erst zustande.
    """
    return JSONResponse(
        {"error": "invalid_token"}, status_code=401,
        headers={"WWW-Authenticate":
                 f'Bearer resource_metadata="{RESOURCE.rsplit("/", 1)[0]}'
                 f'/.well-known/oauth-protected-resource/mcp"'})


@router.post("/mcp")
async def mcp(request: Request, db: Session = Depends(get_db)):
    """Der eine Endpunkt. JSON-RPC 2.0, Antwort als JSON (SSE brauchen wir nicht: wir haben
    nichts, was laenger laeuft als eine Abfrage)."""
    kopf = request.headers.get("authorization") or ""
    if not kopf.lower().startswith("bearer "):
        return _401()
    user_id = access_token_pruefen(kopf[7:].strip())
    if user_id is None:
        return _401()
    nutzer = db.get(models.User, user_id)
    if nutzer is None or getattr(nutzer, "deleted", False):
        return _401()

    try:
        anfrage = await request.json()
    except ValueError:
        return JSONResponse(_rpc_fehler(None, -32700, "Kein gueltiges JSON."), status_code=400)
    if not isinstance(anfrage, dict):
        return JSONResponse(_rpc_fehler(None, -32600, "Erwartet wird ein Objekt."), status_code=400)

    id_ = anfrage.get("id")
    methode = anfrage.get("method")
    params = anfrage.get("params") or {}

    if methode == "initialize":
        return JSONResponse({"jsonrpc": "2.0", "id": id_, "result": {
            "protocolVersion": "2025-06-18",
            "capabilities": {"tools": {}},
            # Version nur zur Nachvollziehbarkeit (steht im Log des Clients). Neue Werkzeuge
            # erfaehrt ein Agent NICHT hierueber, sondern ueber `tools/list`, das ein Client bei
            # jeder neuen Verbindung abfragt. Ein `listChanged`-Push ginge nur ueber einen
            # offenen Ereignis-Strom (GET /mcp), den wir nicht anbieten.
            # 1.1.0 (26.09.2026): Puls je Aufnahme und Lauf, `get_run_heart_rate`.
            "serverInfo": {"name": "pumpfoil", "version": "1.1.0"},
            "instructions": ANLEITUNG,
        }})
    if methode in ("notifications/initialized", "ping"):
        return JSONResponse({"jsonrpc": "2.0", "id": id_, "result": {}})
    if methode == "tools/list":
        return JSONResponse({"jsonrpc": "2.0", "id": id_, "result": {"tools": WERKZEUGE}})

    if methode == "tools/call":
        name = params.get("name")
        handler = _HANDLER.get(name)
        if handler is None:
            return JSONResponse(_rpc_fehler(id_, -32601, f"Unbekanntes Werkzeug: {name}"))
        # Jans Vorgabe: 200 je Stunde und Nutzer. Geprueft wird ERST hier — `initialize` und
        # `tools/list` kosten nichts und sollen nicht gegen das Kontingent laufen.
        #
        # DAS KONTINGENT DARF DIE VERBINDUNG NICHT KAPPEN (25.09.2026). Beim ersten echten
        # Einsatz lief Jans Agent hinein, und danach war der Zugang aus seiner Sitzung ganz
        # verschwunden: „the Pumpfoil connection has dropped out of this session entirely."
        # Ursache war ein blankes HTTP 429 — fuer einen MCP-Client sieht das aus wie ein kaputter
        # Server, nicht wie eine Bitte zu warten. Ein Werkzeug-Fehler gehoert nach der
        # MCP-Festlegung als GEWOEHNLICHE Antwort mit `isError` zurueck: dann liest das Modell
        # den Satz, wartet und versucht es spaeter noch einmal, statt den Server wegzuwerfen.
        try:
            enforce_user_tiers(db, user_id, LIMITS, "mcp", "")
        except HTTPException as e:
            wartezeit = e.headers.get("Retry-After", "?") if e.headers else "?"
            return JSONResponse({"jsonrpc": "2.0", "id": id_, "result": {
                "content": [{"type": "text", "text":
                             f"Zu viele Abfragen. Erlaubt sind {LIMITS[0][0]} je Stunde und "
                             f"{LIMITS[1][0]} je Minute. In etwa {wartezeit} Sekunden geht es "
                             f"wieder. Die Verbindung bleibt bestehen — einfach spaeter noch "
                             f"einmal fragen. Tipp: list_sessions traegt die Summen und den "
                             f"besten Lauf je Aufnahme schon mit, dafuer braucht es kein "
                             f"get_session je Zeile."}],
                "isError": True}})
        try:
            ergebnis = handler(db, user_id, params.get("arguments") or {})
        except (KeyError, ValueError, TypeError) as e:
            return JSONResponse(_rpc_fehler(id_, -32602, f"Falsche Angaben: {e}"))
        _zaehlen(db, user_id, name)
        # MCP erwartet Inhalt als Liste von Bloecken. JSON als Text ist der uebliche Weg; ein
        # Agent liest es ohne Umweg.
        return JSONResponse({"jsonrpc": "2.0", "id": id_, "result": {
            "content": [{"type": "text",
                         "text": json.dumps(ergebnis, ensure_ascii=False, default=str)}],
            "structuredContent": ergebnis,
        }})

    return JSONResponse(_rpc_fehler(id_, -32601, f"Unbekannte Methode: {methode}"))


@router.get("/mcp")
def mcp_get():
    """Manche Clients schauen erst per GET nach. Wir haben keinen Ereignisstrom — das sagen wir
    klar, statt eine offene Verbindung vorzutaeuschen."""
    return JSONResponse({"error": "method_not_allowed",
                         "hinweis": "Dieser MCP-Server antwortet nur auf POST (JSON-RPC)."},
                        status_code=405)
