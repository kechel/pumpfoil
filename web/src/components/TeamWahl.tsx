import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, type TeamKurz } from "../lib/api";
import TeamWappen from "./TeamWappen";
import { teamFarbStil } from "../lib/teamFarben";
import { useT } from "../i18n";

/**
 * Team-Auswahl ueberall dort, wo „Team" ein Filter ist (Jan, 02.11.2026: „was man bei mehreren teams sieht … eine loesung
 * die dann ueberall funktioniert"). Standard „alle" = alle eigenen Teams zusammen; bei mehr als einem Team eine Chip-Zeile
 * zum Eingrenzen. Die Wahl steht in der Adresse (`team`) und wird im Browser gemerkt (nur Komfort).
 */
const SPEICHER = "foil_team_wahl";

export function useMeineTeams(): TeamKurz[] | null {
  const [teams, setTeams] = useState<TeamKurz[] | null>(null);
  useEffect(() => { api.teamsMine().then((l) => setTeams(l.filter((x) => x.status === "aktiv"))).catch(() => setTeams([])); }, []);
  return teams;
}

export function useTeamWahl(teams: TeamKurz[] | null): [string, (v: string) => void] {
  const [sp, setSp] = useSearchParams();
  const gueltig = (v: string | null) => !!v && (v === "alle" || !!teams?.some((x) => String(x.id) === v));
  let wahl = sp.get("team");
  if (!gueltig(wahl)) {
    try { wahl = localStorage.getItem(SPEICHER); } catch { wahl = null; }
  }
  if (!gueltig(wahl)) wahl = "alle";
  const setze = (v: string) => {
    try { localStorage.setItem(SPEICHER, v); } catch { /* egal */ }
    setSp((alt) => { const n = new URLSearchParams(alt); n.set("team", v); return n; }, { replace: true });
  };
  return [wahl as string, setze];
}

export function TeamWahl({ teams, wahl, onWahl }: { teams: TeamKurz[]; wahl: string; onWahl: (v: string) => void }) {
  const t = useT();
  if (teams.length < 2) return null;
  const chip = (an: boolean) => `inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${
    an ? "border-brand-500 bg-brand-500 font-semibold text-slate-950" : "border-slate-700 text-slate-200 hover:border-slate-500"}`;
  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      <button onClick={() => onWahl("alle")} className={chip(wahl === "alle")}>{t("team.alleMeine")}</button>
      {teams.map((tm) => (
        <button key={tm.id} onClick={() => onWahl(String(tm.id))} className={`team-farbe ${chip(wahl === String(tm.id))}`}
          style={teamFarbStil(tm.farbe)}>
          <TeamWappen name={tm.name} logo={tm.logo_url} farbe={tm.farbe} size={16} />
          <span className="max-w-[10rem] truncate">{tm.name}</span>
        </button>
      ))}
    </div>
  );
}
