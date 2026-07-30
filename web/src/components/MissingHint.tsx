import { MailIcon } from "./Icons";
import { useT } from "../i18n";

// „Fehlt etwas im Katalog?" — ein Knopf, der das globale Feedback-Panel mit vorbelegtem
// Text öffnet (Event, siehe FeedbackWidget). Steht unter Katalog-Listen, die naturgemäß
// unvollständig sind (Foils, Stabs): die Hersteller-Landschaft ändert sich jährlich.
// Grund: zwei Nutzer mussten uns anschreiben, weil ihre Marke fehlte und die Liste
// nirgends sagte, dass man sie nachtragen lassen kann — das war eine Sackgasse.
export function MissingHint({ what }: { what: string }) {
  const t = useT();
  return (
    <p className="pt-3 text-sm text-slate-300">
      {what}{" "}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent("open-feedback", { detail: what }))}
        className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline dark:text-brand-300"
      >
        <MailIcon className="h-4 w-4" /> {t("foils.missingCta")}
      </button>
    </p>
  );
}
