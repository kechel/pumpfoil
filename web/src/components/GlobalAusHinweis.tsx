// Hinweis fuer alle, die sich von globalen Events abgemeldet haben (Jan, 15.11.2026): ein Fahrer fehlte im Flying-Sprint-
// Ranking, weil er das Opt-out (Einstellungen › Privatsphaere, `settings.global_events_aus`) gesetzt hatte und es selbst
// nicht wusste. Deshalb steht es dort, wo man die globalen Events sieht: als Badge unter der Ueberschrift (Home, /events)
// und hervorgehoben auf der Eventseite, jeweils mit Link zum Aendern.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, getToken } from "../lib/api";
import { useI18n } from "../i18n";

export const OPTOUT_LINK = "/einstellungen?tab=privat";
export const HINWEIS_KLASSE = "rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300";

/** true = selbst abgemeldet; false = nimmt teil; null = unbekannt (Gast, noch nicht geladen). */
export function useGlobalAus(): boolean | null {
  const [aus, setAus] = useState<boolean | null>(null);
  useEffect(() => {
    if (!getToken()) return;
    let lebt = true;
    api.getSettings().then((s) => { if (lebt) setAus(!!s?.global_events_aus); }).catch(() => {});
    return () => { lebt = false; };
  }, []);
  return aus;
}

/** Kleines Badge neben/unter der Ueberschrift „Global events" — nur, wenn man selbst abgemeldet ist. */
export function GlobalAusBadge() {
  const { t } = useI18n();
  if (useGlobalAus() !== true) return null;
  return (
    <Link to={OPTOUT_LINK}
      className={`${HINWEIS_KLASSE} inline-flex items-center gap-1 px-2.5 py-1 text-sm font-semibold hover:underline`}>
      {t("globalev.ausBadge")} · {t("globalev.ausAendern")}
    </Link>
  );
}
