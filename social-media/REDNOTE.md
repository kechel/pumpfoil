# RedNote / Xiaohongshu (小红书)

Chinesische Plattform aus Shanghai, ~350–400 Mio. monatlich aktive Nutzer. Anders als bei
Kwai gibt es hier **keine Huerde**: die App liegt im deutschen Store (`com.xingin.discover`,
in DE/AT/CH als 小红书, in US/BR/GB als „rednote"), Anmeldung per Google ging, und
**creator.rednote.com** erlaubt den Upload im Browser — kein Handy noetig.

**Stand 07.09.2026: Kanal steht, erster Beitrag (152) ist online.**

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
weder mit App noch ueber ein Konto. Wer uns dort ueber den App-Winkel findet, hat also mit
einiger Wahrscheinlichkeit eine Uhr, mit der es nicht geht. Das begrenzt, was RedNote fuer
App-Nutzer bringen kann — fuer Reichweite und Sichtbarkeit des Sports bleibt es trotzdem
sinnvoll.

## Wie das Studio das bedient

**Kein eigener Render.** `shorts-mit-musik/rednote/` enthaelt **harte Links** auf die
TikTok-Fassung: dieselben Daten, zweiter Name, kein Byte und keine Sekunde extra. Die
TikTok-Fassung passt unveraendert — 9:16, O-Ton, keine lizenzierte Musik. Geregelt ueber
`LINKED_EXPORTS = {"rednote": "tiktok"}`; die Render-Schleife ueberspringt verlinkte Ziele
und legt den Link an, sobald die Quelle fertig ist.

**Outro:** die TikTok-Fassung, mittig. Von den drei Saetzen passt Instagram am besten
(Herz · Kommentar · Teilen; TikToks Repost gibt es auf RedNote nicht), aber der Unterschied
ist ein Symbol von dreien. Nur YouTube sitzt tiefer (68 % Hoehe) und wuerde in RedNotes
eigenen Textblock am unteren Rand laufen.

**Richtig waere langfristig ein eigenes Outro** mit Herz · Kommentar · **Stern (收藏)** —
Speichern ist auf einer Such-Plattform die wertvollste Aktion, und keiner der drei
vorhandenen Saetze hat das Symbol. Das kostet dann einen eigenen Render je Video statt des
kostenlosen Links. Bewusst zurueckgestellt, bis der Kanal Zahlen zeigt.

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

**Nur Pixabay-Musik.** Der Nachweis steht im Dateinamen (`-pixabay-<id>`); von 44
TikTok-Exporten haben 43 einen, nur `139` nicht.

## Beobachtet

- `165-dropstart-to-flying-foil` ist trotz des Namens ein **Sturz** (Board fliegt, grosse
  Fontaene). Dateinamen sind hier keine verlaessliche Quelle — vor der Auswahl ins Bild sehen.
- Das Outro ist bei 80 % Deckkraft ueber hellem Wasser schwer zu lesen. Fuer helle Videos
  lohnt es, die Deckkraft in der Tab-Zeile auf 100 % zu stellen (gilt ab dem naechsten Render).
