// Leichtgewichtige i18n ohne externe Dependency.
// Fehlende Keys fallen auf `en` zurück, dann auf `de` (Voll-Bestand), zuletzt wird der Key
// selbst zurückgegeben (im Dev sichtbar). Neue Sprachen zeigen fehlende Strings also Englisch.
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, getToken } from "../lib/api";
import de from "./locales/de";
import gsw from "./locales/gsw";
import pl from "./locales/pl";
import deAT from "./locales/de-AT";
import en from "./locales/en";
import fr from "./locales/fr";
import it from "./locales/it";
import es from "./locales/es";
import fi from "./locales/fi";
import nl from "./locales/nl";
import cs from "./locales/cs";
import pt from "./locales/pt";
import ja from "./locales/ja";
import zh from "./locales/zh";
import ru from "./locales/ru";
import id from "./locales/id";
import nb from "./locales/nb";

export type Lang = "de" | "gsw" | "de-AT" | "en" | "fr" | "it" | "es" | "fi" | "nl" | "cs"
  | "pl" | "pt" | "ja" | "zh" | "ru" | "id" | "nb";

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
  { code: "cs", flag: "🇨🇿", native: "Čeština" },
  { code: "pl", flag: "🇵🇱", native: "Polski" },
  { code: "pt", flag: "🇧🇷", native: "Português" },
  { code: "ja", flag: "🇯🇵", native: "日本語" },
  { code: "zh", flag: "🇨🇳", native: "中文" },
  { code: "ru", flag: "🇷🇺", native: "Русский" },
  { code: "id", flag: "🇮🇩", native: "Bahasa Indonesia" },
  { code: "nb", flag: "🇳🇴", native: "Norsk" },
];

const DICTS: Record<Lang, Dict> = { de, gsw, "de-AT": deAT, en, fr, it, es, fi, nl, cs, pl, pt, ja, zh, ru, id, nb };

// Sprachen, deren Rueckfall NICHT Englisch ist: Mundarten fallen auf ihre Hochsprache.
const BRUECKE: Partial<Record<Lang, Lang>> = { gsw: "de", "de-AT": "de" };

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
  if (nav.startsWith("cs")) return "cs";
  if (nav.startsWith("pl")) return "pl";
  if (nav.startsWith("pt")) return "pt";
  if (nav.startsWith("ja")) return "ja";
  if (nav.startsWith("zh")) return "zh";
  if (nav.startsWith("ru")) return "ru";
  if (nav.startsWith("id")) return "id";
  // Norwegisch: Geraete melden nb-NO (Bokmaal), nn-NO (Nynorsk) oder das generische "no".
  // Alle drei landen auf unserer Bokmaal-Uebersetzung — Nynorsk-Leser sind Bokmaal gewohnt,
  // und eine zweite norwegische Norm zu pflegen waere fuer den Nutzen zu viel.
  if (nav.startsWith("nb") || nav.startsWith("nn") || nav.startsWith("no")) return "nb";
  if (nav.startsWith("en")) return "en";
  return "en";   // unbekannte Browsersprache -> Englisch (nicht Deutsch)
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
      // Rueckfall: eigene Sprache -> Bruecke -> Englisch -> Deutsch -> der Key selbst.
      //
      // Die Bruecke ist der Punkt: gsw und de-AT sind Mundart-Faerbungen des Deutschen und
      // decken nur einen Teil der Keys ab (gsw 1082 von 1612, de-AT 1103) — beide Dateien sagen
      // im eigenen Kopf "fehlende Keys fallen auf Hochdeutsch zurueck". Genau das tat der Code
      // NICHT: er ging zuerst auf Englisch, also sahen Schweizer und oesterreichische Nutzer
      // rund 500 Texte auf Englisch statt auf Deutsch (gefunden 31.08. beim Sprachdurchgang).
      const bruecke = BRUECKE[lang];
      let s = DICTS[lang][key] ?? (bruecke ? DICTS[bruecke][key] : undefined)
              ?? DICTS.en[key] ?? DICTS.de[key] ?? key;
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

// Zahlen-Gruppierung folgt der UI-SPRACHE, nicht der Browsersprache: `toLocaleString()` ohne
// Argument nimmt die Systemsprache, dadurch stand in der englischen Oberflaeche "328.104"
// statt "328,104" (gemeldet 20.08.). Dialekte auf ihre BCP-47-Codes (htmlLang) mappen, damit
// z. B. de-CH sein Hochkomma bekommt. Kein Intl -> unformatierte Zahl statt Absturz.
export function formatNumber(n: number, lang: Lang, opts?: Intl.NumberFormatOptions): string {
  try {
    return new Intl.NumberFormat(htmlLang(lang), opts).format(n);
  } catch {
    return String(n);
  }
}

// Hook-Variante fuer Komponenten: haengt an der aktuellen UI-Sprache.
export function useNumberFormat(): (n: number, opts?: Intl.NumberFormatOptions) => string {
  const { lang } = useI18n();
  return useCallback((n: number, opts?: Intl.NumberFormatOptions) => formatNumber(n, lang, opts), [lang]);
}
