import { useI18n } from "../i18n";

// Dezente Subzeile je Menüpunkt (wie der Update-Hinweis), damit neue Nutzer auf einen
// Blick sehen, welche Uhren/Konten möglich sind. Verfügbare punktgetrennt; ausstehende
// gesammelt in EINER Klammer „(Wartet auf Freigabe: a, b, …)".
const GROUPS = {
  watch: { avail: ["Garmin", "Apple Watch", "Wear OS"], pending: ["Amazfit"] },
  account: { avail: ["Polar"], pending: ["Suunto", "COROS"] },
} as const;

export function PlatformSubline({ kind, className = "" }: { kind: "watch" | "account"; className?: string }) {
  const { t } = useI18n();
  const g = GROUPS[kind];
  const tail = g.pending.length ? ` (${t("linked.pendingLabel")}: ${g.pending.join(", ")})` : "";
  return (
    <span className={`block text-xs text-slate-400 ${className}`}>
      {g.avail.join(" · ")}{tail}
    </span>
  );
}
