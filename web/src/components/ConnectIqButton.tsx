import { useT } from "../i18n";

// Offizieller Store-Link der Garmin-App (approved 2026-07-02). URL + Label an EINER Stelle,
// wiederverwendet auf der Landing-Seite (unter den Garmin-Screenshots) und in der /uhr-Anleitung.
export const CONNECT_IQ_URL = "https://apps.garmin.com/apps/9a2a753e-b52f-4587-aee4-900caf5cb351";

export function ConnectIqButton({ className = "" }: { className?: string }) {
  const t = useT();
  return (
    <a
      href={CONNECT_IQ_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-brand-400 ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="6" y="2" width="12" height="20" rx="3" />
        <path d="M12 7.5v5m0 0 2-2m-2 2-2-2" />
      </svg>
      {t("guide.g.storeCta")}
    </a>
  );
}
