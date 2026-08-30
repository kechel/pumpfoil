import { useEffect, useRef, useState, useCallback } from "react";
import { api, SocialItem } from "../lib/api";
import { useT } from "../i18n";
import { fmtDate } from "../lib/time";

// Gemeinsamer Pumpfoil-Feed aus den freigegebenen YouTube-Kanaelen der Nutzer (Jan, 30.08.).
// Nach Veroeffentlichungsdatum gemischt, NICHT nach Kanal gruppiert — der Sinn der Sache ist,
// unabhaengig vom Algorithmus einer Plattform zu sein.
//
// Abgespielt wird auf UNSERER Seite: Vorschaubild bis zum Klick (Click-to-Load ueber
// youtube-nocookie, keine Cookies/Skripte vorher), dann Vollbild mit Weiter/Zurueck. Wer
// durchblaettert, bleibt bei uns statt bei YouTube weiterzuklicken.
// Wie viele Videos je Schub nachgeladen werden.
const SCHUB = 24;

export function SocialFeed() {
  const t = useT();
  const [items, setItems] = useState<SocialItem[] | null>(null);
  const [offen, setOffen] = useState<number | null>(null);   // Index im Feed
  // Nachladen beim Scrollen: erst ein Schwung, weitere kommen, wenn man ans Ende wischt.
  // So laedt die Community-Seite nicht hunderte Vorschaubilder, die niemand ansieht.
  const [ende, setEnde] = useState(false);
  const laedt = useRef(false);

  const nachladen = useCallback(async () => {
    if (laedt.current || ende) return;
    laedt.current = true;
    try {
      const off = items?.length ?? 0;
      const mehr = await api.socialFeed(SCHUB, off);
      setItems((alt) => [...(alt ?? []), ...mehr]);
      if (mehr.length < SCHUB) setEnde(true);
    } catch { setEnde(true); } finally { laedt.current = false; }
  }, [items, ende]);

  useEffect(() => {
    api.socialFeed(SCHUB, 0)
      .then((r) => { setItems(r); if (r.length < SCHUB) setEnde(true); })
      .catch(() => { setItems([]); setEnde(true); });
  }, []);

  // Wischt jemand ans rechte Ende, kommt der naechste Schub — bevor die Luecke sichtbar wird.
  const beimScrollen = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollWidth - el.scrollLeft - el.clientWidth < 600) { void nachladen(); }
  };

  const weiter = useCallback((schritt: number) => {
    setOffen((i) => {
      if (i == null || !items?.length) return i;
      const n = i + schritt;
      return n < 0 || n >= items.length ? i : n;
    });
  }, [items]);

  // Der Abschnitt steht auch dann, wenn noch nichts drin ist: der Hinweis ist der Aufruf
  // mitzumachen, und ohne ihn wuesste niemand, dass es die Moeglichkeit gibt.
  return (
    <div className="mt-6">
      <div className="mb-1.5 flex items-center gap-2">
        <PlayIcon className="h-5 w-5 text-brand-400" />
        <h3 className="text-lg font-bold">{t("social.title")}</h3>
      </div>
      <p className="mb-2 text-sm text-slate-300">{t("social.hint")}</p>
      {items && items.length > 0 && (
        <div onScroll={beimScrollen}
          className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2">
          {items.map((it, i) => (
            // Hochkant wie auf der oeffentlichen Startseite (Jan, 30.08.: „es gibt fast nur
            // Shorts bei uns"). Das Vorschaubild ist 4:3 mit dem Video in der Mitte — `object-cover`
            // schneidet die Raender ab und zeigt genau den Bildausschnitt, der zaehlt.
            <button key={it.id} onClick={() => setOffen(i)}
              className="w-36 shrink-0 snap-center text-left sm:w-44">
              <div className="group relative aspect-[9/16] w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-xl">
                {/* Vorschaubild ueber UNSEREN Server, NICHT von i.ytimg.com: sonst entsteht schon
                    beim Seitenaufbau ein Drittkontakt zu Google — genau das, was Click-to-Load
                    verhindern soll. Dieselbe Route wie die Startseite (main.py). */}
                <img src={`/api/public/video-thumb/${it.external_id}`} alt="" loading="lazy"
                  className="h-full w-full object-cover transition group-hover:scale-105" />
                <span className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent" />
                <span className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-brand-500/90 text-slate-950 shadow-lg transition group-hover:bg-brand-400">
                  <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                </span>
                <div className="absolute inset-x-0 bottom-0 p-2">
                  <div className="line-clamp-2 text-xs font-semibold leading-tight text-white">{it.title || "—"}</div>
                  <div className="mt-0.5 truncate text-[11px] text-slate-300">
                    {it.user_name || "?"}
                    {it.published_at && <> · {fmtDate(it.published_at, null, { day: "2-digit", month: "2-digit", year: "2-digit" })}</>}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      {offen != null && items?.[offen] && (
        <SocialModal
          item={items[offen]}
          hatZurueck={offen > 0}
          hatWeiter={offen < items.length - 1}
          onWeiter={() => weiter(1)}
          onZurueck={() => weiter(-1)}
          onClose={() => setOffen(null)}
        />
      )}
    </div>
  );
}

// Vollbild mit Pfeilen links und rechts (Jan). Tastatur geht auch: Escape schliesst,
// Pfeiltasten blaettern — auf dem Rechner ist das schneller als zielen.
function SocialModal({ item, hatWeiter, hatZurueck, onWeiter, onZurueck, onClose }: {
  item: SocialItem; hatWeiter: boolean; hatZurueck: boolean;
  onWeiter: () => void; onZurueck: () => void; onClose: () => void;
}) {
  const t = useT();
  const [gemeldet, setGemeldet] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && hatWeiter) onWeiter();
      if (e.key === "ArrowLeft" && hatZurueck) onZurueck();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onWeiter, onZurueck, hatWeiter, hatZurueck]);
  useEffect(() => { setGemeldet(false); }, [item.id]);

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/95 p-2" onClick={onClose}>
      <button onClick={onClose} aria-label={t("common.close")}
        className="absolute right-3 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        style={{ top: "calc(0.75rem + env(safe-area-inset-top))" }}>
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>

      {hatZurueck && (
        <button onClick={(e) => { e.stopPropagation(); onZurueck(); }} aria-label={t("social.prev")}
          className="absolute left-2 z-10 rounded-full bg-brand-500 p-3 text-slate-950 shadow-lg hover:bg-brand-400 sm:left-6">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
      )}
      {hatWeiter && (
        <button onClick={(e) => { e.stopPropagation(); onWeiter(); }} aria-label={t("social.next")}
          className="absolute right-2 z-10 rounded-full bg-brand-500 p-3 text-slate-950 shadow-lg hover:bg-brand-400 sm:right-6">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
        </button>
      )}

      {/* KEIN festes Seitenverhaeltnis (Jan, 30.08.: „die gesamte Hoehe ausnutzen"). YouTube
          verraet das Format eines Videos nirgends — nicht im RSS, nicht im oEmbed (meldet stur
          16:9), nicht am Vorschaubild (unsere Shorts haben unscharfe statt schwarzer Raender).
          Statt zu raten bekommt der Rahmen einfach ALLES (Jan: „immer so gross wie moeglich, nur
          minimal Platz fuer unsere eigenen Controls links und rechts") — 92 % der Hoehe, die
          Breite bis auf 7rem fuer die Pfeile. Der Player skaliert das Video selbst hinein:
          hochkant nutzt die volle Hoehe, quer die volle Breite. */}
      <div className="flex h-[92vh] w-[calc(100vw-7rem)] flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="min-h-0 w-full flex-1">
          {/* Datensparsam ueber youtube-nocookie, geladen erst durch den Klick auf die Kachel.
              Der volle Player war am 30.08. kurz drin, damit man aus dem Feed heraus liken kann —
              er brachte nichts: der Like-Knopf erscheint nur bei YouTube-Angemeldeten mit
              erlaubten Dritt-Cookies. Zurueckgebaut; zum Liken fuehrt der Knopf unten hinaus. */}
          <iframe
            key={item.external_id}
            className="h-full w-full rounded-xl"
            // `loop=1` wirkt bei einem EINZELNEN Video nur zusammen mit `playlist=<id>` — ohne
            // das zweite Feld ignoriert YouTube die Wiederholung (dokumentierte Eigenart der
            // Player-Parameter). Bei Clips von wenigen Sekunden ist die Schleife das Richtige.
            src={`https://www.youtube-nocookie.com/embed/${item.external_id}?autoplay=1&rel=0&playsinline=1&loop=1&playlist=${item.external_id}`}
            title={item.title || "Video"}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </div>
        <div className="mt-2 flex items-start gap-3 text-white">
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{item.title || "—"}</div>
            <div className="truncate text-sm text-slate-300">{item.user_name || "?"}</div>
          </div>
          {/* Im datensparsamen nocookie-Modus gibt es keine YouTube-Sitzung im iframe — Liken und
              Abonnieren geht dort also nicht (Jan, 30.08.). Wer das will, kommt mit einem Klick
              hin; das hilft auch dem, der das Video gemacht hat. */}
          {/* Einziger Weg zu einem ECHTEN Like fuer den Creator: raus zu YouTube, wo der
              Nutzer angemeldet ist (auf dem Handy oeffnet die App). Deshalb auffaellig. */}
          <a href={item.url} target="_blank" rel="noopener noreferrer"
            className="shrink-0 rounded-xl bg-brand-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-brand-400">
            {t("social.onYoutube")}
          </a>
          <button
            onClick={() => { if (!gemeldet) { api.socialReport(item.id).catch(() => {}); setGemeldet(true); } }}
            className="shrink-0 rounded-lg bg-white/10 px-2.5 py-1 text-xs text-slate-200 hover:bg-white/20">
            {gemeldet ? t("social.reported") : t("social.report")}
          </button>
        </div>
      </div>
    </div>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="3" />
      <path d="M10 9l5 3-5 3z" fill="currentColor" stroke="none" />
    </svg>
  );
}
