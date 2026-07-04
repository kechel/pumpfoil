import { useEffect, useRef, useState } from "react";
import { api, ChatMsg } from "../lib/api";
import { Avatar, NewBadge } from "./ui";
import { FlagIcon, BellIcon, BellOffIcon, EyeIcon, EyeOffIcon, MuteIcon, EditIcon, TrashIcon, CloseIcon } from "./Icons";
import { useT } from "../i18n";
import { MicButton } from "./MicButton";

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
// fill=true: füllt die volle Höhe des Elternelements (für die /chat-Fullscreen-Ansicht).
export function Chat({ scope, fill = false }: { scope: string; fill?: boolean }) {
  const t = useT();
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [push, setPush] = useState(false);
  const [hasMore, setHasMore] = useState(false);   // gibt es ältere (nachladbare) Nachrichten?
  const [capped, setCapped] = useState(false);     // 100er-Limit erreicht: ältere bleiben ausgeblendet
  const [loadingMore, setLoadingMore] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);   // id der Nachricht, die gerade bearbeitet wird
  const [menuFor, setMenuFor] = useState<number | null>(null);    // per Long-Press geöffnete Aktionen (Bearbeiten/Löschen)
  const inputRef = useRef<HTMLInputElement>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastId = useRef(0);          // höchste geladene id (für Polling)
  const firstId = useRef(0);         // niedrigste geladene id (für Hochscroll-Nachladen)
  const scrollRef = useRef<HTMLDivElement>(null);
  const PAGE = 30;
  const CAP = 100;   // Anzeige-Limit: nur die letzten 100 Nachrichten; ältere bleiben serverseitig, werden aber nicht mehr angezeigt.

  useEffect(() => { api.getProfile().then((p) => setIsAdmin(!!p.is_admin)).catch(() => {}); }, []);
  useEffect(() => { api.chatRoomState(scope).then((s) => setPush(s.push)).catch(() => {}); }, [scope]);

  // Lesestand serverseitig setzen (für Unread auf der Startseite).
  function markRead(id: number) {
    if (id > 0) api.chatMarkRead(scope, id).catch(() => {});
  }

  const atBottom = () => {
    const el = scrollRef.current;
    return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };
  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  // Initial: die neuesten PAGE Nachrichten, ans untere Ende scrollen.
  useEffect(() => {
    let alive = true;
    api.chatLatest(scope, PAGE).then((rows) => {
      if (!alive) return;
      setMsgs(rows);
      firstId.current = rows.length ? rows[0].id : 0;
      lastId.current = rows.length ? rows[rows.length - 1].id : 0;
      setHasMore(rows.length === PAGE);
      markRead(lastId.current);
      requestAnimationFrame(scrollToBottom);
    }).catch(() => {});
    // Polling für neue Nachrichten.
    const poll = () => api.chatList(scope, lastId.current).then((rows) => {
      if (!alive || rows.length === 0) return;
      const stick = atBottom();
      lastId.current = Math.max(lastId.current, ...rows.map((r) => r.id));
      setMsgs((prev) => {
        const next = [...prev, ...rows];
        if (next.length > CAP) { setCapped(true); return next.slice(next.length - CAP); }  // nur letzte 100
        return next;
      });
      markRead(lastId.current);
      if (stick) requestAnimationFrame(scrollToBottom);
    }).catch(() => {});
    const iv = setInterval(poll, 10000);
    return () => { alive = false; clearInterval(iv); };
  }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ältere Nachrichten beim Hochscrollen nachladen (Scrollposition halten).
  function loadOlder() {
    if (loadingMore || !hasMore || !firstId.current) return;
    // 100er-Anzeige-Limit: nicht über CAP hinaus nachladen (ältere bleiben ausgeblendet).
    const remaining = CAP - msgs.length;
    if (remaining <= 0) { setHasMore(false); setCapped(true); return; }
    setLoadingMore(true);
    const el = scrollRef.current;
    const prevH = el ? el.scrollHeight : 0;
    api.chatBefore(scope, firstId.current, Math.min(PAGE, remaining)).then((rows) => {
      if (rows.length) {
        firstId.current = rows[0].id;
        setMsgs((prev) => [...rows, ...prev]);
        const reachedCap = msgs.length + rows.length >= CAP;
        setCapped(reachedCap);
        setHasMore(rows.length === PAGE && !reachedCap);
        requestAnimationFrame(() => {
          const e = scrollRef.current;
          if (e) e.scrollTop = e.scrollHeight - prevH;  // Position beibehalten
        });
      } else {
        setHasMore(false);
      }
    }).catch(() => {}).finally(() => setLoadingMore(false));
  }
  function onScroll() {
    if (scrollRef.current && scrollRef.current.scrollTop < 40) loadOlder();
  }

  function toggleSub() {
    const next = !push;
    setPush(next);
    api.chatSubscribe(scope, next).catch(() => setPush(!next));
  }
  function leave() {
    if (!confirm(t("chat.leaveConfirm"))) return;
    api.chatLeave(scope).then(() => { setPush(false); alert(t("chat.leftDone")); }).catch(() => {});
  }

  // Eigene Nachricht bearbeiten/löschen — nur innerhalb 1 h (Server prüft ebenfalls).
  const canEdit = (m: ChatMsg) =>
    m.mine && !!m.created_at && Date.now() - new Date(m.created_at).getTime() < 3600_000;

  function openMenu(m: ChatMsg) { if (canEdit(m)) setMenuFor((cur) => (cur === m.id ? null : m.id)); }
  function pressStart(m: ChatMsg) {
    if (!canEdit(m)) return;
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => setMenuFor(m.id), 500);   // Long-Press ~0,5 s
  }
  function pressCancel() { if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; } }

  function startEdit(m: ChatMsg) {
    setEditing(m.id); setText(m.text); setMenuFor(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }
  function cancelEdit() { setEditing(null); setText(""); }
  function saveEdit() {
    const v = text.trim();
    if (editing == null || !v || busy) return;
    setBusy(true);
    api.chatEdit(editing, v)
      .then((r) => { setMsgs((prev) => prev.map((x) => x.id === editing ? { ...x, text: r.text } : x)); setEditing(null); setText(""); })
      .catch((e) => alert(String(e)))
      .finally(() => setBusy(false));
  }
  function del(m: ChatMsg) {
    setMenuFor(null);
    if (!confirm(t("chat.deleteConfirm"))) return;
    api.chatDelete(m.id)
      .then(() => setMsgs((prev) => prev.filter((x) => x.id !== m.id)))
      .catch((e) => alert(String(e)));
  }

  function send() { if (editing != null) { saveEdit(); return; } sendText(text); }
  function sendText(raw: string) {
    const v = raw.trim();
    if (!v || busy) return;
    setBusy(true);
    api.chatPost(scope, v)
      .then((m) => {
        setText("");
        if (m.id > lastId.current) {
          lastId.current = m.id;
          setMsgs((prev) => {
            const next = [...prev, m];
            if (next.length > CAP) { setCapped(true); return next.slice(next.length - CAP); }
            return next;
          });
        }
        requestAnimationFrame(scrollToBottom);
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
    <div className={fill ? "flex h-full flex-col" : ""}>
      <div className="mb-2 flex items-center justify-end gap-3 text-xs">
        <button onClick={toggleSub} className={`flex items-center gap-1 ${push ? "text-brand-300" : "text-slate-500 hover:text-slate-300"}`} title={t("chat.subscribe")}>
          {push ? <BellIcon className="h-3.5 w-3.5" /> : <BellOffIcon className="h-3.5 w-3.5" />} {push ? t("chat.subscribed") : t("chat.subscribe")}
        </button>
        <button onClick={leave} className="text-slate-500 hover:text-red-400" title={t("chat.leave")}>{t("chat.leave")}</button>
      </div>
      <div ref={scrollRef} onScroll={onScroll} className={`mb-3 space-y-3 overflow-y-auto ${fill ? "min-h-0 flex-1" : "h-96"}`}>
        {loadingMore && <p className="py-1 text-center text-xs text-slate-500">…</p>}
        {capped && <p className="py-1 text-center text-[10px] text-slate-600">{t("chat.capped")}</p>}
        {!capped && !hasMore && msgs.length > PAGE && <p className="py-1 text-center text-[10px] text-slate-600">{t("chat.start")}</p>}
        {msgs.length === 0 && <p className="text-sm text-slate-400">{t("chat.empty")}</p>}
        {msgs.map((m) => (
          <div key={m.id} className={`flex items-start gap-2 ${m.hidden ? "opacity-50" : ""}`}
            onContextMenu={(e) => { if (canEdit(m)) { e.preventDefault(); openMenu(m); } }}
            onTouchStart={() => pressStart(m)} onTouchEnd={pressCancel} onTouchMove={pressCancel}>
            {menuFor === m.id && canEdit(m) && (
              <button onClick={() => startEdit(m)} title={t("chat.edit")} aria-label={t("chat.edit")}
                className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-xl bg-slate-800 text-brand-300 hover:bg-slate-700">
                <EditIcon className="h-5 w-5" />
              </button>
            )}
            <Avatar name={m.name} url={m.avatar_url} size={32} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold text-slate-200">{m.name || "—"}</span>
                {m.author_new && <NewBadge />}
                <span className="text-[10px] text-slate-500">{hhmm(m.created_at)}</span>
                <span className="ml-auto flex items-center gap-2">
                  {isAdmin && m.report_count > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-400" title={t("chat.reports")}><FlagIcon className="h-3 w-3" />{m.report_count}</span>
                  )}
                  {isAdmin && (
                    <>
                      <button onClick={() => toggleHide(m)} className="text-slate-500 hover:text-brand-300" title={m.hidden ? t("chat.unhide") : t("chat.hide")}>{m.hidden ? <EyeIcon className="h-3.5 w-3.5" /> : <EyeOffIcon className="h-3.5 w-3.5" />}</button>
                      {!m.mine && (
                        <button onClick={() => setReadonly(m)} className="text-slate-500 hover:text-red-400" title={t("chat.readonly")}><MuteIcon className="h-3.5 w-3.5" /></button>
                      )}
                    </>
                  )}
                  {!m.mine && (
                    <button onClick={() => report(m.id)} title={t("chat.report")} className="text-slate-500 hover:text-red-400"><FlagIcon className="h-3.5 w-3.5" /></button>
                  )}
                </span>
              </div>
              <div className="whitespace-pre-wrap break-words text-sm text-slate-100">{linkify(m.text)}</div>
            </div>
            {menuFor === m.id && canEdit(m) && (
              <button onClick={() => del(m)} title={t("chat.delete")} aria-label={t("chat.delete")}
                className="flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-xl bg-slate-800 text-red-400 hover:bg-slate-700">
                <TrashIcon className="h-5 w-5" />
              </button>
            )}
          </div>
        ))}
      </div>
      {editing != null && (
        <div className="mb-1 flex items-center justify-between text-xs text-brand-300">
          <span>{t("chat.editing")}</span>
          <button onClick={cancelEdit} className="text-slate-400 hover:text-slate-200" title={t("chat.editCancel")}><CloseIcon className="h-3.5 w-3.5" /></button>
        </div>
      )}
      <div className="flex gap-2">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); if (e.key === "Escape" && editing != null) cancelEdit(); }}
          placeholder={t("chat.placeholder")}
          maxLength={2000}
          className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
        />
        {editing == null && <MicButton value={text} onChange={(v) => setText(v)} onSubmit={(v) => sendText(v)} disabled={busy} />}
        <button onClick={send} disabled={busy || !text.trim()}
          className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-brand-400 disabled:opacity-50">
          {editing != null ? t("chat.save") : t("chat.send")}
        </button>
      </div>
      <p className="mt-1.5 text-[10px] leading-snug text-slate-500">{t("chat.editHint")}</p>
    </div>
  );
}
