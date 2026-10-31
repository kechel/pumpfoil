# Teams — Plan (Stand 31.10.2026, noch nicht gebaut)

Anlass: Telefonat Jan mit einem Nutzer, der Teams mit eigenen Bestenlisten haben moechte; als Vorbild
schickte er eine schlichte Kite-Big-Air-Rangliste (Rang, Flagge, Name, Wert — eine Zeile je Person).

## Entscheidungen (Jan, 31.10.2026)

1. **Name: „Team“.** Abgegrenzt von „Freunde“ (individuell, gegenseitig) — ein Team ist eine feste Gruppe.
2. **Oeffentlich nur auf Einstellung, und nur die Bestenlisten.** Ohne Login: Rang, Anzeigename, Wert
   (plus Teamname/-logo/-farbe). Links zu Session-Details NUR mit Login. Ist das Team oeffentlich, steht
   das **beim Beitreten ausdruecklich da**: „Dein Anzeigename und dein Platz sind oeffentlich sichtbar,
   auch ohne Anmeldung.“ Schaltet ein Team spaeter auf oeffentlich, muessen die Mitglieder das ebenso
   erfahren (Hinweis + Austrittsmoeglichkeit, s. offene Punkte).
3. **Intern darf ein Team machen, was es will.** Freigabe durch Jan/Admin nur fuer den OEFFENTLICHEN Teil
   (Name, Beschreibung, Logo, Farbe — so wie sie nach aussen erscheinen).
4. **Mitgliederliste: einstellbar je Team** (nur Mitglieder / alle Angemeldeten).
5. **Wertung: je Person nur der beste Eintrag.**

Auslegung zu 3 (von mir, bei Bedarf korrigieren): „oeffentlich“ heisst hier zweierlei — die Bestenliste
ohne Login UND die Auflistung im Community-Abschnitt „Teams“ (alle Angemeldeten sehen Name/Logo). Beides
erst nach Freigabe. Bis dahin funktioniert das Team ueber den Einladungslink voll, ist aber nirgends gelistet.
Eine Aenderung an Name/Beschreibung/Logo/Farbe braucht erneut Freigabe; nach aussen bleibt bis dahin die
alte, freigegebene Fassung stehen, intern gilt sofort die neue.

## Grenzen, die aus bestehenden Regeln folgen

- **„Oeffentlich heisst eingeloggt“** (25.09.) — die Team-Bestenliste ohne Login ist die zweite Ausnahme
  neben `/s/<token>`, bewusst und schmal: kein Spot, kein Datum, keine Karte, keine Session-Links.
  `noindex` + `robots.txt`-Sperre.
- **Keine Sessionlisten je Person** — die Mitgliederliste fuehrt hoechstens auf die Foiler-Seite (5 Sessions).
- **Social-Gate** — alle Team-Routen hinter `require_social`.
- **Freunde-Daten** gehen nie in Team-Ansichten (Gewicht, „gerade am Pumpen“ mit Spot usw. bleiben bei `ist_freund`).
- **DSGVO-Loeschung**: Mitglied faellt raus; Leiter geloescht → dienstaeltester Moderator, sonst
  dienstaeltestes Mitglied, sonst Team stillgelegt.

## Datenmodell

- `teams`: id, name, slug, beschreibung, logo, farbe (Palette-Schluessel), beitritt
  (`offen`/`anfrage`/`einladung`), oeffentlich (bool), mitglieder_sichtbar (`mitglieder`/`angemeldete`),
  freigabe (`keine`/`wartet`/`frei`/`abgelehnt`) + die zuletzt freigegebene Fassung der vier
  oeffentlichen Felder, angelegt_von, angelegt_am.
- `team_mitglieder`: team_id, user_id, rolle (`leiter`/`moderator`/`mitglied`), status
  (`angefragt`/`aktiv`), seit.
- `team_einladungen`: token (nur als SHA-256 gespeichert, wie Geraete-Tokens), team_id, ablauf,
  max_nutzungen, genutzt, widerrufen.
- `team_tafeln`: team_id, sportart, kennzahl, reihenfolge.
- `team_events` (Stufe 2): team_id, titel, start, ende, zeitzone, sportart, kennzahlen, eingefroren_am.

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

Neue Kennzahlen (Stufe 3): „Runs ueber 100 m“ (leicht, Distanz je Lauf liegt vor) und „schnellster km“
(neu aus dem GPS-Track, nur innerhalb von Laeufen — Analyse-Pipeline, braucht Jans OK mit Befund und
Gegenprobe).

## Oberflaeche

- **Profil:** Knopf „Team“ → eigene Seite: Teams verwalten / gruenden, alle Einstellungen.
- **Home:** Team-Karte wie Homespot → Team-Bestenlisten, Zeitraum umschaltbar; mehrere Teams → Auswahl.
- **Community:** neuer Abschnitt „Teams“ (nur freigegebene).
- **Admin:** Warteschlange „Teams freigeben“ (alte gegen neue Fassung).
- **Beitreten per Link** `/t/<token>`: ohne Konto erst registrieren, dann direkt beigetreten (Token
  wartet in `localStorage`, kein Cookie). Beitritts-Dialog nennt Beitrittsart und, falls oeffentlich, die
  Sichtbarkeit von Name und Platz.
- **Teamfarbe:** Palette aus ~12 vorgepruefter Farben (je eine Hell-/Dunkel-Variante, bestehen den
  Kontrast-Waechter), gesetzt als CSS-Variable `--team-akzent` nur auf Teamseiten.
- **Logo:** Upload wie Avatar (neu kodiert, EXIF weg, quadratisch, Groessengrenze), unter `server/media`.

## „Top 5 zusammen abspielen“ — Falle

`web/src/lib/syncPlayback.ts` legt Sessions auf eine gemeinsame UHRZEIT (mehrere Fahrer im selben Video).
Bestwerte stammen von verschiedenen Tagen und meist verschiedenen Spots. Noetig ist ein neuer Modus
„Geisterrennen“: Laeufe ab ihrem Start uebereinander. Auf EINER Karte nur am selben Spot sinnvoll; sonst
nebeneinander oder ohne Karte (Tempo/Strecke ueber die Zeit). Start: nur fuer Sessions am selben Spot.

## Events (Stufe 2)

Zeitfenster mit Zeitzone, Kennzahl(en). Gewertet nur Aufnahmen, die im Fenster gestartet sind; Upload bis
Ende + 24 h, dann eingefroren (sonst verschiebt nachtraegliches Zuschneiden das Ergebnis). Optional nur
Uhr-/App-Aufnahmen, keine FIT-Importe. Vorhandene Waechter (Fake-Meldungen, Autofahrt-Grenzen,
aussortierte Laeufe, Sportart-Regel) gelten ohnehin.

## Stufen

1. Teams, Rollen, Beitrittsarten, Einladungslink inkl. Registrierung, Mitgliederliste einstellbar,
   Bestenlisten aus vorhandenen Kennzahlen, Home-Karte, Profil-Seite. Logo + Farbpalette. Freigabe-
   Warteschlange, Community-Abschnitt, oeffentliche Bestenliste ohne Login. Nur Web.
2. Events.
3. Geisterrennen Top 5, neue Kennzahlen.
4. Native Apps (Home-Karte, Bestenliste, Deep Link `/t/<token>`).

## Offene Punkte

- Team schaltet NACH Beitritten auf oeffentlich: Vorschlag — bestehende Mitglieder bekommen einen Hinweis
  und erscheinen erst nach eigenem OK oeffentlich (bis dahin intern sichtbar, oeffentlich ausgelassen).
- Push bei Beitrittsanfrage / Event-Start — spaeter, optional.
