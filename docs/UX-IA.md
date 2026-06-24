# UI-/Informationsarchitektur — Vorschlag

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
