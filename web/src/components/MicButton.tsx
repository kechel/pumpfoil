import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";

// Diktier-Button: Browser-Spracherkennung (Web Speech API). Während des Sprechens läuft eine
// Vollbild-Vorschau (große Schrift, Auto-Scroll); erst beim Stoppen wandert das fertige
// Ergebnis EINMAL sauber ins Eingabefeld. Blendet sich aus, wenn der Browser es nicht kann.
//
// Robustheit gegen Android-Chrome: continuous=false + Auto-Restart. Pro Erkennungs-Session
// gibt es genau eine finale Äußerung; wir akkumulieren sie selbst (finalRef). So entstehen
// keine Browser-Dopplungen (continuous=true liefert Finals dort teils mehrfach).

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
  const [preview, setPreview] = useState("");   // Live-Text (nur Vorschau, noch nicht im Feld)
  const [err, setErr] = useState("");
  const recRef = useRef<any>(null);
  const activeRef = useRef(false);   // Nutzer will weiterdiktieren (steuert Auto-Restart)
  const baseRef = useRef("");        // Feld-Text bei Start (Diktat wird angehängt)
  const finalRef = useRef("");       // von uns akkumulierter finaler Text (über Sessions)
  const sessFinalRef = useRef("");   // finaler Text der laufenden Session
  const scrollRef = useRef<HTMLDivElement>(null);

  const SR = typeof window !== "undefined"
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

  useEffect(() => () => { activeRef.current = false; try { recRef.current?.stop(); } catch { /* egal */ } }, []);
  useEffect(() => { if (!err) return; const id = setTimeout(() => setErr(""), 6000); return () => clearTimeout(id); }, [err]);
  // Vollbild-Vorschau immer ans untere Ende scrollen (aktuellen Abschnitt zeigen).
  useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [preview]);

  if (!SR) return null;

  function startSession() {
    const rec = new SR();
    rec.lang = SR_LANG[lang] || "de-DE";
    rec.continuous = false;   // eine Äußerung pro Session (Android-robust)
    rec.interimResults = true;
    sessFinalRef.current = "";
    rec.onstart = () => setListening(true);
    rec.onresult = (e: any) => {
      let interim = "", fin = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) fin += r[0].transcript; else interim += r[0].transcript;
      }
      sessFinalRef.current = fin;
      const joined = [finalRef.current, (fin + interim).trim()].filter(Boolean).join(" ");
      setPreview(joined.trim());
    };
    rec.onerror = (e: any) => {
      const code = e?.error;
      if (code === "no-speech") return;   // Stille -> onend startet neu, kein Fehler zeigen
      activeRef.current = false;
      setErr(code === "not-allowed" ? t("mic.blocked") : t("mic.err"));
      console.warn("SpeechRecognition error:", code);
    };
    rec.onend = () => {
      // Final dieser Session EINMAL in den Gesamttext übernehmen.
      const f = sessFinalRef.current.trim();
      if (f) finalRef.current = [finalRef.current, f].filter(Boolean).join(" ");
      if (activeRef.current) {
        startSession();   // weiter diktieren -> nächste Session
      } else {
        setListening(false);
        recRef.current = null;
        const all = finalRef.current.trim();
        if (all) onChange((baseRef.current + all).slice(0, 2000));
        setPreview("");
      }
    };
    recRef.current = rec;
    try { rec.start(); }
    catch (ex) { activeRef.current = false; setListening(false); recRef.current = null; setErr(t("mic.err")); console.warn("rec.start failed:", ex); }
  }

  function start() {
    setErr("");
    baseRef.current = value ? value.replace(/\s+$/, "") + " " : "";
    finalRef.current = "";
    setPreview("");
    activeRef.current = true;
    startSession();
  }

  function stop() {
    activeRef.current = false;
    try { recRef.current?.stop(); } catch { /* egal */ }
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => (listening ? stop() : start())}
        disabled={disabled}
        title={err || (listening ? t("mic.stop") : t("chat.dictate"))}
        aria-label={t("chat.dictate")}
        aria-pressed={listening}
        className={`flex items-center justify-center rounded-xl border px-3 py-2 ${
          listening
            ? "animate-pulse border-red-500 bg-red-500/20 text-red-400"
            : err ? "border-red-500/50 bg-slate-900 text-red-400 hover:bg-slate-800"
                  : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
        } disabled:opacity-50`}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 10a7 7 0 0 0 14 0" />
          <line x1="12" y1="19" x2="12" y2="22" />
        </svg>
      </button>

      {/* Vollbild-Diktat: große Schrift, füllt von oben nach unten, scrollt automatisch mit. */}
      {listening && (
        <div className="fixed inset-0 z-[3000] flex flex-col bg-slate-950/97 p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-red-400">
            <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
            {t("mic.listening")}
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto whitespace-pre-wrap text-2xl leading-relaxed text-slate-100 sm:text-3xl">
            {preview || <span className="text-slate-500">…</span>}
          </div>
          <button
            onClick={stop}
            className="mt-4 rounded-2xl bg-brand-500 py-4 text-lg font-semibold text-slate-950 hover:bg-brand-400"
          >
            {t("mic.stop")}
          </button>
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
