# Kwai (Brasilien) — Stand und Vorbereitetes

Kwai ist die kurze-Videos-App von Kuaishou und in Brasilien sehr gross: rund **60 Mio.
monatlich aktive Nutzer**, gut 75 Minuten am Tag. Anlass war die Frage, ob wir dort die
juengere Zielgruppe erreichen, die auf Facebook fehlt.

**Stand 07.09.2026: gescheitert am Regionsblock. App laeuft, Konto per Google-Login
angelegt — aber der Kwai-Server antwortet aus Deutschland nicht.** Liegt auf Eis, bis ein
VPN mit brasilianischem Ausgang oder eine brasilianische eSIM ausprobiert ist.

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
