"""ML-Endpoints: Trainings-Datensatz-Status + Training (Pump/Glide) anstoßen."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db
from ..ml.dataset import FEATURE_NAMES, build_dataset
from ..ml.train import cross_validate, save_model, train
from .deps import current_user

router = APIRouter(prefix="/api/ml", tags=["ml"])


@router.get("/status")
def status(
    user: models.User = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    """Wie viele gelabelte Fenster/Sessions stehen aktuell fürs Training bereit."""
    X, y, groups = build_dataset(db, user_id=user.id)
    return {
        "n_samples": len(y),
        "n_sessions": len(set(groups)),
        "classes": sorted(set(y)),
        "features": FEATURE_NAMES,
    }


@router.post("/train")
def train_model(
    user: models.User = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    """Trainiert das Pump/Glide-Modell aus den gelabelten Daten des Nutzers und
    liefert den session-level CV-Report. Modell wird nur bei ausreichend Daten gespeichert."""
    X, y, groups = build_dataset(db, user_id=user.id)
    report = cross_validate(X, y, groups)
    if report.get("status") == "ok":
        save_model(train(X, y))
        report["saved"] = True
    else:
        report["saved"] = False
    return report
