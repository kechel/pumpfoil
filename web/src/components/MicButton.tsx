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
  const [err, setErr] = useState("");
  const recRef = useRef<any>(null);
  const baseRef = useRef("");

  const SR = typeof window !== "undefined"
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

  // Beim Unmount laufende Erkennung stoppen.
  useEffect(() => () => { try { recRef.current?.stop(); } catch { /* egal */ } }, []);

  if (!SR) return null;

  async function toggle() {
    setErr("");
    if (listening) { try { recRef.current?.stop(); } catch { /* egal */ } return; }
    // Mikro-Berechtigung aktiv anfordern -> Browser zeigt den „Mikrofon erlauben?"-Dialog,
    // falls nötig; ist sie schon erteilt, läuft das sofort durch. Danach gibt SpeechRecognition
    // keinen zweiten Dialog. Bei Ablehnung/keinem Mikro klarer Hinweis statt stummem Nichts.
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((tr) => tr.stop());   // sofort freigeben, SR öffnet selbst
      }
    } catch (ex: any) {  // eslint-disable-line @typescript-eslint/no-explicit-any
      setErr(ex?.name === "NotAllowedError" ? t("mic.blocked") : t("mic.err"));
      console.warn("getUserMedia failed:", ex?.name || ex);
      return;
    }
    const rec = new SR();
    rec.lang = SR_LANG[lang] || "de-DE";
    rec.continuous = true;
    rec.interimResults = true;
    // Vorhandenen Text als Basis behalten, Diktat hinten anhängen (mit Trennleerzeichen).
    baseRef.current = value ? value.replace(/\s+$/, "") + " " : "";
    rec.onstart = () => setListening(true);          // zuverlässiges „Aufnahme läuft"-Feedback
    rec.onresult = (e: any) => {
      let s = "";
      for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript;
      onChange((baseRef.current + s).slice(0, 2000));
    };
    rec.onend = () => { setListening(false); recRef.current = null; };
    rec.onerror = (e: any) => {
      setListening(false);
      // Fehler NICHT verschlucken -> Nutzer sieht, warum nichts passiert.
      const code = e?.error;
      setErr(code === "no-speech" ? t("mic.nospeech")
        : code === "not-allowed" ? t("mic.blocked")
        : t("mic.err"));
      console.warn("SpeechRecognition error:", code);
    };
    recRef.current = rec;
    try { rec.start(); } catch (ex) { setListening(false); setErr(t("mic.err")); console.warn("rec.start failed:", ex); }
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        title={err || t("chat.dictate")}
        aria-label={t("chat.dictate")}
        aria-pressed={listening}
        className={`flex items-center justify-center rounded-xl border px-3 py-2 ${
          listening
            ? "animate-pulse border-red-500 bg-red-500/20 text-red-400"
            : err
              ? "border-red-500/50 bg-slate-900 text-red-400 hover:bg-slate-800"
              : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
        } disabled:opacity-50`}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 10a7 7 0 0 0 14 0" />
          <line x1="12" y1="19" x2="12" y2="22" />
        </svg>
      </button>
      {err && (
        <div className="absolute bottom-full right-0 z-50 mb-1 w-52 rounded-lg bg-slate-800 px-2 py-1.5 text-[11px] leading-snug text-red-300 shadow-lg">
          {err}
        </div>
      )}
    </div>
  );
}
