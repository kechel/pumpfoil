// Freunde verwalten (Jan, 15.10.2026: „auf eine eigene Seite hinter einem neuen Button auf der
// Profilseite"). Freunde, wer davon gerade pumpt, Anfragen an mich und meine offenen Anfragen.
// Angefragt wird auf der Foiler-Seite des anderen, nicht hier.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Freundschaft } from "../lib/api";
import { Card, Avatar } from "../components/ui";
import { ChevronIcon, LocationIcon } from "../components/Icons";
import { FreundeBedingungen, FreundschaftDialog } from "../components/Freundschaft";
import { useI18n } from "../i18n";

type Liste = Awaited<ReturnType<typeof api.friends>>;
type Offen = { art: "annehmen" | "beenden" | "zurueckziehen"; id: number; name: string };

export default function Friends() {
  const { t, lang } = useI18n();
  const [d, setD] = useState<Liste | null>(null);
  const [offen, setOffen] = useState<Offen | null>(null);
  const [busy, setBusy] = useState(false);
  const laden = () => api.friends().then(setD).catch(() => setD({ freunde: [], eingehend: [], ausgehend: [], aktiv: [] }));
  useEffect(() => { laden(); }, []);

  const datum = (iso: string) => {
    try { return new Intl.DateTimeFormat(lang, { day: "2-digit", month: "long", year: "numeric" }).format(new Date(iso)); }
    catch { return iso.slice(0, 10); }
  };
  const ausfuehren = (p: Promise<{ status: Freundschaft }>) => {
    setBusy(true);
    p.then(() => { setOffen(null); laden(); }).catch(() => {}).finally(() => setBusy(false));
  };

  const Zeile = ({ id, name, avatar, unter, children }: {
    id: number; name: string | null; avatar: string | null; unter?: React.ReactNode; children?: React.ReactNode;
  }) => (
    <div className="flex items-center gap-3 border-t border-slate-800 py-2.5 first:border-t-0">
      <Avatar name={name} url={avatar} seed={id} userId={id} size={36} />
      <div className="min-w-0 flex-1">
        <Link to={`/foiler/${id}`} className="pf-name block truncate font-semibold hover:text-brand-400">{name ?? "—"}</Link>
        {unter && <div className="text-sm text-slate-400">{unter}</div>}
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-2">{children}</div>
    </div>
  );
  const knopf = "rounded-xl border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800";

  return (
    <div className="w-full max-w-2xl">
      <Link to="/einstellungen" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-300 hover:text-slate-200">
        <ChevronIcon className="h-4 w-4 rotate-180" /> {t("nav.profile")}
      </Link>
      <h2 className="mb-3 text-xl font-bold">{t("friends.title")}</h2>
      <Card className="mb-4 p-4">
        <p className="mb-1 text-sm font-semibold text-slate-200">{t("friends.termsTitle")}</p>
        <FreundeBedingungen />
        <p className="mt-2 text-sm text-slate-400">{t("friends.howTo")}</p>
      </Card>

      {!d ? <p className="text-sm text-slate-400">{t("common.loading")}</p> : (
        <>
          {d.aktiv.length > 0 && (
            <Card className="mb-4 p-4">
              <h3 className="mb-1 font-semibold">{t("friends.pumpingNowTitle")}</h3>
              {d.aktiv.map((f) => (
                <Zeile key={f.user_id} id={f.user_id} name={f.name} avatar={f.avatar_url}
                  unter={f.spot_id != null
                    ? <Link to={`/sessions?scope=all&spot=${f.spot_id}`} className="inline-flex items-center gap-1 text-emerald-700 hover:underline dark:text-emerald-400">
                        <LocationIcon className="h-3.5 w-3.5" /> {f.spot}</Link>
                    : <span className="text-emerald-700 dark:text-emerald-400">{t("friends.pumpingNow")}</span>} />
              ))}
            </Card>
          )}

          {d.eingehend.length > 0 && (
            <Card className="mb-4 p-4">
              <h3 className="mb-1 font-semibold">{t("friends.incoming")}</h3>
              {d.eingehend.map((f) => (
                <Zeile key={f.user_id} id={f.user_id} name={f.name} avatar={f.avatar_url} unter={datum(f.am)}>
                  <button onClick={() => ausfuehren(api.friendDecline(f.user_id))} disabled={busy} className={knopf}>
                    {t("friends.decline")}
                  </button>
                  <button onClick={() => setOffen({ art: "annehmen", id: f.user_id, name: f.name ?? "—" })}
                    className="rounded-xl bg-brand-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-brand-400">
                    {t("friends.accept")}
                  </button>
                </Zeile>
              ))}
              <p className="mt-1 text-sm text-slate-400">{t("friends.declineSilent")}</p>
            </Card>
          )}

          <Card className="mb-4 p-4">
            <h3 className="mb-1 font-semibold">{t("friends.list")} {d.freunde.length > 0 && <span className="text-slate-400">({d.freunde.length})</span>}</h3>
            {d.freunde.length === 0 ? <p className="text-sm text-slate-400">{t("friends.none")}</p>
              : d.freunde.map((f) => (
                <Zeile key={f.user_id} id={f.user_id} name={f.name} avatar={f.avatar_url}
                  unter={t("friends.since", { date: datum(f.seit) })}>
                  <button onClick={() => setOffen({ art: "beenden", id: f.user_id, name: f.name ?? "—" })} className={knopf}>
                    {t("friends.remove")}
                  </button>
                </Zeile>
              ))}
          </Card>

          {d.ausgehend.length > 0 && (
            <Card className="mb-4 p-4">
              <h3 className="mb-1 font-semibold">{t("friends.outgoing")}</h3>
              {d.ausgehend.map((f) => (
                <Zeile key={f.user_id} id={f.user_id} name={f.name} avatar={f.avatar_url} unter={datum(f.am)}>
                  <button onClick={() => setOffen({ art: "zurueckziehen", id: f.user_id, name: f.name ?? "—" })} className={knopf}>
                    {t("friends.withdraw")}
                  </button>
                </Zeile>
              ))}
            </Card>
          )}
        </>
      )}

      {offen && (
        <FreundschaftDialog art={offen.art} name={offen.name} busy={busy} onClose={() => setOffen(null)}
          onJa={() => ausfuehren(offen.art === "annehmen" ? api.friendAccept(offen.id) : api.friendRemove(offen.id))}
          onAblehnen={offen.art === "annehmen" ? () => ausfuehren(api.friendDecline(offen.id)) : undefined} />
      )}
    </div>
  );
}
