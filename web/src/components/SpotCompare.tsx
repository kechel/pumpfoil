import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, SpotAgg, SpotRecHolder } from "../lib/api";
import { Card, Avatar } from "./ui";
import { LocationIcon } from "./Icons";
import { useT } from "../i18n";
import { fmtDate } from "../lib/time";

// Zeitfenster wie bei den Community-Rekorden.
const PERIODS: [string, string][] = [
  ["today", "period.today"], ["10d", "period.10d"], ["30d", "period.30d"],
  ["365d", "period.365d"], ["all", "period.all"],
];

function fmtDur(s: number): string {
  const m = Math.round(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

// Eine Vergleichs-Kennzahl. `holder` gesetzt = Einzel-Rekord (von einer Session/einem Lauf
// gewonnen) -> Karte zeigt zusätzlich Name + Datum und verlinkt die Session.
type Metric = {
  label: string;
  fmt: (v: number) => string;
  val: (s: SpotAgg) => number;
  holder?: (s: SpotAgg) => SpotRecHolder | null;
};

// Spot-Vergleich unter der Karte: je Kennzahl der führende Spot + der eigene/gewählte Spot
// im Vergleich (Wert + Rang). Layout wie die Community-Rekorde, aber ohne Track; Name/Zeit
// nur bei Einzel-Rekorden. Zeitfenster wie in der Community.
export function SpotCompare() {
  const t = useT();
  const [period, setPeriod] = useState("10d");
  const [data, setData] = useState<SpotAgg[] | null>(null);
  const [sel, setSel] = useState("");   // Vergleichsspot (place_name)

  // Beim Zeitfenster-Wechsel die alten Daten NICHT leeren (sonst klappt das Grid kurz auf „…"
  // zusammen -> Layout-Sprung/Flackern). Nur ersetzen, sobald die neuen da sind; späte Antworten
  // eines überholten Requests verwerfen.
  useEffect(() => {
    let alive = true;
    api.spotCompare(period).then((r) => { if (alive) setData(r.spots); }).catch(() => { if (alive) setData([]); });
    return () => { alive = false; };
  }, [period]);

  // Default-Vergleichsspot = Homespot (einmalig, sobald bekannt).
  useEffect(() => {
    api.getSettings().then((s) => { if (s.homespot) setSel(s.homespot); }).catch(() => {});
  }, []);

  const metrics: Metric[] = [
    { label: t("leader.mostSessions"), fmt: (v) => String(v), val: (s) => s.sessions },
    { label: t("leader.mostRuns"), fmt: (v) => String(v), val: (s) => s.runs },
    { label: t("leader.mostPumps"), fmt: (v) => String(v), val: (s) => s.pumps },
    { label: t("spotcmp.foilers"), fmt: (v) => String(v), val: (s) => s.foilers },
    { label: t("spotcmp.distance"), fmt: (v) => `${v} km`, val: (s) => s.foiling_km },
    { label: t("rec.sessionTime"), fmt: fmtDur, val: (s) => s.onfoil_s },
    {
      label: t("rec.farthestRun"), fmt: (v) => (v >= 1000 ? `${(v / 1000).toFixed(2)} km` : `${Math.round(v)} m`),
      val: (s) => s.longest_run?.value ?? 0, holder: (s) => s.longest_run,
    },
    {
      label: t("rec.topSpeed"), fmt: (v) => `${v} km/h`,
      val: (s) => s.top_speed?.value ?? 0, holder: (s) => s.top_speed,
    },
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {metrics.map((m) => {
            const ranked = data.filter((x) => m.val(x) > 0).sort((a, b) => m.val(b) - m.val(a));
            const leader = ranked[0];
            if (!leader) return null;
            const lh = m.holder ? m.holder(leader) : null;
            const rank = sel ? ranked.findIndex((x) => x.spot === sel) + 1 : 0;
            const inner = (
              <Card className="h-full p-3">
                <div className="text-lg font-bold tabular-nums text-brand-400">{m.fmt(m.val(leader))}</div>
                <div className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-300">{m.label}</div>
                <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-200">
                  <LocationIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="truncate">{leader.spot}</span>
                </div>
                {/* Name + Datum nur bei Einzel-Rekorden (von einer Session/einem Lauf gewonnen). */}
                {lh && (lh.name || lh.started_at) && (
                  <div className="mt-0.5 text-[11px] text-slate-300">
                    {lh.name && (
                      <span className="inline-flex items-center gap-1 align-middle">
                        <Avatar name={lh.name} url={null} size={18} />
                        <span className="text-brand-300">{lh.name}</span>
                      </span>
                    )}
                    {lh.started_at && (
                      <span className="text-slate-400">
                        {lh.name ? " · " : ""}
                        {fmtDate(lh.started_at, lh.tz, { day: "2-digit", month: "short", year: "2-digit" })}
                      </span>
                    )}
                  </div>
                )}
                {/* Vergleichsspot (nur wenn gewählt und nicht selbst der Führende). */}
                {selAgg && leader.spot !== sel && (
                  <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-800 pt-2 text-[11px]">
                    <span className="flex min-w-0 items-center gap-1 text-slate-300">
                      <LocationIcon className="h-3 w-3 shrink-0 text-slate-500" />
                      <span className="truncate">{selAgg.spot}</span>
                      {rank > 0 && <span className="shrink-0 text-slate-500">#{rank}/{ranked.length}</span>}
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-200">
                      {m.val(selAgg) > 0 ? m.fmt(m.val(selAgg)) : "—"}
                    </span>
                  </div>
                )}
              </Card>
            );
            // Einzel-Rekord -> Link zur Session; Aggregat -> Link zur Session-Liste des Spots.
            const to = lh?.session_id
              ? `/sessions/${lh.session_id}${lh.run_idx != null ? `?run=${lh.run_idx}` : ""}`
              : `/sessions?spot=${leader.spot_id ?? encodeURIComponent(leader.spot)}`;
            return (
              <Link key={m.label} to={to} className="block transition-colors hover:opacity-90">{inner}</Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
