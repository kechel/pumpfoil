import { Link } from "react-router-dom";
import { useT } from "../i18n";
import { ScrollToTop } from "../components/ScrollToTop";

export default function Impressum() {
  const t = useT();
  // Hilfs-Render für Listenpunkte mit Inline-Markup (<b>/<u>) aus den Übersetzungen.
  const li = (key: string) => <li dangerouslySetInnerHTML={{ __html: t(key) }} />;
  return (
    <div className="mx-auto max-w-2xl p-6">
      <ScrollToTop />
      <Link to="/" className="text-sm text-brand-400 hover:underline">{t("common.back")}</Link>
      <h1 className="mb-4 mt-4 text-xl font-bold">{t("imp.title")}</h1>
      <div className="space-y-1 text-slate-200">
        {/* Betreiberangaben aus Env (VITE_IMPRINT_*, in web/.env.local) – nicht im Repo. */}
        {(import.meta.env.VITE_IMPRINT_NAME ?? "") && <p>{import.meta.env.VITE_IMPRINT_NAME}</p>}
        {(import.meta.env.VITE_IMPRINT_STREET ?? "") && <p>{import.meta.env.VITE_IMPRINT_STREET}</p>}
        {(import.meta.env.VITE_IMPRINT_CITY ?? "") && <p>{import.meta.env.VITE_IMPRINT_CITY}</p>}
        {(import.meta.env.VITE_IMPRINT_EMAIL ?? "") && <p>E-Mail: {import.meta.env.VITE_IMPRINT_EMAIL}</p>}
      </div>

      <h2 className="mb-3 mt-8 text-lg font-bold">{t("imp.whoSees")}</h2>
      <p className="mb-4 text-sm text-slate-300">{t("imp.intro")}</p>

      <div className="space-y-5 text-sm">
        <section className="rounded-xl border border-rose-900/50 bg-rose-950/20 p-4">
          <h3 className="mb-2 font-semibold text-rose-700 dark:text-rose-300">{t("imp.publicTitle")}</h3>
          <ul className="list-disc space-y-1 pl-5 text-slate-200">
            {li("imp.public1")}
            {li("imp.public2")}
          </ul>
        </section>

        <section className="rounded-xl border border-sky-900/50 bg-sky-950/20 p-4">
          <h3 className="mb-2 font-semibold text-sky-700 dark:text-sky-300">{t("imp.communityTitle")}</h3>
          <p className="mb-2 text-slate-300" dangerouslySetInnerHTML={{ __html: t("imp.communityIntro") }} />
          <ul className="list-disc space-y-1 pl-5 text-slate-200">
            {li("imp.community1")}
            {li("imp.community2")}
            {li("imp.community3")}
            {li("imp.community4")}
          </ul>
          <p className="mt-2 text-xs text-slate-400" dangerouslySetInnerHTML={{ __html: t("imp.communityNote") }} />
        </section>

        <section className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-4">
          <h3 className="mb-2 font-semibold text-emerald-700 dark:text-emerald-300">{t("imp.ownerTitle")}</h3>
          <ul className="list-disc space-y-1 pl-5 text-slate-200">
            {li("imp.owner1")}
            {li("imp.owner2")}
            {li("imp.owner3")}
            {li("imp.owner4")}
          </ul>
        </section>

        <section className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
          <h3 className="mb-2 font-semibold text-slate-200">{t("imp.operatorTitle")}</h3>
          <ul className="list-disc space-y-1 pl-5 text-slate-200">
            {li("imp.operator1")}
            {li("imp.operator2")}
          </ul>
        </section>

        <section className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
          <h3 className="mb-2 font-semibold text-slate-200">{t("imp.googleTitle")}</h3>
          <p className="mb-2 text-slate-300">{t("imp.googleIntro")}</p>
          <ul className="list-disc space-y-1 pl-5 text-slate-200">
            {li("imp.google1")}
            {li("imp.google2")}
            {li("imp.google3")}
            {li("imp.google4")}
          </ul>
          <p className="mt-2 text-xs text-slate-400" dangerouslySetInnerHTML={{ __html: t("imp.googleNote") }} />
        </section>

        <section className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
          <h3 className="mb-2 font-semibold text-slate-200">{t("imp.appleTitle")}</h3>
          <p className="mb-2 text-slate-300">{t("imp.appleIntro")}</p>
          <ul className="list-disc space-y-1 pl-5 text-slate-200">
            {li("imp.apple1")}
            {li("imp.apple2")}
            {li("imp.apple3")}
          </ul>
        </section>

        <section className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
          <h3 className="mb-2 font-semibold text-slate-200">{t("imp.connTitle")}</h3>
          <p className="mb-2 text-slate-300">{t("imp.connIntro")}</p>
          <ul className="list-disc space-y-1 pl-5 text-slate-200">
            {li("imp.conn1")}
            {li("imp.conn2")}
            {li("imp.conn3")}
          </ul>
        </section>

        <section className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
          <h3 className="mb-2 font-semibold text-slate-200">{t("imp.ytTitle")}</h3>
          <ul className="list-disc space-y-1 pl-5 text-slate-200">
            {li("imp.yt1")}
            {li("imp.yt2")}
          </ul>
          <p className="mt-2 text-xs text-slate-400" dangerouslySetInnerHTML={{ __html: t("imp.ytNote") }} />
        </section>
      </div>

      <h2 className="mb-2 mt-8 text-lg font-bold">{t("imp.privacyTitle")}</h2>
      <p className="text-sm text-slate-200">{t("imp.privacyText")}</p>
    </div>
  );
}
