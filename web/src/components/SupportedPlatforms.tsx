import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useI18n } from "../i18n";

// Dezente Subzeile je Menüpunkt (wie der Update-Hinweis), damit neue Nutzer auf einen
// Blick sehen, welche Uhren/Konten möglich sind. Verfügbare punktgetrennt; ausstehende
// gesammelt in EINER Klammer „(Wartet auf Freigabe: a, b, …)". Was der Nutzer bereits
// hat (gepairte Uhr / verknüpftes Konto) wird blau hervorgehoben — wie das Standard-Foil.
const GROUPS = {
  watch: { avail: ["Garmin", "Apple Watch", "Wear OS", "Amazfit"], pending: [] },
  // Xiaomi hat keine eigene Verknuepfung: Mi Fitness schiebt die Trainings offiziell in die
  // Suunto-App, dort holen wir sie ab (Anleitung auf /konten). Fuer den Nutzer ist die
  // Plattform damit unterstuetzt — also gehoert sie in diese Zeile.
  // COROS steht bewusst noch unter „wartet": die MCP-Anbindung ist gebaut, aber die
  // Werkzeug-Parameter sind noch nicht an einem echten Konto gegengeprueft (docs/TODO.md).
  account: { avail: ["Polar", "Suunto", "Xiaomi"], pending: ["COROS"] },
} as const;

// Geräte-Plattform (vom Pairing gemeldet) -> Anzeigename in der Watch-Gruppe.
const DEVICE_NAME: Record<string, string> = {
  garmin: "Garmin", apple: "Apple Watch", wear: "Wear OS", amazfit: "Amazfit", zepp: "Amazfit",
};

export function PlatformSubline({ kind, className = "" }: { kind: "watch" | "account"; className?: string }) {
  const { t } = useI18n();
  const g = GROUPS[kind];
  const [owned, setOwned] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (kind === "watch") {
      api.myDevices().then((ds) => {
        const s = new Set<string>();
        for (const d of ds) {
          if (d.revoked_at) continue;
          const n = DEVICE_NAME[(d.platform || "").toLowerCase()];
          if (n) s.add(n);
        }
        setOwned(s);
      }).catch(() => {});
    } else {
      Promise.allSettled([api.polarStatus(), api.suuntoStatus(), api.corosStatus(), api.corosMcpStatus()])
        .then(([p, su, co, coMcp]) => {
          const s = new Set<string>();
          if (p.status === "fulfilled" && p.value.linked) s.add("Polar");
          if (su.status === "fulfilled" && su.value.linked) s.add("Suunto");
          // COROS kann ueber beide Wege verknuepft sein (Partner-API oder MCP) — einer reicht.
          if (co.status === "fulfilled" && co.value.linked) s.add("COROS");
          if (coMcp.status === "fulfilled" && coMcp.value.linked) s.add("COROS");
          setOwned(s);
        });
    }
  }, [kind]);

  const tail = g.pending.length ? ` (${t("linked.pendingLabel")}: ${g.pending.join(", ")})` : "";
  return (
    <span className={`block text-xs text-slate-400 ${className}`}>
      {g.avail.map((name, i) => (
        <span key={name}>
          {i > 0 && " · "}
          <span className={owned.has(name) ? "text-brand-300" : ""}>{name}</span>
        </span>
      ))}
      {tail}
    </span>
  );
}
