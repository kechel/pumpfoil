// Kleine, wiederverwendbare UI-Bausteine (Tailwind).
import { ReactNode, useState } from "react";

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
  variant?: "primary" | "ghost";
  className?: string;
  disabled?: boolean;
}) {
  const styles =
    variant === "primary"
      ? "bg-brand-500 hover:bg-brand-400 text-slate-950 font-semibold"
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

export function Avatar({
  name,
  url,
  size = 32,
  fill = false,
  rounded = "rounded-full",
  className = "",
}: {
  name?: string | null;
  url?: string | null;
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
  return (
    <div
      className={`flex items-center justify-center bg-slate-700 font-semibold text-slate-200 ${rounded} ${fill ? "h-full w-full" : "shrink-0 ring-1 ring-slate-600"} ${className}`}
      style={fill ? { fontSize: size * 0.45 } : { width: size, height: size, fontSize: size * 0.45 }}
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
    <div className="rounded-xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
      {message}
    </div>
  );
}
