import { Link } from "react-router-dom";
import { useT } from "../i18n";

// Durchgehende Navigation durch die Nerd-Analysen-Reihe, am Fuss jedes Teils.
//
// WARUM (Jan, 22.09.2026: „die teile sollen sich auch gegenseitig verlinken bitte, das ist noch
// nicht ganz konsistent durchgezogen bisher"): bis dahin hatte jeder Teil hoechstens EINEN Link.
// Teil 1 zeigte auf Teil 2, Teil 2 und Teil 3 hatten oben einen Rueckwaerts-Link und am Ende gar
// nichts — von Teil 2 kam man also nicht zu Teil 3, obwohl es ihn seit Wochen gab.
//
// Eine Zeile Zahlen statt vier Titeln: die Titel stehen in den Artikel-Sprachdateien (8 Sprachen),
// die Reihe hat aber inzwischen vier Teile und die Hauptsprachen sind 18. Ein Schluessel mit
// Platzhalter ist in allen 18 uebersetzt, bleibt kurz und wird durch die Position eindeutig.
export function NerdNav({ current }: { current: 1 | 2 | 3 | 4 }) {
  const t = useT();
  const teile: { n: 1 | 2 | 3 | 4; zu: string }[] = [
    { n: 1, zu: "/nerd-analysen" },
    { n: 2, zu: "/nerd-analysen-2" },
    { n: 3, zu: "/nerd-analysen-3" },
    { n: 4, zu: "/nerd-analysen-4" },
  ];
  return (
    <nav className="mb-10 mt-10 flex flex-wrap gap-2 border-t border-slate-800 pt-4 text-sm">
      {teile.map(({ n, zu }) => (
        n === current ? (
          <span key={n} aria-current="page"
            className="rounded-lg bg-brand-500 px-3 py-1.5 font-semibold text-slate-950">
            {t("nerd.part").replace("{n}", String(n))}
          </span>
        ) : (
          <Link key={n} to={zu}
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-slate-200 transition-colors hover:bg-slate-700">
            {t("nerd.part").replace("{n}", String(n))}
          </Link>
        )
      ))}
    </nav>
  );
}
