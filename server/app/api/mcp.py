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

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db
from ..ratelimit import enforce_user_tiers
from ..tzlookup import tz_name
from .mcp_oauth import RESOURCE, SCOPE, access_token_pruefen

router = APIRouter(tags=["mcp"])

# Jans Vorgabe: 100 Aufrufe je Stunde und NUTZER. Die zweite Stufe faengt den Fall ab, dass ein
# Agent in einer Schleife haengt — 100 in einer Stunde sind in Ordnung, 100 in einer Minute nicht.
LIMITS = [(100, 3600), (20, 60)]

# Jeder Lauf einzeln kostet Platz im Kontextfenster des Agenten. Mehr als das gibt eine Antwort
# nicht her; wer mehr will, blaettert.
MAX_SESSIONS = 50


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

LAGE DES BRETTS (nur wenn das Handy am Brett sass)
Nicken und Rollen kommen aus einem komplementaeren Filter ueber Beschleunigung und Kreisel. Wie
das Handy montiert war, wird JE LAUF aus den Daten bestimmt, nicht vom Nutzer angegeben. Der Hub
(die Auf-/Abbewegung) erscheint nur, wenn der Pumptakt sicher erkannt war; sonst fehlt er, und
das Fehlen ist die ehrliche Antwort. Gieren wird bewusst nicht ausgewertet: es ist die frei
gewaehlte Route und sagt nichts ueber Technik.

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
    {"name": "list_sessions",
     "description": "Die eigenen Aufnahmen, neueste zuerst. Ohne Angaben die letzten 20.",
     "inputSchema": {"type": "object", "properties": {
         "von": {"type": "string", "description": "Datum ab, JJJJ-MM-TT"},
         "bis": {"type": "string", "description": "Datum bis, JJJJ-MM-TT"},
         "sportart": {"type": "string"},
         "spot": {"type": "string", "description": "Teil des Ortsnamens"},
         "limit": {"type": "integer", "minimum": 1, "maximum": MAX_SESSIONS},
         "offset": {"type": "integer", "minimum": 0}}}},
    {"name": "get_session",
     "description": "Eine eigene Aufnahme mit allem, was wir dazu gerechnet haben: Kennzahlen, "
                    "Laeufe einzeln, Lage des Bretts je Lauf (falls das Handy am Brett sass), "
                    "Ausruestung, und die Herkunft jeder Zahl.",
     "inputSchema": {"type": "object", "properties": {
         "session_id": {"type": "integer"}}, "required": ["session_id"]}},
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
    return {
        "session_id": s.id,
        "start": _iso(s.started_at),
        "ende": _iso(s.ended_at),
        # `tz` ist KEINE Spalte, sondern wird aus der Position abgeleitet (wie
        # ueberall sonst in der API). Ohne Position gibt es keine — dann bleibt UTC.
        "zeitzone": tz_name(s.place_lat, s.place_lon),
        "sportart": s.sport,
        "spot": s.place_name,
        "geraet": s.device_model,
        "am_brett": s.placement == "board",
        "laeufe": (ar.num_runs if ar else None),
        "strecke_m": (ar.total_distance_m if ar else None),
        "foil_strecke_m": (ar.foiling_distance_m if ar else None),
        "foil_zeit_s": (ar.foiling_time_s if ar else None),
        "max_speed_mps": (ar.max_speed_mps if ar else None),
        "pumps": (ar.pump_count if ar else None),
        "erkennung": (ar.detection if ar else None),
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
    limit = max(1, min(int(arg.get("limit") or 20), MAX_SESSIONS))
    offset = max(0, int(arg.get("offset") or 0))
    zeilen = q.order_by(models.Session.started_at.desc()).offset(offset).limit(limit).all()
    ars = {a.session_id: a for a in db.query(models.AnalysisResult).filter(
        models.AnalysisResult.session_id.in_([z.id for z in zeilen]))} if zeilen else {}
    return {"gesamt": gesamt, "offset": offset,
            "sessions": [_kurz(z, ars.get(z.id)) for z in zeilen]}


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


def _laeufe(ar: models.AnalysisResult | None, off: int) -> list[dict]:
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
            "start_ms_ab_sessionbeginn": start,
            "ende_ms_ab_sessionbeginn": ende,
            "dauer_s": round((ende - start) / 1000.0, 1),
            "strecke_m": g.get("distance_m"),
            "max_speed_mps": g.get("max_speed_mps"),
            "avg_speed_mps": g.get("avg_speed_mps"),
            "pumps": g.get("pump_count"),
            "takt_hz": g.get("cadence_hz"),
        })
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
    aus.update({
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
        "laeufe_einzeln": _laeufe(ar, int(s.trim_start_ms or 0)),
        "ausruestung": _ausruestung_der_session(db, s),
        "herkunft": _herkunft(s, m),
    })
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


_HANDLER = {
    "list_sessions": _list_sessions,
    "get_session": _get_session,
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
            "serverInfo": {"name": "pumpfoil", "version": "1.0.0"},
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
        # Jans Vorgabe: 100 je Stunde und Nutzer. Geprueft wird ERST hier — `initialize` und
        # `tools/list` kosten nichts und sollen nicht gegen das Kontingent laufen.
        enforce_user_tiers(db, user_id, LIMITS, "mcp",
                           "Zu viele Abfragen. Es sind 100 je Stunde erlaubt.")
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
