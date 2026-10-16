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
// kreuzungen: Paare von Abschnitten, die sich kreuzen (nur ohne „Ohne Ueberschneidungen" > 0).
// doppelt: Abschnitte, die schon einmal gefahren wurden (in einer der beiden Richtungen) — beim
// Rundkurs mit zwei Punkten der Rueckweg. Beides fuer die Tabelle und die Empfehlung.
export type Route = { punkte: number[]; meter: number; wertung: number; richtung: number;
                      kreuzungen: number; doppelt: number };
// rundkurs: zurueck zum Startpunkt (Jan, 16.10.2026, Vorgabe an). Der Rueckweg darf derselbe
// Abschnitt sein wie der erste, nur umgekehrt — das ist keine Ueberschneidung. `punkte` zaehlt
// die verschiedenen Startpunkte; in `Route.punkte` steht der Start dann am Ende noch einmal.
export type RoutenOptionen = { punkte: number; ohneKreuzung: boolean; rundkurs?: boolean; jeRichtung?: number };
export type RoutenErgebnis = { routen: Route[]; gekuerzt: boolean; genutzt: number };

// Grenzen gegen kombinatorisches Wachstum an grossen Seen (Jan, 16.10.2026: „aus Performance-
// Gruenden nach oben begrenzen"). Gemessen am groessten Fall, Lac d'Annecy (33 Startpunkte ab 2
// Starts): ohne Abbruch bis 230 ms je Reglerbewegung und bei erreichter Schrittgrenze ZUFAELLIGE
// Teilergebnisse. Jetzt: nur die meistgenutzten MAX_POSITIONEN, und die Suche behaelt je
// Startrichtung nur die besten `jeRichtung` Routen — ein Ast, der schon schlechter ist als die
// schlechteste behaltene, wird nicht weiterverfolgt (die Wertung waechst nur). Naechste Punkte
// zuerst, damit frueh gute Routen da sind und der Abbruch greift.
export const MAX_POSITIONEN = 12;
const MAX_SCHRITTE = 300000;

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
                                  opt: RoutenOptionen): RoutenErgebnis {
  const p = pos.slice(0, MAX_POSITIONEN);
  const leer = { routen: [], gekuerzt: false, genutzt: p.length };
  const ziel = Math.min(Math.max(2, Math.round(opt.punkte)), p.length);
  if (p.length < 2 || start < 0 || start >= p.length) return leer;
  const k = opt.jeRichtung ?? 20;
  const kx = 111320 * Math.cos((p[0].lat * Math.PI) / 180);
  const xy: P[] = p.map((q) => [q.lon * kx, q.lat * 111320]);
  const d = p.map((a) => p.map((b) => abstandM(a, b)));
  // Nachbarn je Punkt, naechste zuerst
  const nachbarn = p.map((_, i) => p.map((_, j) => j)
    .filter((j) => j !== i && d[i][j] >= minM && d[i][j] <= maxM)
    .sort((x, y) => d[i][x] - d[i][y]));
  const beste: Route[][] = Array.from({ length: 8 }, () => []);   // je Richtung, aufsteigend
  let schritte = 0;
  const weg: number[] = [start];
  const besucht = new Set([start]);
  const kreuztFrueheren = (i: number, j: number) => {
    for (let q = 0; q + 1 < weg.length - 1; q++) {
      if (kreuzen(xy[weg[q]], xy[weg[q + 1]], xy[i], xy[j])) return true;
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
  const schranke = (r: number) => (beste[r].length < k ? Infinity : beste[r][k - 1].wertung);
  const gehe = (i: number, meter: number, wertung: number, r: number) => {
    if (++schritte > MAX_SCHRITTE) return;
    if (wertung >= schranke(r)) return;
    if (weg.length === ziel) {
      let punkte = [...weg];
      if (opt.rundkurs) {
        if (d[i][start] < minM || d[i][start] > maxM) return;
        if (opt.ohneKreuzung && kreuztFrueheren(i, start)) return;
        wertung += d[i][start] + kehre(i, start);
        meter += d[i][start];
        if (wertung >= schranke(r)) return;
        punkte = [...weg, start];
      }
      // Doppelte Abschnitte: Aufschlag in Hoehe ihrer Laenge (Jan: „auch in der Sortierung anders")
      const gesehen = new Set<string>();
      let doppelt = 0;
      for (let q = 0; q + 1 < punkte.length; q++) {
        const a = punkte[q], b = punkte[q + 1];
        const schl = a < b ? `${a}-${b}` : `${b}-${a}`;
        if (gesehen.has(schl)) { doppelt++; wertung += d[a][b]; } else gesehen.add(schl);
      }
      if (wertung >= schranke(r)) return;
      let kreuzungen = 0;
      for (let q = 0; q + 1 < punkte.length; q++) {
        for (let u = q + 2; u + 1 < punkte.length; u++) {
          if (kreuzen(xy[punkte[q]], xy[punkte[q + 1]], xy[punkte[u]], xy[punkte[u + 1]])) kreuzungen++;
        }
      }
      const liste = beste[r];
      liste.push({ punkte, meter, wertung, richtung: r, kreuzungen, doppelt });
      liste.sort((x, y) => x.wertung - y.wertung);
      if (liste.length > k) liste.pop();
      return;
    }
    for (const j of nachbarn[i]) {
      if (besucht.has(j)) continue;
      if (opt.ohneKreuzung && kreuztFrueheren(i, j)) continue;
      const rr = weg.length === 1 ? richtungIndex(p[i], p[j]) : r;
      const kk = kehre(i, j);
      besucht.add(j); weg.push(j);
      gehe(j, meter + d[i][j], wertung + d[i][j] + kk, rr);
      weg.pop(); besucht.delete(j);
    }
  };
  gehe(start, 0, 0, 0);
  const routen = beste.flat().sort((x, y) => x.wertung - y.wertung);
  return { routen, gekuerzt: schritte > MAX_SCHRITTE, genutzt: p.length };
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
