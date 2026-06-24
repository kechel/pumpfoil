import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { Chat } from "../components/Chat";
import { ChevronIcon, LocationIcon } from "../components/Icons";
import { useT } from "../i18n";

// Eigenständige Chat-Ansicht (Fullscreen, v. a. mobil) — Ziel von Push-Deeplinks.
// scope aus ?scope=session:<id> | spot:<name>; ohne scope -> Homespot-Chat.
export default function ChatPage() {
  const t = useT();
  const [sp] = useSearchParams();
  const [scope, setScope] = useState<string | null>(sp.get("scope"));

  useEffect(() => {
    if (sp.get("scope")) { setScope(sp.get("scope")); return; }
    // Kein scope -> Homespot des Nutzers verwenden.
    api.getSettings().then((s) => {
      const hs = (s.homespot as string) || "";
      setScope(hs ? `spot:${hs}` : "");
    }).catch(() => setScope(""));
  }, [sp]);

  const label = scope?.startsWith("spot:")
    ? scope.slice(5)
    : scope?.startsWith("session:")
      ? `${t("row.session")} #${scope.slice(8)}`
      : "";
  const isSpot = scope?.startsWith("spot:");

  // Volle Höhe minus App-Chrome (mobile Topbar + Bottom-Nav).
  return (
    <div className="flex flex-col" style={{ height: "calc(100dvh - 11rem)" }}>
      <div className="mb-3 flex items-center gap-2">
        <Link to="/home" className="text-slate-400 hover:text-slate-200" aria-label={t("nav.home")}>
          <ChevronIcon className="h-5 w-5 rotate-180" />
        </Link>
        <h2 className="flex items-center gap-1.5 text-lg font-bold">
          {isSpot && <LocationIcon className="h-5 w-5 text-brand-400" />}
          {label || t("chat.title")}
        </h2>
      </div>
      {scope === null ? null : scope === "" ? (
        <p className="text-sm text-slate-400">{t("chat.noRoom")}</p>
      ) : (
        <div className="min-h-0 flex-1">
          <Chat scope={scope} fill />
        </div>
      )}
    </div>
  );
}
