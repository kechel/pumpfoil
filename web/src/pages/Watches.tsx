import { Link } from "react-router-dom";
import { WaveIcon } from "../components/Icons";
import { useT } from "../i18n";
import { LanguageSelect } from "../components/LanguageSelect";
import { WatchMatrix } from "../components/WatchMatrix";

// Öffentliche Übersicht: welche Uhr liefert welche Daten. Der Nutzer entscheidet.
export default function Watches() {
  const t = useT();
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <Link to="/" className="flex items-center gap-2 text-lg font-bold">
          <WaveIcon className="h-6 w-6 text-brand-400" /> Pumpfoil
        </Link>
        <LanguageSelect className="text-sm" />
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-16">
        <Link to="/" className="text-sm text-brand-400 hover:underline">{t("common.back")}</Link>
        <h1 className="mb-2 mt-4 text-2xl font-bold sm:text-3xl">{t("watches.title")}</h1>
        <p className="mb-6 max-w-2xl text-slate-300">{t("watches.intro")}</p>

        <WatchMatrix />

        <div className="mt-8">
          <Link
            to="/login"
            className="inline-block rounded-xl bg-brand-500 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-brand-400"
          >
            {t("land.login")}
          </Link>
        </div>
      </main>
    </div>
  );
}
