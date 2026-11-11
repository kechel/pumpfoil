// Meine Teams + Team gruenden (31.10.2026, docs/TEAMS.md). Einstieg ueber den Knopf „Team" auf der
// Profilseite. Ein neues Team funktioniert sofort intern (Einladungslinks); nach aussen erscheint es
// erst, wenn ein Admin seinen Auftritt freigegeben hat.
import { ZurueckPfeil } from "../components/ZurueckPfeil";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, TeamKurz, TeamListenEintrag } from "../lib/api";
import { passtZu } from "../lib/suche";
import { Card } from "../components/ui";
import { ChevronIcon } from "../components/Icons";
import TeamWappen from "../components/TeamWappen";
import { TeamHerkunft } from "../components/TeamHerkunft";
import { fehlerCode, sportartenText } from "../lib/teamKennzahlen";
import { RegelnLink } from "./TeamRegeln";
import { useI18n } from "../i18n";
import { TeamPrimaer } from "../components/TeamPrimaer";

export default function Teams({ eingebettet = false }: { eingebettet?: boolean } = {}) {   // eingebettet: Reiter in den Einstellungen
  const { t } = useI18n();
  const nav = useNavigate();
  const [meine, setMeine] = useState<TeamKurz[] | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugAnders, setSlugAnders] = useState(false);
  const [slugFehler, setSlugFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => { api.teamsMine().then(setMeine).catch(() => setMeine([])); }, []);
  // Primaeres Team (Jan, 10.11.2026): nur sinnvoll, wenn man in mehr als einem Team ist, das in globalen Events zaehlt.
  const mehrereWertbar = (meine ?? []).filter((m) => m.waehlbar ?? m.wertbar).length > 1;

  // Adress-Vorschlag aus dem Namen, solange der Nutzer sie nicht selbst geaendert hat.
  useEffect(() => {
    if (slugAnders || name.trim().length < 3) return;
    const h = setTimeout(() => api.teamSlug({ name }).then((r) => { setSlug(r.slug); setSlugFehler(null); }).catch(() => {}), 300);
    return () => clearTimeout(h);
  }, [name, slugAnders]);
  useEffect(() => {
    if (!slugAnders || !slug) return;
    const h = setTimeout(() => api.teamSlug({ slug }).then((r) => setSlugFehler(r.fehler)).catch(() => {}), 300);
    return () => clearTimeout(h);
  }, [slug, slugAnders]);

  const gruenden = () => {
    setBusy(true);
    setFehler(null);
    api.teamAnlegen(name.trim(), slug || undefined)
      .then((r) => nav(`/teams/${r.slug}/einstellungen`))
      .catch((e) => setFehler(t(`team.err.${fehlerCode(e)}`)))
      .finally(() => setBusy(false));
  };

  return (
    <div className="w-full">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        {eingebettet ? <span /> : <h2 className="flex items-center gap-2 text-xl font-bold"><ZurueckPfeil fallback="/einstellungen" />{t("team.meine")}</h2>}
        <RegelnLink />
      </div>

      {!meine ? <p className="text-sm text-slate-400">{t("common.loading")}</p> : meine.length === 0 ? (
        <p className="mb-4 text-sm text-slate-400">{t("team.keineTeams")}</p>
      ) : (
        <Card className="mb-4 p-2">
          {meine.map((m) => (
            <Link key={m.id} to={`/teams/${m.slug}`} className="flex items-center gap-3 rounded-xl p-2 hover:bg-slate-800/60">
              <TeamWappen name={m.name} logo={m.logo_url} farbe={m.farbe} size={40} />
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5"><span className="truncate font-medium text-slate-100">{m.name}</span><TeamHerkunft land={m.land} /></span>
                <span className="block text-xs text-slate-400">
                  {m.status === "angefragt" ? t("team.join.wartet") : t(`team.rolle.${m.rolle}`)}
                  {m.freigabe && m.freigabe !== "frei" && <> · {t(`team.freigabe.${m.freigabe}`)}</>}
                </span>
                {!!m.sportarten?.length && <span className="block truncate text-xs text-slate-400">{sportartenText(m.sportarten, t)}</span>}
                <TeamPrimaer m={m} mehrere={mehrereWertbar} onGeaendert={() => api.teamsMine().then(setMeine)} />
              </span>
              {m.anfragen > 0 && <span className="rounded-full bg-brand-500 px-2 py-0.5 text-xs font-bold text-slate-950">{m.anfragen}</span>}
              <ChevronIcon className="h-5 w-5 text-slate-400" />
            </Link>
          ))}
        </Card>
      )}
      {mehrereWertbar && <p className="-mt-2 mb-4 text-sm text-slate-400">{t("team.primaerHinweis")}</p>}

      <TeamSuche />

      <Card className="p-4">
        <h3 className="mb-1 font-semibold text-slate-100">{t("team.gruenden")}</h3>
        <p className="mb-3 text-sm text-slate-400">{t("team.gruendenHinweis")}</p>
        <label className="mb-1 block text-sm text-slate-300">{t("team.name")}</label>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60}
          className="mb-3 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" />
        <label className="mb-1 block text-sm text-slate-300">{t("team.adresse")}</label>
        <div className="mb-1 flex items-center rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
          <span className="shrink-0 text-slate-400">pumpfoil.org/teams/</span>
          <input value={slug} maxLength={40}
            onChange={(e) => { setSlugAnders(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); }}
            className="min-w-0 flex-1 bg-transparent text-slate-100 outline-none" />
        </div>
        <p className="mb-3 text-xs text-slate-400">{slugFehler ? t(`team.err.${slugFehler}`) : t("team.adresseHinweis")}</p>
        {fehler && <p className="mb-3 text-sm text-red-700 dark:text-red-300">{fehler}</p>}
        <button onClick={gruenden} disabled={busy || name.trim().length < 3 || !!slugFehler}
          className="rounded-xl bg-brand-500 px-4 py-2.5 font-semibold text-slate-950 hover:bg-brand-400 disabled:opacity-50">
          {t("team.gruendenKnopf")}
        </button>
      </Card>
    </div>
  );
}

/** Suche durch alle freigegebenen Teams (Jan, 04.11.2026). Gleiche Regel wie alle Suchen (lib/suche.ts): Wortstellung
 * egal, Akzente/Bindestriche/Leerzeichen zaehlen nicht — „lodz" findet „Łódź". Ohne Suchbegriff keine Liste. */
export function TeamSuche() {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [alle, setAlle] = useState<TeamListenEintrag[] | null>(null);
  useEffect(() => { api.teamsListe().then(setAlle).catch(() => setAlle([])); }, []);
  const treffer = useMemo(() => {
    const ql = q.trim();
    if (!ql || !alle) return [];
    return alle.filter((x) => passtZu(`${x.name} ${x.slug}`, ql)).sort((a, b) => b.mitglieder_anzahl - a.mitglieder_anzahl);
  }, [q, alle]);
  return (
    <Card className="mb-4 p-4">
      <h3 className="mb-2 font-semibold text-slate-100">{t("team.finden")}</h3>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("team.findenPlatzhalter")}
        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
      {q.trim() && alle && (treffer.length === 0
        ? <p className="mt-2 text-sm text-slate-500">{t("gear.noHits")}</p>
        : <div className="mt-2">
            {treffer.map((x) => (
              <Link key={x.id} to={`/teams/${x.slug}`} className="flex items-center gap-3 rounded-xl p-2 hover:bg-slate-800/60">
                <TeamWappen name={x.name} logo={x.logo_url} farbe={x.farbe} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5"><span className="truncate font-medium text-slate-100">{x.name}</span><TeamHerkunft land={x.land} /></span>
                  <span className="block truncate text-xs text-slate-400">
                    {t(x.mitglieder_anzahl === 1 ? "team.mitgliederAnzahl1" : "team.mitgliederAnzahl", { n: String(x.mitglieder_anzahl) })}
                    {!!x.sportarten?.length && <> · {sportartenText(x.sportarten, t)}</>}
                  </span>
                </span>
                <ChevronIcon className="h-5 w-5 text-slate-400" />
              </Link>
            ))}
          </div>)}
    </Card>
  );
}
