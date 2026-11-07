import { ZurueckPfeil } from "../components/ZurueckPfeil";
import { useI18n } from "../i18n";
import { useSprachSeite } from "../lib/seo";
import { ScrollToTop } from "../components/ScrollToTop";

export default function Impressum() {
  const { t, lang } = useI18n();
  useSprachSeite("/impressum", lang, t("imp.title"));
  // Hilfs-Render für Listenpunkte mit Inline-Markup (<b>/<u>) aus den Übersetzungen.
  const li = (key: string) => <li dangerouslySetInnerHTML={{ __html: t(key) }} />;
  return (
    <div className="mx-auto max-w-2xl p-6"
         style={{ paddingTop: "calc(1.5rem + env(safe-area-inset-top))" }}>
      <ScrollToTop />
      <h1 className="mb-4 flex items-center gap-2 text-xl font-bold"><ZurueckPfeil />{t("imp.title")}</h1>
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
            {li("imp.public3")}
            {li("imp.public4")}
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
            {li("imp.community5")}
            {li("imp.community6")}
            {li("imp.community7")}
            {li("imp.community8")}
          </ul>
          <p className="mt-2 text-xs text-slate-400" dangerouslySetInnerHTML={{ __html: t("imp.communityNote") }} />
        </section>

        {/* Freunde (15.10.) und Teams (31.10.) / globale Events (06.11.), nachgetragen 07.11.2026: was Freunde sehen,
            wie im Freunde-Dialog; bei Teams getrennt, was man selbst entscheidet und was die Teamleitung festlegt
            (Beitritts-Dialog, Team-Regeln). */}
        <section className="rounded-xl border border-sky-900/50 bg-sky-950/20 p-4">
          <h3 className="mb-2 font-semibold text-sky-700 dark:text-sky-300">{t("imp.friendsTitle")}</h3>
          <ul className="list-disc space-y-1 pl-5 text-slate-200">
            {li("imp.friends1")}
            {li("imp.friends2")}
            {li("imp.friends3")}
          </ul>
        </section>

        <section className="rounded-xl border border-sky-900/50 bg-sky-950/20 p-4">
          <h3 className="mb-2 font-semibold text-sky-700 dark:text-sky-300">{t("imp.teamsTitle")}</h3>
          <ul className="list-disc space-y-1 pl-5 text-slate-200">
            {li("imp.teams1")}
            {li("imp.teams2")}
            {li("imp.teams3")}
            {li("imp.teams4")}
            {li("imp.teams5")}
          </ul>
        </section>

        <section className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-4">
          <h3 className="mb-2 font-semibold text-emerald-700 dark:text-emerald-300">{t("imp.ownerTitle")}</h3>
          <ul className="list-disc space-y-1 pl-5 text-slate-200">
            {li("imp.owner1")}
            {li("imp.owner2")}
            {li("imp.owner3")}
            {li("imp.owner4")}
            {li("imp.owner5")}
            {li("imp.owner6")}
          </ul>
        </section>

        <section className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
          <h3 className="mb-2 font-semibold text-slate-200">{t("imp.operatorTitle")}</h3>
          <ul className="list-disc space-y-1 pl-5 text-slate-200">
            {li("imp.operator1")}
            {li("imp.operator2")}
            {li("imp.operator3")}
          </ul>
        </section>

        {/* Server und Hosting (Jan, 29.09.2026): stand bisher nirgends. SmartKomm betreibt den
            Server, Hetzner hostet ihn, mit Hetzner besteht ein AVV nach Art. 28 DSGVO. Bewusst ohne
            Rechenzentrums-Standort — der ist hier nicht belegt. */}
        <section className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
          <h3 className="mb-2 font-semibold text-slate-200">{t("imp.hostTitle")}</h3>
          <ul className="list-disc space-y-1 pl-5 text-slate-200">
            {li("imp.host1")}
            {li("imp.host2")}
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

        {/* Facebook — derselbe Aufbau wie Google und Apple darueber. Der letzte Punkt (kein
            Skript, kein Pixel) steht bewusst drin: viele verbinden „Facebook-Login" mit
            Nachverfolgung, und bei uns ist es eine Weiterleitung auf Knopfdruck. */}
        <section className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
          <h3 className="mb-2 font-semibold text-slate-200">{t("imp.fbTitle")}</h3>
          <p className="mb-2 text-slate-300">{t("imp.fbIntro")}</p>
          <ul className="list-disc space-y-1 pl-5 text-slate-200">
            {li("imp.fb1")}
            {li("imp.fb2")}
            {li("imp.fb3")}
            {li("imp.fb4")}
            {li("imp.fb5")}
          </ul>
          <p className="mt-2 text-xs text-slate-400" dangerouslySetInnerHTML={{ __html: t("imp.fbNote") }} />
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

        {/* KI-Zugang (MCP, Connector): nur auf ausdrueckliche Zustimmung, nur lesend, nur eigene Aufnahmen. */}
        <section className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
          <h3 className="mb-2 font-semibold text-slate-200">{t("imp.mcpTitle")}</h3>
          <ul className="list-disc space-y-1 pl-5 text-slate-200">
            {li("imp.mcp1")}
            {li("imp.mcp2")}
            {li("imp.mcp3")}
          </ul>
        </section>

        {/* Garmin Connect (05.11.2026): Garmin verlangt in der Datenschutzerklaerung, wie die Daten genutzt werden, alle
            Empfaenger inkl. Hoster, ob verkauft wird, ob KI sie verarbeitet, und wie man einsieht, loescht und trennt.
            KI: nichts automatisch, kein Training; eine einzelne Session nur auf ausdrueckliche Bitte (Jan, 05.11.). */}
        <section className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
          <h3 className="mb-2 font-semibold text-slate-200">{t("imp.garminTitle")}</h3>
          <p className="mb-2 text-slate-300">{t("imp.garminIntro")}</p>
          <ul className="list-disc space-y-1 pl-5 text-slate-200">
            {li("imp.garmin1")}
            {li("imp.garmin2")}
            {li("imp.garmin2b")}
            {li("imp.garmin3")}
            {li("imp.garmin4")}
            {li("imp.garmin5")}
          </ul>
        </section>

        {/* HUAWEI-Uhren (09./10.10.2026): die Aufnahme laeuft ueber HUAWEI Health / Wear Engine zur
            Android-App. Beim Wear-Engine-Antrag zugesagt: nur die Grundberechtigung „Basic device
            information", keine HUAWEI-ID- oder Health-Daten — genau das steht hier. */}
        <section className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
          <h3 className="mb-2 font-semibold text-slate-200">{t("imp.huaweiTitle")}</h3>
          <p className="mb-2 text-slate-300">{t("imp.huaweiIntro")}</p>
          <ul className="list-disc space-y-1 pl-5 text-slate-200">
            {li("imp.huawei1")}
            {li("imp.huawei2")}
            {li("imp.huawei3")}
            {li("imp.huawei4")}
          </ul>
        </section>

        {/* GitHub (10.10.2026, Jan): das Repo ist oeffentlich und enthaelt Screenshots, auf denen
            Anzeigenamen stehen koennen, dazu Changelog und Doku. pumpfoil.org laedt nichts von GitHub. */}
        <section className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
          <h3 className="mb-2 font-semibold text-slate-200">{t("imp.ghTitle")}</h3>
          <p className="mb-2 text-slate-300">{t("imp.ghIntro")}</p>
          <ul className="list-disc space-y-1 pl-5 text-slate-200">
            {li("imp.gh1")}
            {li("imp.gh2")}
            {li("imp.gh3")}
            {/* 29.10.2026 (Jan): Restrisiko der KI-gestuetzten Veroeffentlichung offen benennen.
                Gegenmassnahme: scripts/datenleck-pruefen.py (pre-commit + CI). */}
            {li("imp.gh4")}
          </ul>
        </section>

        {/* KI-Unterstuetzung: Auswertung, Modellverbesserung und Katalogrecherche laufen mit
            Claude, dabei koennen Inhalte an Anthropic uebertragen werden. Gehoert offengelegt
            wie die anderen Dritten (Google/Apple/verknuepfte Konten). */}
        <section className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
          <h3 className="mb-2 font-semibold text-slate-200">{t("imp.aiTitle")}</h3>
          <p className="mb-2 text-slate-300">{t("imp.aiIntro")}</p>
          <ul className="list-disc space-y-1 pl-5 text-slate-200">
            {li("imp.ai1")}
            {li("imp.ai2")}
            {li("imp.ai3")}
            {li("imp.ai4")}
          </ul>
          <p className="mt-2 text-xs text-slate-400" dangerouslySetInnerHTML={{ __html: t("imp.aiNote") }} />
        </section>

        {/* Karten: stand bisher NIRGENDS in der Erklaerung, obwohl wir seit jeher OSM-Kacheln
            laden — beim Ergaenzen des Luftbilds am 30.08. aufgefallen und mit nachgezogen. */}
        <section className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
          <h3 className="mb-2 font-semibold text-slate-200">{t("imp.mapTitle")}</h3>
          <ul className="list-disc space-y-1 pl-5 text-slate-200">
            {li("imp.map1")}
            {li("imp.map2")}
            {li("imp.mapApple")}
            {li("imp.mapSpots")}
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
