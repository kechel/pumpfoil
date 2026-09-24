import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { api, CommunitySession, CommunityGroup, SessionSummary, type Transfer } from "../lib/api";
import { foilLabel } from "../lib/foilLabel";
import { Card, Spinner, ErrorBox, Avatar, SELECT_SCHRUMPFT } from "../components/ui";
import { AccelToggle } from "../components/AccelToggle";
import { useAccelDefault } from "../lib/useAccelDefault";
import { UploadIcon, WaveIcon, SessionsIcon, RunsIcon, FoilIcon, TimerIcon, HeartPulseIcon, LocationIcon, ChatBubbleIcon, CompareIcon, SendIcon, ChevronIcon, PlayIcon, InstagramIcon, TikTokIcon } from "../components/Icons";
import { StartHelp } from "../components/StartHelp";
import { useCompare } from "../lib/compare";
import { fmtTime } from "../lib/time";
import { usePumpFmt } from "../lib/pumpRate";
// Rekord-Kacheln und Zeitfenster kommen aus der Community-Seite — eine Quelle, damit
// die Spot-Rekorde nicht anders aussehen als dieselben Rekorde eine Seite weiter.
import { RecordGrid, PERIODS } from "./Home";
import { SessionCard } from "../components/SessionCard";
import { UploadProgressCard } from "../components/UploadProgressCard";
import { TrackPreview } from "../components/TrackPreview";
import { SpotWeather } from "../components/SpotWeather";
import { SpotNotes } from "../components/SpotNotes";
import { getLastSession, setLastSessionsSearch, setLastSessionsFilter } from "../lib/lastSession";
import { setCompare } from "../lib/compare";
import { openChatOverlay } from "../components/DmWidget";
import { ytId, videoPlatform } from "../components/VideoModal";
import { SpotRenameRequest } from "../components/SpotRenameRequest";
import { useT } from "../i18n";
import { verwerfeSessionListen } from "../lib/pwaCache";
import { useWiederAufwachen } from "../lib/useWiederAufwachen";

const PAGE = 20;

// Hinweis oben in „Meine Sessions": heutige, aufeinanderfolgende Sessions (<=1 h)
// koennten zusammengehoeren -> Vorschlag zum Zusammenfuehren (mit Bestaetigung).
type MergeSug = { ids: number[]; count: number; place: string | null; date: string; tz?: string | null; sessions: { id: number; start: string; end: string }[] };

function MergeHint() {
  const t = useT();
  const nav = useNavigate();
  const [sugs, setSugs] = useState<MergeSug[]>([]);
  useEffect(() => { api.mergeSuggestions().then(setSugs).catch(() => {}); }, []);
  if (!sugs.length) return null;
  const dateStr = (d: string) => new Date(d + "T00:00:00").toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "numeric" });
  // Klick -> genau diese Sessions in den Vergleichskorb (bestehende Auswahl ersetzen) und
  // die Vergleichen-&-Mergen-Ansicht oeffnen (dort Vorschau + Zusammenfuehren).
  function review(s: MergeSug) {
    setCompare(s.sessions.map((x) => ({ sessionId: x.id, runIdx: null, owned: true, date: s.date })));
    nav("/vergleich");
  }
  return (
    <div className="mb-4 space-y-2">
      {sugs.map((s) => (
        <div key={s.ids.join("-")} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-brand-500/40 bg-brand-500/10 px-4 py-3 text-sm">
          <span className="text-slate-200">
            {t("merge.hint", { n: s.count })}{s.place ? ` · ${s.place}` : ""}
          </span>
          <span className="w-full text-xs text-slate-400 sm:w-auto">
            {dateStr(s.date)} · {s.sessions.map((x) => `${fmtTime(x.start, s.tz)}–${fmtTime(x.end, s.tz)}`).join(" · ")}
          </span>
          <button onClick={() => review(s)}
            className="ml-auto rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-brand-400">
            {t("merge.action")}
          </button>
        </div>
      ))}
    </div>
  );
}

// Eingehende Session-Übertragungen (jemand will mir seine Session geben, z. B. mit meiner
// Uhr gefahren). Ansehen / Annehmen (→ gehört mir) / Ablehnen. Nur in „Meine Sessions".
function IncomingTransfers({ onAccepted }: { onAccepted: () => void }) {
  const t = useT();
  const nav = useNavigate();
  const [rows, setRows] = useState<Transfer[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  useEffect(() => { api.transfersIncoming().then(setRows).catch(() => {}); }, []);
  if (!rows.length) return null;
  const dateStr = (iso: string | null) => iso ? new Date(iso).toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
  function accept(tr: Transfer) {
    setBusy(tr.id);
    api.transferAccept(tr.id)
      .then(async () => { setRows((l) => l.filter((x) => x.id !== tr.id)); await invalidateSessionListCache(); onAccepted(); })
      .catch((e) => alert(String(e))).finally(() => setBusy(null));
  }
  function decline(tr: Transfer) {
    setBusy(tr.id);
    api.transferDecline(tr.id)
      .then(() => setRows((l) => l.filter((x) => x.id !== tr.id)))
      .catch((e) => alert(String(e))).finally(() => setBusy(null));
  }
  return (
    <div className="mb-4 space-y-2">
      {rows.map((tr) => (
        <div key={tr.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-brand-500/40 bg-brand-500/10 px-4 py-3 text-sm">
          <SendIcon className="h-5 w-5 shrink-0 text-brand-400" />
          <span className="text-slate-200">
            <b>{t("transfer.incomingTitle")}</b> {t("transfer.from", { name: tr.other?.display_name || "?" })}
            {tr.session?.place ? ` · ${tr.session.place}` : ""}{tr.session?.started_at ? ` · ${dateStr(tr.session.started_at)}` : ""}
          </span>
          <div className="ml-auto flex gap-2">
            {tr.session && (
              <button onClick={() => nav(`/sessions/${tr.session!.id}`)}
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700">{t("transfer.view")}</button>
            )}
            <button disabled={busy === tr.id} onClick={() => accept(tr)}
              className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-brand-400 disabled:opacity-50">{t("transfer.accept")}</button>
            <button disabled={busy === tr.id} onClick={() => decline(tr)}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50">{t("transfer.decline")}</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// Kleiner, wegklickbarer Hinweis: Session lange druecken -> markieren & vergleichen.
function CompareTip() {
  const t = useT();
  const [hidden, setHidden] = useState(() => localStorage.getItem("hideCompareTip") === "1");
  if (hidden) return null;
  return (
    <div className="mb-4 flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-400">
      <CompareIcon className="h-4 w-4 shrink-0 text-brand-400" />
      <span className="flex-1">{t("compare.tip")}</span>
      <button onClick={() => { localStorage.setItem("hideCompareTip", "1"); setHidden(true); }}
        className="shrink-0 rounded p-1 text-slate-500 hover:text-slate-300" aria-label="OK">✕</button>
    </div>
  );
}

// Zurück-Navigation: geladene Items + Scroll-Position je Filter/Monat merken, damit man aus
// der Detailansicht an dieselbe Stelle der Liste zurückkehrt statt oben zu landen (Feedback
// Nutzer-Feedback). Nur im Speicher -> überlebt Client-Navigation, bei echtem Reload frisch.
const listCache = new Map<string, { items: SessionSummary[]; offset: number; hasMore: boolean; scrollY: number }>();
const communityCache = new Map<string, { items: CommunityGroup[]; offset: number; more: boolean }>();

// Nach dem Löschen einer Session muss der Listen-Cache raus, sonst zeigt die
// zurückkehrende Liste die gelöschte Session noch (Feedback Jan).
// Erzwingt beim naechsten Mount einen Refetch (statt Cache) — noetig z.B. nach Merge/
// Loeschen, weil die noch gemountete Liste beim Wegnavigieren sonst ihre veralteten
// Items zurueck in den Cache schreibt.
//
// Seit 20.09.2026 raeumt das ZUSAETZLICH die Listen aus den PWA-Caches (s. `verwerfeSessionListen`):
// `/api/sessions` und `/api/community/sessions-grouped` laufen auf StaleWhileRevalidate, der
// Service Worker lieferte dem frischen Abruf also weiter den alten Stand samt geloeschter
// Session. Der Rueckgabewert ist das Versprechen dafuer — wer gleich danach zur Liste
// navigiert, muss es ABWARTEN, sonst mountet sie vor dem Aufraeumen.
let listDirty = false;
export function invalidateSessionListCache(): Promise<void> {
  listDirty = true;
  listCache.clear();
  communityCache.clear();
  return verwerfeSessionListen();
}

// Eine BEARBEITETE Session in den gecachten Listen ersetzen. Absichtlich nicht
// `invalidateSessionListCache()`: das wirft den ganzen Cache weg, und damit auch die
// Scroll-Position, zu der man nach dem Zurück aus dem Detail gerade wieder wollte. Wer nur sein
// Foil ändert, soll nicht oben in der Liste landen.
//
// Die Antwort von PATCH /sessions/{id}/meta ist eine vollständige SessionSummary (derselbe
// Serializer wie die Liste, nur mit vollem statt schlankem Analyse-Teil) — es reicht also, sie
// über den alten Eintrag zu legen. Ohne das blieb Foil/Stab/Beschriftung in der Liste bis zum
// nächsten echten Reload alt (Feedback Jan, 27.08.): `revalidateHead` mischt nur NEUE IDs ein und
// fasst bekannte Einträge bewusst nicht an.
export function updateCachedSession(fresh: SessionSummary) {
  for (const eintrag of listCache.values()) {
    if (!eintrag.items.some((x) => x.id === fresh.id)) continue;
    eintrag.items = eintrag.items.map((x) => (x.id === fresh.id ? { ...x, ...fresh } : x));
  }
  // Community-/Spot-Listen zeigen dieselbe Session in Tages-Gruppen — dort ist es ein ANDERER
  // Typ (`CommunitySession`, Schlüssel `session_id`) mit nur einem Teil der Felder. Deshalb nicht
  // das ganze Objekt drüberlegen, sondern genau die Felder, die man bearbeiten kann und die die
  // Community-Karte zeigt.
  for (const eintrag of communityCache.values()) {
    eintrag.items = eintrag.items.map((g) => {
      if (!g.sessions?.some((x) => x.session_id === fresh.id)) return g;
      return {
        ...g,
        sessions: g.sessions.map((x) => (x.session_id === fresh.id
          ? { ...x, caption: fresh.caption, foil: fresh.foil ?? x.foil, setup: fresh.setup ?? x.setup,
              sport_class: fresh.sport_class ?? x.sport_class }
          : x)),
      };
    });
  }
}

function monthLabel(m: string) {
  return new Date(m + "-01T00:00:00").toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

// Vereinheitlichte Sessions-Seite: Umschalter Meine / <Homespot> / Alle + Spotsuche.
// scope=mine -> eigene Sessions; sonst Community-Sessions (optional je Spot gefiltert).
// Scroll-to-top-FAB: erscheint nach längerem Scrollen rechts unten NEBEN dem Chat-FAB (right-4);
// ist der Vergleichs-Button (compare-bar, right-20) sichtbar, rückt er links davor.
function ScrollTopFab() {
  const cmp = useCompare();
  const [show, setShow] = useState(false);
  const [right, setRight] = useState(80);
  useEffect(() => {
    const h = () => setShow(window.scrollY > 1000);
    window.addEventListener("scroll", h, { passive: true });
    h();
    return () => window.removeEventListener("scroll", h);
  }, []);
  useEffect(() => {
    if (!show) return;
    const el = document.getElementById("compare-bar");
    setRight(el ? 96 + el.offsetWidth : 80);   // 80 = right-20; +Breite+16 wenn Vergleich sichtbar
  }, [show, cmp.length]);
  if (!show) return null;
  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Scroll to top"
      style={{ right }}
      className="fixed bottom-20 z-[1100] flex h-12 w-12 items-center justify-center rounded-full border border-slate-700 bg-slate-900/90 text-slate-200 shadow-lg backdrop-blur transition-colors hover:bg-slate-800 md:bottom-4"
    >
      <ChevronIcon className="h-5 w-5 -rotate-90" />
    </button>
  );
}

// Nimmt beide Session-Formen (eigene Liste und Community-Brief) — nur die Felder, die beide haben.
const setupLabels = (s: { setup?: { stab?: { brand: string; model: string; size: string } | null;
                                   mast_len_cm?: number | null;
                                   board?: { name: string } | null } | null }) => ({
  stab: s.setup?.stab ? `${s.setup.stab.brand} ${s.setup.stab.model} ${s.setup.stab.size}`.trim() : null,
  mast: s.setup?.mast_len_cm ? `${s.setup.mast_len_cm} cm` : null,
  board: s.setup?.board?.name || null,
});

export default function Sessions() {
  const t = useT();
  const [sp, setSp] = useSearchParams();
  const scope = sp.get("scope") === "all" ? "all" : "mine";
  const spot = sp.get("spot") || "";   // spot_id (String) — Name wird für Anzeige/Chat aufgelöst
  const [homespot, setHomespot] = useState("");
  const [homespotId, setHomespotId] = useState<number | null>(null);
  const [spots, setSpots] = useState<{ id: number; name: string; water?: string | null }[]>([]);
  // Eigene Spots (Namen) — im Auswahlfeld stehen sie in einer eigenen Gruppe OBEN. Gemeldet
  // 22.08.: „unter Meine nur Spots mit eigenen Sessions, oder zumindest die eigenen oben".
  // Bewusst nicht die anderen entfernen: das Feld ist auch der Sprung in fremde Spots.
  const [meineSpots, setMeineSpots] = useState<string[]>([]);
  const nameById = useMemo(() => Object.fromEntries(spots.map((s) => [String(s.id), s.name])), [spots]);
  const spotName = spot ? (nameById[spot] ?? spot) : "";
  const hsRef = homespotId != null ? String(homespotId) : homespot;   // Homespot als id, Fallback Name
  const [myName, setMyName] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);   // bump nach angenommener Übertragung → Liste neu laden
  // accel|alle-Umschalter für beide Tabs; smarter Default (accel wenn Accel-Daten vorhanden).
  // `false` = IMMER mit „alle" starten, auch wenn der Nutzer selbst Accel-Daten hat (Jan,
  // 31.08.). Die Liste ist eine Übersicht; „nur präzise" verschweigt sonst still die Sessions
  // der Mitfahrer, deren Uhr keine verwertbaren Beschleunigungsdaten liefert.
  const [accelOnly, setAccelOnly, setAccelAuto, resetAccelAuto] = useAccelDefault(false);
  // Spot gewechselt oder verlassen: eine vorherige Automatik ("Spot ohne Accel-Sessions")
  // wieder verwerfen, damit wieder der Default aus der eigenen Uhr gilt.
  useEffect(() => { resetAccelAuto(); }, [spot]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Wie auf der Startseite der ABGELEITETE Wert (s. settings.py): ohne ihn fehlte der
    // Reiter „Homespot" allen, die ihn nie im Profil gesetzt haben — also fast allen.
    api.getSettings().then((s) => {
      setHomespot((s.homespot_effective as string) ?? (s.homespot as string) ?? "");
      setHomespotId((s.homespot_effective_id as number | null) ?? (s.homespot_id as number | null) ?? null);
    }).catch(() => {});
    api.mySpots().then((l) => setMeineSpots(l.map((x) => x.spot))).catch(() => {});
    api.spotMap(false).then((m) => setSpots(   // alle Spots (auch GPS) als {id,name}
      // Gewaesser mitnehmen: „Berlin 3" und „Berlin 4" sind sonst im Auswahlfeld nicht
      // auseinanderzuhalten (Jan, 24.08.).
      m.filter((x) => x.spot_id != null).map((x) => ({ id: x.spot_id as number, name: x.spot, water: x.water }))
       .sort((a, b) => a.name.localeCompare(b.name)))).catch(() => {});
    api.getProfile().then((p) => setMyName(p.display_name)).catch(() => {});
  }, []);

  // Aktuelle Listen-Query merken (scope/spot/filter/month), damit der Zurück-Link im Detail
  // wieder in denselben Scope/Filter zurückführt.
  useEffect(() => { setLastSessionsSearch(`?${sp.toString()}`); }, [sp]);
  // Denselben Filter auch als Objekt merken: „älter/neuer" im Detail navigiert damit innerhalb
  // GENAU dieser Liste (Jan, 17.09.2026). `accelOnly` steht bewusst nicht in der URL, deshalb
  // hier eigens mit hinein; `sport` ist auf der Sessions-Seite immer „alle".
  useEffect(() => {
    setLastSessionsFilter({
      scope: spot ? "all" : (scope === "all" ? "all" : "mine"),
      spot: spot || undefined,
      sport: "all",
      accelOnly,
      filter: sp.get("filter") === "other" ? "other" : "pump",
      month: sp.get("month") || undefined,
    });
  }, [sp, scope, spot, accelOnly]);

  const isMine = scope === "mine" && !spot;
  const setScope = (next: "mine" | "all", nextSpot = "") => {
    const n = new URLSearchParams();
    if (next === "all") n.set("scope", "all");
    if (nextSpot) n.set("spot", nextSpot);
    setSp(n);
  };

  const title = isMine
    ? `${t("sessions.title")}${myName ? ` · ${myName}` : ""}`
    : spot
      ? `${t("sessions.title")} · ${spotName}`
      : `${t("sessions.title")} · ${t("nav.allSessions.short")}`;
  // Zweite Zeile des Spots (Gewaesser bzw. Steg/Ortslage) auch in die Ueberschrift: „Berlin 3"
  // allein sagt nicht, welcher der drei Berliner Spots gemeint ist (Jan, 25.08.). Kleiner und
  // ruhiger gesetzt als der Name — der Titel soll nicht zur Zeile werden.
  const spotZusatz = spot ? (spots.find((x) => String(x.id) === spot)?.water ?? "") : "";

  const tabCls = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${active ? "bg-brand-500 text-slate-950" : "text-slate-200 hover:bg-slate-800"}`;

  return (
    <div>
      <ScrollTopFab />
      {/* Überschrift ganz oben (wie auf allen Seiten) */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SessionsIcon className="h-7 w-7 text-brand-400" />
        <h2 className="text-2xl font-bold">
          {title}
          {spotZusatz && spotZusatz !== spotName && (
            <span className="ml-2 text-base font-normal text-slate-400">· {spotZusatz}</span>
          )}
        </h2>
      </div>

      <UploadProgressCard />

      {/* Scope-Umschalter + Spotsuche */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex gap-1 rounded-xl border border-slate-800 bg-slate-900/60 p-1">
          <button className={tabCls(isMine)} onClick={() => setScope("mine")}>{t("nav.mySessions.short")}</button>
          {homespot && (
            <button className={`inline-flex items-center gap-1 ${tabCls(spot === hsRef)}`} onClick={() => setScope("all", hsRef)}><LocationIcon className="h-4 w-4" /> {homespot}</button>
          )}
          <button className={tabCls(scope === "all" && !spot)} onClick={() => setScope("all")}>{t("nav.allSessions.short")}</button>
        </div>
        {/* `min-w-0` ist hier das Entscheidende: das Feld sitzt in einer Flex-Zeile, und ein
            Flex-Kind hat `min-width: auto` — es schrumpft also NICHT unter seinen Inhalt, sondern
            schiebt die ganze Seite auf. Die längste Spot-Beschriftung ist derzeit 48 Zeichen
            („Peyrolles-en-Provence 3 · Plan d'eau de Plantain"), das sprengt jedes Handy (Jans
            Meldung 01.09.). Dazu `max-w-full` + `truncate`, damit der Name zugeklappt abgeschnitten
            wird statt überzulaufen — aufgeklappt zeigt der Browser ihn ohnehin vollständig. */}
        <select
          value={spot}
          onChange={(e) => setScope("all", e.target.value)}
          className={`${SELECT_SCHRUMPFT} rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-2 text-sm text-slate-100`}
        >
          <option value="">{t("all.allSpots")}</option>
          {(() => {
            const eigene = spots.filter((s) => meineSpots.includes(s.name));
            const rest = spots.filter((s) => !meineSpots.includes(s.name));
            const opt = (s: { id: number; name: string; water?: string | null }) => (
              <option key={s.id} value={String(s.id)}>
                {s.name}{s.water && s.water !== s.name ? ` · ${s.water}` : ""}
              </option>
            );
            // Ohne eigene Spots (neues Konto) gar keine Gruppen — sonst steht da eine leere Gruppe.
            if (eigene.length === 0) return spots.map(opt);
            return (
              <>
                <optgroup label={t("sessions.mySpots")}>{eigene.map(opt)}</optgroup>
                <optgroup label={t("sessions.otherSpots")}>{rest.map(opt)}</optgroup>
              </>
            );
          })()}
        </select>
        {spot && <SpotChatToggle spot={spotName} t={t} />}
        {/* Anderen Spot-Namen VORSCHLAGEN (nicht selbst setzen) — nur bei einem echten Spot mit
            numerischer id; Namens-Gruppen aus dem Altbestand haben keine Spot-Zeile, die man
            umbenennen koennte. Begruendung fuers Vorschlagen statt Aendern steht in der
            Komponente. */}
        {spot && /^\d+$/.test(spot) && (
          <SpotRenameRequest spotId={Number(spot)} spotName={spotName} />
        )}
        {/* Weg zur Import-Seite — in DERSELBEN Zeile wie die Filter, links vom Accel-Umschalter,
            beide zusammen rechtsbuendig (Jan, 07.09.2026). Deshalb traegt der LINK jetzt `ml-auto`
            und der Umschalter nicht mehr: `ml-auto` schiebt alles ab hier nach rechts, die zwei
            bleiben dabei ein Block. Bewusst nur der Link und nicht der Datei-Knopf — der Upload
            gehoert auf die Import-Seite, wo auch die Anleitung zum Garmin-Export steht.
            Nur in „Meine": ein Upload erzeugt immer eine EIGENE Session. */}
        {isMine && (
          <Link to="/import"
            className="ml-auto inline-flex items-center gap-1.5 text-sm text-brand-400 hover:underline">
            <UploadIcon className="h-4 w-4" /> {t("import.title")}
          </Link>
        )}
        <AccelToggle value={accelOnly} onChange={setAccelOnly} className={isMine ? "" : "ml-auto"} />
      </div>


      {isMine && <IncomingTransfers onAccepted={() => setReloadKey((k) => k + 1)} />}
      {isMine && <MergeHint />}
      <CompareTip />

      {/* Rekorde an DIESEM Spot — ganz oben, ueber dem Wetter (Nutzer-Idee aus dem Feedback,
          Jan 06.09.). Dieselben Kacheln und dieselben Zeitfenster wie auf der Community-Seite,
          nur eben auf den Spot eingegrenzt. */}
      {spot && <SpotRecords spot={spot} accelOnly={accelOnly} />}
      {spot && <SpotWeather spot={spot} />}
      {/* Spot-Beschreibungen der Community: zwischen Wetter und Session-Liste (Jan, 24.08.).
          Nur bei einem echten Spot (numerische id) — Namens-Gruppen aus dem Altbestand haben
          keine Spot-Zeile, an der eine Beschreibung haengen koennte. */}
      {spot && /^\d+$/.test(spot) && <SpotNotes spotId={Number(spot)} />}
      {isMine ? <MySessionsList key={reloadKey} myName={myName} accelOnly={accelOnly}
                                onShowAll={() => setAccelAuto(false)} /> : <CommunityList name="" spot={spot} accelOnly={accelOnly} onShowAll={() => setAccelAuto(false)} />}
    </div>
  );
}

// Button neben den Scope-Umschaltern: direkt in den Fullscreen-Spot-Chat
// öffnet das Chat-Overlay direkt im Spot-Chat, beschriftet mit Spotnamen.
function SpotChatToggle({ spot, t }: { spot: string; t: (k: string) => string }) {
  return (
    <button
      onClick={() => openChatOverlay(`spot:${spot}`, spot)}
      className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800"
    >
      <ChatBubbleIcon className="h-4 w-4 text-brand-400" /> {t("chat.spotChat")} {spot}
    </button>
  );
}

// --- Eigene Sessions (mit Monats-/Sportart-Filter) --------------------------

// Eigene Session im Zwischenzustand: GPS ist schon da (status "live"), Accel lädt noch hoch.
// Liste/Detail pollen und ersetzen sie automatisch durch die fertige Version.
const isInterim = (s: SessionSummary) => (s.owned ?? true) && s.status === "live";

export function ProcessingNote() {
  const t = useT();
  return (
    <div className="mt-2 flex items-center gap-2 rounded-lg bg-brand-500/10 px-2.5 py-1.5 text-sm text-slate-200">
      <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-brand-400/40 border-t-brand-400" />
      {t("session.loadingAccel")}
    </div>
  );
}

function MySessionsList({ myName, accelOnly, onShowAll }:
    { myName: string | null; accelOnly: boolean; onShowAll?: () => void }) {
  const t = useT();
  const accelRef = useRef(accelOnly); accelRef.current = accelOnly;
  const firstAccel = useRef(true);
  const [sp, setSp] = useSearchParams();
  const [items, setItems] = useState<SessionSummary[]>([]);
  const [months, setMonths] = useState<{ month: string; count: number }[]>([]);
  const initFilter: "pump" | "other" = sp.get("filter") === "other" ? "other" : "pump";
  const [month, setMonth] = useState(sp.get("month") || "");
  const [filter, setFilter] = useState<"pump" | "other">(initFilter);
  const [avatar, setAvatar] = useState<string | null>(null);
  // Aussortierte: Anzahl am Tab, und wie viele frisch sind (letzte 7 Tage) -> nur die heben hervor.
  // So verfällt die Hervorhebung von selbst; alte Aussortierte stupsen niemanden mehr an.
  const [sortedOut, setSortedOut] = useState(0);
  const [sortedOutNew, setSortedOutNew] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filterRef = useRef(initFilter);
  const monthRef = useRef(month);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const hasMoreRef = useRef(true);
  const loadingRef = useRef(false);
  // Generationszaehler gegen veraltete Antworten beim Filter-/Monatswechsel (s. fetchPage).
  const meinLaufRef = useRef(0);
  const cacheKey = () => `${filterRef.current}|${monthRef.current}|${accelRef.current}`;
  const restoreRef = useRef(false);                 // nach Cache-Restore die markierte Karte einscrollen
  const itemsRef = useRef<SessionSummary[]>([]);    // stets aktuelle Items (für Cache beim Unmount)

  const syncUrl = (f: string, m: string) => {
    const n = new URLSearchParams(sp);
    f === "other" ? n.set("filter", "other") : n.delete("filter");
    m ? n.set("month", m) : n.delete("month");
    setSp(n, { replace: true });
  };

  async function fetchPage(monthVal: string, replace: boolean) {
    // Beim NEU-Aufbau gewinnt immer der neue Abruf: eine noch laufende Anfrage gehoert zum alten
    // Filter, ihre Sperre darf den Wechsel nicht blockieren. Dieselbe Wettlauf-Klasse wie in der
    // Community-Liste (s. `laufRef` dort) — nur faellt sie hier weniger auf, weil „meine"
    // Sessions ueberall dieselben Karten zeigen und nur die Auswahl falsch waere.
    if (replace) meinLaufRef.current += 1; else if (loadingRef.current) return;
    if (!replace && !hasMoreRef.current) return;
    const lauf = meinLaufRef.current;
    loadingRef.current = true; setLoading(true); setError(null);
    try {
      const off = replace ? 0 : offsetRef.current;
      // `fresh` bei jedem NEU-Aufbau der Liste: sonst beantwortet der Service Worker
      // (StaleWhileRevalidate) den Wechsel zwischen „meine / alle / am Spot" aus seinem Cache,
      // und man sieht denselben Stand wie vorher — Jans Befund 21.09.2026. Beim Nachladen
      // weiterer Seiten ist der Cache dagegen erwuenscht (alte Seiten aendern sich nicht).
      const page = await api.sessions({ limit: PAGE, offset: off, month: monthVal || undefined, filter: filterRef.current, accelOnly: accelRef.current, fresh: replace });
      if (lauf !== meinLaufRef.current) return;   // Filter hat gewechselt -> Antwort ist veraltet
      offsetRef.current = off + page.length;
      hasMoreRef.current = page.length === PAGE;
      setHasMore(hasMoreRef.current);
      setItems((prev) => (replace ? page : [...prev, ...page]));
    } catch (e) {
      if (lauf === meinLaufRef.current) setError(String(e));
    } finally {
      if (lauf === meinLaufRef.current) { loadingRef.current = false; setLoading(false); }
    }
  }

  // Stale-while-revalidate: nach dem Cache-Restore die erste Seite frisch holen und
  // seither hochgeladene Sessions oben einfügen. So bleibt Scroll/Position beim Zurück
  // aus dem Detail erhalten, aber neue Sessions erscheinen sofort (Cache „greift" online nicht dauerhaft).
  async function revalidateHead(monthVal: string) {
    const lauf = meinLaufRef.current;
    try {
      // `fresh: true` geht am Service-Worker-Cache vorbei. Ohne das bekaeme die Nachpruefung
      // seit 15.09. dieselbe gecachte Antwort wie die Anzeige (StaleWhileRevalidate) und
      // koennte nie etwas Neues melden.
      const fresh = await api.sessions({ limit: PAGE, offset: 0, month: monthVal || undefined, filter: filterRef.current, accelOnly: accelRef.current, fresh: true });
      if (lauf !== meinLaufRef.current) return;   // waehrend des Abrufs den Filter gewechselt
      const known = new Set(itemsRef.current.map((s) => s.id));
      const added = fresh.filter((s) => !known.has(s.id));
      // Bekannte Eintraege MITziehen, nicht nur neue einfuegen: sonst bleibt eine anderswo
      // geaenderte Session (anderes Geraet, anderer Tab, native App) hier alt stehen. Gleiche
      // Zeile wie im Zwischen-Refresh weiter unten.
      const frisch = new Map(fresh.map((s) => [s.id, s]));
      const aktualisiert = itemsRef.current.map((p) => {
        const f = frisch.get(p.id);
        return f ? { ...p, ...f } : p;
      });
      const geaendert = aktualisiert.some((p, i) => p !== itemsRef.current[i]);
      if (!added.length) {
        if (!geaendert) return;
        itemsRef.current = aktualisiert;
        setItems(aktualisiert);
        listCache.set(cacheKey(), { items: aktualisiert, offset: offsetRef.current, hasMore: hasMoreRef.current, scrollY: window.scrollY });
        return;
      }
      // Nach Datum einsortieren (neueste zuerst) — nicht blind vorne anhaengen:
      // eine zusammengefuehrte Session hat ein aelteres Datum, gehoert nicht an den Kopf.
      const merged = [...added, ...aktualisiert].sort((a, b) => (a.started_at < b.started_at ? 1 : -1));
      itemsRef.current = merged;
      offsetRef.current += added.length;   // vorne eingefügte Einträge -> Folge-Offset anheben
      setItems(merged);
      listCache.set(cacheKey(), { items: merged, offset: offsetRef.current, hasMore: hasMoreRef.current, scrollY: window.scrollY });
    } catch (e) { /* offline/Fehler: Cache bleibt einfach stehen */ }
  }

  useEffect(() => {
    api.sessionMonths(filterRef.current).then(setMonths).catch(() => {});
    api.getProfile().then((p) => {
      setAvatar(p.avatar_url);
      setSortedOut(p.sorted_out ?? 0);
      setSortedOutNew(p.sorted_out_new ?? 0);
    }).catch(() => {});
    const cached = listCache.get(cacheKey());
    if (!listDirty && cached && cached.items.length) {
      setItems(cached.items);
      offsetRef.current = cached.offset;
      hasMoreRef.current = cached.hasMore;
      setHasMore(cached.hasMore);
      restoreRef.current = true;  // nach dem Rendern die markierte Karte einscrollen
      itemsRef.current = cached.items;
      revalidateHead(monthRef.current);   // im Hintergrund neue Sessions nachziehen
    } else {
      listDirty = false;
      fetchPage(monthRef.current, true);
    }
    const obs = new IntersectionObserver((e) => { if (e[0].isIntersecting) fetchPage(monthRef.current, false); }, { rootMargin: "300px" });
    if (sentinelRef.current) obs.observe(sentinelRef.current);
    return () => {
      obs.disconnect();
      // Aktuellen Listen-Zustand + Scroll-Position sichern (für die Rückkehr aus dem Detail).
      listCache.set(cacheKey(), { items: itemsRef.current, offset: offsetRef.current, hasMore: hasMoreRef.current, scrollY: window.scrollY });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rueckkehr aus dem Hintergrund: `revalidateHead` haengt sonst nur am Mount, eine schon offene
  // Liste bliebe beliebig lange alt (Jan, 15.09.2026). Seit 21.09. ueber `useWiederAufwachen`,
  // weil `visibilitychange` den Laptop-Zuklappen-Fall nicht abdeckt — dort feuert nur `focus`.
  useWiederAufwachen(() => revalidateHead(monthRef.current));

  // accel|alle umgeschaltet -> Liste zurücksetzen und neu laden (Erst-Mount überspringen).
  useEffect(() => {
    if (firstAccel.current) { firstAccel.current = false; return; }
    hasMoreRef.current = true; offsetRef.current = 0;
    const cached = listCache.get(cacheKey());
    if (cached && cached.items.length) {
      setItems(cached.items); offsetRef.current = cached.offset; hasMoreRef.current = cached.hasMore; setHasMore(cached.hasMore);
      itemsRef.current = cached.items;
      revalidateHead(monthRef.current);
    } else {
      setItems([]); fetchPage(monthRef.current, true);
    }
  }, [accelOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  // Items immer im Ref spiegeln + nach dem Restore die markierte Karte in den Blick scrollen
  // (robuster als eine Pixel-Position: unabhängig vom Scroll-Container). Doppeltes rAF, damit
  // das Layout nach dem Render steht.
  useEffect(() => {
    itemsRef.current = items;
    if (restoreRef.current && items.length) {
      restoreRef.current = false;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        document.getElementById("session-highlight")?.scrollIntoView({ block: "center" });
      }));
    }
  }, [items]);

  // Auto-Refresh, solange eine eigene Session noch im Upload/Analyse-Zwischenzustand ist:
  // erste Seite still nachladen und die betroffenen Karten in-place durch die fertige Version
  // ersetzen (Läufe/Längen/Pumps „snappen" nach). Läuft nur, wenn wirklich eine „live" ist.
  useEffect(() => {
    if (!items.some(isInterim)) return;
    const iv = setInterval(() => {
      api.sessions({ limit: PAGE, offset: 0, month: monthRef.current || undefined, filter: filterRef.current, accelOnly: accelRef.current })
        .then((fresh) => setItems((prev) => prev.map((p) => fresh.find((f) => f.id === p.id) ?? p)))
        .catch(() => {});
    }, 4000);
    return () => clearInterval(iv);
  }, [items]);

  function changeMonth(v: string) {
    setMonth(v); monthRef.current = v; hasMoreRef.current = true; offsetRef.current = 0;
    listCache.delete(cacheKey());
    syncUrl(filterRef.current, v); fetchPage(v, true);
  }
  function changeFilter(f: "pump" | "other") {
    // Aussortierte Sessions haben meist gar keine Accel-Laeufe — mit „nur Accel" sieht man bei
    // „Aussortiert (8)" eine LEERE Liste (gemeldet 22.08.). Beim Umschalten deshalb auf „alle".
    if (f === "other" && accelRef.current) onShowAll?.();
    setFilter(f); filterRef.current = f; setMonth(""); monthRef.current = ""; hasMoreRef.current = true; offsetRef.current = 0;
    listCache.delete(cacheKey());
    syncUrl(f, ""); api.sessionMonths(f).then(setMonths).catch(() => {}); fetchPage("", true);
  }

  const lastViewed = getLastSession();

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          <button onClick={() => changeFilter("pump")} className={`rounded-lg px-2.5 py-1.5 text-xs ${filter === "pump" ? "bg-brand-500 font-semibold text-slate-950" : "bg-slate-800 text-slate-200"}`}>{t("sessions.filterPump")}</button>
          {/* Aussortiert: Anzahl direkt am Tab, und amber hervorgehoben, solange etwas FRISCHES
              (letzte 7 Tage) darin liegt. Der Erklärungstext steht bewusst erst in der Ansicht
              selbst — auf der Übersicht soll kein Absatz stehen (Jan, 05.08.). */}
          <button onClick={() => changeFilter("other")}
            className={`rounded-lg px-2.5 py-1.5 text-xs ${
              filter === "other" ? "bg-brand-500 font-semibold text-slate-950"
              : sortedOutNew > 0 ? "border border-amber-500/60 bg-amber-500/15 font-semibold text-amber-800 dark:text-amber-200"
              : "bg-slate-800 text-slate-200"}`}
            title={t("sessions.filterOtherHint")}>
            {t("sessions.filterOther")}{sortedOut > 0 ? ` (${sortedOut})` : ""}
          </button>
        </div>
        <select value={month} onChange={(e) => changeMonth(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-100">
          <option value="">{t("sessions.allMonths")}</option>
          {months.map((m) => <option key={m.month} value={m.month}>{monthLabel(m.month)} ({m.count})</option>)}
        </select>
        {/* Alle Aussortierten löschen — Server erzwingt owner+other; hier nur Komfort + Confirm. */}
        {filter === "other" && items.length > 0 && (
          <button
            onClick={() => {
              if (!confirm(t("sessions.deleteAllOtherConfirm", { n: items.length }))) return;
              api.deleteAllOtherSessions()
                .then(async (r) => { await invalidateSessionListCache(); setItems([]); alert(t("sessions.deleteAllOtherDone", { n: r.deleted })); })
                .catch((e) => alert(String(e)));
            }}
            className="ml-auto rounded-lg border border-red-500/50 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-500/10 dark:text-red-400"
          >
            {t("sessions.deleteAllOther")}
          </button>
        )}
      </div>

      {error && <div className="mb-4"><ErrorBox message={error} /></div>}

      {/* Hier — und nur hier — die Erklärung: warum eine Aufnahme aussortiert wurde, dass man sie
          selbst zuordnen kann, und der Tipp mit der Standard-Sportart im Profil. Auslöser war ein
          Nutzer, dessen Session (Schiffswelle mitgenommen) stillschweigend hier landete und der
          nur durch Nachfragen erfuhr, wo sie steckt und dass er sie selbst einordnen darf. */}
      {filter === "other" && (
        <Card className="mb-4 space-y-2 p-4 text-sm">
          <p className="text-slate-300">{t("sessions.otherWhy")}</p>
          <p className="text-slate-300">{t("sessions.otherAssign")}</p>
          <p className="text-slate-300">
            {t("sessions.otherDefault")}{" "}
            <Link to="/foils" className="text-brand-700 underline hover:no-underline dark:text-brand-300">
              {t("sessions.otherDefaultLink")}
            </Link>
          </p>
        </Card>
      )}

      {/* `!error`: ein gescheiterter Abruf (offline, Serverfehler) ist kein leeres Konto —
          sonst stand unter der Fehlermeldung auch noch die Begruessung fuer Erstnutzer. */}
      {items.length === 0 && !loading && !error ? (
        month || filter === "other" ? (
          <Card className="flex flex-col items-center gap-3 p-10 text-center text-slate-300">
            <WaveIcon className="h-10 w-10 text-slate-400" />
            <p>{t(month ? "sessions.noneMonth" : "sessions.noneOther")}</p>
          </Card>
        ) : (
          /* "Leer" ist NUR im ungefilterten Pumpfoil-Tab der Erstnutzer-Fall -> dieselbe
             Starthilfe wie im Homebereich (StartHelp).
             ACHTUNG, hier lag ein Fehler (gemeldet Jan, 17.08.): geprueft wurde allein der
             MONATSFILTER, der Tab-Filter aber nicht. Wer Sessions hat und nur nichts
             Aussortiertes, bekam im Tab "Aussortiert" die Begrüssung "Willkommen! So kommt deine
             erste Session hierher" samt "Uhr einrichten" — fuer einen langjaehrigen Nutzer
             sinnlos. Ein leerer FILTER ist kein leeres Konto: jede kuenftige Filterdimension
             muss hier mit rein, sonst kehrt der Fehler zurueck. */
          <StartHelp />
        )
      ) : (
        <div className="space-y-3">
          {items.map((s) => (
            <SessionCard
              key={s.id}
              sessionId={s.id}
              owned={s.owned ?? true}
              startedAt={s.started_at}
              tz={s.tz}
              endedAt={s.ended_at}
              spot={s.place_name}
              foil={s.foil ? foilLabel(s.foil) : null}
              {...setupLabels(s)}
              deviceLabel={s.device_label}
              placement={s.placement}
              caption={s.caption}
              avatarName={myName}
              avatarUrl={avatar}
              thumbUrl={s.thumb_url}
              photoCount={s.photo_count}
              youtubeUrl={s.youtube_url}
              videoUrl={s.video_url}
              likeCount0={s.like_count ?? 0}
              liked0={!!s.liked}
              trackPreview={s.track_preview}
              highlight={s.id === lastViewed}
              sportClass={s.sport_class}
              dataQuality={s.data_quality}
              needsClassification={!!s.needs_classification}
              stats={
                <>
                  {s.analysis && <SessionStats a={s.analysis} />}
                  {isInterim(s) && <ProcessingNote />}
                </>
              }
              statusBadge={<EigeneAbzeichen transferTo={s.transfer_to} status={s.status} />}
            />
          ))}
        </div>
      )}

      <div ref={sentinelRef} className="h-8" />
      {loading && <div className="py-4"><Spinner /></div>}
      {!hasMore && items.length > 0 && <p className="py-4 text-center text-xs text-slate-400">{t("sessions.listEnd")}</p>}
    </div>
  );
}

// --- Community-Sessions (alle / je Spot) ------------------------------------

// Eine Community-Session als Listenkarte (identisch für Einzel-Session und aufgeklappte
// Gruppen-Mitglieder). `nested` = leicht eingerückt/gedämpft innerhalb einer Gruppe.
// Auch von der Foil-Detailseite benutzt — dieselbe Karte fuer dieselbe Sorte Eintrag.
export function renderCommunitySession(s: CommunitySession, t: (k: string) => string, lastViewed: number | null) {
  return (
    <SessionCard
      key={s.session_id}
      sessionId={s.session_id}
      startedAt={s.started_at}
      tz={s.tz}
      endedAt={s.ended_at}
      spot={s.spot}
      foil={s.foil ? foilLabel(s.foil) : null}
      sportLabel={s.sport_class && s.sport_class !== "pumpfoil" ? t(`cls.sport.${s.sport_class}`) : null}
      {...setupLabels(s)}
      deviceLabel={s.device_label}
              placement={s.placement}
      caption={s.caption}
      name={s.name}
      avatarName={s.name}
      avatarUrl={s.avatar_url}
      thumbUrl={s.thumb_url}
      photoCount={s.photo_count}
      youtubeUrl={s.youtube_url}
      videoUrl={s.video_url}
      likeCount0={s.like_count ?? 0}
      liked0={!!s.liked}
      trackPreview={s.track_preview}
      highlight={s.session_id === lastViewed}
      stats={
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-300">
          <span className="inline-flex items-center gap-1"><RunsIcon className="h-4 w-4 text-slate-400" /> {s.runs} {s.runs === 1 ? t("unit.run") : t("unit.runs")}</span>
          <span className="inline-flex items-center gap-1"><FoilIcon className="h-4 w-4 text-brand-400" /> <b className="text-brand-400">{s.foiling_km.toFixed(1)}</b> km</span>
        </div>
      }
    />
  );
}

function durHM(s: number) {
  const m = Math.round(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")} h` : `${m} min`;
}

// Tages-Gruppe (≥2 Sessions eines Nutzers am selben Tag/Spot): eingeklappte Kopf-Kachel mit
// Tages-Summen + Zähler + Chevron; aufgeklappt die Einzel-Sessions (jede mit Detail-Link).
function DayGroupCard({ g, t, lastViewed }: { g: CommunityGroup; t: (k: string) => string; lastViewed: number | null }) {
  const [open, setOpen] = useState(false);
  const dateStr = g.date ? new Date(g.date + "T00:00:00").toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
  const kmh = g.max_speed_mps != null ? (g.max_speed_mps * 3.6).toFixed(1) : null;
  // Medien des Tages. In der EINGEKLAPPTEN Gruppe waren Fotos/Videos bisher unsichtbar — und
  // gruppiert wird oft (jeder Nutzer, jeder Tag ab 2 Sessions), also blieben viele Bilder
  // ungesehen, weil niemand jede Gruppe aufklappt. Die Kopf-Kachel zeigt sie deshalb selbst:
  // je Session das neueste Foto (mehr steckt in thumb_url nicht), maximal drei, plus die
  // Gesamtzahl aller Fotos der Gruppe; dazu eine Kachel je Video-Plattform.
  // Platz + Reihenfolge wie in der Einzel-Kachel (SessionCard): Foto, Video, Minimap —
  // auf Desktop rechts neben dem Text, mobil gestapelt unter dem Profilbild.
  const thumbs = g.sessions.filter((s) => s.thumb_url).slice(0, 3);
  const photoTotal = g.sessions.reduce((n, s) => n + (s.photo_count || 0), 0);
  const restPhotos = photoTotal - thumbs.length;
  const vidLinks = g.sessions.map((s) => s.video_url ?? s.youtube_url).filter(Boolean) as string[];
  const ytFirst = vidLinks.map((u) => ytId(u)).find((v) => v) || "";
  const igFirst = vidLinks.some((u) => videoPlatform(u) === "instagram");
  const ttFirst = vidLinks.some((u) => videoPlatform(u) === "tiktok");
  const hasMedia = thumbs.length > 0 || ytFirst || igFirst || ttFirst;
  // Keine <button>/<a> in den Kacheln: der ganze Kopf ist schon ein Button (verschachtelte
  // Interaktion waere ungueltiges HTML) -> ein Tipp auf ein Bild klappt die Gruppe auf, dort
  // haengt das Foto an seiner Session und laesst sich von da oeffnen.
  const mediaEls = hasMedia ? (
    <>
      {thumbs.map((s, i) => (
        <div key={s.session_id} className="relative">
          <img src={s.thumb_url!} alt="" className="h-12 w-12 rounded-lg object-cover" />
          {i === thumbs.length - 1 && restPhotos > 0 && (
            <span className="absolute -right-1 -top-1 rounded-full bg-slate-900/90 px-1.5 text-[10px] text-slate-200">+{restPhotos}</span>
          )}
        </div>
      ))}
      {ytFirst && (
        <span className="relative block h-12 w-16 overflow-hidden rounded-lg" title={t("row.playVideo")}>
          <img src={`/api/public/video-thumb/${ytFirst}`} alt="" className="h-12 w-16 object-cover" />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/60">
              <PlayIcon className="h-3.5 w-3.5 text-white" />
            </span>
          </span>
        </span>
      )}
      {igFirst && (
        <span className="flex h-12 w-16 items-center justify-center rounded-lg bg-gradient-to-br from-[#feda75] via-[#d62976] to-[#4f5bd5] text-white" title={t("row.playVideo")}>
          <InstagramIcon className="h-6 w-6" />
        </span>
      )}
      {ttFirst && (
        <span className="flex h-12 w-16 items-center justify-center rounded-lg bg-black text-white" title={t("row.playVideo")}>
          <TikTokIcon className="h-6 w-6" />
        </span>
      )}
    </>
  ) : null;
  return (
    // GRUPPENKACHEL SIEHT AUS WIE EIN STAPEL (Jan, 24.09.2026): „die ,gruppenkacheln' bei
    // sessions sollten sich irgendwie optisch besser abgrenzen, vielleicht mit so einem
    // doppelten rahmen oben und rechts als andeutung das da mehrere dahinterstecken und etwas
    // schatten vielleicht."
    //
    // EIN leeres Blatt hinter der Karte, nach oben UND nach rechts versetzt — von ihm ist nur
    // der Rand zu sehen. Es traegt `aria-hidden` und schluckt keine Klicks: reine Andeutung,
    // der Knopf darunter bleibt die ganze Flaeche.
    //
    // Zuerst waren es ZWEI, mit dem Argument, eins sehe aus wie ein verrutschter Rahmen. Jans
    // Ansage am 24.09.2026: „mach den stabel nur mit einem zusaetzlichen rand, nicht 2." Mit dem
    // deckenden Vordergrund und dem klaren Versatz reicht eins — die Zahl der Sessions steht
    // ohnehin als Ziffer in der Karte, die Grafik soll nur sagen „hier ist mehr drin".
    //
    // `mt-2.5` am Rahmen, nicht an der Karte: das Blatt ragt nach oben hinaus und wuerde sonst
    // von der Kachel darueber ueberdeckt.
    //
    // DAS BLATT HEBT SICH UEBER DIE FLAECHE AB, NICHT UEBER DEN RAND (Jan, 24.09.2026: „der 2te
    // rahmen ist viel zu hart so, lieber die flaeche etwas dunkler abgrenzen und den rahmen
    // genauso wie der im vordergrund"). Es traegt deshalb denselben `border-slate-800` wie jede
    // Karte; unterschiedlich ist nur die FUELLUNG.
    //
    // `bg-slate-800` und nicht etwa `slate-900`: die slate-Skala ist GESPIEGELT (s.
    // scripts/check-contrast.mjs). Eine kleinere Zahl wird auf hellem Grund DUNKLER und auf
    // dunklem HELLER — dieselbe Klasse setzt sich also in beiden Modi ab, ohne ein
    // `dark:`-Gegenstueck und ohne zwei Wahrheiten. Ein Versuch davor hatte einen hellen Rand
    // (`slate-500`) benutzt; der war im Dark Mode zwar endlich sichtbar, im Light Mode aber
    // eine harte Linie neben einer weichen — genau das, was Jan hier beanstandet.
    //
    // Das Blatt ist DECKEND (`bg-slate-900`, nicht `/20`): ein durchscheinendes Blatt nimmt die
    // Farbe des Hintergrunds an und ist damit genau das, was es nicht sein soll — ein Hauch.
    // Ein Stapel besteht aus Papier, nicht aus Nebel.
    //
    // …UND DIE KARTE SELBST MUSS ES AUCH SEIN (Jan, 24.09.2026: „das ist transparent und nicht
    // der gewuenschte effekt vermute ich mal"). Sie war halbdurchsichtig, die Blaetter schienen
    // mitten durch sie hindurch, und statt eines Stapels sah man ein Drahtgitter. Deshalb zwei
    // Ebenen: aussen `bg-slate-950` (die Seitenfarbe, deckend), innen der Schleier. Das ergibt
    // rechnerisch DENSELBEN Ton wie eine Einzelkarte, die mit `bg-slate-900/60` ueber `#root`
    // (ebenfalls `slate-950`) liegt — im Light Mode beide Male rgb(244 247 250).
    //
    // DER SCHATTEN IST DESHALB KLEIN (Jan, 24.09.2026: „ist der hintergrund der gruppenkachel
    // jetzt wieder weiss ploetzlich?"). War er nicht — die Fuellung war schon dieselbe. Aber
    // `shadow-lg` legte im Light Mode einen grauen Hof um die Karte, und gegen den liest das
    // Auge die Flaeche als weiss, waehrend die Nachbarkarten ganz ohne Schatten danebenliegen.
    // `shadow-sm` genuegt fuer die Andeutung „hier liegt etwas obenauf".
    //
    // DER SCHLEIER IST `bg-slate-900/60`, NICHT `/40` (Jan, 24.09.2026: „den hintergrund der
    // gruppenkachel nich schwarz/weiss sondern genauso wie einzelsessions"). Genau das ist der
    // Wert, den `ui.tsx` fuer JEDE Karte setzt — die Gruppenkachel trug seit jeher `/40` und war
    // damit schon immer etwas heller als die Einzelsessions daneben; deckend fiel es dann auf.
    // Aus demselben Grund traegt der Rahmen der Karte wieder `slate-800` wie alle anderen —
    // und inzwischen das Blatt dahinter ebenso.
    //
    // Das Blatt laeuft bis kurz vors untere Ende (`bottom-*`), damit sein Rand die ganze rechte
    // Kante begleitet und nicht nur als Zipfel oben rechts steht.
    <div className="relative mt-2.5">
      <div aria-hidden className="pointer-events-none absolute -top-1.5 bottom-1.5 left-2 right-[-5px] rounded-2xl border border-slate-800 bg-slate-800" />
      <div className="relative rounded-2xl border border-slate-800 bg-slate-950 shadow-sm">
      <div className="rounded-2xl bg-slate-900/60">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-slate-800/40"
        aria-expanded={open}
      >
        <div className="flex shrink-0 flex-col items-center gap-1.5">
          <Avatar name={g.name} url={g.avatar_url} size={44} />
          {/* Mobil: Fotos/Videos + Minimap(s) unter dem Avatar (wie Einzel-Kachel), gestapelt. */}
          {(hasMedia || (g.track_previews?.length ?? 0) > 0) && (
            <div className="flex flex-col items-center gap-1.5 sm:hidden">
              {mediaEls}
              {g.track_previews?.map((tp, i) => (
                <TrackPreview key={i} data={tp} className="h-12 w-16 text-brand-400" />
              ))}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">
            {dateStr}
            {g.name && <span className="text-brand-600 dark:text-brand-300"> · {g.name}</span>}
          </div>
          {g.spot && (
            <div className="text-sm text-slate-300">
              <span className="inline-flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-300"><LocationIcon className="h-3.5 w-3.5" /> {g.spot}</span>
            </div>
          )}
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-300">
            <span className="inline-flex items-center gap-1"><SessionsIcon className="h-4 w-4 text-brand-400" /> <b className="text-brand-400">{g.count}</b> {t("unit.sessions")}</span>
            <span className="inline-flex items-center gap-1"><FoilIcon className="h-4 w-4 text-brand-400" /> <b className="text-brand-400">{g.foiling_km.toFixed(1)}</b> km</span>
            {g.foiling_time_s > 0 && <span className="inline-flex items-center gap-1"><TimerIcon className="h-4 w-4 text-slate-400" /> {durHM(g.foiling_time_s)}</span>}
            {g.pump_count > 0 && <span className="inline-flex items-center gap-1"><WaveIcon className="h-4 w-4 text-slate-400" /> {g.pump_count}</span>}
            {kmh && <span className="text-slate-400">max {kmh} km/h</span>}
          </div>
        </div>
        {/* Desktop: Fotos/Videos + Minimap(s) rechts (wie Einzel-Kachel), nebeneinander. */}
        {(hasMedia || (g.track_previews?.length ?? 0) > 0) && (
          <div className="hidden shrink-0 items-center gap-2 self-center sm:flex">
            {mediaEls}
            {g.track_previews?.map((tp, i) => (
              <TrackPreview key={i} data={tp} className="h-12 w-16 text-brand-400" />
            ))}
          </div>
        )}
        <ChevronIcon className={`h-5 w-5 shrink-0 self-center text-slate-400 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-800 px-2 py-3 sm:px-3">
          {g.sessions.map((s) => renderCommunitySession(s, t, lastViewed))}
        </div>
      )}
      </div>
      </div>
    </div>
  );
}

function CommunityList({ name, spot, accelOnly, onShowAll }:
    { name: string; spot: string; accelOnly: boolean; onShowAll?: () => void }) {
  const t = useT();
  const [items, setItems] = useState<CommunityGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const offsetRef = useRef(0);
  const moreRef = useRef(true);
  const loadingRef = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const restoreRef = useRef(false);
  const itemsRef = useRef<CommunityGroup[]>([]);
  // WETTLAUF-SPERRE (Jan, 24.09.2026: „wenn ich einen spot auswaehle sind da manchmal noch ganz
  // andere sessions mit drin, Nateone ist ganz woanders gefahren").
  //
  // Jeder Filterwechsel zaehlt hier hoch. Eine Antwort, die zu einer aelteren Generation gehoert,
  // wird verworfen, statt in die Liste zu laufen. Ohne das passierte zweierlei: `loadingRef`
  // stand beim Wechsel noch vom vorigen Abruf auf `true`, der NEUE `load(true)` stieg deshalb
  // sofort wieder aus — und die Antwort des ALTEN Spots schrieb danach ihre Zeilen in die neue
  // Liste. Die Ueberschrift sagte Jettkofen, der Inhalt war der vorige Filter. Die Karten selbst
  // waren echt (deshalb das fremde Spot-Abzeichen), sie gehoerten nur nicht dorthin.
  const laufRef = useRef(0);
  const lastViewed = getLastSession();

  // Spot, an dem der Filter "nur präzise" mehr verbirgt als er zeigt: automatisch auf "alle"
  // umschalten. Nur beim ersten Laden eines Spots, nur wenn der Nutzer den Umschalter nicht
  // selbst angefasst hat, und NICHT gemerkt — beim Verlassen greift wieder der Default aus der
  // eigenen Uhr (resetAuto beim Spot-Wechsel).
  //
  // Frueher griff das NUR bei einer komplett leeren Liste, und genau daran ist am 29.08. ein
  // Nutzer haengen geblieben: die Spot-Karte sagte "Meerkerk · 14", nach dem Klick standen dort
  // seine eigenen drei. Die anderen elf sind die seines Kumpels, dessen Uhr keine verwertbaren
  // Beschleunigungsdaten liefert (`detection = gps_only`) — die Karte zaehlt mit accel_only=false,
  // die Liste filterte mit true. Das Etikett meinte also wieder eine andere Menge als das
  // Klickziel, derselbe Fehler wie bei den Namens-Gruppen am 20.08. (s. `spot_map`).
  // Die Liste ist nicht leer, sie ist nur kuerzer als versprochen — deshalb reicht es nicht,
  // auf 0 zu pruefen. Verglichen wird die ERSTE Seite: liefert "alle" dort mehr Gruppen als
  // "nur praezise", war der Filter hier die falsche Vorgabe.
  const autoTried = useRef<string | null>(null);
  const maybeShowAll = (rows: CommunityGroup[], off: number) => {
    if (!spot || !accelOnly || off !== 0 || autoTried.current === spot) return;
    autoTried.current = spot;
    api.communitySessionsGrouped(PAGE, 0, { name: name || undefined, spot, accelOnly: false, sport: "all" })
      .then((probe) => { if (probe.length > rows.length) onShowAll?.(); })
      .catch(() => {});
  };

  const load = (reset: boolean) => {
    if (loadingRef.current || (!reset && !moreRef.current)) return;
    loadingRef.current = true; setLoading(true);
    const lauf = laufRef.current;
    const off = reset ? 0 : offsetRef.current;
    api.communitySessionsGrouped(PAGE, off, { name: name || undefined, spot: spot || undefined, accelOnly, sport: "all" })
      .then((rows) => {
        if (lauf !== laufRef.current) return;   // Filter hat gewechselt -> Antwort ist veraltet
        offsetRef.current = off + rows.length;
        moreRef.current = rows.length === PAGE;
        setItems((prev) => (reset ? rows : [...prev, ...rows]));
        maybeShowAll(rows, off);
      })
      .catch(() => {})
      .finally(() => {
        if (lauf !== laufRef.current) return;   // die neue Generation fuehrt bereits
        loadingRef.current = false; setLoading(false);
      });
  };

  // Erste Seite frisch holen und einmischen — das Gegenstueck zu `revalidateHead` der
  // „Meine"-Liste, das hier bis 15.09.2026 FEHLTE. Ohne das zeigte ein Cache-Treffer seinen Stand
  // unveraendert weiter, bis ein echter Reload die modulweite Map wegwarf. Genau so gemeldet
  // (Jan, 15.09.): „wenn ich die pwa die ganze zeit im hintergrund habe und dann neu auf sessions
  // gehe, muss ich immer erst mit strg-r reloaden um neuere sessions zu sehen."
  //
  // Gemischt wird ueber (user_id|date|spot) — der Schluessel einer Tages-Gruppe. Die frische
  // erste Seite gewinnt und behaelt die Reihenfolge des Servers; was der Cache darueber hinaus
  // hat (nachgeladene Seiten), haengt sich hinten an. Damit ist das Ergebnis dasselbe wie nach
  // einem echten Neuladen plus Weiterscrollen.
  const gruppenKey = (g: CommunityGroup) => `${g.user_id}|${g.date}|${g.spot ?? ""}`;
  async function revalidateCommunityHead() {
    const lauf = laufRef.current;
    try {
      const fresh = await api.communitySessionsGrouped(
        PAGE, 0, { name: name || undefined, spot: spot || undefined, accelOnly, sport: "all", fresh: true });
      if (lauf !== laufRef.current) return;   // waehrend des Abrufs den Filter gewechselt
      if (!fresh.length) return;
      const frisch = new Set(fresh.map(gruppenKey));
      const rest = itemsRef.current.filter((g) => !frisch.has(gruppenKey(g)));
      const merged = [...fresh, ...rest];
      // Nichts Neues und nichts geaendert -> Zustand nicht anfassen (kein Render, kein Scroll-Sprung).
      if (merged.length === itemsRef.current.length
          && merged.every((g, i) => g === itemsRef.current[i])) return;
      itemsRef.current = merged;
      offsetRef.current = merged.length;
      setItems(merged);
      communityCache.set(`${name}|${spot}|${accelOnly}`,
                         { items: merged, offset: offsetRef.current, more: moreRef.current });
    } catch { /* offline/Fehler: der Cache bleibt einfach stehen */ }
  }

  useEffect(() => {
    // Neue Generation. Und die Lade-Sperre ausdruecklich loesen: sie gehoert zum ABGEBROCHENEN
    // Abruf, nicht zum neuen — bliebe sie stehen, stiege `load(true)` unten sofort wieder aus.
    laufRef.current += 1;
    loadingRef.current = false;
    const cached = communityCache.get(`${name}|${spot}|${accelOnly}`);
    if (cached && cached.items.length) {
      setItems(cached.items); offsetRef.current = cached.offset; moreRef.current = cached.more;
      itemsRef.current = cached.items;
      restoreRef.current = true;  // nach dem Render die markierte Karte einscrollen
      revalidateCommunityHead();  // im Hintergrund neue Sessions nachziehen
    } else {
      moreRef.current = true; offsetRef.current = 0; load(true);
    }
    // Lag die PWA lange im Hintergrund, laeuft beim Zurueckkommen KEIN Mount — ohne das hier
    // bliebe eine schon offene Liste beliebig lange alt stehen.
    const beiRueckkehr = () => { if (document.visibilityState === "visible") revalidateCommunityHead(); };
    document.addEventListener("visibilitychange", beiRueckkehr);
    return () => {
      document.removeEventListener("visibilitychange", beiRueckkehr);
      communityCache.set(`${name}|${spot}|${accelOnly}`, { items: itemsRef.current, offset: offsetRef.current, more: moreRef.current });
    };
  }, [name, spot, accelOnly]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const o = new IntersectionObserver((e) => { if (e[0].isIntersecting) load(false); }, { rootMargin: "400px" });
    if (sentinel.current) o.observe(sentinel.current);
    return () => o.disconnect();
  }, [name, spot, accelOnly]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    itemsRef.current = items;
    if (restoreRef.current && items.length) {
      restoreRef.current = false;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        document.getElementById("session-highlight")?.scrollIntoView({ block: "center" });
      }));
    }
  }, [items]);

  return (
    <div>
      {items.length === 0 && !loading ? (
        <Card className="p-8 text-center text-slate-300">{t("all.none")}</Card>
      ) : (
        <div className="space-y-3">
          {items.map((g) => (
            g.count <= 1
              ? renderCommunitySession(g.sessions[0], t, lastViewed)
              : <DayGroupCard key={`g-${g.user_id}-${g.date}`} g={g} t={t} lastViewed={lastViewed} />
          ))}
        </div>
      )}
      <div ref={sentinel} className="h-8" />
      {loading && <Spinner />}
    </div>
  );
}

export function SessionStats({ a }: { a: NonNullable<SessionSummary["analysis"]> }) {
  const t = useT();
  const pf = usePumpFmt();
  const m = a.metrics;
  const kmh = (v?: number | null) => (v != null ? (v * 3.6).toFixed(1) : null);
  const dur = (s?: number | null) => (s == null ? "–" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-300">
      <span className="inline-flex items-center gap-1"><FoilIcon className="h-4 w-4 text-brand-400" /> <b className="text-brand-400">{((a.foiling_distance_m ?? 0) / 1000).toFixed(2)}</b> km</span>
      <span className="inline-flex items-center gap-1"><TimerIcon className="h-4 w-4 text-slate-400" /> {dur(a.foiling_time_s)}</span>
      {m?.num_segments != null && <span className="inline-flex items-center gap-1"><RunsIcon className="h-4 w-4 text-slate-400" /> {m.num_segments} {m.num_segments === 1 ? t("unit.run") : t("unit.runs")}</span>}
      {m?.avg_speed_mps != null && <span>Ø {kmh(m.avg_speed_mps)} km/h</span>}
      {a.pump_count != null && <span>↕ {a.pump_count}{m?.avg_pump_hz ? ` · ${pf.fmt(m.avg_pump_hz)}` : ""}</span>}
      {m?.avg_hr != null && <span className="inline-flex items-center gap-1"><HeartPulseIcon className="h-4 w-4 text-slate-400" /> {m.avg_hr}{m?.max_hr ? `/${m.max_hr}` : ""}</span>}
      {m?.farthest_segment_m != null && m.farthest_segment_m > 0 && <span>{t("sessions.farAbbr")} {Math.round(m.farthest_segment_m)} m</span>}
      {m?.longest_segment_s != null && m.longest_segment_s > 0 && <span>{t("sessions.longAbbr")} {dur(m.longest_segment_s)}</span>}
    </div>
  );
}

// Die Abzeichen ueber einer eigenen Session: offene Uebertragung und/oder Bearbeitungsstand.
//
// ALS EIGENE KOMPONENTE, weil es die Zeile ZWEIMAL gibt — in dieser Liste und auf der
// Startseite. Dort fehlte das Uebertragungs-Abzeichen bis zum 24.09.2026 (Jans Befund: „in
// meiner eigenen home-ansicht fehlt das badge uebertragung, das sehe ich nur wenn ich auf
// sessions / meine gehe"), weil die Startseite nur `status` abfragte. Das Feld `transfer_to`
// liefert derselbe Endpunkt fuer beide, es wurde schlicht nicht gelesen. Zwei Abschriften
// desselben Markups waren die Ursache — jetzt ist es eine.
export function EigeneAbzeichen({ transferTo, status }: { transferTo?: string | null; status: string }) {
  const t = useT();
  if (!transferTo && status === "analyzed") return null;
  return (
    <div className="flex items-center gap-1.5">
      {transferTo && (
        <span title={t("transfer.pending", { name: transferTo })}
          className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-700 dark:text-amber-300">
          {t("transfer.badge")}
        </span>
      )}
      {status !== "analyzed" && <StatusBadge status={status} />}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const t = useT();
  // Nicht-slate-Farben kippen NICHT automatisch mit dem Farbmodus (nur die slate-Skala tut das,
  // s. index.css). Ohne dark:-Gegenstueck stand hier amber-400 auf hellem Grund — praktisch
  // unlesbar (Jan, 02.09.). Muster im Projekt: kraeftiger Ton als Basis fuer den Light-Mode,
  // heller Ton unter dark:.
  const map: Record<string, string> = {
    analyzed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    complete: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    live: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    recording: "bg-slate-700/40 text-slate-200",
  };
  const labelKey: Record<string, string> = {
    analyzed: "status.analyzed", complete: "status.complete", live: "status.live", recording: "status.recording",
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${map[status] ?? "bg-slate-700/40 text-slate-200"}`}>
      {labelKey[status] ? t(labelKey[status]) : status}
    </span>
  );
}


/**
 * Community-Rekorde an einem Spot. Baugleich zum Block auf der Community-Seite — dieselben
 * `RecordGrid`-Kacheln, dieselben Zeitfenster-Knoepfe — nur mit `spot` eingegrenzt.
 *
 * Serverseitig war dafuer nichts zu bauen: `_record_entry` und die beiden Sonderfaelle
 * (Zeit-Rekorde, Carves) kennen den Spot-Parameter seit jeher, nur der Endpunkt reichte ihn
 * nicht durch.
 *
 * `showSpot` ist hier AUS: in jeder Kachel stuende sonst derselbe Ortsname, den die Seite
 * oben schon im Auswahlfeld traegt.
 *
 * Der Accel-Schalter kommt von der Seite (`accelOnly`) statt eines zweiten daneben — eine
 * Seite, eine Einstellung. Ein Foil-Band-Filter fehlt bewusst: an einem einzelnen Spot ist der
 * Topf klein genug, dass eine weitere Eingrenzung meist leere Kacheln erzeugt.
 */
// Reihenfolge, in der ein leeres Zeitfenster aufgegeben wird (Jan, 06.09.): erst die 10 Tage der
// Community-Seite, dann groesser werden, bis wirklich etwas dasteht. „Heute" ist bewusst nicht
// dabei — an einem einzelnen Spot ist das fast immer leer und waere ein schlechter Einstieg.
const SPOT_FENSTER = ["10d", "30d", "365d", "all"];

/** Steht in diesem Zeitfenster ueberhaupt ein Rekord? */
function hatRekorde(satz: unknown): boolean {
  if (!satz || typeof satz !== "object") return false;
  return Object.values(satz as Record<string, { session_id?: number | null } | null>)
    .some((r) => r && r.session_id != null);
}

function SpotRecords({ spot, accelOnly }: { spot: string; accelOnly: boolean }) {
  const t = useT();
  const [data, setData] = useState<Awaited<ReturnType<typeof api.communityRecords>> | null>(null);
  const [period, setPeriod] = useState("10d");
  // Sobald der Nutzer selbst ein Fenster gewaehlt hat, wird es nicht mehr verschoben — sonst
  // spraenge seine Wahl beim naechsten Laden zurueck.
  const selbstGewaehlt = useRef(false);

  useEffect(() => {
    setData(null);
    api.communityRecords(accelOnly, "pumpfoil", "all", spot).then((d) => {
      setData(d);
      if (!selbstGewaehlt.current) {
        // Erstes Fenster, in dem es etwas zu sehen gibt. Ohne das steht an ruhigeren Spots
        // eine Wand aus leeren Kacheln, obwohl es Rekorde gibt — nur aeltere.
        setPeriod(SPOT_FENSTER.find((k) => hatRekorde((d as Record<string, unknown>)[k])) ?? "all");
      }
    }).catch(() => setData(null));
  }, [spot, accelOnly]);

  // Gar nichts an diesem Spot? Dann auch keinen Kasten — an einem Spot ohne Sessions stuenden
  // sonst zwoelf leere Kacheln ueber dem Wetter (an Gourvieille gesehen, wo ein Nutzer seine
  // Aufzeichnungen geloescht hat).
  if (!data || !SPOT_FENSTER.some((k) => hatRekorde((data as Record<string, unknown>)[k]))) return null;
  return (
    <Card className="mb-3 p-4">
      <h3 className="mb-2 font-semibold">{t("rec.spotTitle")}</h3>
      <div className="mb-3 flex flex-wrap items-center gap-1">
        {PERIODS.map(([k, labelKey]) => (
          <button
            key={k}
            onClick={() => { selbstGewaehlt.current = true; setPeriod(k); }}
            className={`rounded-lg px-2.5 py-1 text-xs ${period === k
              ? "bg-brand-500 font-semibold text-slate-950" : "bg-slate-800 text-slate-200"}`}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>
      <RecordGrid rec={data[period]} />
    </Card>
  );
}
