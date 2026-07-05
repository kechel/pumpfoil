"""Chat-Engine (gemeinsam für Session-Diskussion + Spot-Chat). Nur Text.
scope = "session:<id>" | "spot:<name>". Polling-basiert (kein Realtime nötig)."""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import models
from ..accounts import NEW_ACCOUNT_AGE_S, is_new_account
from ..db import get_db
from ..naming import owner_label, owner_label_sql
from ..push import send_push, wants
from ..ratelimit import enforce_user_tiers
from .deps import current_user

router = APIRouter(prefix="/api/chat", tags=["chat"])

_SCOPE_RE = re.compile(r"^(session:\d+|spot:.{1,120})$")
DUP_WINDOW_S = 120          # gleiches Posting innerhalb 2 min = Duplikat
AUTOHIDE_REPORTS = 3        # ab so vielen Meldungen automatisch ausblenden

# --- Anti-Spam (Flood-Schutz für eingeloggte Nutzer) ---------------------------
# Per-User-Postlimit (Stufen: max_hits, window_s). Frische Konten strenger.
# „Neu" = jünger als NEW_ACCOUNT_AGE_S (24 h, s. accounts.py) — dieselbe Schwelle
# wie das „neu"-Badge in Community & Chat.
RATE_TIERS = [(5, 10), (30, 300)]             # etablierte Nutzer
RATE_TIERS_NEW = [(2, 10), (8, 300)]          # frische Konten
_URL_RE = re.compile(r"https?://|www\.", re.I)  # Link-Drossel für neue Konten


def _norm(text: str) -> str:
    """Normalisiert für Duplikatserkennung: Kleinschreibung + Whitespace kollabiert."""
    return " ".join((text or "").lower().split())


def _scope_label(scope: str) -> str:
    kind, _, rest = scope.partition(":")
    return rest if kind == "spot" else f"Session #{rest}"


def _scope_label_db(db: Session, scope: str, viewer_id: int | None = None) -> str:
    """Sprechendes Label für einen Chatraum:
    - spot:<name>     -> Spotname
    - session:<id>    -> „<Fahrer> · <Spot> · <Datum>" (Fahrername immer voran, auch
                         bei der eigenen Session); fehlt der Spot -> Datum; sonst „Session #id".
    Braucht die DB, um die Session-Diskussion nach Fahrer/Spot statt nur „#4" zu zeigen."""
    kind, _, rest = scope.partition(":")
    if kind == "spot":
        return rest
    try:
        sid = int(rest)
    except ValueError:
        return _scope_label(scope)
    s = db.get(models.Session, sid)
    if s is not None:
        date = s.started_at.strftime("%d.%m.%y") if s.started_at else None
        if s.place_name and date:
            base = f"{s.place_name} · {date}"
        elif s.place_name:
            base = s.place_name
        elif date:
            base = date
        else:
            base = f"Session #{rest}"
        owner = owner_label(s.user.display_name, s.user.id) if s.user else None
        return f"{owner} · {base}" if owner else base
    return f"Session #{rest}"


def _scope_url(scope: str) -> str:
    # Push-Deeplink öffnet die eigenständige Chat-Ansicht (Fullscreen).
    from urllib.parse import quote
    return f"/chat?scope={quote(scope)}"


def _state(db: Session, user_id: int, scope: str) -> models.ChatRoomState:
    st = db.query(models.ChatRoomState).filter_by(user_id=user_id, scope=scope).first()
    if st is None:
        # last_read_id explizit auf 0: der Spalten-Default greift erst beim Flush, vorher
        # wäre der Wert None -> Vergleiche wie `up_to > last_read_id` crashen (int > None).
        st = models.ChatRoomState(user_id=user_id, scope=scope, last_read_id=0)
        db.add(st)
    return st


def _check_scope(scope: str) -> None:
    if not _SCOPE_RE.match(scope or ""):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ungültiger Chat-scope")


def _canon_scope(db: Session, scope: str) -> str:
    """Spot-Scope kanonisieren: `spot:<id>` -> `spot:<name>` (kanonisch = Name), damit
    App (Name) und PWA (id) im SELBEN Raum landen. Andere Scopes unverändert."""
    if scope and scope.startswith("spot:"):
        from ..spots import canon_spot_name
        return "spot:" + canon_spot_name(db, scope[5:])
    return scope


class PostIn(BaseModel):
    text: str


def _msg_out(m: models.ChatMessage, name: str, avatar: str | None, uid: int,
             author_new: bool = False) -> dict:
    return {
        "id": m.id, "user_id": m.user_id, "name": name, "avatar_url": avatar,
        "text": m.text, "created_at": m.created_at.isoformat() if m.created_at else None,
        "mine": m.user_id == uid, "hidden": m.hidden, "report_count": m.report_count,
        "author_new": author_new,
    }


@router.get("")
def list_messages(
    scope: str = Query(...), after: int = 0, before: int = 0, limit: int = 30,
    user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> list[dict]:
    """Chat-Nachrichten, immer aufsteigend (älteste -> neueste) zurückgegeben.
    - ohne Cursor: die neuesten `limit` Nachrichten (für initiales Laden).
    - after=<id>: alle Nachrichten neuer als id (Polling).
    - before=<id>: die `limit` Nachrichten direkt vor id (Hochscroll-Nachladen)."""
    _check_scope(scope)
    scope = _canon_scope(db, scope)
    lim = min(max(limit, 1), 100)
    q = (
        db.query(models.ChatMessage, owner_label_sql(models.User), models.User.avatar_url,
                 models.User.created_at)
        .join(models.User, models.ChatMessage.user_id == models.User.id)
        .filter(models.ChatMessage.scope == scope)
    )
    if not user.is_admin:
        q = q.filter(models.ChatMessage.hidden.isnot(True))
    # Versteckte Testkonten: ihre Nachrichten nur für sie selbst sichtbar.
    from sqlalchemy import or_
    q = q.filter(or_(models.User.hidden.isnot(True), models.User.id == user.id))
    if after:
        # Neue Nachrichten seit `after`: aufsteigend ab dem Cursor.
        rows = q.filter(models.ChatMessage.id > after).order_by(
            models.ChatMessage.id.asc()).limit(lim).all()
    else:
        # Neueste (oder die vor `before`): absteigend holen, dann umdrehen.
        if before:
            q = q.filter(models.ChatMessage.id < before)
        rows = q.order_by(models.ChatMessage.id.desc()).limit(lim).all()
        rows = list(reversed(rows))
    return [_msg_out(m, name, avatar, user.id, is_new_account(created))
            for m, name, avatar, created in rows]


@router.post("")
def post_message(
    body: PostIn, scope: str = Query(...),
    user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> dict:
    _check_scope(scope)
    scope = _canon_scope(db, scope)
    if user.chat_readonly:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Im Chat schreibgesperrt")
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Leere Nachricht")
    if len(text) > 2000:
        text = text[:2000]

    now = datetime.now(timezone.utc)
    is_new = is_new_account(user.created_at)

    # Anti-Spam (Admins ausgenommen — sie moderieren).
    if not user.is_admin:
        # Layer 1+2: Per-User-Flood-Limit, frische Konten strenger.
        enforce_user_tiers(user.id, RATE_TIERS_NEW if is_new else RATE_TIERS, scope="chat")
        # Layer 3: Link-Drossel — neue Konten dürfen noch keine Links posten.
        if is_new and _URL_RE.search(text):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "Neue Konten können noch keine Links posten — bitte etwas später erneut.",
            )

    # Layer 4: Duplikatserkennung — normalisiert, raum-übergreifend, kürzlich.
    since = now - timedelta(seconds=DUP_WINDOW_S)
    norm = _norm(text)
    recent = (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.user_id == user.id, models.ChatMessage.created_at >= since)
        .order_by(models.ChatMessage.id.desc()).limit(20).all()
    )
    for r in recent:
        if _norm(r.text) != norm:
            continue
        if r.scope == scope:
            # Gleicher Raum: idempotent zurückgeben (Doppel-Tap/Retry).
            return _msg_out(r, user.display_name, user.avatar_url, user.id, is_new)
        # Gleicher Text in einem ANDEREN Raum -> Cross-Room-Spam blocken.
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Bitte denselben Text nicht in mehrere Räume posten.",
        )
    m = models.ChatMessage(scope=scope, user_id=user.id, text=text)
    db.add(m)
    db.flush()
    # Eigene Nachricht gilt als gelesen; Raum nicht mehr „verlassen".
    st = _state(db, user.id, scope)
    st.last_read_id = m.id
    st.left = False
    st.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(m)
    _notify_subscribers(db, m, user)
    return _msg_out(m, user.display_name, user.avatar_url, user.id, is_new)


def _notify_subscribers(db: Session, m: models.ChatMessage, author: models.User) -> None:
    """Push an alle, die diesen Raum abonniert haben (außer dem Autor)."""
    subs = (
        db.query(models.ChatRoomState)
        .filter(models.ChatRoomState.scope == m.scope,
                models.ChatRoomState.push.is_(True),
                models.ChatRoomState.left.isnot(True),
                models.ChatRoomState.user_id != author.id)
        .all()
    )
    if not subs:
        return
    title = f"💬 {_scope_label_db(db, m.scope)}"
    body = f"{author.display_name or 'Jemand'}: {m.text[:120]}"
    url = _scope_url(m.scope)
    for st in subs:
        if wants(db, st.user_id, "chat"):
            send_push(db, st.user_id, title, body, url)


@router.post("/{message_id}/report")
def report_message(
    message_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> dict:
    m = db.get(models.ChatMessage, message_id)
    if m is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nachricht nicht gefunden")
    if db.query(models.ChatReport).filter_by(message_id=message_id, user_id=user.id).first() is None:
        db.add(models.ChatReport(message_id=message_id, user_id=user.id))
        m.report_count = (m.report_count or 0) + 1
        if m.report_count >= AUTOHIDE_REPORTS:
            m.hidden = True
        db.commit()
    return {"ok": True, "report_count": m.report_count, "hidden": m.hidden}


# Eigene Nachrichten dürfen innerhalb dieses Fensters bearbeitet/gelöscht werden.
EDIT_WINDOW_S = 3600  # 1 Stunde


def _own_editable(message_id: int, user: models.User, db: Session) -> models.ChatMessage:
    m = db.get(models.ChatMessage, message_id)
    if m is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nachricht nicht gefunden")
    if m.user_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Nicht deine Nachricht")
    created = m.created_at
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    if (datetime.now(timezone.utc) - created).total_seconds() > EDIT_WINDOW_S:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nachricht ist älter als 1 Stunde")
    return m


class EditIn(BaseModel):
    text: str


@router.patch("/{message_id}")
def edit_message(
    message_id: int, body: EditIn,
    user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> dict:
    """Eigene Nachricht bearbeiten (nur innerhalb 1 h)."""
    m = _own_editable(message_id, user, db)
    text = (body.text or "").strip()[:2000]
    if not text:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Leerer Text")
    m.text = text
    db.commit()
    return {"ok": True, "id": m.id, "text": m.text}


@router.put("/{message_id}")
def edit_message_put(
    message_id: int, body: EditIn,
    user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> dict:
    """PUT-Alias zu edit_message — native Clients (Android HttpURLConnection) koennen kein PATCH."""
    return edit_message(message_id, body, user, db)


@router.delete("/{message_id}")
def delete_message(
    message_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> dict:
    """Eigene Nachricht löschen (nur innerhalb 1 h)."""
    m = _own_editable(message_id, user, db)
    db.delete(m)
    db.commit()
    return {"ok": True, "id": message_id}


def _require_admin(user: models.User) -> None:
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Nur für Admins")


class HideIn(BaseModel):
    hidden: bool


@router.post("/{message_id}/hide")
def set_hidden(
    message_id: int, body: HideIn,
    user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> dict:
    """Admin: Nachricht aus-/einblenden (Freigeben einer gemeldeten Nachricht)."""
    _require_admin(user)
    m = db.get(models.ChatMessage, message_id)
    if m is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nachricht nicht gefunden")
    m.hidden = bool(body.hidden)
    db.commit()
    return {"ok": True, "id": m.id, "hidden": m.hidden}


@router.get("/reported")
def list_reported(
    user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> list[dict]:
    """Admin: alle gemeldeten Nachrichten (report_count > 0), neueste zuerst."""
    _require_admin(user)
    rows = (
        db.query(models.ChatMessage, owner_label_sql(models.User), models.User.avatar_url,
                 models.User.created_at)
        .join(models.User, models.ChatMessage.user_id == models.User.id)
        .filter(models.ChatMessage.report_count > 0)
        .order_by(models.ChatMessage.report_count.desc(), models.ChatMessage.id.desc())
        .limit(200).all()
    )
    out = []
    for m, name, avatar, created in rows:
        d = _msg_out(m, name, avatar, user.id, is_new_account(created))
        d["scope"] = m.scope
        out.append(d)
    return out


class ReadonlyIn(BaseModel):
    user_id: int
    readonly: bool


@router.post("/moderation/readonly")
def set_readonly(
    body: ReadonlyIn,
    user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> dict:
    """Admin: einen Nutzer im Chat auf read-only setzen / wieder freigeben."""
    _require_admin(user)
    target = db.get(models.User, body.user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nutzer nicht gefunden")
    target.chat_readonly = bool(body.readonly)
    db.commit()
    return {"ok": True, "user_id": target.id, "chat_readonly": target.chat_readonly}


# --- Mitgliedschaft / Unread / Verlassen / Push-Abo -------------------------

class ReadIn(BaseModel):
    scope: str
    up_to: int


@router.post("/read")
def mark_read(
    body: ReadIn, user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> dict:
    """Lesestand setzen (Chat-Komponente meldet die höchste gesehene id)."""
    _check_scope(body.scope)
    body.scope = _canon_scope(db, body.scope)
    st = _state(db, user.id, body.scope)
    if st.last_read_id is None or body.up_to > st.last_read_id:
        st.last_read_id = body.up_to
    st.left = False
    st.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True, "last_read_id": st.last_read_id}


@router.post("/leave")
def leave_room(
    scope: str = Query(...), user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> dict:
    """Chatraum verlassen — taucht nicht mehr in „meine Chats"/Unread auf."""
    _check_scope(scope)
    scope = _canon_scope(db, scope)
    st = _state(db, user.id, scope)
    st.left = True
    st.push = False
    st.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}


class SubIn(BaseModel):
    scope: str
    on: bool


@router.post("/subscribe")
def subscribe_room(
    body: SubIn, user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> dict:
    """Push-Benachrichtigung für neue Nachrichten in diesem Raum an/aus."""
    _check_scope(body.scope)
    body.scope = _canon_scope(db, body.scope)
    st = _state(db, user.id, body.scope)
    st.push = bool(body.on)
    if body.on:
        st.left = False
    st.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True, "push": st.push}


@router.get("/state")
def room_state(
    scope: str = Query(...), user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> dict:
    """Status des aktuellen Raums für den Nutzer (Abo/verlassen/Lesestand)."""
    _check_scope(scope)
    scope = _canon_scope(db, scope)
    st = db.query(models.ChatRoomState).filter_by(user_id=user.id, scope=scope).first()
    return {
        "scope": scope,
        "push": bool(st and st.push),
        "left": bool(st and st.left),
        "last_read_id": (st.last_read_id if st else 0),
    }


@router.get("/rooms")
def my_rooms(
    user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> list[dict]:
    """„Meine Chats" mit Ungelesen-Zähler + letzter Nachricht. Verlassene ausgeblendet."""
    from sqlalchemy import func, or_

    # Nachrichten ausgeblendeter Testkonten sind für andere unsichtbar (wie in list_messages)
    # -> dürfen weder als „letzte Nachricht" noch als Ungelesen zählen (sonst ein (1)-Badge,
    # das nie wegklickbar ist, weil die Nachricht gar nicht angezeigt wird).
    _visible_author = or_(models.User.hidden.isnot(True), models.User.id == user.id)

    states = (
        db.query(models.ChatRoomState)
        .filter(models.ChatRoomState.user_id == user.id, models.ChatRoomState.left.isnot(True))
        .all()
    )
    out = []
    for st in states:
        # Session-Chats vorerst ausgeblendet — nur Spot-Chats anzeigen.
        if st.scope.startswith("session:"):
            continue
        last = (
            db.query(models.ChatMessage)
            .join(models.User, models.ChatMessage.user_id == models.User.id)
            .filter(models.ChatMessage.scope == st.scope, models.ChatMessage.hidden.isnot(True),
                    _visible_author)
            .order_by(models.ChatMessage.id.desc())
            .first()
        )
        if last is None:
            continue
        unread = (
            db.query(func.count(models.ChatMessage.id))
            .join(models.User, models.ChatMessage.user_id == models.User.id)
            .filter(models.ChatMessage.scope == st.scope,
                    models.ChatMessage.hidden.isnot(True),
                    models.ChatMessage.user_id != user.id,
                    _visible_author,
                    models.ChatMessage.id > st.last_read_id)
            .scalar()
        ) or 0
        out.append({
            "scope": st.scope,
            "label": _scope_label_db(db, st.scope, user.id),
            "url": _scope_url(st.scope),
            "push": st.push,
            "unread": int(unread),
            "last_text": last.text[:120],
            "last_at": last.created_at.isoformat() if last.created_at else None,
        })
    out.sort(key=lambda r: (r["unread"] > 0, r["last_at"] or ""), reverse=True)
    return out


@router.get("/active")
def active_rooms(
    hours: int = 48, limit: int = 3,
    user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> list[dict]:
    """Aktivste Chaträume der letzten `hours` Stunden — OHNE die eigenen (in denen
    der Nutzer Mitglied ist), nach Nachrichtenzahl sortiert (Entdeckung)."""
    from sqlalchemy import func

    since = datetime.now(timezone.utc) - timedelta(hours=min(max(hours, 1), 168))
    mine = {
        r[0] for r in db.query(models.ChatRoomState.scope)
        .filter(models.ChatRoomState.user_id == user.id,
                models.ChatRoomState.left.isnot(True)).all()
    }
    rows = (
        db.query(models.ChatMessage.scope, func.count(models.ChatMessage.id).label("n"))
        .filter(models.ChatMessage.hidden.isnot(True), models.ChatMessage.created_at >= since)
        .group_by(models.ChatMessage.scope)
        .order_by(func.count(models.ChatMessage.id).desc())
        .all()
    )
    out = []
    for scope, n in rows:
        if scope in mine or scope.startswith("session:"):
            continue
        last = (
            db.query(models.ChatMessage)
            .filter(models.ChatMessage.scope == scope, models.ChatMessage.hidden.isnot(True))
            .order_by(models.ChatMessage.id.desc()).first()
        )
        out.append({
            "scope": scope, "label": _scope_label_db(db, scope, user.id), "url": _scope_url(scope),
            "messages": int(n),
            "last_text": last.text[:120] if last else "",
            "last_at": last.created_at.isoformat() if last and last.created_at else None,
        })
        if len(out) >= min(max(limit, 1), 20):
            break
    return out


@router.get("/all-spots")
def all_spot_chats(user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    """ALLE Spot-Chats mit mind. einer sichtbaren Nachricht — für die Auswahl-Box, damit jeder
    in jeden Spot-Chat schauen kann. Neueste Aktivität zuerst."""
    from sqlalchemy import func

    rows = (
        db.query(models.ChatMessage.scope,
                 func.count(models.ChatMessage.id).label("n"),
                 func.max(models.ChatMessage.created_at).label("last"))
        .filter(models.ChatMessage.hidden.isnot(True), models.ChatMessage.scope.like("spot:%"))
        .group_by(models.ChatMessage.scope)
        .order_by(func.max(models.ChatMessage.created_at).desc())
        .all()
    )
    return [
        {"scope": s, "label": _scope_label_db(db, s, user.id), "url": _scope_url(s), "messages": int(n)}
        for s, n, _last in rows
    ]
