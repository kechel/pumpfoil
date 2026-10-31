// Team-Einstellungen /teams/:slug/einstellungen (31.10.2026, docs/TEAMS.md).
// Leiter: alles. Moderatoren: nur Mitglieder annehmen/entfernen und die Einladungslinks ansehen
// (der Server prueft jede Aenderung selbst, s. server/app/api/teams.py).
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, FoilBand, TeamInfo, TeamMitglied, TeamTafel } from "../lib/api";
import { Avatar, Card } from "../components/ui";
import { ChevronIcon, TrashIcon } from "../components/Icons";
import TeamWappen from "../components/TeamWappen";
import TeamQr from "../components/TeamQr";
import { TEAM_FARBEN, teamFarbStil } from "../lib/teamFarben";
import { TEAM_KENNZAHLEN, fehlerCode, teamUrl } from "../lib/teamKennzahlen";
import { sortiereNachSport } from "../lib/sportClass";
import { bandLabel } from "./Home";
import { useI18n } from "../i18n";

const eingabe = "w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100";
const knopf = "rounded-xl border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50";

function Schalter({ an, onChange, titel, text }: { an: boolean; onChange: (v: boolean) => void; titel: string; text?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-2">
      <input type="checkbox" checked={an} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-4 w-4 shrink-0" />
      <span><span className="block text-sm font-medium text-slate-100">{titel}</span>
        {text && <span className="block text-sm text-slate-400">{text}</span>}</span>
    </label>
  );
}

export default function TeamEinstellungen() {
  const { slug = "" } = useParams();
  const { t } = useI18n();
  const nav = useNavigate();
  const [team, setTeam] = useState<TeamInfo | null>(null);
  const [fehlt, setFehlt] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  // Auftritt (Entwurf bis „Speichern")
  const [name, setName] = useState("");
  const [neuSlug, setNeuSlug] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  // Links, Mitglieder, Tafeln, Spots
  const [links, setLinks] = useState<{ join: string; apply: string } | null>(null);
  const [mitglieder, setMitglieder] = useState<{ mitglieder: TeamMitglied[]; anfragen: TeamMitglied[] } | null>(null);
  const [tafeln, setTafeln] = useState<TeamTafel[]>([]);
  const [sports, setSports] = useState<string[]>(["pumpfoil"]);
  const [bands, setBands] = useState<FoilBand[]>([]);
  const [alleSpots, setAlleSpots] = useState<{ id: number; name: string }[]>([]);
  const [spotWahl, setSpotWahl] = useState("");
  const [loeschName, setLoeschName] = useState("");

  const leiter = team?.meine_rolle === "leiter";
  const fehlerZeigen = (e: unknown) => setMeldung(t(`team.err.${fehlerCode(e)}`));
  const gespeichert = () => { setMeldung(t("team.gespeichert")); setTimeout(() => setMeldung(null), 2500); };

  const laden = () => api.team(slug).then((d) => {
    if (d.meine_rolle !== "leiter" && d.meine_rolle !== "moderator") { nav(`/teams/${d.slug}`, { replace: true }); return; }
    setTeam(d);
    setName(d.name);
    setNeuSlug(d.slug);
    setBeschreibung(d.beschreibung ?? "");
  }).catch(() => setFehlt(true));
  const mitgliederLaden = () => api.teamMitglieder(slug).then(setMitglieder).catch(() => {});

  useEffect(() => {
    laden();
    mitgliederLaden();
    api.teamEinladungen(slug).then(setLinks).catch(() => {});
  }, [slug]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!leiter) return;
    api.teamBestenlisten(slug, "30d").then((d) => setTafeln(d.tafeln.map(({ zeilen: _z, ...rest }) => rest))).catch(() => {});
    api.communitySports().then((s) => setSports(Array.from(new Set(["pumpfoil", ...s.map((x) => x.sport)])))).catch(() => {});
    api.foilBands(true, "pumpfoil").then(setBands).catch(() => {});
    api.spotMap(false, "all").then((m) => setAlleSpots(m.filter((x) => x.spot_id != null)
      .map((x) => ({ id: x.spot_id as number, name: x.spot })).sort((a, b) => a.name.localeCompare(b.name)))).catch(() => {});
  }, [leiter, slug]);

  if (fehlt) return <p className="text-sm text-slate-400">{t("team.nichtGefunden")}</p>;
  if (!team) return <p className="text-sm text-slate-400">{t("common.loading")}</p>;

  const einstellen = (body: Parameters<typeof api.teamEinstellen>[1]) =>
    api.teamEinstellen(slug, body).then((d) => {
      setTeam(d);
      gespeichert();
      if (d.slug !== slug) nav(`/teams/${d.slug}/einstellungen`, { replace: true });
    }).catch(fehlerZeigen);

  const linkUrl = (art: "join" | "apply") => links ? teamUrl(`/teams/${team.slug}/${art}-${links[art]}`) : "";
  const kopieren = (s: string) => navigator.clipboard?.writeText(s).then(() => setMeldung(t("team.kopiert"))).catch(() => {});
  const teilen = (s: string) => {
    if (navigator.share) navigator.share({ url: s, title: team.name }).catch(() => {});
    else kopieren(s);
  };

  const tafelAendern = (i: number, teil: Partial<TeamTafel>) => setTafeln((l) => l.map((x, j) => (j === i ? { ...x, ...teil } : x)));
  const tafelVerschieben = (i: number, d: number) => setTafeln((l) => {
    const n = [...l]; const j = i + d;
    if (j < 0 || j >= n.length) return l;
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });

  return (
    <div className="team-farbe w-full max-w-2xl" style={teamFarbStil(team.farbe)}>
      <Link to={`/teams/${team.slug}`} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-300 hover:text-slate-200">
        <ChevronIcon className="h-4 w-4 rotate-180" /> {team.name}
      </Link>
      <h2 className="mb-3 text-xl font-bold">{t("team.einstellungen")}</h2>
      {meldung && <p className="sticky top-2 z-10 mb-3 rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-slate-200">{meldung}</p>}

      {leiter && (
        <Card className="mb-4 p-4">
          <h3 className="mb-1 font-semibold text-slate-100">{t("team.freigabe.titel")}</h3>
          <p className="text-sm text-slate-300">{t(`team.freigabe.text.${team.freigabe ?? "keine"}`)}</p>
          {team.freigabe === "abgelehnt" && team.freigabe_notiz && (
            <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">{team.freigabe_notiz}</p>
          )}
          {team.freigabe === "frei" && team.auftritt_geaendert && <p className="mt-2 text-sm text-slate-400">{t("team.freigabe.geaendert")}</p>}
          {(team.freigabe === "keine" || team.freigabe === "abgelehnt") && (
            <button onClick={() => api.teamFreigabe(slug).then(() => laden()).catch(fehlerZeigen)} className="team-knopf mt-3 rounded-xl px-4 py-2 text-sm font-semibold">
              {t("team.freigabe.beantragen")}
            </button>
          )}
        </Card>
      )}

      {leiter && (
        <Card className="mb-4 p-4">
          <h3 className="mb-1 font-semibold text-slate-100">{t("team.auftritt")}</h3>
          <p className="mb-3 text-sm text-slate-400">{t("team.auftrittHinweis")}</p>
          <div className="mb-3 flex items-center gap-3">
            <TeamWappen name={team.name} logo={team.logo_url} farbe={team.farbe} size={64} />
            <label className={`${knopf} cursor-pointer`}>
              {t("team.logoHochladen")}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) api.teamLogo(slug, f).then(() => { laden(); gespeichert(); }).catch(fehlerZeigen);
              }} />
            </label>
          </div>
          <label className="mb-1 block text-sm text-slate-300">{t("team.name")}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={`${eingabe} mb-3`} />
          <label className="mb-1 block text-sm text-slate-300">{t("team.adresse")}</label>
          <div className="mb-1 flex items-center rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
            <span className="shrink-0 text-slate-400">pumpfoil.org/teams/</span>
            <input value={neuSlug} maxLength={40} onChange={(e) => setNeuSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              className="min-w-0 flex-1 bg-transparent text-slate-100 outline-none" />
          </div>
          <p className="mb-3 text-xs text-slate-400">{t("team.adresseAendernHinweis")}</p>
          <label className="mb-1 block text-sm text-slate-300">{t("team.beschreibung")}</label>
          <textarea value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)} maxLength={1000} rows={3} className={`${eingabe} mb-3`} />
          <p className="mb-1 text-sm text-slate-300">{t("team.farbe")}</p>
          <div className="mb-3 flex flex-wrap gap-2">
            {Object.keys(TEAM_FARBEN).map((f) => (
              <button key={f} title={f} onClick={() => einstellen({ farbe: f })}
                className={`team-farbe team-knopf h-8 w-8 rounded-full ${team.farbe === f ? "ring-2 ring-slate-100 ring-offset-2 ring-offset-slate-950" : ""}`}
                style={teamFarbStil(f)} aria-label={f} />
            ))}
          </div>
          <button onClick={() => einstellen({ name, slug: neuSlug, beschreibung })} className="team-knopf rounded-xl px-4 py-2 text-sm font-semibold">
            {t("common.save")}
          </button>
        </Card>
      )}

      {leiter && (
        <Card className="mb-4 p-4">
          <h3 className="mb-1 font-semibold text-slate-100">{t("team.beitritt")}</h3>
          <Schalter an={team.anmeldungen_zulassen} onChange={(v) => einstellen({ anmeldungen_zulassen: v })}
            titel={t("team.anmeldungenZulassen")} text={t("team.anmeldungenZulassenText")} />
          <Schalter an={team.automatisch_akzeptieren} onChange={(v) => einstellen({ automatisch_akzeptieren: v })}
            titel={t("team.automatischAkzeptieren")} text={t("team.automatischAkzeptierenText")} />
        </Card>
      )}

      {links && (
        <Card className="mb-4 p-4">
          <h3 className="mb-1 font-semibold text-slate-100">{t("team.links")}</h3>
          <p className="mb-3 text-sm text-slate-400">{t("team.linksHinweis")}</p>
          {(["join", "apply"] as const).map((art) => (
            <div key={art} className="mb-4 border-t border-slate-800 pt-3 first:border-t-0 first:pt-0">
              <p className="text-sm font-medium text-slate-100">{t(`team.link.${art}`)}</p>
              <p className="mb-2 text-sm text-slate-400">{t(`team.link.${art}Text`)}</p>
              <p className="mb-2 break-all rounded-lg bg-slate-950 px-3 py-2 font-mono text-xs text-slate-200">{linkUrl(art)}</p>
              <div className="mb-3 flex flex-wrap gap-2">
                <button onClick={() => kopieren(linkUrl(art))} className={knopf}>{t("team.kopieren")}</button>
                <button onClick={() => teilen(linkUrl(art))} className={knopf}>{t("team.teilen")}</button>
                {leiter && (
                  <button className={knopf} onClick={() => {
                    if (!window.confirm(t("team.linkNeuFrage"))) return;
                    api.teamEinladungNeu(slug, art).then((r) => setLinks((l) => (l ? { ...l, ...r } : l))).catch(fehlerZeigen);
                  }}>{t("team.linkNeu")}</button>
                )}
              </div>
              <TeamQr url={linkUrl(art)} dateiname={`${team.slug}-${art}`} />
            </div>
          ))}
        </Card>
      )}

      {leiter && (
        <Card className="mb-4 p-4">
          <h3 className="mb-1 font-semibold text-slate-100">{t("team.sichtbarkeit")}</h3>
          <Schalter an={team.oeffentlich} onChange={(v) => einstellen({ oeffentlich: v })}
            titel={t("team.oeffentlich")} text={t("team.oeffentlichText")} />
          {team.oeffentlich && !team.frei && <p className="mb-2 text-sm text-amber-700 dark:text-amber-300">{t("team.oeffentlichErstNachFreigabe")}</p>}
          <label className="mb-1 mt-2 block text-sm text-slate-300">{t("team.mitgliederSichtbar")}</label>
          <select value={team.mitglieder_sichtbar} onChange={(e) => einstellen({ mitglieder_sichtbar: e.target.value as "mitglieder" | "angemeldete" })}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100">
            <option value="mitglieder">{t("team.sichtbar.mitglieder")}</option>
            <option value="angemeldete">{t("team.sichtbar.angemeldete")}</option>
          </select>
        </Card>
      )}

      {leiter && (
        <Card className="mb-4 p-4">
          <h3 className="mb-1 font-semibold text-slate-100">{t("team.bestenlisten")}</h3>
          <p className="mb-3 text-sm text-slate-400">{t("team.bestenlistenHinweis")}</p>
          {tafeln.map((tf, i) => (
            <div key={i} className="mb-3 rounded-xl border border-slate-800 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <select value={tf.kennzahl} onChange={(e) => tafelAendern(i, { kennzahl: e.target.value })}
                  className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100">
                  <optgroup label={t("team.k.best")}>
                    {TEAM_KENNZAHLEN.filter((k) => !k.summe).map((k) => <option key={k.key} value={k.key}>{t(k.labelKey)}</option>)}
                  </optgroup>
                  <optgroup label={t("team.k.summe")}>
                    {TEAM_KENNZAHLEN.filter((k) => k.summe).map((k) => <option key={k.key} value={k.key}>{t(k.labelKey)}</option>)}
                  </optgroup>
                </select>
                <button onClick={() => tafelVerschieben(i, -1)} className={knopf} aria-label="↑">↑</button>
                <button onClick={() => tafelVerschieben(i, 1)} className={knopf} aria-label="↓">↓</button>
                <button onClick={() => setTafeln((l) => l.filter((_, j) => j !== i))} className={knopf} aria-label={t("common.delete")}>
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-300">
                <select value={tf.sportart} onChange={(e) => tafelAendern(i, { sportart: e.target.value })}
                  className="rounded-xl border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100">
                  {sortiereNachSport(sports, (x) => x, t).map((s) => <option key={s} value={s}>{t(`cls.sport.${s}`)}</option>)}
                </select>
                <select value={tf.foil_band} onChange={(e) => tafelAendern(i, { foil_band: e.target.value })}
                  className="rounded-xl border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100">
                  {bands.filter((b) => b.art !== "eigenes").map((b) => <option key={b.key} value={b.key}>{bandLabel(b, t)}</option>)}
                  {!bands.length && <option value="all">{t("team.tafel.alleFoils")}</option>}
                </select>
                <label className="flex items-center gap-1"><input type="checkbox" checked={tf.accel_only}
                  onChange={(e) => tafelAendern(i, { accel_only: e.target.checked })} /> {t("team.tafel.nurBewegung")}</label>
                <label className="flex items-center gap-1"><input type="checkbox" checked={tf.nur_brett}
                  onChange={(e) => tafelAendern(i, { nur_brett: e.target.checked })} /> {t("team.tafel.nurBrett")}</label>
                <label className="flex items-center gap-1"><input type="checkbox" checked={tf.nur_teamspots}
                  onChange={(e) => tafelAendern(i, { nur_teamspots: e.target.checked })} /> {t("team.tafel.nurTeamspots")}</label>
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button className={knopf} disabled={tafeln.length >= 20} onClick={() => setTafeln((l) => [...l, {
              kennzahl: "session_pumps", sportart: "pumpfoil", accel_only: true, nur_brett: false, foil_band: "all", nur_teamspots: false,
            }])}>+ {t("team.tafel.neu")}</button>
            <button className="team-knopf rounded-xl px-4 py-1.5 text-sm font-semibold"
              onClick={() => api.teamTafelnSetzen(slug, tafeln).then((r) => { setTafeln(r.tafeln); gespeichert(); }).catch(fehlerZeigen)}>
              {t("common.save")}
            </button>
          </div>
        </Card>
      )}

      {leiter && (
        <Card className="mb-4 p-4">
          <h3 className="mb-1 font-semibold text-slate-100">{t("team.spots")}</h3>
          <p className="mb-3 text-sm text-slate-400">{t("team.spotsHinweis")}</p>
          <div className="mb-3 flex flex-wrap gap-2">
            {(team.spots ?? []).map((s) => (
              <span key={s.id} className="team-farbe team-flaeche inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm text-slate-100">
                {s.name ?? `#${s.id}`}
                <button aria-label={t("common.delete")} className="text-slate-400 hover:text-slate-100" onClick={() =>
                  api.teamSpotsSetzen(slug, (team.spots ?? []).filter((x) => x.id !== s.id).map((x) => x.id)).then(() => laden()).catch(fehlerZeigen)}>×</button>
              </span>
            ))}
            {!(team.spots ?? []).length && <span className="text-sm text-slate-400">—</span>}
          </div>
          <div className="flex gap-2">
            <select value={spotWahl} onChange={(e) => setSpotWahl(e.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100">
              <option value="">{t("team.spotWaehlen")}</option>
              {alleSpots.filter((s) => !(team.spots ?? []).some((x) => x.id === s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button className={knopf} disabled={!spotWahl} onClick={() =>
              api.teamSpotsSetzen(slug, [...(team.spots ?? []).map((x) => x.id), Number(spotWahl)]).then(() => { setSpotWahl(""); laden(); }).catch(fehlerZeigen)}>
              + {t("team.spotHinzu")}
            </button>
          </div>
        </Card>
      )}

      {mitglieder && (
        <Card className="mb-4 p-4">
          <h3 className="mb-2 font-semibold text-slate-100">{t("team.mitglieder")}</h3>
          {mitglieder.anfragen.length > 0 && (
            <>
              <p className="mb-1 text-sm font-medium text-slate-300">{t("team.anfragen")}</p>
              {mitglieder.anfragen.map((m) => (
                <div key={m.user_id} className="flex items-center gap-3 border-t border-slate-800 py-2 first:border-t-0">
                  <Avatar name={m.name} url={m.avatar_url} seed={m.user_id} userId={m.user_id} size={32} />
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-100">{m.name}</span>
                  <button className="team-knopf rounded-xl px-3 py-1.5 text-sm font-semibold"
                    onClick={() => api.teamAnnehmen(slug, m.user_id).then(mitgliederLaden).catch(fehlerZeigen)}>{t("team.annehmen")}</button>
                  <button className={knopf} onClick={() => api.teamEntfernen(slug, m.user_id).then(mitgliederLaden).catch(fehlerZeigen)}>{t("team.ablehnen")}</button>
                </div>
              ))}
              <div className="mb-3" />
            </>
          )}
          {mitglieder.mitglieder.map((m) => (
            <div key={m.user_id} className="flex flex-wrap items-center gap-3 border-t border-slate-800 py-2 first:border-t-0">
              <Avatar name={m.name} url={m.avatar_url} seed={m.user_id} userId={m.user_id} size={32} />
              <span className="min-w-0 flex-1 truncate text-sm text-slate-100">{m.name}</span>
              {leiter && m.rolle !== "leiter" ? (
                <select value={m.rolle} onChange={(e) => {
                  const r = e.target.value as "moderator" | "mitglied" | "leiter";
                  if (r === "leiter" && !window.confirm(t("team.uebergebenFrage", { name: m.name }))) return;
                  api.teamRolle(slug, m.user_id, r).then(() => { mitgliederLaden(); if (r === "leiter") laden(); }).catch(fehlerZeigen);
                }} className="rounded-xl border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100">
                  <option value="mitglied">{t("team.rolle.mitglied")}</option>
                  <option value="moderator">{t("team.rolle.moderator")}</option>
                  <option value="leiter">{t("team.rolleUebergeben")}</option>
                </select>
              ) : <span className="team-akzent text-xs">{t(`team.rolle.${m.rolle}`)}</span>}
              {m.rolle !== "leiter" && (leiter || m.rolle === "mitglied") && (
                <button className={knopf} aria-label={t("team.entfernen")} onClick={() => {
                  if (window.confirm(t("team.entfernenFrage", { name: m.name }))) api.teamEntfernen(slug, m.user_id).then(mitgliederLaden).catch(fehlerZeigen);
                }}><TrashIcon className="h-4 w-4" /></button>
              )}
            </div>
          ))}
        </Card>
      )}

      {leiter && (
        <Card className="mb-4 border-red-700/40 p-4">
          <h3 className="mb-1 font-semibold text-red-700 dark:text-red-300">{t("team.loeschen")}</h3>
          <p className="mb-2 text-sm text-slate-300">{t("team.loeschenText", { name: team.name })}</p>
          <input value={loeschName} onChange={(e) => setLoeschName(e.target.value)} placeholder={team.name} className={`${eingabe} mb-2`} />
          <button disabled={loeschName.trim().toLowerCase() !== team.name.toLowerCase()}
            onClick={() => api.teamLoeschen(slug, loeschName).then(() => nav("/teams", { replace: true })).catch(fehlerZeigen)}
            className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-40">
            {t("team.loeschenKnopf")}
          </button>
        </Card>
      )}
    </div>
  );
}
