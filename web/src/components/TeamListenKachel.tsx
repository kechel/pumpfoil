import { Link } from "react-router-dom";
import type { TeamListenEintrag } from "../lib/api";
import TeamWappen from "./TeamWappen";
import { TeamHerkunft } from "./TeamHerkunft";
import { teamFarbStil } from "../lib/teamFarben";
import { sportartenText } from "../lib/teamKennzahlen";
import { useI18n } from "../i18n";

/** Team als Kachel (Teamliste und „Aktivste Teams" der Community, 02.11.2026) — eine Gestalt fuer beide. */
export default function TeamListenKachel({ tm, aktivitaet = false }: { tm: TeamListenEintrag; aktivitaet?: boolean }) {
  const { t } = useI18n();
  return (
    <Link to={`/teams/${tm.slug}`} style={teamFarbStil(tm.farbe)}
      className="team-farbe flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-3 hover:border-slate-700">
      <TeamWappen name={tm.name} logo={tm.logo_url} farbe={tm.farbe} size={40} />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5"><span className="team-akzent truncate font-semibold">{tm.name}</span><TeamHerkunft land={tm.land} /></span>
        <span className="block truncate text-xs text-slate-400">
          {t("team.mitgliederAnzahl", { n: String(tm.mitglieder_anzahl) })}
          {!!tm.sportarten?.length && <> · {sportartenText(tm.sportarten, t)}</>}
        </span>
      </span>
      {aktivitaet && (
        <span className="shrink-0 text-right text-xs text-slate-400">
          <span className="team-akzent block text-base font-bold tabular-nums">{tm.sessions_30d ?? 0}</span>
          {t("team.sessions30")}
        </span>
      )}
    </Link>
  );
}
