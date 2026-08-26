import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Button, Card } from "./ui";
import { ZONE_COLORS } from "../lib/watchLayout";
import { useT } from "../i18n";

// Puls-Zonen im Profil. Sie sind die EINZIGE Quelle für alle Plattformen: nur Garmin und Zepp
// können die Zonen der Uhr selbst lesen, Wear OS und watchOS haben keine API dafür — käme die
// Skala von der Uhr, färbte dieselbe Layout-Grafik je Gerät anders.
//
// Der Server liefert nie „leer": ohne eigene Einstellung kommt ein Vorschlag aus dem höchsten je
// gemessenen Puls (`hr_zones_suggested`), den man hier nur noch anpassen muss.

const MIN = 60, MAX = 240;

export function HrZonesCard() {
  const t = useT();
  const [z, setZ] = useState<number[] | null>(null);
  const [vorschlag, setVorschlag] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { laden(); }, []);
  function laden() {
    api.getSettings().then((s) => {
      const v = s.hr_zones as number[] | null | undefined;
      setZ(Array.isArray(v) && v.length === 6 ? v.map(Number) : null);
      setVorschlag(!!s.hr_zones_suggested);
    }).catch(() => {});
  }

  // Grenzen müssen streng steigen. Statt eine Eingabe abzulehnen (und den Nutzer rätseln zu
  // lassen), die Nachbarn mitschieben — so bleibt jede Zone mindestens 1 bpm breit.
  function repariert(w: number[], i: number): number[] {
    const out = w.map((x) => Math.max(MIN, Math.min(MAX, Math.round(x) || MIN)));
    for (let k = i + 1; k < out.length; k++) out[k] = Math.max(out[k], out[k - 1] + 1);
    for (let k = i - 1; k >= 0; k--) out[k] = Math.min(out[k], out[k + 1] - 1);
    return out.map((x) => Math.max(MIN, Math.min(MAX, x)));
  }

  function setzen(i: number, v: string) {
    if (!z) return;
    const w = [...z];
    w[i] = Number(v) || 0;
    setZ(w);
    setSaved(false);
  }
  function sichern(i: number) {
    if (!z) return;
    const w = repariert(z, i);
    setZ(w);
    api.saveSettings({ hr_zones: w }).then(() => { setVorschlag(false); setSaved(true); }).catch(() => {});
  }
  function zuruecksetzen() {
    api.saveSettings({ hr_zones: null }).then(() => { setSaved(false); laden(); }).catch(() => {});
  }

  if (!z) return null;
  const feld = (i: number) => (
    // name + autoComplete="off" gehören zum Fix von oben (Settings.tsx, Passwort-Formular):
    // ein namenloses Textfeld neben Passwort-Feldern ist für Chrome ein Benutzername-Kandidat.
    <input type="number" inputMode="numeric" min={MIN} max={MAX} value={z[i]}
      onChange={(e) => setzen(i, e.target.value)} onBlur={() => sichern(i)}
      name={`hr_zone_${i + 1}`} autoComplete="off"
      aria-label={t("hrz.bound", { n: i + 1 })}
      className="w-20 rounded-xl border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100" />
  );

  return (
    <Card className="mt-4 p-5">
      <h3 className="mb-1 font-semibold">{t("hrz.title")}</h3>
      <p className="mb-3 text-sm text-slate-300">{t("hrz.hint")}</p>

      {/* Farbstreifen: dieselben Zonenfarben, die die Uhr-Grafiken zeichnen. */}
      <div className="mb-3 flex h-2.5 overflow-hidden rounded-full">
        {ZONE_COLORS.map((c, i) => (
          <div key={i} style={{ background: c, flexGrow: Math.max(1, z[i + 1] - z[i]) }} />
        ))}
      </div>

      <div className="space-y-2">
        {ZONE_COLORS.map((c, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: c }} />
            <span className="w-28 shrink-0 text-slate-300">{t(`hrz.z${i + 1}`)}</span>
            {feld(i)}
            <span className="text-slate-400">–</span>
            {i < 4
              ? <span className="w-20 px-2 py-1.5 text-slate-400">{z[i + 1]}</span>
              : feld(5)}
            <span className="text-slate-400">bpm</span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {vorschlag
          ? <span className="text-sm text-slate-400">{t("hrz.isSuggestion", { max: z[5] })}</span>
          : <Button variant="ghost" onClick={zuruecksetzen} className="text-sm">{t("hrz.reset")}</Button>}
        {saved && <span className="text-sm text-emerald-700 dark:text-emerald-400">{t("profile.saved")}</span>}
      </div>
    </Card>
  );
}
