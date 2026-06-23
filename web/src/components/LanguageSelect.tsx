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
