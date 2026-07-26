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
// Die Faktoren sind GEMESSEN, nicht geschätzt (2026-07-26): das SDK legt je Gerät in
// ~/.Garmin/ConnectIQ/Devices/<id>/simulator.json die Font-Dateien offen, und deren Namen tragen
// die Pixelgröße (z. B. FNT_FENIX6X_CDPG_ROBOTO_13B = 13 px, ..._BIONIC_BOLD_NUMBER_62 = 62 px).
// Werte = Median über 42 layout-fähige Geräte (Höhe ÷ Displaybreite), Streuung eng:
//   xtiny .038–.060 · tiny .048–.071 · small .058–.079 · medium .070–.092 · large .079–.100
//   numMild .094–.119 · numMedium .125–.147 · numHot .166–.193 · numThaiHot .166–.221
// Die vorherigen Schätzwerte lagen am oberen Ende 36 % zu hoch (0,30 statt 0,22) — die Vorschau
// zeigte Werte also deutlich größer als die Uhr, und die Overflow-Warnung schlug zu früh Alarm.
export const SIZE_STEPS: { key: string; font: string; factor: number }[] = [
  { key: "xtiny", font: "FONT_XTINY", factor: 0.050 },
  { key: "tiny", font: "FONT_TINY", factor: 0.069 },
  { key: "small", font: "FONT_SMALL", factor: 0.078 },
  { key: "medium", font: "FONT_MEDIUM", factor: 0.092 },
  { key: "large", font: "FONT_LARGE", factor: 0.096 },
  { key: "numMild", font: "FONT_NUMBER_MILD", factor: 0.115 },
  { key: "numMedium", font: "FONT_NUMBER_MEDIUM", factor: 0.139 },
  { key: "numHot", font: "FONT_NUMBER_HOT", factor: 0.192 },
  { key: "numThaiHot", font: "FONT_NUMBER_THAI_HOT", factor: 0.221 },
];
export const SIZE_FACTOR = SIZE_STEPS.map((s) => s.factor);
/** Höchste Stufe für Text (Labels/Freitext): die NUMBER-Fonts haben keine Buchstaben. */
export const MAX_TEXT_STEP = 4;
export const MAX_SIZE_STEP = SIZE_STEPS.length - 1;

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
