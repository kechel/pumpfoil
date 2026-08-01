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

1. **EINE Meldung genügt** (geändert 2026-07-27, Jan: „mach mal das bereits eine meldung 'nicht
   pumpfoil' ausreicht zum melden, ausblenden und im admin-bereich mir anzeigen, wenn dann jemand
   stoert sperren wir dem die funktion"). `FLAGS_TO_HIDE = 1`.
   Der Griefing-Schutz ist damit nicht weg, sondern **verlagert**: jede Meldung ist im Admin-Bereich
   MIT Melder und Gesamtzahl seiner Meldungen sichtbar (`GET /api/admin/session-flags`), und wer
   stört, verliert die Funktion (`User.flag_blocked`, `POST /api/admin/users/{id}/flag-block`).
   Das ist die bessere Reihenfolge: es hilft dem Normalfall (eine ehrliche Meldung wirkt sofort) und
   bestraft nur den Ausnahmefall. Gesperrte Melder bekommen 403 mit klarer Meldung, nicht stilles
   Ignorieren. Bestehende Meldungen bleiben beim Sperren stehen — sie können berechtigt gewesen sein.
   (Vorher galt: erst zwei unabhängige Melder.)
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

- **KEIN Push beim Melden** (Jan, 2026-07-27: „eigentlich braucht es garkeinen push bei sowas finde
  ich, der hinweis reicht"). Stattdessen der Hinweis auf der Startseite + das Badge an der Karte —
  beide bleiben stehen, bis zugeordnet ist, verschwinden also nicht wie eine Benachrichtigung.
  Inhaltlich ist das auch angenehmer: ein Push kommt unaufgefordert und klingt nach Vorwurf.
  Ein Push bleibt nur bei der **Admin-Entscheidung** nach einem Widerspruch — dort verschwindet der
  Hinweis ja, und ohne Push erfährt der Nutzer das Ergebnis seines Widerspruchs nie.
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

## Stufe 1b — die Maschine als vierte Quelle (`sport_source = "auto"`, 2026-08-01)

Jans Wunsch: „direkt beim Import generell eine Art Auto-Erkennung der Sportart mit einführen … und
wenn es unsicher ist, dann halt nicht klassifizieren, sondern nur ‚nicht Pumpfoil' zuordnen."

Umgesetzt in `server/app/analysis/sportauto.py`, aufgerufen am Ende von `run_analysis` — **nur bei
`final=True` und nur, solange `sport_source == "default"`**. Die Maschine ist die **schwächste**
Quelle: sie urteilt nie über einen Menschen, und der Besitzer überstimmt sie **ohne Admin-Umweg**
(die 409-Sperre in `set_classification` greift jetzt nur noch, wenn es echte Meldungen gibt —
vorher hätte ein Maschinen-Irrtum den Nutzer in Jans Warteschlange geschickt).

Drei Ausgänge: **Pumpfoil** (nichts passiert) · **`efoil`** (einzige Klasse, die die Maschine
behauptet — die Signatur ist eindeutig belegt) · **unklassifiziert** (`needs_classification`,
erscheint in keiner Auswertung, bis der Besitzer zuordnet). Die Begründung samt Messwerten steht in
`Session.sport_auto_json` und geht als `sport_auto` an Besitzer und Admin.

**Grundlage der Grenzwerte:** die 32 menschlich beurteilten Sessions gegen eine Kontrollgruppe
unbeurteilter Sessions **derselben Nutzer** (wer seine Wing-Session markiert hat, dessen Rest ist
glaubwürdig Pumpfoil). Zwei Gruppen mussten heraus, beide eigene Befunde: **user 135** (die
Kontrolle war mit genau dem verseucht, wonach gesucht wird) und **41 iOS-Simulator-Sessions** im
Raum Cupertino. Ergebnis: **17 von 28** belegten Nicht-Pumpfoil-Sessions erkannt bei **1 Fehlalarm
unter 526** (0,19 %); die 4 bestätigten Pumpfoil-Sessions bleiben unberührt. Die schärfere Variante
(Dauer allein ab 300 s) hätte 93 % erkannt, aber 2,1 % Fehlalarm — bewusst verworfen: eine falsch
markierte echte Rekordfahrt ärgert mehr, als eine übersehene Wing-Session schadet.

Trockenlauf über den Bestand: **39 von 827** unbeurteilten Sessions (4,7 %) würden markiert,
davon 30 bei user 135. Alle Zahlen und ihre Herkunft stehen im Modul-Kopf von `sportauto.py`.

**Offen:** der Hinweistext in PWA und Apps (Schlüssel `auto.motor` / `auto.unklar`) und die
rückwirkende Anwendung auf die 39 Sessions — beides wartet auf Jans Freigabe.

## Vorgeschlagene Reihenfolge

- **Stufe 1 (Kern):** Spalten + `session_flags`, Melden (fremd: nur die freundliche Bitte, KEINE
  Kategorie · Besitzer und Admin: Kategorie setzen), 2-Melder-Regel, Zustand
  `needs_classification` = erscheint in KEINER Kategorie, Widerspruch, Admin-Warteschlange mit
  Entscheidung + `admin_locked`, Benachrichtigungen, Badge, freundliche Texte in 15 Sprachen.
- **Stufe 2 (Ausbau):** Rekorde/Stats **je Sportart** in der Community, Spots je Sportart, Labels in
  die Detektor-Ablage, Korrektur alter Rekord-Snapshots.

Stufe 1 ist für sich nützlich; Stufe 2 ist der Teil, der aus dem Ausschluss ein Feature macht.
