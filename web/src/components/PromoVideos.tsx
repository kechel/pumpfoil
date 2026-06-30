import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { useT } from "../i18n";

// Promo-Videos vom YouTube-Kanal (@pumpfoil-org), live vom Kanal-RSS (gecacht serverseitig).
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
  if (!videos.length) return null;

  return (
    <section className="pb-12">
      <h2 className="mb-2 text-center text-xl font-bold sm:text-2xl">{t("land.videosTitle")}</h2>
      <p className="mx-auto mb-6 max-w-2xl text-center text-slate-300">{t("land.videosBody")}</p>
      <div className="flex snap-x gap-4 overflow-x-auto px-1 pb-3 [scrollbar-width:thin]">
        {videos.map((v) => (
          <div key={v.id} className="w-[180px] shrink-0 snap-start sm:w-[200px]">
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
                <button
                  onClick={() => setActive(v.id)}
                  className="group absolute inset-0 h-full w-full"
                  aria-label={v.title}
                >
                  <img
                    src={`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`}
                    alt={v.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition group-hover:scale-105"
                  />
                  <span className="absolute inset-0 bg-gradient-to-t from-slate-950/70 to-transparent" />
                  <span className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-brand-500/90 text-slate-950 shadow-lg transition group-hover:bg-brand-400">
                    <svg viewBox="0 0 24 24" className="ml-0.5 h-7 w-7" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                  </span>
                </button>
              )}
            </div>
            <p className="mt-2 line-clamp-2 px-0.5 text-xs text-slate-400">{v.title}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 text-center">
        <a
          href={channel}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-sm font-medium text-brand-400 hover:text-brand-300"
        >
          {t("land.videosChannel")}
        </a>
      </div>
    </section>
  );
}
