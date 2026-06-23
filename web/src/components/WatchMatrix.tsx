import { useT } from "../i18n";

// Daten-Matrix: welche Uhr liefert welche Daten. Wiederverwendbar (öffentliche
// /uhren-Seite + Login-Bereich /account).
type Cap = "yes" | "partial" | "no";
type Status = "avail" | "planned" | "import" | "no";

const ROWS: { name: string; sub: string; gps: Cap; hr: Cap; pump: Cap; status: Status; noteKey?: string }[] = [
  { name: "Garmin", sub: "Connect IQ · Fenix, Forerunner, Epix …", gps: "yes", hr: "yes", pump: "yes", status: "avail", noteKey: "watches.nGarmin" },
  { name: "Apple Watch", sub: "watchOS", gps: "yes", hr: "yes", pump: "yes", status: "planned", noteKey: "watches.nApple" },
  { name: "Wear OS", sub: "Samsung Galaxy, Google Pixel …", gps: "yes", hr: "yes", pump: "yes", status: "planned" },
  { name: "Amazfit", sub: "Zepp OS", gps: "yes", hr: "yes", pump: "partial", status: "planned", noteKey: "watches.nAmazfit" },
  { name: "Polar", sub: "Vantage, Grit X …", gps: "yes", hr: "yes", pump: "partial", status: "import", noteKey: "watches.nPolar" },
  { name: "Suunto", sub: "Race, Vertical …", gps: "yes", hr: "yes", pump: "no", status: "import" },
  { name: "COROS", sub: "Apex, Vertix …", gps: "yes", hr: "yes", pump: "no", status: "import" },
  { name: "Fitbit", sub: "—", gps: "no", hr: "no", pump: "no", status: "no", noteKey: "watches.nFitbit" },
];

const CAP_ICON: Record<Cap, string> = { yes: "✓", partial: "~", no: "–" };
const CAP_CLASS: Record<Cap, string> = { yes: "text-emerald-400", partial: "text-amber-400", no: "text-slate-600" };
const STATUS_CLASS: Record<Status, string> = {
  avail: "bg-emerald-500/15 text-emerald-300",
  planned: "bg-sky-500/15 text-sky-300",
  import: "bg-slate-500/15 text-slate-300",
  no: "bg-rose-500/15 text-rose-300",
};

export function WatchMatrix() {
  const t = useT();
  const cap = (c: Cap) => <span className={`text-lg font-bold ${CAP_CLASS[c]}`}>{CAP_ICON[c]}</span>;
  const status = (s: Status) => (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CLASS[s]}`}>
      {t(`watches.st.${s}`)}
    </span>
  );
  return (
    <>
      <div className="overflow-x-auto rounded-2xl border border-slate-800">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="bg-slate-900/70 text-left text-slate-300">
              <th className="px-4 py-3 font-semibold">{t("watches.colDevice")}</th>
              <th className="px-4 py-3 text-center font-semibold">{t("watches.colGps")}</th>
              <th className="px-4 py-3 text-center font-semibold">{t("watches.colHr")}</th>
              <th className="px-4 py-3 text-center font-semibold">{t("watches.colPump")}</th>
              <th className="px-4 py-3 font-semibold">{t("watches.colStatus")}</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.name} className="border-t border-slate-800">
                <td className="px-4 py-3">
                  <div className="font-semibold">{r.name}</div>
                  <div className="text-xs text-slate-400">{r.sub}</div>
                  {r.noteKey && <div className="mt-0.5 text-xs text-slate-500">{t(r.noteKey)}</div>}
                </td>
                <td className="px-4 py-3 text-center">{cap(r.gps)}</td>
                <td className="px-4 py-3 text-center">{cap(r.hr)}</td>
                <td className="px-4 py-3 text-center">{cap(r.pump)}</td>
                <td className="px-4 py-3">{status(r.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-400">
        <span><span className="font-bold text-emerald-400">✓</span> {t("watches.legYes")}</span>
        <span><span className="font-bold text-amber-400">~</span> {t("watches.legPartial")}</span>
        <span><span className="font-bold text-slate-600">–</span> {t("watches.legNo")}</span>
      </div>
      <p className="mt-4 text-xs text-slate-500">{t("watches.foot")}</p>
    </>
  );
}
