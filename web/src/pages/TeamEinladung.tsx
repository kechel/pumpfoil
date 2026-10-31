// Einladungslink /teams/:slug/join-<token> bzw. /apply-<token> (31.10.2026, docs/TEAMS.md).
// Angemeldet: Beitritts-Dialog mit dem Kleingedruckten zur Oeffentlichkeit, dann direkt Mitglied
// (join) bzw. angefragt (apply). Ohne Konto: der Link wird im localStorage gemerkt (kein Cookie), es
// geht zur Anmeldung/Registrierung, und nach dem Login fuehrt App.tsx hierher zurueck.
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, getToken, TeamEinladungInfo } from "../lib/api";
import TeamWappen from "../components/TeamWappen";
import { teamFarbStil } from "../lib/teamFarben";
import { fehlerCode } from "../lib/teamKennzahlen";
import { BeitrittDialog } from "./Team";
import { useI18n } from "../i18n";

export const EINLADUNG_MERKER = "foil_team_einladung";

export function einladungAusPfad(teil: string | undefined): { art: "join" | "apply"; token: string } | null {
  const m = (teil || "").match(/^(join|apply)-([A-Za-z0-9_-]{6,64})$/);
  return m ? { art: m[1] as "join" | "apply", token: m[2] } : null;
}

export default function TeamEinladung() {
  const { slug = "", einladung } = useParams();
  const { t } = useI18n();
  const nav = useNavigate();
  const e = einladungAusPfad(einladung);
  const [info, setInfo] = useState<TeamEinladungInfo | null>(null);
  const [fehlt, setFehlt] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const angemeldet = !!getToken();

  useEffect(() => {
    if (!e) { setFehlt(true); return; }
    if (!angemeldet) {
      try { localStorage.setItem(EINLADUNG_MERKER, `/teams/${slug}/${einladung}`); } catch { /* privates Fenster: dann eben ohne */ }
      return;
    }
    api.teamEinladungAnsehen(e.token).then((d) => {
      if (d.mein_status === "aktiv") nav(`/teams/${d.slug}`, { replace: true });
      else setInfo(d);
    }).catch(() => setFehlt(true));
  }, [slug, einladung, angemeldet]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (fehlt) return <p className="text-sm text-slate-400">{t("team.einladungUngueltig")}</p>;

  if (!angemeldet) {
    return (
      <div className="mx-auto max-w-md py-6 text-center">
        <h2 className="mb-2 text-xl font-bold text-slate-100">{t("team.einladungGast")}</h2>
        <p className="mb-4 text-sm text-slate-300">{t("team.einladungGastText")}</p>
        <Link to="/login" className="inline-block rounded-xl bg-brand-500 px-5 py-2.5 font-semibold text-slate-950 hover:bg-brand-400">
          {t("team.einladungAnmelden")}
        </Link>
      </div>
    );
  }
  if (!info || !e) return <p className="text-sm text-slate-400">{t("common.loading")}</p>;

  const annehmen = () => {
    setBusy(true);
    api.teamEinladungAnnehmen(e.token)
      .then((r) => nav(`/teams/${r.slug}`, { replace: true }))
      .catch((x) => setFehler(t(`team.err.${fehlerCode(x)}`)))
      .finally(() => setBusy(false));
  };

  return (
    <div className="team-farbe mx-auto w-full max-w-md py-4" style={teamFarbStil(info.farbe)}>
      <div className="mb-4 flex items-center gap-3">
        <TeamWappen name={info.name} logo={info.logo_url} farbe={info.farbe} size={56} />
        <h2 className="team-akzent text-xl font-bold">{info.name}</h2>
      </div>
      {info.mein_status === "angefragt" && info.art === "apply"
        ? <p className="text-sm text-slate-300">{t("team.join.wartet")}</p>
        : <BeitrittDialog name={info.name} oeffentlich={info.oeffentlich} freigabeNoetig={info.art === "apply"}
            busy={busy} onJa={annehmen} onNein={() => nav("/", { replace: true })} />}
      {fehler && <p className="mt-3 text-sm text-red-700 dark:text-red-300">{fehler}</p>}
    </div>
  );
}
