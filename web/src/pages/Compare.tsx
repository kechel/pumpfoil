import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, SessionSummary } from "../lib/api";
import { Card } from "../components/ui";
import { CompareIcon, CloseIcon, ChevronIcon, FoilIcon } from "../components/Icons";
import { computeFoilPowerAtSpeed, DEFAULT_RIDER } from "../lib/foilPhysics";
import { useCompare, removeCompare, clearCompare, mergeableIds, CompareRef, refKey } from "../lib/compare";
import { MergeConfirm } from "../components/MergeConfirm";
import { CompareMap, CompareMapItem } from "../components/CompareMap";
import { useT } from "../i18n";

// Farben zur Zuordnung Wert -> markiertes Element (Legende oben + Punkt je Wert).
const COLORS = ["#2dd4bf", "#f59e0b", "#a78bfa", "#f472b6"];
// Eigene, größere Palette für die Einfärbung je Fahrer.
const RIDER_COLORS = ["#2dd4bf", "#f59e0b", "#a78bfa", "#f472b6", "#60a5fa", "#34d399", "#fbbf24", "#fb7185", "#22d3ee", "#c084fc"];

function fmtMMSS(s: number) {
  const total = Math.round(s);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${m}:${pad(ss)}`;
}

function powerOf(session: SessionSummary | null, avgMps: number | null | undefined, pumpHz: number | null | undefined, weight: number | null): number | null {
  const fo = session?.foil;
  const dims = fo?.span_cm && fo?.area_cm2 && fo?.thickness_mm
    ? { span_cm: fo.span_cm, area_cm2: fo.area_cm2, thickness_mm: fo.thickness_mm } : null;
  if (!dims || !avgMps || avgMps <= 0) return null;
  const rider = { riderWeight: weight ?? DEFAULT_RIDER.riderWeight, equipmentWeight: DEFAULT_RIDER.equipmentWeight };
  const pump = pumpHz && pumpHz > 0 ? { heaveAmp_cm: 12, pumpFreq_hz: pumpHz, recoveryLoss_pct: 35 } : undefined;
  const r = computeFoilPowerAtSpeed(dims, avgMps * 3.6, { rider, pump });
  return Math.round(r.dragPower + (pump ? r.inertiaPower : 50));
}

// Bestwert je Segment-Kennzahl über alle Läufe einer Session.
function bestSeg(segs: any[], getter: (s: any) => number | null | undefined, better: (x: number, y: number) => boolean): number | null {
  let bv: number | null = null;
  segs.forEach((s) => { const v = getter(s); if (v != null && (bv === null || better(v, bv))) bv = v; });
  return bv;
}

type Stats = Record<string, number | null>;

function statsFor(it: Item, win: "1" | "3" | "5", weight: number | null): Stats {
  const a = it.session?.analysis;
  const m = a?.metrics;
  const segs: any[] = a?.segments ?? [];
  if (it.seg) {
    const s = it.seg;
    return {
      foilingKm: s.distance_m != null ? s.distance_m / 1000 : null,
      foilingTimeS: s.duration_s ?? null,
      runs: null,
      avgKmh: s.avg_speed_mps != null ? s.avg_speed_mps * 3.6 : null,
      powerW: powerOf(it.session, s.avg_speed_mps, s.avg_pump_hz, weight),
      maxKmh: (s[`max_${win}s`] ?? s.max_speed_mps) != null ? (s[`max_${win}s`] ?? s.max_speed_mps) * 3.6 : null,
      minKmh: (s[`min_${win}s`] ?? s.min_speed_mps) != null ? (s[`min_${win}s`] ?? s.min_speed_mps) * 3.6 : null,
      maxGlide: s.longest_glide_s ?? null,
      pumps: s.pumps ?? null,
      avgPump: s.avg_pump_hz ?? null,
      distPerPump: s.pumps ? s.distance_m / s.pumps : null,
      avgHr: null,
      maxHr: null,
      longestRunS: s.duration_s ?? null,
      farthestRunM: s.distance_m ?? null,
    };
  }
  const maxV = bestSeg(segs, (s) => s[`max_${win}s`], (x, y) => x > y);
  const minV = bestSeg(segs, (s) => s[`min_${win}s`], (x, y) => x < y);
  return {
    foilingKm: a?.foiling_distance_m != null ? a.foiling_distance_m / 1000 : null,
    foilingTimeS: a?.foiling_time_s ?? null,
    runs: segs.length || null,
    avgKmh: m?.avg_speed_mps != null ? m.avg_speed_mps * 3.6 : null,
    powerW: powerOf(it.session, m?.avg_speed_mps, m?.avg_pump_hz, weight),
    maxKmh: maxV != null ? maxV * 3.6 : null,
    minKmh: minV != null ? minV * 3.6 : null,
    maxGlide: bestSeg(segs, (s) => s.longest_glide_s, (x, y) => x > y),
    pumps: a?.pump_count ?? null,
    avgPump: m?.avg_pump_hz ?? null,
    distPerPump: a?.pump_count && a?.foiling_distance_m != null ? a.foiling_distance_m / a.pump_count : null,
    avgHr: m?.avg_hr ?? null,
    maxHr: m?.max_hr ?? null,
    longestRunS: bestSeg(segs, (s) => s.duration_s, (x, y) => x > y),
    farthestRunM: bestSeg(segs, (s) => s.distance_m, (x, y) => x > y),
  };
}

interface Item {
  ref: CompareRef;
  session: SessionSummary | null;
  seg: any | null;
  color: string;
  rider: string | null;
  riderColor: string;
}

export default function Compare() {
  const t = useT();
  const refs = useCompare();
  const nav = useNavigate();
  const [mergeIds, setMergeIds] = useState<number[] | null>(null);
  const canMergeIds = mergeableIds(refs);
  const [sessions, setSessions] = useState<Record<number, SessionSummary | null>>({});
  const [weight, setWeight] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [win, setWin] = useState<"1" | "3" | "5">("3");

  useEffect(() => {
    api.getSettings().then((s) => {
      const w = Number(s.weight_kg);
      setWeight(Number.isFinite(w) && w > 0 ? w : DEFAULT_RIDER.riderWeight);
    }).catch(() => setWeight(DEFAULT_RIDER.riderWeight));
  }, []);

  // Alle referenzierten Sessions laden (dedupliziert; fehlende -> null).
  useEffect(() => {
    const ids = Array.from(new Set(refs.map((r) => r.sessionId)));
    const missing = ids.filter((id) => !(id in sessions));
    if (!missing.length) return;
    setLoading(true);
    Promise.all(missing.map((id) =>
      api.session(id).then((s) => [id, s] as const).catch(() => [id, null] as const),
    )).then((pairs) => {
      setSessions((prev) => {
        const next = { ...prev };
        for (const [id, s] of pairs) next[id] = s;
        return next;
      });
    }).finally(() => setLoading(false));
  }, [refs, sessions]);

  // Farbe je Fahrer (gleicher Fahrer -> gleiche Farbe, auch über mehrere Sessions).
  const riderColor = useMemo(() => {
    const map = new Map<string, string>();
    let n = 0;
    for (const r of refs) {
      const name = sessions[r.sessionId]?.owner_name ?? "?";
      if (!map.has(name)) map.set(name, RIDER_COLORS[n++ % RIDER_COLORS.length]);
    }
    return map;
  }, [refs, sessions]);

  const items: Item[] = useMemo(() => refs.map((r, i) => {
    const session = sessions[r.sessionId] ?? null;
    const seg = r.runIdx != null ? (session?.analysis?.segments?.[r.runIdx] ?? null) : null;
    const rider = session?.owner_name ?? null;
    return { ref: r, session, seg, color: COLORS[i % COLORS.length], rider, riderColor: riderColor.get(rider ?? "?") ?? COLORS[i % COLORS.length] };
  }), [refs, sessions, riderColor]);

  // Items mit geladener Session + Track für die Karte.
  const mapItems: CompareMapItem[] = useMemo(() =>
    items.filter((it) => it.session?.analysis?.track_geojson)
      .map((it) => ({ key: refKey(it.ref), session: it.session!, runIdx: it.ref.runIdx, color: it.color, riderColor: it.riderColor, rider: it.rider })),
    [items]);

  const itemStats = useMemo(() => items.map((it) => statsFor(it, win, weight)), [items, win, weight]);

  function itemLabel(it: Item): string {
    const date = it.session?.started_at
      ? new Date(it.session.started_at).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "2-digit" })
      : `#${it.ref.sessionId}`;
    if (it.ref.runIdx != null) return `${t("compare.run", { n: it.ref.runIdx + 1 })} · ${date}`;
    return date;
  }

  function foilLabel(it: Item): string | null {
    const fo = it.session?.foil;
    if (!fo) return null;
    return [fo.brand, fo.model, fo.size].filter(Boolean).join(" ").trim() || null;
  }

  const metrics: { key: string; label: string; unit?: string; dir?: "max" | "min"; fmt: (v: number) => string }[] = [
    { key: "foilingKm", label: t("stat.foiling"), unit: "km", dir: "max", fmt: (v) => v.toFixed(2) },
    { key: "foilingTimeS", label: t("stat.foilingTime"), unit: "min:s", dir: "max", fmt: fmtMMSS },
    { key: "runs", label: t("stat.runs"), dir: "max", fmt: (v) => String(v) },
    { key: "avgKmh", label: t("sd.avgSpeed"), unit: "km/h", dir: "max", fmt: (v) => v.toFixed(1) },
    { key: "powerW", label: t("power.title"), unit: "W", fmt: (v) => String(Math.round(v)) },
    { key: "maxKmh", label: t("sd.maxSpeed", { win }), unit: "km/h", dir: "max", fmt: (v) => v.toFixed(1) },
    { key: "minKmh", label: t("sd.minSpeed", { win }), unit: "km/h", fmt: (v) => v.toFixed(1) },
    { key: "maxGlide", label: t("sd.maxGlide"), unit: "s", dir: "max", fmt: (v) => v.toFixed(1) },
    { key: "pumps", label: t("stat.pumps"), fmt: (v) => String(v) },
    { key: "avgPump", label: t("sd.avgPump"), unit: "Hz", fmt: (v) => v.toFixed(2) },
    { key: "distPerPump", label: t("sd.avgDistPerPump"), unit: "m/Pump", dir: "max", fmt: (v) => v.toFixed(1) },
    { key: "avgHr", label: t("sd.avgHr"), unit: "bpm", fmt: (v) => String(Math.round(v)) },
    { key: "maxHr", label: t("sd.maxHr"), unit: "bpm", fmt: (v) => String(Math.round(v)) },
    { key: "longestRunS", label: t("rec.longestRun"), unit: "min:s", dir: "max", fmt: fmtMMSS },
    { key: "farthestRunM", label: t("rec.farthestRun"), unit: "m", dir: "max", fmt: (v) => String(Math.round(v)) },
  ];

  const empty = refs.length === 0;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center gap-2">
        <Link to="/sessions" className="inline-flex items-center gap-1 text-sm text-slate-300 hover:text-slate-200">
          <ChevronIcon className="h-4 w-4 rotate-180" /> {t("sessions.title")}
        </Link>
        <h2 className="ml-1 flex items-center gap-2 text-xl font-bold">
          <CompareIcon className="h-6 w-6 text-brand-400" /> {t("compare.title")}
        </h2>
        {!empty && (
          <>
            <span className="text-sm text-slate-400">{t("compare.subtitle", { n: refs.length })}</span>
            <button onClick={clearCompare} className="ml-auto rounded-lg bg-slate-800 px-3 py-1 text-sm text-slate-200 hover:bg-slate-700">
              {t("compare.clear")}
            </button>
          </>
        )}
      </div>

      {canMergeIds && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-brand-500/40 bg-brand-500/10 px-4 py-3 text-sm">
          <span className="text-slate-200">{t("merge.compareHint")}</span>
          <button onClick={() => setMergeIds(canMergeIds)}
            className="ml-auto rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-brand-400">
            {t("merge.action")}
          </button>
        </div>
      )}
      {mergeIds && (
        <MergeConfirm ids={mergeIds} onClose={() => setMergeIds(null)}
          onDone={(id) => { clearCompare(); nav(`/sessions/${id}`); }} />
      )}

      {empty ? (
        <Card className="p-6 text-center text-sm text-slate-300">{t("compare.empty")}</Card>
      ) : (
        <>
          {/* Legende: welcher Punkt/welche Farbe gehört zu welcher Markierung. */}
          <div className="mb-4 flex flex-wrap gap-2">
            {items.map((it) => (
              <div key={refKey(it.ref)} className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-2.5 py-1.5">
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: it.color }} />
                <Link to={`/sessions/${it.ref.sessionId}`} className="text-sm text-slate-200 hover:text-brand-300">
                  {it.rider && <span className="font-semibold text-slate-100">{it.rider} · </span>}
                  <span>{itemLabel(it)}</span>
                  {foilLabel(it) && <span className="ml-1.5 inline-flex items-center gap-1 text-xs text-slate-400"><FoilIcon className="h-3.5 w-3.5" />{foilLabel(it)}</span>}
                  {it.session === null && !loading && <span className="ml-1 text-xs text-slate-500">{t("compare.gone")}</span>}
                </Link>
                <button onClick={() => removeCompare(it.ref)} title={t("compare.remove")}
                  className="text-slate-400 hover:text-rose-300">
                  <CloseIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="mb-4 flex items-center gap-2">
            <span className="text-xs text-slate-400">{t("sd.smoothing")}</span>
            {(["1", "3", "5"] as const).map((w) => (
              <button key={w} onClick={() => setWin(w)}
                className={`rounded-lg px-2.5 py-1 text-xs ${win === w ? "bg-brand-500 font-semibold text-slate-950" : "bg-slate-800 text-slate-200"}`}>
                {w}s
              </button>
            ))}
            {loading && <span className="ml-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-700 border-t-brand-400" />}
          </div>

          {/* Gemeinsame Karte aller verglichenen Sessions/Läufe. */}
          {mapItems.length > 0 && <CompareMap items={mapItems} win={win} weight={weight} />}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {metrics.map((mt) => {
              const vals = itemStats.map((st) => st[mt.key]);
              // Bestwert(e) bestimmen (nur bei dir + mind. 2 vergleichbaren Werten).
              let bestVal: number | null = null;
              const nums = vals.filter((v): v is number => v != null);
              if (mt.dir && nums.length >= 2) {
                bestVal = mt.dir === "max" ? Math.max(...nums) : Math.min(...nums);
              }
              return (
                <Card key={mt.key} className="p-2">
                  <div className="mb-1.5 text-[10px] uppercase leading-tight tracking-wide text-slate-300">{mt.label}</div>
                  <div className="flex flex-col gap-1">
                    {items.map((it, i) => {
                      const v = vals[i];
                      const isBest = bestVal != null && v != null && v === bestVal;
                      return (
                        <div key={refKey(it.ref)} className="flex items-baseline gap-1.5 leading-none">
                          <span className="inline-block h-2 w-2 shrink-0 self-center rounded-full" style={{ backgroundColor: it.color }} />
                          <span className={`tabular-nums ${isBest ? "text-base font-bold text-brand-400" : "text-sm font-semibold text-slate-100"}`}>
                            {v == null ? "–" : mt.fmt(v)}
                          </span>
                          {mt.unit && v != null && <span className="text-[10px] text-slate-400">{mt.unit}</span>}
                        </div>
                      );
                    })}
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Tabelle aller Einzelläufe aller verglichenen Sessions (mit Fahrer). */}
          <AllRunsTable items={items} win={win} weight={weight} />
        </>
      )}
    </div>
  );
}

// Flache Tabelle: jeder Foiling-Lauf jeder verglichenen Session als eigene Zeile.
function AllRunsTable({ items, win, weight }: { items: Item[]; win: "1" | "3" | "5"; weight: number | null }) {
  const t = useT();
  const rows = useMemo(() => {
    const out: { color: string; rider: string | null; date: string; runNo: number; sessionId: number; runIdx: number; seg: any; session: SessionSummary }[] = [];
    for (const it of items) {
      const session = it.session;
      if (!session?.analysis?.segments?.length) continue;
      const date = session.started_at ? new Date(session.started_at).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "2-digit" }) : `#${it.ref.sessionId}`;
      const idxs = it.ref.runIdx != null ? [it.ref.runIdx] : session.analysis.segments.map((_, i) => i);
      for (const ri of idxs) {
        const seg = session.analysis.segments[ri];
        if (seg) out.push({ color: it.color, rider: it.rider, date, runNo: ri + 1, sessionId: it.ref.sessionId, runIdx: ri, seg, session });
      }
    }
    return out;
  }, [items]);

  if (!rows.length) return null;
  const hasPump = rows.some((r) => r.seg.avg_pump_hz != null && (r.seg.pumps ?? 0) > 0);
  const showPower = rows.some((r) => powerOf(r.session, r.seg.avg_speed_mps, r.seg.avg_pump_hz, weight) != null);
  const hz = (v: number | null | undefined) => (v != null ? v.toFixed(2) : "–");
  const spd = (s: any, kind: "avg" | "max" | "min") => {
    const v = s[`${kind}_${win}s`] ?? (kind === "avg" ? s.avg_speed_mps : kind === "max" ? s.max_speed_mps : s.min_speed_mps);
    return v != null ? (v * 3.6).toFixed(1) : "–";
  };
  // Bestwerte über alle Zeilen für dezente Hervorhebung.
  const bestDist = Math.max(...rows.map((r) => r.seg.distance_m ?? 0));

  return (
    <div className="mt-8">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-200">{t("compare.runsTitle", { count: rows.length })}</h3>
        <span className="ml-auto text-xs text-slate-400">{t("sd.smoothToggle", { win })}</span>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-3 py-2 font-medium">{t("compare.colRider")}</th>
              <th className="px-3 py-2 font-medium">{t("compare.colSession")}</th>
              <th className="px-3 py-2 font-medium">{t("sd.run")}</th>
              <th className="px-3 py-2 font-medium">{t("sd.colDistance")}</th>
              <th className="px-3 py-2 font-medium">{t("sd.colDuration")}</th>
              <th className="px-3 py-2 font-medium">{t("sd.colAvg")}</th>
              <th className="px-3 py-2 font-medium">{t("sd.colMax", { win })}</th>
              <th className="px-3 py-2 font-medium">{t("sd.colMin", { win })}</th>
              {showPower && <th className="px-3 py-2 font-medium">{t("sd.colPower")}</th>}
              <th className="px-3 py-2 font-medium">{t("sd.colPumps")}</th>
              {hasPump && <th className="px-3 py-2 font-medium">{t("sd.colDistPerPump")}</th>}
              {hasPump && <th className="px-3 py-2 font-medium">{t("sd.colAvgPump")}</th>}
              <th className="px-3 py-2 font-medium">{t("sd.colGlide")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const best = (r.seg.distance_m ?? 0) === bestDist && bestDist > 0;
              const power = showPower ? powerOf(r.session, r.seg.avg_speed_mps, r.seg.avg_pump_hz, weight) : null;
              return (
                <tr key={`${r.sessionId}:${r.runIdx}`} className={`border-b border-slate-800/50 hover:bg-slate-800/50 ${best ? "bg-brand-500/5" : ""}`}>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
                      <span className="truncate text-slate-100">{r.rider ?? "—"}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <Link to={`/sessions/${r.sessionId}?run=${r.runIdx}`} className="text-slate-300 hover:text-brand-300">{r.date}</Link>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{r.runNo}</td>
                  <td className="px-3 py-2 tabular-nums">{Math.round(r.seg.distance_m)} m</td>
                  <td className="px-3 py-2 tabular-nums">{fmtMMSS(r.seg.duration_s)}</td>
                  <td className="px-3 py-2 tabular-nums">{r.seg.avg_speed_mps != null ? (r.seg.avg_speed_mps * 3.6).toFixed(1) : "–"}</td>
                  <td className="px-3 py-2 tabular-nums">{spd(r.seg, "max")}</td>
                  <td className="px-3 py-2 tabular-nums">{spd(r.seg, "min")}</td>
                  {showPower && <td className="px-3 py-2 tabular-nums text-brand-400">{power != null ? `${power} W` : "–"}</td>}
                  <td className="px-3 py-2 tabular-nums">{r.seg.pumps ?? "–"}</td>
                  {hasPump && <td className="px-3 py-2 tabular-nums">{r.seg.pumps ? `${(r.seg.distance_m / r.seg.pumps).toFixed(1)} m` : "–"}</td>}
                  {hasPump && <td className="px-3 py-2 tabular-nums">{hz(r.seg.avg_pump_hz)}</td>}
                  <td className="px-3 py-2 tabular-nums">{r.seg.longest_glide_s != null ? `${r.seg.longest_glide_s.toFixed(1)} s` : "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
