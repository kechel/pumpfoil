// Wertungsklasse (10.11.2026): freiwillig, selbst gewaehlt — in den Einstellungen als eigene Karte, im
// Einrichtungs-Assistenten als Abschnitt unter der Nationalitaet (Jan, 11.11.2026).
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Card } from "./ui";
import { useT } from "../i18n";

function Knoepfe({ onSaved }: { onSaved?: () => void }) {
  const t = useT();
  const [wert, setWert] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.getSettings().then((s) => setWert((s.wertungsklasse as string) ?? "")).catch(() => setWert(""));
  }, []);
  if (wert === null) return null;
  const optionen: [string, string][] = [["", t("wk.none")], ["w", t("wk.w")], ["m", t("wk.m")], ["nb", t("wk.nb")]];
  return (
    <div className="flex flex-wrap gap-2">
      {optionen.map(([k, label]) => (
        <button key={k} disabled={busy}
          onClick={() => { setBusy(true); api.saveSettings({ wertungsklasse: k }).then(() => { setWert(k); onSaved?.(); }).catch(() => {}).finally(() => setBusy(false)); }}
          className={`rounded-lg border px-3 py-1.5 text-sm ${wert === k ? "border-brand-500 bg-brand-500 font-semibold text-slate-950" : "border-slate-600 text-slate-200 hover:bg-slate-800"}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

/** Eigene Karte (Einstellungen › Ich). */
export function WertungsklasseCard({ onSaved }: { onSaved?: () => void }) {
  const t = useT();
  return (
    <Card className="mt-4 p-5">
      <h3 className="mb-1 font-semibold">{t("wk.title")}</h3>
      <p className="mb-3 text-sm text-slate-300">{t("wk.hint")}</p>
      <Knoepfe onSaved={onSaved} />
    </Card>
  );
}

/** Abschnitt in einer bestehenden Karte (Einrichtungs-Assistent, unter der Nationalitaet). */
export function WertungsklasseAbschnitt() {
  const t = useT();
  return (
    <>
      <h3 className="mb-1 mt-5 font-semibold">{t("wk.title")}</h3>
      <p className="mb-3 text-sm text-slate-300">{t("wk.hint")}</p>
      <Knoepfe />
    </>
  );
}
