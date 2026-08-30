import { useEffect, useState, useCallback } from "react";
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
export function SocialFeed() {
  const t = useT();
  const [items, setItems] = useState<SocialItem[] | null>(null);
  const [offen, setOffen] = useState<number | null>(null);   // Index im Feed

  useEffect(() => { api.socialFeed().then(setItems).catch(() => setItems([])); }, []);

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
        <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2">
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
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/90 p-4" onClick={onClose}>
      <button onClick={onClose} aria-label={t("common.close")}
        className="absolute right-3 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        style={{ top: "calc(0.75rem + env(safe-area-inset-top))" }}>
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>

      {hatZurueck && (
        <button onClick={(e) => { e.stopPropagation(); onZurueck(); }} aria-label={t("social.prev")}
          className="absolute left-2 z-10 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 sm:left-6">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
      )}
      {hatWeiter && (
        <button onClick={(e) => { e.stopPropagation(); onWeiter(); }} aria-label={t("social.next")}
          className="absolute right-2 z-10 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 sm:right-6">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
        </button>
      )}

      <div className="w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
        <div className="aspect-video w-full">
          <iframe
            key={item.external_id}
            className="h-full w-full rounded-xl"
            src={`https://www.youtube-nocookie.com/embed/${item.external_id}?autoplay=1&rel=0&playsinline=1`}
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
