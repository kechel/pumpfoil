// Schlanke Inline-SVG-Icons (keine externe Icon-Lib nötig).
type P = { className?: string };
const base = "w-5 h-5";

export const ShareIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v13" /><path d="M8 7l4-4 4 4" /><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
  </svg>
);

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

// Nerd-Brille mit Klebeband-Steg (für die Nerd-Analysen).
export const NerdIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="6.5" cy="14" r="3.5" />
    <circle cx="17.5" cy="14" r="3.5" />
    <path d="M10 13c.7-.9 3.3-.9 4 0" />
    <path d="M3.3 12 1.6 10" />
    <path d="M20.7 12 22.4 10" />
    <path d="M12 11.4v3.2" />
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

// Vergleich — zwei Balken nebeneinander (Sessions/Läufe gegenüberstellen).
export const CompareIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...stroke}>
    <rect x="4" y="9" width="6" height="11" rx="1" />
    <rect x="14" y="4" width="6" height="16" rx="1" />
  </svg>
);

export const HeartIcon = ({ className = base, filled = false }: P & { filled?: boolean }) => (
  <svg className={className} viewBox="0 0 24 24" {...stroke} fill={filled ? "currentColor" : "none"}>
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
  </svg>
);

// Herzfrequenz/Puls — Herz mit EKG-Linie (nicht rot, Likes sind rot).
export const HeartPulseIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...stroke}>
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.5 4.04 3 5.5l7 7Z" />
    <path d="M3.2 12h6.3l.5-1 2 4.5 2-7 1.5 3.5h5.3" />
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

export const MapIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...stroke}>
    <path d="M9 4 3 6.5v13L9 17l6 2.5L21 17V4l-6 2.5L9 4Z" /><line x1="9" y1="4" x2="9" y2="17" /><line x1="15" y1="6.5" x2="15" y2="19.5" />
  </svg>
);

export const UploadIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...stroke}>
    <path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M5 20h14" />
  </svg>
);

export const TagIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...stroke}>
    <path d="M3 12V4h8l9 9-7 7-9-9Z" /><circle cx="7.5" cy="7.5" r="1.3" />
  </svg>
);

export const LockIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...stroke}>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
  </svg>
);

export const InfoIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...stroke}>
    <circle cx="12" cy="12" r="9.5" /><line x1="12" y1="11" x2="12" y2="16.5" /><line x1="12" y1="7.5" x2="12" y2="7.5" />
  </svg>
);

export const DownloadIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...stroke}>
    <path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 20h14" />
  </svg>
);

export const KeyboardIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...stroke}>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <line x1="7" y1="14.5" x2="17" y2="14.5" />
    <line x1="6" y1="9.5" x2="6" y2="9.5" /><line x1="9.5" y1="9.5" x2="9.5" y2="9.5" />
    <line x1="13" y1="9.5" x2="13" y2="9.5" /><line x1="16.5" y1="9.5" x2="16.5" y2="9.5" />
  </svg>
);

export const WifiOffIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...stroke}>
    <path d="M12 20h.01" />
    <path d="M8.5 16.4a5 5 0 0 1 7 0" />
    <path d="M5 12.9a10 10 0 0 1 5.2-2.7" />
    <path d="M19 12.9a10 10 0 0 0-3.9-2.5" />
    <path d="M22 8.8a16 16 0 0 0-9.6-3.3" />
    <path d="M2 8.8a16 16 0 0 1 4.7-2.8" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
);

export const CloseIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...stroke}>
    <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
  </svg>
);

export const CheckIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...stroke}>
    <polyline points="4 12 9 17 20 6" />
  </svg>
);

export const ChatBubbleIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...stroke}>
    <path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5Z" />
  </svg>
);

export const EditIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...stroke}>
    <path d="M4 20h4L19 9l-4-4L4 16v4Z" /><line x1="13.5" y1="6.5" x2="17.5" y2="10.5" />
  </svg>
);

export const TrashIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...stroke}>
    <path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

export const EyeIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...stroke}>
    <path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z" /><circle cx="12" cy="12" r="3" />
  </svg>
);

export const EyeOffIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...stroke}>
    <path d="M9.9 5.2A10 10 0 0 1 12 5c7 0 10.5 7 10.5 7a17 17 0 0 1-3.3 4.1M6.2 6.7A17 17 0 0 0 1.5 12S5 19 12 19a10 10 0 0 0 4.1-.9" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /><line x1="3" y1="3" x2="21" y2="21" />
  </svg>
);

export const MuteIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...stroke}>
    <path d="M4 9v6h4l5 4V5L8 9H4Z" /><line x1="16" y1="9" x2="22" y2="15" /><line x1="22" y1="9" x2="16" y2="15" />
  </svg>
);

export const StarIcon = ({ className = base, filled = false }: P & { filled?: boolean }) => (
  <svg className={className} viewBox="0 0 24 24" {...stroke} fill={filled ? "currentColor" : "none"}>
    <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5Z" />
  </svg>
);

export const TimerIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...stroke}>
    <circle cx="12" cy="13" r="8" /><line x1="12" y1="13" x2="12" y2="9" /><line x1="9" y1="2.5" x2="15" y2="2.5" /><line x1="12" y1="2.5" x2="12" y2="5" />
  </svg>
);

// Glocke (Push-Abo an).
export const BellIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...stroke}>
    <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" />
    <path d="M10.5 19a1.8 1.8 0 0 0 3 0" />
  </svg>
);

// Glocke durchgestrichen (Push-Abo aus).
export const BellOffIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...stroke}>
    <path d="M6 9a6 6 0 0 1 9.3-5" />
    <path d="M18 13c0 2 2 2 2 2H8" />
    <path d="M10.5 19a1.8 1.8 0 0 0 3 0" />
    <line x1="3" y1="3" x2="21" y2="21" />
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
