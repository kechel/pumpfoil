import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, WatchLayout } from "../lib/api";
import { Button, Card, ErrorBox } from "../components/ui";
import { WatchIcon, ChevronIcon, DownloadIcon } from "../components/Icons";
import { FIELD_OPTIONS } from "../lib/fields";
import { MOCK_VALUE, valueColor } from "../lib/watchLayout";
import { LayoutPreview } from "../components/LayoutPreview";
import { WatchMatrix } from "../components/WatchMatrix";
import { WatchGuide } from "../components/WatchGuide";
import { ConnectIqButton } from "../components/ConnectIqButton";
import { useT } from "../i18n";

export default function Account() {
  const t = useT();
  const [sp] = useSearchParams();
  const TABS = ["guide", "connect", "views", "alarm", "app", "compat"] as const;
  const paramTab = sp.get("tab");
  const initialTab = (TABS as readonly string[]).includes(paramTab ?? "") ? (paramTab as typeof TABS[number]) : "guide";
  const [tab, setTab] = useState<"guide" | "connect" | "views" | "alarm" | "app" | "compat">(initialTab);
  const dlQuery = sp.get("dl") ?? "";

  // Wer schon eine Uhr verbunden hat, kommt nicht wegen der Anleitung — der will einstellen, was sie
  // anzeigt. Also „Datenfelder" als Startseite, sobald ein nicht widerrufenes Gerät existiert.
  // Ein ?tab=… in der URL hat Vorrang (Deep-Links aus anderen Seiten dürfen nicht umspringen), und
  // umgeschaltet wird nur, solange der Nutzer noch nichts selbst angeklickt hat.
  const [tabTouched, setTabTouched] = useState(false);
  useEffect(() => {
    if (paramTab || tabTouched) return;
    api.myDevices()
      .then((rows) => {
        if (rows.some((d) => !d.revoked_at)) setTab((cur) => (cur === "guide" ? "views" : cur));
      })
      .catch(() => {});
  }, [paramTab, tabTouched]);
  const pickTab = (v: typeof TABS[number]) => { setTabTouched(true); setTab(v); };

  return (
    <div className="w-full">
      <Link to="/einstellungen" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-300 hover:text-slate-200">
        <ChevronIcon className="h-4 w-4 rotate-180" /> {t("nav.profile")}
      </Link>
      <div className="mb-4 flex items-center gap-2">
        <WatchIcon className="h-6 w-6 text-brand-400" />
        <h2 className="text-xl font-bold">{t("nav.watch")}</h2>
      </div>

      <div className="mb-5 grid grid-cols-3 gap-1 rounded-xl border border-slate-800 bg-slate-900/60 p-1 sm:grid-cols-5">
        <TabBtn active={tab === "guide"} onClick={() => pickTab("guide")}>{t("account.tabGuide")}</TabBtn>
        <TabBtn active={tab === "views"} onClick={() => pickTab("views")}>{t("account.tabViews")}</TabBtn>
        <TabBtn active={tab === "alarm"} onClick={() => pickTab("alarm")}>{t("account.tabAlarm")}</TabBtn>
        <TabBtn active={tab === "connect"} onClick={() => pickTab("connect")}>{t("account.tabConnect")}</TabBtn>
        <TabBtn active={tab === "compat"} onClick={() => pickTab("compat")}>{t("account.tabCompat")}</TabBtn>
      </div>

      {tab === "guide" && <WatchGuide onOpenApp={() => setTab("app")} onOpenConnect={() => setTab("connect")} />}

      {tab === "connect" && (
      <>
      <ClaimFromWatch />
      {FORWARD_PAIRING_SICHTBAR && <GenerateCode />}
      <PairedDevices onDownload={() => setTab("app")} />
      </>
      )}

      {tab === "views" && <ViewsEditor />}
      {tab === "alarm" && <AlarmEditor />}
      {tab === "app" && <AppDownloads initialQuery={dlQuery} />}
      {tab === "compat" && (
        <Card className="mt-5 p-5">
          <h3 className="mb-1 font-semibold">{t("watches.title")}</h3>
          <p className="mb-4 text-sm text-slate-300">{t("watches.intro")}</p>
          <WatchMatrix />
        </Card>
      )}
    </div>
  );
}

// Reverse-Pairing: Code, den die Uhr anzeigt, hier eingeben. Gilt fuer ALLE vier Plattformen
// (Garmin, Amazfit/Zepp, Wear OS, Apple Watch) -- der Hilfetext beschrieb lange nur den
// Garmin-Weg ("MENU halten"), den es auf den anderen Uhren gar nicht gibt.
function ClaimFromWatch() {
  const t = useT();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function claim() {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await api.pairClaim(code.trim().toUpperCase());
      setMsg(r.already ? t("account.claimAlready") : t("account.claimOk"));
      setCode("");
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }
  return (
    <Card className="mt-5 p-5">
      <h3 className="mb-1 font-semibold">{t("account.claimTitle")}</h3>
      {/* Erst installieren, dann verbinden: ein Nutzer scheiterte am fehlenden Wear-OS-App auf
          der Uhr und suchte den Fehler beim Pairing (07.08.). Der Hinweis gehoert genau hierhin,
          wo man die Uhr registriert — nicht nur in die Anleitung. */}
      <p className="mb-2 text-slate-300">{t("account.claimInstallFirst")}</p>
      <p className="mb-2 text-slate-300">{t("account.claimHelp")}</p>
      <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-amber-700 dark:text-amber-300">{t("account.claimReq")}</p>
      <div className="flex flex-wrap gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={8}
          placeholder={t("account.claimPlaceholder")}
          className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 font-mono tracking-widest text-slate-100"
        />
        <Button onClick={claim} disabled={busy || code.trim().length < 4}>
          {busy ? "…" : t("account.claimBtn")}
        </Button>
      </div>
      {msg && <div className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">{msg}</div>}
      {err && <div className="mt-3"><ErrorBox message={err} /></div>}
    </Card>
  );
}

// AUSGEBLENDET (Jan, 05.08.2026): „Code von der Uhr" funktioniert auf ALLEN Uhren gleich, dieser
// Weg dagegen nur bei Garmin — Wear OS, Apple Watch und Amazfit haben keine Code-Eingabe in ihren
// Companion-Apps (Zepp ausdrücklich: `watch-zepp/setting/index.js` „PAIRING = REVERSE"). Zwei Wege
// nebeneinander stiften mehr Verwirrung als sie helfen. Komponente, Server-Route und Texte bleiben
// absichtlich stehen: Wiedereinschalten ist damit dieses eine Flag.
const FORWARD_PAIRING_SICHTBAR = false;

// Forward-Pairing: Code hier erzeugen und in den Garmin-Connect-App-Einstellungen
// (Pumpfoil → Einstellungen → Pairing-Code) eintragen. Alternative zum Code von der Uhr.
function GenerateCode() {
  const t = useT();
  const [code, setCode] = useState<string | null>(null);
  const [until, setUntil] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function gen() {
    setBusy(true); setErr(null);
    try {
      const r = await api.pairingCode();
      setCode(r.code);
      setUntil(new Date(r.expires_at).toLocaleTimeString());
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }
  return (
    <Card className="mt-5 p-5">
      <h3 className="mb-1 font-semibold">{t("account.genTitle")}</h3>
      <p className="mb-3 text-sm text-slate-300">{t("account.genHelp")}</p>
      <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-slate-300">
        <li>{t("account.step1")}</li>
        <li>{t("account.step2pre")}<b>Pumpfoil</b>{t("account.step2post")}</li>
        <li>{t("account.step3")}</li>
      </ol>
      <Button onClick={gen} disabled={busy}>{busy ? "…" : t("account.genCode")}</Button>
      {code && (
        <div className="mt-4">
          <div className="font-mono text-3xl font-bold tracking-[0.3em] text-brand-400">{code}</div>
          {until && <div className="mt-1 text-xs text-slate-400">{t("account.validUntil", { time: until })}</div>}
        </div>
      )}
      {err && <div className="mt-3"><ErrorBox message={err} /></div>}
    </Card>
  );
}

function PairedDevices({ onDownload }: { onDownload?: () => void }) {
  const t = useT();
  const [devices, setDevices] = useState<import("../lib/api").PairedDevice[] | null>(null);
  // Ausgeblendete Uhren: erneutes Pairing legt jedes Mal eine neue Zeile an, und Zeilen mit
  // Sessions duerfen nicht geloescht werden (sonst verlieren die Sessions ihre Zuordnung).
  // Ein Nutzer hatte 5 Eintraege fuer EINE Uhr — Ausblenden loest das ohne Datenwanderung.
  const [showHidden, setShowHidden] = useState(false);
  // Anzahl der Ausgeblendeten getrennt halten: sie kommt normalerweise an jedem Eintrag mit
  // (hidden_total), aber wer seine EINZIGE Uhr ausblendet, hat eine leere Liste — dann gaebe es
  // nichts, woran die Zahl haengt, und der Einblenden-Knopf waere weg. In dem Fall einmal
  // gezielt mit include_hidden nachfragen.
  const [hiddenTotal, setHiddenTotal] = useState(0);
  const load = (mitVersteckten = showHidden) =>
    api.myDevices(mitVersteckten).then((ds) => {
      setDevices(ds);
      if (ds.length > 0) setHiddenTotal(ds[0].hidden_total ?? 0);
      else if (!mitVersteckten) api.myDevices(true).then((alle) => setHiddenTotal(alle.length)).catch(() => {});
      else setHiddenTotal(0);
    }).catch(() => setDevices([]));
  useEffect(() => { load(showHidden); }, [showHidden]);

  const revoke = (id: number, label: string | null) => {
    if (!confirm(t("account.revokeConfirm", { name: label || t("account.deviceUnnamed") }))) return;
    api.revokeDevice(id).then(() => load()).catch(() => {});
  };
  // „Entfernen" gibt es NUR fuer Geraete ohne Session: fehlgeschlagene Pairing-Versuche sammeln
  // sich sonst als Karteileichen an, die niemand loswird (Nutzerfeedback 07.08.). Haengt eine
  // Session dran, bleibt es beim Widerruf — sonst verliert die Session ihre Geraete-Zuordnung.
  const forget = (id: number, label: string | null) => {
    if (!confirm(t("account.deviceForgetConfirm", { name: label || t("account.deviceUnnamed") }))) return;
    api.forgetDevice(id).then(() => load()).catch(() => {});
  };
  const resetCanary = (id: number) => {
    api.resetLayoutCanary(id).then(() => load()).catch(() => {});
  };
  // Ausblenden/Einblenden — rein kosmetisch, die Uhr laedt weiter hoch.
  const hide = (id: number, hidden: boolean) => {
    api.hideDevice(id, hidden).then(() => load()).catch(() => {});
  };
  const setMode = (id: number, mode: string) => {
    setDevices((ds) => (ds ? ds.map((x) => (x.id === id ? { ...x, record_mode: mode } : x)) : ds));
    api.setDeviceRecordMode(id, mode).catch(() => load());
  };
  const fmt = (s: string | null) => (s ? new Date(s).toLocaleString() : "–");

  if (!devices) return null;

  return (
    <Card className="mt-5 p-5">
      <h3 className="mb-1 font-semibold">{t("account.devicesTitle")}</h3>
      <p className="mb-3 text-sm text-slate-300">{t("account.devicesHint")}</p>
      {devices.length === 0 ? (
        <p className="text-sm text-slate-400">{t("account.devicesNone")}</p>
      ) : (
        <div className="space-y-2">
          {devices.map((d) => (
            <div key={d.id} className={`flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3 ${d.revoked_at ? "opacity-60" : ""}`}>
              <WatchIcon className="h-5 w-5 shrink-0 text-brand-400" />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-slate-100">
                  {d.model || d.label || t("account.deviceUnnamed")}
                  {d.app_version && <span className="ml-2 text-xs font-normal text-slate-400">v{d.app_version}</span>}
                  {d.revoked_at && <span className="ml-2 rounded bg-slate-700/60 px-1.5 py-0.5 text-[10px] uppercase text-slate-300">{t("account.deviceRevoked")}</span>}
                </div>
                <div className="text-xs text-slate-400">
                  {t("account.deviceLastSeen", { time: fmt(d.last_seen_at) })} · {t("account.devicePaired", { time: fmt(d.created_at) })}
                </div>
                {d.update_available && !d.revoked_at && (
                  d.model_id ? (
                    // Modell bekannt -> 1-Klick-Direktdownload des passenden .prg.
                    <a href={`/api/app/download/${d.model_id}`} download
                      className="mt-1 inline-block rounded bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-500/25 dark:text-amber-300">
                      {t("account.deviceUpdate", { version: d.latest_version ?? "" })}
                    </a>
                  ) : (
                    // Modell noch unbekannt -> zur Download-Liste (Suche).
                    <button onClick={() => onDownload?.()} className="mt-1 inline-block rounded bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-500/25 dark:text-amber-300">
                      {t("account.deviceUpdate", { version: d.latest_version ?? "" })}
                    </button>
                  )
                )}
                {/* Aufzeichnungsmodus getrennt je Uhr (nur aktive Geräte). */}
                {!d.revoked_at && (
                  <div className="mt-2">
                    <label className="mb-1 block text-xs text-slate-400">{t("account.recordMode")}</label>
                    <select value={d.record_mode} onChange={(e) => setMode(d.id, e.target.value)}
                      className="w-full max-w-sm truncate rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100">
                      <option value="full">{t("account.recordModeFull")}</option>
                      <option value="lite">{t("account.recordModeLite")}</option>
                      <option value="gps">{t("account.recordModeGps")}</option>
                    </select>
                    {d.low_accel && d.record_mode === "full" && (
                      <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">{t("account.recordModeAutoLite")}</p>
                    )}
                    {/* „Nur GPS" schaltet alles ab, was aus der Bewegung kommt — das muss dranstehen.
                        Anlass: ein Nutzer waehlte „Sparsam" und wunderte sich, dass Pumps fehlten
                        (dort lag es an einer zu hohen Server-Schwelle, seit 13.08. behoben). Bei
                        „Nur GPS" ist der Verlust echt und unvermeidbar. */}
                    {d.record_mode === "gps" && (
                      <p className="mt-1 text-sm text-amber-600 dark:text-amber-400">{t("account.recordModeGpsHint")}</p>
                    )}
                    {d.platform === "garmin" && (
                      <p className="mt-1 text-[11px] text-slate-400">{t("account.recordModeGarminHint")}</p>
                    )}
                  </div>
                )}
                {/* Eigene Layouts je Uhr: hat sie einen Absturz gemeldet, sind sie für DIESE Uhr
                    aus (andere Uhren/Nutzer unberührt) — mit Knopf zum Zurücksetzen. */}
                {!d.revoked_at && d.layout_capable && d.layout_state && d.layout_state !== "on" && (
                  <p className="mt-2 text-sm text-slate-300">
                    {t(`account.layoutState.${d.layout_state}`)}
                  </p>
                )}
                {!d.revoked_at && (d.layout_canary_count ?? 0) > 0 && (
                  <div className="mt-2 rounded-lg border border-amber-600/40 bg-amber-500/10 p-2">
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                      {t("account.layoutCanary", { n: d.layout_canary_count ?? 0 })}
                    </p>
                    <button onClick={() => resetCanary(d.id)}
                      className="mt-1 rounded-lg bg-slate-800 px-2.5 py-1.5 text-sm text-slate-100 hover:bg-slate-700">
                      {t("account.layoutCanaryReset")}
                    </button>
                  </div>
                )}
              </div>
              {(d.sessions ?? 1) === 0 && (
                <button onClick={() => forget(d.id, d.label)}
                  className="shrink-0 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-700">
                  {t("account.deviceForget")}
                </button>
              )}
              {/* Ausblenden: fuer Eintraege, die man nicht loeschen darf (Sessions haengen dran) */}
              <button onClick={() => hide(d.id, !d.hidden_at)}
                title={t("account.deviceHideHint")}
                className="shrink-0 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-700">
                {d.hidden_at ? t("account.deviceUnhide") : t("account.deviceHide")}
              </button>
              {!d.revoked_at && (
                <button onClick={() => revoke(d.id, d.label)}
                  className="btn-danger shrink-0 rounded-lg bg-red-500/10 px-2.5 py-1.5 text-xs text-red-700 hover:bg-red-500/20 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/70">
                  {t("account.deviceRevoke")}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {/* „N ausgeblendete anzeigen" — hidden_total kommt aus derselben Antwort (kein 2. Aufruf).
          Erscheint nur, wenn es welche gibt, bzw. um wieder einzuklappen. */}
      {(showHidden || hiddenTotal > 0) && (
        <button onClick={() => setShowHidden((v) => !v)}
          className="mt-3 text-sm text-slate-400 underline hover:text-slate-200">
          {showHidden
            ? t("account.devicesHideHidden")
            : t("account.devicesShowHidden", { n: String(hiddenTotal) })}
        </button>
      )}
    </Card>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-lg px-2 py-2 text-center text-xs font-medium transition-colors sm:text-sm ${
        active ? "bg-brand-500 text-slate-950" : "text-slate-200 hover:bg-slate-800"
      }`}
    >
      {children}
    </button>
  );
}

function AppDownloads({ initialQuery = "" }: { initialQuery?: string }) {
  const t = useT();
  const [devices, setDevices] = useState<import("../lib/api").AppDevice[] | null>(null);
  const [q, setQ] = useState(initialQuery);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.appDevices().then(setDevices).catch((e) => setErr(String(e)));
  }, []);

  // Diakritika entfernen (fēnix -> fenix), klein, für tolerante Suche.
  const norm = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  const filtered = (devices ?? []).filter((d) => {
    const tokens = norm(q).split(/\s+/).filter(Boolean);
    if (!tokens.length) return true;
    const hay = `${norm(d.name)} ${norm(d.id)}`;
    const haySquished = hay.replace(/\s+/g, "");
    // Jeder Such-Token muss vorkommen (UND) – mit oder ohne Leerzeichen.
    return tokens.every((t) => hay.includes(t) || haySquished.includes(t));
  });

  return (
    <Card className="mt-5 p-5">
      <h3 className="mb-1 font-semibold">{t("account.installTitle")}</h3>
      <p className="mb-3 text-sm text-slate-300">
        {t("account.installDesc")}
        {devices && <span className="ml-1 text-slate-400">{t("account.modelsCount", { n: devices.length })}</span>}
        {devices?.[0]?.version && (
          <span className="ml-1 inline-flex items-center rounded-md bg-slate-800 px-2 py-0.5 text-xs font-medium text-brand-300">
            v{devices[0].version}
          </span>
        )}
      </p>

      {/* Bequemster Weg zuerst: direkt aus dem Connect IQ Store (dorthin verlinkt auch der
          „neue Version"-Hinweis). Die Sideload-Liste darunter bleibt als Alternative. */}
      <div className="mb-4 rounded-xl border border-brand-500/30 bg-brand-500/10 p-3">
        <p className="mb-2 text-sm text-slate-200">{t("guide.g.storeLead")}</p>
        <ConnectIqButton />
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("account.deviceSearch")}
        className="mb-3 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400"
      />

      {err && <ErrorBox message={err} />}
      {!devices && !err && <div className="text-sm text-slate-400">{t("common.loading")}</div>}

      {devices && (
        <div className="max-h-80 divide-y divide-slate-800 overflow-y-auto rounded-xl border border-slate-800">
          {filtered.map((d) => (
            <a
              key={d.id}
              href={`/api/app/download/${d.id}`}
              className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm hover:bg-slate-800/60"
            >
              <span className="min-w-0">
                <span className="block truncate text-slate-100">{d.name}</span>
                <span className="text-xs text-slate-400">{d.w}×{d.h} · {Math.round(d.bytes / 1024)} KB</span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1 text-xs text-brand-300"><DownloadIcon className="h-3.5 w-3.5" /> .prg</span>
            </a>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-4 text-sm text-slate-400">{t("account.noDevice", { q })}</div>
          )}
        </div>
      )}

      <ol className="mt-4 space-y-2 text-sm text-slate-200">
        <Step n={1}>{t("account.sideStep1")}</Step>
        <Step n={2}>
          {t("account.sideStep2pre")}<code className="rounded bg-slate-800 px-1">GARMIN/APPS/</code>{t("account.sideStep2post")}
        </Step>
        <Step n={3}>{t("account.sideStep3")}</Step>
      </ol>
    </Card>
  );
}

// Datenseiten der Uhr: EINE frei sortierbare Liste, in der klassische 3-Feld-Ansichten und
// eigene Layouts gemischt stehen (Entscheidung Jan). Darunter je ein Abschnitt für den
// Off-Foil- und den Pausen-Screen, jeweils entweder 3 Datenfelder ODER ein eigener Screen.
// Die Uhr zeigt eigene Layouts noch nicht (F2 P2) — die Konfiguration entsteht hier trotzdem
// schon vollständig. Siehe docs/setup-and-watch-layouts.md.
type Page = number[] | number;
// Der Server behält maximal 12 Seiten (settings._clean_pages) — hier hart dieselbe Grenze,
// damit nichts stillschweigend beim Speichern verschwindet.
const MAX_PAGES = 12;

function ViewsEditor() {
  const t = useT();
  const [pages, setPages] = useState<Page[] | null>(null);
  const [offPages, setOffPages] = useState<Page[]>([]);
  const [pausePages, setPausePages] = useState<Page[]>([]);
  const [layouts, setLayouts] = useState<WatchLayout[]>([]);
  const [colorByValue, setColorByValue] = useState(false);
  const [autoStart, setAutoStart] = useState(true);
  const [layoutsEnabled, setLayoutsEnabled] = useState(true);
  const [browseAll, setBrowseAll] = useState(true);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.getSettings().then((s) => {
      setPages((s.pages as Page[]) ?? (s.views as number[][]) ?? [[1, 2, 0]]);
      setColorByValue(!!s.colorByValue);
      setAutoStart(s.auto_start !== false);
      setLayoutsEnabled(s.layouts_enabled !== false);
      setBrowseAll(s.browse_all_pages !== false);
      // F3: Off-Foil und Pause sind Listen. Wer noch die alte Einzel-Konfiguration hat, sieht sie
      // hier als Liste MIT EINEM Eintrag — nichts geht verloren und nichts wird stillschweigend
      // umgeschrieben (gespeichert wird erst, wenn der Nutzer speichert).
      const one = (layoutId: unknown, view: unknown, fallback: number[]): Page[] =>
        typeof layoutId === "number" && layoutId ? [layoutId]
        : Array.isArray(view) ? [view as number[]] : [fallback];
      setOffPages((s.off_foil_pages as Page[]) ?? one(s.off_foil_layout_id, s.off_foil_view, [12, 17, 16]));
      setPausePages((s.pause_pages as Page[]) ?? one(s.pause_layout_id, s.pause_view, [12, 20, 2]));
    }).catch((e) => setErr(String(e)));
    api.layouts().then(setLayouts).catch(() => {});
  }, []);

  async function save() {
    setErr(null);
    try {
      const res = await api.saveSettings({
        pages, colorByValue, auto_start: autoStart, layouts_enabled: layoutsEnabled,
        off_foil_pages: offPages, pause_pages: pausePages, browse_all_pages: browseAll,
      });
      setPages((res.pages as Page[]) ?? pages);
      setColorByValue(!!res.colorByValue);
      setAutoStart(res.auto_start !== false);
      setLayoutsEnabled(res.layouts_enabled !== false);
      setBrowseAll(res.browse_all_pages !== false);
      if (res.off_foil_pages) setOffPages(res.off_foil_pages as Page[]);
      if (res.pause_pages) setPausePages(res.pause_pages as Page[]);
      setSaved(true);
    } catch (e) {
      setErr(String(e));
    }
  }

  if (!pages) return null;
  return (
    <Card className="mt-5 p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{t("account.viewsTitle")}</h3>
        {/* Einstieg in die frei positionierbaren Layouts — BEIDE Wege sichtbar: eigene bauen und
            fertige von anderen holen. Jan suchte die Galerie hier und fand nur „eigenen Screen
            hinzufügen", also war sie faktisch versteckt. */}
        <div className="flex flex-wrap gap-2">
          <Link to="/layouts/community" className="rounded-xl bg-brand-500 px-3 py-1.5 text-sm text-slate-950 hover:bg-brand-400">
            {t("lay.toCommunity")} →
          </Link>
          <Link to="/layouts" className="rounded-xl bg-brand-500 px-3 py-1.5 text-sm text-slate-950 hover:bg-brand-400">
            {t("account.toLayouts")} →
          </Link>
        </div>
      </div>
      <p className="mb-3 text-sm text-slate-300">{t("account.viewsDesc")}</p>
      <label className="mb-2 flex items-center gap-2 text-sm text-slate-200">
        <input type="checkbox" checked={colorByValue} onChange={(e) => { setColorByValue(e.target.checked); setSaved(false); }} />
        {t("account.colorByValue")}
      </label>
      <label className="mb-2 flex items-center gap-2 text-sm text-slate-200">
        <input type="checkbox" checked={autoStart} onChange={(e) => { setAutoStart(e.target.checked); setSaved(false); }} />
        {t("account.autoStart")}
      </label>
      {/* Not-Aus für die eigenen Layouts auf der Uhr. Wirkt nur für DICH — Layouts anderer
          Nutzer sind davon unberührt. Aus = die Uhr fährt die klassischen 3-Feld-Ansichten. */}
      <label className="mb-1 flex items-center gap-2 text-sm text-slate-200">
        <input type="checkbox" checked={layoutsEnabled}
          onChange={(e) => { setLayoutsEnabled(e.target.checked); setSaved(false); }} />
        {t("account.layoutsEnabled")}
      </label>
      <p className="mb-3 text-sm text-slate-400">{t("account.layoutsEnabledHint")}</p>
      {/* F3-Schalter: Default AN, damit niemand Seiten verliert, die er heute erreicht. Aus = je
          Zustand strikt nur die zugehörigen Screens (Jans Modell für Fortgeschrittene). */}
      <label className="mb-1 flex items-center gap-2 text-sm text-slate-200">
        <input type="checkbox" checked={browseAll}
          onChange={(e) => { setBrowseAll(e.target.checked); setSaved(false); }} />
        {t("account.browseAll")}
      </label>
      <p className="mb-4 text-sm text-slate-400">{t("account.browseAllHint")}</p>
      <p className="mb-4 text-sm text-slate-400">{t("account.recordModeMoved")}</p>

      <PageList title={t("account.onFoilTitle")} desc={t("account.onFoilDesc")}
        pages={pages} setPages={(v) => { setPages(v); setSaved(false); }}
        layouts={layouts} category="on_foil" colorByValue={colorByValue} keepOne />
      <PageList title={t("account.offFoilTitle")} desc={t("account.offFoilDesc")}
        pages={offPages} setPages={(v) => { setOffPages(v); setSaved(false); }}
        layouts={layouts} category="off_foil" colorByValue={colorByValue} />
      <PageList title={t("account.pauseTitle")} desc={t("account.pauseDesc")}
        pages={pausePages} setPages={(v) => { setPausePages(v); setSaved(false); }}
        layouts={layouts} category="pause" colorByValue={colorByValue} />

      <div className="mt-4 flex items-center gap-3">
        <Button onClick={save} className="text-sm">{t("common.save")}</Button>
        {saved && <span className="text-sm text-emerald-700 dark:text-emerald-400">{t("account.saved")}</span>}
      </div>
      {err && <div className="mt-3"><ErrorBox message={err} /></div>}
    </Card>
  );
}

// EINE Seitenliste, dreimal verwendet — on_foil, off_foil, pause (F3, Jan: „bitte gleich beide
// generisch machen … so dass man ueberall beliebig viele einfuegen kann"). Vorher war on_foil eine
// Liste und die beiden anderen je EIN Screen; genau daran ist ein Nutzer hängengeblieben.
// `keepOne` gilt nur für on_foil: eine Uhr ohne Datenseite gibt es nicht. Off-Foil und Pause dürfen
// leer bleiben — dann liefert der Server den bisherigen Standard-Screen.
function PageList({ title, desc, pages, setPages, layouts, category, colorByValue, keepOne = false }: {
  title: string; desc: string;
  pages: Page[]; setPages: (v: Page[]) => void;
  layouts: WatchLayout[]; category: "on_foil" | "off_foil" | "pause";
  colorByValue: boolean; keepOne?: boolean;
}) {
  const t = useT();
  const byId = (id: number) => layouts.find((l) => l.id === id);
  const options = layouts.filter((l) => l.category === category);
  const full = pages.length >= MAX_PAGES;
  // Neu hinzugefügte Seite kurz hervorheben und ins Bild holen. Sonst sieht man beim wiederholten
  // Klicken nicht, dass etwas dazukommt — der Knopf wandert nach unten weg, die neue Karte erscheint
  // direkt darüber, und bei langer Liste ist das außerhalb des Sichtfensters (Einwand Jan).
  const [added, setAdded] = useState(-1);
  const addedRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (added < 0) return;
    addedRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const to = setTimeout(() => setAdded(-1), 1600);
    return () => clearTimeout(to);
  }, [added]);
  const append = (pg: Page) => { setPages([...pages, pg]); setAdded(pages.length); };
  const move = (pi: number, dir: -1 | 1) => {
    const next = [...pages];
    const j = pi + dir;
    if (j < 0 || j >= next.length) return;
    [next[pi], next[j]] = [next[j], next[pi]];
    setPages(next);
  };
  return (
    <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/40 p-3">
      <div className="mb-1 text-sm font-semibold text-slate-200">{title}</div>
      <p className="mb-2 text-sm text-slate-400">{desc}</p>
      <div className="space-y-3">
        {pages.map((pg, pi) => {
          const isLayout = !Array.isArray(pg);
          const l = isLayout ? byId(pg as number) : undefined;
          return (
            <div key={pi} ref={pi === added ? addedRef : undefined}
              className={`rounded-xl border p-3 transition-shadow ${isLayout ? "border-brand-700/40 bg-brand-500/5" : "border-slate-800 bg-slate-900/50"} ${pi === added ? "ring-2 ring-brand-400" : ""}`}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-200">
                  {t("account.pageN", { n: pi + 1 })}
                  {isLayout && <span className="ml-2 text-brand-700 dark:text-brand-300">{l ? l.name : t("account.layoutMissing")}</span>}
                </span>
                <div className="flex items-center gap-1 text-slate-300">
                  <button onClick={() => move(pi, -1)} disabled={pi === 0} className="rounded px-2 py-1 hover:bg-slate-800 disabled:opacity-30">↑</button>
                  <button onClick={() => move(pi, 1)} disabled={pi === pages.length - 1} className="rounded px-2 py-1 hover:bg-slate-800 disabled:opacity-30">↓</button>
                  <button onClick={() => setPages(pages.filter((_, i) => i !== pi))}
                    disabled={keepOne && pages.length <= 1}
                    title={keepOne && pages.length <= 1 ? t("account.keepOnePage") : undefined}
                    className="rounded px-2 py-1 text-red-400 hover:bg-slate-800 disabled:opacity-30">{t("common.deleteLower")}</button>
                </div>
              </div>
              {isLayout ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  {l && <LayoutPreview layout={l} w={l.authored_w || 240} h={l.authored_h || 240} px={130}
                    pageCount={pages.length} pageIndex={pi} />}
                  <Link to={`/layouts/${pg}`} className="text-sm text-brand-700 hover:underline dark:text-brand-300">
                    {t("lay.edit")} →
                  </Link>
                </div>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <WatchPreview fields={pg as number[]} colorByValue={colorByValue} />
                  <div className="flex-1 space-y-2">
                    {[0, 1, 2].map((fi) => (
                      <select key={fi} value={(pg as number[])[fi] ?? 0}
                        onChange={(e) => {
                          const next = pages.map((x) => (Array.isArray(x) ? [...x] : x));
                          (next[pi] as number[])[fi] = Number(e.target.value);
                          setPages(next);
                        }}
                        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-sm text-slate-100">
                        {FIELD_OPTIONS.map((o) => <option key={o.id} value={o.id}>{t(`field.${o.id}`)}</option>)}
                      </select>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {pages.length === 0 && (
          <p className="text-sm text-slate-400">{t("account.emptyStateDefault")}</p>
        )}
      </div>
      {/* Knöpfe UNTER der Liste — dort standen sie ursprünglich. Kurz waren sie oben, weil es aussah
          als hätte ein Nutzer sie nicht gefunden; er hatte sie gefunden, das war ein Missverständnis.
          Das Cyan bleibt, das reicht als Auffälligkeit (Jan: „so blau ist das ausreichend"). */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select value="" disabled={options.length === 0 || full}
          onChange={(e) => { const id = Number(e.target.value); if (id) append(id); e.currentTarget.value = ""; }}
          className="rounded-xl bg-brand-500 px-3 py-2 text-sm text-slate-950 hover:bg-brand-400 disabled:opacity-40">
          <option value="">{t("account.addLayoutPage")}</option>
          {options.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <button onClick={() => append([1, 0, 0])} disabled={full}
          className="rounded-xl bg-slate-800 px-3 py-2 text-sm text-slate-100 hover:bg-slate-700 disabled:opacity-40">
          {t("account.addView")}
        </button>
        {full && <span className="text-sm text-slate-400">{t("account.maxPages", { n: MAX_PAGES })}</span>}
        {options.length === 0 && (
          <span className="text-sm text-slate-400">{t("account.noLayoutsOfKind")}</span>
        )}
      </div>
    </div>
  );
}

// Runde Uhr-Vorschau: aktive Felder gleichmäßig gestapelt (wie RecordView), Schrift
// bei 1–2 Feldern groß, bei 3 kleiner; optional je nach Wert eingefärbt.
// Werte, Farb-Buckets und Labels kommen aus lib/watchLayout — dieselbe Quelle wie der
// Advanced-Layout-Editor; Labels sind die KURZEN Uhr-Formulierungen (`fw.*`) in Nutzersprache.
function WatchPreview({ fields, colorByValue }: { fields: number[]; colorByValue: boolean }) {
  const t = useT();
  const active = fields.filter((f) => f !== 0);
  const n = active.length;
  const valSize = n === 1 ? "text-2xl" : n === 2 ? "text-xl" : "text-base";
  return (
    <div className="flex h-36 w-36 shrink-0 flex-col items-center justify-around self-center rounded-full border-2 border-slate-700 bg-black px-4 py-5 text-center">
      {n === 0 ? (
        <span className="text-xs text-slate-600">—</span>
      ) : active.map((f, i) => (
        <div key={i} className="leading-none">
          <div className={`${valSize} font-bold tabular-nums`}
            style={{ color: valueColor(f, colorByValue) ?? "#f1f5f9" }}>
            {MOCK_VALUE[f] ?? "—"}
          </div>
          <div className="mt-0.5 text-[9px] text-slate-400">{t(`fw.${f}`)}</div>
        </div>
      ))}
    </div>
  );
}

function AlarmEditor() {
  const t = useT();
  const [s, setS] = useState<Record<string, any> | null>(null);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { api.getSettings().then(setS).catch((e) => setErr(String(e))); }, []);

  const PATTERNS = [
    { id: "short1", label: t("alarm.patShort1") },
    { id: "short2", label: t("alarm.patShort2") },
    { id: "long2", label: t("alarm.patLong2") },
    { id: "lsl", label: t("alarm.patLsl") },
  ];

  function set(k: string, v: any) { setS((p) => ({ ...(p ?? {}), [k]: v })); setSaved(false); }
  async function save() {
    setErr(null);
    try {
      const res = await api.saveSettings({
        alarm_enabled: !!s?.alarm_enabled,
        speed_high: Number(s?.speed_high) || 0,
        speed_low: Number(s?.speed_low) || 0,
        alarm_pattern_high: s?.alarm_pattern_high ?? "short2",
        alarm_pattern_low: s?.alarm_pattern_low ?? "long2",
        alarm_repeat: s?.alarm_repeat ?? "once",
        alarm_default: s?.alarm_default ?? "foil",
      });
      setS(res);
      setSaved(true);
    } catch (e) { setErr(String(e)); }
  }

  if (!s) return null;
  const patSelect = (key: string) => (
    <select value={s[key] ?? (key.endsWith("high") ? "short2" : "long2")}
      onChange={(e) => set(key, e.target.value)}
      className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-sm text-slate-100">
      {PATTERNS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
    </select>
  );

  return (
    <Card className="mt-5 p-5">
      <h3 className="mb-1 font-semibold">{t("alarm.title")}</h3>
      <p className="mb-4 text-sm text-slate-300">{t("alarm.desc")}</p>

      <label className="mb-4 flex items-center gap-2 text-sm text-slate-200">
        <input type="checkbox" checked={!!s.alarm_enabled} onChange={(e) => set("alarm_enabled", e.target.checked)} />
        {t("alarm.enable")}
      </label>

      <div className={s.alarm_enabled ? "space-y-4" : "space-y-4 pointer-events-none opacity-40"}>
        {/* Vorwahl auf der Uhr: Standard-Foil (Auto-Schwellen) oder feste Werte unten */}
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-400">{t("alarm.defaultSource")}</span>
          <select value={s.alarm_default ?? "foil"} onChange={(e) => set("alarm_default", e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-slate-100">
            <option value="foil">{t("alarm.defaultFoil")}</option>
            <option value="fixed">{t("alarm.defaultFixed")}</option>
          </select>
        </label>
        <p className="-mt-2 text-xs text-slate-400">{t("alarm.defaultHelp")}</p>
        {/* Max-Speed (Überschreiten) */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
          <div className="mb-2 text-sm font-medium text-slate-200">{t("alarm.overTitle")}</div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              <span className="text-slate-400">{t("alarm.maxSpeed")}</span>
              <input type="number" min={0} max={60} value={s.speed_high ?? 0}
                onChange={(e) => set("speed_high", e.target.value)}
                className="w-20 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-100" />
              <span className="text-slate-400">km/h</span>
            </label>
            <label className="flex items-center gap-2">
              <span className="text-slate-400">{t("alarm.pattern")}</span>{patSelect("alarm_pattern_high")}
            </label>
          </div>
        </div>
        {/* Min-Speed (Unterschreiten) */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
          <div className="mb-2 text-sm font-medium text-slate-200">{t("alarm.underTitle")}</div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              <span className="text-slate-400">{t("alarm.minSpeed")}</span>
              <input type="number" min={0} max={60} value={s.speed_low ?? 0}
                onChange={(e) => set("speed_low", e.target.value)}
                className="w-20 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-100" />
              <span className="text-slate-400">km/h</span>
            </label>
            <label className="flex items-center gap-2">
              <span className="text-slate-400">{t("alarm.pattern")}</span>{patSelect("alarm_pattern_low")}
            </label>
          </div>
        </div>
        {/* Modus */}
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-400">{t("alarm.mode")}</span>
          <select value={s.alarm_repeat ?? "once"} onChange={(e) => set("alarm_repeat", e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-slate-100">
            <option value="once">{t("alarm.modeOnce")}</option>
            <option value="continuous">{t("alarm.modeContinuous")}</option>
          </select>
        </label>
        <p className="text-xs text-slate-400">{t("alarm.zeroHint")}</p>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button onClick={save} className="text-sm">{t("common.save")}</Button>
        {saved && <span className="text-sm text-emerald-700 dark:text-emerald-400">{t("account.saved")}</span>}
      </div>
      {err && <div className="mt-3"><ErrorBox message={err} /></div>}
    </Card>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-brand-400">
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}
