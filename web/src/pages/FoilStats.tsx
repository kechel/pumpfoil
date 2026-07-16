import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Card, Spinner } from "../components/ui";
import { ChevronIcon, WatchIcon } from "../components/Icons";
import { useSort, SortHead } from "../components/SortableTable";
import { useT } from "../i18n";

type Row = Awaited<ReturnType<typeof api.foilStats>>[number];

// Community-Vergleich je Foil: welche Werte werden mit welchem Material gefahren.
export default function FoilStats() {
  const t = useT();
  const [rows, setRows] = useState<Row[] | null>(null);
  const sort = useSort<Row>(rows, "sessions", "desc", {
    foil: (r) => `${r.brand} ${r.model} ${r.size}`,
  });

  useEffect(() => { api.foilStats().then(setRows).catch(() => setRows([])); }, []);

  return (
    <div className="w-full">
      <Link to="/community" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-300 hover:text-slate-200">
        <ChevronIcon className="h-4 w-4 rotate-180" /> {t("home.community")}
      </Link>
      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-xl font-bold">{t("foilStats.title")}</h2>
        <Link to="/watch-stats" title={t("watchStats.title")} className="ml-auto inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-brand-300 hover:bg-slate-700">
          <WatchIcon className="h-4 w-4" /> {t("watchStats.title")}
        </Link>
      </div>
      <p className="mb-4 text-sm text-slate-300">{t("foilStats.hint")}</p>

      {!rows ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center text-slate-300">{t("foilStats.none")}</Card>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="bg-slate-900/70 text-left text-slate-300">
                <SortHead label={t("foilStats.colFoil")} sortKey="foil" sort={sort} align="left" defaultDir="asc" />
                <SortHead label={t("foilStats.colSessions")} sortKey="sessions" sort={sort} />
                <SortHead label={t("foilStats.colUsers")} sortKey="users" sort={sort} />
                <SortHead label={t("foilStats.colAvgSpeed")} sortKey="avg_speed_kmh" sort={sort} />
                <SortHead label={t("foilStats.colMetersPerPump")} sortKey="meters_per_pump" sort={sort} />
                <SortHead label={t("foilStats.colBestDist")} sortKey="best_distance_m" sort={sort} />
                <SortHead label={t("foilStats.colAvgPump")} sortKey="avg_pump_hz" sort={sort} />
              </tr>
            </thead>
            <tbody>
              {sort.sorted!.map((r) => (
                <tr key={r.foil_id} className="border-t border-slate-800">
                  <td className="px-4 py-3">
                    <div className="font-semibold">{r.brand} {r.model} <span className="text-slate-400">{r.size}</span></div>
                    <div className="text-xs text-slate-400">AR {r.aspect_ratio ?? "–"}</div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.sessions}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.users}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.avg_speed_kmh != null ? `${r.avg_speed_kmh.toFixed(1)} km/h` : "–"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.meters_per_pump != null ? `${r.meters_per_pump.toFixed(1)} m` : "–"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.best_distance_m != null ? `${r.best_distance_m} m` : "–"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.avg_pump_hz != null ? `${r.avg_pump_hz.toFixed(2)} Hz` : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
