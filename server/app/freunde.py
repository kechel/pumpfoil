"""Freunde in der Community (Jan, 15.10.2026).

WAS EINE FREUNDSCHAFT FREIGIBT — und NUR das (der Bestaetigungsdialog sagt es woertlich, es gibt
bewusst keinen Schalter dafuer):
  * die GANZE Foiler-Seite, auch Abschnitte, die im Profil ausgeschaltet sind, und auch eine ganz
    abgeschaltete Seite (`community.foiler_profil`);
  * das Gewicht, auch wenn „Gewicht verbergen" an ist;
  * „gerade am Pumpen" mit Spot — der gruene Spot auch an kleinen Spots unter der Schwelle von
    `devices.SPOT_MIN_FAHRER` und auch, wenn „auf der Spot-Karte zeigen" aus ist; dazu die
    Push-Nachricht „X pumpt gerade am Spot Y" (`melden`).
NICHT freigegeben: verborgene Orte (bleiben am Point Nemo), Rohdaten/Downloads, Ausruestung,
eine vollstaendige Sessionliste, Einstellungen der Erkennung.

SAUBERKEIT: jede Freigabe fragt `ist_freund` bzw. `freund_ids` — nie die Oberflaeche. Beides liest
nur `status == "accepted"`; eine offene oder abgelehnte Anfrage gibt nichts frei. Freundesdaten
laufen nie durch Caches, die fuer alle gleich sind.

DIE ANSICHT „FREUNDE" (Community-Seite, Session-Liste): ein reiner FILTER, der die ohnehin
community-sichtbaren Sessions auf mich + meine Freunde eingrenzt. Er gibt nichts zusaetzlich frei.
Umgesetzt als Kontextvariable, die `FreundeFilter` (ASGI-Middleware) aus `?friends=1` setzt und
`community._community` liest — so gilt sie fuer JEDE Abfrage der Seite (Rekorde, Ranglisten, Feed,
Statistik), ohne dass jeder Endpunkt einen eigenen Parameter durchreichen muss. Endpunkte mit
Cache muessen `nur_freunde()` beachten und daran vorbeigehen.
"""
from __future__ import annotations

import contextvars
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from . import models

log = logging.getLogger("app.freunde")

# Nach einer Ablehnung so lange keine neue Anfrage desselben Absenders (der sieht weiter „angefragt").
SPERRE_NACH_ABLEHNUNG = timedelta(days=30)
# Hoechstens so viele neue Anfragen je Nutzer und Tag (gegen Massen-Anfragen).
ANFRAGEN_JE_TAG = 20
# „X pumpt gerade" hoechstens einmal in diesem Abstand je Fahrer — ein Pumptag, eine Nachricht.
MELDE_PAUSE = timedelta(hours=6)

_NUR_FREUNDE: contextvars.ContextVar[bool] = contextvars.ContextVar("nur_freunde", default=False)


def nur_freunde() -> bool:
    """Steht die aktuelle Anfrage in der Ansicht „Freunde"? (s. Kopfzeile)"""
    return _NUR_FREUNDE.get()


class FreundeFilter:
    """ASGI-Middleware: `?friends=1` an einer /api/community-Anfrage -> `nur_freunde()` ist wahr.
    Rein ASGI (nicht BaseHTTPMiddleware), damit die Kontextvariable sicher bis in den Endpunkt
    reicht — auch in die Threadpools der synchronen Endpunkte, die den Kontext kopieren."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") == "http" and scope.get("path", "").startswith("/api/community"):
            qs = (scope.get("query_string") or b"").decode("latin-1")
            an = any(teil in ("friends=1", "friends=true") for teil in qs.split("&"))
            token = _NUR_FREUNDE.set(an)
            try:
                await self.app(scope, receive, send)
            finally:
                _NUR_FREUNDE.reset(token)
            return
        await self.app(scope, receive, send)


def _paar(a: int, b: int) -> tuple[int, int]:
    return (a, b) if a < b else (b, a)


def zeile(db: Session, a: int, b: int) -> models.Friendship | None:
    lo, hi = _paar(a, b)
    return db.query(models.Friendship).filter_by(user_lo=lo, user_hi=hi).first()


def freund_ids(db: Session, uid: int) -> set[int]:
    """Alle BESTAETIGTEN Freunde von `uid`."""
    F = models.Friendship
    out: set[int] = set()
    for lo, hi in (db.query(F.user_lo, F.user_hi)
                   .filter(F.status == "accepted", or_(F.user_lo == uid, F.user_hi == uid)).all()):
        out.add(hi if lo == uid else lo)
    return out


def ist_freund(db: Session, a: int | None, b: int | None) -> bool:
    if not a or not b or a == b:
        return False
    z = zeile(db, a, b)
    return z is not None and z.status == "accepted"


def beziehung(db: Session, ich: int, anderer: int) -> str | None:
    """Aus MEINER Sicht: "freund" | "angefragt" (ich habe gefragt; auch nach Ablehnung, die verraten
    wir nicht) | "eingehend" (der andere fragt mich) | None."""
    if ich == anderer:
        return None
    z = zeile(db, ich, anderer)
    if z is None:
        return None
    if z.status == "accepted":
        return "freund"
    if z.status == "withdrawn":
        return None
    if z.requester_id == ich:
        return "angefragt"
    return "eingehend" if z.status == "pending" else None


def gesperrt(db: Session, a: int, b: int) -> bool:
    """Hat einer den anderen im Chat blockiert? Dann gibt es auch keine Freundschaft."""
    B = models.UserBlock
    return db.query(B.id).filter(or_(
        and_(B.blocker_id == a, B.blocked_id == b),
        and_(B.blocker_id == b, B.blocked_id == a))).first() is not None


def darf_freunde_haben(u: models.User | None) -> bool:
    """Gesperrte, versteckte Konten (Store-Tester) und Konten unter 13 haben keine Freunde."""
    return u is not None and not u.blocked and not u.hidden and bool(u.social_allowed)


# --- Push-Texte ------------------------------------------------------------------------------
# Kurz und in der Sprache des EMPFAENGERS; Deutsch fuer de/gsw/de-AT, sonst Englisch.
_TEXTE = {
    "anfrage": {"de": "{n} möchte mit dir befreundet sein", "en": "{n} wants to be your friend"},
    "angenommen": {"de": "{n} hat deine Freundschaftsanfrage angenommen",
                   "en": "{n} accepted your friend request"},
    "pumpt": {"de": "{n} pumpt gerade · {s}", "en": "{n} is pumping right now · {s}"},
    "pumpt_ohne": {"de": "{n} pumpt gerade", "en": "{n} is pumping right now"},
}


def text(empfaenger: models.User | None, art: str, **kw) -> str:
    sprache = (getattr(empfaenger, "language", None) or "en").lower()
    t = _TEXTE[art]["de" if sprache.startswith(("de", "gsw")) else "en"]
    return t.format(**kw)


def push(db: Session, an: int, art: str, url: str, **kw) -> None:
    """Best effort, nie werfen. Typ "friend" in den Push-Einstellungen."""
    from .push import push_enabled, send_push, wants
    try:
        if push_enabled() and wants(db, an, "friend"):
            send_push(db, an, "Pumpfoil", text(db.get(models.User, an), art, **kw), url)
    except Exception:   # noqa: BLE001 - eine Nachricht darf nie den Ablauf brechen
        log.exception("Freundes-Push an %s", an)


def melden(db: Session, jetzt: datetime | None = None) -> int:
    """Den Freunden derer, die gerade pumpen, EINMAL je `MELDE_PAUSE` Bescheid geben.

    Laeuft im 5-Minuten-Timer (scripts/live-sessions-nachrechnen.py). „Pumpt gerade" ist dieselbe
    Schaetzung wie der Zaehler und die gruenen Spots (`devices._aktive_nutzer`), der Spot derselbe
    wie auf der Karte. Gibt die Zahl der gemeldeten Fahrer zurueck."""
    from .api.devices import _aktive_nutzer, _spot_des_nutzers
    jetzt = jetzt or datetime.now(timezone.utc)
    aktive = _aktive_nutzer(db)
    if not aktive:
        return 0
    spots = None
    gemeldet = 0
    for uid in sorted(aktive):
        u = db.get(models.User, uid)
        if not darf_freunde_haben(u):
            continue
        zuletzt = u.freunde_gemeldet_at
        if zuletzt is not None and zuletzt.tzinfo is None:
            zuletzt = zuletzt.replace(tzinfo=timezone.utc)
        if zuletzt is not None and jetzt - zuletzt < MELDE_PAUSE:
            continue
        fids = freund_ids(db, uid)
        if not fids:
            continue
        if spots is None:
            spots = {sp.id: sp for sp in db.query(models.Spot)
                     .filter(models.Spot.merged_into.is_(None), models.Spot.lat.isnot(None),
                             models.Spot.lon.isnot(None)).all()}
        sid = _spot_des_nutzers(db, uid, spots)
        name = u.display_name or "?"
        # Erst merken, dann schicken: faellt der Versand aus, soll der naechste Lauf nicht
        # dieselbe Nachricht noch einmal versuchen (lieber eine verpasst als zehn doppelt).
        u.freunde_gemeldet_at = jetzt
        db.commit()
        for f in sorted(fids):
            if sid is not None:
                push(db, f, "pumpt", f"/sessions?scope=all&spot={sid}", n=name, s=spots[sid].name)
            else:
                push(db, f, "pumpt_ohne", f"/foiler/{uid}", n=name)
        gemeldet += 1
    if gemeldet:
        log.info("Freunde benachrichtigt: %d Fahrer pumpen gerade", gemeldet)
    return gemeldet


def aktive_freunde(db: Session, ich: int) -> list[dict]:
    """Meine Freunde, die gerade pumpen, mit Spot (Spot-Karte, Spot-Seite, Freunde-Seite).
    NICHT gecacht — die Antwort haengt am Betrachter."""
    from .api.devices import _aktive_nutzer, _spot_des_nutzers
    fids = freund_ids(db, ich)
    if not fids:
        return []
    aktiv = _aktive_nutzer(db) & fids
    if not aktiv:
        return []
    spots = {sp.id: sp for sp in db.query(models.Spot)
             .filter(models.Spot.merged_into.is_(None), models.Spot.lat.isnot(None),
                     models.Spot.lon.isnot(None)).all()}
    out = []
    for uid in sorted(aktiv):
        u = db.get(models.User, uid)
        if not darf_freunde_haben(u):
            continue
        sid = _spot_des_nutzers(db, uid, spots)
        out.append({"user_id": uid, "name": u.display_name, "avatar_url": u.avatar_url,
                    "spot_id": sid, "spot": spots[sid].name if sid is not None else None})
    return out
