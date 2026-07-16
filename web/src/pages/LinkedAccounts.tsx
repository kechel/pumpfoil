import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Card, Button } from "../components/ui";
import { ChevronIcon, CheckIcon, LinkIcon } from "../components/Icons";
import { PlatformSubline } from "../components/SupportedPlatforms";
import { useI18n } from "../i18n";

// Generische „Verknüpfte Konten"-Seite: hostet Import-Integrationen (Polar; später
// Coros/Suunto/… und FIT/TCX-Upload). Jede Integration ist eine eigenständige Karte,
// die sich selbst ausblendet, wenn serverseitig nicht konfiguriert.
export default function LinkedAccounts() {
  const { t } = useI18n();
  // Ergebnis der OAuth-Verknüpfung (Callback leitet auf /konten?suunto=connected|cancelled|error).
  const [banner, setBanner] = useState<"ok" | "cancelled" | "error" | null>(null);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const s = p.get("suunto");
    if (s === "connected") setBanner("ok");
    else if (s === "cancelled") setBanner("cancelled");
    else if (s === "error") setBanner("error");
    if (s) {
      p.delete("suunto");
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
  const [msg, setMsg] = useState("");
  const load = () => api.corosStatus().then(setSt).catch(() => setSt(null));
  useEffect(() => { load(); }, []);
  if (!st || !st.available) return null;

  async function connect() {
    try { const r = await api.corosConnect(); window.location.href = r.authorize_url; } catch (e) { setMsg(String(e)); }
  }
  async function unlink() {
    await api.corosUnlink().catch(() => {});
    setMsg(""); load();
  }

  return (
    <Card className="p-5">
      <h3 className="mb-1 font-semibold">{t("settings.coros.title")}</h3>
      <p className="mb-3 text-sm text-slate-300">{t("settings.coros.hint")}</p>
      {!st.linked ? (
        <Button onClick={connect}>{t("settings.coros.connect")}</Button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-emerald-400">{t("settings.coros.connected")}</span>
          <Button variant="ghost" onClick={unlink}>{t("settings.coros.unlink")}</Button>
        </div>
      )}
      {msg && <p className="mt-2 text-xs text-slate-400">{msg}</p>}

      <div className="mt-4">
        <p className="mb-2 text-xs font-medium text-slate-400">{t("settings.coros.help")}</p>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-300">
          <li>{t("settings.coros.help1")}</li>
          <li>{t("settings.coros.help2")}</li>
          <li>{t("settings.coros.help3")}</li>
          <li>{t("settings.coros.help4")}</li>
        </ol>
      </div>
    </Card>
  );
}

// Polar AccessLink: Konto verknüpfen + Trainings importieren. Nur sichtbar, wenn
// serverseitig konfiguriert (status.available).
function PolarCard() {
  const { t } = useI18n();
  const [st, setSt] = useState<{ available: boolean; linked: boolean; last_sync_at: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const load = () => api.polarStatus().then(setSt).catch(() => setSt(null));
  useEffect(() => { load(); }, []);
  if (!st || !st.available) return null;

  async function connect() {
    try { const r = await api.polarConnect(); window.location.href = r.authorize_url; } catch (e) { setMsg(String(e)); }
  }
  async function sync() {
    setBusy(true); setMsg("");
    try {
      const r = await api.polarSync();
      setMsg(r.message ?? t("settings.polar.result", { imported: String(r.imported), skipped: String(r.skipped) }));
      await load();
    } catch (e) { setMsg(String(e)); }
    finally { setBusy(false); }
  }
  async function unlink() {
    await api.polarUnlink().catch(() => {});
    setMsg(""); load();
  }

  return (
    <Card className="p-5">
      <h3 className="mb-1 font-semibold">{t("settings.polar.title")}</h3>
      <p className="mb-2 text-sm text-slate-300">{t("settings.polar.hint")}</p>
      <p className="mb-3 rounded-lg bg-slate-800/60 px-3 py-2 text-xs text-slate-400">{t("settings.polar.scope")}</p>
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
          <Button variant="secondary" onClick={sync} disabled={busy}>{busy ? t("settings.polar.importing") : t("settings.polar.sync")}</Button>
          <Button variant="ghost" onClick={unlink}>{t("settings.polar.unlink")}</Button>
        </div>
      )}
      {msg && <p className="mt-2 text-xs text-slate-400">{msg}</p>}
    </Card>
  );
}

// Suunto Cloud API: Konto verknüpfen + Workouts importieren (Pull). Nur sichtbar, wenn
// serverseitig konfiguriert (status.available).
function SuuntoCard() {
  const { t } = useI18n();
  const [st, setSt] = useState<{ available: boolean; linked: boolean; last_sync_at: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const load = () => api.suuntoStatus().then(setSt).catch(() => setSt(null));
  useEffect(() => { load(); }, []);
  if (!st || !st.available) return null;

  async function connect() {
    try { const r = await api.suuntoConnect(); window.location.href = r.authorize_url; } catch (e) { setMsg(String(e)); }
  }
  async function sync() {
    setBusy(true); setMsg("");
    try {
      const r = await api.suuntoSync();
      setMsg(r.message ?? t("settings.polar.result", { imported: String(r.imported), skipped: String(r.skipped) }));
      await load();
    } catch (e) { setMsg(String(e)); }
    finally { setBusy(false); }
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
      {!st.linked ? (
        <Button onClick={connect}>{t("settings.suunto.connect")}</Button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={sync} disabled={busy}>{busy ? t("settings.polar.importing") : t("settings.suunto.sync")}</Button>
          <Button variant="ghost" onClick={unlink}>{t("settings.suunto.unlink")}</Button>
        </div>
      )}
      {msg && <p className="mt-2 text-xs text-slate-400">{msg}</p>}
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
          <span className="text-sm text-emerald-400">{t("settings.strava.connected")}</span>
          <Button variant="secondary" onClick={sync} disabled={busy}>{busy ? t("settings.polar.importing") : t("settings.strava.sync")}</Button>
          <Button variant="ghost" onClick={unlink}>{t("settings.strava.unlink")}</Button>
        </div>
      )}
      {msg && <p className="mt-2 text-xs text-slate-400">{msg}</p>}
    </Card>
  );
}
