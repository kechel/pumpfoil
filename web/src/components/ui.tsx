// Kleine, wiederverwendbare UI-Bausteine (Tailwind).
import { ReactNode, useState } from "react";
import { useT } from "../i18n";
import { InfoIcon } from "./Icons";

// „neu"-Badge für frische Konten (< 24 h) — sichtbar in Community & Chat.
/**
 * Sicherheitsklassen für ein `<select>`, dessen Optionen aus DATEN kommen (Spot-, Foil-, Nutzer-
 * namen) — also beliebig lang werden können.
 *
 * Warum es die gibt: ein natives `<select>` ist so breit wie seine längste Option, und als
 * Flex-Kind schrumpft es wegen `min-width: auto` NICHT unter seinen Inhalt — es schiebt
 * stattdessen die ganze Seite breiter als das Fenster. Das hat dreimal zugeschlagen: Spots-Seite
 * (30.08., 231 Spotnamen), Sessions-Liste und Verlaufs-Animation (01.09., längste Beschriftung
 * 48 Zeichen). Deshalb hier benannt statt jedes Mal neu gefunden.
 *
 * Anwenden auf JEDES select mit dynamischen Optionen; die eigene Optik kommt dahinter:
 *   className={`${SELECT_SCHRUMPFT} rounded-xl border …`}
 *
 * Nicht nötig bei festen, kurzen Listen (Monat, Sportart) oder wenn schon `w-full`/`max-w-*` gilt.
 */
export const SELECT_SCHRUMPFT = "min-w-0 max-w-full truncate";

export function NewBadge({ className = "" }: { className?: string }) {
  const t = useT();
  return (
    <span className={`inline-flex items-center rounded-full bg-emerald-500/15 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300 ${className}`}>
      {t("badge.new")}
    </span>
  );
}

// ACHTUNG: `backdrop-blur` macht die Card zum Bezugsrahmen fuer `position: fixed` — ein
// Vollbild-Layer (Galerie, Dialog) INNERHALB einer Card wird auf die Kartengroesse eingesperrt.
// Solche Layer deshalb per `createPortal(..., document.body)` rendern (Beispiel: components/Lightbox.tsx).
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

// Kennzahl-Kachel MIT (i): eine Stelle fuer alle Kacheln, die etwas zu erklaeren haben
// (Laeufe/Starts, theoretische Leistung, …). Vorher hatte jede ihr eigenes Verhalten — die eine
// ein `title`-Tooltip (auf dem Handy unsichtbar), die andere ein Popup. Jan, 02.09.: das Popup
// ist das Richtige, und im Light-Mode gehoert WEISS dahinter, kein Grau.
//
// Zum Hintergrund: `Card` ist `bg-slate-900/60`, und slate kippt im Light-Mode automatisch — das
// ergibt ueber dem dunklen Schleier ein Grau. Hier deshalb bewusst `bg-white dark:bg-slate-900`,
// die eine Stelle, an der eine weisse Basis richtig ist (s. Memory light-mode-contrast-pattern).
export function InfoDialog({ title, text, onClose }: { title: string; text: string; onClose: () => void }) {
  const t = useT();
  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="rounded-2xl border border-slate-800 bg-white p-4 shadow-xl dark:bg-slate-900">
          <h3 className="mb-2 text-base font-bold text-slate-100">{title}</h3>
          <p className="whitespace-pre-line text-sm text-slate-200">{text}</p>
          <button type="button" onClick={onClose}
            className="mt-3 rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-brand-400">
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Kleines (i) oben rechts in einer Kachel — oeffnet den Dialog oben. */
export function InfoKnopf({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={label}
      className="absolute right-1 top-1 text-slate-400 hover:text-slate-200">
      <InfoIcon className="h-3 w-3" />
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
        className={`pf-avatar object-cover ${rounded} ${fill ? "h-full w-full" : "shrink-0 ring-1 ring-slate-700"} ${className}`}
        style={fill ? undefined : { width: size, height: size }}
      />
    );
  }
  const bg = avatarColor(String(seed ?? name ?? "?"));
  return (
    <div
      className={`pf-avatar flex items-center justify-center font-semibold text-white ${rounded} ${fill ? "h-full w-full" : "shrink-0 ring-1 ring-black/10"} ${className}`}
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
