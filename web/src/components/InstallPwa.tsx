import { useEffect, useState } from "react";
import { useT } from "../i18n";

// "App installieren": Android nutzt das native beforeinstallprompt (global in main.tsx
// abgefangen), iOS + Browser ohne Prompt bekommen eine kurze Anleitung. Bereits
// installiert (standalone) -> nichts anzeigen.
type BIPEvent = Event & { prompt: () => void; userChoice: Promise<{ outcome: string }> };

export function InstallPwa({ className = "" }: { className?: string }) {
  const t = useT();
  const [deferred, setDeferred] = useState<BIPEvent | null>(() => (window as any).__bip ?? null);
  const [hint, setHint] = useState(false);

  const isStandalone =
    window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent);

  useEffect(() => {
    const sync = () => setDeferred((window as any).__bip ?? null);
    window.addEventListener("bip-ready", sync);
    window.addEventListener("appinstalled", sync);
    return () => { window.removeEventListener("bip-ready", sync); window.removeEventListener("appinstalled", sync); };
  }, []);

  if (isStandalone) return null;

  function click() {
    if (deferred) {
      deferred.prompt();
      deferred.userChoice.finally(() => { (window as any).__bip = null; setDeferred(null); });
      return;
    }
    setHint((v) => !v);
  }

  return (
    <div className={className}>
      <button
        onClick={click}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand-500/40 bg-brand-500/10 px-3 py-2 text-sm font-medium text-brand-200 hover:bg-brand-500/20"
      >
        <img src="/icon-192.png" alt="" className="h-6 w-6 rounded-md" />
        {t("install.button")}
      </button>
      {hint && !deferred && (
        <p className="mt-2 rounded-lg bg-slate-800/70 p-2 text-xs text-slate-300">
          {isIOS ? t("install.iosHint") : t("install.menuHint")}
        </p>
      )}
    </div>
  );
}
