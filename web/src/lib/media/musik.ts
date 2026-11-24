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
export type Spur = "bass" | "drums" | "grund" | "lead" | "flaeche";
// „grund" = das gleichmaessige Raster (Kick auf jedem Schlag). Jan 24.11.: der Beat kam auch in einem Lauf, in dem kaum
// Pumps erkannt wurden — deshalb schlaegt jetzt jeder Pump die Bassdrum, und das Raster ist nur noch leise darunter.
export const SPUREN: Spur[] = ["bass", "drums", "grund", "lead", "flaeche"];

/** Effekte, die auf einzelne Momente des Laufs reagieren (Jan 24.11.: „mehr kreativitaet erlauben bitte"). */
export type Fx = "sprintTempo" | "riser" | "carveMelodie" | "carveWhoosh" | "topSpeed" | "meter" | "kampf" | "start" | "ende";
export const FXS: Fx[] = ["sprintTempo", "riser", "carveMelodie", "carveWhoosh", "topSpeed", "meter", "kampf", "start", "ende"];

/** Instrument je Spur (Jan 24.11.2026). „auto" = Vorgabe des Stils, „synth" = eingebauter Klang, pf_* = Toene aus dem
 *  FluidR3-GM-Soundfont (MIT), erzeugt von scripts/media-klaenge.py nach /klaenge/. */
export type InstrSpur = "bass" | "lead" | "flaeche" | "drums";
export const INSTR_SPUREN: InstrSpur[] = ["bass", "lead", "flaeche", "drums"];
export const INSTRUMENTE: Record<InstrSpur, string[]> = {
  bass: ["synth", "pf_bass_finger", "pf_bass_upright", "pf_bass_synth", "pf_piano"],
  lead: ["synth", "pf_piano", "pf_epiano", "pf_guitar_nylon", "pf_guitar_steel", "pf_guitar_electric", "pf_violin",
    "pf_trumpet", "pf_flute", "pf_marimba", "pf_organ"],
  flaeche: ["synth", "pf_strings", "pf_organ", "pf_choir", "pf_pad_warm"],
  drums: ["synth", "akustik"],
};
const STIL_INSTR: Record<Stil, Record<InstrSpur, string>> = {
  techno: { bass: "synth", lead: "synth", flaeche: "synth", drums: "synth" },
  klavier: { bass: "pf_piano", lead: "pf_piano", flaeche: "pf_strings", drums: "synth" },
  gitarre: { bass: "pf_bass_finger", lead: "pf_guitar_nylon", flaeche: "pf_strings", drums: "akustik" },
  chiptune: { bass: "synth", lead: "synth", flaeche: "synth", drums: "synth" },
  ambient: { bass: "synth", lead: "pf_epiano", flaeche: "pf_pad_warm", drums: "synth" },
};
// Eingebaute Klaenge je Stil, wenn „synth" gewaehlt ist (oder es keine Samples gibt).
const SYNTH: Record<Stil, { bass: string; lead: string; flaeche: string }> = {
  techno: { bass: "sawtooth", lead: "supersaw", flaeche: "supersaw" },
  klavier: { bass: "triangle", lead: "triangle", flaeche: "sine" },
  gitarre: { bass: "triangle", lead: "sawtooth", flaeche: "sine" },
  chiptune: { bass: "triangle", lead: "square", flaeche: "pulse" },
  ambient: { bass: "sawtooth", lead: "sine", flaeche: "supersaw" },
};

/** Tatsaechliches Instrument einer Spur („synth", ein pf-Klang oder „akustik"); ohne Samples immer „synth". */
export function instrument(m: MusikCfg, sp: InstrSpur, klaengeDa: boolean): string {
  const w = m.instr?.[sp] ?? "auto";
  const v = w === "auto" ? STIL_INSTR[m.stil][sp] : w;
  return klaengeDa ? v : "synth";
}

export interface MusikCfg {
  an: boolean;
  stil: Stil;
  staerke: Record<Quelle, number>;   // 0 = aus, 1 = voll
  spur: Record<Spur, number>;        // Lautstaerke je Spur 0..1
  fx: Record<Fx, boolean>;
  instr: Record<InstrSpur, string>;
}

export const MUSIK_DEFAULT: MusikCfg = {
  an: false,
  stil: "techno",
  staerke: { pump: 1, tempo: 0.8, gleiten: 0.8, sprint: 1, carve: 0.7, puls: 0.5 },
  spur: { bass: 0.9, drums: 0.8, grund: 0.3, lead: 0.7, flaeche: 0.6 },
  instr: { bass: "auto", lead: "auto", flaeche: "auto", drums: "auto" },
  fx: { sprintTempo: true, riser: true, carveMelodie: true, carveWhoosh: true, topSpeed: true, meter: false, kampf: true, start: true, ende: true },
};

const BPM: Record<Stil, number> = { techno: 128, klavier: 92, gitarre: 104, chiptune: 140, ambient: 72 };
const SKALA: Record<Stil, string> = { techno: "minor", klavier: "major", gitarre: "major", chiptune: "major", ambient: "minor" };
const NAME: Record<Stil, string> = { techno: "Techno", klavier: "Piano", gitarre: "Guitar", chiptune: "8-bit", ambient: "Ambient" };
const TOENE = ["C", "D", "E", "F", "G", "A", "B"];
// Gesamtpegel je Stil (postgain), gemessen 24.11.2026 an einem 50-s-Lauf mit allen Effekten: alle Stile aehnlich laut, Spitze unter 1.
const PEGEL: Record<Stil, number> = { techno: 0.5, klavier: 0.7, gitarre: 0.55, chiptune: 0.8, ambient: 0.7 };

export function taktSekunden(stil: Stil): number { return 240 / BPM[stil]; }

/** Die Datenbasis: je Takt 16 Pump-Schritte bzw. 4 Werte je Schlag. */
export interface MusikDaten {
  takte: number;
  pump: boolean[][]; akzent: boolean[][]; muenze: boolean[][];
  riser: boolean[][]; carveStart: boolean[][]; top: boolean[][]; meter: boolean[][]; ende: boolean[][];
  carveNoten: (number | null)[][];   // je 1/16 waehrend eines Carves: Stufe der Tonleiter, steigt mit den Grad
  fill: number[][]; kampf: number[][];
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
  const riser = leer(16, false), carveStart = leer(16, false), top = leer(16, false), meter = leer(16, false), ende = leer(16, false);
  const carveNoten = leer<number | null>(16, null);
  clip.pumps.forEach((tp, i) => {
    setze(pump, zuVideo(tp));
    if ((i + 1) % 10 === 0) setze(muenze, zuVideo(tp));   // jeder 10. Pump (8-bit: Muenz-Ton)
  });
  const sprints = clip.sprints.filter((sp) => vcfg.sprints.includes(sp.kz));
  for (const sp of sprints) setze(akzent, zuVideo(sp.b));
  for (const c of clip.carves) if (c.rot >= 360) setze(akzent, zuVideo(c.a + ((c.b - c.a) * 360) / c.rot));
  // Anlauf vor dem Sprint: ein Takt Rauschen, das bis zum Beginn des Fensters ansteigt.
  for (const sp of sprints) setze(riser, zuVideo(sp.a) - takt);
  for (const c of clip.carves) {
    setze(carveStart, zuVideo(c.a));
    // Melodie im Carve: jede Achtel ein Ton, je 45° eine Stufe hoeher.
    const v0 = zuVideo(c.a), v1 = zuVideo(c.b);
    for (let tv = v0; tv <= v1; tv += schritt * 2) {
      const k = Math.round(tv / schritt);
      if (k < 0 || k >= takte * 16) continue;
      carveNoten[Math.floor(k / 16)][k % 16] = Math.round((c.rot * (tv - v0)) / Math.max(v1 - v0, 1e-3) / 45);
    }
  }
  // Hoechstes Tempo im Lauf, alle 50 m eine Marke, Laufende.
  let iTop = 0;
  clip.pts.forEach((p, i) => { if (p.v > clip.pts[iTop].v) iTop = i; });
  setze(top, zuVideo(clip.pts[iTop].t));
  let naechste = 50;
  for (const p of clip.pts) if (p.d >= naechste) { setze(meter, zuVideo(p.t)); naechste += 50; }
  setze(ende, laufEnde);

  const tempo = leer(4, 0), gleiten = leer(4, 0), sprint = leer(4, 0), carve = leer(4, 0.5), herz = leer(4, 0);
  const fill = leer(4, 0), kampf = leer(4, 0);
  // „Kampf": die Pumpfrequenz liegt deutlich ueber dem Ueblichen dieses Clips (man kaempft ums Obenbleiben).
  const phs = clip.pts.map((p) => p.ph).filter((x): x is number => x != null && x > 0).sort((a, b) => a - b);
  const phMitte = phs.length ? phs[Math.floor(phs.length / 2)] : 0;
  const aktiv = Array(takte).fill(0);
  for (let t = 0; t < takte; t++) {
    for (let b = 0; b < 4; b++) {
      const tv = t * takt + (b + 0.5) * schlag;
      if (tv >= vcfg.vor - 2 * schlag && tv < vcfg.vor) fill[t][b] = 1;   // zwei Schlaege Trommelwirbel vor dem Start
      if (tv < vcfg.vor || tv > laufEnde) continue;
      aktiv[t] = 1;
      const z = zustandBei(clip, vcfg, tv);
      tempo[t][b] = Math.min(1, Math.max(0, (z.v - clip.vLo) / Math.max(clip.vHi - clip.vLo, 1)));
      gleiten[t][b] = clip.glides.some(([a, e]) => z.ts >= a && z.ts <= e) ? 1 : 0;
      sprint[t][b] = sprints.some((sp) => z.ts >= sp.a && z.ts <= sp.b) ? 1 : 0;
      const c = clip.carves.find((cv) => z.ts >= cv.a && z.ts <= cv.b);
      carve[t][b] = c ? (c.dir === "L" ? 0.1 : 0.9) : 0.5;
      kampf[t][b] = phMitte > 0 && z.ph != null && z.ph > phMitte * 1.25 ? 1 : 0;
      herz[t][b] = z.hr != null && clip.hatPuls ? Math.min(1, Math.max(0, (z.hr - clip.hrLo) / Math.max(clip.hrHi - clip.hrLo, 1))) : 0;
    }
  }
  return { takte, pump, akzent, muenze, riser, carveStart, top, meter, ende, carveNoten, fill, kampf,
    tempo, gleiten, sprint, carve, herz, aktiv };
}

const zahl = (x: number) => String(Number(x.toFixed(1)));
/** Schritte eines Takts als Mini-Notation; ein leerer Takt ist eine einzige Pause. */
const schritte = (zeile: boolean[]) => zeile.some(Boolean) ? `[${zeile.map((x) => (x ? "x" : "~")).join(" ")}]` : "~";
const noten = (zeile: (number | null)[]) => zeile.some((x) => x != null) ? `[${zeile.map((x) => (x == null ? "~" : String(x))).join(" ")}]` : "~";
const werte = (zeile: number[]) => zeile.every((v) => v === zeile[0]) ? zahl(zeile[0]) : `[${zeile.map(zahl).join(" ")}]`;
const folge = (teile: string[]) => "`<\n      " + teile.join("\n      ") + "\n    >`";   // Backticks: Mini-Notation ueber mehrere Zeilen

function spuren(stil: Stil): string {
  // Gemeinsame Bausteine: Pan folgt dem Carve, „ohneGleiten" duckt eine Spur in Gleitphasen.
  const pan = ".pan(D.carve.sub(.5).mul(CARVE).add(.5))";
  const ohneGleiten = "D.gleiten.mul(-GLEITEN).add(1)";
  switch (stil) {
    case "techno": return `
// ── Tracks ───────────────────────────────────────────
// Steady kick on every beat (quiet, see GRUND) — the real beat comes from your pumps below
kick: s(KICK).fast(4).mask(D.aktiv).decay(.45).gain(DRUMS * GRUND)

// Acid bass: one hit per pump; speed opens the filter; drops out while gliding
bass: n("<0 0 5 3>").struct(D.pump).scale(key(2)).s(BASS_SOUND)
  .lpf(D.tempo.mul(TEMPO).range(250, 3800)).lpq(12).decay(.16).sustain(0)
  .gain(${ohneGleiten}.mul(BASS * PUMP))${pan}

// Hi-hats get louder with speed and heart rate
hats: s(HAT).fast(16).mask(D.aktiv).hpf(8500).decay(.03).sustain(0)
  .gain(D.tempo.mul(TEMPO).add(D.herz.mul(PULS)).mul(.3 * DRUMS))

// Lead arpeggio only inside the flying sprint
lead: n("0 2 4 7 9 7 4 2".fast(2)).mask(D.sprint).scale(key(4)).s(LEAD_SOUND).lpf(3000).decay(.12).sustain(.15)
  .gain(SPRINT * LEAD * .5).room(.3)${pan}

// Pad swells while gliding
pad: n("<[0,2,4] [0,2,5] [-2,0,3] [-1,1,3]>").mask(D.aktiv).scale(key(3)).s(PAD_SOUND).attack(.4).release(1.5).lpf(1000)
  .gain(D.gleiten.mul(GLEITEN).add(.2).mul(FLAECHE * .45)).room(.6)

// Crash at the end of a sprint and when a carve passes 360°
crash: s(CRASH).struct(D.akzent).hpf(2500).decay(1.4).sustain(0).gain(.45 * DRUMS).room(.4)
`;
    case "klavier": return `
// ── Tracks ───────────────────────────────────────────
// Left hand: a low note on every pump, quieter while gliding
bass: n("<0 -2 -3 -1>").struct(D.pump).scale(key(2)).s(BASS_SOUND).fm(1).decay(1).sustain(.1).release(.6)
  .gain(${ohneGleiten}.mul(BASS * PUMP * .8))${pan}

// Right hand: arpeggio, louder the faster you go
arp: n("0 2 4 7 9 7 4 2").mask(D.aktiv).scale(key(4)).s(LEAD_SOUND).fm(2.5).decay(.45).sustain(0)
  .gain(D.tempo.mul(TEMPO).mul(LEAD * .5))${pan}

// Flying sprint: the arpeggio doubles and jumps an octave up
sprint: n("0 2 4 7 9 11 9 7 4 2 0 2 4 7 9 11").mask(D.sprint).scale(key(5)).s(LEAD_SOUND).fm(3).decay(.25).sustain(0)
  .gain(SPRINT * LEAD * .45).room(.4)${pan}

// Glide: soft sustained chord
pad: n("<[0,2,4,6] [-2,0,2,4] [-3,-1,1,3] [-1,1,3,5]>").mask(D.aktiv).scale(key(3)).s(PAD_SOUND).attack(.6).release(2)
  .gain(D.gleiten.mul(GLEITEN).add(.1).mul(FLAECHE * .5)).room(.8)

// Heartbeat: soft double kick, follows the heart rate
herz: s(KICK).struct("[x x] ~ ~ ~").mask(D.aktiv).decay(.25).gain(D.herz.mul(PULS).mul(DRUMS * .6))

// Bell at the end of a sprint and after a 360° carve
bell: n("[7,11]").struct(D.akzent).scale(key(5)).s("sine").fm(6).decay(2).sustain(0).gain(.5).room(.6)
`;
    case "gitarre": return `
// ── Tracks ───────────────────────────────────────────
// Strummed chord on every pump; speed brightens it
gtr: n("<[0,2,4,7] [-3,0,2,4] [-2,0,3,5] [-1,1,3,5]>").struct(D.pump).scale(key(3)).s(LEAD_SOUND)
  .lpf(D.tempo.mul(TEMPO).range(700, 2600)).decay(.5).sustain(0).release(.3)
  .gain(${ohneGleiten}.mul(PUMP * LEAD * .55))${pan}

// Bass: root note on the pumps
bass: n("<0 -3 -2 -1>").struct(D.pump).scale(key(2)).s(BASS_SOUND).decay(.4).sustain(0)
  .gain(${ohneGleiten}.mul(BASS * PUMP))

// Drums: kick and a noise snare, snare louder with speed
kick: s(KICK).struct("x ~ [~ x] ~").mask(D.aktiv).decay(.35).gain(DRUMS * GRUND)
snare: s(SNARE).struct("~ x ~ x").mask(D.aktiv).bpf(1800).decay(.12).sustain(0)
  .gain(D.tempo.mul(TEMPO).add(.4).mul(DRUMS * .5))

// Sprint: square-wave solo line
solo: n("0 2 4 5 7 5 4 2").mask(D.sprint).scale(key(4)).s(LEAD_SOUND).lpf(2200).decay(.15).sustain(.2)
  .gain(SPRINT * LEAD * .35).room(.3)${pan}

// Glide: open sustained chord
pad: n("<[0,4,7] [-3,0,4] [-2,2,5] [-1,3,5]>").mask(D.gleiten).scale(key(3)).s(PAD_SOUND).attack(.5).release(1.8)
  .gain(GLEITEN * FLAECHE * .5).room(.7)
`;
    case "chiptune": return `
// ── Tracks ───────────────────────────────────────────
// Triangle bass on every pump
bass: n("<0 0 3 4>").struct(D.pump).scale(key(2)).s(BASS_SOUND).decay(.15).sustain(0)
  .gain(${ohneGleiten}.mul(BASS * PUMP))

// Square melody, louder the faster you go
melody: n("<[0 2 4 2 0 4 7 4] [3 5 7 5 3 7 9 7]>").mask(D.aktiv).scale(key(4)).s(LEAD_SOUND).decay(.1).sustain(.3).lpf(4000)
  .gain(D.tempo.mul(TEMPO).mul(LEAD * .3))${pan}

// Coin sound on every 10th pump
coin: n("[9 14]").struct(D.muenze).scale(key(5)).s("square").decay(.08).sustain(0).gain(.35)

// Noise drums
drums: s(HAT).struct("x ~ x x").mask(D.aktiv).hpf(3000).decay(.05).sustain(0).gain(DRUMS * GRUND * .6)

// Sprint: fast arpeggio
sprint: n("0 4 7 11".fast(4)).mask(D.sprint).scale(key(5)).s(LEAD_SOUND).decay(.05).sustain(.2)
  .gain(SPRINT * LEAD * .3)${pan}

// Glide: held pulse chord
pad: n("<[0,2,4] [3,5,7]>").mask(D.gleiten).scale(key(3)).s(PAD_SOUND).attack(.2).release(1)
  .gain(GLEITEN * FLAECHE * .3)

// Fanfare at the end of a sprint and after a 360° carve
fanfare: n("[0 4 7 11]").struct(D.akzent).scale(key(5)).s("square").decay(.4).sustain(0).gain(.35)
`;
    case "ambient": return `
// ── Tracks ───────────────────────────────────────────
// Soft pluck on every pump, long reverb
pluck: n("<0 2 4 2>").struct(D.pump).scale(key(4)).s(LEAD_SOUND).fm(1.5).decay(.8).sustain(0)
  .lpf(D.tempo.mul(TEMPO).range(600, 3000)).gain(PUMP * LEAD * .45).room(.9)${pan}

// Deep drone, a bit brighter with speed
drone: n("<[0,4] [-2,2]>/2").mask(D.aktiv).scale(key(2)).s(BASS_SOUND).lpf(D.tempo.mul(TEMPO).range(200, 700)).attack(1).release(3)
  .gain(BASS * .35)

// Glide: wide pad swells up
pad: n("<[0,2,4,6] [-1,1,3,5]>/2").mask(D.aktiv).scale(key(3)).s(PAD_SOUND).attack(1.2).release(3).lpf(1400)
  .gain(D.gleiten.mul(GLEITEN).add(.15).mul(FLAECHE * .4)).room(1)

// Heartbeat pulse
herz: s(KICK).struct("x ~ ~ ~").mask(D.aktiv).decay(.3).gain(D.herz.mul(PULS).mul(DRUMS * .5))

// Sprint: shimmering high line
shimmer: n("0 4 7 11 14 11 7 4").mask(D.sprint).scale(key(5)).s(LEAD_SOUND).fm(4).decay(.3).sustain(0)
  .gain(SPRINT * LEAD * .35).room(1)${pan}
`;
  }
}

// Klang der Effekt-Stimmen je Stil (Carve-Melodie, Meter-Glocke) — passend zur Lead-Stimme des Stils.
const FX_KLANG: Record<Stil, string> = {
  techno: 's("supersaw").lpf(2800)', klavier: 's("triangle").fm(2.5)', gitarre: 's("square").lpf(2400)',
  chiptune: 's("square")', ambient: 's("sine").fm(4)',
};
// Pump-Kick je Stil: hart bei Techno/Gitarre/8-bit, weich bei Klavier/Ambient.
const PUMPKICK: Record<Stil, string> = {
  techno: '.decay(.4)', gitarre: '.decay(.35)', chiptune: '.decay(.25)', klavier: '.decay(.25).lpf(900)', ambient: '.decay(.3).lpf(700)',
};

function effekte(stil: Stil, fx: Record<Fx, boolean>): string {
  const pan = ".pan(D.carve.sub(.5).mul(CARVE).add(.5))";
  const z: string[] = [`
// ── Your pumps are the beat ──────────────────────────
// Every detected pump hits the bass drum (louder with PUMP)
pumpkick: s(KICK).struct(D.pump)${PUMPKICK[stil]}.gain(DRUMS * PUMP)
`, `
// ── Effects: moments of the run ──────────────────────`];
  if (fx.sprintTempo) z.push(`// Flying sprint: double-time drums
sprintkick: s(KICK).fast(8).mask(D.sprint).decay(.15).gain(DRUMS * SPRINT * .5)
sprinthats: s(HAT).fast(16).mask(D.sprint).hpf(9000).decay(.03).sustain(0).gain(DRUMS * SPRINT * .3)`);
  if (fx.riser) z.push(`// Run-up: noise rises during the bar before the sprint window
riser: s("white").struct(D.riser).clip(16).attack(1.6).release(.05).hpf(1200).gain(.35 * SPRINT).room(.4)`);
  if (fx.carveMelodie) z.push(`// Carve: a melody climbs one step per 45° of the turn
carvemelody: n(D.carveNoten).scale(key(4)).${FX_KLANG[stil]}.decay(.2).sustain(.1)
  .gain(CARVE * LEAD * .55).room(.3)${pan}`);
  if (fx.carveWhoosh) z.push(`// Carve: a whoosh sweeps across at the start of the turn
whoosh: s("pink").struct(D.carveStart).clip(8).attack(.25).release(.6).bpf(1600).gain(.3 * CARVE)${pan}`);
  if (fx.topSpeed) z.push(`// Top speed of the run: impact + crash
impact: s(KICK).struct(D.top).decay(1.2).gain(.45 * DRUMS)
crashtop: s(CRASH).struct(D.top).hpf(2500).decay(1.8).sustain(0).gain(.4 * DRUMS).room(.5)`);
  if (fx.meter) z.push(`// Every 50 m: a little bell
meterbell: n("[7,11]").struct(D.meter).scale(key(5)).${FX_KLANG[stil]}.decay(1).sustain(0).gain(.35).room(.5)`);
  if (fx.kampf) z.push(`// Fighting to stay up (pump rate well above usual): snare roll
kampf: s(SNARE).fast(16).mask(D.kampf).bpf(2200).decay(.05).sustain(0).gain(DRUMS * PUMP * .25)`);
  if (fx.start) z.push(`// Two beats of drum roll before the run starts
fill: s(SNARE).fast(8).mask(D.fill).bpf(1800).decay(.06).sustain(0).gain(DRUMS * .35)`);
  if (fx.ende) z.push(`// End of the run: a falling dive
dive: s("sine").struct(D.ende).note("c5").penv(-36).pdecay(1.2).decay(1.4).sustain(0).gain(.25).room(.6)`);
  return z.join("\n") + "\n";
}

export interface CodeInfo {
  sessionId: number | string; lauf: string;
  klangUrl: string | null;   // absolute Adresse von /klaenge/strudel.json, null = keine Samples verfuegbar
}

function instrKopf(m: MusikCfg, info: CodeInfo): string {
  const da = !!info.klangUrl;
  const ins = (sp: InstrSpur) => instrument(m, sp, da);
  const ton = (sp: "bass" | "lead" | "flaeche") => (ins(sp) === "synth" ? SYNTH[m.stil][sp] : ins(sp));
  const akustik = ins("drums") === "akustik";
  const braucht = da && INSTR_SPUREN.some((sp) => ins(sp) !== "synth");
  return `
// Instruments: built-in synths, or pf_* = notes rendered from the FluidR3 GM SoundFont (MIT, pumpfoil.org/klaenge)
${braucht ? `samples('${info.klangUrl}', '${info.klangUrl!.replace(/strudel\.json$/, "")}')\n` : ""}const BASS_SOUND = '${ton("bass")}'
const LEAD_SOUND = '${ton("lead")}'
const PAD_SOUND = '${ton("flaeche")}'
const KICK = '${akustik ? "pf_kick" : "sbd"}', SNARE = '${akustik ? "pf_snare" : "pink"}', HAT = '${akustik ? "pf_hat" : "white"}', CRASH = '${akustik ? "pf_crash" : "white"}'`;
}

/** Den kompletten Strudel-Code bauen. */
export function strudelCode(clip: Clip, vcfg: MediaCfg, m: MusikCfg, info: CodeInfo): string {
  const d = musikDaten(clip, vcfg, m.stil);
  const ton = TOENE[Math.abs(Number(info.sessionId) || 0) % TOENE.length];
  const s = m.staerke, v = m.spur;
  const kopf = `// Pumpfoil run as music — made on pumpfoil.org (Media view)
// ${info.lauf} · style ${NAME[m.stil]} · video ${videoDauer(clip, vcfg).toFixed(1)} s
// The rough settings are at the top, the data of the run is at the very bottom.
// Change a value and press Ctrl+Enter to hear it.

// ── Rough settings ───────────────────────────────────
const BPM = ${BPM[m.stil]}          // tempo in beats per minute (fixed per style)
const ROOT = '${ton}'          // key (picked per session)
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
const GRUND = ${zahl(v.grund)}         // steady beat under your pumps (0 = only your pumps)
const MASTER = ${PEGEL[m.stil]}        // overall volume

${instrKopf(m, info)}
const D = daten()
const key = (octave) => ROOT + octave + ':' + SCALE
`;
  const daten = `
// ── Data from the run (generated) ────────────────────
// One cycle = one bar, bar 0 starts with the video. ${d.takte} bars.
// pump/akzent/muenze/riser/carveStart/top/meter/ende: events on a 1/16 grid · carveNoten: scale step per 1/16
// tempo/gleiten/sprint/carve/herz/fill/kampf: one value per beat (0..1)
// aktiv: 1 while the run is on (not in the lead-in / hold at the end)
function daten() {
  return {
    pump: ${folge(d.pump.map(schritte))},
    akzent: ${folge(d.akzent.map(schritte))},
    muenze: ${folge(d.muenze.map(schritte))},
    riser: ${folge(d.riser.map(schritte))},
    carveStart: ${folge(d.carveStart.map(schritte))},
    carveNoten: ${folge(d.carveNoten.map(noten))},
    top: ${folge(d.top.map(schritte))},
    meter: ${folge(d.meter.map(schritte))},
    ende: ${folge(d.ende.map(schritte))},
    fill: ${folge(d.fill.map(werte))},
    kampf: ${folge(d.kampf.map(werte))},
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
  return kopf + spuren(m.stil) + effekte(m.stil, m.fx) + daten;
}

/** Link nach strudel.cc: der Code base64-kodiert hinter `#` (geht beim Laden nicht an deren Server). */
export function strudelLink(code: string): string {
  const bytes = new TextEncoder().encode(code);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return `https://strudel.cc/#${encodeURIComponent(btoa(bin))}`;
}
