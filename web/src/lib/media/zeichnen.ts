// Media-Ansicht (docs/MEDIA.md): ein Bild des Overlays zu einer Video-Zeit zeichnen.
//
// Reine Funktion von (Clip, Einstellungen, Zeit) -> Canvas. Vorschau und Export benutzen GENAU diese Funktion,
// damit die Datei so aussieht wie die Vorschau. Der Hintergrund bleibt durchsichtig, ausser die Ausgabe will
// Schwarz oder Gruen.

import { type Clip, clipZuSession, obereGrenze } from "./clip";
import { SPRINT_NACH_MS, type FahrerSpur, type Mehrfach, lageAnwenden } from "./mehrfach";
import { hrColor, rampColor, speedColor } from "../trackColors";
import { carveColor } from "../turns";

export type Anker = "tl" | "tc" | "tr" | "ml" | "mc" | "mr" | "bl" | "bc" | "br";
export const ANKER: Anker[] = ["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"];

// Kein Datenfeld „Gleiten" (Jan 24.11.2026: weg) — Gleitphasen zeigt die Ebene auf der Spur.
// „fahrer" = Kaesten je Fahrer, nur wenn weitere Fahrer dabei sind (mehrfach.ts, 25.11.2026).
// „event" = Kopf mit Event-Titel und Kategorie, nur im Event-Video (EventOverlay, 26.11.2026).
export type ElKey = "track" | "speed" | "pumps" | "pumprate" | "hr" | "distance" | "time" | "sprint" | "carve" | "fahrer" | "event" | "logo";
export const EL_KEYS: ElKey[] = ["track", "speed", "pumps", "pumprate", "hr", "distance", "time", "sprint", "carve", "fahrer", "event", "logo"];

/** Event-Video (Jan 26.11.2026): die ersten Plaetze einer Event-Kategorie fahren gegeneinander. Anders als im normalen
 *  Mehrfahrer-Video stehen hier Namen und Event-Platz IM Bild — die Bestenliste ist ohnehin veroeffentlicht, und das
 *  Video macht der Betreiber bzw. die Event-Leitung. Alles einzeln schaltbar. */
export interface EventOverlay {
  titel: string;                 // Event-Titel
  kategorie: string;             // z. B. „Flying 100 m"
  zeitraum: string;              // Datum/Zeitraum des Events
  stand: string;                 // Titel der Endtafel: „Final results" bzw. „Provisional"
  /** je Fahrernummer (1 = Hauptfahrer): Anzeigename, Platz im Event und Wert, wie die Bestenliste ihn zeigt */
  fahrer: Record<number, {
    name: string; rang: number | null; wert: string;
    /** Endtafel (Jan 26.11.2026): Nationalitaetsflagge und Team-Wappen wie im Teilen-Bild, vorab geladen */
    flagge?: CanvasImageSource | null;
    wappen?: { bild: HTMLImageElement | null; initialen: string; flaeche: string; schrift: string } | null;
  }>;
  namen: boolean;                // Namen in den Fahrer-Kaesten
  rang: boolean;                 // im Ziel den Event-Platz statt des Platzes im Video
  ende: boolean;                 // Endtafel mit den Platzierungen am Schluss (ENDTAFEL_S zusaetzlich)
}
export const ENDTAFEL_S = 4;
const MEDAILLE = ["#facc15", "#cbd5e1", "#d97706"];

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
    fahrer: { an: true, pos: "tr", gr: 1 },
    event: { an: true, pos: "tc", gr: 1 },
    logo: { an: true, pos: "bc", gr: 0.7 },
  },
};

/** Vorlage fuer Event-Videos (Jan 26.11.2026, nach seinem Flying-Sprint-Video): 9:16, Event-Kopf oben Mitte, Spur mittig,
 *  Fahrer-Kaesten unten rechts ueber pumpfoil.org, Laufzeit unten links; keine Einzelwerte des Hauptfahrers. */
export const CFG_EVENT: MediaCfg = {
  ...CFG_DEFAULT,
  dicke: 1.6, geist: true,
  ebenen: { glides: false, carves: false, sprints: true, pumps: false },
  el: {
    track: { an: true, pos: "mc", gr: 1 },
    speed: { an: false, pos: "bl", gr: 1.4 },
    pumps: { an: false, pos: "bl", gr: 1 },
    pumprate: { an: false, pos: "bl", gr: 1 },
    hr: { an: false, pos: "br", gr: 1 },
    distance: { an: false, pos: "br", gr: 1 },
    time: { an: true, pos: "bl", gr: 1 },
    sprint: { an: false, pos: "tl", gr: 1 },
    carve: { an: false, pos: "ml", gr: 1 },
    fahrer: { an: true, pos: "br", gr: 1 },
    event: { an: true, pos: "tc", gr: 1 },
    logo: { an: true, pos: "br", gr: 1 },
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
export function videoDauer(clip: Clip, cfg: MediaCfg, ev: EventOverlay | null = null): number {
  return cfg.vor + clip.dauerMs / 1000 / cfg.tempo + cfg.nach + (ev?.ende ? ENDTAFEL_S : 0);
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

// Tabellenziffern (Jan 24.11.2026: „die km/h anzeige flackert … weil sich die zahlenbreite aendert"): die Systemschrift
// hat verschieden breite Ziffern. Jede Ziffer bekommt deshalb eine feste Zelle (Breite der „0"), andere Zeichen ihre
// eigene Breite — Komma, Doppelpunkt und Einheit stehen still, solange die Stellenzahl gleich bleibt.
function tabBreite(c: CanvasRenderingContext2D, text: string): number {
  const z = c.measureText("0").width;
  let w = 0;
  for (const ch of text) w += ch >= "0" && ch <= "9" ? z : c.measureText(ch).width;
  return w;
}
function tabText(c: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  const z = c.measureText("0").width;
  const alt = c.textAlign;
  c.textAlign = "left";
  for (const ch of text) {
    if (ch >= "0" && ch <= "9") { const w = c.measureText(ch).width; c.fillText(ch, x + (z - w) / 2, y); x += z; }
    else { c.fillText(ch, x, y); x += c.measureText(ch).width; }
  }
  c.textAlign = alt;
}

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
  return zustandTs(clip, clipZuSession(clip, clipMs), clipMs);
}

/** Zustand eines Clips zur Session-ms `ts` (auch fuer weitere Fahrer, deren Zeit aus der des Hauptfahrers folgt). */
export function zustandTs(clip: Clip, ts: number, clipMs = 0): Zustand {
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
  ctx.font = `800 ${fw}px ${FONT}`; const ww = tabBreite(ctx, wert);
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
      c.font = `800 ${fw}px ${FONT}`; tabText(c, wert, 0, 0);
      c.restore();
      if (einheit) { c.font = `700 ${fe}px ${FONT}`; c.fillStyle = "#22d3ee"; c.fillText(einheit, x0 + ww + 10 * u, y + fw * 0.85); }
      c.font = `600 ${fl}px ${FONT}`; c.fillStyle = "rgba(255,255,255,0.85)";
      const lx = al === "l" ? x : al === "c" ? x + (w - wl) / 2 : x + w - wl;
      c.fillText(label.toUpperCase(), lx, y + fw * 1.02 + fl);
    },
  };
}

function trackBlock(clip: Clip, cfg: MediaCfg, z: Zustand, u: number, W: number, H: number, mehr: Mehrfach | null = null): Block {
  const [minX, minY, maxX, maxY] = mehr ? mehr.bbox : clip.bbox;
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
  // Mehrere Fahrer: EINE Tempo-Skala fuer alle, sonst bedeutete dieselbe Farbe bei jedem etwas anderes.
  let vLo = clip.vLo, vHi = clip.vHi;
  if (mehr) for (const m of mehr.mit) { vLo = Math.min(vLo, m.clip.vLo); vHi = Math.max(vHi, m.clip.vHi); }
  const tVonH = mehr ? mehr.haupt.tVon : -Infinity;
  return {
    w, h, draw: (c, x, y) => {
      const X = (vx: number) => x + (vx - minX) * s;
      const Y = (vy: number) => y + (maxY - vy) * s;
      const pts = clip.pts;
      let kVon = 0;
      while (kVon < pts.length - 1 && pts[kVon].t < tVonH) kVon++;
      c.lineCap = "round"; c.lineJoin = "round";
      const farbeVon = (cl: Clip, q: ClipPunktLite) => cfg.farbe === "weiss" ? "#ffffff" : cfg.farbe === "cyan" ? "#22d3ee"
        : cfg.farbe === "hr" ? hrColor(q.hr, [cl.hrLo, cl.hrHi])
        : cfg.farbe === "pump" ? (q.ph == null ? "#64748b" : rampColor((q.ph - cl.phLo) / Math.max(cl.phHi - cl.phLo, 1e-6)))
        : speedColor(q.v, vLo, Math.max(vHi, vLo + 1));

      // Weitere Fahrer UNTER dem Hauptfahrer: Geist im Fenster, dann Rand in Fahrerfarbe + dunkle Fuge + Spur.
      const fz = mehr ? mehr.mit.map((m) => ({ m, ts: z.ts + m.delta })) : [];
      const mSprintPunkte: [number, number][] = [];
      for (const { m, ts } of fz) {
        const P = (k: number): [number, number] => { const p = m.clip.pts[k]; const [a, b] = lageAnwenden(m.lage, p.x, p.y); return [X(a), Y(b)]; };
        const mp = m.clip.pts;
        const drin = (k: number) => mp[k].t >= m.tVon && mp[k].t <= m.tBis;
        if (cfg.geist) {
          c.shadowColor = "transparent"; c.strokeStyle = m.farbe; c.globalAlpha = 0.3; c.lineWidth = 3 * u * dk;
          c.beginPath(); let erst = true;
          for (let k = 0; k < mp.length; k++) {
            if (!drin(k)) { erst = true; continue; }
            const [px, py] = P(k);
            if (erst || mp[k].span !== mp[k - 1].span) { c.moveTo(px, py); erst = false; } else c.lineTo(px, py);
          }
          c.stroke(); c.globalAlpha = 1;
        }
        const bis = Math.min(ts, m.tBis);
        const zug = (breite: number, farbe: ((k: number) => string) | string) => {
          c.lineWidth = breite;
          if (typeof farbe === "string") {
            c.strokeStyle = farbe; c.beginPath(); let erst = true;
            for (let k = 0; k < mp.length && mp[k].t <= bis; k++) {
              if (!drin(k)) { erst = true; continue; }
              const [px, py] = P(k);
              if (erst || mp[k].span !== mp[k - 1].span) { c.moveTo(px, py); erst = false; } else c.lineTo(px, py);
            }
            c.stroke();
          } else {
            for (let k = 1; k < mp.length && mp[k].t <= bis; k++) {
              if (!drin(k - 1) || !drin(k) || mp[k].span !== mp[k - 1].span) continue;
              const [ax, ay] = P(k - 1), [bx, by] = P(k);
              c.strokeStyle = farbe(k); c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
            }
          }
        };
        c.shadowColor = cfg.schatten ? "rgba(0,0,0,0.55)" : "transparent"; c.shadowBlur = cfg.schatten ? 8 * u : 0;
        // Sprints auch beim Mitfahrer: weisses Band breiter als der Rand (sonst laege es unsichtbar darunter).
        const mSprints = e.sprints ? m.clip.sprints.filter((sp) => cfg.sprints.includes(sp.kz) && sp.b >= m.tVon && sp.a <= m.tBis) : [];
        if (mSprints.length) {
          c.strokeStyle = "rgba(255,255,255,0.9)"; c.lineWidth = SPRINT_BAND_MEHR * u * dk;
          for (const sp of mSprints) {
            if (bis < sp.a) continue;
            c.beginPath(); let erst = true;
            for (let k = 0; k < mp.length && mp[k].t <= Math.min(bis, sp.b); k++) {
              if (mp[k].t < sp.a || !drin(k)) continue;
              const [px, py] = P(k);
              if (erst) { c.moveTo(px, py); erst = false; } else c.lineTo(px, py);
            }
            c.stroke();
          }
        }
        mSprintPunkte.push(...mSprints.flatMap((sp) => [sp.a, sp.b].filter((tt) => bis >= tt && tt >= m.tVon).map((tt) => {
          let k = 0; while (k < mp.length - 1 && mp[k + 1].t <= tt) k++;
          return P(k);
        })));
        zug(15 * u * dk, m.farbe);
        c.shadowColor = "transparent";
        zug(10 * u * dk, "#0f172a");
        zug(7 * u * dk, m.anzeige.spur === "fahrer" ? m.farbe : (k: number) => farbeVon(m.clip, mp[k]));
      }

      c.shadowColor = cfg.schatten ? "rgba(0,0,0,0.55)" : "transparent"; c.shadowBlur = cfg.schatten ? 8 * u : 0;
      if (cfg.geist) {
        c.strokeStyle = "rgba(255,255,255,0.28)"; c.lineWidth = 4 * u * dk;
        c.beginPath();
        for (let k = kVon; k < pts.length; k++) {
          if (mehr && pts[k].t > mehr.haupt.tBis) break;
          if (k === kVon || pts[k].span !== pts[k - 1].span) c.moveTo(X(pts[k].x), Y(pts[k].y)); else c.lineTo(X(pts[k].x), Y(pts[k].y));
        }
        c.stroke();
      }
      // Punkte eines Zeitfensters bis „jetzt" als Linie (fuer die Baender unter der Spur).
      const band = (a: number, b: number) => {
        c.beginPath(); let erst = true;
        for (let k = kVon; k <= z.i; k++) {
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
      c.strokeStyle = "rgba(255,255,255,0.9)"; c.lineWidth = (mehr ? SPRINT_BAND_MEHR : 14) * u * dk;
      for (const sp of sprints) if (z.ts >= sp.a) band(sp.a, sp.b);
      c.shadowColor = "transparent";
      // Die Spur in der gewaehlten Farbe — dieselben Skalen wie die Karte (trackColors.ts). Mit weiteren Fahrern
      // bekommt auch die eigene Spur Rand + Fuge (weiss = Fahrer 1).
      const lagen: [number, ((q: ClipPunktLite) => string) | string][] = mehr
        ? [[15, mehr.haupt.farbe], [10, "#0f172a"], [7, mehr.haupt.anzeige.spur === "fahrer" ? mehr.haupt.farbe : (q) => farbeVon(clip, q)]]
        : [[7, (q) => farbeVon(clip, q)]];
      for (const [breite, farbe] of lagen) {
        c.lineWidth = breite * u * dk;
        for (let k = kVon + 1; k <= z.i + 1 && k < pts.length; k++) {
          const a = pts[k - 1], b0 = pts[k];
          if (a.span !== b0.span) continue;
          const letzt = k === z.i + 1;
          if (letzt && z.f <= 0) break;
          const bx = letzt ? a.x + (b0.x - a.x) * z.f : b0.x, by = letzt ? a.y + (b0.y - a.y) * z.f : b0.y;
          c.strokeStyle = typeof farbe === "string" ? farbe : farbe(b0);
          c.beginPath(); c.moveTo(X(a.x), Y(a.y)); c.lineTo(X(bx), Y(by)); c.stroke();
        }
      }
      // Carves: die feinen Boegen in der Kurvenlage-Farbe UEBER der Spur, wachsen waehrend des Carves mit.
      if (e.carves) {
        c.lineWidth = 8 * u * dk;
        for (const cv of clip.carves) {
          if (z.ts < cv.a || cv.a < tVonH || cv.arc.length < 2) continue;
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
          if (pp.t < tVonH) continue;
          c.beginPath(); c.arc(X(pp.x), Y(pp.y), 4 * u * dk, 0, Math.PI * 2); c.fill(); c.stroke();
        }
      }
      // Sprint-Anfang und -Ende: magentafarbene Punkte wie in der Karte.
      for (const sp of sprints) {
        for (const tt of [sp.a, sp.b]) {
          if (z.ts < tt || tt < tVonH) continue;
          let k = 0; while (k < pts.length - 1 && pts[k + 1].t <= tt) k++;
          c.fillStyle = "#c026d3"; c.strokeStyle = "#ffffff"; c.lineWidth = 3 * u;
          c.beginPath(); c.arc(X(pts[k].x), Y(pts[k].y), 9 * u * Math.sqrt(dk), 0, Math.PI * 2); c.fill(); c.stroke();
        }
      }
      for (const [px, py] of mSprintPunkte) {
        c.fillStyle = "#c026d3"; c.strokeStyle = "#ffffff"; c.lineWidth = 3 * u;
        c.beginPath(); c.arc(px, py, 9 * u * Math.sqrt(dk), 0, Math.PI * 2); c.fill(); c.stroke();
      }
      const p = pts[z.i], q = pts[Math.min(z.i + 1, pts.length - 1)];
      const hx = X(p.x + (q.x - p.x) * z.f), hy = Y(p.y + (q.y - p.y) * z.f);
      if (!mehr) {
        // Aktuelle Position
        c.fillStyle = "#ffffff"; c.strokeStyle = "#0f172a"; c.lineWidth = 3 * u;
        c.beginPath(); c.arc(hx, hy, 11 * u * Math.sqrt(dk), 0, Math.PI * 2); c.fill(); c.stroke();
        return;
      }
      // Mehrere Fahrer: Startring je Fahrer, Kopf in Fahrerfarbe mit Nummer (Kennung nie nur ueber die Farbe).
      const ring = (rx: number, ry: number, farbe: string) => {
        c.lineWidth = 8 * u; c.strokeStyle = "#0f172a"; c.beginPath(); c.arc(rx, ry, 16 * u, 0, Math.PI * 2); c.stroke();
        c.lineWidth = 4 * u; c.strokeStyle = farbe; c.beginPath(); c.arc(rx, ry, 16 * u, 0, Math.PI * 2); c.stroke();
      };
      const kopf = (kx: number, ky: number, farbe: string, nr: number, aktiv: boolean) => {
        const r = 15 * u * Math.sqrt(dk);
        c.globalAlpha = aktiv ? 1 : 0.5;
        c.fillStyle = farbe; c.strokeStyle = "#0f172a"; c.lineWidth = 3 * u;
        c.beginPath(); c.arc(kx, ky, r, 0, Math.PI * 2); c.fill(); c.stroke();
        c.fillStyle = "#0f172a"; c.font = `800 ${r * 1.25}px ${FONT}`; c.textAlign = "center"; c.textBaseline = "middle";
        c.fillText(String(nr), kx, ky + r * 0.06);
        c.textAlign = "left"; c.textBaseline = "alphabetic"; c.globalAlpha = 1;
      };
      ring(X(pts[kVon].x), Y(pts[kVon].y), mehr.haupt.farbe);
      for (const { m } of fz) {
        let k = 0; while (k < m.clip.pts.length - 1 && m.clip.pts[k].t < m.tVon) k++;
        const [a, b] = lageAnwenden(m.lage, m.clip.pts[k].x, m.clip.pts[k].y);
        ring(X(a), Y(b), m.farbe);
      }
      for (const { m, ts } of fz) {
        const zm = zustandTs(m.clip, Math.min(Math.max(ts, m.tVon), m.tBis));
        const mp = m.clip.pts, p1 = mp[zm.i], q1 = mp[Math.min(zm.i + 1, mp.length - 1)];
        const [a, b] = lageAnwenden(m.lage, p1.x + (q1.x - p1.x) * zm.f, p1.y + (q1.y - p1.y) * zm.f);
        kopf(X(a), Y(b), m.farbe, m.nr, istAktiv(m.clip, ts));
      }
      kopf(hx, hy, mehr.haupt.farbe, 1, true);
    },
  };
}

/** Sprintband mit mehreren Fahrern: breiter als der 15er-Rand in Fahrerfarbe, damit es seitlich heraussteht. */
const SPRINT_BAND_MEHR = 23;

function istAktiv(clip: Clip, ts: number): boolean {
  return clip.spans.some(([a, b]) => ts >= a && ts <= b);
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
    ctx.font = `800 ${fs}px ${FONT}`; const wv = tabBreite(ctx, wert);
    const breite = Math.max(320 * u, wn + wv + 40 * u), h = fs * 1.25 + 14 * u;
    out.push({
      w: breite, h: h + 10 * u, draw: (c, x, y) => {
        textStil(c, cfg, u);
        // Fertiges Schild: deckend (#0891b2) mit WEISSER Schrift — dunkle Schrift wird beim MP4 auf Schwarz
        // (Mischmodus „Screen") durchsichtig, halbdeckende Flaechen ebenso (Nutzermeldung 24.11.2026).
        c.fillStyle = fertig ? "#0891b2" : "rgba(15,23,42,0.55)";
        rundRechteck(c, x, y, breite, h, 12 * u); c.fill();
        c.shadowColor = "transparent";
        if (!fertig) { c.fillStyle = "rgba(34,211,238,0.85)"; rundRechteck(c, x, y + h - 8 * u, breite * anteil, 8 * u, 4 * u); c.fill(); }
        c.fillStyle = "#ffffff"; c.textBaseline = "middle"; c.textAlign = "left";
        c.font = `700 ${fb}px ${FONT}`; c.fillText(name, x + 16 * u, y + h / 2);
        c.font = `800 ${fs}px ${FONT}`; tabText(c, wert, x + breite - 16 * u - wv, y + h / 2);
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
  ctx.font = `800 ${fg}px ${FONT}`; const ww = tabBreite(ctx, wert);
  const lbl = jetzt ? label : label.toUpperCase();   // „0.4 g" bleibt klein (g ist die Einheit)
  ctx.font = `600 ${fl}px ${FONT}`; const wl = ctx.measureText(lbl).width;
  const w = Math.max(ww, wl), h = fg + fl * 1.4;
  const voll = jetzt && grad >= 360;
  return {
    w, h, draw: (c, x, y, al) => {
      textStil(c, cfg, u);
      c.font = `800 ${fg}px ${FONT}`; c.fillStyle = voll ? "#22d3ee" : "#ffffff";
      tabText(c, wert, al === "l" ? x : al === "c" ? x + (w - ww) / 2 : x + w - ww, y + fg * 0.85);
      c.font = `600 ${fl}px ${FONT}`; c.fillStyle = "rgba(255,255,255,0.85)";
      c.fillText(lbl, al === "l" ? x : al === "c" ? x + (w - wl) / 2 : x + w - wl, y + fg + fl);
    },
  };
}

/** Strecke seit Sprintbeginn bis `ts` (Fahrer-Session-ms), auf die GEWERTETE Strecke geeicht: die Spur (GPS-Punkte)
 *  misst im Sprintfenster etwas anderes als die Sprint-Auswertung — ohne Eichung laege live einer vorn, der in der
 *  Wertung hinten landet (Jan 26.11.2026, fliegende Minute: 392 m live, 380 m gewertet). */
function sprintStrecke(sp: FahrerSpur, ts: number): number {
  const s = sp.sprint!;
  const roh = (t: number) => streckeBis(sp.clip, Math.max(s.a, Math.min(t, s.b))) - streckeBis(sp.clip, s.a);
  const gesamt = roh(s.b);
  const soll = s.meter ?? (s.sekunden != null ? s.wert * s.sekunden : gesamt);
  return gesamt > 0 ? (roh(ts) * soll) / gesamt : 0;
}

/** Werte eines Fahrers fuer seinen Kasten. Bezug: Start = Laufbeginn, Sprint = Sprintbeginn, Echtzeit = Beginn der
 *  Zeitleiste. Nach dem Ende (Start: Laufende, Sprint: Sprintende) bleiben die Endwerte stehen. */
function fahrerWerte(sp: FahrerSpur, modus: Mehrfach["modus"], tsHaupt: number, vonHaupt: number, tx: Texte) {
  const cl = sp.clip, ts = tsHaupt + sp.delta;
  const ref = modus === "start" ? cl.spans[0][0] : modus === "sprint" && sp.sprint ? sp.sprint.a : vonHaupt + sp.delta;
  const ende = modus === "start" ? cl.spans[cl.spans.length - 1][1] : modus === "sprint" && sp.sprint ? sp.sprint.b : Infinity;
  const fertig = ts > ende;
  const bis = Math.max(ref, Math.min(ts, ende));
  const aktiv = !fertig && istAktiv(cl, ts);
  const z = zustandTs(cl, bis);
  const teile: string[] = [];
  const f = sp.anzeige.felder;
  // Nach dem Ziel bleibt der Schnitt stehen (Sprint: Schnitt im Sprintfenster), statt „–" (Jan 25.11.2026).
  const dauer = (bis - ref) / 1000;
  const schnitt = modus === "sprint" && sp.sprint ? sp.sprint.wert * 3.6
    : dauer > 0 ? ((streckeBis(cl, bis) - streckeBis(cl, ref)) / dauer) * 3.6 : null;
  if (f.speed) teile.push(aktiv ? `${z.v.toFixed(1)} ${tx.kmh}` : fertig && schnitt != null ? `Ø ${schnitt.toFixed(1)} ${tx.kmh}` : `– ${tx.kmh}`);
  // Fliegende Minute (Jan 26.11.2026): die Zeit ist fuer alle gleich, es zaehlt die Strecke — Zeit und Strecke werden
  // EIN Feld Strecke, im Ziel die gewertete (Schnitt x Dauer).
  // Fliegende 100/200/300 m ebenso bis zum Ziel (die Laufzeit ist bis dahin fuer alle gleich), im Ziel dann die Zeit.
  const minute = modus === "sprint" && (sp.sprint?.sekunden != null || (sp.sprint?.meter != null && !fertig));
  if (minute && (f.time || f.distance)) {
    const m = fertig ? sp.sprint!.wert * sp.sprint!.sekunden! : sprintStrecke(sp, ts);
    teile.push(`${Math.round(m)} m`);
  }
  if (f.distance && !minute) teile.push(fmtStrecke(Math.max(0, streckeBis(cl, bis) - streckeBis(cl, ref))));
  if (f.time && !minute) {
    if (modus === "sprint" && sp.sprint && fertig) {
      teile.push(`${(sp.sprint.meter != null ? sp.sprint.meter / sp.sprint.wert : (sp.sprint.b - sp.sprint.a) / 1000).toFixed(1)} s`);
    } else teile.push(modus === "sprint" ? `${((bis - ref) / 1000).toFixed(1)} s` : fmtMS(bis - ref));
  }
  if (f.pumps && cl.hatPumps) teile.push(`${obereGrenze(cl.pumps, bis) - obereGrenze(cl.pumps, ref)} ${tx.pumps}`);
  if (f.hr && cl.hatPuls) teile.push(`${z.hr != null && aktiv ? Math.round(z.hr) : "–"} ${tx.bpm}`);
  return { teile, fertig, wert: modus === "sprint" && sp.sprint ? sp.sprint.wert : null };
}

/** Name kuerzen, damit ein Kasten nicht ueber das Bild hinauslaeuft. */
function kurz(name: string, max = 16): string {
  const n = Array.from(name.trim());
  return n.length > max ? n.slice(0, max - 1).join("") + "…" : n.join("");
}

/** Ein Kasten je Fahrer (Rahmen in Fahrerfarbe, Nummer wie am Kopf der Spur). Keine Namen im Video (Jan 25.11.2026):
 *  wer wer ist, steht nur in der Legende unter der Vorschau — ausser im Event-Video (`ev.namen`, Jan 26.11.2026). */
function fahrerBlocks(ctx: CanvasRenderingContext2D, cfg: MediaCfg, clip: Clip, mehr: Mehrfach, z: Zustand, u: number, tx: Texte,
  ev: EventOverlay | null = null): Block[] {
  const alle = [mehr.haupt, ...mehr.mit];
  const werte = alle.map((sp) => ({ sp, ...fahrerWerte(sp, mehr.modus, z.ts, clip.spans[0][0], tx) }));
  // Sprint: Rang unter denen, die schon im Ziel sind.
  const imZiel = werte.filter((w) => w.fertig && w.wert != null).sort((a, b) => b.wert! - a.wert!);
  const fs = 38 * u, pad = 14 * u, r = fs * 0.5;
  const out: (Block & { nr: number })[] = [];
  for (const w of werte) {
    if (!w.teile.length) continue;
    const evF = ev?.fahrer[w.sp.nr];
    // Event-Video: im Ziel der Platz im Event (Aufloesung, Jan 26.11.2026), sonst der Platz unter denen im Ziel.
    const evRang = ev?.rang && evF?.rang != null && w.fertig ? evF.rang : null;
    const rang = evRang != null ? evRang - 1 : imZiel.indexOf(w);
    const rangText = rang >= 0 ? `${rang + 1}.  ` : "";
    const name = ev?.namen && evF?.name ? kurz(evF.name) : "";
    // Mit Event-Platz im Ziel auch der Wert der Bestenliste — sonst stuende neben dem Platz eine leicht andere Zahl
    // als in der Endtafel (die Bestenliste rechnet mit ihrem eigenen Stand).
    const werte = evRang != null && evF?.wert ? [evF.wert] : w.teile;
    const text = (name ? `${name}   ` : "") + werte.join("   ");
    ctx.font = `800 ${fs}px ${FONT}`;
    const rw = rangText ? tabBreite(ctx, rangText) : 0;
    const tw = rw + tabBreite(ctx, text);
    // Mit Namen keine Nummer im Kreis (Jan 26.11.2026: verwirrt neben dem Platz) — Rahmenfarbe und Name reichen.
    const kreis = !name;
    const bw = (kreis ? pad * 3 + r * 2 : pad * 2) + tw, bh = fs * 1.5;
    out.push({
      nr: w.sp.nr, w: bw, h: bh, draw: (c, x, y) => {
        c.shadowColor = "transparent";
        // Deckend dunkel + weisse Schrift: bleibt auch beim MP4 auf Schwarz (Mischmodus „Screen") lesbar.
        c.fillStyle = w.fertig ? "#0f172a" : "rgba(15,23,42,0.82)";
        rundRechteck(c, x, y, bw, bh, 12 * u); c.fill();
        c.strokeStyle = w.sp.farbe; c.lineWidth = 4 * u; rundRechteck(c, x, y, bw, bh, 12 * u); c.stroke();
        const cx = x + pad + r, cy = y + bh / 2;
        c.textBaseline = "middle";
        if (kreis) {
          c.fillStyle = w.sp.farbe; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
          c.fillStyle = "#0f172a"; c.font = `800 ${r * 1.3}px ${FONT}`; c.textAlign = "center";
          c.fillText(String(w.sp.nr), cx, cy + r * 0.06);
        }
        c.textAlign = "left";
        const x0 = kreis ? cx + r + pad : x + pad;
        c.font = `800 ${fs}px ${FONT}`;
        // Event-Platz in Medaillenfarbe (1-3), sonst weiss wie der Rest.
        if (rangText) { c.fillStyle = evRang != null && evRang <= 3 ? MEDAILLE[evRang - 1] : "#ffffff"; tabText(c, rangText, x0, cy + fs * 0.04); }
        c.fillStyle = "#ffffff";
        tabText(c, text, x0 + rw, cy + fs * 0.04);
        c.textBaseline = "alphabetic";
        textStil(c, cfg, u);
      },
    });
  }
  if (mehr.modus !== "sprint" || out.length < 2) return out;

  // Sprint-Start (Jan 26.11.2026): die Kaesten ordnen sich laufend nach dem, der gerade vorn liegt — vorn = weiteste
  // Strecke seit Sprintbeginn, wer im Ziel ist, steht davor (nach Event-Platz bzw. Wert). Damit sie gleiten statt
  // zu springen, ist der Platz das Mittel der Reihenfolge ueber die letzten ~0,4 s Video (bleibt eine reine Funktion
  // der Zeit — Vorschau und Export gleich).
  const von = clip.spans[0][0];
  const reihe = (ts: number): Map<number, number> => {
    const k = alle.filter((sp) => sp.sprint).map((sp) => {
      const fw = fahrerWerte(sp, mehr.modus, ts, von, tx);
      const strecke = sprintStrecke(sp, ts + sp.delta);
      const evR = ev?.rang && fw.fertig ? ev.fahrer[sp.nr]?.rang ?? null : null;
      return { nr: sp.nr, fertig: fw.fertig, wert: fw.wert ?? 0, strecke, evR };
    });
    k.sort((x, y) => (x.fertig !== y.fertig ? (x.fertig ? -1 : 1)
      : x.fertig ? (x.evR ?? 99) - (y.evR ?? 99) || y.wert - x.wert : y.strecke - x.strecke || x.nr - y.nr));
    return new Map(k.map((e, i) => [e.nr, i]));
  };
  const PROBEN = 6, schritt = 70 * cfg.tempo;
  const platz = new Map<number, number>();
  for (let j = 0; j < PROBEN; j++) {
    const m = reihe(Math.max(von, z.ts - j * schritt));
    for (const b of out) platz.set(b.nr, (platz.get(b.nr) ?? 0) + (m.get(b.nr) ?? out.indexOf(b)) / PROBEN);
  }
  const gap = 18 * u, bh = out[0].h, bwMax = Math.max(...out.map((b) => b.w));
  return [{
    w: bwMax, h: out.length * bh + (out.length - 1) * gap,
    draw: (c, x, y, al) => {
      // Wer gerade nach oben rutscht, wird zuletzt gezeichnet (liegt beim Ueberholen obenauf).
      const sortiert = out.slice().sort((p, q) => (platz.get(q.nr) ?? 0) - (platz.get(p.nr) ?? 0));
      for (const b of sortiert) {
        const bx = al === "l" ? x : al === "c" ? x + (bwMax - b.w) / 2 : x + bwMax - b.w;
        b.draw(c, bx, y + (platz.get(b.nr) ?? 0) * (bh + gap), al);
      }
    },
  }];
}

/** Schraeg gestelltes Cyan-Schild wie in den Event-Grafiken (brand/events/…/ergebnis.html). Liefert die Breite. */
function schild(c: CanvasRenderingContext2D, text: string, x: number, y: number, fs: number, nurMessen = false): number {
  c.font = `900 ${fs}px ${FONT}`;
  const padX = fs * 0.55, w = c.measureText(text).width + padX * 2, h = fs * 1.45, sk = h * 0.18;
  if (nurMessen) return w + sk;
  c.save();
  c.shadowColor = "transparent";
  c.fillStyle = "#22d3ee";
  c.beginPath(); c.moveTo(x + sk, y); c.lineTo(x + w + sk, y); c.lineTo(x + w, y + h); c.lineTo(x, y + h); c.closePath(); c.fill();
  c.fillStyle = "#020617"; c.textBaseline = "middle"; c.textAlign = "left";
  c.fillText(text, x + sk / 2 + padX, y + h / 2 + fs * 0.04);
  c.restore();
  return w + sk;
}

/** Kopf des Event-Videos: Event-Titel (Versalien), darunter das Schild mit der Kategorie und der Zeitraum. */
function eventKopf(ctx: CanvasRenderingContext2D, cfg: MediaCfg, ev: EventOverlay, u0: number, maxW: number): Block {
  // Erst messen, dann so verkleinern, dass der Kopf in die Bildbreite passt (lange Event-Titel).
  const breite = (u: number) => {
    ctx.font = `900 ${40 * u}px ${FONT}`; const a = ctx.measureText(ev.titel.toUpperCase()).width;
    ctx.font = `700 ${26 * u}px ${FONT}`; const d = ev.zeitraum ? ctx.measureText(ev.zeitraum).width + 18 * u : 0;
    return Math.max(a, schild(ctx, ev.kategorie, 0, 0, 34 * u, true) + d);
  };
  const b0 = breite(u0);
  const u = b0 > maxW ? (u0 * maxW) / b0 : u0;
  const ft = 40 * u, fk = 34 * u, fd = 26 * u, gap = 12 * u;
  const titel = ev.titel.toUpperCase();
  ctx.font = `900 ${ft}px ${FONT}`; const wt = ctx.measureText(titel).width;
  const wk = schild(ctx, ev.kategorie, 0, 0, fk, true);
  ctx.font = `700 ${fd}px ${FONT}`; const wd = ev.zeitraum ? ctx.measureText(ev.zeitraum).width : 0;
  const zeile2 = wk + (wd ? gap * 1.5 + wd : 0);
  const w = Math.max(wt, zeile2), h = ft * 1.15 + gap + fk * 1.45;
  return {
    w, h, draw: (c, x, y, al) => {
      const ein = (b: number) => (al === "l" ? x : al === "c" ? x + (w - b) / 2 : x + w - b);
      textStil(c, cfg, u);
      c.fillStyle = "#ffffff"; c.textAlign = "left"; c.textBaseline = "alphabetic";
      c.font = `900 ${ft}px ${FONT}`; c.fillText(titel, ein(wt), y + ft * 0.9);
      const y2 = y + ft * 1.15 + gap, x2 = ein(zeile2);
      schild(c, ev.kategorie, x2, y2, fk);
      if (wd) {
        textStil(c, cfg, u);
        c.font = `700 ${fd}px ${FONT}`; c.fillStyle = "rgba(255,255,255,0.9)"; c.textBaseline = "middle";
        c.fillText(ev.zeitraum, x2 + wk + gap * 1.5, y2 + fk * 0.725);
        c.textBaseline = "alphabetic";
      }
    },
  };
}

/** Endtafel (Jan 26.11.2026, wie das Endstand-Overlay der Event-Grafiken): Kategorie + Stand, darunter je Fahrer eine
 *  Zeile mit Platz (Medaillenfarbe), Name und Wert aus der Bestenliste. Blendet in den letzten ENDTAFEL_S Sekunden ein. */
function endTafel(ctx: CanvasRenderingContext2D, ev: EventOverlay, W: number, H: number, anteil: number) {
  const zeilen = Object.entries(ev.fahrer).map(([nr, f]) => ({ nr: Number(nr), ...f }))
    .sort((a, b) => (a.rang ?? 99) - (b.rang ?? 99) || a.nr - b.nr);
  if (!zeilen.length) return;
  const u = Math.min(W, H) / 1080;
  const breite = Math.min(W, H) * 0.9, x0 = (W - breite) / 2;
  const fk = 40 * u, fs = 44 * u, fn = 46 * u, fw = 40 * u, zh = 82 * u, zg = 16 * u, kopfH = fk * 1.45;
  const ft = 30 * u;
  const hoehe = ft * 1.6 + kopfH + zg + zeilen.length * (zh + zg);
  let y = (H - hoehe) / 2;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, anteil));
  ctx.shadowColor = "rgba(2,6,23,0.8)"; ctx.shadowBlur = 18 * u; ctx.shadowOffsetY = 3 * u;
  ctx.fillStyle = "#ffffff"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.font = `800 ${ft}px ${FONT}`;
  ctx.fillText(ev.titel.toUpperCase(), x0, y + ft);
  y += ft * 1.6;
  const ws = schild(ctx, ev.kategorie, x0, y, fk);
  ctx.shadowColor = "rgba(2,6,23,0.8)";
  ctx.font = `900 ${fs}px ${FONT}`; ctx.fillStyle = "#ffffff"; ctx.textBaseline = "middle";
  ctx.fillText(ev.stand.toUpperCase(), x0 + ws + 22 * u, y + kopfH / 2);
  y += kopfH + zg;
  ctx.shadowColor = "transparent";
  // Platz fuer Wappen/Flagge in allen Zeilen, sobald eine sie hat — dann stehen die Namen buendig.
  const wappenPlatz = zeilen.some((z) => z.wappen), flaggenPlatz = zeilen.some((z) => z.flagge);
  for (const z of zeilen) {
    ctx.fillStyle = "rgba(2,6,23,0.88)"; rundRechteck(ctx, x0, y, breite, zh, 18 * u); ctx.fill();
    const r = 30 * u, cx = x0 + 14 * u + r, cy = y + zh / 2;
    ctx.fillStyle = z.rang != null && z.rang <= 3 ? MEDAILLE[z.rang - 1] : "#22d3ee";
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#020617"; ctx.font = `900 ${r * 1.25}px ${FONT}`; ctx.textAlign = "center";
    ctx.fillText(z.rang != null ? String(z.rang) : "–", cx, cy + r * 0.06);
    let nx = cx + r + 22 * u;   // ohne Farbpunkt (Jan 26.11.2026: kann raus)
    // Team-Wappen (Logo oder Initialen auf Teamfarbe), dann Flagge 4:3 — wie im Teilen-Bild der Bestenliste.
    if (z.wappen) {
      const ws = 54 * u, wy = cy - ws / 2;
      ctx.save(); rundRechteck(ctx, nx, wy, ws, ws, 8 * u); ctx.clip();
      const im = z.wappen.bild;
      if (im && im.width) {
        const k = Math.min(ws / im.width, ws / im.height), bw = im.width * k, bh = im.height * k;
        ctx.drawImage(im, nx + (ws - bw) / 2, wy + (ws - bh) / 2, bw, bh);
      } else {
        ctx.fillStyle = z.wappen.flaeche; ctx.fillRect(nx, wy, ws, ws);
        ctx.fillStyle = z.wappen.schrift; ctx.font = `800 ${ws * 0.38}px ${FONT}`; ctx.textAlign = "center";
        ctx.fillText(z.wappen.initialen, nx + ws / 2, cy + ws * 0.03);
      }
      ctx.restore();
    }
    if (wappenPlatz) nx += 54 * u + 16 * u;
    if (z.flagge) {
      const fh = 38 * u, fw = fh * 4 / 3;
      ctx.drawImage(z.flagge, nx, cy - fh / 2, fw, fh);
      ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 2 * u; ctx.strokeRect(nx, cy - fh / 2, fw, fh);
    }
    if (flaggenPlatz) nx += 38 * u * 4 / 3 + 16 * u;
    ctx.textAlign = "right"; ctx.font = `800 ${fw}px ${FONT}`; ctx.fillStyle = "#22d3ee";
    const wx = x0 + breite - 26 * u;
    ctx.fillText(z.wert, wx, cy + fw * 0.04);
    const wWert = ctx.measureText(z.wert).width;
    ctx.textAlign = "left"; ctx.font = `900 ${fn}px ${FONT}`; ctx.fillStyle = "#ffffff";
    const platz = wx - wWert - 24 * u - nx;
    // Lange Namen erst kleiner (bis 70 %), dann kuerzen.
    let fnz = fn;
    while (fnz > fn * 0.7 && ctx.measureText(z.name).width > platz) { fnz -= fn * 0.05; ctx.font = `900 ${fnz}px ${FONT}`; }
    let name = z.name;
    while (name.length > 1 && ctx.measureText(name).width > platz) name = name.slice(0, -2) + "…";
    ctx.fillText(name, nx, cy + fn * 0.04);
    y += zh + zg;
  }
  ctx.restore();
}

function rundRechteck(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h / 2, w / 2);
  c.beginPath();
  c.moveTo(x + rr, y); c.arcTo(x + w, y, x + w, y + h, rr); c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr); c.arcTo(x, y, x + w, y, rr); c.closePath();
}

/** Ein Bild zeichnen. `tv` = Video-Sekunde. Der Canvas muss schon die Zielgroesse haben. */
export function zeichne(ctx: CanvasRenderingContext2D, clip: Clip, cfg: MediaCfg, tv: number, tx: Texte, hintergrund = cfg.hintergrund,
  mehr: Mehrfach | null = null, ev: EventOverlay | null = null) {
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
    "track", "event", "fahrer", "sprint", "carve", "speed", "pumps", "pumprate", "hr", "distance", "time", "logo",
  ] as ElKey[]) {
    const e = cfg.el[k];
    if (!e.an) continue;
    const u = basis * e.gr;
    switch (k) {
      case "track":
        if (e.gr >= 1.4) {   // bildfuellend: mittig, nicht im Stapel des Ankers, liegt hinter allen Zahlen
          const b = trackBlock(clip, cfg, z, u, W, H, mehr);
          b.draw(ctx, (W - b.w) / 2, (H - b.h) / 2, "c");
        } else dazu(k, trackBlock(clip, cfg, z, u, W, H, mehr));
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
      case "time": {
        // Sprint-Start (Jan 26.11.2026): Stoppuhr ab dem Sprintbeginn — im Vorlauf 0.0, dann in Zehnteln bis der
        // Langsamste im Ziel ist, danach steht sie.
        const sp = mehr?.modus === "sprint" ? mehr.haupt.sprint : null;
        if (sp) {
          const ende = clip.spans[clip.spans.length - 1][1] - SPRINT_NACH_MS;
          const ms = Math.max(0, Math.min(z.ts, ende) - sp.a);
          dazu(k, statBlock(ctx, cfg, u, (ms / 1000).toFixed(1), "s", tx.time));
        } else dazu(k, statBlock(ctx, cfg, u, fmtMS(z.clipMs), "", tx.time));
        break;
      }
      case "sprint": dazu(k, sprintBlocks(ctx, clip, cfg, z, u)); break;
      case "carve": dazu(k, carveBlock(ctx, clip, cfg, z, u, tx)); break;
      // Sobald die Endtafel einblendet, machen die Kaesten ihr Platz (sie zeigen dasselbe).
      case "fahrer": if (mehr && mehr.mit.length && !(ev?.ende && tv >= videoDauer(clip, cfg, ev) - ENDTAFEL_S + 0.3)) dazu(k, fahrerBlocks(ctx, cfg, clip, mehr, z, u, tx, ev)); break;
      case "event": if (ev) dazu(k, eventKopf(ctx, cfg, ev, u, W - 2 * rand)); break;
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
  // Endtafel ueber allem, in den letzten ENDTAFEL_S Sekunden (0,6 s Einblendung).
  if (ev?.ende) {
    const ab = videoDauer(clip, cfg, ev) - ENDTAFEL_S;
    if (tv >= ab) endTafel(ctx, ev, W, H, (tv - ab) / 0.6);
  }
  ctx.restore();
}
