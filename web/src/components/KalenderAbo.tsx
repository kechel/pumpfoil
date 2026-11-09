import { useState } from "react";
import { useT } from "../i18n";

// Kalender-Abo fuer alle globalen Events (Jan, 09.11.2026: „ein ical-link … public … fuer alle der gleiche", „also ein
// link fuer alle events"). Server: GET /api/public/events/global.ics (ohne Login). `webcal://` oeffnet auf iPhone/Mac
// und in Outlook direkt den Abo-Dialog; Google Kalender bekommt die Adresse ueber seinen eigenen Abo-Link. Dazu
// „Link kopieren" fuer alles andere (Kalender › Abonnieren › Adresse einfuegen).
export const ICS_PFAD = "/api/public/events/global.ics";

export function KalenderAbo({ klasse }: { klasse: string }) {
  const t = useT();
  const [kopiert, setKopiert] = useState(false);
  const https = `${window.location.origin}${ICS_PFAD}`;
  const webcal = https.replace(/^https?:/, "webcal:");
  const google = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`;
  const kopieren = () => {
    navigator.clipboard?.writeText(https).then(() => { setKopiert(true); window.setTimeout(() => setKopiert(false), 2000); })
      .catch(() => window.prompt(t("team.ics.kopieren"), https));
  };
  return (
    <>
      <a href={webcal} className={klasse} title={t("team.ics.titel")}>
        <svg viewBox="0 0 24 24" className="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4" />
        </svg>
        {t("team.ics.abo")}
      </a>
      <a href={google} target="_blank" rel="noopener noreferrer" className={klasse}>{t("team.ics.google")}</a>
      <button type="button" onClick={kopieren} className={klasse}>{kopiert ? t("team.ics.kopiert") : t("team.ics.kopieren")}</button>
    </>
  );
}
