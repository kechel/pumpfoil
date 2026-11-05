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

/** Zwei Zeilen fuer Anleitung, Garmin-Karte und „Meine Uhren". `zu` = wohin der Knopf fuehrt (keiner = kein Knopf).
 *  `nurMitGarminUhr`: nur zeigen, wenn eine Garmin gekoppelt ist („Meine Uhren" sehen auch Apple-/Wear-Nutzer). */
export function GarminBeidesHinweis({ zu, nurMitGarminUhr = false }: { zu?: "gc" | "code"; nurMitGarminUhr?: boolean }) {
  const t = useT();
  const [garmin, setGarmin] = useState(!nurMitGarminUhr);
  useEffect(() => {
    if (!nurMitGarminUhr) return;
    api.myDevices().then((g) => setGarmin(g.some((d) => d.platform === "garmin" && !d.revoked_at))).catch(() => {});
  }, [nurMitGarminUhr]);
  if (!garmin) return null;
  return (
    <div className="mb-3 rounded-xl border border-brand-500/30 bg-brand-500/10 px-3 py-2 text-sm text-slate-200">
      <b>{t("garmin.beides.titel")}:</b> {t("garmin.beides.text")}
      {zu && (
        <> <Link to={zu === "gc" ? GARMIN_CONNECT_SEITE : UHR_CODE_SEITE} className={linkCls}>
          {t(zu === "gc" ? "garmin.beides.zuGc" : "garmin.beides.zuCode")} →
        </Link></>
      )}
    </div>
  );
}

const WEG_KEY = "foil_garmin_beides";

/** Startseite: nur wenn genau EINES von beiden verbunden ist (Garmin-Uhr gekoppelt ODER Garmin Connect), wegklickbar
 *  je Fall. Wer keines von beiden hat, faehrt keine Garmin — dem sagen wir nichts. */
export function GarminBeidesBanner() {
  const t = useT();
  const [fehlt, setFehlt] = useState<"gc" | "code" | null>(null);
  const [weg, setWeg] = useState<string | null>(() => { try { return localStorage.getItem(WEG_KEY); } catch { return null; } });
  useEffect(() => {
    Promise.all([api.garminStatus(), api.myDevices()])
      .then(([st, geraete]) => {
        if (!st.available) return;
        const uhr = geraete.some((d) => d.platform === "garmin" && !d.revoked_at);
        if (uhr && !st.linked) setFehlt("gc");
        else if (st.linked && !uhr) setFehlt("code");
      })
      .catch(() => {});
  }, []);
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
