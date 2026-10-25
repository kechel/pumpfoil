import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";

/**
 * Kleine Skizze der GANZEN Spur (ohne Zuschnitt) mit den Stellen, die gerade an einem Regler stehen —
 * fuers Zuschneiden und Teilen (Nutzerwunsch 25.10.2026: „beim Trimmen fehlt die Referenz, auf welchen
 * Teil sich die aktuelle Position auf der Karte bezieht").
 *
 * Bewusst KEINE zweite Leaflet-Karte: die grosse Karte steht oben auf der Seite, die Regler ganz unten —
 * ein Punkt dort waere beim Schieben gar nicht zu sehen. Die Skizze sitzt direkt am Regler; Hintergrund
 * braucht sie nicht, die Form der Spur reicht zur Orientierung.
 *
 * `farbe(t)` faerbt die Spur je Zeitpunkt (Session-ms), `marken` sind die Reglerstellungen.
 */
export function ZeitSkizze({ sessionId, farbe, marken }: {
  sessionId: number;
  farbe: (tMs: number) => string;
  marken: { tMs: number; farbe: string }[];
}) {
  const [punkte, setPunkte] = useState<[number, number, number][] | null>(null);
  useEffect(() => {
    let weg = false;
    api.rawTrack(sessionId).then((r) => { if (!weg) setPunkte(r.punkte); }).catch(() => { if (!weg) setPunkte([]); });
    return () => { weg = true; };
  }, [sessionId]);

  const W = 600, H = 220, R = 8;
  // Projektion einmal je Spur: flaechentreu genug fuer ein paar Kilometer (Laenge mit cos(Breite)).
  const xy = useMemo(() => {
    if (!punkte || punkte.length < 2) return null;
    const lat0 = punkte.reduce((s, p) => s + p[1], 0) / punkte.length;
    const k = Math.cos((lat0 * Math.PI) / 180);
    const xs = punkte.map((p) => p[2] * k), ys = punkte.map((p) => -p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const s = Math.min((W - 2 * R) / Math.max(1e-9, x1 - x0), (H - 2 * R) / Math.max(1e-9, y1 - y0));
    const ox = (W - (x1 - x0) * s) / 2, oy = (H - (y1 - y0) * s) / 2;
    return punkte.map((p, i) => ({ t: p[0], x: ox + (xs[i] - x0) * s, y: oy + (ys[i] - y0) * s }));
  }, [punkte]);

  if (!xy) return null;
  // Gleichfarbige Nachbarn zu einer Linie zusammenfassen, sonst waeren es tausend Einzelstriche.
  const linien: { farbe: string; pts: string }[] = [];
  for (let i = 1; i < xy.length; i++) {
    const f = farbe(xy[i].t);
    const seg = `${xy[i - 1].x.toFixed(1)},${xy[i - 1].y.toFixed(1)} ${xy[i].x.toFixed(1)},${xy[i].y.toFixed(1)}`;
    const letzte = linien[linien.length - 1];
    if (letzte && letzte.farbe === f) letzte.pts += ` ${xy[i].x.toFixed(1)},${xy[i].y.toFixed(1)}`;
    else linien.push({ farbe: f, pts: seg });
  }
  const bei = (tMs: number) => {
    let best = xy[0], abw = Infinity;
    for (const p of xy) { const d = Math.abs(p.t - tMs); if (d < abw) { abw = d; best = p; } }
    return best;
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full rounded-lg border border-slate-800 bg-slate-900/40">
      {linien.map((l, i) => (
        <polyline key={i} points={l.pts} fill="none" stroke={l.farbe} strokeWidth={2}
          strokeLinejoin="round" strokeLinecap="round" />
      ))}
      {marken.map((m, i) => {
        const p = bei(m.tMs);
        return <circle key={i} cx={p.x} cy={p.y} r={6} fill={m.farbe} className="stroke-slate-950" strokeWidth={2} />;
      })}
    </svg>
  );
}
