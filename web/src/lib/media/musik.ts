// Media-Ansicht, Teil B (docs/MEDIA.md): Musik aus den Daten des Laufs als Strudel-Code.
//
// Ein Code fuer alles: dieselbe Zeichenkette spielt die Live-Vorschau, wird offline zum Ton des Videos gerendert und
// geht als Link nach strudel.cc. Aufbau (Jan 24.11.2026): oben die groben Regler mit Kommentaren, darunter die Stimmen,
// ganz unten ein Absatz mit der Datenbasis aus dem Lauf. `daten()` ist eine Funktions-DEKLARATION — sie wird in JS nach
// oben gehoben, deshalb darf `const D = daten()` oben stehen und die Daten trotzdem unten.
//
// STIMMEN statt fester Stile (Jan 24.11.: „mehr freiheiten welche daten was sind, auch mehrmals das gleiche"): jede
// Stimme waehlt Instrument, Muster, wann sie spielt und welche Daten Tonhoehe, Lautstaerke, Klangfarbe, Richtung und
// Dichte steuern. Die fuenf frueheren Stile sind Vorlagen, die eine Stimmen-Liste laden.
//
// Datenschutz: der Code enthaelt nur abgeleitete Werte (Pump-Raster, Tempo je Schlag …), keine GPS-Position, keinen
// Namen und keine Session-Nummer — er geht per Link nach strudel.cc.
//
// Zeit: 1 Zyklus = 1 Takt (4 Schlaege), Takt 0 beginnt mit Video-Sekunde 0. Pumps rasten auf 1/16 ein. Das Tempo ist
// fest je Vorlage (Jan 24.11.: „tempo machen wir hier nur einfach").

import { type Clip, sessionZuClip } from "./clip";
import { type MediaCfg, videoDauer, zustandBei } from "./zeichnen";

export type Stil = "techno" | "klavier" | "gitarre" | "chiptune" | "ambient";
export const STILE: Stil[] = ["techno", "klavier", "gitarre", "chiptune", "ambient"];

/** Effekte, die auf einzelne Momente des Laufs reagieren (Jan 24.11.: „mehr kreativitaet erlauben bitte"). */
export type Fx = "sprintTempo" | "riser" | "carveWhoosh" | "topSpeed" | "meter" | "kampf" | "start" | "ende";
export const FXS: Fx[] = ["sprintTempo", "riser", "carveWhoosh", "topSpeed", "meter", "kampf", "start", "ende"];

// ── Stimmen ──────────────────────────────────────────────────────────────────────────────────────────────────────
export type Muster = "treffer" | "anschlag" | "melodie" | "arpeggio" | "akkord" | "bass" | "beat";
export const MUSTER: Muster[] = ["treffer", "anschlag", "melodie", "arpeggio", "akkord", "bass", "beat"];
export type Wann = "lauf" | "pump" | "gleiten" | "sprint" | "carve" | "meter" | "immer";
export const WANN: Wann[] = ["lauf", "pump", "gleiten", "sprint", "carve", "meter", "immer"];
/** Datenquelle fuer einen Regler. „fest" = keine. */
export type Q = "fest" | "tempo" | "pumpfreq" | "puls" | "carve" | "beschl" | "verlauf";
export const TON_Q: ("akkorde" | Q)[] = ["akkorde", "tempo", "pumpfreq", "puls", "carve", "beschl", "verlauf"];
export const LAUT_Q: Q[] = ["fest", "tempo", "pumpfreq", "puls", "verlauf"];
export const FARBE_Q: Q[] = ["fest", "tempo", "pumpfreq", "puls", "beschl", "verlauf"];
export const DICHTE_Q: Q[] = ["fest", "tempo", "pumpfreq", "puls"];

export const SYNTHS = ["synth:sawtooth", "synth:supersaw", "synth:square", "synth:triangle", "synth:sine", "synth:fm", "synth:pulse"];
export const SAMPLES = ["pf_piano", "pf_epiano", "pf_guitar_nylon", "pf_guitar_steel", "pf_guitar_electric", "pf_violin",
  "pf_trumpet", "pf_flute", "pf_marimba", "pf_organ", "pf_strings", "pf_choir", "pf_pad_warm", "pf_bass_finger",
  "pf_bass_upright", "pf_bass_synth"];
export const KITS = ["kit:synth", "kit:akustik"];

export interface Stimme {
  id: string;
  name: string;
  instrument: string;           // synth:… | pf_… | kit:…
  muster: Muster;
  wann: Wann;
  ton: "akkorde" | Q;           // Tonhoehe: feste Akkordfolge oder aus Daten (verschiebt um bis zu einer Oktave)
  laut: Q;
  farbe: Q;                     // Klangfarbe (Tiefpass)
  pan: "mitte" | "carve";
  dichte: Q;                    // Noten je Schlag (1/2/4) aus Daten
  oktave: number;
  lautstaerke: number;          // 0..1
  stumm: boolean;
  solo: boolean;
}

export interface MusikCfg {
  an: boolean;
  vorlage: Stil;
  stimmen: Stimme[];
  fx: Record<Fx, boolean>;
  fxLaut: number;
}

let zaehlerId = 0;
const neueId = () => `s${Date.now().toString(36)}${(zaehlerId++).toString(36)}`;

export function neueStimme(teil: Partial<Stimme> = {}): Stimme {
  return {
    id: neueId(), name: "Melodie", instrument: "synth:triangle", muster: "melodie", wann: "lauf", ton: "tempo",
    laut: "fest", farbe: "fest", pan: "mitte", dichte: "fest", oktave: 4, lautstaerke: 0.6, stumm: false, solo: false,
    ...teil,
  };
}

const BPM: Record<Stil, number> = { techno: 128, klavier: 92, gitarre: 104, chiptune: 140, ambient: 72 };
const SKALA: Record<Stil, string> = { techno: "minor", klavier: "major", gitarre: "major", chiptune: "major", ambient: "minor" };
const NAME: Record<Stil, string> = { techno: "Techno", klavier: "Piano", gitarre: "Guitar", chiptune: "8-bit", ambient: "Ambient" };
// Gesamtpegel je Vorlage (postgain), an einem 50-s-Lauf so eingestellt, dass die Vorlagen aehnlich laut sind.
const PEGEL: Record<Stil, number> = { techno: 0.45, klavier: 1.1, gitarre: 0.8, chiptune: 0.45, ambient: 0.85 };
const TOENE = ["C", "D", "E", "F", "G", "A", "B"];

/** Die Stimmen einer Vorlage (die frueheren Stile). Namen sind Vorschlaege — man kann sie umbenennen. */
export function vorlage(stil: Stil): Stimme[] {
  const s = (t: Partial<Stimme>) => neueStimme(t);
  switch (stil) {
    case "techno": return [
      s({ name: "Kick", instrument: "kit:synth", muster: "treffer", wann: "pump", lautstaerke: 0.9 }),
      s({ name: "Groove", instrument: "kit:synth", muster: "beat", wann: "lauf", dichte: "tempo", lautstaerke: 0.35 }),
      s({ name: "Acid bass", instrument: "synth:sawtooth", muster: "bass", wann: "pump", ton: "akkorde", farbe: "tempo", pan: "carve", oktave: 2, lautstaerke: 0.75 }),
      s({ name: "Melody", instrument: "synth:supersaw", muster: "melodie", wann: "lauf", ton: "tempo", farbe: "tempo", oktave: 4, lautstaerke: 0.4 }),
      s({ name: "Pad", instrument: "synth:supersaw", muster: "akkord", wann: "gleiten", ton: "akkorde", oktave: 3, lautstaerke: 0.45 }),
      s({ name: "Sprint arp", instrument: "synth:supersaw", muster: "arpeggio", wann: "sprint", ton: "akkorde", pan: "carve", oktave: 5, lautstaerke: 0.4 }),
    ];
    case "klavier": return [
      s({ name: "Left hand", instrument: "pf_piano", muster: "bass", wann: "pump", ton: "akkorde", oktave: 2, lautstaerke: 0.7 }),
      s({ name: "Melody", instrument: "pf_piano", muster: "melodie", wann: "lauf", ton: "tempo", dichte: "tempo", pan: "carve", oktave: 4, lautstaerke: 0.6 }),
      s({ name: "Carve arpeggio", instrument: "pf_marimba", muster: "arpeggio", wann: "carve", ton: "carve", pan: "carve", oktave: 5, lautstaerke: 0.5 }),
      s({ name: "Strings", instrument: "pf_strings", muster: "akkord", wann: "gleiten", ton: "akkorde", oktave: 3, lautstaerke: 0.45 }),
      s({ name: "Sprint sparkle", instrument: "pf_piano", muster: "arpeggio", wann: "sprint", ton: "akkorde", oktave: 5, lautstaerke: 0.45 }),
    ];
    case "gitarre": return [
      s({ name: "Guitar", instrument: "pf_guitar_nylon", muster: "anschlag", wann: "pump", ton: "akkorde", farbe: "tempo", pan: "carve", oktave: 3, lautstaerke: 0.6 }),
      s({ name: "Bass", instrument: "pf_bass_finger", muster: "bass", wann: "pump", ton: "akkorde", oktave: 2, lautstaerke: 0.75 }),
      s({ name: "Drums", instrument: "kit:akustik", muster: "beat", wann: "lauf", dichte: "tempo", lautstaerke: 0.45 }),
      s({ name: "Kick", instrument: "kit:akustik", muster: "treffer", wann: "pump", lautstaerke: 0.7 }),
      s({ name: "Solo", instrument: "pf_guitar_electric", muster: "melodie", wann: "sprint", ton: "tempo", oktave: 4, lautstaerke: 0.5 }),
      s({ name: "Strings", instrument: "pf_strings", muster: "akkord", wann: "gleiten", ton: "akkorde", oktave: 3, lautstaerke: 0.4 }),
    ];
    case "chiptune": return [
      s({ name: "Bass", instrument: "synth:triangle", muster: "bass", wann: "pump", ton: "akkorde", oktave: 2, lautstaerke: 0.8 }),
      s({ name: "Melody", instrument: "synth:square", muster: "melodie", wann: "lauf", ton: "tempo", dichte: "tempo", oktave: 4, lautstaerke: 0.35 }),
      s({ name: "Beat", instrument: "kit:synth", muster: "beat", wann: "lauf", lautstaerke: 0.35 }),
      s({ name: "Kick", instrument: "kit:synth", muster: "treffer", wann: "pump", lautstaerke: 0.7 }),
      s({ name: "Sprint arp", instrument: "synth:square", muster: "arpeggio", wann: "sprint", ton: "akkorde", oktave: 5, lautstaerke: 0.3 }),
      s({ name: "Pad", instrument: "synth:pulse", muster: "akkord", wann: "gleiten", ton: "akkorde", oktave: 3, lautstaerke: 0.3 }),
    ];
    case "ambient": return [
      s({ name: "Drone", instrument: "synth:sawtooth", muster: "akkord", wann: "lauf", ton: "akkorde", farbe: "tempo", oktave: 2, lautstaerke: 0.35 }),
      s({ name: "Pluck", instrument: "pf_epiano", muster: "treffer", wann: "pump", ton: "tempo", pan: "carve", oktave: 4, lautstaerke: 0.55 }),
      s({ name: "Pad", instrument: "pf_pad_warm", muster: "akkord", wann: "gleiten", ton: "akkorde", oktave: 3, lautstaerke: 0.5 }),
      s({ name: "Carve melody", instrument: "synth:fm", muster: "melodie", wann: "carve", ton: "carve", pan: "carve", oktave: 5, lautstaerke: 0.45 }),
      s({ name: "Heartbeat", instrument: "kit:synth", muster: "treffer", wann: "lauf", laut: "puls", lautstaerke: 0.4 }),
    ];
  }
}

export const MUSIK_DEFAULT: MusikCfg = {
  an: false,
  vorlage: "techno",
  stimmen: vorlage("techno"),
  fx: { sprintTempo: true, riser: true, carveWhoosh: true, topSpeed: true, meter: false, kampf: true, start: true, ende: true },
  fxLaut: 0.8,
};

export function taktSekunden(stil: Stil): number { return 240 / BPM[stil]; }

// ── Datenbasis ───────────────────────────────────────────────────────────────────────────────────────────────────
/** Je Takt 16 Schritte (Ereignisse) bzw. 4 Werte je Schlag. */
export interface MusikDaten {
  takte: number;
  pump: boolean[][]; akzent: boolean[][]; muenze: boolean[][];
  riser: boolean[][]; carveStart: boolean[][]; top: boolean[][]; meter: boolean[][]; ende: boolean[][];
  dichteTempo: boolean[][]; dichtePumpfreq: boolean[][]; dichtePuls: boolean[][];
  tempo: number[][]; pumpfreq: number[][]; puls: number[][]; carve: number[][]; beschl: number[][]; verlauf: number[][];
  pan: number[][]; gleiten: number[][]; sprint: number[][]; carveAn: number[][]; fill: number[][]; kampf: number[][];
  aktiv: number[];
}

export interface Verfuegbar { puls: boolean; pumps: boolean; carves: boolean; sprints: boolean; glides: boolean }
export function verfuegbar(clip: Clip, vcfg: MediaCfg): Verfuegbar {
  return {
    puls: clip.hatPuls, pumps: clip.hatPumps, carves: clip.carves.length > 0, glides: clip.glides.length > 0,
    sprints: clip.sprints.some((sp) => vcfg.sprints.includes(sp.kz)),
  };
}

export function musikDaten(clip: Clip, vcfg: MediaCfg, stil: Stil): MusikDaten {
  const takt = taktSekunden(stil), schritt = takt / 16, schlag = takt / 4;
  const dauer = videoDauer(clip, vcfg);
  const takte = Math.max(1, Math.ceil(dauer / takt));
  const zuVideo = (ts: number) => vcfg.vor + sessionZuClip(clip, ts) / 1000 / vcfg.tempo;
  const laufEnde = vcfg.vor + clip.dauerMs / 1000 / vcfg.tempo;
  const leer = <T,>(n: number, v: T) => Array.from({ length: takte }, () => Array(n).fill(v) as T[]);
  const setze = (m: boolean[][], tv: number) => {
    const k = Math.round(tv / schritt);
    if (k >= 0 && k < takte * 16) m[Math.floor(k / 16)][k % 16] = true;
  };

  const pump = leer(16, false), akzent = leer(16, false), muenze = leer(16, false);
  const riser = leer(16, false), carveStart = leer(16, false), top = leer(16, false), meter = leer(16, false), ende = leer(16, false);
  clip.pumps.forEach((tp, i) => {
    setze(pump, zuVideo(tp));
    if ((i + 1) % 10 === 0) setze(muenze, zuVideo(tp));
  });
  const sprints = clip.sprints.filter((sp) => vcfg.sprints.includes(sp.kz));
  for (const sp of sprints) { setze(akzent, zuVideo(sp.b)); setze(riser, zuVideo(sp.a) - takt); }
  for (const c of clip.carves) {
    if (c.rot >= 360) setze(akzent, zuVideo(c.a + ((c.b - c.a) * 360) / c.rot));
    setze(carveStart, zuVideo(c.a));
  }
  let iTop = 0;
  clip.pts.forEach((p, i) => { if (p.v > clip.pts[iTop].v) iTop = i; });
  setze(top, zuVideo(clip.pts[iTop].t));
  let naechste = 50;
  for (const p of clip.pts) if (p.d >= naechste) { setze(meter, zuVideo(p.t)); naechste += 50; }
  setze(ende, laufEnde);

  const tempo = leer(4, 0), pumpfreq = leer(4, 0), puls = leer(4, 0), carve = leer(4, 0), beschl = leer(4, 0.5);
  const verlauf = leer(4, 0), pan = leer(4, 0.5), gleiten = leer(4, 0), sprint = leer(4, 0), carveAn = leer(4, 0);
  const fill = leer(4, 0), kampf = leer(4, 0);
  const dichteTempo = leer(16, false), dichtePumpfreq = leer(16, false), dichtePuls = leer(16, false);
  const phs = clip.pts.map((p) => p.ph).filter((x): x is number => x != null && x > 0).sort((a, b) => a - b);
  const phMitte = phs.length ? phs[Math.floor(phs.length / 2)] : 0;
  const norm = (v: number, lo: number, hi: number) => Math.min(1, Math.max(0, (v - lo) / Math.max(hi - lo, 1e-6)));
  // Dichte: 1, 2 oder 4 Noten je Schlag, je nach Wert.
  const dicht = (m: boolean[][], t: number, b: number, w: number) => {
    const n = w < 0.34 ? 1 : w < 0.67 ? 2 : 4;
    for (let i = 0; i < 4; i += 4 / n) m[t][b * 4 + i] = true;
  };
  const aktiv = Array(takte).fill(0);
  for (let t = 0; t < takte; t++) {
    for (let b = 0; b < 4; b++) {
      const tv = t * takt + (b + 0.5) * schlag;
      if (tv >= vcfg.vor - 2 * schlag && tv < vcfg.vor) fill[t][b] = 1;
      if (tv < vcfg.vor || tv > laufEnde) continue;
      aktiv[t] = 1;
      const z = zustandBei(clip, vcfg, tv);
      tempo[t][b] = norm(z.v, clip.vLo, clip.vHi);
      pumpfreq[t][b] = z.ph != null && z.ph > 0 ? norm(z.ph, clip.phLo, clip.phHi) : 0;
      puls[t][b] = z.hr != null && clip.hatPuls ? norm(z.hr, clip.hrLo, clip.hrHi) : 0;
      gleiten[t][b] = clip.glides.some(([a, e]) => z.ts >= a && z.ts <= e) ? 1 : 0;
      sprint[t][b] = sprints.some((sp) => z.ts >= sp.a && z.ts <= sp.b) ? 1 : 0;
      const c = clip.carves.find((cv) => z.ts >= cv.a && z.ts <= cv.b);
      if (c) {
        carveAn[t][b] = 1;
        pan[t][b] = c.dir === "L" ? 0.1 : 0.9;
        carve[t][b] = Math.min(1, (c.rot * (z.ts - c.a)) / Math.max(c.b - c.a, 1) / 360);
      }
      // Beschleunigung: Tempo-Aenderung ueber einen Schlag, 0,5 = gleich, 1 = deutlich schneller.
      const vor = zustandBei(clip, vcfg, Math.max(vcfg.vor, tv - schlag)).v, nach = zustandBei(clip, vcfg, Math.min(laufEnde, tv + schlag)).v;
      beschl[t][b] = Math.min(1, Math.max(0, 0.5 + (nach - vor) / 6));
      verlauf[t][b] = Math.min(1, Math.max(0, (tv - vcfg.vor) / Math.max(laufEnde - vcfg.vor, 1e-3)));
      kampf[t][b] = phMitte > 0 && z.ph != null && z.ph > phMitte * 1.25 ? 1 : 0;
      dicht(dichteTempo, t, b, tempo[t][b]);
      dicht(dichtePumpfreq, t, b, pumpfreq[t][b]);
      dicht(dichtePuls, t, b, puls[t][b]);
    }
  }
  return { takte, pump, akzent, muenze, riser, carveStart, top, meter, ende, dichteTempo, dichtePumpfreq, dichtePuls,
    tempo, pumpfreq, puls, carve, beschl, verlauf, pan, gleiten, sprint, carveAn, fill, kampf, aktiv };
}

const zahl = (x: number) => String(Number(x.toFixed(2)));
const schritte = (zeile: boolean[]) => zeile.some(Boolean) ? `[${zeile.map((x) => (x ? "x" : "~")).join(" ")}]` : "~";
const werte = (zeile: number[]) => zeile.every((v) => v === zeile[0]) ? zahl(zeile[0]) : `[${zeile.map(zahl).join(" ")}]`;
const folge = (teile: string[]) => "`<\n      " + teile.join("\n      ") + "\n    >`";   // Backticks: Mini-Notation ueber mehrere Zeilen

// ── Code je Stimme ───────────────────────────────────────────────────────────────────────────────────────────────
/** Samples ohne erzeugte Klaenge (CI, Klaenge fehlen): passender eingebauter Klang. */
function ersatz(instr: string): string {
  if (instr.startsWith("kit:")) return "kit:synth";
  if (!instr.startsWith("pf_")) return instr;
  if (instr.includes("bass")) return "synth:triangle";
  if (instr.includes("guitar")) return "synth:sawtooth";
  if (/strings|choir|pad|organ/.test(instr)) return "synth:supersaw";
  return "synth:fm";
}

// Melodie-Motive: fest je Session und Stimme (Zufall mit Samen), 4 Takte zu je 8 Achteln, kleine Schritte (klingt
// nach Melodie statt nach Messkurve); „Ton aus Tempo" verschiebt das Motiv dann nach oben/unten.
function motive(samen: number): string {
  let x = (samen * 2654435761) >>> 0 || 1;
  const zufall = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  const takte: string[] = [];
  let ton = 0;
  for (let t = 0; t < 4; t++) {
    const z: number[] = [];
    for (let i = 0; i < 8; i++) {
      ton += [-2, -1, -1, 0, 1, 1, 2, 3][Math.floor(zufall() * 8)];
      ton = Math.max(-2, Math.min(7, ton));
      z.push(ton);
    }
    takte.push(`[${z.join(" ")}]`);
  }
  return `"<${takte.join(" ")}>"`;
}

const GATE: Record<Exclude<Wann, "pump" | "meter">, string | null> = {
  lauf: "D.aktiv", gleiten: "D.gleiten", sprint: "D.sprint", carve: "D.carveAn", immer: null,
};
const DICHTE: Record<string, string> = { tempo: "D.dichteTempo", pumpfreq: "D.dichtePumpfreq", puls: "D.dichtePuls" };
const BESCHREIBUNG: Record<Wann, string> = {
  lauf: "while the run is on", pump: "on every pump", gleiten: "while gliding", sprint: "in the flying sprint",
  carve: "while carving", meter: "every 50 m", immer: "always",
};

function stimmeCode(v: Stimme, label: string, da: Verfuegbar, klaengeDa: boolean, samen: number): string {
  const fehlt = (q: string) => (q === "puls" && !da.puls) || (q === "pumpfreq" && !da.pumps) || (q === "carve" && !da.carves);
  const quelle = (q: string) => (q === "fest" || fehlt(q) ? null : q);
  const instr = klaengeDa ? v.instrument : ersatz(v.instrument);
  const kit = instr.startsWith("kit:");
  const akustik = instr === "kit:akustik";
  const vol = zahl(v.lautstaerke);
  const lautQ = quelle(v.laut), farbeQ = quelle(v.farbe), dichteQ = quelle(v.dichte);
  const tonQ = v.ton === "akkorde" ? null : quelle(v.ton);
  const event = v.wann === "pump" ? "D.pump" : v.wann === "meter" ? "D.meter" : null;
  const gate = event ? null : GATE[v.wann as keyof typeof GATE];
  const rhythmus = (fest: string) => event ? `.struct(${event})` : dichteQ ? `.struct(${DICHTE[dichteQ]})` : fest ? `.struct("${fest}")` : "";
  const maske = gate ? `.mask(${gate})` : "";
  const gain = lautQ ? `.gain(D.${lautQ}.mul(.75).add(.25).mul(${vol}))` : `.gain(${vol})`;
  const farbe = farbeQ ? `.lpf(D.${farbeQ}.range(500, 6000))` : "";
  const pan = v.pan === "carve" && da.carves ? ".pan(D.pan)" : "";
  const off = tonQ ? `D.${tonQ}.mul(7).round()` : null;
  const kopf = `// ${v.name}: ${instr.replace(/^(synth|kit):/, "")} · ${v.muster} · ${BESCHREIBUNG[v.wann]}`
    + (tonQ ? ` · pitch from ${tonQ}` : "") + (lautQ ? ` · volume from ${lautQ}` : "")
    + (farbeQ ? ` · brightness from ${farbeQ}` : "") + (dichteQ && !event ? ` · density from ${dichteQ}` : "");

  if (kit) {
    const KICK = akustik ? "pf_kick" : "sbd", SNARE = akustik ? "pf_snare" : "pink", HAT = akustik ? "pf_hat" : "white";
    if (v.muster === "beat") {
      const hats = event ? `.struct(${event})` : dichteQ ? `.struct(${DICHTE[dichteQ]})` : `.struct("x*8")`;
      return `${kopf}
${label}: stack(
  s("${KICK}").struct("x ~ x ~ x ~ x ~").decay(.4),
  s("${SNARE}").struct("~ x ~ x")${akustik ? "" : ".bpf(1800)"}.decay(.15).sustain(0),
  s("${HAT}")${hats}${akustik ? "" : ".hpf(8000)"}.decay(.04).sustain(0).gain(.6)
)${maske}${gain}${farbe}${pan}`;
    }
    // jedes andere Muster mit einem Schlagzeug: ein Kick-Schlag je Ereignis bzw. je Schlag
    return `${kopf}
${label}: s("${KICK}")${rhythmus("x*4")}${maske}.decay(.4)${gain}${farbe}${pan}`;
  }

  const ton = instr.startsWith("synth:") ? instr.slice(6) : instr;
  const klang = ton === "fm" ? `.s("sine").fm(2.5)` : `.s("${ton}")`;
  const add = (basis: string, ohne = "") => off ? `${basis}.add(${off})` : (ohne || basis);
  let noten: string, rh: string, huelle: string;
  switch (v.muster) {
    case "treffer": noten = off ? off : `"<0 -2 -3 -1>"`; rh = rhythmus("x*4"); huelle = ".decay(.35).sustain(0)"; break;
    case "anschlag": noten = add(`"<[0,2,4,7] [-3,0,2,4] [-2,0,3,5] [-1,1,3,5]>"`); rh = rhythmus("x ~ x ~ x ~ x ~"); huelle = ".decay(.6).sustain(0).release(.3)"; break;
    case "melodie": noten = add(motive(samen), `${motive(samen)}.add("<0 -2 -3 -1>")`); rh = rhythmus("x*8"); huelle = ".decay(.3).sustain(.2).release(.2)"; break;
    case "arpeggio": noten = add(`"0 2 4 7".fast(2)`, `"0 2 4 7".fast(2).add("<0 -2 -3 -1>")`); rh = rhythmus(""); huelle = ".decay(.15).sustain(0)"; break;
    case "akkord": noten = add(`"<[0,2,4] [-2,0,2] [-3,-1,1] [-1,1,3]>"`); rh = event ? `.struct(${event})` : ""; huelle = ".attack(.4).sustain(.8).release(1.5)"; break;
    case "bass": noten = add(`"<0 -2 -3 -1>"`); rh = rhythmus("x ~ x ~ x ~ x ~"); huelle = ".decay(.25).sustain(.1)"; break;
    default: noten = add(`"0"`); rh = rhythmus("x*4"); huelle = ".decay(.3).sustain(0)";
  }
  const hall = v.muster === "akkord" || v.muster === "melodie" ? ".room(.3)" : "";
  return `${kopf}
${label}: n(${noten})${rh}${maske}.scale(key(${v.oktave}))${klang}${huelle}${gain}${farbe}${pan}${hall}`;
}

function effekte(fx: Record<Fx, boolean>, da: Verfuegbar): string {
  const z: string[] = [`
// ── Effects: moments of the run (volume: FX) ─────────`];
  if (fx.sprintTempo && da.sprints) z.push(`// Flying sprint: double-time drums
fx_sprintkick: s("sbd").fast(8).mask(D.sprint).decay(.15).gain(FX * .5)
fx_sprinthats: s("white").fast(16).mask(D.sprint).hpf(9000).decay(.03).sustain(0).gain(FX * .3)`);
  if (fx.riser && da.sprints) z.push(`// Run-up: noise rises during the bar before the sprint window
fx_riser: s("white").struct(D.riser).clip(16).attack(1.6).release(.05).hpf(1200).gain(FX * .35).room(.4)`);
  if (fx.carveWhoosh && da.carves) z.push(`// Carve: a whoosh sweeps across at the start of the turn
fx_whoosh: s("pink").struct(D.carveStart).clip(8).attack(.25).release(.6).bpf(1600).gain(FX * .3).pan(D.pan)`);
  if (fx.topSpeed) z.push(`// Top speed of the run: impact + crash
fx_impact: s("sbd").struct(D.top).decay(1.2).gain(FX * .45)
fx_crash: s("white").struct(D.top).hpf(2500).decay(1.8).sustain(0).gain(FX * .35).room(.5)`);
  if (fx.meter) z.push(`// Every 50 m: a little bell
fx_bell: n("[7,11]").struct(D.meter).scale(key(5)).s("sine").fm(5).decay(1).sustain(0).gain(FX * .35).room(.5)`);
  if (fx.kampf && da.pumps) z.push(`// Fighting to stay up (pump rate well above usual): snare roll
fx_roll: s("pink").fast(16).mask(D.kampf).bpf(2200).decay(.05).sustain(0).gain(FX * .25)`);
  if (fx.start) z.push(`// Two beats of drum roll before the run starts
fx_fill: s("pink").fast(8).mask(D.fill).bpf(1800).decay(.06).sustain(0).gain(FX * .3)`);
  if (fx.ende) z.push(`// End of the run: a falling dive
fx_dive: s("sine").struct(D.ende).note("c5").penv(-36).pdecay(1.2).decay(1.4).sustain(0).gain(FX * .3).room(.6)`);
  // Accent at the end of a sprint and after a 360° carve
  z.push(`// Accent at the end of a sprint and after a 360° carve
fx_accent: s("white").struct(D.akzent).hpf(2500).decay(1.4).sustain(0).gain(FX * .35).room(.4)`);
  return z.join("\n") + "\n";
}

export interface CodeInfo {
  sessionId: number | string; lauf: string;
  klangUrl: string | null;   // absolute Adresse von /klaenge/strudel.json, null = keine Samples verfuegbar
}

/** Den kompletten Strudel-Code bauen. */
export function strudelCode(clip: Clip, vcfg: MediaCfg, m: MusikCfg, info: CodeInfo): string {
  const d = musikDaten(clip, vcfg, m.vorlage);
  const da = verfuegbar(clip, vcfg);
  const ton = TOENE[Math.abs(Number(info.sessionId) || 0) % TOENE.length];
  const klaengeDa = !!info.klangUrl;
  const solo = m.stimmen.some((v) => v.solo && !v.stumm);
  const aktiv = m.stimmen.filter((v) => !v.stumm && (!solo || v.solo));
  const braucht = klaengeDa && aktiv.some((v) => v.instrument.startsWith("pf_") || v.instrument === "kit:akustik");
  const labels = new Set<string>();
  const label = (name: string, i: number) => {
    let l = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || `voice${i + 1}`;
    if (/^[0-9]/.test(l)) l = `v${l}`;
    while (labels.has(l)) l += "_";
    labels.add(l);
    return l;
  };
  const kopf = `// Pumpfoil run as music — made on pumpfoil.org (Media view)
// ${info.lauf} · template ${NAME[m.vorlage]} · video ${videoDauer(clip, vcfg).toFixed(1)} s
// The rough settings are at the top, the data of the run is at the very bottom.
// Change a value and press Ctrl+Enter to hear it.

// ── Rough settings ───────────────────────────────────
const BPM = ${BPM[m.vorlage]}          // tempo in beats per minute
const ROOT = '${ton}'          // key (picked per session)
const SCALE = '${SKALA[m.vorlage]}'
const MASTER = ${PEGEL[m.vorlage]}        // overall volume
const FX = ${zahl(m.fxLaut)}            // volume of the effects
${braucht ? `// Instruments pf_* = notes rendered from the FluidR3 GM SoundFont (MIT), loaded from pumpfoil.org
samples('${info.klangUrl}', '${info.klangUrl!.replace(/strudel\.json$/, "")}')\n` : ""}
const D = daten()
const key = (octave) => ROOT + octave + ':' + SCALE

// ── Voices: one line each — what plays, when, and which data steers it ──
`;
  // Motiv-Samen: fest je Session und Stimme (Position in der Liste) — gleiche Session klingt jedes Mal gleich.
  const sid = Math.abs(Number(info.sessionId) || 0);
  const stimmen = aktiv.map((v, i) => stimmeCode(v, label(v.name, i), da, klaengeDa, sid * 31 + m.stimmen.indexOf(v) + 1)).join("\n\n") + "\n";
  const daten = `
// ── Data from the run (generated) ────────────────────
// One cycle = one bar, bar 0 starts with the video. ${d.takte} bars.
// pump/akzent/riser/carveStart/top/meter/ende: events on a 1/16 grid
// dichte*: 1, 2 or 4 notes per beat from the value · all other values: one per beat, 0..1
// aktiv: 1 while the run is on · pan: 0.1 = carving left, 0.9 = right · beschl: 0.5 = steady speed
function daten() {
  return {
    pump: ${folge(d.pump.map(schritte))},
    meter: ${folge(d.meter.map(schritte))},
    akzent: ${folge(d.akzent.map(schritte))},
    riser: ${folge(d.riser.map(schritte))},
    carveStart: ${folge(d.carveStart.map(schritte))},
    top: ${folge(d.top.map(schritte))},
    ende: ${folge(d.ende.map(schritte))},
    dichteTempo: ${folge(d.dichteTempo.map(schritte))},
    dichtePumpfreq: ${folge(d.dichtePumpfreq.map(schritte))},
    dichtePuls: ${folge(d.dichtePuls.map(schritte))},
    tempo: ${folge(d.tempo.map(werte))},
    pumpfreq: ${folge(d.pumpfreq.map(werte))},
    puls: ${folge(d.puls.map(werte))},
    carve: ${folge(d.carve.map(werte))},
    beschl: ${folge(d.beschl.map(werte))},
    verlauf: ${folge(d.verlauf.map(werte))},
    pan: ${folge(d.pan.map(werte))},
    gleiten: ${folge(d.gleiten.map(werte))},
    sprint: ${folge(d.sprint.map(werte))},
    carveAn: ${folge(d.carveAn.map(werte))},
    fill: ${folge(d.fill.map(werte))},
    kampf: ${folge(d.kampf.map(werte))},
    aktiv: "<${d.aktiv.join(" ")}>",
  }
}

all((x) => x.postgain(MASTER))
setcps(BPM / 60 / 4)
`;
  return kopf + stimmen + effekte(m.fx, da) + daten;
}

/** Link nach strudel.cc: der Code base64-kodiert hinter `#` (geht beim Laden nicht an deren Server). */
export function strudelLink(code: string): string {
  const bytes = new TextEncoder().encode(code);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return `https://strudel.cc/#${encodeURIComponent(btoa(bin))}`;
}
