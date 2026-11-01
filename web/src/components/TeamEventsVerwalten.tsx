// Events anlegen/aendern/loeschen in den Team-Einstellungen (Stufe 3, docs/TEAMS.md). Nur die Teamleitung.
// Vorlagen fuellen Titel, Kennzahl und (Wochenende/Monat) das Zeitfenster vor — danach ist alles frei
// aenderbar. Zeiten gelten in der Zeitzone des Browsers; die wird mitgespeichert und auf der Teamseite so
// angezeigt, damit „Samstag 0 Uhr" fuer alle derselbe Zeitpunkt bleibt.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { teamFarbStil } from "../lib/teamFarben";
import { BannerBearbeiten } from "./TeamBanner";
import { api, FoilBand, TeamEvent, TeamEventTafel } from "../lib/api";
import { Card } from "./ui";
import { TrashIcon } from "./Icons";
import { TEAM_KENNZAHLEN, fehlerCode } from "../lib/teamKennzahlen";
import { EVENT_VORLAGEN, alsEingabe, eventZeitraum, neueEventTafel } from "../lib/teamEvents";
import { sortiereNachSport } from "../lib/sportClass";
import { bandLabel } from "../pages/Home";
import { useI18n } from "../i18n";

const eingabe = "w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100";
const knopf = "rounded-xl border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50";
const auswahl = "rounded-xl border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100";

type Entwurf = { id?: number; eingefroren?: boolean; banner_url?: string | null; banner_fokus?: string | null; titel: string; beschreibung: string; start: string; ende: string; tafeln: TeamEventTafel[]; spot_ids: number[]; vorlage: string | null };

function leer(): Entwurf {
  const v = EVENT_VORLAGEN[0];
  const [a, b] = v.zeit!();
  return { titel: "", beschreibung: "", start: alsEingabe(a), ende: alsEingabe(b), tafeln: [neueEventTafel()], spot_ids: [], vorlage: null };
}

export default function TeamEventsVerwalten({ slug, farbe, sports, bands, alleSpots, onMeldung }: {
  slug: string; farbe: string | null; sports: string[]; bands: FoilBand[]; alleSpots: { id: number; name: string }[]; onMeldung: (s: string) => void;
}) {
  const { t, lang } = useI18n();
  const [liste, setListe] = useState<TeamEvent[]>([]);
  const [e, setE] = useState<Entwurf | null>(null);
  const [spotWahl, setSpotWahl] = useState("");
  const laden = () => api.teamEvents(slug).then(setListe).catch(() => {});
  useEffect(() => { laden(); }, [slug]);   // eslint-disable-line react-hooks/exhaustive-deps

  const vorlage = (key: string) => {
    const v = EVENT_VORLAGEN.find((x) => x.key === key);
    if (!v || !e) return;
    const [a, b] = v.zeit ? v.zeit() : [new Date(e.start), new Date(e.ende)];
    setE({ ...e, vorlage: v.key, titel: t(v.titelKey), tafeln: v.tafeln.map((x) => ({ ...x })), start: alsEingabe(a), ende: alsEingabe(b) });
  };
  const tafel = (i: number, teil: Partial<TeamEventTafel>) => e && setE({ ...e, tafeln: e.tafeln.map((x, j) => (j === i ? { ...x, ...teil } : x)) });

  const speichern = () => {
    if (!e) return;
    const body = {
      titel: e.titel.trim(), beschreibung: e.beschreibung.trim() || null,
      start: new Date(e.start).toISOString(), ende: new Date(e.ende).toISOString(),
      zeitzone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
      tafeln: e.tafeln, spot_ids: e.spot_ids, vorlage: e.vorlage,
    };
    (e.id ? api.teamEventAendern(slug, e.id, body) : api.teamEventAnlegen(slug, body))
      .then(() => { setE(null); laden(); onMeldung(t("team.gespeichert")); })
      .catch((x) => onMeldung(t(`team.err.${fehlerCode(x)}`)));
  };
  const bearbeiten = (ev: TeamEvent) => setE({
    id: ev.id, eingefroren: ev.status === "beendet", banner_url: ev.banner_url, banner_fokus: ev.banner_fokus, titel: ev.titel, beschreibung: ev.beschreibung ?? "", start: alsEingabe(new Date(ev.start)),
    ende: alsEingabe(new Date(ev.ende)), spot_ids: ev.spot_ids, vorlage: ev.vorlage,
    tafeln: ev.tafeln.map(({ kennzahl, sportart, accel_only, nur_brett, foil_band }) => ({ kennzahl, sportart, accel_only, nur_brett, foil_band })),
  });
  const spotName = (id: number) => alleSpots.find((s) => s.id === id)?.name ?? `#${id}`;

  return (
    <Card className="mb-4 p-4">
      <h3 className="mb-2 font-semibold text-slate-100">{t("team.events")}</h3>

      {liste.map((ev) => (
        <div key={ev.id} className="flex flex-wrap items-center gap-2 border-t border-slate-800 py-2 first:border-t-0">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-slate-100">{ev.titel}</span>
            <span className="block text-xs text-slate-400">
              {t(`team.event.status.${ev.status}`)} · {eventZeitraum(ev.start, ev.ende, ev.zeitzone, lang)}
            </span>
          </span>
          {/* Loeschen nur im Popup (Jan, 01.11.2026); eingefrorene Events oeffnen es nur noch zum Loeschen. */}
          <button className={knopf} onClick={() => bearbeiten(ev)}>{t("team.event.bearbeiten")}</button>
        </div>
      ))}

      <button className="team-knopf mt-3 rounded-xl px-4 py-2 text-sm font-semibold" onClick={() => setE(leer())}>+ {t("team.event.neu")}</button>
      {/* Anlegen/Bearbeiten im Popup statt inline (Jan, 01.11.2026). Ein Klick daneben schliesst NICHT — sonst
          waeren halb eingegebene Events weg; zu geht es nur ueber Speichern oder Abbrechen. */}
      {/* Per Portal an <body>: die Karte darum (Unschaerfe-Hintergrund) macht sonst `fixed` zu „relativ zur Karte" —
          das Popup sass im falschen Element und wurde unscrollbar abgeschnitten. Teamfarbe deshalb hier neu setzen. */}
      {e && createPortal(
        <div className="team-farbe fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" style={teamFarbStil(farbe)}>
        <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-white p-5 dark:bg-slate-900">
          <h3 className="mb-3 text-lg font-bold text-slate-100">{e.id ? t("team.event.bearbeiten") : t("team.event.neu")}</h3>
          {e.eingefroren ? (
            <>
              <p className="mb-1 font-medium text-slate-100">{e.titel}</p>
              <p className="mb-4 text-sm text-slate-400">{t("team.err.event_eingefroren")}</p>
            </>
          ) : (<>
          {!e.id && (
            <>
              <label className="mb-1 block text-sm text-slate-300">{t("team.event.vorlage")}</label>
              <select value={e.vorlage ?? ""} onChange={(x) => vorlage(x.target.value)} className={`${auswahl} mb-3 w-full py-2`}>
                <option value="">{t("team.event.ohneVorlage")}</option>
                {EVENT_VORLAGEN.map((v) => <option key={v.key} value={v.key}>{t(v.titelKey)}</option>)}
              </select>
            </>
          )}
          {/* Eventbild (01.11.2026): erst bei einem gespeicherten Event — der Upload braucht dessen id. */}
          {e.id && (
            <BannerBearbeiten url={e.banner_url ?? null} fokus={e.banner_fokus ?? null} t={t} texte="team.eventbild"
              onFehler={(x) => onMeldung(t(`team.err.${fehlerCode(x)}`))}
              hochladen={(f) => api.teamEventBanner(slug, e.id!, f).then((r) => { setE((d) => d && { ...d, ...r }); laden(); })}
              fokusSetzen={(f) => api.teamEventBannerFokus(slug, e.id!, f).then((r) => { setE((d) => d && { ...d, ...r }); laden(); })}
              entfernen={() => api.teamEventBannerEntfernen(slug, e.id!).then(() => { setE((d) => d && { ...d, banner_url: null }); laden(); })} />
          )}
          <label className="mb-1 block text-sm text-slate-300">{t("team.event.titel")}</label>
          <input value={e.titel} maxLength={80} onChange={(x) => setE({ ...e, titel: x.target.value })} className={`${eingabe} mb-3`} />
          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-slate-300">{t("team.event.start")}
              <input type="datetime-local" value={e.start} onChange={(x) => setE({ ...e, start: x.target.value })} className={`${eingabe} mt-1`} />
            </label>
            <label className="text-sm text-slate-300">{t("team.event.ende")}
              <input type="datetime-local" value={e.ende} onChange={(x) => setE({ ...e, ende: x.target.value })} className={`${eingabe} mt-1`} />
            </label>
          </div>
          <label className="mb-1 block text-sm text-slate-300">{t("team.beschreibung")}</label>
          <textarea value={e.beschreibung} maxLength={1000} rows={2} onChange={(x) => setE({ ...e, beschreibung: x.target.value })} className={`${eingabe} mb-3`} />

          <p className="mb-1 text-sm text-slate-300">{t("team.bestenlisten")}</p>
          {e.tafeln.map((tf, i) => (
            <div key={i} className="mb-2 flex flex-wrap items-center gap-2 text-sm text-slate-300">
              <select value={tf.kennzahl} onChange={(x) => tafel(i, { kennzahl: x.target.value })} className={`${auswahl} min-w-0 flex-1`}>
                {TEAM_KENNZAHLEN.map((k) => <option key={k.key} value={k.key}>{t(k.labelKey)}</option>)}
              </select>
              <select value={tf.sportart} onChange={(x) => tafel(i, { sportart: x.target.value })} className={auswahl}>
                {sortiereNachSport(sports, (x) => x, t).map((s) => <option key={s} value={s}>{t(`cls.sport.${s}`)}</option>)}
              </select>
              <select value={tf.foil_band} onChange={(x) => tafel(i, { foil_band: x.target.value })} className={auswahl}>
                {bands.filter((b) => b.art !== "eigenes").map((b) => <option key={b.key} value={b.key}>{bandLabel(b, t)}</option>)}
                {!bands.length && <option value="all">{t("team.tafel.alleFoils")}</option>}
              </select>
              <label className="flex items-center gap-1"><input type="checkbox" checked={tf.accel_only} onChange={(x) => tafel(i, { accel_only: x.target.checked })} /> {t("team.tafel.nurBewegung")}</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={tf.nur_brett} onChange={(x) => tafel(i, { nur_brett: x.target.checked })} /> {t("team.tafel.nurBrett")}</label>
              {e.tafeln.length > 1 && (
                <button className={knopf} aria-label={t("common.delete")} onClick={() => setE({ ...e, tafeln: e.tafeln.filter((_, j) => j !== i) })}>
                  <TrashIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          {e.tafeln.length < 6 && <button className={`${knopf} mb-3`} onClick={() => setE({ ...e, tafeln: [...e.tafeln, neueEventTafel()] })}>+ {t("team.tafel.neu")}</button>}

          <p className="mb-1 text-sm text-slate-300">{t("team.event.spots")}</p>
          <div className="mb-2 flex flex-wrap gap-2">
            {e.spot_ids.map((id) => (
              <span key={id} className="team-farbe team-flaeche inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm text-slate-100">
                {spotName(id)}
                <button className="text-slate-400 hover:text-slate-100" aria-label={t("common.delete")}
                  onClick={() => setE({ ...e, spot_ids: e.spot_ids.filter((x) => x !== id) })}>×</button>
              </span>
            ))}
            {!e.spot_ids.length && <span className="text-sm text-slate-400">{t("team.event.alleSpots")}</span>}
          </div>
          <div className="mb-3 flex gap-2">
            <select value={spotWahl} onChange={(x) => setSpotWahl(x.target.value)} className={`${auswahl} min-w-0 flex-1 py-1.5`}>
              <option value="">{t("team.spotWaehlen")}</option>
              {alleSpots.filter((s) => !e.spot_ids.includes(s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button className={knopf} disabled={!spotWahl} onClick={() => { setE({ ...e, spot_ids: [...e.spot_ids, Number(spotWahl)] }); setSpotWahl(""); }}>
              + {t("team.spotHinzu")}
            </button>
          </div>

          </>)}
          <div className="flex flex-wrap gap-2">
            {!e.eingefroren && (
              <button className="team-knopf rounded-xl px-4 py-2 text-sm font-semibold" disabled={e.titel.trim().length < 2} onClick={speichern}>
                {e.id ? t("common.save") : t("team.event.anlegen")}
              </button>
            )}
            <button className={knopf} onClick={() => setE(null)}>{t("common.cancel")}</button>
            {e.id && (
              <button className={`${knopf} ml-auto inline-flex items-center gap-1.5 text-red-700 dark:text-red-300`} onClick={() => {
                if (!e.id || !window.confirm(t("team.event.loeschenFrage", { titel: e.titel }))) return;
                api.teamEventLoeschen(slug, e.id).then(() => { setE(null); laden(); })
                  .catch((x) => onMeldung(t(`team.err.${fehlerCode(x)}`)));
              }}><TrashIcon className="h-4 w-4" /> {t("common.delete")}</button>
            )}
          </div>
        </div>
        </div>,
        document.body,
      )}
    </Card>
  );
}
