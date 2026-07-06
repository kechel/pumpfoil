import { Link } from "react-router-dom";
import { NerdIcon } from "../components/Icons";
import { useI18n } from "../i18n";
import { NERD2 } from "./nerd2.i18n";

// Nerd-Analysen — Teil 2: Wie die Erkennung wirklich funktioniert.
// Der IT-/Signalverarbeitungs-/ML-Teil hinter Pump-, On-Foil-, Start/Ende- und
// Gleitphasen-Erkennung. Vollständig übersetzt (alle 7 Sprachen, Inhalte in
// nerd2.i18n.ts). Alle Schaubilder sind selbst gezeichnete SVGs, die die echte
// Pipeline (server/app/analysis + ml) abbilden.

// ---------- kleine Bausteine (gleicher Stil wie Teil 1) ----------
function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 mt-10 border-b border-slate-800 pb-1 text-lg font-bold text-slate-100">{children}</h2>;
}
function Key({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-4 rounded-xl border border-brand-700/50 bg-brand-950/20 p-4 text-sm text-slate-200">
      {children}
    </div>
  );
}
function Diagram({ vb, children, caption }: { vb: string; children: React.ReactNode; caption: string }) {
  return (
    <figure className="my-5 overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
      <svg viewBox={vb} className="w-full" role="img" aria-label={caption}>
        {children}
      </svg>
      <figcaption className="border-t border-slate-800 px-3 py-2 text-xs text-slate-400">{caption}</figcaption>
    </figure>
  );
}
function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-slate-800/70 px-1 py-0.5 text-[0.85em] text-brand-300">{children}</code>;
}

// Mini-Renderer für Rich-Markup in den übersetzten Strings:
// **fett**, `code`, *kursiv*, [label](/pfad).
function RT({ children }: { children: string }) {
  const s = children;
  const nodes: React.ReactNode[] = [];
  const re = /\*\*([^*]+?)\*\*|`([^`]+?)`|\*([^*]+?)\*|\[([^\]]+?)\]\(([^)]+?)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) nodes.push(s.slice(last, m.index));
    if (m[1] !== undefined) nodes.push(<b key={i++}>{m[1]}</b>);
    else if (m[2] !== undefined) nodes.push(<Code key={i++}>{m[2]}</Code>);
    else if (m[3] !== undefined) nodes.push(<i key={i++}>{m[3]}</i>);
    else if (m[4] !== undefined)
      nodes.push(<Link key={i++} to={m[5]} className="text-brand-400 hover:underline">{m[4]}</Link>);
    last = re.lastIndex;
  }
  if (last < s.length) nodes.push(s.slice(last));
  return <>{nodes}</>;
}
// Absatz mit Rich-Text
function Pr({ children }: { children: string }) {
  return <p className="text-sm text-slate-300"><RT>{children}</RT></p>;
}
// Liste (ul/ol) mit Rich-Text-Einträgen
function List({ items, ordered }: { items: string[]; ordered?: boolean }) {
  const cls = "my-3 space-y-1.5 pl-5 text-sm text-slate-300 " + (ordered ? "list-decimal" : "list-disc");
  return ordered ? (
    <ol className={cls}>{items.map((x, i) => <li key={i}><RT>{x}</RT></li>)}</ol>
  ) : (
    <ul className={cls}>{items.map((x, i) => <li key={i}><RT>{x}</RT></li>)}</ul>
  );
}

// SVG-Helfer
const C = {
  grid: "#334155", axis: "#475569", label: "#94a3b8", faint: "#64748b",
  cyan: "#22d3ee", amber: "#f59e0b", pink: "#f472b6", violet: "#a78bfa",
  green: "#34d399", box: "#0f172a", boxStroke: "#1e293b", boxText: "#cbd5e1",
};
const P = (pts: [number, number][]) =>
  pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
const S = (n: number, x0: number, x1: number, f: (t: number) => number): [number, number][] =>
  Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return [x0 + t * (x1 - x0), f(t)] as [number, number];
  });
function Box({ x, y, w, h, title, sub, accent }: { x: number; y: number; w: number; h: number; title: string; sub?: string; accent?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8} fill={C.box} stroke={accent ? C.cyan : C.boxStroke} strokeWidth={accent ? 1.5 : 1} />
      <text x={x + w / 2} y={sub ? y + h / 2 - 4 : y + h / 2 + 4} textAnchor="middle" fontSize={13} fontWeight={600} fill={accent ? C.cyan : C.boxText}>{title}</text>
      {sub && <text x={x + w / 2} y={y + h / 2 + 12} textAnchor="middle" fontSize={10.5} fill={C.faint}>{sub}</text>}
    </g>
  );
}

export default function NerdAnalysen2() {
  const { lang } = useI18n();
  const c = NERD2[lang] ?? NERD2.de;
  return (
    <div className="w-full">
      <Link to="/nerd-analysen" className="text-sm text-brand-400 hover:underline">{c.back}</Link>
      <h1 className="mb-1 mt-4 flex items-center gap-2 text-2xl font-bold">
        <NerdIcon className="h-7 w-7 text-brand-400" /> {c.h1}
      </h1>
      <p className="mb-2 text-sm text-slate-400">{c.subtitle}</p>
      <Pr>{c.intro}</Pr>

      {/* ---------------- Rohdaten ---------------- */}
      <H>{c.raw.h}</H>
      <Pr>{c.raw.p}</Pr>
      <List items={c.raw.li} />
      <Pr>{c.raw.p2}</Pr>

      {/* ---------------- Master-Pipeline ---------------- */}
      <H>{c.pipe.h}</H>
      <Pr>{c.pipe.p}</Pr>
      <Diagram vb="0 0 800 540" caption={c.pipe.cap}>
        <defs>
          <marker id="ar" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto">
            <path d="M0 0 L7 3 L0 6 z" fill={C.faint} />
          </marker>
        </defs>
        <Box x={50} y={20} w={300} h={54} title={c.pipe.gps[0]} sub={c.pipe.gps[1]} />
        <Box x={450} y={20} w={300} h={54} title={c.pipe.accel[0]} sub={c.pipe.accel[1]} />
        <Box x={50} y={120} w={300} h={54} title={c.pipe.gpsPrep[0]} sub={c.pipe.gpsPrep[1]} />
        <Box x={450} y={120} w={300} h={54} title={c.pipe.accelPrep[0]} sub={c.pipe.accelPrep[1]} />
        <Box x={150} y={220} w={500} h={58} title={c.pipe.model[0]} sub={c.pipe.model[1]} accent />
        <Box x={200} y={324} w={400} h={48} title={c.pipe.mask[0]} sub={c.pipe.mask[1]} />
        <Box x={175} y={416} w={450} h={54} title={c.pipe.seg[0]} sub={c.pipe.seg[1]} />
        <Box x={90} y={492} w={280} h={40} title={c.pipe.pumps[0]} sub={c.pipe.pumps[1]} />
        <Box x={430} y={492} w={280} h={40} title={c.pipe.glide[0]} sub={c.pipe.glide[1]} />
        {[
          "M200 74 L200 118", "M600 74 L600 118",
          "M200 174 L280 218", "M600 174 L520 218",
          "M400 278 L400 322", "M400 372 L400 414",
          "M300 470 L250 490", "M500 470 L550 490",
        ].map((d, i) => <path key={i} d={d} stroke={C.faint} strokeWidth={1.6} fill="none" markerEnd="url(#ar)" />)}
      </Diagram>

      {/* ---------------- Betrag ---------------- */}
      <H>{c.mag.h}</H>
      <Pr>{c.mag.p}</Pr>
      <p className="my-2 text-center text-sm text-slate-200"><Code>{c.mag.formula}</Code></p>
      <Pr>{c.mag.p2}</Pr>
      <Diagram vb="0 0 800 210" caption={c.mag.cap}>
        {[["X", C.faint, 20, 0.9], ["Y", C.faint, 55, 1.7], ["Z", C.faint, 90, 0.6]].map(([lab, col, off, ph], k) => (
          <g key={k}>
            <text x={16} y={(off as number) + 4} fontSize={11} fill={C.label}>{lab as string}</text>
            <path d={P(S(120, 40, 470, (t) => (off as number) + 22 * Math.sin(t * 22 + (ph as number)) * Math.exp(-Math.pow((t - 0.5) * 2.2, 2)) + 9 * Math.sin(t * 7 + k)))} stroke={col as string} strokeWidth={1.2} fill="none" opacity={0.8} />
          </g>
        ))}
        <path d="M500 90 L560 90" stroke={C.faint} strokeWidth={1.6} markerEnd="url(#ar2)" fill="none" />
        <defs><marker id="ar2" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto"><path d="M0 0 L7 3 L0 6 z" fill={C.faint} /></marker></defs>
        <text x={640} y={26} textAnchor="middle" fontSize={11} fill={C.cyan}>{c.mag.label}</text>
        <line x1={575} y1={150} x2={720} y2={150} stroke={C.axis} strokeWidth={1} />
        <path d={P(S(120, 578, 718, (t) => 150 - Math.abs(38 * Math.sin(t * 22) * Math.exp(-Math.pow((t - 0.5) * 2.2, 2))) - 6))} stroke={C.cyan} strokeWidth={1.6} fill="none" />
      </Diagram>

      {/* ---------------- Vertikale ---------------- */}
      <H>{c.vert.h}</H>
      <Pr>{c.vert.p}</Pr>
      <List items={c.vert.ol} ordered />
      <p className="my-2 text-center text-sm text-slate-200"><Code>{c.vert.f1}</Code>&nbsp;&nbsp;{c.vert.fMid}&nbsp;&nbsp;<Code>{c.vert.f2}</Code></p>
      <Diagram vb="0 0 800 220" caption={c.vert.cap}>
        <g transform="translate(150,110)">
          <line x1={-6} y1={0} x2={0} y2={80} stroke={C.axis} strokeWidth={1} />
          <line x1={0} y1={0} x2={0} y2={70} stroke={C.amber} strokeWidth={2.4} markerEnd="url(#arG)" />
          <text x={8} y={60} fontSize={11} fill={C.amber}>{c.vert.gLabel}</text>
          <line x1={0} y1={0} x2={70} y2={-42} stroke={C.cyan} strokeWidth={2.4} markerEnd="url(#arC)" />
          <text x={74} y={-40} fontSize={11} fill={C.cyan}>{c.vert.aLabel}</text>
          <line x1={0} y1={70} x2={70} y2={28} stroke={C.pink} strokeWidth={2} strokeDasharray="4 3" markerEnd="url(#arP)" />
          <text x={44} y={64} fontSize={10.5} fill={C.pink}>{c.vert.amg}</text>
          <defs>
            <marker id="arG" markerWidth="9" markerHeight="9" refX="5" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6 z" fill={C.amber} /></marker>
            <marker id="arC" markerWidth="9" markerHeight="9" refX="5" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6 z" fill={C.cyan} /></marker>
            <marker id="arP" markerWidth="9" markerHeight="9" refX="5" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6 z" fill={C.pink} /></marker>
          </defs>
        </g>
        <text x={430} y={40} fontSize={11} fill={C.faint}>{c.vert.topNote}</text>
        <line x1={430} y1={70} x2={770} y2={70} stroke={C.axis} strokeWidth={0.8} />
        <path d={P(S(160, 432, 768, (t) => 70 - Math.abs(20 * Math.sin(t * 30))))} stroke={C.faint} strokeWidth={1.3} fill="none" />
        <text x={430} y={135} fontSize={11} fill={C.cyan}>{c.vert.botNote}</text>
        <line x1={430} y1={175} x2={770} y2={175} stroke={C.axis} strokeWidth={0.8} />
        <path d={P(S(160, 432, 768, (t) => 175 - 22 * Math.max(0, Math.sin(t * 15)) + 6 * Math.min(0, Math.sin(t * 15))))} stroke={C.cyan} strokeWidth={1.6} fill="none" />
      </Diagram>

      {/* ---------------- Sliding window + FFT ---------------- */}
      <H>{c.win.h}</H>
      <Pr>{c.win.p}</Pr>
      <List items={c.win.li} />
      <Pr>{c.win.p2}</Pr>
      <List items={c.win.li2} />
      <Diagram vb="0 0 800 250" caption={c.win.cap}>
        <line x1={30} y1={95} x2={470} y2={95} stroke={C.axis} strokeWidth={0.8} />
        <path d={P(S(220, 32, 468, (t) => 95 - 26 * Math.sin(t * 26) - 5 * Math.sin(t * 60)))} stroke={C.cyan} strokeWidth={1.4} fill="none" />
        <rect x={70} y={55} width={110} height={80} rx={4} fill={C.cyan} opacity={0.08} stroke={C.cyan} strokeDasharray="4 3" />
        <rect x={150} y={62} width={110} height={80} rx={4} fill={C.violet} opacity={0.08} stroke={C.violet} strokeDasharray="4 3" />
        <text x={70} y={48} fontSize={10} fill={C.cyan}>{c.win.winT}</text>
        <text x={182} y={156} fontSize={10} fill={C.violet}>{c.win.winT1}</text>
        <text x={30} y={30} fontSize={11} fill={C.label}>{c.win.sig}</text>
        <path d="M480 95 L515 95" stroke={C.faint} strokeWidth={1.6} markerEnd="url(#arF)" fill="none" />
        <text x={498} y={86} fontSize={9} fill={C.faint}>{c.win.fft}</text>
        <defs><marker id="arF" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto"><path d="M0 0 L7 3 L0 6 z" fill={C.faint} /></marker></defs>
        <g transform="translate(535,30)">
          <text x={0} y={0} fontSize={11} fill={C.label}>{c.win.spec}</text>
          <line x1={0} y1={130} x2={240} y2={130} stroke={C.axis} strokeWidth={1} />
          <line x1={0} y1={20} x2={0} y2={130} stroke={C.axis} strokeWidth={1} />
          <rect x={40} y={20} width={70} height={110} fill={C.pink} opacity={0.1} />
          <text x={75} y={148} textAnchor="middle" fontSize={9} fill={C.pink}>{c.win.band}</text>
          {[6, 10, 46, 78, 40, 14, 22, 12, 8, 18, 10, 6].map((h, i) => (
            <rect key={i} x={8 + i * 19} y={130 - h} width={12} height={h} fill={i >= 2 && i <= 4 ? C.pink : C.faint} opacity={i >= 2 && i <= 4 ? 0.95 : 0.6} />
          ))}
          <text x={120} y={168} textAnchor="middle" fontSize={9} fill={C.faint}>{c.win.freq}</text>
        </g>
      </Diagram>

      {/* ---------------- effektive Rate ---------------- */}
      <H>{c.rate.h}</H>
      <Pr>{c.rate.p}</Pr>

      {/* ---------------- ML-Modell ---------------- */}
      <H>{c.ml.h}</H>
      <Pr>{c.ml.p}</Pr>
      <List items={c.ml.li} />
      <Pr>{c.ml.p2}</Pr>
      <Diagram vb="0 0 800 250" caption={c.ml.cap}>
        {Array.from({ length: 11 }, (_, i) => {
          const x = 40 + i * 44;
          const center = i === 5;
          return (
            <g key={i}>
              <rect x={x} y={40} width={30} height={70} rx={3} fill={center ? C.cyan : C.box} opacity={center ? 0.25 : 1} stroke={center ? C.cyan : C.boxStroke} strokeWidth={center ? 1.5 : 1} />
              {Array.from({ length: 4 }, (_, r) => (
                <line key={r} x1={x + 5} y1={52 + r * 15} x2={x + 25} y2={52 + r * 15} stroke={center ? C.cyan : C.faint} strokeWidth={2} opacity={0.7} />
              ))}
              <text x={x + 15} y={126} textAnchor="middle" fontSize={9} fill={center ? C.cyan : C.faint}>{i - 5}s</text>
            </g>
          );
        })}
        <text x={40} y={30} fontSize={11} fill={C.label}>{c.ml.featNote}</text>
        <path d="M264 140 L264 165" stroke={C.faint} strokeWidth={1.6} markerEnd="url(#arM)" fill="none" />
        <defs><marker id="arM" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto"><path d="M0 0 L7 3 L0 6 z" fill={C.faint} /></marker></defs>
        {[0, 1, 2].map((i) => (
          <g key={i} transform={`translate(${150 + i * 70},170)`}>
            <circle cx={0} cy={0} r={3} fill={C.green} />
            <line x1={0} y1={0} x2={-10} y2={16} stroke={C.faint} strokeWidth={1} />
            <line x1={0} y1={0} x2={10} y2={16} stroke={C.faint} strokeWidth={1} />
            <circle cx={-10} cy={20} r={2.5} fill={C.faint} /><circle cx={10} cy={20} r={2.5} fill={C.faint} />
          </g>
        ))}
        <text x={200} y={225} textAnchor="middle" fontSize={10} fill={C.faint}>{c.ml.forest}</text>
        <path d="M330 195 L380 195" stroke={C.faint} strokeWidth={1.6} markerEnd="url(#arM)" fill="none" />
        {Array.from({ length: 11 }, (_, i) => {
          const on = i >= 2 && i <= 8;
          return <rect key={i} x={400 + i * 30} y={182} width={26} height={22} rx={3} fill={on ? C.green : C.box} opacity={on ? 0.8 : 1} stroke={C.boxStroke} />;
        })}
        <text x={400} y={172} fontSize={10} fill={C.green}>{c.ml.maskNote}</text>
      </Diagram>

      {/* ---------------- Segmentierung ---------------- */}
      <H>{c.seg.h}</H>
      <Pr>{c.seg.p}</Pr>
      <List items={c.seg.li} />
      <Pr>{c.seg.p2}</Pr>
      <Diagram vb="0 0 800 250" caption={c.seg.cap}>
        <text x={30} y={28} fontSize={11} fill={C.label}>{c.seg.maskLabel}</text>
        {"1101111011111100000111110".split("").map((ch, i) => (
          <rect key={i} x={30 + i * 22} y={38} width={18} height={18} rx={2} fill={ch === "1" ? C.green : C.box} opacity={ch === "1" ? 0.75 : 1} stroke={C.boxStroke} />
        ))}
        <path d="M300 80 L300 100" stroke={C.faint} strokeWidth={1.5} markerEnd="url(#arS)" fill="none" />
        <defs><marker id="arS" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto"><path d="M0 0 L7 3 L0 6 z" fill={C.faint} /></marker></defs>
        <text x={30} y={100} fontSize={11} fill={C.label}>{c.seg.runs}</text>
        <rect x={30} y={108} width={278} height={18} rx={3} fill={C.cyan} opacity={0.35} stroke={C.cyan} />
        <rect x={442} y={108} width={110} height={18} rx={3} fill={C.cyan} opacity={0.35} stroke={C.cyan} />
        <text x={169} y={121} textAnchor="middle" fontSize={9} fill={C.cyan}>{c.seg.run1}</text>
        <text x={497} y={121} textAnchor="middle" fontSize={9} fill={C.cyan}>{c.seg.run2}</text>
        <text x={315} y={121} fontSize={9} fill={C.faint}>{c.seg.tooShort}</text>
        <g transform="translate(0,150)">
          <text x={30} y={0} fontSize={11} fill={C.label}>{c.seg.hyst}</text>
          <line x1={30} y1={80} x2={770} y2={80} stroke={C.axis} strokeWidth={0.8} />
          <line x1={30} y1={35} x2={770} y2={35} stroke={C.green} strokeDasharray="3 3" strokeWidth={0.8} />
          <line x1={30} y1={55} x2={770} y2={55} stroke={C.amber} strokeDasharray="3 3" strokeWidth={0.8} />
          <text x={640} y={30} fontSize={9} fill={C.green}>{c.seg.enter}</text>
          <text x={640} y={68} fontSize={9} fill={C.amber}>{c.seg.exit}</text>
          <path d={P(S(200, 32, 768, (t) => 80 - 60 * Math.max(0, Math.min(1, (t - 0.12) * 6)) * Math.min(1, (0.95 - t) * 6) - 3 * Math.sin(t * 40)))} stroke={C.cyan} strokeWidth={1.5} fill="none" />
        </g>
      </Diagram>

      {/* ---------------- Start/Ende ---------------- */}
      <H>{c.se.h}</H>
      <Pr>{c.se.p}</Pr>
      <Pr>{c.se.p2}</Pr>
      <Diagram vb="0 0 800 190" caption={c.se.cap}>
        <line x1={30} y1={120} x2={770} y2={120} stroke={C.axis} strokeWidth={0.8} />
        <path d={P(S(240, 32, 768, (t) => {
          const jump = 70 * Math.exp(-Math.pow((t - 0.32) * 40, 2));
          const pumps = t > 0.36 ? 16 * Math.abs(Math.sin((t - 0.36) * 55)) : 0;
          return 120 - jump - pumps - 4;
        }))} stroke={C.cyan} strokeWidth={1.4} fill="none" />
        <line x1={30} y1={60} x2={770} y2={60} stroke={C.pink} strokeDasharray="4 3" strokeWidth={0.8} />
        <text x={34} y={54} fontSize={9} fill={C.pink}>{c.se.thr}</text>
        <line x1={330} y1={30} x2={330} y2={130} stroke={C.faint} strokeDasharray="3 3" strokeWidth={1.2} />
        <text x={334} y={44} fontSize={9} fill={C.faint}>{c.se.secStart}</text>
        <line x1={276} y1={30} x2={276} y2={130} stroke={C.green} strokeWidth={1.6} />
        <text x={150} y={150} fontSize={9} fill={C.green}>{c.se.snapped}</text>
        <text x={430} y={150} fontSize={9} fill={C.cyan}>{c.se.afterPump}</text>
      </Diagram>

      {/* ---------------- Pumps kadenz-geführt ---------------- */}
      <H>{c.pump.h}</H>
      <Pr>{c.pump.p}</Pr>
      <Pr>{c.pump.p2}</Pr>
      <Diagram vb="0 0 800 190" caption={c.pump.cap}>
        <text x={30} y={26} fontSize={10.5} fill={C.faint}>{c.pump.top}</text>
        <line x1={30} y1={72} x2={770} y2={72} stroke={C.axis} strokeWidth={0.7} />
        {(() => {
          const amps = [1, 0.5, 0.9, 0.45, 1, 0.5, 0.85, 0.4, 0.95, 0.5];
          return (
            <>
              <line x1={30} y1={48} x2={770} y2={48} stroke={C.pink} strokeDasharray="4 3" strokeWidth={0.7} />
              <path d={P(S(240, 32, 768, (t) => { const i = Math.min(amps.length - 1, Math.floor(t * amps.length)); return 72 - 38 * amps[i] * Math.max(0, Math.sin(t * amps.length * Math.PI)); }))} stroke={C.faint} strokeWidth={1.3} fill="none" />
              {amps.map((a, i) => a > 0.7 && <circle key={i} cx={32 + (i + 0.5) / amps.length * 736} cy={72 - 38 * a} r={3} fill={C.pink} />)}
            </>
          );
        })()}
        <text x={30} y={110} fontSize={10.5} fill={C.cyan}>{c.pump.bot}</text>
        <line x1={30} y1={162} x2={770} y2={162} stroke={C.axis} strokeWidth={0.7} />
        {(() => {
          const amps = [1, 0.5, 0.9, 0.45, 1, 0.5, 0.85, 0.4, 0.95, 0.5];
          return (
            <>
              <path d={P(S(240, 32, 768, (t) => { const i = Math.min(amps.length - 1, Math.floor(t * amps.length)); return 162 - 34 * amps[i] * Math.max(0, Math.sin(t * amps.length * Math.PI)); }))} stroke={C.cyan} strokeWidth={1.4} fill="none" />
              {amps.map((a, i) => <circle key={i} cx={32 + (i + 0.5) / amps.length * 736} cy={162 - 34 * a} r={3} fill={C.green} />)}
              {amps.map((_, i) => i > 0 && <line key={i} x1={32 + i / amps.length * 736} y1={120} x2={32 + i / amps.length * 736} y2={162} stroke={C.faint} strokeDasharray="2 3" strokeWidth={0.6} />)}
              <text x={32 + 0.5 / amps.length * 736} y={132} fontSize={9} fill={C.faint}>|←T→|</text>
            </>
          );
        })()}
      </Diagram>

      {/* ---------------- Gleitphasen ---------------- */}
      <H>{c.glide.h}</H>
      <Pr>{c.glide.p}</Pr>
      <Diagram vb="0 0 800 130" caption={c.glide.cap}>
        <line x1={40} y1={70} x2={760} y2={70} stroke={C.cyan} strokeWidth={2} />
        <circle cx={40} cy={70} r={4} fill={C.green} /><text x={40} y={96} textAnchor="middle" fontSize={9} fill={C.green}>{c.glide.start}</text>
        <circle cx={760} cy={70} r={4} fill={C.amber} /><text x={760} y={96} textAnchor="middle" fontSize={9} fill={C.amber}>{c.glide.end}</text>
        {[170, 250, 330, 410, 490, 570].map((x, i) => (
          <g key={i}><line x1={x} y1={58} x2={x} y2={82} stroke={C.pink} strokeWidth={2} /></g>
        ))}
        <text x={370} y={52} textAnchor="middle" fontSize={9} fill={C.pink}>{c.glide.pumps}</text>
        <path d="M40 40 L170 40" stroke={C.faint} strokeWidth={1} /><text x={105} y={34} textAnchor="middle" fontSize={9} fill={C.faint}>{c.glide.lead}</text>
        <path d="M570 40 L760 40" stroke={C.faint} strokeWidth={1} /><text x={665} y={34} textAnchor="middle" fontSize={9} fill={C.faint}>{c.glide.tail}</text>
        <text x={210} y={112} textAnchor="middle" fontSize={9} fill={C.faint}>{c.glide.gaps}</text>
      </Diagram>

      {/* ---------------- GPS-only Gates ---------------- */}
      <H>{c.gpsonly.h}</H>
      <Pr>{c.gpsonly.p}</Pr>
      <List items={c.gpsonly.li} />

      {/* ---------------- Labeling / Retrain ---------------- */}
      <H>{c.label.h}</H>
      <Pr>{c.label.p}</Pr>
      <Pr>{c.label.p2}</Pr>
      <Diagram vb="0 0 800 170" caption={c.label.cap}>
        <defs><marker id="arR" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto"><path d="M0 0 L7 3 L0 6 z" fill={C.faint} /></marker></defs>
        <Box x={30} y={60} w={150} h={50} title={c.label.fits[0]} sub={c.label.fits[1]} />
        <Box x={220} y={60} w={130} h={50} title={c.label.feats[0]} sub={c.label.feats[1]} />
        <Box x={390} y={60} w={160} h={50} title={c.label.rf[0]} sub={c.label.rf[1]} accent />
        <Box x={590} y={60} w={180} h={50} title={c.label.pkl[0]} sub={c.label.pkl[1]} />
        <path d="M180 85 L218 85" stroke={C.faint} strokeWidth={1.5} markerEnd="url(#arR)" fill="none" />
        <path d="M350 85 L388 85" stroke={C.faint} strokeWidth={1.5} markerEnd="url(#arR)" fill="none" />
        <path d="M550 85 L588 85" stroke={C.faint} strokeWidth={1.5} markerEnd="url(#arR)" fill="none" />
        <path d="M680 110 L680 140 L105 140 L105 112" stroke={C.faint} strokeWidth={1.2} strokeDasharray="4 3" markerEnd="url(#arR)" fill="none" />
        <text x={400} y={158} textAnchor="middle" fontSize={10} fill={C.faint}>{c.label.loopNote}</text>
      </Diagram>

      {/* ---------------- Zusammenfassung ---------------- */}
      <H>{c.summary.h}</H>
      <Key>
        <p className="mb-2"><RT>{c.summary.p1}</RT></p>
        <p className="text-slate-300"><RT>{c.summary.p2}</RT></p>
      </Key>

      <H>{c.limits.h}</H>
      <p className="mb-10 text-sm text-slate-400"><RT>{c.limits.p}</RT></p>
    </div>
  );
}
