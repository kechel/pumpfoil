"""GPS-Kunst-Event: Einreichen, Galerie, Herzen, Melden, Moderation (Regeln in app/kunst.py)."""
from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import kunst as K
from .. import models, storage
from .deps import current_user
from ..config import get_settings
from ..db import get_db

router = APIRouter(prefix="/api/kunst", tags=["kunst"])


def _404() -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, "nicht_gefunden")


def _event(db: Session, event_id: int, user: models.User) -> models.TeamEvent:
    e = db.get(models.TeamEvent, event_id)
    if e is None or e.geloescht_am is not None or not K.ist_kunst(e):
        raise _404()
    if not (K.darf_teilnehmen(db, user, e) or K.darf_moderieren(db, user, e)):
        raise _404()
    return e


def _runde(e: models.TeamEvent, nr: int) -> dict:
    r = K.runde(e, nr)
    if r is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "runde")
    return r


def _laeufe(db: Session, s: models.Session) -> list[tuple[int, int]]:
    """Erkannte Laeufe der Session (nur dort wird gezeichnet, Jan 18.11.2026)."""
    ar = db.query(models.AnalysisResult.segments_json).filter(models.AnalysisResult.session_id == s.id).first()
    return K.laeufe(ar[0] if ar else None)


def _iso(d: datetime) -> str:
    return d.astimezone(timezone.utc).isoformat()


def _bild_out(b: models.KunstBild) -> dict:
    return {"id": b.id, "linie": json.loads(b.linie_json)}


@router.get("/{event_id}")
def kunst_event(event_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """Alles fuer die Eventseite: Runden mit Phase, eigenes Bild je Runde, anonyme Galerie (zufaellig je Betrachter),
    eigene Herzen, und fuer fertige Runden die Aufloesung."""
    e = _event(db, event_id, user)
    B, H = models.KunstBild, models.KunstHerz
    mod = K.darf_moderieren(db, user, e)
    teil = K.darf_teilnehmen(db, user, e)
    bilder = db.query(B).filter(B.event_id == e.id).all()
    meine_herzen = {b for (b,) in db.query(H.bild_id).filter(H.event_id == e.id, H.user_id == user.id).all()}
    meldungen: dict[int, int] = {}
    if mod:
        meldungen = {bid: int(n) for bid, n in db.query(models.KunstMeldung.bild_id, func.count(models.KunstMeldung.id))
                     .join(B, B.id == models.KunstMeldung.bild_id).filter(B.event_id == e.id)
                     .group_by(models.KunstMeldung.bild_id).all()}
    out_runden = []
    for r in K.runden(e):
        nr = r["nr"]
        eigen = next((b for b in bilder if b.runde == nr and b.user_id == user.id), None)
        sichtbar = [b for b in bilder if b.runde == nr and (b.entfernt_grund is None or mod)]
        sichtbar.sort(key=lambda b: K.reihenfolge(user.id, b.id))
        galerie = [{**_bild_out(b), "eigen": b.user_id == user.id, "herz": b.id in meine_herzen,
                    **({"entfernt": b.entfernt_grund, "meldungen": meldungen.get(b.id, 0)} if mod else {})}
                   for b in sichtbar] if (r["phase"] in ("abstimmen", "fertig") or (r["phase"] == "einreichen" and mod)) else []
        # Galerie fuer Teilnehmer erst ab der Abstimmung (Jan 18.11.2026: in der Einreichwoche nur Admins) — sonst liessen
        # sich Ideen abschauen und fruehe Bilder waeren laenger sichtbar. Moderation sieht sie, um rechtzeitig zu pruefen.
        x = {"nr": nr, "start": _iso(r["start"]), "ende": _iso(r["ende"]), "einreichen_bis": _iso(r["einreichen_bis"]),
             "abstimmen_bis": _iso(r["abstimmen_bis"]),
             "phase": r["phase"], "anzahl": sum(1 for b in bilder if b.runde == nr and b.entfernt_grund is None),
             "herzen_vergeben": sum(1 for b in bilder if b.runde == nr and b.id in meine_herzen),
             "eigen": ({**_bild_out(eigen), "session_id": eigen.session_id, "von_ms": eigen.von_ms, "bis_ms": eigen.bis_ms,
                        "drehung": eigen.drehung, "entfernt": eigen.entfernt_grund} if eigen else None),
             "galerie": galerie}
        if r["phase"] == "fertig":
            x["ergebnis"] = _aufloesung(db, e, nr, user.id)
            x["galerie"] = []        # nach dem Ende zeigt die Aufloesung alle Bilder mit Namen
        out_runden.append(x)
    return {"event_id": e.id, "titel": e.titel, "herzen_je_runde": K.HERZEN_JE_RUNDE, "teilnehmen": teil,
            "moderieren": mod, "admin": bool(user.is_admin), **K.einstellungen(e), "runden": out_runden}


def _aufloesung(db: Session, e: models.TeamEvent, nr: int, betrachter: int) -> list[dict]:
    from .sessions import _ort_fuer_andere_verborgen, _sieht_echten_ort
    zeilen = K.ergebnis(db, e, nr)
    if not zeilen:
        return []
    bilder = {b.id: b for b in db.query(models.KunstBild).filter(models.KunstBild.id.in_([z["bild_id"] for z in zeilen]))}
    nutzer = {u.id: u for u in db.query(models.User).filter(models.User.id.in_([z["user_id"] for z in zeilen]))}
    sessions = {s.id: s for s in db.query(models.Session).filter(models.Session.id.in_([z["session_id"] for z in zeilen]))}
    spot_ids = {s.spot_id for s in sessions.values() if s.spot_id}
    spots = {sp.id: sp.name for sp in db.query(models.Spot).filter(models.Spot.id.in_(spot_ids))} if spot_ids else {}
    out = []
    for z in zeilen:
        u, s, b = nutzer.get(z["user_id"]), sessions.get(z["session_id"]), bilder[z["bild_id"]]
        spot = None
        ort_sichtbar = s is not None and not s.deleted and (not _ort_fuer_andere_verborgen(s) or _sieht_echten_ort(db, s, betrachter))
        if ort_sichtbar and s.spot_id:
            spot = spots.get(s.spot_id)
        out.append({**z, "linie": json.loads(b.linie_json), "name": (u.display_name if u else None),
                    "avatar_url": (u.avatar_url if u else None), "spot": spot, "karte": ort_sichtbar,
                    "session_id": z["session_id"] if s is not None and not s.deleted else None})
    return out


@router.get("/{event_id}/kandidaten")
def kandidaten(event_id: int, runde: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    """Eigene Sessions, die fuer diese Runde in Frage kommen (in der Runde gestartet, auf dem Wasser, nicht geloescht)."""
    e = _event(db, event_id, user)
    r = _runde(e, runde)
    S = models.Session
    a, z = K.fenster(e, r)
    q = (db.query(S).filter(S.user_id == user.id, S.deleted.isnot(True), S.started_at >= a, S.started_at < z)
         .order_by(S.started_at.desc()).limit(40).all())
    out = []
    for s in q:
        if not K.session_passt(s, user.id, r, e):
            continue
        # Vorschau der ganzen Session zum leichteren Auffinden (Jan 18.11.2026), grob vereinfacht; ohne GPS keine Kachel.
        fenster = _laeufe(db, s)
        if not fenster:
            continue                 # ohne erkannte Laeufe nichts zu zeichnen
        try:
            vorschau = K.linie(storage.load_gps(s.session_uuid), 0, 10**15, 0, max_punkte=160, fenster=fenster)
        except ValueError:
            continue
        out.append({"id": s.id, "started_at": _iso(s.started_at), "sport_class": s.sport_class, "caption": s.caption,
                    "vorschau": vorschau})
    return out


@router.get("/{event_id}/spur/{session_id}")
def spur(event_id: int, session_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """Die ganze eigene Session fuers Zuschneiden (relative Meter, keine Koordinaten)."""
    _event(db, event_id, user)
    s = db.get(models.Session, session_id)
    if s is None or s.user_id != user.id or s.deleted:
        raise _404()
    p = K.spur(storage.load_gps(s.session_uuid))
    if len(p) < K.MIN_PUNKTE:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "zu_wenig_punkte")
    return {"session_id": s.id, "punkte": p, "laeufe": [[a, z] for a, z in _laeufe(db, s)]}


class BildIn(BaseModel):
    runde: int
    session_id: int
    von_ms: int
    bis_ms: int
    drehung: int = Field(0, ge=0, le=359)


@router.post("/{event_id}/bild")
def einreichen(event_id: int, body: BildIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """Bild einreichen oder das eigene der Runde ersetzen — nur waehrend die Runde laeuft."""
    e = _event(db, event_id, user)
    if not K.darf_teilnehmen(db, user, e):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "nicht_teilnehmer")
    r = _runde(e, body.runde)
    if r["phase"] != "einreichen":
        raise HTTPException(status.HTTP_409_CONFLICT, "runde_zu")
    s = db.get(models.Session, body.session_id)
    if not K.session_passt(s, user.id, r, e):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "session_passt_nicht")
    if body.bis_ms <= body.von_ms:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "zeitraum")
    fenster = _laeufe(db, s)
    if not fenster:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "keine_laeufe")
    try:
        lin = K.linie(storage.load_gps(s.session_uuid), body.von_ms, body.bis_ms, body.drehung, fenster=fenster)
    except ValueError as ex:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(ex))
    B = models.KunstBild
    b = db.query(B).filter(B.event_id == e.id, B.runde == body.runde, B.user_id == user.id).first()
    jetzt = datetime.now(timezone.utc)
    if b is None:
        b = B(event_id=e.id, runde=body.runde, user_id=user.id, angelegt_am=jetzt)
        db.add(b)
    elif b.entfernt_grund is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "entfernt")   # entferntes Bild nicht still ersetzen
    b.session_id, b.von_ms, b.bis_ms, b.drehung = s.id, body.von_ms, body.bis_ms, body.drehung
    b.linie_json, b.geaendert_am = json.dumps(lin, separators=(",", ":")), jetzt
    db.flush()
    # Herzen gab es fuer dieses Bild noch nicht (Abstimmung erst nach Rundenende) — nichts zurueckzusetzen.
    db.commit()
    return {"id": b.id, "linie": lin}


@router.delete("/{event_id}/bild")
def zurueckziehen(event_id: int, runde: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    e = _event(db, event_id, user)
    r = _runde(e, runde)
    if r["phase"] != "einreichen":
        raise HTTPException(status.HTTP_409_CONFLICT, "runde_zu")
    B = models.KunstBild
    b = db.query(B).filter(B.event_id == e.id, B.runde == runde, B.user_id == user.id).first()
    if b is not None and b.entfernt_grund is None:
        db.query(models.KunstMeldung).filter(models.KunstMeldung.bild_id == b.id).delete()
        db.delete(b)
        db.commit()
    return {"ok": True}


def _bild(db: Session, bild_id: int, user: models.User) -> tuple[models.KunstBild, models.TeamEvent]:
    b = db.get(models.KunstBild, bild_id)
    if b is None:
        raise _404()
    return b, _event(db, b.event_id, user)


@router.post("/bild/{bild_id}/herz")
def herz(bild_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """Herz setzen oder wegnehmen — nur in der Abstimmung, nicht fuers eigene, hoechstens HERZEN_JE_RUNDE je Runde."""
    b, e = _bild(db, bild_id, user)
    if not K.darf_teilnehmen(db, user, e):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "nicht_teilnehmer")
    r = _runde(e, b.runde)
    if r["phase"] != "abstimmen":
        raise HTTPException(status.HTTP_409_CONFLICT, "keine_abstimmung")
    if b.user_id == user.id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "eigenes_bild")
    if b.entfernt_grund is not None:
        raise _404()
    H = models.KunstHerz
    h = db.query(H).filter(H.bild_id == b.id, H.user_id == user.id).first()
    if h is not None:
        db.delete(h)
        an = False
    else:
        n = db.query(func.count(H.id)).filter(H.event_id == e.id, H.runde == b.runde, H.user_id == user.id).scalar() or 0
        if n >= K.HERZEN_JE_RUNDE:
            raise HTTPException(status.HTTP_409_CONFLICT, "keine_herzen_mehr")
        db.add(H(bild_id=b.id, event_id=e.id, runde=b.runde, user_id=user.id))
        an = True
    db.commit()
    rest = K.HERZEN_JE_RUNDE - int(db.query(func.count(H.id)).filter(H.event_id == e.id, H.runde == b.runde,
                                                                    H.user_id == user.id).scalar() or 0)
    return {"herz": an, "uebrig": rest}


class MeldungIn(BaseModel):
    grund: str | None = Field(None, max_length=500)


@router.post("/bild/{bild_id}/melden")
def melden(bild_id: int, body: MeldungIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    b, _e = _bild(db, bild_id, user)
    if b.user_id == user.id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "eigenes_bild")
    M = models.KunstMeldung
    if db.query(M).filter(M.bild_id == b.id, M.user_id == user.id).first() is None:
        db.add(M(bild_id=b.id, user_id=user.id, grund=(body.grund or "").strip() or None))
        db.commit()
    return {"ok": True}


class EntfernenIn(BaseModel):
    grund: str = Field(min_length=3, max_length=500)


@router.post("/bild/{bild_id}/entfernen")
def entfernen(bild_id: int, body: EntfernenIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """Moderation (Admins, Leitung/Moderation des Teams): Bild aus Galerie und Wertung nehmen; Grund sieht der Fahrer."""
    b, e = _bild(db, bild_id, user)
    if not K.darf_moderieren(db, user, e):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "keine_rechte")
    b.entfernt_grund, b.entfernt_von = body.grund.strip(), user.id
    db.commit()
    return {"ok": True}


@router.post("/bild/{bild_id}/zurueck")
def zurueckholen(bild_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    b, e = _bild(db, bild_id, user)
    if not K.darf_moderieren(db, user, e):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "keine_rechte")
    b.entfernt_grund, b.entfernt_von = None, None
    db.commit()
    return {"ok": True}


class TestIn(BaseModel):
    test: bool


class PhaseIn(BaseModel):
    runde: int
    phase: str | None = None        # None = wieder nach der Uhr


def _nur_admin(user: models.User) -> None:
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "keine_rechte")


def _kunst_speichern(e: models.TeamEvent, aendern) -> None:
    k = json.loads(e.kunst_json or "{}") or {}
    aendern(k)
    e.kunst_json = json.dumps(k)


@router.post("/{event_id}/test")
def testmodus(event_id: int, body: TestIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """Testmodus an/aus (nur Admins, Jan 18.11.2026). Aus = auch die von Hand gesetzten Phasen verwerfen."""
    _nur_admin(user)
    e = _event(db, event_id, user)
    _kunst_speichern(e, lambda k: k.update({"test": body.test, **({} if body.test else {"phasen": {}})}))
    db.commit()
    return K.einstellungen(e)


@router.post("/{event_id}/phase")
def phase_setzen(event_id: int, body: PhaseIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """Testmodus: Phase einer Runde von Hand setzen (oder mit phase=null wieder der Uhr ueberlassen)."""
    _nur_admin(user)
    e = _event(db, event_id, user)
    if not K.einstellungen(e)["test"]:
        raise HTTPException(status.HTTP_409_CONFLICT, "kein_test")
    _runde(e, body.runde)
    if body.phase is not None and body.phase not in K.PHASEN:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "phase")

    def setzen(k: dict) -> None:
        ph = dict(k.get("phasen") or {})
        if body.phase is None:
            ph.pop(str(body.runde), None)
        else:
            ph[str(body.runde)] = body.phase
        k["phasen"] = ph
    _kunst_speichern(e, setzen)
    db.commit()
    return K.einstellungen(e)


@router.get("/bild/{bild_id}/karte")
def bild_karte(bild_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """Echter Track eines Bildes auf der Karte (Jan 18.11.2026) — erst nach der Aufloesung, und nur wenn der Betrachter
    den Ort sehen darf (wie der Spotname: Besitzer, Freunde, oder „Ort verbergen" aus)."""
    from .sessions import _ort_fuer_andere_verborgen, _sieht_echten_ort
    b, e = _bild(db, bild_id, user)
    r = _runde(e, b.runde)
    if r["phase"] != "fertig" and b.user_id != user.id:
        raise HTTPException(status.HTTP_409_CONFLICT, "noch_nicht_aufgeloest")
    s = db.get(models.Session, b.session_id)
    if s is None or s.deleted or b.entfernt_grund is not None:
        raise _404()
    if b.user_id != user.id and _ort_fuer_andere_verborgen(s) and not _sieht_echten_ort(db, s, user.id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "ort_verborgen")
    return {"striche": K.karte(storage.load_gps(s.session_uuid), b.von_ms, b.bis_ms, _laeufe(db, s))}


@router.get("/bild/{bild_id}/karte.png")
def bild_karte_png(bild_id: int, ebene: str = "satellit", user: models.User = Depends(current_user),
                   db: Session = Depends(get_db)) -> Response:
    """Wie /karte, aber als fertiges Bild (Jan 19.11.2026): Web und Apps zeigen im Event nur noch dieses Bild statt einer
    interaktiven Karte. Gleiche Pruefung (aufgeloest, Ort sichtbar); Plattencache je Bild, Ausschnitt und Ebene —
    nachgerechnet wird nur, wenn sich das Bild aendert (eigenes Bild vor der Aufloesung) oder KARTE_FASSUNG steigt."""
    from .sessions import _ort_fuer_andere_verborgen, _sieht_echten_ort
    if ebene not in ("satellit", "karte"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "ebene")
    b, e = _bild(db, bild_id, user)
    r = _runde(e, b.runde)
    if r["phase"] != "fertig" and b.user_id != user.id:
        raise HTTPException(status.HTTP_409_CONFLICT, "noch_nicht_aufgeloest")
    s = db.get(models.Session, b.session_id)
    if s is None or s.deleted or b.entfernt_grund is not None:
        raise _404()
    if b.user_id != user.id and _ort_fuer_andere_verborgen(s) and not _sieht_echten_ort(db, s, user.id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "ort_verborgen")
    pfad = (get_settings().data_dir / "cache" / "kunst"
            / f"{b.id}-{b.session_id}-{b.von_ms}-{b.bis_ms}-{ebene}-v{K.KARTE_FASSUNG}.png")
    if pfad.exists():
        daten = pfad.read_bytes()
    else:
        daten = K.karte_png(K.karte(storage.load_gps(s.session_uuid), b.von_ms, b.bis_ms, _laeufe(db, s), mit_tempo=True), ebene)
        try:
            pfad.parent.mkdir(parents=True, exist_ok=True)
            tmp = pfad.with_suffix(".tmp")
            tmp.write_bytes(daten)
            tmp.replace(pfad)
        except OSError:
            pass                                    # Cache ist Kuer
    return Response(content=daten, media_type="image/png", headers={"Cache-Control": "private, max-age=86400"})
