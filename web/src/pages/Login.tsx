import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, setToken } from "../lib/api";
import { Button, Card, ErrorBox } from "../components/ui";
import { PROVIDER_ICONS } from "../components/BrandIcons";
import { WaveIcon } from "../components/Icons";
import { useI18n, TFunc } from "../i18n";
import { LanguageSelect } from "../components/LanguageSelect";

export default function Login() {
  const { t, lang } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forgotMsg, setForgotMsg] = useState<string | null>(null);
  const [providers, setProviders] = useState<{ id: string; label: string }[]>([]);
  const nav = useNavigate();

  useEffect(() => { api.oauthProviders().then(setProviders).catch(() => {}); }, []);

  function forgot() {
    setError(null); setForgotMsg(null);
    if (!email) { setError(t("login.enterEmail")); return; }
    api.forgotPassword(email).catch(() => {});
    setForgotMsg(t("login.resetSent"));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = isRegister
        ? await api.register(email, password, displayName, lang)
        : await api.login(email, password);
      setToken(res.access_token);
      nav("/home");
    } catch (err) {
      setError(humanError(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm p-7">
        <div className="mb-6 flex flex-col items-center text-center">
          <WaveIcon className="h-10 w-10 text-brand-400" />
          <h1 className="mt-3 text-xl font-bold">Pumpfoil</h1>
          <p className="mt-1 text-sm text-slate-300">
            {isRegister ? t("login.createAccount") : t("login.welcomeBack")}
          </p>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            type="email"
            placeholder={t("login.email")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3 outline-none focus:border-brand-500"
          />
          <input
            type="password"
            placeholder={t("login.password")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3 outline-none focus:border-brand-500"
          />
          {isRegister && (
            <input
              type="text"
              placeholder={t("login.displayName")}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              minLength={2}
              maxLength={40}
              className="rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3 outline-none focus:border-brand-500"
            />
          )}
          {error && <ErrorBox message={error} />}
          {forgotMsg && <p className="text-xs text-emerald-400">{forgotMsg}</p>}
          <Button type="submit" className="mt-1 w-full">
            {busy ? "…" : isRegister ? t("login.register") : t("login.login")}
          </Button>
        </form>
        {!isRegister && (
          <button onClick={forgot} className="mt-3 w-full text-center text-xs text-slate-400 hover:text-slate-200">
            {t("login.forgot")}
          </button>
        )}
        <button
          className={`mt-4 w-full text-center font-semibold ${
            isRegister ? "text-sm text-slate-300 hover:text-slate-200" : "text-brand-400 hover:text-brand-300"
          }`}
          onClick={() => {
            setIsRegister(!isRegister);
            setError(null);
          }}
        >
          {isRegister ? t("login.haveAccount") : t("login.newHere")}
        </button>
        {providers.length > 0 && (
          <div className="mt-5">
            <div className="mb-3 flex items-center gap-3 text-xs text-slate-500">
              <span className="h-px flex-1 bg-slate-700" />{t("login.or")}<span className="h-px flex-1 bg-slate-700" />
            </div>
            <div className="flex flex-col gap-2">
              {providers.map((p) => {
                const Icon = PROVIDER_ICONS[p.id];
                return (
                  <a
                    key={p.id}
                    href={`/api/auth/oauth/${p.id}/start?lang=${encodeURIComponent(lang)}`}
                    className="flex items-center justify-center gap-2.5 rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-2.5 text-sm font-medium text-slate-100 hover:bg-slate-700"
                  >
                    {Icon && <Icon className="h-5 w-5" />}
                    {t("login.continueWith", { provider: p.label })}
                  </a>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-col items-center gap-3">
          <LanguageSelect className="text-sm" />
          <Link to="/impressum" className="text-xs text-slate-400 hover:text-slate-300">
            {t("nav.imprint")}
          </Link>
        </div>
      </Card>
    </div>
  );
}

function humanError(err: unknown, t: TFunc): string {
  const s = String(err);
  if (s.includes("Anzeigename ist bereits")) return t("login.nameTaken");
  if (s.includes("Anzeigename muss")) return t("login.nameLen");
  if (s.includes("401")) return t("login.badCreds");
  if (s.includes("409")) return t("login.emailTaken");
  if (s.includes("429")) return t("login.tooMany");
  return s.replace(/^Error:\s*/, "");
}
