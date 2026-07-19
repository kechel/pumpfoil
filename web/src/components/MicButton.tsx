import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../i18n";
import { useCloseOnBack } from "../lib/useCloseOnBack";

// Diktier-Button: Browser-Spracherkennung (Web Speech API). Während des Sprechens läuft eine
// Vollbild-Vorschau (große Schrift, Auto-Scroll); erst beim Stoppen wandert das fertige
// Ergebnis EINMAL sauber ins Eingabefeld. Blendet sich aus, wenn der Browser es nicht kann.
//
// Robustheit gegen Android-Chrome: continuous=false + Auto-Restart. Pro Erkennungs-Session
// gibt es genau eine finale Äußerung; wir akkumulieren sie selbst (finalRef). So entstehen
// keine Browser-Dopplungen (continuous=true liefert Finals dort teils mehrfach).

const SR_LANG: Record<string, string> = {
  de: "de-DE", gsw: "de-CH", "de-AT": "de-AT",
  en: "en-US", fr: "fr-FR", it: "it-IT", es: "es-ES", fi: "fi-FI", nl: "nl-NL", cs: "cs-CZ",
};

export function MicButton({ value, onChange, onSubmit, disabled, title }: {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: (text: string) => void;   // wenn gesetzt: „Übernehmen" sendet direkt (kein extra Senden-Klick)
  disabled?: boolean;
  title?: string;                       // Kontext-Titel oben im Vollbild-Diktat (z. B. „Spot-Chat Illmensee")
}) {
  const { lang, t } = useI18n();
  const [listening, setListening] = useState(false);
  const [preview, setPreview] = useState("");   // diktierter Live-Text (noch nicht im Feld)
  const [baseText, setBaseText] = useState(""); // bereits im Feld stehender Text (gedimmt vorangestellt)
  const [err, setErr] = useState("");
  const pendingRef = useRef<null | "accept" | "cancel" | "redo" | "edit">(null);  // Aktion, die den nächsten Stopp abschließt
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
  // Zurück-Geste während des Diktats: nicht die Seite/den Chat verlassen, sondern wie „Bearbeiten"
  // den bisher diktierten Text ins Feld übernehmen (kein Abbrechen, kein Auto-Senden).
  useCloseOnBack(listening, () => endWith("edit"));

  if (!SR) return null;

  function startSession() {
    const rec = new SR();
    rec.lang = SR_LANG[lang] || "de-DE";
    rec.continuous = false;   // eine Äußerung pro Session (Android-robust)
    rec.interimResults = true;
    sessFinalRef.current = "";
    rec.onstart = () => setListening(true);
    rec.onresult = (e: any) => {
      // Google liefert pro Runde den GESAMTEN aktuellen Text (und korrigiert frühere Wörter),
      // teils über mehrere Einträge dupliziert. Daher NUR das letzte Ergebnis nehmen (= der
      // aktuelle Gesamttext dieser Session), NICHT aufsummieren -> keine Dopplung.
      const last = e.results[e.results.length - 1];
      const txt = last ? String(last[0].transcript) : "";
      // Bei JEDEM Ergebnis merken (nicht nur isFinal): endet die Session durch eine
      // Sprechpause ohne finales Ergebnis, ginge der Text sonst beim Auto-Restart verloren.
      if (txt.trim()) sessFinalRef.current = txt;
      setPreview([finalRef.current, txt.trim()].filter(Boolean).join(" ").trim());
    };
    rec.onerror = (e: any) => {
      const code = e?.error;
      if (code === "no-speech") return;   // Stille -> onend startet neu, kein Fehler zeigen
      // Absichtliches Beenden (Abbrechen/Übernehmen/Nochmal/Bearbeiten) stoppt die Erkennung ->
      // Browser feuert dann „aborted": kein echter Fehler, onend erledigt den Rest.
      if (code === "aborted" || pendingRef.current) return;
      activeRef.current = false;
      setErr(code === "not-allowed" ? t("mic.blocked") : t("mic.err"));
      console.warn("SpeechRecognition error:", code);
    };
    rec.onend = () => {
      const f = sessFinalRef.current.trim();
      const action = pendingRef.current;
      // Abbrechen: alles verwerfen, Overlay zu.
      if (action === "cancel") { pendingRef.current = null; resetState(); return; }
      // Noch mal: verwerfen und sofort neu aufnehmen (Overlay bleibt offen).
      if (action === "redo") {
        pendingRef.current = null;
        finalRef.current = ""; sessFinalRef.current = ""; setPreview("");
        activeRef.current = true; startSession(); return;
      }
      // Final dieser Session EINMAL in den Gesamttext übernehmen.
      if (f) finalRef.current = [finalRef.current, f].filter(Boolean).join(" ");
      if (action === "accept" || action === "edit") {
        pendingRef.current = null;
        const all = finalRef.current.trim();
        const full = (baseRef.current + all).slice(0, 2000);
        if (full.trim()) {
          // „edit" (und der Fall ohne onSubmit): Text nur ins Feld -> manuell weiter bearbeiten.
          if (onSubmit && action === "accept") onSubmit(full.trim());
          else onChange(full);
        }
        resetState(); return;
      }
      // Natürliches Ende (Sprechpause): weiter aufnehmen, solange aktiv.
      if (activeRef.current) { startSession(); }
      else { resetState(); }
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
    setBaseText(value ? value.trim() : "");   // vorhandenen Feld-Text im Screen mit anzeigen
    activeRef.current = true;
    startSession();
  }

  // Overlay/Status zurücksetzen (nach Übernehmen/Abbrechen).
  function resetState() {
    activeRef.current = false; recRef.current = null;
    setListening(false); setPreview(""); setBaseText(""); finalRef.current = ""; sessFinalRef.current = "";
  }
  // Die Aktionen stoppen jeweils die Aufnahme; onend führt sie dann aus.
  function endWith(action: "accept" | "cancel" | "redo" | "edit") {
    pendingRef.current = action;
    activeRef.current = false;
    try { recRef.current?.stop(); } catch { /* egal */ }
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => { if (!listening) start(); }}
        disabled={disabled}
        title={err || t("chat.dictate")}
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

      {/* Vollbild-Diktat: große Schrift, füllt von oben nach unten, scrollt automatisch mit.
          Unten drei Aktionen — alle stoppen die Aufnahme; „Noch mal" startet direkt neu.
          Per Portal an document.body -> echtes Viewport-Vollbild (nicht im Chat-Container
          gefangen, der durch transform/backdrop-blur sonst „fixed" einsperrt). */}
      {listening && createPortal(
        <div
          className="fixed inset-0 z-[3000] flex flex-col bg-slate-800"
          style={{
            paddingTop: "calc(1.25rem + env(safe-area-inset-top))",
            paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))",
            paddingLeft: "calc(1.25rem + env(safe-area-inset-left))",
            paddingRight: "calc(1.25rem + env(safe-area-inset-right))",
          }}
        >
          {title && <div className="mb-1 truncate text-base font-semibold text-slate-300">{title}</div>}
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-red-400">
            <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
            {t("mic.listening")}
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto whitespace-pre-wrap text-xl leading-relaxed text-slate-400">
            {baseText && <span className="text-slate-400">{baseText} </span>}
            {preview ? <span className="font-bold text-brand-400">{preview}</span> : (!baseText && <span className="text-slate-500">…</span>)}
          </div>
          <div className="mt-4 flex items-stretch gap-2">
            <button onClick={() => endWith("cancel")} title={t("mic.cancel")} aria-label={t("mic.cancel")}
              className="flex flex-1 items-center justify-center rounded-2xl bg-slate-800 py-3.5 text-red-400 hover:bg-slate-700">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </button>
            <button onClick={() => endWith("redo")}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-slate-800 py-3.5 text-sm font-medium text-slate-100 hover:bg-slate-700">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v4h4" />
              </svg>
              {t("mic.redo")}
            </button>
            {onSubmit && (
              <button onClick={() => endWith("edit")}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-slate-800 py-3.5 text-sm font-medium text-slate-100 hover:bg-slate-700">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 20h4L18 8l-4-4L4 16v4Z" /><path d="M13 5l4 4" />
                </svg>
                {t("chat.edit")}
              </button>
            )}
            <button onClick={() => endWith("accept")} title={onSubmit ? t("mic.send") : t("mic.accept")} aria-label={onSubmit ? t("mic.send") : t("mic.accept")}
              className="flex flex-1 items-center justify-center rounded-2xl bg-brand-500 py-3.5 text-slate-950 hover:bg-brand-400">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7z" />
              </svg>
            </button>
          </div>
        </div>,
        document.body
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
