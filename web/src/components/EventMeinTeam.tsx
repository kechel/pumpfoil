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
  const [hinweis, setHinweis] = useState<string | null>(null);
  const nicht = mt.nicht_zaehlend ?? [];
  // Ab zwei eigenen Teams sichtbar — auch wenn nur eines zaehlt (Jan, 11.11.2026: „wo kann ich ein anderes team fuer
  // das upcoming event einstellen?"); die nicht zaehlenden stehen ausgegraut mit Grund dabei.
  if (mt.auswahl.length + nicht.length < 2) return null;
  const waehle = (id: number) => {
    if (busy || !mt.aenderbar || id === mt.effektiv) return;
    setBusy(true);
    // Das primaere Team waehlen heisst: keine Sonderwahl fuer dieses Event (folgt spaeteren Aenderungen des primaeren).
    api.teamEventMeinTeam(slug, evId, id === mt.primaer ? null : id).then(onGeaendert).catch(() => {}).finally(() => setBusy(false));
  };
  const chip = (an: boolean) => `team-farbe inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${
    an ? "team-knopf border-transparent font-semibold" : "border-slate-700 text-slate-200 hover:border-slate-500"} ${mt.aenderbar ? "" : "cursor-default"}`;
  // Nur „Du trittst an für" + Knoepfe in einer Zeile (Jan, 11.11.2026: „die ganzen erklaerungen weglassen … die regeln
  // nur einblenden wenn man auf ein deaktiviertes klickt, ansonsten stehen die auch in den rules").
  return (
    <div className="mb-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-sm font-semibold text-slate-100">{t("team.event.meinTeam")}</span>
        {mt.auswahl.map((x) => (
          <button key={x.id} onClick={() => (mt.aenderbar || x.id === mt.effektiv ? waehle(x.id) : setHinweis(t("team.event.meinTeamFest")))}
            disabled={busy}
            className={chip(x.id === mt.effektiv)} style={teamFarbStil(x.farbe)} aria-pressed={x.id === mt.effektiv}>
            <TeamWappen name={x.name} logo={x.logo_url} farbe={x.farbe} size={16} />
            <span className="max-w-[12rem] truncate">{x.name}</span>
            {x.id === (mt.markiert ?? mt.primaer) && <span className="text-xs opacity-80">★</span>}
          </button>
        ))}
        {nicht.map((x) => (
          <button key={x.id} onClick={() => setHinweis(t("team.event.zaehltNicht"))} aria-disabled="true"
            className="inline-flex shrink-0 cursor-help items-center gap-1.5 rounded-full border border-dashed border-slate-700 px-3 py-1 text-sm text-slate-500">
            <TeamWappen name={x.name} logo={x.logo_url} farbe={x.farbe} size={16} />
            <span className="max-w-[12rem] truncate">{x.name}</span>
            {x.id === mt.markiert && <span className="text-xs">★</span>}
          </button>
        ))}
      </div>
      {hinweis && <p className="mt-2 text-xs text-slate-400">{hinweis}</p>}
    </div>
  );
}
