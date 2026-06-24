// Schlanke Inline-SVG-Icons (keine externe Icon-Lib nötig).
type P = { className?: string };
const base = "w-5 h-5";

export const WaveIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2" />
    <path d="M2 17c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2" />
  </svg>
);

export const SpotsIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z" />
    <circle cx="12" cy="9" r="2.5" />
  </svg>
);

export const HomeIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 11.5 12 4l9 7.5" />
    <path d="M5 10v10h5v-6h4v6h5V10" />
  </svg>
);

export const ShieldIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

export const SettingsIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

export const ChartIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3v18h18" />
    <path d="M7 14l4-4 3 3 5-6" />
  </svg>
);

export const CommunityIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

export const ListIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

export const WatchIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="6" y="6" width="12" height="12" rx="3" /><path d="M9 6l.5-3h5l.5 3M9 18l.5 3h5l.5-3" />
  </svg>
);

export const LogoutIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

export const ChevronIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

// Ort/Spot — schlanke Map-Pin-Variante (für Inline-Labels neben Spotnamen).
export const LocationIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...stroke}>
    <path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z" />
    <circle cx="12" cy="9" r="2.5" />
  </svg>
);

// Foil (Hydrofoil): Frontflügel + Mast + Stabilisator.
export const FoilIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...stroke}>
    <path d="M2 7c6-3 14-3 20 0-6 2.5-14 2.5-20 0Z" />
    <path d="M12 7v11" />
    <path d="M8.5 18h7" />
  </svg>
);

// Läufe / Runs — Wiederhol-/Rundenpfeile.
export const RunsIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...stroke}>
    <path d="M17 2l4 4-4 4" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <path d="M7 22l-4-4 4-4" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
);

export const HeartIcon = ({ className = base, filled = false }: P & { filled?: boolean }) => (
  <svg className={className} viewBox="0 0 24 24" {...stroke} fill={filled ? "currentColor" : "none"}>
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
  </svg>
);

export const CameraIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...stroke}>
    <path d="M3 7h3l2-2.5h8L18 7h3v13H3z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
);

export const VideoIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...stroke}>
    <rect x="2.5" y="6.5" width="13" height="11" rx="2.5" />
    <path d="M15.5 10.5 21.5 7v10l-6-3.5z" />
  </svg>
);

export const PlayIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path d="M8 5.5v13l11-6.5z" />
  </svg>
);

// Melden / unangemessen — Flagge.
export const FlagIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...stroke}>
    <path d="M5 21V4" />
    <path d="M5 4h11l-2 3 2 3H5" />
  </svg>
);

// Taschenrechner (Foil-Rechner).
export const CalculatorIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...stroke}>
    <rect x="5" y="2.5" width="14" height="19" rx="2.5" />
    <rect x="8" y="5.5" width="8" height="3" rx="0.6" />
    <line x1="9" y1="12.5" x2="9" y2="12.5" />
    <line x1="12" y1="12.5" x2="12" y2="12.5" />
    <line x1="15" y1="12.5" x2="15" y2="12.5" />
    <line x1="9" y1="15.5" x2="9" y2="15.5" />
    <line x1="12" y1="15.5" x2="12" y2="15.5" />
    <line x1="15" y1="15.5" x2="15" y2="15.5" />
    <line x1="9" y1="18.5" x2="9" y2="18.5" />
    <line x1="12" y1="18.5" x2="12" y2="18.5" />
    <line x1="15" y1="18.5" x2="15" y2="18.5" />
  </svg>
);

// Unecht / zweifelhaft (fake) — Warndreieck.
export const FakeIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...stroke}>
    <path d="M12 3 2 20h20L12 3Z" />
    <path d="M12 10v4" />
    <path d="M12 17h.01" />
  </svg>
);
