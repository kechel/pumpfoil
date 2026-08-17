import { useEffect, useState } from "react";
import { api, type HrProgress as HrProgressData } from "../lib/api";
import { useT } from "../i18n";
import { Card } from "./ui";
import { TimeChart } from "./TimeChart";

// Trainingskurve: Höchstpuls nach 1, 2 und 5 Minuten Lauf, über die Sessions hinweg.
//
// Idee von Jan (17.08.): die Anstrengung beim Pumpen hängt fast nur an der DAUER und kaum am Foil
// („man ist nur schneller oder langsamer mit grösseren oder kleineren foils"). Damit ist die
// Lauf-Dauer die ehrliche Achse — und wer fitter wird, hat nach zwei Minuten Pumpen einen
// niedrigeren Puls als vorher. Genau das ist hier zu sehen.
//
// Bewusst EIN Diagramm je Marke statt drei Linien übereinander: die Marken haben verschiedene
// Stichproben (nach 5 min bleiben oft nur ein oder zwei Läufe übrig) und wären zusammen in einem
// Bild irreführend. Unter jedem Diagramm steht deshalb, aus wie vielen Läufen der Wert kommt.
//
// Der Chart ist der vorhandene `TimeChart` (schlankes SVG, keine Bibliothek) — dieselbe Darstellung
// wie im Labeling und im Admin, statt hier eine zweite Chart-Welt aufzumachen.
export function HrProgress({ sport }: { sport?: string }) {
  const t = useT();
  const [data, setData] = useState<HrProgressData | null>(null);

  useEffect(() => {
    api.hrProgress(sport).then(setData).catch(() => setData(null));
  }, [sport]);

  const reihe = data?.series ?? [];
  if (reihe.length < 2) return null;   // eine einzelne Session ist keine Kurve

  const zeiten = reihe.map((x) => new Date(x.started_at ?? "").getTime());
  const domain: [number, number] = [Math.min(...zeiten), Math.max(...zeiten)];

  const marken = (data?.marks ?? []).filter((m) => reihe.some((x) => x[`hr${m}`] != null));
  if (!marken.length) return null;

  return (
    <Card className="mt-5 p-5">
      <h3 className="mb-1 font-semibold">{t("hr.progressTitle")}</h3>
      <p className="mb-3 text-sm text-slate-300">{t("hr.progressHint")}</p>
      {marken.map((m) => {
        const werte = reihe.map((x) => (x[`hr${m}`] as number | undefined) ?? null);
        const laeufe = reihe.reduce((n, x) => n + ((x[`n${m}`] as number | undefined) ?? 0), 0);
        const da = werte.filter((v): v is number => v != null);
        return (
          <div key={m} className="mb-4">
            <div className="mb-1 flex flex-wrap items-baseline gap-2">
              <span className="text-sm font-medium text-slate-200">
                {m < 60 ? t("hr.afterSeconds", { sec: m }) : t("hr.afterMinutes", { min: m / 60 })}
              </span>
              <span className="text-xs text-slate-400">
                {t("hr.fromRuns", { runs: laeufe, sessions: da.length })}
              </span>
              {da.length > 1 && (
                <span className="text-xs tabular-nums text-slate-400">
                  {da[0]} → {da[da.length - 1]} bpm
                </span>
              )}
            </div>
            <TimeChart t={zeiten} values={werte} domainMs={domain} height={90} color="#f43f5e" />
          </div>
        );
      })}
    </Card>
  );
}
