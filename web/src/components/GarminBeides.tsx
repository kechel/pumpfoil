import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useT } from "../i18n";
import { CloseIcon } from "./Icons";

// Garmin: BEIDES verbinden (Jan, 05.11.2026). Garmin Connect bringt die vollstaendige Aufnahme (100 Hz, auch wenn der
// direkte Upload haengt), nur die Kopplung per Code bringt Einstellungen, Sprache, Foils und Layouts auf die Uhr.
// Kurz halten (Jan: „der hinweis ist viiiiiil zu lang").
export const GARMIN_CONNECT_SEITE = "/?tab=uhr&ktab=garmin";
export const UHR_CODE_SEITE = "/?tab=uhr&ktab=uhr&utab=guide&plattform=garmin";

const linkCls = "font-semibold text-brand-700 hover:underline dark:text-brand-300";

/** Beides verbunden? Garmin-Uhr gekoppelt + Garmin Connect verknuepft. null = noch unbekannt. */
function useGarminStand(): { uhr: boolean; gc: boolean; da: boolean } | null {
  const [stand, setStand] = useState<{ uhr: boolean; gc: boolean; da: boolean } | null>(null);
  useEffect(() => {
    Promise.all([api.garminStatus(), api.myDevices()])
      .then(([st, geraete]) => setStand({ uhr: geraete.some((d) => d.platform === "garmin" && !d.revoked_at),
                                          gc: st.linked, da: st.available }))
      .catch(() => {});
  }, []);
  return stand;
}

/** Zwei Zeilen fuer Anleitung, Garmin-Karte und „Meine Uhren". `zu` = wohin der Knopf fuehrt (keiner = kein Knopf).
 *  `wann` (Jan, 05.11.2026): „immer" in der Garmin-Anleitung, „nichtBeide" auf der Garmin-Connect-Karte, sonst
 *  „genauEins" — nur wer eines von beiden schon hat, bekommt den Hinweis aufs andere. */
export function GarminBeidesHinweis({ zu, wann = "genauEins" }: { zu?: "gc" | "code"; wann?: "immer" | "nichtBeide" | "genauEins" }) {
  const t = useT();
  const stand = useGarminStand();
  if (wann !== "immer") {
    if (!stand) return null;
    if (stand.uhr && stand.gc) return null;
    if (wann === "genauEins" && !stand.uhr && !stand.gc) return null;
  }
  return (
    <div className="mb-3 rounded-xl border border-brand-500/30 bg-brand-500/10 px-3 py-2 text-sm text-slate-200">
      {/* Zwei Schritte statt „beides verbinden" (Jan, 05.11.2026: „1. pair your watch and 2. connect to garmin account
          for additional data"). */}
      <ol className="list-decimal space-y-0.5 pl-5">
        <li>{t("garmin.beides.schritt1")}</li>
        <li>{t("garmin.beides.schritt2")}</li>
      </ol>
      {zu && (
        <Link to={zu === "gc" ? GARMIN_CONNECT_SEITE : UHR_CODE_SEITE} className={`mt-1 inline-block ${linkCls}`}>
          {t(zu === "gc" ? "garmin.beides.zuGc" : "garmin.beides.zuCode")} →
        </Link>
      )}
    </div>
  );
}

const WEG_KEY = "foil_garmin_beides";

/** Startseite: nur wenn genau EINES von beiden verbunden ist (Garmin-Uhr gekoppelt ODER Garmin Connect), wegklickbar
 *  je Fall. Wer keines von beiden hat, faehrt keine Garmin — dem sagen wir nichts. */
export function GarminBeidesBanner() {
  const t = useT();
  const stand = useGarminStand();
  const [weg, setWeg] = useState<string | null>(() => { try { return localStorage.getItem(WEG_KEY); } catch { return null; } });
  const fehlt = !stand || !stand.da ? null : stand.uhr && !stand.gc ? "gc" : stand.gc && !stand.uhr ? "code" : null;
  if (!fehlt || weg === fehlt) return null;
  const zu = () => { try { localStorage.setItem(WEG_KEY, fehlt); } catch { /* privates Fenster */ } setWeg(fehlt); };
  return (
    <div className="relative mb-5 rounded-2xl border border-brand-500/30 bg-brand-500/10 p-4 pr-10 text-sm text-slate-200">
      <button onClick={zu} aria-label={t("banner.dismiss")} title={t("banner.dismiss")}
        className="absolute right-2 top-2 rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-slate-200">
        <CloseIcon className="h-4 w-4" />
      </button>
      {t(fehlt === "gc" ? "garmin.fehltGc" : "garmin.fehltCode")}{" "}
      <Link to={fehlt === "gc" ? GARMIN_CONNECT_SEITE : UHR_CODE_SEITE} className={linkCls}>
        {t(fehlt === "gc" ? "garmin.beides.zuGc" : "garmin.beides.zuCode")} →
      </Link>
    </div>
  );
}
