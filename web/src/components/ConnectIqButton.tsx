import { useT } from "../i18n";

// Offizieller Store-Link der Garmin-App (approved 2026-07-02) mit dem offiziellen
// „Available on Connect IQ Store"-Badge (Garmin Brand Guidelines). Beide Varianten
// werden gerendert; per CSS (index.css: .ciq-badge-on-*) zeigt sich je Theme die
// kontrastreiche: helles Badge im Dark-Mode, dunkles im Light-Mode. URL zentral hier.
export const CONNECT_IQ_URL = "https://apps.garmin.com/apps/9a2a753e-b52f-4587-aee4-900caf5cb351";

export function ConnectIqButton({ className = "", height = "h-11" }: { className?: string; height?: string }) {
  const t = useT();
  const alt = t("guide.g.storeCta");
  return (
    <a href={CONNECT_IQ_URL} target="_blank" rel="noopener noreferrer" aria-label={alt} className={`inline-block ${className}`}>
      <img src="/badges/connect-iq-badge-light.svg" alt={alt} className={`ciq-badge-on-dark ${height} w-auto`} />
      <img src="/badges/connect-iq-badge-dark.svg" alt={alt} className={`ciq-badge-on-light ${height} w-auto`} />
    </a>
  );
}
