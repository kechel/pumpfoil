import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ActiveRoom, ChatRoom } from "../lib/api";
import { Card } from "../components/ui";
import { Chat } from "../components/Chat";
import { ChevronIcon, LocationIcon, ChatBubbleIcon } from "../components/Icons";
import { useT } from "../i18n";

// Chat-Hub: aktiver Chat oben (scope aus ?scope=, sonst Homespot), darunter
// „Meine Chats" + die aktivsten fremden Chats der letzten 48 h.
export default function ChatPage() {
  const t = useT();
  const navigate = useNavigate();
  // Echtes Zurück (dahin, wo man herkam); Fallback /home, wenn keine In-App-History.
  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate("/home");
  };
  const [sp] = useSearchParams();
  const [scope, setScope] = useState<string | null>(sp.get("scope"));
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [active, setActive] = useState<ActiveRoom[]>([]);
  const [sessionLabel, setSessionLabel] = useState("");

  useEffect(() => {
    if (sp.get("scope")) { setScope(sp.get("scope")); return; }
    api.getSettings().then((s) => {
      const hs = (s.homespot as string) || "";
      setScope(hs ? `spot:${hs}` : "");
    }).catch(() => setScope(""));
  }, [sp]);

  useEffect(() => {
    api.chatRooms().then(setRooms).catch(() => {});
    api.chatActive(48, 3).then(setActive).catch(() => {});
  }, [scope]);

  // Für Session-Chats den Spotnamen (+ Datum) als Titel laden statt „#4".
  useEffect(() => {
    if (!scope?.startsWith("session:")) { setSessionLabel(""); return; }
    const id = Number(scope.slice(8));
    setSessionLabel(`${t("row.session")} #${id}`);
    api.session(id).then((s) => {
      const date = s.started_at ? new Date(s.started_at).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "2-digit" }) : "";
      setSessionLabel(s.place_name ? `${s.place_name}${date ? ` · ${date}` : ""}` : (date || `${t("row.session")} #${id}`));
    }).catch(() => {});
  }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps

  const label = scope?.startsWith("spot:")
    ? scope.slice(5)
    : scope?.startsWith("session:") ? sessionLabel : "";
  const isSpot = scope?.startsWith("spot:");
  // In den Listen den aktuell offenen Raum nicht nochmal zeigen.
  const myRooms = rooms.filter((r) => r.scope !== scope);

  return (
    <div className="w-full">
      <div className="mb-3 flex items-center gap-2">
        <button onClick={goBack} className="text-slate-400 hover:text-slate-200" aria-label={t("common.back")}>
          <ChevronIcon className="h-5 w-5 rotate-180" />
        </button>
        <h2 className="flex items-center gap-1.5 text-lg font-bold">
          {scope ? (isSpot ? <LocationIcon className="h-5 w-5 text-brand-400" /> : <ChatBubbleIcon className="h-5 w-5 text-brand-400" />) : null}
          {label || t("chat.title")}
        </h2>
      </div>

      {scope ? (
        <Card className="mb-6 p-4"><Chat scope={scope} /></Card>
      ) : (
        <Card className="mb-6 p-6 text-center text-sm text-slate-400">{t("chat.noRoom")}</Card>
      )}

      <RoomList title={t("phome.myChats")} empty={t("chat.noMine")}
        items={myRooms.map((r) => ({ ...r, badge: r.unread, push: r.push }))} />

      <RoomList title={t("chat.activeOthers")} empty={t("chat.noActive")}
        items={active.map((r) => ({ scope: r.scope, label: r.label, url: r.url,
          last_text: r.last_text, badge: r.messages, push: false }))} />
    </div>
  );
}

type Row = { scope: string; label: string; url: string; last_text: string; badge: number; push: boolean };

function RoomList({ title, empty, items }: { title: string; empty: string; items: Row[] }) {
  const t = useT();
  return (
    <div className="mb-6">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">{empty}</p>
      ) : (
        <div className="space-y-2">
          {items.map((r) => (
            <Link key={r.scope} to={r.url}
              className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3 hover:border-slate-700 hover:bg-slate-900">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  {r.scope.startsWith("spot:")
                    ? <LocationIcon className="h-4 w-4 shrink-0 text-brand-400" />
                    : <ChatBubbleIcon className="h-4 w-4 shrink-0 text-brand-400" />}
                  <span className="font-medium text-slate-100">{r.label}</span>
                </span>
                <span className="block truncate text-xs text-slate-400">{r.last_text}</span>
              </span>
              {r.badge > 0 && (
                <span className="shrink-0 rounded-full bg-brand-500 px-2 py-0.5 text-xs font-semibold text-slate-950" title={t("chat.activeOthers")}>{r.badge}</span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
