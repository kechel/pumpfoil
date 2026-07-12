import { useEffect, useState } from "react";
import { api, type DmUser, type Transfer } from "../lib/api";
import { useT } from "../i18n";
import { Avatar } from "./ui";
import { SendIcon } from "./Icons";
import { useCloseOnBack } from "../lib/useCloseOnBack";

// „Session übertragen an …" — Besitzer gibt eine Session an einen anderen Nutzer weiter
// (z. B. Uhr verliehen). Zeigt sonst den Status einer ausstehenden Übertragung + Zurücknehmen.
export function TransferPicker({ sessionId }: { sessionId: number }) {
  const t = useT();
  const [pending, setPending] = useState<Transfer | null>(null);
  const [open, setOpen] = useState(false);
  const [friends, setFriends] = useState<DmUser[]>([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<DmUser[]>([]);
  const [busy, setBusy] = useState(false);
  useCloseOnBack(open, () => setOpen(false));

  useEffect(() => {
    api.transferForSession(sessionId).then((r) => {
      if (r && "role" in r && r.role === "sender") setPending(r as Transfer);
    }).catch(() => {});
  }, [sessionId]);

  useEffect(() => {
    if (!open) return;
    api.transferFriends().then(setFriends).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    const id = setTimeout(() => api.chatSearchUsers(q.trim()).then(setResults).catch(() => {}), 250);
    return () => clearTimeout(id);
  }, [q]);

  function send(u: DmUser) {
    if (busy) return;
    if (!confirm(t("transfer.confirmSend", { name: u.display_name || "?" }))) return;
    setBusy(true);
    api.transferInitiate(sessionId, u.id)
      .then((r) => { setPending(r); setOpen(false); setQ(""); setResults([]); })
      .catch((e) => alert(String(e)))
      .finally(() => setBusy(false));
  }

  function cancel() {
    if (!pending) return;
    api.transferCancel(pending.id).then(() => setPending(null)).catch((e) => alert(String(e)));
  }

  if (pending) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-400 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
        <span>{t("transfer.pending", { name: pending.other?.display_name || "?" })}</span>
        <button onClick={cancel} className="rounded-md bg-amber-500/20 px-2 py-1 text-amber-800 hover:bg-amber-500/30 dark:text-amber-200">{t("transfer.cancel")}</button>
      </div>
    );
  }

  const list = q.trim() ? results : friends;
  return (
    <div className="flex">
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
      >
        <SendIcon className="h-4 w-4 text-brand-400" /> {t("transfer.action")}
      </button>

      {open && (
        <div className="fixed inset-0 z-[3000] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-sm rounded-t-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl sm:rounded-2xl"
            style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">{t("transfer.title")}</h3>
              <button onClick={() => setOpen(false)} aria-label="×" className="px-1 text-lg text-slate-400 hover:text-slate-200">×</button>
            </div>
            <p className="mb-3 text-xs text-slate-400">{t("transfer.desc")}</p>
            <input
              autoFocus value={q} onChange={(e) => setQ(e.target.value)}
              placeholder={t("transfer.searchAll")}
              className="mb-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
            />
            {!q.trim() && friends.length > 0 && (
              <p className="px-1 py-1 text-[10px] uppercase tracking-wide text-slate-500">{t("transfer.friends")}</p>
            )}
            <div className="max-h-72 overflow-y-auto">
              {list.length === 0
                ? <p className="px-1 py-3 text-center text-xs text-slate-500">{t("transfer.noResults")}</p>
                : list.map((u) => (
                  <button key={u.id} onClick={() => send(u)} disabled={busy}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-slate-800 disabled:opacity-50">
                    <Avatar name={u.display_name} url={u.avatar_url} size={28} />
                    <span className="truncate text-sm text-slate-100">{u.display_name || "?"}</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
