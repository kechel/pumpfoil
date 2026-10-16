// Routen-Vorschlaege aus den verlaesslichen Startpositionen eines Spots (Jan, 16.10.2026).
//
// Eine Route beginnt am gewaehlten Startpunkt (Vorgabe: der meistgenutzte, Index 0),
// geht von Position zu Position, jede hoechstens einmal, und jeder Abschnitt liegt zwischen
// `minM` und `maxM` Metern. Vorgeschlagen werden nur Routen, die sich nicht mehr verlaengern
// lassen, die laengsten zuerst. Positionen kommen vom Server (GET /api/community/spot/{id}/
// startpositionen), die Rechnung ist hier — bei einer Handvoll Punkte ist sie trivial.

export type Startposition = { lat: number; lon: number; starts: number; sessions: number };
export type Route = { punkte: number[]; meter: number };

const MAX_POSITIONEN = 15;      // mehr gibt es an keinem Spot; Schutz gegen kombinatorisches Wachstum
const MAX_SCHRITTE = 50000;

export function abstandM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const kx = 111320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot((b.lon - a.lon) * kx, (b.lat - a.lat) * 111320);
}

export function routenVorschlagen(pos: Startposition[], start: number, minM: number, maxM: number,
                                  anzahl = 10): Route[] {
  const p = pos.slice(0, MAX_POSITIONEN);
  if (p.length < 2 || start < 0 || start >= p.length) return [];
  const d = p.map((a) => p.map((b) => abstandM(a, b)));
  const erlaubt = (i: number, j: number) => i !== j && d[i][j] >= minM && d[i][j] <= maxM;
  const raus: Route[] = [];
  let schritte = 0;
  const weg: number[] = [start];
  const besucht = new Set([start]);
  const gehe = (i: number, meter: number) => {
    if (++schritte > MAX_SCHRITTE) return;
    let weiter = false;
    for (let j = 0; j < p.length; j++) {
      if (besucht.has(j) || !erlaubt(i, j)) continue;
      weiter = true;
      besucht.add(j); weg.push(j);
      gehe(j, meter + d[i][j]);
      weg.pop(); besucht.delete(j);
    }
    if (!weiter && weg.length >= 2) raus.push({ punkte: [...weg], meter });
  };
  gehe(start, 0);
  raus.sort((a, b) => b.meter - a.meter || b.punkte.length - a.punkte.length);
  return raus.slice(0, anzahl);
}

const RICHTUNGEN = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"];

/** Kurzbeschreibung eines Punkts relativ zum Bezugspunkt, z. B. „130 m SW". */
export function lageText(p: { lat: number; lon: number }, bezug: { lat: number; lon: number },
                         richtungen = RICHTUNGEN): string {
  const m = abstandM(bezug, p);
  if (m < 15) return "";
  const kx = 111320 * Math.cos((bezug.lat * Math.PI) / 180);
  const w = (Math.atan2((p.lon - bezug.lon) * kx, (p.lat - bezug.lat) * 111320) * 180) / Math.PI;
  return `${Math.round(m / 10) * 10} m ${richtungen[Math.round(((w + 360) % 360) / 45) % 8]}`;
}
