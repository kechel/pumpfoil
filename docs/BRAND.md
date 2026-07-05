# Pumpfoil — Marken-/Design-Konzept

Die visuelle Identität, die Jan festgelegt hat. Referenz für alles, was nach „Pumpfoil"
aussehen soll (Web, App-Header, Store-Assets, künftige Flächen).

## Wortmarke

**`pumpfoil.org`** — durchgängig **klein** geschrieben, fett. Die Endung **`.org` in
Brand-Cyan**, der Rest in der jeweiligen Vordergrundfarbe (weiß auf Dunkel).

## Tagline

**`TRACK EVERY PUMP`** — Versalien, weit gesperrt (letter-spacing), gedämpftes Grau
(`slate-400`). Steht unter der Wortmarke.

## Wellen-Glyph

**Drei versetzte (nicht synchrone) Wellenlinien**, gebürstet/organisch, runde Enden.
Kanonische Quelle: **`brand/master/base/waves.svg`** (`fill=currentColor`, beliebig
einfärbbar). Cyan `#22d3ee` auf hellem/dunklem Grund, weiß auf Cyan-Kachel.

> ⚠️ Historie: Früher gab es *zwei dünne, synchrone* Wellen (die Pfade
> `M2 12c…`/`M2 17c…` in `WaveIcon` bzw. `logo_waves.xml`). Das war die falsche,
> nachgebaute Variante — sie hatte den Stil auf mehreren Flächen verbreitet. Das echte
> Logo hat **drei versetzte** Wellen; `waves.svg` wurde aus dem echten Icon vektorisiert.

## Logo-System (Master)

**Alle Logos werden aus einer Basis per Skript erzeugt** — `brand/master/` (Generator
`gen.py`, Basis `base/`, `build.sh`, eigene README). Nie wieder von Hand nachbauen; jede
Größe/Padding/Zoom aus dem identischen Original. Es gibt **3 Logos × 2 Themes = 6**:

| Typ | Beschreibung | Verwendung |
|---|---|---|
| **icon** | Kachel + Wellen (dark = navy Kachel/cyan Wellen · light = cyan Kachel/weiße Wellen) | App-/Store-Icon, Favicon, Avatar |
| **stacked** | Wellen **oben**, darunter `pumpfoil.org` + Tagline | Hero-Titel |
| **horizontal** | Wellen **links**, daneben `pumpfoil.org` + Tagline | Header/überall, Banner |

`dark` = für dunkle Flächen (heller Inhalt), `light` = für helle Flächen (dunkler Inhalt).
**Keine Verläufe** — Cyan überall exakt `#22d3ee` (auch die Icon-Kachel ist flach).

## Farben

| Rolle | Wert |
|---|---|
| Brand-Cyan (Akzent, `.org`, Wellen — ÜBERALL identisch, auch auf Weiß) | `#22d3ee` (Tailwind `brand-400`) |
| Brand-Cyan dunkler (nur UI-Press-State, NICHT fürs Logo) | `#0891b2` (`brand-600`) |
| **Keine Verläufe** — alle Flächen/Wellen flach | — |
| Hintergrund dunkel | `#020617` (`slate-950`) |
| Text hell | weiß / `slate-100` |
| Sekundärtext / Tagline | `#94a3b8` (`slate-400`) |

### Cyan vs. funktionale Farben (gilt für ALLE Plattformen)

Damit Blau-/Grün-Töne nicht pro Plattform auseinanderlaufen — **eine** Regel, Web ist
Source of Truth:

- **Cyan `#22d3ee`** = Marke **und** primärer/interaktiver Akzent: Buttons/CTA, Pairing-Code,
  aktive Status-Titel („lädt hoch/wartet"), Fortschrittsbalken, aktive Pager-/Tab-Indikatoren.
  Kein reines Blau (`#0000ff`/`#2563eb`/`#3b82f6`) und kein Grün als „Primär-Akzent".
- **Grün** ausschließlich als **Erfolg/Bestätigung** (Häkchen: gespeichert/verbunden/hochgeladen,
  „GPS bereit", „on foil"-Status).
- **Funktionale Skalen** (HR-Zonen grün→gelb→orange→rot, Speed-Zonen blau→grün→gelb→rot,
  Chart-Serien) sind **bewusst mehrfarbig** und **nicht** an die Marke gebunden — plattformgleich
  halten, aber nicht auf Cyan zwingen.
- **Orange** = Warnung/offline. **Rot** = Fehler/Stopp/destruktiv.

Verankert: Web `tailwind brand-*`; Garmin `Config.BRAND_CYAN = 0x22D3EE`; Android
`Theme.kt BrandDark 0xFF22D3EE`; Apple `Branding.swift 0x22D3EE`; Zepp `page/index.js CYAN`.

## Schrift

Marketing-PNGs: **Avenir Next** → Fallback Helvetica Neue / sans-serif (in die PNGs
gebacken → überall identisch). In-App rendert die Vektor-Wortmarke mit der App-Schrift
(fett) — bewusst, um Schrift-Mismatch & Theme-Probleme zu vermeiden.

## Lockups (zwei Varianten)

1. **Gestapelt** (Wellen oben, Wortmarke, Tagline darunter) — der große Marketing-/Hero-
   Titel. Als **PNG** verwenden: `brand/logo/logo-stacked-light.png`
   (→ `web/public/`), z. B. Landing-Hero. Hier zählt die exakte Schrift.
2. **Horizontal** (Wellen **links** neben der Wortmarke, Tagline optional darunter) —
   für **Header/überall in der App**. Als Vektor-Komponente:
   **`web/src/components/Wordmark.tsx`** (`<Wordmark icon=… text=… tagline? />`).
   Scharf, theme-/größenflexibel.

## Assets

- `brand/logo/logo-stacked-{light,dark}.png + pumpfoil-wordmark-tagline.svg` — gestapelt mit Tagline.
- `brand/logo/logo-horizontal-{light,dark}.png + pumpfoil-wordmark.svg` — horizontal ohne Tagline.
- `web/public/pumpfoil-wordmark-tagline.png` — Kopie fürs Web (Landing-Hero).

## Verwendung

- **In-App / Header:** `<Wordmark>` (horizontal). Eingebaut: Landing-Header,
  App-Sidebar + Mobile-Topbar, Login-Card (mit Tagline).
- **Großer Hero-Titel:** PNG (gestapelt+Tagline) — Landing.
- **App-Icons** sind separat (eigene Assets/Stores) — nicht die Wortmarke.
- Sport heißt generisch „Pump-Foiling"; die **Marke** ist immer exakt `pumpfoil.org`
  (klein, `.org` cyan). Siehe auch Memory `todo-pumpfoil-wording`.
