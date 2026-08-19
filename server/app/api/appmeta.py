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
        "latest": "1.1.24",   # LIVE im App Store 2026-08-18, gegengeprueft ueber
        # itunes.apple.com/lookup (de/us/nl/no/fi -> 1.1.24, currentVersionReleaseDate
        # 2026-08-18T23:51:11Z). DASSELBE Bundle wie die Watch-App ("apple" unten) — eine
        # Einreichung, eine MARKETING_VERSION (project.yml), also immer BEIDE Schluessel zusammen
        # setzen. Vorher 1.1.22, live seit 13.08.
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
        "latest": "1.1.20",   # LIVE im Play Store 2026-08-09 (Play-Mail "is live in the store",
        # org.pumpfoil.app, Release erstellt 05.08. 15:06 GMT). Eingereicht war 1.1.20/34, siehe
        # docs/TODO.md — NICHT die 1.1.21/35, die danach gebaut wurde und noch nicht eingereicht ist.
        "min_supported": "",
        "store_url": "https://play.google.com/store/apps/details?id=org.pumpfoil.app",
    },
    # --- Uhr-Apps (fragen ueber /api/devices/config an, s. oben) ---
    "garmin": {
        # NUR auf eine im Connect-IQ-Store FREIGEGEBENE Version setzen (Pruefung durch)!
        # Die Garmin-App vergleicht das selbst mit Config.VERSION (SessionRecorder.mc:638).
        "latest": "1.0.78",   # LIVE im CIQ-Store; Store-Seite bestaetigt "Latest Release
        # August 17, 2026, Version 1.0.78, Size 63 KB" (Jan). Garmin gibt automatisch frei — die
        # Freigabe kam am Tag des Uploads. Inhalt: neue ENG-BUILD-STUFE fuer die 16 Uhren der
        # 128-KB-Klasse (fenix 5/5S/6/6S/Chronos, FR55/245/645/935, Venu Sq, vivoactive 3, Enduro,
        # Instinct 3 Solar / Instinct E). Sie fuhren den vollen Build und waren mit ihm aus dem
        # Speicher gewachsen (FR55 gemessen: 58 508 B in 1.0.60 -> 105 052 B in 1.0.77, freier Heap
        # 72 564 -> 26 020 B) und zeichneten still gar nichts mehr auf — 4 von 7 aktiv gepairten
        # Uhren dieser Klasse hatten NIE eine Session. ENG nimmt Layout-Renderer + 13-Sprachen-
        # Tabelle weg (Texte dort Englisch), die Menues bleiben; jetzt ~66 kB frei. Belegt an
        # Geraet #136 und per Feldtest auf Jans fenix 5 + FR55. Details docs/TODO.md.
        # DIE 63 KB IN DER STORE-ZEILE SIND KEIN FEHLER: der Store nennt die Groesse eines
        # kleinen Geraete-Builds, und genau die ist durch ENG von ~106 auf ~63 KB gefallen.
        # Vorher 1.0.77 (Lauf-Canary + GNSS-Stufe je Uhr), live seit 16.08.
        "min_supported": "",
        "store_url": "https://apps.garmin.com/apps/9a2a753e-b52f-4587-aee4-900caf5cb351",
    },
    "wear": {
        # EIGENE Zaehlung: Wear = 1.2.x, Phone = 1.1.x (gleiches x, s. android/wear/build.gradle.kts).
        # Vorher fehlte dieser Schluessel -> die Wear-Uhr bekam nie einen Hinweis.
        # LIVE im Play Store 2026-08-09 (Play-Mail "is live in the store"; Release erstellt
        # 05.08. 15:06 GMT). Eingereicht war 1.2.20/1030 zusammen mit Phone 1.1.20/34.
        # Der gebaute Nachzug 1.2.21/1031 (Token-Heilung bei Config-401) ist NOCH NICHT
        # eingereicht — hier also nicht eintragen. Vorher: 1.2.18/1028, live seit 04.08.
        "latest": "1.2.20",
        "min_supported": "",
        "store_url": "https://play.google.com/store/apps/details?id=org.pumpfoil.app",
    },
    "apple": {
        # Die Watch-App steckt IM iOS-Bundle und traegt dieselbe MARKETING_VERSION (project.yml).
        "latest": "1.1.24",   # LIVE im App Store 2026-08-18 (Freigabe-Mail "ready for
        # distribution", Submission 257c320a-2ca1-436a-ad35-0a1ce20eda9c). NICHT auf die Mail
        # allein verlassen — "ready for distribution" heisst freigegeben, nicht zwingend schon
        # ausgeliefert: gegengeprueft ueber itunes.apple.com/lookup?id=6783975714 in de/us/nl/no/fi,
        # alle liefern 1.1.24 (currentVersionReleaseDate 2026-08-18T23:51:11Z).
        # Inhalt: Lauf-Tabelle waagerecht scrollbar mit allen 13 Spalten, Vergleich je LAUF mit 15
        # Kennzahlen, Vollbild-Karte im Session-Detail, Schalter fuer Chat-Benachrichtigungen
        # (der zuvor beim Speichern still die Web-Einstellung geloescht hat), Trainingskurve.
        # Vorher 1.1.22, live seit 13.08.
        "min_supported": "",
        "store_url": "https://apps.apple.com/app/pumpfoil/id6783975714",
    },
    "zepp": {
        # FREIGEGEBEN 2026-08-06: "The application Pumpfoil (1.0.4) you submitted has been
        # approved and added to the ZEPP app store" — diesmal nennt die Mail wirklich 1.0.4
        # (bei 1.0.3 am 31.07. war es die Version VOR dem Release-Bump, deshalb hier immer die
        # Nummer AUS DER MAIL nehmen, nicht die aus dem Repo).
        # store_url bleibt LEER, und das aendert sich nicht mehr: fuer die Pumpfoil-App im
        # Zepp-Store existiert keine Web-Adresse (Jan, 07.08.) — man kommt nur ueber die
        # Zepp-Handy-App dran, die auf /uhr verlinkt ist (ZeppAppBadges -> App Store / Play).
        "latest": "1.0.4",
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
