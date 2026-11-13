/**
 * GPS-Spur NUR FUER DIE ANZEIGE glaetten (13.11.2026, Jan: „gps track sieht sehr wackelig / zackig aus").
 * Handy-GPS zittert bei 1 Hz oft quer zur Fahrt hin und her; die Linie wirkt dann zackiger, als gefahren wurde.
 *
 * Regeln:
 *  - GLEICHE LAENGE, GLEICHER INDEX: Einfaerbung (Tempo, Puls, Pumps je Punkt) und Laufgrenzen (`segments.i_start`
 *    zeigt per Index in den Track) bleiben genau auf ihren Punkten — es werden nur Koordinaten verschoben.
 *  - Gewicht 1-2-1 ueber die direkten Nachbarn: loescht abwechselndes Zittern (Zickzack) aus, echte Kurven bei
 *    1 Hz verschieben sich nur um Bruchteile des Punktabstands.
 *  - Nicht ueber Spruenge glaetten (> 30 m zu einem Nachbarn: Luecke, Aufholsprung) und Anfang/Ende bleiben.
 *  - Alle Zahlen (Strecke, Tempo, Laeufe) rechnet der Server aus den Rohpunkten — davon aendert sich nichts.
 */
const SPRUNG_M = 30;

function meter(a: [number, number], b: [number, number]): number {
  const dla = ((b[0] - a[0]) * Math.PI) / 180;
  const dlo = ((b[1] - a[1]) * Math.PI) / 180 * Math.cos((a[0] * Math.PI) / 180);
  return 6371000 * Math.hypot(dla, dlo);
}

/** coords als [lat, lon]; Rueckgabe gleich lang. */
export function glatteSpur(coords: [number, number][]): [number, number][] {
  const n = coords.length;
  if (n < 3) return coords;
  const out = coords.slice();
  for (let i = 1; i < n - 1; i++) {
    const a = coords[i - 1], b = coords[i], c = coords[i + 1];
    if (meter(a, b) > SPRUNG_M || meter(b, c) > SPRUNG_M) continue;
    out[i] = [(a[0] + 2 * b[0] + c[0]) / 4, (a[1] + 2 * b[1] + c[1]) / 4];
  }
  return out;
}
