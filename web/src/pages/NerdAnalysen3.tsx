import { Link } from "react-router-dom";
import { FoilIcon } from "../components/Icons";
import { useI18n } from "../i18n";
import { NERD3 } from "./nerd3.i18n";

// Nerd-Analysen — Teil 3: Bericht zur zweiten Doppeluhr-Messung (wo wir aktuell stehen).
// Datengetrieben aus nerd3.i18n.ts (alle 8 Sprachen). Anders als Teil 1/2 mit echten
// Fotos + Mess-Plots (web/public/nerd3/, same-origin -> CSP-konform). Später erweiterbar.

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 mt-10 border-b border-slate-800 pb-1 text-lg font-bold text-slate-100">{children}</h2>;
}
function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-slate-800/70 px-1 py-0.5 text-[0.85em] text-brand-300">{children}</code>;
}
// Rich-Markup: **fett**, `code`, *kursiv*, [label](/pfad).
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
  return <p className="text-sm text-slate-300"><RT>{children}</RT></p>;
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

export default function NerdAnalysen3() {
  const { lang } = useI18n();
  const c = NERD3[lang] ?? NERD3.de;
  return (
    <div className="w-full">
      <Link to="/nerd-analysen-2" className="text-sm text-brand-400 hover:underline">{c.back}</Link>
      <h1 className="mb-1 mt-4 flex items-center gap-2 text-2xl font-bold">
        <FoilIcon className="h-7 w-7 text-brand-400" /> {c.h1}
      </h1>
      <p className="mb-2 text-sm text-slate-400">{c.subtitle}</p>
      <Pr>{c.intro}</Pr>

      <H>{c.setup.h}</H>
      <Pr>{c.setup.p}</Pr>
      <div className="my-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <figure className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
          <img src="/nerd3/setup-rumpf.webp" alt={c.setup.capRumpf} loading="lazy" className="block w-full" />
          <figcaption className="border-t border-slate-800 px-3 py-2 text-xs text-slate-400">{c.setup.capRumpf}</figcaption>
        </figure>
        <figure className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
          <img src="/nerd3/setup-fuss.webp" alt={c.setup.capFuss} loading="lazy" className="block w-full" />
          <figcaption className="border-t border-slate-800 px-3 py-2 text-xs text-slate-400">{c.setup.capFuss}</figcaption>
        </figure>
      </div>

      <H>{c.pump.h}</H>
      <Pr>{c.pump.p}</Pr>
      <List items={c.pump.li} />
      <Fig src="/nerd3/pump-summary.png" caption={c.pump.cap} />

      <H>{c.glide.h}</H>
      <Pr>{c.glide.p}</Pr>
      <List items={c.glide.li} />
      <Fig src="/nerd3/glide-sink.png" caption={c.glide.cap} />

      <H>{c.limits.h}</H>
      <Pr>{c.limits.p}</Pr>

      <H>{c.outlook.h}</H>
      <Pr>{c.outlook.p}</Pr>
      <div className="h-10" />
    </div>
  );
}
