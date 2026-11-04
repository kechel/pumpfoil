# UI-/Informationsarchitektur

## App-Port ab 04.11.2026 — Android und iOS auf den Web-Stand bringen

Das Web ist seit dem 02.11. umgebaut (Reiter je Bereich, s. unten), die Apps stehen noch auf dem alten Aufbau: unten
sieben Knoepfe (Home · Foilers · Sessions · Verlauf · Spots · Chat · Profil), Home ohne Reiter, „Profil" = Einstellungen,
Foils und Setup als zwei lange Seiten. Teams und Events gibt es in beiden Apps schon (1.1.47 / 1.1.59, „coming next").

**Web-Stand, auf den portiert wird (zusaetzlich zum Baum unten):**
- **Leiste unten:** Home · Community · Sessions · Spots · Zahnrad (Einstellungen, nur Symbol). Apps: Chat bleibt als
  eigener Knopf, also Home · Community · Sessions · Spots · Chat · Zahnrad.
- **Home-Reiter:** Uebersicht · Rekorde · Team · Spots · Stats · Uhren · Profil.
  - *Team:* eigene Teams; ohne Team gleich die Teamsuche + „Team gruenden".
  - *Spots:* zweite Zeile = eigene Spots (Homespot zuerst, dann zuletzt besucht), wischbar, „Alle (n)" rechts fest;
    darunter die Spot-Reiter (Rekorde · Sessions · Heatmap · Wetter · Beschreibungen); „Alle" = Kacheln je Spot
    (`GET /api/sessions/my-spots-stats`: Sessions, zuletzt/seit, On-Foil-Zeit/-Strecke nur bei `foil_sessions > 0`,
    Laeufe, Pumps, abweichende Sportarten). Kachel-Klick waehlt den Spot, bleibt in der Ansicht.
  - *Profil:* die eigene Foiler-Seite eingebettet, oben Hinweis „so wie andere sie sehen koennen", Umschalter
    Freunde | Alle (`/api/community/foiler/<id>?als=freunde|alle`), Zahnrad -> Einstellungen › Privatsphaere.
- **Einstellungen-Reiter (je ein Wort):** Uebersicht · Uhren · Freunde · Team · Ausruestung · Ich · Fahren ·
  Privatsphaere · Darstellung · Konto. Die Kacheln der Uebersicht fuehren auf dieselben Reiter (keine eigenen Seiten).
  *Team* mit Teamsuche (alle freigegebenen Teams, `passtZu`-Regel: Akzente/Bindestriche egal) ueber „Team gruenden".
  *Freunde:* Listen zuerst, „Was Freunde sehen" unten.
- **Ausruestung** (frueher Foils + Detailliertes Setup): Reiter Foils · Stabilizer · Boards · Mast & Shim · Sportarten.
  Foil- und Stab-Katalog nur ueber die Suche; „Stab selbst anlegen" erst unter den Treffern. Ausruestung je Sportart:
  bei Sportarten ohne Foil (`/api/app/sports` -> `foil: false`) nur das Board.
- **Community › Teams & Events:** oben Team-Bestenlisten (`GET /api/teams/liste/vergleich?period=&top=3|5|10`, Kennzahlen
  Pumps/Strecke/Zeit/Sessions/Laeufe, Summe der besten N je Team), Teilen als Bild mit Wappen je Zeile und dem eigenen Team
  hervorgehoben (hinter Platz 10 darunter).
- **Ohne Foil** (`sport_profil.foil === false`): keine On-Foil-Strecke/-Zeit in Session-Karte und -Detail (Pumps sind
  bei `pumpzahlen: false` schon aus). Wind MIT Foil (Wingfoil, Kitefoil, Parawing) behaelt sie.

**Phasen** (je Phase: erst Android bauen + `:app:compileDebugKotlin`, dann iOS + `swiftc -parse`; Uebersetzungen in allen
18 Sprachen beider Apps; Swift-Literale <= 50 Eintraege; Punkt in `NAECHSTES` (Android 1.1.47, iOS 1.1.59); nicht bumpen):

| # | Phase | Inhalt | Android | iOS |
|---|---|---|---|---|
| 0 | Bausteine | Reiterleiste wie im Web (wischbar, zweite Zeile als Flaeche), Zustand je Bereich | ✅ `Reiter.kt`, Texte `I18nPort.kt` (scripts/gen-i18n-port.py) | ✅ `Reiter.swift`, `LocPort.swift` (beide neu -> xcodegen) |
| 1 | Ohne Foil | On-Foil-Zahlen in Karte/Detail ausblenden (klein, sofort sichtbar) | ✅ 04.11. | ✅ 04.11. (parse) |
| 2 | Leiste unten | Home · Community · Sessions · Spots · Chat · Zahnrad; Verlauf -> Home › Stats; Profil -> Einstellungen | ✅ 04.11. | ✅ 04.11. (parse) |
| 3 | Home-Reiter | Uebersicht · Rekorde · Team · Spots · Stats · Uhren · Profil (vorhandene Abschnitte umhaengen) | ✅ 04.11. (compileDebugKotlin) | ✅ 04.11. (nur parse; neue Dateien -> xcodegen) |
| 4 | Home › Spots | Spotzeile + Alle-Kacheln, Spot-Reiter aus der Spot-Seite wiederverwenden | ✅ 04.11. (compileDebugKotlin) | ✅ 04.11. (nur parse; neue Dateien -> xcodegen) |
| 5 | Home › Profil | Foiler-Seite eingebettet + Vorschau Freunde/Alle | ✅ 04.11. (compileDebugKotlin) | ✅ 04.11. (nur parse; neue Dateien -> xcodegen) |
| 6 | Einstellungen | 10 Reiter, Kacheln = Reiter, Freunde/Team(+Suche)/Uhren eingebettet | ✅ 04.11. (compileDebugKotlin) | ✅ 04.11. (nur parse; neue Dateien -> xcodegen) |
| 7 | Ausruestung | Reiter, Suche statt Katalog, Board-only ohne Foil | ✅ 04.11. (compileDebugKotlin) | ✅ 04.11. (nur parse; neue Dateien -> xcodegen) |
| 8 | Community | Reiter Rekorde & Bestenliste · Medien · Teams & Events; Team-Bestenlisten + Teilen-Bild | ✅ 04.11. (compileDebugKotlin) | ✅ 04.11. (nur parse; neue Dateien -> xcodegen) |
| 9 | Rest | Sessions-Reiter Meine/Freunde/Alle und Spots-Reiter Karte/Liste/Routen pruefen, Spot-Seite-Reiter | ✅ 04.11. (compileDebugKotlin) | ✅ 04.11. (nur parse; neue Dateien -> xcodegen) |

Jede Phase fuer sich auslieferbar; Jan testet Android im Emulator, iOS in Xcode. Stand hier nachziehen.

**Stand 04.11.2026 abends:** alle Phasen gebaut, auf keinem Geraet gesehen. Zuerst pruefen: Android Spots › Karte
(osmdroid bleibt auf anderen Reitern mit Hoehe 0 im Baum — Kacheln nach Reiterwechsel? faengt sie Beruehrungen ab?),
iOS Home › Spots (eingebettete Spot-Seite im ScrollView), Reiterleiste als List-Zeile, doppelte Kopfleisten bei
eingebetteten Ansichten, beide Teilen-Bilder. **Offen/abweichend:** Teilen-Bild nur dunkel, ohne Flaggen; Home › Stats
ohne zweite Reiterzeile (verlinkt die Verlauf-Seite); Konten auf Android untereinander statt Reiter je Anbieter;
Foiler-Vorschau holt Titel im selben Abruf; Homespot-Chip in Sessions entfaellt (wie Web); iOS ohne „Aktivste Teams"
(Modell ohne `sessions_30d`), ohne Windfenster im Wetter-Reiter, ohne Import-Kachel und Schriftgroesse; Team gruenden
oeffnet auf iOS das Web; nicht mehr benutzt, aber noch da: `MeineTeamsSection`, `FreundeZeile` (iOS), `Scope.SPOT` (Android).

## Stand 02.11.2026 — Reiter je Bereich (entschieden, Web zuerst)

Anlass: ein langer Vorschlagskatalog eines Nutzers (s. docs/TODO.md, Inbox 02.11.) — die Seiten zeigen zu viel auf
einmal. In der Leiste unten ist kein Platz mehr (die Knoepfe muessen auf dem Handy nebeneinander passen), also teilen
wir die grossen Seiten mit **Reitern oben** auf. **Reihenfolge:** erst das Web fertig, dann Feedback des Nutzers,
erst danach Android/iOS.

```
Home                          (nur meine Sachen)
├─ Uebersicht                 letzte Session, Upload/Uhren-Status, Hinweise, Freunde (je Zeile: Profil | letzte Session)
├─ Rekorde                    meine Rekorde je Zeitraum (mit/ohne Foil zusammengefasst)
├─ Team                       meine Teams (ersetzt die Links im Kopf)
├─ Spots                      alle eigenen Spots als zweite Zeile (Homespot vorgewaehlt, „Alle" = Kacheln), darunter Spot-Reiter (04.11.2026)
└─ Stats                      zweite Reiterzeile: Verlauf | Kennzahlen (Jahresbilanz, Start-Erfolgsquote, Carves, Wenden & Halsen) | Lage des Bretts

Community
├─ Rekorde & Bestenliste      Kacheln oben, Bestenliste darunter (Jan 02.11.: in EINER Ansicht, sonst zu kleine Seiten)
├─ Medien                     Fotos/Videos + Social-Feed + Uhr-Layouts
└─ Teams & Events             spaeter dazu (Jan 02.11.): die 10 aktivsten Teams, Team-Bestenlisten ueber Gesamtsummen
                              je Team, Team-Rekorde

Sessions
├─ Meine                      (Vorauswahl)
├─ Freunde
└─ Alle

Spots
├─ Karte
├─ Liste                      (bisher Spot-Abschnitt der Community)
└─ Routen                     (bisher Routen-Abschnitt der Community)

Einstellungen                 (Menue „Einstellungen", unten nur das Zahnrad; am Desktop ueber das eigene Profilbild oben links, 04.11.2026) Reiter unter der Sprache: Ich | Fahren & Auswertung | Privatsphaere | Darstellung & Hinweise | Konto
Team-Seite                    Reiter unter dem Kopf: Rekorde | Events | Logbuch

Spot-Seite                    kein eigener Knopf; erreichbar ueber Home › Spots, Session -> Spot, Karte/Suche
├─ Rekorde                    Kacheln + darunter dieselben Bestenlisten wie in der Community, nur an diesem Spot
├─ Sessions
├─ Heatmap
├─ Wetter                     Wetter + Pegel
└─ Beschreibungen             Spot-Beschreibungen (spotnote.*)
```

**Leiste unten:** Web Home · Community · Sessions · Spots · Zahnrad (5, nur Symbol; „Verlauf" wird Reiter in Home). Seit 04.11.2026: die eigene Profilseite ist der letzte Reiter „Profil" in Home.
Apps spaeter: Home · Community · Sessions · Spots · Chat · Profil (Chat bleibt vorerst unten).

**Reiterleiste:** ueberall dieselbe; wischbar, wenn sie nicht passt (etwa 4 passen fest, mehr als 6 je Seite nicht).

**Zustand:**
- Innerhalb einer Sitzung kehrt jeder Hauptbereich dorthin zurueck, wo man war (Reiter, Filter). Erneutes Tippen auf
  den aktiven Hauptknopf -> Startansicht des Bereichs.
- Neuer Start: Home immer Uebersicht; Community und Spots letzter Reiter (localStorage, try/catch); Sessions Meine;
  Spot-Seite Rekorde.
- Reiter steht in der Adresse (`?tab=`), ein Link geht vor allem Gemerkten. Reiterwechsel ERSETZT den Verlaufseintrag
  (Zurueck springt nicht durch die Reiter). `/verlauf` leitet auf `/?tab=verlauf`.

**Inhaltliche Aenderungen dabei:**
- Bestenliste: Reiter-Reihenfolge laengster Lauf, Strecke gesamt, meiste Laeufe, Pumps, Sessions, Spots, weitester Lauf;
  Vorauswahl „Heute", sobald heute mehr als 10 Plaetze besetzt sind; Zeitraum „Gestern"; Teilen als Link (spaeter Bild).
- Rekord-Kacheln: Streckenverlauf bleibt hinter JEDER Kachel (Versuch „nur die erste" am 02.11. zurueckgenommen).
- Session-Seite: Inhaber sieht, wer geliked hat.

**Entschieden 02.11.:** Filter „nur mit Beschleunigungsdaten" bleibt. Laengste Gleitphase NICHT in die Bestenliste,
bis die Erkennung besser ist. Kommentare an Sessions: geplant, aber erst nach diesem Umbau. Foilscoot bleibt getrennt.

---

## Frueherer Vorschlag (Stand vor dem 02.11.2026, nur noch Hintergrund)

Ziel: alle bestehenden **und geplanten** Features ([`IDEAS.md`](IDEAS.md)) sinnvoll
unterbringen, **ohne** die mobile Symbolleiste mit Buttons zu überladen.
Stand: Vorschlag zur Diskussion — noch nichts umgesetzt.

## Prinzipien
1. **Mobile Bottom-Nav: max. 4–5 Top-Level-Ziele.** Heute sind es 6 → reduzieren.
2. **Hub-Muster statt neuer Tabs:** Sekundäres (Uhr, Foils, Benachrichtigungen, Tools …)
   lebt unter **Profil** als Liste, nicht als eigener Bottom-Button.
3. **Kontextuelle Platzierung:** Was zu einer Session/Foil/Spot gehört, steht **dort**
   (Detailseiten), nicht in der globalen Nav.
4. **Progressive Disclosure:** Erst das Wichtige zeigen, Details/Filter aufklappbar.

## Heute (Ist)
Bottom-Nav (6): Community · Meine · Alle · Verlauf · Uhr · Profil
→ „Alle" doppelt sich faktisch mit dem Community-Feed; „Uhr" ist Geräte-Setup
(verbraucht einen wertvollen Slot).

## Vorschlag: 5 Top-Level (Bottom-Nav) — entschieden

```
[ 🌊 Community ]  [ 📋 Sessions ]  [ 📈 Verlauf ]  [ 🗺️ Spots ]  [ 👤 Profil ]
```

### 1 · 🌊 Community  (`/`)
Sozialer Einstieg. Enthält:
- **„Wer foilt jetzt gerade?"** (laufende Sessions) — oben als Live-Streifen *(geplant)*
- **Feed** aller community-sichtbaren Sessions (= heutiges „Alle", integriert)
- **Rekorde** (heute/10/30/Jahr/all)
- **Neueste Medien**
- **Foil-Vergleich/Stats je Foil** *(geplant)* — erreichbar über einen Foil-Chip

### 2 · 📋 Sessions  (`/sessions`)
Eigene Daten + Import. Enthält:
- Umschalter **Meine / Alle** (ersetzt den separaten „Alle"-Tab)
- Filter (Pumpfoil/Aussortiert/Monat), **„Aktivität importieren"** (oben rechts)
- **Session-Detail** (`/sessions/:id`): Karte/Stats/Läufe (heute) + neu:
  - **Foil dieser Session** setzen (Default aus Profil, je Session/Lauf überschreibbar) *(geplant)*
  - **Leistung/Watt** je Lauf (aus Foil + Speed + Gewicht) *(geplant)*
  - **Kommentare/Diskussion** + **Auto-Übersetzen** *(geplant)*
  - **Foto/Video** (Video künftig auch in-App aufnehmen) *(geplant)*
  - **Labeling** (`/sessions/:id/label`): Foil auch je Lauf

### 3 · 📈 Verlauf  (`/verlauf`)
Fortschritt & persönliche Bestwerte (heute) + neu:
- **Stats je Foil** (eigene Entwicklung pro Material) *(geplant)*
- **Leistung/Watt** über Zeit *(geplant)*

### 4 · 🗺️ Spots  (`/spots`)
Kartenansicht aller Spot-Locations (Leaflet, Marker je Spot, geclustert).
- Tap auf einen Marker → **Spot-Seite** (`/spots/:name`): Rekorde am Spot, Sessions dort,
  **Spot-Chat** *(geplant)*.
- Quelle der Spots: `place_name` + gemittelte GPS-Koordinaten der Sessions (haben wir schon).
- Optional später: Filter „nur meine Spots", Anzahl Sessions/aktive Foiler je Marker.

### 5 · 👤 Profil  (`/profil`)  — Hub (Liste, keine Bottom-Buttons)
Sammelt alles Sekundäre als Menü:
- **Konto & Profil** (Name, Avatar, Sprache, Passwort, **Gewicht** *(geplant)*)
- **Meine Ausrüstung / Foils** — Standard-Foil wählen; **Foil-Katalog** browsen *(geplant)*
- **Uhr / Gerät** (heutiges „Account": Pairing, Datenfelder, Alarm, App-Download, Kompatibilität)
- **Benachrichtigungen** (Aktivieren + Typen)
- **Foil-Rechner** (eingebetteter Calculator) *(geplant)*
- **App installieren** (PWA)
- **Daten & Konto** (Export, Löschen)
- **Impressum**, **Abmelden**
- (Admin nur für Admins)

## Wo lebt welches Feature? (Übersicht)

| Feature | Ort | Einstieg/Verlinkung |
|---|---|---|
| Wer foilt jetzt | Community (oben) | Live-Streifen → Session-Detail |
| Community-Feed / „Alle" | Community | Bottom-Tab |
| Rekorde | Community | Tab-intern; Klick → Session |
| Spots (Karte) + Spot-Chat | **Spots-Tab** → Spot-Seite | eigener Bottom-Tab; Spot-Chip im Feed/Session verlinkt dorthin |
| Stats je Foil | Community (Vergleich) + Verlauf (eigene) | Foil-Chip / Verlauf |
| Meine/Alle Sessions | Sessions (Umschalter) | Bottom-Tab |
| Import | Sessions | Button oben rechts |
| Foil je Session/Lauf | Session-Detail / Labeling | Default aus Profil-Ausrüstung |
| Leistung/Watt | Session-Detail + Verlauf | abgeleitet (Foil+Speed+Gewicht) |
| Kommentare + Übersetzung | Session-Detail | unter der Session |
| Video aufnehmen | Session-Detail (Medien) | neben Foto |
| Foil-Katalog / Ausrüstung | Profil → Meine Foils | + Katalog browsen |
| Gewicht | Profil → Konto | |
| Uhr/Pairing/Alarm/Datenfelder | Profil → Uhr/Gerät | |
| Benachrichtigungen | Profil | |
| Foil-Rechner | Profil → Tools | ggf. von Foil-Seiten verlinkt |
| App installieren / Export / Löschen | Profil | |

## Änderungen ggü. heute
1. **„Alle Sessions"**-Tab entfällt → **Umschalter Meine/Alle in „Sessions"**. *(entschieden)*
2. **„Uhr"** verliert den Bottom-Slot → unter **Profil → Uhr/Gerät**.
3. **Neuer Tab „🗺️ Spots"** (Kartenansicht der Spot-Locations). *(entschieden)*
4. **Profil** wird vom Settings-Screen zum **Hub**.
   → Bottom-Nav **6 → 5**: Community · Sessions · Verlauf · Spots · Profil.

## Entschieden
- „Alle Sessions" → **Umschalter in Sessions**. ✅
- Foil: **Katalog/Ausrüstung in Profil**, **Vergleich/Stats in Community**. ✅
- **5. Tab = Spots (Karte)**. ✅

## Vorgeschlagener erster Schritt (risikoarm)
Nav-Umbau zuerst, ohne neue Features:
1. Bottom-Nav auf die 5 Tabs umstellen; „Alle" als Umschalter in Sessions.
2. „Uhr"/Account unter Profil-Hub verschieben (Profil wird Menüliste).
3. Leeren **Spots-Tab** mit Kartenansicht (aus vorhandenen `place_name`+GPS) anlegen.
Danach die großen Features (Foil-DB → … ) gemäß `IDEAS.md`.
