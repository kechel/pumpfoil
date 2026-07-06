import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, NewsBanner } from "../lib/api";
import { useI18n } from "../i18n";
import { CloseIcon } from "./Icons";

// Willkommens-/News-Banner oben im Start-Bereich. Inhalt + Version kommen aus der DB
// (API /api/app/news, im Admin gepflegt) — KEIN PWA-Rebuild nötig, um News zu posten.
// localStorage speichert die zuletzt weggeklickte Version; angezeigt wird, wenn der Banner
// aktiv ist UND seine Version > weggeklickte Version. Version bumpen = allen erneut zeigen.
const DISMISS_KEY = "foil_banner_v1";

export function WelcomeBanner() {
  const { t, lang } = useI18n();
  const [stats, setStats] = useState<{ foilers: number; spots: number; sessions: number; pumps: number } | null>(null);
  const [news, setNews] = useState<NewsBanner | null>(null);
  const [dismissedVer, setDismissedVer] = useState(() => Number(localStorage.getItem(DISMISS_KEY) || 0));

  useEffect(() => { api.newsBanner().then(setNews).catch(() => {}); }, []);

  const show = !!news && news.enabled && news.version > dismissedVer;

  useEffect(() => {
    if (show) api.communityStats().then(setStats).catch(() => {});
  }, [show]);

  if (!show || !news) return null;

  const close = () => {
    localStorage.setItem(DISMISS_KEY, String(news.version));
    setDismissedVer(news.version);
  };

  const newsText = news.texts[lang] || news.texts["de"] || "";

  // Stats-Satz: Zahlen sind mit § markiert -> fett/cyan gerendert (Wortstellung bleibt je Sprache erhalten).
  const parts = stats
    ? t("banner.stats", {
        foilers: stats.foilers,
        spots: stats.spots,
        sessions: stats.sessions,
        pumps: stats.pumps.toLocaleString(),
      }).split("§")
    : [];

  return (
    <div className="relative mb-5 overflow-hidden rounded-2xl border border-brand-500/30 bg-gradient-to-br from-brand-500/15 via-brand-400/10 to-transparent p-4 pr-10">
      <button onClick={close} aria-label={t("banner.dismiss")} title={t("banner.dismiss")}
        className="absolute right-2 top-2 rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-slate-200">
        <CloseIcon className="h-4 w-4" />
      </button>
      {newsText && <p className="mb-1.5 text-sm font-bold text-brand-300">{newsText}</p>}
      <p className="text-sm leading-relaxed text-slate-200">
        👋 <span className="font-semibold">Pumpfoil<span className="text-brand-400">.org</span></span> {t("banner.msg")}
      </p>
      {stats && (
        <p className="mt-1.5 text-sm text-slate-300">
          {parts.map((p, i) =>
            i % 2 === 1
              ? <span key={i} className="font-bold tabular-nums text-brand-300">{p}</span>
              : <span key={i}>{p}</span>
          )}
        </p>
      )}
      <p className="mt-2 text-sm text-slate-300">
        {t("banner.nerdLead")}{" "}
        <Link to="/nerd-analysen" className="font-medium text-brand-300 hover:underline">{t("banner.nerd1")}</Link>
        <span className="mx-1 text-slate-500">·</span>
        <Link to="/nerd-analysen-2" className="font-medium text-brand-300 hover:underline">{t("banner.nerd2")}</Link>
      </p>
    </div>
  );
}
