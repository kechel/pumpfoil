# Wear Engine – zweiter Antrag (nur GT / Fit / D)

Vorbereitet am 04.11.2026, **eingereicht am 04.11.2026 um 20:54** (Konsole: „To be reviewed“, Protokoll in docs/TODO.md). Der erste Antrag vom 09.10. wurde am 13.10. abgelehnt (docs/TODO.md, 13.10.). Huawei
verlangte damals:

1. Screenshots bzw. ein UX-Diagramm der Abläufe Uhr ↔ Handy,
2. eine Begründung, warum die Uhr nicht direkt übers Internet sendet, und eine Lösung für den Fall, dass die
   Handy-App nicht läuft,
3. Watch 3/4 seien zu alt.

Dieser Antrag deckt deshalb **nur die Lite-Wearable-Uhren** ab (GT 3/4/5/6, Fit, D2). Watch 3/4 kommen nicht mehr
vor. Die Watch 5 braucht keine Wear Engine, weil sie direkt hochlädt; sie ist seit 04.11. im AppGallery.

**Einreichen (Weg gefunden 04.11.):** NICHT in AppGallery Connect (dort liegt nur die Store-Seite der Android-App,
„Draft" — nicht auf Release klicken). Sondern Huawei-Entwicklerkonsole
https://developer.huawei.com/consumer/en/console (Konto SmartKomm GmbH) → Startseite „Konsole", Abschnitt
**Entwicklung** → Kachel **Wear Engine** (neben Health Service Kit). Dort haengt der Antrag am HUAWEI-ID-Produkt
„Pumpfoil" (App-ID 119274989).

## Was du einträgst (wie beim ersten Mal, mit drei Änderungen)

| Feld | Wert |
|---|---|
| App | Android-App `org.pumpfoil.app` (HUAWEI-ID-Produkt „Pumpfoil", App-ID 119274989) |
| Geräte | **nur Lite Wearable** (beim ersten Mal „all need support", Lite + Smart) |
| Uhr-App | ja |
| Berechtigung | nur **Basic device information** (unverändert) |
| Fingerabdrücke | Play-App-Signatur und Upload-Schlüssel (unverändert) |

Die zwei Excel-Dateien vom ersten Antrag (Datennutzung, Autorisierungsweg) liegen bei dir. Darin ändert sich:

- **Geräte:** nur GT / Fit / D.
- **Autorisierungsweg:** die neuen Screenshots unten statt der drei Emulator-Bilder.
- **Neu:** das Ablaufdiagramm `ablauf.png` als Anhang. Die Quelle `ablauf.html` liegt daneben, falls Huawei
  etwas anders haben will.

## Antworttext (Englisch, in das Beschreibungs- bzw. Begründungsfeld)

> **Purpose.** Pumpfoil (pumpfoil.org, SmartKomm GmbH, Germany) records pump-foiling and other water-sports
> sessions on the user's watch: GPS position, heart rate and motion. The user's own phone app uploads the
> recording to the user's account, where it is analysed (runs, pumps, speed, distance). The data is used only for
> the user's own sessions. We have no advertising, no analytics and no third-party data sharing.
>
> **Devices.** This application covers only HUAWEI WATCH GT, Fit and D series (Lite Wearable). Our app for
> HUAWEI WATCH 5 does not use Wear Engine; it uploads directly and is already published on AppGallery. We no longer
> target WATCH 3/4.
>
> **Why Wear Engine and not the internet.** Lite Wearable watches offer third-party apps no HTTP or socket API, so
> Wear Engine P2P messaging to the paired phone is the only way to get a recording off the watch. Many GT models
> also have no Wi-Fi or mobile data.
>
> **Flow (see the attached diagram):**
> 1. The user links the watch once in the Pumpfoil phone app (watch card → Wear Engine authorisation, permission
>    „Basic device information" only).
> 2. The watch app records a session and stores it on the watch. Recording never depends on the phone.
> 3. During and after the session the watch sends new data to the phone app as P2P messages of at most 1 KB. The
>    watch shows the progress as a bar and a part counter, e.g. „24/268".
> 4. The phone app reassembles the files and uploads them over HTTPS to the user's account.
> 5. A file is deleted on the watch only after Wear Engine has confirmed delivery (code 207) of every one of its
>    parts. The watch then shows „All sent".
> 6. In the other direction, the phone app sends the user's chosen data pages and alarm thresholds to the watch.
>
> **When the phone app is not running.** The watch keeps every unsent file. Each failed attempt makes it wait
> longer before the next one, and it shows „open app on phone". As soon as the user opens Pumpfoil on the phone,
> the next attempt succeeds and the transfer continues where it stopped. Nothing is lost and nothing is sent twice,
> because each part carries its file name and part number.
>
> **Permissions.** Only „Basic device information" (to find the paired watch and show its name). We do not
> request health or sensor permissions through Wear Engine; the watch app reads its own sensors locally.

## Screenshots, die du im DevEco-Simulator machst

Simulator: liteWearable, 454×454 (GT-Format). Vorher auf der VM bzw. bei dir im Repo:

```
cd watch-huawei && ./sim.sh an-ok sim-konfig.json
```

`an-ok` ist **neu** (04.11.): Die Attrappe der Wear Engine meldet dann wie die echte Code 207, das Senden gelingt
also. Mit `./sim.sh an` scheitert es wie bisher mit −2, dann kommt „open app on phone". `sim-konfig.json` liefert
Jans Datenseiten wie vom Handy. **Hinterher `./sim.sh aus`, nie im Zustand „an" committen oder für eine Uhr bauen.**

| # | Zustand | Wie |
|---|---|---|
| 1 | Startbildschirm mit START | App öffnen |
| 2 | Aufnahme läuft, Datenseite (Tempo, Puls, Zeit) | START, GPS-Fahrt aus `sim-fahrt.gpx` läuft |
| 3 | Zähler „n/m" mit Balken | mit `an-ok` während oder nach der Aufnahme, solange Teile laufen (die Uhr schreibt nur die Zahlen, kein „To phone") |
| 4 | „All sent" | mit `an-ok` nach STOP, wenn alles durch ist |
| 5 | „open app on phone" | `./sim.sh an` (ohne `-ok`), aufnehmen, STOP, ein paar Versuche abwarten |
| 6 | Einstellungen mit „Connect" / Kopplung | Einstellungsseite |

Dazu vom Handy:

| # | Zustand | Wo |
|---|---|---|
| 7 | Android-Karte „HUAWEI-Uhr (Beta)" | Einstellungen › Uhren. Die Karte erscheint nur mit Huawei Health; sonst den Bildschirm mit dem Hinweis nehmen. |
| 8 | Session am Handy bzw. im Web | eine beliebige eigene Session als Beispiel für das Ergebnis |

Bildunterschriften in der Excel kurz auf Englisch, z. B. „3 – watch sends the recording to the phone app (3 of 12
parts)". Was aus dem Simulator stammt, wie beim ersten Mal als „simulator" kennzeichnen.

## Bildunterschriften (fertig, 04.11. mit Jans Simulator-Bildern)

| Bild | Unterschrift (Englisch, so in die Excel) |
|---|---|
| 1 | 1 – Start screen of the watch app (simulator) |
| 2 | 2 – Recording: data page with heart rate and speed (simulator) |
| 2b | 2b – Recording: summary of the last run (simulator) |
| 3 | 3 – After the session: the watch sends the recording to the phone app, progress bar and part counter (simulator) |
| 4 | 4 – All data delivered to the phone app (Wear Engine code 207 for every part) (simulator) |
| 5 | 5 – Phone app not running: the watch keeps all data and asks the user to open the app on the phone (simulator) |
| 6 | 6 – Watch settings: alarm, thresholds, foil, data pages (simulator) |
| 7 | 7 – Phone app: linking the HUAWEI watch (Wear Engine authorisation, basic device information only) |
| 8 | 8 – Result: the uploaded session in the user's account |

## Was offen bleibt (nicht in den Antrag)

- **Bewegungssensor:** Ob GT/Fit Fremd-Apps überhaupt Beschleunigungsdaten geben, ist offen (docs/HUAWEI.md:
  Forenbericht zur GT 6, Simulator ohne Sensor). Ohne sie gibt es GPS und Puls ohne Pump-Erkennung. Das
  Diagramm sagt deshalb nur „motion", nicht „pump detection".
- **Lange Aufnahme bei dunklem Display:** nicht belegt.
- **Android-Brücke:** `HuaweiBruecke.kt` ist geschrieben und kompiliert, aber nie gegen eine echte Uhr gelaufen.
- **Rechtswischen beendet die App:** Im Lite-Simulator kommt das Wischen an (Log `wischen right`, 04.11.), und
  `app.terminate()` wird aufgerufen, aber die App bleibt offen. Vermutlich kann der Simulator nicht beenden; auf
  einer echten GT ungeprueft.
- **Tester ohne Store:** wie Tester eine Lite-App vor der Store-Freigabe bekommen, ist ungeklärt.
