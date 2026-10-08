/**
 * Minimum und Maximum OHNE `Math.min(...werte)`: das Ausbreiten legt jeden Wert als Argument auf den
 * Stack, und ab einigen zehntausend Werten bricht der Browser mit „Maximum call stack size exceeded"
 * ab (Feedback 08.10.2026: Labeln einer langen Aufnahme auf /sessions/:id/label, TimeChart.tsx:58).
 * Leeres Array -> [Infinity, -Infinity], wie Math.min()/Math.max() ohne Argumente.
 */
export function minMax(werte: readonly number[]): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of werte) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return [lo, hi];
}
