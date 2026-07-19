import { useState } from "react";
import { useLocation } from "react-router-dom";
import { api } from "../lib/api";
import { MailIcon, CloseIcon } from "./Icons";
import { MicButton } from "./MicButton";
import { useT } from "../i18n";
import { useCloseOnBack } from "../lib/useCloseOnBack";

const MAX = 500;

// Global sichtbares Feedback-Widget: kleiner Tab am rechten Rand (vertikal zentriert),
// öffnet ein Panel mit Textfeld. Speichert die aktuelle URL mit.
export function FeedbackWidget() {
  const t = useT();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  useCloseOnBack(open, () => setOpen(false));   // Swipe/Zurück schließt das Panel (wie Abbrechen)

  function send() { submitText(text); }
  function submitText(raw: string) {
    const v = raw.trim();
    if (!v) return;
    setBusy(true);
    api.submitFeedback(v.slice(0, MAX), loc.pathname + loc.search)
      .then(() => {
        setSent(true);
        setText("");
        setTimeout(() => { setOpen(false); setSent(false); }, 1400);
      })
      .catch(() => {})
      .finally(() => setBusy(false));
  }

  return (
    <>
      {/* Tab am rechten Rand */}
      <button
        onClick={() => setOpen(true)}
        aria-label={t("feedback.open")}
        title={t("feedback.open")}
        className="fixed right-0 top-1/2 z-[1500] -translate-y-1/2 rounded-l-xl bg-brand-500 px-2 py-3 text-slate-950 shadow-lg transition-transform hover:px-3"
      >
        <MailIcon className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[1600] flex items-center justify-end bg-black/40" onClick={() => setOpen(false)}>
          <div
            className="m-3 w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between">
              <h3 className="font-semibold text-slate-100">{t("feedback.title")}</h3>
              <button onClick={() => setOpen(false)} aria-label="Close" className="text-slate-400 hover:text-slate-200"><CloseIcon className="h-4 w-4" /></button>
            </div>
            <p className="mb-3 text-xs text-slate-400">{t("feedback.intro")}</p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX))}
              maxLength={MAX}
              rows={4}
              placeholder={t("feedback.placeholder")}
              autoFocus
              className="w-full resize-none rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[11px] tabular-nums text-slate-500">{text.length}/{MAX}</span>
              <div className="flex items-center gap-2">
                <MicButton value={text} onChange={(v) => setText(v.slice(0, MAX))} onSubmit={(v) => submitText(v)} disabled={busy} title={t("feedback.title")} />
                {sent ? (
                  <span className="text-sm text-emerald-700 dark:text-emerald-400">{t("feedback.sent")}</span>
                ) : (
                  <button
                    onClick={send}
                    disabled={busy || !text.trim()}
                    className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-brand-400 disabled:opacity-50"
                  >
                    {busy ? "…" : t("feedback.send")}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
