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

// Sprachauswahl als KACHELN: Flagge + Eigenbezeichnung nebeneinander, alle 18 Sprachen
// gleichzeitig sichtbar. Vorgabe Jan (11.09.2026) fuer den Einrichtungs-Assistenten: die
// Sprache soll dort nicht als Frage stehen, sondern als Erstes aenderbar da sein — „gerne mit
// allen flaggen nebeneinander noch einmal so wie auf der oeffentlichen startseite, gern auch mit
// der bezeichnung wie im drop-down daneben".
//
// Anlass: es gab Nutzer, die die Sprache vor der Registrierung nicht gewaehlt hatten. Die
// Flaggen-Reihe (`LanguageFlags`) allein reicht dafuer nicht — eine Flagge ist fuer den, der
// seine Sprache sucht, kein Text, und einige Flaggen sehen bei 18 Eintraegen nebeneinander
// aehnlich aus (CH/AT, BR/PT).
//
// Feste Spaltenzahl je Breite statt `flex-wrap`, damit die Kacheln ein Raster bilden und die
// Namen untereinander stehen; `truncate` haelt lange Eigenbezeichnungen („Bahasa Indonesia",
// „Português (Portugal)") in der Kachel, statt das Raster zu sprengen.
export function LanguageGrid({ className = "" }: { className?: string }) {
  const { lang, setLang } = useI18n();
  return (
    <div role="group" aria-label="Sprache / Language"
      // HOECHSTENS drei Spalten (Vorgabe Jan): bei vier blieb fuer den Namen so wenig Platz,
      // dass „Português (Brasil)" und „Português (Portugal)" beide zu „Português (…" wurden —
      // also genau die Unterscheidung verschwand, um die es bei den beiden geht. Dasselbe traf
      // Schwiizerdütsch, Österreichisch und Bahasa Indonesia.
      className={`grid grid-cols-2 gap-2 sm:grid-cols-3 ${className}`}>
      {LANGS.map((l) => {
        const aktiv = lang === l.code;
        return (
          <button
            key={l.code}
            type="button"
            onClick={() => setLang(l.code)}
            lang={l.code}
            aria-pressed={aktiv}
            className={`flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition ${
              aktiv
                ? "border-brand-400 bg-brand-500/10 ring-1 ring-brand-400"
                : "border-slate-700 bg-slate-900/60 hover:border-slate-600"}`}
          >
            <span className="shrink-0 text-xl leading-none">{l.flag}</span>
            <span className={`truncate ${aktiv ? "font-semibold text-slate-100" : "text-slate-200"}`}>
              {l.native}
            </span>
          </button>
        );
      })}
    </div>
  );
}
