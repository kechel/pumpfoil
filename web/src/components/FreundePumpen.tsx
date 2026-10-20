// Neben der Begruessung auf der Startseite: welche meiner Freunde gerade wo pumpen (Jan, 15.10.2026:
// „wenn es mehr als 3 sind dann nur noch x Friends currently pumping und bei klick dann darunter
// oeffnen"). Nichts da -> nichts gezeigt. Wer zaehlt und welcher Spot, entscheidet der Server
// (app/freunde.py, aktive_freunde) — dieselbe Schaetzung wie die gruenen Spots.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, AktiverFreund } from "../lib/api";
import { useT } from "../i18n";

const BIS_EINZELN = 3;
const NACHFRAGEN_MS = 120_000;   // wie die Spot-Karte
const GRUEN = "text-emerald-700 dark:text-emerald-400";

function Punkt() {
  return (
    <span className="relative inline-flex h-2.5 w-2.5 shrink-0">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/50" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
    </span>
  );
}

function Eintrag({ f }: { f: AktiverFreund }) {
  return (
    <span className="whitespace-nowrap">
      {/* Negative ids = erfundene Demo-Freunde (lib/demoNames.ts): ohne Link, es gibt keine Seite dazu. */}
      {f.user_id < 0
        ? <span className="pf-name font-semibold">{f.name ?? "—"}</span>
        : <Link to={`/foiler/${f.user_id}`} className="pf-name font-semibold hover:underline">{f.name ?? "—"}</Link>}
      {f.spot && f.spot_id != null && f.spot_id < 0 && <> @ {f.spot}</>}
      {f.spot && f.spot_id != null && f.spot_id >= 0 && (
        <> @ <Link to={`/sessions?scope=all&spot=${f.spot_id}`} className="hover:underline">{f.spot}</Link></>
      )}
    </span>
  );
}

/** Steht in einer `flex flex-wrap`-Zeile: kurz daneben, die aufgeklappte Liste darunter (basis-full). */
export function FreundePumpen() {
  const t = useT();
  const [aktiv, setAktiv] = useState<AktiverFreund[]>([]);
  const [offen, setOffen] = useState(false);
  useEffect(() => {
    let aus = false;
    const laden = () => api.friendsActive().then((r) => { if (!aus) setAktiv(r); }).catch(() => {});
    laden();
    const id = window.setInterval(laden, NACHFRAGEN_MS);
    return () => { aus = true; window.clearInterval(id); };
  }, []);
  if (!aktiv.length) return null;
  if (aktiv.length <= BIS_EINZELN) {
    return (
      <span className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-sm ${GRUEN}`} title={t("friends.pumpingNowTitle")}>
        <Punkt />
        {aktiv.map((f, i) => <span key={f.user_id}>{i > 0 && <span className="mr-2">·</span>}<Eintrag f={f} /></span>)}
      </span>
    );
  }
  return (
    <>
      <button onClick={() => setOffen(!offen)} aria-expanded={offen}
        className={`inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-sm font-semibold ${GRUEN} hover:bg-emerald-500/20`}>
        <Punkt />
        {t("friends.nPumping", { n: aktiv.length })}
        <span aria-hidden>{offen ? "▴" : "▾"}</span>
      </button>
      {offen && (
        <div className={`basis-full rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm ${GRUEN}`}>
          <ul className="flex flex-col gap-1">
            {aktiv.map((f) => <li key={f.user_id}><Eintrag f={f} /></li>)}
          </ul>
        </div>
      )}
    </>
  );
}
