// „Warum pumpfoil.org?" (Jan, 02.11.2026) — oeffentlich wie das Impressum, in allen Sprachen (Keys why.*). Nicht die
// Funktionen (Laeufe, Pumps koennen andere auch), sondern was das Projekt ausmacht: Community, freie Software,
// Transparenz, offene Auswertungen. Verlinkt im Menue ueber dem Impressum, auf der Startseite und im Gast-Fuss.
import { Link } from "react-router-dom";
import { ZurueckPfeil } from "../components/ZurueckPfeil";
import { ScrollToTop } from "../components/ScrollToTop";
import { useT } from "../i18n";
import { useSeo } from "../lib/seo";
import { getToken } from "../lib/api";

const PUNKTE = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export default function Warum() {
  const t = useT();
  useSeo(t("why.title"), t("why.intro"), "/warum");
  return (
    <div className="mx-auto max-w-2xl p-6" style={{ paddingTop: "calc(1.5rem + env(safe-area-inset-top))" }}>
      <ScrollToTop />
      <h1 className="mb-3 flex items-center gap-2 text-2xl font-bold"><ZurueckPfeil />{t("why.title")}</h1>
      <p className="mb-6 text-slate-300">{t("why.intro")}</p>
      <div className="space-y-4">
        {PUNKTE.map((n) => (
          <section key={n} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
            <h2 className="mb-1.5 font-bold text-slate-100">{t(`why.k${n}t`)}</h2>
            <p className="text-sm leading-relaxed text-slate-300">{t(`why.k${n}`)}</p>
          </section>
        ))}
      </div>
      <p className="mt-6 text-slate-300">{t("why.outro")}</p>
      {!getToken() && (
        <Link to="/login" className="mt-5 inline-block rounded-xl bg-brand-500 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-brand-400">
          {t("land.cta")}
        </Link>
      )}
    </div>
  );
}
