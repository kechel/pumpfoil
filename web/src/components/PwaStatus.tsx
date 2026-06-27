import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { CloseIcon } from "./Icons";
import { useT } from "../i18n";

// Globaler Offline-Indikator + Update-Leiste (vite-plugin-pwa, registerType "prompt").
export function PwaStatus() {
  const t = useT();
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    // Aktiv nach Updates suchen, damit die „Seite aktualisieren"-Leiste auch ohne
    // manuelles Neuladen erscheint: stündlich + jedes Mal, wenn der Tab fokussiert wird.
    onRegisteredSW(_swUrl, r) {
      if (!r) { return; }
      let last = Date.now();
      setInterval(() => { last = Date.now(); r.update(); }, 60 * 60 * 1000);
      // Bei Tab-Fokus nur prüfen, wenn länger nichts geprüft wurde (gedrosselt),
      // sonst würde der wartende Service-Worker ständig neu erzeugt.
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

  return (
    <>
      {!online && (
        <div className="sticky top-0 z-[4000] flex items-center justify-center gap-2 bg-amber-500/90 px-3 py-1 text-center text-xs font-medium text-slate-950">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-900" />
          {t("pwa.offline")}
        </div>
      )}
      {needRefresh && (
        <div className="fixed inset-x-0 bottom-0 z-[4000] flex items-center justify-center gap-3 border-t border-slate-700 bg-slate-900/95 px-4 py-2.5 text-sm text-slate-100 backdrop-blur">
          <span>{t("pwa.updateAvailable")}</span>
          <button
            onClick={() => {
              // Normalfall: skip-waiting + Auto-Reload des vite-pwa-SW.
              try { updateServiceWorker(true); } catch (_e) { /* ignore */ }
              // Bulletproof-Fallback: kommt binnen 1,5 s kein Reload (z. B. weil die
              // wartende SW-Referenz veraltet ist), SW abmelden und hart neu laden.
              setTimeout(async () => {
                try {
                  const regs = (await navigator.serviceWorker?.getRegistrations()) ?? [];
                  await Promise.all(regs.map((r) => r.unregister()));
                } catch (_e) { /* ignore */ }
                window.location.reload();
              }, 1500);
            }}
            className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-brand-400"
          >
            {t("pwa.update")}
          </button>
          <button onClick={() => setNeedRefresh(false)} aria-label="×" className="text-slate-400 hover:text-slate-200"><CloseIcon className="h-4 w-4" /></button>
        </div>
      )}
    </>
  );
}
