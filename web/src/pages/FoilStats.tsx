import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Card, Spinner } from "../components/ui";
import { ChevronIcon } from "../components/Icons";
import { useT } from "../i18n";

type Row = Awaited<ReturnType<typeof api.foilStats>>[number];

// Community-Vergleich je Foil: welche Werte werden mit welchem Material gefahren.
export default function FoilStats() {
  const t = useT();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => { api.foilStats().then(setRows).catch(() => setRows([])); }, []);

  return (
    <div className="w-full">
      <Link to="/community" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-300 hover:text-slate-200">
        <ChevronIcon className="h-4 w-4 rotate-180" /> {t("home.community")}
      </Link>
      <h2 className="mb-1 text-xl font-bold">{t("foilStats.title")}</h2>
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
                <th className="px-4 py-3 font-semibold">{t("foilStats.colFoil")}</th>
                <th className="px-4 py-3 text-right font-semibold">{t("foilStats.colSessions")}</th>
                <th className="px-4 py-3 text-right font-semibold">{t("foilStats.colUsers")}</th>
                <th className="px-4 py-3 text-right font-semibold">{t("foilStats.colAvgSpeed")}</th>
                <th className="px-4 py-3 text-right font-semibold">{t("foilStats.colMetersPerPump")}</th>
                <th className="px-4 py-3 text-right font-semibold">{t("foilStats.colBestDist")}</th>
                <th className="px-4 py-3 text-right font-semibold">{t("foilStats.colAvgPump")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.foil_id} className="border-t border-slate-800">
                  <td className="px-4 py-3">
                    <div className="font-semibold">{r.brand} {r.model} <span className="text-slate-400">{r.size}</span></div>
                    <div className="text-xs text-slate-400">AR {r.aspect_ratio ?? "–"}</div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.sessions}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.users}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.avg_speed_kmh != null ? `${r.avg_speed_kmh} km/h` : "–"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.meters_per_pump != null ? `${r.meters_per_pump} m` : "–"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.best_distance_m != null ? `${r.best_distance_m} m` : "–"}</td>
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
