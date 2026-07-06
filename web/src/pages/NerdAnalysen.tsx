import { Link } from "react-router-dom";
import { NerdIcon } from "../components/Icons";
import { useI18n } from "../i18n";
import { NERD1 } from "./nerd1.i18n";

// Nerd-Analysen — Teil 1: das Dual-Watch-Pumpfoil-Experiment (2026-06-27).
// Vollständig übersetzt (alle 7 Sprachen, Inhalte in nerd1.i18n.ts).
// Bilder: Analyse-Plots unter /nerd/, Aufbau-Fotos unter /media/photos/.

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
    else if (m[2] !== undefined)
      nodes.push(<code key={i++} className="rounded bg-slate-800/70 px-1 py-0.5 text-[0.85em] text-brand-300">{m[2]}</code>);
    else if (m[3] !== undefined) nodes.push(<i key={i++}>{m[3]}</i>);
    else if (m[4] !== undefined)
      nodes.push(<Link key={i++} to={m[5]} className="text-brand-400 hover:underline">{m[4]}</Link>);
    last = re.lastIndex;
  }
  if (last < s.length) nodes.push(s.slice(last));
  return <>{nodes}</>;
}

function Fig({ src, caption }: { src: string; caption: string }) {
  return (
    <figure className="my-5 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60">
      <a href={src} target="_blank" rel="noreferrer">
        <img src={src} alt={caption} loading="lazy" className="w-full bg-slate-950" />
      </a>
      <figcaption className="px-3 py-2 text-xs text-slate-400">{caption}</figcaption>
    </figure>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-4 rounded-xl border border-brand-700/50 bg-brand-950/20 p-4 text-sm text-slate-200">
      {children}
    </div>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 mt-10 border-b border-slate-800 pb-1 text-lg font-bold text-slate-100">{children}</h2>;
}
function Pr({ children }: { children: string }) {
  return <p className="text-sm text-slate-300"><RT>{children}</RT></p>;
}

export default function NerdAnalysen() {
  const { lang } = useI18n();
  const c = NERD1[lang] ?? NERD1.de;
  const photo = (h: string) => `/media/photos/${h}.webp`;
  return (
    <div className="w-full">
      <Link to="/" className="text-sm text-brand-400 hover:underline">{c.back}</Link>
      <h1 className="mb-1 mt-4 flex items-center gap-2 text-2xl font-bold">
        <NerdIcon className="h-7 w-7 text-brand-400" /> {c.h1}
      </h1>
      <p className="mb-2 text-sm text-slate-400">{c.subtitle}</p>

      <Pr>{c.intro}</Pr>

      <H>{c.aufbau.h}</H>
      <Pr>{c.aufbau.p}</Pr>
      <div className="my-5 grid grid-cols-3 gap-3">
        <img src={photo("54d4248e35634dd6a9a4cda1a5f71b37")} alt={c.aufbau.alt1} className="aspect-[3/4] w-full rounded-xl border border-slate-800 object-cover" />
        <img src={photo("0bb596ff35864bfe8951cfa594038052")} alt={c.aufbau.alt2} className="aspect-[3/4] w-full rounded-xl border border-slate-800 object-cover" />
        <img src={photo("979ca9ffa5f44f9cb0441f0b430bfd22")} alt={c.aufbau.alt3} className="aspect-[3/4] w-full rounded-xl border border-slate-800 object-cover" />
      </div>
      <img src={photo("4987d350f41c4e93813eda148c85f625")} alt={c.aufbau.altSpot} className="my-3 w-full rounded-xl border border-slate-800" />

      <H>{c.daten.h}</H>
      <Pr>{c.daten.p}</Pr>

      <H>{c.start.h}</H>
      <Pr>{c.start.p}</Pr>
      <Fig src="/nerd/16_flip_marked.png" caption={c.start.cap1} />
      <Fig src="/nerd/06_start_sequence.png" caption={c.start.cap2} />

      <H>{c.truth.h}</H>
      <Pr>{c.truth.p}</Pr>
      <Fig src="/nerd/10_pump_glide_truth.png" caption={c.truth.cap} />

      <H>{c.cadence.h}</H>
      <Pr>{c.cadence.p}</Pr>
      <Fig src="/nerd/12_pump_timing.png" caption={c.cadence.cap} />

      <H>{c.pitch.h}</H>
      <Pr>{c.pitch.p}</Pr>
      <Fig src="/nerd/07_p3_pitch_fit.png" caption={c.pitch.cap} />

      <H>{c.pics.h}</H>
      <Pr>{c.pics.p}</Pr>
      <Fig src="/nerd/19_track_colored.png" caption={c.pics.cap1} />
      <Fig src="/nerd/20_track_surge_pumps.png" caption={c.pics.cap2} />
      <Fig src="/nerd/21_lage_teppich.png" caption={c.pics.cap3} />

      <H>{c.learned.h}</H>
      <Key>
        <ul className="list-disc space-y-1.5 pl-5">
          {c.learned.li.map((x, i) => <li key={i}><RT>{x}</RT></li>)}
        </ul>
      </Key>

      <H>{c.limits.h}</H>
      <p className="mb-6 text-sm text-slate-400"><RT>{c.limits.p}</RT></p>

      <Link
        to="/nerd-analysen-2"
        className="mb-10 inline-flex items-center gap-2 rounded-xl border border-brand-700/50 bg-brand-950/20 px-4 py-3 text-sm font-semibold text-brand-300 transition-colors hover:bg-brand-950/40"
      >
        {c.next}
      </Link>
    </div>
  );
}
