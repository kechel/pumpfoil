import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Card, Spinner } from "../components/ui";
import { ChevronIcon, WatchIcon } from "../components/Icons";
import { useT } from "../i18n";

type Row = Awaited<ReturnType<typeof api.watchStats>>[number];

// Community-Vergleich je Uhr-Modell: was wird mit welcher Uhr gefahren.
export default function WatchStats() {
  const t = useT();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => { api.watchStats().then(setRows).catch(() => setRows([])); }, []);

  return (
    <div className="w-full">
      <Link to="/community" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-300 hover:text-slate-200">
        <ChevronIcon className="h-4 w-4 rotate-180" /> {t("home.community")}
      </Link>
      <h2 className="mb-1 flex items-center gap-2 text-xl font-bold"><WatchIcon className="h-6 w-6 text-brand-400" /> {t("watchStats.title")}</h2>
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
                <th className="px-4 py-3 font-semibold">{t("watchStats.colWatch")}</th>
                <th className="px-4 py-3 text-right font-semibold">{t("watchStats.colSessions")}</th>
                <th className="px-4 py-3 text-right font-semibold">{t("watchStats.colUsers")}</th>
                <th className="px-4 py-3 text-right font-semibold">{t("watchStats.colKm")}</th>
                <th className="px-4 py-3 text-right font-semibold">{t("watchStats.colAvgSpeed")}</th>
                <th className="px-4 py-3 text-right font-semibold">{t("watchStats.colBestDist")}</th>
                <th className="px-4 py-3 text-right font-semibold">{t("watchStats.colBestSpeed")}</th>
                <th className="px-4 py-3 text-right font-semibold">{t("watchStats.colAvgPump")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.watch} className="border-t border-slate-800">
                  <td className="px-4 py-3 font-semibold">{r.watch}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.sessions}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.users}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.foiling_km} km</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.avg_speed_kmh != null ? `${r.avg_speed_kmh} km/h` : "–"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.best_distance_m != null ? `${r.best_distance_m} m` : "–"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.best_speed_kmh != null ? `${r.best_speed_kmh} km/h` : "–"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.avg_pump_hz != null ? `${r.avg_pump_hz} Hz` : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
