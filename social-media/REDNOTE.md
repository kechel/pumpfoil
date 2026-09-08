# RedNote / Xiaohongshu (小红书)

Chinesische Plattform aus Shanghai, ~350–400 Mio. monatlich aktive Nutzer. Anders als bei
Kwai gibt es hier **keine Huerde**: die App liegt im deutschen Store (`com.xingin.discover`,
in DE/AT/CH als 小红书, in US/BR/GB als „rednote"), Anmeldung per Google ging, und
**creator.rednote.com** erlaubt den Upload im Browser — kein Handy noetig.

**Stand 07.09.2026: Kanal steht, fuenf Beitraege online (152, 132, 160, 163, 131).**

## Was die Plattform anders macht

Entdeckt wird ueber die **Suche**, nicht nur ueber einen Feed. Leute tippen 无动力水翼板 ein
und finden auch alte Beitraege. Folgen daraus:

- Titel und Schlagworte wiegen mehr als anderswo, Beitraege veralten kaum.
- Die wichtigste Aktion ist **收藏 (Speichern)**, nicht das Herz — Speicherungen treiben die
  Langzeit-Reichweite.
- Publikum: ~70 % weiblich, ~65 % zwischen 18 und 28, grosse Staedte. Lifestyle, Reisen,
  Ausruestung, „涨知识" (man lernt was) und 治愈系 (heilsam/schoen) sind die Rubriken, in die
  unser Material passt.

## Konto

- **Name:** `Pumpfoil｜无动力水翼板` — Marke plus Suchbegriff. Rein lateinisch findet dort
  niemand, rein chinesisch kappt die Verbindung zu den anderen Kanaelen.
- **Beschreibung:** siehe unten, 147 von 160 Zeichen.
- **Bilder:** `brand/social/kanal-avatar-1024.png` und `kanal-cover-1600.png`.

```
在德国博登湖玩无动力水翼板 🌊
不用风、不用浪、不用船，只靠自己 pump 起飞
从新手摔到起飞，全过程都记在这儿
顺手写了个运动手表 App：佳明 / Apple Watch / 华米 Amazfit / 高驰 COROS
记录每次 pump 的距离和滑行 · 免费开源 → pumpfoil.org
```

## Erreichbarkeit aus China — geprueft

**pumpfoil.org ist erreichbar** (07.09., Beijing, Shenzhen, Innere Mongolei, Heilongjiang,
Yunnan — alle OK). Die Domain steht auf keiner Sperrliste, DNS loest ueberall korrekt auf
`78.46.102.130` auf.

**Und die iOS-App liegt im chinesischen App Store** (`org.pumpfoil.coolwatch`, geprueft ueber
die iTunes-Lookup-API in `cn`, `hk`, `tw`). RedNote ist damit ein moeglicher App-Kanal, nicht
nur Sichtbarkeit fuer den Sport.

Zwei Einschraenkungen an dem Befund:

- Der Test prueft **DNS**, nicht die fertige HTTPS-Verbindung. Bewiesen ist, dass der
  haeufigste harte Block fehlt. Ob es auch zuegig laedt, waere mit einem Dienst zu pruefen,
  der wirklich HTTP holt (z. B. `check-host.net` mit chinesischen Knoten). Die IP liegt in
  einem **Hetzner**-Bereich (`78.46.0.0/15`, Rechenzentrum Nuernberg), und von dort ist aus
  China eher „langsam" als „gesperrt" zu erwarten.
- **Die Domain ohne `https://` eingeben.** Mit Praefix meldet der Test „BLOCKED", weil er
  einen ungueltigen Hostnamen prueft. Das hat uns hier einmal eine falsche Schlussfolgerung
  gekostet.

### Was in China trotzdem nicht funktioniert

Unabhaengig von der Erreichbarkeit der Domain:

| | |
|---|---|
| **YouTube-Einbettung** im Community-Feed | vollstaendig gesperrt, bleibt leer |
| **Web Push** (`pywebpush`/VAPID, Chrome-Browser) | laeuft ueber Googles Infrastruktur, gesperrt |
| **Play-Store-Link** zur Android-App | gesperrt — iOS geht, Android nur ueber Umwege |
| **OpenStreetMap- und Esri-Kacheln** | erreichbar, aber langsam |

## Welche Uhren wir dort nennen — und welche NICHT

Nicht die Weltliste, sondern die fuer China:

| Marke | auf RedNote nennen? |
|---|---|
| 佳明 Garmin | ✅ App auf der Uhr, in China praesent |
| Apple Watch | ✅ |
| 华米 Amazfit | ✅ chinesische Marke (Zepp/Huami) |
| 高驰 COROS | ✅ chinesische Marke, in China stark — ueber die Kontoanbindung |
| Wear OS | ❌ Google ist in China gesperrt, erreicht dort niemanden |
| **小米 Xiaomi** | ❌ **auf keinen Fall** |
| 华为 Huawei | ❌ wird gar nicht unterstuetzt |

**Warum Xiaomi trotz aller Naheliegendheit raus muss:** unsere Anbindung laeuft ueber
Mi Fitness → Suunto, und dazu steht in unserer eigenen App-Doku
(`web/src/i18n/locales/en.ts`, `linked.xiaomi.note`): *"Xiaomi offers this connection
worldwide except in China."* Genau diese Bruecke fehlt dort. 小米 zu nennen waere ein
Versprechen, das beim ersten Versuch bricht — und das vor dem Publikum, das die Marke am
besten kennt.

**Der Elefant ist Huawei.** Die groesste Uhrenmarke Chinas unterstuetzen wir gar nicht,
weder mit App noch ueber ein Konto. Das ist jetzt die verbliebene Deckelung des Kanals: die
Seite ist erreichbar und die iOS-App im Store, aber wer dort eine Huawei traegt — und das
sind viele — kommt trotzdem nicht weit.

## Wie das Studio das bedient

**Kein eigener Render und kein eigener Ordner.** Fuer RedNote wird die **TikTok-Fassung**
hochgeladen — 9:16, O-Ton, keine lizenzierte Musik —, geholt ueber die laufende Nummer aus
`shorts-mit-musik/tiktok/`. Ein zweiter Ordner mit harten Links stand hier kurz
(`LINKED_EXPORTS`), war aber nur Verwaltung ohne Nutzen und ist am 08.09. wieder raus.

**Outro:** die TikTok-Fassung zeigt seit 08.09. **Herz und Stern** — gefuellt, mittig. Der
Stern ist 收藏, und Speichern ist auf einer Such-Plattform die wertvollste Aktion. Er passt
zugleich fuer TikTok, wo an derselben Stelle ein Lesezeichen steht. Ein eigener
RedNote-Render ist damit nicht noetig.

Sprechblase und Teilen-Pfeil liegen in `OUTRO_ICONS` auskommentiert daneben, falls die
Leiste je wieder voller werden soll. Nur YouTube sitzt tiefer (68 % Hoehe) und wuerde in
RedNotes eigenen Textblock am unteren Rand laufen — deshalb dort die TikTok-Fassung, nicht
die von YouTube.

**Texte:** Reiter *Texte* → Export filtern → „Titel & Captions" → Block **RedNote**. Titel
(auf 20 Zeichen an der Wortgrenze gekuerzt) und chinesischer Text mit Schlagworten,
abgeleitet aus den `zh`-Feldern, die ohnehin fuer jedes Video entstehen — **kein
zusaetzlicher Modellaufruf**, wirkt rueckwirkend fuer alle Exporte.

## Startreihenfolge

Bewusst nicht mit dem Staerksten anfangen: ein Ausreisser nuetzt wenig, wenn das Profil
dahinter leer ist.

| # | Video | warum an dieser Stelle |
|---|---|---|
| 1 ✅ | `152` four clean dropstarts | erklaert die Mechanik, Foil unter Wasser gut sichtbar |
| 2 | `132` flow visualization, Wollfaeden am Foil | „涨知识", wird gespeichert, zeigt Kompetenz |
| 3 | `160` relaxed run auf Spiegelwasser | 治愈系, RedNotes Kernwaehrung |
| 4 | `163` howto prevent ventilation | echter Ratgeber, beantwortet eine Suchanfrage |
| 5 | `153` where is my board | menschlicher Moment, dafuer folgt man |

**Zurueckgehalten, bis das Profil steht:** `130` (erstes Mal ueberhaupt — das Format mit
408.000 Aufrufen auf Facebook), `138` (Kinder, Tag 1–4, vermutlich das beste Stueck fuer
RedNote), `148` (lowkite, 130.000 auf Facebook), `145` (neuer Spot, erster Dropstart), und
die `success-or-fail`-Reihe, die ein Publikum braucht, das das Format kennt.

**Musik.** Der Nachweis steht im Dateinamen — seit 08.09. sagt der Suffix bei jeder Quelle
etwas (`-pixabay-<id>`, `-music-yt`, `-music-insta`, `-no-music`). Fuer RedNote spielt es
keine Rolle, welche Quelle es ist: die Datei geht so hoch, wie sie ist.

**Texte gibt es zu jeder Nummer.** UI-Cache und YT-Batch-Cache decken zusammen 3 bis 173
ohne Luecke ab — auch fuer Videos, deren Datei laengst nur noch auf der externen Platte
liegt, stehen Titel und Text im Studio.

## Beobachtet

- `165-dropstart-to-flying-foil` ist trotz des Namens ein **Sturz** (Board fliegt, grosse
  Fontaene). Dateinamen sind hier keine verlaessliche Quelle — vor der Auswahl ins Bild sehen.
- Das Outro ist bei 80 % Deckkraft ueber hellem Wasser schwer zu lesen. Fuer helle Videos
  lohnt es, die Deckkraft in der Tab-Zeile auf 100 % zu stellen (gilt ab dem naechsten Render).

## Erste Zahlen (09.09.2026, 12 Beitraege, Tag 3)

Aus 笔记管理 abgelesen — eine API gibt es nicht, die Liste wird von Hand kopiert.
Spalten dort: 👁 Aufrufe · 💬 Kommentare · ❤️ Likes · ⭐ 收藏 · ↗️ Geteilt.

| Titel | 👁 | ❤️ | ⭐ | ↗️ |
|---|---|---|---|---|
| 在水翼上贴丝线，看清水流走向 🌊 | **261** | 4 | 1 | 1 |
| 子弹时间…水翼不停泵动 (2 h alt) | 24 | 0 | 0 | 0 |
| 和菲尔一起水上翼板 | 8 | 0 | 0 | 0 |
| 日食之下的水上滑行 | 7 | 0 | 0 | 0 |
| 悠闲晨练 | 7 | 1 | 0 | 1 |
| 避免通气失速 | 6 | 0 | 0 | 0 |
| 慢动作刻雕翻车集 | 5 | 0 | 0 | 0 |
| 水翼上贴毛线：240fps (1 h alt) | 4 | 0 | 0 | 0 |
| 镜面水域，云影倒映 | 2 | 0 | 1 | 0 |
| 和朋友一起下水 | 2 | 0 | 0 | 0 |
| 连续四次干净的入水起步 | 0 | 1 | 1 | 0 |

**Ein Beitrag traegt 80 % der Aufrufe.** Das ist hier kein Rauschen: dieselbe Nacht,
dasselbe Konto, dieselbe Followerzahl — die Nachbarn liegen bei 2 bis 8, dieser bei 261.
Faktor 30 aus derselben Ausgangslage heisst, dass etwas ihn aufgegriffen hat, auf einer
Such-Plattform am ehesten die Suche selbst.

**Erstes pruefbares Muster: 水翼 im Titel.** Die drei oberen Plaetze haben das Wort, die
unteren fuenf nicht. Der Gegentest kostet nichts, also gilt ab jetzt: **水翼 gehoert in
jeden Titel** — es ist der Wortstamm, den die Suche findet (水翼 = Wasserfluegel/Foil,
水翼板 = Foilboard, 无动力水翼板 = unser Begriff fuer Pumpfoil, enthaelt beide).

**Vorsicht beim Nachbearbeiten:** eine Aenderung an einem veroeffentlichten Beitrag schickt
ihn erneut durch 审核 und nimmt ihn waehrenddessen aus der Suche. Wenige pro Tag, nicht
alle auf einmal — eine Massenaenderung sieht nach Manipulation aus.

**Im Studio erledigt (09.09.):** `mit_suchwort()` in `shorts-musik.py` haengt den Begriff an
jeden RedNote-Titel, der ihn nicht ohnehin traegt — als `｜无动力水翼板`, und wenn die 20
Zeichen nicht reichen, als `｜水翼`. Angehaengt statt vorangestellt, weil ein Praefix den
Satzbau kippt (`水翼和朋友一起下水` statt `和朋友一起玩水翼`) und der ｜-Zusatz nie. Wirkt
rueckwirkend fuer alle Exporte, kein zusaetzlicher Modellaufruf.

Am selben Abend nachgetragen: `140` (日落, erster Beitrag mit korrigiertem Titel) stand nach
einer Stunde bei 11 Aufrufen und **2 收藏 bei 0 Likes** — die einzige Zahl bisher, bei der
gespeichert statt nur geherzt wurde.

## Zahlen einlesen

RedNote hat keine API — die Kennzahlen kommen von Hand herein, denselben Weg
wie die Facebook Content Library:

```
# creator.rednote.com → 笔记管理 → GANZ NACH UNTEN scrollen, damit alle Karten
# nachgeladen sind. Dann Rechtsklick auf die Liste → Untersuchen →
# <div class="panel"> markieren → "Copy outerHTML" → in eine Datei sichern.
scripts/rednote-import.py --import ~/Downloads/rednote.html
scripts/rednote-import.py --list
scripts/rednote-import.py --series 132     # Zeitverlauf eines Beitrags
```

Geschrieben wird in `.stats.sqlite3`, in dieselben Tabellen `post`/`post_stat`
wie YouTube, TikTok, Instagram und Facebook — RedNote erscheint damit von
selbst im Auswertungs-Tab. Wie ueberall gilt: **eine Zeile nur bei geaenderten
Werten**, zweimal dieselbe Datei einlesen erzeugt also keine Dubletten.

Zwei Eigenheiten:

- **收藏 hat eine eigene Spalte** (`post_stat.saves`), additiv ergaenzt beim
  ersten Import. In views/likes/comments/shares passte es nicht, und auf einer
  Such-Plattform ist Speichern die Zahl, auf die es ankommt.
- **Die laufende Nummer steht nicht im Titel.** Sie wird ueber die chinesischen
  Titel aus dem Caption-Cache zurueckgerechnet. Nach einer Umbenennung auf
  RedNote findet die Zuordnung sie nicht mehr — dann meldet der Import die
  Karte und `--nummer <noteId>=<nr>` setzt sie. Einmal gesetzt bleibt sie
  stehen, auch wenn spaeter weiter umbenannt wird.

Beitraege in 审核中 werden uebersprungen: RedNote zeichnet ihnen keine
vollstaendige Zahlenzeile, sie waeren kein vergleichbarer Messpunkt.

**bilibili bleibt draussen.** Dort steht der ganze Kanal bei null Aufrufen
ausser Jans eigenen (Stand 09.09.) — eine Tabelle aus Nullen bringt nichts.
Sobald sich etwas bewegt, ist derselbe Import in kurzer Zeit angepasst.
