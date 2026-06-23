// Mini-Track-Vorschau: rendert die normalisierten Polylinien (aus der Analyse) als
// kleines SVG. data = JSON-String {"w","h","lines":[[[x,y],...],...]} oder null.
export function TrackPreview({ data, className }: { data?: string | null; className?: string }) {
  if (!data) return null;
  let p: { w: number; h: number; lines: number[][][] };
  try {
    p = JSON.parse(data);
  } catch {
    return null;
  }
  if (!p?.lines?.length) return null;
  return (
    <svg viewBox={`0 0 ${p.w} ${p.h}`} className={className} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {p.lines.map((line, i) => (
        <polyline
          key={i}
          points={line.map(([x, y]) => `${x},${y}`).join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}
