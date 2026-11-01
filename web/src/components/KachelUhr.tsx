import { useEffect, useState } from "react";

/** Countdown in einer Zeile fuer die Event-Kachel (Jan, 01.11.2026): „Startet in 5 T 12:03:45“ bzw. „Endet in …“.
 *  Tage ueber Intl (narrow) — kurz und in jeder Sprache richtig, ohne eigene Pluralformen. */
export default function KachelUhr({ ziel, text, lang }: { ziel: string; text: string; lang: string }) {
  const [jetzt, setJetzt] = useState(Date.now());
  useEffect(() => { const h = setInterval(() => setJetzt(Date.now()), 1000); return () => clearInterval(h); }, []);
  const rest = Math.max(0, Math.floor((new Date(ziel).getTime() - jetzt) / 1000));
  const d = Math.floor(rest / 86400);
  const zz = (n: number) => String(n).padStart(2, "0");
  let tage = "";
  if (d > 0) {
    try { tage = new Intl.NumberFormat(lang, { style: "unit", unit: "day", unitDisplay: "narrow" }).format(d) + " "; }
    catch { tage = `${d}d `; }
  }
  return (
    <span className="team-akzent font-semibold tabular-nums">
      {text} {tage}{zz(Math.floor(rest / 3600) % 24)}:{zz(Math.floor(rest / 60) % 60)}:{zz(rest % 60)}
    </span>
  );
}
