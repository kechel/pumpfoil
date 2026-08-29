// Kleine SVG-Bausteine für den Auswertungs-Tab. Bewusst ohne Chart-Library:
// das Studio hat sonst keine Abhängigkeiten außer React, und die drei Formen
// hier (Linie, Balken, Punktwolke) sind schneller gebaut als eingebunden.
//
// Farben: feste Zuordnung Plattform → Farbe (nie nach Rang, nie durchrotiert,
// damit ein Filter die übrigen Serien nicht umfärbt). Die Palette ist gegen
// Farbfehlsichtigkeit geprüft — hell und dunkel getrennt gewählt, nicht
// gespiegelt. Vier Farben halten den Adjacent-Test; für die Punktwolke, wo
// jedes Paar gegen jedes andere steht, gibt es deshalb Small Multiples
// (ein Feld je Plattform) statt vier Farben in einem Bild.
import { ReactNode, useState } from "react";

export const PLATFORMS = ["youtube", "facebook", "instagram", "tiktok"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLAT_LABEL: Record<Platform, string> = {
  youtube: "YouTube", facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok",
};
// Slot 1/2/3/7 der geprüften Kategorial-Palette.
export const PLAT_COLOR: Record<Platform, string> = {
  youtube: "var(--s-yt)", facebook: "var(--s-fb)",
  instagram: "var(--s-ig)", tiktok: "var(--s-tt)",
};

export const fmt = (n: number | null | undefined, dash = "—") =>
  n === null || n === undefined || Number.isNaN(n) ? dash : n.toLocaleString("de-DE");
export const fmt1 = (n: number | null | undefined) =>
  n === null || n === undefined || Number.isNaN(n) ? "—" : n.toFixed(1);
export const short = (n: number) =>
  n >= 1e6 ? (n / 1e6).toFixed(1).replace(".", ",") + " Mio"
    : n >= 1000 ? Math.round(n / 1000) + "k" : String(n);

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/* ------------------------------------------------------- Tooltip-Ebene --- */
interface Tip { x: number; y: number; node: ReactNode }

export function useTip() {
  const [tip, setTip] = useState<Tip | null>(null);
  const layer = tip ? (
    <div className="viz-tip" style={{ left: tip.x, top: tip.y }}>{tip.node}</div>
  ) : null;
  return { tip, setTip, layer };
}

/* ------------------------------------------------------------- Legende --- */
export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="viz-legend">
      {items.map((i) => (
        <span key={i.label}>
          <i style={{ background: i.color }} />{i.label}
        </span>
      ))}
    </div>
  );
}

/* --------------------------------------------------------- Balken quer --- */
// Für Ranglisten (Länder, Wochen). Wert steht direkt am Balken — damit sind
// die Zahlen auch dann lesbar, wenn ein Farbton wenig Kontrast zur Fläche hat.
export function BarList({ rows, color, unit = "", max }: {
  rows: { label: string; value: number; sub?: string }[];
  color: string; unit?: string; max?: number;
}) {
  const hi = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="barlist">
      {rows.map((r) => (
        <div className="barrow" key={r.label}>
          <span className="lbl" title={r.label}>{r.label}</span>
          <span className="track">
            <span className="fill" style={{ width: `${(r.value / hi) * 100}%`, background: color }} />
          </span>
          <span className="val">{fmt(r.value)}{unit}{r.sub ? <em> {r.sub}</em> : null}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------- Liniendiagramm --- */
export interface Series { key: string; label: string; color: string; points: { x: number; y: number }[] }

export function LineChart({ series, height = 210, yLabel, xFormat }: {
  series: Series[]; height?: number; yLabel?: string; xFormat: (x: number) => string;
}) {
  const { setTip, layer } = useTip();
  const W = 760, H = height, P = { t: 12, r: 64, b: 26, l: 54 };
  const pts = series.flatMap((s) => s.points);
  if (!pts.length) return <p className="muted">Noch keine Verlaufsdaten.</p>;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y1 = Math.max(...ys) * 1.08;
  const sx = (x: number) => P.l + (x1 === x0 ? 0.5 : (x - x0) / (x1 - x0)) * (W - P.l - P.r);
  const sy = (y: number) => H - P.b - (y / (y1 || 1)) * (H - P.t - P.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * y1);
  return (
    <div className="viz-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="viz" role="img">
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={P.l} x2={W - P.r} y1={sy(t)} y2={sy(t)} />
            <text className="ax" x={P.l - 8} y={sy(t) + 4} textAnchor="end">{short(t)}</text>
          </g>
        ))}
        <text className="ax" x={P.l - 8} y={P.t - 2} textAnchor="end">{yLabel}</text>
        {[x0, x1].map((x, i) => (
          <text key={i} className="ax" x={sx(x)} y={H - 8} textAnchor={i ? "end" : "start"}>
            {xFormat(x)}
          </text>
        ))}
        {series.map((s) => {
          const d = s.points.map((p, i) => `${i ? "L" : "M"}${sx(p.x)},${sy(p.y)}`).join(" ");
          const last = s.points[s.points.length - 1];
          return (
            <g key={s.key}>
              <path d={d} fill="none" stroke={s.color} strokeWidth={2}
                    strokeLinejoin="round" strokeLinecap="round" />
              {s.points.map((p, i) => (
                <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={4} fill={s.color}
                        stroke="var(--viz-surface)" strokeWidth={2}
                        onMouseEnter={(e) => setTip({
                          x: e.clientX, y: e.clientY,
                          node: <><b>{s.label}</b><br />{xFormat(p.x)}<br />{fmt(p.y)}</>,
                        })}
                        onMouseLeave={() => setTip(null)} />
              ))}
              {/* Direktbeschriftung am Linienende — Identität nie nur über Farbe */}
              {last && (
                <text className="endlbl" x={sx(last.x) + 8} y={sy(last.y) + 4} fill={s.color}>
                  {s.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {layer}
    </div>
  );
}

/* ----------------------------------------------- Punktwolke (ein Feld) --- */
// x = Aufrufe (logarithmisch, die Verteilung ist extrem schief),
// y = Likes je 1000 Aufrufe. Ein Feld je Plattform, eine Farbe je Feld.
export function Scatter({ points, color, title, onPick }: {
  points: { x: number; y: number; label: string; id: string }[];
  color: string; title: string; onPick?: (id: string) => void;
}) {
  const { setTip, layer } = useTip();
  const W = 340, H = 200, P = { t: 10, r: 12, b: 26, l: 36 };
  const use = points.filter((p) => p.x > 0);
  if (!use.length) return <div className="facet"><h4>{title}</h4><p className="muted">keine Daten</p></div>;
  const lx = (v: number) => Math.log10(Math.max(1, v));
  const x0 = Math.min(...use.map((p) => lx(p.x))), x1 = Math.max(...use.map((p) => lx(p.x)));
  const y1 = Math.max(1, ...use.map((p) => p.y)) * 1.1;
  const sx = (v: number) => P.l + (x1 === x0 ? 0.5 : (lx(v) - x0) / (x1 - x0)) * (W - P.l - P.r);
  const sy = (v: number) => H - P.b - (v / y1) * (H - P.t - P.b);
  const decades = [];
  for (let d = Math.ceil(x0); d <= Math.floor(x1); d++) decades.push(10 ** d);
  return (
    <div className="facet">
      <h4><i style={{ background: color }} />{title}</h4>
      <div className="viz-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="viz" role="img">
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line className="grid" x1={P.l} x2={W - P.r} y1={sy(f * y1)} y2={sy(f * y1)} />
              <text className="ax" x={P.l - 6} y={sy(f * y1) + 4} textAnchor="end">{(f * y1).toFixed(0)}</text>
            </g>
          ))}
          {decades.map((d) => (
            <text key={d} className="ax" x={sx(d)} y={H - 8} textAnchor="middle">{short(d)}</text>
          ))}
          {use.map((p) => (
            <circle key={p.id} cx={sx(p.x)} cy={sy(p.y)} r={5} fill={color} fillOpacity={0.75}
                    stroke="var(--viz-surface)" strokeWidth={2}
                    style={{ cursor: onPick ? "pointer" : "default" }}
                    onClick={() => onPick?.(p.id)}
                    onMouseEnter={(e) => setTip({
                      x: e.clientX, y: e.clientY,
                      node: <><b>{p.label}</b><br />{fmt(p.x)} Aufrufe<br />{fmt1(p.y)} Likes/1000</>,
                    })}
                    onMouseLeave={() => setTip(null)} />
          ))}
        </svg>
        {layer}
      </div>
    </div>
  );
}
