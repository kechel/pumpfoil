import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, type ImportSport, type SyncStand } from "../lib/api";
import { Card, Button } from "../components/ui";
import { ChevronIcon, CheckIcon, LinkIcon } from "../components/Icons";
import { PlatformSubline } from "../components/SupportedPlatforms";
import { useI18n } from "../i18n";

/**
 * „0 importiert, 1 uebersprungen" ist eine Sackgasse — genau so kam es als Rueckmeldung
 * zurueck (04.09.: „und mit dieser Information kann ich nichts anfangen"). Der Server zaehlt
 * die Gruende jetzt mit; hier werden sie zu einem lesbaren Satz. Die Codes sind stabil und
 * kommen aus `suunto._grund_code`; unbekannte werden weggelassen statt roh angezeigt.
 */
const GRUND_KEYS: Record<string, string> = {
  kein_gps: "settings.sync.why.noGps",
  doppelt: "settings.sync.why.dupe",
  zu_kurz: "settings.sync.why.tooShort",
  gefiltert: "settings.sync.why.filtered",
  spaeter: "settings.sync.why.later",
  fehler: "settings.sync.why.error",
};



// Generische „Verknüpfte Konten"-Seite: hostet Import-Integrationen (Polar; später
// Coros/Suunto/… und FIT/TCX-Upload). Jede Integration ist eine eigenständige Karte,
// die sich selbst ausblendet, wenn serverseitig nicht konfiguriert.
export default function LinkedAccounts() {
  const { t } = useI18n();
  // Ergebnis der OAuth-Verknüpfung. JEDER Dienst leitet auf /konten?<dienst>=connected|cancelled|
  // error zurück — bisher wurde aber nur `suunto` gelesen. Wer COROS verband, bekam deshalb gar
  // keine Rückmeldung, und `?coros=connected` blieb in der Adresszeile stehen: ein späterer
  // Aufruf derselben URL sah dann nach „verbunden" aus, obwohl der Zustand vom Server kommt
  // (`st.linked`). Aufgefallen am 04.09. an einer echten COROS-Verknüpfung.
  const [banner, setBanner] = useState<"ok" | "cancelled" | "error" | null>(null);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    let s: string | null = null;
    for (const dienst of ["suunto", "coros", "polar", "strava"]) {
      const v = p.get(dienst);
      if (v) { s = v; p.delete(dienst); }
    }
    if (s === "connected") setBanner("ok");
    else if (s === "cancelled") setBanner("cancelled");
    else if (s === "error") setBanner("error");
    if (s) {
      const q = p.toString();
      window.history.replaceState(null, "", window.location.pathname + (q ? `?${q}` : ""));
    }
  }, []);
  const bannerCls = banner === "ok"
    ? "border-emerald-300 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/40 dark:text-emerald-300"
    : banner === "error"
    ? "border-red-400 bg-red-500/15 text-red-700 font-medium dark:border-red-500/50 dark:bg-red-500/10 dark:text-red-300"
    : "border-amber-400 bg-amber-500/15 text-amber-700 font-medium dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-300";
  return (
    <div className="w-full">
      <Link to="/einstellungen" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-300 hover:text-slate-200">
        <ChevronIcon className="h-4 w-4 rotate-180" /> {t("nav.profile")}
      </Link>
      <h2 className="mb-1 flex items-center gap-2 text-xl font-bold"><LinkIcon className="h-5 w-5 text-brand-400" /> {t("linked.title")}</h2>
      <p className="mb-4 text-sm text-slate-300">{t("linked.hint")}</p>
      {banner && (
        <div className={`mb-4 flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm ${bannerCls}`}>
          <span>{banner === "ok" ? t("linked.connectOk") : banner === "cancelled" ? t("linked.connectCancelled") : t("linked.connectError")}</span>
          <button onClick={() => setBanner(null)} aria-label="×" className="shrink-0 px-1 text-lg opacity-70 hover:opacity-100">×</button>
        </div>
      )}
      <div className="space-y-4">
        <PolarCard />
        <CorosCard />
        <SuuntoCard />
        <XiaomiHinweis />
        <StravaCard />
      </div>
      <div className="mt-6">
        <p className="mb-1.5 text-xs font-medium text-slate-400">{t("linked.platformsTitle")}</p>
        <PlatformSubline kind="watch" className="mb-0.5" />
        <PlatformSubline kind="account" />
      </div>
    </div>
  );
}

// COROS Open API: Konto verknüpfen, Workouts kommen automatisch per Push. Nur sichtbar,
// wenn serverseitig konfiguriert (status.available).
function CorosCard() {
  const { t } = useI18n();
  const [st, setSt] = useState<{ available: boolean; linked: boolean; last_sync_at: string | null } | null>(null);
  // Zwei Wege zu COROS: der MCP-Server (seit 04.09. offen, ohne Partner-Vertrag) und die
  // klassische Partner-API (Antrag laeuft). Der MCP-Weg hat Vorrang, sobald er eingerichtet
  // ist; nur wenn er es NICHT ist, zeigt die Karte den alten Weg. So steht nie beides da.
  const [mcp, setMcp] = useState(false);
  const [msg, setMsg] = useState("");
  const load = async () => {
    const m = await api.corosMcpStatus().catch(() => null);
    if (m?.available) { setMcp(true); setSt(m); return; }
    setMcp(false);
    setSt(await api.corosStatus().catch(() => null));
  };
  useEffect(() => { load(); }, []);
  const fort = useSyncFortschritt("coros", async () => { await api.corosMcpSync(); });
  if (!st || !st.available) return null;

  async function connect() {
    try {
      const r = mcp ? await api.corosMcpConnect() : await api.corosConnect();
      window.location.href = r.authorize_url;
    } catch (e) { setMsg(String(e)); }
  }
  async function unlink() {
    await (mcp ? api.corosMcpUnlink() : api.corosUnlink()).catch(() => {});
    setMsg(""); load();
  }

  return (
    <Card className="p-5">
      <h3 className="mb-1 flex items-center gap-2 font-semibold">
        {t("settings.coros.title")}
        {mcp && (
          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-200">
            Beta
          </span>
        )}
      </h3>
      <p className="mb-3 text-sm text-slate-300">{t("settings.coros.hint")}</p>
      {/* Aufbau exakt wie bei Polar und Suunto: Logo und „Verbunden" in EINER Zeile, die
          Knoepfe darunter. Vorher stand der Zustand mitten zwischen den Knoepfen — als
          einzige der drei Karten (Jan, 04.09.).
          Der Text „Verbunden — automatischer Import" gehoerte zur Partner-API, die per
          Webhook schiebt. Der MCP-Weg holt auf Knopfdruck, dort waere er falsch — also
          dort schlicht „Verbunden" (derselbe Text wie bei Polar, in allen Sprachen da). */}
      <div className="mb-3 flex items-center gap-3">
        <a href="https://coros.com/" target="_blank" rel="noopener noreferrer" title="COROS"
          className="inline-block rounded-lg bg-white px-3 py-2 shadow-sm">
          <img src="/coros-logo.png" alt="COROS" className="h-7 w-auto" />
        </a>
        {st.linked && (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-success">
            <CheckIcon className="h-4 w-4" />
            {mcp ? t("settings.polar.connected") : t("settings.coros.connected")}
          </span>
        )}
      </div>
      {!st.linked ? (
        <Button onClick={connect}>{t("settings.coros.connect")}</Button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {mcp && (
            <Button variant="secondary" onClick={fort.starten} disabled={fort.laeuft}>
              {fort.laeuft ? t("settings.polar.importing") : t("settings.suunto.sync")}
            </Button>
          )}
          <Button variant="ghost" onClick={unlink}>{t("settings.coros.unlink")}</Button>
        </div>
      )}
      {fort.balken}
      {st.linked && <SportAuswahl provider="coros" aktualisieren={fort.fertigZaehler} />}
      {(msg || fort.msg) && <p className="mt-2 text-sm text-slate-400">{msg || fort.msg}</p>}

      {/* Diese Liste war komplett `hidden`, sobald der MCP-Weg aktiv ist — und der hat Vorrang,
          ist also der Weg, den ALLE nutzen. Damit war unsichtbar, was Jan ausdruecklich wollte:
          die Empfehlung, welchen Modus man auf der Uhr waehlt („Flatwater", nach unseren eigenen
          Messungen), und die Grenze „kein Roh-Accelerometer" (07.09.2026 gefunden). Nur `help1`
          gehoert wirklich zur Partner-API — der Rest gilt auf beiden Wegen. */}
      <div className="mt-4">
        <p className="mb-2 text-xs font-medium text-slate-400">{t("settings.coros.help")}</p>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-300">
          {!mcp && <li>{t("settings.coros.help1")}</li>}
          <li>{t("settings.coros.help2")}</li>
          <li>{t("settings.coros.help3")}</li>
          <li>{t("settings.coros.help4")}</li>
        </ol>
      </div>
    </Card>
  );
}

/**
 * Der Schlusssatz eines Imports — in der Sprache des Nutzers.
 *
 * Gebaut wird er aus den ZAHLEN, nicht aus einem Satz des Servers. Vorher stand in der
 * Oberfläche wörtlich „message: no new exercises" (Jan, 07.09.) — Polars englischer Text mit
 * dem Feldnamen davor. Ein fertiger Serversatz ist nicht übersetzbar, Zahlen und Codes sind es.
 */
function ergebnisText(st: SyncStand, t: (k: string, v?: Record<string, string>) => string): string {
  const d = (st.daten ?? {}) as {
    imported?: number; skipped?: number; failed?: number;
    reasons?: Record<string, number>;
  };
  // Zählt der Server die Gründe mit (Suunto), sind sie aussagekräftiger als eine nackte
  // „übersprungen"-Zahl: „3 zu kurz" sagt, was zu tun ist, „3 übersprungen" nicht.
  const gruende = Object.entries(d.reasons ?? {})
    .filter(([k]) => GRUND_KEYS[k])
    .map(([k, n]) => t(GRUND_KEYS[k], { n: String(n) }));
  if (gruende.length) {
    const kopf = d.imported ? [t("settings.sync.imported", { n: String(d.imported) })] : [];
    return [...kopf, ...gruende].join(" · ");
  }
  // Ohne Gründe beide Zahlen nennen — bei COROS sind die übersprungenen die schon vorhandenen
  // Trainings, und „9 importiert" allein ließe offen, was mit den anderen 16 war.
  if (d.imported || d.skipped) {
    return t("settings.polar.result", {
      imported: String(d.imported ?? 0), skipped: String(d.skipped ?? 0),
    });
  }
  return t("settings.sync.nothingNew");
}

/**
 * Gemeinsame Fortschritts-Logik für die drei Konto-Importe.
 *
 * Der Import läuft serverseitig im Hintergrund (sonst läuft der Apache-Proxy in den Timeout —
 * am 07.09. bekam Jan nach Minuten einen „502 Proxy Error", während der Import in Ruhe
 * durchlief). Der Aufruf stößt also nur an; hier wird der Stand abgefragt, bis er fertig ist,
 * und am Ende der Schlusssatz des Servers angezeigt.
 */
function useSyncFortschritt(provider: "polar" | "suunto" | "coros", anstossen: () => Promise<unknown>) {
  // ACHTUNG beim Einbauen: dieser Hook MUSS vor dem frühen `return null` der Karte stehen
  // (`if (!st || !st.available) return null`). Dahinter aufgerufen zählt React beim ersten
  // Render weniger Hooks als danach und die ganze Seite stirbt mit Fehler #310 — genau so am
  // 07.09. passiert, /konten war unbenutzbar.
  const { t } = useI18n();
  const [stand, setStand] = useState<SyncStand | null>(null);
  const [msg, setMsg] = useState("");
  const timer = useRef<number | null>(null);
  // Zaehlt abgeschlossene Laeufe. Die Sportart-Liste haengt daran und holt sich neu — sonst
  // erschiene ein beim Import NEU entdeckter Modus erst nach einem Neuladen der Seite
  // (Jan, 07.09.: „die liste wird ja sichtbar direkt aktualisiert … oder?" — tat sie nicht).
  const [fertigZaehler, setFertigZaehler] = useState(0);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  function abfragen() {
    api.syncProgress(provider).then((st) => {
      setStand(st);
      if (st.laeuft) {
        timer.current = window.setTimeout(abfragen, 1500);
      } else {
        setStand(null);
        setFertigZaehler((n) => n + 1);
        setMsg(ergebnisText(st, t));
      }
    }).catch(() => setStand(null));
  }

  async function starten() {
    setMsg("");
    setStand({ laeuft: true, gesamt: 0, fertig: 0, schritt: null, ergebnis: null, daten: null });
    try {
      await anstossen();
      abfragen();
    } catch (e) {
      setStand(null);
      setMsg(String(e));
    }
  }

  const balken = stand?.laeuft ? (
    <div className="mt-3">
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-700/60">
        <div
          className="h-full rounded-full bg-brand-500 transition-all"
          style={{ width: stand.gesamt > 0 ? `${Math.min(100, (100 * stand.fertig) / stand.gesamt)}%` : "15%" }}
        />
      </div>
      <p className="mt-1 text-sm text-slate-400">
        {stand.gesamt > 0
          ? t("settings.sync.progress", { fertig: String(stand.fertig), gesamt: String(stand.gesamt) })
          : (stand.schritt ?? "")}
      </p>
    </div>
  ) : null;

  return { starten, laeuft: !!stand?.laeuft, balken, msg, setMsg, fertigZaehler };
}

/**
 * Welche Sportart-Modi eines verknüpften Kontos importiert werden.
 *
 * Der Hintergrund (Jan, 07.09.): für Pumpfoil gibt es auf keiner Uhr einen eigenen Modus, also
 * stellen die Leute irgendetwas ein — Flatwater, Speedsurfing, sogar Radfahren (nachgezählt:
 * 8 als „cycling" aufgezeichnete Sessions waren echtes Pumpfoilen). Eine feste Liste erlaubter
 * Sportarten wäre deshalb ein Verlustgeschäft. Stattdessen merkt sich der Server, was das Konto
 * tatsächlich liefert, und hier kann man abwählen.
 *
 * Zwei Regeln in der Anzeige: nur Modi, die DIESER Nutzer selbst überträgt (nicht die 75 aus der
 * COROS-Doku), und nur solche mit Ortung — eine Hallenaufnahme wäre eine Zeile ohne Sinn.
 */
function SportAuswahl({ provider, aktualisieren = 0 }:
                      { provider: "polar" | "suunto" | "coros"; aktualisieren?: number }) {
  const { t } = useI18n();
  const [sports, setSports] = useState<ImportSport[] | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    api.importSports(provider).then((r) => setSports(r.sports)).catch(() => setSports([]));
  }, [provider, aktualisieren]);

  async function umschalten(key: string, an: boolean) {
    // Erst anzeigen, dann speichern: ein Häkchen soll sofort reagieren.
    setSports((prev) => (prev ?? []).map((x) => (x.sport_key === key ? { ...x, importieren: an } : x)));
    try {
      const r = await api.setImportSports(provider, { [key]: an });
      setSports(r.sports);
      setMsg(t("settings.sports.saved"));
      window.setTimeout(() => setMsg(""), 2000);
    } catch (e) {
      setMsg(String(e));
    }
  }

  if (sports === null) return null;
  return (
    <div className="mt-4 border-t border-slate-700/60 pt-3">
      <p className="mb-1 text-sm font-medium">{t("settings.sports.title")}</p>
      <p className="mb-2 text-sm text-slate-400">{t("settings.sports.hint")}</p>
      {sports.length === 0 ? (
        <p className="text-sm text-slate-400">{t("settings.sports.none")}</p>
      ) : (
        <ul className="space-y-1">
          {sports.map((sp) => (
            <li key={sp.sport_key}>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-brand-500"
                  checked={sp.importieren}
                  onChange={(e) => umschalten(sp.sport_key, e.target.checked)}
                />
                <span>{sp.label}</span>
                <span className="text-slate-500">({sp.gesehen}&times;)</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {msg && <p className="mt-2 text-sm text-slate-400">{msg}</p>}
    </div>
  );
}

// Polar AccessLink: Konto verknüpfen + Trainings importieren. Nur sichtbar, wenn
// serverseitig konfiguriert (status.available).
function PolarCard() {
  const { t } = useI18n();
  const [st, setSt] = useState<{ available: boolean; linked: boolean; last_sync_at: string | null } | null>(null);
  const [msg, setMsg] = useState("");
  const load = () => api.polarStatus().then(setSt).catch(() => setSt(null));
  useEffect(() => { load(); }, []);
  const fort = useSyncFortschritt("polar", async () => { await api.polarSync(); });
  if (!st || !st.available) return null;

  async function connect() {
    try { const r = await api.polarConnect(); window.location.href = r.authorize_url; } catch (e) { setMsg(String(e)); }
  }
  async function unlink() {
    await api.polarUnlink().catch(() => {});
    setMsg(""); load();
  }

  return (
    <Card className="p-5">
      <h3 className="mb-1 font-semibold">{t("settings.polar.title")}</h3>
      <p className="mb-2 text-sm text-slate-300">{t("settings.polar.hint")}</p>
      <p className="mb-3 rounded-lg bg-slate-800/60 px-3 py-2 text-sm text-slate-400">{t("settings.polar.scope")}</p>
      <div className="mb-3 flex items-center gap-3">
        <a href="https://flow.polar.com/" target="_blank" rel="noopener noreferrer" title="Polar Flow"
          className="inline-block rounded-lg bg-white px-3 py-2 shadow-sm">
          <img src="/polar-logo.jpg" alt="Polar Flow" className="h-5 w-auto" />
        </a>
        {st.linked && <span className="inline-flex items-center gap-1 text-sm font-medium text-success"><CheckIcon className="h-4 w-4" /> {t("settings.polar.connected")}</span>}
      </div>
      {!st.linked ? (
        <Button onClick={connect}>{t("settings.polar.connect")}</Button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={fort.starten} disabled={fort.laeuft}>
            {fort.laeuft ? t("settings.polar.importing") : t("settings.polar.sync")}
          </Button>
          <Button variant="ghost" onClick={unlink}>{t("settings.polar.unlink")}</Button>
        </div>
      )}
      {fort.balken}
      {st.linked && <SportAuswahl provider="polar" aktualisieren={fort.fertigZaehler} />}
      {(msg || fort.msg) && <p className="mt-2 text-sm text-slate-400">{msg || fort.msg}</p>}
    </Card>
  );
}

// Suunto Cloud API: Konto verknüpfen + Workouts importieren (Pull). Nur sichtbar, wenn
// serverseitig konfiguriert (status.available).
function SuuntoCard() {
  const { t } = useI18n();
  const [st, setSt] = useState<{ available: boolean; linked: boolean; last_sync_at: string | null } | null>(null);
  const [msg, setMsg] = useState("");
  const load = () => api.suuntoStatus().then(setSt).catch(() => setSt(null));
  useEffect(() => { load(); }, []);
  const fort = useSyncFortschritt("suunto", async () => { await api.suuntoSync(); });
  if (!st || !st.available) return null;

  async function connect() {
    try { const r = await api.suuntoConnect(); window.location.href = r.authorize_url; } catch (e) { setMsg(String(e)); }
  }
  async function unlink() {
    await api.suuntoUnlink().catch(() => {});
    setMsg(""); load();
  }

  return (
    <Card className="p-5">
      <h3 className="mb-1 font-semibold">{t("settings.suunto.title")}</h3>
      <p className="mb-3 text-sm text-slate-300">{t("settings.suunto.hint")}</p>
      <div className="mb-3 flex items-center gap-3">
        <a href="https://www.suunto.com/" target="_blank" rel="noopener noreferrer" title="Suunto"
          className="inline-block rounded-lg bg-white px-3 py-2 shadow-sm">
          <img src="/suunto-logo.png" alt="Suunto" className="h-10 w-auto" />
        </a>
        {st.linked && <span className="inline-flex items-center gap-1 text-sm font-medium text-success"><CheckIcon className="h-4 w-4" /> {t("settings.suunto.connected")}</span>}
      </div>
      {/* Störungshinweis war vom 19.07. bis 28.07.2026 hier (Suunto verweigerte den Token-Tausch);
          wieder entfernt, nachdem eine Verknüpfung samt Workout-Abruf durchgelaufen ist. Der i18n-Key
          settings.suunto.broken bleibt in allen Sprachen liegen — falls es wiederkommt, reicht dieser
          Block erneut, ohne 16 Übersetzungen. */}
      {!st.linked ? (
        <Button onClick={connect}>{t("settings.suunto.connect")}</Button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={fort.starten} disabled={fort.laeuft}>
            {fort.laeuft ? t("settings.polar.importing") : t("settings.suunto.sync")}
          </Button>
          <Button variant="ghost" onClick={unlink}>{t("settings.suunto.unlink")}</Button>
        </div>
      )}
      {fort.balken}
      {st.linked && <SportAuswahl provider="suunto" aktualisieren={fort.fertigZaehler} />}
      {(msg || fort.msg) && <p className="mt-2 text-sm text-slate-400">{msg || fort.msg}</p>}
    </Card>
  );
}

// Xiaomi/Redmi haben keine eigene Schnittstelle fuer uns (Xiaomis Health-Cloud ist nur fuer
// Partner offen, eine App auf der Uhr laesst Xiaomi nicht zu). Der Umweg ist aber offiziell:
// Xiaomi und Suunto haben ihre Apps 2024 miteinander verbunden, weltweit ausser China. Deshalb
// steht die Anleitung hier bei der Suunto-Karte und nicht als eigene Verknuepfung — es GIBT
// keine Xiaomi-Verknuepfung, nur diesen Weg.
function XiaomiHinweis() {
  const { t } = useI18n();
  return (
    <Card className="p-5">
      <h3 className="mb-1 font-semibold">{t("linked.xiaomi.title")}</h3>
      <p className="mb-3 text-sm text-slate-300">{t("linked.xiaomi.hint")}</p>
      <div className="mb-3 flex items-center gap-3">
        <span className="inline-block rounded-lg bg-white px-3 py-2 shadow-sm">
          <img src="/xiaomi-logo.jpg" alt="Xiaomi" className="h-10 w-auto rounded-md" />
        </span>
        <ChevronIcon className="h-4 w-4 text-slate-500" />
        <span className="inline-block rounded-lg bg-white px-3 py-2 shadow-sm">
          <img src="/suunto-logo.png" alt="Suunto" className="h-10 w-auto" />
        </span>
      </div>
      <ol className="ml-4 list-decimal space-y-1 text-sm text-slate-300">
        <li>{t("linked.xiaomi.step1")}</li>
        <li>{t("linked.xiaomi.step2")}</li>
        <li>{t("linked.xiaomi.step3")}</li>
      </ol>
      <p className="mt-3 text-xs text-slate-400">{t("linked.xiaomi.note")}</p>
    </Card>
  );
}

function StravaCard() {
  const { t } = useI18n();
  const [st, setSt] = useState<{ available: boolean; linked: boolean; last_sync_at: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const load = () => api.stravaStatus().then(setSt).catch(() => setSt(null));
  useEffect(() => { load(); }, []);
  if (!st || !st.available) return null;

  async function connect() {
    try { const r = await api.stravaConnect(); window.location.href = r.authorize_url; } catch (e) { setMsg(String(e)); }
  }
  async function sync() {
    setBusy(true); setMsg("");
    try {
      const r = await api.stravaSync();
      setMsg(r.message ?? t("settings.polar.result", { imported: String(r.imported), skipped: String(r.skipped) }));
      await load();
    } catch (e) { setMsg(String(e)); }
    finally { setBusy(false); }
  }
  async function unlink() {
    await api.stravaUnlink().catch(() => {});
    setMsg(""); load();
  }

  return (
    <Card className="p-5">
      <h3 className="mb-1 font-semibold">{t("settings.strava.title")}</h3>
      <p className="mb-3 text-sm text-slate-300">{t("settings.strava.hint")}</p>
      {!st.linked ? (
        <Button onClick={connect}>{t("settings.strava.connect")}</Button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-emerald-700 dark:text-emerald-400">{t("settings.strava.connected")}</span>
          <Button variant="secondary" onClick={sync} disabled={busy}>{busy ? t("settings.polar.importing") : t("settings.strava.sync")}</Button>
          <Button variant="ghost" onClick={unlink}>{t("settings.strava.unlink")}</Button>
        </div>
      )}
      {msg && <p className="mt-2 text-xs text-slate-400">{msg}</p>}
    </Card>
  );
}
