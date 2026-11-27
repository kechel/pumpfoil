# Teams — Plan und Stand (31.10.2026)

**Stufe 1 LIVE seit 31.10.2026 (Web).** Server `server/app/teams.py` + `server/app/api/teams.py` (Tests
`server/tests/test_teams.py`), Web `web/src/pages/Team*.tsx`, Admin-Reiter „Teams“. Uebersetzt in alle 18 Sprachen
(31.10.2026). Regeln fuer Nutzer: `/teams/regeln` (`web/src/pages/TeamRegeln.tsx`, auch ohne Login) — bei jeder
Regel-Aenderung mitziehen.
**Stufe 2 LIVE seit 31.10.2026:** Teamsummen (`/api/teams/<slug>/statistik`), Team-Logbuch (Tabellen
`team_rekorde` + `team_logbuch`, naechtlich in `server/record_snapshot.py` nach dem Community-Snapshot; Summen nur
bei Wechsel an der Spitze, Bestwerte bei jeder Steigerung, sinkende Werte still nachgezogen), Bestenliste als Bild
(`web/src/components/TeamTafelBild.tsx`, Canvas im Browser) und Team-Chat (Scope `team:<id>`; Zugriff nur fuer aktive
Mitglieder in `chat._require_access`, nie in der Entdeckungsliste, Push nur an aktive Mitglieder, Austritt raeumt den
Raum-Zustand ab, Loeschen des Teams loescht den Chat mit).

**Stufe 3 LIVE seit 31.10.2026:** Events (Tabelle `team_events`): Zeitfenster [Beginn, Ende) mit Zeitzone, bis zu
6 Bestenlisten, optional nur an bestimmten Spots, Vorlagen (`web/src/lib/teamEvents.ts`). Gewertet wird, was im
Fenster startet; 4 h nach dem Ende friert das Ergebnis ein (bis 09.11.2026: 24 h; Timer alle 5 min, zusaetzlich beim Abruf).
Abzeichen fuer Platz 1–3 auf der Foiler-Seite, nur aus Teams mit freigegebenem Auftritt (sonst wuerde ein internes
Team ueber die Foiler-Seite bekannt). Eine Kontoloeschung entfernt die Person auch aus eingefrorenen Ergebnissen.
Option „keine FIT-Importe" NICHT gebaut: `device_id` trennt Uhr- nicht sicher von Handy-Aufnahmen.

Nicht noetig (Jan, 31.10.2026): Fruehaufsteher, Nachteule, Carves > 180° und Hoechstpuls als Team-Kennzahlen.

Anlass: Telefonat Jan mit einem Nutzer, der Teams mit eigenen Bestenlisten haben moechte; als Vorbild
schickte er eine schlichte Kite-Big-Air-Rangliste (Rang, Flagge, Name, Wert — eine Zeile je Person).

## Entscheidungen (Jan, 31.10.2026)

1. **Name: „Team“.** Abgegrenzt von „Freunde“ (individuell, gegenseitig) — ein Team ist eine feste Gruppe.
2. **Oeffentlich nur auf Einstellung, und nur die Bestenlisten.** Ohne Login: Rang, Anzeigename, Wert
   (plus Teamname/-logo/-farbe). Links zu Session-Details NUR mit Login. Ist das Team oeffentlich, steht
   das beim Beitreten da. **Jeder Beitritt stimmt zu, dass die Bestenlisten oeffentlich sein KOENNEN**
   (Jan, 31.10.2026) — im Kleingedruckten des Beitritts-Dialogs: „Die Bestenlisten dieses Teams sind
   derzeit oeffentlich / nicht oeffentlich. Die Teamleitung kann das jederzeit aendern; dann sind dein
   Anzeigename und dein Platz auch ohne Anmeldung sichtbar.“ Kein eigenes Zustimmen beim spaeteren
   Umschalten, kein Ausblenden einzelner Mitglieder.
3. **Intern darf ein Team machen, was es will.** Freigabe durch Jan/Admin nur fuer den OEFFENTLICHEN Teil
   (Name, Beschreibung, Logo, Farbe — so wie sie nach aussen erscheinen).
4. **Mitgliederliste: einstellbar je Team** (nur Mitglieder / alle Angemeldeten).
5. **Wertung: je Person nur der beste Eintrag.**

Zweite Runde (Jan, 31.10.2026):

6. **Alle Sessions eines Mitglieds zaehlen**, auch von vor dem Beitritt. Bei Events nur die im Zeitraum.
   Wer austritt, verschwindet sofort aus den Listen.
7. **Ohne Login keine Avatare, nur Initialen.** Spaeter evtl. im Profil einstellbar.
8. **Filter je Tafel konfigurierbar** (Sportart, nur mit Bewegungsdaten, Handy am Brett, Foil-Band).
9. **Teamspots: mehrere erlaubt.** Tafeln wahlweise nur an den Teamspots.
10. **Home: kleiner Link** neben dem Homespot-Link, mit Wappen und Teamfarbe; mehrere passen nebeneinander.
11. **Team loeschen nur „sicher“** — nicht aus Versehen moeglich (Teamname eintippen).
12. **Freigabe im Admin-Bereich wie alles andere** (Zaehler am Tab).
13. **Ja zu:** Bestenliste als Bild teilen, QR-Code zu den Einladungslinks (auch teilbar), Team-Chat,
    Teamsummen/-statistik, Event-Vorlagen (im Event-Anlegen), Event-Abzeichen, Events auf Spots begrenzbar.
14. **Teamrekord-Meldungen erstmal nicht.** Stattdessen ein **Team-Logbuch** (wer wann welchen Teamrekord
    gebrochen hat). Benachrichtigungen hoechstens spaeter, je Team ein-/ausschaltbar.
15. **Spaeter:** Geisterrennen und alle neuen Kennzahlen, die die Analyse-Pipeline beruehren. Angefangen
    wird mit dem, was wir schon koennen.

Auslegung zu 3 (von mir, bei Bedarf korrigieren): „oeffentlich“ heisst hier zweierlei — die Bestenliste
ohne Login UND die Auflistung im Community-Abschnitt „Teams“ (alle Angemeldeten sehen Name/Logo). Beides
erst nach Freigabe. Bis dahin funktioniert das Team ueber den Einladungslink voll, ist aber nirgends gelistet.
Eine Aenderung an Name/Beschreibung/Logo/Farbe braucht erneut Freigabe; nach aussen bleibt bis dahin die
alte, freigegebene Fassung stehen, intern gilt sofort die neue.

## Adresse `pumpfoil.org/teams/<slug>` (Jan, 31.10.2026)

„im prinzip der teamname … in der url ohne sonderzeichen etc., also z.b. pumpfoil.org/teams/illmenseepumper“
- Vorschlag automatisch aus dem Namen, frei anpassbar.
- Erlaubt: `a-z`, `0-9`, `-`; 3–40 Zeichen; eindeutig. Umlaute/Akzente umgeschrieben (ä→ae, ß→ss, š→s),
  alles andere entfaellt. Reservierte Woerter gesperrt (`neu`, `admin`, `join`, `apply`, …).
- Gehoert zum oeffentlichen Teil: Aenderung bei freigegebenen Teams braucht Freigabe.
- Alte Adressen leiten dauerhaft weiter (Tabelle `team_slugs_alt`), damit geteilte Links nicht brechen;
  ein alter Slug wird nie an ein anderes Team vergeben.
- Die Seite ist die Team-Ansicht (ohne Login nur die oeffentliche Bestenliste, falls eingeschaltet und
  freigegeben, sonst „nicht gefunden“). Angemeldete sehen dort „Beitreten“, wenn das Team Anmeldungen
  zulaesst (s. Beitreten).
- Neue Server-Route → Service-Worker-Ausnahme mitpflegen.

## Beitreten (Jan, 31.10.2026)

Zwei Schalter je Team fuer den Beitritt auf der Teamseite (angemeldet):
- **„Anmeldungen zulassen“** — zeigt „Beitreten“ auf der Teamseite.
- **„Anmeldungen automatisch akzeptieren“** — an: sofort Mitglied; aus: Anfrage, die der Leiter oder ein
  Moderator annimmt oder ablehnt.

Eine eigene Beitrittsart „nur per Einladung“ gibt es nicht („sehe da keinen sinn drin“).

**Zwei Einladungslinks je Team**, beide in den Einstellungen sichtbar, damit man sie unterschiedlich
verteilen kann:
- `pumpfoil.org/teams/<slug>/join-<token>` — direkt Mitglied.
- `pumpfoil.org/teams/<slug>/apply-<token>` — Anfrage, Leiter/Moderator entscheidet.

Ohne Konto: erst registrieren, dann direkt beigetreten bzw. angefragt (Token wartet in `localStorage`,
kein Cookie). Jeder Link laesst sich einzeln neu erzeugen; der alte gilt dann nicht mehr. Ausschlaggebend
ist der Token, nicht der Slug — nach einer Umbenennung funktioniert der Link weiter (alter Slug leitet um).
Jeder Beitritts-Dialog nennt, ob eine Freigabe noetig ist, und im Kleingedruckten den Satz zur
Oeffentlichkeit der Bestenlisten (s. Entscheidung 2) — immer, auch wenn das Team derzeit nicht oeffentlich ist.

## Grenzen, die aus bestehenden Regeln folgen

- **„Oeffentlich heisst eingeloggt“** (25.09.) — die Team-Bestenliste ohne Login ist die zweite Ausnahme
  neben `/s/<token>`, bewusst und schmal: kein Spot, kein Datum, keine Karte, keine Session-Links,
  keine Avatare (Initialen).
  `noindex` + `robots.txt`-Sperre.
- **Keine Sessionlisten je Person** — die Mitgliederliste fuehrt hoechstens auf die Foiler-Seite (5 Sessions).
- **Social-Gate** — alle Team-Routen hinter `require_social`.
- **Freunde-Daten** gehen nie in Team-Ansichten (Gewicht, „gerade am Pumpen“ mit Spot usw. bleiben bei `ist_freund`).
- **DSGVO-Loeschung**: Mitglied faellt raus; Leiter geloescht → dienstaeltester Moderator, sonst
  dienstaeltestes Mitglied, sonst Team stillgelegt.

## Datenmodell

- `teams`: id, name, slug (s. Adresse), beschreibung, logo, farbe (Palette-Schluessel),
  anmeldungen_zulassen (bool), automatisch_akzeptieren (bool), oeffentlich (bool), mitglieder_sichtbar (`mitglieder`/`angemeldete`),
  freigabe (`keine`/`wartet`/`frei`/`abgelehnt`) + die zuletzt freigegebene Fassung der vier
  oeffentlichen Felder, angelegt_von, angelegt_am.
- `team_mitglieder`: team_id, user_id, rolle (`leiter`/`moderator`/`mitglied`), status
  (`angefragt`/`aktiv`), seit.
- `team_einladungen`: team_id, art (`join`/`apply`), token, erzeugt_am, genutzt. Je Team und Art genau ein
  gueltiger. Der Token muss in den Einstellungen wieder ANZEIGBAR sein, ein reiner SHA-256 wie bei
  Geraete-Tokens reicht also nicht: verschluesselt ueber `geheim.py` speichern, Suche ueber einen
  zusaetzlichen Hash.
- `team_spots`: team_id, spot_id (mehrere).
- `team_tafeln`: team_id, kennzahl, sportart, filter (Bewegungsdaten, Handy am Brett, Foil-Band),
  nur_teamspots, reihenfolge.
- `team_logbuch`: team_id, zeit, tafel, user_id, session_id, wert, vorheriger Rekordhalter/-wert.
- `team_events` (Stufe 3): team_id, titel, start, ende, zeitzone, kennzahl(en), sportart, spot_ids
  (optional), vorlage, eingefroren_am, Ergebnis (eingefroren).
- Team-Chat: eigener Kanal `team:<id>` im vorhandenen Chat, nur fuer Mitglieder.

Rechte: Leiter = alles inkl. Moderatoren benennen und Leitung uebergeben; Moderator = nur Mitglieder
annehmen/entfernen; Mitglied = ansehen, austreten. Hoechstens 3 Teams je Person im Status `wartet`;
Teamnamen eindeutig.

## Bestenlisten

Gerechnet mit den vorhandenen Bausteinen aus `api/community.py`, gefiltert auf die Mitglieder (wie die
Freunde-Ansicht ueber `_community`):
- **Bestwert je Person** aus `METRICS` (Distanz, Dauer, Tempo, Runs, Gleiten, Session-Distanz/-Zeit/
  -Pumps, Carves > 180°) — je Person nur die beste Session.
- **Summen je Person** wie `/leaders` (Sessions, Runs, Pumps, Spots).
- Zeitraeume wie `PERIODS` (heute, 10/30/365 Tage, alles); bei Events das Event-Fenster.
- Alle Sessions der Mitglieder, auch von vor dem Beitritt. Filter je Tafel, optional nur an den Teamspots.
- **Teamsummen/-statistik** als Kopf der Teamseite (z. B. Pumps, km, Sessions des Teams im Zeitraum).
  Keine Rangliste Team gegen Team (grosse Teams gewinnen immer).
- **Team-Logbuch:** jeder neue Erste einer Tafel wird mit Zeit, Session und Vorgaenger eingetragen.
  Ermittelt beim Session-Eingang bzw. nach der Analyse, nicht rueckwirkend erfunden: beim Anlegen einer
  Tafel steht der aktuelle Stand als erster Eintrag.

Neue Kennzahlen (SPAETER): „Runs ueber 100 m“ und „schnellster km“ (neu aus dem GPS-Track, nur
innerhalb von Laeufen — Analyse-Pipeline, braucht Jans OK mit Befund und Gegenprobe).

## Oberflaeche

- **Profil:** Knopf „Team“ → eigene Seite: Teams verwalten / gruenden, alle Einstellungen.
- **Home:** kleiner Link neben dem Homespot-Link, mit Wappen und Teamfarbe, je Team einer → Teamseite
  (Bestenlisten, Zeitraum umschaltbar).
- **Community:** neuer Abschnitt „Teams“ (nur freigegebene).
- **Admin:** Warteschlange „Teams freigeben“ (alte gegen neue Fassung), Zaehler am Tab wie bei den
  anderen Warteschlangen.
- **Team loeschen:** nur Leiter, Teamname zur Bestaetigung eintippen. Loescht Mitgliedschaften, Tafeln,
  Logbuch, Events, Chat-Kanal; alter Slug bleibt gesperrt.
- **Bestenliste als Bild teilen:** der Server rendert eine Tafel als PNG (Logo, Teamfarbe, Rang/Name/Wert,
  Initialen statt Avatar, „pumpfoil.org/teams/<slug>“ als Fusszeile) — Vorbild ist genau das Bild aus
  dem Telefonat. Nur fuer Mitglieder; bei nicht oeffentlichen Teams mit Hinweis, dass das Bild Namen
  nach aussen traegt.
- **QR-Code** zu beiden Einladungslinks, anzeigbar, herunterladbar und ueber das Teilen-Menue teilbar.
  Erzeugung im Browser (keine Dritt-Dienste).
- **Beitreten per Link:** s. Abschnitt Beitreten.
- **Teamfarbe:** Palette aus ~12 vorgepruefter Farben (je eine Hell-/Dunkel-Variante, bestehen den
  Kontrast-Waechter), gesetzt als CSS-Variable `--team-akzent` nur auf Teamseiten.
- **Logo:** Upload wie Avatar (neu kodiert, EXIF weg, quadratisch, Groessengrenze), unter `server/media`.

## „Top 5 zusammen abspielen“ — Falle (SPAETER)

`web/src/lib/syncPlayback.ts` legt Sessions auf eine gemeinsame UHRZEIT (mehrere Fahrer im selben Video).
Bestwerte stammen von verschiedenen Tagen und meist verschiedenen Spots. Noetig ist ein neuer Modus
„Geisterrennen“: Laeufe ab ihrem Start uebereinander. Auf EINER Karte nur am selben Spot sinnvoll; sonst
nebeneinander oder ohne Karte (Tempo/Strecke ueber die Zeit). Start: nur fuer Sessions am selben Spot.

## Events (Stufe 3)

Zeitfenster mit Zeitzone, Kennzahl(en), optional auf einen oder mehrere Spots begrenzt. **Vorlagen** im
Event-Anlegen („Meiste Runs am Wochenende“, „Laengster Lauf“, „Meiste Pumps“ … aus den vorhandenen
Kennzahlen; neue wie „schnellster km“ kommen spaeter dazu). **Event-Abzeichen** fuer die Ersten, sichtbar
auf der Foiler-Seite (wie der Supporter-Badge). Gewertet nur Aufnahmen, die im Fenster gestartet sind; Upload bis
Ende + 4 h (bis 09.11.2026: 24 h), dann eingefroren (sonst verschiebt nachtraegliches Zuschneiden das Ergebnis). Je Event einstellbar
(01.11.2026, `ohne_dateien`): keine von Hand hochgeladenen Dateien (`fit-`/`imp-`), Uhr, App und
Kontoverknuepfungen zaehlen weiter. Vorhandene Waechter (Fake-Meldungen, Autofahrt-Grenzen,
aussortierte Laeufe, Sportart-Regel) gelten ohnehin.

**Gesamtsummen** (01.11.2026, `summen_json`): je Event anklickbar, welche Teamsummen ueber alle Teilnehmer oben auf
der Event-Seite stehen (Pumps, On-Foil-Strecke/-Zeit, Sessions, Laeufe, Spots, Teilnehmer; `teams.EVENT_SUMMEN`).
Dieselben Filter wie die Bestenlisten (Fenster, Spots, ohne Dateien); Sportart der ersten Bestenliste, Bewegungsdaten
nur Pflicht, wenn alle Bestenlisten sie verlangen. Keine Namen, darum auch fuer Gaeste. Beim Einfrieren nach
`summen_ergebnis_json` festgeschrieben. Ein Event darf auch **nur** Gesamtsummen haben (keine Bestenliste); dann
stellt man Sportart und Bewegungsdaten bei den Summen ein (`summen_sportart`, `summen_accel_only`). Ganz leer
lehnt der Server ab (`event_leer`).

**Teilnehmer nach dem Ende fest** (01.11.2026, `teilnehmer_json`): bis zum Ende zaehlt die aktuelle Mitgliederliste.
Bei der ersten Mitgliederaenderung danach (Austritt, Entfernen, Beitritt, Annehmen) werden die Teilnehmer aller
beendeten, noch nicht eingefrorenen Events festgehalten (`teams.events_teilnehmer_sichern`): wer nach dem Event
austritt, bleibt drin, wer danach beitritt, kommt nicht hinein. Eingefrorene Ergebnisse aendert nur noch die
DSGVO-Loeschung; gesperrte Konten fallen auch aus festgehaltenen Teilnehmern.

**Endstand fest** (08.11.2026, Jan: „der snapshot muss alles snapshotten"): eingefroren sind Bestenlisten (Rang, Wert,
Name, Avatar, Nationalitaet, Session, Spot, Vermerk „strittig"), Gesamtsummen, Team-Rangliste (mit Name, Logo, Farbe, Land
des Teams), die Wappen je Zeile, die Spots des Events mit Namen (`spots_fest_json`) und das Eventbild (Aenderung -> 409).
Bei globalen Events haelt `team_zuordnung_json` fest, wer fuer welches Team angetreten ist, samt freigegebenem
Team-Auftritt — zum Ende: vor jeder Aenderung, die das verschiebt (Beitritt, Austritt, Entfernen, Annehmen, Freigabe,
Teameinstellungen, Team loeschen; `teams.events_zuordnung_sichern`), spaetestens beim Einfrieren. Danach aendert nur noch
die DSGVO-Loeschung (Zeilen, Zuordnung, Teilnehmer) und der Ausstieg aus globalen Events den Endstand. Live bleiben
der Kopf des ausrichtenden Teams und die verlinkten Sessions selbst. Aeltere, schon eingefrorene Events nicht nachgetragen.

**Gemischte Bestenlisten** (08.11.2026): hat ein Event dieselbe Bestenliste fuer Pumpfoil und Foil Scoot, kommt
„Pumpfoil + Foil Scoot" als weitere dazu, mit Sportart-Abzeichen je Fahrer und Team — s. docs/sport-classification.md
„Gemischte Ranglisten".

**Fliegende Sprints** (09.11.2026): Event-Kennzahlen `sprint_100m`, `sprint_200m`, `sprint_300m`, `sprint_60s` — je Person
die beste Session, Wert = Tempo (m/s) des schnellsten Fensters irgendwo in einem Lauf (`analysis/sprint.py`: Uhr-Tempo
integriert, Gegenprobe gegen die Positionen, keine Luecke > 3 s im Fenster; gespeichert in `analysis_results.sprint_*`).
Nur in Events waehlbar (`T.EVENT_KENNZAHLEN`), nicht in den festen Team-Bestenlisten, nicht in Rekorden/Community. Nur fuer
Clients mit `?sprint=1` (Web); ohne den Schalter fehlen sie in der Antwort, und `PUT …/events/{id}` behaelt die
gespeicherten Sprint-Bestenlisten, damit eine alte App sie beim Speichern nicht loescht. Web zeigt Strecken als Zeit
(„21,4 s · 16,8 km/h"), die Minute als km/h. Reine GPS-Sessions (ohne Bewegungsdaten) erreichen unplausible Werte (bis
26–29 km/h ueber eine Minute, 09.11. gemessen) — fuer Sprint-Bestenlisten „nur mit Bewegungsdaten" empfehlen.
Alte Sessions: `scripts/sprints-nachrechnen.py` (Trockenlauf ohne `--echt`).
**Verweis + Hervorhebung (11.11.2026):** Bestenlisten-Zeilen tragen `run_idx` (`T.lauf_dazu`: Einzel-Lauf-Kennzahlen aus
`best_*_idx`, Sprints aus `sprint_json.lauf`; auch eingefrorene Endstaende beim Abruf), die ganze Zeile ist ein Link —
Lauf (`?run=`), Session (Session-Kennzahlen) oder Profil (Summen). Sprint-Zeilen haengen `&sprint=<kennzahl>` an; die
Session-Seite zeichnet dann das gewertete Fenster (`sprint_json.fenster`, Session-ms, ab sprint VERSION 3) in Bernstein
auf die Karte und zeigt Wert + Lage im Lauf neben der Laufauswahl. 14913 Sessions am 11.11. nachgerechnet
(`--ohne-fenster`, 0 Werte geaendert; Stand davor in `~/sprint-vorher-2026-11-11.csv`). Apps: noch nicht portiert.
Team-Wertung globaler Events: bei Sprints der **Durchschnitt** der besten N (ueber die tatsaechlich mitgezaehlten), sonst
die Summe (`team_wertung(..., schnitt=True)`, Jan 09.11.: „mach es so das es sinn ergibt"); Web-Text `team.event.wertungSchnitt*`.
Erklaerseite `/nerd-analysen-sprints` (`NerdSprints.tsx`): oeffentlich seit 09.11.2026, nur Englisch.
Bestenlisten je Event: hoechstens 10 (`EVENT_MAX_TAFELN`, vorher 6; 09.11.2026 nach dem Einfrieren von Event 4). Native Editoren ab der naechsten App-Fassung, alte Apps zeigen den Knopf nur bis 6.
**Siegertreppchen** (09.11.2026, `web/src/components/EventPodest.tsx`): ueber der Bestenliste beendeter Events, seit
09.11.2026 mit denselben Rechten wie die Eventseite (zeigt nur deren Daten; Gaeste in Gastform), nur PWA. Folgt der gewaehlten Bestenliste; Fahrer als schwebende Foils (Gold/Silber/Bronze, Form
wie im Wappen von Team 9), bei globalen Events umschaltbar auf Teams: Foil je Team in Gold/Silber/Bronze (Mastlaenge = Platz), darauf je Mitglied ein Kopf (hell =
im Event gefahren, grau = nicht). Dafuer traegt `team_wertung` seit 09.11. `mitglieder` und `banner_url`/`banner_fokus` (aus
der festgehaltenen Zuordnung; aeltere Snapshots: Teamgroesse aus `team_zuordnung_json`; banner_* derzeit ungenutzt). Ton: Pixabay-Sound 484333
(Pixabay-Lizenz, keine Weitergabe der Datei allein) in `server/media/sounds/` mit Lizenzzertifikat, NICHT im Repo; spielt
bei jedem Betreten, Knopf + „Stumm" (localStorage).

**Endstand = Snapshot** (geprueft 09.11.2026, Jan: „der snapshot des fertigen ergebnisses … und nicht eine aktuelle
neuberechnung"): nach dem Einfrieren lesen alle Pfade nur noch `ergebnis_json` (Zeilen, Team-Wertung, Wappen je Zeile),
`summen_ergebnis_json` und `spots_fest_json`; `event_out`, Abzeichen (`abzeichen`) und das Teilen-Bild rechnen nichts neu,
Aendern gibt 409. Einzige Ausnahme mit Absicht: wer danach `global_events_aus` setzt, faellt aus den Fahrerzeilen
(Raenge ruecken nach), nicht aus der Team-Wertung. Neue Felder (Sprint-Bestenlisten, Durchschnitts-Team-Wertung) landen
automatisch im Snapshot, weil er die komplette `_event_voll`-Ausgabe speichert. Eingefroren wird alle 5 min per
`foil-events-einfrieren.timer` (`server/events_einfrieren.py`), zusaetzlich beim Abruf und nachts in `record_snapshot.py`.

## Teambild (01.11.2026)

Breites Bild ueber dem Teamkopf. Empfohlen 1600 x 500 px; gespeichert hoechstens 1600 px breit, nie zugeschnitten;
abgelehnt unter 800 px Breite oder wenn es nicht mindestens 1,5-mal so breit wie hoch ist. Angezeigt mit fester
Seitenverhaeltnis (2,5:1 Handy, 4:1 ab sm) ueber die volle Breite; der Fokuspunkt `banner_fokus` ("x,y" in Prozent, in
den Einstellungen per Antippen gesetzt, mit Vorschau 2,5:1 und 4:1) bleibt immer sichtbar. Das Bild selbst laeuft
durch die Freigabe (`frei_banner_url`), der Fokus nicht. Entfernen wirkt sofort auch aussen. Kein Verlauf darueber
(Markenregel).

## Verwaltung und Grundeinstellungen (01.11.2026)

`/teams/<slug>/verwalten` fuer Leitung UND Moderatoren: Anfragen (mit Spots und Sportarten der Anfragenden, nur
Session-Zahlen; darauf weist der Beitritts-Dialog hin), Mitglieder, Events (Moderatoren duerfen Events anlegen,
aendern, loeschen), Einladungslinks. `/teams/<slug>/einstellungen` nur Leitung: Freigabe, Auftritt mit Teambild,
Beitritt, Sichtbarkeit, Bestenlisten, Teamspots, Loeschen. Offene Anfragen erscheinen als Zahl am Team-Link auf
der Startseite und in „Meine Teams"; der Link fuehrt immer auf die Teamseite.

## Loeschen ist weich (01.11.2026)

Events und ganze Teams werden nur weich geloescht (`geloescht_am`, `geloescht_von`): ueberall ausgeblendet
(Adresse, Listen, Abzeichen, Chat, Einfrieren, Logbuch; Mitgliedschaften zaehlen nicht mehr, `T.mitglied` und
`T.mitglieder_ids` filtern), aber noch in der DB. Ein Papierkorb (wiederherstellen / endgueltig mit
`T.team_loeschen`) kommt spaeter. Kontoloeschung bereinigt auch geloeschte Teams und Events (DSGVO).

## Freigabe-Pruefliste (Admin, ab 01.11.2026)

Geprueft wird nur, was Gaeste ohne Login sehen: Name, Adresse, Beschreibung, Logo, Teambild, Farbe. Intern darf
ein Team machen, was es will. Beim ersten Team (01.11.) entstanden; je Antrag einmal durchgehen.

1. **Name:** lesbar, kein Tippfehler, keine Beleidigung, keine fremde Marke/Firma, die das Team nicht
   ist. Passt er zur Beschreibung (gleicher Teamname dort)? Was bedeutet er in der Landessprache?
2. **Adresse (Slug):** passt zum Namen; Sonderzeichen sinnvoll umgeschrieben (z. B. Ł -> l); kein
   Name einer Person, keine Verwechslung mit einem bestehenden Team oder einer Seite von uns.
3. **Beschreibung:** Sprache(n) erkennen und lesen (notfalls uebersetzen), Tippfehler, keine Kontaktdaten
   Privater, keine Werbung/Links als Hauptinhalt, keine Versprechen in unserem Namen. Zeilenumbrueche
   bleiben auf der Seite stehen.
4. **Logo und Teambild:** Inhalt unbedenklich (Nacktheit, Gewalt, Symbole), erkennbar auch klein (Wappen ~40 px),
   Freisteller/Hintergrund ok. **Rechte:** sieht es nach einem fremden Werk aus (Kunst, Foto, Markenlogo
   aus dem Netz), beim Teamleiter nachfragen, bevor es oeffentlich wird.
   Teambild immer GANZ ansehen (der Admin-Tab zeigt es so): den sichtbaren Ausschnitt waehlt die Leitung
   spaeter ohne neue Freigabe.
5. **Farbe:** aus der Palette, reicht in hell und dunkel.
6. **Umfeld (nur zur Kenntnis):** Mitglieder sind selbst beigetreten (`zustimmung_am` je Mitglied
   gesetzt), Mitgliederliste-Einstellung, Bestenlisten sinnvoll. Kein Freigabegrund, aber auffaellig,
   wenn z. B. ein Gewerbe dahintersteht.
7. **Ergebnis:** freigeben oder ablehnen; bei Ablehnung/Rueckfrage dem Teamleiter per DM schreiben, was
   fehlt (Entwurf an Jan).

## Native-Port (Stufe 4): technische Checkliste (Stand 01.11.2026)

Alles unten ist im Web fertig und laeuft ueber die API; die Apps muessen nur anzeigen und aufrufen. Quelle der Wahrheit
fuer Regeln bleibt der Server (`server/app/teams.py`, `server/app/api/teams.py`) — in den Apps nichts nachrechnen.

**Endpunkte** (`/api/teams`, mit Login; `/api/public/teams` ohne):

| Zweck | Aufruf |
|---|---|
| Eigene Teams (Home-Links, Badge offene Anfragen `anfragen`) | `GET /mine` |
| Alle freigegebenen Teams (Seite „Alle Teams") | `GET /liste` |
| Laufende, beendete bis 3 Tage nach dem Ende (eingefroren oder „Results pending") + in 7 Tagen beginnende Events (Community, seit 09.11.2026) | `GET /liste/events` |
| Kalender-Abo aller globalen Events (iCalendar, OHNE Login, nur Titel/Zeit/Beschreibung/Link; letzte 90 Tage + kommende; Knopf „Add to calendar" auf der Community-Seite, 09.11.2026) | `GET /api/public/events/global.ics` |
| Alle Events, seitenweise (laufend → kommend → vergangen) | `GET /liste/events/alle?offset=&n=` (n ≤ 50) |
| Teamseite | `GET /{slug}` (`meine_rolle`, `mein_status`, `anfragen_offen`, `anmeldungen_zulassen`, `automatisch_akzeptieren`, `bestenlisten_oeffentlich`, `chat_scope`) |
| Bestenlisten / Teamstatistik / Logbuch | `GET /{slug}/bestenlisten?period=` · `/{slug}/statistik?period=` · `/{slug}/logbuch` |
| Beitreten / Austreten | `POST /{slug}/beitreten` → `status` aktiv\|angefragt · `POST /{slug}/austreten` |
| Einladungslink ansehen / annehmen | `GET`/`POST /einladung/{token}` (Pfad `/teams/<slug>/join-<token>` bzw. `apply-<token>`) |
| Events des Teams / ein Event | `GET /{slug}/events` · `GET /{slug}/events/{id}` |
| Gast-Varianten | `GET /api/public/teams/{slug}` · `/api/public/teams/{slug}/events/{id}` (Gastform: nur Rang, Name, Initialen, Wert) |
| Verwaltung (Leitung+Mods) | Events `POST/PUT/DELETE /{slug}/events[/{id}]`, Eventbild `POST/PUT/DELETE /{slug}/events/{id}/banner`, Anfragen `GET /{slug}/mitglieder`, `POST …/mitglieder/{uid}/annehmen`, `DELETE …/mitglieder/{uid}` |
| Nur Leitung | `PUT /{slug}`, Logo/Teambild, `PUT /{slug}/tafeln`, `PUT /{slug}/spots`, Rollen `PUT …/rolle`, Einladungen, `POST /{slug}/freigabe`, `POST /{slug}/loeschen` (Name zur Bestaetigung) |

Fehler kommen als `detail`-Code (z. B. `event_leer`, `leiter_erst_uebergeben`, `nur_mitglieder`, `zu_viele_events`);
die Texte stehen im Web unter `team.err.<code>` und koennen 1:1 uebernommen werden.

**Event-Objekt** (`teams.event_out`) — Felder, die die Apps kennen muessen:
`status` (kommend | laeuft | auswertung | beendet), `start`/`ende` (ISO mit Zone) + `zeitzone`, `einfrieren_am`
(Upload-Frist = Ende + 4 h), `tafeln[]` (darf LEER sein), `summen_auswahl[]` + `summen{}` (Schluessel
`teams.EVENT_SUMMEN`: pumps, distance_m, time_s, sessions, runs, spots, aktive), `summen_sportart`/`summen_accel_only`
(nur ohne Bestenliste relevant), `ohne_dateien`, `teambild_zeigen`, `banner_url`/`banner_fokus`, `spots[]` (fuer Gaeste
leer). Kurzform fuer Listen (`_event_kurz`): zusaetzlich `sportarten[]` und `team{slug,name,logo_url,farbe}`, ohne Tafeln.

**Darstellung, die schon entschieden ist** (Web als Vorlage):
- Event-Kachel ueberall gleich (Teamseite oben/unten, Community, Alle Events): Titel, Status-Abzeichen (laeuft: Teamfarbe,
  sanft pulsierend 1→0,7, bei „Bewegung reduzieren" still), Sportart-Abzeichen (gelb, IMMER, auch Pumpfoil), Spot-
  Abzeichen, Zeitraum + Countdown in derselben Zeile (kommend: „Startet in", laeuft: „Endet in", Tage kurz ueber die
  Plattform-Formatierung), NUR die erste Zeile der Beschreibung (max. 2 Zeilen, fett), Link rechts auf Hoehe der letzten
  Zeile. Keine Sieger, keine Kennzahlen in der Kachel.
- Teamseite: kommende/laufende/bis 7 Tage alte Events oben, aeltere unten mit derselben Kachel.
- Event-Seite: Bild (eigenes, sonst Teambild wenn `teambild_zeigen`), Titel+Status, Zeitraum fett, Beschreibung fett mit
  Absaetzen; vor dem Start grosser Countdown, waehrenddessen „Endet in"; „Event gesamt"-Kacheln (nur angehakte Summen)
  ueber den Bestenlisten; Teilen-Leiste; Box „Event-Regeln" mit zuerst „Gemessen: …", „nur Uhr/App/Konto" (wenn
  `ohne_dateien`) und Upload-Frist (Status auswertung), dann die allgemeinen Regeln (`team.regeln.events.text`).
- Beitreten von der Event-Seite: Gast → Login und zurueck (Web: `?beitreten=1` oeffnet den Dialog); eingeloggt ohne
  Mitgliedschaft → Beitritts-Dialog mit Kleingedrucktem (`BeitrittDialog`), bei `angefragt` „Anfrage laeuft".
- Zurueck-Navigation: aus Event-/Team-Bestenliste in Session oder Profil muss „zurueck" dorthin fuehren (Web: Router-State
  `zurueck`/`zurueckText`).
- Teamfarben: 36 Schluessel (`{farbton}-hell|''|-dunkel`), Text/Rahmen und Flaeche getrennt (`web/src/lib/teamFarben.ts`:
  Text kontrastsicher, Flaeche hell = Tailwind 200/300 mit dunkler Schrift, dunkel = 700/900 mit weisser).
- Teambild/Eventbild: nie zugeschnitten gespeichert; Anzeige 2,5:1 (Handy) mit `object-position` aus `banner_fokus`
  („x,y" in Prozent).

**Regeln, die der Server erzwingt** (Apps nur Zustand anzeigen): Einfrieren 4 h nach Ende; Teilnehmer nach dem Ende
festgehalten (`teilnehmer_json`, Austritt/Beitritt danach aendert nichts); Loeschen weich; Moderatoren duerfen Events
und Anfragen, aber keine Rollen; Event ohne Bestenliste nur mit mind. einer Summe.

**Nicht Teams, aber im selben Zug fuer die Apps:** `metrics.avg_hr_foil` (Ø Puls nur ueber die Laeufe, Server-Cache
`hr_foil_json`) — als Hauptzahl anzeigen, `avg_hr` klein als „gesamt"; Sessionliste: `avg_hr_foil ?? avg_hr`.
Der Login-`next`-Merker (`foil_nach_login`) betrifft nur das Web.

**Stand Port 01.11.2026:** Android (`Teams.kt`, `TeamScreen.kt`, `TeamEventScreen.kt`, `TeamsListen.kt`, `I18nTeams.kt`)
und iOS (`Team*.swift`, `TeamsListen.swift`, `LocTeams.swift`, Generator `scripts/gen-loc-teams-ios.py`) haben Teamseite,
Event-Seite, Community-Events, „Alle Teams"/„Alle Events", Einstieg Home/Profil und den Foil-Puls. Android kompiliert,
iOS nur Syntax geprueft (noch nicht in Xcode gebaut); beide noch nicht auf einem Geraet getestet. OFFEN: Deep/Universal
Links (keine der Apps oeffnet bisher https://pumpfoil.org-Links; iOS braucht Associated Domains + apple-app-site-association),
Einladungslinks in der App, Event-Abzeichen auf der Foiler-Seite; Verwaltung bleibt im Browser.

**04.11.2026 (Jan): Gruenden und Verwaltung kommen nativ in beide Apps** („bitte die volle funktionalitaet auch nativ").
Vorlage: `web/src/pages/Teams.tsx` (Gruenden), `TeamEinstellungen.tsx` (Mitglieder, Einladungslinks, Freigabe, Auftritt mit
Logo/Banner, Beitritt, Sichtbarkeit, Tafeln, Spots, Loeschen), `components/TeamEventsVerwalten.tsx` (Events mit Eventbild).
Die Browser-Links aus dem ersten Port entfallen damit. Stand je App in `docs/UX-IA.md` (App-Port).

**Apps: was es dort vor dem Port noch gar nicht gab** — Teams-Einstieg (Profil/Home-Links), Teamseite, Event-Seite, Community-Abschnitt
„Laufende & kommende Events", Seiten „Alle Teams"/„Alle Events", Deep Links `/teams/<slug>`, `/teams/<slug>/events/<id>`,
`/teams/<slug>/join-…|apply-…`, Team-Chat (`chat_scope`, vorhandener Chat-Baustein), Abzeichen auf der Foiler-Seite
(`team_abzeichen` kommt schon mit `GET /api/community/foiler/{id}`). Verwaltung/Einstellungen koennen vorerst im Web
bleiben (Link „im Browser oeffnen").

## Team-Bestenlisten auf Community › Teams & Events (gebaut 03.11.2026, nur Web)

Jan: „leaderboards, aber eben nicht mit einzelpersonen sondern mit teams“, mit Umschalter beste 3 / 5 / 10 Fahrer neben
den ueblichen Zeitraeumen. `GET /api/teams/liste/vergleich?period=&top=` (`T.vergleich`), Abschnitt `TeamBestenlisten`
in `web/src/pages/Home.tsx`, Test `test_team_vergleich_beste_n`.
- **Kennzahlen:** Pumps, On-Foil-Strecke, On-Foil-Zeit, Sessions, Laeufe. Je Kennzahl die Summe der besten N Fahrer
  (je Kennzahl eigene Auswahl), daneben „aus N Fahrern“. Standard N = 5, Zeitraum 30 Tage.
- **Fuer alle Teams gleich gemessen:** Pumpfoil, Laeufe ohne Bewegungsdaten zaehlen mit, alle Spots; die eigenen
  Filter der Team-Tafeln gelten hier nicht (sonst nicht vergleichbar). Pumps gibt es naturgemaess nur mit Bewegungsdaten.
- **Welche Teams:** nur freigegebene mit oeffentlichen Bestenlisten. Mitglied in zwei Teams zaehlt fuer beide,
  Sessions vor dem Beitritt zaehlen mit (wie in den Team-Tafeln). Sichtbar fuer Eingeloggte.
- **Offen:** Apps (mit dem grossen Port); spaeter Filter nach Land/Region, Chronik „hat die Fuehrung uebernommen“.

## Ideen: Team gegen Team und Abzeichen (Plan, 01.11.2026)

Zwei Vorschlaege eines Nutzers (1:1-Chat mit Jan, 01.11.2026). Beide stehen als Satz unter „Ideas for future (Fall 2026-11-01-a)
development" auf /changelog (`appmeta.IDEEN`). **Nichts davon ist gebaut; vor dem Bau Jans Entscheidungen einholen.**

### Team gegen Team

Vorschlag: Ein Team darf beliebig gross sein, in den Vergleich gehen aber nur die besten 3 oder 5
Ergebnisse je Team. Jeder kann mitmachen und versuchen, unter die besten N zu kommen; ein grosses Team gewinnt nicht
allein durch seine Groesse. Jan: „wir machen auch ein team illmensee, und dann pumpen wir gegeneinander, meiste pumps
des gesamten teams gegen ein anderes team".

Plan, baut auf den Events auf (Zeitfenster, Spots, Vorlagen, Einfrieren, Ergebnis-Schnappschuss):
- **Herausforderung:** Leitung/Moderation von Team A legt ein Event an und waehlt ein Gegnerteam; die Leitung von B
  nimmt an oder lehnt ab. Erst nach der Annahme ist es sichtbar und zaehlt. Datenmodell: `team_events` um
  `gegner_team_id`, `gegner_status` (offen/angenommen/abgelehnt) und `wertung_n` erweitern (Migration ueber `want` in
  db.py), oder eine eigene Tabelle `team_duelle`, falls mehr als zwei Teams kommen.
- **Wertung je Kennzahl:** Teamwert = Summe (oder Durchschnitt) der besten N Einzelwerte der Mitglieder;
  `wertung_n` leer = alle (dann gewinnt die Teamgroesse, z. B. „meiste Pumps des ganzen Teams"). Beide Arten anbieten,
  Standard N = 5. Einzel-Bestenlisten darunter wie bisher, mit Teamfarbe je Zeile.
- **Einfrieren:** wie heute (24 h nach Ende, `teilnehmer_json`/`summen_ergebnis_json`), dazu der Teamwert beider Seiten.
- **Sichtbarkeit:** auf beiden Teamseiten; oeffentlicher Link nur, wenn beide Teams oeffentlich und freigegeben sind.
- **Offen fuer Jan:** Wer in beiden Teams ist — zaehlt fuer keins, oder waehlt beim Start? Nur zwei Teams oder auch
  mehrere (Liga)? Abzeichen fuer das Siegerteam? Darf das Gegnerteam Regeln (Spots, Dateien) mitbestimmen?

### Abzeichen (Achievements)

Vorschlag: ein Abzeichen bzw. Zaehler, wenn man als Erster an einem Spot pumpt („den Spot pumpbar macht"), und ein
Zaehler fuer die befahrenen Spots als eigene Kategorie. Jan dazu: Spot-Rekorde (wer wann wen ueberboten hat) sollen
ebenfalls zaehlen.
Weitere Idee (Nutzer-Feedback 02.11.2026, Jan: gehoert hierher, erstmal nicht): ein Zaehler „freigeschaltete Sportarten",
also wie viele der Sportarten man schon gefahren ist.

**Was heute wirklich geloggt wird (DB geprueft 01.11.2026, nur lesend):**
- `record_events` (seit 17.07.2026, 10 488 Eintraege, 275 Fahrer): jede Verbesserung einer Community-Bestmarke mit
  Vorhalter und Vorwert. Metriken distance, duration, speed, glide, runs; Scope global oder Spot; Fenster 10d/30d/365d/all.
  **Grenzen:** nur Pumpfoil und nur Sessions mit Bewegungsdaten (`_community` mit `accel_only=True`), also keine
  GPS-only-Rekorde und keine anderen Sportarten — obwohl die Spot-Seite Rekorde inzwischen je Sportart zeigt. Pumps fehlen
  als Rekord-Metrik. Erfasst 1x taeglich als Schnappschuss (records.py), was innerhalb eines Tages zweimal ueberboten
  wird, steht nur einmal drin (gewollt).
- `team_logbuch` (10 Eintraege): Team-Rekorde je Kennzahl und Sportart, mit Vorhalter.
- `feedback_beitraege`: Grundlage des Supporter-Badges.
- Event-Ergebnisse: eingefroren in `team_events` (Top 3 haben schon ein Abzeichen im Profil).
- **Nicht geloggt:** wer als Erster an einem Spot gefahren ist und wie viele Spots jemand befahren hat. Beides laesst
  sich aber aus `sessions` ableiten (frueheste Session je `spot_id` bzw. `count(distinct spot_id)` je Fahrer; 740 Spots
  mit Sessions). Vorsicht: Spots werden zusammengelegt (139 mit `merged_into`) und getrennt (`spot_trennungen`) —
  deshalb rechnen statt speichern, sonst stimmt ein gespeicherter Erstfahrer nach einem Merge nicht mehr.
  Meilensteine (Pump-Millionen usw.) sind ebenfalls nicht geloggt, aber aus den Summen ableitbar.

**Plan:**
1. **Stufe 1, nur abgeleitet, keine neue Tabelle:** Abzeichen im Profil fuer „Erster am Spot" (Anzahl Spots),
   „Spots befahren" (Stufen 1/5/10/25), „Rekorde gebrochen" (1/5/10/100 aus `record_events`), Event-Podien, Supporter.
   Rechnen per Abfrage mit Cache wie die Teamsummen.
2. **Stufe 2, Log erweitern:** `record_events` um Sportart und GPS-only ergaenzen (records.py, eigene Scopes), Pumps als
   Metrik. Aendert die Rekord-Pushes mit — vorher pruefen, dass es keine Push-Welle fuer alte Rekorde gibt
   (Memory „nie nachtraeglich pushen", `PUSH_FRISCH_TAGE`).
3. **Offen fuer Jan:** Zaehlt „Erster am Spot" schon, wenn nur eine Person dort je gefahren ist (dann ist jeder Heimpool
   ein Erstfahrer-Abzeichen), oder erst ab zwei Fahrern? Nur Pumpfoil oder je Sportart? Fahrer mit verborgenem Ort
   (Freunde-Funktion) ausnehmen? Sessions vor dem eigenen Konto (FIT-Import alter Fahrten) mitzaehlen?

### Event-Idee: GPS-Kunst — „Wer malt das coolste Bild aufs Wasser?" (Jan, 10.11.2026; GEBAUT 18.11.2026, Web + Server)

**Stand 18.11.2026 (Infrastruktur, Jan: „mir schwebt ein laengeres Event in der Adventszeit vor … alle paar Tage ein Pool
… oder 4 Events fuer die 4 Adventswochen")** — `server/app/kunst.py` (Regeln), `server/app/api/kunst.py`,
`web/src/components/KunstBereich.tsx`, Tests `server/tests/test_kunst.py`:
- Event-Vorlage „gpskunst" im normalen Event-Dialog: keine Bestenlisten, stattdessen „Neue Runde alle N Tage" und
  „Abstimmung danach M Tage" (`team_events.kunst_json`). Das Eventfenster wird in Runden geteilt; nach jeder Runde M Tage
  Abstimmung, waehrend die naechste schon laeuft. Damit gehen beide Varianten: ein Advents-Event mit 4 Wochenrunden oder
  4 Events mit je einer Runde. Global (offizielles Team) = alle; Team-Event = Mitglieder; Mehrteam = Beteiligte.
- Entscheidungen Jan 18.11.: **3 Herzen je Runde** (nicht fuers eigene), **alle Sportarten**, seit 18.11. spaet auch an Land
  (Snowkite/Landkite/Buggy), **1 Bild je Fahrer und Runde** (bis Rundenende austauschbar), **Zwischenstand verborgen** bis
  Ende der Abstimmung, dann Aufloesung mit Name, Spot (nur wenn nicht verborgen) und Link.
- Einreichen: eigene Session der Runde waehlen, von/bis zuschneiden, drehen (Vorschau im Browser). Gespeichert wird nur
  die normierte Linie 0..1000 (`kunst_bilder.linie_json`), keine Koordinaten. Galerie je Betrachter zufaellig, stabil.
- Moderation: Melden (jeder), Entfernen/Zurueckholen mit Grund (Admins, Leitung/Moderation des Teams); der Fahrer sieht
  den Grund, ein entferntes Bild kann er nicht still ersetzen.
- Aufloesung (19.11.2026): beim ersten Ansehen einer fertigen Runde Vollbild-Enthuellung Platz 3 -> 2 -> 1 (Linie in
  5 s gefahren, zweimal blinken, Name + Herzen, 2 s, Ueberblendung auf die echte Karte 2 s mit Countdown), Jingle
  zweimal; danach „Alle Plaetze ansehen". Erneut per Knopf; in der Ergebnis-Galerie „Abspielen" je Bild.
- Karte im Event ist ein **Bild vom Server** (`GET /api/kunst/bild/{id}/karte.png`, Satellit, Norden oben, Nennung
  eingebrannt, Kacheln ueber `maptiles` wie das Teilen-Bild, Cache `DATA_DIR/cache/kunst/`) — keine interaktive
  Karte (Jan: „hier ist das overkill", zoomen in den Session-Details). Aussehen geaendert -> `KARTE_FASSUNG` hoch.
- „Ort verbergen" (19.11.2026): Karte, Kartenbild und Spotname zeigen **Point Nemo fuer alle**, auch den Fahrer selbst
  und Freunde (wie die Session-Details). Das echte Kartenbild wird dann nie gerendert, der Cache (Schluessel mit `-nemo`)
  haengt nicht vom Betrachter ab. Linie, Laufwerte und Foto bleiben.
- Shadowban (19.11.2026): Bilder und Herzen versteckter (`users.hidden`) oder gesperrter Konten zaehlen fuer andere nicht
  und erscheinen nirgends (Galerie, Anzahl, Aufloesung, Einzelabruf per ID -> 404). Der Betroffene sieht alles wie immer
  (eigene Bilder, eigene Herzen gezaehlt), Admins sehen alles (`kunst.sieht_bild` / `zaehlt_herz`).
- Gleichstand: GPS-Kunst kennt gleiche Plaetze (gleiche Herzenzahl) -> Treppchen mit mehreren Bildern je Stufe, Enthuellung
  zeigt alle Plaetze <= 3. **Normale Events bleiben bei der Zeitregel** (gleicher Wert -> frueher gestartete Session vorn,
  Raenge eindeutig; Jan 19.11.2026). Gleiche Plaetze dort waeren eine Regelaenderung, nur ab Stichtag.
- Enthuellung zeigt nach der Karte das erste Session-Foto (2 s, nur sichtbare: nicht geblockt, Medienfreigabe beachtet).
- Apps: Android/iOS-Port vom 18.11. (interaktive Karte) — Enthuellung, Kartenbild und Abspielen noch nachziehen.
- Offen: Finale der Rundensieger, Teilen-Bild der Siegerehrung, Benachrichtigung bei Rundenstart/-ende.

Fuer das uebernaechste globale Event (nach dem Sprint-Wochenende). Nur festgehalten, nichts gebaut.

- **Einreichen:** Jeder waehlt eine eigene Session, trimmt sie selbst (von/bis, mit Vorschau des Tracks) und darf das
  Bild rotieren.
- **Bewertung durch die Community**, aber **anonym**: nur der Track als Linie auf weissem
  Grund — keine Karte, kein See, kein Name, kein Team. Damit Teams nicht nur sich selbst hochvoten; nebenbei verraet
  ein nackter Track keinen Heimatspot.
- **Moderation (Jan, entschieden):** Humor bleibt, auch wenn ein Penis gewinnt. Nur wirklich Verbotenes
  (Hakenkreuz u. Ae., §86a) wird aussortiert. Legal bleibt, illegal fliegt.
- **Gedanken zur Umsetzung (Vorschlaege, nicht entschieden):** Reihenfolge der Galerie je Betrachter zufaellig (sonst
  gewinnen frueh eingereichte Bilder); eine Stimme je Nutzer und Bild oder Paarvergleich „welches ist cooler?";
  Track metrisch projizieren und auf ein gemeinsames Format normalisieren (sonst gestaucht je Breitengrad, und der
  grosse See haette mehr Platz als der Weiher); Melde-Knopf plus Admin-Blick vor dem Ende; nach Voting-Schluss die
  Aufloesung mit Namen, Teams und Spots als Siegerehrung.
- **Zeitplan (Jan, 11.11.2026):** erst in der PWA entwickeln, danach in die nativen Apps — NICHT in Android 1.1.49
  (das traegt nur die Neuerungen vom 10./11.11.).

### Globale Events vorschlagen: „Promote as public event" (Jan, 15.11.2026; GEBAUT 16.11.2026, Web + Server)

**Stand 16.11.2026 (Jans Entscheidungen):** 1) Umhaengen statt Kopie: das Event bleibt beim Team, bekommt `global_event`
und zeigt „promoted by <Team>" (Kachel, Eventseite, `promoted_by` in der API). 2) Nach dem Annehmen aendert Titel,
Zeitraum, Wertung, Spots nur noch der Admin; das Team pflegt Beschreibung und Bild, Loeschen nur Admin (409 `promoted`).
3) Referees: das vorschlagende Team + Leitung/Moderation des offiziellen Teams (= globale Moderatoren) + Admins (gilt
fuer alle globalen Events). 4) Vorschlag mind. 3 Tage vor dem Start (`VORSCHLAG_VORLAUF`), nur freigegebene Teams.
5) Keine Push: die Entscheidung zaehlt beim Team-Marker (`anfragen` in /mine), bis Leitung/Moderation das Event oeffnet.
Technik: Spalten `team_events.vorschlag_*`; `POST/DELETE /api/teams/{slug}/events/{id}/vorschlag`;
`GET/POST /api/admin/teams/event-vorschlaege[/{id}]` (Admin › Teams, zaehlt im Reiter-Badge); Team-Wertung schliesst
nur das offizielle Team aus (`global_ausser`), das ausrichtende zaehlt mit; iCal-Feed enthaelt alle globalen Events.
Regeln (global/referee) angepasst, REGELN_STAND 2026-11-16b. Offen: Apps.

Urspruengliche Skizze:

Jan: „ich will das jeder globale events vorschlagen kann, vielleicht indem man ein team gruendet, ein event anlegt, und dann
sowas wie 'promote as public event' anklickt, bei mir dann zum review auftaucht und ich das dann freischalten kann /
uebernehmen kann inkl. allen einstellungen, bannern, etc., und einen kleinen 'promoted by team x' oder so mit anzeigt".
Skizze, an Bestehendes angelehnt:
- **Vorschlagen:** Leitung eines freigegebenen Teams legt ein normales Team-Event an (alle Einstellungen, Banner, Fenster,
  Kennzahlen) und klickt „Als globales Event vorschlagen". Status am Event: vorgeschlagen / angenommen / abgelehnt.
- **Pruefen:** Vorschlag erscheint bei Jan in Admin (wie die Team-Freigabe-Pruefliste); ansehen, anpassen, annehmen oder mit
  kurzer Begruendung ablehnen. Annehmen = Event wird global (heute: nur im offiziellen Team `TEAM_GLOBAL`, `global_event`),
  mit allen Einstellungen und Bannern uebernommen — Kopie ins offizielle Team oder Umhaengen, offen.
- **Anzeigen:** kleines „promoted by <Team>" mit Link zum Team auf Karte und Eventseite (auch Apps).
- **Offen:** Kopie vs. Umhaengen (was passiert mit dem Team-Event, Teilnehmer-Zusagen?); wer danach aendern darf (Team oder
  nur Admin); Vorlauf (Vorschlag mind. X Tage vor Start, damit Review rechtzeitig); Ueberschneidung mit anderen globalen
  Events; Push/Benachrichtigung an das vorschlagende Team bei Entscheidung; Texte in allen Sprachen; Apps-Port.

### Events unter mehreren Teams (Jan, 16.11.2026; GEBAUT, Web)

Ein Team-Event kann andere Teams einladen; das eingeladene Team (Leitung/Moderation) nimmt an oder lehnt ab.
Tabelle `team_event_teams` (event_id, team_id, status eingeladen|angenommen|abgelehnt, wer/wann eingeladen/beantwortet).
- **Einladen/Entfernen:** nur Leitung/Moderation des ausrichtenden Teams, im Event-Editor (Block „Mit anderen Teams
  austragen", erst bei gespeicherten, nicht globalen Events). Abgelehnte lassen sich erneut einladen. Nach dem Ende haelt
  Entfernen vorher den Teilnehmerstand fest.
- **Annehmen/Ablehnen:** Karte oben auf der Teamseite des eingeladenen Teams (nur Leitung/Moderation); nach dem Ende 409.
- **Sichtbar** nur fuer Mitglieder beteiligter Teams (ausrichtend + angenommen), nie ohne Login, kein Teilen-Link; auf der
  Teamseite des Gast-Teams erscheint die Kachel mit dem ausrichtenden Team und verlinkt dorthin.
- **Wertung:** Teilnehmer = Mitglieder aller beteiligten Teams; zusaetzlich Team-Wertung wie bei globalen Events. Wer in
  mehreren beteiligten Teams ist, zaehlt fuer EIN Team (Wahl auf der Eventseite, sonst Primaerteam), festgehalten wie global.
- **Referee** bleibt allein beim ausrichtenden Team.
- **Bezug zu „Promote as public event" (oben):** dieselbe Grundform „Event eines Teams, freigegeben fuer mehr" — dort gibt
  Jan ein Team-Event fuer ALLE frei, hier laedt ein Team gezielt andere ein. Beim Bau von Promote die Sichtbarkeits-
  und Zuordnungslogik (`darf_event_sehen`, `team_zuordnung`, `mit_teamwertung`) wiederverwenden statt doppelt bauen.
- **Hinweis:** keine Push (Jan); offene Einladungen zaehlen beim Team-Marker (`/api/teams/mine` → `anfragen`) mit wie Beitrittsanfragen.
- **Offen:** Apps-Port (Apps zeigen den Marker schon, haben aber noch keine Einladungskarte).

## Stufen

1. **Kern (Web):** Teams, Rollen, Beitritt (zwei Schalter + join/apply-Links mit QR-Code), Registrierung
   mit Beitritt, Mitgliederliste einstellbar, Teamspots, Tafeln mit Filtern aus vorhandenen Kennzahlen,
   Teamseite `/teams/<slug>`, Home-Links, Profil-Seite, Logo + Farbpalette, Freigabe im Admin,
   Community-Abschnitt, oeffentliche Bestenliste ohne Login, sicheres Loeschen.
2. **Leben ins Team:** Teamsummen/-statistik, Team-Logbuch, Bestenliste als Bild, Team-Chat.
3. **Events:** Zeitfenster, Spots, Vorlagen, Einfrieren, Abzeichen.
4. **Native Apps:** Home-Links, Teamseite, Deep Links `/teams/…/join-…` und `…/apply-…`.
5. **Spaeter:** Geisterrennen Top 5, neue Kennzahlen (Pipeline), Rekord-Benachrichtigungen je Team.

## Globale Events (06.11.2026)

Jan: „ein neues 'global events' konzept, an dem automatisch jeder teilnimmt wenn er entsprechende stats sammelt, mit
leaderboards, und auch einem eigenen leaderboard je team, aber ganz ohne teilnahme zusage". Gebaut als Option am
Team-Event (`team_events.global_event`, `team_wertung_n`), Rechnung in `app/teams.py` (Abschnitt „Globale Events"):
- **Wo:** nur im offiziellen Team (`server/.env` `TEAM_GLOBAL=<slug>`, Jan legte „Pumpfoil" an). Leitung und
  Moderatoren dieses Teams sehen beim Anlegen den Haken „Globales Event". Das Team taucht nirgends als Team auf
  (Alle Teams, Team-Vergleich, aktivste Teams, Team-Rangliste der Events). Reservierte Adressen wie `pumpfoil` duerfen
  nur Admins vergeben.
- **Wer zaehlt:** jeder mit passenden Sessions im Fenster, ohne Beitritt — dieselbe Regel wie die Community-
  Bestenlisten (versteckte/gesperrte Konten fehlen). Opt-out im Profil › Privatsphaere „Nicht an globalen Events
  teilnehmen" (`settings.global_events_aus`, `teams.global_aus`): fehlt dann in Bestenlisten, Team-Wertung, Summen
  und Abzeichen, auch in schon beendeten (dort nur in der Ausgabe, Raenge rutschen nach).
  **Hinweis fuer Abgemeldete (15.11.2026):** wer das Opt-out gesetzt hat, sieht unter „Global events" (Community,
  Alle Events) ein Badge und auf der Eventseite statt „Alle nehmen automatisch teil …" hervorgehoben „Du hast dich von
  globalen Events abgemeldet. Aendern unter …" (Web `GlobalAusHinweis.tsx`, Android/iOS nur Eventseite). Anlass: ein
  Fahrer fehlte im Sprint-Ranking und wusste nichts vom eigenen Opt-out.
- **Team-Rangliste** je Bestenliste: Summe der besten N Mitglieder (Standard 5, 0 = alle; Sprints: Durchschnitt), nur
  freigegebene Teams mit oeffentlichen Bestenlisten (wie der Team-Vergleich).
- **Primaeres Team (10.11.2026):** wer in mehreren solchen Teams ist, zaehlt nur fuer EINES (bis dahin fuer alle):
  die Wahl fuer dieses Event (`team_event_teamwahl`, Eventseite, `PUT …/events/{id}/mein-team`), sonst das primaere
  Team (`team_mitglieder.primaer`, „Meine Teams" ★, `PUT /api/teams/{slug}/primaer`), sonst das groesste (aktive
  Mitglieder), bei Gleichstand das frueher beigetretene (`teams.team_fuer`). Kein einmaliges Nachtragen in der DB —
  die Regel „groesstes Team" ist der Standard. Verlaesst man das primaere Team, gilt automatisch das naechste.
  **Gespeichert statt neu bestimmt (11.11.2026):** `T.primaer_festhalten` speichert das Team, fuer das man gerade antritt,
  sobald es eine Rolle spielt — VOR Beitritt/Annahme/Freigabe/Sichtbarkeit (das bisherige bleibt), NACH Austritt/
  Entfernen/Loeschen (das groesste der verbleibenden). „Groesstes Team" gilt nur noch im Moment des Speicherns; vorher
  wurde es bei jedem Abruf neu bestimmt und konnte mitten im Event still wechseln. Am 11.11. fuer 5 Fahrer nachgetragen.
  Markieren (★) laesst sich JEDES Team mit aktiver Mitgliedschaft ausser dem offiziellen (`waehlbar`, 11.11.2026, Jan:
  „es geht doch nur um die markierung"); zaehlt das markierte nicht (nicht freigegeben/nicht oeffentlich), gilt in
  globalen Events die Standardregel. Stern auch auf der Teamseite und in Home › Team.
  Aenderbar bis 6 h vor Event-Ende (`TEAMWAHL_SCHLUSS`); wer in den letzten 6 h das primaere Team wechselt, behaelt in
  laufenden Events das bisherige (`teamwahl_festhalten`). Regeltext `team.regeln.global.text` (18 Sprachen).
  Nach dem Ende bzw. bei geschlossener Teamwahl zeigt die Eventseite „Du bist angetreten für <Team>" aus der Zuordnung des
  Events (`event.angetreten`; Events vor dem 10.11. koennen mehrere Teams zeigen, Jan 11.11.: nicht rueckwirkend aendern).
- **Filter „mein Team"** (`GET …/events/{id}?team=<slug>`): nur dessen Mitglieder, mit dem Rang der Gesamtwertung.
- **Sichtbar:** fuer jeden Angemeldeten und als Gast-Link, auch wenn das offizielle Team nicht oeffentlich ist.
  Eingefroren wird mit allen Zeilen (bis 5000 je Bestenliste), damit Team-Wertung und Team-Filter danach stimmen.
- **Community:** Abschnitt „Globale Events" — seitdem stehen dort und in „Alle Events" NUR globale; Team-Events nur
  auf der Teamseite (Jan: „team-interne events interessieren niemanden ausser den team-mitgliedern"). Karten tragen
  „Global"; auf der Profilseite steht bei Abzeichen aus globalen Events „Global" statt des Teams.
- **Apps:** noch nicht portiert (docs/TODO.md Port-Liste).

### Wertungsklasse (10.11.2026)

Jan: Profilfeld „m/w/divers/nicht eingetragen", um Event-Bestenlisten nach Geschlecht zu filtern; Name „Wertungsklasse"
(Sportwertung, keine Identitaetsangabe). `settings.wertungsklasse`: "" keine Angabe (Standard) | `w` | `m` | `nb`,
freiwillig, selbst gewaehlt, nie geprueft (wie Strava/Laufserien). Filter auf der Eventseite (`?klasse=`, `teams.
klassen_angebot`/`nach_klasse`): eine Klasse erscheint ab **1 Teilnehmenden** (`KLASSE_MIN`; Jan 11.11.2026, vorher 3);
bleibt danach nur **eine** Klasse uebrig (z. B. reines Frauen-Event), gibt es **keinen** Filter (Jan). Gefiltert auf den
vollen Zeilen, Rang in der Klasse, `rang_gesamt` bleibt; Gaeste ohne Filter; „keine Angabe" steht nur unter „Alle".
Community-Ranglisten haben den Filter noch nicht; Apps: Port-Liste in docs/TODO.md.

### Waehrend eines Events ueberwachen (Jan, 10.11.2026)

Jan: „schon waehrend des events, wir bleiben dabei, schauen auch auf meldungen im feedback & chat und ueberwachen die
daten". Erster Einsatz: Flying Sprint Weekend (Event 11, Sa 14.11. 05:00 bis So 15.11. 16:00). Mehrmals am Tag:

1. **Posteingang** (Skill `posteingang`): Chats an das Assistenten-Konto, oeffentlicher Chat, Feedback, GitHub — Meldungen
   wie „mein Sprint fehlt", „Lauf abgeschnitten", „falsche Zeit".
2. **Tempogrenzen** (Pumpfoil/Foil Scoot: 25 km/h Band, 32 km/h Lauf-Spitze, gps.py): rein lesend
   `cd server && OMP_NUM_THREADS=1 .venv/bin/python ../scripts/bandgrenze-messen.py --detection alle --seit "2026-11-14 05:00+01" --bis "2026-11-15 16:00+01"`
   — zeigt Stuecke ueber der Bandgrenze direkt an einem Lauf und wegen der Spitze verworfene Laeufe. Echte Sprints
   (Doppler und Position stimmen ueberein, kein Auto/Boot) Jan vorlegen; er holt sie in der Session zurueck. Probe auf
   das Wochenende 08./09.11.: 156 Sessions, 5 Stuecke, 6 verworfene Laeufe.
3. **Bestenlisten** auf der Eventseite gegen die Daten: Spitzenwerte unplausibel (100 m unter ~11,5 s = ueber 32 km/h)?
   Haengende Uploads (`status` recording/complete ohne Analyse) der Teilnehmer?

**Ablauf, der sich bewaehrt hat (Flying Sprint, 15.11.2026; Jan: „das hat gut funktioniert, plan und vorgehen merken"):**

1. *Letzte Stunden bis zum Einfrieren (Ende + 4 h)*: **Event-Wache** als Monitor (je Zeile eine Meldung, alle 2 min, nur
   lesend; ein Monitor laeuft max. 30 min, dann neu starten):
   `cd server && DATABASE_URL="$(sed -n 's/^DATABASE_URL=//p' .env)" .venv/bin/python -u ../scripts/event-wache.py --event <id>`
   Meldet jede neue/geaenderte Session im Fenster (zaehlt ja/nein, Werte) und jeden Top-5-Wechsel; AUFFAELLIG bei fremder
   Aufnahme-Sportart (surfing, windsurfing …), Schnitt > 18, max > 30, 100 m > 25, 1 min > 22 km/h, Konto < 2 Tage.
   Am 15.11. stand eine Wingfoil-Session (Aufnahme „surfing", 24,8 km/h ueber 1 min) kurz auf Platz 1, bis Jan sie per
   „sieht nicht nach Pumpfoilen aus" aussortierte. Aussortieren macht Jan selbst, ich melde nur.
2. *Schiedsrichter-Faelle* (Meldungen im Chat): erst die Daten (Laufgrenzen, Tempo je Sekunde, p des Modells, Abdeckung
   mit Uhr-Tempo), dann Jan einen Vorschlag mit Zahlen. Bei klarem Analysefehler und Jans OK nur die EINE Session
   korrigieren: Sicherung nach `server/data/sicherung/`, Trockenlauf, schreiben, danach
   `scripts/auswertung-festhalten.py <id> --notiz … --echt` (sonst ueberschreibt die naechste Analyse die Korrektur;
   `scripts/sprints-nachrechnen.py` beachtet das Festhalten NICHT, waehrend eines Events nicht starten). Die allgemeine
   Loesung kommt nach dem Event in docs/TODO.md. Faelle am 15.11.: Lauf 3 ms unter 60 s (v3-Glaettung), Uhr ohne
   durchgehendes Tempo, Opt-out ohne Absicht (Einstellung erst nach ausdruecklichem OK des Fahrers umgestellt), doppelte
   Aufnahmen (es zaehlt nur der beste Wert je Fahrer). Ein Spitzenwert ist plausibel, wenn das Uhr-Tempo je Sekunde
   gleichmaessig ist und Position/Doppler passen (100-m-Spitze am 15.11.: Doppler 25,7, Wertung 26,3 km/h). Zwei gleiche
   Uhren an einer Person streuen je 100-m-Lauf um ±1 km/h, Abstaende darunter sind Rauschen.
3. *Endstand-Banner fuer Shorts* VOR dem Einfrieren vorbereiten (Jan schneidet das Video parallel):
   `server/.venv/bin/python brand/events/flying-sprint-2026-11/render-ergebnis.py <zielordner>`: Titel mit Teilnehmenden
   (Zahl wie die Eventseite, `summen.aktive`), Top 3 je Bestenliste mit Flagge, Zeit (100 m) bzw. Strecke (1 min), Werte
   genau aus der Auswertung. Namen nur in den PNGs. Fuer das naechste Event Vorlage kopieren und Kennzahlen anpassen.
4. *Nach dem Einfrieren* (Timer `foil-events-einfrieren`, alle 5 min): warten bis `team_events.eingefroren_am` gesetzt ist,
   Top 3 der eingefrorenen Wertung mit den Bannern vergleichen, Banner neu rendern (am 15.11. byte-gleich), Jan melden.

Nach dem Event mit diesen Zahlen entscheiden, ob die Grenzen fuer Sprint-Events hochgehen (Nachrechnung 30/40 km/h:
`scripts/bandgrenze-regression.py`, kein Bestwert betroffen; Recherche 10.11.: Weltspitze vermutlich 11-13 s auf 100 m).

## Entwurf: Wertung je Lauf + Referee Board (16.11.2026, ZUR FREIGABE — noch nichts gebaut)

Fasst vier Wuensche zusammen (docs/TODO.md, A1 + A+): Laeufe am Eventschluss abschneiden (14.11.), doppelte Laeufe aus
paralleler Aufnahme einmal zaehlen (15.11.), Session-Kennzeichen „zaehlt fuer Event" mit Event-Kategorie-Dropdown (14.–16.11.),
Referee Board (16.11.). Alle brauchen dieselbe Antwort: **welche Laeufe zaehlen fuer dieses Event?**

**Befund (rein lesend, 16.11.):** Flying Sprint (Event 11): 125 Sessions im Fenster, 5 davon mit 32 Laeufen NACH dem
Schluss; bei einer stammen die gewerteten Sprints 100 m + 1 min aus einem Lauf nach dem Schluss. Event 4: 157 (Fall 2026-11-16-b)
Sessions, 1 mit 1 Lauf danach, 1 VOR dem Start begonnen mit 7 Laeufen im Fenster (zaehlen heute gar nicht). Doppelte Laeufe
(selber Fahrer, Start +-10 s) im Fenster: Event 11 2 Laeufe bei 1 Fahrer, Event 4 keine; im ganzen Bestand 77 ueberlappende
Session-Paare bei 24 Fahrern (viele davon gewollte Brett-Paare).

### 1. Ein Baustein: `zaehlende_laeufe(event)`
Ein Lauf zaehlt, wenn
1. er im Fenster BEGINNT (`start <= Laufstart < ende`) und zaehlt dann VOLLSTAENDIG, auch wenn er nach dem Schluss endet —
   egal, wann die Session startet oder endet; wer zu frueh oder zu spaet losfaehrt, zaehlt nicht (Jan 16.11.);
2. er kein Duplikat ist: Laeufe desselben Fahrers aus verschiedenen Aufnahmen derselben Fahrt (Start UND Ende je <= 10 s
   auseinander) bilden EINEN logischen Lauf. **Jan 16.11.:** es zaehlt „das bessere bzw. kombinierte" — gehoert zum
   allgemeinen Umgang mit Mehrfach-Aufnahmen (FIT-Import, eigene Uhr, Garmin Connect, Handy am Brett, zweite Uhr): im
   Prinzip alle zusammen auswerten, je mehr Daten desto besser (je Kanal die beste Quelle, s. docs/TODO.md „Zwei Aufnahmen
   derselben Fahrt: Puls …" und „Doppelte Laeufe …"). Bis diese Fusion steht: je Gruppe der Lauf aus der Aufnahme mit der
   besseren Datenlage;
3. ein Referee ihn nicht ausgenommen hat (s. 3.).
Schluessel eines Laufs ist (session_id, Laufstart in Session-ms), nicht der Index — nach einer Neuauswertung verschieben
sich Indizes (heute z. B. A5), die Startzeit nur um <= 2 s; Zuordnung mit Toleranz 3 s.

Sessions kommen in Frage, wenn sie das Fenster UEBERLAPPEN (nicht mehr nur `started_at` im Fenster). Brett-Paare (Handy am
Brett + Uhr) und Garmin-Connect-Kopien sind schon je Session verknuepft und zaehlen wie heute nur einmal.

### 2. Kennzahlen aus den zaehlenden Laeufen
- Summen (Laeufe, Strecke, Zeit, Pumps) = Summe ueber die zaehlenden Laeufe (`segments_json`).
- Bestwerte je Lauf (laengster, weitester) und Sprints (`sprint_json.laeufe[k]`) = Maximum ueber die zaehlenden Laeufe.
- Session-Kennzahlen (`session_pumps` …): Summe der zaehlenden Laeufe dieser Session.
Heute rechnet `teams.tafel_berechnen` per SQL aus den Session-Spalten; neu je Event in Python ueber `segments_json` der
Sessions im Fenster (Event 11: 125 Sessions — unkritisch), 2-min-Cache wie heute. Team-Bestenlisten ausserhalb von Events
bleiben je Session (kein Fenster).

### 3. Referee Board (Web, fuer Event-Leiter + Moderatoren des Teams und Admins)
- Ansicht je Event: alle zaehlenden Laeufe der Top-Plaetze je Bestenliste, mit Auffaelligkeiten: andere Sportart erkannt/
  gemeldet (`strittig`), Uhr-Tempo-Anteil im Sprint-Fenster, Tempo deutlich ueber dem Bestand, Lauf nahe am Eventschluss,
  Duplikat-Gruppe. Klick oeffnet die Session mit hervorgehobenem Lauf.
- Knopf „Lauf aus der Wertung nehmen": Grund als Vorauswahl (andere Sportart · Messfehler (GPS-/Tempo-Sprung) · doppelte
  Aufnahme · Fremdkraft (Welle, Boot, Zug) · ausserhalb des Eventfensters · Sonstiges) + **oeffentlicher Kommentar** +
  **interne Notiz**. Rueckgaengig moeglich (bleibt im Protokoll).
- Neue Tabelle `event_korrekturen` (event_id, session_id, lauf_start_ms, grund, kommentar_oeffentlich, notiz_intern,
  von_user_id, am, aufgehoben_von, aufgehoben_am).
- **Oeffentliche Anzeige** am Event („Korrekturen des Referees"): Fahrer, Bestenliste, Wert vorher/nachher, Grund,
  oeffentlicher Kommentar, Zeit. Die interne Notiz sieht nur das Board. Der betroffene Fahrer bekommt eine Benachrichtigung.
- **Zeitrahmen:** waehrend des Events und bis 24 h nach dem Festschreiben (`eingefroren_am`). In dieser Zeit rechnet jede
  Korrektur den Endstand neu (`ergebnis_json` neu schreiben, `eingefroren_am` bleibt); danach endgueltig.
- Laeufe HINEINnehmen (nicht erkannt, Laufgrenzen falsch) bleibt vorerst bei Claude (Sicherung + auswertung-festhalten).
- **Gebaut 16.11.2026** (app/referee.py): entwurf -> offen (zur Pruefung, interne Diskussion) -> veroeffentlicht (mit
  ausdruecklicher Bestaetigung) | abgelehnt; veroeffentlicht -> aufgehoben. **Ein Referee reicht** (Jan: „wir haben keine 2
  referees derzeit, ich muss das alleine koennen/duerfen, und die team-admins & moderatoren genauso").
- **Spaetere Ausbaustufe (Jan 16.11.):** je Team einstellbar, wer veroeffentlichen darf — (a) jeder Referee allein (heute),
  (b) nur zu zweit (Vier-Augen), (c) Leiter/Admins veroeffentlichen, Moderatoren duerfen nur vorschlagen (bis „zur Pruefung").

### 4. Session-Seite
- Kennzeichen „zaehlt fuer <Event>" (mit Platz, Link) im Kopf und in der Lauf-Liste je zaehlendem Lauf; ausgenommene
  Laeufe grau mit Grund.
- Dropdown „<Event-Kategorie>" neben dem Pumps-Umschalter, fuer JEDEN, nur bei Sessions in einem Event: Liste der
  laufbezogenen Kennzahlen vom Server (heute `sprint_*`, generisch fuer spaetere), hebt je Lauf das Fenster auf Karte/
  Verlauf/Tabelle hervor. Dafuer speichert `sprint.py` die Fenster je Lauf und Kennzahl (neue sprint-VERSION; heute nur das
  beste Fenster je Kennzahl).
- Apps: Kennzeichen + Dropdown mit dem naechsten Android-/iOS-Release; Referee Board nur Web.

### 5. Rollout
Nicht waehrend eines laufenden Events umstellen; eingefrorene Endstaende bleiben unveraendert (auch Event 11 mit dem Lauf
nach dem Schluss). Vorher Gegenprobe: alte Events neu rechnen (ohne Speichern) und Verschiebungen zeigen. Alte Apps lesen
dieselben Bestenlisten-Felder weiter (rein serverseitig).

**Entschieden (Jan 16.11.):** (a) Duplikate: das bessere/kombinierte (Fusion, s. 1.2); (b) Rechte: Team-Events Leiter +
Moderatoren des ausrichtenden Teams, globale Events nur Admins (und Moderatoren des offiziellen Teams); (c) der Fahrer wird
benachrichtigt (Grund + oeffentlicher Kommentar + Link, nie die interne Notiz); (d) Reihenfolge: erst Baustein
`zaehlende_laeufe` + Session-Kennzeichen/Dropdown, danach das Referee Board.

## Endstand nachvollziehbar (16.11.2026)
Beim Festschreiben (und bei jeder Neu-Festschreibung durch den Referee) speichert `teams.event_stand` in
`team_events.stand_json`: Fassung der Team-Regeln (`teams.REGELN_STAND`), Wertungsregel (`WERTUNG_JE_LAUF` bzw.
je-session), Erkennungs- und Sprint-Versionen der gewerteten Sessions mit Anzahl, Zahl veroeffentlichter Korrekturen,
Server-Commit. Die Event-Seite zeigt es im Footer „Ausgewertet mit …"; Endstaende von vor dem 16.11.2026 sagen ehrlich,
dass der Stand damals nicht gespeichert wurde (nicht nachgetragen, damals galten andere Regeln).
Der **Wortlaut der Regeln** wird mit festgehalten, nur Englisch (Jan): `app/regeln_text.py` liest die Export-Datei
`app/data/team_regeln_en.json`; im Footer „Regeln vom … (wie festgehalten, Englisch)" klappt sie auf.
**Pflicht:** bei jeder inhaltlichen Aenderung der Team-Regeln (team.regeln.* in en.ts oder ABSCHNITTE) `python
scripts/regeln-export.py` ausfuehren und `REGELN_STAND` hochsetzen (tests/test_regeln_export.py schlaegt sonst fehl); bei
einer neuen Wertungslogik `WERTUNG_JE_LAUF`. Der Kasten „Event-Regeln" auf der Event-Seite zeigt weiter die aktuellen Regeln.

## Offene Punkte

- Push bei Beitrittsanfrage / Event-Start — spaeter, optional.
- Avatar auf der oeffentlichen Seite im Profil einstellbar — spaeter.
