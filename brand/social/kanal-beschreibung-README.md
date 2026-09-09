# Kanalbeschreibungen (Social Media)

Eine Datei je Sprache, benannt `kanal-beschreibung-<kürzel>-<name>.txt`. Inhalt ist zum
**direkten Einfügen** gedacht — kein Vorspann, keine Metazeilen.

**Zeichengrenze 1000** (YouTube-Formular „Übersetzung für deinen Kanalnamen und die
Beschreibung"). Alle Fassungen liegen darunter; die knappsten sind Deutsch (997),
Italienisch (997) und Französisch (992). **Wer hier etwas ergänzt, muss vorher zählen** —
Französisch, Deutsch und Italienisch reißen die Grenze als Erste.

| Kürzel | Datei | YouTube-Code | Zeichen |
|---|---|---|---|
| de | deutsch | de (Haupttext) | 997 |
| de-AT | deutsch-oesterreich | — | 996 |
| gsw | schweizerdeutsch | — | 974 |
| en | englisch | en | 985 |
| fr | franzoesisch | fr | 992 |
| it | italienisch | it | 997 |
| es | spanisch | es | 974 |
| nl | niederlaendisch | nl | 947 |
| fi | finnisch | fi | 960 |
| cs | tschechisch | cs | 904 |
| pl | polnisch | pl | 961 |
| pt | portugiesisch (**europäisch**) | pt-PT | 958 |
| pt-BR | pt-BR-brasilianisch | pt | 960 |
| nb | norwegisch | no | 923 |
| ru | russisch | ru | 932 |
| id | indonesisch | id | 970 |
| ja | japanisch | ja | 526 |
| zh | chinesisch | zh-CN | 454 |
| ar | arabisch | ar | 925 |
| th | thai | th | 912 |
| tr | tuerkisch | tr | 989 |
| vi | vietnamesisch | vi | 988 |

**Auf YouTube fehlten am 04.09. zwei Sprachen**, die die App längst kann: **Polnisch** und
**Norwegisch**. Schweizerdeutsch und Österreichisch bietet YouTube nicht an — die Fassungen
liegen für andere Kanäle (Instagram, Website) trotzdem bei.

**Seit 09.09. sind alle 20 YouTube-Sprachen gesetzt.** Dazugekommen sind **Arabisch, Thai,
Türkisch und Vietnamesisch** — die vier hatten die Videobeschreibungen längst
(`social-media/scripts/yt-boilerplate.json`), nur der Kanal nicht. Die Dateien hier sind
wörtlich der Standardblock aus dem Boilerplate.

## Gesetzt wird mit `social-media/scripts/yt-kanal-localize.py`

    python3 yt-kanal-localize.py                 # zeigen: was liegt an, was fehlt
    python3 yt-kanal-localize.py --push ar th    # genannte Sprachen schreiben
    python3 yt-kanal-localize.py --push --alle   # alle Dateien schreiben

Ohne `--push` ändert es nichts. Vor jedem Schreiben legt es den kompletten Ist-Stand als
`social-media/.yt-kanal-localizations-<zeitstempel>.json` ab. Die Zuordnung Datei →
YouTube-Code steht in `CODES` im Skript und in der Tabelle oben; vorhandene Sprachen werden
unter ihrem bestehenden Locale-Schlüssel aktualisiert, damit nicht `de` **und** `de_DE`
nebeneinander stehen.

## Die Standardsprache hat keine Übersetzung — sie ist der Haupttext

Am 09.09. gingen 20 Sprachen in einem PUT raus, 19 kamen richtig an, **Deutsch blieb auf dem
alten Stand** — ohne Fehlermeldung. Grund: `de` ist die Standardsprache des Kanals
(`snippet.defaultLanguage`), und ihr Eintrag unter `localizations` ist nur ein **Spiegel** von
`brandingSettings.channel.description`. Ein Schreibzugriff darauf wird stillschweigend
verworfen. Die Standardsprache muss über `channels?part=brandingSettings` gesetzt werden —
mit dem **kompletten** `brandingSettings`-Objekt, sonst fallen `keywords`, `country` und
`defaultLanguage` weg. Das Skript macht beides automatisch und zeigt Deutsch in der Übersicht
als `haupt` statt `live`.

**Nebenbefund derselben Runde:** der chinesische Kanaltext auf YouTube war noch die Fassung
**ohne** die chinesischen Markennamen — Commit 030c6bf5 („die erfundenen Begriffe 泵翼 & Co.
korrigieren") war nie hochgeladen worden. Mit `--alle` ist er jetzt gleichgezogen. Wer eine
Datei hier ändert, muss sie auch pushen; das Repo ist nicht die Live-Fassung.

## „in 18 Sprachen" — die Zahl steht in jeder Datei

Die Zeile unter „Open Source" nennt die Zahl der **PWA-Sprachen** (`LANGS` in
`web/src/i18n/index.tsx`), nicht die der Kanalübersetzungen. Mit `pt-PT` sind es seit 08.09.
**18**; am 09.09. in allen Kanaldateien **und** in `yt-boilerplate.json` nachgezogen.
Arabisch schreibt sie aus: `بثماني عشرة لغة`. **Kommt eine PWA-Sprache dazu, ist das eine
Zeile in jeder Datei** — und die Videobeschreibungen ziehen erst beim nächsten kompletten
`yt-batch-localize.py`-Lauf nach (~8.800 Quota-Einheiten für 172 Videos, passt an einem Tag).

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
`social-media/BRASILIEN.md`).

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

**Portugal ist am 08.09. dazugekommen** — `pt_PT` mit
`kanal-beschreibung-pt-portugiesisch.txt` (958 Zeichen). Der Kanal hat damit beide
Fassungen: `pt_BR` brasilianisch, `pt_PT` europaeisch.

Nach Zahlen war das nicht noetig (Portugal: 2 Instagram-Follower, auf Facebook null) — es
kostete aber nur einen Aufruf, weil die Datei schon dalag, und ein Portugiese bekommt jetzt
Portugal-Portugiesisch statt der brasilianischen Fassung.

**Die Videotexte haben `pt-PT` seit 09.09.** — Jan wollte die Vollfassung („wir sind im
exponentiellen Wachstum, wir nehmen keine Abkuerzungen"). 172 Videos, 20 Sprachen je Video;
eines faellt raus (A/B-Titeltest, `UPDATE_TITLE_NOT_ALLOWED_DURING_TEST_AND_COMPARE`).

**Schreibweise beachten:** Kanaluebersetzungen nutzen Locale-Codes mit Unterstrich
(`pt_BR`, `pt_PT`, `zh_CN`), Video-Lokalisierungen dagegen Sprachcodes mit Bindestrich
(`pt`, `pt-BR`, `zh-CN`). Zwei verschiedene Konventionen in derselben API.
