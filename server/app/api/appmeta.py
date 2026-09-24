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
        "latest": "1.1.36",   # FREIGEGEBEN 2026-09-21, ZWEITE Apple-Mail („The following app is
        # ready for distribution · App Version Number: 1.1.36 · Platform: iOS").
        # GEGENGEPRUEFT an der Store-API in de/us/gb/ch: alle vier melden 1.1.36 mit
        # currentVersionReleaseDate 2026-09-21T02:28:55Z (04:28 Berlin) — diesmal ohne
        # Cache-Nachhang, die Produktseite war sofort auf dem neuen Stand.
        # Inhalt: der Handy-Recorder zeichnet zusaetzlich das Gyroskop auf, falls vorhanden.
        # EINGEREICHT am Abend des 20.09., gebaut aus Commit b8ec06f1 (19:02:40, trug
        # MARKETING_VERSION 1.1.36 / Build 40); davor 99df0974 um 18:55:44 „iOS auf 1.1.36 /
        # Build 40 gebumpt". Der Upload ist auf gut zwei Minuten eingegrenzt: NACH dem Commit
        # (19:02:40) und VOR 19:05 — denn um 19:05 kam Apples Mail „The following build has
        # completed processing · Build Number: 40 · Version Number: 1.1.36", und die meldet das
        # ENDE der Verarbeitung, nicht den Upload. Der Build war damit um 19:05 fuer TestFlight
        # verfuegbar. Freigabe 21.09. 04:28:55 — macht rund NEUN EINHALB STUNDEN, passend zu
        # 1.1.33 (11 h). Dass der Upload-Zeitpunkt zugleich der Einreichungszeitpunkt ist, gilt
        # hier, weil Jan beides in einem Zug macht (seine Ansage 21.09.); grundsaetzlich sind es
        # zwei Schritte, die auseinanderliegen koennen.
        # ALT: "latest": "1.1.35",   # FREIGEGEBEN 2026-09-20, ZWEITE Apple-Mail („The following app
        # is ready for distribution · App Version Number: 1.1.35 · Platform: iOS"). Eingereicht am
        # SELBEN Tag um 08:50, Uebermittlung 833dcb6b-cff7-41ba-b860-1137d0121939 — also nur
        # wenige Stunden Pruefung. Gebaut aus Commit b0060b66.
        # Inhalt: die beiden neuen On-Foil-Marken (Strecke/Zeit im Lauf) im Profil der iPhone-App
        # und ihre Auswertung auf der Apple Watch.
        # ⚠️ Die PRODUKTSEITE zeigte beim Setzen noch 1.1.34 („vor 22 Std."). Das ist die bekannte
        # Store-Propagation und KEIN Grund zu warten: ausschlaggebend ist die zweite Mail, so steht
        # es in [[submission-log]] (bei 1.1.31 war es genauso).
        # ALT: "latest": "1.1.34",   # FREIGEGEBEN 2026-09-19, ZWEITE Apple-Mail („The following app
        # is ready for distribution · App Version Number: 1.1.34 · Platform: iOS"). Eingereicht
        # 18.09. 13:32, also gut einen Tag Pruefung. Vorher 1.1.33, s. unten.
        # ALT: "latest": "1.1.33",   # FREIGEGEBEN 2026-09-12, ZWEITE Apple-Mail („ready for
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
        "latest": "1.1.31",   # LIVE 2026-09-22: Play-Mail „Your update to Pumpfoil, created on
        # Sep 21, 2026 at 4:00 AM GMT, is live in the store." Der Zeitstempel passt EXAKT auf
        # unsere Einreichung vom 21.09. 06:00 Berlin (Phone 1.1.31/45 + Wear 1.2.31/1041).
        # ⏱️ EINEN TAG Pruefung — die schnellste Play-Runde bisher; 1.1.28, 1.1.29 und 1.1.30
        # brauchten je drei. Woran es lag, ist von aussen nicht zu sehen; erwaehnenswert ist es,
        # weil „drei Tage" bis eben der Normalfall war und die Planung darauf stand.
        # Noch NICHT im Feld belegt: kein Geraet meldet bisher 1.1.31 oder 1.2.31 (die drei
        # Sessions mit „1.1.31" sind Jans eigene Pixel-Builds, die iPhones mit derselben Nummer
        # sind iOS — beide Plattformen nutzen 1.1.x, s. Notiz vom 07.09.). Wie bei 1.1.30 stuetzt
        # sich die Zeile auf die Play-Mail, die fuer Play die massgebliche Quelle ist.
        # ALT: "latest": "1.1.30",   # LIVE 2026-09-21, 04:28: Play-Mail „Your update to Pumpfoil,
        # created on Sep 18, 2026 at 5:38 AM GMT, is live in the store." Passt auf unsere
        # Einreichung vom 18.09. 07:38 Berlin (Phone 1.1.30/44 + Wear 1.2.30/1040), also
        # DREI TAGE Pruefung — wie bei 1.1.29 und 1.1.28, das ist inzwischen der Normalfall.
        # Zufall am Rande: die Apple-Freigabe fuer iOS 1.1.36 kam am selben Morgen um 04:28:55.
        # ⚠️ ANDERS ALS SONST NOCH NICHT IM FELD BELEGT: `app_version 1.2.30` melden bisher genau
        # zwei Geraete, und beide sind KEINE Nutzer — der Play-Pruefer (user 6 „Google Tester",
        # Pixel Watch 3, zuletzt 21.09. 04:05, also 23 Minuten VOR der Mail) und Jans eigener
        # Wear-Emulator vom 18.09. Der Roll-out beginnt also gerade erst. Die Zeile stuetzt sich
        # hier allein auf die Play-Mail; die ist fuer Play die massgebliche Quelle (die
        # oeffentliche Store-Seite nennt keine Version, s. Notiz vom 10.09.).
        # ALT: "latest": "1.1.29",   # LIVE 2026-09-16: Play-Mail „Your update to Pumpfoil, created on
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
        "latest": "1.0.88",   # LIVE im CIQ-Store 2026-09-20, wenige Minuten nach dem Upload —
        # bei Garmin der NORMALFALL, nicht die Ausnahme (Jan: „garmin geht immer sehr schnell").
        # BELEG AUS UNSEREN DATEN, nicht nur Jans Meldung: sein PHYSISCHES Geraet (Token 297,
        # part_number 006-B4376-00, fenix 7X Pro) meldete um 08:14:43 noch `1.0.87` und um
        # 08:21:52 dann `1.0.88`, dazu Session 9371 mit GPS UND Accel um 08:21:49. Eine echte Uhr
        # bekommt eine neue Version nur ueber den Store. Jans Wortlaut: „1.0.88 auf meiner echten
        # uhr ueber iq store installiert, ist schon verfuegbar, und echte session hochgeladen".
        # GEGENGEPRUEFT an der Store-Seite: latestExternalVersion 1.0.88, latestInternalVersion 42.
        # ACHTUNG, der REST-Pfad der Store-API ist weg: `apps.garmin.com/api/appsLibraryExternal/
        # rest/apps/<id>` liefert 404 mit einer HTML-Seite (ebenso `/versions`). Die Werte stehen
        # jetzt in der Produktseite selbst (Next.js, `__NEXT_DATA__`):
        #   curl -s https://apps.garmin.com/apps/<uuid> | grep -o '"latestExternalVersion":"[^"]*"'
        # Inhalt: On-Foil-Marken nach Strecke und Zeit im Lauf, Pairing-Code frei vom Teildisplay
        # der Instinct-Klasse, Puffer-Schaetzung zaehlt nicht mehr einen Chunk je wartender
        # Session zu viel. `watch/bin` ist auf 1.0.88 gebaut (129 von 129, 0 Fehler).
        # ALT: "latest": "1.0.87",   # LIVE im CIQ-Store 2026-09-17, ZWEIFACH belegt (nicht nur Jans
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
        "latest": "1.2.31",   # LIVE 2026-09-22, dieselbe Play-Mail wie android (ein Release,
        # eine applicationId, beide Spuren). Begruendung und Belege stehen bei "android".
        # ALT: "latest": "1.2.30",   # LIVE 2026-09-21, dieselbe Play-Mail wie android (Release erstellt
        # 18.09. 05:38 GMT) — eine Mail deckt immer beide Spuren ab. Beleg und der Hinweis, dass
        # der Roll-out noch nicht im Feld sichtbar ist, stehen bei "android".
        # ALT: "latest": "1.2.29",   # LIVE 2026-09-16, dieselbe Play-Mail wie android (Release erstellt
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
        "latest": "1.1.36",   # FREIGEGEBEN 2026-09-21 — dieselbe Einreichung wie "ios" (ein Bundle,
        # dieselbe MARKETING_VERSION in project.yml). Beleg s. dort.
        # ALT: "latest": "1.1.35",   # FREIGEGEBEN 2026-09-20 — dieselbe Einreichung wie "ios" (ein Bundle,
        # eine MARKETING_VERSION). Fuer die WATCH-App bringt 1.1.35: die Apple Watch vibriert bei
        # den neuen Marken nach Strecke und Zeit im Lauf, die im Profil eingestellt werden.
        # ALT: "latest": "1.1.34",   # FREIGEGEBEN 2026-09-19 — dieselbe Einreichung wie "ios" (ein Bundle,
        # eine MARKETING_VERSION). Fuer die WATCH-App bringt 1.1.34: Foil und Alarm-Schwellen sind
        # entkoppelt — feste Grenzen im Profil liessen die Uhr „kein Foil" anzeigen.
        # ALT: "latest": "1.1.33",   # FREIGEGEBEN 2026-09-12 — dieselbe Einreichung wie "ios" (ein Bundle,
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
        "latest": "1.0.11",  # FREIGEGEBEN 2026-09-21 (Zepp-Mail: „The application Pumpfoil
        # (1.0.11) you submitted has been approved and added to the ZEPP app store"). Nummer AUS
        # DER MAIL, wie es die Regel verlangt. Eingereicht 19.09. — also ZWEI TAGE, und damit die
        # schnellste Zepp-Runde bisher; davor lagen 1.0.9 und 1.0.10 dreimal in Folge an den
        # Store-Vorschaubildern fest, 1.0.10 wurde am 19.09. zurueckgezogen und mit korrigierten
        # Bildern als 1.0.11 neu eingereicht.
        # DAS IST DIE WICHTIGE: hier stecken die beiden Fehler drin, an denen die Amazfit-Uhren
        # bisher praktisch unbrauchbar waren — ein Tastendruck beendete die laufende Aufnahme,
        # und lange Uploads starben an „Out of Memory", weil die ganze Aufnahme beim Senden im
        # Speicher lag. Dazu Puls-Alarm, Alarmmuster, Sparmodus/GPS-only und die Anzeige der
        # Tastensperre.
        # ALT: "latest": "1.0.8",   # FREIGEGEBEN 2026-09-12 (Zepp-Mail: „The application Pumpfoil (1.0.8)
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
#     NAECHSTES  -> nichts                             -> „current development"
#                   (bewusst OHNE Aussage zum Bauzustand, s. `_note`)
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
    bzw. `abgelehnt`) und der Ablehnungsgrund (`grund`). NAECHSTES traegt gar nichts mehr —
    dort steht immer „current development".
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
        # Schlicht „current development" — KEINE Aussage darueber, ob schon gebaut oder
        # hochladefertig. Jan, 19.09.2026: „das wird released wenn ich denke das es ein release
        # wuerdig ist, einfach 'current development'." Vorher stand hier ein Dreiklang aus
        # „built, waiting to be uploaded" / „built, waiting for X to clear review first" /
        # „finished, waiting to be built and uploaded". Alle drei behaupteten etwas ueber den
        # Bauzustand, das entweder niemanden interessiert oder falsch war — am 18.09. stand
        # „built" an einer Fassung, die niemand gebaut hatte. Eine Zeile, die nichts behauptet,
        # kann auch nicht falsch werden.
        return "current development"
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
# Bekannte Probleme, die JETZT Nutzer treffen — die Warnbox ganz oben auf /changelog.
#
# Jans Auftrag (18.09.2026): „wir sollten im changelog ganz oben noch eine kleine warnbox ueber
# aktuelle bekannte probleme anzeigen, aktuell vor allem das amazfit nicht funktioniert und wir
# sehnlichst auf die naechste freigabe seit datum der ersten einreichung nach dem zuletzt
# akzeptierten release."
#
# WARUM ES DIE TABELLE DARUEBER NICHT SCHON LEISTET: sie sagt, welche Fassung wo steht — aber
# nicht, dass die live stehende KAPUTT ist. Ein Amazfit-Nutzer liest dort „Amazfit 1.0.8" und
# haelt das fuer den normalen Betrieb, waehrend ihm jede zweite Aufnahme abbricht.
#
# `seit` ist BEWUSST NICHT das Datum der laufenden Einreichung, sondern das der ERSTEN nach der
# letzten Freigabe. Sonst wuerde die Wartezeit bei jeder Ablehnung auf null springen und genau
# das verschweigen, was weh tut: fuer Amazfit steht dort der 13.09. (1.0.10), obwohl inzwischen
# 1.0.11 im Review liegt — gewartet wird seit dem 13., nicht seit dem 18.
#
# Ein Eintrag verschwindet, sobald das Problem behoben AUSGELIEFERT ist — also beim Setzen von
# `_APP_META[...]["latest"]`, nicht schon bei der Einreichung.
# LEER = die Warnbox erscheint gar nicht. Das ist der Normalzustand, kein vergessener Eintrag.
#
# Zuletzt drin: Amazfit, vom 18.09. bis zum 21.09.2026 — Aufnahmen brachen bei einem Tastendruck
# ab und lange Uploads starben an „Out of Memory". Beides ist mit 1.0.11 ausgeliefert, damit ist
# der Eintrag nach der eigenen Regel oben faellig gewesen (er geht beim Setzen von `latest`, nicht
# schon bei der Einreichung). Gewartet wurde 8 Tage, gerechnet ab der ersten Einreichung nach der
# letzten Freigabe (13.09., 1.0.10) — nicht ab der Einreichung von 1.0.11.
BEKANNTE_PROBLEME: list[dict] = []


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
    {"name": "Amazfit", "version": "1.0.10",
     # Zepp, 18.09.2026 — DRITTE Ablehnung in Folge, und zum dritten Mal geht es NICHT um die App,
     # sondern um die eckigen Vorschaubilder („Update the preview images. Affected: square-screen
     # preview 1, 2, 3, 4, 5, 6 and 7"). Am Code hat Zepp bis heute nichts beanstandet.
     #
     # URSACHE GEFUNDEN UND BEHOBEN, noch am selben Tag. Die Mail nennt „corrected examples", und
     # das sind 112 Bild-URLs auf Zepps CDN unter UNSERER appId — unsere eigenen Uploads,
     # 7 Bildschirme x 16 Sprachen. Heruntergeladen und nachgemessen: RGB-Abweichung 0,000 gegen
     # alle sieben Dateien im Repo, aber ein ANDERER Alphakanal — ein Rechteck mit stark
     # gerundeten Ecken (Radius ~57 px), byteweise dieselbe Maske ueber allen 112 Bildern.
     # Das ist „corresponding device shape": die eckigen Amazfit-Displays sind stark gerundet.
     # Am 10.09. hatten unsere Bilder scharfe OBERE und runde UNTERE Ecken — wir haben daraufhin
     # ALLE Ecken scharf gemacht, also in die falsche Richtung korrigiert.
     # Behoben: die Maske liegt als brand/stores/zepp/maske-eckig-360.png im Repo, der Generator
     # wendet sie an, und die neuen sieben Dateien sind byteweise identisch mit dem, was Zepp
     # zurueckgeschickt hat. Details in brand/stores/zepp/README.md.
     #
     # Der Link in der Mail (docs.zepp.com/docs/guides/app-development/app-submission/#preview-images)
     # ist weiterhin TOT (404, am 18.09. erneut abgerufen). Gueltig ist docs.zepp.com/docs/distribute/.
     #
     # Punkt 3 der Mail war nur eine Empfehlung („We recommend adding a feedback email") und ist
     # erledigt: `scripts/zepp-store-texte.py` haengt jetzt an jeden Details-Text eine Kontaktzeile
     # mit info@pumpfoil.org, in allen 17 Sprachen.
     "abgelehnt": "2026-09-18",
     "grund": "the store preview images again, not the app itself; the cause is found and the "
              "images are corrected, so the next version goes back with them"},
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
    {"name": "Amazfit", "version": "1.0.12",
     # EINGEREICHT 24.09.2026: im Zepp-Entwicklerkonto steht 1.0.12 auf „Under Review (Can be
     # Withdrawn)", Application Time 2026.09.24; 1.0.11 daneben weiter „Approved".
     "eingereicht": "2026-09-24",
     "items": [
         "Amazfit watches vibrate at the distance and time marks set in your profile.",
         "A recording keeps the screen awake for as long as it runs.",
         "If the start button is greyed out, tapping it now says why — waiting for GPS, or an "
         "upload still running.",
         "While a recording runs, the data pages show how long it has been going.",
         # Der groesste Einzelpunkt dieser Fassung: bis 1.0.11 gingen 48 bis 87 % der
         # Aufnahmezeit ohne Position verloren (neun Aufnahmen, fuenf Modelle).
         "Amazfit watches keep far more of your track.",
         "Your own screens, foils and alarm limits are there even without your phone nearby.",
         "If getting a pairing code fails, the watch says why: no phone, or no way out to the "
         "internet.",
         "A recording can be paused, and what is already recorded goes up while you wait.",
         "A recording can be discarded without saving it — far left and far right of the stop "
         "screen.",
         "The touch lock no longer snaps shut while you are swiping through the pages.",
     ]},

    # Android + Wear: 1.1.31 / 1.2.31 sind am 22.09. FREIGEGEBEN und stehen deshalb hier nicht
    # mehr, sondern in `_APP_META` als live (eine Play-Mail deckt beide Spuren ab). Die vier
    # Punkte sind in die Changelog-Tabelle gewandert, mit `versionen = {"android": "1.1.31",
    # "wear": "1.2.31"}`, dazu ein Freigabe-Ereignis.

    # iOS/Apple: 1.1.36 ist am 21.09. FREIGEGEBEN und steht deshalb hier nicht mehr, sondern in
    # `_APP_META` als live (beide Schluessel, ein Bundle). Sein Punkt ist in die Changelog-Tabelle
    # gewandert, mit `versionen = {"ios": "1.1.36", "apple": "1.1.36"}`.
    # Als Naechstes steht fuer iOS nichts an: die Lage-Ansicht (Nicken/Rollen/Gieren, Hub) ist
    # bewusst erst in der PWA — Jans Vorgabe, uebernehmen auf die nativen Apps erst, wenn sie
    # fix, fertig und getestet ist.

    # Android + Wear: 1.1.30 / 1.2.30 sind am 21.09. FREIGEGEBEN und stehen deshalb hier nicht
    # mehr, sondern in `_APP_META` als live (eine Play-Mail deckt beide Spuren ab). Die 21 Punkte
    # sind in die Changelog-Tabelle gewandert, mit `versionen = {"android": "1.1.30",
    # "wear": "1.2.30"}`, dazu ein Freigabe-Ereignis.
    # Amazfit: 1.0.11 ist am 21.09. FREIGEGEBEN und steht deshalb hier nicht mehr, sondern in
    # `_APP_META` als live. Die 10 Punkte sind in die Changelog-Tabelle gewandert, mit
    # `versionen = {"zepp": "1.0.11"}`, dazu ein Freigabe-Ereignis. Der Punkt zum Foil auf dem
    # Startbildschirm stand dort schon fuer Android/Wear vom selben Tag — er hat `zepp` dazu
    # bekommen, statt zweimal am selben Tag zu erscheinen.
]

# „Coming next" = gebaut und inhaltlich fertig, aber noch NICHT hochgeladen. Sobald Jan
# einreicht, wandert der Eintrag unveraendert nach IN_REVIEW (Regel 1 oben).
NAECHSTES: list[dict] = [
    # Nachgetragen am 24.09.2026 (Jan: „ich sehe nichts im changelog was bei garmin, ios oder
    # android als coming next anstehen wuerde"). Sie standen nicht hier, weil es bis zum Bump
    # keine Versionsnummer gab — nicht, weil nichts fertig waere. Der Schnitt liegt jeweils bei
    # der letzten Freigabe: Android/Wear 22.09., iOS 21.09., Garmin 20.09.
    {"name": "Android phone", "version": "1.1.32",
     "items": [
         "Foil Scoot is a sport you can pick for a session.",
         "The phone recorder shows how far along an upload is, with a bar that moves.",
         "An interrupted upload picks itself up when you open the app again.",
         "When the community passes a round number — 1,000 foilers, 1,000 spots, a million "
         "pumps — that number quietly celebrates for a while.",
     ]},
    {"name": "Wear OS", "version": "1.2.32",
     "items": [
         "A recording can be paused, and what is already recorded goes up while you wait.",
         "Changes you make to your profile reach the watch right after an upload, not just at "
         "the next start.",
     ]},
    {"name": "iPhone + Apple Watch", "version": "1.1.37",
     "items": [
         "Foil Scoot is a sport you can pick for a session.",
         "When the community passes a round number — 1,000 foilers, 1,000 spots, a million "
         "pumps — that number quietly celebrates for a while.",
         "A recording on the Apple Watch can be paused, and what is already recorded goes up "
         "while you wait.",
         "Changes you make to your profile reach the Apple Watch right after an upload, not "
         "just at the next start.",
     ]},
    {"name": "Garmin", "version": "1.0.89",
     "items": [
         "Changes you make to your profile reach the watch right after an upload, not just at "
         "the next start.",
     ]},
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
        # Store-Ereignisse („eingereicht", „freigegeben") tragen ihre Art mit, damit die Seite sie
        # ruhiger setzen kann als einen Funktionspunkt. Der Standard bleibt weg — ein Feld, das bei
        # 99 % der Zeilen „punkt" sagt, kostet nur Platz in der Antwort.
        if (z.art or "punkt") != "punkt":
            punkt["art"] = z.art
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
    # Bekannte Probleme mit ERZEUGTER Wartezeile — die Tage zaehlen von selbst weiter, damit
    # niemand ein Datum von Hand nachpflegen muss (und es dadurch veraltet).
    from datetime import date
    probleme = []
    for pr in BEKANNTE_PROBLEME:
        e = {"titel": pr["titel"], "text": pr["text"]}
        if pr.get("seit"):
            tage = (date.today() - date.fromisoformat(pr["seit"])).days
            e["note"] = (f"waiting for {pr.get('wartet_auf') or 'the store'} since "
                         f"{_datum(pr['seit'])} \u2014 {tage} days")
        probleme.append(e)
    return {"live": live,
            "review": _mit_note(IN_REVIEW, "review"),
            "rejected": _mit_note(abgelehnt, "rejected"),
            "next": _mit_note(NAECHSTES, "next"),
            "probleme": probleme}


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
