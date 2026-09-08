// Schalter fuer die oeffentliche Foiler-Seite (/foiler/<id>), in den Einstellungen.
//
// Der Server ist die Instanz, die entscheidet, was auf der Seite landet (community.foiler_profil
// liest genau diese Werte). Diese Karte schreibt sie nur — sie darf NICHT anfangen, selbst zu
// filtern, sonst gibt es zwei Wahrheiten.
//
// Name und Avatar haben bewusst keinen Schalter: sie sind die Identitaet der Seite und stehen
// ohnehin unter jeder Session im Feed. Und es gibt keinen Schalter fuer eine Sessionliste, weil
// die Seite keine hat (Entscheidung 04.09.2026, Bewegungsprofil).
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Card } from "../components/ui";
import { useT } from "../i18n";

type Schalter = { enabled: boolean; join: boolean; watch: boolean; foil: boolean;
                  homespot: boolean; records: boolean; media: boolean; spots: boolean;
                  sessions: boolean; titles: boolean };

const FELDER: { key: keyof Omit<Schalter, "enabled">; label: string }[] = [
  { key: "join", label: "pubprof.join" },
  { key: "watch", label: "pubprof.watch" },
  { key: "foil", label: "pubprof.foil" },
  { key: "homespot", label: "pubprof.homespot" },
  { key: "records", label: "pubprof.records" },
  { key: "media", label: "pubprof.media" },
  { key: "spots", label: "pubprof.spots" },
  { key: "sessions", label: "pubprof.sessions" },
  { key: "titles", label: "pubprof.titles" },
];

export function PublicProfileCard({ onSaved }: { onSaved?: () => void }) {
  const t = useT();
  const [s, setS] = useState<Schalter | null>(null);
  const [id, setId] = useState<number | null>(null);

  useEffect(() => {
    api.getSettings().then((x) => {
      const p = (x.public_profile ?? {}) as Partial<Schalter>;
      // Fehlt ein Wert, gilt er als an — dieselbe Vorgabe wie in settings.DEFAULTS.
      setS({
        enabled: p.enabled !== false, join: p.join !== false, watch: p.watch !== false,
        foil: p.foil !== false, homespot: p.homespot !== false, records: p.records !== false,
        media: p.media !== false, spots: p.spots !== false, sessions: p.sessions !== false,
        titles: p.titles !== false,
      });
    }).catch(() => {});
    api.getProfile().then((p) => setId(p.id || null)).catch(() => {});
  }, []);

  function setzen(patch: Partial<Schalter>) {
    if (!s) return;
    const neu = { ...s, ...patch };
    setS(neu);                                  // sofort sichtbar, der Server bestaetigt danach
    api.saveSettings({ public_profile: neu }).then(() => onSaved?.()).catch(() => setS(s));
  }

  if (!s) return null;
  return (
    <Card className="mt-4 p-5">
      <h3 className="mb-1 font-semibold">{t("pubprof.title")}</h3>
      <p className="mb-3 text-sm text-slate-300">{t("pubprof.hint")}</p>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="accent-brand-500" checked={s.enabled}
               onChange={(e) => setzen({ enabled: e.target.checked })} />
        {t("pubprof.enabled")}
      </label>

      {/* Die Einzelschalter nur, wenn die Seite ueberhaupt an ist — sonst schaltet man an
          etwas herum, das niemand sieht. */}
      {s.enabled && (
        <div className="mt-3 space-y-2 border-t border-slate-800 pt-3">
          <p className="text-sm font-medium text-slate-400">{t("pubprof.fields")}</p>
          {FELDER.map((f) => (
            <label key={f.key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-brand-500" checked={s[f.key]}
                     onChange={(e) => setzen({ [f.key]: e.target.checked } as Partial<Schalter>)} />
              {t(f.label)}
            </label>
          ))}
        </div>
      )}

      {id && s.enabled && (
        <p className="mt-3 text-sm">
          <Link to={`/foiler/${id}`} className="text-brand-600 underline dark:text-brand-300">
            {t("pubprof.view")}
          </Link>
        </p>
      )}
    </Card>
  );
}
