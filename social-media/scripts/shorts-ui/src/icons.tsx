// Inline-SVGs im Lucide-Stil, passend zur pumpfoil.org-Web-App
export const ICON_PATHS: Record<string, string> = {
  star: "M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27l6.91-1.01L12 2z",
  lock: "M7 11V7a5 5 0 0 1 10 0v4",
  dumbbell: "m6.5 6.5 11 11M21 21l-1-1M3 3l1 1M18 22l4-4M2 6l4-4M3 10l7-7M14 21l7-7",
  trash: "M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6",
  undo: "M3 7v6h6M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13",
  folder: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
  up: "m5 12 7-7 7 7M12 19V5",
  play: "M6 3l14 9-6 4-8 5V3z",
  pause: "M14 4h4v16h-4zM6 4h4v16H6z",
  copy: "M8 8h12v12H8zM4 16V4h12",
  upload: "M4 17v3h16v-3M12 15V4m0 0 4 4m-4-4-4 4",
  film: "M4 4h16v16H4zM4 9h16M4 15h16M9 4v16M15 4v16",
  wand: "m15 4 5 5M9 10l-6 6 5 5 6-6m-5-5 5 5m-5-5 3-3 5 5-3 3",
  x: "M18 6 6 18M6 6l12 12",
};

export function Icon({
  name,
  filled = false,
  size = 16,
  className,
}: {
  name: string;
  filled?: boolean;
  size?: number;
  className?: string;
}) {
  const d = ICON_PATHS[name] ?? "";
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === "lock" && <rect x="3" y="11" width="18" height="11" rx="2" fill="none" stroke="currentColor" />}
      <path d={d} />
    </svg>
  );
}
