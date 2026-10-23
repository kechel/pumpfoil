// Supporter-Badge „Welle + Herz" (brand/badges/supporter.svg, Jan 23.10.2026): wer uns in den letzten 4 Wochen
// geholfen hat (Feedback jeder Art, s. server/app/supporter.py). Drei Stufen nach Beitragstagen im Jahr:
// 1 Cyan (Marke), 2 Smaragd, 3 Gold. Keine Verlaeufe (docs/BRAND.md).
const FARBE: Record<number, { fill: string; rand: string }> = {
  1: { fill: "#22d3ee", rand: "#0e7490" },
  2: { fill: "#34d399", rand: "#047857" },
  3: { fill: "#fbbf24", rand: "#b45309" },
};

export function SupporterBadge({ stufe, size = 16, title }: { stufe: number; size?: number; title?: string }) {
  const f = FARBE[stufe];
  if (!f) return null;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} role="img" aria-label={title}>
      {title && <title>{title}</title>}
      <circle cx="12" cy="12" r="9.6" fill={f.fill} stroke={f.rand} strokeWidth="1.6" />
      <path d="M5 16.4c1.2-.9 2.3-.9 3.5 0s2.3.9 3.5 0 2.3-.9 3.5 0 2.3.9 3.5 0" fill="none" stroke="#020617" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 13.4c-2.5-1.7-3.6-2.9-3.6-4.4a1.9 1.9 0 0 1 3.6-1 1.9 1.9 0 0 1 3.6 1c0 1.5-1.1 2.7-3.6 4.4z" fill="#020617" />
    </svg>
  );
}
