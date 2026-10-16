// Routen-Vorschlaege aus den verlaesslichen Startpositionen eines Spots (Jan, 16.10.2026).
//
// Eine Route beginnt am gewaehlten Startpunkt (Vorgabe: der meistgenutzte, Index 0), geht von
// Position zu Position, jede hoechstens einmal, und jeder Abschnitt liegt zwischen `minM` und
// `maxM` Metern. Sie hat genau `punkte` Startpunkte (den Start mitgezaehlt). Mit `ohneKreuzung`
// darf kein Abschnitt einen frueheren kreuzen — kein Hin-und-her ueber den See (Jan, 16.10.2026).
// Sortiert nach einer Wertung: Strecke plus Aufschlag fuer jede Kehre spitzer als 90 Grad (bis zur
// Laenge des neuen Abschnitts bei voller Umkehr). Kehren sind also erlaubt, rutschen aber nach
// unten (Jan: „die 35-Grad-Regel muss nicht hart sein, aber die Sortierung beeinflussen"). Bei
// gleicher Punktzahl liegt so oben die Route, die am Ufer entlang fuehrt statt quer hinueber. Positionen kommen vom Server (GET /api/community/spot/{id}/
// startpositionen), die Rechnung ist hier — bei einer Handvoll Punkte ist sie trivial.

export type Startposition = { lat: number; lon: number; starts: number; sessions: number };
export type Route = { punkte: number[]; meter: number; wertung: number };
export type RoutenOptionen = { punkte: number; ohneKreuzung: boolean; anzahl?: number };

const MAX_POSITIONEN = 15;      // mehr gibt es an keinem Spot; Schutz gegen kombinatorisches Wachstum
const MAX_SCHRITTE = 200000;

export function abstandM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const kx = 111320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot((b.lon - a.lon) * kx, (b.lat - a.lat) * 111320);
}

type P = [number, number];

/** Schneiden sich die Strecken a-b und c-d echt (gemeinsame Endpunkte zaehlen nicht)? */
export function kreuzen(a: P, b: P, c: P, d: P): boolean {
  const o = (p: P, q: P, r: P) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

export function routenVorschlagen(pos: Startposition[], start: number, minM: number, maxM: number,
                                  opt: RoutenOptionen): Route[] {
  const p = pos.slice(0, MAX_POSITIONEN);
  const ziel = Math.min(Math.max(2, Math.round(opt.punkte)), p.length);
  if (p.length < 2 || start < 0 || start >= p.length) return [];
  const kx = 111320 * Math.cos((p[0].lat * Math.PI) / 180);
  const xy: P[] = p.map((q) => [q.lon * kx, q.lat * 111320]);
  const d = p.map((a) => p.map((b) => abstandM(a, b)));
  const raus: Route[] = [];
  let schritte = 0;
  const weg: number[] = [start];
  const besucht = new Set([start]);
  const kreuztFrueheren = (i: number, j: number) => {
    // neuer Abschnitt i-j gegen alle frueheren ausser dem direkt anschliessenden
    for (let k = 0; k + 1 < weg.length - 1; k++) {
      if (kreuzen(xy[weg[k]], xy[weg[k + 1]], xy[i], xy[j])) return true;
    }
    return false;
  };
  // Aufschlag fuer die Kehre an i (von weg[-2] kommend, nach j): 0 bis 90 Grad Winkel zwischen
  // Rueck- und Weiterweg = voller bis kein Aufschlag, gemessen an der Laenge des neuen Abschnitts.
  const kehre = (i: number, j: number) => {
    if (weg.length < 2) return 0;
    const h = xy[weg[weg.length - 2]];
    const a: P = [h[0] - xy[i][0], h[1] - xy[i][1]], b: P = [xy[j][0] - xy[i][0], xy[j][1] - xy[i][1]];
    const w = Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1]) /
      (Math.hypot(...a) * Math.hypot(...b) || 1)))) * 180 / Math.PI;
    return w < 90 ? ((90 - w) / 90) * d[i][j] : 0;
  };
  const gehe = (i: number, meter: number, wertung: number) => {
    if (++schritte > MAX_SCHRITTE) return;
    if (weg.length === ziel) { raus.push({ punkte: [...weg], meter, wertung }); return; }
    for (let j = 0; j < p.length; j++) {
      if (besucht.has(j) || d[i][j] < minM || d[i][j] > maxM) continue;
      if (opt.ohneKreuzung && kreuztFrueheren(i, j)) continue;
      const k = kehre(i, j);
      besucht.add(j); weg.push(j);
      gehe(j, meter + d[i][j], wertung + d[i][j] + k);
      weg.pop(); besucht.delete(j);
    }
  };
  gehe(start, 0, 0);
  raus.sort((a, b) => a.wertung - b.wertung);
  return raus.slice(0, opt.anzahl ?? 10);
}

const RICHTUNGEN = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"];

/** Himmelsrichtung von a nach b als Index 0..7 in RICHTUNGEN (0 = N, im Uhrzeigersinn). */
export function richtungIndex(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const kx = 111320 * Math.cos((a.lat * Math.PI) / 180);
  const w = (Math.atan2((b.lon - a.lon) * kx, (b.lat - a.lat) * 111320) * 180) / Math.PI;
  return Math.round(((w + 360) % 360) / 45) % 8;
}

export function richtungName(i: number): string { return RICHTUNGEN[i]; }

/** Kurzbeschreibung eines Punkts relativ zum Bezugspunkt, z. B. „130 m SW". */
export function lageText(p: { lat: number; lon: number }, bezug: { lat: number; lon: number },
                         richtungen = RICHTUNGEN): string {
  const m = abstandM(bezug, p);
  if (m < 15) return "";
  const kx = 111320 * Math.cos((bezug.lat * Math.PI) / 180);
  const w = (Math.atan2((p.lon - bezug.lon) * kx, (p.lat - bezug.lat) * 111320) * 180) / Math.PI;
  return `${Math.round(m / 10) * 10} m ${richtungen[Math.round(((w + 360) % 360) / 45) % 8]}`;
}
