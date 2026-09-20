import { useEffect, useMemo, useState } from "react";
import { api, BoardAttitude as Lage } from "../lib/api";
import { Spinner } from "./ui";
import { useT } from "../i18n";

/**
 * Lage des Bretts über die Zeit: Nicken, Rollen, Gieren.
 *
 * Erscheint nur, wenn die Session als „Handy am Brett" markiert ist — in der Tasche oder am Arm
 * misst das Handy den Fahrer und nicht das Brett. Markieren dürfen nur Admins, deshalb braucht
 * die Ansicht selbst kein zweites Gate.
 *
 * DIE ZEITACHSE KOMMT VOM SERVER, nicht aus einer Annahme. Accel und Gyro laufen je nach Gerät
 * verschieden schnell (iPhone beide 50 Hz, Pixel 7a 120,5 gegen 60,3), und der Server baut beide
 * Achsen aus den echten Chunk-Startzeiten. Hier wird nur noch gezeichnet.
 *
 * Der Abspiel-Zeiger hängt am `progress` der Session-Detailansicht — derselbe Wert, der auch den
 * GPS-Track aufzeichnet. Eine zweite Zeitachse zu bauen wäre genau der Fehler, der `syncPlayback`
 * schon einmal 14 % Drift gekostet hat.
 */

const FENSTER = [0.1, 0.5, 1, 3, 5];   // Sekunden für die Gier-Änderung

/** Ein Brett, um `grad` gedreht — die drei Ansichten aus Jans Skizze. */
function Brett({ grad, art, label, hinweis }: {
  grad: number; art: "pitch" | "roll" | "yaw"; label: string; hinweis: string;
}) {
  const farbe = "#e8703a";
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-slate-800 bg-slate-900/40 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-300">{label}</div>
      <svg viewBox="-60 -45 120 90" className="h-24 w-32">
        <g transform={`rotate(${-grad})`}>
          {art === "yaw" ? (
            // Von oben: Brett als längliche Form, Nase nach oben.
            <rect x={-11} y={-34} width={22} height={68} rx={11} fill={farbe} />
          ) : (
            <>
              <rect x={-38} y={-4} width={76} height={8} rx={3} fill={farbe} />
              {/* Mast + Frontflügel, damit Seiten- und Frontansicht unterscheidbar bleiben */}
              <rect x={-2} y={4} width={4} height={22} fill="#64748b" />
              <ellipse cx={0} cy={28} rx={art === "pitch" ? 20 : 26} ry={3.5} fill="#64748b" />
            </>
          )}
        </g>
        <circle cx={0} cy={0} r={3.5} fill="none" stroke="#0f172a" strokeWidth={1.6} />
        <circle cx={0} cy={0} r={1} fill="#0f172a" />
        {/* Horizont als Bezug */}
        <line x1={-56} y1={0} x2={56} y2={0} stroke="#475569" strokeDasharray="3 4" strokeWidth={0.8} />
      </svg>
      <div className="tabular-nums text-lg font-bold text-slate-100">
        {grad > 0 ? "+" : ""}{grad.toFixed(1)}°
      </div>
      <div className="text-center text-xs text-slate-400">{hinweis}</div>
    </div>
  );
}

/** Die drei Kurven über die Zeit, mit Abspiel-Zeiger. */
function Kurven({ d, pos }: { d: Lage; pos: number }) {
  const t = d.t_ms ?? [];
  const reihen = [
    { name: "Nicken", werte: d.pitch_deg ?? [], farbe: "#38bdf8" },
    { name: "Rollen", werte: d.roll_deg ?? [], farbe: "#fbbf24" },
    { name: "Gieren", werte: d.gier_delta_deg ?? [], farbe: "#a78bfa" },
  ];
  const W = 1000, H = 150;
  const t0 = t[0] ?? 0, t1 = t[t.length - 1] ?? 1;
  const spanne = Math.max(1, t1 - t0);
  return (
    <div className="space-y-2">
      {reihen.map((r) => {
        const max = Math.max(5, ...r.werte.map((v) => Math.abs(v)));
        const punkte = r.werte.map((v, i) =>
          `${((t[i] - t0) / spanne) * W},${H / 2 - (v / max) * (H / 2 - 6)}`).join(" ");
        const x = pos * W;
        return (
          <div key={r.name} className="rounded-xl border border-slate-800 bg-slate-900/40 p-2">
            <div className="mb-1 flex items-baseline justify-between text-xs">
              <span className="font-semibold" style={{ color: r.farbe }}>{r.name}</span>
              <span className="tabular-nums text-slate-400">±{max.toFixed(0)}°</span>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-20 w-full">
              <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="#334155" strokeWidth={1} />
              <polyline points={punkte} fill="none" stroke={r.farbe} strokeWidth={2}
                vectorEffect="non-scaling-stroke" />
              <line x1={x} y1={0} x2={x} y2={H} stroke="#e2e8f0" strokeWidth={1.5}
                vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
        );
      })}
    </div>
  );
}

export default function BoardAttitude({ sessionId, run, progress, playMode }: {
  sessionId: number;
  run: number | null;
  progress: number;      // 0..1, kommt aus der Wiedergabe der Detailansicht
  playMode: boolean;
}) {
  const t = useT();
  const [fenster, setFenster] = useState(1);
  const [d, setD] = useState<Lage | null>(null);
  const [laden, setLaden] = useState(true);

  useEffect(() => {
    setLaden(true);
    api.boardAttitude(sessionId, { run, yawWindowS: fenster, hz: 20 })
      .then(setD).catch(() => setD(null)).finally(() => setLaden(false));
  }, [sessionId, run, fenster]);

  // Im Abspielmodus folgt der Zeiger der Wiedergabe, sonst steht er am Ende (statische Ansicht).
  const pos = playMode ? Math.min(1, Math.max(0, progress)) : 1;
  const idx = useMemo(() => {
    const n = d?.t_ms?.length ?? 0;
    return n ? Math.min(n - 1, Math.round(pos * (n - 1))) : 0;
  }, [d, pos]);

  if (laden) return <div className="py-8"><Spinner /></div>;
  if (!d || !d.ok) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-300">
        {d?.grund ? `${t("board.noData")} (${d.grund})` : t("board.noData")}
      </div>
    );
  }

  const pitch = d.pitch_deg?.[idx] ?? 0;
  const roll = d.roll_deg?.[idx] ?? 0;
  const gier = d.gier_delta_deg?.[idx] ?? 0;
  const k = d.kennzahlen;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Brett grad={pitch} art="pitch" label={t("board.pitch")} hinweis={t("board.pitchHint")} />
        <Brett grad={roll} art="roll" label={t("board.roll")} hinweis={t("board.rollHint")} />
        <Brett grad={gier} art="yaw" label={t("board.yaw")} hinweis={t("board.yawHint", { s: String(fenster) })} />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-400">{t("board.window")}</span>
        {FENSTER.map((f) => (
          <button key={f} onClick={() => setFenster(f)}
            className={`rounded-lg px-2.5 py-1 text-xs ${f === fenster
              ? "bg-brand-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
            {f} s
          </button>
        ))}
      </div>

      <Kurven d={d} pos={pos} />

      {k && (
        <p className="text-xs text-slate-400">
          {t("board.stats", {
            pitch: k.pitch_amplitude_deg.toFixed(0),
            roll: k.roll_amplitude_deg.toFixed(0),
            yaw: k.gier_rms_deg_s.toFixed(0),
          })}
          {k.pitch_hz ? ` · ${t("board.cadence", { hz: k.pitch_hz.toFixed(2) })}` : ""}
          {` · ${t(d.nullpunkt === "ruhe" ? "board.zeroStill" : "board.zeroMean")}`}
          {d.quelle_hz ? ` · ${d.quelle_hz.accel} / ${d.quelle_hz.gyro ?? "–"} Hz` : ""}
        </p>
      )}
    </div>
  );
}
