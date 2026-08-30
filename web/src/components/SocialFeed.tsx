import { useEffect, useRef, useState, useCallback } from "react";
import { api, SocialItem } from "../lib/api";
import { Card } from "../components/ui";
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
            <button key={it.id} onClick={() => setOffen(i)}
              className="w-44 shrink-0 snap-center text-left sm:w-56">
              <Card className="flex h-full flex-col gap-2 p-2 hover:border-slate-600">
                <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-slate-800">
                  {/* Vorschaubild ueber UNSEREN Server, NICHT von i.ytimg.com (Jan, 30.08.):
                      sonst entsteht schon beim Seitenaufbau ein Drittkontakt zu Google — genau
                      das, was Click-to-Load verhindern soll, und Ghostery blockt es zu Recht.
                      Dieselbe Route wie die oeffentliche Startseite (main.py:public_video_thumb). */}
                  <img src={`/api/public/video-thumb/${it.external_id}`} alt="" loading="lazy"
                    className="h-full w-full object-cover" />
                  <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                    ▶
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="line-clamp-2 text-sm font-semibold leading-tight">{it.title || "—"}</div>
                  <div className="mt-0.5 truncate text-xs text-slate-400">
                    {it.user_name || "?"}
                    {it.published_at && <> · {fmtDate(it.published_at, null, { day: "2-digit", month: "2-digit", year: "2-digit" })}</>}
                  </div>
                </div>
              </Card>
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
// Einwilligung fuer den VOLLEN YouTube-Player. Jan hat sich am 30.08. bewusst dafuer entschieden,
// damit man aus dem Feed heraus liken und abonnieren kann — das geht im datensparsamen
// nocookie-Modus nicht, weil es dort keine YouTube-Sitzung im iframe gibt.
// Preis: der volle Player setzt Google-Cookies, sobald er laedt. Ein blosser Klick auf ein
// Play-Dreieck gilt dafuer nicht als informierte Einwilligung (§ 25 TDDDG), deshalb steht davor
// ein Hinweis, was passiert. Einmal je Browser, danach gemerkt — widerrufbar im Impressum.
const CONSENT_KEY = "yt_full_consent";
export function ytConsentGegeben(): boolean {
  try { return localStorage.getItem(CONSENT_KEY) === "1"; } catch { return false; }
}
export function ytConsentWiderrufen() {
  try { localStorage.removeItem(CONSENT_KEY); } catch { /* egal */ }
}

function SocialModal({ item, hatWeiter, hatZurueck, onWeiter, onZurueck, onClose }: {
  item: SocialItem; hatWeiter: boolean; hatZurueck: boolean;
  onWeiter: () => void; onZurueck: () => void; onClose: () => void;
}) {
  const t = useT();
  const [gemeldet, setGemeldet] = useState(false);
  const [darfLaden, setDarfLaden] = useState(() => ytConsentGegeben());
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
          {darfLaden ? (
            <iframe
              key={item.external_id}
              className="h-full w-full rounded-xl"
              src={`https://www.youtube.com/embed/${item.external_id}?autoplay=1&rel=0&playsinline=1`}
              title={item.title || "Video"}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
            />
          ) : (
            // Vor dem ersten Abspielen: Vorschaubild von UNSEREM Server, daneben was passiert.
            // Bis hierher ging noch keine einzige Anfrage an Google.
            <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-xl bg-slate-900">
              <img src={`/api/public/video-thumb/${item.external_id}`} alt=""
                className="absolute inset-0 h-full w-full object-cover opacity-30" />
              <div className="relative max-w-md p-6 text-center">
                <p className="mb-4 text-sm leading-relaxed text-slate-200">{t("social.consentText")}</p>
                <button
                  onClick={() => { try { localStorage.setItem(CONSENT_KEY, "1"); } catch { /* egal */ } setDarfLaden(true); }}
                  className="rounded-xl bg-brand-500 px-4 py-2 font-semibold text-slate-950">
                  {t("social.consentPlay")}
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="mt-2 flex items-start gap-3 text-white">
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{item.title || "—"}</div>
            <div className="truncate text-sm text-slate-300">{item.user_name || "?"}</div>
          </div>
          {/* Im datensparsamen nocookie-Modus gibt es keine YouTube-Sitzung im iframe — Liken und
              Abonnieren geht dort also nicht (Jan, 30.08.). Wer das will, kommt mit einem Klick
              hin; das hilft auch dem, der das Video gemacht hat. */}
          <a href={item.url} target="_blank" rel="noopener noreferrer"
            className="shrink-0 rounded-lg bg-white/10 px-2.5 py-1 text-xs text-slate-200 hover:bg-white/20">
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
