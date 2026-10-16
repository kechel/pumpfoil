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

// eigen: selbst gesetzter Punkt („+" auf der Karte), nicht aus echten Starts — rechnet wie jeder andere.
export type Startposition = { lat: number; lon: number; starts: number; sessions: number; fahrer?: number; eigen?: boolean };
// kreuzungen: Paare von Abschnitten, die sich kreuzen (nur ohne „Ohne Ueberschneidungen" > 0).
// doppelt: Abschnitte, die schon einmal gefahren wurden (in einer der beiden Richtungen) — beim
// Rundkurs mit zwei Punkten der Rueckweg. Beides fuer die Tabelle und die Empfehlung.
// erstesZiel: der Startplatz, zu dem der erste Abschnitt fuehrt (Index in den Positionen) — die
// „Richtung", in die man losfaehrt (Jan, 16.10.2026: statt Himmelsrichtung das naechste Ziel; man
// startet oft senkrecht vom Ufer weg und faehrt dann zu einem Nachbarn).
export type Route = { punkte: number[]; meter: number; wertung: number; erstesZiel: number;
                      kreuzungen: number; doppelt: number };
// rundkurs: zurueck zum Startpunkt (Jan, 16.10.2026, Vorgabe an). Der Rueckweg darf derselbe
// Abschnitt sein wie der erste, nur umgekehrt — das ist keine Ueberschneidung. `punkte` zaehlt
// die verschiedenen Startpunkte; in `Route.punkte` steht der Start dann am Ende noch einmal.
// ausgeschlossen: Startplaetze, die keine Route anfahren soll (Jan: „wenn man weiss, dass ein
// bestimmter Start nicht funktioniert oder man selber da nicht starten kann").
// ziel: ohne Rundkurs der Startplatz, an dem die Route enden soll (Jan); undefined = beliebig.
export type RoutenOptionen = { punkte: number; ohneKreuzung: boolean; rundkurs?: boolean; jeRichtung?: number;
                               ausgeschlossen?: Set<number>; ziel?: number };
export type RoutenErgebnis = { routen: Route[]; gekuerzt: boolean; genutzt: number };

// Grenzen gegen kombinatorisches Wachstum an grossen Seen (Jan, 16.10.2026: „aus Performance-
// Gruenden nach oben begrenzen" — aber ALLE verlaesslichen Startpunkte anzeigen und verplanen,
// keine feste Hoechstzahl). Begrenzt wird deshalb die SUCHE, nicht die Punkte:
//   * von jedem Punkt aus nur die MAX_NACHBARN naechsten im erlaubten Abstand (eine Route springt
//     nicht zum zehntnaechsten Punkt),
//   * je erstem Ziel nur die besten `jeRichtung` Routen; ein Ast, der schon schlechter ist als
//     die schlechteste behaltene, wird nicht weiterverfolgt (die Wertung waechst nur),
//   * naechste Punkte zuerst, damit frueh gute Routen da sind und der Abbruch greift,
//   * ein Zeitbudget; ist es erschoepft, gibt es die besten bis dahin (`gekuerzt`).
const MAX_NACHBARN = 8;
const ZEIT_MS = 150;

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
  const p = pos;
  const leer = { routen: [], gekuerzt: false, genutzt: p.length };
  const ziel = Math.min(Math.max(2, Math.round(opt.punkte)), p.length - (opt.ausgeschlossen?.size ?? 0));
  if (p.length < 2 || start < 0 || start >= p.length) return leer;
  const k = opt.jeRichtung ?? 20;
  const kx = 111320 * Math.cos((p[0].lat * Math.PI) / 180);
  const xy: P[] = p.map((q) => [q.lon * kx, q.lat * 111320]);
  const d = p.map((a) => p.map((b) => abstandM(a, b)));
  // Nachbarn je Punkt, naechste zuerst
  const nachbarn = p.map((_, i) => p.map((_, j) => j)
    .filter((j) => j !== i && d[i][j] >= minM && d[i][j] <= maxM && !opt.ausgeschlossen?.has(j))
    .sort((x, y) => d[i][x] - d[i][y])
    .slice(0, MAX_NACHBARN));
  const beste: Route[][] = p.map(() => []);   // je erstem Ziel, aufsteigend nach Wertung
  let schritte = 0;
  let gekuerzt = false;
  const bis = (typeof performance !== "undefined" ? performance.now() : Date.now()) + ZEIT_MS;
  const jetzt = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
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
    if (gekuerzt) return;
    if ((++schritte & 1023) === 0 && jetzt() > bis) { gekuerzt = true; return; }
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
      liste.push({ punkte, meter, wertung, erstesZiel: r, kreuzungen, doppelt });
      liste.sort((x, y) => x.wertung - y.wertung);
      if (liste.length > k) liste.pop();
      return;
    }
    // Ziel (ohne Rundkurs): erst als letzter Punkt anfahren, und der letzte Punkt MUSS es sein
    const mitZiel = !opt.rundkurs && opt.ziel != null && opt.ziel !== start;
    for (const j of nachbarn[i]) {
      if (besucht.has(j)) continue;
      if (mitZiel && (j === opt.ziel) !== (weg.length === ziel - 1)) continue;
      if (opt.ohneKreuzung && kreuztFrueheren(i, j)) continue;
      const rr = weg.length === 1 ? j : r;
      const kk = kehre(i, j);
      besucht.add(j); weg.push(j);
      gehe(j, meter + d[i][j], wertung + d[i][j] + kk, rr);
      weg.pop(); besucht.delete(j);
    }
  };
  gehe(start, 0, 0, 0);
  const routen = beste.flat().sort((x, y) => x.wertung - y.wertung);
  return { routen, gekuerzt, genutzt: p.length };
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

/** Warum keine Route herauskommt — fuer eine verstaendliche Meldung statt einer leeren Liste (Jan).
 *  Probiert die Einstellungen einzeln gelockert durch; die erste, die hilft, ist der Grund. */
export type KeinGrund =
  | { grund: "nachbar"; naechsterM: number | null }      // vom Start aus nichts im Abstandsbereich
  | { grund: "zuWenig"; verfuegbar: number }             // weniger Plaetze als gewuenscht
  | { grund: "rundkurs" }                                // offen ginge es, zurueck zum Start nicht
  | { grund: "kreuzung" }                                // nur mit Ueberschneidungen
  | { grund: "punkte"; hoechstens: number }              // mit weniger Punkten ginge es
  | { grund: "ziel" }                                    // zum gewaehlten Ziel geht es nicht
  | { grund: "unbekannt" };

export function warumKeine(pos: Startposition[], start: number, minM: number, maxM: number,
                           opt: RoutenOptionen): KeinGrund {
  const aus = opt.ausgeschlossen ?? new Set<number>();
  const verfuegbar = pos.length - aus.size;
  if (verfuegbar < Math.max(2, opt.punkte)) return { grund: "zuWenig", verfuegbar };
  const andere = pos.map((_, j) => j).filter((j) => j !== start && !aus.has(j));
  const abst = andere.map((j) => abstandM(pos[start], pos[j]));
  if (!abst.some((m) => m >= minM && m <= maxM)) {
    return { grund: "nachbar", naechsterM: abst.length ? Math.round(Math.min(...abst)) : null };
  }
  const geht = (o: Partial<RoutenOptionen>) =>
    routenVorschlagen(pos, start, minM, maxM, { ...opt, ...o, jeRichtung: 1 }).routen.length > 0;
  if (opt.rundkurs && geht({ rundkurs: false })) return { grund: "rundkurs" };
  if (!opt.rundkurs && opt.ziel != null && geht({ ziel: undefined })) return { grund: "ziel" };
  if (opt.ohneKreuzung && geht({ ohneKreuzung: false })) return { grund: "kreuzung" };
  for (let n = opt.punkte - 1; n >= 2; n--) if (geht({ punkte: n })) return { grund: "punkte", hoechstens: n };
  return { grund: "unbekannt" };
}
