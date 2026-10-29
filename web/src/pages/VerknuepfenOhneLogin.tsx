import { useEffect, useState } from "react";
import { useT } from "../i18n";

/**
 * Rueckweg vom Hersteller (Polar, Suunto, COROS …) OHNE Anmeldung in diesem Browser (29.10.2026).
 *
 * Die Apps oeffnen den Hersteller im externen Browser (Android) bzw. im In-App-Safari (iOS); dort ist
 * meist niemand bei pumpfoil.org angemeldet. Dann verknuepfen wir erst nach einer ausdruecklichen
 * Bestaetigung, die den NAMEN des Ziel-Kontos zeigt — ein untergeschobener Verbinden-Link (S-014)
 * faellt so auf. Mit Anmeldung uebernimmt LinkedAccounts.tsx und prueft automatisch.
 */
const PFADE: Record<string, string> = {
  polar: "polar", suunto: "suunto", strava: "strava", coros: "coros", "coros-mcp": "coros/mcp",
};
const NAMEN: Record<string, string> = {
  polar: "Polar", suunto: "Suunto", strava: "Strava", coros: "COROS", "coros-mcp": "COROS",
};

type Zustand = "laden" | "frage" | "laeuft" | "fertig" | "abgebrochen" | "fehler";

export default function VerknuepfenOhneLogin() {
  const t = useT();
  const [p] = useState(() => new URLSearchParams(window.location.search));
  const anbieter = p.get("verknuepfen") || "";
  const pfad = PFADE[anbieter];
  const dienst = NAMEN[anbieter] || anbieter;
  const [zustand, setZustand] = useState<Zustand>("laden");
  const [ziel, setZiel] = useState<string>("");
  const [fehlerText, setFehlerText] = useState<string | null>(null);

  useEffect(() => {
    // Code/State gelten nur einmal und gehoeren nicht in den Verlauf: aus der Adresszeile nehmen,
    // die Werte haelt `p`.
    window.history.replaceState(null, "", window.location.pathname);
    if (!pfad) { setZustand("fehler"); return; }
    if (p.get("error") || !p.get("code")) { setZustand("abgebrochen"); return; }
    fetch(`/api/integrations/${pfad}/ziel?state=${encodeURIComponent(p.get("state") || "")}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { name: string }) => { setZiel(d.name); setZustand("frage"); })
      .catch(() => setZustand("fehler"));
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  async function verbinden() {
    setZustand("laeuft");
    try {
      const r = await fetch(`/api/integrations/${pfad}/abschliessen-bestaetigt`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: p.get("code"), state: p.get("state"), error: p.get("error") }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.weiter && /=connected/.test(d.weiter)) setZustand("fertig");
      else if (r.ok && d.weiter && /=cancelled/.test(d.weiter)) setZustand("abgebrochen");
      else { setFehlerText([d.titel, d.text].filter(Boolean).join(" — ") || null); setZustand("fehler"); }
    } catch { setZustand("fehler"); }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-8">
      <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-6 text-center">
        <h1 className="mb-3 text-lg font-bold text-slate-100">{t("verkn.titel", { dienst })}</h1>
        {zustand === "laden" && <p className="text-slate-300">{t("common.loading")}</p>}
        {zustand === "frage" && (
          <>
            <p className="mb-2 text-slate-300">{t("verkn.frage", { dienst })}</p>
            <p className="mb-4 break-words text-xl font-bold text-slate-100">{ziel}</p>
            <p className="mb-5 rounded-xl border border-amber-400 bg-amber-500/15 px-3 py-2 text-sm font-medium text-amber-700 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-300">
              {t("verkn.warnung")}
            </p>
            <div className="flex flex-col gap-2">
              <button onClick={verbinden}
                className="rounded-xl bg-brand-500 px-4 py-2.5 font-semibold text-slate-950 hover:bg-brand-400">
                {t("verkn.ja", { dienst })}
              </button>
              <button onClick={() => setZustand("abgebrochen")}
                className="rounded-xl border border-slate-600 px-4 py-2.5 text-slate-200 hover:bg-slate-800">
                {t("verkn.nein")}
              </button>
            </div>
          </>
        )}
        {zustand === "laeuft" && <p className="text-slate-300">{t("common.loading")}</p>}
        {zustand === "fertig" && <p className="font-medium text-emerald-700 dark:text-emerald-300">{t("verkn.fertig", { dienst })}</p>}
        {zustand === "abgebrochen" && <p className="text-slate-300">{t("verkn.abgebrochen")}</p>}
        {zustand === "fehler" && <p className="font-medium text-red-700 dark:text-red-300">{fehlerText || t("verkn.fehler")}</p>}
        {(zustand === "fertig" || zustand === "abgebrochen" || zustand === "fehler") && (
          <p className="mt-4 text-sm text-slate-400">{t("verkn.zurueck")}</p>
        )}
      </div>
    </main>
  );
}
