import { useState } from "react";
import { Link } from "react-router-dom";
import { FoilIcon } from "../components/Icons";
import { ShortModal } from "../components/ShortModal";
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

const VIDEO_ID = "S85hOgmajb4";   // Doppeluhr + Board-Handy (YouTube-Short)

export default function NerdAnalysen3() {
  const { lang } = useI18n();
  const c = NERD3[lang] ?? NERD3.de!;
  const [vidOpen, setVidOpen] = useState(false);
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

      <H>{c.videorun.h}</H>
      <Pr>{c.videorun.p}</Pr>
      <figure className="mx-auto my-5 max-w-xs overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
        {/* Click-to-Load: Thumbnail (same-origin Proxy) öffnet den Short im großen Overlay. */}
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

      <H>{c.limits.h}</H>
      <Pr>{c.limits.p}</Pr>

      <H>{c.outlook.h}</H>
      <Pr>{c.outlook.p}</Pr>
      <div className="h-10" />
    </div>
  );
}
