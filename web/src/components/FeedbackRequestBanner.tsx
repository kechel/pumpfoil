import { useState } from "react";
import { Link } from "react-router-dom";
import { CURRENT_FEEDBACK_REQUEST as CFR } from "../lib/feedbackRequest";
import { CloseIcon } from "./Icons";
import { useT } from "../i18n";

// Schlanker „aktuelle Feedback-Bitte"-Banner oben (nur PWA). Führt zu /current-feedback-request.
// Wegklickbar (pro Kampagne, localStorage). Rendert nichts, wenn weggeklickt — und nichts, solange
// keine Kampagne läuft (CFR.enabled = false; s. lib/feedbackRequest.ts).
export function FeedbackRequestBanner() {
  const t = useT();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(CFR.dismissKey) === "1");
  if (!CFR.enabled || dismissed) return null;
  return (
    <div className="mb-3 flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-sm">
      <Link to={CFR.path} className="flex-1 font-medium text-cyan-700 hover:underline dark:text-cyan-300">
        {t("cfr.banner")} →
      </Link>
      <button
        onClick={() => { localStorage.setItem(CFR.dismissKey, "1"); setDismissed(true); }}
        aria-label={t("banner.dismiss")}
        className="shrink-0 text-slate-400 hover:text-slate-200"
      >
        <CloseIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
