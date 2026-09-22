import { useState } from "react";
import { Link } from "react-router-dom";
import { FoilIcon } from "../components/Icons";
import { ShortModal } from "../components/ShortModal";
import { NerdNav } from "../components/NerdNav";
import { NERD4 } from "./nerd4.i18n";
import { useSeo } from "../lib/seo";

// Nerd-Analysen — Teil 4: Handy am Brett (was sich messen laesst, wenn der Sensor nicht mehr
// am Handgelenk mitfaehrt). Aufbau wie Teil 3, aber NUR ENGLISCH (Jans Vorgabe, 22.09.2026) —
// deshalb kein `useI18n`, die Seite zeigt immer `NERD4.en`.
//
// Alle vier Grafiken sind aus ECHTEN Aufnahmen gerechnet (web/public/nerd4/, same-origin ->
// CSP-konform), Skript im Scratchpad dokumentiert in docs/TODO.md. Quellen: #9535 (Handy quer
// am Brett, mit Jans Erklaervideo) und #9528 (Handy diagonal), dazu #9534 als gleichzeitige
// Garmin-Aufnahme am Handgelenk.

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 mt-10 border-b border-slate-800 pb-1 text-lg font-bold text-slate-100">{children}</h2>;
}
function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-slate-800/70 px-1 py-0.5 text-[0.85em] text-brand-600 dark:text-brand-300">{children}</code>;
}
// Rich-Markup: **fett**, `code`, *kursiv*, [label](/pfad). Gleiche Funktion wie in Teil 3 —
// bewusst kopiert statt geteilt, damit eine Aenderung an einem Artikel die anderen nicht trifft.
function RT({ children }: { children: string }) {
  const s = children;
  const nodes: React.ReactNode[] = [];
  const re = /\*\*([^*]+?)\*\*|`([^`]+?)`|\*([^*]+?)\*|\[([^\]]+?)\]\(([^)]+?)\)/g;
  let last = 0, i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) nodes.push(s.slice(last, m.index));
    if (m[1] !== undefined) nodes.push(<b key={i++}>{m[1]}</b>);
    else if (m[2] !== undefined) nodes.push(<Code key={i++}>{m[2]}</Code>);
    else if (m[3] !== undefined) nodes.push(<i key={i++}>{m[3]}</i>);
    else if (m[4] !== undefined) nodes.push(<Link key={i++} to={m[5]} className="text-brand-400 hover:underline">{m[4]}</Link>);
    last = re.lastIndex;
  }
  if (last < s.length) nodes.push(s.slice(last));
  return <>{nodes}</>;
}
function Pr({ children }: { children: string }) {
  return <p className="mt-3 text-sm text-slate-300"><RT>{children}</RT></p>;
}
function List({ items }: { items: string[] }) {
  return <ul className="my-3 space-y-1.5 pl-5 text-sm text-slate-300 list-disc">{items.map((x, i) => <li key={i}><RT>{x}</RT></li>)}</ul>;
}
function Fig({ src, caption }: { src: string; caption: string }) {
  return (
    <figure className="my-5 overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
      <img src={src} alt={caption} loading="lazy" className="block w-full" />
      <figcaption className="border-t border-slate-800 px-3 py-2 text-xs text-slate-400">{caption}</figcaption>
    </figure>
  );
}

const VIDEO_ID = "5xt-yCcw0rA";   // Jans Erklaervideo, haengt an Session #9535

export default function NerdAnalysen4() {
  useSeo("A phone taped to the board — measuring pump foiling at the source",
         "What a phone on the board measures that a watch on the wrist cannot: pitch, roll, yaw and heave, with real data from the first rides.");
  const c = NERD4.en!;
  const [vidOpen, setVidOpen] = useState(false);
  return (
    <div className="w-full">
      <Link to="/nerd-analysen-3" className="text-sm text-brand-400 hover:underline">{c.back}</Link>
      <h1 className="mb-1 mt-4 flex items-center gap-2 text-2xl font-bold">
        <FoilIcon className="h-7 w-7 text-brand-400" /> {c.h1}
      </h1>
      <p className="mb-2 text-sm text-slate-400">{c.subtitle}</p>
      <Pr>{c.intro}</Pr>

      <H>{c.why.h}</H>
      <Pr>{c.why.p}</Pr>
      <Fig src="/nerd4/board-vs-wrist.png" caption={c.why.cap} />
      <Pr>{c.why.p2}</Pr>

      <H>{c.setup.h}</H>
      <Pr>{c.setup.p}</Pr>
      {/* Zwei echte Fotos vom Aufbau — dieselbe Rolle wie die Setup-Bilder in Teil 3: ohne sie
          liest sich der Artikel wie ein Laborbericht ueber etwas, das niemand angefasst hat. */}
      <div className="my-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <figure className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
          <img src="/nerd4/setup-deck.webp" alt={c.setup.capDeck} loading="lazy" className="block w-full" />
          <figcaption className="border-t border-slate-800 px-3 py-2 text-xs text-slate-400">{c.setup.capDeck}</figcaption>
        </figure>
        <figure className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
          <img src="/nerd4/setup-rail.webp" alt={c.setup.capRail} loading="lazy" className="block w-full" />
          <figcaption className="border-t border-slate-800 px-3 py-2 text-xs text-slate-400">{c.setup.capRail}</figcaption>
        </figure>
      </div>

      <H>{c.what.h}</H>
      <Pr>{c.what.p}</Pr>
      <List items={c.what.li} />
      <Fig src="/nerd4/pitch-roll-heave.png" caption={c.what.cap} />
      <Fig src="/nerd4/tiles-pitch-roll-yaw.webp" caption={c.what.capTiles} />

      <H>{c.mount.h}</H>
      <Pr>{c.mount.p}</Pr>
      <Pr>{c.mount.p2}</Pr>
      <Fig src="/nerd4/mounting-axis.png" caption={c.mount.cap} />

      <H>{c.heave.h}</H>
      <Pr>{c.heave.p}</Pr>
      <Pr>{c.heave.p2}</Pr>
      <Fig src="/nerd4/heave-window.png" caption={c.heave.cap} />

      <H>{c.videorun.h}</H>
      <Pr>{c.videorun.p}</Pr>
      <figure className="mx-auto my-5 max-w-xs overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
        {/* Click-to-Load ueber den same-origin Thumbnail-Proxy — kein Dritt-Skript, bis jemand
            wirklich abspielt (s. Datenschutz-Regel in CLAUDE.md). Gleiches Muster wie Teil 3. */}
        <button onClick={() => setVidOpen(true)} className="group relative block aspect-[9/16] w-full" aria-label={c.videorun.h}>
          <img src={`/api/public/video-thumb/${VIDEO_ID}`} alt={c.videorun.cap} loading="lazy"
            className="h-full w-full object-cover transition group-hover:scale-105" />
          <span className="absolute inset-0 bg-gradient-to-t from-slate-950/60 to-transparent" />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 drop-shadow-lg">
            <svg viewBox="0 0 68 48" className="h-11 w-auto" aria-hidden="true">
              <path fill="#FF0000" d="M66.5 7.7c-.8-2.9-3-5.1-5.9-5.9C55.3.5 34 .5 34 .5S12.7.5 7.4 1.8C4.5 2.6 2.3 4.8 1.5 7.7.2 13 .2 24 .2 24s0 11 1.3 16.3c.8 2.9 3 5.1 5.9 5.9C12.7 47.5 34 47.5 34 47.5s21.3 0 26.6-1.3c2.9-.8 5.1-3 5.9-5.9C67.8 35 67.8 24 67.8 24s0-11-1.3-16.3z" />
              <path fill="#fff" d="M27 34l18-10-18-10z" />
            </svg>
          </span>
        </button>
        <figcaption className="border-t border-slate-800 px-3 py-2 text-xs text-slate-400">{c.videorun.cap}</figcaption>
      </figure>
      {vidOpen && <ShortModal id={VIDEO_ID} title={c.videorun.h} onClose={() => setVidOpen(false)} />}

      <H>{c.found.h}</H>
      <Pr>{c.found.p}</Pr>
      <List items={c.found.li} />

      <H>{c.limits.h}</H>
      <Pr>{c.limits.p}</Pr>
      <List items={c.limits.li} />

      <H>{c.next.h}</H>
      <Pr>{c.next.p}</Pr>

      <NerdNav current={4} />
    </div>
  );
}
