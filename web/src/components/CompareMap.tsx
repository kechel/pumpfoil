import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { SessionSummary } from "../lib/api";
import { rampColor, speedColor, optimalColor, OPTIMAL_SPAN } from "../lib/trackColors";
import { DEFAULT_RIDER, calculateAR, calculateCLmax, calculateStallSpeed, calculateOptimalSpeed } from "../lib/foilPhysics";
import { useT } from "../i18n";

export interface CompareMapItem {
  key: string;
  session: SessionSummary;
  runIdx: number | null;     // null = ganze Session, sonst nur dieser Lauf
  color: string;             // Legendenfarbe (je Eintrag)
  riderColor: string;        // Farbe je Fahrer
  rider: string | null;      // Anzeigename des Fahrers
}

type Mode = "rider" | "track" | "speed" | "optimal" | "pump" | "hr";
const MAX_DRAW_GAP_M = 30;

// Optimale Geschwindigkeit (km/h) des Foils einer Session beim gegebenen Fahrergewicht.
function optimalKmhFor(session: SessionSummary, weight: number | null): number | null {
  const fo = session.foil;
  if (!fo?.span_cm || !fo?.area_cm2 || !fo?.thickness_mm) return null;
  const rider = { riderWeight: weight ?? DEFAULT_RIDER.riderWeight, equipmentWeight: DEFAULT_RIDER.equipmentWeight };
  const ar = calculateAR(fo.span_cm, fo.area_cm2);
  const clmax = calculateCLmax(ar, fo.thickness_mm, fo.area_cm2, 15);
  const stall = calculateStallSpeed(fo.area_cm2, clmax, rider);
  return calculateOptimalSpeed(stall);
}

// Foiling-Geschwindigkeiten (km/h) eines Items für die Auto-Skala.
function itemSpeeds(it: CompareMapItem, win: string): number[] {
  const gj = it.session.analysis?.track_geojson;
  const segs = it.session.analysis?.segments ?? [];
  if (!gj || !segs.length) return [];
  const speeds: number[] = gj.properties?.speeds?.[win] ?? gj.properties?.speeds_mps ?? [];
  const ranges = it.runIdx != null && segs[it.runIdx] ? [segs[it.runIdx]] : segs;
  const out: number[] = [];
  for (const s of ranges)
    for (let i = s.i_start; i <= s.i_end; i++) {
      const v = speeds[i];
      if (v != null && isFinite(v)) out.push(v * 3.6);
    }
  return out;
}

export function CompareMap({ items, win, weight }: { items: CompareMapItem[]; win: "1" | "3" | "5"; weight: number | null }) {
  const t = useT();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  // Default: nach Fahrer einfärben, wenn mehrere Fahrer dabei sind, sonst je Track.
  const riders = useMemo(() => new Set(items.map((i) => i.rider ?? "?")), [items]);
  const [mode, setMode] = useState<Mode>("rider");
  useEffect(() => { setMode(riders.size > 1 ? "rider" : "track"); }, [riders.size]);

  // Datenverfügbarkeit über alle Items.
  const hasPump = items.some((it) => (it.session.analysis?.track_geojson?.properties?.pump_hz ?? []).some((v: number | null) => v != null));
  const hasHr = items.some((it) => (it.session.analysis?.track_geojson?.properties?.hr ?? []).some((v: number | null) => v != null));
  const anyOptimal = items.some((it) => optimalKmhFor(it.session, weight) != null);

  // Modus fällt zurück, wenn die nötigen Daten fehlen.
  useEffect(() => {
    if (mode === "pump" && !hasPump) setMode("rider");
    if (mode === "hr" && !hasHr) setMode("rider");
    if (mode === "optimal" && !anyOptimal) setMode("rider");
  }, [mode, hasPump, hasHr, anyOptimal]);

  // Geteilte Skalen über alle Items.
  const speedRange = useMemo<[number, number]>(() => {
    const vals = items.flatMap((it) => itemSpeeds(it, win));
    if (!vals.length) return [0, 40];
    return [Math.max(0, Math.floor(Math.min(...vals))), Math.min(60, Math.ceil(Math.max(...vals)))];
  }, [items, win]);
  const pumpRange = useMemo<[number, number]>(() => {
    const vals = items.flatMap((it) => (it.session.analysis?.track_geojson?.properties?.pump_hz ?? []).filter((v: number | null): v is number => v != null));
    return vals.length ? [Math.min(...vals), Math.max(...vals)] : [0, 2];
  }, [items]);
  const hrRange = useMemo<[number, number]>(() => {
    const vals = items.flatMap((it) => (it.session.analysis?.track_geojson?.properties?.hr ?? []).filter((v: number | null): v is number => v != null));
    return vals.length ? [Math.min(...vals), Math.max(...vals)] : [100, 170];
  }, [items]);

  const [autoScale, setAutoScale] = useState(true);
  const [sLo, setSLo] = useState(speedRange[0]);
  const [sHi, setSHi] = useState(speedRange[1]);
  useEffect(() => { if (autoScale) { setSLo(speedRange[0]); setSHi(speedRange[1]); } }, [autoScale, speedRange]);

  // Karte initialisieren + auf alle Tracks zoomen.
  useEffect(() => {
    if (!mapRef.current) return;
    if (!mapObj.current) {
      mapObj.current = L.map(mapRef.current, { zoomControl: false, maxZoom: 22 });
      L.control.zoom({ position: "bottomright" }).addTo(mapObj.current);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap", maxZoom: 22, maxNativeZoom: 19,
      }).addTo(mapObj.current);
      layer.current = L.layerGroup().addTo(mapObj.current);
    }
    const all: [number, number][] = [];
    for (const it of items) {
      const gj = it.session.analysis?.track_geojson;
      const segs = it.session.analysis?.segments ?? [];
      if (!gj) continue;
      const coords: [number, number][] = gj.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);
      const ranges = it.runIdx != null && segs[it.runIdx] ? [segs[it.runIdx]] : segs;
      for (const s of ranges) for (let i = s.i_start; i <= s.i_end; i++) if (coords[i]) all.push(coords[i]);
    }
    if (all.length) mapObj.current.fitBounds(L.latLngBounds(all), { padding: [24, 24] });
    setTimeout(() => mapObj.current?.invalidateSize(), 100);
  }, [items, fullscreen]);

  // Tracks (neu) zeichnen.
  useEffect(() => {
    const map = mapObj.current;
    const lg = layer.current;
    if (!map || !lg) return;
    lg.clearLayers();
    for (const it of items) {
      const gj = it.session.analysis?.track_geojson;
      const segs = it.session.analysis?.segments ?? [];
      if (!gj || !segs.length) continue;
      const coords: [number, number][] = gj.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);
      const speeds: number[] = gj.properties?.speeds?.[win] ?? gj.properties?.speeds_mps ?? [];
      const phz: (number | null)[] = gj.properties?.pump_hz ?? [];
      const hr: (number | null)[] = gj.properties?.hr ?? [];
      const opt = optimalKmhFor(it.session, weight) ?? 0;
      const ranges = it.runIdx != null && segs[it.runIdx] ? [{ seg: segs[it.runIdx], idx: it.runIdx }] : segs.map((seg: any, idx: number) => ({ seg, idx }));
      for (const { seg } of ranges) {
        for (let i = seg.i_start; i < seg.i_end; i++) {
          if (!coords[i] || !coords[i + 1]) continue;
          if (map.distance(coords[i], coords[i + 1]) > MAX_DRAW_GAP_M) continue;
          let color: string;
          if (mode === "rider") color = it.riderColor;
          else if (mode === "track") color = it.color;
          else if (mode === "speed") color = speedColor((speeds[i + 1] ?? 0) * 3.6, sLo, sHi);
          else if (mode === "optimal") color = optimalColor((speeds[i + 1] ?? 0) * 3.6, opt);
          else if (mode === "pump") { const v = phz[i + 1]; const [lo, hi] = pumpRange; color = v == null ? "#64748b" : rampColor((v - lo) / Math.max(hi - lo, 1e-6)); }
          else { const v = hr[i + 1]; const [lo, hi] = hrRange; color = v == null ? "#64748b" : rampColor((v - lo) / Math.max(hi - lo, 1)); }
          L.polyline([coords[i], coords[i + 1]], { color, weight: 4, opacity: 0.92 }).addTo(lg);
        }
      }
    }
  }, [items, mode, win, sLo, sHi, pumpRange, hrRange, weight, fullscreen]);

  if (!items.some((it) => it.session.analysis?.track_geojson)) return null;

  return (
    <div
      className={fullscreen ? "fixed inset-0 z-[2000] flex flex-col bg-slate-950" : "mb-4"}
      style={fullscreen ? {
        paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)",
      } : undefined}
    >
      <div className={`flex flex-wrap items-center gap-2 ${fullscreen ? "shrink-0 p-2" : "mb-2"}`}>
        <span className="text-xs text-slate-400">{t("sd.coloring")}</span>
        {riders.size > 1 && <ModeBtn active={mode === "rider"} onClick={() => setMode("rider")}>{t("compare.colorRider")}</ModeBtn>}
        <ModeBtn active={mode === "track"} onClick={() => setMode("track")}>{t("compare.colorTrack")}</ModeBtn>
        <ModeBtn active={mode === "speed"} onClick={() => setMode("speed")}>{t("sd.colorSpeed")}</ModeBtn>
        {anyOptimal && <ModeBtn active={mode === "optimal"} onClick={() => setMode("optimal")}>{t("sd.colorOptimal")}</ModeBtn>}
        {hasPump && <ModeBtn active={mode === "pump"} onClick={() => setMode("pump")}>{t("sd.colorPumpHz")}</ModeBtn>}
        {hasHr && <ModeBtn active={mode === "hr"} onClick={() => setMode("hr")}>{t("sd.colorPulse")}</ModeBtn>}
        <button onClick={() => setFullscreen((v) => !v)} className="ml-auto rounded-lg bg-slate-800 px-3 py-1 text-sm text-slate-200 hover:bg-slate-700">
          {fullscreen ? t("sd.close") : t("sd.fullscreen")}
        </button>
      </div>

      <div className={fullscreen ? "min-h-0 flex-1" : "overflow-hidden rounded-2xl border border-slate-800"}>
        <div ref={mapRef} style={{ width: "100%", height: fullscreen ? "100%" : "55vh", minHeight: fullscreen ? undefined : 300 }} />
      </div>

      <div className={`flex flex-wrap items-center gap-4 px-1 pt-2 ${fullscreen ? "shrink-0 bg-slate-950 p-2" : ""}`}>
        {(mode === "rider" || mode === "track") ? (
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
            {mode === "rider"
              ? Array.from(new Map(items.map((it) => [it.rider ?? "?", it.riderColor])).entries()).map(([name, col]) => (
                  <span key={name} className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded" style={{ backgroundColor: col }} />{name === "?" ? "—" : name}</span>
                ))
              : <span className="text-slate-400">{t("compare.colorTrackHint")}</span>}
          </div>
        ) : (
          <ValueLegend mode={mode} speedRange={[sLo, sHi]} pumpRange={pumpRange} hrRange={hrRange}
            optimal={items.map((it) => optimalKmhFor(it.session, weight)).find((v) => v != null) ?? null} />
        )}
        {mode === "speed" && (
          <span className="flex items-center gap-1 text-xs text-slate-300">
            <label className="mr-1 flex items-center gap-1"><input type="checkbox" checked={autoScale} onChange={(e) => setAutoScale(e.target.checked)} className="accent-brand-500" />{t("sd.auto")}</label>
            {t("sd.scale")}
            <input type="number" min={0} max={60} value={sLo} disabled={autoScale} onChange={(e) => { setAutoScale(false); setSLo(Number(e.target.value)); }} className="w-14 rounded bg-slate-800 px-2 py-1 text-slate-100 disabled:opacity-50" />
            –
            <input type="number" min={0} max={60} value={sHi} disabled={autoScale} onChange={(e) => { setAutoScale(false); setSHi(Number(e.target.value)); }} className="w-14 rounded bg-slate-800 px-2 py-1 text-slate-100 disabled:opacity-50" />
            km/h
          </span>
        )}
      </div>
    </div>
  );
}

function ModeBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-lg px-2.5 py-1 text-xs ${active ? "bg-brand-500 font-semibold text-slate-950" : "bg-slate-800 text-slate-200 hover:bg-slate-700"}`}>
      {children}
    </button>
  );
}

function ValueLegend({ mode, speedRange, pumpRange, hrRange, optimal }: { mode: Mode; speedRange: [number, number]; pumpRange: [number, number]; hrRange: [number, number]; optimal: number | null }) {
  const t = useT();
  if (mode === "optimal") {
    const opt = optimal ?? 0;
    const ticks = [1 - OPTIMAL_SPAN, 1, 1 + OPTIMAL_SPAN].map((r) => Math.round(opt * r));
    return (
      <div className="text-xs text-slate-300"><div className="flex items-center gap-3">
        <div className="w-48"><div className="h-2 w-full rounded" style={{ background: "linear-gradient(to right, hsl(220,80%,48%), hsl(140,80%,48%), hsl(0,80%,48%))" }} />
          <div className="mt-1 flex w-full justify-between tabular-nums">{ticks.map((v, i) => <span key={i}>{v}</span>)}</div></div>
        <span>km/h</span><span className="text-slate-400">{t("sd.optimalLegend", { v: String(Math.round(opt)) })}</span>
      </div></div>
    );
  }
  const [lo, hi] = mode === "speed" ? speedRange : mode === "pump" ? pumpRange : hrRange;
  const unit = mode === "speed" ? "km/h" : mode === "pump" ? "Hz" : "bpm";
  const ticksT = [0, 0.25, 0.5, 0.75, 1];
  const stops = ticksT.map((tt) => rampColor(tt)).join(", ");
  const ticks = ticksT.map((tt) => mode === "pump" ? (lo + tt * (hi - lo)).toFixed(1) : Math.round(lo + tt * (hi - lo)));
  return (
    <div className="text-xs text-slate-300"><div className="flex items-center gap-3">
      <div className="w-48"><div className="h-2 w-full rounded" style={{ background: `linear-gradient(to right, ${stops})` }} />
        <div className="mt-1 flex w-full justify-between tabular-nums">{ticks.map((v, i) => <span key={i}>{v}</span>)}</div></div>
      <span>{unit}</span>
    </div></div>
  );
}
