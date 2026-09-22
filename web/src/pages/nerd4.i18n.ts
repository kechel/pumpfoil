// Inhalte für die Nerd-Analysen Teil 4 (Handy am Brett).
//
// NUR ENGLISCH, bewusst (Jan, 22.09.2026: „erstmal nur auf englisch"). Die Seite fällt für
// jede andere Sprache auf `en` zurück — das ist ehrlicher als eine maschinelle Übersetzung,
// die niemand gegengelesen hat, und die Struktur nimmt weitere Sprachen ohne Umbau auf.
// Rich-Markup in den Strings: **fett**, `code`, *kursiv*, [label](/pfad).
// Keine geraden Anführungszeichen (") in Strings — nur typografische.
import type { Lang } from "../i18n";

export interface N4 {
  back: string;
  h1: string;
  subtitle: string;
  intro: string;
  why: { h: string; p: string; p2: string; cap: string };
  what: { h: string; p: string; li: string[]; cap: string };
  mount: { h: string; p: string; p2: string; cap: string };
  heave: { h: string; p: string; p2: string; cap: string };
  found: { h: string; p: string; li: string[] };
  limits: { h: string; p: string; li: string[] };
  videorun: { h: string; p: string; cap: string };
  next: { h: string; p: string };
}

const en: N4 = {
  back: "← Part 3: The dual-watch measurement",
  h1: "Part 4: A phone taped to the board",
  subtitle: "What we can measure once the sensor stops riding on a wrist",
  intro:
    "Every number this site shows about pumping comes, in the end, from a sensor strapped to somebody's arm. That arm does its own thing: it swings, it braces, it reaches out for balance. For three parts of this series we worked around that. In September 2026 we stopped working around it and **taped a phone to the board** — GPS, accelerometer and gyroscope, 50 samples a second, bolted to the thing we actually want to know about. This part is what came out.",

  why: {
    h: "What the wrist can and cannot give",
    p:
      "The first surprise was a negative one, and it is worth stating plainly because we expected the opposite. We put the board recording next to a **Garmin on the wrist from the same ride, two minutes apart**, and compared what each sensor sees in the frequency domain. If the wrist were hopeless, the pump rhythm would be a smear there and a spike on the board.",
    p2:
      "It is a spike on **both**. Same peak, same 1.40 Hz, same height. The wrist finds the pumping cadence perfectly well — which is exactly why our pump counter works at all: on this ride the board recording counted **103 pumps** and the watch **106**, within three of each other. So the board is not needed to hear the rhythm. What it gives is something the wrist can never give: **the attitude of the board itself** — how far the nose dips, how far it rolls, how far the whole thing rises and falls. An arm cannot report that, no matter how good the sensor on it is.",
    cap: "Same ride, two sensors, 20 seconds of the longest run each. Both see 1.40 Hz.",
  },

  what: {
    h: "What a phone on the board records",
    p:
      "The phone writes the same upload format as every watch we support, plus one channel none of the watches have: **the gyroscope**. That extra channel is what makes the rest possible — a gyroscope measures rotation directly, without having to guess which part of a measured acceleration was gravity and which was movement. From the three raw streams we derive three angles and one distance:",
    li: [
      "**Pitch** — the nose going up and down. This *is* the pump stroke; everything else is secondary.",
      "**Roll** — the board leaning left and right. Carving, and the little corrections between strokes.",
      "**Yaw** — the heading change. Cross-checked against the GPS track, because both measure the same thing and must agree.",
      "**Heave** — how far the board actually rises and falls, in centimetres, from integrating the vertical acceleration twice.",
    ],
    cap: "One run, 28 seconds. The pitch trace is the pumping; the heave below it is the same rhythm, in centimetres.",
  },

  mount: {
    h: "The problem nobody warned us about: which way is the phone taped?",
    p:
      "A phone has no idea how it is stuck to a board. Tape it lengthwise and pitch is pitch. Tape it across and what the phone calls pitch is the board rolling. Tape it diagonally — which happened on the very first real ride — and a pure pitch oscillation shows up as **71 % pitch and 71 % roll at the same time**. Asking the rider to specify it works exactly until somebody re-tapes a wet phone with cold fingers.",
    p2:
      "So we let the data answer. Pumping is a rotation about the board’s transverse axis, and a gyroscope measures rotation directly. Rotate the measured signal through every possible mounting angle and ask where the pitch oscillation in the pump band (0.6–2.5 Hz) is strongest — that direction is the transverse axis. The picture below is that sweep for two rides: one phone taped across the board, one taped diagonally. Two rides, two clean peaks, no input from anyone. What the sweep cannot decide is nose-forward versus nose-backward, because that is the same axis; the first second of the run settles it, since a run starts with the nose dipping down.",
    cap: "Pitch energy in the pump band against the assumed mounting rotation. The peak is the answer.",
  },

  heave: {
    h: "Heave, and why the number needs a caveat",
    p:
      "How far does a board actually move up and down while you pump? Integrating acceleration twice gives an answer in centimetres, and it is the kind of number that looks authoritative and is quietly fragile. Anything slower than the band you keep gets amplified by the square of its period — a small drift at the low end comes out as metres of imaginary heave.",
    p2:
      "The levelling window sets that lower edge, and it is not a free parameter. Ask for the same run with a 1-second window and you get 18 cm; ask with 5 seconds and you get 33 cm, for the identical ride. We therefore derive the window from the **measured cadence** of that run — here 1.38 Hz, so 1.45 seconds — and we mark the number as unreliable whenever the motion sits too close to the edge. The honest reading of this chart is not *the heave is 20 cm*; it is *the heave is 20 cm when you define heave as the motion at pumping speed*.",
    cap: "The same run, the same data, six different levelling windows: 18 cm to 33 cm.",
  },

  found: {
    h: "What four rides have already told us",
    p:
      "This is a small pile of data — four board recordings — so these are observations, not laws. They are, however, the first numbers we have that describe the board rather than the rider.",
    li: [
      "**The mounting is found automatically and it is stable.** Across two runs of one ride the detected angle varied by 3°, which is computation noise, not the phone moving. Between rides it varied by exactly as much as the tape did.",
      "**Cadence is remarkably steady.** 1.38 and 1.39 Hz in two runs of one ride; 1.45 Hz on another. Pumping looks less like effort and more like a resonance somebody has found.",
      "**Heave is around 20 cm** at that cadence, measured bottom to top, with the caveat above.",
      "**Pitch swings about ±19°, roll about ±10°** in a clean run — the board is doing far more pitching than rolling, which is what the whole detection approach assumes and had never actually checked.",
    ],
  },

  limits: {
    h: "What this does not yet prove",
    p: "The list of things we cannot claim is longer than the list of things we can, and it should stay that way until the data grows:",
    li: [
      "**Four rides, one rider, one board, one lake.** Nothing here is validated across riders, and our pump counting is still calibrated on a single person — see [Part 3](/nerd-analysen-3) for how thin that ground is.",
      "**Glide detection still does not exist.** The number we show as longest glide is the longest gap between two *detected* pumps, which is not the same thing and never was.",
      "**Nobody rides with a phone taped to their board.** This is a measuring instrument, not a feature. Its job is to produce the truth that the watch on your wrist is measured against.",
    ],
  },

  videorun: {
    h: "The ride itself",
    p: "The explainer for this setup, filmed at the lake: what goes on the board, how it is fixed, and what comes back.",
    cap: "Phone on the board: GPS, gyroscope and acceleration, measured directly.",
  },

  next: {
    h: "Where this goes",
    p:
      "The point of a measuring instrument is to be pointed at something. The board data gives us, for the first time, a ground truth for two questions we have only ever estimated: **is this stroke a pump**, and **when did the board stop flying**. Both are counted on the wrist today and calibrated on one person. How that counting works is [Part 2](/nerd-analysen-2); how well it holds up against a second sensor is [Part 3](/nerd-analysen-3).",
  },
};

// Eine Sprache, absichtlich. Alle Sprachen zeigen `en`, bis jemand übersetzt und gegenliest.
export const NERD4: Partial<Record<Lang, N4>> = { en };
