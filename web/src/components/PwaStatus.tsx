import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { useT } from "../i18n";

// Offline-Indikator + Auto-Update (vite-plugin-pwa, registerType "prompt").
// Wartet ein neuer Service-Worker, wird er beim NÄCHSTEN Routen-Wechsel automatisch angewandt
// (sicherer Moment: die aktuelle Ansicht wird ohnehin verlassen → keine Eingabe/kein Diktat geht
// verloren). Nie während ein Overlay offen ist (Diktat/Teilen/Galerie/Chat → __overlay-Marker).
// Das Banner erscheint nur noch als Fallback, wenn nach einer Karenz kein sicherer Moment kam.
export function PwaStatus() {
  const t = useT();
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [updating, setUpdating] = useState(false);
  const [newVer, setNewVer] = useState<string | null>(null);   // Build der wartenden neuen Version
  const [graceOver, setGraceOver] = useState(false);           // Banner erst nach Karenz (Fallback)

  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    // Aktiv nach Updates suchen, damit das Banner ohne manuelles Neuladen auftaucht:
    // stündlich + bei Tab-Fokus (gedrosselt).
    onRegisteredSW(_swUrl, r) {
      if (!r) return;
      let last = Date.now();
      r.update();                                                    // sofort prüfen (frischer Deploy seit letztem Load)
      setInterval(() => { last = Date.now(); r.update(); }, 5 * 60 * 1000);   // alle 5 min
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && Date.now() - last > 60 * 1000) {
          last = Date.now();
          r.update();
        }
      });
    },
  });

  // Update anwenden: neue SW übernehmen + neu laden. Fallback nach 3.5 s, falls kein
  // controllerchange kommt (sonst hinge der Spinner ewig).
  function applyUpdate() {
    setUpdating(true);
    navigator.serviceWorker?.addEventListener("controllerchange", () => window.location.reload(), { once: true });
    updateServiceWorker(true);
    setTimeout(() => window.location.reload(), 3500);
  }

  // Sobald ein Update wartet: Build der NEUEN Version holen (frisch, ohne Cache) für den Hinweis,
  // + Karenz starten, nach der das Fallback-Banner erscheinen darf.
  useEffect(() => {
    if (!needRefresh) return;
    fetch("/version.json", { cache: "no-store" })
      .then((r) => r.json()).then((d) => setNewVer(d?.build ?? null)).catch(() => {});
    const id = setTimeout(() => setGraceOver(true), 20000);
    return () => clearTimeout(id);
  }, [needRefresh]);

  // AUTO-UPDATE beim nächsten sicheren Moment: ein Routen-Wechsel (foil:navigate aus main.tsx).
  // Nicht anwenden, solange ein Overlay offen ist (Diktat/Teilen/Galerie/Chat setzen __overlay).
  // Beim Tippen bleibt man auf der Seite → kein Navigations-Event → kein Reload.
  useEffect(() => {
    if (!needRefresh) return;
    const onNav = () => {
      const overlayOpen = !!(window.history.state && (window.history.state as { __overlay?: unknown }).__overlay);
      if (!updating && !overlayOpen) applyUpdate();
    };
    window.addEventListener("foil:navigate", onNav);
    return () => window.removeEventListener("foil:navigate", onNav);
  }, [needRefresh, updating]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Banner nur als FALLBACK: wenn ein Update wartet, aber (a) gerade angewandt wird, oder
  // (b) nach der Karenz noch kein sicherer Moment (Routen-Wechsel) kam. Sonst läuft das Update
  // still beim nächsten Navigieren.
  if (needRefresh && (updating || graceOver)) {
    return (
      <div
        className="sticky top-0 z-[4000] flex items-center justify-center gap-3 bg-brand-500 px-3 pb-1.5 text-center text-xs font-medium text-slate-950"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.375rem)" }}
      >
        {updating ? (
          <span className="flex items-center gap-2">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-950/40 border-t-slate-950" />
            {t("pwa.updating")}
          </span>
        ) : (
          <>
            <span>{newVer ? t("pwa.updateTo", { v: newVer }) : t("pwa.updateAvailable")}</span>
            <button
              onClick={applyUpdate}
              className="rounded bg-slate-950/20 px-2 py-0.5 font-semibold hover:bg-slate-950/30"
            >
              {t("pwa.update")}
            </button>
          </>
        )}
      </div>
    );
  }
  if (!online) {
    return (
      <div
        className="sticky top-0 z-[4000] flex items-center justify-center gap-2 bg-amber-500/90 px-3 pb-1 text-center text-xs font-medium text-slate-950"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.25rem)" }}
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-900" />
        {t("pwa.offline")}
      </div>
    );
  }
  return null;
}
