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
  const [preview, setPreview] = useState("");   // Live-Vorschau während des Sprechens (noch nicht im Feld)
  const [err, setErr] = useState("");
  const recRef = useRef<any>(null);
  const baseRef = useRef("");
  const finalRef = useRef("");   // bereits final erkannter Text (über Events hinweg akkumuliert)

  const SR = typeof window !== "undefined"
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

  // Beim Unmount laufende Erkennung stoppen.
  useEffect(() => () => { try { recRef.current?.stop(); } catch { /* egal */ } }, []);

  // Fehler-Tooltip nicht „kleben" lassen: nach 6 s automatisch ausblenden.
  useEffect(() => {
    if (!err) return;
    const id = setTimeout(() => setErr(""), 6000);
    return () => clearTimeout(id);
  }, [err]);

  if (!SR) return null;

  function toggle() {
    setErr("");
    // Gegen Mehrfach-Instanzen die REF prüfen (nicht den listening-State — der kommt via
    // onstart asynchron; sonst starten schnelle Doppel-Taps mehrere Erkenner -> Text doppelt/dreifach).
    if (recRef.current) { try { recRef.current.stop(); } catch { /* egal */ } return; }
    // WICHTIG: start() MUSS synchron im Klick-Handler laufen. Kein await davor (z. B.
    // getUserMedia) — sonst geht der User-Gesten-Kontext verloren und Chrome lehnt start()
    // still ab (kein Feedback). SpeechRecognition fordert die Mikro-Freigabe selbst an.
    const rec = new SR();
    rec.lang = SR_LANG[lang] || "de-DE";
    rec.continuous = true;
    rec.interimResults = true;
    // Vorhandenen Text als Basis behalten, Diktat hinten anhängen (mit Trennleerzeichen).
    baseRef.current = value ? value.replace(/\s+$/, "") + " " : "";
    finalRef.current = "";
    setPreview("");
    rec.onstart = () => { setListening(true); setPreview(""); };
    rec.onresult = (e: any) => {
      // NUR Live-Vorschau aktualisieren (nicht ins Feld schreiben). Kanonisch: ab resultIndex
      // nur neue Ergebnisse — finale Teile in finalRef sammeln, laufendes Interim anhängen.
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalRef.current += r[0].transcript;
        else interim += r[0].transcript;
      }
      setPreview((finalRef.current + interim).trim());
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
      // Erst beim Stoppen das fertige Ergebnis EINMAL sauber ins Feld übernehmen.
      const finalText = finalRef.current.trim();
      if (finalText) onChange((baseRef.current + finalText).slice(0, 2000));
      setPreview("");
    };
    rec.onerror = (e: any) => {
      setListening(false);
      recRef.current = null;
      // Fehler NICHT verschlucken -> Nutzer sieht, warum nichts passiert.
      const code = e?.error;
      setErr(code === "no-speech" ? t("mic.nospeech")
        : code === "not-allowed" ? t("mic.blocked")
        : t("mic.err"));
      console.warn("SpeechRecognition error:", code);
    };
    recRef.current = rec;
    try { rec.start(); } catch (ex) { setListening(false); recRef.current = null; setErr(t("mic.err")); console.warn("rec.start failed:", ex); }
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        title={err || (listening ? t("mic.stop") : t("chat.dictate"))}
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
      {/* Live-Vorschau während des Sprechens — landet erst beim Stoppen im Feld. */}
      {listening && (
        <div className="absolute bottom-full right-0 z-50 mb-1 w-56 rounded-lg bg-slate-800 px-2 py-1.5 text-[11px] leading-snug text-slate-200 shadow-lg">
          <span className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-red-500 align-middle" />
          {preview || <span className="text-slate-400">{t("mic.listening")}</span>}
        </div>
      )}
      {err && !listening && (
        <div
          role="button"
          onClick={() => setErr("")}
          title={t("mic.dismiss")}
          className="absolute bottom-full right-0 z-50 mb-1 w-52 cursor-pointer rounded-lg bg-slate-800 px-2 py-1.5 text-[11px] leading-snug text-red-300 shadow-lg"
        >
          {err} <span className="text-slate-500">✕</span>
        </div>
      )}
    </div>
  );
}
