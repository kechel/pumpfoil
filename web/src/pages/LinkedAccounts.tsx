import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Card, Button } from "../components/ui";
import { ChevronIcon } from "../components/Icons";
import { useI18n } from "../i18n";

// Generische „Verknüpfte Konten"-Seite: hostet Import-Integrationen (Polar; später
// Coros/Suunto/… und FIT/TCX-Upload). Jede Integration ist eine eigenständige Karte,
// die sich selbst ausblendet, wenn serverseitig nicht konfiguriert.
export default function LinkedAccounts() {
  const { t } = useI18n();
  return (
    <div className="w-full">
      <Link to="/einstellungen" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-300 hover:text-slate-200">
        <ChevronIcon className="h-4 w-4 rotate-180" /> {t("nav.profile")}
      </Link>
      <h2 className="mb-1 text-xl font-bold">{t("linked.title")}</h2>
      <p className="mb-4 text-sm text-slate-300">{t("linked.hint")}</p>
      <div className="space-y-4">
        <PolarCard />
        <CorosCard />
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

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-brand-300 hover:text-brand-200">{t("settings.coros.help")}</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-400">
          <li>{t("settings.coros.help1")}</li>
          <li>{t("settings.coros.help2")}</li>
          <li>{t("settings.coros.help3")}</li>
          <li>{t("settings.coros.help4")}</li>
        </ul>
      </details>
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
      <p className="mb-3 text-sm text-slate-300">{t("settings.polar.hint")}</p>
      {!st.linked ? (
        <Button onClick={connect}>{t("settings.polar.connect")}</Button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-emerald-400">{t("settings.polar.connected")}</span>
          <Button onClick={sync} disabled={busy}>{busy ? t("settings.polar.importing") : t("settings.polar.sync")}</Button>
          <Button variant="ghost" onClick={unlink}>{t("settings.polar.unlink")}</Button>
        </div>
      )}
      {msg && <p className="mt-2 text-xs text-slate-400">{msg}</p>}
    </Card>
  );
}
