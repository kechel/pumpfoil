// Leichtgewichtige i18n ohne externe Dependency.
// `de` ist die Quelle der Wahrheit; fehlende Keys fallen auf `de` zurück,
// fehlt der Key auch dort, wird der Key selbst zurückgegeben (sichtbar im Dev).
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, getToken } from "../lib/api";
import de from "./locales/de";
import gsw from "./locales/gsw";
import deAT from "./locales/de-AT";
import en from "./locales/en";
import fr from "./locales/fr";
import it from "./locales/it";
import es from "./locales/es";
import fi from "./locales/fi";
import nl from "./locales/nl";

export type Lang = "de" | "gsw" | "de-AT" | "en" | "fr" | "it" | "es" | "fi" | "nl";

export type Dict = Record<string, string>;

// Auswahl-Metadaten: Landesflagge + Eigenbezeichnung in der jeweiligen Sprache.
export const LANGS: { code: Lang; flag: string; native: string }[] = [
  { code: "de", flag: "🇩🇪", native: "Deutsch" },
  { code: "gsw", flag: "🇨🇭", native: "Schwiizerdütsch" },
  { code: "de-AT", flag: "🇦🇹", native: "Österreichisch" },
  { code: "en", flag: "🇬🇧", native: "English" },
  { code: "fr", flag: "🇫🇷", native: "Français" },
  { code: "it", flag: "🇮🇹", native: "Italiano" },
  { code: "es", flag: "🇪🇸", native: "Español" },
  { code: "fi", flag: "🇫🇮", native: "Suomi" },
  { code: "nl", flag: "🇳🇱", native: "Nederlands" },
];

const DICTS: Record<Lang, Dict> = { de, gsw, "de-AT": deAT, en, fr, it, es, fi, nl };

const LS_KEY = "foil_lang";

function isLang(x: string | null): x is Lang {
  return !!x && x in DICTS;
}

// HTML-lang-Attribut (Dialekte auf passende BCP-47-Codes mappen).
function htmlLang(l: Lang): string {
  return l === "gsw" ? "de-CH" : l;
}

export function detectInitialLang(): Lang {
  const saved = localStorage.getItem(LS_KEY);
  if (isLang(saved)) return saved;
  const nav = (navigator.language || "").toLowerCase();
  // Regional-Varianten vor dem generischen "de": Österreich -> de-AT, Schweiz -> Schwiizerdütsch.
  if (nav.startsWith("de-at")) return "de-AT";
  if (nav.startsWith("de-ch") || nav.startsWith("gsw")) return "gsw";
  if (nav.startsWith("de")) return "de";
  if (nav.startsWith("fr")) return "fr";
  if (nav.startsWith("it")) return "it";
  if (nav.startsWith("es")) return "es";
  if (nav.startsWith("fi")) return "fi";
  if (nav.startsWith("nl")) return "nl";
  if (nav.startsWith("en")) return "en";
  return "de";
}

export type TFunc = (key: string, vars?: Record<string, string | number>) => string;

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang, opts?: { persist?: boolean }) => void;
  t: TFunc;
}

const Ctx = createContext<I18nCtx | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectInitialLang);

  useEffect(() => {
    document.documentElement.lang = htmlLang(lang);
    localStorage.setItem(LS_KEY, lang);
  }, [lang]);

  const setLang = useCallback((l: Lang, opts?: { persist?: boolean }) => {
    setLangState(l);
    // Eingeloggt: Präferenz serverseitig sichern (außer beim Anwenden der Server-Sprache).
    if (opts?.persist !== false && getToken()) {
      api.updateLanguage(l).catch(() => {});
    }
  }, []);

  const t = useCallback<TFunc>(
    (key, vars) => {
      let s = DICTS[lang][key] ?? DICTS.de[key] ?? key;
      if (vars) {
        for (const k of Object.keys(vars)) {
          s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(vars[k]));
        }
      }
      return s;
    },
    [lang]
  );

  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useI18n outside provider");
  return c;
}

// Bequemer Hook, wenn nur die t-Funktion gebraucht wird.
export function useT(): TFunc {
  return useI18n().t;
}
