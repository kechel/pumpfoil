# Kwai (Brasilien) — Stand und Vorbereitetes

Kwai ist die kurze-Videos-App von Kuaishou und in Brasilien sehr gross: rund **60 Mio.
monatlich aktive Nutzer**, gut 75 Minuten am Tag. Anlass war die Frage, ob wir dort die
juengere Zielgruppe erreichen, die auf Facebook fehlt.

**Stand 07.09.2026: recherchiert und vorbereitet, kein Konto, nichts im Studio gebaut.**

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

## Weg ins Konto

Da die App hier nicht im Store liegt, bleibt der **APK-Weg** auf einem Android-Geraet oder
im Emulator (Android Studio ist ohnehin da). Danach Konto in der App anlegen. Offen und
erst am lebenden Objekt zu klaeren:

- ob Kwai die Anmeldung oder die Inhalte nach IP einschraenkt (deutsche IP, brasilianisches
  Publikum),
- ob eine Telefonnummer verlangt wird und ob eine deutsche akzeptiert wird,
- welche Bildmasse Profilbild und Titelbild wirklich haben (deshalb liegen sie quadratisch
  mit Schutzzone bereit, siehe unten).

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
