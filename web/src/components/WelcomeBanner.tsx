import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useT } from "../i18n";
import { CloseIcon } from "./Icons";

// Willkommens-/Community-Banner oben im Start-Bereich. Schließbar (localStorage);
// beim Bump von DISMISS_KEY taucht er wieder auf (z. B. bei großen Neuerungen).
const DISMISS_KEY = "foil_banner_v1";

export function WelcomeBanner() {
  const t = useT();
  const [stats, setStats] = useState<{ foilers: number; spots: number; sessions: number; pumps: number } | null>(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === "1");

  useEffect(() => {
    if (dismissed) return;
    api.communityStats().then(setStats).catch(() => {});
  }, [dismissed]);

  if (dismissed) return null;

  const close = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

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
    </div>
  );
}
