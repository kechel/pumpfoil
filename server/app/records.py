"""Täglicher Rekord-Snapshot.

Erkennt echte VERBESSERUNGEN von Community-Bestmarken je (Metrik × Scope × Fenster), loggt sie als
RecordEvent (Basis für spätere Badges) und pusht den neuen Halter (falls Push aktiviert).

Bewusst NICHT beim Upload, sondern 1×/Tag als Snapshot-Diff — sonst „gewinnt" bei einem Tagesfenster
immer, wer als Erster an einem Kalendertag hochlädt. Kleinstes Fenster daher 10 Tage.

Rollierende Fenster: nur Verbesserungen erzeugen ein Event/Push. Sinkt die Marke, weil die alte Session
aus dem Fenster altert, wird der Snapshot still nachgezogen (kein Event).
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from . import models
from .push import push_enabled, send_push, wants

log = logging.getLogger("records")

WINDOWS: dict[str, int | None] = {"10d": 10, "30d": 30, "365d": 365, "all": None}
METRICS = ["distance", "duration", "speed", "glide", "runs"]
_LABEL = {"distance": "Weitester Lauf", "duration": "Längster Lauf", "speed": "Top-Speed",
          "glide": "Längste Gleitphase", "runs": "Meiste Läufe"}
_WIN_LABEL = {"10d": "10 Tage", "30d": "30 Tage", "365d": "1 Jahr", "all": "insgesamt"}
# Gepusht wird nur fuer FRISCHE Aufnahmen (Jans Regel „nie nachtraeglich pushen"). Ohne das bekaeme
# nach einer Neuauswertung alter Sessions (27.09.2026: 86 Aufnahmen mit veraltetem Zuschnitt) oder
# nach einem tagelang haengenden Upload der Halter eine „Rekord!"-Meldung zu einer Fahrt von vor
# Wochen. Das EREIGNIS wird trotzdem festgehalten (Abzeichen), nur ohne Push. 3 Tage decken einen
# ueber Nacht haengenden Upload ab (#10158: Rest kam am Folgetag).
PUSH_FRISCH_TAGE = 3


def _fmt(metric: str, v: float) -> str:
    if metric == "distance":
        return f"{round(v)} m"
    if metric == "duration":
        return f"{int(v // 60)}:{int(v % 60):02d} min"
    if metric == "speed":
        return f"{v * 3.6:.1f} km/h"
    if metric == "glide":
        return f"{v:.1f} s"
    if metric == "runs":
        return f"{int(v)}"
    return str(v)


def _cut(days: int | None) -> datetime | None:
    return None if days is None else datetime.now(timezone.utc) - timedelta(days=days)


def run_record_snapshot(db: Session, *, do_push: bool = True) -> int:
    """Einen Snapshot rechnen: Bestmarken je (Metrik/Scope/Fenster) mit dem letzten Stand vergleichen,
    Verbesserungen loggen + (gebündelt je Nutzer) pushen. Gibt die Zahl neuer Events zurück."""
    from .api.community import REC_COL, _community

    S = models.Session
    spot_ids = [r[0] for r in db.query(S.spot_id).filter(S.spot_id.isnot(None)).distinct().all()]
    scopes: list[tuple[str, int | None]] = [("global", None)] + [(f"spot:{sid}", sid) for sid in spot_ids]

    new_events: list[models.RecordEvent] = []
    alte_events: set[int] = set()        # Events zu Aufnahmen aelter als PUSH_FRISCH_TAGE
    for metric in METRICS:
        valcol = REC_COL[metric][0]
        for win, days in WINDOWS.items():
            cut = _cut(days)
            for scope, sid in scopes:
                q = _community(db.query(valcol, S.id, S.user_id, S.started_at)).filter(valcol > 0)
                if cut is not None:
                    q = q.filter(S.started_at >= cut)
                if sid is not None:
                    q = q.filter(S.spot_id == sid)
                row = q.order_by(valcol.desc()).first()
                if row is None:
                    continue
                value, sess_id, uid, gestartet = float(row[0]), row[1], row[2], row[3]
                key = f"{metric}|{scope}|{win}"
                snap = db.get(models.RecordSnapshot, key)
                if snap is None:
                    # Baseline (erster Lauf) — kein Event, nur Ausgangsstand festhalten.
                    db.add(models.RecordSnapshot(key=key, session_id=sess_id, user_id=uid, value=value))
                    continue
                improved = value > snap.value + 1e-9
                if improved and sess_id != snap.session_id:
                    ev = models.RecordEvent(
                        user_id=uid, session_id=sess_id, metric=metric, scope=scope, window=win,
                        value=value, prev_user_id=snap.user_id, prev_session_id=snap.session_id,
                        prev_value=snap.value)
                    db.add(ev)
                    new_events.append(ev)
                    if gestartet is not None:
                        if gestartet.tzinfo is None:
                            gestartet = gestartet.replace(tzinfo=timezone.utc)
                        if gestartet < datetime.now(timezone.utc) - timedelta(days=PUSH_FRISCH_TAGE):
                            alte_events.add(id(ev))
                # Snapshot in ALLEN Fällen auf den aktuellen Top-Stand ziehen (Verbesserung ODER Alterung).
                snap.session_id, snap.user_id, snap.value = sess_id, uid, value
                snap.updated_at = models._utcnow()

    # Pushes gebündelt: pro Nutzer max. EINE Nachricht (sonst Spam bei Mehrfach-Rekord in einer Nacht).
    # Nur fuer frische Aufnahmen (s. PUSH_FRISCH_TAGE) — alte Events bleiben ungepusht.
    zu_pushen = [ev for ev in new_events if id(ev) not in alte_events]
    if do_push and push_enabled() and zu_pushen:
        by_user: dict[int, list[models.RecordEvent]] = {}
        for ev in zu_pushen:
            by_user.setdefault(ev.user_id, []).append(ev)
        for uid, evs in by_user.items():
            if not wants(db, uid, "record"):
                continue
            top = max(evs, key=lambda e: (e.window == "all", e.scope == "global", e.value))
            if len(evs) == 1:
                body = f"{_LABEL[top.metric]} ({_WIN_LABEL[top.window]}): {_fmt(top.metric, top.value)}"
            else:
                body = f"{len(evs)} neue Community-Rekorde 🎉"
            send_push(db, uid, "🏆 Community-Rekord!", body, f"/sessions/{top.session_id}")
            for e in evs:
                e.pushed = True

    db.commit()
    log.info("record snapshot: %d neue Events", len(new_events))
    return len(new_events)
