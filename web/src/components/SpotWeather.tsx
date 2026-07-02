import { useEffect, useState } from "react";
import { api, SpotWeather as SpotWeatherData, SpotWeatherDay } from "../lib/api";
import { Card } from "./ui";
import { LocationIcon } from "./Icons";
import { useT } from "../i18n";

// WMO-Wettercode -> Emoji (grobe Klassen, reicht für die Anzeige).
function wxIcon(code: number | null | undefined): string {
  if (code == null) return "•";
  if (code === 0) return "☀️";
  if (code <= 2) return "🌤️";
  if (code === 3) return "☁️";
  if (code <= 48) return "🌫️";
  if (code <= 57) return "🌦️";
  if (code <= 67) return "🌧️";
  if (code <= 77) return "🌨️";
  if (code <= 82) return "🌦️";
  if (code <= 86) return "🌨️";
  return "⛈️";
}

const CARD8 = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"];
function dirLabel(deg: number | null | undefined): string {
  if (deg == null) return "";
  return CARD8[Math.round(deg / 45) % 8];
}

// Pfeil zeigt, wohin der Wind weht (meteorolog. Richtung = woher -> +180°).
function WindArrow({ deg }: { deg: number | null | undefined }) {
  if (deg == null) return null;
  return <span className="inline-block" style={{ transform: `rotate(${deg + 180}deg)` }}>↑</span>;
}

const kn = (v: number | null | undefined) => (v != null ? Math.round(v) : "–");

export function SpotWeather({ spot, showSpot = false }: { spot: string; showSpot?: boolean }) {
  const t = useT();
  const [data, setData] = useState<SpotWeatherData | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setData(null); setDone(false);
    if (!spot) { setDone(true); return; }
    api.spotWeather(spot).then(setData).catch(() => setData(null)).finally(() => setDone(true));
  }, [spot]);

  // Nichts anzeigen, solange unklar / wenn weder Wetter noch Pegel da sind.
  if (!done) return null;
  const w = data?.weather;
  const pegel = data?.pegel;
  const water = data?.water;
  // Open-Meteo-Seite für DIESELBEN Koordinaten, die der Server abruft (= „abgerufene Werte").
  const om = data
    ? `https://open-meteo.com/en/docs?latitude=${data.lat.toFixed(4)}&longitude=${data.lon.toFixed(4)}`
    : "https://open-meteo.com";
  if (!w && !pegel && !water) return null;

  const dayLabel = (d: SpotWeatherDay, i: number): string => {
    if (i === 0) return t("wx.today");
    if (i === 1) return t("wx.tomorrow");
    return d.date ? new Date(d.date).toLocaleDateString(undefined, { weekday: "short" }) : "";
  };
  const cur = w?.current;

  return (
    <Card className="mb-4 p-3">
      {showSpot && (
        <div className="mb-1 flex items-center gap-1.5 text-base font-semibold text-slate-100">
          <LocationIcon className="h-4 w-4 shrink-0 text-brand-400" /> {spot}
        </div>
      )}
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold text-slate-200">{t("wx.title")}</h3>
        {cur && (
          <span className="flex items-center gap-2 text-sm text-slate-300">
            <a href={om} target="_blank" rel="noopener noreferrer" title="Open-Meteo" className="text-base hover:opacity-80">{wxIcon(cur.code)}</a>
            {cur.temp != null && <span className="tabular-nums text-slate-100">{Math.round(cur.temp)}°</span>}
            {cur.wind != null && (
              <span className="tabular-nums">{kn(cur.wind)} kn <WindArrow deg={cur.dir} /> {dirLabel(cur.dir)}</span>
            )}
            <span className="text-xs text-slate-500">{t("wx.now")}</span>
          </span>
        )}
      </div>

      {w && w.days.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {w.days.map((d, i) => (
            <div key={d.date} className="rounded-xl border border-slate-800 bg-slate-900/40 p-2 text-center">
              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{dayLabel(d, i)}</div>
              <a href={om} target="_blank" rel="noopener noreferrer" title="Open-Meteo" className="my-0.5 block text-2xl leading-none hover:opacity-80">{wxIcon(d.code)}</a>
              <div className="tabular-nums text-sm text-slate-100">
                {d.tmax != null ? Math.round(d.tmax) : "–"}° <span className="text-slate-500">/ {d.tmin != null ? Math.round(d.tmin) : "–"}°</span>
              </div>
              <div className="mt-1 flex items-center justify-center gap-1 text-xs text-slate-300">
                💨 <span className="tabular-nums">{kn(d.wind_max)}</span>
                {d.gust_max != null && <span className="text-slate-500">({t("wx.gust")} {kn(d.gust_max)})</span>}
              </div>
              <div className="text-[11px] text-slate-400"><WindArrow deg={d.dir} /> {dirLabel(d.dir)} · kn</div>
              {d.precip != null && d.precip > 0 && <div className="text-[11px] text-sky-400">☔ {d.precip.toFixed(1)} mm</div>}
            </div>
          ))}
        </div>
      )}

      {pegel && pegel.value != null && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-slate-300">
          <span className="font-medium text-slate-200">{t("wx.level")}:</span>
          <span className="tabular-nums text-slate-100">{Math.round(pegel.value)} {pegel.unit}</span>
          {pegel.trend != null && <span>{pegel.trend > 0 ? "↗" : pegel.trend < 0 ? "↘" : "→"}</span>}
          <span className="text-slate-400">
            {pegel.water ? `${pegel.water.charAt(0) + pegel.water.slice(1).toLowerCase()} · ` : ""}{pegel.station}
            {pegel.km != null ? ` (${pegel.km} km)` : ""}
          </span>
        </div>
      )}

      {water && water.current != null && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-slate-300">
          <span className="font-medium text-slate-200">🌊 {t("wx.water")}:</span>
          <span className="tabular-nums text-brand-300">{water.current.toFixed(1)} °C</span>
          {(water.min != null && water.max != null) && (
            <span className="text-slate-400 tabular-nums">{t("wx.today")} {water.min.toFixed(1)}–{water.max.toFixed(1)} °C</span>
          )}
          {water.avg != null && <span className="text-slate-400 tabular-nums">⌀ {water.avg.toFixed(1)} °C</span>}
          {water.at && <span className="text-slate-500">({water.at})</span>}
        </div>
      )}

      <div className="mt-2 text-[10px] text-slate-500">
        {t("wx.source")}: <a href={om} target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-300">Open-Meteo.com</a>
        {pegel && <> · <a href="https://www.pegelonline.wsv.de/" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-300">PEGELONLINE</a></>}
        {water && <> · <a href="http://www.db0wv.de/" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-300">{water.source}</a></>}
      </div>
    </Card>
  );
}
