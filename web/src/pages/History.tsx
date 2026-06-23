import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, HistoryPoint } from "../lib/api";
import { Card, Spinner, ErrorBox } from "../components/ui";
import { ChartIcon } from "../components/Icons";
import { useT } from "../i18n";

type Mode = "cumulative" | "window7" | "window30";
type Pt = { t: number; v: number; sid: number; run: number | null };
const RUN_METRICS = ["distance", "duration", "speed", "glide"];

const METRICS: { key: keyof HistoryPoint; labelKey: string; fmt: (v: number) => string; color: string }[] = [
  { key: "distance", labelKey: "rec.farthestRun", fmt: (v) => `${Math.round(v)} m`, color: "#22d3ee" },
  { key: "duration", labelKey: "rec.longestRun", fmt: (v) => `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, "0")} min`, color: "#34d399" },
  { key: "glide", labelKey: "rec.longestGlide", fmt: (v) => `${v.toFixed(1)} s`, color: "#a78bfa" },
  { key: "foiling_km", labelKey: "metric.foilingPerSession", fmt: (v) => `${v.toFixed(1)} km`, color: "#60a5fa" },
];

// Aggregat-Metriken (Summen/Mittel über das Fenster bzw. kumuliert).
type Agg = {
  key: string; field?: keyof HistoryPoint | null; kind: "sum" | "avg" | "count" | "ratio" | "max";
  num?: keyof HistoryPoint; den?: keyof HistoryPoint | "count";
  labelKey: string; fmt: (v: number) => string; color: string;
};
// Oben (Einzel-Werte je Fenster/kumuliert): Mittel + Verhältnis, neben den Bestwerten.
const AGG_TOP: Agg[] = [
  // Bestwert-Sektion: bester Session-Ø im Fenster (kumuliert = laufender Bestwert).
  { key: "avg_speed", field: "avg_speed", kind: "max", labelKey: "sd.avgSpeed", fmt: (v) => `${(v * 3.6).toFixed(1)} km/h`, color: "#f59e0b" },
  { key: "avg_pump_hz", field: "avg_pump_hz", kind: "max", labelKey: "metric.avgPumpFreq", fmt: (v) => `${v.toFixed(2)} Hz`, color: "#f472b6" },
  { key: "pumps_per_session", kind: "ratio", num: "pumps", den: "count", labelKey: "metric.pumpsPerSession", fmt: (v) => v.toFixed(0), color: "#fb7185" },
];
// Unten: reine Summen über das Fenster bzw. kumuliert.
const AGG_SUM: Agg[] = [
  { key: "sessions", field: null, kind: "count", labelKey: "stat.sessions", fmt: (v) => `${Math.round(v)}`, color: "#60a5fa" },
  { key: "runs", field: "runs", kind: "sum", labelKey: "stat.runs", fmt: (v) => `${Math.round(v)}`, color: "#34d399" },
  { key: "foiling_km", field: "foiling_km", kind: "sum", labelKey: "stat.foiling", fmt: (v) => `${v.toFixed(1)} km`, color: "#22d3ee" },
  { key: "pumps", field: "pumps", kind: "sum", labelKey: "stat.pumps", fmt: (v) => Math.round(v).toLocaleString("de"), color: "#a78bfa" },
];

const DAY_MS = 24 * 3600 * 1000;

function aggSeries(data: HistoryPoint[], m: Agg, mode: Mode, domain: [number, number]): Pt[] {
  // Verhältnis-Metrik (z. B. Pumps / Session): Σnum / Σden über Fenster bzw. kumuliert.
  if (m.kind === "ratio") {
    const valid = data
      .map((d) => ({ t: new Date(d.started_at).getTime(), num: Number((d as any)[m.num!]), den: m.den === "count" ? 1 : Number((d as any)[m.den!]), sid: d.session_id }))
      // Nur Sessions, die die Kennzahl wirklich haben (z. B. Pumps>0): sonst würden
      // GPS-only-Sessions ohne Pump-Daten den Schnitt verwässern.
      .filter((b) => Number.isFinite(b.num) && b.num > 0 && Number.isFinite(b.den) && b.den > 0)
      .sort((a, b) => a.t - b.t);
    if (valid.length < 2) return [];
    if (mode === "cumulative") {
      let sn = 0, sd = 0;
      return valid.map((b) => { sn += b.num; sd += b.den; return { t: b.t, v: sd ? sn / sd : 0, sid: b.sid, run: null }; });
    }
    const winMs = (mode === "window7" ? 7 : 30) * DAY_MS;
    let lastSid = valid[0].sid;
    const at = (tt: number): Pt => {
      let sn = 0, sd = 0, sid = lastSid;
      for (const b of valid) if (b.t > tt - winMs && b.t <= tt) { sn += b.num; sd += b.den; sid = b.sid; }
      if (sd > 0) lastSid = sid;
      return { t: tt, v: sd ? sn / sd : 0, sid, run: null };
    };
    const out: Pt[] = [];
    for (let tt = domain[0]; tt < domain[1]; tt += DAY_MS) out.push(at(tt));
    out.push(at(domain[1]));
    return out;
  }

  const valid = data
    .map((d) => ({ t: new Date(d.started_at).getTime(), v: m.field ? Number((d as any)[m.field]) : 1, sid: d.session_id }))
    .filter((b) => Number.isFinite(b.v))
    .sort((a, b) => a.t - b.t);
  if (valid.length < 2) return [];
  if (mode === "cumulative") {
    let sum = 0, n = 0, mx = 0;
    return valid.map((b) => {
      sum += b.v; n += 1; if (b.v > mx) mx = b.v;
      const v = m.kind === "avg" ? sum / n : m.kind === "count" ? n : m.kind === "max" ? mx : sum;
      return { t: b.t, v, sid: b.sid, run: null };
    });
  }
  const winMs = (mode === "window7" ? 7 : 30) * DAY_MS;
  let lastSid = valid[0].sid;
  const at = (tt: number): Pt => {
    let sum = 0, n = 0, mx = 0, sid = lastSid;
    for (const b of valid) if (b.t > tt - winMs && b.t <= tt) { sum += b.v; n += 1; if (b.v > mx) mx = b.v; sid = b.sid; }
    if (n > 0) lastSid = sid;
    const v = m.kind === "avg" ? (n ? sum / n : 0) : m.kind === "count" ? n : m.kind === "max" ? mx : sum;
    return { t: tt, v, sid, run: null };
  };
  const out: Pt[] = [];
  for (let tt = domain[0]; tt < domain[1]; tt += DAY_MS) out.push(at(tt));
  out.push(at(domain[1]));
  return out;
}

function AggMetricChart({ data, metric, mode, onPick, domain }: { data: HistoryPoint[]; metric: Agg; mode: Mode; onPick: (p: Pt) => void; domain: [number, number] }) {
  const t = useT();
  const pts = useMemo(() => aggSeries(data, metric, mode, domain), [data, metric, mode, domain]);
  const cur = pts.length ? pts[pts.length - 1].v : 0;
  return (
    <Card className="p-4">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-sm font-semibold text-slate-200">{t(metric.labelKey)}</span>
        <span className="tabular-nums font-bold" style={{ color: metric.color }}>{cur ? metric.fmt(cur) : "–"}</span>
      </div>
      <LineChart pts={pts} color={metric.color} fmt={metric.fmt} onPick={onPick} domain={domain} />
    </Card>
  );
}

export default function History() {
  const t = useT();
  const [data, setData] = useState<HistoryPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("window7");
  const [name, setName] = useState<string | null>(null);
  const nav = useNavigate();
  const pick = (p: Pt) => nav(`/sessions/${p.sid}${p.run != null ? `?run=${p.run}` : ""}`);

  useEffect(() => {
    api.history().then(setData).catch((e) => setError(String(e)));
    api.getProfile().then((p) => setName(p.display_name)).catch(() => {});
  }, []);

  if (error) return <ErrorBox message={error} />;
  if (!data) return <Spinner />;

  // Gemeinsame Zeitachse für ALLE Charts (gesamte Historie) — damit Lücken überall
  // gleich dargestellt werden und das Fenster-Raster auch außerhalb der jeweiligen
  // Metrik-Daten auf 0 fällt (z. B. Glide nur in Accel-Sessions).
  const times = data.map((d) => new Date(d.started_at).getTime());
  const domain: [number, number] = times.length ? [Math.min(...times), Math.max(...times)] : [0, 1];

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <ChartIcon className="h-7 w-7 text-brand-400" />
        <h2 className="text-2xl font-bold">{t("history.title")}{name ? ` · ${name}` : ""}</h2>
      </div>

      <div className="mb-5 flex gap-1">
        <ModeBtn active={mode === "cumulative"} onClick={() => setMode("cumulative")}>{t("history.cumulative")}</ModeBtn>
        <ModeBtn active={mode === "window7"} onClick={() => setMode("window7")}>{t("history.window7")}</ModeBtn>
        <ModeBtn active={mode === "window30"} onClick={() => setMode("window30")}>{t("history.window30")}</ModeBtn>
      </div>

      {data.length < 2 ? (
        <Card className="p-8 text-center text-slate-300">{t("history.tooFew")}</Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {METRICS.map((m) => (
              <MetricChart key={m.key as string} data={data} metric={m} mode={mode} onPick={pick} domain={domain} />
            ))}
            {AGG_TOP.map((m) => (
              <AggMetricChart key={m.key} data={data} metric={m} mode={mode} onPick={pick} domain={domain} />
            ))}
          </div>
          <h3 className="mb-3 mt-8 text-lg font-bold">{t("history.aggTitle")}</h3>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {AGG_SUM.map((m) => (
              <AggMetricChart key={m.key} data={data} metric={m} mode={mode} onPick={pick} domain={domain} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MetricChart({ data, metric, mode, onPick, domain }: { data: HistoryPoint[]; metric: typeof METRICS[number]; mode: Mode; onPick: (p: Pt) => void; domain: [number, number] }) {
  const t = useT();
  const pts = useMemo<Pt[]>(() => {
    const isRun = RUN_METRICS.includes(metric.key as string);
    const raw = data
      .map((d) => ({
        t: new Date(d.started_at).getTime(),
        v: Number(d[metric.key]),
        sid: d.session_id,
        run: isRun ? (d.run_idx?.[metric.key as "distance"] ?? null) : null,
      }))
      .filter((p) => isFinite(p.v) && p.v > 0)
      .sort((a, b) => a.t - b.t);
    if (raw.length < 1) return raw;
    if (mode === "cumulative") {
      // kumulierter Bestwert: verantwortlich ist die Session, die den Bestwert zuletzt setzte.
      let best = 0, sid = raw[0]?.sid ?? 0, run: number | null = raw[0]?.run ?? null;
      return raw.map((p) => {
        if (p.v > best) { best = p.v; sid = p.sid; run = p.run; }
        return { t: p.t, v: best, sid, run };
      });
    }
    // Gleitendes Fenster über ein Tagesraster über die GESAMTE Historie (domain):
    // so fällt die Kurve außerhalb von Aktivität/Datenlage korrekt auf 0 und alle
    // Charts teilen dieselbe Zeitachse. sid/run = zuletzt aktive Session (für Klick).
    const winMs = (mode === "window7" ? 7 : 30) * DAY_MS;
    const out: Pt[] = [];
    let lastSid = raw[0].sid, lastRun: number | null = raw[0].run;
    const at = (tt: number) => {
      let mx = 0, sid = lastSid, run = lastRun;
      for (const p of raw) {
        if (p.t > tt - winMs && p.t <= tt && p.v > mx) { mx = p.v; sid = p.sid; run = p.run; }
      }
      if (mx > 0) { lastSid = sid; lastRun = run; }
      return { t: tt, v: mx, sid, run };
    };
    for (let tt = domain[0]; tt < domain[1]; tt += DAY_MS) out.push(at(tt));
    out.push(at(domain[1]));
    return out;
  }, [data, metric, mode, domain]);

  const cur = pts.length ? pts[pts.length - 1].v : 0;
  return (
    <Card className="p-4">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-sm font-semibold text-slate-200">{t(metric.labelKey)}</span>
        <span className="tabular-nums font-bold" style={{ color: metric.color }}>{cur ? metric.fmt(cur) : "–"}</span>
      </div>
      <LineChart pts={pts} color={metric.color} fmt={metric.fmt} onPick={onPick} domain={domain} />
    </Card>
  );
}

function LineChart({ pts, color, fmt, onPick, domain }: { pts: Pt[]; color: string; fmt: (v: number) => string; onPick: (p: Pt) => void; domain?: [number, number] }) {
  const t = useT();
  const W = 320, H = 120, pad = 8, padB = 18, padL = 4;
  if (pts.length < 2) return <div className="h-[120px] text-xs text-slate-400">{t("history.tooFewData")}</div>;
  const tmin = domain ? domain[0] : pts[0].t, tmax = domain ? domain[1] : pts[pts.length - 1].t;
  const vmax = Math.max(...pts.map((p) => p.v)) * 1.05 || 1;
  const x = (t: number) => padL + ((t - tmin) / Math.max(tmax - tmin, 1)) * (W - pad - padL);
  const y = (v: number) => H - padB - (v / vmax) * (H - pad - padB);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(tmax).toFixed(1)} ${H - padB} L${x(tmin).toFixed(1)} ${H - padB} Z`;

  // ~4 Datums-Ticks gleichmäßig über die Zeitspanne.
  const N = 4;
  const ticks = Array.from({ length: N + 1 }, (_, i) => tmin + ((tmax - tmin) * i) / N);
  const fmtDate = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", year: "2-digit" });

  const [hov, setHov] = useState<Pt | null>(null);
  const nearest = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * W; // CSS-px -> viewBox-x
    let best = pts[0], bd = Infinity;
    for (const p of pts) {
      const d = Math.abs(x(p.t) - cx);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  };
  const hovPct = hov ? Math.min(90, Math.max(10, (x(hov.t) / W) * 100)) : 0;
  const hovDate = (tk: number) => new Date(tk).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "2-digit" });

  return (
    // Beschriftungen als HTML-Overlay (nicht im SVG) — das SVG wird per
    // preserveAspectRatio="none" horizontal gestreckt, was Text verzerren würde.
    <div className="relative" style={{ height: 120 }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full cursor-pointer" preserveAspectRatio="none"
        onClick={(e) => { const p = nearest(e); if (p.v > 0) onPick(p); }}
        onMouseMove={(e) => setHov(nearest(e))}
        onMouseLeave={() => setHov(null)}>
        <path d={area} fill={color} opacity={0.12} />
        {ticks.map((tk, i) => (
          <line key={i} x1={x(tk)} y1={pad} x2={x(tk)} y2={H - padB} stroke="#1e293b" strokeWidth={1} />
        ))}
        <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        <line x1={padL} y1={H - padB} x2={W - pad} y2={H - padB} stroke="#334155" strokeWidth={1} />
        {hov && <line x1={x(hov.t)} y1={pad} x2={x(hov.t)} y2={H - padB} stroke={color} strokeWidth={1} strokeDasharray="3 3" opacity={0.85} />}
      </svg>
      <div className="pointer-events-none absolute left-1 top-0 text-[10px] text-slate-300">{fmt(vmax / 1.05)}</div>
      {hov && (
        <>
          <div className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-slate-950"
            style={{ left: `${(x(hov.t) / W) * 100}%`, top: `${y(hov.v)}px`, background: color }} />
          <div className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-100 shadow"
            style={{ left: `${hovPct}%` }}>
            <b style={{ color }}>{fmt(hov.v)}</b> · {hovDate(hov.t)}
          </div>
        </>
      )}
      <div className="pointer-events-none absolute inset-x-1 bottom-0 flex justify-between text-[10px] text-slate-300">
        {ticks.map((tk, i) => <span key={i}>{fmtDate(tk)}</span>)}
      </div>
    </div>
  );
}

function ModeBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs ${active ? "bg-brand-500 font-semibold text-slate-950" : "bg-slate-800 text-slate-200"}`}
    >
      {children}
    </button>
  );
}
