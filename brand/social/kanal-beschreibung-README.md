# Kanalbeschreibungen (Social Media)

Eine Datei je Sprache, benannt `kanal-beschreibung-<kürzel>-<name>.txt`. Inhalt ist zum
**direkten Einfügen** gedacht — kein Vorspann, keine Metazeilen.

**Zeichengrenze 1000** (YouTube-Formular „Übersetzung für deinen Kanalnamen und die
Beschreibung"). Alle Fassungen liegen darunter; die knappsten sind Deutsch (998),
Italienisch (998) und Französisch (993). **Wer hier etwas ergänzt, muss vorher zählen** —
Französisch und Deutsch reißen die Grenze als Erste.

| Kürzel | Datei | Zeichen |
|---|---|---|
| de | deutsch | 998 |
| de-AT | deutsch-oesterreich | 997 |
| gsw | schweizerdeutsch | 975 |
| en | englisch | 986 |
| fr | franzoesisch | 993 |
| it | italienisch | 998 |
| es | spanisch | 975 |
| nl | niederlaendisch | 948 |
| fi | finnisch | 961 |
| cs | tschechisch | 905 |
| pl | polnisch | 962 |
| pt | portugiesisch | 959 |
| nb | norwegisch | 924 |
| ru | russisch | 933 |
| id | indonesisch | 971 |
| ja | japanisch | 527 |
| zh | chinesisch | 417 |

**Auf YouTube fehlten am 04.09. zwei Sprachen**, die die App längst kann: **Polnisch** und
**Norwegisch**. Schweizerdeutsch bietet YouTube nicht an — die Fassung liegt für andere Kanäle
(Instagram, Website) trotzdem bei.

**Inhaltlich gleich aufgebaut in allen Sprachen:** Kopfzeile · Was die App macht · Plattformen
(Uhren-Apps + Konto-Verknüpfungen) · fünf Punkte „Was du bekommst" · Community · Open Source ·
Links. Kommt eine Plattform dazu, ist es **eine Zeile in jeder Datei** — dieselbe Stelle, gleiche
Reihenfolge wie in `brand/master/banner.py` (SUBLINE) und in der Uhren-Tabelle der PWA.

## Chinesisch weicht ABSICHTLICH ab

`kanal-beschreibung-zh-chinesisch.txt` ist **nicht** die wortgleiche Übersetzung der anderen,
und das soll auch so bleiben. Wer sie „vereinheitlicht", macht sie falsch:

- **Xiaomi steht nur dort nicht drin.** Unsere Anbindung läuft über Mi Fitness → Suunto, und
  dazu sagt unsere eigene App-Doku (`web/src/i18n/locales/en.ts`, `linked.xiaomi.note`):
  *„Xiaomi offers this connection worldwide except in China."* In allen anderen 16 Sprachen
  ist Xiaomi richtig — in der chinesischen wäre es ein Versprechen, das beim ersten Versuch
  bricht, vor dem Publikum, das die Marke am besten kennt.
- **Wear OS fehlt**, weil Google in China gesperrt ist und die Zeile dort niemanden erreicht.
- **COROS (高驰) steht weiter vorn**, es ist eine chinesische Marke und dort bekannt.
- **Die Chatgruppen je Spot sind rausgenommen.** Push läuft über Web Push (`pywebpush`,
  VAPID); bei Chrome-basierten Browsern über Googles Infrastruktur, in China gesperrt. Ein
  Chat, dessen Benachrichtigungen nie ankommen, sollte man nicht bewerben. Der
  Community-Absatz nennt dort nur noch Vergleichen und Ranglisten.

Marken zusätzlich mit chinesischem Namen: Garmin（佳明）, Amazfit（华米）, COROS（高驰） —
danach wird dort gesucht.

## Bilder daneben

`brand/master/banner.py` (YouTube-Banner 2560×1440) und `brand/master/endcard.py`
(Shorts-Endcard 1080×1920, hell und dunkel) erzeugen ihre Bilder aus derselben
Plattform-Liste (`banner.SUBLINE`) und mit derselben Proportion (`banner.SUB_BREITE`) —
die Liste steht bewusst eine Spur schmaler als das Lockup, sonst wirkt sie größer als die
Tagline. Beide Skripte laufen auf der Dev-VM (`python3 banner.py`, `python3 endcard.py`);
`python3-cairosvg` ist dort installiert. **Hochladen bleibt Handarbeit.**

