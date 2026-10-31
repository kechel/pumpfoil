// Teamseite /teams/:slug (31.10.2026, docs/TEAMS.md). Eine Seite fuer drei Betrachter:
//  * Mitglieder: Bestenlisten mit Links zu den Sessions, Mitgliederliste, Austreten/Einstellungen.
//  * Angemeldete ohne Mitgliedschaft: freigegebener Auftritt, Beitreten-Knopf (wenn zugelassen),
//    Bestenlisten nur bei oeffentlichem Team.
//  * Gaeste (ohne Login): nur die oeffentliche Bestenliste — Rang, Name, Initialen, Wert. Keine Links.
// Die Regeln setzt der Server (server/app/teams.py); hier wird nur gezeigt, was er liefert.
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, getToken, TeamInfo, TeamLogbuchEintrag, TeamMitglied, TeamStatistik, TeamTafelMitZeilen } from "../lib/api";
import { Avatar, Card } from "../components/ui";
import { ChatBubbleIcon, ChevronIcon, SettingsIcon, ShareIcon } from "../components/Icons";
import TeamTafelBild from "../components/TeamTafelBild";
import { openChatOverlay } from "../components/DmWidget";
import TeamWappen from "../components/TeamWappen";
import { teamFarbStil } from "../lib/teamFarben";
import { fehlerCode, kennzahl } from "../lib/teamKennzahlen";
import { useI18n } from "../i18n";

const ZEITRAEUME: [string, string][] = [
  ["today", "period.today"], ["10d", "period.10d"], ["30d", "period.30d"], ["365d", "period.365d"], ["all", "period.all"],
];

type Kopf = Pick<TeamInfo, "name" | "slug" | "beschreibung" | "logo_url" | "farbe" | "mitglieder_anzahl"> & Partial<TeamInfo>;

/** Beitritts-Dialog — auch fuer die Einladungslinks. Das Kleingedruckte steht IMMER da (Jan, 31.10.2026):
 *  wer beitritt, stimmt zu, dass die Bestenlisten oeffentlich sein KOENNEN. */
export function BeitrittDialog({ name, oeffentlich, freigabeNoetig, busy, onJa, onNein }: {
  name: string; oeffentlich: boolean; freigabeNoetig: boolean; busy: boolean; onJa: () => void; onNein: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onNein}>
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-white p-5 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-2 text-lg font-bold text-slate-100">{t("team.join.title", { name })}</h3>
        <p className="mb-3 text-sm text-slate-300">{freigabeNoetig ? t("team.join.anfrage") : t("team.join.direkt")}</p>
        <p className="mb-4 text-xs leading-relaxed text-slate-400">
          {oeffentlich ? t("team.join.kleinOeffentlich") : t("team.join.kleinIntern")} {t("team.join.kleinAenderbar")}
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onNein} className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800">{t("common.cancel")}</button>
          <button onClick={onJa} disabled={busy} className="team-knopf rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50">
            {freigabeNoetig ? t("team.join.anfragen") : t("team.join.beitreten")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Statistik({ s, t }: { s: TeamStatistik; t: (k: string, p?: Record<string, string>) => string }) {
  const km = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 100000 ? 1 : 0)} km`);
  const zeit = (sek: number) => (sek < 3600 ? `${Math.round(sek / 60)} min` : `${(sek / 3600).toFixed(1)} h`);
  const kacheln: [string, string][] = [
    [t("team.stat.pumps"), s.pumps.toLocaleString()],
    [t("team.stat.strecke"), km(s.distance_m)],
    [t("team.stat.zeit"), zeit(s.time_s)],
    [t("team.stat.sessions"), s.sessions.toLocaleString()],
    [t("team.stat.laeufe"), s.runs.toLocaleString()],
    [t("team.stat.aktiv"), `${s.aktive} / ${s.mitglieder}`],
  ];
  return (
    <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
      {kacheln.map(([l, v]) => (
        <div key={l} className="rounded-xl border border-slate-800 bg-slate-900/60 p-2 text-center">
          <div className="team-akzent text-lg font-bold leading-tight">{v}</div>
          <div className="text-xs text-slate-400">{l}</div>
        </div>
      ))}
    </div>
  );
}

function Logbuch({ eintraege, t }: { eintraege: TeamLogbuchEintrag[]; t: (k: string, p?: Record<string, string>) => string }) {
  return (
    <Card className="mt-4 p-4">
      <h3 className="mb-1 font-semibold text-slate-100">{t("team.logbuch")}</h3>
      <p className="mb-2 text-xs text-slate-400">{t("team.logbuchHinweis")}</p>
      {eintraege.length === 0 ? <p className="text-sm text-slate-400">{t("team.logbuchLeer")}</p> : (
        <ul>
          {eintraege.map((e, i) => {
            const k = kennzahl(e.kennzahl);
            const p = { name: e.name ?? "—", was: t(k.labelKey), wert: k.fmt(e.wert),
                        vorher: e.vorher_name ?? "—", vorherWert: e.vorher_wert != null ? k.fmt(e.vorher_wert) : "" };
            const text = e.vorher_wert == null ? t("team.logbuch.start", p) : t("team.logbuch.gebrochen", p);
            const datum = e.gefahren_am ?? e.erfasst_am;
            return (
              <li key={i} className="flex items-start gap-2 border-t border-slate-800 py-2 text-sm first:border-t-0">
                <span className="w-20 shrink-0 text-xs text-slate-400">{datum ? new Date(datum).toLocaleDateString() : ""}</span>
                <span className="min-w-0 flex-1 text-slate-200">
                  {e.session_id ? <Link to={`/sessions/${e.session_id}`} className="hover:underline">{text}</Link> : text}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function Tafel({ tf, gast, t, onBild }: {
  tf: TeamTafelMitZeilen; gast: boolean; t: (k: string, p?: Record<string, string>) => string; onBild?: () => void;
}) {
  const k = kennzahl(tf.kennzahl);
  const filter = [
    tf.sportart !== "pumpfoil" ? t(`cls.sport.${tf.sportart}`) : null,
    tf.nur_teamspots ? t("team.tafel.nurTeamspots") : null,
    tf.nur_brett ? t("team.tafel.nurBrett") : null,
    !tf.accel_only ? t("team.tafel.mitGps") : null,
  ].filter(Boolean).join(" · ");
  return (
    <Card className="p-4">
      <div className="flex items-start gap-2">
        <h3 className="team-akzent min-w-0 flex-1 font-semibold">{t(k.labelKey)}</h3>
        {onBild && tf.zeilen.length > 0 && (
          <button onClick={onBild} title={t("team.bild.titel")} aria-label={t("team.bild.titel")}
            className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100">
            <ShareIcon className="h-4 w-4" />
          </button>
        )}
      </div>
      {filter && <p className="text-xs text-slate-400">{filter}</p>}
      {tf.zeilen.length === 0 ? <p className="mt-2 text-sm text-slate-400">{t("team.tafel.leer")}</p> : (
        <ol className="mt-2">
          {tf.zeilen.map((z) => {
            const wert = k.fmt(z.value);
            return (
              <li key={`${z.rang}-${z.user_id ?? z.name}`} className="flex items-center gap-2 border-t border-slate-800 py-1.5 first:border-t-0">
                <span className={`w-6 shrink-0 text-right text-sm font-bold ${z.rang <= 3 ? "team-akzent" : "text-slate-400"}`}>{z.rang}</span>
                {gast || !z.user_id ? (
                  <span className="team-farbe team-flaeche inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-slate-200">{z.initialen}</span>
                ) : <Avatar name={z.name} url={z.avatar_url} seed={z.user_id} userId={z.user_id} size={28} />}
                <span className="min-w-0 flex-1">
                  {gast || !z.user_id ? <span className="block truncate text-sm text-slate-100">{z.name ?? "—"}</span>
                    : <Link to={`/foiler/${z.user_id}`} className="pf-name block truncate text-sm text-slate-100 hover:text-brand-400">{z.name ?? "—"}</Link>}
                  {!gast && z.started_at && (
                    <span className="block truncate text-xs text-slate-400">
                      {new Date(z.started_at).toLocaleDateString()}{z.spot ? ` · ${z.spot}` : ""}
                    </span>
                  )}
                </span>
                {!gast && z.session_id
                  ? <Link to={`/sessions/${z.session_id}`} className="shrink-0 text-sm font-semibold text-slate-100 hover:underline">{wert}</Link>
                  : <span className="shrink-0 text-sm font-semibold text-slate-100">{wert}</span>}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

export default function Team() {
  const { slug = "" } = useParams();
  const { t } = useI18n();
  const nav = useNavigate();
  const gast = !getToken();
  const [kopf, setKopf] = useState<Kopf | null>(null);
  const [fehlt, setFehlt] = useState(false);
  const [period, setPeriod] = useState("30d");
  const [tafeln, setTafeln] = useState<TeamTafelMitZeilen[] | null>(null);
  const [mitglieder, setMitglieder] = useState<TeamMitglied[] | null>(null);
  const [dialog, setDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [stat, setStat] = useState<TeamStatistik | null>(null);
  const [logbuch, setLogbuch] = useState<TeamLogbuchEintrag[] | null>(null);
  const [bild, setBild] = useState<TeamTafelMitZeilen | null>(null);

  const laden = () => {
    if (gast) return;
    api.team(slug).then((d) => {
      if (d.slug && d.slug !== slug) { nav(`/teams/${d.slug}`, { replace: true }); return; }
      setKopf(d);
      if (d.darf_mitglieder) api.teamMitglieder(slug).then((m) => setMitglieder(m.mitglieder)).catch(() => setMitglieder(null));
    }).catch(() => setFehlt(true));
  };
  useEffect(laden, [slug]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (gast) {
      api.teamOeffentlich(slug, period).then((d) => { setKopf(d); setTafeln(d.tafeln); }).catch(() => setFehlt(true));
    } else if (kopf?.darf_bestenlisten) {
      api.teamBestenlisten(slug, period).then((d) => setTafeln(d.tafeln)).catch(() => setTafeln([]));
      api.teamStatistik(slug, period).then(setStat).catch(() => setStat(null));
    }
  }, [slug, period, gast, kopf?.darf_bestenlisten]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!gast && kopf?.darf_bestenlisten) api.teamLogbuch(slug).then(setLogbuch).catch(() => setLogbuch(null));
  }, [slug, gast, kopf?.darf_bestenlisten]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (fehlt) return <p className="text-sm text-slate-400">{t("team.nichtGefunden")}</p>;
  if (!kopf) return <p className="text-sm text-slate-400">{t("common.loading")}</p>;

  const freigabeNoetig = !kopf.automatisch_akzeptieren;
  const beitreten = () => {
    setBusy(true);
    api.teamBeitreten(slug).then((r) => {
      setDialog(false);
      setMeldung(r.status === "aktiv" ? t("team.join.erfolg") : t("team.join.angefragt"));
      laden();
    }).catch((e) => setMeldung(t(`team.err.${fehlerCode(e)}`))).finally(() => setBusy(false));
  };
  const austreten = () => {
    if (!window.confirm(kopf.mein_status === "angefragt" ? t("team.zurueckziehenFrage") : t("team.austretenFrage", { name: kopf.name }))) return;
    api.teamAustreten(slug).then(() => { setMitglieder(null); setTafeln(null); laden(); })
      .catch((e) => setMeldung(t(`team.err.${fehlerCode(e)}`)));
  };

  return (
    <div className="team-farbe w-full max-w-4xl" style={teamFarbStil(kopf.farbe)}>
      {!gast && (
        <Link to="/teams" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-300 hover:text-slate-200">
          <ChevronIcon className="h-4 w-4 rotate-180" /> {t("team.meine")}
        </Link>
      )}
      <div className="team-rand mb-4 flex items-start gap-4 border-b-2 pb-4">
        <TeamWappen name={kopf.name} logo={kopf.logo_url} farbe={kopf.farbe} size={64} />
        <div className="min-w-0 flex-1">
          <h2 className="team-akzent text-2xl font-bold leading-tight">{kopf.name}</h2>
          <p className="text-sm text-slate-400">
            {t("team.mitgliederAnzahl", { n: String(kopf.mitglieder_anzahl) })}
            {kopf.bestenlisten_oeffentlich && <> · {t("team.oeffentlichBadge")}</>}
          </p>
          {kopf.beschreibung && <p className="mt-2 whitespace-pre-line text-sm text-slate-300">{kopf.beschreibung}</p>}
        </div>
        {(kopf.meine_rolle === "leiter" || kopf.meine_rolle === "moderator") && (
          <Link to={`/teams/${kopf.slug}/einstellungen`} title={t("team.einstellungen")}
            className="shrink-0 rounded-xl border border-slate-700 p-2 text-slate-300 hover:bg-slate-800">
            <SettingsIcon className="h-5 w-5" />
          </Link>
        )}
      </div>

      {meldung && <p className="mb-3 rounded-xl border border-slate-700 bg-slate-900/60 p-3 text-sm text-slate-200">{meldung}</p>}

      {!gast && !kopf.mein_status && kopf.anmeldungen_zulassen && (
        <button onClick={() => setDialog(true)} className="team-knopf mb-4 rounded-xl px-4 py-2.5 font-semibold">
          {t("team.join.knopf")}
        </button>
      )}
      {kopf.mein_status === "angefragt" && (
        <p className="mb-4 text-sm text-slate-300">{t("team.join.wartet")}{" "}
          <button onClick={austreten} className="underline hover:text-slate-100">{t("team.zurueckziehen")}</button>
        </p>
      )}

      {kopf.chat_scope && (
        <button onClick={() => openChatOverlay(kopf.chat_scope as string, t("team.chatTitel", { name: kopf.name }))}
          className="mb-4 inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800">
          <ChatBubbleIcon className="team-akzent h-4 w-4" /> {t("team.chat")}
        </button>
      )}

      {(gast || kopf.darf_bestenlisten) && (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            {ZEITRAEUME.map(([k, lk]) => (
              <button key={k} onClick={() => setPeriod(k)}
                className={`rounded-full px-3 py-1 text-sm ${period === k ? "team-knopf font-semibold" : "border border-slate-700 text-slate-300 hover:bg-slate-800"}`}>
                {t(lk)}
              </button>
            ))}
          </div>
          {stat && <Statistik s={stat} t={t} />}
          {!tafeln ? <p className="text-sm text-slate-400">{t("common.loading")}</p> : tafeln.length === 0
            ? <p className="text-sm text-slate-400">{t("team.keineTafeln")}</p>
            : <div className="grid gap-3 sm:grid-cols-2">{tafeln.map((tf) => (
                <Tafel key={tf.id ?? tf.kennzahl} tf={tf} gast={gast} t={t} onBild={gast ? undefined : () => setBild(tf)} />
              ))}</div>}
          {logbuch && <Logbuch eintraege={logbuch} t={t} />}
        </>
      )}
      {!gast && !kopf.darf_bestenlisten && kopf.mein_status !== "angefragt" && (
        <p className="text-sm text-slate-400">{t("team.nurFuerMitglieder")}</p>
      )}

      {mitglieder && (
        <Card className="mt-4 p-4">
          <h3 className="mb-2 font-semibold text-slate-100">{t("team.mitglieder")}</h3>
          <div className="flex flex-wrap gap-3">
            {mitglieder.map((m) => (
              <Link key={m.user_id} to={`/foiler/${m.user_id}`} className="flex items-center gap-2 text-sm text-slate-200 hover:text-brand-400">
                <Avatar name={m.name} url={m.avatar_url} seed={m.user_id} size={28} link={false} />
                <span>{m.name}</span>
                {m.rolle !== "mitglied" && <span className="team-akzent text-xs">{t(`team.rolle.${m.rolle}`)}</span>}
              </Link>
            ))}
          </div>
        </Card>
      )}

      {kopf.mein_status === "aktiv" && kopf.meine_rolle !== "leiter" && (
        <button onClick={austreten} className="mt-6 text-sm text-slate-400 underline hover:text-slate-200">{t("team.austreten")}</button>
      )}

      {gast && (
        <p className="mt-6 text-sm text-slate-400">{t("team.gastHinweis")}</p>
      )}

      {bild && (
        <TeamTafelBild team={kopf} tafel={bild} onClose={() => setBild(null)}
          zeitraum={t(ZEITRAEUME.find(([k]) => k === period)?.[1] ?? "period.30d")} />
      )}

      {dialog && (
        <BeitrittDialog name={kopf.name} oeffentlich={!!kopf.oeffentlich} freigabeNoetig={freigabeNoetig}
          busy={busy} onJa={beitreten} onNein={() => setDialog(false)} />
      )}
    </div>
  );
}
