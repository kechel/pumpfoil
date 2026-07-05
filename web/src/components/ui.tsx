// Kleine, wiederverwendbare UI-Bausteine (Tailwind).
import { ReactNode, useState } from "react";
import { useT } from "../i18n";

// „neu"-Badge für frische Konten (< 24 h) — sichtbar in Community & Chat.
export function NewBadge({ className = "" }: { className?: string }) {
  const t = useT();
  return (
    <span className={`inline-flex items-center rounded-full bg-emerald-500/15 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300 ${className}`}>
      {t("badge.new")}
    </span>
  );
}

export function Card({ children, className = "", onClick, id }: { children: ReactNode; className?: string; onClick?: () => void; id?: string }) {
  return (
    <div id={id} onClick={onClick} className={`rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur ${className}`}>
      {children}
    </div>
  );
}

export function Button({
  children,
  onClick,
  type = "button",
  variant = "primary",
  className = "",
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
  disabled?: boolean;
}) {
  const styles =
    variant === "primary"
      ? "bg-brand-500 hover:bg-brand-400 text-slate-950 font-semibold"
      : variant === "secondary"
        // gedämpftes Teal (dunkler als brand-500) — im Dark-Mode nicht zu grell, in beiden lesbar.
        ? "bg-brand-700 hover:bg-brand-600 text-white font-medium"
        : "bg-slate-800 hover:bg-slate-700 text-slate-100";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl px-4 py-2.5 transition-colors active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="overflow-hidden p-1.5">
      <div className="flex items-baseline gap-1 leading-none">
        <span className="text-base font-bold tabular-nums text-brand-400 sm:text-lg">{value}</span>
        {sub && <span className="truncate text-[11px] font-normal text-slate-400">{sub}</span>}
      </div>
      <div className="mt-1 text-[10px] uppercase leading-tight tracking-wide text-slate-300">{label}</div>
    </Card>
  );
}

// Fallback-Farben fuer Avatare ohne Bild: mittlere, gesaettigte Toene, die mit
// weisser Initiale sowohl im Light- als auch im Dark-Mode gut lesbar sind.
const AVATAR_COLORS = [
  "#0284c7", "#4f46e5", "#7c3aed", "#c026d3", "#db2777", "#e11d48",
  "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#059669", "#0d9488", "#0e7490",
];

function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export function Avatar({
  name,
  url,
  seed,
  size = 32,
  fill = false,
  rounded = "rounded-full",
  className = "",
}: {
  name?: string | null;
  url?: string | null;
  seed?: string | number | null; // stabiler Schluessel fuer die Fallback-Farbe (z. B. User-ID); default = name
  size?: number;
  fill?: boolean; // füllt den Eltern-Container (h-full w-full) statt fester Größe
  rounded?: string;
  className?: string;
}) {
  const initial = (name || "?").trim().charAt(0).toUpperCase() || "?";
  const [failed, setFailed] = useState(false);
  if (url && !failed) {
    return (
      <img
        src={url}
        alt={name || ""}
        // Bei Lade-Fehler (offline/nicht gecacht) auf die Initialen zurückfallen
        // statt ein kaputtes Bild zu zeigen.
        onError={() => setFailed(true)}
        className={`object-cover ${rounded} ${fill ? "h-full w-full" : "shrink-0 ring-1 ring-slate-700"} ${className}`}
        style={fill ? undefined : { width: size, height: size }}
      />
    );
  }
  const bg = avatarColor(String(seed ?? name ?? "?"));
  return (
    <div
      className={`flex items-center justify-center font-semibold text-white ${rounded} ${fill ? "h-full w-full" : "shrink-0 ring-1 ring-black/10"} ${className}`}
      style={fill ? { backgroundColor: bg, fontSize: size * 0.45 } : { backgroundColor: bg, width: size, height: size, fontSize: size * 0.45 }}
    >
      {initial}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-brand-400" />
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-300 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
      {message}
    </div>
  );
}
