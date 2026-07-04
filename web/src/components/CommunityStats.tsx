import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useT } from "../i18n";

// Schlanke Stats-Leiste (nur die Zahlen aus dem Willkommens-Banner), dauerhaft oben im
// Community-Bereich. Nutzt denselben Satz/Endpoint; Zahlen (§-markiert) fett/cyan.
export function CommunityStats({ className = "" }: { className?: string }) {
  const t = useT();
  const [stats, setStats] = useState<{ foilers: number; spots: number; sessions: number; pumps: number } | null>(null);
  useEffect(() => { api.communityStats().then(setStats).catch(() => {}); }, []);
  if (!stats) return null;

  const parts = t("banner.stats", {
    foilers: stats.foilers, spots: stats.spots, sessions: stats.sessions, pumps: stats.pumps.toLocaleString(),
  }).split("§");

  return (
    <div className={`rounded-2xl border border-brand-500/30 bg-gradient-to-br from-brand-500/15 via-brand-400/10 to-transparent px-4 py-2.5 text-sm text-slate-300 ${className}`}>
      {parts.map((p, i) =>
        i % 2 === 1
          ? <span key={i} className="font-bold tabular-nums text-brand-300">{p}</span>
          : <span key={i}>{p}</span>
      )}
    </div>
  );
}
