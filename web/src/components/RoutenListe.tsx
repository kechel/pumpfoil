import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useT } from "../i18n";
import { LocationIcon } from "./Icons";
import { gemerktKurz, mitEigenen, type Gemerkt } from "./SpotHeatmap";

// Alle gemerkten Routen (Jan, 16.10.2026; seit 02.11.2026 Reiter „Routen" der Spots-Seite statt Abschnitt der Community): dieselben Kaertchen wie unter
// der Spot-Karte, dazu der Spotname; filterbar nach Gesamtlaenge. Klick -> Spot-Seite, dort wird die
// Route in der Planung aufgerufen (?route=<id>, SpotHeatmap). Wie dort: nur Datum, nie wer.
type RouteMitSpot = Gemerkt & { id: number; spot_id: number; spot_name: string };
const ROUTEN_KM_MAX = 50;
export function RoutenListe() {
  const t = useT();
  const [routen, setRouten] = useState<RouteMitSpot[] | null>(null);
  const [minKm, setMinKm] = useState(0);
  const [maxKm, setMaxKm] = useState(ROUTEN_KM_MAX);
  useEffect(() => {
    api.alleRouten().then((r) => setRouten(r as RouteMitSpot[])).catch(() => setRouten([]));
  }, []);
  if (!routen) return null;
  if (routen.length === 0) return <p className="text-sm text-slate-400">{t("home.routesNone")}</p>;
  const datum = (iso: string) => new Date(iso).toLocaleDateString(document.documentElement.lang || undefined,
    { day: "2-digit", month: "2-digit", year: "numeric" });
  // „max" am Anschlag heisst: ohne Obergrenze
  const passend = routen.filter((r) => r.meter >= minKm * 1000 && (maxKm >= ROUTEN_KM_MAX || r.meter <= maxKm * 1000));
  const regler = (label: string, wert: number, setz: (v: number) => void) => (
    <label className="flex min-w-0 flex-1 basis-48 flex-col gap-1 text-xs text-slate-400">
      <span>{label}: <span className="font-semibold text-slate-100">
        {wert >= ROUTEN_KM_MAX ? t("home.routesNoLimit") : `${wert} km`}</span></span>
      <input type="range" min={0} max={ROUTEN_KM_MAX} step={wert < 5 ? 0.5 : 1} value={wert}
        onChange={(e) => setz(Number(e.target.value))} className="accent-brand-500" />
    </label>
  );
  return (
    <div>
      <div className="mb-3 flex max-w-xl flex-wrap gap-x-4 gap-y-2">
        {regler(t("home.routesMin"), minKm, (v) => setMinKm(Math.min(v, maxKm)))}
        {regler(t("home.routesMax"), maxKm, (v) => setMaxKm(Math.max(v, minKm)))}
      </div>
      {passend.length === 0 ? (
        <p className="text-sm text-slate-400">{t("home.routesNone")}</p>
      ) : (
        <div className="flex flex-wrap gap-2 text-xs">
          {passend.map((r) => {
            const k = gemerktKurz(r);
            return (
              <Link key={r.id} to={`/sessions?spot=${r.spot_id}&route=${r.id}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-slate-200 hover:bg-slate-800">
                {r.eigene_id != null && (
                  <span className="h-2 w-2 rounded-full bg-brand-500" title={t("routes.mine")} aria-label={t("routes.mine")} />
                )}
                <LocationIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="font-semibold">{r.spot_name}</span>
                <span className="tabular-nums">· {t("routes.savedChip", { n: k.starts, max: k.maxM, total: r.meter, datum: datum(r.gemerkt_am) })}</span>
                {mitEigenen(r) && <span className="rounded bg-slate-700/60 px-1">{t("routes.manualTag")}</span>}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
