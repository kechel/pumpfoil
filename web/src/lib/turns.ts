// Turn-/Carve-Erkennung aus dem GPS-Track (nur Anzeige/Verifikation — NICHT in Rekorde/Stats).
// Ansatz: Peilung zwischen aufeinanderfolgenden GPS-Punkten -> vorzeichenbehaftete Heading-Deltas
// -> gleichsinnige Akkumulation (mit Hysterese) = ein Dreh-Event. Nur Events ab 90° zählen (drunter
// zu ungenau). Buckets nach Betrag: 90–180° | 180–360° | >360°. Richtung = Vorzeichen (R=+/L=−).
// Kurze Carves sind bei 1-Hz-GPS unterabgetastet — bewusst grob, zum Durchklickern/Verifizieren.

export type TurnBucket = "s" | "m" | "l";   // 90–180 | 180–360 | >360
export interface TurnEvent { i0: number; i1: number; rot: number; radius: number; dir: "L" | "R"; bucket: TurnBucket; }
export interface TurnResult {
  events: TurnEvent[];
  pointBucket: Record<number, TurnBucket>;   // Koordinaten-Index -> Bucket (fürs Einfärben)
  counts: { s: number; m: number; l: number };
}

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;
function hav(a: [number, number], b: [number, number]): number {
  const p1 = rad(a[1]), p2 = rad(b[1]), dp = p2 - p1, dl = rad(b[0] - a[0]);
  const x = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}
function brg(a: [number, number], b: [number, number]): number {
  const p1 = rad(a[1]), p2 = rad(b[1]), dl = rad(b[0] - a[0]);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(y, x) * 180) / Math.PI;
}
function norm(d: number): number { while (d > 180) d -= 360; while (d < -180) d += 360; return d; }

const STEP = 4;      // m — kleinere Schritte = GPS-Jitter, ignorieren
const TOL = 20;      // ° — kleine Gegen-Blips tolerieren (Hysterese)
const MIN = 90;      // ° — darunter kein Carve
const RMAX = 12;     // m — MAX Radius eines Carves. Enger Radius ist der Kern: große Kurven/
                     // Loops (Radius >> 10 m) sind KEINE Carves. Radius = Bogenlänge / Winkel(rad).

export function detectTurns(
  coords: [number, number][],
  segments: { type?: string; i_start: number; i_end: number }[],
): TurnResult {
  const events: TurnEvent[] = [];
  const pointBucket: Record<number, TurnBucket> = {};
  const counts = { s: 0, m: 0, l: 0 };
  if (!coords?.length || !segments?.length) return { events, pointBucket, counts };

  for (const s of segments) {
    if (s.type !== "foiling") continue;
    const raw = coords.slice(s.i_start, s.i_end + 1);
    // Schritt-Filter, Original-Index (absolut) mitführen.
    const pts: [number, number][] = [raw[0]];
    const abs: number[] = [s.i_start];
    for (let k = 1; k < raw.length; k++) {
      if (hav(pts[pts.length - 1], raw[k]) >= STEP) { pts.push(raw[k]); abs.push(s.i_start + k); }
    }
    if (pts.length < 3) continue;
    // Segment-Länge zwischen den gefilterten Punkten (für Bogenlänge/Radius).
    const step: number[] = [];
    for (let i = 0; i < pts.length - 1; i++) step.push(hav(pts[i], pts[i + 1]));
    const brgs: number[] = [];
    for (let i = 0; i < pts.length - 1; i++) brgs.push(brg(pts[i], pts[i + 1]));
    const deltas: number[] = [];
    for (let i = 0; i < brgs.length - 1; i++) deltas.push(norm(brgs[i + 1] - brgs[i]));

    let acc = 0, a0 = 0;
    const close = (rot: number, a: number, b: number) => {
      const mag = Math.abs(rot);
      if (mag < MIN) return;
      // Bogenlänge des Events + Radius = Bogen / Winkel(rad). Nur enge Carves behalten.
      let arc = 0;
      for (let k = a; k <= b && k + 1 < step.length; k++) arc += step[k + 1];
      const radius = arc / (mag * Math.PI / 180);
      if (radius > RMAX) return;   // große Kurve/Loop -> kein Carve
      const bucket: TurnBucket = mag < 180 ? "s" : mag < 360 ? "m" : "l";
      counts[bucket]++;
      const o0 = abs[Math.min(a + 1, abs.length - 1)];
      const o1 = abs[Math.min(b + 1, abs.length - 1)];
      events.push({ i0: o0, i1: o1, rot, radius, dir: rot > 0 ? "R" : "L", bucket });
      for (let o = o0; o <= o1; o++) pointBucket[o] = bucket;
    };
    for (let i = 0; i < deltas.length; i++) {
      const d = deltas[i];
      if (acc === 0 || acc > 0 === d > 0 || Math.abs(d) < TOL) acc += d;
      else { close(acc, a0, i); acc = d; a0 = i; }
    }
    if (acc !== 0) close(acc, a0, deltas.length - 1);
  }
  return { events, pointBucket, counts };
}

export const TURN_BUCKET_COLOR: Record<TurnBucket, string> = {
  s: "#f59e0b",   // 90–180° — amber
  m: "#f97316",   // 180–360° — orange
  l: "#dc2626",   // >360° — rot
};
