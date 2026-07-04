import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";

// Diktier-Button: Browser-Spracherkennung (Web Speech API). Schreibt den erkannten Text
// live ins Eingabefeld (via onChange), sendet NICHT automatisch — Absenden bleibt manuell.
// Blendet sich aus, wenn der Browser keine SpeechRecognition kann (z. B. Firefox).

// i18n-Sprache -> BCP-47-Locale für die Erkennung.
const SR_LANG: Record<string, string> = {
  de: "de-DE", gsw: "de-CH", "de-AT": "de-AT",
  en: "en-US", fr: "fr-FR", it: "it-IT", es: "es-ES",
};

export function MicButton({ value, onChange, disabled }: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const { lang, t } = useI18n();
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);
  const baseRef = useRef("");

  const SR = typeof window !== "undefined"
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

  // Beim Unmount laufende Erkennung stoppen.
  useEffect(() => () => { try { recRef.current?.stop(); } catch { /* egal */ } }, []);

  if (!SR) return null;

  function toggle() {
    if (listening) { try { recRef.current?.stop(); } catch { /* egal */ } return; }
    const rec = new SR();
    rec.lang = SR_LANG[lang] || "de-DE";
    rec.continuous = true;
    rec.interimResults = true;
    // Vorhandenen Text als Basis behalten, Diktat hinten anhängen (mit Trennleerzeichen).
    baseRef.current = value ? value.replace(/\s+$/, "") + " " : "";
    rec.onresult = (e: any) => {
      let s = "";
      for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript;
      onChange((baseRef.current + s).slice(0, 2000));
    };
    rec.onend = () => { setListening(false); recRef.current = null; };
    rec.onerror = () => { setListening(false); };
    recRef.current = rec;
    setListening(true);
    try { rec.start(); } catch { setListening(false); }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      title={t("chat.dictate")}
      aria-label={t("chat.dictate")}
      aria-pressed={listening}
      className={`flex shrink-0 items-center justify-center rounded-xl border px-3 py-2 ${
        listening
          ? "animate-pulse border-red-500 bg-red-500/20 text-red-400"
          : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
      } disabled:opacity-50`}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 10a7 7 0 0 0 14 0" />
        <line x1="12" y1="19" x2="12" y2="22" />
      </svg>
    </button>
  );
}
