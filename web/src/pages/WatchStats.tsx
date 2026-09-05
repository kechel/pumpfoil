import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { usePumpFmt } from "../lib/pumpRate";
import { Card, Spinner } from "../components/ui";
import { ChevronIcon, WatchIcon, FoilIcon } from "../components/Icons";
import { useSort, SortHead } from "../components/SortableTable";
import { useT } from "../i18n";

type Row = Awaited<ReturnType<typeof api.watchStats>>[number];

/**
 * „Wie gut zeichnen die Uhren auf?" — gemessen an unseren eigenen Aufnahmen, nicht an
 * Herstellerangaben (Jan, 05.09.2026).
 *
 * Die Zahlen kommen als fertiger Snapshot vom Server (`/api/app/watch-quality`, erzeugt von
 * `scripts/uhren-qualitaet.py`). Live rechnen ginge nicht: das Skript liest je Session die
 * Rohpunkte und laeuft Minuten.
 *
 * Drei Dinge stehen bewusst dabei, weil die Tabelle sonst mehr behauptet, als sie weiss:
 * - **Stand und Datenbasis** ueber der Tabelle. Der Snapshot wird alle paar Wochen erneuert.
 * - **Zahl der Fahrer je Modell.** Unter `WENIG_NUTZER` wird nichts Feines mehr gezeigt: bei
 *   zwei Fahrern ist ein Median aus zwei Werten keine Aussage ueber ein Uhrmodell.
 * - **Ortungsguete steht getrennt.** Garmin liefert eine Stufe (Connect IQ, „GOOD"), die
 *   anderen Meter — eine gemeinsame Spalte waere schlicht falsch.
 */
const WENIG_NUTZER = 3;

function Uhrenqualitaet() {
  const t = useT();
  const [d, setD] = useState<Awaited<ReturnType<typeof api.watchQuality>> | null>(null);
  useEffect(() => { api.watchQuality().then(setD).catch(() => setD(null)); }, []);
  if (!d || !d.modelle?.length) return null;

  const urteil = (u: string) =>
    u === "empfohlen" ? { text: t("watchQuality.good"), cls: "text-emerald-700 dark:text-emerald-400" }
    : u === "nur GPS" ? { text: t("watchQuality.gpsOnly"), cls: "text-[#c24100] dark:text-[#ff5500]" }
    : { text: t("watchQuality.limited"), cls: "text-amber-700 dark:text-amber-400" };

  return (
    <section className="mt-10">
      <h3 className="mb-1 text-lg font-bold">{t("watchQuality.title")}</h3>
      <p className="mb-2 text-sm text-slate-400">
        {t("watchQuality.lead", { sessions: String(d.sessions ?? 0), hours: String(d.stunden ?? 0),
                                  date: d.stand })}
      </p>
      {/* Ehrlicher Vorbehalt statt Kleingedrucktem: die Auswertung ist jung, und die duennen
          Zeilen sind es besonders. Steht bewusst UEBER der Tabelle — wer nur die Zahlen sieht,
          liest den Hinweis darunter nicht mehr. */}
      <p className="mb-3 rounded-lg bg-slate-800/60 p-2.5 text-sm text-slate-300">
        {t("watchQuality.new")}
      </p>
      <div className="overflow-x-auto rounded-2xl border border-slate-800">
        <table className="w-full min-w-[680px] border-collapse text-sm">
          <thead>
            <tr className="bg-slate-900/70 text-left text-slate-300">
              <th className="px-4 py-3">{t("watchStats.colWatch")}</th>
              <th className="px-4 py-3 text-right">{t("watchStats.colUsers")}</th>
              <th className="px-4 py-3 text-right">{t("watchStats.colSessions")}</th>
              <th className="px-4 py-3 text-right">{t("watchQuality.colPump")}</th>
              <th className="px-4 py-3 text-right">{t("watchQuality.colGps")}</th>
              <th className="px-4 py-3 text-right">{t("watchQuality.colHr")}</th>
              <th className="px-4 py-3">{t("watchQuality.colVerdict")}</th>
            </tr>
          </thead>
          <tbody>
            {d.modelle.map((r) => {
              const u = urteil(r.urteil);
              const duenn = r.nutzer < WENIG_NUTZER;
              const gps = r.guete_gut != null ? t("watchQuality.gpsGood", { pct: r.guete_gut.toFixed(0) })
                        : r.hacc_m != null ? `${r.hacc_m.toFixed(1)} m` : "–";
              return (
                <tr key={`${r.plattform}-${r.modell}`} className="border-t border-slate-800">
                  <td className="px-4 py-3 font-semibold">{r.modell}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {r.nutzer}
                    {duenn && <span className="ml-1 text-xs text-slate-500">{t("watchQuality.few")}</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.sessions}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {r.accel_hz != null ? `${r.accel_hz.toFixed(0)} Hz` : "–"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{duenn ? "–" : gps}</td>
                  {/* Puls als WERTWECHSEL je Minute. Der Anteil fehlender Werte taugte nicht:
                      bis App 1.1.29 schrieb die Apple Watch den letzten bekannten Wert in jeden
                      Punkt — 99,5 % der Punkte trugen einen Wert, er war nur alt. Ein Wechsel
                      entsteht dagegen nur bei einer echten neuen Messung. */}
                  <td className="px-4 py-3 text-right tabular-nums">
                    {duenn || r.puls_wechsel == null ? "–"
                      : t("watchQuality.hrRate", { n: r.puls_wechsel.toFixed(0) })}
                  </td>
                  <td className={`px-4 py-3 font-medium ${u.cls}`}>{u.text}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-slate-400">{t("watchQuality.note")}</p>
    </section>
  );
}

// Community-Vergleich je Uhr-Modell: was wird mit welcher Uhr gefahren.
export default function WatchStats() {
  const t = useT();
  const pf = usePumpFmt();
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
        <Link to="/foil-stats" title={t("foilStats.title")} aria-label={t("foilStats.title")}
          className="ml-auto inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-brand-300 hover:bg-slate-700">
          <FoilIcon className="h-4 w-4" /> <span className="hidden sm:inline">{t("stats.short")}</span>
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
                  <td className="px-4 py-3 text-right tabular-nums">{pf.fmt(r.avg_pump_hz)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Uhrenqualitaet />
    </div>
  );
}
