import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useNumberFormat, useT } from "../i18n";
import { MEILENSTEIN_LEUTE, MEILENSTEIN_PUMPS, imMeilensteinFenster } from "../lib/pumpPulse";

// Schlanke Stats-Leiste (nur die Zahlen aus dem Willkommens-Banner), dauerhaft oben im
// Community-Bereich. Nutzt denselben Satz/Endpoint; Zahlen (§-markiert) fett/cyan.
export function CommunityStats({ className = "" }: { className?: string }) {
  const t = useT();
  const nf = useNumberFormat();
  const [stats, setStats] = useState<{ foilers: number; spots: number; sessions: number; pumps: number } | null>(null);
  // Zuerst der (gecachte) Stand, damit die Zeile sofort dasteht; direkt danach die Wahrheit.
  // Anders als bei den Rekorden IMMER beide: die Antwort ist 58 Bytes gross, der zweite Aufruf
  // kostet also nichts — und die Zahlen wachsen mit jeder hochgeladenen Session, der gecachte
  // Stand ist damit praktisch immer ein bisschen alt.
  useEffect(() => {
    let lebt = true;
    api.communityStats().then((s) => {
      if (!lebt) return;
      setStats(s);
      return api.communityStats(true).then((frisch) => {
        if (lebt && JSON.stringify(frisch) !== JSON.stringify(s)) setStats(frisch);
      });
    }).catch(() => {});
    return () => { lebt = false; };
  }, []);
  // Drei Zahlen mit eigener Stufe. Sessions bleibt bewusst aussen vor: sie waechst am
  // schnellsten und haette staendig einen frischen Tausender, der Puls verloere seinen Wert.
  const pulsPumps = imMeilensteinFenster(stats?.pumps, MEILENSTEIN_PUMPS);
  const pulsFoiler = imMeilensteinFenster(stats?.foilers, MEILENSTEIN_LEUTE);
  const pulsSpots = imMeilensteinFenster(stats?.spots, MEILENSTEIN_LEUTE);
  if (!stats) return null;

  // Alle vier Zahlen durch den sprachabhaengigen Formatierer (auch sessions/foilers wachsen
  // ueber 1000) — sonst mischt der Satz gruppierte und ungruppierte Zahlen.
  const parts = t("banner.stats", {
    foilers: nf(stats.foilers), spots: nf(stats.spots), sessions: nf(stats.sessions), pumps: nf(stats.pumps),
  }).split("§");

  const pulst = (teil: string) =>
    (pulsPumps && teil === nf(stats.pumps))
    || (pulsFoiler && teil === nf(stats.foilers))
    || (pulsSpots && teil === nf(stats.spots));

  return (
    <div className={`rounded-xl border border-brand-500/30 bg-gradient-to-br from-brand-500/15 via-brand-400/10 to-transparent px-4 py-1.5 text-sm text-slate-300 ${className}`}>
      {parts.map((p, i) =>
        i % 2 === 1
          ? <span key={i} className={"font-bold tabular-nums text-brand-600 dark:text-brand-300"
              /* Erkannt am WERT, nicht an der Position: die Wortstellung des Satzes ist je
                 Sprache anders. Haetten zwei Zahlen zufaellig denselben Wert, pulsten beide —
                 das waere sichtbar, aber harmlos, und die Alternative waere ein zweiter
                 Platzhalter-Satz je Sprache. */
              + (pulst(p) ? " pf-million" : "")}>{p}</span>
          : <span key={i}>{p}</span>
      )}
    </div>
  );
}
