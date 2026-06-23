import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Button, Card, ErrorBox } from "../components/ui";
import { WatchIcon } from "../components/Icons";
import { FIELD_OPTIONS } from "../lib/fields";
import { WatchMatrix } from "../components/WatchMatrix";
import { useT } from "../i18n";

export default function Account() {
  const t = useT();
  const [code, setCode] = useState<string | null>(null);
  const [expires, setExpires] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setError(null);
    setBusy(true);
    try {
      const res = await api.pairingCode();
      setCode(res.code);
      setExpires(res.expires_at);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  const [tab, setTab] = useState<"connect" | "views" | "app" | "compat">("connect");

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-4 flex items-center gap-2">
        <WatchIcon className="h-6 w-6 text-brand-400" />
        <h2 className="text-xl font-bold">{t("nav.watch")}</h2>
      </div>

      <div className="mb-5 flex gap-1 rounded-xl border border-slate-800 bg-slate-900/60 p-1">
        <TabBtn active={tab === "connect"} onClick={() => setTab("connect")}>{t("account.tabConnect")}</TabBtn>
        <TabBtn active={tab === "views"} onClick={() => setTab("views")}>{t("account.tabViews")}</TabBtn>
        <TabBtn active={tab === "app"} onClick={() => setTab("app")}>{t("account.tabApp")}</TabBtn>
        <TabBtn active={tab === "compat"} onClick={() => setTab("compat")}>{t("account.tabCompat")}</TabBtn>
      </div>

      {tab === "connect" && (
      <Card className="p-5">
        <ol className="space-y-3 text-sm text-slate-200">
          <Step n={1}>{t("account.step1")}</Step>
          <Step n={2}>
            {t("account.step2pre")}<span className="text-slate-100">Pump Foil</span>{t("account.step2post")}
          </Step>
          <Step n={3}>{t("account.step3")}</Step>
        </ol>

        <div className="mt-6">
          <Button onClick={generate} className="w-full sm:w-auto">
            {busy ? "…" : t("account.genCode")}
          </Button>
        </div>

        {code && (
          <div className="mt-6 rounded-2xl border border-brand-600/40 bg-brand-500/10 p-6 text-center">
            <div className="font-mono text-4xl font-extrabold tracking-[0.3em] text-brand-400">
              {code}
            </div>
            {expires && (
              <div className="mt-2 text-xs text-slate-300">
                {t("account.validUntil", { time: new Date(expires).toLocaleTimeString() })}
              </div>
            )}
          </div>
        )}
        {error && <div className="mt-4"><ErrorBox message={error} /></div>}
      </Card>
      )}

      {tab === "views" && <ViewsEditor />}
      {tab === "app" && <AppDownloads />}
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

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active ? "bg-brand-500 text-slate-950" : "text-slate-200 hover:bg-slate-800"
      }`}
    >
      {children}
    </button>
  );
}

function AppDownloads() {
  const t = useT();
  const [devices, setDevices] = useState<import("../lib/api").AppDevice[] | null>(null);
  const [q, setQ] = useState("");
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
      </p>

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
              <span className="shrink-0 rounded-lg bg-slate-800 px-2.5 py-1 text-xs text-brand-300">⬇ .prg</span>
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

function ViewsEditor() {
  const t = useT();
  const [views, setViews] = useState<number[][] | null>(null);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.getSettings().then((s) => setViews(s.views ?? [[1, 2, 0]])).catch((e) => setErr(String(e)));
  }, []);

  function update(next: number[][]) {
    setViews(next);
    setSaved(false);
  }
  function setField(vi: number, fi: number, val: number) {
    const next = views!.map((v) => [...v]);
    next[vi][fi] = val;
    update(next);
  }
  function addView() { update([...(views ?? []), [1, 0, 0]]); }
  function delView(vi: number) { update(views!.filter((_, i) => i !== vi)); }
  function move(vi: number, dir: -1 | 1) {
    const next = [...views!];
    const j = vi + dir;
    if (j < 0 || j >= next.length) return;
    [next[vi], next[j]] = [next[j], next[vi]];
    update(next);
  }
  async function save() {
    setErr(null);
    try {
      const res = await api.saveSettings({ views });
      setViews(res.views);
      setSaved(true);
    } catch (e) {
      setErr(String(e));
    }
  }

  if (!views) return null;
  return (
    <Card className="mt-5 p-5">
      <h3 className="mb-1 font-semibold">{t("account.viewsTitle")}</h3>
      <p className="mb-4 text-sm text-slate-300">
        {t("account.viewsDesc")}
      </p>

      <div className="space-y-3">
        {views.map((v, vi) => (
          <div key={vi} className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-200">{t("account.viewN", { n: vi + 1 })}</span>
              <div className="flex items-center gap-1 text-slate-300">
                <button onClick={() => move(vi, -1)} disabled={vi === 0} className="rounded px-2 py-1 hover:bg-slate-800 disabled:opacity-30">↑</button>
                <button onClick={() => move(vi, 1)} disabled={vi === views.length - 1} className="rounded px-2 py-1 hover:bg-slate-800 disabled:opacity-30">↓</button>
                <button onClick={() => delView(vi)} className="rounded px-2 py-1 text-red-400 hover:bg-slate-800">{t("common.deleteLower")}</button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {[0, 1, 2].map((fi) => (
                <select
                  key={fi}
                  value={v[fi] ?? 0}
                  onChange={(e) => setField(vi, fi, Number(e.target.value))}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-sm text-slate-100"
                >
                  {FIELD_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button onClick={addView} className="rounded-xl bg-slate-800 px-3 py-2 text-sm text-slate-100 hover:bg-slate-700">{t("account.addView")}</button>
        <Button onClick={save} className="text-sm">{t("common.save")}</Button>
        {saved && <span className="text-sm text-emerald-400">{t("account.saved")}</span>}
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
