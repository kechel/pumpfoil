// Ein Event mit allen Bestenlisten: /teams/:slug/events/:id (Jan, 01.11.2026: „eine event-ansicht fuer alle
// team-mitglieder mit den ergebnissen bei klick auf die event-kachel"). Laufend = aktueller Stand, danach das
// Ergebnis (eingefroren 24 h nach dem Ende). Gaeste sehen das Event nur bei oeffentlichem Team, in Gastform
// (Rang, Name, Initialen, Wert) — dieselben Daten, die die oeffentliche Teamseite ohnehin liefert.
import { ZurueckPfeil } from "../components/ZurueckPfeil";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, FoilBand, getToken, TeamAuftritt, TeamEvent, TeamRolle, TeamTafelMitZeilen } from "../lib/api";
import { SettingsIcon, ShareIcon } from "../components/Icons";
import BestenlisteBildDialog from "../components/BestenlisteBildDialog";
import { teamInitialen } from "../components/TeamWappen";
import { TEAM_FARBEN } from "../lib/teamFarben";
import type { TeamWertungZeile } from "../lib/api";
import TeamEventsVerwalten from "../components/TeamEventsVerwalten";
import { Card } from "../components/ui";
import TeamWappen from "../components/TeamWappen";
import { dateiTeil } from "../lib/bestenlisteBild";
import { TeamHerkunft } from "../components/TeamHerkunft";
import TeamBanner from "../components/TeamBanner";
import TeamTafelBild from "../components/TeamTafelBild";
import { teamFarbStil } from "../lib/teamFarben";
import { EVENT_SUMMEN, eventGemessen, kennzahl } from "../lib/teamKennzahlen";
import { eventZeit, eventZeitraum, eventZeitraumGenau } from "../lib/teamEvents";
import { BeitrittDialog, Tafel } from "./Team";
import { fehlerCode } from "../lib/teamKennzahlen";
import { useI18n } from "../i18n";

/** Wie die Ergebnisse heissen: vorher Details, waehrenddessen aktueller Stand, danach Ergebnis. */
export function eventStandKey(status: TeamEvent["status"]): string {
  return status === "kommend" ? "team.event.details" : status === "beendet" ? "team.event.ergebnis" : "team.event.stand";
}

/** Vor dem Start (Jan, 01.11.2026): Countdown, gross das genaue Zeitfenster und bis wann Uploads zaehlen. */
/** Tage/Std./Min./Sek. bis `ziel`, sekundengenau. `klein` fuer die Zeile ueber den Bestenlisten eines laufenden Events. */
function Uhr({ ziel, klein = false, t }: { ziel: string; klein?: boolean; t: (k: string) => string }) {
  const [jetzt, setJetzt] = useState(Date.now());
  useEffect(() => { const h = setInterval(() => setJetzt(Date.now()), 1000); return () => clearInterval(h); }, []);
  const rest = Math.max(0, Math.floor((new Date(ziel).getTime() - jetzt) / 1000));
  const teile: [number, string][] = [
    [Math.floor(rest / 86400), "team.event.tage"], [Math.floor(rest / 3600) % 24, "team.event.stunden"],
    [Math.floor(rest / 60) % 60, "team.event.minuten"], [rest % 60, "team.event.sekunden"],
  ];
  return (
    <div className={`flex justify-center ${klein ? "gap-2" : "mb-5 gap-3"}`}>
      {teile.map(([n, k]) => (
        <div key={k} className={`rounded-xl border border-slate-800 bg-slate-900/60 text-center ${klein ? "min-w-[3.5rem] px-2 py-1" : "min-w-[4.5rem] px-3 py-2"}`}>
          <div className={`team-akzent font-bold tabular-nums ${klein ? "text-xl" : "text-3xl sm:text-4xl"}`}>{String(n).padStart(k === "team.event.tage" ? 1 : 2, "0")}</div>
          <div className="text-xs text-slate-400">{t(n === 1 && k === "team.event.tage" ? "team.event.tag" : k)}</div>
        </div>
      ))}
    </div>
  );
}

function Countdown({ ev, lang, t }: { ev: TeamEvent; lang: string; t: (k: string, p?: Record<string, string>) => string }) {
  const [von, bis] = eventZeitraumGenau(ev.start, ev.ende, ev.zeitzone, lang);
  return (
    <div className="team-rand rounded-2xl border-2 p-5 text-center">
      <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">{t("team.event.startIn")}</p>
      <Uhr ziel={ev.start} t={t} />
      <p className="text-xl font-bold text-slate-100 sm:text-2xl">{von}</p>
      <p className="text-sm text-slate-400">–</p>
      <p className="mb-4 text-xl font-bold text-slate-100 sm:text-2xl">{bis}</p>
      <p className="text-sm text-slate-300">{t("team.event.uploadsBis", { bis: eventZeit(ev.einfrieren_am, ev.zeitzone, lang) })}</p>
      <p className="mt-1 text-xs text-slate-400">{t("team.event.nochNichts")}</p>
    </div>
  );
}

/** Oeffentliche Event-Adresse zum Teilen (Jan, 01.11.2026) — nur bei oeffentlichem, freigegebenem Team; Gaeste sehen
 *  dort die Bestenlisten in Gastform. */
/** Gesamtsummen ueber alle Teilnehmer (Jan, 01.11.2026) — nur die angeklickten, Kacheln wie die Teamstatistik. */
const SUMMEN_SPALTEN: Record<number, string> = {
  1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-1 sm:grid-cols-3", 4: "grid-cols-2 sm:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5", 6: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6",
  7: "grid-cols-2 sm:grid-cols-4 lg:grid-cols-7",
};

function EventSummen({ ev, t }: { ev: TeamEvent; t: (k: string) => string }) {
  const auswahl = EVENT_SUMMEN.filter((k) => (ev.summen_auswahl ?? []).includes(k.key));
  return (
    <div className="mb-4">
      <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">{t("team.event.teamGesamt")}</p>
      {/* Je nach Anzahl ueber die ganze Breite (Jan, 06.11.2026). Klassen ausgeschrieben, sonst findet Tailwind sie nicht. */}
      <div className={`grid gap-2 ${SUMMEN_SPALTEN[Math.min(auswahl.length, 7)] ?? "grid-cols-2"}`}>
        {auswahl.map((k) => (
          <div key={k.key} className="team-rand rounded-xl border-2 bg-slate-900/60 p-3 text-center">
            <div className="team-akzent text-2xl font-bold leading-tight">{k.fmt(ev.summen?.[k.key] ?? 0)}</div>
            <div className="text-xs text-slate-400">{t(ev.summen?.[k.key] === 1 && k.labelKey1 ? k.labelKey1 : k.labelKey)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Team-Rangliste eines globalen Events (06.11.2026): je Team die Summe der besten N Mitglieder. */
/** Zeile des Teilen-Bilds einer Team-Rangliste — wie die Team-Bestenlisten der Community (Home.tsx TeamVergleich). */
function teamBildZeile(x: TeamWertungZeile, wert: string, ich: boolean) {
  const f = TEAM_FARBEN[x.farbe || "cyan"] ?? TEAM_FARBEN.cyan;
  return {
    rang: x.rang, name: x.name, initialen: teamInitialen(x.name), wert, ich, land: x.land || null,
    wappen: { logo: x.logo_url, flaeche: f.dunkelFlaeche ?? f.dunkel, schrift: f.dunkelAuf ?? "#020617",
              flaecheHell: f.hellFlaeche ?? f.hell, schriftHell: f.hellAuf ?? "#ffffff" },
  };
}

function TeamWertung({ tf, n, t, eigeneSlugs, standText, onBild }: { tf: TeamTafelMitZeilen; n: number; t: (k: string, p?: Record<string, string>) => string;
  eigeneSlugs: string[]; standText?: string | null; onBild?: () => void }) {
  const k = kennzahl(tf.kennzahl);
  // Top 10, dazu die eigenen Teams weiter hinten (wie die Community-Bestenliste, Jan 06.11.2026).
  const alle = tf.teams ?? [];
  const teams = [...alle.slice(0, 10), ...alle.slice(10).filter((x) => eigeneSlugs.includes(x.slug))];
  return (
    // Gleiche Karte und Ueberschrift wie die Fahrer-Liste links (Tafel), Jan 06.11.2026: „einheitlich".
    <Card className="p-4">
      <div className="flex items-start gap-2">
        <h3 className="team-akzent min-w-0 flex-1 font-semibold">{t("team.event.teams")} · {t(k.labelKey)}</h3>
        {onBild && alle.length > 0 && (
          <button onClick={onBild} title={t("team.bild.titel")} aria-label={t("team.bild.titel")}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-100">
            <ShareIcon className="h-4 w-4" /> {t("team.teilen")}
          </button>
        )}
      </div>
      <p className="text-xs text-slate-400">
        {[n === 0 ? t("team.event.wertungAlle") : t("team.event.wertungBeste", { n: String(n) }), standText].filter(Boolean).join(" · ")}
      </p>
      {teams.length === 0 && <p className="mt-2 text-sm text-slate-400">{t("team.event.keineTeams")}</p>}
      <ol className="mt-2">
        {teams.map((x) => (
          <li key={x.slug ?? x.name} className="flex items-center gap-2 border-t border-slate-800 py-1.5 first:border-t-0">
            <span className={`w-6 shrink-0 text-right text-sm font-bold ${x.rang <= 3 ? "team-akzent" : "text-slate-400"}`}>{x.rang}</span>
            <TeamWappen name={x.name} logo={x.logo_url} farbe={x.farbe} size={24} />
            <Link to={`/teams/${x.slug}`} className="min-w-0 flex-1 truncate text-sm text-slate-100 hover:text-brand-400">{x.name}</Link>
            <span className="text-xs text-slate-400">{x.fahrer}/{x.teilnehmer}</span>
            <span className="text-sm font-semibold tabular-nums text-slate-100">{k.fmt(x.value)}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function EventTeilen({ url, titel, t }: { url: string; titel: string; t: (k: string) => string }) {
  const [kopiert, setKopiert] = useState(false);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-sm text-slate-400">{t("team.event.teilen")}</span>
      <input readOnly value={url} onFocus={(e) => e.currentTarget.select()}
        className="min-w-[14rem] flex-1 rounded-lg bg-slate-950 px-3 py-1.5 font-mono text-sm text-slate-100" />
      <button className="team-knopf rounded-xl px-3 py-1.5 text-sm font-semibold"
        onClick={() => navigator.clipboard?.writeText(url).then(() => { setKopiert(true); setTimeout(() => setKopiert(false), 2000); }).catch(() => {})}>
        {kopiert ? t("team.kopiert") : t("team.kopieren")}
      </button>
      {typeof navigator.share === "function" && (
        <button className="rounded-xl border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
          onClick={() => navigator.share({ url, title: titel }).catch(() => {})}>{t("team.teilen")}</button>
      )}
    </div>
  );
}

export default function TeamEventSeite() {
  const { slug = "", id = "" } = useParams();
  const { t, lang } = useI18n();
  const gast = !getToken();
  const [team, setTeam] = useState<(TeamAuftritt & { id: number; bestenlisten_oeffentlich?: boolean; meine_rolle?: TeamRolle | null;
    anmeldungen_zulassen?: boolean; automatisch_akzeptieren?: boolean; oeffentlich?: boolean; mein_status?: string | null;
    offiziell?: boolean }) | null>(null);
  // Globale Events (06.11.2026): Bestenliste wahlweise nur fuer eines der eigenen Teams.
  const [meineTeams, setMeineTeams] = useState<{ slug: string; name: string }[]>([]);
  const teamFilter = "";   // Filter „Bestenliste fuer" entfernt (06.11.2026); der Server kennt ?team= weiter
  // Eine Bestenliste zur Zeit, per Auswahl wie die Community-Bestenliste (Jan, 06.11.2026).
  const [wahl, setWahl] = useState(0);
  const [laedt, setLaedt] = useState(false);
  const [bildTeams, setBildTeams] = useState<TeamTafelMitZeilen | null>(null);
  const [dialog, setDialog] = useState(false);
  // Ziel in der Gast-Kopfzeile (main.tsx GastRahmen); erst nach dem Einhaengen im DOM.
  const [kopfAktion, setKopfAktion] = useState<HTMLElement | null>(null);
  useEffect(() => { setKopfAktion(document.getElementById("gast-kopf-aktion")); }, []);
  const [busy, setBusy] = useState(false);
  const [ev, setEv] = useState<TeamEvent | null>(null);
  const [fehlt, setFehlt] = useState(false);
  const [bild, setBild] = useState<TeamTafelMitZeilen | null>(null);
  const [popup, setPopup] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [sports, setSports] = useState<string[]>(["pumpfoil"]);
  const [bands, setBands] = useState<FoilBand[]>([]);
  const [alleSpots, setAlleSpots] = useState<{ id: number; name: string }[]>([]);
  const nav = useNavigate();

  useEffect(() => {
    // Direkt das eine Event (01.11.2026) — auch aeltere, die in keiner Liste mehr stehen; Gaeste ueber den
    // oeffentlichen Weg (nur oeffentliche, freigegebene Teams).
    if (gast) {
      api.teamEventOeffentlich(slug, id).then((d) => { setTeam(d.team); setEv(d.event); }).catch(() => setFehlt(true));
    } else {
      api.team(slug).then(setTeam).catch(() => setFehlt(true));
      api.teamEvent(slug, id, teamFilter || undefined).then(setEv).catch(() => setFehlt(true));
    }
  }, [slug, id, gast, teamFilter]);
  useEffect(() => {
    if (gast || !ev?.global) return;
    api.teamsMine().then((l) => setMeineTeams(l.filter((x) => x.status === "aktiv" && x.slug !== slug)
      .map((x) => ({ slug: x.slug, name: x.name })))).catch(() => {});
  }, [gast, ev?.global, slug]);

  // Zurueck von „Anmelden und beitreten" (?beitreten=1): den Beitritts-Dialog gleich oeffnen — bestaetigen muss man
  // trotzdem, wegen des Kleingedruckten. Der Parameter wird danach entfernt (kein zweites Oeffnen beim Neuladen).
  const [such, setSuch] = useSearchParams();
  useEffect(() => {
    if (gast || !team || such.get("beitreten") !== "1") return;
    if (team.anmeldungen_zulassen && !team.mein_status) setDialog(true);
    setSuch({}, { replace: true });
  }, [team, gast]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Zahnrad fuer Leitung/Moderatoren (Jan, 01.11.2026): dasselbe Popup wie in der Verwaltung.
  const verwalter = !gast && (team?.meine_rolle === "leiter" || team?.meine_rolle === "moderator");
  const popupAuf = () => {
    api.communitySports().then((x) => setSports(Array.from(new Set(["pumpfoil", ...x.map((y) => y.sport)])))).catch(() => {});
    api.foilBands(true, "pumpfoil").then(setBands).catch(() => {});
    api.spotMap(false, "all").then((m) => setAlleSpots(m.filter((x) => x.spot_id != null)
      .map((x) => ({ id: x.spot_id as number, name: x.spot })).sort((a, b) => a.name.localeCompare(b.name)))).catch(() => {});
    setPopup(true);
  };
  const popupZu = () => {
    setPopup(false);
    api.teamEvent(slug, id, teamFilter || undefined).then(setEv).catch(() => nav(`/teams/${slug}`, { replace: true }));   // geloescht -> zurueck zum Team
  };

  // Beitreten direkt vom Event aus (Jan, 01.11.2026) — wer ueber einen geteilten Event-Link kommt, soll nicht erst
  // die Teamseite suchen muessen. Gaeste melden sich an und landen danach wieder hier.
  const beitreten = () => {
    setBusy(true);
    api.teamBeitreten(slug).then((r) => {
      setDialog(false);
      setMeldung(r.status === "aktiv" ? t("team.join.erfolg") : t("team.join.angefragt"));
      api.team(slug).then(setTeam).catch(() => {});
    }).catch((e) => setMeldung(t(`team.err.${fehlerCode(e)}`))).finally(() => setBusy(false));
  };

  // „Stand 14:32" in den Listen und im geteilten Bild, solange sich noch etwas aendern kann; danach „Endstand"
  // (Jan, 06.11.2026).
  const standFuer = (tf: TeamTafelMitZeilen | null | undefined): string | null => {
    if (!ev || !tf) return null;
    if (ev.status === "beendet") return t("team.event.endstand");
    if ((ev.status === "laeuft" || ev.status === "auswertung") && tf.stand) {
      // Mit Datum (Jan, 06.11.2026) — im geteilten Bild muss man sehen, von welchem Tag der Stand ist.
      return t("team.event.standUm", { zeit: new Date(tf.stand).toLocaleString(lang, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) });
    }
    return null;
  };

  if (fehlt) return <p className="text-sm text-slate-400">{t("team.nichtGefunden")}</p>;
  if (!team || !ev) return <p className="text-sm text-slate-400">{t("common.loading")}</p>;

  return (
    <div className="team-farbe w-full" style={teamFarbStil(team.farbe)}>
      {/* Zum Team: Wappen + Name als Link (der Zurueck-Pfeil steht in der Titelzeile darunter). */}
      {ev.global ? (
        <p className="mb-3 inline-flex items-center gap-2 text-sm text-slate-300">
          <TeamWappen name={team.name} logo={team.logo_url} farbe={team.farbe} size={20} />
          {team.name}
          <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:text-brand-300">{t("team.event.global")}</span>
        </p>
      ) : (
      <Link to={`/teams/${team.slug}`} className="mb-3 inline-flex items-center gap-2 text-sm text-slate-300 hover:text-slate-200">
        <TeamWappen name={team.name} logo={team.logo_url} farbe={team.farbe} size={20} />
        {team.name}
        <TeamHerkunft land={team.land} />
      </Link>
      )}
      {meldung && <p className="mb-3 rounded-xl border border-slate-700 bg-slate-900/60 p-3 text-sm text-slate-200">{meldung}</p>}
      {ev.banner_url ? <TeamBanner url={ev.banner_url} fokus={ev.banner_fokus} className="mb-4" />
        : ev.teambild_zeigen !== false && team.banner_url ? <TeamBanner url={team.banner_url} fokus={team.banner_fokus} className="mb-4" /> : null}
      <div className="team-rand mb-4 border-b-2 pb-4">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          {verwalter && (
            <button onClick={popupAuf} title={t("team.event.bearbeiten")} aria-label={t("team.event.bearbeiten")}
              className="order-last ml-auto shrink-0 rounded-xl border border-slate-700 p-2 text-slate-300 hover:bg-slate-800">
              <SettingsIcon className="h-5 w-5" />
            </button>
          )}
          <ZurueckPfeil fallback={`/teams/${team.slug}`} />
          <h2 className={`team-akzent text-2xl font-bold leading-tight`}>{ev.titel}</h2>
          <span className={`rounded-full px-2 py-0.5 text-xs ${ev.status === "laeuft" ? "team-knopf event-puls font-bold" : "bg-slate-800 font-semibold text-slate-300"}`}>
            {t(`team.event.status.${ev.status}`)}
          </span>
        </div>
        <p className="text-sm text-slate-400">
          <span className="font-semibold text-slate-200">{eventZeitraum(ev.start, ev.ende, ev.zeitzone, lang)}</span>
          {ev.spots.length > 0 && <> · {ev.spots.map((s) => s.name ?? `#${s.id}`).join(", ")}</>}
        </p>
        {ev.beschreibung && <p className="mt-2 whitespace-pre-line text-sm font-semibold text-slate-200">{ev.beschreibung}</p>}
        {ev.global && (
          <p className="mt-2 text-sm text-slate-300">
            {t("team.event.globalHinweis")}{" "}
            {/* Opt-out (Jan, 06.11.2026): Einstellungen › Privatsphaere, Karte „Globale Events". */}
            {gast ? t("team.event.globalOptOut")
              : <Link to="/einstellungen?tab=privat" className="text-brand-600 underline dark:text-brand-300">{t("team.event.globalOptOut")}</Link>}
          </p>
        )}
      </div>

      {/* Gaeste: „Anmelden und beitreten" oben in der Kopfzeile, in Pumpfoil-Farbe — man tritt zuerst pumpfoil.org bei
          (Jan, 01.11.2026). Angemeldete Nicht-Mitglieder: Beitreten in Teamfarbe hier auf der Seite. */}
      {team.anmeldungen_zulassen && !ev.global && gast && kopfAktion && createPortal(
        <Link to={`/login?next=${encodeURIComponent(`/teams/${team.slug}/events/${ev.id}?beitreten=1`)}`}
          className="shrink-0 rounded-xl bg-brand-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-brand-400 sm:px-4 sm:py-2">
          {t("team.join.anmeldenKnopf")}
        </Link>, kopfAktion)}
      {team.anmeldungen_zulassen && !ev.global && !gast && !team.mein_status && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button onClick={() => setDialog(true)} className="team-knopf shrink-0 rounded-xl px-4 py-2 font-semibold">{t("team.join.knopf")}</button>
          <span className="text-sm text-slate-400">{t("team.join.eventHinweis", { name: team.name })}</span>
        </div>
      )}
      {!gast && team.mein_status === "angefragt" && <p className="mb-4 text-sm text-slate-300">{t("team.join.wartet")}</p>}

      <h3 className="mb-2 text-lg font-bold text-slate-100">{t(eventStandKey(ev.status))}</h3>
      {ev.status === "kommend" ? (
        <Countdown ev={ev} lang={lang} t={t} />
      ) : (
        <>
        {/* Waehrend das Event laeuft (Jan, 01.11.2026): wie lange noch. */}
        {ev.status === "laeuft" && (
          <div className="team-rand mb-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-2xl border-2 p-3">
            <span className="text-sm font-semibold uppercase tracking-wide text-slate-400">{t("team.event.endetIn")}</span>
            <Uhr ziel={ev.ende} klein t={t} />
          </div>
        )}
        {(ev.summen_auswahl ?? []).length > 0 && <EventSummen ev={ev} t={t} />}
        {/* Eine Bestenliste zur Zeit (Auswahl wie in der Community), bei globalen Events daneben ihre Team-Rangliste. */}
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-300">
          {ev.tafeln.length > 1 && (
            <select value={Math.min(wahl, ev.tafeln.length - 1)} onChange={(x) => setWahl(Number(x.target.value))}
              className="rounded-xl border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100">
              {ev.tafeln.map((tf, i) => <option key={i} value={i}>{t(kennzahl(tf.kennzahl).labelKey)}</option>)}
            </select>
          )}
          {/* „Bestenliste für" (eigenes Team) wieder raus (Jan, 06.11.2026) — Top 10 + man selbst reicht. */}
          {/* Neu laden, solange sich noch etwas aendern kann (Jan, 06.11.2026). Der Server rechnet hoechstens alle 2 min neu. */}
          {!gast && (ev.status === "laeuft" || ev.status === "auswertung") && (
            <button onClick={() => { setLaedt(true); api.teamEvent(slug, id).then(setEv).catch(() => {}).finally(() => setLaedt(false)); }}
              disabled={laedt}
              className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-slate-700 px-3 py-1 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50">
              <svg viewBox="0 0 24 24" className={`h-4 w-4 ${laedt ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" />
              </svg>
              {t("team.event.neuLaden")}
            </button>
          )}
        </div>
        {(() => {
          const tf0 = ev.tafeln[Math.min(wahl, ev.tafeln.length - 1)];
          if (!tf0) return null;
          // Globale Events: Top 10 und die eigene Zeile darunter (wie die Community-Bestenliste, Jan 06.11.2026).
          const tf = ev.global ? { ...tf0, zeilen: [...tf0.zeilen.slice(0, 10),
            ...(tf0.eigene && tf0.eigene.rang > 10 && !teamFilter ? [tf0.eigene] : [])] } : tf0;
          const standText = standFuer(tf0);
          return (
            <div className={`grid gap-3 ${ev.global ? "sm:grid-cols-2" : ""}`}>
              <Tafel tf={tf} gast={gast} t={t} teamsZeigen={!!ev.global} ohneFilter sportZeigen={new Set(ev.tafeln.map((x) => x.sportart)).size > 1} zurueck={{ zurueck: `/teams/${team.slug}/events/${ev.id}`, zurueckText: ev.titel }} onBild={gast ? undefined : () => setBild(tf)} standText={standText} />
              {ev.global && <TeamWertung tf={tf} n={ev.team_wertung_n ?? 5} t={t} eigeneSlugs={meineTeams.map((x) => x.slug)} standText={standText}
                onBild={gast ? undefined : () => setBildTeams(tf0)} />}
            </div>
          );
        })()}
        </>
      )}

      {/* Teilen-Zeile unter den Bestenlisten, ueber den Regeln (Jan, 01.11.2026). */}
      {(team.bestenlisten_oeffentlich || ev.global) && <EventTeilen url={`${window.location.origin}/teams/${team.slug}/events/${ev.id}`} titel={ev.titel} t={t} />}

      {/* Event-Regeln als kleine Box statt Link auf die ganze Regelseite (Jan, 01.11.2026): nur was fuers Event gilt. */}
      <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <p className="mb-1 text-sm font-semibold text-slate-200">{t("team.event.regelnTitel")}</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
          {/* Was dieses Event misst und wie lange noch hochgeladen werden darf — als erste Punkte der Regeln statt oben
              im Kopf (Jan, 01.11.2026). */}
          {eventGemessen(ev, t) && <li>{t("team.event.gemessen")}: {eventGemessen(ev, t)}</li>}
          {ev.ohne_dateien && <li>{t("team.event.ohneDateienKurz")}</li>}
          {ev.status === "auswertung" && <li>{t("team.event.auswertungHinweis", { bis: eventZeit(ev.einfrieren_am, ev.zeitzone, lang) })}</li>}
          {/* Globale Events: deren eigene Regeln statt der Team-Event-Regeln („Teamleitung kann …", 07.11.2026). */}
          {t(ev.global ? "team.regeln.global.text" : "team.regeln.events.text").split("\n").filter(Boolean).map((z, i) => <li key={i}>{z}</li>)}
        </ul>
        {/* Haftungsausschluss (Jan, 01.11.2026): Events und ihre Zusagen sind Sache der Teams, nicht von pumpfoil.org. */}
        {!ev.global && <p className="mt-3 border-t border-slate-800 pt-3 text-sm text-slate-400">{t("team.event.disclaimer")}</p>}
      </div>

      {popup && (
        <TeamEventsVerwalten slug={team.slug} farbe={team.farbe} sports={sports} bands={bands} alleSpots={alleSpots}
          onMeldung={setMeldung} nurEvent={ev} onZu={popupZu} offiziell={!!team.offiziell} />
      )}

      {dialog && (
        <BeitrittDialog name={team.name} oeffentlich={!!team.oeffentlich} freigabeNoetig={!team.automatisch_akzeptieren}
          busy={busy} onJa={beitreten} onNein={() => setDialog(false)} />
      )}

      {bildTeams && (() => {
        // Team-Rangliste als Bild (Jan, 06.11.2026): Top 10, eigene Teams dahinter darunter, Wappen je Zeile.
        const k = kennzahl(bildTeams.kennzahl);
        const n = ev.team_wertung_n ?? 5;
        const alle = bildTeams.teams ?? [];
        const eigeneSlugs = meineTeams.map((x) => x.slug);
        const eigen = alle.slice(10).find((x) => eigeneSlugs.includes(x.slug));
        return (
          <BestenlisteBildDialog onClose={() => setBildTeams(null)} titel={t("team.bild.titel")} logoUrl={ev.global ? null : team.logo_url}
            dateiname={`${dateiTeil(ev.titel) || `event-${ev.id}`}-teams-${bildTeams.kennzahl}.jpg`}
            daten={{
              // Wie das Fahrer-Bild: Eventname als Titel, „Teamname · Zeitraum", dann was gewertet wird (07.11.2026).
              titel: ev.titel, titelAnpassen: true,
              unterzeile: `${team.name} · ${eventZeitraum(ev.start, ev.ende, ev.zeitzone, lang)}`,
              unterzeile2: [`${t("team.event.teams")} · ${t(k.labelKey)}`, n === 0 ? t("team.event.wertungAlle") : t("team.event.wertungBeste", { n: String(n) }),
                standFuer(bildTeams)].filter(Boolean).join(" · "),
              zeilen: alle.slice(0, 10).map((x) => teamBildZeile(x, k.fmt(x.value), eigeneSlugs.includes(x.slug))),
              eigene: eigen ? teamBildZeile(eigen, k.fmt(eigen.value), true) : null,
              leer: t("team.event.keineTeams"),
              abzeichen: ev.status === "laeuft" || ev.status === "auswertung" ? t(`team.event.status.${ev.status}`) : null,
            }} />
        );
      })()}
      {bild && <TeamTafelBild team={team} tafel={bild} onClose={() => setBild(null)} zeitraum={ev.titel} stand={standFuer(bild)}
        dateiBasis={dateiTeil(ev.titel) || `event-${ev.id}`} teamsZeigen={!!ev.global}
        ohneLogo={!!ev.global} eventZeile={[ev.titel, eventZeitraum(ev.start, ev.ende, ev.zeitzone, lang)]}
        abzeichen={ev.status === "laeuft" || ev.status === "auswertung" ? t(`team.event.status.${ev.status}`) : null} />}
    </div>
  );
}
