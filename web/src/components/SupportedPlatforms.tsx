import { useI18n } from "../i18n";

// Dezente Übersicht aller möglichen Geräte/Verknüpfungen — verfügbare sowie solche,
// die noch auf Hersteller-Freigabe warten. Rein informativ (kein Link), damit neue
// Nutzer auf einen Blick sehen, was möglich ist und wo.
export function SupportedPlatforms({ className = "" }: { className?: string }) {
  const { t } = useI18n();
  const rows: { name: string; status: "avail" | "planned" | "account" }[] = [
    { name: "Garmin", status: "avail" },
    { name: "Apple Watch", status: "avail" },
    { name: "Wear OS", status: "avail" },
    { name: "Amazfit", status: "planned" },
    { name: "Polar", status: "account" },
    { name: "Suunto", status: "planned" },
    { name: "COROS", status: "planned" },
  ];
  return (
    <div className={`text-xs text-slate-500 ${className}`}>
      <p className="mb-1.5 font-medium text-slate-400">{t("linked.platformsTitle")}</p>
      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {rows.map((r) => (
          <li key={r.name} className="whitespace-nowrap">
            <span className="text-slate-300">{r.name}</span>
            {r.status === "planned" && <span> ({t("watches.st.planned")})</span>}
            {r.status === "account" && <span> ({t("linked.accountShort")})</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
