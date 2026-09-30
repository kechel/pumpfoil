import { Link } from "react-router-dom";
import { FoilIcon } from "../components/Icons";
import { NerdNav } from "../components/NerdNav";
import { useI18n } from "../i18n";
import { NERD5 } from "./nerd5.i18n";
import { useSeo } from "../lib/seo";

// Nerd-Analysen — Teil 5: die neue On-Foil-Erkennung (Erkennung v3, docs/DETECTION-V3.md).
// Aufbau wie Teil 4. Nur Englisch (Jan, 30.09.2026: „erstmal nur in einer sprache"); die
// Sprache wird trotzdem ueber `NERD5[lang]` gewaehlt — ein fester Griff auf `NERD5.en` liesse den
// Bundler spaeter hinzukommende Sprachen lautlos wegwerfen (s. Teil 4).
//
// Die vier Grafiken (web/public/nerd5/, same-origin -> CSP-konform) rechnet
// scripts/v3/nerd5_bilder.py aus den echten Messungen. Keine Namen, keine Session-Nummern Dritter.

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 mt-10 border-b border-slate-800 pb-1 text-lg font-bold text-slate-100">{children}</h2>;
}
function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-slate-800/70 px-1 py-0.5 text-[0.85em] text-brand-600 dark:text-brand-300">{children}</code>;
}
// Rich-Markup: **fett**, `code`, *kursiv*, [label](/pfad). Bewusst kopiert statt geteilt (wie Teil 3/4).
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

export default function NerdAnalysen5() {
  useSeo("Detection model — a new on-foil detection for pump foiling",
         "How pumpfoil.org rebuilt its on-foil detection against every truth it has: a phone on the board, map checks, riders’ own corrections — and why watch-plus-phone sessions help most.");
  const { lang } = useI18n();
  const c = NERD5[lang] ?? NERD5.en!;
  return (
    <div className="w-full">
      <Link to="/nerd-analysen-4" className="text-sm text-brand-400 hover:underline">{c.back}</Link>
      <h1 className="mb-1 mt-4 flex items-center gap-2 text-2xl font-bold">
        <FoilIcon className="h-7 w-7 text-brand-400" /> {c.h1}
      </h1>
      <p className="mb-2 text-sm text-slate-400">{c.subtitle}</p>
      <Pr>{c.intro}</Pr>

      <H>{c.problem.h}</H>
      <Pr>{c.problem.p}</Pr>
      <List items={c.problem.li} />

      <H>{c.truth.h}</H>
      <Pr>{c.truth.p}</Pr>
      <List items={c.truth.li} />
      <Pr>{c.truth.p2}</Pr>

      <H>{c.features.h}</H>
      <Pr>{c.features.p}</Pr>
      <List items={c.features.li} />

      <H>{c.honest.h}</H>
      <Pr>{c.honest.p}</Pr>
      <Pr>{c.honest.p2}</Pr>
      <Fig src="/nerd5/learning-curve.png" caption={c.honest.cap} />

      <H>{c.pipeline.h}</H>
      <Pr>{c.pipeline.p}</Pr>
      <List items={c.pipeline.li} />
      <Pr>{c.pipeline.p2}</Pr>

      <H>{c.watch.h}</H>
      <Pr>{c.watch.p}</Pr>
      <Fig src="/nerd5/orientation-angle.png" caption={c.watch.cap1} />
      <Pr>{c.watch.p2}</Pr>
      <Fig src="/nerd5/steady-and-turning.png" caption={c.watch.cap2} />
      <Pr>{c.watch.p3}</Pr>

      <H>{c.result.h}</H>
      <Pr>{c.result.p}</Pr>
      <Fig src="/nerd5/results.png" caption={c.result.cap} />
      <List items={c.result.li} />

      <H>{c.failed.h}</H>
      <Pr>{c.failed.p}</Pr>
      <List items={c.failed.li} />

      <H>{c.status.h}</H>
      <Pr>{c.status.p}</Pr>
      <List items={c.status.li} />
      <Pr>{c.status.p2}</Pr>
      <List items={c.status.li2} />

      {/* Der Aufruf zum Mitmachen steht bewusst ALS LETZTER Abschnitt und abgesetzt (Jan,
          30.09.2026: „darauf hinweisen dass mehr sessions parallel mit uhr und phone on board
          super hilfreich waeren") — er ist der Grund, warum es den Artikel gibt. */}
      <div className="mt-10 rounded-xl border border-brand-700/50 bg-brand-500/10 p-4">
        <h2 className="text-lg font-bold text-brand-600 dark:text-brand-300">{c.help.h}</h2>
        <Pr>{c.help.p}</Pr>
        <List items={c.help.li} />
        <Pr>{c.help.p2}</Pr>
      </div>

      <NerdNav current={5} />
    </div>
  );
}
