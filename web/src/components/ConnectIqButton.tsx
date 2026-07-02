import { useT } from "../i18n";
import { StoreBadge } from "./StoreBadge";

// Offizieller Store-Link der Garmin-App (approved 2026-07-02) mit dem offiziellen
// „Available on Connect IQ Store"-Badge (Garmin Brand Guidelines). Theme-abhängig
// (Dark-Mode -> dunkles Badge, Light-Mode -> helles) via StoreBadge. URL zentral hier.
export const CONNECT_IQ_URL = "https://apps.garmin.com/apps/9a2a753e-b52f-4587-aee4-900caf5cb351";

export function ConnectIqButton({ className = "", height = "h-11" }: { className?: string; height?: string }) {
  const t = useT();
  return (
    <StoreBadge
      href={CONNECT_IQ_URL}
      darkSrc="/badges/connect-iq-badge-dark.svg"
      lightSrc="/badges/connect-iq-badge-light.svg"
      alt={t("guide.g.storeCta")}
      height={height}
      className={className}
    />
  );
}
