# Zepp / Amazfit — Store-Konsole

Alles, was die Zepp-Konsole (`developer.zepp.com`, appId 1118995) an Bildern verlangt, liegt hier
zum direkten Hochladen. **Vorgaben:** https://docs.zepp.com/docs/distribute/#appic

> ⚠️ Der Link, den die Zepp-Ablehnungsmail vom 10.09.2026 nennt
> (`docs.zepp.com/docs/guides/app-development/app-submission/#preview-images`), ist **tot** — 404 im
> Browser wie per Abruf. Gültig ist der Pfad oben. Die neue Doku-Spiegelung wurde gegengeprüft und
> trägt **wortgleich** denselben Text; an der Spezifikation hat sich also nichts geändert.

| Konsolen-Feld | Datei hier | Vorgabe | gemessen |
|---|---|---|---|
| **App Icon** | `app-icon-240.png` | 240×240 PNG, kreisrund, **transparenter** Hintergrund, **kein** Rand | 240×240 RGBA, flach cyan `#22d3ee` (kein Verlauf), Kreis berührt alle vier Ränder (Alpha 255 an jeder Randmitte), Ecken transparent |
| **Screenshots runde Uhren** | `screenshots-rund/` (7×) | 360×360 PNG, transparenter Hintergrund, mittig, **kein** Rand | 360×360 RGBA, Inhalt 360×360 an (0,0) — Rand 0 auf allen Seiten |
| **Screenshots eckige Uhren** | `screenshots-eckig/` (7×) | 360×360 PNG, transparent, mittig, links/rechts **gleicher** Rand, oben/unten keiner | 360×360 RGBA, Inhalt **312**×360 an (24,0) — links 24, rechts **24**, oben/unten 0; Inhalt **durchgehend deckend**, **0** halbdurchsichtige Pixel; Verhältnis 0,86667 = genau 390:450 |

Quellen (hier nur Kopien, damit ein Feld einer Datei entspricht):
`brand/app-icons/zepp-240-round.png` und `screenshots/watch/zepp/store360/{rund,eckig}/`.

## Warum dieser Ordner existiert

Die Einreichung **1.0.7 wurde am 01.09.2026 abgelehnt**, Begründung wörtlich: „Please modify the
circular preview image and the square preview image", mit Verweis auf den Anker `#appic` — also den
App-Icon-Abschnitt. Die Bilder lagen bis dahin an drei verschiedenen Stellen im Repo und es gab
keinen Zepp-Ordner unter `brand/stores/`, obwohl es einen für apple/garmin/google/suunto gibt.
Beim Hochladen kann so leicht die falsche Datei in ein Feld geraten.

**Nachgemessen (01.09.):** alle Dateien hier erfüllen die Vorgaben, und **keine** der 14
Icon-Dateien im Repo hat einen Farbverlauf. Was in der Konsole angezeigt wurde, hatte einen —
kam also nicht aus dem Repo. Zwischen dem freigegebenen 1.0.6 (24.08.) und 1.0.7 wurde an den
Assets nichts geändert.

## 🔑 Ungeschriebene Regel: rund und eckig muessen INHALTLICH IDENTISCH sein

Dieselben Bildschirme, einmal rund und einmal eckig. **In der Zepp-Doku steht das nicht** — es kam
aus einer Ablehnung (Jan, vor dem 01.09.2026: „es wurde schonmal abgelehnt weil die nicht identisch
waren rund vs. eckig").

**Erledigt (01.09.):** die runde Reihe hatte **8** Dateien, die eckige **7** — der Ueberschuss war
aber keine fehlende Aufnahme, sondern ein **Duplikat**: `zepp-rund-06.png` war dasselbe Bild wie
`zepp-rund-01.png` (mittlere Pixel-Abweichung **0,02**; das naechstaehnlichste Paar der Reihe liegt
bei 4,71, also 200× weiter auseinander). Geloescht — jetzt **7 zu 7**.

Nachgeprueft ist auch die **Zuordnung ueber die Nummer**: rund-01…04 und rund-07 finden jeweils ihr
eckiges Gegenstueck mit derselben Nummer als aehnlichstes Bild. Deshalb wurde nach dem Loeschen
**NICHT umnummeriert** — die Luecke bei 06 ist gewollt, Umnummerieren wuerde die Paarung verschieben.
Die Konsole interessiert der Dateiname nicht.

**Beim naechsten Erweitern der Reihen:** jeder Bildschirm muss in BEIDEN Reihen vorkommen, und ein
zweites Bild desselben Bildschirms zaehlt nicht — beides pruefen, bevor hochgeladen wird.

**Seit 10.09. macht das der Generator selbst.** Das Loeschen von Hand war eine Falle: aus den acht
Rohbildern legte `scripts/zepp-store-previews.py` bei jedem Lauf wieder acht Dateien an, also auch
das Duplikat. Jetzt erkennt es doppelte Aufnahmen (mittlere Abweichung unter `DUPLIKAT_SCHWELLE`
= 1,0; gemessen 0,03 beim Duplikat gegen 4,32 beim naechstaehnlichsten echten Paar), ueberspringt
sie und **laesst die Nummer frei** — die Luecke bei 06 entsteht damit von selbst, statt jedes Mal
neu weggeraeumt zu werden.

## Drei Ablehnungen, drei Befunde

### 1. Ungerader Rand (behoben 01.09., Ursache erst 10.09. entfernt)

Die eckigen Screenshots hatten Inhalt **311**×360 und damit **links 24, rechts 25** Pixel Rand.
Die Vorgabe sagt ausdruecklich „an **equal** margins on the left and right". Mit 311 ist das
unmoeglich: 360 − 311 = 49 ist ungerade. Der Inhalt ist deshalb **312** breit (Rand 24/24).

**Das war am 01.09. aber nur von Hand geheilt.** Der Generator rechnete weiter
`round(776 · 360 / 898)` = **311** — ein Lauf haette den Regelbruch zurueckgeholt. Seit 10.09.
schnappt er den Zuschnitt vorher auf das **exakte Geraeteverhaeltnis 390:450** (das eckige Amazfit,
s. `watch-zepp/page/index.js:140` „die 390er ist die Ausnahme"), dann fallen 312 zwangslaeufig heraus.

**Und geheilt war nur EINE der beiden Ablagen.** Am 10.09. nachgemessen: `screenshots-eckig/` hier
hatte 312 (Rand 24/24), `screenshots/watch/zepp/store360/eckig/` aber weiterhin **311** (Rand 24/25)
— das Repo trug die kaputte und die reparierte Fassung gleichzeitig, obwohl oben steht „hier nur
Kopien". Wer aus dem falschen Ordner hochlaedt, reicht den Regelbruch ein. Jetzt sind alle sieben
Paare **byteweise identisch**, und weil beide Ablagen aus demselben Generatorlauf kommen, koennen
sie nur noch gemeinsam auseinanderlaufen. **Nach jedem Lauf die Kopie erneuern:**

    cp screenshots/watch/zepp/store360/eckig/*.png brand/stores/zepp/screenshots-eckig/

### 2. Die runden UNTEREN Ecken des Simulatorfensters (behoben 10.09.) — Ursache der 2. Ablehnung

**1.0.7 wurde am 10.09.2026 erneut abgelehnt**, diesmal nur noch das eckige Bild: „The square
preview image does not comply with regulations. Please carefully review the preview image
specifications and make adjustments as required for the format, size, aspect ratio, transparency
and corresponding device shape."

Nach dem Buchstaben der Vorgabe waren die Bilder in Ordnung — der Fehler steckte im **Alphakanal**.
Gemessen in jeder der sieben Dateien: genau **42 halbdurchsichtige Pixel**, und zwar ausschliesslich
in den **beiden UNTEREN Ecken**. Oben hart 255 (scharfe Ecke), unten eine weich ausgelaufene Rundung
ueber ~6 px, dazu Alpha ~44 vom **macOS-Fensterschatten**. Also eine Form mit scharfen oberen und
runden unteren Ecken — **so sieht kein Geraet aus**, und genau das trifft „corresponding device
shape".

Woher: die Rohbilder unter `screenshots/watch/zepp/raw/square/` sind Fenster-Mitschnitte
(1004×1180 RGBA, 355 674 halbdurchsichtige Pixel = Schatten). `rand_weg()` im Generator schneidet
nur Zeilen und Spalten weg, die **ueberwiegend hell** sind — eine runde Ecke ist das nicht, also
ueberlebte sie den Zuschnitt und wurde mit dem Alphakanal 1:1 durchkopiert.

**Behoben:** der eckige Satz wird jetzt als RGB zugeschnitten (der Alphakanal des Mitschnitts wird
verworfen) und das Alpha danach HART gesetzt — 255 im Inhalt, 0 aussen. Kein Schatten, keine
Rundung, keine Teildurchsichtigkeit. Nachgemessen: **0** halbdurchsichtige Pixel, Inhalt
durchgehend deckend. Der Generator prueft das selbst und bricht ab, wenn es nicht stimmt.

**Die runde Reihe blieb dabei byteweise unveraendert** (alle sieben Dateien, RGB- und
Alpha-Abweichung 0) — sie ist von Zepp inzwischen ja akzeptiert: in der zweiten Ablehnung wird sie
nicht mehr genannt, in der ersten („circular preview image") noch. Die Vermutung von damals, die
Haelfte der Ablehnung sei nicht durch Messung erklaerbar, ist damit erledigt.

Die runden Screenshots sind **einwandfrei**: echte Kreise (78,2 % Deckung der Box = π/4, also
Durchmesser genau 360), transparente Ecken, Rand 0 auf allen Seiten. Auch das App-Icon ist
regelkonform.

### 3. Die dritte Ablehnung (18.09.2026) — und warum Messen hier nicht mehr weiterhilft

**1.0.10 wurde am 18.09.2026 abgelehnt**, zum dritten Mal in Folge und zum dritten Mal **nur wegen
der eckigen Vorschaubilder**: „Update the preview images. Affected: square-screen preview 1, 2, 3,
4, 5, 6 and 7." Am **Paket** hat Zepp bis heute nichts beanstandet.

**Vorher nachgemessen (18.09., alle sieben Dateien):** 360×360 PNG · Inhalt 312×360 mittig ·
Rand links 24, rechts 24 · oben/unten 0 · Alpha ausschliesslich 0 oder 255, kein einziger
halbdurchsichtiger Pixel. Die Doku wurde am selben Tag erneut abgerufen und sagt woertlich, was
sie im September sagte: „The output size: 360×360px, format: PNG", „The background of screenshots
should be transparent and not have a fill color", und fuer eckige Geraete „in the middle of the
square transparent background, with an equal margins on the left and right, and no margins on the
top or bottom".

**Damit ist belegt: die geschriebene Regel ist nicht das, wonach geprueft wird.** Drei Ablehnungen
gegen einen Satz Bilder, der die Vorgabe Wort fuer Wort erfuellt — weiter nach dem Text zu bauen
heisst, ein viertes Mal zu raten.

**Was diese Mail zum ersten Mal mitbringt: KORRIGIERTE BEISPIELBILDER.** „A corrected example is
attached at the end of this message for reference … Please make sure the image you re-upload
matches it." Sieben Anhaenge, `PREVIEW IMAGE SQUARE SCREEN 1` bis `7`. Das ist die erste
nachmessbare Vorgabe, die es zu diesem Punkt je gab.

**➡️ Naechster Schritt: diese Anhaenge sichern** (nach `screenshots/watch/zepp/beispiel-zepp/`),
Leinwand, Inhaltsbox, Seitenverhaeltnis, Eckenradius und Alphakanal daran messen und den
Generator auf die gemessenen Werte stellen — nicht auf den Doku-Text. Ohne die Beispiele hat die
vierte Runde dieselbe Trefferwahrscheinlichkeit wie die ersten drei.

Der Link in der Mail (`…/app-development/app-submission/#preview-images`) ist weiterhin **tot**
(404, am 18.09. erneut geprueft).

**Punkt 3 der Mail** war nur eine Empfehlung — „We recommend adding a feedback email" — und ist
erledigt: `scripts/zepp-store-texte.py` haengt seit dem 18.09. an jeden Details-Text eine
Kontaktzeile mit `info@pumpfoil.org`, in allen 17 Sprachen. Der franzoesische Text stand bei
599 von 600 Zeichen und wurde dafuer gekuerzt; die Laengenpruefung laeuft gegen Text **plus**
Zeile.

### Zum Versions-Bump

**Das Zepp-Paket ist von keiner der drei Ablehnungen betroffen** — beanstandet wurden jedes Mal
nur die Bilder. Eine abgelehnte Fassung kann also mit korrigierten Bildern erneut eingereicht
werden, ohne dass am Code etwas passieren muss.

Stand 18.09.2026 gibt es trotzdem zwei Wege, und die Wahl gehoert Jan:

- **1.0.10 nochmal**, nur mit neuen Bildern. Das Paket ist gebaut und geprueft (Jans
  Emulatorlauf vom 13.09., ~2,5 Stunden), es kaeme ohne weiteren Aufwand zurueck ins Review.
- **1.0.11 stattdessen** (`app.json` steht schon auf 1.0.11/code 14). Sie traegt den Inhalt von
  1.0.10 **plus** Puls-Alarm, Vibrationsmuster, Wiederholung, Aufzeichnungsmodus und die
  Sperr-Anzeige. Dafuer ist sie noch nie auf einer Uhr gelaufen und braucht denselben langen
  Testlauf. Da eine Zepp-Runde Wochen dauert, spart dieser Weg im Erfolgsfall eine ganze Runde.

## ⚠️ Falle im Generator

`brand/master/build.sh` erzeugt das **Uhr**-Icon so:

    G --type icon --theme light --size 248 --pad 0 --bg cyan --out watch-zepp/assets/common.r/icon.png

Das ergibt eine **deckende 248×248-Kachel** — kein transparenter Kreis. Die eingecheckte Datei ist
aber 124×124 mit transparenten Ecken, die Zeile ist also veraltet. Wer `build.sh` laufen lässt,
überschreibt das Uhr-Icon mit genau der Art Bild, die Zepp ablehnt. **Vor einem Lauf prüfen.**
(Das Uhr-Icon aus dem Paket ist nicht dasselbe wie das Store-Icon hier — 124 gegen 240.)
