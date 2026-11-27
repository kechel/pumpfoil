// Media-Ansicht (docs/MEDIA.md): die Daten eines Laufs (oder aller Laeufe) als Clip mit Zeitachse.
//
// Alles kommt aus Werten, die die Session-Ansicht ohnehin zeigt — hier wird NICHTS neu erkannt:
// Pumps aus `seg.pump_idx`, Gleitphasen aus `seg.glides`, Sprints aus `analysis.sprints.laeufe_fenster`,
// Carves aus `/carves`, Tempo/Puls/Pumpfrequenz je Track-Punkt. Zeiten sind SESSION-ms wie in
// SessionDetail (`indexZuSessionMs`), damit Sprint-Fenster und Punkte auf derselben Achse liegen.

import type { CarveData } from "../api";

export interface ClipPunkt {
  t: number;          // Session-ms
  x: number;          // Meter Ost (lokal, ab Mittelpunkt)
  y: number;          // Meter Nord
  v: number;          // km/h
  hr: number | null;
  ph: number | null;  // Pumpfrequenz Hz
  d: number;          // Strecke ab Clip-Beginn, Meter (nur innerhalb der Laeufe gezaehlt)
  span: number;       // Index des Abschnitts (Lauf) — zwischen Abschnitten wird keine Linie gezogen
}

export interface ClipSprint { kz: string; a: number; b: number; wert: number; meter: number | null; sekunden: number | null }
export interface ClipCarve {
  a: number; b: number; rot: number; dir: "L" | "R"; g: number;
  arc: [number, number, number][];   // feiner 25-Hz-Bogen aus /carves, projiziert: [x, y, g] — wie in der Karte
}

export interface Clip {
  spans: [number, number][];      // Session-ms je Abschnitt, zeitlich geordnet
  dauerMs: number;                // Summe der Abschnitte
  pts: ClipPunkt[];
  pumps: number[];                // Session-ms, sortiert
  pumpPos: { t: number; x: number; y: number }[];   // Lage der Pumps fuer die Punkte auf der Spur
  glides: [number, number][];
  sprints: ClipSprint[];
  carves: ClipCarve[];
  vLo: number; vHi: number;       // Tempo-Bereich fuer die Farbe (km/h)
  hrLo: number; hrHi: number;
  phLo: number; phHi: number;     // Pumpfrequenz-Bereich (Hz) fuer die Farbe „Pumps"
  gMax: number;                   // groesste Kurvenlage der Carves (Farbskala wie in der Karte)
  hatPuls: boolean; hatPumps: boolean;
  bbox: [number, number, number, number]; // minX, minY, maxX, maxY (Meter)
  lat0: number; lon0: number;     // Mittelpunkt der Projektion — fuer mehrere Fahrer auf einer Karte (mehrfach.ts)
}

const R = 6371000;

/** Sprint-Kennzahl in Strecke oder Dauer zerlegen: „sprint_100m" -> 100 m, „sprint_60s" -> 60 s. */
function kennzahl(kz: string): { meter: number | null; sekunden: number | null } {
  const m = /^sprint_(\d+)(m|s)$/.exec(kz);
  if (!m) return { meter: null, sekunden: null };
  return m[2] === "m" ? { meter: Number(m[1]), sekunden: null } : { meter: null, sekunden: Number(m[1]) };
}

/** Track-Index -> Session-ms. Erste Wahl: echte Zeiten vom Server (wenn die Anzahl passt), sonst die Lauf-Anker
 *  mit 1 Hz dazwischen — dieselbe Regel wie `indexZuSessionMs` in SessionDetail. */
export function zeitFunktion(session: any, trackZeiten: number[] | null): (i: number) => number {
  const n = session?.analysis?.track_geojson?.geometry?.coordinates?.length ?? 0;
  if (trackZeiten && n > 0 && trackZeiten.length === n) {
    return (i) => trackZeiten[Math.min(Math.max(Math.round(i), 0), n - 1)];
  }
  const off = session?.trim_start_ms ?? 0;
  const anker: { i: number; t: number }[] = [];
  for (const g of (session?.analysis?.segments ?? []) as any[]) {
    if (g.i_start != null && g.t_start_ms != null) anker.push({ i: g.i_start, t: g.t_start_ms + off });
    if (g.i_end != null && g.t_end_ms != null) anker.push({ i: g.i_end, t: g.t_end_ms + off });
  }
  anker.sort((a, b) => a.i - b.i);
  return (i) => {
    if (!anker.length) return off + i * 1000;
    if (i <= anker[0].i) return anker[0].t - (anker[0].i - i) * 1000;
    const z = anker[anker.length - 1];
    if (i >= z.i) return z.t + (i - z.i) * 1000;
    for (let k = 0; k < anker.length - 1; k++) {
      const a = anker[k], b = anker[k + 1];
      if (i >= a.i && i <= b.i) return b.i === a.i ? a.t : a.t + ((i - a.i) / (b.i - a.i)) * (b.t - a.t);
    }
    return off + i * 1000;
  };
}

/**
 * Clip bauen. `lauf` = Index in `analysis.segments` oder "alle" (alle Laeufe nacheinander, Pausen dazwischen
 * fallen weg wie beim Abspielen in der Session). Ohne Laeufe (reine GPS-Aufnahme) die ganze Spur.
 */
export function baueClip(session: any, trackZeiten: number[] | null, carves: CarveData | null,
  lauf: number | "alle", win: string): Clip | null {
  const gj = session?.analysis?.track_geojson;
  const coords: [number, number][] = gj?.geometry?.coordinates ?? [];
  if (coords.length < 2) return null;
  const props = gj.properties ?? {};
  const speeds: (number | null)[] = props.speeds?.[win] ?? props.speeds_mps ?? [];
  const hrArr: (number | null)[] = props.hr ?? [];
  const phArr: (number | null)[] = props.pump_hz ?? [];
  const segs: any[] = session.analysis.segments ?? [];
  const zeit = zeitFunktion(session, trackZeiten);

  const gewaehlt: any[] = lauf === "alle" ? segs : (segs[lauf] ? [segs[lauf]] : []);
  const bereiche: [number, number][] = gewaehlt.length
    ? gewaehlt.map((g) => [g.i_start, Math.min(g.i_end, coords.length - 1)] as [number, number])
    : [[0, coords.length - 1]];

  // Lokale Projektion um den Mittelpunkt der gewaehlten Punkte (fuer einen Lauf mehr als genau genug).
  let sLat = 0, sLon = 0, cnt = 0;
  for (const [a, b] of bereiche) for (let i = a; i <= b; i++) { sLon += coords[i][0]; sLat += coords[i][1]; cnt++; }
  const lat0 = sLat / cnt, lon0 = sLon / cnt;
  const kx = (Math.PI / 180) * R * Math.cos((lat0 * Math.PI) / 180), ky = (Math.PI / 180) * R;

  const pts: ClipPunkt[] = [];
  const spans: [number, number][] = [];
  let d = 0;
  bereiche.forEach(([a, b], si) => {
    let vorher: ClipPunkt | null = null;
    for (let i = a; i <= b; i++) {
      const [lon, lat] = coords[i];
      const x = (lon - lon0) * kx, y = (lat - lat0) * ky;
      if (vorher) d += Math.hypot(x - vorher.x, y - vorher.y);
      const sp = speeds[i];
      const p: ClipPunkt = {
        t: zeit(i), x, y, v: sp != null && isFinite(sp) ? sp * 3.6 : 0,
        hr: hrArr[i] != null && (hrArr[i] as number) > 0 ? hrArr[i] : null,
        ph: phArr[i] ?? null, d, span: si,
      };
      pts.push(p);
      vorher = p;
    }
    spans.push([zeit(a), zeit(b)]);
  });
  const dauerMs = spans.reduce((s, [a, b]) => s + Math.max(0, b - a), 0);
  if (dauerMs <= 0) return null;
  const drin = (t: number) => spans.some(([a, b]) => t >= a && t <= b);

  const pumps: number[] = [];
  const pumpPos: { t: number; x: number; y: number }[] = [];
  const glides: [number, number][] = [];
  for (const g of gewaehlt) {
    // `pump_idx` ist der GPS-Punkt (1 Hz) — also nur auf die Sekunde genau, und zwei Pumps in derselben Sekunde
    // tragen denselben Index. pg-1 legt jeden Pump auf den ERSTEN Punkt ab seiner Zeit (searchsorted in
    // analysis/pumpgleit), der Pump liegt also in der Sekunde VOR dem Punkt. Gruppen gleichmaessig ueber diese Sekunde
    // verteilen (sonst fielen sie im Takt der Musik zu einem Schlag zusammen und der Zaehler spraenge um zwei).
    // Bis 24.11. abends wurde ueber die Sekunde DANACH verteilt -> jeder Pump im Schnitt 1 s zu spaet.
    const idx = ((g.pump_idx ?? []) as number[]).slice().sort((a, b) => a - b);
    for (let j = 0; j < idx.length;) {
      let k = j; while (k < idx.length && idx[k] === idx[j]) k++;
      const pi = idx[j], n = k - j;
      const vor = Math.max(pi - 1, 0);
      const t0 = zeit(vor), t1 = zeit(pi);
      const c0 = coords[vor], c1 = coords[pi];
      for (let m = 0; m < n; m++) {
        const f = (m + 0.5) / n;
        pumps.push(t0 + (t1 - t0) * f);
        if (c0 && c1) pumpPos.push({
          t: t0 + (t1 - t0) * f,
          x: (c0[0] + (c1[0] - c0[0]) * f - lon0) * kx, y: (c0[1] + (c1[1] - c0[1]) * f - lat0) * ky,
        });
      }
      j = k;
    }
    for (const gl of (g.glides ?? []) as number[][]) glides.push([zeit(gl[0]), zeit(gl[1])]);
  }
  pumps.sort((a, b) => a - b);
  pumpPos.sort((a, b) => a.t - b.t);

  const sprints: ClipSprint[] = [];
  const sp = session.analysis.sprints;
  const lf: any[] = sp?.laeufe_fenster ?? [];
  for (let j = 0; j < lf.length; j++) {
    for (const kz of Object.keys(lf[j] ?? {})) {
      const f = lf[j][kz];
      const wert = sp?.laeufe?.[j]?.[kz] ?? 0;
      if (!f || !(wert > 0)) continue;
      if (!drin((f[0] + f[1]) / 2)) continue;
      sprints.push({ kz, a: f[0], b: f[1], wert, ...kennzahl(kz) });
    }
  }
  // Aeltere Sprint-Auswertungen (v6) haben keine Fenster je Lauf, nur das beste je Kennzahl — dann das nehmen
  // (nie neu rechnen, Memory sprint-nie-rueckwirkend). Sonst fehlte z. B. ein Event-Sieger im Sprint-Start.
  if (!lf.length && sp?.fenster) {
    for (const kz of Object.keys(sp.fenster)) {
      const f = sp.fenster[kz];
      const wert = sp.best?.[kz] ?? 0;
      if (!f || !(wert > 0) || !drin((f[0] + f[1]) / 2)) continue;
      sprints.push({ kz, a: f[0], b: f[1], wert, ...kennzahl(kz) });
    }
  }
  sprints.sort((a, b) => a.a - b.a);

  const cv: ClipCarve[] = [];
  let gMax = 0;
  (carves?.carves ?? []).forEach((c, ci) => {
    const a = zeit(c.i0), b = zeit(c.i1);
    if (!drin((a + b) / 2)) return;
    // arcs[ci] gehoert zu carves[ci] (so liest es auch die Karte in SessionDetail).
    const arc = (carves?.arcs?.[ci] ?? []).map(([la, lo, g]) => [(lo - lon0) * kx, (la - lat0) * ky, g] as [number, number, number]);
    for (const p of arc) gMax = Math.max(gMax, p[2]);
    gMax = Math.max(gMax, c.peak_g);
    cv.push({ a, b, rot: c.rot, dir: c.dir, g: c.peak_g, arc });
  });
  cv.sort((a, b) => a.a - b.a);

  let vLo = Infinity, vHi = -Infinity, hrLo = Infinity, hrHi = -Infinity, phLo = Infinity, phHi = -Infinity;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.v > 0) { vLo = Math.min(vLo, p.v); vHi = Math.max(vHi, p.v); }
    if (p.hr != null) { hrLo = Math.min(hrLo, p.hr); hrHi = Math.max(hrHi, p.hr); }
    if (p.ph != null && p.ph > 0) { phLo = Math.min(phLo, p.ph); phHi = Math.max(phHi, p.ph); }
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  return {
    spans, dauerMs, pts, pumps, pumpPos, glides, sprints, carves: cv,
    phLo: isFinite(phLo) ? phLo : 0.8, phHi: isFinite(phHi) ? phHi : 2, gMax: Math.max(gMax, 0.6),
    vLo: isFinite(vLo) ? Math.floor(vLo) : 0, vHi: isFinite(vHi) ? Math.ceil(vHi) : 30,
    hrLo: isFinite(hrLo) ? hrLo : 100, hrHi: isFinite(hrHi) ? hrHi : 170,
    hatPuls: isFinite(hrLo), hatPumps: pumps.length > 0,
    bbox: [minX, minY, maxX, maxY], lat0, lon0,
  };
}

/** Video-Sekunden (ohne Vor-/Nachlauf, bei Tempo 1) -> Session-ms, Pausen zwischen den Laeufen uebersprungen. */
export function clipZuSession(clip: Clip, ms: number): number {
  let rest = Math.max(0, ms);
  for (const [a, b] of clip.spans) {
    const l = b - a;
    if (rest <= l) return a + rest;
    rest -= l;
  }
  return clip.spans[clip.spans.length - 1][1];
}

/** Session-ms -> Clip-ms (Umkehrung von clipZuSession); Zeiten zwischen den Laeufen kleben am Ende des Laufs davor. */
export function sessionZuClip(clip: Clip, ts: number): number {
  let vorher = 0;
  for (const [a, b] of clip.spans) {
    if (ts <= a) return vorher;
    if (ts <= b) return vorher + (ts - a);
    vorher += b - a;
  }
  return vorher;
}

/** Erster Index mit `arr[i] > x` (arr aufsteigend). */
export function obereGrenze(arr: number[], x: number): number {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] <= x) lo = m + 1; else hi = m; }
  return lo;
}

/**
 * Ausschnitt waehlen (Feedback 27.11.2026: „Höchstens 180 Sekunden" trotz 8× — Jan: Ausschnitt waehlbar machen).
 * `von`/`bis` in Clip-ms (Pausen zwischen den Laeufen zaehlen nicht). Liefert einen neuen Clip, der nur diesen Teil
 * enthaelt: Abschnitte gekuerzt, Pumps/Gleiten/Sprints/Carves gefiltert, Strecke ab dem Ausschnitt neu gezaehlt,
 * Kartenausschnitt auf den Teil. Farbbereiche (Tempo, Puls, Pumpfrequenz) bleiben die des ganzen Clips, damit sich die
 * Farben beim Verschieben nicht aendern. Je ein Punkt vor und nach jeder Grenze bleibt drin, damit an den Raendern
 * zwischen echten Punkten interpoliert wird.
 */
export function zuschneiden(clip: Clip, von: number, bis: number): Clip {
  von = Math.max(0, von); bis = Math.min(clip.dauerMs, bis);
  if (bis - von < 1000 || (von <= 0 && bis >= clip.dauerMs)) return clip;
  const a = clipZuSession(clip, von), b = clipZuSession(clip, bis);
  const spans = clip.spans.map(([s, e]) => [Math.max(s, a), Math.min(e, b)] as [number, number]).filter(([s, e]) => e > s);
  if (!spans.length) return clip;
  const drin = (t: number) => spans.some(([s, e]) => t >= s && t <= e);
  const P = clip.pts;
  const innen = P.map((p) => drin(p.t));
  const keep = P.map((p, i) => innen[i]
    || (i + 1 < P.length && innen[i + 1] && P[i + 1].span === p.span)
    || (i > 0 && innen[i - 1] && P[i - 1].span === p.span));
  // Strecke am Beginn des Ausschnitts (zwischen den beiden Punkten um `a` interpoliert)
  let d0 = 0;
  for (let i = 0; i + 1 < P.length; i++) {
    const p = P[i], q = P[i + 1];
    if (p.t <= a && q.t >= a && p.span === q.span) { d0 = q.t > p.t ? p.d + (q.d - p.d) * (a - p.t) / (q.t - p.t) : p.d; break; }
    if (p.t >= a) { d0 = p.d; break; }
  }
  const pts = P.filter((_, i) => keep[i]).map((p) => ({ ...p, d: Math.max(0, p.d - d0) }));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  const pumps = clip.pumps.filter(drin);
  return {
    ...clip, spans, dauerMs: spans.reduce((s, [x, y]) => s + (y - x), 0), pts,
    pumps, pumpPos: clip.pumpPos.filter((p) => drin(p.t)),
    glides: clip.glides.map(([s, e]) => [Math.max(s, a), Math.min(e, b)] as [number, number]).filter(([s, e]) => e > s && drin((s + e) / 2)),
    sprints: clip.sprints.filter((s) => drin((s.a + s.b) / 2)),
    carves: clip.carves.filter((c) => drin((c.a + c.b) / 2)),
    hatPumps: pumps.length > 0,
    bbox: pts.length ? [minX, minY, maxX, maxY] : clip.bbox,
  };
}
