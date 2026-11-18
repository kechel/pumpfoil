import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ZurueckPfeil } from "../components/ZurueckPfeil";
import { ScrollToTop } from "../components/ScrollToTop";

// Erklaerseite zu den fliegenden Sprints (server/app/analysis/sprint.py, Team-Wertung teams.team_wertung).
// Jan, 09.11.2026: „erstelle vielleicht eine erklaerseite auf der das erklaert wird wie der algorithmus funktioniert, als
// neuen nerd-artikel oder so, dann koennen wir auch darauf verweisen und oeffentlich transparent machen fuer jeden was
// genau wie bewertet und berechnet wird". Erst nur fuer Admins, am 09.11.2026 von Jan oeffentlich gemacht (nur Englisch,
// Textseite wie die Nerd-Teile: ohne Login lesbar). Zahlen aus der Messung vom
// 09.11. (docs/TODO.md „Schnellste 100 m …"), nur zusammengefasst, keine Fahrer. Wenn die Konstanten in sprint.py sich
// aendern, diese Seite mitziehen. 17.11.2026 (Jan: „nerd-artikel updaten mit den neuen erkenntnissen fuer volle
// transparenz"): Obergrenze je Sportart (VERSION 6), Messgenauigkeit (Uhren-Paare, je Uhrenmodell, GNSS-Stufe) und der
// 5-%-Test am Event-Wochenende — Zahlen aus docs/TODO.md Abschnitt C1/C2, nur zusammengefasst, keine Fahrer.
// 18.11.2026 (Jan: „bessere uebersicht der resultate und begruendungen … inkl. schaubild … V7a"): Abschnitt V7 (nicht live,
// Trockenlauf), Zahlen aus docs/TODO.md C2 / scripts/sprint-genauigkeit/. Geht V7 live: Status-Satz + Stichtag nachziehen.

function H({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 mt-10 border-b border-slate-800 pb-1 text-lg font-bold text-slate-100">{children}</h2>;
}
function P({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-sm leading-relaxed text-slate-300">{children}</p>;
}
function C({ children }: { children: ReactNode }) {
  return <code className="rounded bg-slate-800/70 px-1 py-0.5 text-[0.85em] text-brand-600 dark:text-brand-300">{children}</code>;
}

/** Schema: Tempo ueber einen Lauf, das schnellste 60-s-Fenster hervorgehoben, eine Luecke, die kein Fenster ueberspannt. */
function Schema() {
  // Tempokurve (km/h) ueber 0..150 s, bei 95..101 s eine Luecke (Uhr unter Wasser).
  const pts: [number, number][] = [];
  for (let s = 0; s <= 150; s += 2) {
    if (s > 94 && s < 102) continue;
    const v = 13 + 3.2 * Math.sin(s / 11) + 2.4 * Math.exp(-((s - 52) ** 2) / 380) + 0.7 * Math.sin(s * 1.7);
    pts.push([s, v]);
  }
  const x = (s: number) => 40 + s * 3.6;
  const y = (v: number) => 170 - (v - 8) * 12;
  const linie = (a: [number, number][]) => a.map(([s, v], i) => `${i ? "L" : "M"}${x(s).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const vor = pts.filter(([s]) => s <= 94), nach = pts.filter(([s]) => s >= 102);
  return (
    <figure className="mt-4">
      <svg viewBox="0 0 600 210" className="w-full text-slate-400" role="img"
        aria-label="Speed during one run. The fastest 60-second window is highlighted; a short GPS gap splits the run.">
        <rect x={x(24)} y={20} width={60 * 3.6} height={150} className="fill-brand-500/15" />
        <text x={x(54)} y={34} textAnchor="middle" className="fill-brand-600 text-[12px] font-semibold dark:fill-brand-300">fastest 60 s</text>
        <rect x={x(94)} y={20} width={8 * 3.6} height={150} className="fill-amber-500/15" />
        <text x={x(98)} y={34} textAnchor="middle" className="fill-amber-700 text-[11px] dark:fill-amber-300">gap</text>
        <line x1={40} y1={170} x2={590} y2={170} stroke="currentColor" strokeWidth={1} />
        <line x1={40} y1={20} x2={40} y2={170} stroke="currentColor" strokeWidth={1} />
        {[10, 14, 18].map((v) => (
          <g key={v}>
            <line x1={36} y1={y(v)} x2={40} y2={y(v)} stroke="currentColor" />
            <text x={32} y={y(v) + 4} textAnchor="end" className="fill-current text-[11px]">{v}</text>
          </g>
        ))}
        {[0, 30, 60, 90, 120, 150].map((s) => (
          <text key={s} x={x(s)} y={186} textAnchor="middle" className="fill-current text-[11px]">{s} s</text>
        ))}
        <text x={14} y={14} className="fill-current text-[11px]">km/h</text>
        <path d={linie(vor)} fill="none" strokeWidth={2} className="stroke-brand-500" />
        <path d={linie(nach)} fill="none" strokeWidth={2} className="stroke-brand-500" />
      </svg>
      <figcaption className="text-xs text-slate-400">Schematic, not a real run. The window slides over every start point of the
        run; it may start and end anywhere, but it may not span the gap.</figcaption>
    </figure>
  );
}

/** Kasten im V7-Ablauf. */
function Kasten({ children, ton = "neutral" }: { children: ReactNode; ton?: "neutral" | "brand" | "amber" }) {
  const farbe = ton === "brand" ? "border-brand-500/60 bg-brand-500/10" : ton === "amber" ? "border-amber-500/60 bg-amber-500/10"
    : "border-slate-700 bg-slate-800/40";
  return <div className={`rounded-lg border px-3 py-2 text-xs leading-snug text-slate-300 ${farbe}`}>{children}</div>;
}
function Pfeil() {
  return <div className="text-center text-slate-500" aria-hidden="true">↓</div>;
}

/** V7-Vorschlag als Ablauf (HTML statt SVG, damit es auf dem Handy lesbar bleibt). */
function AblaufV7() {
  return (
    <figure className="mt-4">
      <div className="mx-auto max-w-xl space-y-1">
        <Kasten ton="brand"><b>One run, one GPS sample per second:</b> position + the speed the chip reports (Doppler)</Kasten>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Pfeil />
            <Kasten><b>Watch speed</b><br />spikes removed, gaps up to 3 s bridged — exactly as today</Kasten>
            <Pfeil />
            <Kasten>add up second by second<br /><b>= distance A</b></Kasten>
          </div>
          <div className="space-y-1">
            <Pfeil />
            <Kasten><b>Positions</b><br />each point averaged with its neighbours within ±2.5 s; never across a gap; at the start
              and end of a run the window shrinks on both sides</Kasten>
            <Pfeil />
            <Kasten>distance between the averaged points<br /><b>= distance B</b></Kasten>
          </div>
        </div>
        <Pfeil />
        <Kasten ton="brand"><b>distance = ½ A + ½ B</b> — the window search runs on this combined distance</Kasten>
        <Pfeil />
        <Kasten ton="amber"><b>Checks unchanged:</b> raw positions vs. watch speed within 10 %, no gap over 3 s, at least 2 of 3
          seconds with a real speed value, nothing above the sport's limit</Kasten>
        <Pfeil />
        <Kasten ton="brand"><b>fastest 100 m · 200 m · 300 m · 60 s</b></Kasten>
      </div>
      <figcaption className="mt-2 text-xs text-slate-400">Proposal V7. Only the distance that is timed changes; which windows are
        allowed stays exactly as it is today.</figcaption>
    </figure>
  );
}

/** Skizze: Bogen, verrauschte Positionen, 5-s- und 15-s-Mittel. */
function GlaettungSkizze() {
  // wahrer Weg: Bogen; Messpunkte = Weg + fester Pseudo-Zufall (wiederholbar)
  const n = 41;
  const weg = Array.from({ length: n }, (_, i) => {
    const a = Math.PI * (i / (n - 1));
    return [300 - 160 * Math.cos(a), 220 - 175 * Math.sin(a)] as [number, number];
  });
  const rausch = (i: number) => [Math.sin(i * 12.9898) * 43758.5453 % 1, Math.sin(i * 78.233) * 12345.678 % 1];
  const roh = weg.map(([x, y], i) => [x + rausch(i)[0] * 12, y + rausch(i)[1] * 12] as [number, number]);
  const mittel = (h: number) => roh.map((_, i) => {
    const k = Math.min(h, i, n - 1 - i);
    const s = roh.slice(i - k, i + k + 1);
    return [s.reduce((a, p) => a + p[0], 0) / s.length, s.reduce((a, p) => a + p[1], 0) / s.length] as [number, number];
  });
  const pfad = (a: [number, number][]) => a.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <figure className="mt-4">
      <svg viewBox="0 0 600 240" className="w-full text-slate-400" role="img"
        aria-label="A curved path, the jittery GPS positions, a light 5-second average that follows the curve and a heavy 15-second average that cuts it">
        <path d={pfad(weg)} fill="none" stroke="currentColor" strokeWidth={6} strokeOpacity={0.25} />
        <path d={pfad(roh)} fill="none" strokeWidth={1} className="stroke-amber-500" />
        {roh.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={2.5} className="fill-amber-500" />)}
        <path d={pfad(mittel(2))} fill="none" strokeWidth={2.5} className="stroke-brand-500" />
        <path d={pfad(mittel(7))} fill="none" strokeWidth={2} strokeDasharray="6 4" className="stroke-rose-500" />
      </svg>
      <figcaption className="text-xs text-slate-400">
        <span className="font-semibold text-slate-300">Grey:</span> the path actually ridden.{" "}
        <span className="font-semibold text-amber-600 dark:text-amber-400">Orange:</span> GPS positions — the zigzag is longer than
        the path.{" "}
        <span className="font-semibold text-brand-600 dark:text-brand-300">Blue:</span> averaged over 5 s — the zigzag is gone, the
        curve stays.{" "}
        <span className="font-semibold text-rose-600 dark:text-rose-400">Red dashed:</span> averaged over 15 s — the curve gets cut and
        the distance comes out too short. Schematic.
      </figcaption>
    </figure>
  );
}

/** Kleine Tabelle. */
function Tabelle({ kopf, zeilen }: { kopf: string[]; zeilen: ReactNode[][] }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="text-sm text-slate-300">
        <thead><tr className="text-left text-xs text-slate-400">{kopf.map((k) => <th key={k} className="pr-6 font-medium">{k}</th>)}</tr></thead>
        <tbody>{zeilen.map((z, i) => <tr key={i}>{z.map((c, j) => <td key={j} className="pr-6 align-top">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export default function NerdSprints() {
  return (
    <div className="mx-auto max-w-3xl p-6" style={{ paddingTop: "calc(1.5rem + env(safe-area-inset-top))" }}>
      <ScrollToTop />
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Nerd analyses</p>
      <h1 className="mb-1 flex items-center gap-2 text-xl font-bold"><ZurueckPfeil />Flying sprints: how we time them</h1>
      <p className="text-sm text-slate-400">The fastest flying 100 m, 200 m and 300 m and the fastest flying minute — what is measured,
        what does not count, how precise it is, and how teams are ranked, and what we are testing next. Last updated 18 November 2026.</p>

      <H>What the four numbers mean</H>
      <P><b>Flying</b> means the clock does not start when you get up on the foil. We look for the fastest stretch
        <i> anywhere</i> within one run: the fastest 100 m, 200 m or 300 m, and the highest average speed over 60 seconds. Every
        run is checked from every possible starting point, so a slow start costs you nothing.</P>
      <P>Distances are shown as a time with the average speed behind it, for example <C>21.4 s · 16.8 km/h</C>. The minute is
        shown as its average speed and the distance covered, for example <C>16.8 km/h · 280 m</C>. Times have one decimal: the
        watch measures once per second, and over 100 m the measurement is probably good to a few tenths of a second, so hundredths would
        only pretend to be precise. Rankings still use the full value. Faster is better on all four.</P>
      <P>A sprint never spans two runs. If you come off the foil, the next run starts from zero. A run that is too short for a
        distance simply has no value for it — most runs are long enough for 100 m, far fewer for 300 m or a full minute.</P>
      <Schema />

      <H>What is measured: the watch's own speed</H>
      <P>The obvious way would be to add up the distance between GPS positions. We tried that on 7,026 pumpfoil runs and did not
        use it. GPS positions jitter by a few metres in every direction, which makes the path zigzag and look longer than it was.
        And because we look for the <i>fastest</i> window, the search finds exactly the stretch where the jitter was worst.</P>
      <P>Worse, that error depends on the watch. Measured as the median difference over the best 100 m, positions came out
        faster than the true speed by:</P>
      <div className="mt-3 overflow-x-auto">
        <table className="text-sm text-slate-300">
          <thead><tr className="text-left text-xs text-slate-400"><th className="pr-6 font-medium">Recorder</th><th className="pr-6 font-medium">100 m</th><th className="font-medium">60 s</th></tr></thead>
          <tbody>
            <tr><td className="pr-6">Garmin</td><td className="pr-6">+0.5 km/h</td><td>+0.4 km/h</td></tr>
            <tr><td className="pr-6">Wear OS</td><td className="pr-6">+0.9 km/h</td><td>+0.7 km/h</td></tr>
            <tr><td className="pr-6">Apple Watch</td><td className="pr-6">+1.5 km/h</td><td>+0.8 km/h</td></tr>
            <tr><td className="pr-6">Phone</td><td className="pr-6">+1.5 km/h</td><td>—</td></tr>
          </tbody>
        </table>
      </div>
      <P>A ranking built on positions would reward the noisier watch. So we use the speed the GPS chip itself reports. The chip
        measures it from the Doppler shift of the satellite signals, which is far steadier than the difference between two
        positions. We add up that speed second by second to get the distance, and interpolate between seconds to find the exact
        moment 100, 200 or 300 metres are reached.</P>
      <P>Before that, the speed goes through the same clean-up the run detection uses: single-second spikes that no rider can
        produce are removed.</P>

      <H>What does not count</H>
      <P>Every candidate window is checked against the GPS positions as a second opinion. A window is thrown out if:</P>
      <ul className="mt-2 list-disc pl-5 text-sm text-slate-300">
        <li className="mt-1">the distance from the positions and the distance from the watch's speed differ by <b>more than 10 %</b>
          — a GPS jump, a speed spike or a frozen speed value;</li>
        <li className="mt-1">it contains a <b>gap of more than 3 seconds</b> — usually the watch was under water, and nothing was
          measured in between;</li>
        <li className="mt-1">the run has a speed value on <b>fewer than 80 %</b> of its seconds — then it is not a speed measurement
          we can trust, and the run gets no sprint values at all;</li>
        <li className="mt-1">the watch's speed in it goes <b>above the fastest a run of that sport can be</b> (32 km/h for
          pumpfoil and foil scoot, held for 3 seconds) — added on 17 November 2026. Some runs drift straight into a boat or car
          ride without a break; GPS and speed agree there, so the 10 % check could not catch it. Applied to all 8,850 sessions,
          25 values went down and none went up.</li>
      </ul>
      <P>The 10 % limit is wide enough that ordinary GPS jitter passes (about 9 in 10 windows are valid) and tight enough to catch
        real errors. With 5 % only 78 % of windows passed, and the top values stayed the same — the stricter limit just threw away
        good runs.</P>
      <P>We checked this again on 17 November 2026 with the real event weekend of 14–15 November: what if the limit had been
        5 %? The podium would have stayed the same. But 11 riders would have lost their value completely (7 of 48 in the minute,
        4 of 88 over 100 m), among them places 7 and 9 of the minute, and 28 values would have dropped by up to 1.5 km/h.
        7 of the 11 riders who would have dropped out wore an Apple Watch — for the reason in the next section. A stricter limit
        would have penalised one brand of watch, not bad measurements. So the limit stays at 10 %.</P>

      <H>How precise is it?</H>
      <P><b>Two recorders, one rider.</b> Some riders record with two devices at the same time — two watches, or a watch and a
        phone strapped to the board: 31 recordings from 12 riders, 132 runs recorded by both, aligned to the same clock. (An
        earlier count of 58 pairs also contained watches that recorded the same ride twice with the same GPS chip — our app
        and the watch's own activity. Those agree almost perfectly and made the result look better than it is; they are no
        longer counted.) The same run, timed by both devices, differs by a median of <b>0.38 km/h over 100 m</b> (1 in 10
        runs by more than 1.3 km/h) and <b>0.20 km/h over the minute</b> (1 in 10 by more than 1.0 km/h). The minute is about
        twice as reliable, because it averages over more seconds. Smoothing the watch's speed over 3 to 7 seconds — moving
        average, median, Savitzky–Golay or exponential — did not make the devices agree any better. In a close race, a few
        tenths of a km/h over 100 m are within what the devices themselves can tell apart.</P>
      <P><b>By watch model.</b> We do not know the true speed, but we can check how well two measurements of the same chip agree:
        in 10-second windows during runs, the distance from the reported speed against the distance from the positions. 5,838
        pumpfoil and foil scoot sessions since June 2026, median difference per session:</P>
      <div className="mt-3 overflow-x-auto">
        <table className="text-sm text-slate-300">
          <thead><tr className="text-left text-xs text-slate-400"><th className="pr-6 font-medium">Recorder</th><th className="pr-6 font-medium">Median difference</th><th className="font-medium">Notes</th></tr></thead>
          <tbody>
            <tr><td className="pr-6">Garmin</td><td className="pr-6">1.7–6.4 %</td><td>depends on the model; Forerunner 55 has a long tail</td></tr>
            <tr><td className="pr-6">Suunto</td><td className="pr-6">2–5 %</td><td>Ambit3 has a long tail</td></tr>
            <tr><td className="pr-6">Imported files</td><td className="pr-6">3.1 %</td><td>FIT, Garmin Connect, Polar, Suunto, COROS</td></tr>
            <tr><td className="pr-6">Wear OS</td><td className="pr-6">5–7 %</td><td></td></tr>
            <tr><td className="pr-6">Apple Watch</td><td className="pr-6">5–11 %</td><td>older models higher</td></tr>
          </tbody>
        </table>
      </div>
      <P>Read this with care: it is how well speed and positions agree, not how far either is from the truth. Part of it is
        position jitter, and a watch that smooths its speed more will disagree more without being less accurate. Two findings
        matter more than the table. First, riders wearing the <i>same</i> model differ more than the models do (one popular
        model ranges from 3.9 % to 7.3 % depending on the rider) — wrist, water and posture count for more than the watch.
        Second, since version 1.0.75 our Garmin app asks the watch for every satellite system it supports instead of GPS
        alone. Comparing the same riders on the same watch before and after: 12 of 20 got better, 8 worse, median 0.4
        percentage points better. Measurable, but small. The watch does not tell us which satellite mode it actually used, and
        the accuracy figure it reports is no help either (most Garmin watches always report 4 m, Suunto none).</P>
      <P>That is why there are no per-model rules: the same check applies to every watch on every day, and a window from a bad
        moment is thrown out whichever watch recorded it.</P>

      <H>Under test: speed and positions together (V7, not live)</H>
      <P><b>Status, 18 November 2026: proposal, dry runs only.</b> Nothing on the site uses it yet. If it goes live, it applies
        only to sessions recorded from that day on. Nothing recorded earlier changes — no stored values, no event results, no
        records. The cut-off date is fixed in the code, so the new method cannot be applied to older sessions by accident; on
        those it only ever runs as a read-only test.</P>
      <P><b>The idea.</b> The watch gives us two measurements of the same distance, and they go wrong in different ways. The
        reported speed is steady, but it comes out of the watch's own processing — some watches smooth it, and a single bad
        stretch counts in full. The positions jitter, which makes the path zigzag and come out too long, but they do not smooth
        anything. Averaging each position with its neighbours over 5 seconds removes most of the zigzag and keeps the curves.
        Taking half of each distance then cancels part of the errors that the two do not share.</P>
      <GlaettungSkizze />
      <AblaufV7 />
      <P><b>What we tried</b>, on the 132 runs recorded by two devices at once:</P>
      <Tabelle kopf={["Variant", "Result"]} zeilen={[
        ["Smoothing the watch's speed (3–7 s; moving average, median, Savitzky–Golay, exponential)", "no gain"],
        ["Positions only, raw or as a fitted curve (spline)", "worse"],
        ["Positions smoothed heavily (9–21 s), the \"nobody zigzags in a sprint\" idea", "devices agree better — but only because every value drops by 0.4–1.5 km/h: riders curve even in a sprint, and heavy smoothing cuts the curves. Rejected"],
        ["Speed combined with a Kalman/RTS smoother on the positions", "as good as the 5-second average, much more complicated"],
        ["Weights per second from the estimated noise of each measurement", "hardly better"],
        [<b key="b">½ speed + ½ positions averaged over 5 s</b>, <b key="c">best — the proposal</b>],
      ]} />
      <P><b>How much data there is.</b> Recordings that ran alongside another device of the same rider (one recording can be in
        more than one pair):</P>
      <Tabelle kopf={["Recorder", "Recordings", "Runs", "Riders"]} zeilen={[
        ["Garmin", "31", "128", "10"],
        ["Phone strapped to the board", "23", "79", "7"],
        ["Apple Watch", "4", "25", "2"],
        ["Phone in a pocket", "3", "22", "2"],
        ["Wear OS", "1", "10", "1"],
        ["Suunto, Polar, COROS, Amazfit, Huawei", "0", "0", "0"],
      ]} />
      <P>Garmin and the board phone are well covered. Apple Watch and Wear OS rest on one or two riders, and for the other brands
        we have no pairs at all — the method would apply to them on the strength of the principle, not of a measurement.</P>
      <P><b>Results.</b> Mean difference between the two devices for the same run, today → V7, in km/h (run in the full sprint
        code with all checks):</P>
      <Tabelle kopf={["Devices", "Runs", "100 m", "60 s"]} zeilen={[
        ["Garmin + phone on the board", "52 / 24", "0.57 → 0.29", "0.37 → 0.22"],
        ["Garmin + Garmin", "13 / 3", "0.71 → 0.52", "0.16 → 0.08"],
        ["Garmin + phone in a pocket", "11 / 2", "0.28 → 0.26", "0.25 → 0.15"],
        ["Apple Watch + phone on the board", "6 / 2", "0.33 → 0.26", "0.18 → 0.20"],
        ["Apple Watch + Garmin", "15 / 5", "0.69 → 1.03", "0.52 → 0.57"],
        [<b key="a">All pairs</b>, "100 / 36", <b key="b">0.55 → 0.43</b>, <b key="c">0.36 → 0.25</b>],
      ]} />
      <P>The minute improvement is statistically solid (95 % range of the gain +0.03 to +0.18 km/h); for 100 m the range just
        touches zero (−0.02 to +0.25). The board phone is the best reference we have: it sits still on the board and has the
        sky in view. Against it, watches today read on average 0.20 km/h <i>high</i> over 100 m, with V7 0.07 km/h low, and the
        mean error drops from 0.53 to 0.30 km/h. A suspicion that arm swing pushes the watch's speed up did not hold: watch speed
        and board speed agree within 0.02 km/h on average — the difference comes from the watch's speed processing, not the arm.</P>
      <P><b>Open question: the Apple Watch.</b> Against the board phone it gets better with V7, against a Garmin it gets worse —
        both from the same two riders. That is too little to decide either way. The options are one method for every recorder,
        or the Apple Watch keeping the speed-only method until there are more pairs (all pairs then: 0.55 → 0.41 over 100 m).</P>
      <P><b>Dry run on all 10,443 sessions with sprint values</b> (read-only), median change of the best 100 m:</P>
      <Tabelle kopf={["Recorder", "Sessions", "Median change"]} zeilen={[
        ["Suunto", "4,155", "−0.08 km/h"],
        ["Garmin", "2,937", "−0.24 km/h"],
        ["Apple Watch", "557", "−0.06 km/h"],
        ["Imported files", "371", "−0.21 km/h"],
        ["Phones", "349", "+0.09 km/h"],
        ["Wear OS", "286", "+0.13 km/h"],
        ["Polar", "105", "−0.16 km/h"],
      ]} />
      <P>Over the minute the median change is −0.09 km/h. 8 in 10 values move by less than 0.7 km/h. About 40 of 8,800 sessions
        would lose their 100 m value — runs that are only just over 100 m long, where the slightly shorter combined distance no
        longer reaches it. On the event weekend of 14–15 November the values would have moved by a median of −0.18 km/h over
        100 m (−0.04 with the Apple Watch kept on speed only); the top places stay close, but in a dense midfield many riders
        would swap a few places — which is exactly the size of the measurement error. Because of the cut-off date, none of this
        would actually change.</P>
      <P><b>What V7 does not fix.</b> All of this works at one sample per second. Getting much more precise needs loggers that
        record 5 to 10 times per second, as speed-sailing uses — hardware, not maths. Some Garmin watches also smooth their speed
        depending on the activity profile; whether our profile setting matters is a field test with two watches, still to do.</P>

      <H>Watches without motion data</H>
      <P>Some recorders only send GPS, no motion data. Their runs are detected from speed alone, so the detector cannot tell
        pumping from riding a wave, getting pulled by wind or a motor. In the first test, the highest minute values from
        motion-data sessions were around 20 km/h, while a few GPS-only sessions reached 26 to 29 km/h for a full minute. That is
        not pumping.</P>
      <P>For that reason we recommend setting sprint rankings in an event to <b>"only sessions with motion data"</b>. Event
        organisers choose this per ranking.</P>

      <H>Team rankings</H>
      <P>In global events every team gets its own ranking. For totals like distance or runs, the team value is the <b>sum</b> of
        its best N members. Adding up speeds makes no sense, so for sprints the team value is the <b>average</b> of its best N
        members. A team with fewer than N members who have a value is averaged over those it has; the ranking shows how many
        were counted.</P>

      <H>Where you see it</H>
      <P>Flying sprints are calculated for every session automatically. The fastest 100 m and the fastest minute appear in the
        community records, spot records and leaderboards, and can be chosen as team leaderboards and event rankings — for
        pumpfoil and foil scoot only, since for sports with wind, waves or a motor they would measure something else. In a
        session you can switch on a sprint layer that marks every run's best 100 m or minute on the map and shows its value on the run buttons.
        The apps follow with their next versions; until then some of this is only visible on the web.</P>
      <P>The code is open: <C>server/app/analysis/sprint.py</C> on <a href="https://github.com/kechel/pumpfoil"
        target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:underline">GitHub</a>. Questions or doubts about a
        value? Use the feedback button, or see the <Link to="/nerd-analysen" className="text-brand-400 hover:underline">other
        nerd analyses</Link> for how runs are detected in the first place.</P>
    </div>
  );
}
