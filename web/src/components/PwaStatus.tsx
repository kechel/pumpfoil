import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { useT } from "../i18n";

// Offline-Indikator + automatischer Update-Check (vite-plugin-pwa, registerType
// "autoUpdate"): ein neuer Service-Worker skip-waitet, übernimmt und die Seite lädt
// automatisch neu — kein „Aktualisieren"-Banner nötig, keine hängenden Altstände.
export function PwaStatus() {
  const t = useT();
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);

  useRegisterSW({
    // Aktiv nach Updates suchen, damit ein offener Tab den neuen Stand auch ohne
    // manuelles Neuladen bekommt: stündlich + bei Tab-Fokus (gedrosselt). Gefundene
    // Updates wendet autoUpdate selbst an (skipWaiting -> controllerchange -> reload).
    onRegisteredSW(_swUrl, r) {
      if (!r) { return; }
      let last = Date.now();
      setInterval(() => { last = Date.now(); r.update(); }, 60 * 60 * 1000);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && Date.now() - last > 30 * 60 * 1000) {
          last = Date.now();
          r.update();
        }
      });
    },
  });

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (online) { return null; }
  return (
    <div className="sticky top-0 z-[4000] flex items-center justify-center gap-2 bg-amber-500/90 px-3 py-1 text-center text-xs font-medium text-slate-950">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-900" />
      {t("pwa.offline")}
    </div>
  );
}
