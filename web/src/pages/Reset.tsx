import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { api, setToken } from "../lib/api";
import { Card, Button, ErrorBox } from "../components/ui";
import { useT } from "../i18n";

export default function Reset() {
  const t = useT();
  const [sp] = useSearchParams();
  const token = sp.get("token") || "";
  const nav = useNavigate();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) { setError(t("reset.min8")); return; }
    setBusy(true);
    api.resetPassword(token, pw)
      .then((r) => { setToken(r.access_token); nav("/"); })
      .catch((x) => setError(String(x).includes("400") ? t("reset.linkInvalid") : t("profile.error")))
      .finally(() => setBusy(false));
  }

  return (
    <div className="mx-auto mt-16 max-w-sm px-4">
      <h1 className="mb-4 text-xl font-bold">{t("reset.title")}</h1>
      {!token ? (
        <Card className="p-5 text-sm text-slate-300">
          {t("reset.invalidPre")}<Link to="/login" className="text-brand-400 hover:underline">{t("reset.invalidAction")}</Link>{t("reset.invalidPost")}
        </Card>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            type="password" autoComplete="new-password" value={pw}
            onChange={(e) => { setPw(e.target.value); setError(null); }}
            placeholder={t("profile.newPw")}
            className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
          />
          {error && <ErrorBox message={error} />}
          <Button type="submit" disabled={busy || !pw}>{busy ? "…" : t("reset.submit")}</Button>
          <Link to="/login" className="text-center text-xs text-slate-400 hover:text-slate-200">{t("reset.backToLogin")}</Link>
        </form>
      )}
    </div>
  );
}
