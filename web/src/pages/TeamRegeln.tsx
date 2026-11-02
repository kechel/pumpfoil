// Team-Regeln /teams/regeln (Jan, 31.10.2026: „diese erklaerungen … die muessen auch alle irgendwo stehen auf
// der seite … vielleicht eine eigene Teams-Regeln Seite"). Text-Seite: auch ohne Login lesbar, damit die
// oeffentliche Teamseite darauf verweisen kann. Jeder Abschnitt ist ein Titel + Punkte; die Punkte stehen in
// EINEM Text je Abschnitt, getrennt durch Zeilenumbrueche (so bleibt es je Sprache ein Schluessel).
// Was hier steht, muss zu server/app/teams.py passen — bei jeder Regel-Aenderung mitziehen.
import { ZurueckPfeil } from "../components/ZurueckPfeil";
import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { getToken } from "../lib/api";
import { useT } from "../i18n";
import { ScrollToTop } from "../components/ScrollToTop";

const ABSCHNITTE = ["was", "rollen", "beitreten", "oeffentlich", "bestenlisten", "statistik", "logbuch",
  "events", "chat", "loeschen", "konto", "haftung"];

/** `eingebettet`: als Reiter „Regeln" auf der Team-Seite (Jan, 02.11.2026) — ohne eigene Titelzeile und ohne Sprung nach oben. */
export default function TeamRegeln({ eingebettet = false }: { eingebettet?: boolean } = {}) {
  const t = useT();
  const { hash } = useLocation();
  // Verweis auf einen Abschnitt (#events …): nach dem Zeichnen dorthin, sonst nach oben.
  useEffect(() => {
    if (!hash) return;
    const h = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" }), 50);
    return () => clearTimeout(h);
  }, [hash]);
  return (
    <div className="w-full">
      {!hash && !eingebettet && <ScrollToTop />}
      {!eingebettet && <h1 className="mb-2 flex items-center gap-2 text-xl font-bold text-slate-100"><ZurueckPfeil fallback={getToken() ? "/teams" : "/"} />{t("team.regeln.titel")}</h1>}
      <p className="mb-5 text-sm text-slate-300">{t("team.regeln.intro")}</p>
      <div className="space-y-4">
        {ABSCHNITTE.map((a) => (
          <section key={a} id={a} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <h2 className="mb-2 font-semibold text-slate-100">{t(`team.regeln.${a}.titel`)}</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
              {t(`team.regeln.${a}.text`).split("\n").filter(Boolean).map((z, i) => <li key={i}>{z}</li>)}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

/** Kleiner Verweis „Team-Regeln" — optional auf einen Abschnitt (#events …). */
export function RegelnLink({ abschnitt, className = "" }: { abschnitt?: string; className?: string }) {
  const t = useT();
  return (
    <Link to={`/teams/regeln${abschnitt ? `#${abschnitt}` : ""}`}
      className={`text-sm text-brand-600 hover:underline dark:text-brand-300 ${className}`}>
      {t("team.regeln.link")} →
    </Link>
  );
}
