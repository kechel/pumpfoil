import { useEffect, useRef, useState } from "react";
import { api, ChatMsg } from "../lib/api";
import { Avatar } from "./ui";
import { useT } from "../i18n";

// URLs im Text klickbar machen (öffnen in neuem Tab).
function linkify(text: string) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((p, i) =>
    /^https?:\/\//.test(p)
      ? <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="text-brand-300 underline break-all">{p}</a>
      : <span key={i}>{p}</span>
  );
}

function hhmm(s: string | null) {
  return s ? new Date(s).toLocaleString(undefined, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
}

// Gemeinsame Chat-/Diskussions-Komponente. scope = "session:<id>" | "spot:<name>".
export function Chat({ scope }: { scope: string }) {
  const t = useT();
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [push, setPush] = useState(false);
  const lastId = useRef(0);

  useEffect(() => { api.getProfile().then((p) => setIsAdmin(!!p.is_admin)).catch(() => {}); }, []);
  useEffect(() => { api.chatRoomState(scope).then((s) => setPush(s.push)).catch(() => {}); }, [scope]);

  // Lesestand serverseitig setzen (für Unread auf der Startseite).
  function markRead(id: number) {
    if (id > 0) api.chatMarkRead(scope, id).catch(() => {});
  }

  useEffect(() => {
    let alive = true;
    const poll = () => api.chatList(scope, lastId.current)
      .then((rows) => {
        if (!alive || rows.length === 0) return;
        lastId.current = Math.max(lastId.current, ...rows.map((r) => r.id));
        setMsgs((prev) => [...prev, ...rows]);
        markRead(lastId.current);
      })
      .catch(() => {});
    setMsgs([]); lastId.current = 0; poll();
    const iv = setInterval(poll, 10000);
    return () => { alive = false; clearInterval(iv); };
  }, [scope]);

  function toggleSub() {
    const next = !push;
    setPush(next);
    api.chatSubscribe(scope, next).catch(() => setPush(!next));
  }
  function leave() {
    if (!confirm(t("chat.leaveConfirm"))) return;
    api.chatLeave(scope).then(() => { setPush(false); alert(t("chat.leftDone")); }).catch(() => {});
  }

  function send() {
    const v = text.trim();
    if (!v || busy) return;
    setBusy(true);
    api.chatPost(scope, v)
      .then((m) => {
        setText("");
        if (m.id > lastId.current) { lastId.current = m.id; setMsgs((prev) => [...prev, m]); }
      })
      .finally(() => setBusy(false));
  }
  function report(id: number) {
    if (!confirm(t("chat.reportConfirm"))) return;
    api.chatReport(id).then(() => setMsgs((prev) => prev.map((m) => m.id === id ? { ...m, report_count: m.report_count + 1 } : m))).catch(() => {});
  }
  function toggleHide(m: ChatMsg) {
    api.chatHide(m.id, !m.hidden).then((r) => setMsgs((prev) => prev.map((x) => x.id === m.id ? { ...x, hidden: r.hidden } : x))).catch(() => {});
  }
  function setReadonly(m: ChatMsg) {
    if (!confirm(t("chat.readonlyConfirm", { name: m.name || "?" }))) return;
    api.chatSetReadonly(m.user_id, true).catch(() => {});
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-end gap-3 text-xs">
        <button onClick={toggleSub} className={push ? "text-brand-300" : "text-slate-500 hover:text-slate-300"} title={t("chat.subscribe")}>
          {push ? "🔔" : "🔕"} {push ? t("chat.subscribed") : t("chat.subscribe")}
        </button>
        <button onClick={leave} className="text-slate-500 hover:text-red-400" title={t("chat.leave")}>{t("chat.leave")}</button>
      </div>
      <div className="mb-3 max-h-96 space-y-3 overflow-y-auto">
        {msgs.length === 0 && <p className="text-sm text-slate-400">{t("chat.empty")}</p>}
        {msgs.map((m) => (
          <div key={m.id} className={`flex gap-2 ${m.hidden ? "opacity-50" : ""}`}>
            <Avatar name={m.name} url={m.avatar_url} size={32} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold text-slate-200">{m.name || "—"}</span>
                <span className="text-[10px] text-slate-500">{hhmm(m.created_at)}</span>
                <span className="ml-auto flex items-center gap-2">
                  {isAdmin && m.report_count > 0 && (
                    <span className="text-[10px] text-amber-400" title={t("chat.reports")}>⚑{m.report_count}</span>
                  )}
                  {isAdmin && (
                    <>
                      <button onClick={() => toggleHide(m)} className="text-xs text-slate-500 hover:text-brand-300" title={m.hidden ? t("chat.unhide") : t("chat.hide")}>{m.hidden ? "👁" : "🚫"}</button>
                      {!m.mine && (
                        <button onClick={() => setReadonly(m)} className="text-xs text-slate-500 hover:text-red-400" title={t("chat.readonly")}>🔇</button>
                      )}
                    </>
                  )}
                  {!m.mine && (
                    <button onClick={() => report(m.id)} title={t("chat.report")} className="text-xs text-slate-500 hover:text-red-400">⚠</button>
                  )}
                </span>
              </div>
              <div className="whitespace-pre-wrap break-words text-sm text-slate-100">{linkify(m.text)}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          placeholder={t("chat.placeholder")}
          maxLength={2000}
          className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
        />
        <button onClick={send} disabled={busy || !text.trim()}
          className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-brand-400 disabled:opacity-50">
          {t("chat.send")}
        </button>
      </div>
    </div>
  );
}
