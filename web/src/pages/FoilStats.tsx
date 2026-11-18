import { Fragment, useEffect, useState } from "react";
import { ZurueckPfeil } from "../components/ZurueckPfeil";
import { Link } from "react-router-dom";
import { api, type FoilStatWerte } from "../lib/api";
import { Card, Spinner } from "../components/ui";
import { WatchIcon, FoilIcon } from "../components/Icons";
import { useSort, SortHead } from "../components/SortableTable";
import { usePumpFmt } from "../lib/pumpRate";
import { useT } from "../i18n";
import { fmtLaufDauer } from "../lib/dauer";

// m:ss wie bei den Rekorden auf der Startseite (Home.tsx) — dieselbe Kennzahl, dieselbe Schreibweise.
const fmtDur = (s: number) => fmtLaufDauer(s);

type Row = Awaited<ReturnType<typeof api.foilStats>>[number];

// Community-Vergleich je Foil: welche Werte werden mit welchem Material gefahren.
export default function FoilStats() {
  const t = useT();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [nurBrett, setNurBrett] = useState(false);
  // Nur Laeufe ab N Minuten (Jan 18.11.2026): Zahlen dann aus den einzelnen Laeufen statt aus Session-Summen.
  const [minLauf, setMinLauf] = useState(0);
  const sort = useSort<Row>(rows, "sessions", "desc", {
    foil: (r) => `${r.brand} ${r.model} ${r.size}`,
  });

  useEffect(() => {
    setRows(null);
    api.foilStats(nurBrett, minLauf * 60, true).then(setRows).catch(() => setRows([]));
  }, [nurBrett, minLauf]);

  return (
    <div className="w-full">
      <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="flex items-center gap-2 text-xl font-bold"><ZurueckPfeil fallback="/community" /><FoilIcon className="h-6 w-6 text-brand-400" /> {t("foilStats.title")}</h2>
        {/* Umschalter auf die genaueren Zahlen: ein Handy am Brett sitzt fest, misst schneller und
            hat den Kreisel dabei. Direkt neben der Ueberschrift (Jan, 22.09.), bricht auf schmalen
            Schirmen in die naechste Zeile statt die Zeile zu sprengen. */}
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={nurBrett} onChange={(e) => setNurBrett(e.target.checked)}
            className="h-4 w-4 accent-brand-500" />
          {t("foilStats.onlyBoard")}
        </label>
        <select value={minLauf} onChange={(e) => setMinLauf(Number(e.target.value))} aria-label={t("foilStats.minRun")}
          className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100">
          <option value={0}>{t("foilStats.minRunAll")}</option>
          {[1, 3, 5, 10, 30].map((m) => <option key={m} value={m}>{t("foilStats.minRunAb", { min: m })}</option>)}
        </select>
        <Link to="/watch-stats" title={t("watchStats.title")} aria-label={t("watchStats.title")}
          className="ml-auto inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-brand-600 dark:text-brand-300 hover:bg-slate-700">
          <WatchIcon className="h-4 w-4" /> <span className="hidden sm:inline">{t("stats.short")}</span>
        </Link>
      </div>
      <p className="mb-2 text-sm text-slate-300">{t("foilStats.hint")} {t("foilStats.clickHint")}</p>
      {/* Low End (01.11.2026, Feedback foiling_fabs): was die Spalte misst, steht hier — nicht nur im Tooltip. */}
      <p className="mb-4 text-sm text-slate-400">{t("foilStats.lowEndHint")}</p>
      <p className="-mt-2 mb-4 text-sm text-slate-400">{t("foilStats.scootHint")}</p>
      {minLauf > 0 && <p className="-mt-2 mb-4 text-sm font-medium text-brand-700 dark:text-brand-300">{t("foilStats.minRunHint", { min: minLauf })}</p>}

      {!rows ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center text-slate-300">
          {nurBrett ? t("foilStats.noneBoard") : t("foilStats.none")}
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="w-full min-w-[800px] border-collapse text-sm">
            <thead>
              <tr className="bg-slate-900/70 text-left text-slate-300">
                <SortHead label={t("foilStats.colFoil")} sortKey="foil" sort={sort} align="left" defaultDir="asc" />
                <SortHead label={t("foilStats.colSessions")} sortKey="sessions" sort={sort} />
                <SortHead label={t("foilStats.colUsers")} sortKey="users" sort={sort} />
                <SortHead label={t("foilStats.colAvgSpeed")} sortKey="avg_speed_kmh" sort={sort} />
                <SortHead label={t("foilStats.colMetersPerPump")} sortKey="meters_per_pump" sort={sort} />
                <SortHead label={t("foilStats.colBestDist")} sortKey="best_distance_m" sort={sort} />
                <SortHead label={t("rec.longestRun")} sortKey="best_duration_s" sort={sort} />
                <SortHead label={t("foilStats.colAvgPump")} sortKey="avg_pump_hz" sort={sort} />
                <SortHead label={t("foilStats.colLowEnd")} sortKey="low_end_kmh" sort={sort} />
              </tr>
            </thead>
            <tbody>
              {sort.sorted!.map((r) => (
                <Fragment key={r.foil_id}>
                <tr className="border-t border-slate-800">
                  {/* Anklickbar (Nutzer-Vorschlag 04.09.): fuehrt zur Foil-Detailseite mit den
                      Community-Rekorden dieses Fluegels und den eigenen Sessions damit. */}
                  <td className="px-4 py-3">
                    <Link to={`/foil-stats/${r.foil_id}`} className="group block">
                      {/* Hover-Farbe fuer BEIDE Modi: brand-300 ist ein helles Cyan, auf weissem
                          Grund verschwindet es fast (s. Memory light-mode-contrast-pattern).
                          Im Hellen daher die dunklere Stufe. */}
                      <div className="font-semibold group-hover:text-brand-700 dark:group-hover:text-brand-300">
                        {r.brand} {r.model} <span className="text-slate-400">{r.size}</span>
                      </div>
                      <div className="text-xs text-slate-400">AR {r.aspect_ratio ?? "–"}</div>
                    </Link>
                  </td>
                  <Werte w={r} />
                  <td className="px-4 py-3 text-right tabular-nums">
                    {r.low_end_kmh != null ? `${r.low_end_kmh.toFixed(1)} km/h` : (
                      <span className="cursor-help text-slate-400" title={t("foilStats.lowEndWenig", { fahrer: String(r.low_end_fahrer), laeufe: String(r.low_end_laeufe) })}>–</span>
                    )}
                  </td>
                </tr>
                {/* Zweite Zeile: dasselbe Foil am Foil Scooter (Jan 18.11.2026), Low End gibt es dort nicht. */}
                {r.scoot && (
                  <tr className="bg-slate-900/40">
                    <td className="py-2 pl-8 pr-4 text-xs text-slate-400">↳ {t("cls.sport.foil_scoot")}</td>
                    <Werte w={r.scoot} klein />
                    <td className="px-4 py-2 text-right text-slate-400">–</td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Die sieben Kennzahlen einer Zeile — gleich fuer die Pumpfoil-Zeile und die Scooter-Zweitzeile.
function Werte({ w, klein }: { w: FoilStatWerte; klein?: boolean }) {
  const t = useT();
  const pf = usePumpFmt();
  const td = `px-4 ${klein ? "py-2 text-slate-300" : "py-3"} text-right tabular-nums`;
  const leer = w.sessions === 0;
  return (
    <>
      <td className={td}>{leer ? "–" : w.sessions}
        {w.laeufe != null && !leer && <span className="block text-xs text-slate-400">{t("foilStats.runsN", { n: w.laeufe })}</span>}</td>
      <td className={td}>{leer ? "–" : w.users}</td>
      <td className={td}>{w.avg_speed_kmh != null ? `${w.avg_speed_kmh.toFixed(1)} km/h` : "–"}</td>
      <td className={td}>{w.meters_per_pump != null ? `${w.meters_per_pump.toFixed(1)} m` : "–"}</td>
      <td className={td}>{w.best_distance_m != null ? `${w.best_distance_m} m` : "–"}</td>
      <td className={td}>{w.best_duration_s != null ? fmtDur(w.best_duration_s) : "–"}</td>
      <td className={td}>{pf.fmt(w.avg_pump_hz)}</td>
    </>
  );
}
