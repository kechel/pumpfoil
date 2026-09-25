import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { api, getToken } from "../lib/api";
import { Card, Button, Spinner } from "../components/ui";
import { useT } from "../i18n";

/**
 * Die Zustimmungsseite des eigenen OAuth-Servers (25.09.2026).
 *
 * `/oauth/authorize` auf dem Server prueft die Anfrage und leitet hierher weiter. Hier — und nur
 * hier — entscheidet der Nutzer. Danach geht es mit einem Autorisierungscode zurueck zum Programm,
 * das gefragt hat.
 *
 * **Warum die Seite so wortreich ist, obwohl wir sonst kurze Texte machen:** wer hier zustimmt,
 * gibt einem fremden Programm Zugriff auf seine Daten und schaut danach nie wieder hin. Die
 * Grenze muss deshalb DASTEHEN, nicht angedeutet werden — und zwar genau die, die der Server
 * auch wirklich zieht (Jan, 25.09.2026). Ein Text, der mehr verspricht als der Code haelt, waere
 * schlimmer als keiner.
 *
 * Wer nicht angemeldet ist, wird zum Login geschickt und kommt hierher zurueck; die Anfrage steht
 * vollstaendig in der Adresse, es geht also nichts verloren.
 */
export default function OAuthConsent() {
  const t = useT();
  const [sp] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const clientId = sp.get("client_id") || "";
  const redirectUri = sp.get("redirect_uri") || "";
  const challenge = sp.get("code_challenge") || "";
  const state = sp.get("state") || "";
  const resource = sp.get("resource") || "";

  useEffect(() => {
    if (!getToken()) {
      // Nach dem Login zurueck auf genau diese Adresse — die Anfrage steckt in den Parametern.
      const zurueck = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.replace(`/login?next=${zurueck}`);
    }
  }, []);

  if (!clientId || !redirectUri || !challenge) {
    return (
      <Card className="p-6">
        <p className="font-semibold">{t("mcp.consentBroken")}</p>
      </Card>
    );
  }

  const zurueck = (params: Record<string, string>) => {
    const u = new URL(redirectUri);
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
    if (state) u.searchParams.set("state", state);
    window.location.replace(u.toString());
  };

  async function zustimmen() {
    setBusy(true); setFehler(null);
    try {
      const r = await api.mcpZustimmen({
        client_id: clientId, redirect_uri: redirectUri,
        code_challenge: challenge, resource: resource || undefined,
      });
      zurueck({ code: r.code });
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <Card className="p-6">
      <h1 className="mb-1 text-xl font-bold">{t("mcp.consentTitle")}</h1>
      <p className="mb-4 text-slate-300">{t("mcp.consentIntro")}</p>

      <div className="mb-4 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
        <p className="text-sm text-slate-400">{t("mcp.consentProgram")}</p>
        {/* Der Name kommt aus der Selbstauskunft des Programms und ist ungeprueft — deshalb steht
            die Rueckkehr-Adresse daneben. Die ist der einzige verlaessliche Anhaltspunkt dafuer,
            wohin die Daten wirklich gehen. */}
        <p className="break-all font-mono text-sm text-slate-200">{redirectUri}</p>
      </div>

      <p className="mb-1 font-semibold">{t("mcp.consentGrantTitle")}</p>
      <ul className="mb-4 list-disc space-y-1 pl-5 text-slate-300">
        <li>{t("mcp.consentGrant1")}</li>
        <li>{t("mcp.consentGrant2")}</li>
      </ul>

      <p className="mb-1 font-semibold">{t("mcp.consentDenyTitle")}</p>
      <ul className="mb-4 list-disc space-y-1 pl-5 text-slate-300">
        <li>{t("mcp.consentDeny1")}</li>
        <li>{t("mcp.consentDeny2")}</li>
        <li>{t("mcp.consentDeny3")}</li>
        <li>{t("mcp.consentDeny4")}</li>
      </ul>

      <p className="mb-4 text-sm text-slate-400">{t("mcp.consentRevoke")}</p>

      {fehler && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{fehler}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={zustimmen} disabled={busy}>
          {busy ? <Spinner /> : t("mcp.consentAllow")}
        </Button>
        <button
          type="button"
          onClick={() => zurueck({ error: "access_denied" })}
          className="rounded-xl border border-slate-700 px-4 py-2 text-slate-200 hover:bg-slate-800"
        >
          {t("mcp.consentDenyBtn")}
        </button>
        <Link to="/einstellungen" className="text-sm text-slate-400 hover:text-slate-300">
          {t("mcp.consentCancel")}
        </Link>
      </div>
    </Card>
  );
}
