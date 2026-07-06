import { useEffect, useState } from "react";
import { api, ChatRoom, DmUser } from "../lib/api";
import { Avatar } from "./ui";
import { ChatBubbleIcon, CloseIcon, LocationIcon } from "./Icons";
import { Chat } from "./Chat";
import { useT } from "../i18n";

// Floating 1:1-Direktnachrichten-Widget (rechts unten, feste Position). Nur DMs —
// keine Spot-/Session-Chats (die laufen weiter über /chat + Home „Meine Chats").
type Active = { scope: string; name: string | null; otherId: number; avatar: string | null; blocked: boolean };

export function DmWidget() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [active, setActive] = useState<Active | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<DmUser[]>([]);
  const [blocked, setBlocked] = useState<Set<number>>(new Set());

  // Alle offenen Räume: Direktnachrichten + Spot-Chats (Session-Chats sind serverseitig aus).
  const unreadTotal = rooms.reduce((s, r) => s + r.unread, 0);

  const loadRooms = () => api.chatRooms().then(setRooms).catch(() => {});
  useEffect(() => { loadRooms(); const iv = setInterval(loadRooms, 15000); return () => clearInterval(iv); }, []);
  useEffect(() => {
    if (!open) return;
    loadRooms();
    api.chatBlocks().then((b) => setBlocked(new Set(b.map((x) => x.id)))).catch(() => {});
  }, [open]);

  // Nutzersuche (nur Anzeigename), leicht entprellt.
  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    const id = setTimeout(() => api.chatSearchUsers(q.trim()).then(setResults).catch(() => {}), 250);
    return () => clearTimeout(id);
  }, [q]);

  const openDm = (userId: number) =>
    api.chatDmOpen(userId).then((r) => {
      setActive({ scope: r.scope, name: r.other.name, otherId: r.other.id, avatar: r.other.avatar_url, blocked: r.blocked });
      setQ(""); setResults([]);
    }).catch(() => {});

  const openRoom = (r: ChatRoom) =>
    setActive({ scope: r.scope, name: r.other?.name ?? r.label, otherId: r.other?.id ?? 0,
                avatar: r.other?.avatar_url ?? null, blocked: r.other ? blocked.has(r.other.id) : false });

  const back = () => { setActive(null); loadRooms(); };

  const toggleBlock = () => {
    if (!active || !active.otherId) return;
    const oid = active.otherId;
    if (active.blocked) {
      api.chatUnblock(oid).then(() => {
        setActive((a) => a && { ...a, blocked: false });
        setBlocked((s) => { const n = new Set(s); n.delete(oid); return n; });
      }).catch(() => {});
    } else if (confirm(t("dm.blockConfirm", { name: active.name || "?" }))) {
      api.chatBlock(oid).then(() => {
        setActive((a) => a && { ...a, blocked: true });
        setBlocked((s) => new Set(s).add(oid));
      }).catch(() => {});
    }
  };

  return (
    <>
      <button onClick={() => setOpen((o) => !o)} aria-label={t("dm.title")} title={t("dm.title")}
        className="fixed bottom-20 right-4 z-[1490] flex h-12 w-12 items-center justify-center rounded-full bg-brand-500 text-slate-950 shadow-lg transition-colors hover:bg-brand-400 md:bottom-4">
        <ChatBubbleIcon className="h-6 w-6" />
        {unreadTotal > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{unreadTotal}</span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[1550] flex flex-col overflow-hidden border-slate-700 bg-slate-900 shadow-2xl md:inset-auto md:bottom-20 md:right-4 md:h-[66vh] md:w-[350px] md:rounded-2xl md:border">
          <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-950/60 px-3 py-2">
            {active ? (
              <>
                <button onClick={back} aria-label={t("dm.back")} className="px-1 text-lg text-slate-400 hover:text-slate-200">←</button>
                <Avatar name={active.name} url={active.avatar} size={28} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100">{active.name || "—"}</span>
                {active.otherId > 0 && (
                  <button onClick={toggleBlock} className={`text-xs ${active.blocked ? "text-emerald-400 hover:text-emerald-300" : "text-slate-400 hover:text-red-400"}`}>
                    {active.blocked ? t("dm.unblock") : t("dm.block")}
                  </button>
                )}
              </>
            ) : (
              <span className="flex-1 text-sm font-semibold text-slate-100">{t("dm.title")}</span>
            )}
            <button onClick={() => setOpen(false)} aria-label="Close" className="text-slate-400 hover:text-slate-200"><CloseIcon className="h-4 w-4" /></button>
          </div>

          {active ? (
            <div className="flex min-h-0 flex-1 flex-col p-3">
              {active.blocked && <p className="mb-2 rounded-lg bg-red-500/10 px-2 py-1 text-xs text-red-300">{t("dm.blockedNote")}</p>}
              <div className="min-h-0 flex-1"><Chat scope={active.scope} fill /></div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="p-2">
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("dm.searchPlaceholder")}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {results.length > 0 && (
                  <div className="border-b border-slate-800 pb-1">
                    <p className="px-3 py-1 text-[10px] uppercase tracking-wide text-slate-500">{t("dm.searchResults")}</p>
                    {results.map((u) => (
                      <button key={u.id} onClick={() => openDm(u.id)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-800">
                        <Avatar name={u.display_name} url={u.avatar_url} size={28} />
                        <span className="truncate text-sm text-slate-100">{u.display_name}</span>
                      </button>
                    ))}
                  </div>
                )}
                {rooms.length === 0 && !q && <p className="p-6 text-center text-sm text-slate-400">{t("dm.empty")}</p>}
                {rooms.map((r) => (
                  <button key={r.scope} onClick={() => openRoom(r)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-800">
                    {r.kind === "dm"
                      ? <Avatar name={r.other?.name} url={r.other?.avatar_url} size={36} />
                      : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800"><LocationIcon className="h-5 w-5 text-brand-400" /></span>}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-slate-100">{r.other?.name || r.label}</span>
                        {r.unread > 0 && <span className="ml-auto shrink-0 rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{r.unread}</span>}
                      </div>
                      <div className="truncate text-xs text-slate-400">{r.last_text}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
