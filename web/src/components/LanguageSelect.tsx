import { Link } from "react-router-dom";
import { LANGS, Lang, useI18n } from "../i18n";
import { sprachPfad } from "../lib/seo";

// Sprachauswahl: Landesflagge + Eigenbezeichnung in der jeweiligen Sprache.
export function LanguageSelect({ className = "" }: { className?: string }) {
  const { lang, setLang } = useI18n();
  return (
    <select
      value={lang}
      onChange={(e) => setLang(e.target.value as Lang)}
      aria-label="Sprache / Language"
      className={`rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 ${className}`}
    >
      {LANGS.map((l) => (
        <option key={l.code} value={l.code}>
          {l.flag} {l.native}
        </option>
      ))}
    </select>
  );
}

// Sprachauswahl als Flaggen-Reihe: alle Sprachen nebeneinander, ohne Bezeichnung,
// immer sichtbar (für die öffentliche Startseite). Aktive Sprache hervorgehoben.
//
// `alsLinks` (Startseite): jede Flagge ist ein echter Link auf die Adresse der Sprache —
// `/en/`, `/fr/`, Deutsch auf `/`. Zwei Gruende, und beide zaehlen: die Adresse soll zu dem
// passen, was dort steht (sonst zeigte `/en/` nach einem Klick deutschen Text), und
// Suchmaschinen folgen Links, keinen Klick-Handlern — so findet Google die Uebersetzungen
// ueberhaupt erst (Jan, 06.09.2026).
export function LanguageFlags({ className = "", alsLinks = false }:
                              { className?: string; alsLinks?: boolean }) {
  const { lang, setLang } = useI18n();
  const stil = (aktiv: boolean) =>
    `rounded-md px-1 py-0.5 text-lg leading-none transition ${
      aktiv ? "opacity-100 ring-2 ring-brand-400" : "opacity-80 hover:opacity-100"}`;
  return (
    <div role="group" aria-label="Sprache / Language" className={`flex flex-wrap items-center gap-1 ${className}`}>
      {LANGS.map((l) => (alsLinks ? (
        <Link
          key={l.code}
          to={sprachPfad(l.code)}
          hrefLang={l.code}
          // Der Link ist fuer Suchmaschinen da, der Klick fuer Menschen: React Router wechselt
          // die Adresse ohne Neuladen, und ohne dieses `setLang` bliebe die Sprache stehen —
          // `/en/` haette dann deutschen Text.
          onClick={() => setLang(l.code)}
          title={l.native}
          aria-label={l.native}
          aria-current={lang === l.code ? "page" : undefined}
          className={stil(lang === l.code)}
        >
          {l.flag}
        </Link>
      ) : (
        <button
          key={l.code}
          type="button"
          onClick={() => setLang(l.code)}
          title={l.native}
          aria-label={l.native}
          aria-pressed={lang === l.code}
          className={stil(lang === l.code)}
        >
          {l.flag}
        </button>
      )))}
    </div>
  );
}
