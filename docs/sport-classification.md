# Sessions klassifizieren: „nicht Pumpfoil" — Design

Wunsch Jan (2026-07-27): Sessions als „nicht Pumpfoil" markieren können — eigene **und fremde**. Der
Besitzer kann **Einspruch** einlegen, Einsprüche landen bei Jan im Admin-Bereich zur endgültigen
Entscheidung. Markierte Sessions zählen nicht mehr für Community-Rekorde/Stats, bis Jan ggf. „doch
Pumpfoil" festlegt. Eigene Sessions darf man selbst kategorisieren, fremde nur melden („not pumpfoil,
please classify").

## Zwei Achsen, nicht eine

Jans erste Liste („false data, wakethief, paddle-up, wingfoil, foildrive …") mischt zwei Dinge, die
sich unterschiedlich verhalten müssen:

| Achse | Werte | Bedeutung | Wirkung |
|---|---|---|---|
| **`sport`** | `pumpfoil` (Default), `wingfoil`, `kitefoil`, `surf_downwind`, `sup_paddle`, `wake`, `efoil`, `foildrive`, `other` | **echte Daten einer anderen Sportart** | raus aus den Pumpfoil-Rekorden, aber **eigene Rekorde/Stats/Spots je Sportart** möglich (Jans Wunsch: „stats und rekorde fuer die anderen kategorien anzeigbar machen", „spots dann auch je nach kategorie") |
| **`data_quality`** | `ok` (Default), `false_data`, `duplicate`, `test` | **Müll oder Dopplung** | zählt NIRGENDS — auch nicht in einer anderen Kategorie, auch nicht für Spots |

Warum die Trennung wichtig ist: eine Wingfoil-Session ist **gültige Messung** einer anderen Sportart
und darf eine Wingfoil-Bestzeit begründen. Eine Session mit GPS-Sprüngen (Doppler-Artefakte, s.
[[gps-only-doppler-fix]]) ist kaputt und darf gar nichts begründen. Mit einer einzigen Enum-Spalte
würde man beides gleich behandeln und käme später nicht mehr auseinander.

`wakethief` (Wellenreiten am Boot) ist in der Praxis eine Unterform von `wake` — als eigener Wert
brauchbar, wenn es die Community so benennt; technisch dasselbe Verhalten.
Motorisiert bewusst **zwei** Werte: `efoil` (Motor im Board) und `foildrive` (Propeller am Mast,
Jans Ergänzung) — für den Detektor sind das verschiedene Signaturen.

## Was NICHT angefasst werden darf

- **`Session.is_pumpfoil` gehört dem Detektor.** Die Analyse schreibt es, und **jede Reanalyse
  überschreibt es**. Menschliche Urteile gehören in eigene Spalten, sonst löscht der nächste
  Detektor-Lauf still Jans Admin-Entscheidung. (Gilt auch für `detection`, `num_runs` usw.)
- **`Session.flagged` ist die Moderation für unangemessene Inhalte** (Admin, blendet aus der
  Community aus). Die neue Klassifikation ist eine dritte Achse; verschmelzen würde „falsche
  Sportart" und „unangemessen" unentscheidbar machen.

Gut: Community und Rekorde werden **live** gefiltert (`api/community.py:_community()`), der Ausschluss
wirkt also sofort ohne Neuberechnung. Nur `record_snapshot.py` (täglicher Snapshot für die
Push-Meldungen) hat Historie, die rückblickend falsch bleibt — beim Umsetzen entscheiden, ob alte
Snapshots korrigiert werden.

## Entschiedenes Verhalten (Jan, 2026-07-27)

1. **Eine Fremdmeldung reicht NICHT.** Sie legt die Session in Jans Warteschlange, sie zählt weiter.
   Raus aus Community-Rekorden/Stats erst bei **zwei unabhängigen Meldern** — oder sofort, wenn der
   **Besitzer selbst** markiert (dann ist es keine Meldung, sondern eine Tatsache).
   Grund: eine einzelne anonyme Meldung wäre sonst eine Waffe gegen den Führenden.
2. **Eigene Zahlen bleiben.** Die Session verschwindet aus der Community, bleibt aber in der eigenen
   Historie und den persönlichen Zahlen.
3. **Spots je Kategorie.** Eine Wingfoil-Session darf keinen „Pumpfoil-Spot" erzeugen; Spots und
   Spot-Rekorde bekommen die Sportart-Dimension.

## Ton: eine Bitte, kein Vorwurf (Jan, 2026-07-27)

„es sollte ‚freundlich' formuliert sein, sowas wie ‚ich glaube das ist nicht pumpfoil, bitte richtig
klassifizieren', und die klassifizierung ueberlassen wir dann dem ersteller der session selber."

Daraus folgt mehr als eine Textfrage: **eine Fremdmeldung setzt keine Kategorie.** Sie sagt nur „das
sieht nicht nach Pumpfoil aus" und bittet den Ersteller, es richtig zuzuordnen. Nur **Besitzer** und
**Admin** dürfen die Kategorie setzen — beide gleichberechtigt.

**Solange nicht zugeordnet ist, erscheint die Session in KEINER Kategorie** (Jan). Also nicht nur raus
aus den Pumpfoil-Rekorden, sondern auch nicht in Wingfoil-, Foildrive- oder sonstigen Auswertungen —
sie ist schlicht unklassifiziert. Das ist die richtige Voreinstellung: sie belohnt keine Seite und
schafft einen sanften Anreiz, die Frage zu beantworten. In der eigenen Historie bleibt sie sichtbar.

### Textentwürfe (DE/EN, noch nicht in i18n eingetragen)

**Knopf an fremden Sessions:** „Sieht nicht nach Pumpfoil aus" / „Doesn't look like pumpfoil"
(nicht „melden" — das klingt nach Anzeige).

**Bestätigungsdialog beim Melden:**
> Du glaubst, das ist keine Pumpfoil-Session? Dann bekommt <Name> eine freundliche Bitte, sie richtig
> zuzuordnen — zum Beispiel als Wingfoil oder Foildrive. Du bleibst dabei anonym, und niemandem wird
> etwas vorgeworfen: es geht nur darum, dass die Rekorde vergleichbar bleiben.

> You think this isn't a pumpfoil session? <Name> will get a friendly request to classify it properly
> — as wingfoil or foildrive, for example. You stay anonymous, and nobody is being accused of
> anything: it's only about keeping the records comparable.

**Was der Besitzer sieht (Benachrichtigung + Badge an der Session):**
> Ein anderer Foiler glaubt, dass diese Session kein Pumpfoiling ist. Magst du sie kurz richtig
> zuordnen? Bis dahin erscheint sie in keiner Auswertung. Wenn es doch Pumpfoiling war, sag es uns —
> dann schaut jemand von uns drauf.

> Another foiler thinks this session isn't pumpfoiling. Could you classify it? Until then it won't
> appear in any of the stats. If it really was pumpfoiling, just tell us and we'll take a look.

**Nach der Zuordnung durch den Besitzer:** kein weiterer Schritt, keine Bestätigung durch den Melder —
die Sache ist erledigt. Nur bei **Widerspruch** („war doch Pumpfoiling") geht es in Jans Warteschlange.

## Zustände

| Zustand | wie man hinkommt | zählt für |
|---|---|---|
| `classified` (Default `pumpfoil`) | Analyse, niemand widerspricht | seine Kategorie |
| `needs_classification` | **2 unabhängige Melder** — oder der Besitzer markiert selbst ohne Kategorie | **nichts** (keine Kategorie, keine Spots, keine Rekorde) |
| `classified` durch Besitzer/Admin | Besitzer oder Admin wählt `sport`/`data_quality` | seine Kategorie (bzw. nichts bei `data_quality != ok`) |
| `appealed` | Besitzer widerspricht („war doch Pumpfoiling") | nichts, bis Jan entscheidet |
| `admin_locked` | Jans „doch Pumpfoil" | Pumpfoil — weitere Meldungen wirken nicht mehr |

Eine **einzelne** Meldung ändert nichts außer einem Eintrag in Jans Warteschlange (Griefing-Schutz,
s. oben).

## Pflichten gegenüber dem Betroffenen

- **Benachrichtigung**, sobald die Wirkung eintritt (2. Melder) — lautlos aus den Rekorden zu
  verschwinden ist schlimmer als ein falscher Rekord.
- **Badge an der Session** + Einspruchsknopf mit Freitext.
- **Der Melder bleibt für den Besitzer unsichtbar**, nur der Admin sieht ihn. Sonst entstehen
  Privatfehden aus einer Klassifikationsfrage.
- Nach Jans Entscheidung: Besitzer benachrichtigen (bestätigt / „doch Pumpfoil").
- Sprache neutral halten: es ist eine **Zuordnung**, kein Vorwurf. Kein „Betrüger"-Vokabular in der UI.

## Datenmodell (Skizze)

```
session_flags        id, session_id, user_id, sport|null, data_quality|null, note,
                     created_at, unique(session_id, user_id)      # 1 Meldung je Nutzer
Session  + sport               VARCHAR default 'pumpfoil'   # WIRKSAMER Wert (Mensch)
         + data_quality        VARCHAR default 'ok'
         + sport_source        'default'|'owner'|'community'|'admin'
         + appeal_text, appeal_at
         + admin_locked        BOOLEAN   # „doch Pumpfoil": weitere Meldungen wirken nicht mehr
```

- `admin_locked` ist wichtig: ohne die Sperre würden nach Jans „doch Pumpfoil" zwei neue Melder die
  Session erneut aus den Rekorden werfen.
- Abgeleitetes Feld (oder Index-Bedingung) für „zählt für Pumpfoil-Rekorde", damit die Query einfach
  bleibt: `sport = 'pumpfoil' AND data_quality = 'ok' AND is_pumpfoil AND …`.

## Kleinkram, der später weh tut

- **Zusammengeführte Sessions** (`merge.py` prüft `is_pumpfoil`) — Klassifikation muss mitwandern.
- **Übertragene Sessions** ([[session-transfer]]): Einspruch darf der **aktuelle** Besitzer.
- **Konto-Löschung**: Flags müssen mit weg (Löschung ist absolut, [[dsgvo-deletion-absolute]]).
- **Rate-Limit** gegen Melde-Spam; **blockierte Nutzer** ([[direct-messages]] `UserBlock`) sollen sich
  nicht gegenseitig melden können.
- **Kategorien in 15 Sprachen** — die Enum-Keys bleiben englisch, die Labels werden übersetzt.
- **Teil-Sessions**: erst Wingfoil, dann gepumpt. Session-Ebene reicht vorerst; falls es real vorkommt,
  ist die Erweiterung eine Klassifikation je **Lauf**, nicht je Session.
- **Detektor-Nutzen:** genau diese Labels fehlen uns bisher als **Negativbeispiele**
  ([[detector-negative-examples]]) — sie gehören in die Label-Ablage, nicht nur in die DB.
  Eine Meldung darf aber **keine Reanalyse** auslösen.

## Vorgeschlagene Reihenfolge

- **Stufe 1 (Kern):** Spalten + `session_flags`, Melden (fremd: nur die freundliche Bitte, KEINE
  Kategorie · Besitzer und Admin: Kategorie setzen), 2-Melder-Regel, Zustand
  `needs_classification` = erscheint in KEINER Kategorie, Widerspruch, Admin-Warteschlange mit
  Entscheidung + `admin_locked`, Benachrichtigungen, Badge, freundliche Texte in 15 Sprachen.
- **Stufe 2 (Ausbau):** Rekorde/Stats **je Sportart** in der Community, Spots je Sportart, Labels in
  die Detektor-Ablage, Korrektur alter Rekord-Snapshots.

Stufe 1 ist für sich nützlich; Stufe 2 ist der Teil, der aus dem Ausschluss ein Feature macht.
