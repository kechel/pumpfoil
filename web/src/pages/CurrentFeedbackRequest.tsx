import { useState } from "react";
import { api } from "../lib/api";
import { Card, Button } from "../components/ui";
import { ScrollToTop } from "../components/ScrollToTop";
import { CURRENT_FEEDBACK_REQUEST as CFR } from "../lib/feedbackRequest";
import { useT } from "../i18n";

// Temporäre „aktuelles Feedback erbeten"-Seite: eingebettetes Video (Server-Route
// /demo/stop-screen.mp4) + Textarea. Feedback landet im NORMALEN Feedback-System
// (POST /api/feedback, url = "current-feedback-request"). Kein Extra-Backend.
export default function CurrentFeedbackRequest() {
  const t = useT();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      // Request-Tag voranstellen -> Zuordnung im Feedback-Eingang.
      await api.submitFeedback("[" + CFR.tag + "]\n" + body, "current-feedback-request");
      setDone(true);
    } catch {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <ScrollToTop />
      <h2 className="mb-3 text-2xl font-bold text-slate-100">{t("cfr.title")}</h2>
      <p className="mb-4 leading-relaxed text-slate-300">{t("cfr.intro")}</p>

      <video
        src="/demo/stop-screen.mp4"
        autoPlay
        loop
        muted
        playsInline
        controls
        className="mx-auto mb-6 w-full max-w-xs rounded-2xl border border-slate-700"
      />

      {done ? (
        <Card>
          <p className="font-medium text-cyan-700 dark:text-cyan-300">{t("cfr.thanks")}</p>
        </Card>
      ) : (
        <div className="space-y-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("cfr.placeholder")}
            rows={5}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-slate-100 outline-none focus:border-cyan-500"
          />
          <Button onClick={submit} disabled={sending || text.trim().length === 0}>
            {sending ? t("cfr.sending") : t("cfr.submit")}
          </Button>
        </div>
      )}
    </div>
  );
}
