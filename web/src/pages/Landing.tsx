import { Link } from "react-router-dom";
import { WaveIcon } from "../components/Icons";
import { useT } from "../i18n";
import { LanguageSelect } from "../components/LanguageSelect";

// Öffentliche Startseite (ohne Login erreichbar) — erklärt, wofür Pumpfoil da ist.
// Nötig für die Google-OAuth-Prüfung: Homepage muss ohne Anmeldung den App-Zweck zeigen.
export default function Landing() {
  const t = useT();
  const features = [
    { icon: "⌚", title: t("land.f1Title"), body: t("land.f1Body") },
    { icon: "📈", title: t("land.f2Title"), body: t("land.f2Body") },
    { icon: "🗺️", title: t("land.f3Title"), body: t("land.f3Body") },
    { icon: "🌊", title: t("land.f4Title"), body: t("land.f4Body") },
    { icon: "📂", title: t("land.f5Title"), body: t("land.f5Body") },
  ];
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <span className="flex items-center gap-2 text-lg font-bold">
          <WaveIcon className="h-6 w-6 text-brand-400" /> Pumpfoil
        </span>
        <div className="flex items-center gap-3">
          <LanguageSelect className="text-sm" />
          <Link
            to="/login"
            className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-brand-400"
          >
            {t("land.login")}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5">
        {/* Hero */}
        <section className="py-14 text-center sm:py-20">
          <WaveIcon className="mx-auto mb-6 h-16 w-16 text-brand-400" />
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">{t("land.heroTitle")}</h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-slate-300 sm:text-lg">{t("land.heroSub")}</p>
          <div className="mt-8 flex justify-center">
            <Link
              to="/login"
              className="rounded-xl bg-brand-500 px-8 py-3 text-sm font-semibold text-slate-950 hover:bg-brand-400"
            >
              {t("land.login")}
            </Link>
          </div>
        </section>

        {/* Kernfeature: farbiger Foiling-Track + Pump-Marker */}
        <section className="pb-6">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-xl font-bold sm:text-2xl">{t("land.showcaseTitle")}</h2>
            <p className="mx-auto mt-3 max-w-2xl text-slate-300">{t("land.showcaseBody")}</p>
          </div>
          <figure className="mx-auto mt-6 max-w-3xl">
            <img
              src="/landing-track.webp"
              alt={t("land.showcaseAlt")}
              className="w-full rounded-2xl border border-slate-800 shadow-2xl"
            />
            <figcaption className="mt-2 text-center text-xs text-slate-500">{t("land.showcaseCaption")}</figcaption>
          </figure>
        </section>

        {/* Was ist Pumpfoil? */}
        <section className="mx-auto max-w-3xl pb-4 text-center">
          <h2 className="text-xl font-bold sm:text-2xl">{t("land.whatTitle")}</h2>
          <p className="mt-3 text-slate-300">{t("land.whatBody")}</p>
        </section>

        {/* Features */}
        <section className="grid gap-4 py-10 sm:grid-cols-2">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="text-2xl">{f.icon}</div>
              <h3 className="mt-2 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-slate-400">{f.body}</p>
            </div>
          ))}
        </section>

        {/* Datenschutz & Open Source */}
        <section className="grid gap-4 pb-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <div className="text-2xl">🔒</div>
            <h3 className="mt-2 font-semibold">{t("land.privacyTitle")}</h3>
            <p className="mt-1 text-sm text-slate-400">{t("land.privacyBody")}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <div className="text-2xl">💛</div>
            <h3 className="mt-2 font-semibold">{t("land.openTitle")}</h3>
            <p className="mt-1 text-sm text-slate-400">{t("land.openBody")}</p>
          </div>
        </section>

        {/* Abschluss-CTA */}
        <section className="rounded-3xl border border-slate-800 bg-slate-900/60 px-6 py-10 text-center">
          <h2 className="text-xl font-bold sm:text-2xl">{t("land.ctaTitle")}</h2>
          <p className="mx-auto mt-2 max-w-xl text-slate-300">{t("land.ctaBody")}</p>
          <Link
            to="/login"
            className="mt-6 inline-block rounded-xl bg-brand-500 px-8 py-3 text-sm font-semibold text-slate-950 hover:bg-brand-400"
          >
            {t("land.login")}
          </Link>
        </section>
      </main>

      <footer className="mx-auto mt-10 max-w-5xl px-5 py-8 text-center text-xs text-slate-500">
        <Link to="/impressum" className="hover:text-slate-300">{t("nav.imprint")}</Link>
        <span className="mx-2">·</span>
        <span>{t("land.footerLicense")}</span>
        <span className="mx-2">·</span>
        <span>© Pumpfoil</span>
      </footer>
    </div>
  );
}
