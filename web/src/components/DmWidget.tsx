import { useEffect, useState } from "react";
import { api, ChatRoom, DmUser } from "../lib/api";
import { Avatar } from "./ui";
import { BellIcon, ChatBubbleIcon, CloseIcon, LocationIcon } from "./Icons";
import { Chat } from "./Chat";
import { useT } from "../i18n";

// Zentrales Chat-Overlay (rechts unten, feste Position). Zwei Tabs:
//   „Meine"      – eigene DMs + Spot-Chats (Personensuche startet DMs)
//   „Spot-Chats" – alle Spot-Chats zum Stöbern, aktivste zuerst (Suche filtert Spots)
// Von überall per openChatOverlay(scope,label) direkt in einen Scope springbar (Event unten).
type Active = { scope: string; name: string | null; otherId: number; avatar: string | null; blocked: boolean };
type SpotRow = { scope: string; label: string; url: string; messages: number };

// Chat-Overlay von außerhalb öffnen und direkt in einen Scope springen (z. B. Spot-Chat-Button).
export function openChatOverlay(scope: string, label: string) {
  window.dispatchEvent(new CustomEvent("pumpfoil:open-chat", { detail: { scope, label } }));
}

export function DmWidget() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"mine" | "spots">("mine");
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [allSpots, setAllSpots] = useState<SpotRow[]>([]);
  const [active, setActive] = useState<Active | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<DmUser[]>([]);
  const [blocked, setBlocked] = useState<Set<number>>(new Set());
  const [blockedUsers, setBlockedUsers] = useState<DmUser[]>([]);   // zum Entblocken (Namen/Avatare)
  const [showBlocked, setShowBlocked] = useState(false);

  // Ungelesen-Zähler über alle Räume (DMs + Spot-Chats, in denen man drin ist).
  const unreadTotal = rooms.reduce((s, r) => s + r.unread, 0);

  const loadRooms = () => api.chatRooms().then(setRooms).catch(() => {});
  useEffect(() => { loadRooms(); const iv = setInterval(loadRooms, 15000); return () => clearInterval(iv); }, []);
  useEffect(() => {
    if (!open) return;
    loadRooms();
    api.chatBlocks().then((b) => { setBlocked(new Set(b.map((x) => x.id))); setBlockedUsers(b); }).catch(() => {});
    api.chatAllSpots().then(setAllSpots).catch(() => {});
  }, [open]);

  // Von außen öffnen (Spot-Chat-Buttons, „Meine Chats" auf Home): direkt in den Scope springen.
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<{ scope: string; label?: string }>).detail;
      if (!d?.scope) return;
      setOpen(true);
      setActive({ scope: d.scope, name: d.label ?? "", otherId: 0, avatar: null, blocked: false });
    };
    window.addEventListener("pumpfoil:open-chat", h);
    return () => window.removeEventListener("pumpfoil:open-chat", h);
  }, []);

  // Globale Suche (unabhängig vom Tab): findet Personen (→ DM) UND Spots. Personensuche
  // nur Anzeigename, leicht entprellt; Spots werden clientseitig gefiltert (spotsShown).
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

  const openScope = (scope: string, label: string) =>
    setActive({ scope, name: label, otherId: 0, avatar: null, blocked: false });

  const back = () => window.history.back();   // Chat → Liste (popstate schließt die Ebene)
  const switchTab = (tb: "mine" | "spots") => { setTab(tb); setQ(""); setResults([]); };

  // Mobile: Zurück-/Swipe-Geste schließt das Chat-Overlay wie ein Popup — erst den offenen
  // Chat (zurück zur Liste), dann das Panel; erst danach verlässt man die Seite. Ein
  // History-Marker JE OFFENER EBENE, gesetzt beim Öffnen (Tiefe in state.__ov). popstate
  // gleicht die UI-Tiefe an die History-Position an; alle Schließen-Aktionen laufen über die
  // History (history.back/go), damit popstate die einzige Schließ-Quelle bleibt.
  const chatOpen = open && !!active;
  const closeOverlay = () => window.history.go(-(active ? 2 : 1));

  useEffect(() => {
    if (!open) return;
    window.history.pushState({ __ov: 1 }, "");
    const onPop = () => {
      const depth = (window.history.state as { __ov?: number } | null)?.__ov ?? 0;
      if (depth < 2) { setActive(null); loadRooms(); }
      if (depth < 1) setOpen(false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!chatOpen) return;
    window.history.pushState({ __ov: 2 }, "");
  }, [chatOpen]);

  const toggleBlock = () => {
    if (!active || !active.otherId) return;
    const oid = active.otherId;
    if (active.blocked) {
      api.chatUnblock(oid).then(() => {
        setActive((a) => a && { ...a, blocked: false });
        setBlocked((s) => { const n = new Set(s); n.delete(oid); return n; });
        setBlockedUsers((l) => l.filter((x) => x.id !== oid));
      }).catch(() => {});
    } else if (confirm(t("dm.blockConfirm", { name: active.name || "?" }))) {
      api.chatBlock(oid).then(() => {
        setActive((a) => a && { ...a, blocked: true });
        setBlocked((s) => new Set(s).add(oid));
        setBlockedUsers((l) => l.some((x) => x.id === oid) ? l : [...l, { id: oid, display_name: active.name, avatar_url: active.avatar }]);
      }).catch(() => {});
    }
  };

  // Aus der „Blockiert"-Liste unten entblocken (ohne den Chat öffnen zu müssen).
  const unblockUser = (u: DmUser) =>
    api.chatUnblock(u.id).then(() => {
      setBlocked((s) => { const n = new Set(s); n.delete(u.id); return n; });
      setBlockedUsers((l) => l.filter((x) => x.id !== u.id));
    }).catch(() => {});

  // Spot-Chats: aktivste (meiste Nachrichten) zuerst; Suche filtert nach Spotname.
  const spotsSorted = [...allSpots].sort((a, b) => b.messages - a.messages);
  const spotsShown = q.trim()
    ? spotsSorted.filter((s) => s.label.toLowerCase().includes(q.trim().toLowerCase()))
    : spotsSorted;
  const joined = new Set(rooms.map((r) => r.scope));               // Spots, in denen man drin ist
  const subscribed = new Set(rooms.filter((r) => r.push).map((r) => r.scope));   // abonniert → Glocke
  // Blockierte DM-Chats gar nicht in „Meine" listen (nur unten in der Blockiert-Liste).
  const visibleRooms = rooms.filter((r) => !(r.kind === "dm" && r.other && blocked.has(r.other.id)));

  const userRow = (u: DmUser) => (
    <button key={`u${u.id}`} onClick={() => openDm(u.id)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-800">
      <Avatar name={u.display_name} url={u.avatar_url} size={28} />
      <span className="truncate text-sm text-slate-100">{u.display_name}</span>
    </button>
  );
  const spotRow = (s: SpotRow) => (
    <button key={s.scope} onClick={() => openScope(s.scope, s.label)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-800">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800"><LocationIcon className="h-5 w-5 text-brand-400" /></span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-100">{s.label}</span>
      {subscribed.has(s.scope)
        ? <BellIcon className="h-3.5 w-3.5 shrink-0 text-brand-400" />
        : joined.has(s.scope) && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-400" title={t("dm.tabMine")} />}
      <span className="shrink-0 rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">{s.messages}</span>
    </button>
  );

  return (
    <>
      <button onClick={() => (open ? closeOverlay() : setOpen(true))} aria-label={t("dm.title")} title={t("dm.title")}
        className="fixed bottom-20 right-4 z-[1490] flex h-12 w-12 items-center justify-center rounded-full bg-brand-500 text-slate-950 shadow-lg transition-colors hover:bg-brand-400 md:bottom-4">
        <ChatBubbleIcon className="h-6 w-6" />
        {unreadTotal > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{unreadTotal}</span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[1550] flex flex-col overflow-hidden border-slate-700 bg-slate-900 shadow-2xl md:inset-auto md:bottom-20 md:right-4 md:h-[66vh] md:w-[350px] md:rounded-2xl md:border"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div
            className="flex items-center gap-2 border-b border-slate-800 bg-slate-950/60 px-3 py-2"
            style={{ paddingTop: "calc(0.5rem + env(safe-area-inset-top))" }}
          >
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
              // Kein Titel — die Tabs beschriften den Inhalt selbst (spart Höhe im schmalen Popup).
              <div className="flex flex-1 gap-0.5 rounded-lg bg-slate-800 p-0.5 text-xs font-medium">
                <button onClick={() => switchTab("mine")}
                  className={`flex-1 rounded-md px-2 py-1 ${tab === "mine" ? "bg-slate-700 text-slate-100" : "text-slate-400 hover:text-slate-200"}`}>{t("dm.tabMine")}</button>
                <button onClick={() => switchTab("spots")}
                  className={`flex-1 rounded-md px-2 py-1 ${tab === "spots" ? "bg-slate-700 text-slate-100" : "text-slate-400 hover:text-slate-200"}`}>{t("dm.tabSpots")}</button>
              </div>
            )}
            <button onClick={closeOverlay} aria-label="Close" className="text-slate-400 hover:text-slate-200"><CloseIcon className="h-4 w-4" /></button>
          </div>

          {active ? (
            <div className="flex min-h-0 flex-1 flex-col p-3">
              {active.blocked && <p className="mb-2 rounded-lg bg-red-500/10 px-2 py-1 text-xs text-red-300">{t("dm.blockedNote")}</p>}
              <div className="min-h-0 flex-1"><Chat scope={active.scope} fill /></div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="p-2">
                <input value={q} onChange={(e) => setQ(e.target.value)}
                  placeholder={t("dm.searchAll")}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {q.trim() ? (
                  // Globale Suche: Personen + Spots kombiniert, egal welcher Tab aktiv ist.
                  <>
                    {results.length > 0 && (
                      <div className="border-b border-slate-800 pb-1">
                        <p className="px-3 py-1 text-[10px] uppercase tracking-wide text-slate-500">{t("dm.searchResults")}</p>
                        {results.map(userRow)}
                      </div>
                    )}
                    {spotsShown.length > 0 && (
                      <div className="pb-1">
                        <p className="px-3 py-1 text-[10px] uppercase tracking-wide text-slate-500">{t("chat.allSpots")}</p>
                        {spotsShown.map(spotRow)}
                      </div>
                    )}
                    {results.length === 0 && spotsShown.length === 0 && <p className="p-6 text-center text-sm text-slate-400">{t("dm.noResults")}</p>}
                  </>
                ) : tab === "mine" ? (
                  <>
                    {visibleRooms.length === 0 && <p className="p-6 text-center text-sm text-slate-400">{t("dm.empty")}</p>}
                    {visibleRooms.map((r) => (
                      <button key={r.scope} onClick={() => openRoom(r)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-800">
                        {r.kind === "dm"
                          ? <Avatar name={r.other?.name} url={r.other?.avatar_url} size={36} />
                          : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800"><LocationIcon className="h-5 w-5 text-brand-400" /></span>}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-slate-100">{r.other?.name || r.label}</span>
                            <span className="ml-auto flex shrink-0 items-center gap-1">
                              {subscribed.has(r.scope) && <BellIcon className="h-3.5 w-3.5 text-brand-400" />}
                              {r.unread > 0 && <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{r.unread}</span>}
                            </span>
                          </div>
                          <div className="truncate text-xs text-slate-400">{r.last_text}</div>
                        </div>
                      </button>
                    ))}
                    {/* Blockierte: aus der Liste raus, hier ausklappbar zum Entblocken. */}
                    {blockedUsers.length > 0 && (
                      <div className="border-t border-slate-800 mt-1">
                        <button onClick={() => setShowBlocked((v) => !v)}
                          className="flex w-full items-center gap-1 px-3 py-2 text-left text-xs text-slate-500 hover:text-slate-300">
                          <span>{showBlocked ? "▾" : "▸"}</span>{t("dm.blockedList")} ({blockedUsers.length})
                        </button>
                        {showBlocked && blockedUsers.map((u) => (
                          <div key={u.id} className="flex items-center gap-2 px-3 py-1.5">
                            <Avatar name={u.display_name} url={u.avatar_url} size={28} />
                            <span className="min-w-0 flex-1 truncate text-sm text-slate-300">{u.display_name}</span>
                            <button onClick={() => unblockUser(u)} className="shrink-0 text-xs text-emerald-400 hover:text-emerald-300">{t("dm.unblock")}</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {spotsShown.length === 0 && <p className="p-6 text-center text-sm text-slate-400">{t("chat.noActive")}</p>}
                    {spotsShown.map(spotRow)}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
