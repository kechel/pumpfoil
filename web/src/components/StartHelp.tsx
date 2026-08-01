import { Link } from "react-router-dom";
import { Card } from "./ui";
import { useT } from "../i18n";

// Starthilfe im Leerzustand (angemeldet, noch keine Sessions) — Homebereich UND Sessions-Liste
// zeigen dieselbe Karte (Jan, 01.08.: genau dort muss erklaert werden, wie die erste Session
// hierher kommt). Vorher stand in der Liste nur ein Satz ohne Links in text-sm — wichtige
// Hinweise nie kleiner als der Fliesstext.
export function StartHelp() {
  const t = useT();
  return (
    <Card className="p-6">
      <p className="mb-1 font-semibold">{t("phome.emptyTitle")}</p>
      <p className="mb-4 text-slate-300">{t("phome.emptyBody")}</p>
      <div className="flex flex-wrap gap-2">
        {/* Explizit ?tab=guide: /account ohne Parameter springt auf „Datenfelder", sobald ein
            verbundenes Geraet existiert (Account.tsx) — hier soll aber IMMER die Anleitung auf. */}
        <Link to="/account?tab=guide"
          className="rounded-xl bg-brand-500 px-4 py-2 font-medium text-slate-950 hover:bg-brand-400">
          {t("phome.emptyCtaWatch")}
        </Link>
        <Link to="/import"
          className="rounded-xl border border-slate-700 px-4 py-2 text-slate-200 hover:bg-slate-800">
          {t("phome.emptyCtaImport")}
        </Link>
      </div>
    </Card>
  );
}
