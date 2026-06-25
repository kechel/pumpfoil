import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Button, Card, ErrorBox } from "../components/ui";
import { WatchIcon, ChevronIcon, DownloadIcon } from "../components/Icons";
import { FIELD_OPTIONS } from "../lib/fields";
import { WatchMatrix } from "../components/WatchMatrix";
import { WatchGuide } from "../components/WatchGuide";
import { useT } from "../i18n";

export default function Account() {
  const t = useT();
  const [tab, setTab] = useState<"guide" | "connect" | "views" | "alarm" | "app" | "compat">("guide");

  return (
    <div className="w-full">
      <Link to="/einstellungen" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-300 hover:text-slate-200">
        <ChevronIcon className="h-4 w-4 rotate-180" /> {t("nav.profile")}
      </Link>
      <div className="mb-4 flex items-center gap-2">
        <WatchIcon className="h-6 w-6 text-brand-400" />
        <h2 className="text-xl font-bold">{t("nav.watch")}</h2>
      </div>

      <div className="mb-5 grid grid-cols-3 gap-1 rounded-xl border border-slate-800 bg-slate-900/60 p-1 sm:grid-cols-6">
        <TabBtn active={tab === "guide"} onClick={() => setTab("guide")}>{t("account.tabGuide")}</TabBtn>
        <TabBtn active={tab === "views"} onClick={() => setTab("views")}>{t("account.tabViews")}</TabBtn>
        <TabBtn active={tab === "alarm"} onClick={() => setTab("alarm")}>{t("account.tabAlarm")}</TabBtn>
        <TabBtn active={tab === "app"} onClick={() => setTab("app")}>{t("account.tabApp")}</TabBtn>
        <TabBtn active={tab === "connect"} onClick={() => setTab("connect")}>{t("account.tabConnect")}</TabBtn>
        <TabBtn active={tab === "compat"} onClick={() => setTab("compat")}>{t("account.tabCompat")}</TabBtn>
      </div>

      {tab === "guide" && <WatchGuide />}

      {tab === "connect" && (
      <>
      <ClaimFromWatch />
      <PairedDevices />
      </>
      )}

      {tab === "views" && <ViewsEditor />}
      {tab === "alarm" && <AlarmEditor />}
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

// Reverse-Pairing: Code, den die Garmin-Uhr anzeigt, hier eingeben.
function ClaimFromWatch() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function claim() {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await api.pairClaim(code.trim().toUpperCase());
      setMsg(r.already ? "Diese Uhr ist bereits verbunden." : "Uhr verbunden! ✓");
      setCode("");
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }
  return (
    <Card className="mt-5 p-5">
      <h3 className="mb-1 font-semibold">Garmin: Code von der Uhr eingeben</h3>
      <p className="mb-3 text-sm text-slate-300">
        Pump Foil auf der Uhr öffnen (nicht starten) → <strong>MENU halten</strong> (Knopf
        Mitte-links) → „Einstellungen" → „Verbinden". Der angezeigte Code (6 Zeichen, Buchstaben
        &amp; Ziffern) hier eintragen. Handy in der Nähe oder WLAN nötig, damit die Uhr den Code
        erzeugen kann.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={8}
          placeholder="z. B. VURWGG"
          className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 font-mono tracking-widest text-slate-100"
        />
        <Button onClick={claim} disabled={busy || code.trim().length < 4}>
          {busy ? "…" : "Verbinden"}
        </Button>
      </div>
      {msg && <div className="mt-3 text-sm text-emerald-400">{msg}</div>}
      {err && <div className="mt-3"><ErrorBox message={err} /></div>}
    </Card>
  );
}

function PairedDevices() {
  const t = useT();
  const [devices, setDevices] = useState<import("../lib/api").PairedDevice[] | null>(null);
  const load = () => api.myDevices().then(setDevices).catch(() => setDevices([]));
  useEffect(() => { load(); }, []);

  const revoke = (id: number, label: string | null) => {
    if (!confirm(t("account.revokeConfirm", { name: label || t("account.deviceUnnamed") }))) return;
    api.revokeDevice(id).then(load).catch(() => {});
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
                  {d.label || t("account.deviceUnnamed")}
                  {d.revoked_at && <span className="ml-2 rounded bg-slate-700/60 px-1.5 py-0.5 text-[10px] uppercase text-slate-300">{t("account.deviceRevoked")}</span>}
                </div>
                <div className="text-xs text-slate-400">
                  {t("account.deviceLastSeen", { time: fmt(d.last_seen_at) })} · {t("account.devicePaired", { time: fmt(d.created_at) })}
                </div>
              </div>
              {!d.revoked_at && (
                <button onClick={() => revoke(d.id, d.label)}
                  className="shrink-0 rounded-lg bg-red-950/40 px-2.5 py-1.5 text-xs text-red-300 hover:bg-red-950/70">
                  {t("account.deviceRevoke")}
                </button>
              )}
            </div>
          ))}
        </div>
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
        {devices?.[0]?.version && (
          <span className="ml-1 inline-flex items-center rounded-md bg-slate-800 px-2 py-0.5 text-xs font-medium text-brand-300">
            v{devices[0].version}
          </span>
        )}
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

function ViewsEditor() {
  const t = useT();
  const [views, setViews] = useState<number[][] | null>(null);
  const [colorByValue, setColorByValue] = useState(false);
  const [offFoil, setOffFoil] = useState<number[]>([12, 17, 16]);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.getSettings().then((s) => {
      setViews(s.views ?? [[1, 2, 0]]);
      setColorByValue(!!s.colorByValue);
      setOffFoil(s.off_foil_view ?? [12, 17, 16]);
    }).catch((e) => setErr(String(e)));
  }, []);

  function setOffField(fi: number, val: number) {
    const next = [...offFoil]; next[fi] = val; setOffFoil(next); setSaved(false);
  }

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
      const res = await api.saveSettings({ views, colorByValue, off_foil_view: offFoil });
      setViews(res.views);
      setColorByValue(!!res.colorByValue);
      if (res.off_foil_view) setOffFoil(res.off_foil_view);
      setSaved(true);
    } catch (e) {
      setErr(String(e));
    }
  }

  if (!views) return null;
  return (
    <Card className="mt-5 p-5">
      <h3 className="mb-1 font-semibold">{t("account.viewsTitle")}</h3>
      <p className="mb-3 text-sm text-slate-300">
        {t("account.viewsDesc")}
      </p>
      <label className="mb-4 flex items-center gap-2 text-sm text-slate-200">
        <input type="checkbox" checked={colorByValue} onChange={(e) => { setColorByValue(e.target.checked); setSaved(false); }} />
        {t("account.colorByValue")}
      </label>

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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <WatchPreview fields={v} colorByValue={colorByValue} />
              <div className="flex-1 space-y-2">
                {[0, 1, 2].map((fi) => (
                  <select
                    key={fi}
                    value={v[fi] ?? 0}
                    onChange={(e) => setField(vi, fi, Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-sm text-slate-100"
                  >
                    {FIELD_OPTIONS.map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-xl border border-brand-700/40 bg-slate-900/50 p-3">
        <div className="mb-1 text-sm font-medium text-slate-200">Off-Foil-Screen</div>
        <p className="mb-2 text-xs text-slate-400">
          Wird auf der Uhr automatisch gezeigt, solange du gerade nicht foilst
          (Default: Uhrzeit + letzter Lauf). Beim Foilen schaltet die Uhr zurück
          auf deine zuletzt gewählte Ansicht.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <WatchPreview fields={offFoil} colorByValue={colorByValue} />
          <div className="flex-1 space-y-2">
            {[0, 1, 2].map((fi) => (
              <select
                key={fi}
                value={offFoil[fi] ?? 0}
                onChange={(e) => setOffField(fi, Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-sm text-slate-100"
              >
                {FIELD_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            ))}
          </div>
        </div>
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

// Beispiel-Readout je Feld (sieht aus wie auf der Uhr: großer Wert + kleines Label).
const SPEED_FIELDS = new Set([1, 5, 6, 7, 18, 19]);
const HR_FIELDS = new Set([2, 8, 9]);
const MOCK: Record<number, [string, string]> = {
  1: ["18.5", "km/h (3s)"], 5: ["19.2", "km/h"], 6: ["15.1", "km/h Ø"], 7: ["24.0", "km/h max"],
  2: ["142", "bpm"], 8: ["131", "bpm Ø"], 9: ["168", "bpm max"],
  3: ["12:34", "Zeit"], 4: ["2.10", "km"], 10: ["402", "m Höhe"], 13: ["35", "m ↑"],
  11: ["24", "°C"], 12: ["14:25", "Uhr"], 14: ["0:48", "Lauf"], 15: ["0.21", "km Lauf"],
  16: ["0:51", "letzter Lauf"], 17: ["0.22", "km letzter"], 18: ["14.9", "km/h Ø letzt."],
  19: ["19.6", "km/h max letzt."], 20: ["7", "Läufe"],
};
function watchSpeedColor(kmh: number): string {
  if (kmh < 12) return "#3b82f6"; if (kmh < 16) return "#22c55e"; if (kmh < 20) return "#eab308"; return "#ef4444";
}
function watchHrColor(hr: number): string {
  if (hr < 120) return "#22c55e"; if (hr < 150) return "#eab308"; if (hr < 170) return "#f97316"; return "#ef4444";
}

// Runde Uhr-Vorschau: aktive Felder gleichmäßig gestapelt (wie RecordView), Schrift
// bei 1–2 Feldern groß, bei 3 kleiner; optional je nach Wert eingefärbt.
function WatchPreview({ fields, colorByValue }: { fields: number[]; colorByValue: boolean }) {
  const active = fields.filter((f) => f !== 0);
  const n = active.length;
  const valSize = n === 1 ? "text-2xl" : n === 2 ? "text-xl" : "text-base";
  return (
    <div className="flex h-36 w-36 shrink-0 flex-col items-center justify-around self-center rounded-full border-2 border-slate-700 bg-black px-4 py-5 text-center">
      {n === 0 ? (
        <span className="text-xs text-slate-600">—</span>
      ) : active.map((f, i) => {
        const [val, label] = MOCK[f] ?? ["—", ""];
        let color = "#f1f5f9";
        if (colorByValue && SPEED_FIELDS.has(f)) color = watchSpeedColor(parseFloat(val));
        else if (colorByValue && HR_FIELDS.has(f)) color = watchHrColor(parseFloat(val));
        return (
          <div key={i} className="leading-none">
            <div className={`${valSize} font-bold tabular-nums`} style={{ color }}>{val}</div>
            <div className="mt-0.5 text-[9px] text-slate-400">{label}</div>
          </div>
        );
      })}
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
