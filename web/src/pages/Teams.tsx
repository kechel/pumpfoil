// Meine Teams + Team gruenden (31.10.2026, docs/TEAMS.md). Einstieg ueber den Knopf „Team" auf der
// Profilseite. Ein neues Team funktioniert sofort intern (Einladungslinks); nach aussen erscheint es
// erst, wenn ein Admin seinen Auftritt freigegeben hat.
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, TeamKurz } from "../lib/api";
import { Card } from "../components/ui";
import { ChevronIcon } from "../components/Icons";
import TeamWappen from "../components/TeamWappen";
import { fehlerCode } from "../lib/teamKennzahlen";
import { useI18n } from "../i18n";

export default function Teams() {
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
    <div className="w-full max-w-2xl">
      <Link to="/einstellungen" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-300 hover:text-slate-200">
        <ChevronIcon className="h-4 w-4 rotate-180" /> {t("nav.profile")}
      </Link>
      <h2 className="mb-3 text-xl font-bold">{t("team.meine")}</h2>

      {!meine ? <p className="text-sm text-slate-400">{t("common.loading")}</p> : meine.length === 0 ? (
        <p className="mb-4 text-sm text-slate-400">{t("team.keineTeams")}</p>
      ) : (
        <Card className="mb-4 p-2">
          {meine.map((m) => (
            <Link key={m.id} to={`/teams/${m.slug}`} className="flex items-center gap-3 rounded-xl p-2 hover:bg-slate-800/60">
              <TeamWappen name={m.name} logo={m.logo_url} farbe={m.farbe} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-slate-100">{m.name}</span>
                <span className="block text-xs text-slate-400">
                  {m.status === "angefragt" ? t("team.join.wartet") : t(`team.rolle.${m.rolle}`)}
                  {m.freigabe && m.freigabe !== "frei" && <> · {t(`team.freigabe.${m.freigabe}`)}</>}
                </span>
              </span>
              {m.anfragen > 0 && <span className="rounded-full bg-brand-500 px-2 py-0.5 text-xs font-bold text-slate-950">{m.anfragen}</span>}
              <ChevronIcon className="h-5 w-5 text-slate-400" />
            </Link>
          ))}
        </Card>
      )}

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
