// Gemeinsame Quelle für alle Uhr-Vorschauen (einfacher 3-Slot-Editor in Account.tsx, künftiger
// Advanced-Layout-Editor und Community-Galerie). Design: docs/setup-and-watch-layouts.md.
//
// Wichtig: Labels kommen aus den i18n-Keys `fw.<Feld-ID>` — das sind die KURZEN Formulierungen,
// die die Uhr wirklich zeichnet (aus watch/source/Strings.mc erzeugt). Nur so stimmen Textbreiten
// in der Vorschau mit dem Gerät überein — sonst wäre die Overflow-Warnung wertlos.

// Element-Typen (identisch mit server/app/api/layouts.py ELEMENT_TYPES).
export const EL_VALUE = 1;   // Live-Wert eines Datenfelds
export const EL_LABEL = 2;   // übersetzter Feldname (Sprache der UHR)
export const EL_TEXT = 3;    // Freitext des Nutzers, wird nie übersetzt
export const EL_LINE = 4;    // Trennlinie (2. Punkt in [6]/[7])
export const EL_REC = 5;     // REC-Indikator (Punkt + „REC")
export const EL_DOTS = 6;    // Seiten-Punkte (Anzahl bleibt dynamisch)
// „Pausiert"-Hinweis — NUR in Pausen-Layouts, dort PFLICHT (Server erzwingt es, s.
// layouts._enforce_paused_hint): verschiebbar und einfärbbar, aber nicht entfernbar, und klein
// gedeckelt. Ohne ihn weiß niemand, dass die Aufnahme pausiert ist und wie er sie fortsetzt.
export const EL_PAUSED = 7;

// Kuratierte Palette — Spiegel von server/app/api/layouts.py PALETTE (Index = `color`).
// Index 0 = „auto": die Uhr entscheidet (Werte weiß, Labels hellgrau) = heutiges Verhalten.
export const PALETTE = [
  "auto", "#ffffff", "#d0d0d0", "#808080", "#000000",
  "#ff0000", "#ff5500", "#ffaa00", "#ffff00",
  "#00ff00", "#00aa00", "#00ffff", "#22d3ee", "#0055ff",
  "#aa00ff", "#ff00aa",
];
export const MAX_ELEMENTS = 24;
export const MAX_TEXT_LEN = 12;

/** Palette-Index -> CSS-Farbe. `auto` bekommt je Element-Rolle einen sinnvollen Ton. */
export function paletteColor(idx: number, role: "value" | "label" | "line" = "value"): string {
  const c = PALETTE[idx] ?? "auto";
  if (c !== "auto") return c;
  return role === "value" ? "#ffffff" : role === "label" ? "#d0d0d0" : "#808080";
}

// Größenstufen: EINE Stufe = EIN echter Garmin-Font. Freie Pixelgrößen wären eine Lüge — die
// Uhr kann nur ihre eingebauten Fonts zeichnen und rastet auf den nächsten ein.
// WICHTIG: die NUMBER-Fonts enthalten NUR Ziffern (plus : . -) → sie sind ausschließlich für
// Wert-Elemente erlaubt, Labels/Freitexte hören bei „Groß" auf (s. MAX_TEXT_STEP).
//
// Die Faktoren stammen aus einer ECHTEN MESSUNG im Connect IQ Simulator (fenix7xpro, 280×280,
// 2026-07-26): ein Wegwerf-Debug-Build hat für alle 9 Stufen `dc.getFontHeight()` und
// `dc.getTextWidthInPixels("18.5")` in die Konsole geschrieben. Genau diese Zahlen stehen unten.
//
// Warum die BREITE die Bezugsgröße ist und nicht die Höhe: `getTextWidthInPixels` ist reine Tinte
// (Vorschubbreite des Strings), `getFontHeight` ist die ZEILENBOX inklusive Reserve — bei den
// NUMBER-Fonts ist die riesig (Zeilenbox ÷ em = 1,45–1,57, weil FONT_NUMBER_THAI_HOT Platz für
// Thai-Ober-/Unterlängen vorhält; bei den Textfonts nur 1,29–1,34). Die Zeilenbox als Fontgröße zu
// nehmen, würde die Vorschau um bis zu 50 % zu groß machen.
//
// Damit ist auch der frühere „gemessene" Weg widerlegt: die Pixelgrößen in den Font-DATEINAMEN aus
// simulator.json (ROBOTO_13B = 13 …) sind nicht die em-Größe, und die daraus gebauten Faktoren
// waren 16–38 % zu KLEIN — deshalb Jans Befund „die schriftart der labels ist ein klein bisschen zu
// gross" (Stufe SMALL: genau +16 %). Der ursprüngliche Schätzwert 0,300 für numThaiHot war näher an
// der Wahrheit (0,3005) als seine „Korrektur" 0,221.
const FONT_REF_W = 280;                 // Displaybreite, auf der gemessen wurde
const FONT_SAMPLE = "18.5";             // gemessener String (Ziffern sind tabellarisch)
// [Zeilenbox, Breite von "18.5"] je Stufe, Pixel bei 280 px Displaybreite.
const FONT_MEASURED: [number, number][] = [
  [19, 29], [31, 46], [34, 50], [40, 61], [43, 64], [64, 82], [79, 99], [107, 146], [122, 166],
];

// Vorschub des Mess-Strings im Font der VORSCHAU, pro 1 px Fontgröße — im Browser gemessen, damit
// die Umrechnung nicht an einer angenommenen Roboto-Metrik hängt. Fallback = Roboto/Inter
// (3 tabellarische Ziffern + Punkt), falls kein Canvas da ist (SSR/Tests).
function sampleAdvancePerPx(): number {
  const fallback = 3 * 0.569 + 0.266;
  try {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return fallback;
    ctx.font = "700 100px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
    const w = ctx.measureText(FONT_SAMPLE).width / 100;
    return w > 0.5 && w < 5 ? w : fallback;
  } catch {
    return fallback;
  }
}
const SAMPLE_ADV = sampleAdvancePerPx();

const STEP_NAMES: [string, string][] = [
  ["xtiny", "FONT_XTINY"], ["tiny", "FONT_TINY"], ["small", "FONT_SMALL"],
  ["medium", "FONT_MEDIUM"], ["large", "FONT_LARGE"], ["numMild", "FONT_NUMBER_MILD"],
  ["numMedium", "FONT_NUMBER_MEDIUM"], ["numHot", "FONT_NUMBER_HOT"],
  ["numThaiHot", "FONT_NUMBER_THAI_HOT"],
];
export const SIZE_STEPS: { key: string; font: string; factor: number }[] = STEP_NAMES.map(
  ([key, font], i) => ({ key, font, factor: FONT_MEASURED[i][1] / SAMPLE_ADV / FONT_REF_W }),
);
export const SIZE_FACTOR = SIZE_STEPS.map((s) => s.factor);
/** Was die UHR für diesen Text bei dieser Stufe an Breite braucht (Anteil der Displaybreite).
 *  Basis ist die gemessene Breite von „18.5"; Buchstaben sind in Garmins Roboto etwas schmaler als
 *  Ziffern, die Schätzung fällt also leicht auf die vorsichtige Seite (warnt eher zu früh). */
export function watchTextWidthRatio(text: string, step: number): number {
  const w = FONT_MEASURED[Math.max(0, Math.min(FONT_MEASURED.length - 1, step))][1];
  return (text.length / FONT_SAMPLE.length) * (w / FONT_REF_W);
}
/** Höchste Stufe für Text (Labels/Freitext): die NUMBER-Fonts haben keine Buchstaben. */
export const MAX_TEXT_STEP = 4;
export const MAX_SIZE_STEP = SIZE_STEPS.length - 1;

/** Höchste Größenstufe für einen Elementtyp: Werte dürfen in die NUMBER-Fonts, Text nicht, der
 *  Pausiert-Hinweis bleibt klein (Jan: „aber nicht zu gross"). Spiegel von layouts._clean_element. */
export function maxStepFor(typ: number): number {
  if (typ === EL_VALUE) return MAX_SIZE_STEP;
  if (typ === EL_PAUSED) return 2;
  return MAX_TEXT_STEP;
}

// Beispieldaten je Feld — realistische Werte, damit man Textbreiten und Farb-Buckets sieht.
export const MOCK_VALUE: Record<number, string> = {
  1: "18.5", 5: "19.2", 6: "15.1", 7: "24.0",
  2: "142", 8: "131", 9: "168",
  3: "12:34", 4: "2.10", 10: "402", 13: "35",
  11: "24", 12: "14:25", 14: "0:48", 15: "0.21",
  16: "0:51", 17: "0.22", 18: "14.9", 19: "19.6", 20: "7",
};
export const SPEED_FIELDS = new Set([1, 5, 6, 7, 18, 19]);
export const HR_FIELDS = new Set([2, 8, 9]);

/** Farb-Buckets der Uhr (RecordView._speedColor/_hrColor). */
export function watchSpeedColor(kmh: number): string {
  if (kmh < 12) return "#3b82f6";
  if (kmh < 16) return "#22c55e";
  if (kmh < 20) return "#eab308";
  return "#ef4444";
}
export function watchHrColor(hr: number): string {
  if (hr < 120) return "#22c55e";
  if (hr < 150) return "#eab308";
  if (hr < 170) return "#f97316";
  return "#ef4444";
}

/** Wert-Farbe wie auf der Uhr, wenn `colorByValue` an ist (sonst null = Standardfarbe). */
export function valueColor(fieldId: number, colorByValue: boolean): string | null {
  if (!colorByValue) return null;
  const v = parseFloat(MOCK_VALUE[fieldId] ?? "");
  if (Number.isNaN(v)) return null;
  if (SPEED_FIELDS.has(fieldId)) return watchSpeedColor(v);
  if (HR_FIELDS.has(fieldId)) return watchHrColor(v);
  return null;
}

// Displaygrößen für Vorschau/Platzierung. Garmin-Werte aus watch/bin/catalog.json (dort 176×176 …
// 454×454; 108 round, 8 semioctagon = Instinct-Klasse, 5 rectangle) — hier die häufigsten als
// Auswahl. Apple/Wear melden ihre echten Maße künftig beim Config-Abruf; bis dahin gängige Größen.
export type WatchShape = "round" | "rect" | "semioctagon";
export const PREVIEW_SIZES: { id: string; label: string; w: number; h: number; shape: WatchShape }[] = [
  { id: "g176", label: "Garmin 176×176 (Instinct, kein Layout-Support)", w: 176, h: 176, shape: "semioctagon" },
  { id: "g208", label: "Garmin 208×208 (kein Layout-Support)", w: 208, h: 208, shape: "round" },
  { id: "g218", label: "Garmin 218×218 (kleinste unterstützte)", w: 218, h: 218, shape: "round" },
  { id: "g240", label: "Garmin 240×240", w: 240, h: 240, shape: "round" },
  { id: "g260", label: "Garmin 260×260", w: 260, h: 260, shape: "round" },
  { id: "g280", label: "Garmin 280×280", w: 280, h: 280, shape: "round" },
  { id: "g390", label: "Garmin 390×390", w: 390, h: 390, shape: "round" },
  { id: "g454", label: "Garmin 454×454", w: 454, h: 454, shape: "round" },
  { id: "g282r", label: "Garmin 282×470 (rechteckig)", w: 282, h: 470, shape: "rect" },
  { id: "a396", label: "Apple Watch 396×484", w: 396, h: 484, shape: "rect" },
  { id: "a416", label: "Apple Watch 416×496", w: 416, h: 496, shape: "rect" },
  { id: "w450", label: "Wear OS 450×450", w: 450, h: 450, shape: "round" },
  { id: "w384", label: "Wear OS 384×384", w: 384, h: 384, shape: "round" },
];
/** Kleinste Größe, die dynamische Layouts überhaupt bekommt — dagegen prüft der Editor auf
 *  Überlauf. NICHT 176×176: die Instinct-Klasse (96 KB) und das 128-KB-Tier (u. a. fēnix 5,
 *  FR 55/245/935) bekommen den Renderer nicht — sie sind zu knapp bei Speicher (dort crashte
 *  1.0.64 unter Dauerlast). Die kleinste Auflösung im layout-fähigen Tier (≥512 KB, 100 Geräte)
 *  ist 218×218 (Forerunner 255S). */
export const SMALLEST = PREVIEW_SIZES.find((s) => s.id === "g218") ?? PREVIEW_SIZES[0];

/** Neues Layout: REC-Punkt + Seiten-Punkte an den heutigen Positionen (RecordView: h*0.085 bzw.
 *  h*0.92) plus ein großer Speed-Wert mit Label — sieht per Default aus wie bisher, ist aber
 *  komplett umbaubar. */
export function defaultElements(): (number | string)[][] {
  return [
    [EL_VALUE, 500, 430, 4, 0, 0, 1],
    [EL_LABEL, 500, 560, 1, 0, 0, 1],
    [EL_REC, 500, 85, 1, 5, 0],
    [EL_DOTS, 500, 920, 1, 2, 0],
  ];
}

/** Zeichen, die die Uhr nicht darstellen kann (Built-in-Fonts: keine CJK-Glyphen, keine Emoji). */
export function undisplayableChars(text: string): string[] {
  const bad: string[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    const ok =
      cp < 0x0250 ||                       // Latein + Erweiterungen
      (cp >= 0x0400 && cp <= 0x04ff) ||    // Kyrillisch
      cp === 0x2191 || cp === 0x2193 ||    // ↑ ↓ (nutzt die Uhr selbst)
      cp === 0x00d8;                       // Ø
    if (!ok && !bad.includes(ch)) bad.push(ch);
  }
  return bad;
}
