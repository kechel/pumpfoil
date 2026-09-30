// Inhalte für die Nerd-Analysen Teil 5 (die neue On-Foil-Erkennung).
//
// NUR ENGLISCH, bewusst (Jan, 30.09.2026: „erstmal nur in einer sprache"). Die Seite fällt für
// jede andere Sprache auf `en` zurück; die Struktur nimmt weitere Sprachen ohne Umbau auf.
// Rich-Markup in den Strings: **fett**, `code`, *kursiv*, [label](/pfad).
// Keine geraden Anführungszeichen (") in Strings — nur typografische.
//
// INHALTSREGELN: keine Namen und keine Session-Nummern anderer Fahrer (öffentliche Seite); die
// Wahrheiten sind die eigenen (Handy am Brett, Kartenprüfung, von Fahrern aussortierte Bereiche,
// Gehen/Auto) — s. Messaging-Regel der Nerd-Seiten. Zahlen aus docs/DETECTION-V3.md (30.09.2026).
import type { Lang } from "../i18n";

export interface N5 {
  back: string;
  h1: string;
  subtitle: string;
  intro: string;
  problem: { h: string; p: string; li: string[] };
  truth: { h: string; p: string; li: string[]; p2: string };
  features: { h: string; p: string; li: string[] };
  honest: { h: string; p: string; p2: string; cap: string };
  pipeline: { h: string; p: string; li: string[]; p2: string };
  watch: { h: string; p: string; cap1: string; p2: string; cap2: string; p3: string };
  result: { h: string; p: string; cap: string; li: string[] };
  failed: { h: string; p: string; li: string[] };
  status: { h: string; p: string };
  help: { h: string; p: string; li: string[]; p2: string };
}

const en: N5 = {
  back: "← Part 4: A phone taped to the board",
  h1: "Part 5: Detection model",
  subtitle: "A new on-foil detection, built from everything riders have told us — and where it still needs you",
  intro:
    "Everything this site counts — runs, foiling time, distance, pumps, records — starts with one decision per second: **is this person on the foil right now?** Get that wrong and every number after it is wrong too. The detection that runs today works well for most sessions, but over the last weeks riders showed us exactly where it breaks. This part is the story of rebuilding that decision from scratch, measured against every piece of truth we have, and it ends with a request: we need more sessions recorded with a watch on the wrist **and** a phone on the board at the same time.",

  problem: {
    h: "Where the old detection goes wrong",
    p:
      "The current detection combines speed limits (a run starts above one speed and ends below another) with a trained model that looks at the wrist movement. Three kinds of mistakes kept coming up:",
    li: [
      "**Runs on land.** A few seconds of brisk walking along the shore, carrying the board back to the jetty, a jog to the car — at the right speed with the arm swinging, that can pass as a run. One loop around a parking lot at 30 km/h even ended up in the speed records.",
      "**Runs next to a car drive.** Forget to stop the recording, drive home, and the first seconds of the drive can look like a run.",
      "**Slow pumpers cut short.** One rider who pumps slowly and steadily told us his runs were missing almost half. He was right: he keeps pumping at 5–10 km/h after the point where the old speed limit ends the run.",
    ],
  },

  truth: {
    h: "What we can check against",
    p:
      "A detection is only as good as what you measure it against, and the tempting shortcut — measuring the new detection against the old one — only teaches you to copy the old mistakes. So we collected every independent piece of truth we could find:",
    li: [
      "**The phone on the board** ([Part 4](/nerd-analysen-4)). Recorded at the same time as a watch on the wrist, it says second by second whether the board was being pumped — no guessing from the arm. Six rides qualify so far, two riders, about 2.5 hours.",
      "**Runs checked on the map.** Every run that lies mostly more than 60 m from water got looked at on a map: 49 recordings with runs clearly on land, 22 on narrow water that the water map misses (canals, rivers, a pool).",
      "**What riders removed themselves.** Stretches that riders took out of their own sessions — 234 minutes of it — are about as honest a label as it gets.",
      "**Recordings without any pumpfoiling.** Walks and car drives recorded with a watch, on purpose or by accident.",
      "**A rider’s own account.** The slow pumper above: we used all his runs, including the slow parts after the old cut-off, as examples of real pumping.",
    ],
    p2:
      "Every result below is measured on riders the model **never saw during training**. Five times over, one fifth of the riders is held out, the model learns from the rest, and it is judged only on the ones it has not met. Otherwise a model simply learns the people, and the numbers lie.",
  },

  features: {
    h: "What the model gets to see",
    p:
      "The old model looked at 14 numbers per second, mostly about the size of the wrist movement. The new one sees 42. The ones that mattered most:",
    li: [
      "**The three axes against gravity, separately.** The old model only saw the total size of the movement, which throws away its direction. Pumping moves the wrist up and down; balancing, walking and steering move it sideways. Split against gravity, those stop looking alike.",
      "**The rhythm.** How much of the movement sits in the pumping band (0.8–2.2 Hz), how much in the walking band (2.2–3.5 Hz), how much is vibration (5–12 Hz, road and engine), and how spiky it is.",
      "**The minute around.** The highest speed within ±60 s, and how much of that minute was faster than 40 km/h. A run right next to a car drive is suspicious by context alone.",
      "**Speed trend.** Speed rising while the arm is calm means something is still driving the board — often the legs.",
      "**How the watch is held** — more on that below, because that idea came from a rider looking at one session.",
    ],
  },

  honest: {
    h: "Not letting the model copy the old rules",
    p:
      "The biggest pile of training examples is the runs the old detection found. That is useful — most of them are real — but it carries a trap: the old run edges come from speed limits, so a model trained on them learns those speed limits back. The slow pumper made the trap visible: a model that never saw him found only a quarter of his slow pumping.",
    p2:
      "So the three seconds at the start and end of every old run no longer count as examples at all, and the independent truths (board phone, map check, riders’ own removals, the walking and driving recordings) count several times as much as a run the old detection happened to find. And then we asked whether more data would help. It would not: the model trained on 4 riders is already close, and from about **64 riders** on it does not get better at all. More sessions of the same kind are not what is missing — better truth is.",
    cap: "Learning curve: trained on 1 to 258 riders, always tested on riders it had never seen.",
  },

  pipeline: {
    h: "From a probability to runs",
    p:
      "The model gives a probability per second. Turning that into runs turned out to matter as much as the model itself. The first idea — simply use the model instead of the speed limits — produced thousands of tiny extra runs that the other truths did not confirm. What works is a chain of small, checkable steps:",
    li: [
      "**Start generous.** Take the runs the old detection finds *and* the runs found with almost no speed limit at all. Together they contain every run that could possibly be one.",
      "**Cut into confident pieces.** Split each candidate where the model is unsure, bridging short dips of a few seconds.",
      "**Judge each piece.** A piece whose average probability is too low is dropped.",
      "**Be strict with the very short ones.** A piece under 8 seconds only stays when the model is clearly sure — most short pieces are the leftovers of a walk along the shore.",
    ],
    p2:
      "The order matters more than you would think. Judging whole candidates first and cutting afterwards threw real runs away whenever a walk and a ride had merged into one long stretch; cutting first and judging each piece keeps them. And the **sensitivity setting in your profile** keeps its meaning: instead of loosening speed limits, it now makes the model thresholds more or less strict.",
  },

  watch: {
    h: "How the watch sits — an idea from the beach",
    p:
      "Looking at one session with several doubtful runs by a jetty, Jan had a hunch: *when you are on the foil, the watch sits the same way the whole time; when you walk, it does not.* We measured it across every recording where we know the answer. Compared with the same rider’s other safe runs of that session, the watch in a real run sits within **5°** of how it sat before (median). Walking and carrying on land: **72°**. Runs on land: **75°**. The phone-on-board rides confirm it independently: 3–7° while riding, 39–91° while walking to the car.",
    cap1: "The angle of the watch compared with the same rider’s other runs in that session.",
    p2:
      "The second half of the idea — walking is restless, a car is extreme — turned out the other way round, which is the fun part of measuring. Over ten seconds, walking and sitting in a car are **perfectly steady**: the arm hangs, the hands rest on the wheel. What sets a run apart is that the watch is steady in its main direction **and** keeps turning around it: about **29° per second** from the wrist rotating with every pump, against 7° per second walking or driving.",
    cap2: "Left: steadiness alone separates nothing. Right: steady and turning at the same time is what a run looks like.",
    p3:
      "Why not make it a hard rule? We tried. Riders differ too much: one pumps with a rock-steady wrist, another — with short runs — looks, by this measure, almost like somebody walking, and riders who switch stance mid-session hold the watch differently in every other run. As a rule it threw away real rides that the board phone had confirmed. As **three extra inputs for the model** it helps, and that is where it stays.",
  },

  result: {
    h: "What changes",
    p:
      "Measured over 2,648 recordings with motion data, every rider held out as described above:",
    cap: "Runs that should not be counted — old detection against new.",
    li: [
      "**Runs on land** (map check): 81 of 82 still counted → **19**. Several of the rest are GPS errors by the shore where the arm is clearly pumping, so zero is not the right target.",
      "**Short runs next to a car drive:** 25 → **1**.",
      "**Runs inside stretches riders had removed:** 73 → **24**.",
      "**Against the phone on the board:** of the seconds the watch calls on-foil, 87.2 % were → **92.2 %**. Of the seconds really on the foil it finds 93 % (before: 95 %) — a little of that is the price of cutting doubtful run edges.",
      "**The slow pumper:** 22 → **26 minutes**, and that is without the model ever having seen him.",
      "**Records:** the parking-lot loop disappears from the speed records, a run on the road next to a river from the distance and duration records.",
    ],
  },

  failed: {
    h: "What did not work",
    p: "Part of doing this honestly is writing down the dead ends:",
    li: [
      "**The model on its own, instead of the speed limits:** thousands of extra micro-runs, most of them not confirmed.",
      "**A bigger model** (twice the trees, twice the leaves): no better at all.",
      "**Cleaning the training data with the water map:** fewer land runs, but a harbour the map does not know as water cost the slow pumper his examples.",
      "**Hard rules on how the watch is held:** they catch walks, and real rides with them.",
      "**Recognising glides:** the board-phone rides contain only 31 seconds of real gliding — the riders pumped almost all the time. Not measurable yet.",
    ],
  },

  status: {
    h: "Where this stands",
    p:
      "Nothing of this is live yet. Before it is, it runs as a full regression test over every recording — the complete analysis, pumps, records and all, computed next to the stored results without changing any of them — and every difference gets looked at. When it does go live, every run will carry whether it was removed **by you** or **by the detection**, and a run you decided about yourself will never be overruled by a later model.",
  },

  help: {
    h: "How you can help: watch and phone together",
    p:
      "The single most valuable thing for the next step is not more sessions — it is **more sessions recorded twice at once**: the watch on your wrist as always, and a phone strapped to the board recording the same ride ([Part 4](/nerd-analysen-4) shows the setup; it is one strap and a dry bag). Every such ride gives us, second by second, what the board was really doing — and today that truth comes from two riders only. Especially useful:",
    li: [
      "**Riders who pump differently** — slow and steady, with the legs, with a calm arm. Those are exactly the styles the detection sees least.",
      "**Glides.** Rides where you pump up and then glide for a few seconds before pumping again. We have almost none.",
      "**Everything around the ride.** Walking to the water, paddling out, standing at the jetty, carrying the board back — leave the recording running.",
      "**Other watches.** Every watch model moves a little differently on the wrist.",
    ],
    p2:
      "To record with the phone, switch on the phone recorder in your profile, start it on the phone and on the watch before you get on the board, and stop both afterwards. Both recordings show up in your sessions as usual; we line them up by time, so there is nothing else to do.",
  },
};

export const NERD5: Partial<Record<Lang, N5>> = { en };
