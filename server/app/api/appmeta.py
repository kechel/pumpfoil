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
#
# WICHTIG — die Schluessel sind die Plattform-Strings, mit denen die Clients anfragen:
#   Handy-Apps: GET /api/app/latest?platform=ios|android
#   Uhr-Apps:   GET /api/devices/config?p=garmin|wear|apple|zepp  -> devices.py:190 liest
#               _APP_META[p]["latest"] und schickt es als "latestVersion" mit.
# Fehlt ein Schluessel, liefert der Server "" = KEIN Hinweis. Genau das war bis 2026-07-29 der
# Fall fuer wear, apple und zepp: die drei Uhren fragten an, bekamen aber immer leer zurueck.
#
# REGEL: `latest` NUR auf eine im jeweiligen Store WIRKLICH FREIGEGEBENE Version setzen. Sonst
# schickt der Hinweis Nutzer auf eine Store-Seite, die die Version noch nicht ausliefert.
_APP_META: dict[str, dict[str, str]] = {
    # --- Handy-Apps ---
    "ios": {
        "latest": "1.1.21",   # FREIGEGEBEN 2026-08-05 (Apple: "eligible for distribution", Submission
        # 2e0f43f1); Propagation bis 24 h. 1.1.20 wurde nie ausgeliefert -- durch 1.1.21 ersetzt,
        # das den Standort-Fix zusaetzlich enthaelt.
        "min_supported": "",
        "store_url": "https://apps.apple.com/app/pumpfoil/id6783975714",
    },
    "android": {
        # LIVE im Play Store 2026-07-31: Play-Mail "is live in the store" + Track-Zusammenfassung
        # (Smartphones/Tablets/Chrome OS/Android XR) "Aktiv, neuester Release 31 (1.1.17), 177
        # Laender" — kein Staffelungs-Prozentsatz, also vollstaendiger Roll-out.
        # MERKE: vom 29.07. bis 31.07. stand hier verfrueht schon 1.1.17, waehrend Play noch pruefte.
        # Ein Nutzer mit 1.1.14 bekam dadurch einen Update-Hinweis, den Play nicht einloesen konnte
        # ("update button just opens google play and does not offer nor start update"). Deshalb: erst
        # eintragen, wenn Freigabe DA und Roll-out bei 100 % — "eingereicht" genuegt nie.
        "latest": "1.1.18",   # LIVE im Play Store 2026-08-04 (Mail "is live", org.pumpfoil.app)
        "min_supported": "",
        "store_url": "https://play.google.com/store/apps/details?id=org.pumpfoil.app",
    },
    # --- Uhr-Apps (fragen ueber /api/devices/config an, s. oben) ---
    "garmin": {
        # NUR auf eine im Connect-IQ-Store FREIGEGEBENE Version setzen (Pruefung durch)!
        # Die Garmin-App vergleicht das selbst mit Config.VERSION (SessionRecorder.mc:638).
        "latest": "1.0.72",   # LIVE im CIQ-Store 2026-08-05 (GPS-Qualitaets-Gate)
        "min_supported": "",
        "store_url": "https://apps.garmin.com/apps/9a2a753e-b52f-4587-aee4-900caf5cb351",
    },
    "wear": {
        # EIGENE Zaehlung: Wear = 1.2.x, Phone = 1.1.x (gleiches x, s. android/wear/build.gradle.kts).
        # Vorher fehlte dieser Schluessel -> die Wear-Uhr bekam nie einen Hinweis.
        # LIVE im Play Store 2026-08-04 (Track-Zusammenfassung Wear OS: "Aktiv, neuester Release
        # 1028 (1.2.18), 177 Laender"). Eigene Zaehlung: Wear = 1.2.x, Phone = 1.1.x (gleiches x).
        "latest": "1.2.18",
        "min_supported": "",
        "store_url": "https://play.google.com/store/apps/details?id=org.pumpfoil.app",
    },
    "apple": {
        # Die Watch-App steckt IM iOS-Bundle und traegt dieselbe MARKETING_VERSION (project.yml).
        "latest": "1.1.21",   # FREIGEGEBEN 2026-08-05 mit der iOS-App (gleiches Bundle)
        "min_supported": "",
        "store_url": "https://apps.apple.com/app/pumpfoil/id6783975714",
    },
    "zepp": {
        # FREIGEGEBEN 2026-07-31: "Pumpfoil (1.0.3) has been approved and added to the ZEPP app
        # store". ACHTUNG, die Nummer ist 1.0.3 und nicht 1.0.4: eingereicht war der Stand VOR dem
        # Release-Bump vom 28.07., der app.json im Repo auf 1.0.4/code 7 gezogen hat. Die Uhren aus
        # dem Store melden also 1.0.3 (APP_VERSION im damaligen Build) -> genau das gehoert hier hin,
        # sonst zeigt jede installierte Uhr sofort einen Update-Hinweis ins Leere. 1.0.4 erst
        # eintragen, wenn Jan es gebaut, eingereicht und die Freigabe bekommen hat.
        "latest": "1.0.3",
        "min_supported": "",
        # Zepp-Store-Adresse ist mir nicht bekannt (die App ist im Zepp-Telefon-Store, nicht im Web).
        # Leer lassen statt raten — der Hinweis auf der Uhr braucht keinen Link.
        "store_url": "",
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
