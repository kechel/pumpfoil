import { useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../lib/api";
import { useT } from "../i18n";

// Bestaetigungs-Popup zum Zusammenfuehren mehrerer Sessions. Wiederverwendet von
// der Sessions-Liste (Hinweis) und der Vergleichs-Ansicht. Endgueltig (keine Undo-UX).
export function MergeConfirm({ ids, onClose, onDone }: {
  ids: number[]; onClose: () => void; onDone: (id: number) => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    setBusy(true); setErr(null);
    try {
      const r = await api.mergeSessions(ids);
      onDone(r.id);
    } catch (e) { setErr(String(e)); setBusy(false); }
  }
  return createPortal(
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-2 font-semibold text-slate-100">{t("merge.title")}</h3>
        <p className="mb-4 text-sm text-slate-300">{t("merge.confirm", { n: ids.length })}</p>
        {err && <p className="mb-3 text-sm text-red-400">{err}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700">{t("common.cancel")}</button>
          <button onClick={go} disabled={busy}
            className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-brand-400 disabled:opacity-50">
            {busy ? "…" : t("merge.now")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
