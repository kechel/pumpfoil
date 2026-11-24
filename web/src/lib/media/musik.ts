// Media-Ansicht, Teil B (docs/MEDIA.md): Musik aus den Daten des Laufs als Strudel-Code.
//
// Ein Code fuer alles: dieselbe Zeichenkette spielt die Live-Vorschau, wird offline zum Ton des Videos gerendert und
// geht als Link nach strudel.cc. Aufbau (Jan 24.11.2026): oben die groben Regler mit Kommentaren, darunter die Spuren,
// ganz unten ein Absatz mit der Datenbasis aus dem Lauf. `daten()` ist eine Funktions-DEKLARATION — sie wird in JS nach
// oben gehoben, deshalb darf `const D = daten()` oben stehen und die Daten trotzdem unten.
//
// Nur eingebaute Klangerzeuger (sine/triangle/sawtooth/square/supersaw, Rauschen, sbd) — keine Samples. So klingt der
// Link auf strudel.cc genauso wie bei uns, und es werden keine fremden Dateien geladen.
//
// Zeit: 1 Zyklus = 1 Takt (4 Schlaege), Takt 0 beginnt mit Video-Sekunde 0. Pumps rasten auf 1/16 ein. Das Tempo ist
// fest je Stil (Jan 24.11.: „tempo machen wir hier nur einfach").

import { type Clip, sessionZuClip } from "./clip";
import { type MediaCfg, videoDauer, zustandBei } from "./zeichnen";

export type Stil = "techno" | "klavier" | "gitarre" | "chiptune" | "ambient";
export const STILE: Stil[] = ["techno", "klavier", "gitarre", "chiptune", "ambient"];

export type Quelle = "pump" | "tempo" | "gleiten" | "sprint" | "carve" | "puls";
export const QUELLEN: Quelle[] = ["pump", "tempo", "gleiten", "sprint", "carve", "puls"];
export type Spur = "bass" | "drums" | "lead" | "flaeche";
export const SPUREN: Spur[] = ["bass", "drums", "lead", "flaeche"];

export interface MusikCfg {
  an: boolean;
  stil: Stil;
  staerke: Record<Quelle, number>;   // 0 = aus, 1 = voll
  spur: Record<Spur, number>;        // Lautstaerke je Spur 0..1
}

export const MUSIK_DEFAULT: MusikCfg = {
  an: false,
  stil: "techno",
  staerke: { pump: 1, tempo: 0.8, gleiten: 0.8, sprint: 1, carve: 0.7, puls: 0.5 },
  spur: { bass: 0.9, drums: 0.8, lead: 0.7, flaeche: 0.6 },
};

const BPM: Record<Stil, number> = { techno: 128, klavier: 92, gitarre: 104, chiptune: 140, ambient: 72 };
const SKALA: Record<Stil, string> = { techno: "minor", klavier: "major", gitarre: "major", chiptune: "major", ambient: "minor" };
const NAME: Record<Stil, string> = { techno: "Techno", klavier: "Piano", gitarre: "Guitar", chiptune: "8-bit", ambient: "Ambient" };
const TOENE = ["C", "D", "E", "F", "G", "A", "B"];
// Gesamtpegel je Stil (postgain), gemessen 24.11.2026 an einem 50-s-Lauf: so liegen alle Stile aehnlich laut.
const PEGEL: Record<Stil, number> = { techno: 0.55, klavier: 1.4, gitarre: 0.65, chiptune: 1.8, ambient: 1.6 };

export function taktSekunden(stil: Stil): number { return 240 / BPM[stil]; }

/** Die Datenbasis: je Takt 16 Pump-Schritte bzw. 4 Werte je Schlag. */
export interface MusikDaten {
  takte: number;
  pump: boolean[][]; akzent: boolean[][]; muenze: boolean[][];
  tempo: number[][]; gleiten: number[][]; sprint: number[][]; carve: number[][]; herz: number[][];
  aktiv: number[];
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
  clip.pumps.forEach((tp, i) => {
    setze(pump, zuVideo(tp));
    if ((i + 1) % 10 === 0) setze(muenze, zuVideo(tp));   // jeder 10. Pump (8-bit: Muenz-Ton)
  });
  const sprints = clip.sprints.filter((sp) => vcfg.sprints.includes(sp.kz));
  for (const sp of sprints) setze(akzent, zuVideo(sp.b));
  for (const c of clip.carves) if (c.rot >= 360) setze(akzent, zuVideo(c.a + ((c.b - c.a) * 360) / c.rot));

  const tempo = leer(4, 0), gleiten = leer(4, 0), sprint = leer(4, 0), carve = leer(4, 0.5), herz = leer(4, 0);
  const aktiv = Array(takte).fill(0);
  for (let t = 0; t < takte; t++) {
    for (let b = 0; b < 4; b++) {
      const tv = t * takt + (b + 0.5) * schlag;
      if (tv < vcfg.vor || tv > laufEnde) continue;
      aktiv[t] = 1;
      const z = zustandBei(clip, vcfg, tv);
      tempo[t][b] = Math.min(1, Math.max(0, (z.v - clip.vLo) / Math.max(clip.vHi - clip.vLo, 1)));
      gleiten[t][b] = clip.glides.some(([a, e]) => z.ts >= a && z.ts <= e) ? 1 : 0;
      sprint[t][b] = sprints.some((sp) => z.ts >= sp.a && z.ts <= sp.b) ? 1 : 0;
      const c = clip.carves.find((cv) => z.ts >= cv.a && z.ts <= cv.b);
      carve[t][b] = c ? (c.dir === "L" ? 0.1 : 0.9) : 0.5;
      herz[t][b] = z.hr != null && clip.hatPuls ? Math.min(1, Math.max(0, (z.hr - clip.hrLo) / Math.max(clip.hrHi - clip.hrLo, 1))) : 0;
    }
  }
  return { takte, pump, akzent, muenze, tempo, gleiten, sprint, carve, herz, aktiv };
}

const zahl = (x: number) => String(Number(x.toFixed(1)));
/** Schritte eines Takts als Mini-Notation; ein leerer Takt ist eine einzige Pause. */
const schritte = (zeile: boolean[]) => zeile.some(Boolean) ? `[${zeile.map((x) => (x ? "x" : "~")).join(" ")}]` : "~";
const werte = (zeile: number[]) => zeile.every((v) => v === zeile[0]) ? zahl(zeile[0]) : `[${zeile.map(zahl).join(" ")}]`;
const folge = (teile: string[]) => "`<\n      " + teile.join("\n      ") + "\n    >`";   // Backticks: Mini-Notation ueber mehrere Zeilen

function spuren(stil: Stil): string {
  // Gemeinsame Bausteine: Pan folgt dem Carve, „ohneGleiten" duckt eine Spur in Gleitphasen.
  const pan = ".pan(D.carve.sub(.5).mul(CARVE).add(.5))";
  const ohneGleiten = "D.gleiten.mul(-GLEITEN).add(1)";
  switch (stil) {
    case "techno": return `
// ── Tracks ───────────────────────────────────────────
// Kick on every beat while the run is on
kick: s("sbd*4").mask(D.aktiv).decay(.45).gain(DRUMS)

// Acid bass: one hit per pump; speed opens the filter; drops out while gliding
bass: n("<0 0 5 3>").struct(D.pump).scale(key(2)).s("sawtooth")
  .lpf(D.tempo.mul(TEMPO).range(250, 3800)).lpq(12).decay(.16).sustain(0)
  .gain(${ohneGleiten}.mul(BASS * PUMP))${pan}

// Hi-hats get louder with speed and heart rate
hats: s("white*16").mask(D.aktiv).hpf(8500).decay(.03).sustain(0)
  .gain(D.tempo.mul(TEMPO).add(D.herz.mul(PULS)).mul(.3 * DRUMS))

// Lead arpeggio only inside the flying sprint
lead: n("0 2 4 7 9 7 4 2".fast(2)).mask(D.sprint).scale(key(4)).s("supersaw").lpf(3000).decay(.12).sustain(.15)
  .gain(SPRINT * LEAD * .5).room(.3)${pan}

// Pad swells while gliding
pad: n("<[0,2,4] [0,2,5] [-2,0,3] [-1,1,3]>").mask(D.aktiv).scale(key(3)).s("supersaw").attack(.4).release(1.5).lpf(1000)
  .gain(D.gleiten.mul(GLEITEN).add(.2).mul(FLAECHE * .45)).room(.6)

// Crash at the end of a sprint and when a carve passes 360°
crash: s("white").struct(D.akzent).hpf(2500).decay(1.4).sustain(0).gain(.45 * DRUMS).room(.4)
`;
    case "klavier": return `
// ── Tracks ───────────────────────────────────────────
// Left hand: a low note on every pump, quieter while gliding
bass: n("<0 -2 -3 -1>").struct(D.pump).scale(key(2)).s("triangle").fm(1).decay(1).sustain(.1).release(.6)
  .gain(${ohneGleiten}.mul(BASS * PUMP * .8))${pan}

// Right hand: arpeggio, louder the faster you go
arp: n("0 2 4 7 9 7 4 2").mask(D.aktiv).scale(key(4)).s("triangle").fm(2.5).decay(.45).sustain(0)
  .gain(D.tempo.mul(TEMPO).mul(LEAD * .5))${pan}

// Flying sprint: the arpeggio doubles and jumps an octave up
sprint: n("0 2 4 7 9 11 9 7 4 2 0 2 4 7 9 11").mask(D.sprint).scale(key(5)).s("triangle").fm(3).decay(.25).sustain(0)
  .gain(SPRINT * LEAD * .45).room(.4)${pan}

// Glide: soft sustained chord
pad: n("<[0,2,4,6] [-2,0,2,4] [-3,-1,1,3] [-1,1,3,5]>").mask(D.aktiv).scale(key(3)).s("sine").attack(.6).release(2)
  .gain(D.gleiten.mul(GLEITEN).add(.1).mul(FLAECHE * .5)).room(.8)

// Heartbeat: soft double kick, follows the heart rate
herz: s("[sbd sbd] ~ ~ ~").mask(D.aktiv).decay(.25).gain(D.herz.mul(PULS).mul(DRUMS * .6))

// Bell at the end of a sprint and after a 360° carve
bell: n("[7,11]").struct(D.akzent).scale(key(5)).s("sine").fm(6).decay(2).sustain(0).gain(.5).room(.6)
`;
    case "gitarre": return `
// ── Tracks ───────────────────────────────────────────
// Strummed chord on every pump; speed brightens it
gtr: n("<[0,2,4,7] [-3,0,2,4] [-2,0,3,5] [-1,1,3,5]>").struct(D.pump).scale(key(3)).s("sawtooth")
  .lpf(D.tempo.mul(TEMPO).range(700, 2600)).decay(.5).sustain(0).release(.3)
  .gain(${ohneGleiten}.mul(PUMP * LEAD * .55))${pan}

// Bass: root note on the pumps
bass: n("<0 -3 -2 -1>").struct(D.pump).scale(key(2)).s("triangle").decay(.4).sustain(0)
  .gain(${ohneGleiten}.mul(BASS * PUMP))

// Drums: kick and a noise snare, snare louder with speed
kick: s("sbd ~ [~ sbd] ~").mask(D.aktiv).decay(.35).gain(DRUMS)
snare: s("~ pink ~ pink").mask(D.aktiv).bpf(1800).decay(.12).sustain(0)
  .gain(D.tempo.mul(TEMPO).add(.4).mul(DRUMS * .5))

// Sprint: square-wave solo line
solo: n("0 2 4 5 7 5 4 2").mask(D.sprint).scale(key(4)).s("square").lpf(2200).decay(.15).sustain(.2)
  .gain(SPRINT * LEAD * .35).room(.3)${pan}

// Glide: open sustained chord
pad: n("<[0,4,7] [-3,0,4] [-2,2,5] [-1,3,5]>").mask(D.gleiten).scale(key(3)).s("sine").attack(.5).release(1.8)
  .gain(GLEITEN * FLAECHE * .5).room(.7)
`;
    case "chiptune": return `
// ── Tracks ───────────────────────────────────────────
// Triangle bass on every pump
bass: n("<0 0 3 4>").struct(D.pump).scale(key(2)).s("triangle").decay(.15).sustain(0)
  .gain(${ohneGleiten}.mul(BASS * PUMP))

// Square melody, louder the faster you go
melody: n("<[0 2 4 2 0 4 7 4] [3 5 7 5 3 7 9 7]>").mask(D.aktiv).scale(key(4)).s("square").decay(.1).sustain(.3).lpf(4000)
  .gain(D.tempo.mul(TEMPO).mul(LEAD * .3))${pan}

// Coin sound on every 10th pump
coin: n("[9 14]").struct(D.muenze).scale(key(5)).s("square").decay(.08).sustain(0).gain(.35)

// Noise drums
drums: s("white ~ white white").mask(D.aktiv).hpf(3000).decay(.05).sustain(0).gain(DRUMS * .35)

// Sprint: fast arpeggio
sprint: n("0 4 7 11".fast(4)).mask(D.sprint).scale(key(5)).s("square").decay(.05).sustain(.2)
  .gain(SPRINT * LEAD * .3)${pan}

// Glide: held pulse chord
pad: n("<[0,2,4] [3,5,7]>").mask(D.gleiten).scale(key(3)).s("pulse").attack(.2).release(1)
  .gain(GLEITEN * FLAECHE * .3)

// Fanfare at the end of a sprint and after a 360° carve
fanfare: n("[0 4 7 11]").struct(D.akzent).scale(key(5)).s("square").decay(.4).sustain(0).gain(.35)
`;
    case "ambient": return `
// ── Tracks ───────────────────────────────────────────
// Soft pluck on every pump, long reverb
pluck: n("<0 2 4 2>").struct(D.pump).scale(key(4)).s("sine").fm(1.5).decay(.8).sustain(0)
  .lpf(D.tempo.mul(TEMPO).range(600, 3000)).gain(PUMP * LEAD * .45).room(.9)${pan}

// Deep drone, a bit brighter with speed
drone: n("<[0,4] [-2,2]>/2").mask(D.aktiv).scale(key(2)).s("sawtooth").lpf(D.tempo.mul(TEMPO).range(200, 700)).attack(1).release(3)
  .gain(BASS * .35)

// Glide: wide pad swells up
pad: n("<[0,2,4,6] [-1,1,3,5]>/2").mask(D.aktiv).scale(key(3)).s("supersaw").attack(1.2).release(3).lpf(1400)
  .gain(D.gleiten.mul(GLEITEN).add(.15).mul(FLAECHE * .4)).room(1)

// Heartbeat pulse
herz: s("sbd ~ ~ ~").mask(D.aktiv).decay(.3).gain(D.herz.mul(PULS).mul(DRUMS * .5))

// Sprint: shimmering high line
shimmer: n("0 4 7 11 14 11 7 4").mask(D.sprint).scale(key(5)).s("sine").fm(4).decay(.3).sustain(0)
  .gain(SPRINT * LEAD * .35).room(1)${pan}
`;
  }
}

export interface CodeInfo { sessionId: number | string; lauf: string }

/** Den kompletten Strudel-Code bauen. */
export function strudelCode(clip: Clip, vcfg: MediaCfg, m: MusikCfg, info: CodeInfo): string {
  const d = musikDaten(clip, vcfg, m.stil);
  const ton = TOENE[Math.abs(Number(info.sessionId) || 0) % TOENE.length];
  const s = m.staerke, v = m.spur;
  const kopf = `// Pumpfoil run as music — made on pumpfoil.org (Media view)
// Session ${info.sessionId} · ${info.lauf} · style ${NAME[m.stil]} · video ${videoDauer(clip, vcfg).toFixed(1)} s
// The rough settings are at the top, the data of the run is at the very bottom.
// Change a value and press Ctrl+Enter to hear it.

// ── Rough settings ───────────────────────────────────
const BPM = ${BPM[m.stil]}          // tempo in beats per minute (fixed per style)
const ROOT = '${ton}'          // key, picked from the session number
const SCALE = '${SKALA[m.stil]}'

// How strongly the run steers the music (0 = off, 1 = full)
const PUMP = ${zahl(s.pump)}          // every pump -> a hit
const TEMPO = ${zahl(s.tempo)}         // speed -> filter / loudness
const GLEITEN = ${zahl(s.gleiten)}       // glide -> pad swells, beat steps back
const SPRINT = ${zahl(s.sprint)}        // flying sprint -> lead line
const CARVE = ${zahl(s.carve)}         // carve -> sound moves left / right
const PULS = ${zahl(s.puls)}          // heart rate -> drums

// Volume per track (0..1)
const BASS = ${zahl(v.bass)}
const DRUMS = ${zahl(v.drums)}
const LEAD = ${zahl(v.lead)}
const FLAECHE = ${zahl(v.flaeche)}       // pad
const MASTER = ${PEGEL[m.stil]}        // overall volume

const D = daten()
const key = (octave) => ROOT + octave + ':' + SCALE
`;
  const daten = `
// ── Data from the run (generated) ────────────────────
// One cycle = one bar, bar 0 starts with the video. ${d.takte} bars.
// pump/akzent/muenze: steps on a 1/16 grid · tempo/gleiten/sprint/carve/herz: one value per beat (0..1)
// aktiv: 1 while the run is on (not in the lead-in / hold at the end)
function daten() {
  return {
    pump: ${folge(d.pump.map(schritte))},
    akzent: ${folge(d.akzent.map(schritte))},
    muenze: ${folge(d.muenze.map(schritte))},
    tempo: ${folge(d.tempo.map(werte))},
    gleiten: ${folge(d.gleiten.map(werte))},
    sprint: ${folge(d.sprint.map(werte))},
    carve: ${folge(d.carve.map(werte))},
    herz: ${folge(d.herz.map(werte))},
    aktiv: "<${d.aktiv.join(" ")}>",
  }
}

all((x) => x.postgain(MASTER))
setcps(BPM / 60 / 4)
`;
  return kopf + spuren(m.stil) + daten;
}

/** Link nach strudel.cc: der Code base64-kodiert hinter `#` (geht beim Laden nicht an deren Server). */
export function strudelLink(code: string): string {
  const bytes = new TextEncoder().encode(code);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return `https://strudel.cc/#${encodeURIComponent(btoa(bin))}`;
}
