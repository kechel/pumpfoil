import { useEffect } from "react";
import { Link } from "react-router-dom";
import { FoilIcon } from "../components/Icons";
import { useI18n } from "../i18n";
import { NERD6 } from "./nerd6.i18n";
import { useSeo } from "../lib/seo";

// Nerd-Analysen — Teil 6: Pump- und Gleit-Erkennung pg-1 (docs/PUMP-GLEIT.md). ENTWURF zum Gegenlesen
// (Jan, 23.10.2026): bewusst NICHT verlinkt (keine Sidebar, kein NerdNav-Eintrag, keine Uebersicht, kein Changelog)
// und mit noindex. Texte vorerst nur Deutsch/Englisch, Rueckfall Englisch.
//
// Die Bilder (web/public/nerd6/, same-origin -> CSP-konform) rechnet scripts/pumpgleit/nerd6_bilder.py aus den
// Messungen. Signal- und Spurbilder nur aus Jans eigenen Aufnahmen; andere Fahrer nur anonym zusammengefasst.

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 mt-10 border-b border-slate-800 pb-1 text-lg font-bold text-slate-100">{children}</h2>;
}
function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-slate-800/70 px-1 py-0.5 text-[0.85em] text-brand-600 dark:text-brand-300">{children}</code>;
}
// Rich-Markup: **fett**, `code`, *kursiv*, [label](/pfad). Bewusst kopiert statt geteilt (wie Teil 3-5).
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

export default function NerdAnalysen6() {
  useSeo("Pumps and glides — teaching the watch to count every pump once",
         "How pumpfoil.org rebuilt pump counting and glide detection against a phone on the board: rhythm physics, a deliberately small model, honest numbers.");
  // Entwurf: nicht in Suchmaschinen (wieder entfernen, wenn Jan freigibt)
  useEffect(() => {
    const m = document.createElement("meta");
    m.name = "robots";
    m.content = "noindex";
    document.head.appendChild(m);
    return () => { m.remove(); };
  }, []);
  const { lang } = useI18n();
  const c = NERD6[lang] ?? NERD6.en!;
  return (
    <div className="w-full">
      <Link to="/nerd-analysen-5" className="text-sm text-brand-400 hover:underline">{c.back}</Link>
      <div className="mt-3 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">{c.entwurf}</div>
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
      <Fig src="/nerd6/truth.png" caption={c.truth.cap} />
      <Pr>{c.truth.p2}</Pr>

      <H>{c.physics.h}</H>
      <Pr>{c.physics.p}</Pr>
      <List items={c.physics.li} />
      <Fig src="/nerd6/rhythm.png" caption={c.physics.cap} />
      <Pr>{c.physics.p2}</Pr>
      <List items={c.physics.li2} />

      <H>{c.honest.h}</H>
      <Pr>{c.honest.p}</Pr>
      <Fig src="/nerd6/results.png" caption={c.honest.cap1} />
      <Pr>{c.honest.p2}</Pr>
      <List items={c.honest.li} />
      <Fig src="/nerd6/learning.png" caption={c.honest.cap2} />
      <Pr>{c.honest.p3}</Pr>

      <H>{c.before.h}</H>
      <Pr>{c.before.p}</Pr>
      <Fig src="/nerd6/before-after.png" caption={c.before.cap} />
      <Pr>{c.before.p2}</Pr>

      <H>{c.limits.h}</H>
      <List items={c.limits.li} />

      <div className="mt-10 mb-10 rounded-xl border border-brand-700/50 bg-brand-500/10 p-4">
        <h2 className="text-lg font-bold text-brand-600 dark:text-brand-300">{c.help.h}</h2>
        <Pr>{c.help.p}</Pr>
        <List items={c.help.li} />
        <Pr>{c.help.p2}</Pr>
      </div>
    </div>
  );
}
