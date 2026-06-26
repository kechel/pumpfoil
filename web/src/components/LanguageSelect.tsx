import { LANGS, Lang, useI18n } from "../i18n";

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
export function LanguageFlags({ className = "" }: { className?: string }) {
  const { lang, setLang } = useI18n();
  return (
    <div role="group" aria-label="Sprache / Language" className={`flex flex-wrap items-center gap-1 ${className}`}>
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => setLang(l.code)}
          title={l.native}
          aria-label={l.native}
          aria-pressed={lang === l.code}
          className={`rounded-md px-1 py-0.5 text-lg leading-none transition ${
            lang === l.code
              ? "opacity-100 ring-2 ring-brand-400"
              : "opacity-80 hover:opacity-100"
          }`}
        >
          {l.flag}
        </button>
      ))}
    </div>
  );
}
