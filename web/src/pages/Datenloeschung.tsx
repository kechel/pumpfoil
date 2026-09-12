import { Link, useSearchParams } from "react-router-dom";
import { useT } from "../i18n";
import { ScrollToTop } from "../components/ScrollToTop";

/**
 * Statusseite fuer eine Loeschanfrage aus Facebook.
 *
 * Meta verlangt vor der Freigabe einer App eine oeffentlich erreichbare Adresse, unter der man
 * den Stand seiner Anfrage nachlesen kann — der Server liefert sie samt Code als Antwort auf den
 * Data-Deletion-Callback (`api/oauth.py`). Absichtlich statisch und ohne Abfrage: der Code ist
 * ein Nachweis fuer den Nutzer, kein Schluessel zu Kontodaten. Wer hier landet, soll zwei Dinge
 * erfahren — was schon passiert ist, und wie er den Rest loswird.
 */
export default function Datenloeschung() {
  const t = useT();
  const [params] = useSearchParams();
  const code = params.get("code");
  return (
    <div className="mx-auto max-w-2xl p-6"
         style={{ paddingTop: "calc(1.5rem + env(safe-area-inset-top))" }}>
      <ScrollToTop />
      <Link to="/" className="text-sm text-brand-400 hover:underline">{t("common.back")}</Link>
      <h1 className="mb-4 mt-4 text-xl font-bold">{t("del.title")}</h1>

      <p className="mb-4 text-slate-200">{t("del.done")}</p>
      {code && (
        <p className="mb-4 rounded-xl border border-slate-700 bg-slate-900/40 p-4 text-sm text-slate-200">
          {t("del.code")} <span className="font-mono font-semibold">{code}</span>
        </p>
      )}

      <h2 className="mb-2 mt-8 text-lg font-bold">{t("del.restTitle")}</h2>
      <p className="mb-2 text-slate-200">{t("del.rest")}</p>
      <p className="text-slate-200">{t("del.how")}</p>

      <p className="mt-8 text-sm text-slate-400">
        <Link to="/impressum" className="text-brand-400 hover:underline">{t("imp.title")}</Link>
      </p>
    </div>
  );
}
