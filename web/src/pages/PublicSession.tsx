import { Link } from "react-router-dom";
import { useT } from "../i18n";
import SessionDetail from "./SessionDetail";

// Hülle für den öffentlichen Teilen-Link (/s/:token): eigene Kopf-/Fußzeile + Padding, da die
// App-Navigation (Menü/Header/Footer) hier wegfällt. SessionDetail rendert im Public-Modus read-only.
export default function PublicSession() {
  const t = useT();
  const alt = "pumpfoil.org — track every pump";
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      <header
        className="flex items-center justify-between gap-3 border-b border-slate-800/60 px-4 pb-3"
        style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}
      >
        <Link to="/" aria-label="pumpfoil.org" className="shrink-0">
          <img src="/wordmark-h-dark.png" alt={alt} className="logo-dark h-7 max-w-none" />
          <img src="/wordmark-h-light.png" alt={alt} className="logo-light h-7 max-w-none" />
        </Link>
        <Link
          to="/"
          className="shrink-0 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-brand-400"
        >
          {t("share.cta")}
        </Link>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        <SessionDetail />
      </main>

      <footer className="border-t border-slate-800/60 px-4 py-5 text-center text-xs text-slate-400">
        <Link to="/" className="hover:text-slate-200">pumpfoil.org</Link>
        <span className="mx-2">·</span>
        <Link to="/impressum" className="hover:text-slate-200">Impressum</Link>
      </footer>
    </div>
  );
}
