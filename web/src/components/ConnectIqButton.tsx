import { useT } from "../i18n";

// Offizieller Store-Link der Garmin-App (approved 2026-07-02) mit dem offiziellen
// „Available on Connect IQ Store"-Badge (Garmin Brand Guidelines, aus dem Marken-ZIP).
// Dark-Badge passt zu den schwarzen App-Store/Play-Badges. URL zentral hier.
export const CONNECT_IQ_URL = "https://apps.garmin.com/apps/9a2a753e-b52f-4587-aee4-900caf5cb351";

export function ConnectIqButton({ className = "", height = "h-11" }: { className?: string; height?: string }) {
  const t = useT();
  return (
    <a href={CONNECT_IQ_URL} target="_blank" rel="noopener noreferrer" aria-label={t("guide.g.storeCta")} className={`inline-block ${className}`}>
      <img src="/badges/connect-iq-badge-dark.svg" alt={t("guide.g.storeCta")} className={`${height} w-auto`} />
    </a>
  );
}
