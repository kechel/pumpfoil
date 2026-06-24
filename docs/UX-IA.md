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

## Vorschlag: 4 Top-Level (Bottom-Nav)

```
[ 🌊 Community ]  [ 📋 Sessions ]  [ 📈 Verlauf ]  [ 👤 Profil ]
```

### 1 · 🌊 Community  (`/`)
Sozialer Einstieg. Enthält:
- **„Wer foilt jetzt gerade?"** (laufende Sessions) — oben als Live-Streifen *(geplant)*
- **Feed** aller community-sichtbaren Sessions (= heutiges „Alle", integriert)
- **Rekorde** (heute/10/30/Jahr/all) + **Spots** als Filter/Einstieg
- **Neueste Medien**
- Unterseiten:
  - **Spot-Seite** (`/spots/:name`): Rekorde an dem Spot, Sessions, **Spot-Chat** *(geplant)*
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

### 4 · 👤 Profil  (`/profil`)  — Hub (Liste, keine Bottom-Buttons)
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
| Spots + Spot-Chat | Community → Spot-Seite | Spot-Chip im Feed/Session |
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

## Änderungen ggü. heute (klein, klare Wins)
1. **„Alle Sessions"** als eigener Tab entfällt → Umschalter in **Sessions** (oder im Community-Feed).
2. **„Uhr"** verliert den Bottom-Slot → wandert unter **Profil → Uhr/Gerät**.
   → Bottom-Nav 6 → **4**, Platz für später.
3. **Profil** wird vom reinen Settings-Screen zum **Hub** (Menüliste zu allen Unterbereichen).

## Offene Entscheidungen
- „Alle Sessions" lieber als Umschalter in **Sessions** oder ganz in den **Community-Feed**?
- Foil-Katalog/-Vergleich eher unter **Community** (sozial) oder **Profil** (Ausrüstung)? (Vorschlag: Browsen in Profil, Community-Vergleich in Community.)
- Brauchen wir doch einen **5. Tab** (z. B. „Spots/Entdecken"), wenn Spots/Chat groß werden?
