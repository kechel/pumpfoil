import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { ZurueckPfeil } from "../components/ZurueckPfeil";
import { ScrollToTop } from "../components/ScrollToTop";

// Erklaerseite zu den fliegenden Sprints (server/app/analysis/sprint.py, Team-Wertung teams.team_wertung).
// Jan, 09.11.2026: „erstelle vielleicht eine erklaerseite auf der das erklaert wird wie der algorithmus funktioniert, als
// neuen nerd-artikel oder so, dann koennen wir auch darauf verweisen und oeffentlich transparent machen fuer jeden was
// genau wie bewertet und berechnet wird, gern erstmal nur in der pwa, nur auf englisch und nur fuer admins sichtbar".
// Darum: Route im angemeldeten Bereich, Inhalt nur fuer Admins, Menuepunkt nur fuer Admins. Zahlen aus der Messung vom
// 09.11. (docs/TODO.md „Schnellste 100 m …"), nur zusammengefasst, keine Fahrer. Wenn die Konstanten in sprint.py sich
// aendern, diese Seite mitziehen.

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

export default function NerdSprints() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  useEffect(() => { api.getProfile().then((p) => setAdmin(!!p.is_admin)).catch(() => setAdmin(false)); }, []);
  if (admin === null) return null;
  if (!admin) {
    return <div className="mx-auto max-w-3xl p-6 text-sm text-slate-400">This page is not published yet.</div>;
  }
  return (
    <div className="mx-auto max-w-3xl p-6" style={{ paddingTop: "calc(1.5rem + env(safe-area-inset-top))" }}>
      <ScrollToTop />
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Nerd analyses · admin preview</p>
      <h1 className="mb-1 flex items-center gap-2 text-xl font-bold"><ZurueckPfeil />Flying sprints: how we time them</h1>
      <p className="text-sm text-slate-400">The fastest flying 100 m, 200 m and 300 m and the fastest flying minute — what is measured,
        what does not count, and how teams are ranked. Last updated 9 November 2026.</p>

      <H>What the four numbers mean</H>
      <P><b>Flying</b> means the clock does not start when you get up on the foil. We look for the fastest stretch
        <i> anywhere</i> within one run: the fastest 100 m, 200 m or 300 m, and the highest average speed over 60 seconds. Every
        run is checked from every possible starting point, so a slow start costs you nothing.</P>
      <P>Distances are shown as a time with the average speed behind it, for example <C>21.4 s · 16.8 km/h</C>. The minute is
        shown as an average speed. Faster is better on all four.</P>
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
          we can trust, and the run gets no sprint values at all.</li>
      </ul>
      <P>The 10 % limit is wide enough that ordinary GPS jitter passes (about 9 in 10 windows are valid) and tight enough to catch
        real errors. With 5 % only 78 % of windows passed, and the top values stayed the same — the stricter limit just threw away
        good runs.</P>

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
      <P>For now, flying sprints can only be chosen as rankings in events. They are calculated for every new session
        automatically, but do not yet appear in records, on the community page or on profiles. The apps will show them in a later
        version; until then they are only visible on the web.</P>
      <P>The code is open: <C>server/app/analysis/sprint.py</C> on <a href="https://github.com/kechel/pumpfoil"
        target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:underline">GitHub</a>. Questions or doubts about a
        value? Use the feedback button, or see the <Link to="/nerd-analysen" className="text-brand-400 hover:underline">other
        nerd analyses</Link> for how runs are detected in the first place.</P>
    </div>
  );
}
