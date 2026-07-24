"""App-Meta: neueste Store-Version der Phone-Apps (fuer den In-App-Update-Hinweis).

WICHTIG (Jan): der Server kennt die Store-Version NICHT automatisch. Nach jedem
Store-Release, der durch den Review ist, die Werte hier von Hand aktualisieren.
Solange `latest` leer ist, zeigt die App KEINEN Hinweis (kein Fehlalarm auf eine
noch nicht verfuegbare Version).

- latest:        neueste im Store verfuegbare Version (z. B. "1.1.8"); leer = kein Hinweis
- min_supported: erzwingt ein Update (App zeigt Hard-Gate), leer = kein Zwang
- store_url:     Ziel des "Aktualisieren"-Buttons
"""
import json

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db

router = APIRouter(prefix="/api/app", tags=["app"])


@router.get("/news")
def news_banner(db: Session = Depends(get_db)) -> dict:
    """Öffentlicher News-Banner-Inhalt für die PWA (kein Auth nötig). Die PWA vergleicht
    `version` mit ihrem localStorage-Wert und zeigt/versteckt den Banner. Inhalt wird im
    Admin gepflegt — kein PWA-Rebuild nötig."""
    row = db.query(models.NewsBanner).first()
    if row is None:
        return {"version": 0, "enabled": False, "texts": {}}
    return {
        "version": int(row.version or 0),
        "enabled": bool(row.enabled),
        "texts": json.loads(row.text_json) if row.text_json else {},
    }

# ---- MANUELL PFLEGEN nach jedem Store-Release (siehe Modul-Docstring) ----
_APP_META: dict[str, dict[str, str]] = {
    "ios": {
        "latest": "1.1.15",    # FREIGEGEBEN 2026-07-19 (eligible for distribution; Submission 99aecbbd)
        "min_supported": "",
        "store_url": "https://apps.apple.com/app/pumpfoil/id6783975714",
    },
    "android": {
        "latest": "1.1.13",    # LIVE im Play Store 2026-07-19 (Produktion; vc29)
        "min_supported": "",
        "store_url": "https://play.google.com/store/apps/details?id=org.pumpfoil.app",
    },
    "garmin": {
        # NUR auf eine im Connect-IQ-Store FREIGEGEBENE Version setzen (Prüfung durch)!
        # Leer = kein Update-Hinweis auf der Uhr. Die Garmin-App vergleicht das mit Config.VERSION.
        "latest": "1.0.62",   # LIVE im CIQ-Store 2026-07-24 (GPS-first-Upload + nl/fi/cs on-watch)
        "min_supported": "",
        "store_url": "https://apps.garmin.com/apps/9a2a753e-b52f-4587-aee4-900caf5cb351",
    },
}


@router.get("/latest")
def latest(platform: str = "") -> dict:
    """Neueste Store-Version je Plattform (ios|android). Werte werden manuell gepflegt.
    Die App vergleicht `latest` mit ihrer eigenen Bundle-Version und blendet ggf. einen
    nicht-blockierenden Hinweis ein (Hard-Gate optional ueber `min_supported`)."""
    m = _APP_META.get(platform.lower().strip())
    if not m:
        return {"latest": "", "min_supported": "", "store_url": ""}
    return dict(m)
