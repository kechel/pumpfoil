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
import os

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from sqlalchemy import update
from sqlalchemy.dialects.postgresql import insert as pg_insert
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
        "latest": "1.1.33",   # FREIGEGEBEN 2026-09-12, ZWEITE Apple-Mail („ready for
        # distribution", ueber Nacht; die erste „eligible for distribution" kam kurz davor).
        # GEGENGEPRUEFT an der Store-API in de/us/ch: alle drei melden 1.1.32 mit
        # currentVersionReleaseDate 2026-09-12T00:06:41Z — diesmal ohne Cache-Nachhang.
        # Eingereicht 11.09. 13:16, also gut 11 Stunden Pruefung.
        # Inhalt: Einrichtungs-Assistent, Puls-Alarm mit Wiederholabstand, richtige Lauf-Uhrzeiten,
        # Wetterkarte mit Pegel/Wassertemperatur/Boeen, Datei-Import (FIT/TCX/GPX), Portugiesisch
        # (Portugal), uebersetzte Status-Anzeigen + selbst nachladende Liste.
        # Vorher 1.1.31, live seit 2026-09-08 abends, ZWEITE Apple-Mail
        # („The following app is ready for distribution: App Version Number: 1.1.31“). Hinweis von
        # Jan an diesem Abend: von Apple kommen NORMALERWEISE ZWEI Mails — erst „Review of your
        # submission has been completed. It is now eligible for distribution“ (nur das Ende der
        # Pruefung), danach diese hier. Nach der ERSTEN Mail stand die Produktseite noch auf 1.1.30,
        # `itunes/lookup` in de/us/cz/nl/no ebenfalls — deshalb wurde `latest` erst mit der zweiten
        # gesetzt. Die Store-Propagation laeuft danach noch (bekannte Verzoegerung, s. Notiz unten).
        # Eingereicht 07.09. 15:12 aus Commit `189564c6`, Uebermittlung `bbd630be-…`, gut 28 h Pruefung.
        # Inhalt: Absturz beim Start in pt/ja/zh/ru/id behoben, COROS ueberhaupt verbindbar,
        # Sportart-Auswahl je Konto, Hinweis bei Aufnahme ohne Position, Spot-Seite mit Rekorden/
        # Wetter/Pegel/Beschreibungen, Foil-Detailseite, Fortschritt beim Konto-Import,
        # Apple-Watch-Modellmeldung, Uhren-Vergleich, Xiaomi-Weg, COROS-Modus-Empfehlung.
        # Vorher 1.1.30, live seit 05.09., GEGENGEPRUEFT an der STORE-SEITE
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
        "latest": "1.1.29",   # LIVE 2026-09-16: Play-Mail „Your update to Pumpfoil, created on
        # Sep 13, 2026 at 6:55 AM GMT, is live in the store." Passt auf unsere Einreichung vom
        # 13.09. 08:56 Berlin (Phone 1.1.29/43 + Wear 1.2.29/1039). DREI Tage Pruefung.
        # Im Feld belegt, nicht nur die Mail: zwei Geraete-Tokens melden `app_version 1.2.29`,
        # zuletzt am 16.09. um 05:56 — also echte Nutzer, der Roll-out laeuft wirklich.
        # Vorher 1.1.28, LIVE 2026-09-13: Play-Mail „Your update to Pumpfoil, created on
        # Sep 10, 2026 at 8:09 AM GMT, is live in the store." Der Zeitstempel passt auf unsere
        # Einreichung vom 10.09. 10:09 Berlin (Phone 1.1.28/42 + Wear 1.2.28/1038). Wie immer
        # deckt EINE Mail beide Tracks ab (gleiche applicationId).
        # BELEG AUS UNSEREN DATEN, nicht nur die Mail: drei Geraete-Tokens melden `app_version
        # 1.2.28`, das letzte am 13.09. um 07:13 — also echte Nutzer, nicht der Pruefer (der lief
        # am 10.09. mit 1.2.27, dem abgelehnten Stand, genau ein Token).
        # Vorher 1.1.25, LIVE 2026-09-07: Play-Mail „is live in the store", Release
        # erstellt 02.09. 15:53 GMT (= 17:53 Berlin, genau diese Einreichung). Wie am
        # 09.08. und 25.08. deckt EINE Mail beide Tracks ab (gleiche applicationId).
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
        "latest": "1.0.87",   # LIVE im CIQ-Store 2026-09-17, ZWEIFACH belegt (nicht nur Jans
        # Meldung): die Store-API liefert `latestExternalVersion = 1.0.87`,
        # `latestInternalVersion = 41`; und im Feld steht Session #8700 von Jans fenix 7X Pro mit
        # `app_version 1.0.87`, hochgeladen am 17.09. um 18:11 — also von einer Uhr, die das
        # Update wirklich aus dem Store gezogen hat.
        # INHALT, ein einziger Punkt: auf Uhren mit wenig Speicher (Instinct 2 / 2S / 2X,
        # fenix 5, Forerunner 55 und 935) beendete sich die App mitten in der Aufzeichnung, und
        # alles danach war verloren. Ursache war eine ~5-KB-Einzelanforderung beim Schreiben
        # eines GPS-Blocks, die in einem zerstueckelten Heap nicht mehr unterkam — NICHT zu wenig
        # Speicher: 1.0.80 stuerzte mit 14,3 kB frei ab. Fix: `_gpsChunkTarget()`, 30 statt 120
        # Samples auf diesen Uhren. Gefunden, weil Jan nach Auffaelligkeiten in den Zahlen
        # gefragt hat — keiner der sechs Betroffenen hatte sich je gemeldet.
        # VORHER 1.0.86, live seit 2026-09-11, SELBST GEPRUEFT (nicht nur gemeldet):
        # `curl https://apps.garmin.com/api/appsLibraryExternalServices/api/asw/apps/9a2a753e-…`
        # liefert `latestExternalVersion = 1.0.86`, `latestInternalVersion = 40`. Jans Store-Seite
        # nennt "Latest Release September 10, 2026 · Version 1.0.86 · Size 72 KB" — das Datum ist
        # UTC (eingereicht 11.09. 00:50 CEST = 10.09. 22:50 UTC), kein Widerspruch.
        # Inhalt: Teil-Upload in der Pause (Laeufe schon auf dem Handy sichtbar), richtige
        # Lauf-Uhrzeiten (Zuschnitt + Pausen), Puls-Alarm mit einstellbarem Wiederholabstand,
        # Standard-Foil auch bei festen Alarm-Schwellen vorgewaehlt.
        # `watch/bin` neu gebaut NACH der Freigabe: 129 von 129 Geraeten ok, catalog.json 129
        # Eintraege, partmap.json 218 Part-Numbers.
        # VORHER 1.0.85, live seit 02.09.: Profil-Einstellung "halten oder druecken".
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
        "latest": "1.2.29",   # LIVE 2026-09-16, dieselbe Play-Mail wie android (Release erstellt
        # 13.09. 06:55 GMT). Im Feld belegt: zwei Tokens mit `app_version 1.2.29`, zuletzt am
        # 16.09. um 05:56. Inhalt u. a. der Puls-Alarm und — fuer Vladimir (u187) gemeldet — das
        # deutsche „laeuft" in der Sessionliste, das nun endlich uebersetzt drausssen ist.
        # Vorher 1.2.28, LIVE 2026-09-13, dieselbe Play-Mail wie android (Release erstellt
        # 10.09. 08:09 GMT). Im Feld belegt: drei Tokens mit `app_version 1.2.28`, zuletzt am
        # 13.09. 07:13. 1.2.27 war der ABGELEHNTE Stand und existiert im Feld nur einmal — das
        # war der Play-Pruefer am 10.09.
        # Vorher 1.2.25, LIVE 2026-09-07, dieselbe Play-Mail wie android. Zusaetzlich
        # im Feld belegt, nicht nur geglaubt: user 396 wechselte am 05.09. von 1.2.24 auf
        # `app_version 1.2.25` — Pixel Watch 2, fremdes Geraet, nicht Jans Emulator. Also war
        # der Wear-Track schon VOR der Mail draussen (er hat eine eigene Pruefung, s. TODO).
        # ACHTUNG bei solchen Belegen: fuer PHONE geht das nicht, weil iOS und Android-Handy
        # BEIDE `1.1.x` zaehlen — `sessions.app_version` unterscheidet sie nicht. 1.2.x ist
        # dagegen eindeutig Wear. Die Play-Store-Seite nennt die Version nicht mehr, ein
        # itunes-artiges Nachschlagen gibt es fuer Play nicht.
        # hier sogar direkt belegt: zwei Uhren im Feld melden am 02.09. schon `app_version 1.2.24`.
        # Zusaetzlich zur Phone-Liste bringt die Uhr: Always-on-Ansicht, BACK wird waehrend der
        # Aufnahme verschluckt, `expected_chunks`, Live-Distanz ohne Zuwachs im Stand, gesaeuberter
        # Max-Speed, Lauf-Zusammenfuehrung. Vorher 1.2.23, live seit 25.08.
        "min_supported": "",
        "store_url": "https://play.google.com/store/apps/details?id=org.pumpfoil.app",
    },
    "apple": {
        # Die Watch-App steckt IM iOS-Bundle und traegt dieselbe MARKETING_VERSION (project.yml).
        "latest": "1.1.33",   # FREIGEGEBEN 2026-09-12 — dieselbe Einreichung wie "ios" (ein Bundle,
        # eine MARKETING_VERSION), zweite Apple-Mail, an der Store-API gegengeprueft.
        # Fuer die WATCH-App bringt 1.1.32 den PULS-ALARM: die Uhr vibriert oberhalb eines selbst
        # gesetzten Pulses, mit eigenem Muster und einstellbarem Wiederholabstand.
        # Vorher 1.1.31, freigegeben 2026-09-08 — dieselbe Einreichung wie "ios" (ein Bundle,
        # eine MARKETING_VERSION), zweite Apple-Mail. Fuer die WATCH-App bringt 1.1.31 die
        # Modellmeldung: bis dahin sah jede Apple Watch fuer uns gleich aus, jetzt steht in
        # `sessions.device_model`, welches Modell aufgenommen hat (Simulator-Aufnahmen melden sich
        # als „Simulator“). Vorher 1.1.30, live seit 05.09. — dieselbe Einreichung wie "ios",
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
        "latest": "1.0.8",   # FREIGEGEBEN 2026-09-12 (Zepp-Mail: „The application Pumpfoil (1.0.8)
        # you submitted has been approved and added to the ZEPP app store"). Eingereicht 10.09.
        # 11:19, also zwei Tage Pruefung — nach ZWEI Ablehnungen von 1.0.7, beide Male nur wegen
        # der Store-Vorschaubilder. Die korrigierten eckigen Bilder gingen mit 1.0.8 mit.
        # Inhalt (zusammengefuehrt aus 1.0.7 + 1.0.8, von 1.0.7 ist nie etwas erschienen):
        # Wertegrafiken auf der Uhr, Puls- und Geschwindigkeitszonen in den Profilfarben,
        # Touch-Sperre wieder per Finger, einzeilige Upload-Meldung, Aufnahme per einfachem
        # Druck beenden, bereinigte Hoechstgeschwindigkeit, Lauferkennung wie auf dem Server,
        # Niederlaendisch/Finnisch/Tschechisch/Polnisch.
        # Vorher 1.0.6, live seit 24.08.
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
# VIER ANLAESSE, DIESE LISTEN ANZUFASSEN:
#   1. Etwas EINGEREICHT  -> Eintrag von NAECHSTES nach IN_REVIEW verschieben.
#   2. Etwas FREIGEGEBEN  -> `_APP_META[...]["latest"] setzen (erst wenn der Store es
#                            wirklich ausliefert!) UND den IN_REVIEW-Eintrag entfernen.
#   3. Etwas ABGELEHNT    -> Eintrag von IN_REVIEW nach ABGELEHNT verschieben, mit der
#                            abgelehnten Nummer. Die PUNKTE wandern mit der Fassung weiter, die
#                            den Inhalt dann traegt (also nach NAECHSTES) — sonst stehen sie
#                            zweimal in der Tabelle. Die Zeile RAEUMT SICH SELBST WEG, sobald ein
#                            Nachfolger live ist (s. `_noch_offen`) — also nicht von Hand loeschen.
#   4. Etwas GEBAUT, das auf eine laufende Pruefung wartet -> nach NAECHSTES.
# Bleibt eine Liste leer, blendet die Seite den ganzen Abschnitt aus.
#
# Warum es ABGELEHNT ueberhaupt gibt (Jan, 10.09.2026): „da kann als status bei der 1.0.7 einfach
# 'rejected' stehen bleiben, und die 1.0.8 dann als in review dazukommen sobald ich die eingereicht
# habe". Ohne diesen Zustand musste eine Ablehnung entweder verschwiegen werden (dann steht auf der
# Seite weiter „under review", was nicht stimmt) oder die Zeile verschwand ganz — und damit die
# Erklaerung, warum die Nutzer die angekuendigten Punkte immer noch nicht haben.
# EINGEREICHT heisst HOCHGELADEN. Nicht „gebaut", nicht „gebumpt", nicht „liegt bei Jan bereit":
# am 10.09. stand hier fuer Wear schon „resubmitted 10 September", waehrend Jan den Fix noch nicht
# einmal gepullt hatte. Bis zu seiner Meldung gehoert so etwas nach NAECHSTES.
#
# DIE STATUSZEILE WIRD ERZEUGT, NICHT GESCHRIEBEN (seit 13.09.2026, s. `_note`). Ein Eintrag
# traegt nur noch die Angaben, die sich nicht ableiten lassen:
#     IN_REVIEW  -> "eingereicht": "2026-09-13"        -> „submitted 13 September, waiting for X"
#     NAECHSTES  -> nichts                             -> „built, waiting to be uploaded"
#                   oder "wartet_auf": "1.1.33"        -> „built, waiting for 1.1.33 to clear …"
#     ABGELEHNT  -> "abgelehnt" + "grund"              -> „not approved on 10 September: …"
# Wer prueft, steht in `PRUEFER`. Ein `note`-Feld von Hand gibt es hier NICHT mehr — genau das
# hatte am 13.09. dazu gefuehrt, dass unter der Ueberschrift „Being reviewed" die Zeile „built,
# waiting to be uploaded" stand: der Eintrag war verschoben, der Satz nicht. Jetzt genuegt das
# Verschieben.
# Der erzeugte Satz bleibt, was er war: kurz, englisch, fuer Nutzer — keine internen Begriffe,
# keine Build-Codes, kein Jargon (dieselbe Regel wie fuer die Changelog-Texte).
# Handy und Uhr sind EINE Einreichung: Android Phone und Wear OS teilen sich die
# `applicationId` (Play schickt eine einzige Mail fuer beide Spuren), iPhone und Apple Watch
# stecken im selben Bundle mit einer `MARKETING_VERSION`.
#
# HARTE REGEL (Jan, 10.09.2026): Play und Wear gehen IMMER gleichzeitig und zusammen raus — auch
# wenn es an einer der beiden Seiten GAR KEINE Aenderung gab. „das hatte ich nur einmal getrennt
# eingereicht und das wurde abgewiesen … jedenfalls wollen wir das in zukunft immer zusammen machen,
# auch wenn es keine aenderungen an app oder wear gab." Die Nummern laufen im Gleichschritt: beide
# bumpen, beide bauen, beide in EINER Runde hochladen — selbst wenn eine Seite byteweise der
# freigegebenen Fassung entspricht (so am 10.09.: der Fix betraf Wear, Phone bekam 1.1.28/42 mit).
# Wer prueft. Das ist der EINZIGE Teil des Review-Satzes, der nicht aus dem Zustand folgt —
# alles andere (das Wort „submitted", das Datum, „waiting for") wird erzeugt, s. `_note`.
PRUEFER = {
    "iPhone + Apple Watch": "Apple",
    "Android phone + Wear OS": "Google",
    "Amazfit": "the Zepp store",
    "Garmin": "the Connect IQ store",
}


def _datum(iso: str) -> str:
    """„2026-09-13" -> „13 September". Mit Jahr, sobald es nicht das laufende ist — sonst stuende
    im Januar „submitted 13 September" ohne erkennbar zu sein, dass das vier Monate her ist."""
    from datetime import date
    d = date.fromisoformat(iso)
    heute = date.today()
    return f"{d.day} {d.strftime('%B')}" + (f" {d.year}" if d.year != heute.year else "")


def _note(e: dict, zustand: str) -> str:
    """Die Statuszeile fuer /changelog — ERZEUGT, nicht von Hand geschrieben.

    WARUM (Jan, 13.09.2026): „kann die spalte im abschnitt 'being reviewed' nicht komplett
    automatisch aus den metadaten erzeugt werden? dann muessen wir da nie was von hand machen."
    Anlass war ein Widerspruch auf der oeffentlichen Seite: unter der Ueberschrift „Being
    reviewed" stand woertlich „built, waiting to be uploaded". Beim Verschieben nach IN_REVIEW
    war der Eintrag umgehaengt, der Satz aber stehen geblieben.

    Jetzt folgt der Satz aus der LISTE, in der ein Eintrag steht. Ein solcher Widerspruch ist
    damit nicht mehr formulierbar — verschieben genuegt, und die Zeile stimmt.

    Von Hand bleiben nur die Angaben, die sich nicht ableiten lassen: das Datum (`eingereicht`
    bzw. `abgelehnt`), der Ablehnungsgrund (`grund`) und die Fassung, auf die gewartet wird
    (`wartet_auf`).
    """
    if zustand == "review":
        # Zwischen „durchgewunken" und „im Store" liegt bei Apple und Google noch ein Schritt:
        # die Fassung ist freigegeben, wird aber erst ausgeliefert. „waiting for Apple" waere ab
        # der Freigabe falsch, „live" waere zu frueh — `_APP_META` wird erst gesetzt, wenn der
        # Store es wirklich ausliefert (Regel vom 10.08.2026). Dafuer dieser dritte Zustand.
        if e.get("freigegeben"):
            return f"approved {_datum(e['freigegeben'])}, appearing in the store shortly"
        return f"submitted {_datum(e['eingereicht'])}, waiting for {PRUEFER[e['name']]}"
    if zustand == "next":
        wartet = e.get("wartet_auf")
        return (f"built, waiting for {wartet} to clear review first" if wartet
                else "built, waiting to be uploaded")
    if zustand == "rejected":
        satz = f"not approved on {_datum(e['abgelehnt'])}"
        return f"{satz}: {e['grund']}" if e.get("grund") else satz
    return ""


def _mit_note(liste: list[dict], zustand: str) -> list[dict]:
    """Eintraege fuer die Ausgabe, jeder mit erzeugter `note`. Das Original bleibt unberuehrt."""
    return [{**e, "note": _note(e, zustand)} for e in liste]


GRUPPEN = [
    (("ios", "apple"), "iPhone + Apple Watch"),
    (("android", "wear"), "Android phone + Wear OS"),
    (("garmin",), "Garmin"),
    (("zepp",), "Amazfit"),
]

# Anzeigename je EINZELNER Plattform — fuer die Marke an einem Changelog-Punkt. Anders als
# `GRUPPEN` (dort teilen sich Handy und Uhr eine Einreichung) muss hier jede fuer sich stehen:
# ein Punkt kann die Uhr betreffen und das Handy nicht. Jan, 11.09.2026: „im changelog ist nicht
# ersichtlich das sich die letzten changes auf garmin beziehen" — genau das behebt die Marke.
PLATTFORM_NAMEN = {
    "garmin": "Garmin",
    "zepp": "Amazfit",
    "wear": "Wear OS",
    "android": "Android",
    "ios": "iPhone + Apple Watch",
    # Apple Watch und iPhone stecken in EINEM Bundle mit einer MARKETING_VERSION, deshalb derselbe
    # Name. Ohne diesen Eintrag fiel `PLATTFORM_NAMEN.get(k, k)` auf den rohen Schluessel zurueck
    # und auf /changelog stand als Marke woertlich „apple" (so bei den beiden Punkten vom 08.09.).
    "apple": "iPhone + Apple Watch",
}

# `items` sind die Aenderungen der jeweiligen Fassung — schon so formuliert, wie sie spaeter
# im Changelog stehen sollen. Das ist der Zweck (Jan, 05.09.): was eingereicht ist, steht
# heute NIRGENDS, bis es veroeffentlicht wird. Bei der Freigabe wandern die Zeilen unveraendert
# nach `Changelog.tsx` — abschreiben, nicht neu erfinden.
# Abgelehnt: der Store hat die Fassung geprueft und NICHT freigegeben. Die Zeile bleibt stehen,
# bis der Nachfolger freigegeben ist — sie ist die Erklaerung dafuer, warum die angekuendigten
# Punkte noch nicht bei den Nutzern sind. KEINE `items` hier: der Inhalt haengt an der Fassung, die
# ihn dann wirklich ausliefert, und steht deshalb unter NAECHSTES (sonst zweimal in der Tabelle).
# `note` bleibt sachlich und ohne Schuldzuweisung — die Seite ist oeffentlich.
ABGELEHNT: list[dict] = [
    {"name": "Android phone + Wear OS", "version": "1.1.27 / 1.2.27",
     # Google, 10.09.2026, Wear App Quality Guidelines / „Wear font size": „Your app must conform
     # to the font size set by the user in System Settings. If the user selects a larger font size,
     # ensure that text and controls are not cut off by screen edges." Belegstelle in der Mail:
     # „Version code 1037: In-app experience"; auf dem Screenshot war von „Puls passiv" nur „Pu" zu
     # sehen. Die Mail nennt NUR Code 1037, ist aber app-weit formuliert („App Status: Rejected",
     # „Changes to your app weren't published") — ob die Handy-Spur mit blockiert wurde, sagt allein
     # die Play-Konsole. In unseren Daten ist 1.1.27 auf keinem Android-Handy je aufgetaucht
     # (`sessions.device_model`, hoechster Android-Stand 1.1.25, gesehen am 07.09.).
     # Geprueft wurde auf einer Pixel Watch 3 (`device_tokens` von user 6 „Google Tester",
     # 10.09. 06:44-07:01, Session #7136) — die runde Fassung passt genau zur Ursache.
     "abgelehnt": "2026-09-10",
     "grund": "text could be cut off at the screen edge with a large system font"},
    {"name": "Amazfit", "version": "1.0.7",
     # Zepp, 10.09.2026: „The square preview image does not comply with regulations. Please
     # carefully review the preview image specifications and make adjustments as required for the
     # format, size, aspect ratio, transparency and corresponding device shape." ZWEITE Ablehnung
     # derselben Fassung, beide Male nur die Store-Bilder — an der App hat Zepp nie etwas
     # beanstandet. Ursache gefunden und behoben (`e019fdd2`): die eckigen Vorschaubilder trugen
     # die runden UNTEREN Ecken des macOS-Simulatorfensters, 42 halbdurchsichtige Pixel je Datei.
     # Details in brand/stores/zepp/README.md. Der Link aus der Ablehnungsmail ist tot (404).
     "abgelehnt": "2026-09-10",
     "grund": "the store preview images were the problem, not the app itself; fixed and going "
              "back with the next version"},
]

# Solange diese Liste leer ist, blendet /changelog den Abschnitt „Being reviewed" aus.
# Stand 12.09.2026: Android Phone 1.1.28 (42) + Wear 1.2.28 (1038) eingereicht 10.09. 10:10,
# Amazfit 1.0.8 eingereicht 10.09. 11:19 — beide noch in Pruefung.
# iOS + APPLE WATCH 1.1.32 ist in der Nacht auf den 12.09. FREIGEGEBEN und steht deshalb hier
# nicht mehr, sondern in `_APP_META` als live (beide Schluessel, ein Bundle). Seine sieben Punkte
# sind unveraendert in die Changelog-Tabelle gewandert, mit `versionen = {"ios": "1.1.32"}`.
# GARMIN 1.0.86 ist am 11.09. FREIGEGEBEN und steht deshalb hier nicht mehr, sondern in
# `_APP_META` als live (Pruefung dauerte keine zwei Stunden). Seine fuenf Punkte sind in die
# Changelog-Tabelle (`changelog_items`) uebernommen, mit `versionen = {"garmin": "1.0.86"}` —
# genau der Weg, den der Kommentar unter `items` beschreibt.
IN_REVIEW: list[dict] = [
    {"name": "Android phone + Wear OS", "version": "1.1.30 / 1.2.30",
     "eingereicht": "2026-09-18",
     # EINGEREICHT 18.09.2026 aus Commit 5c2be2e7 (Play-Konsole: „Aenderungen, die ueberprueft
     # werden", Produktion 44 / Wear OS 1040, Vorabpruefungen liefen noch). AB HIER EINGEFROREN:
     # alles Weitere gehoert in einen neuen NAECHSTES-Eintrag (1.1.31 / 1.2.31).
     # Urspruenglich gebaut am 17.09.; bis zum Upload kamen Teilen-Dialog, Scroll-Anker,
     # Homespot-Fallback und die i18n-Nachtraege dazu. Beide Punkte kommen von u171 (Xiaomi Watch 2
     # Pro), am selben Abend gemeldet.
     #
     # 1. PULS: der Waechter, der die Health-Services-Uebung neu anfordert, lief NIE, wenn der
     #    Start schon beim ersten Mal scheiterte — seine Bedingung war `letzterHsMs > 0`, und
     #    dieser Wert entsteht erst bei einem Messwert oder einem GELUNGENEN Start. Genau der
     #    haeufigste Fehlerfall fiel damit durch: eine andere App haelt die Uebung, Health
     #    Services erlaubt nur eine. Der Melder laesst parallel eine Workout-App laufen.
     #    Belegt an seinen Daten: Session #8705 (17.09. 16:38) null Pulswerte, dann stuerzten
     #    beide Apps ab, Session #8706 (17:11) hatte 2036. Seine Worte: „Kann die App ja nicht
     #    immer zum Absturz bringen, damit das läuft."
     #    WICHTIG fuer die Einordnung: wir hatten das zuvor als Wear-OS-5-Plattformfehler
     #    abgelegt, weil sich zwischen 1.2.24 und 1.2.25 nichts Passendes fand. Gesucht wurde
     #    nach einer AENDERUNG, nicht nach einer fehlenden Wiederholung.
     #
     # 2. LAUF-AUSWAHL: die Nummern der Laeufe stehen jetzt direkt unter der Karte, wie in der
     #    PWA. Bisher ging die Auswahl nur ueber die Tabelle weiter unten oder durch Antippen der
     #    Spur — beides hat er begruendet abgelehnt: „Dazu ist mein Display echt zu klein und
     #    ungenau. Besonders da ich momentan immer an einer Wand entlang fahre und sich viel
     #    überlappt."
     "items": [
         "Heart rate comes back on its own. If another app was holding the watch\u2019s workout "
         "session when a recording started, we never got a reading and never asked again \u2014 "
         "for the whole session. Now we retry, so the heart rate appears as soon as the other "
         "app lets go.",
         "The run numbers are back under the map in the Android app. Picking a run no longer "
         "means scrolling down to the table.",
         "Your watch now tells us which model it is when a recording arrives, so your watch "
         "shows up by name instead of just \u201cWear OS\u201d. It only helps us find faults "
         "that affect one kind of watch \u2014 nothing about it is shared with anyone.",
         "If the app is killed mid-recording \u2014 some watches do that to save battery \u2014 "
         "the recording now ends where the data ends, instead of claiming the minutes you rode "
         "after it had already stopped. The watch also tells us it happened, so we can see how "
         "often it does.",
         "Parawing is a sport you can pick for a session. Lowkite, parawing and parakite are "
         "the same thing, so they share one entry.",
         "German words that had slipped into the English interface are gone — among them the "
         "run count under every session, the error messages, the notification while a recording "
         "runs, and eighteen labels that only a screen reader reads out. Reported by a rider.",
         "The watch shows your foil again when your alarm limits are set by hand. Picking "
         "fixed limits in your profile used to leave the watch saying \u201eno foil\u201c on the "
         "start screen, although the ride was recorded with your default foil anyway \u2014 what "
         "you ride and where the alarm limits come from are two separate things. Garmin was "
         "fixed on 10 September; Wear OS, Apple Watch and Amazfit follow now.",
         "The spot page opens with a search box instead of a list of every spot we know \u2014 "
         "with 231 of them the list was longer than the rest of the page put together.",
         "You can narrow the spot list to the ones that have a description, and each spot says "
         "how many riders have been there, with the same explanation the website gives.",
         "\u201eOlder\u201c and \u201enewer\u201c inside a session now stay in the list you came "
         "from \u2014 your own sessions, one spot across all riders, or everything \u2014 and keep "
         "the filters you had set. Before, they always walked through your own sessions.",
         "The session view wastes far less empty space above the map, so the map and the run "
         "numbers are there without scrolling; in the session list the third button no longer "
         "gets cut in half when the labels are long.",
         "A recording that can no longer be finished is now a single quiet line instead of a "
         "large notice sitting on top of your screen. It still leads you to the recording, "
         "where you decide: analyse it with what we have, or delete it.",
         "Wear OS has the water lock back, drawn along the curve of a round screen.",
         "When no heart rate was measured, the watch says so plainly instead of hinting that you "
         "wore it wrong \u2014 and the recording now tells us whether a reading arrived at all, "
         "so we can tell a missing chest strap from a fault of ours.",
         "The button that imports a FIT, TCX or GPX file is now a small \u201eFIT\u201c button at "
         "the right of the spot row instead of a wide bar of its own, and it only appears while "
         "you are looking at your own sessions \u2014 an import always creates one of yours.",
         "The spot map keeps the part of the world you were looking at. Zooming in, opening a "
         "spot and coming back used to drop you on the map of all spots again \u2014 it now stays "
         "where you left it for as long as the app is running.",
         "Ticking \u201eonly with a description\u201c updates the map at once. The pins used to sit "
         "there until you zoomed, which made the filter look broken.",
         "The spot map opens where you ride, with the neighbouring spots in view: your home "
         "spot if you set one, otherwise the spot of your last session. It used to fit every "
         "spot in the world into the frame, so everyone had to navigate to themselves first. "
         "Brand new and no sessions yet? Then it opens on the busiest spot of all.",
         "The share sheet has room for the share button again on phones with a gesture bar, "
         "and the average speed is a tile you can pick like the others.",
         "Wear OS shows whether the touch lock is on: the water drop switches it on, and a "
         "padlock sits in its place while it is locked. Until now the drop simply vanished, so "
         "the only way to find out was to touch the watch. Hold to unlock and the padlock "
         "springs open the moment you have held it long enough, so you know when to let go.",
         "\u201eYour spot\u201c now works even if you never picked one in your profile: we take "
         "the spot of your last session. The profile always offered \u201eautomatic (last "
         "session)\u201c, but nothing behind it did that \u2014 so the weather card, the spot tab "
         "and the spot chat stayed empty for almost everyone. What you pick yourself still wins, "
         "and nothing gets written into your profile behind your back.",
     ]},

    {"name": "Amazfit", "version": "1.0.10",
     # 13.09.2026 EINGEREICHT, einen Tag nach der Freigabe von 1.0.8. Zepp-Konsole: appId 1118995,
     # Application Time 2026.09.13, Status „Under Review (Can be Withdrawn)"; darunter 1.0.8 vom
     # 12.09. als „Approved".
     #
     # 1.0.9 WURDE NIE AUSGELIEFERT. Sie lag im Review, als Cesar (GitHub #4) meldete, dass sein
     # Upload weiter mit „Out of Memory" abbricht — bei Block 108 von 2341. Jan hat sie deshalb
     # zurueckgezogen und als 1.0.10 (code 13) mit dem Speicher-Fix neu eingereicht, statt Cesar
     # auf zwei Review-Runden warten zu lassen; bei Zepp sind das Wochen. Der Inhalt von 1.0.9
     # geht damit unveraendert mit raus — deshalb steht er unten weiter in `items`, ergaenzt um
     # den Upload-Punkt. Die Store-Texte bleiben wie eingereicht (Jan: „die ganzen texte lassen
     # wir so wie sie sind"), die Datei heisst darum weiter store-texte-1.0.9.csv.
     #
     # ANLASS fuer 1.0.9 war eine Nutzerantwort, keine Planung: die Rundmail an die elf
     # Amazfit-Konten ging um 09:19 raus, um 10:43 kam die Beschreibung, die den Fehler erklaerte,
     # und um 11:30 war er behoben.
     #
     # NACH DER FREIGABE: `_APP_META["zepp"]` auf 1.0.10, diesen Eintrag entfernen,
     # Changelog-Punkte eintragen. Der Update-Hinweis vertraegt die 10 an der dritten Stelle:
     # `istNeuer` in page/index.js vergleicht die Teile als ZAHLEN (nachgeprueft 13.09.), ein
     # lexikalischer Vergleich haette 1.0.10 fuer aelter als 1.0.9 gehalten.
     "eingereicht": "2026-09-13",
     "items": [
         "A long recording uploads without running out of memory. The watch used to hold the "
         "whole recording while sending it — on a two-hour session that is around 7200 positions, "
         "and the upload stopped part way with \u201eOut of Memory\u201c. Positions are now "
         "released as they go out, so the longer the ride, the more this matters. Reported by a "
         "rider whose upload stopped at block 108 of 2341.",
         "A recording no longer ends when you press a button or swipe. Until now a single press "
         "could close the app and take the running recording with it — on some watches that "
         "happened on every press, which is why so few Amazfit recordings ever arrived complete.",
         "A button press now shows the stop screen instead, the way the other activities on the "
         "watch do. It stops nothing by itself; it only shows you where stopping lives, and your "
         "previous screen comes back on its own after five seconds.",
         "The data pages no longer repeat \u201ehold = stop\u201c in the status line. That line "
         "now shows only what changes while you ride \u2014 satellite fix and whether a run is "
         "under way.",
     ]},
]

# „Coming next" = gebaut und inhaltlich fertig, aber noch NICHT hochgeladen. Sobald Jan
# einreicht, wandert der Eintrag unveraendert nach IN_REVIEW (Regel 1 oben).
NAECHSTES: list[dict] = [
    {"name": "Amazfit", "version": "1.0.11",
     # 1.0.10 (code 13) liegt seit 13.09.2026 bei Zepp im Review — ein IN_REVIEW-Eintrag ist ab
     # dem Upload eingefroren, alles Spaetere gehoert hierher. Deshalb app.json auf 1.0.11 /
     # code 14 gebumpt, sobald diese Aenderung dazukam (18.09.2026).
     "wartet_auf": "1.0.10",
     "items": [
         "The watch shows your foil again when your alarm limits are set by hand. Picking "
         "fixed limits in your profile used to leave the watch saying \u201eno foil\u201c on the "
         "start screen, although the ride was recorded with your default foil anyway \u2014 what "
         "you ride and where the alarm limits come from are two separate things. Garmin was "
         "fixed on 10 September; Wear OS, Apple Watch and Amazfit follow now.",
         "The pulse alarm works on Amazfit too. A heart-rate limit set in your profile simply "
         "never reached the watch — now it buzzes when you go over it, with its own pattern.",
         "High-speed, low-speed and pulse alarms feel different from each other now, and a "
         "repeating alarm repeats instead of buzzing once. Both were settings you could pick in "
         "your profile that the watch could not see.",
         "\u201eEconomical\u201c and \u201eGPS only\u201c from your profile now work on Amazfit. "
         "The watch always recorded at the full rate, whatever you had chosen.",
         "You can see that the touch lock is on: a line at the bottom of the screen says so for "
         "as long as it is locked. Until now the watch looked completely normal and you only "
         "found out by touching it.",
     ]},

    {"name": "iPhone + Apple Watch", "version": "1.1.34",
     # 1.1.33 ist am 13.09.2026 ausgeliefert worden („The following app is ready for
     # distribution", App Store Connect) — damit steht die naechste Nummer fest. Bis dahin stand
     # hier bewusst „after 1.1.33" ohne Nummer, weil der Ausgang der Pruefung offen war.
     #
     # Entstanden aus einem Fehler von mir (13.09.2026): ich hatte diesen Punkt zuerst in den
     # IN_REVIEW-Eintrag von 1.1.33 geschrieben — in eine Fassung also, die Jan schon hochgeladen
     # hatte und die die Aenderung gar nicht enthaelt. Auf `/changelog` haette damit oeffentlich
     # gestanden, Apple pruefe gerade etwas, das nicht im Paket ist. Merke: ein IN_REVIEW-Eintrag
     # ist ab dem Upload EINGEFROREN; alles Spaetere gehoert nach NAECHSTES.
     "items": [
         "The language setting sits at the very top of your settings now. If the app is in a "
         "language you cannot read, that is the one thing you need to find first.",
         "A recording that can no longer be finished is now a single quiet line instead of a "
         "large notice sitting on top of your screen. It still leads you to the recording, "
         "where you decide: analyse it with what we have, or delete it.",
         "Parawing is a sport you can pick for a session. Lowkite, parawing and parakite are "
         "the same thing, so they share one entry.",
         "German words that had slipped into the English interface are gone — among them the "
         "run count under every session, which said \u201eL\u00e4ufe\u201c in every language, "
         "the error messages and the text while a recording uploads. Reported by a rider.",
         "The watch shows your foil again when your alarm limits are set by hand. Picking "
         "fixed limits in your profile used to leave the watch saying \u201eno foil\u201c on the "
         "start screen, although the ride was recorded with your default foil anyway \u2014 what "
         "you ride and where the alarm limits come from are two separate things. Garmin was "
         "fixed on 10 September; Wear OS, Apple Watch and Amazfit follow now.",
         "\u201eOlder\u201c and \u201enewer\u201c inside a session now stay in the list you came "
         "from \u2014 your own sessions, one spot across all riders, or everything \u2014 and keep "
         "the filters you had set. Before, they always walked through your own sessions.",
         "\u201eYour spot\u201c now works even if you never picked one in your profile: we take "
         "the spot of your last session. The profile always offered \u201eautomatic (last "
         "session)\u201c, but nothing behind it did that \u2014 so the weather card, the spot tab "
         "and the spot comparison stayed empty for almost everyone. What you pick yourself still "
         "wins, and nothing gets written into your profile behind your back.",
         "The spot map keeps the part of the world you were looking at, and it opens where you "
         "ride: your home spot, otherwise the spot of your last session. It used to fit every spot "
         "in the world into the frame on every visit.",
         "When you share a session you can put the map or the satellite image behind it instead of "
         "a photo, and the brightness slider works for those too. Average speed, run count and "
         "longest run are tiles you can pick now \u2014 they were never selectable on any device.",
         "The spot map can be zoomed with two fingers again. It sat inside the scrolling list, "
         "which swallowed the gesture \u2014 now it sits above the list, the way it does on Android.",
         "The button that imports a FIT, TCX or GPX file is a small \u201eFIT\u201c button at the "
         "right of the filter row instead of a wide bar of its own.",
     ]},

    # Android bekommt denselben Schnitt: 1.1.29 / 1.2.29 liegen seit 13.09. 08:56 bei Google,
    # alles danach gehoert hierher. Ohne diesen Eintrag stuende auf /changelog nur die iOS-Seite
    # unter „Coming next", obwohl an Android genauso weitergearbeitet wurde.
]


def _ver_tupel(v: str) -> tuple[int, ...]:
    """„1.1.26" -> (1, 1, 26). Fehlende/kaputte Stellen zaehlen als 0 — ein Vergleich soll nie
    an einem Tippfehler in einer Versionsangabe scheitern."""
    teile = []
    for t in (v or "").strip().split("."):
        ziffern = "".join(c for c in t if c.isdigit())
        teile.append(int(ziffern) if ziffern else 0)
    return tuple(teile)


def _neuer_als(a: str, b: str) -> bool:
    """Ist Version `a` neuer als `b`? Stellenweise numerisch, nicht als Text — „1.1.10" ist
    neuer als „1.1.9", was ein String-Vergleich genau falsch herum sieht (derselbe Fehler stand
    bis 18.08. im Zepp-Update-Hinweis, s. watch-zepp/CHANGELOG.md 1.0.6)."""
    ta, tb = _ver_tupel(a), _ver_tupel(b)
    laenge = max(len(ta), len(tb))
    ta += (0,) * (laenge - len(ta))
    tb += (0,) * (laenge - len(tb))
    return ta > tb


@router.get("/changelog")
def changelog(plattform: str = "", version: str = "",
              db: Session = Depends(get_db)) -> dict:
    """Der oeffentliche Changelog, gruppiert nach Tag — neueste zuerst.

    Stand bis zum 07.09.2026 als festes Array im PWA-Code (`Changelog.tsx`). Zwei Gruende fuer
    den Umzug in die Datenbank, beide von Jan:
      * Jede Textzeile brauchte einen NEUBAU der PWA. Jetzt ist ein neuer Punkt eine Zeile in
        `changelog_items`.
      * Im Code stand der 7. September zweimal und der 6. dreimal. Eine Zeile je PUNKT mit
        einem echten Datum macht das strukturell unmoeglich: hier wird nach `tag` gruppiert.

    `plattform` + `version` sind optional und fuer die NATIVEN Apps gedacht (Jans Idee): wer sie
    mitschickt, bekommt je Punkt ein `mit_update`-Kennzeichen — also „das bekommst du erst mit
    einem Update". Ausdrueckliche Vorgabe Jan: **nur in der Changelog-Ansicht zeigen, NICHT im
    Update-Hinweis** — der bleibt kurz.

    Die Rechnung „ist diese Version neuer als meine" macht bewusst der Server. Sonst haette jede
    der vier Apps ihren eigenen Versionsvergleich, und genau der ist schon einmal falsch gewesen.
    """
    from ..models import ChangelogItem

    plat = (plattform or "").lower().strip()
    zeilen = (db.query(ChangelogItem)
              .filter(ChangelogItem.entwurf == False)  # noqa: E712
              .order_by(ChangelogItem.tag.desc(), ChangelogItem.pos.asc(),
                        ChangelogItem.id.asc()).all())
    tage: list[dict] = []
    for z in zeilen:
        iso = z.tag.isoformat()
        if not tage or tage[-1]["date"] != iso:
            tage.append({"date": iso, "items": []})
        punkt: dict = {"text": z.text}
        if z.img:
            punkt["img"] = z.img
            if z.img_alt:
                punkt["img_alt"] = z.img_alt
        # Welche Plattform braucht welche Version fuer diesen Punkt? IMMER mitschicken, nicht nur
        # bei einer Anfrage mit `plattform` — sonst steht auf /changelog ein Punkt, den nur eine
        # Uhr kann, ohne jeden Hinweis darauf (Jans Befund 11.09.2026). Leer = gilt ueberall
        # sofort (Web-/Server-Aenderungen sind mit dem Deploy da).
        if z.versionen:
            try:
                alle = json.loads(z.versionen) or {}
            except ValueError:
                alle = {}
            # Doppelte Marken zusammenfassen: "ios" und "apple" sind dieselbe Einreichung mit
            # derselben Nummer und ergaeben sonst zwei gleiche Abzeichen nebeneinander (dieselbe
            # Entdoppelung wie in der Live-Tabelle weiter unten).
            marken: list[dict] = []
            for k, v in alle.items():
                if not v:
                    continue
                eintrag = {"name": PLATTFORM_NAMEN.get(k, k), "version": str(v)}
                if eintrag not in marken:
                    marken.append(eintrag)
            if marken:
                punkt["plattformen"] = marken
        # Kommt dieser Punkt fuer MEINE Plattform erst mit einer neueren Version?
        if plat and version and z.versionen:
            try:
                vs = json.loads(z.versionen) or {}
            except ValueError:
                vs = {}
            noetig = (vs.get(plat) or "").strip()
            if noetig and _neuer_als(noetig, version):
                punkt["mit_update"] = noetig
        tage[-1]["items"].append(punkt)
    return {"days": tage, "latest": tage[0]["date"] if tage else ""}


def _noch_offen(abgelehnt: dict, live: list[dict]) -> bool:
    """Soll diese abgelehnte Fassung noch auf /changelog stehen?

    Vorgabe Jan (10.09.2026): „nur solange anzeigen solange keine neuere version approved wurde".
    Die Zeile erklaert, warum angekuendigte Punkte noch fehlen — sobald ein Nachfolger LIVE ist,
    erklaert sie nichts mehr und verschwindet. Das passiert damit von selbst, wenn `_APP_META`
    nach der Freigabe gesetzt wird; niemand muss hier eine Zeile von Hand wegraeumen (und keine
    bleibt aus Versehen stehen).

    Verglichen wird STELLENWEISE, weil eine Zeile zwei Nummern tragen kann („1.1.27 / 1.2.27" =
    Handy und Uhr). Erst wenn JEDE Live-Nummer ihre abgelehnte erreicht oder ueberholt hat, ist
    die Zeile erledigt — sonst stuende sie nicht mehr da, obwohl eine der beiden Spuren noch
    haengt. Passen die Anzahlen nicht zusammen (kaeme nur bei einer Umgruppierung vor), gilt der
    Vergleich der jeweils hoechsten Nummer.
    """
    zeile = next((r for r in live if r["name"] == abgelehnt["name"]), None)
    if zeile is None:                     # nichts live -> die Ablehnung ist die einzige Aussage
        return True
    aus = [x.strip() for x in str(zeile.get("version") or "").split("/") if x.strip()]
    weg = [x.strip() for x in str(abgelehnt.get("version") or "").split("/") if x.strip()]
    if not aus or not weg:
        return True
    if len(aus) != len(weg):
        aus, weg = [max(aus, key=_ver_tupel)], [max(weg, key=_ver_tupel)]
    # offen, solange MINDESTENS eine Spur noch hinter der abgelehnten Nummer liegt
    return any(_neuer_als(w, a) for a, w in zip(aus, weg))


@router.get("/releases")
def releases() -> dict:
    """Was ist live, was liegt im Review, was wurde abgelehnt, was kommt als Naechstes.

    Fuer /changelog. Leere Listen blendet die Seite aus, `rejected` ist also nur zu sehen, solange
    wirklich etwas abgelehnt ist.
    """
    live = []
    for schluessel, name in GRUPPEN:
        versionen, laden = [], ""
        for p in schluessel:
            m = _APP_META.get(p) or {}
            v = (m.get("latest") or "").strip()
            if not v:
                continue
            if v not in versionen:      # Handy und Uhr tragen bei Apple dieselbe Nummer
                versionen.append(v)
            laden = laden or (m.get("store_url") or "")
        if versionen:
            live.append({"name": name, "version": " / ".join(versionen), "store_url": laden})
    # Die Website steht mit in der Liste, obwohl sie keine Versionsnummer hat: sie ist Teil
    # desselben Produkts, und die Aussage „hier braucht niemand auf einen Store zu warten" ist
    # fuer Nutzer die nuetzlichste Zeile der ganzen Tabelle (Jan, 05.09.).
    live.insert(0, {"name": "Website", "version": "always up to date",
                    "store_url": "", "note": "new things appear here first, without a store"})
    abgelehnt = [r for r in ABGELEHNT if _noch_offen(r, live)]
    return {"live": live,
            "review": _mit_note(IN_REVIEW, "review"),
            "rejected": _mit_note(abgelehnt, "rejected"),
            "next": _mit_note(NAECHSTES, "next")}


# --------------------------------------------------------------------------------------
# Uhren-Qualitaet: was die Geraete bei uns wirklich abliefern
#
# Erzeugt von `scripts/uhren-qualitaet.py` (liest je Session die Rohpunkte, das dauert
# Minuten und gehoert deshalb NICHT in einen Request). Der Snapshot liegt als Datei im Repo
# und wird alle paar Wochen neu erzeugt; `stand` im JSON sagt, von wann er ist.
UHREN_JSON = os.path.join(os.path.dirname(__file__), "..", "..", "..",
                          "analyse", "uhren", "uhren-qualitaet.json")


@router.get("/watch-quality")
def watch_quality() -> dict:
    """Snapshot der Uhren-Auswertung fuer /watch-stats. Fehlt die Datei, bleibt es leer —
    die Seite blendet den Abschnitt dann aus, statt einen Fehler zu zeigen."""
    try:
        with open(UHREN_JSON, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {"stand": "", "modelle": []}


@router.get("/latest")
def latest(platform: str = "") -> dict:
    """Neueste Store-Version je Plattform (ios|android). Werte werden manuell gepflegt.
    Die App vergleicht `latest` mit ihrer eigenen Bundle-Version und blendet ggf. einen
    nicht-blockierenden Hinweis ein (Hard-Gate optional ueber `min_supported`)."""
    m = _APP_META.get(platform.lower().strip())
    if not m:
        return {"latest": "", "min_supported": "", "store_url": ""}
    return dict(m)

# Zeichenfolgen, an denen sich ein Crawler selbst zu erkennen gibt. Die Liste muss NICHT
# vollstaendig sein und soll es auch nicht: wer sich nicht meldet, faellt ohnehin nicht auf,
# weil er unser JS nicht ausfuehrt und diesen Endpunkt damit nie erreicht. Sie trennt nur die
# wenigen, die rendern (Googlebot und Verwandte), von den Menschen.
_BOT_KENNUNGEN = (
    "bot", "crawl", "spider", "slurp", "curl", "wget", "python-requests", "headless",
    "lighthouse", "pingdom", "uptime", "monitor", "preview", "scrape", "fetcher",
)


def _ist_bot(ua: str) -> bool:
    u = ua.lower()
    return any(k in u for k in _BOT_KENNUNGEN)


@router.post("/hit")
def seiten_aufruf(request: Request, db: Session = Depends(get_db)) -> dict:
    """Ein Seitenaufruf der laufenden Website. Oeffentlich, ohne Anmeldung.

    Gezaehlt wird EINE Zahl je Tag (models.PageHit) — keine Adresse, keine Kennung, kein Verlauf.
    Aufgerufen wird das aus dem JS der Seite, nicht vom Server abgeleitet: im Zugriffs-Log sind
    87 % der `GET /` unsere eigenen Pruefungen, und wiederkehrende Besucher holen die Huelle aus
    dem Service-Worker-Cache, tauchen dort also gar nicht auf.

    Fehler hier duerfen nichts kippen — es ist ein Zaehler, kein Dienst.
    """
    art = "bot" if _ist_bot(request.headers.get("User-Agent") or "") else "web"
    heute = datetime.now(timezone.utc).date()
    try:
        # Erst anlegen (falls der Tag neu ist), dann hochzaehlen. Das Hochzaehlen passiert ATOMAR
        # in SQL, nicht in Python: mit vier Workern gingen sonst Aufrufe verloren.
        db.execute(pg_insert(models.PageHit)
                   .values(tag=heute, art=art, zahl=0)
                   .on_conflict_do_nothing(constraint="uq_page_hit"))
        db.execute(update(models.PageHit)
                   .where(models.PageHit.tag == heute, models.PageHit.art == art)
                   .values(zahl=models.PageHit.zahl + 1))
        db.commit()
    except Exception:
        db.rollback()
    return {"ok": True}
