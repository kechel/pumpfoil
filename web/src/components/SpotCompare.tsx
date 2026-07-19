import { useEffect, useState } from "react";
import { api, SpotAgg } from "../lib/api";
import { Card } from "./ui";
import { useT } from "../i18n";

// Zeitfenster wie bei den Community-Rekorden.
const PERIODS: [string, string][] = [
  ["today", "period.today"], ["10d", "period.10d"], ["30d", "period.30d"],
  ["365d", "period.365d"], ["all", "period.all"],
];

type MetricKey = "sessions" | "runs" | "pumps" | "foilers"
  | "foiling_km" | "longest_run_m" | "top_speed_kmh" | "onfoil_s";

function fmtDur(s: number): string {
  const m = Math.round(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

// Spot-Vergleich unter der Karte: je Kennzahl der führende Spot + der eigene/gewählte Spot
// im Vergleich (Wert + Rang). Zeitfenster wie in der Community.
export function SpotCompare() {
  const t = useT();
  const [period, setPeriod] = useState("all");
  const [data, setData] = useState<SpotAgg[] | null>(null);
  const [sel, setSel] = useState("");   // Vergleichsspot (place_name)

  useEffect(() => {
    setData(null);
    api.spotCompare(period).then((r) => setData(r.spots)).catch(() => setData([]));
  }, [period]);

  // Default-Vergleichsspot = Homespot (einmalig, sobald bekannt).
  useEffect(() => {
    api.getSettings().then((s) => { if (s.homespot) setSel(s.homespot); }).catch(() => {});
  }, []);

  const metrics: { key: MetricKey; label: string; fmt: (v: number) => string }[] = [
    { key: "sessions", label: t("leader.mostSessions"), fmt: (v) => String(v) },
    { key: "runs", label: t("leader.mostRuns"), fmt: (v) => String(v) },
    { key: "pumps", label: t("leader.mostPumps"), fmt: (v) => String(v) },
    { key: "foilers", label: t("spotcmp.foilers"), fmt: (v) => String(v) },
    { key: "foiling_km", label: t("spotcmp.distance"), fmt: (v) => `${v} km` },
    { key: "longest_run_m", label: t("rec.longestRun"), fmt: (v) => (v >= 1000 ? `${(v / 1000).toFixed(2)} km` : `${Math.round(v)} m`) },
    { key: "top_speed_kmh", label: t("rec.topSpeed"), fmt: (v) => `${v} km/h` },
    { key: "onfoil_s", label: t("rec.sessionTime"), fmt: fmtDur },
  ];

  const selAgg = data?.find((x) => x.spot === sel) || null;

  return (
    <div className="mt-6">
      <h3 className="mb-2 text-lg font-bold">{t("spotcmp.title")}</h3>

      {/* Zeitfenster */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {PERIODS.map(([p, k]) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`rounded-full px-3 py-1 text-xs ${period === p
              ? "bg-brand-500 font-semibold text-slate-950"
              : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}
          >{t(k)}</button>
        ))}
      </div>

      {/* Vergleichsspot wählen */}
      {data && data.length > 0 && (
        <select
          value={sel}
          onChange={(e) => setSel(e.target.value)}
          className="mb-3 w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
        >
          <option value="">{t("spotcmp.pick")}</option>
          {[...data].sort((a, b) => a.spot.localeCompare(b.spot)).map((s) => (
            <option key={s.spot} value={s.spot}>{s.spot}</option>
          ))}
        </select>
      )}

      {!data ? (
        <div className="text-sm text-slate-400">…</div>
      ) : data.length === 0 ? (
        <Card className="p-6 text-center text-sm text-slate-400">{t("spots.none")}</Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {metrics.map((m) => {
            const ranked = data.filter((x) => (x[m.key] as number) > 0)
              .sort((a, b) => (b[m.key] as number) - (a[m.key] as number));
            const leader = ranked[0];
            if (!leader) return null;
            const rank = selAgg ? ranked.findIndex((x) => x.spot === sel) + 1 : 0;
            const isLeader = selAgg && leader.spot === sel;
            return (
              <Card key={m.key} className="p-4">
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">{m.label}</div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-semibold text-slate-100">🏆 {leader.spot}</span>
                  <span className="shrink-0 font-bold text-brand-300">{m.fmt(leader[m.key] as number)}</span>
                </div>
                {selAgg && !isLeader && (
                  <div className="mt-2 flex items-baseline justify-between gap-2 border-t border-slate-800 pt-2 text-sm">
                    <span className="truncate text-slate-300">
                      {selAgg.spot}
                      {rank > 0 && <span className="ml-1 text-xs text-slate-500">#{rank}/{ranked.length}</span>}
                    </span>
                    <span className="shrink-0 text-slate-200">
                      {(selAgg[m.key] as number) > 0 ? m.fmt(selAgg[m.key] as number) : "—"}
                    </span>
                  </div>
                )}
                {isLeader && (
                  <div className="mt-2 border-t border-slate-800 pt-2 text-xs font-medium text-brand-400">
                    {t("spotcmp.yourSpot")} · #1
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
