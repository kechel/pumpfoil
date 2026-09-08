# Kwai (Brasilien) — Stand und Vorbereitetes

Kwai ist die kurze-Videos-App von Kuaishou und in Brasilien sehr gross: rund **60 Mio.
monatlich aktive Nutzer**, gut 75 Minuten am Tag. Anlass war die Frage, ob wir dort die
juengere Zielgruppe erreichen, die auf Facebook fehlt.

**Stand 08.09.2026: `kwai.com` ist ueber das Opera-VPN erreichbar, die Google-Anmeldung
ging durch.** Der Ausgang liegt in **Schweden** (77.111.247.35 und 2001:67c:2660::/48,
beide HERNLABS/OPERA — Operas eigene Infrastruktur; IPv4 und IPv6 tunneln, kein Leck).

**Der Block haengt an der IP — kontrolliert.** Jan hat `kwai.com` am 07.09. ohne VPN aus
Deutschland auf viele Arten probiert, nichts ging; mit VPN am 08.09. beim ersten Versuch.
Damit ist es nicht der Browser, nicht das Konto und nicht das Geraet, sondern die Herkunft
der Verbindung.

## Wem gehoert Kwai

Kwai ist die internationale Fassung von **Kuaishou (快手)**, einem chinesischen Konzern aus
**Peking**, boersennotiert in Hongkong. Die App im Store gehoert der Singapur-Gesellschaft
**JOYO TECHNOLOGY PTE. LTD.** — dieselbe Konstruktion wie bei ByteDance/TikTok: chinesische
Mutter, Auslandsgesellschaft fuer die internationale App. Die chinesische Fassung (快手,
`com.jiangjia.gif`) steht unter „Beijing Kwai Technology Co." und ist eine andere App.

Fuer uns heisst das dieselbe Abwaegung wie bei TikTok, wo wir schon veroeffentlichen: wir
geben Videos und Kanaldaten heraus, keine Nutzerdaten. Die harte Regel gilt weiter —
**auf pumpfoil.org selbst kommt kein Dritt-Skript, kein Tracking, kein eingebetteter
Player von dort.** Der Kanal ist eine Einbahnstrasse nach draussen.

## Was die Recherche ergeben hat

| Frage | Antwort |
|---|---|
| Groesse in Brasilien | ~60 Mio. MAU, >75 min/Tag |
| Alter | **77 % sind 25+** — laut Kwais eigenen Werbeunterlagen. Kwai ist dort keine Jugend-App, sondern eine Massen-App. |
| Schnittstelle zum Veroeffentlichen | **Gibt es nicht.** Kwais Open Platform ist OpenID-Connect-Login und Werbe-APIs; die GitHub-Organisation `kwai-apis` enthaelt einen Login-Client und sonst nichts. Kein Drittanbieter-Planer unterstuetzt Kwai. |
| Hochladen vom Rechner | Kein offizieller Weg. Die brasilianischen Anleitungen zu „postar pelo PC" laufen alle ueber einen Android-Emulator. kwai.com ist zum Schauen da, die Seite fuehrt zum App-Download. |
| App in Deutschland | **Nicht verfuegbar.** `com.kwai.intl` liegt im App Store von US und BR, nicht in DE, AT, CH, PT, ES, GB (geprueft ueber die iTunes-Lookup-API, 07.09.). Im Play Store dasselbe Bild. |
| Warum kein Europa | Kuaishou hat im **Oktober 2021** von Expansion auf Kontraktion umgestellt und die Auslandsgeschaefte auf Lateinamerika und Suedostasien gebuendelt (Brasilien und Indonesien als Prioritaeten, spaeter MENA). Europa war nie Zielmarkt. Dazu kommt, dass ihr Wachstumsmotor — „Bônus Diário", Geld fuers Ansehen — in der EU verbraucherrechtlich heikel waere. |
| Nach der Installation | **Serverseitiger Regionsblock:** „our server is unavailable in your region". Google-Login ging durch, SMS und E-Mail-Registrierung nicht. Der Block sitzt also nicht nur im Store. |

## Weg ins Konto — wie weit wir gekommen sind

Der **APK-Weg** funktioniert. Auf dem Pixel 7a eingespielt (07.09.), und dabei gelernt:

- **APKMirror statt eines Einzel-APK.** Beide Downloads trugen dieselbe Signatur
  (`bb8d2610…e81047`, `CN=kwai-video, O=kwai, L=Beijing`), aber nur das APKMirror-Buendel
  hat zusaetzlich den **Google Source Stamp** — den Nachweis, dass die Datei aus dem Play
  Store stammt. Ausserdem 70 statt 189 MB, weil nur die passende Architektur drin ist.
- **Ein `.apkm` ist kein APK**, sondern ein Zip mit 22 Teilen. Antippen schlaegt fehl; es
  braucht `adb install-multiple` mit den zum Geraet passenden Teilen (arm64-v8a + xxhdpi).
- Der Verbindungsport beim drahtlosen Debugging ist ein **anderer als der Kopplungsport** —
  `adb mdns services` zeigt ihn.

**Danach ist Schluss:** die App startet, Google-Login geht, aber der Server antwortet nicht
(„our server is unavailable in your region"). SMS kam nie an, E-Mail-Registrierung gibt es
nicht. Der Block ist serverseitig, nicht im Store.

Bleibt ein **VPN mit brasilianischem Ausgang** (dann durchgehend, „Always-on VPN" plus
„Verbindungen ohne VPN blockieren", und immer derselbe Standort — Kwais Betrugserkennung ist
wegen des Bonus-Modells scharf) oder, vermutlich besser, eine **brasilianische eSIM**: echte
Mobilfunk-IP statt Rechenzentrum, und je nach Tarif gleich eine Nummer fuer die SMS.

### Der Web-Zugang loest das Hochladen nicht

Am 08.09. per Opera-VPN auf `kwai.com` angemeldet. Das beweist den IP-Block — aber
**kwai.com ist eine Schau-Seite, keine Studio-Oberflaeche.** Es gibt dort keinen
Hochlade-Weg; saemtliche brasilianischen Anleitungen zu „postar pelo PC" laufen bis heute
ueber einen Android-Emulator. Anders als bei RedNote, wo `creator.rednote.com` den Upload
im Browser erlaubt, gibt es bei Kwai kein Gegenstueck.

Der Wert des Web-Logins ist deshalb: **Beweis, dass es nur die IP ist**, und ein Blick auf
den Kanal von aussen. Hochgeladen wird aus der App.

### Also Emulator auf dem Mac — und der ist schon da

Vom Handy hochzuladen kommt fuer die Studio-Ausgaben nicht in Frage, und genau deshalb
laufen ja auch alle brasilianischen „postar pelo PC"-Anleitungen ueber einen Emulator.
Auf dem Mac ist die Ausstattung bereits vollstaendig (geprueft 08.09.):

| | |
|---|---|
| Android Studio | installiert, SDK unter `~/Library/Android/sdk` |
| AVD | **Pixel_9_Pro_XL**, 10 GB Datenpartition |
| System-Image | `android-37.0/google_apis_playstore_ps16k/**arm64-v8a**` |
| adb | `~/Library/Android/sdk/platform-tools/adb`, im PATH |

Das Image ist arm64 (laeuft nativ auf Apple Silicon, kein Emulieren fremder Befehle) **und
hat den Play Store** — beides genau das, was die Kwai-App braucht, weil ihr Google-Login
ohne Play-Dienste nicht funktioniert. Die APK-Teile sind dieselben wie beim Pixel 7a
(arm64-v8a), der Weg ueber `adb install-multiple` gilt unveraendert.

**Zwei Dinge fehlen noch:**

1. **Ein systemweites VPN auf dem Mac mit Ausgang in Brasilien.** Operas VPN ist ein
   Browser-Proxy — der Emulator geht daran vorbei und meldet sich mit der deutschen IP,
   also genau der, die gesperrt ist. Es braucht einen VPN-Dienst mit echtem Systemtunnel
   und BR-Standort.
2. **Die APK-Datei.** Das APKMirror-Buendel von damals liegt nicht mehr auf der Platte.

Dazu: **Locale und Zeitzone im Emulator auf pt-BR / America/Sao_Paulo** stellen. Kwai
verteilt nach Region; ein Geraet, das sich als deutsch meldet, waehrend die IP
brasilianisch ist, ist genau die Art Widerspruch, die der Betrugserkennung auffaellt.

⚠️ **Platz:** auf `/` sind nur noch 12 GB frei (98 % belegt). Eine laufende AVD will davon
einen guten Teil. Vor dem Start also erst die 7,8 GB aus `shorts-mit-musik/youtube/` auf
die externe Platte.

### Zwei Dinge, die beim VPN zaehlen

- **Welcher Ausgang.** Opera bietet nur „Europa / Amerika / Asien", kein Land — gemessen
  kommt „Europa" in **Schweden** heraus. Fuer einen Kanal, der auf Brasilien zielt, ist das
  das falsche Land: Kwai verteilt stark nach Region, ein Konto mit schwedischer IP und
  portugiesischen Texten passt in kein Publikum. Opera reicht also zum Nachsehen, nicht
  zum Betreiben — dafuer braucht es einen Ausgang in **Brasilien**.
- **Immer derselbe.** Kwais Betrugserkennung ist wegen des Bonus-Modells scharf. Heute USA,
  morgen Brasilien, uebermorgen eine deutsche Mobilfunk-IP ist genau das Muster, das dort
  auffaellt. Besser einmal festlegen und dabei bleiben — was wiederum fuer die eSIM
  spricht, sobald es ernst wird.

## Was fertig bereitliegt

| Datei | Zweck |
|---|---|
| `brand/social/kanal-avatar-1024.png` | Profilbild, Wellen mittig auf Navy — haelt auch als Kreis |
| `brand/social/kanal-cover-1600.png` | Titelbild, quadratisch mit Schutzzone: das Lockup ueberlebt jeden Zuschnitt bis hinunter zu 9:16 |
| `brand/master/kanal-profil.py` | Generator fuer beide, laeuft ohne cairosvg auch auf dem Mac |
| `brand/social/kanal-beschreibung-pt-BR-brasilianisch.txt` | Kanalbeschreibung in **brasilianischem** Portugiesisch (960 Zeichen) |

Die vorhandene `kanal-beschreibung-pt-portugiesisch.txt` ist **europaeisches** Portugiesisch
(„o teu relógio", „telemóvel", „planeios") und liest sich in Brasilien fremd. Fuer alles
Brasilianische die pt-BR-Fassung nehmen.

### Kurzprofil

- **Name:** pumpfoil.org
- **Handle:** `pumpfoil` (falls belegt: `pumpfoilorg`)
- **Bio kurz:** `Pumpfoil no seu relógio. App grátis + comunidade. pumpfoil.org`
- **Bio mittel:**
  `Transforme seu relógio esportivo num computador de pumpfoil.`
  `Garmin · Apple Watch · Wear OS · Amazfit · Polar · Suunto · COROS · Xiaomi`
  `App grátis, código aberto. pumpfoil.org`

### Bildunterschrift je Video

Kurz halten, Frage am Ende — das treibt Kommentare, und Kommentare treiben die
Ausspielung. Muster:

```
<was im Video passiert, ein Satz>. E você, já tentou?

#pumpfoil #foil #wingfoil #kitefoil #esportesaquaticos #brasil
```

Beispiele, passend zu dem, was auf Facebook gezuendet hat (Anfaenger, Lernen, Fortschritt):

- `Primeira sessão dele. Olha o que acontece no final. E você, já tentou?`
- `Dockstart: 20 tentativas até sair. Esta é a número 21.`
- `Sem vento, sem onda, sem barco — só pumpar. Alguém aí de Floripa?`

## Was das Studio kann

**Kein eigener Render.** Die TikTok-Fassung ist 9:16, hat O-Ton und keine lizenzierte
Musik — genau richtig fuer eine Plattform, deren Musikrechte wir nicht kennen. Ein
zweiter Durchlauf haette 24 MB und eine Minute gekostet, um ein Symbol im Outro zu
tauschen. Also: **fuer Kwai die TikTok-Datei nehmen.**

- **Caption auf brasilianischem Portugiesisch.** Der Texte-Tab erzeugt neben Instagram
  und TikTok jetzt ein Feld `kwai`: ein bis zwei Saetze, Frage ans Publikum, dann
  Hashtags. Als einziges Caption-Feld nicht englisch — Kwai laeuft praktisch nur in
  Brasilien. Sportbegriffe bleiben englisch, so heissen sie dort auch. Beispiel:

  > Charly caiu três vezes e voltou pro píer três vezes — na quarta o foil segurou e ele
  > saiu deslizando. 💦 Quantas tentativas você levou pra acertar seu primeiro dockstart?

  Aeltere Cache-Eintraege haben das Feld nicht; dort einmal „Neu generieren" druecken.
**Keine Buchfuehrung je Video.** Ein Haken „schon gepostet" waere zusaetzliche Arbeit, kein
gesparte — genau wie bei bilibili, das seit dem Start 1:1 mit YouTube, Instagram und TikTok
mitlaeuft, ohne dass irgendwo etwas eingetragen wird. Zahlen kommen spaeter im Block, indem
Jan die Content-Liste aus der App hereinkopiert; ausgewertet wird sie dann wie die Facebook
Content Library.

Ablauf je Video: rendern wie immer → im Texte-Tab die Kwai-Caption kopieren → „Im Finder
zeigen", die **TikTok**-Datei aufs Handy → in der Kwai-App hochladen. Fertig.

## Erwartung, ehrlich

Kwai bringt **Volumen, nicht Jugend**: 77 % sind 25+. Wer wirklich jung ist, sitzt auf
TikTok — dort laufen 146 Beitraege mit zusammen 61.000 Aufrufen, ein Dreissigstel von
Facebook. Der Engpass ist also eher der Inhalt als die Zahl der Kanaele.

Sinnvolle Reihenfolge, wenn das Konto steht:

1. Vier Wochen lang die vorhandenen **TikTok-Exporte** zusaetzlich hochladen — die sind
   9:16 mit O-Ton und ohne lizenzierte Musik, also genau richtig fuer eine Plattform,
   deren Musikrechte wir nicht kennen. Kein neuer Render noetig.
2. Zeigt das Zahlen, kommt Kwai als Ziel ins Studio: eigener Dateiname, eigene
   Outro-Icons, Buchfuehrung im Upload-Tab. Der TikTok-Render wird wiederverwendet, die
   teure Renderkette faellt also weg (1–2 h Arbeit).
3. Kennzahlen erst danach, und dann wie bei der Facebook Content Library ueber die
   gespeicherte Seite — eine API gibt es auch dafuer nicht.
