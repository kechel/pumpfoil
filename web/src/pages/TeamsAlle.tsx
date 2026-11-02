// Alle freigegebenen Teams auf einer eigenen Seite (Jan, 01.11.2026): die Community-Seite zeigt keine Teams mehr direkt,
// nur noch laufende und bald beginnende Events — mit vielen Teams waere die Liste dort zu lang geworden.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, TeamListenEintrag } from "../lib/api";
import TeamListenKachel from "../components/TeamListenKachel";
import { passtZu } from "../lib/suche";
import { useI18n } from "../i18n";

export default function TeamsAlle() {
  const { t } = useI18n();
  const [rows, setRows] = useState<TeamListenEintrag[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => { api.teamsListe().then(setRows).catch(() => setRows([])); }, []);
  const treffer = (rows ?? []).filter((tm) => passtZu(`${tm.name} ${tm.slug} ${tm.beschreibung ?? ""}`, q));
  return (
    <div className="w-full">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-bold text-slate-100">{t("team.alle")}</h2>
        <Link to="/teams" className="ml-auto text-sm text-brand-700 hover:underline dark:text-brand-300">{t("team.gruenden")} →</Link>
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("team.alleSuche")} type="search"
        className="mb-3 w-full rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100" />
      {!rows ? <p className="text-sm text-slate-400">{t("common.loading")}</p>
        : rows.length === 0 ? <p className="text-sm text-slate-400">{t("team.communityLeer")}</p>
        : treffer.length === 0 ? <p className="text-sm text-slate-400">{t("team.alleLeer")}</p> : (
          <div className="grid gap-2 sm:grid-cols-2">
            {treffer.map((tm) => (
              <TeamListenKachel key={tm.id} tm={tm} />
            ))}
          </div>
        )}
    </div>
  );
}
