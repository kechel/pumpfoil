import { useEffect, useMemo, useState } from "react";
import { api, BoardAttitude as Lage } from "../lib/api";
import { Spinner } from "./ui";
import { useT } from "../i18n";
import { Drauf, FrontAnsicht, SeitenAnsicht } from "./FoilRig";

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
 * ZWEI WEGE ZU EINER STELLE, aber nur EINE Position (Jan, 20.09.): beim Abspielen folgt sie dem
 * `progress` der Session-Detailansicht — derselbe Wert, der auch den GPS-Track aufzeichnet, denn
 * eine zweite Zeitachse zu bauen wäre genau der Fehler, der `syncPlayback` schon 14 % Drift
 * gekostet hat. Läuft nichts, führt die Maus über den Kurven. Beides speist dieselbe Variable,
 * damit Zeiger und Zeichnung nie auseinanderlaufen können.
 */

const FENSTER = [0.1, 0.5, 1, 3, 5];   // Sekunden für die Gier-Änderung

/** Eine Kachel: Überschrift, Zeichnung, Zahl, Erklärung. */
function Kachel({ label, hinweis, kind, children }: {
  label: string; hinweis: string; kind: number; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-slate-800 bg-slate-900/40 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-300">{label}</div>
      {children}
      <div className="tabular-nums text-lg font-bold text-slate-100">
        {kind > 0 ? "+" : ""}{kind.toFixed(1)}°
      </div>
      <div className="text-center text-xs text-slate-400">{hinweis}</div>
    </div>
  );
}

/**
 * Die drei Kurven über die Zeit, mit Zeiger.
 *
 * Der Zeiger stand vorher auf festem `#e2e8f0` — im Hellmodus weiß auf weiß und damit unsichtbar
 * (Jan, 20.09.). Farben kommen hier deshalb aus slate-Klassen, die mit dem Theme kippen; die
 * Kurvenfarben selbst sind Mitteltöne, die auf beiden Gründen tragen.
 */
function Kurven({ d, pos, onZeigen, onWeg }: {
  d: Lage; pos: number; onZeigen: (p: number) => void; onWeg: () => void;
}) {
  const t = d.t_ms ?? [];
  const reihen = [
    { name: "Nicken", werte: d.pitch_deg ?? [], farbe: "#38bdf8" },
    { name: "Rollen", werte: d.roll_deg ?? [], farbe: "#f59e0b" },
    { name: "Gieren", werte: d.gier_delta_deg ?? [], farbe: "#a78bfa" },
  ];
  const W = 1000, H = 150;
  const t0 = t[0] ?? 0, t1 = t[t.length - 1] ?? 1;
  const spanne = Math.max(1, t1 - t0);
  const idx = t.length ? Math.min(t.length - 1, Math.round(pos * (t.length - 1))) : 0;
  const zeigen = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onZeigen(Math.min(1, Math.max(0, (e.clientX - r.left) / Math.max(1, r.width))));
  };
  return (
    <div className="space-y-2">
      {reihen.map((r) => {
        const max = Math.max(5, ...r.werte.map((v) => Math.abs(v)));
        const y = (v: number) => H / 2 - (v / max) * (H / 2 - 6);
        const punkte = r.werte.map((v, i) => `${((t[i] - t0) / spanne) * W},${y(v)}`).join(" ");
        // Zeiger am Rand ganz hineinziehen, sonst liegt die halbe Linie außerhalb des Bildes.
        const x = Math.min(W - 1, Math.max(1, pos * W));
        const wert = r.werte[idx];
        return (
          <div key={r.name} className="rounded-xl border border-slate-800 bg-slate-900/40 p-2">
            <div className="mb-1 flex items-baseline justify-between text-xs">
              <span className="font-semibold" style={{ color: r.farbe }}>{r.name}</span>
              <span className="tabular-nums text-slate-400">
                {wert != null && <span className="mr-2 font-semibold text-slate-200">
                  {wert > 0 ? "+" : ""}{wert.toFixed(1)}°
                </span>}
                ±{max.toFixed(0)}°
              </span>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-20 w-full cursor-crosshair"
              onMouseMove={zeigen} onMouseLeave={onWeg}>
              <line x1={0} y1={H / 2} x2={W} y2={H / 2} className="stroke-slate-500" strokeWidth={1}
                vectorEffect="non-scaling-stroke" />
              <polyline points={punkte} fill="none" stroke={r.farbe} strokeWidth={2}
                vectorEffect="non-scaling-stroke" />
              <line x1={x} y1={0} x2={x} y2={H} className="stroke-slate-300" strokeWidth={1.5}
                vectorEffect="non-scaling-stroke" />
              {wert != null && (
                <circle cx={x} cy={y(wert)} r={4} fill={r.farbe} className="stroke-slate-900"
                  strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
              )}
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
  const [maus, setMaus] = useState<number | null>(null);

  useEffect(() => {
    setLaden(true);
    api.boardAttitude(sessionId, { run, yawWindowS: fenster, hz: 20 })
      .then(setD).catch(() => setD(null)).finally(() => setLaden(false));
  }, [sessionId, run, fenster]);

  // Beim Abspielen führt die Wiedergabe, sonst die Maus; ohne beides steht der Zeiger am Ende.
  const pos = playMode ? Math.min(1, Math.max(0, progress)) : (maus ?? 1);
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
  const rig = d.rig;
  const tMs = d.t_ms ?? [];
  const sek = tMs.length ? (tMs[idx] - tMs[0]) / 1000 : 0;
  const NULLTEXT: Record<string, string> = {
    laeufe: "board.zeroRuns", mittelteil: "board.zeroMid", fenster: "board.zeroMean",
  };
  const nullText = NULLTEXT[d.nullpunkt ?? ""] ?? "board.zeroMean";

  return (
    <div className="space-y-3">
      {rig && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Kachel label={t("board.pitch")} hinweis={t("board.pitchHint")} kind={pitch}>
            <SeitenAnsicht rig={rig} pitch={pitch} />
          </Kachel>
          <Kachel label={t("board.roll")} hinweis={t("board.rollHint")} kind={roll}>
            <FrontAnsicht rig={rig} roll={roll} pitch={pitch} />
          </Kachel>
          <Kachel label={t("board.yaw")} hinweis={t("board.yawHint", { s: String(fenster) })} kind={gier}>
            <Drauf rig={rig} yaw={gier} />
          </Kachel>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-400">{t("board.window")}</span>
        {FENSTER.map((f) => (
          <button key={f} onClick={() => setFenster(f)}
            className={`rounded-lg px-2.5 py-1 text-xs ${f === fenster
              ? "bg-brand-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
            {f} s
          </button>
        ))}
        <span className="ml-auto tabular-nums text-xs text-slate-400">
          {t(playMode ? "board.atPlay" : maus != null ? "board.atMouse" : "board.atEnd")}
          {" · "}{sek.toFixed(1)} s
        </span>
      </div>

      <Kurven d={d} pos={pos} onZeigen={setMaus} onWeg={() => setMaus(null)} />

      {k && (
        <p className="text-xs text-slate-400">
          {t("board.stats", {
            pitch: k.pitch_amplitude_deg.toFixed(0),
            roll: k.roll_amplitude_deg.toFixed(0),
            yaw: k.gier_rms_deg_s.toFixed(0),
          })}
          {k.pitch_hz ? ` · ${t("board.cadence", { hz: k.pitch_hz.toFixed(2) })}` : ""}
          {` · ${t(nullText)}`}
          {d.quelle_hz ? ` · ${d.quelle_hz.accel} / ${d.quelle_hz.gyro ?? "–"} Hz` : ""}
        </p>
      )}

      {rig && (
        <p className="text-xs text-slate-400">
          {t("board.rig", {
            foil: `${rig.name.foil ?? "?"} ${rig.foil_span_cm.toFixed(0)} cm`,
            stab: `${rig.name.stab ?? "?"} ${rig.stab_span_cm.toFixed(0)} cm`,
            mast: rig.mast_len_cm.toFixed(0),
            board: `${rig.name.board ?? "?"} ${rig.board_len_cm.toFixed(0)} cm`,
          })}
          {" · "}{t("board.rigAssumed", { fuse: rig.fuse_len_cm.toFixed(0) })}
        </p>
      )}
    </div>
  );
}
