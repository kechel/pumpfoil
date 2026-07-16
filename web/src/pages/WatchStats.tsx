import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Card, Spinner } from "../components/ui";
import { ChevronIcon, WatchIcon, FoilIcon } from "../components/Icons";
import { useSort, SortHead } from "../components/SortableTable";
import { useT } from "../i18n";

type Row = Awaited<ReturnType<typeof api.watchStats>>[number];

// Community-Vergleich je Uhr-Modell: was wird mit welcher Uhr gefahren.
export default function WatchStats() {
  const t = useT();
  const [rows, setRows] = useState<Row[] | null>(null);
  const sort = useSort<Row>(rows, "sessions", "desc");

  useEffect(() => { api.watchStats().then(setRows).catch(() => setRows([])); }, []);

  return (
    <div className="w-full">
      <Link to="/community" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-300 hover:text-slate-200">
        <ChevronIcon className="h-4 w-4 rotate-180" /> {t("home.community")}
      </Link>
      <div className="mb-1 flex items-center gap-2">
        <h2 className="flex items-center gap-2 text-xl font-bold"><WatchIcon className="h-6 w-6 text-brand-400" /> {t("watchStats.title")}</h2>
        <Link to="/foil-stats" title={t("foilStats.title")} className="ml-auto inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-brand-300 hover:bg-slate-700">
          <FoilIcon className="h-4 w-4" /> {t("stats.short")}
        </Link>
      </div>
      <p className="mb-4 text-sm text-slate-300">{t("watchStats.hint")}</p>

      {!rows ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center text-slate-300">{t("watchStats.none")}</Card>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="w-full min-w-[680px] border-collapse text-sm">
            <thead>
              <tr className="bg-slate-900/70 text-left text-slate-300">
                <SortHead label={t("watchStats.colWatch")} sortKey="watch" sort={sort} align="left" defaultDir="asc" />
                <SortHead label={t("watchStats.colSessions")} sortKey="sessions" sort={sort} />
                <SortHead label={t("watchStats.colUsers")} sortKey="users" sort={sort} />
                <SortHead label={t("watchStats.colKm")} sortKey="foiling_km" sort={sort} />
                <SortHead label={t("watchStats.colAvgSpeed")} sortKey="avg_speed_kmh" sort={sort} />
                <SortHead label={t("watchStats.colBestDist")} sortKey="best_distance_m" sort={sort} />
                <SortHead label={t("watchStats.colBestSpeed")} sortKey="best_speed_kmh" sort={sort} />
                <SortHead label={t("watchStats.colAvgPump")} sortKey="avg_pump_hz" sort={sort} />
              </tr>
            </thead>
            <tbody>
              {sort.sorted!.map((r) => (
                <tr key={r.watch} className="border-t border-slate-800">
                  <td className="px-4 py-3 font-semibold">{r.watch}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.sessions}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.users}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.foiling_km} km</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.avg_speed_kmh != null ? `${r.avg_speed_kmh.toFixed(1)} km/h` : "–"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.best_distance_m != null ? `${r.best_distance_m} m` : "–"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.best_speed_kmh != null ? `${r.best_speed_kmh.toFixed(1)} km/h` : "–"}</td>
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
