import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Button, Card } from "./ui";
import { ZONE_COLORS } from "../lib/watchLayout";
import { useT } from "../i18n";

// Zonen im Profil — EINE Karte für beide Skalen (Puls und Geschwindigkeit), weil sie identisch
// funktionieren: sechs Grenzen = fünf Zonen, Z1-unten … Z5-oben.
//
// Sie sind die EINZIGE Quelle für alle Plattformen und färben BEIDES: die Zahl auf der Uhr
// (Schalter „Werte farbig") und die Wert-Grafiken in freien Layouts. Vorher gab es dafür zwei
// verschiedene Skalen — fest verdrahtete Stufen für die Zahl, eine Spanne für die Grafik —,
// dieselbe Geschwindigkeit konnte also grüne Zahl und gelben Ring bedeuten.
// Warum das Profil und nicht die Uhr: nur Garmin und Zepp können Zonen selbst lesen, Wear OS und
// watchOS haben keine API dafür; käme die Skala vom Gerät, färbte dieselbe Grafik je Uhr anders.
// Ausführlich: docs/COLOR-ZONES.md.
//
// Der Server liefert nie „leer": ohne eigene Einstellung kommt ein Vorschlag (Puls aus dem
// höchsten je gemessenen Wert, Geschwindigkeit aus der eigenen gefahrenen), den man nur noch
// anpassen muss.

type Art = "hr" | "speed";

const GRENZEN: Record<Art, { min: number; max: number; feld: string; einheit: string; praefix: string }> = {
  hr: { min: 60, max: 240, feld: "hr_zones", einheit: "bpm", praefix: "hrz" },
  speed: { min: 1, max: 80, feld: "speed_zones", einheit: "km/h", praefix: "spz" },
};

export function ZonesCard({ art }: { art: Art }) {
  const t = useT();
  const cfg = GRENZEN[art];
  const [z, setZ] = useState<number[] | null>(null);
  const [vorschlag, setVorschlag] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { laden(); }, [art]);
  function laden() {
    api.getSettings().then((s) => {
      const v = s[cfg.feld] as number[] | null | undefined;
      setZ(Array.isArray(v) && v.length === 6 ? v.map(Number) : null);
      setVorschlag(!!s[`${cfg.feld}_suggested`]);
    }).catch(() => {});
  }

  // Grenzen müssen streng steigen. Statt eine Eingabe abzulehnen (und den Nutzer rätseln zu
  // lassen), die Nachbarn mitschieben — so bleibt jede Zone mindestens 1 breit.
  function repariert(w: number[], i: number): number[] {
    const out = w.map((x) => Math.max(cfg.min, Math.min(cfg.max, Math.round(x) || cfg.min)));
    for (let k = i + 1; k < out.length; k++) out[k] = Math.max(out[k], out[k - 1] + 1);
    for (let k = i - 1; k >= 0; k--) out[k] = Math.min(out[k], out[k + 1] - 1);
    return out.map((x) => Math.max(cfg.min, Math.min(cfg.max, x)));
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
    api.saveSettings({ [cfg.feld]: w }).then(() => { setVorschlag(false); setSaved(true); }).catch(() => {});
  }
  function zuruecksetzen() {
    api.saveSettings({ [cfg.feld]: null }).then(() => { setSaved(false); laden(); }).catch(() => {});
  }

  if (!z) return null;
  const feld = (i: number) => (
    // name + autoComplete="off" gehören zum Fix in Settings.tsx (Passwort-Formular): ein
    // namenloses Zahlenfeld neben Passwort-Feldern ist für Chrome ein Benutzername-Kandidat.
    <input type="number" inputMode="numeric" min={cfg.min} max={cfg.max} value={z[i]}
      onChange={(e) => setzen(i, e.target.value)} onBlur={() => sichern(i)}
      name={`${art}_zone_${i + 1}`} autoComplete="off"
      aria-label={t(`${cfg.praefix}.bound`, { n: i + 1 })}
      className="w-20 rounded-xl border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100" />
  );

  return (
    <Card className="mt-4 p-5">
      <h3 className="mb-1 font-semibold">{t(`${cfg.praefix}.title`)}</h3>
      <p className="mb-3 text-sm text-slate-300">{t(`${cfg.praefix}.hint`)}</p>

      {/* Farbstreifen: dieselben Zonenfarben, die Uhr-Zahl und Uhr-Grafiken benutzen. */}
      <div className="mb-3 flex h-2.5 overflow-hidden rounded-full">
        {ZONE_COLORS.map((c, i) => (
          <div key={i} style={{ background: c, flexGrow: Math.max(1, z[i + 1] - z[i]) }} />
        ))}
      </div>

      <div className="space-y-2">
        {ZONE_COLORS.map((c, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: c }} />
            <span className="w-28 shrink-0 text-slate-300">{t(`${cfg.praefix}.z${i + 1}`)}</span>
            {feld(i)}
            <span className="text-slate-400">–</span>
            {i < 4
              ? <span className="w-20 px-2 py-1.5 text-slate-400">{z[i + 1]}</span>
              : feld(5)}
            <span className="text-slate-400">{cfg.einheit}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {vorschlag
          ? <span className="text-sm text-slate-400">{t(`${cfg.praefix}.isSuggestion`, { max: z[5] })}</span>
          : <Button variant="ghost" onClick={zuruecksetzen} className="text-sm">{t(`${cfg.praefix}.reset`)}</Button>}
        {saved && <span className="text-sm text-emerald-700 dark:text-emerald-400">{t("profile.saved")}</span>}
      </div>
    </Card>
  );
}
