// Gemeinsame Track-Farbskalen für Karten (Session-Detail + Vergleich), damit beide
// Ansichten identisch einfärben. Einmal hier ändern -> überall konsistent.

// Lineare Skala blau(0) -> rot(1).
export function rampColor(t: number): string {
  const c = Math.min(Math.max(t, 0), 1);
  return `hsl(${(1 - c) * 240}, 85%, 55%)`;
}

/**
 * Puls-Bereich fuer die Farbrampe, aus beliebig vielen Puls-Arrays.
 *
 * Lag vorher DREIMAL dupliziert (SessionDetail, CompareMap, Puls-Streifen) und lief dadurch
 * auseinander — dieselbe Pulszahl bekam je nach Ansicht eine andere Farbe, obwohl der Kopf dieser
 * Datei genau das verhindern soll. Deshalb hier, an einer Stelle.
 *
 * 0 zaehlt NICHT mit: eine Null im Puls-Array heisst „kein Messwert" (Sensor-Luecke), nicht
 * „0 Schlaege". Vorher wurde nur auf null geprueft, und schon wenige Nullen zogen die Skala bis
 * ganz nach unten — gemessen am Bestand: 50 von 1093 Sessions mit Puls sind betroffen, bei einer
 * reichten 5 von 768 Punkten, um die Rampe von 81 auf 0 zu strecken und alle echten Werte in die
 * obere Haelfte zu quetschen.
 *
 * Kein Spread (`Math.min(...v)`): ueber mehrere verglichene Sessions kommen leicht Zehntausende
 * Werte zusammen, und ein Spread mit so vielen Argumenten sprengt den Aufruf-Stack.
 */
export function hrRange(...arrays: (number | null | undefined)[][]): [number, number] {
  let lo = Infinity, hi = -Infinity;
  for (const arr of arrays) {
    for (const v of arr) {
      if (v == null || v <= 0) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  return hi >= lo ? [lo, hi] : [100, 170];
}

/** Farbe eines Pulswerts. null oder 0 = kein Messwert -> grau, wie bisher in beiden Karten. */
export function hrColor(v: number | null | undefined, range: [number, number]): string {
  // WEISS heisst „hier wurde kein Puls gemessen" (Jan, 04.09.) — und das kommt oefter vor, als
  // man denkt: bleibt der Sensor stehen, nimmt die Analyse die stehengebliebenen Werte heraus
  // (detect_v2.puls_ohne_eingefrorene), sie kommen hier also als null an. Grau war dafuer zu
  // leise; es sah aus wie eine dunkle Zone statt wie eine Luecke.
  if (v == null || v <= 0) return "#ffffff";
  const [lo, hi] = range;
  return rampColor((v - lo) / Math.max(hi - lo, 1));
}

// Speed-Farbskala (km/h) mit einstellbaren Grenzen; außerhalb -> schwarz.
export function speedColor(kmh: number, lo: number, hi: number): string {
  if (kmh < lo || kmh > hi) return "#000000";
  return rampColor((kmh - lo) / Math.max(hi - lo, 1));
}

// Divergierende Skala relativ zur optimalen Foil-Geschwindigkeit: blau = drunter,
// grün = exakt drauf, rot = drüber. Spanne ±20 % um Optimal (geclamped).
export const OPTIMAL_SPAN = 0.2;
export function optimalColor(kmh: number, opt: number): string {
  if (!opt || opt <= 0) return "#64748b";
  const r = kmh / opt;
  let hue: number;
  if (r <= 1) {
    const tt = Math.min(Math.max((r - (1 - OPTIMAL_SPAN)) / OPTIMAL_SPAN, 0), 1); // 0=blau,1=grün
    hue = 220 - tt * (220 - 140);
  } else {
    const tt = Math.min(Math.max((r - 1) / OPTIMAL_SPAN, 0), 1); // 0=grün,1=rot
    hue = 140 - tt * 140;
  }
  return `hsl(${hue}, 80%, 48%)`;
}
