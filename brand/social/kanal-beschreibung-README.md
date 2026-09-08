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
| pt | portugiesisch (**europäisch**) | 959 |
| pt-BR | pt-BR-brasilianisch | 960 |
| nb | norwegisch | 924 |
| ru | russisch | 933 |
| id | indonesisch | 971 |
| ja | japanisch | 527 |
| zh | chinesisch | 454 |

**Auf YouTube fehlten am 04.09. zwei Sprachen**, die die App längst kann: **Polnisch** und
**Norwegisch**. Schweizerdeutsch bietet YouTube nicht an — die Fassung liegt für andere Kanäle
(Instagram, Website) trotzdem bei.

**Inhaltlich gleich aufgebaut in allen Sprachen:** Kopfzeile · Was die App macht · Plattformen
(Uhren-Apps + Konto-Verknüpfungen) · fünf Punkte „Was du bekommst" · Community · Open Source ·
Links. Kommt eine Plattform dazu, ist es **eine Zeile in jeder Datei** — dieselbe Stelle, gleiche
Reihenfolge wie in `brand/master/banner.py` (SUBLINE) und in der Uhren-Tabelle der PWA.

## Chinesisch: diese Datei ist fuer YOUTUBE, nicht fuer Festlandchina

Wichtig, weil hier schon einmal falsch korrigiert wurde: `kanal-beschreibung-zh-chinesisch.txt`
geht als `zh-CN` in die **YouTube**-Kanaluebersetzung. YouTube ist in Festlandchina gesperrt —
gelesen wird das also von Simplified-Chinese-Sprechern **ausserhalb**: Singapur, Malaysia,
Diaspora. Fuer die gilt dasselbe wie fuer alle anderen Sprachen:

- **Xiaomi gehoert hier hinein.** Die Anbindung ueber Mi Fitness → Suunto funktioniert
  weltweit, nur nicht in Festlandchina — und Festlandchina liest diese Datei nicht.
- **Wear OS gehoert hier hinein**, Google ist ausserhalb des Festlands erreichbar.
- **Die Chatgruppen je Spot gehoeren hier hinein**, Web Push kommt dort an.

Die China-spezifischen Einschraenkungen (kein Xiaomi, kein Wear OS, keine Chatgruppen
bewerben) gelten **nur fuer RedNote** — dort sitzt das Publikum tatsaechlich im Festland.
Diese Texte stehen in `social-media/REDNOTE.md` und in `rednote_text()` in
`social-media/scripts/shorts-musik.py`, nicht hier.

Die chinesischen Markennamen — Garmin（佳明）, Amazfit（华米）, COROS（高驰） — stehen
dagegen ueberall richtig: danach wird auf Chinesisch gesucht, egal wo jemand sitzt.

## Bilder daneben

`brand/master/banner.py` (YouTube-Banner 2560×1440) und `brand/master/endcard.py`
(Shorts-Endcard 1080×1920, hell und dunkel) erzeugen ihre Bilder aus derselben
Plattform-Liste (`banner.SUBLINE`) und mit derselben Proportion (`banner.SUB_BREITE`) —
die Liste steht bewusst eine Spur schmaler als das Lockup, sonst wirkt sie größer als die
Tagline. Beide Skripte laufen auf der Dev-VM (`python3 banner.py`, `python3 endcard.py`);
`python3-cairosvg` ist dort installiert. **Hochladen bleibt Handarbeit.**


## Portugiesisch: zwei Fassungen — und YouTube meint mit `pt` das brasilianische

Hier lag am 08.09. ein Fehler, der genau in die falsche Richtung wirkte.

**Was YouTube kennt** (`i18nLanguages`, 83 Sprachen, abgefragt 08.09.): **`pt`
(„Portugiesisch")** und **`pt-PT` („Portugiesisch (Portugal)")**. Ein `pt-BR` steht **nicht**
in der Liste — bei YouTube ist `pt` die brasilianische Vorgabe und `pt-PT` die Abweichung,
dieselbe Logik wie bei `zh-CN` gegen `zh-TW`.

**Der Fehler:** die Kanaluebersetzung lag unter dem Schluessel `pt_BR` — trug aber den
**europaeischen** Text (`Transforma o teu relógio desportivo`, `telemóvel`, `planeios`). Wer
aus Brasilien von einem Video aufs Profil klickte, bekam also Portugal-Portugiesisch. Und
Brasilien ist mit **30,3 % unser groesstes Land auf Facebook** (siehe
`social-media/KWAI.md`).

**Getauscht am 08.09.** gegen `kanal-beschreibung-pt-BR-brasilianisch.txt`
(`Transforme seu relógio esportivo`, `celular`, `glides`). Die anderen 14 Sprachen blieben
unberuehrt, Sicherung unter
`social-media/.yt-kanal-localizations-vor-ptBR-20260908-202648.json`.

Achtung bei der Rueckfrage direkt nach dem PUT: YouTube liefert dort noch kurz den alten
Stand aus. Eine zweite Abfrage ein paar Sekunden spaeter zeigt das Richtige.

**Die Videotexte waren nie betroffen.** `scripts/yt-add-language.py` uebersetzt `pt` laut
seiner eigenen `NAMES`-Tabelle als „brasilianisches Portugiesisch", und die Stichprobe ueber
241 Videotexte bestaetigt es: *você* (6), *a gente* (9), *cara* (11), *celular* (2) gegen
ganze fuenf europaeische Ausreisser. An den Videos haengen ausserdem `pt` **und** `pt-BR`
mit identischem Text — doppelt gemoppelt, aber nicht falsch.

**Wenn Portugal je drankommt:** die europaeische Fassung liegt fertig unter
`kanal-beschreibung-pt-portugiesisch.txt` und gehoert dann als **`pt-PT`** hinein, nicht als
`pt`.
