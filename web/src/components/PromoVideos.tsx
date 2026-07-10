import { useState, useEffect, useRef } from "react";
import { api } from "../lib/api";
import { useT } from "../i18n";
import { ChevronIcon } from "./Icons";

// Promo-Videos vom YouTube-Kanal (@pumpfoil-org), live vom Kanal-RSS (gecacht serverseitig).
// Echter Slider (Pfeile + Punkte + Wisch), gleiche Mechanik wie der App-Screenshots-Slider.
// Click-to-Load-Fassade: erst Thumbnail (keine YouTube-Cookies/Skripte), beim Klick wird das
// datensparsame youtube-nocookie-iframe nachgeladen und spielt automatisch. Vertikale Shorts (9:16).
export function PromoVideos() {
  const t = useT();
  const [videos, setVideos] = useState<{ id: string; title: string }[]>([]);
  const [channel, setChannel] = useState("https://www.youtube.com/@pumpfoil-org");
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    api.publicVideos().then((r) => { setVideos(r.videos ?? []); if (r.channel) setChannel(r.channel); }).catch(() => {});
  }, []);

  // Wie viele Karten gleichzeitig (responsiv): mobil 2, ab sm 3, ab lg 4.
  const [perView, setPerView] = useState(2);
  useEffect(() => {
    const lg = window.matchMedia("(min-width: 1024px)");
    const sm = window.matchMedia("(min-width: 640px)");
    const upd = () => setPerView(lg.matches ? 4 : sm.matches ? 3 : 2);
    upd();
    lg.addEventListener("change", upd); sm.addEventListener("change", upd);
    return () => { lg.removeEventListener("change", upd); sm.removeEventListener("change", upd); };
  }, []);

  const pages = Math.max(Math.ceil(videos.length / perView), 1);
  const [page, setPage] = useState(0);
  const cur = Math.min(page, pages - 1);
  const goPage = (d: number) => setPage((p) => (Math.min(p, pages - 1) + d + pages) % pages);

  // Wisch auf Touch.
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const onTouchStart = (e: React.TouchEvent) => { startX.current = e.touches[0].clientX; setDragging(true); };
  const onTouchMove = (e: React.TouchEvent) => { if (dragging) setDrag(e.touches[0].clientX - startX.current); };
  const onTouchEnd = () => { setDragging(false); const dx = drag; setDrag(0); if (dx < -40) goPage(1); else if (dx > 40) goPage(-1); };

  if (!videos.length) return null;
  const showArrows = pages > 1;

  return (
    <section className="pb-12">
      <h2 className="mb-2 text-center text-xl font-bold sm:text-2xl">{t("land.videosTitle")}</h2>
      <p className="mx-auto mb-6 max-w-2xl text-center text-slate-300">{t("land.videosBody")}</p>

      <div className="mx-auto flex items-center justify-center gap-1 sm:gap-3">
        {showArrows && (
          <button onClick={() => goPage(-1)} aria-label={t("land.prev")}
            className="flex shrink-0 items-center px-1 text-slate-500 hover:text-brand-400">
            <ChevronIcon className="h-10 w-10 rotate-180 sm:h-14 sm:w-14" />
          </button>
        )}
        <div className="w-full overflow-hidden" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
          <div
            className={`flex ${dragging ? "" : "transition-transform duration-500 ease-out"}`}
            style={{ transform: `translateX(calc(-${cur * 100}% + ${drag}px))` }}
          >
            {Array.from({ length: pages }, (_, p) => (
              <div key={p} className="grid w-full shrink-0 gap-3 sm:gap-4"
                style={{ gridTemplateColumns: `repeat(${perView}, minmax(0, 1fr))` }}>
                {videos.slice(p * perView, p * perView + perView).map((v) => (
                  <div key={v.id}>
                    <div className="relative aspect-[9/16] overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-xl">
                      {active === v.id ? (
                        <iframe
                          className="absolute inset-0 h-full w-full"
                          src={`https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0&playsinline=1`}
                          title={v.title}
                          allow="autoplay; encrypted-media; picture-in-picture"
                          allowFullScreen
                          loading="lazy"
                        />
                      ) : (
                        <button onClick={() => setActive(v.id)} className="group absolute inset-0 h-full w-full" aria-label={v.title}>
                          <img
                            src={`/api/public/video-thumb/${v.id}`}
                            alt={v.title}
                            loading="lazy"
                            className="h-full w-full object-cover transition group-hover:scale-105"
                          />
                          <span className="absolute inset-0 bg-gradient-to-t from-slate-950/70 to-transparent" />
                          <span className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-brand-500/90 text-slate-950 shadow-lg transition group-hover:bg-brand-400 sm:h-14 sm:w-14">
                            <svg viewBox="0 0 24 24" className="ml-0.5 h-6 w-6 sm:h-7 sm:w-7" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                          </span>
                        </button>
                      )}
                    </div>
                    <p className="mt-2 line-clamp-2 px-0.5 text-xs text-slate-400">{v.title}</p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        {showArrows && (
          <button onClick={() => goPage(1)} aria-label={t("land.next")}
            className="flex shrink-0 items-center px-1 text-slate-500 hover:text-brand-400">
            <ChevronIcon className="h-10 w-10 sm:h-14 sm:w-14" />
          </button>
        )}
      </div>

      {pages > 1 && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {Array.from({ length: pages }, (_, i) => (
            <button key={i} onClick={() => setPage(i)} aria-label={`${i + 1}`}
              className={`h-2.5 rounded-full transition-all ${i === cur ? "w-6 bg-brand-400" : "w-2.5 bg-slate-600 hover:bg-slate-500"}`} />
          ))}
        </div>
      )}

      <div className="mt-5 text-center">
        <a href={channel} target="_blank" rel="noopener noreferrer"
          className="inline-block text-sm font-medium text-brand-400 hover:text-brand-300">
          {t("land.videosChannel")}
        </a>
      </div>
    </section>
  );
}
