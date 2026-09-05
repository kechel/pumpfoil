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
        "latest": "1.1.30",   # LIVE im App Store 2026-09-05, GEGENGEPRUEFT an der STORE-SEITE
        # (Produktseite apps.apple.com/de zeigt "Version 1.1.30", erschienen vor gut drei Stunden).
        # Freigabe-Mail "ready for distribution" am 05.09., eingereicht 04.09. 08:51.
        # Inhalt: gemerkte Kartenansicht, misslungene Startversuche auf der Karte, Rueckfall bei
        # nicht verfuegbarem Farbmodus, Karte auch ohne erkannte Laeufe, "Auswahl leeren" im
        # Vergleich, haengengebliebene Uploads mit `ueberholt`, Hinweis bei eingefrorener Ortung,
        # fehlender Puls weiss, Handy-Recorder 2 s statt 3 s, Foil-Rechner mit Trefferliste erst
        # bei Suche.
        # Vorher 1.1.29, live seit 03.09., GEGENGEPRUEFT an der STORE-SEITE
        # (Produktseite zeigt "Version 1.1.29"). Freigabe-Mail "ready for distribution" am 03.09.,
        # eingereicht 02.09. 17:55 — keine 24 Stunden Pruefung.
        # Inhalt: der Community-Feed spielt wieder (YouTube lehnte den Player mit Error 153 ab,
        # weil als Elternseite `youtube-nocookie.com` selbst eingetragen war), die Vorschaubilder
        # treffen wieder die richtige Kachel, und Wischen wechselt das Video.
        # Vorher 1.1.28, live seit 02.09.:
        # (apps.apple.com/de/app/…/id6783975714 zeigt "Version 1.1.28"). Freigabe-Mail
        # "eligible for distribution" am 02.09. gegen 16 Uhr Berlin, eingereicht 01.09. 22:24.
        # Inhalt siehe docs/TODO.md (12 Aenderungen seit 1.1.27).
        # NICHT drin: der Error-153-Fix am Feed-Player vom 02.09. — der faehrt in 1.1.29 mit.
        # Vorher 1.1.27, live seit 31.08.
        #
        # ⚠️ WICHTIG FUER DAS NAECHSTE MAL — `itunes.apple.com/lookup` taugt fuer eine FRISCHE
        # Freigabe NICHT: die API ist stark gecacht. Nach der Mail lieferte sie 50 Minuten lang
        # weiter 1.1.26 (de/us/nl/no/fi, einmal kippte us kurz auf 1.1.27 und zurueck), einzig die
        # cz-Storefront zeigte 1.1.27 mit currentVersionReleaseDate 16:44:36Z — also VOR der Mail.
        # Die Store-SEITE (apps.apple.com) hatte da langst 1.1.27. Also: Produktseite pruefen, die
        # lookup-API nur zur Bestaetigung an Tagen danach.
        # Inhalt: Kennzahlen und Rekorde je Foil auf der Startseite (Zeitfenster startet auf
        # 10 Tagen), Satellitenansicht auf allen fuenf Karten, Community-Video-Feed samt Vollbild
        # und Melden, Dateianhaenge im Feedback, ALLE 17 Sprachen vollstaendig (vorher fielen je
        # Sprache 45 bis 183 Texte auf Englisch zurueck), Karten-Absatz in der
        # Datenschutzerklaerung. Dazu vier Fehler aus Jans Simulator-Runde: Spot-Karte zoomt
        # wieder und ein Tipp ins Leere oeffnet keinen Spot, das Feed-Vollbild bleibt beim ersten
        # Antippen stehen, Vorschaubilder verschwinden nicht mehr beim Tab-Wechsel.
        # Vorher 1.1.26, live seit 30.08.
        # Inhalt: der Startabsturz ist weg (ungueltige Karten-Region, s. docs/TODO.md), Tabs
        # entstehen erst beim Oeffnen, Spot-Karte buendelt Pins, Polnisch, Uhr-Anleitung,
        # Geschwindigkeits-Zonen, laengster Lauf je Foil.
        # DASSELBE Bundle wie die Watch-App ("apple" unten) — eine Einreichung, eine
        # MARKETING_VERSION (project.yml), also immer BEIDE Schluessel zusammen setzen.
        # Vorher 1.1.24, live seit 18.08.
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
        "latest": "1.1.24",   # LIVE im Play Store 2026-09-02 (Play-Mail: „Your update to Pumpfoil,
        # created on Aug 26, 2026 at 7:26 PM GMT, is live in the store"). Der Zeitstempel passt auf
        # die Minute auf unsere Einreichung vom 26.08. 21:26 Berlin = Phone 1.1.24 (38) + Wear
        # 1.2.24 (1034), beide Tracks auf vollstaendigen Roll-out.
        # PRUEFUNG: die Play-Seite nennt die Version nicht mehr oeffentlich, dort ist also nichts
        # gegenzupruefen. Der harte Beleg kommt aus UNSEREN Daten: `device_tokens` zeigt am 02.09.
        # bereits Wear-Uhren mit `app_version = 1.2.24` — die Auslieferung laeuft also wirklich,
        # nicht nur die Freigabe. (Am 29.07. stand hier verfrueht eine Version, die Play noch gar
        # nicht auslieferte, und ein Nutzer bekam einen Hinweis ins Leere.)
        # Inhalt: Wert-Grafiken in der Layout-Vorschau + Puls-Zonen im Profil, GPX-/FIT-Download,
        # Spot-Beschreibungen, Spot-Label mit Gewaesser, AR-Badges, Katalog-Suche, Trainingskurve.
        # Vorher 1.1.23, live seit 25.08.
        "min_supported": "",
        "store_url": "https://play.google.com/store/apps/details?id=org.pumpfoil.app",
    },
    # --- Uhr-Apps (fragen ueber /api/devices/config an, s. oben) ---
    "garmin": {
        # NUR auf eine im Connect-IQ-Store FREIGEGEBENE Version setzen (Pruefung durch)!
        # Die Garmin-App vergleicht das selbst mit Config.VERSION (SessionRecorder.mc:638).
        "latest": "1.0.85",   # LIVE im CIQ-Store 2026-09-02, SELBST GEPRUEFT (nicht nur gemeldet):
        # die Store-Seite (`curl https://apps.garmin.com/apps/9a2a753e-…`) nennt 1.0.85.
        # Store-Seite: "Latest Release September 1, 2026 · Version 1.0.85 · Size 71 KB" (Jan).
        # Inhalt: die Profil-Einstellung "halten oder druecken" (settings_json.stop_mode). Im
        # press-Modus loest schon ein kurzer Druck auf START aus — das Halten funktioniert
        # unveraendert weiter, es kommt also ein Weg dazu. Anlass war ein Nutzer, auf dessen Uhr
        # der lange Druck mit "Mann ueber Bord" belegt ist; unser Menue war damit unerreichbar.
        # ZWISCHENVERSION 1.0.84 (live seit 01.09.) steht hier bewusst NIE: reine
        # Geraete-Erweiterung (fenix 9 + fenix 8 43 mm), fuer vorhandene Uhren ohne Nutzen —
        # Jan wollte dafuer keinen Update-Hinweis. Sie wurde uebersprungen, nicht vergessen.
        # Vorher 1.0.83 (falscher "Speicher voll"-Countdown), live seit 31.08.
        "store_url": "https://apps.garmin.com/apps/9a2a753e-b52f-4587-aee4-900caf5cb351",
    },
    "wear": {
        # EIGENE Zaehlung: Wear = 1.2.x, Phone = 1.1.x (gleiches x, s. android/wear/build.gradle.kts).
        # Vorher fehlte dieser Schluessel -> die Wear-Uhr bekam nie einen Hinweis.
        # LIVE im Play Store 2026-08-09 (Play-Mail "is live in the store"; Release erstellt
        # 05.08. 15:06 GMT). Eingereicht war 1.2.20/1030 zusammen mit Phone 1.1.20/34.
        # Der gebaute Nachzug 1.2.21/1031 (Token-Heilung bei Config-401) ist NOCH NICHT
        # eingereicht — hier also nicht eintragen. Vorher: 1.2.18/1028, live seit 04.08.
        "latest": "1.2.24",   # LIVE 2026-09-02, dieselbe Play-Mail wie android (s. oben) — und
        # hier sogar direkt belegt: zwei Uhren im Feld melden am 02.09. schon `app_version 1.2.24`.
        # Zusaetzlich zur Phone-Liste bringt die Uhr: Always-on-Ansicht, BACK wird waehrend der
        # Aufnahme verschluckt, `expected_chunks`, Live-Distanz ohne Zuwachs im Stand, gesaeuberter
        # Max-Speed, Lauf-Zusammenfuehrung. Vorher 1.2.23, live seit 25.08.
        "min_supported": "",
        "store_url": "https://play.google.com/store/apps/details?id=org.pumpfoil.app",
    },
    "apple": {
        # Die Watch-App steckt IM iOS-Bundle und traegt dieselbe MARKETING_VERSION (project.yml).
        "latest": "1.1.30",   # LIVE im App Store 2026-09-05 — dieselbe Einreichung wie "ios",
        # gegengeprueft an der Produktseite ("Version 1.1.30", Apple Watch in der Kompatibilitaet).
        # Fuer die WATCH-App bringt 1.1.30: kein veralteter Puls mehr in den Messpunkten (die Uhr
        # schrieb bisher den letzten bekannten Wert in JEDEN GPS-Punkt, was Laeufe faelschlich als
        # "nicht aus eigener Kraft" aussortieren liess).
        # Vorher 1.1.29, live seit 03.09. — dieselbe Einreichung wie "ios",
        # die Watch-App steckt ja im selben Bundle. NICHT auf die Freigabe-Mail allein verlassen
        # ("ready for distribution" heisst freigegeben, nicht zwingend schon ausgeliefert):
        # gegengeprueft an der STORE-SEITE (apps.apple.com/de + /us zeigen "Version 1.1.27").
        # Die lookup-API hing hier 50 Minuten nach — s. die ausfuehrliche Notiz bei "ios".
        # Fuer die WATCH-App bringt 1.1.27: nl/fi/cs neu, alle 17 Sprachen vollstaendig.
        # (Bis 31.08. stand hier noch der Pruefbericht zu 1.1.25 — der Kommentar widersprach
        # damit dem eigenen Wert. Beim Bump IMMER beide Zeilen mitziehen.)
        # Inhalt: Lauf-Tabelle waagerecht scrollbar mit allen 13 Spalten, Vergleich je LAUF mit 15
        # Kennzahlen, Vollbild-Karte im Session-Detail, Schalter fuer Chat-Benachrichtigungen
        # (der zuvor beim Speichern still die Web-Einstellung geloescht hat), Trainingskurve.
        # Vorher 1.1.22, live seit 13.08.
        "min_supported": "",
        "store_url": "https://apps.apple.com/app/pumpfoil/id6783975714",
    },
    "zepp": {
        # FREIGEGEBEN 2026-08-24 (Mail: "The application Pumpfoil (1.0.6) you submitted has been
        # approved and added to the ZEPP app store"). Die Nummer kommt AUS DER MAIL, nicht aus dem
        # Repo — bei 1.0.3 am 31.07. nannte die Mail die Version VOR dem Release-Bump. 1.0.5 gab es
        # nie im Store: abgelehnt am 18.08. (Nickname „zepp" + eckige Vorschaubilder), 1.0.6 ist
        # der Nachfolger. Vorher 1.0.4, live seit 06.08.
        # store_url bleibt LEER, und das aendert sich nicht mehr: fuer die Pumpfoil-App im
        # Zepp-Store existiert keine Web-Adresse (Jan, 07.08.) — man kommt nur ueber die
        # Zepp-Handy-App dran, die auf /uhr verlinkt ist (ZeppAppBadges -> App Store / Play).
        "latest": "1.0.6",
        "min_supported": "",
        # Zepp-Store-Adresse ist mir nicht bekannt (die App ist im Zepp-Telefon-Store, nicht im Web).
        # Leer lassen statt raten — der Hinweis auf der Uhr braucht keinen Link.
        "store_url": "",
    },
}


# --------------------------------------------------------------------------------------
# Release-Stand fuer die oeffentliche Changelog-Seite
#
# Auf /changelog steht ganz oben eine kleine Tabelle: was ist LIVE, was liegt gerade im
# Review, was kommt mit dem naechsten Release. Die Live-Spalte kommt automatisch aus
# `_APP_META` oben — das ist dieselbe Zahl, die auch der Update-Hinweis in den Apps nutzt,
# damit die Seite gar nicht erst auseinanderlaufen KANN.
#
# Die beiden anderen Spalten stehen hier und muessen von Hand gepflegt werden. Jan,
# 05.09.2026: „ab jetzt fortlaufend aktualisieren, wenn wir neue Releases in Pruefung
# geben, das Changelog erweitern oder eingereichte Releases freigegeben werden."
#
# DREI ANLAESSE, DIESE LISTEN ANZUFASSEN:
#   1. Etwas EINGEREICHT  -> Eintrag von NAECHSTES nach IN_REVIEW verschieben.
#   2. Etwas FREIGEGEBEN  -> `_APP_META[...]["latest"] setzen (erst wenn der Store es
#                            wirklich ausliefert!) UND den IN_REVIEW-Eintrag entfernen.
#   3. Etwas GEBAUT, das auf eine laufende Pruefung wartet -> nach NAECHSTES.
# Bleibt eine Liste leer, blendet die Seite den ganzen Abschnitt aus.
#
# `note` ist eine kurze englische Zeile fuer Nutzer — keine internen Begriffe, keine
# Versionsnummern von Build-Codes, kein Jargon (dieselbe Regel wie fuer die Changelog-Texte).
ANZEIGENAME = {
    "ios": "iPhone", "apple": "Apple Watch", "android": "Android phone",
    "wear": "Wear OS", "garmin": "Garmin", "zepp": "Amazfit",
}
# Reihenfolge in der Tabelle — nach Verbreitung, nicht alphabetisch.
REIHENFOLGE = ["ios", "apple", "android", "wear", "garmin", "zepp"]

IN_REVIEW: list[dict] = [
    {"platform": "android", "version": "1.1.25",
     "note": "submitted 2 September, waiting for Google"},
    {"platform": "wear", "version": "1.2.25",
     "note": "submitted 2 September, waiting for Google"},
    {"platform": "zepp", "version": "1.0.7",
     "note": "submitted 1 September, under review"},
]

NAECHSTES: list[dict] = [
    {"platform": "wear", "version": "1.2.26",
     "note": "heart rate that keeps measuring, always-on, a touch lock for the water"},
    {"platform": "android", "version": "1.1.26",
     "note": "warns when the watch has no GPS fix, hold two seconds to stop"},
    {"platform": "zepp", "version": "1.0.8", "note": "follows straight after the current one"},
]


@router.get("/releases")
def releases() -> dict:
    """Was ist live, was liegt im Review, was kommt als Naechstes (fuer /changelog)."""
    live = [{"platform": p, "name": ANZEIGENAME[p], "version": _APP_META[p]["latest"],
             "store_url": _APP_META[p].get("store_url", "")}
            for p in REIHENFOLGE
            if p in _APP_META and (_APP_META[p].get("latest") or "").strip()]
    def anreichern(eintraege):
        return [{**e, "name": ANZEIGENAME.get(e["platform"], e["platform"])} for e in eintraege]
    return {"live": live, "review": anreichern(IN_REVIEW), "next": anreichern(NAECHSTES)}


@router.get("/latest")
def latest(platform: str = "") -> dict:
    """Neueste Store-Version je Plattform (ios|android). Werte werden manuell gepflegt.
    Die App vergleicht `latest` mit ihrer eigenen Bundle-Version und blendet ggf. einen
    nicht-blockierenden Hinweis ein (Hard-Gate optional ueber `min_supported`)."""
    m = _APP_META.get(platform.lower().strip())
    if not m:
        return {"latest": "", "min_supported": "", "store_url": ""}
    return dict(m)
