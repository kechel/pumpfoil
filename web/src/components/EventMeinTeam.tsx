import { useState } from "react";
import { api, type EventMeinTeam as MeinTeam } from "../lib/api";
import TeamWappen from "./TeamWappen";
import { teamFarbStil } from "../lib/teamFarben";

/** Globale Events (Jan, 10.11.2026: „je event auch anders einstellen … auf der event-seite"): wer in mehreren Teams ist,
 *  zaehlt nur fuer eines — vorgewaehlt das primaere, hier fuer dieses Event umstellbar bis zum Ende. */
export default function EventMeinTeam({ slug, evId, mt, t, onGeaendert }: {
  slug: string; evId: number; mt: MeinTeam; t: (k: string, p?: Record<string, string>) => string; onGeaendert: () => void;
}) {
  const [busy, setBusy] = useState(false);
  if (mt.auswahl.length < 2) return null;
  const waehle = (id: number) => {
    if (busy || !mt.aenderbar || id === mt.effektiv) return;
    setBusy(true);
    // Das primaere Team waehlen heisst: keine Sonderwahl fuer dieses Event (folgt spaeteren Aenderungen des primaeren).
    api.teamEventMeinTeam(slug, evId, id === mt.primaer ? null : id).then(onGeaendert).catch(() => {}).finally(() => setBusy(false));
  };
  const chip = (an: boolean) => `team-farbe inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${
    an ? "team-knopf border-transparent font-semibold" : "border-slate-700 text-slate-200 hover:border-slate-500"} ${mt.aenderbar ? "" : "cursor-default"}`;
  return (
    <div className="mb-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
      <p className="mb-2 text-sm font-semibold text-slate-100">{t("team.event.meinTeam")}</p>
      <div className="flex flex-wrap gap-1.5">
        {mt.auswahl.map((x) => (
          <button key={x.id} onClick={() => waehle(x.id)} disabled={busy || (!mt.aenderbar && x.id !== mt.effektiv)}
            className={chip(x.id === mt.effektiv)} style={teamFarbStil(x.farbe)} aria-pressed={x.id === mt.effektiv}>
            <TeamWappen name={x.name} logo={x.logo_url} farbe={x.farbe} size={16} />
            <span className="max-w-[12rem] truncate">{x.name}</span>
            {x.id === mt.primaer && <span className="text-xs opacity-80">★</span>}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-400">{t(mt.aenderbar ? "team.event.meinTeamHinweis" : "team.event.meinTeamFest")}</p>
    </div>
  );
}
