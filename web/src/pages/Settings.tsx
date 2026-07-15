import { useEffect, useRef, useState } from "react";
import { api, clearToken } from "../lib/api";
import { Card, Button, Avatar } from "../components/ui";
import { Link } from "react-router-dom";
import { SettingsIcon, WatchIcon, ChevronIcon, FoilIcon, CalculatorIcon, DownloadIcon, UploadIcon } from "../components/Icons";
import { useI18n } from "../i18n";
import { APP_BUILD } from "../buildInfo";
import { LanguageSelect } from "../components/LanguageSelect";
import { ThemeSelect } from "../components/ThemeSelect";
import { FontScaleSelect } from "../components/FontScaleSelect";
import { InstallPwa } from "../components/InstallPwa";
import { PlatformSubline } from "../components/SupportedPlatforms";
import { MyFoilsSubline } from "../components/MyFoilsSubline";
import { NotificationsToggle } from "../components/NotificationsToggle";

export default function Settings() {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pwCur, setPwCur] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pwBusy, setPwBusy] = useState(false);
  const [homespot, setHomespot] = useState("");
  const [spots, setSpots] = useState<string[]>([]);
  const [weight, setWeight] = useState("");
  const [activityType, setActivityType] = useState("surfing");
  const [hasGarmin, setHasGarmin] = useState(false);   // Aktivitätstyp nur bei verknüpfter Garmin-Uhr
  const [savedToast, setSavedToast] = useState(false);
  const [watchUpdate, setWatchUpdate] = useState<{ version: string; platform: string; label: string; model: string } | null>(null);
  const [beta, setBeta] = useState(false);

  useEffect(() => {
    api.getSettings().then((s) => {
      setHomespot((s.homespot as string) ?? "");
      setWeight(s.weight_kg ? String(s.weight_kg) : "");
      setActivityType((s.activity_type as string) ?? "surfing");
    }).catch(() => {});
    api.communitySpots().then((s) => setSpots(s.all)).catch(() => {});
    // Uhr-Update-Hinweis direkt am Button, ohne erst in die Geräteliste zu klicken.
    // Nur für Garmin (Sideload-.prg). Zeigen NUR, wenn KEINE der verbundenen Garmin-Uhren
    // bereits die neueste Version hat — sobald eine aktuell ist, war das Update erfolgreich
    // (alte Test-/Re-Pairing-Tokens sollen nicht mehr nerven). Wear/Apple: eigene Stores.
    api.myDevices().then((ds) => {
      const garmins = ds.filter((x) => x.platform === "garmin" && !x.revoked_at);
      setHasGarmin(garmins.length > 0);
      const anyCurrent = garmins.some((x) => x.app_version && !x.update_available);
      const outdated = garmins.find((x) => x.update_available);
      if (!anyCurrent && outdated) {
        setWatchUpdate({ version: outdated.latest_version ?? "", platform: outdated.platform ?? "", label: outdated.label ?? "", model: outdated.model ?? "" });
      }
    }).catch(() => {});
  }, []);
  const platformLabel = (p: string) => (p ? p.charAt(0).toUpperCase() + p.slice(1) : "");
  // Suchfeld nur vorbelegen, wenn das Label ein echtes Modell ist (nicht das
  // generische „Garmin"/„Wear"/„Apple", das die Uhr beim Pairing meldet).
  function watchModelQuery(label: string, platform: string): string {
    const l = (label || "").trim();
    const generic = ["garmin", "wear", "apple", "watch", ""].includes(l.toLowerCase()) || l.toLowerCase() === platform.toLowerCase();
    return generic ? "" : `&dl=${encodeURIComponent(l)}`;
  }
  // Kurze, server-bestätigte „Gespeichert"-Rückmeldung (Profil speichert alles sofort ohne Button).
  const savedTimer = useRef<number | undefined>(undefined);
  function flashSaved() {
    setSavedToast(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSavedToast(false), 1600);
  }
  function saveHomespot(v: string) {
    setHomespot(v);
    api.saveSettings({ homespot: v }).then(flashSaved).catch(() => {});
  }
  function saveWeight() {
    api.saveSettings({ weight_kg: Number(weight) || 0 }).then(flashSaved).catch(() => {});
  }
  function saveActivityType(v: string) {
    setActivityType(v);
    api.saveSettings({ activity_type: v }).then(flashSaved).catch(() => {});
  }

  function changePw() {
    setPwMsg(null);
    if (pwNew.length < 8) { setPwMsg({ ok: false, text: t("profile.pwMin") }); return; }
    setPwBusy(true);
    api.changePassword(pwCur, pwNew)
      .then(() => { setPwMsg({ ok: true, text: t("profile.pwChanged") }); setPwCur(""); setPwNew(""); })
      .catch((e) => setPwMsg({ ok: false, text: String(e).includes("400") ? t("profile.pwWrong") : t("profile.error") }))
      .finally(() => setPwBusy(false));
  }

  useEffect(() => {
    api.getProfile().then((p) => { setName(p.display_name || ""); setEmail(p.email); setAvatar(p.avatar_url); setBeta(!!p.beta); }).catch(() => {});
  }, []);

  function pickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setAvatarBusy(true);
    api.uploadAvatar(f)
      .then((p) => { setAvatar(p.avatar_url); window.dispatchEvent(new CustomEvent("foil:profile", { detail: p })); })
      .catch((x) => alert(t("profile.uploadFail") + x))
      .finally(() => { setAvatarBusy(false); if (fileRef.current) fileRef.current.value = ""; });
  }

  async function save() {
    setErr(null);
    setSaved(false);
    setBusy(true);
    try {
      const p = await api.updateProfile(name.trim());
      setSaved(true);
      window.dispatchEvent(new CustomEvent("foil:profile", { detail: p }));
    } catch (e) {
      const s = String(e);
      setErr(s.includes("bereits") ? t("profile.nameTaken") : s.includes("2–40") ? t("profile.nameLen") : t("profile.saveError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full">
      {savedToast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[2000] flex justify-center md:bottom-8">
          <span className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-lg">✓ {t("profile.saved")}</span>
        </div>
      )}
      <div className="mb-5 flex items-center gap-2">
        <SettingsIcon className="h-6 w-6 text-brand-400" />
        <h2 className="text-xl font-bold">{t("profile.title")}</h2>
      </div>

      <Link
        to={watchUpdate ? `/account?tab=app${watchModelQuery(watchUpdate.model || watchUpdate.label, watchUpdate.platform)}` : "/account"}
        className={`mb-4 flex items-center justify-between rounded-2xl border bg-slate-900/60 p-4 hover:bg-slate-900 ${watchUpdate ? "border-amber-500/50 hover:border-amber-500" : "border-slate-800 hover:border-slate-700"}`}
      >
        <span className="flex items-center gap-3">
          <WatchIcon className="h-6 w-6 text-brand-400" />
          <span className="min-w-0">
            <span className="block font-medium text-slate-100">{t("nav.watch")}</span>
            {watchUpdate && (
              <span className="block text-xs font-semibold text-amber-400">
                {t("settings.watchUpdate", { platform: platformLabel(watchUpdate.platform), version: watchUpdate.version })}
              </span>
            )}
            <PlatformSubline kind="watch" />
          </span>
        </span>
        <ChevronIcon className="h-5 w-5 text-slate-400" />
      </Link>

      <Link
        to="/konten"
        className="mb-4 flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/60 p-4 hover:border-slate-700 hover:bg-slate-900"
      >
        <span className="flex items-center gap-3">
          <DownloadIcon className="h-6 w-6 text-brand-400" />
          <span className="min-w-0">
            <span className="block font-medium text-slate-100">{t("linked.title")}</span>
            <PlatformSubline kind="account" />
          </span>
        </span>
        <ChevronIcon className="h-5 w-5 text-slate-400" />
      </Link>

      <Link
        to="/foils"
        className="mb-4 flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/60 p-4 hover:border-slate-700 hover:bg-slate-900"
      >
        <span className="flex items-center gap-3">
          <FoilIcon className="h-6 w-6 text-brand-400" />
          <span className="min-w-0">
            <span className="block font-medium text-slate-100">{t("foils.title")}</span>
            <MyFoilsSubline />
          </span>
        </span>
        <ChevronIcon className="h-5 w-5 text-slate-400" />
      </Link>

      <Link
        to="/import"
        className="mb-4 flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/60 p-4 hover:border-slate-700 hover:bg-slate-900"
      >
        <span className="flex items-center gap-3">
          <UploadIcon className="h-6 w-6 text-brand-400" />
          <span className="font-medium text-slate-100">{t("import.title")}</span>
        </span>
        <ChevronIcon className="h-5 w-5 text-slate-400" />
      </Link>

      <Link
        to="/foil-rechner"
        className="mb-4 flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/60 p-4 hover:border-slate-700 hover:bg-slate-900"
      >
        <span className="flex items-center gap-3">
          <CalculatorIcon className="h-6 w-6 text-brand-400" />
          <span className="font-medium text-slate-100">{t("profile.calculator")}</span>
        </span>
        <ChevronIcon className="h-5 w-5 text-slate-400" />
      </Link>

      <InstallPwa className="mb-4 md:hidden" />

      <Card className="mb-4 p-5">
        <h3 className="mb-1 font-semibold">{t("profile.avatar")}</h3>
        <p className="mb-3 text-sm text-slate-300">{t("profile.avatarHint")}</p>
        <div className="flex items-center gap-4">
          <Avatar name={name} url={avatar} size={64} />
          <div>
            <Button variant="ghost" onClick={() => fileRef.current?.click()} disabled={avatarBusy}>
              {avatarBusy ? "…" : avatar ? t("profile.changeImg") : t("profile.uploadImg")}
            </Button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickAvatar} />
            <p className="mt-2 text-xs text-slate-400">{t("profile.imgHint")}</p>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="mb-1 font-semibold">{t("profile.displayName")}</h3>
        <p className="mb-3 text-sm text-slate-300">{t("profile.displayNameHint")}</p>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => { setName(e.target.value); setSaved(false); }}
            maxLength={40}
            placeholder={t("profile.namePlaceholder")}
            className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
          />
          <Button onClick={save} disabled={busy}>{busy ? "…" : t("common.save")}</Button>
        </div>
        {saved && <p className="mt-2 text-xs text-emerald-400">{t("profile.saved")}</p>}
        {err && <p className="mt-2 text-xs text-red-400">{err}</p>}
        {email && <p className="mt-4 text-xs text-slate-400">{t("profile.loggedInAs", { email })}</p>}
      </Card>

      <Card className="mt-4 p-5">
        <h3 className="mb-1 font-semibold">{t("profile.weight")}</h3>
        <p className="mb-3 text-sm text-slate-300">{t("profile.weightHint")}</p>
        <div className="flex items-center gap-2">
          <input
            type="number" min={0} max={300} value={weight}
            onChange={(e) => setWeight(e.target.value)} onBlur={saveWeight}
            placeholder="—"
            className="w-28 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
          />
          <span className="text-sm text-slate-400">kg</span>
        </div>
      </Card>

      <Card className="mt-4 p-5">
        <h3 className="mb-1 font-semibold">{t("profile.homespot")}</h3>
        <p className="mb-3 text-sm text-slate-300">{t("profile.homespotHint")}</p>
        <select
          value={homespot}
          onChange={(e) => saveHomespot(e.target.value)}
          className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
        >
          <option value="">{t("profile.homespotAuto")}</option>
          {spots.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </Card>

      {hasGarmin && (
      <Card className="mt-4 p-5">
        <h3 className="mb-1 font-semibold">{t("account.activityType")}</h3>
        <p className="mb-3 text-sm text-slate-300">{t("account.activityTypeHint")}</p>
        <select
          value={activityType}
          onChange={(e) => saveActivityType(e.target.value)}
          className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
        >
          <option value="surfing">{t("account.activitySurfing")}</option>
          <option value="openwater">{t("account.activityOpenWater")}</option>
        </select>
      </Card>
      )}

      <Card className="mt-4 p-5">
        <h3 className="mb-1 font-semibold">{t("lang.label")}</h3>
        <p className="mb-3 text-sm text-slate-300">{t("lang.hint")}</p>
        <LanguageSelect />
      </Card>

      <Card className="mt-4 p-5">
        <h3 className="mb-1 font-semibold">{t("foilsens.label")}</h3>
        <p className="mb-3 text-sm text-slate-300">{t("foilsens.hint")}</p>
        <FoilSensitivitySelect onSaved={flashSaved} />
      </Card>

      <Card className="mt-4 p-5">
        <h3 className="mb-1 font-semibold">{t("theme.label")}</h3>
        <p className="mb-3 text-sm text-slate-300">{t("theme.hint")}</p>
        <ThemeSelect />
      </Card>

      <Card className="mt-4 p-5">
        <h3 className="mb-1 font-semibold">{t("fontscale.label")}</h3>
        <p className="mb-3 text-sm text-slate-300">{t("fontscale.hint")}</p>
        <FontScaleSelect />
      </Card>

      {beta && (
        <Card className="mt-4 p-5">
          <h3 className="mb-1 font-semibold">
            {t("phonerec.label")}
            <span className="ml-2 rounded bg-brand-500/20 px-1.5 py-0.5 align-middle text-xs font-medium text-brand-300">Beta</span>
          </h3>
          <p className="mb-2 text-sm text-slate-700 dark:text-slate-300">{t("phonerec.sub")}</p>
          <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">{t("phonerec.pwaNote")}</p>
        </Card>
      )}

      <Card className="mt-4 p-5">
        <h3 className="mb-1 font-semibold">{t("profile.changePw")}</h3>
        <p className="mb-3 text-sm text-slate-300">{t("profile.changePwHint")}</p>
        <div className="flex flex-col gap-2 sm:max-w-sm">
          <input
            type="password" autoComplete="current-password"
            value={pwCur} onChange={(e) => { setPwCur(e.target.value); setPwMsg(null); }}
            placeholder={t("profile.curPw")}
            className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
          />
          <input
            type="password" autoComplete="new-password"
            value={pwNew} onChange={(e) => { setPwNew(e.target.value); setPwMsg(null); }}
            placeholder={t("profile.newPw")}
            className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
          />
          <Button onClick={changePw} disabled={pwBusy || !pwCur || !pwNew}>{pwBusy ? "…" : t("profile.changePw")}</Button>
        </div>
        {pwMsg && <p className={`mt-2 text-xs ${pwMsg.ok ? "text-emerald-400" : "text-red-400"}`}>{pwMsg.text}</p>}
      </Card>

      <Card className="mt-4 p-5">
        <h3 className="mb-1 font-semibold">{t("notif.title")}</h3>
        <p className="mb-3 text-sm text-slate-300">{t("notif.hint")}</p>
        <NotificationsToggle />
      </Card>

      <Card className="mt-4 p-5">
        <h3 className="mb-1 font-semibold">{t("profile.dataTitle")}</h3>
        <p className="mb-3 text-sm text-slate-300">{t("profile.dataHint")}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={exportData}>{t("profile.exportData")}</Button>
          <button
            onClick={deleteAccount}
            className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-500/20 dark:text-red-300"
          >
            {t("profile.deleteAccount")}
          </button>
        </div>
      </Card>
      <p className="mt-6 text-center text-xs text-slate-500">Pumpfoil · Build {APP_BUILD}</p>
    </div>
  );

  function exportData() {
    api.exportMyData()
      .then((d) => {
        const blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "pumpfoil-export.json";
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch((e) => setErr(String(e)));
  }

  function deleteAccount() {
    if (!confirm(t("profile.deleteConfirm"))) return;
    api.deleteMyAccount()
      .then(() => { clearToken(); window.location.assign("/"); })
      .catch((e) => setErr(String(e)));
  }
}

// Persönliche Erkennungs-Empfindlichkeit (nur eigene Auswertung; Community bleibt Standard).
// Nach Auswahl reanalysiert der Server die eigenen Sessions -> kann kurz dauern.
function FoilSensitivitySelect({ onSaved }: { onSaved?: () => void }) {
  const { t } = useI18n();
  const [val, setVal] = useState("normal");
  const [prog, setProg] = useState<{ running: boolean; done: number; total: number } | null>(null);
  useEffect(() => { api.getProfile().then((p) => setVal(p.foil_sensitivity || "normal")).catch(() => {}); }, []);
  async function change(v: string) {
    setVal(v);
    await api.updateFoilSensitivity(v).catch(() => {});
    onSaved?.();
    if (v === "normal") { setProg(null); return; }   // Standard = kanonisch, kein Rechnen
    setProg({ running: true, done: 0, total: 0 });
    const poll = async () => {
      const p = await api.getFoilReanalysis().catch(() => null);
      if (!p) { setProg(null); return; }
      setProg(p);
      if (p.running) setTimeout(poll, 1000);
      else setProg(null);   // fertig (bereits gecachte Presets sind sofort durch)
    };
    setTimeout(poll, 500);
  }
  const pct = prog && prog.total > 0 ? Math.round((100 * prog.done) / prog.total) : 0;
  return (
    <div>
      <select value={val} onChange={(e) => change(e.target.value)} disabled={!!prog?.running}
        className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100">
        <option value="normal">{t("foilsens.normal")}</option>
        <option value="light">{t("foilsens.light")}</option>
        <option value="attempts">{t("foilsens.attempts")}</option>
      </select>
      {prog?.running && (
        <div className="mt-2 max-w-sm">
          <p className="text-xs text-slate-400">{prog.done}/{prog.total || "…"} · {t("foilsens.reanalyzing")}</p>
          {prog.total > 0 && (
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-slate-800">
              <div className="h-full rounded bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
