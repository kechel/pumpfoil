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

Zwei gestapelte Wellenlinien (≈), Brand-Cyan, runde Linienenden, mit weichem Cyan-Glow
(Drop-Shadow) in den großen Varianten. Exakt die Pfade aus `WaveIcon`
(`web/src/components/Icons.tsx`) bzw. den Logo-SVGs:
```
M2 12c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2
M2 17c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2
```

## Farben

| Rolle | Wert |
|---|---|
| Brand-Cyan (Akzent, `.org`, Wellen) | `#22d3ee` (Tailwind `brand-400`) |
| Hintergrund dunkel | `#020617` (`slate-950`) |
| Text hell | weiß / `slate-100` |
| Sekundärtext / Tagline | `#94a3b8` (`slate-400`) |

## Schrift

Marketing-PNGs: **Avenir Next** → Fallback Helvetica Neue / sans-serif (in die PNGs
gebacken → überall identisch). In-App rendert die Vektor-Wortmarke mit der App-Schrift
(fett) — bewusst, um Schrift-Mismatch & Theme-Probleme zu vermeiden.

## Lockups (zwei Varianten)

1. **Gestapelt** (Wellen oben, Wortmarke, Tagline darunter) — der große Marketing-/Hero-
   Titel. Als **PNG** verwenden: `store-assets/logo/pumpfoil-wordmark-tagline.png`
   (→ `web/public/`), z. B. Landing-Hero. Hier zählt die exakte Schrift.
2. **Horizontal** (Wellen **links** neben der Wortmarke, Tagline optional darunter) —
   für **Header/überall in der App**. Als Vektor-Komponente:
   **`web/src/components/Wordmark.tsx`** (`<Wordmark icon=… text=… tagline? />`).
   Scharf, theme-/größenflexibel.

## Assets

- `store-assets/logo/pumpfoil-wordmark-tagline.{png,svg}` — gestapelt mit Tagline.
- `store-assets/logo/pumpfoil-wordmark.{png,svg}` — horizontal ohne Tagline.
- `web/public/pumpfoil-wordmark-tagline.png` — Kopie fürs Web (Landing-Hero).

## Verwendung

- **In-App / Header:** `<Wordmark>` (horizontal). Eingebaut: Landing-Header,
  App-Sidebar + Mobile-Topbar, Login-Card (mit Tagline).
- **Großer Hero-Titel:** PNG (gestapelt+Tagline) — Landing.
- **App-Icons** sind separat (eigene Assets/Stores) — nicht die Wortmarke.
- Sport heißt generisch „Pump-Foiling"; die **Marke** ist immer exakt `pumpfoil.org`
  (klein, `.org` cyan). Siehe auch Memory `todo-pumpfoil-wording`.
