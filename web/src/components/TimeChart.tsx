// Schlanker SVG-Zeitreihen-Chart mit Drag-Select (Maus + Touch). Keine Chart-Lib.
import { useRef, useState } from "react";

export interface LabelSpan {
  t_start_ms: number;
  t_end_ms: number;
  label: string;
}

const LABEL_COLORS: Record<string, string> = {
  pump: "#22d3ee",
  glide: "#a3e635",
  not_foiling: "#64748b",
};

export function TimeChart({
  t,
  values,
  color = "#22d3ee",
  height = 120,
  domainMs,
  spans = [],
  selection,
  onSelect,
  title,
}: {
  t: number[];
  values: (number | null)[];
  color?: string;
  height?: number;
  domainMs: [number, number];
  spans?: LabelSpan[];
  selection?: [number, number] | null;
  onSelect?: (range: [number, number]) => void;
  title?: string;
}) {
  const W = 1000; // viewBox-Breite (skaliert responsiv)
  const H = height;
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<[number, number] | null>(null);

  const [t0, t1] = domainMs;
  const span = Math.max(t1 - t0, 1);
  const xFor = (ms: number) => ((ms - t0) / span) * W;

  const nums = values.filter((v): v is number => v != null);
  const vmin = nums.length ? Math.min(...nums) : 0;
  const vmax = nums.length ? Math.max(...nums) : 1;
  const vspan = Math.max(vmax - vmin, 1e-6);
  const yFor = (v: number) => H - 6 - ((v - vmin) / vspan) * (H - 12);

  let d = "";
  for (let i = 0; i < t.length; i++) {
    const v = values[i];
    if (v == null) continue;
    d += `${d ? "L" : "M"}${xFor(t[i]).toFixed(1)},${yFor(v).toFixed(1)}`;
  }

  function msFromClientX(clientX: number): number {
    const rect = svgRef.current!.getBoundingClientRect();
    const frac = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    return t0 + frac * span;
  }

  function down(clientX: number) {
    const ms = msFromClientX(clientX);
    setDrag([ms, ms]);
  }
  function move(clientX: number) {
    if (!drag) return;
    setDrag([drag[0], msFromClientX(clientX)]);
  }
  function up() {
    if (drag && onSelect) {
      const a = Math.min(drag[0], drag[1]);
      const b = Math.max(drag[0], drag[1]);
      if (b - a > 200) onSelect([a, b]);
    }
    setDrag(null);
  }

  const active = drag ?? selection;

  return (
    <div className="select-none">
      {title && <div className="mb-1 px-1 text-xs font-medium text-slate-300">{title}</div>}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-[120px] w-full touch-none rounded-lg bg-slate-900/60"
        onMouseDown={(e) => down(e.clientX)}
        onMouseMove={(e) => move(e.clientX)}
        onMouseUp={up}
        onMouseLeave={up}
        onTouchStart={(e) => down(e.touches[0].clientX)}
        onTouchMove={(e) => move(e.touches[0].clientX)}
        onTouchEnd={up}
      >
        {/* bestehende Labels als farbige Bänder */}
        {spans.map((s, i) => (
          <rect
            key={i}
            x={xFor(s.t_start_ms)}
            y={0}
            width={Math.max(xFor(s.t_end_ms) - xFor(s.t_start_ms), 1)}
            height={H}
            fill={LABEL_COLORS[s.label] ?? "#475569"}
            opacity={0.18}
          />
        ))}
        {/* aktuelle Auswahl — Brand-Cyan mit Kontur, damit sie auf dem halbtransparenten
            Chart-Hintergrund in BEIDEN Themes sichtbar ist (der frühere helle Fill #e2e8f0
            verschwand im Light-Mode, wo Weiß durchscheint). Konsistent mit dem Karten-Highlight. */}
        {active && (
          <rect
            x={xFor(Math.min(active[0], active[1]))}
            y={0}
            width={Math.max(xFor(Math.max(active[0], active[1])) - xFor(Math.min(active[0], active[1])), 1)}
            height={H}
            fill="#22d3ee"
            fillOpacity={0.22}
            stroke="#22d3ee"
            strokeWidth={1}
            strokeOpacity={0.9}
            vectorEffect="non-scaling-stroke"
          />
        )}
        <path d={d} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

export { LABEL_COLORS };
