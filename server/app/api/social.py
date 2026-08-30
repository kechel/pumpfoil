"""Community-Feed aus den Social-Kanaelen der Nutzer (Jan, 30.08.2026).

Ein Kanal je Nutzer, von Jan freigegeben, blockierbar. Der Feed selbst wird aus dem
YouTube-RSS gespeist (`feeds/videos.xml?channel_id=…`) — ohne API-Schluessel und ohne Vertrag.
Instagram und TikTok koennen das nicht: deren offene Endpunkte sind seit 2021/22 zu und die
Basic-Display-API wurde am 04.12.2024 abgeschaltet; Nutzer-Medien gibt es dort nur noch ueber
OAuth des jeweiligen Nutzers plus App-Review. Deshalb bewusst YouTube-only (s. docs/TODO.md).

Dieses Modul ist Schritt 1: Eintragen, Freigeben, Blocken. Das Abholen der Videos kommt separat.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone

import requests
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db
from .deps import current_admin, current_user

router = APIRouter(prefix="/api/social", tags=["social"])

# Browser-Kennzeichner ist noetig: ohne ihn antwortet YouTube auf die Kanalseite mit 302 und
# leerem Rumpf (am 30.08. gemessen). Mit Weiterleitungen sind es zwei Spruenge bis zum HTML.
_UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
       "Chrome/126.0 Safari/537.36")
_CHANNEL_ID = re.compile(r"channel/(UC[A-Za-z0-9_-]{22})")
_RSS = "https://www.youtube.com/feeds/videos.xml?channel_id={cid}"

# Erlaubt sind nur YouTube-Kanal-Adressen. Bewusst eng: was wir nicht abrufen koennen, soll
# gar nicht erst eingereicht werden — sonst wartet der Nutzer auf eine Freigabe, die nie kommt.
_ERLAUBT = re.compile(r"^https?://(www\.)?youtube\.com/(@[\w.-]+|channel/UC[A-Za-z0-9_-]{22}|c/[\w.-]+|user/[\w.-]+)/?", re.I)


def kanal_id_aufloesen(url: str) -> str | None:
    """`@handle`/Kanal-URL -> `UC…`. Gibt None zurueck, wenn nichts Belastbares gefunden wird.

    Laeuft NUR bei der Freigabe (einmal je Kanal), nicht im Betrieb — bricht YouTube das Markup,
    faellt es also bei Jan in der Freigabe auf und nicht still im stuendlichen Abruf."""
    m = re.search(r"channel/(UC[A-Za-z0-9_-]{22})", url or "")
    if m:
        return m.group(1)
    try:
        # `SOCS=CAI` ist noetig: aus der EU leitet YouTube sonst auf consent.youtube.com um und
        # liefert die Zustimmungsseite statt des Kanals (am 30.08. gemessen — mit dem Cookie
        # kommt die echte Seite, ohne ihn nie). Kein Login, keine Kennung, nur die Bestaetigung,
        # dass die Abfrage die Zustimmungsschranke kennt.
        r = requests.get(url, headers={"User-Agent": _UA},
                         cookies={"SOCS": "CAI"}, timeout=20, allow_redirects=True)
    except requests.RequestException:
        return None
    if r.status_code != 200:
        return None
    treffer = _CHANNEL_ID.search(r.text)
    return treffer.group(1) if treffer else None


def feed_erreichbar(channel_id: str) -> bool:
    """Gegenprobe vor der Freigabe: liefert der RSS-Feed dieser Kennung wirklich etwas?"""
    try:
        r = requests.get(_RSS.format(cid=channel_id), timeout=20,
                         headers={"User-Agent": _UA})
    except requests.RequestException:
        return False
    return r.status_code == 200 and "<entry>" in r.text


class KanalEingabe(BaseModel):
    url: str


def _zustand(k: models.SocialChannel | None) -> dict:
    if k is None:
        return {"url": None, "pending_url": None, "status": "none", "blocked": False,
                "rejected_reason": None}
    if k.blocked:
        stand = "blocked"
    elif k.pending_url:
        stand = "pending"
    elif k.url:
        stand = "approved"
    elif k.rejected_reason:
        stand = "rejected"
    else:
        stand = "none"
    return {
        "url": k.url,
        "pending_url": k.pending_url,
        "status": stand,
        "blocked": bool(k.blocked),
        "rejected_reason": k.rejected_reason,
        "approved_at": k.approved_at.isoformat() if k.approved_at else None,
    }


@router.get("/mine")
def mein_kanal(user: models.User = Depends(current_user),
               db: Session = Depends(get_db)) -> dict:
    """Eigener Stand: freigegeben, wartend, abgelehnt oder geblockt."""
    k = db.query(models.SocialChannel).filter_by(user_id=user.id).first()
    return _zustand(k)


@router.put("/mine")
def kanal_eintragen(body: KanalEingabe, user: models.User = Depends(current_user),
                    db: Session = Depends(get_db)) -> dict:
    """Kanal eintragen oder aendern. Landet IMMER erst als `pending_url` — ein bereits
    freigegebener Kanal bleibt so lange live, bis die Aenderung genehmigt ist."""
    url = (body.url or "").strip()
    if not url:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "URL fehlt")
    if not _ERLAUBT.match(url):
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "Nur YouTube-Kanaele (youtube.com/@name oder /channel/UC…)")
    k = db.query(models.SocialChannel).filter_by(user_id=user.id).first()
    if k is None:
        k = models.SocialChannel(user_id=user.id)
        db.add(k)
    if k.blocked:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Kanal gesperrt")
    k.pending_url = url[:255]
    k.pending_at = datetime.now(timezone.utc)
    k.rejected_reason = None
    db.commit()
    return _zustand(k)


@router.delete("/mine")
def kanal_entfernen(user: models.User = Depends(current_user),
                    db: Session = Depends(get_db)) -> dict:
    """Eigenen Kanal zuruecknehmen. Die bereits geholten Videos bleiben stehen, verschwinden
    aber aus dem Feed (der Feed liefert nur Videos zu einem freigegebenen, offenen Kanal)."""
    k = db.query(models.SocialChannel).filter_by(user_id=user.id).first()
    if k is None:
        return _zustand(None)
    k.url = None
    k.channel_id = None
    k.pending_url = None
    k.approved_at = None
    db.commit()
    return _zustand(k)


# --- Feed -----------------------------------------------------------------------------------

@router.get("/feed")
def feed(limit: int = 60, offset: int = 0,
         user: models.User = Depends(current_user),
         db: Session = Depends(get_db)) -> list[dict]:
    """Der gemeinsame Pumpfoil-Feed: alle freigegebenen Kanaele zusammen, nach
    Veroeffentlichungsdatum sortiert (Jan) — nicht nach Kanal gruppiert, nicht nach Beliebtheit.
    Das ist der Punkt der Uebung: unabhaengig vom Algorithmus einer Plattform.

    Draussen bleiben: geblockte Kanaele, geblockte Einzelvideos, und Kanaele, deren Freigabe
    zurueckgenommen wurde (`url IS NULL`). Die Videos selbst werden nie geloescht — sie tauchen
    einfach nicht mehr auf, und bei einer erneuten Freigabe sind sie sofort wieder da."""
    if user.social_allowed is False:      # Age-Gate: wie Chat und Community
        return []
    limit = max(1, min(int(limit or 60), 200))
    q = (db.query(models.SocialItem, models.User.display_name, models.User.avatar_url,
                  models.SocialChannel.url)
         .join(models.SocialChannel, models.SocialChannel.user_id == models.SocialItem.user_id)
         .join(models.User, models.User.id == models.SocialItem.user_id)
         .filter(models.SocialItem.blocked.is_(False),
                 models.SocialChannel.blocked.is_(False),
                 models.SocialChannel.url.isnot(None),
                 models.User.blocked.isnot(True))
         .order_by(models.SocialItem.published_at.desc().nullslast(),
                   models.SocialItem.id.desc())
         .offset(max(0, int(offset or 0))).limit(limit))
    out = []
    for it, name, avatar, kanal in q.all():
        out.append({
            "id": it.id,
            "platform": it.platform,
            "external_id": it.external_id,
            "url": it.url,
            "title": it.title,
            "thumb_url": it.thumb_url,
            "published_at": it.published_at.isoformat() if it.published_at else None,
            "user_id": it.user_id,
            "user_name": name,
            "user_avatar": avatar,
            "channel_url": kanal,
        })
    return out


@router.post("/item/{item_id}/report")
def melden(item_id: int, user: models.User = Depends(current_user),
           db: Session = Depends(get_db)) -> dict:
    """Nutzer meldet ein Video als themenfremd. Zaehler hoch, Sichtbarkeit bleibt — die
    Entscheidung trifft der Admin. Bewusst ohne Auto-Ausblenden ab N Meldungen: das waere eine
    Handhabe fuer Missbrauch (Jan wollte Admin + Melden, nicht Melden = Loeschen)."""
    it = db.get(models.SocialItem, item_id)
    if it is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nicht gefunden")
    it.reports = int(it.reports or 0) + 1
    db.commit()
    return {"ok": True, "reports": it.reports}


# --- Admin ----------------------------------------------------------------------------------

admin_router = APIRouter(prefix="/api/admin/social", tags=["admin"])


@admin_router.get("")
def admin_liste(_a: models.User = Depends(current_admin), db: Session = Depends(get_db)) -> dict:
    """Alles, was Jan zum Entscheiden braucht: wartende Einreichungen, freigegebene Kanaele,
    gemeldete Videos."""
    kanaele = (db.query(models.SocialChannel, models.User.display_name)
               .join(models.User, models.User.id == models.SocialChannel.user_id).all())
    wartend, offen = [], []
    for k, name in kanaele:
        eintrag = {"user_id": k.user_id, "user_name": name, "url": k.url,
                   "pending_url": k.pending_url, "channel_id": k.channel_id,
                   "blocked": bool(k.blocked), "videos": db.query(models.SocialItem)
                   .filter_by(user_id=k.user_id).count(),
                   "fetched_at": k.fetched_at.isoformat() if k.fetched_at else None}
        (wartend if k.pending_url else offen).append(eintrag)
    gemeldet = [{"id": i.id, "url": i.url, "title": i.title, "reports": i.reports,
                 "blocked": bool(i.blocked), "user_id": i.user_id}
                for i in db.query(models.SocialItem)
                .filter(models.SocialItem.reports > 0)
                .order_by(models.SocialItem.reports.desc()).limit(50).all()]
    return {"pending": wartend, "approved": offen, "reported": gemeldet}


@admin_router.post("/{user_id}/approve")
def admin_freigeben(user_id: int, _a: models.User = Depends(current_admin),
                    db: Session = Depends(get_db)) -> dict:
    """Freigeben: Handle aufloesen, Feed gegenpruefen, dann ersetzt die wartende URL die alte.
    Schlaegt die Aufloesung fehl, wird NICHT freigegeben — lieber eine sichtbare Fehlermeldung
    als ein Kanal, der stumm nie Videos liefert."""
    k = db.query(models.SocialChannel).filter_by(user_id=user_id).first()
    if k is None or not k.pending_url:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Keine wartende Einreichung")
    cid = kanal_id_aufloesen(k.pending_url)
    if not cid:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            "Kanal-Kennung nicht auffindbar — URL pruefen")
    if not feed_erreichbar(cid):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            f"Kein RSS-Feed zu {cid} — Kanal hat evtl. keine Videos")
    k.url, k.channel_id = k.pending_url, cid
    k.pending_url, k.pending_at, k.rejected_reason = None, None, None
    k.approved_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True, "channel_id": cid}


class Ablehnung(BaseModel):
    reason: str = ""


@admin_router.post("/{user_id}/reject")
def admin_ablehnen(user_id: int, body: Ablehnung, _a: models.User = Depends(current_admin),
                   db: Session = Depends(get_db)) -> dict:
    """Ablehnen mit Grund. Ein bereits freigegebener Kanal bleibt dabei unangetastet live."""
    k = db.query(models.SocialChannel).filter_by(user_id=user_id).first()
    if k is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nicht gefunden")
    k.pending_url, k.pending_at = None, None
    k.rejected_reason = (body.reason or "passt thematisch nicht")[:200]
    db.commit()
    return {"ok": True}


@admin_router.post("/{user_id}/block")
def admin_blocken(user_id: int, blocked: bool = True,
                  _a: models.User = Depends(current_admin),
                  db: Session = Depends(get_db)) -> dict:
    """Kanal sperren/entsperren. Der Eintrag bleibt, die Videos bleiben — nur der Feed
    laesst sie weg (dasselbe Muster wie `session_videos.blocked`)."""
    k = db.query(models.SocialChannel).filter_by(user_id=user_id).first()
    if k is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nicht gefunden")
    k.blocked = bool(blocked)
    db.commit()
    return {"ok": True, "blocked": k.blocked}


@admin_router.post("/item/{item_id}/dismiss")
def admin_meldung_aufheben(item_id: int, _a: models.User = Depends(current_admin),
                           db: Session = Depends(get_db)) -> dict:
    """Meldung abhaken, ohne zu sperren: das Video ist in Ordnung, der Zaehler geht auf 0.

    Ohne das bliebe nur „sperren" — wer eine unberechtigte Meldung bekommt, waere damit
    stillschweigend aus dem Feed geflogen (Jan, 30.08.)."""
    it = db.get(models.SocialItem, item_id)
    if it is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nicht gefunden")
    it.reports = 0
    db.commit()
    return {"ok": True}


@admin_router.post("/item/{item_id}/block")
def admin_video_blocken(item_id: int, blocked: bool = True,
                        _a: models.User = Depends(current_admin),
                        db: Session = Depends(get_db)) -> dict:
    """Einzelnes Video sperren — der Kanal darf bleiben. Setzt den Melde-Zaehler zurueck,
    damit die Liste abgearbeitet aussieht."""
    it = db.get(models.SocialItem, item_id)
    if it is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nicht gefunden")
    it.blocked = bool(blocked)
    it.reports = 0
    db.commit()
    return {"ok": True, "blocked": it.blocked}
