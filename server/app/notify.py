"""Push-Benachrichtigungen rund um eine fertig ausgewertete Session."""
from __future__ import annotations

import logging

from sqlalchemy import func
from sqlalchemy.orm import Session

from . import models
from .push import push_enabled, send_push

log = logging.getLogger("notify")

_METRIC_LABEL = {
    "distance": "Weitester Lauf",
    "duration": "Längster Lauf",
    "speed": "Top-Speed",
    "glide": "Längste Gleitphase",
}


def _fmt(metric: str, v: float) -> str:
    if metric == "distance":
        return f"{round(v)} m"
    if metric == "duration":
        return f"{int(v // 60)}:{int(v % 60):02d} min"
    if metric == "speed":
        return f"{v * 3.6:.1f} km/h"
    if metric == "glide":
        return f"{v:.1f} s"
    return str(v)


def _community_record(db: Session, ar: "models.AnalysisResult") -> tuple[str, float] | None:
    """Hält diese Session aktuell einen Community-Rekord? -> (metric, value) oder None."""
    try:
        from .api.community import REC_COL, _community
    except Exception:  # noqa: BLE001
        return None
    vals = {
        "distance": ar.best_distance_m,
        "duration": ar.best_duration_s,
        "speed": ar.best_speed_mps,
        "glide": ar.best_glide_s,
    }
    for metric in ("distance", "duration", "speed", "glide"):
        v = vals.get(metric) or 0.0
        if v <= 0:
            continue
        valcol = REC_COL[metric][0]
        top = _community(db.query(func.max(valcol))).scalar() or 0.0
        if v >= top:  # diese Session ist (mind. gleichauf) die Bestmarke
            return (metric, float(v))
    return None


def notify_session_analyzed(db: Session, session: "models.Session") -> None:
    """Owner benachrichtigen: Community-Rekord (falls geknackt) sonst „ausgewertet"."""
    if not push_enabled():
        return
    try:
        ar = db.query(models.AnalysisResult).filter_by(session_id=session.id).first()
        record = None
        if ar is not None and ar.detection == "model" and session.is_pumpfoil:
            record = _community_record(db, ar)
        if record:
            metric, v = record
            send_push(db, session.user_id, "🏆 Community-Rekord!",
                      f"{_METRIC_LABEL[metric]}: {_fmt(metric, v)}", f"/sessions/{session.id}")
        else:
            send_push(db, session.user_id, "Pumpfoil",
                      "Deine Session ist ausgewertet 📊", f"/sessions/{session.id}")
    except Exception as e:  # noqa: BLE001 – Benachrichtigung darf nie den Flow brechen
        log.warning("notify_session_analyzed failed: %s", e)
