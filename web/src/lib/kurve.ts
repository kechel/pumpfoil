// GPS-Luecke innerhalb eines Laufs als weiche Kurve zeichnen (Jan, 16.10.2026: „wenn es schon als
// ein Lauf erkannt wurde, dann sollte der gps-track auch durchgehend gezeichnet werden"). Amazfit
// setzt mitten im Lauf 7-14 s aus; eine gerade Linie ueber 35 m sieht aus wie ein Knick.
//
// Catmull-Rom-Spline (zentripetal waere genauer, uniform reicht fuer diese kurzen Stuecke): die Kurve
// geht durch beide Endpunkte und nimmt die Richtung der Nachbarpunkte davor und danach mit. Gerechnet
// direkt in Grad — auf einigen Dutzend Metern ist die Verzerrung bedeutungslos.

/** Ab diesem Abstand (m) wird statt einer Geraden eine Kurve gezeichnet — bei 1-Hz-GPS sind
 *  normale Schritte 3-8 m, darunter bleibt alles wie es war. */
export const KURVE_AB_M = 12;

type P = [number, number];

/** Punkte von p1 nach p2 (beide enthalten), p0/p3 sind die Nachbarn davor/danach. */
export function kurve(p0: P, p1: P, p2: P, p3: P, schritte = 12): P[] {
  const out: P[] = [];
  for (let k = 0; k <= schritte; k++) {
    const t = k / schritte, t2 = t * t, t3 = t2 * t;
    const f = (a: number, b: number, c: number, d: number) =>
      0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
    out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
  }
  return out;
}

/** Linienzug fuer den Abschnitt i -> i+1 eines Laufs: Gerade, oder ueber eine Luecke die Kurve.
 *  `lo`/`hi` begrenzen die Nachbarn auf den Lauf (keine Richtung von ausserhalb). */
export function abschnitt(coords: P[], i: number, lo: number, hi: number, abstandM: number): P[] {
  const a = coords[i], b = coords[i + 1];
  if (abstandM < KURVE_AB_M) return [a, b];
  const v = i - 1 >= lo ? coords[i - 1] : a;
  const n = i + 2 <= hi ? coords[i + 2] : b;
  return kurve(v, a, b, n);
}
