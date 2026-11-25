// Media-Overlay mit mehreren Fahrern (docs/MEDIA.md Schritt 6, Jan 25.11.2026).
//
// Der Hauptfahrer bleibt der normale Clip (Musik, Datenfelder, Ebenen wie bisher). Bis zu drei weitere Fahrer laufen
// mit: jeder hat seinen eigenen Clip und eine Verschiebung `delta`, die Haupt-Session-ms in seine Session-ms umrechnet
// (tsFahrer = tsHaupt + delta). Die gemeinsame Zeitleiste ersetzt die `spans` des Hauptclips — so laufen Vorschau,
// Export und Musik ohne Sonderweg ueber denselben Clip.
//
// Modi:
//   echtzeit  gemeinsame Uhr („wie es war"): wer 20 s spaeter startete, erscheint 20 s spaeter. Gesperrt, sobald ein
//             Fahrer die Uhrzeit verbirgt (zeit_verborgen) — die Oberflaeche prueft das, hier wird es vorausgesetzt.
//   start     alle Laeufe starten bei t=0 am selben Punkt (Geisterrennen, auch ueber Spots und Tage hinweg).
//   sprint    die besten Sprintfenster einer Kennzahl starten gleichzeitig (5 s Vorlauf, 3 s Nachlauf).
//
// Lage: Echtzeit am selben Ort in EINER Projektion (die Spuren liegen wie in echt). Sonst, und wenn die Fahrer weiter
// als FERN_M auseinander sind (anderer Spot, „Ort verbergen" = Point Nemo), wird jeder Start auf den Start des
// Hauptfahrers gelegt, auf Wunsch auch auf dieselbe Anfangsrichtung gedreht.

import type { Clip, ClipSprint } from "./clip";

export type Modus = "echtzeit" | "start" | "sprint";
export type FeldKey = "speed" | "distance" | "time" | "pumps" | "hr";
export const FELD_KEYS: FeldKey[] = ["speed", "distance", "time", "pumps", "hr"];
/** Fahrer 1 = ich (weiss), dann feste Reihenfolge — eine Farbe bleibt am Fahrer, auch wenn ein anderer entfernt wird.
 *  Ausserhalb der Tempo-Skala (Blau bis Rot) bzw. mit deutlich anderer Helligkeit; die Spur traegt die Farbe als Rand
 *  mit dunkler Fuge, Kopf und Kasten zusaetzlich die Nummer (Kennung nie nur ueber die Farbe). */
export const FAHRER_FARBEN = ["#ffffff", "#f472b6", "#fbbf24", "#a78bfa"];
export const MAX_MITFAHRER = 3;
export const SPRINT_VOR_MS = 5000;
export const SPRINT_NACH_MS = 3000;
const FERN_M = 5000;

export interface Anzeige { felder: Record<FeldKey, boolean>; spur: "daten" | "fahrer" }
export const ANZEIGE_HAUPT: Anzeige = { felder: { speed: true, distance: false, time: true, pumps: false, hr: false }, spur: "daten" };
export const ANZEIGE_MIT: Anzeige = { felder: { speed: true, distance: false, time: true, pumps: false, hr: false }, spur: "daten" };

/** Geometrie eines Fahrers: erst um (ox, oy) drehen, dann verschieben — in Metern des Hauptclips. */
export interface Lage { ox: number; oy: number; rot: number; dx: number; dy: number }
const KEINE_LAGE: Lage = { ox: 0, oy: 0, rot: 0, dx: 0, dy: 0 };

export interface FahrerSpur {
  nr: number;              // 1 = Hauptfahrer
  farbe: string;
  anzeige: Anzeige;
  clip: Clip;
  delta: number;           // tsFahrer = tsHaupt + delta
  lage: Lage;
  tVon: number; tBis: number;   // Fahrer-Session-ms: gezeichnet wird nur dieses Fenster
  sprint: ClipSprint | null;    // Modus sprint: das abgeglichene Fenster
}

export interface Mehrfach {
  modus: Modus;
  haupt: FahrerSpur;
  mit: FahrerSpur[];
  bbox: [number, number, number, number];
  fern: boolean;           // Echtzeit, aber mind. ein Fahrer liegt woanders -> auf den Start gelegt
}

export function lageAnwenden(l: Lage, x: number, y: number): [number, number] {
  if (!l.rot) return [x + l.dx, y + l.dy];
  const c = Math.cos(l.rot), s = Math.sin(l.rot), ux = x - l.ox, uy = y - l.oy;
  return [l.ox + c * ux - s * uy + l.dx, l.oy + s * ux + c * uy + l.dy];
}

/** Lage (gebrochener Index) zum Zeitpunkt ts im Clip — erster Punkt mit t >= ts. */
function punktBei(clip: Clip, ts: number): { x: number; y: number; k: number } {
  const pts = clip.pts;
  let lo = 0, hi = pts.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (pts[m].t < ts) lo = m + 1; else hi = m; }
  return { x: pts[lo].x, y: pts[lo].y, k: lo };
}

/** Anfangsrichtung (Bogenmass) ab Punkt k: zum ersten Punkt mindestens 20 m weiter. */
function richtung(clip: Clip, k: number): number | null {
  const p = clip.pts[k];
  for (let j = k + 1; j < clip.pts.length; j++) {
    const q = clip.pts[j];
    if (q.span !== p.span) break;
    if (Math.hypot(q.x - p.x, q.y - p.y) >= 20) return Math.atan2(q.y - p.y, q.x - p.x);
  }
  return null;
}

/** Bester Sprint einer Kennzahl (hoechster Wert = schnellste Zeit bzw. hoechstes Tempo). */
export function besterSprint(clip: Clip, kz: string): ClipSprint | null {
  let best: ClipSprint | null = null;
  for (const s of clip.sprints) if (s.kz === kz && (!best || s.wert > best.wert)) best = s;
  return best;
}

function mischen(spans: [number, number][]): [number, number][] {
  const s = spans.slice().sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [a, b] of s) {
    const z = out[out.length - 1];
    if (z && a <= z[1]) z[1] = Math.max(z[1], b); else out.push([a, b]);
  }
  return out;
}

export interface FahrerEingabe { clip: Clip; startedAt: string; anzeige: Anzeige; farbe: string; nr: number }

/**
 * Gemeinsame Zeitleiste und Lage aller Fahrer. Gibt den Hauptclip mit neuer Zeitleiste zurueck (fuer Vorschau, Export,
 * Musik) und die Zeichendaten. `null`, wenn der Modus mit diesen Daten nicht geht (z. B. Sprint fehlt beim Hauptfahrer).
 */
export function baueMehrfach(haupt: Clip, hauptStart: string, hauptAnzeige: Anzeige, fahrer: FahrerEingabe[],
  modus: Modus, opt: { sprintKz?: string | null; drehen?: boolean }): { clip: Clip; mehr: Mehrfach } | null {
  const t0 = Date.parse(hauptStart);
  let spans: [number, number][];
  const deltas: number[] = [];
  const sprints: (ClipSprint | null)[] = [];
  let hauptSprint: ClipSprint | null = null;

  if (modus === "echtzeit") {
    const extra: [number, number][] = [];
    for (const f of fahrer) {
      const d = t0 - Date.parse(f.startedAt);
      deltas.push(d);
      sprints.push(null);
      // Laeufe des Fahrers, die einen Lauf des Hauptfahrers beruehren, verlaengern die Zeitleiste.
      for (const [a, b] of f.clip.spans) {
        const ha = a - d, hb = b - d;
        if (haupt.spans.some(([x, y]) => ha <= y && hb >= x)) extra.push([ha, hb]);
      }
    }
    spans = mischen([...haupt.spans, ...extra]);
  } else if (modus === "start") {
    const s0 = haupt.spans[0][0];
    let laenge = haupt.spans[haupt.spans.length - 1][1] - s0;
    for (const f of fahrer) {
      const sr = f.clip.spans[0][0];
      deltas.push(sr - s0);
      sprints.push(null);
      laenge = Math.max(laenge, f.clip.spans[f.clip.spans.length - 1][1] - sr);
    }
    spans = [[s0, s0 + laenge]];
  } else {
    const kz = opt.sprintKz;
    hauptSprint = kz ? besterSprint(haupt, kz) : null;
    if (!hauptSprint) return null;
    let laenge = hauptSprint.b - hauptSprint.a;
    for (const f of fahrer) {
      const sp = besterSprint(f.clip, kz!);
      sprints.push(sp);
      deltas.push(sp ? sp.a - hauptSprint.a : NaN);
      if (sp) laenge = Math.max(laenge, sp.b - sp.a);
    }
    spans = [[hauptSprint.a - SPRINT_VOR_MS, hauptSprint.a + laenge + SPRINT_NACH_MS]];
  }

  const von = spans[0][0], bis = spans[spans.length - 1][1];
  // Startpunkt des Hauptfahrers fuer die Ausrichtung: Beginn der Zeitleiste (Sprint: Sprintbeginn).
  const hRef = punktBei(haupt, hauptSprint ? hauptSprint.a : von);
  const hRicht = richtung(haupt, hRef.k);
  const kx = (Math.PI / 180) * 6371000 * Math.cos((haupt.lat0 * Math.PI) / 180), ky = (Math.PI / 180) * 6371000;

  let fern = false;
  const mit: FahrerSpur[] = [];
  fahrer.forEach((f, i) => {
    const delta = deltas[i];
    if (!Number.isFinite(delta)) return;     // Sprint-Modus: dieser Fahrer hat die Kennzahl nicht
    let lage: Lage = KEINE_LAGE;
    const tVon = von + delta, tBis = bis + delta;
    let ausrichten = modus !== "echtzeit";
    if (modus === "echtzeit") {
      lage = { ...KEINE_LAGE, dx: (f.clip.lon0 - haupt.lon0) * kx, dy: (f.clip.lat0 - haupt.lat0) * ky };
      if (Math.hypot(lage.dx, lage.dy) > FERN_M) { ausrichten = true; fern = true; }
    }
    if (ausrichten) {
      const ref = punktBei(f.clip, sprints[i] ? sprints[i]!.a : Math.max(tVon, f.clip.spans[0][0]));
      let rot = 0;
      if (opt.drehen && modus !== "echtzeit") {
        const r = richtung(f.clip, ref.k);
        if (r != null && hRicht != null) rot = hRicht - r;
      }
      lage = { ox: ref.x, oy: ref.y, rot, dx: hRef.x - ref.x, dy: hRef.y - ref.y };
    }
    mit.push({ nr: f.nr, farbe: f.farbe, anzeige: f.anzeige, clip: f.clip, delta, lage, tVon, tBis, sprint: sprints[i] });
  });

  const clip: Clip = { ...haupt, spans, dauerMs: spans.reduce((s, [a, b]) => s + Math.max(0, b - a), 0) };
  const hauptSpur: FahrerSpur = {
    nr: 1, farbe: FAHRER_FARBEN[0], anzeige: hauptAnzeige, clip: haupt, delta: 0, lage: KEINE_LAGE,
    // Sprint: auch die eigene Spur nur im Fenster (sonst stuende der ganze Lauf vor dem Sprint schon da).
    tVon: modus === "sprint" ? von : -Infinity, tBis: modus === "sprint" ? bis : Infinity, sprint: hauptSprint,
  };

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const dazu = (x: number, y: number) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); };
  for (const sp of [hauptSpur, ...mit]) {
    for (const p of sp.clip.pts) {
      if (p.t < sp.tVon || p.t > sp.tBis) continue;
      const [x, y] = lageAnwenden(sp.lage, p.x, p.y);
      dazu(x, y);
    }
  }
  if (!isFinite(minX)) { const [a, b, c, d] = haupt.bbox; minX = a; minY = b; maxX = c; maxY = d; }
  return { clip, mehr: { modus, haupt: hauptSpur, mit, bbox: [minX, minY, maxX, maxY], fern } };
}
