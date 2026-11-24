// Media-Ansicht (docs/MEDIA.md): ein Bild des Overlays zu einer Video-Zeit zeichnen.
//
// Reine Funktion von (Clip, Einstellungen, Zeit) -> Canvas. Vorschau und Export benutzen GENAU diese Funktion,
// damit die Datei so aussieht wie die Vorschau. Der Hintergrund bleibt durchsichtig, ausser die Ausgabe will
// Schwarz oder Gruen.

import { type Clip, clipZuSession, obereGrenze } from "./clip";
import { hrColor, rampColor, speedColor } from "../trackColors";
import { carveColor } from "../turns";

export type Anker = "tl" | "tc" | "tr" | "ml" | "mc" | "mr" | "bl" | "bc" | "br";
export const ANKER: Anker[] = ["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"];

// Kein Datenfeld „Gleiten" (Jan 24.11.2026: weg) — Gleitphasen zeigt die Ebene auf der Spur.
export type ElKey = "track" | "speed" | "pumps" | "pumprate" | "hr" | "distance" | "time" | "sprint" | "carve" | "logo";
export const EL_KEYS: ElKey[] = ["track", "speed", "pumps", "pumprate", "hr", "distance", "time", "sprint", "carve", "logo"];

export interface ElCfg { an: boolean; pos: Anker; gr: number }
export type Format = "9:16" | "4:5" | "1:1" | "16:9";
export type Hintergrund = "alpha" | "schwarz" | "gruen";

export interface MediaCfg {
  tempo: number;
  vor: number;          // Sekunden Standbild am Anfang
  nach: number;         // Sekunden Standbild am Ende (Ergebnisse bleiben stehen)
  format: Format;
  hoehe: 720 | 1080;    // kurze Seite
  fps: 30 | 60;
  farbe: "speed" | "hr" | "pump" | "cyan" | "weiss";
  ebenen: { glides: boolean; carves: boolean; sprints: boolean; pumps: boolean };   // Ebenen ueber der Spur, wie in der Karte
  geist: boolean;       // ganze Strecke blass vorab zeigen
  dicke: number;        // Linienstaerke der Spur: 1 duenn, 1.6 mittel, 2.4 dick (Jan 24.11.2026)
  schatten: boolean;
  hintergrund: Hintergrund;
  sprints: string[];    // gezeigte Sprint-Kennzahlen (z. B. sprint_100m, sprint_60s)
  el: Record<ElKey, ElCfg>;
}

export const CFG_DEFAULT: MediaCfg = {
  tempo: 1, vor: 1, nach: 3, format: "9:16", hoehe: 1080, fps: 30, farbe: "speed", geist: true, dicke: 1, schatten: true,
  hintergrund: "alpha",   // Jan 24.11.: die meisten legen es im Schnittprogramm als WebM drueber
  ebenen: { glides: true, carves: true, sprints: true, pumps: false },
  sprints: ["sprint_100m", "sprint_60s"],
  el: {
    track: { an: true, pos: "tr", gr: 1 },
    speed: { an: true, pos: "bl", gr: 1.4 },
    pumps: { an: true, pos: "bl", gr: 1 },
    pumprate: { an: false, pos: "bl", gr: 1 },
    hr: { an: false, pos: "br", gr: 1 },
    distance: { an: true, pos: "br", gr: 1 },
    time: { an: true, pos: "br", gr: 1 },
    sprint: { an: true, pos: "tl", gr: 1 },
    carve: { an: true, pos: "ml", gr: 1 },
    logo: { an: true, pos: "bc", gr: 0.7 },
  },
};

export function masse(cfg: Pick<MediaCfg, "format" | "hoehe">): { w: number; h: number } {
  const k = cfg.hoehe;
  // Kanten gerade halten (H.264 verlangt gerade Masse).
  const gerade = (n: number) => Math.round(n / 2) * 2;
  switch (cfg.format) {
    case "9:16": return { w: k, h: gerade((k * 16) / 9) };
    case "4:5": return { w: k, h: gerade((k * 5) / 4) };
    case "1:1": return { w: k, h: k };
    case "16:9": return { w: gerade((k * 16) / 9), h: k };
  }
}

/** Gesamtlaenge des Videos in Sekunden. */
export function videoDauer(clip: Clip, cfg: MediaCfg): number {
  return cfg.vor + clip.dauerMs / 1000 / cfg.tempo + cfg.nach;
}

export interface Texte {
  speed: string; pumps: string; pumprate: string; hr: string; distance: string; time: string;
  carves: string; kmh: string; bpm: string;
  pumpRate: (hz: number) => string;       // formatiert nach der Kadenz-Einheit des Nutzers
}

/** Sprint-Kennzahl sprachneutral benennen: „sprint_100m" -> „100 m", „sprint_60s" -> „1 min". */
export function sprintName(kz: string): string {
  const m = /^sprint_(\d+)(m|s)$/.exec(kz);
  if (!m) return kz;
  const n = Number(m[1]);
  return m[2] === "m" ? `${n} m` : n % 60 === 0 ? `${n / 60} min` : `${n} s`;
}

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

function fmtMS(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function fmtStrecke(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

export interface Zustand {
  ts: number;            // Session-ms
  clipMs: number;        // vergangene Clip-Zeit (ms, Tempo 1)
  i: number; f: number;  // Punktindex + Anteil zum naechsten
  v: number; hr: number | null; ph: number | null; d: number;
  nPumps: number; seitPump: number;
}

export function zustandBei(clip: Clip, cfg: MediaCfg, tv: number): Zustand {
  const lauf = clip.dauerMs;
  const clipMs = Math.min(Math.max((tv - cfg.vor) * 1000 * cfg.tempo, 0), lauf);
  const ts = clipZuSession(clip, clipMs);
  const pts = clip.pts;
  let lo = 0, hi = pts.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (pts[m].t <= ts) lo = m; else hi = m - 1; }
  const p = pts[lo], q = pts[Math.min(lo + 1, pts.length - 1)];
  const f = q !== p && q.span === p.span && q.t > p.t ? Math.min(Math.max((ts - p.t) / (q.t - p.t), 0), 1) : 0;
  const nPumps = obereGrenze(clip.pumps, ts);
  const seitPump = nPumps > 0 ? ts - clip.pumps[nPumps - 1] : Infinity;
  return {
    ts, clipMs, i: lo, f,
    v: p.v + (q.v - p.v) * f, hr: p.hr, ph: p.ph, d: p.d + (q.d - p.d) * f,
    nPumps, seitPump,
  };
}

/** Strecke bis Session-ms `ts` (interpoliert) — fuer den Sprint-Fortschritt. */
function streckeBis(clip: Clip, ts: number): number {
  const pts = clip.pts;
  let lo = 0, hi = pts.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (pts[m].t <= ts) lo = m; else hi = m - 1; }
  const p = pts[lo], q = pts[Math.min(lo + 1, pts.length - 1)];
  const f = q.t > p.t ? Math.min(Math.max((ts - p.t) / (q.t - p.t), 0), 1) : 0;
  return p.d + (q.d - p.d) * f;
}

// Ein Block = gemessene Groesse + Zeichenfunktion an (x, y) linksoben.
interface Block { w: number; h: number; draw: (ctx: CanvasRenderingContext2D, x: number, y: number, align: "l" | "c" | "r") => void }

function textStil(ctx: CanvasRenderingContext2D, cfg: MediaCfg, u: number) {
  if (cfg.schatten) { ctx.shadowColor = "rgba(0,0,0,0.65)"; ctx.shadowBlur = 10 * u; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 2 * u; }
  else { ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; }
}

/** Kennzahl: grosser Wert + Einheit, darunter die Beschriftung. */
function statBlock(ctx: CanvasRenderingContext2D, cfg: MediaCfg, u: number, wert: string, einheit: string, label: string,
  akzent = 0): Block {
  const fw = 92 * u, fe = 38 * u, fl = 26 * u;
  ctx.font = `800 ${fw}px ${FONT}`; const ww = ctx.measureText(wert).width;
  ctx.font = `700 ${fe}px ${FONT}`; const we = einheit ? ctx.measureText(einheit).width + 10 * u : 0;
  ctx.font = `600 ${fl}px ${FONT}`; const wl = ctx.measureText(label.toUpperCase()).width;
  const w = Math.max(ww + we, wl), h = fw * 1.02 + fl * 1.3;
  return {
    w, h, draw: (c, x, y, al) => {
      textStil(c, cfg, u);
      const zeile = ww + we;
      const x0 = al === "l" ? x : al === "c" ? x + (w - zeile) / 2 : x + w - zeile;
      const sk = 1 + 0.12 * akzent;
      c.save();
      c.translate(x0, y + fw * 0.85);
      c.scale(sk, sk);
      c.fillStyle = "#ffffff"; c.textBaseline = "alphabetic"; c.textAlign = "left";
      c.font = `800 ${fw}px ${FONT}`; c.fillText(wert, 0, 0);
      c.restore();
      if (einheit) { c.font = `700 ${fe}px ${FONT}`; c.fillStyle = "#22d3ee"; c.fillText(einheit, x0 + ww + 10 * u, y + fw * 0.85); }
      c.font = `600 ${fl}px ${FONT}`; c.fillStyle = "rgba(255,255,255,0.85)";
      const lx = al === "l" ? x : al === "c" ? x + (w - wl) / 2 : x + w - wl;
      c.fillText(label.toUpperCase(), lx, y + fw * 1.02 + fl);
    },
  };
}

function trackBlock(clip: Clip, cfg: MediaCfg, z: Zustand, u: number, W: number, H: number): Block {
  const [minX, minY, maxX, maxY] = clip.bbox;
  const bw = Math.max(maxX - minX, 1), bh = Math.max(maxY - minY, 1);
  // Groesse relativ zum Bild (Jan 24.11.: „die aktuelle L groesse ist eher die kleinste, das neue L sollte dann
  // bildschirmfuellend sein mit nur 1cm rand rund rum"): S = 57 % der kurzen Seite (das alte L), M = 78 %,
  // L = ganzes Bild bis auf den Rand (6 % der kurzen Seite, auf dem Handy ~1 cm — derselbe Rand wie fuer die Zahlen).
  const kurz = Math.min(W, H), rand = kurz * 0.06;
  const gr = cfg.el.track.gr;
  const s = gr >= 1.4
    ? Math.min((W - 2 * rand) / bw, (H - 2 * rand) / bh)
    : Math.min((kurz * (gr >= 1 ? 0.78 : 0.57)) / Math.max(bw, bh), (W - 2 * rand) / bw, (H * 0.6) / bh);
  const w = bw * s, h = bh * s;
  const e = cfg.ebenen;
  const dk = cfg.dicke || 1;   // Linienstaerke: Spur, Baender, Boegen und Punkte wachsen gemeinsam
  return {
    w, h, draw: (c, x, y) => {
      const X = (vx: number) => x + (vx - minX) * s;
      const Y = (vy: number) => y + (maxY - vy) * s;
      const pts = clip.pts;
      c.lineCap = "round"; c.lineJoin = "round";
      c.shadowColor = cfg.schatten ? "rgba(0,0,0,0.55)" : "transparent"; c.shadowBlur = cfg.schatten ? 8 * u : 0;
      if (cfg.geist) {
        c.strokeStyle = "rgba(255,255,255,0.28)"; c.lineWidth = 4 * u * dk;
        c.beginPath();
        for (let k = 0; k < pts.length; k++) {
          if (k === 0 || pts[k].span !== pts[k - 1].span) c.moveTo(X(pts[k].x), Y(pts[k].y)); else c.lineTo(X(pts[k].x), Y(pts[k].y));
        }
        c.stroke();
      }
      // Punkte eines Zeitfensters bis „jetzt" als Linie (fuer die Baender unter der Spur).
      const band = (a: number, b: number) => {
        c.beginPath(); let erst = true;
        for (let k = 0; k <= z.i; k++) {
          const p = pts[k];
          if (p.t < a || p.t > b) continue;
          if (erst) { c.moveTo(X(p.x), Y(p.y)); erst = false; } else c.lineTo(X(p.x), Y(p.y));
        }
        if (!erst && z.ts >= a && z.ts <= b) { const q = pts[Math.min(z.i + 1, pts.length - 1)], p = pts[z.i]; c.lineTo(X(p.x + (q.x - p.x) * z.f), Y(p.y + (q.y - p.y) * z.f)); }
        c.stroke();
      };
      // Gleitphasen: cyanfarbenes Band unter der Spur, die Spur selbst behaelt ihre Farbe (Tempo sieht man weiter).
      if (e.glides) {
        c.strokeStyle = "rgba(34,211,238,0.85)"; c.lineWidth = 20 * u * dk;
        for (const [a, b] of clip.glides) if (z.ts >= a) band(a, b);
      }
      // Sprints: weisses Band unter der Spur (wie in der Session-Karte).
      const sprints = e.sprints ? clip.sprints.filter((sp) => cfg.sprints.includes(sp.kz)) : [];
      c.strokeStyle = "rgba(255,255,255,0.9)"; c.lineWidth = 14 * u * dk;
      for (const sp of sprints) if (z.ts >= sp.a) band(sp.a, sp.b);
      c.shadowColor = "transparent";
      // Die Spur in der gewaehlten Farbe — dieselben Skalen wie die Karte (trackColors.ts).
      c.lineWidth = 7 * u * dk;
      const farbe = (q: ClipPunktLite) => cfg.farbe === "weiss" ? "#ffffff" : cfg.farbe === "cyan" ? "#22d3ee"
        : cfg.farbe === "hr" ? hrColor(q.hr, [clip.hrLo, clip.hrHi])
        : cfg.farbe === "pump" ? (q.ph == null ? "#64748b" : rampColor((q.ph - clip.phLo) / Math.max(clip.phHi - clip.phLo, 1e-6)))
        : speedColor(q.v, clip.vLo, Math.max(clip.vHi, clip.vLo + 1));
      for (let k = 1; k <= z.i + 1 && k < pts.length; k++) {
        const a = pts[k - 1], b0 = pts[k];
        if (a.span !== b0.span) continue;
        const letzt = k === z.i + 1;
        if (letzt && z.f <= 0) break;
        const bx = letzt ? a.x + (b0.x - a.x) * z.f : b0.x, by = letzt ? a.y + (b0.y - a.y) * z.f : b0.y;
        c.strokeStyle = farbe(b0);
        c.beginPath(); c.moveTo(X(a.x), Y(a.y)); c.lineTo(X(bx), Y(by)); c.stroke();
      }
      // Carves: die feinen Boegen in der Kurvenlage-Farbe UEBER der Spur, wachsen waehrend des Carves mit.
      if (e.carves) {
        c.lineWidth = 8 * u * dk;
        for (const cv of clip.carves) {
          if (z.ts < cv.a || cv.arc.length < 2) continue;
          const anteil = Math.min(1, (z.ts - cv.a) / Math.max(cv.b - cv.a, 1));
          const bis = Math.max(1, Math.round(anteil * (cv.arc.length - 1)));
          for (let k = 1; k <= bis; k++) {
            const p0 = cv.arc[k - 1], p1 = cv.arc[k];
            c.strokeStyle = carveColor(p1[2], clip.gMax);
            c.beginPath(); c.moveTo(X(p0[0]), Y(p0[1])); c.lineTo(X(p1[0]), Y(p1[1])); c.stroke();
          }
        }
      }
      // Pumps: kleine weisse Punkte, sobald sie gemacht sind (wie die Pump-Marker der Karte).
      if (e.pumps) {
        c.fillStyle = "#f8fafc"; c.strokeStyle = "#0f172a"; c.lineWidth = 1.5 * u;
        for (const pp of clip.pumpPos) {
          if (pp.t > z.ts) break;
          c.beginPath(); c.arc(X(pp.x), Y(pp.y), 4 * u * dk, 0, Math.PI * 2); c.fill(); c.stroke();
        }
      }
      // Sprint-Anfang und -Ende: magentafarbene Punkte wie in der Karte.
      for (const sp of sprints) {
        for (const tt of [sp.a, sp.b]) {
          if (z.ts < tt) continue;
          let k = 0; while (k < pts.length - 1 && pts[k + 1].t <= tt) k++;
          c.fillStyle = "#c026d3"; c.strokeStyle = "#ffffff"; c.lineWidth = 3 * u;
          c.beginPath(); c.arc(X(pts[k].x), Y(pts[k].y), 9 * u * Math.sqrt(dk), 0, Math.PI * 2); c.fill(); c.stroke();
        }
      }
      // Aktuelle Position
      const p = pts[z.i], q = pts[Math.min(z.i + 1, pts.length - 1)];
      c.fillStyle = "#ffffff"; c.strokeStyle = "#0f172a"; c.lineWidth = 3 * u;
      c.beginPath(); c.arc(X(p.x + (q.x - p.x) * z.f), Y(p.y + (q.y - p.y) * z.f), 11 * u * Math.sqrt(dk), 0, Math.PI * 2); c.fill(); c.stroke();
    },
  };
}

type ClipPunktLite = { v: number; hr: number | null; ph: number | null };

function sprintBlocks(ctx: CanvasRenderingContext2D, clip: Clip, cfg: MediaCfg, z: Zustand, u: number): Block[] {
  // Je Kennzahl nur das juengste Fenster, das schon begonnen hat.
  const jeKz = new Map<string, (typeof clip.sprints)[number]>();
  for (const sp of clip.sprints) if (sp.a <= z.ts && cfg.sprints.includes(sp.kz)) jeKz.set(sp.kz, sp);
  const out: Block[] = [];
  const fs = 40 * u, fb = 30 * u;
  for (const sp of jeKz.values()) {
    const fertig = z.ts > sp.b;
    const name = sprintName(sp.kz);
    let wert: string, anteil: number;
    if (fertig) {
      wert = sp.meter != null ? `${(sp.meter / sp.wert).toFixed(1)} s` : `${(sp.wert * 3.6).toFixed(1)} km/h`;
      anteil = 1;
    } else if (sp.meter != null) {
      wert = `${((z.ts - sp.a) / 1000).toFixed(1)} s`;
      const d0 = streckeBis(clip, sp.a), d1 = streckeBis(clip, sp.b);
      anteil = d1 > d0 ? (streckeBis(clip, z.ts) - d0) / (d1 - d0) : (z.ts - sp.a) / (sp.b - sp.a);
    } else {
      wert = fmtMS(z.ts - sp.a);
      anteil = (z.ts - sp.a) / Math.max(sp.b - sp.a, 1);
    }
    anteil = Math.min(Math.max(anteil, 0), 1);
    ctx.font = `700 ${fb}px ${FONT}`; const wn = ctx.measureText(name).width;
    ctx.font = `800 ${fs}px ${FONT}`; const wv = ctx.measureText(wert).width;
    const breite = Math.max(320 * u, wn + wv + 40 * u), h = fs * 1.25 + 14 * u;
    out.push({
      w: breite, h: h + 10 * u, draw: (c, x, y) => {
        textStil(c, cfg, u);
        c.fillStyle = fertig ? "rgba(34,211,238,0.92)" : "rgba(15,23,42,0.55)";
        rundRechteck(c, x, y, breite, h, 12 * u); c.fill();
        c.shadowColor = "transparent";
        if (!fertig) { c.fillStyle = "rgba(34,211,238,0.85)"; rundRechteck(c, x, y + h - 8 * u, breite * anteil, 8 * u, 4 * u); c.fill(); }
        c.fillStyle = fertig ? "#0f172a" : "#ffffff"; c.textBaseline = "middle"; c.textAlign = "left";
        c.font = `700 ${fb}px ${FONT}`; c.fillText(name, x + 16 * u, y + h / 2);
        c.font = `800 ${fs}px ${FONT}`; c.textAlign = "right"; c.fillText(wert, x + breite - 16 * u, y + h / 2);
        c.textAlign = "left"; c.textBaseline = "alphabetic";
      },
    });
  }
  return out;
}

function carveBlock(ctx: CanvasRenderingContext2D, clip: Clip, cfg: MediaCfg, z: Zustand, u: number, tx: Texte): Block | null {
  if (!clip.carves.length) return null;
  const jetzt = clip.carves.find((c) => z.ts >= c.a && z.ts <= c.b);
  const fertig = clip.carves.filter((c) => z.ts > c.b).length;
  const fg = 64 * u, fl = 26 * u;
  const grad = jetzt ? Math.round(jetzt.rot * Math.min(Math.max((z.ts - jetzt.a) / Math.max(jetzt.b - jetzt.a, 1), 0), 1)) : 0;
  const pfeil = jetzt ? (jetzt.dir === "L" ? "↺" : "↻") : "";
  const wert = jetzt ? `${pfeil} ${grad}°` : `${fertig}`;
  const label = jetzt ? `${jetzt.g.toFixed(1)} g` : tx.carves;
  ctx.font = `800 ${fg}px ${FONT}`; const ww = ctx.measureText(wert).width;
  const lbl = jetzt ? label : label.toUpperCase();   // „0.4 g" bleibt klein (g ist die Einheit)
  ctx.font = `600 ${fl}px ${FONT}`; const wl = ctx.measureText(lbl).width;
  const w = Math.max(ww, wl), h = fg + fl * 1.4;
  const voll = jetzt && grad >= 360;
  return {
    w, h, draw: (c, x, y, al) => {
      textStil(c, cfg, u);
      c.font = `800 ${fg}px ${FONT}`; c.fillStyle = voll ? "#22d3ee" : "#ffffff";
      c.fillText(wert, al === "l" ? x : al === "c" ? x + (w - ww) / 2 : x + w - ww, y + fg * 0.85);
      c.font = `600 ${fl}px ${FONT}`; c.fillStyle = "rgba(255,255,255,0.85)";
      c.fillText(lbl, al === "l" ? x : al === "c" ? x + (w - wl) / 2 : x + w - wl, y + fg + fl);
    },
  };
}

function rundRechteck(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h / 2, w / 2);
  c.beginPath();
  c.moveTo(x + rr, y); c.arcTo(x + w, y, x + w, y + h, rr); c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr); c.arcTo(x, y, x + w, y, rr); c.closePath();
}

/** Ein Bild zeichnen. `tv` = Video-Sekunde. Der Canvas muss schon die Zielgroesse haben. */
export function zeichne(ctx: CanvasRenderingContext2D, clip: Clip, cfg: MediaCfg, tv: number, tx: Texte, hintergrund = cfg.hintergrund) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  if (hintergrund === "schwarz") { ctx.fillStyle = "#000000"; ctx.fillRect(0, 0, W, H); }
  else if (hintergrund === "gruen") { ctx.fillStyle = "#00ff00"; ctx.fillRect(0, 0, W, H); }
  const z = zustandBei(clip, cfg, tv);
  const basis = Math.min(W, H) / 1080;
  const rand = Math.min(W, H) * 0.06, abstand = 18 * basis;

  const jeAnker = new Map<Anker, Block[]>();
  const dazu = (k: ElKey, b: Block | Block[] | null) => {
    if (!b) return;
    const pos = cfg.el[k].pos;
    const l = jeAnker.get(pos) ?? [];
    l.push(...(Array.isArray(b) ? b : [b]));
    jeAnker.set(pos, l);
  };
  for (const k of [
    "track", "sprint", "carve", "speed", "pumps", "pumprate", "hr", "distance", "time", "logo",
  ] as ElKey[]) {
    const e = cfg.el[k];
    if (!e.an) continue;
    const u = basis * e.gr;
    switch (k) {
      case "track":
        if (e.gr >= 1.4) {   // bildfuellend: mittig, nicht im Stapel des Ankers, liegt hinter allen Zahlen
          const b = trackBlock(clip, cfg, z, u, W, H);
          b.draw(ctx, (W - b.w) / 2, (H - b.h) / 2, "c");
        } else dazu(k, trackBlock(clip, cfg, z, u, W, H));
        break;
      case "speed": dazu(k, statBlock(ctx, cfg, u, z.v.toFixed(1), tx.kmh, tx.speed)); break;
      case "pumps":
        if (clip.hatPumps) dazu(k, statBlock(ctx, cfg, u, String(z.nPumps), "", tx.pumps, Math.max(0, 1 - z.seitPump / 180)));
        break;
      case "pumprate":
        if (clip.hatPumps) {
          // „1.40 Hz" / „84 /min" — Zahl gross, Einheit klein wie bei km/h.
          const roh = z.ph != null && z.ph > 0 ? tx.pumpRate(z.ph) : "–";
          const lz = roh.indexOf(" ");
          dazu(k, statBlock(ctx, cfg, u, lz > 0 ? roh.slice(0, lz) : roh, lz > 0 ? roh.slice(lz + 1) : "", tx.pumprate));
        }
        break;
      case "hr": if (clip.hatPuls) dazu(k, statBlock(ctx, cfg, u, z.hr != null ? String(Math.round(z.hr)) : "–", tx.bpm, tx.hr)); break;
      case "distance": {
        const s = fmtStrecke(z.d); const [w, e2] = s.split(" ");
        dazu(k, statBlock(ctx, cfg, u, w, e2, tx.distance)); break;
      }
      case "time": dazu(k, statBlock(ctx, cfg, u, fmtMS(z.clipMs), "", tx.time)); break;
      case "sprint": dazu(k, sprintBlocks(ctx, clip, cfg, z, u)); break;
      case "carve": dazu(k, carveBlock(ctx, clip, cfg, z, u, tx)); break;
      case "logo": {
        const fg = 34 * u;
        ctx.font = `800 ${fg}px ${FONT}`; const ww = ctx.measureText("pumpfoil.org").width;
        dazu(k, {
          w: ww, h: fg * 1.2, draw: (c, x, y) => {
            textStil(c, cfg, u); c.font = `800 ${fg}px ${FONT}`; c.fillStyle = "rgba(255,255,255,0.9)";
            c.fillText("pumpfoil", x, y + fg * 0.9);
            const w1 = c.measureText("pumpfoil").width; c.fillStyle = "#22d3ee"; c.fillText(".org", x + w1, y + fg * 0.9);
          },
        });
        break;
      }
    }
  }

  for (const [pos, blocks] of jeAnker) {
    const spalte = pos[1] as "l" | "c" | "r", zeile = pos[0] as "t" | "m" | "b";
    const hoehe = blocks.reduce((s, b) => s + b.h, 0) + abstand * (blocks.length - 1);
    let y = zeile === "t" ? rand : zeile === "m" ? (H - hoehe) / 2 : H - rand - hoehe;
    for (const b of blocks) {
      const x = spalte === "l" ? rand : spalte === "c" ? (W - b.w) / 2 : W - rand - b.w;
      b.draw(ctx, x, y, spalte);
      y += b.h + abstand;
    }
  }
  ctx.restore();
}
