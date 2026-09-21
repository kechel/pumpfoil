import { useEffect, useMemo, useState } from "react";
import { api, BoardAttitude as Lage } from "../lib/api";
import { Spinner } from "./ui";
import { useT } from "../i18n";
import { fmtTime } from "../lib/time";
import { wanduhrMs } from "../lib/clock";
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
 * Die Kurven über die Zeit, mit Zeiger — einzeln oder alle in einem Bild.
 *
 * Der Zeiger stand vorher auf festem `#e2e8f0` — im Hellmodus weiß auf weiß und damit unsichtbar
 * (Jan, 20.09.). Farben kommen hier deshalb aus slate-Klassen, die mit dem Theme kippen; die
 * Kurvenfarben selbst sind Mitteltöne, die auf beiden Gründen tragen.
 *
 * IM GEMEINSAMEN BILD wird jede Reihe auf IHR EIGENES Maximum normiert. Anders geht es nicht:
 * Grad und Zentimeter haben keinen gemeinsamen Maßstab, und ein Gierwinkel von 40° würde ein
 * Nicken von 6° sonst platt auf die Mittellinie drücken. Verglichen werden also Form und Takt,
 * nicht Beträge — deshalb steht in der Legende zu jeder Farbe ihr eigener Bereich.
 */
/**
 * Uhrzeit-Achse unter dem Diagramm (Jan, 21.09.: „dann finde ich auch das zugehoerige Video
 * leichter").
 *
 * Als HTML ueber den Zeichnungen, NICHT als Text im SVG: die Diagramme laufen mit
 * `preserveAspectRatio="none"`, jede Schrift darin waere verzerrt. Die Beschriftungen sitzen
 * deshalb prozentual in einem Streifen mit derselben Innenbreite wie die Zeichnung.
 *
 * Die Zeiten sind SESSION-ms und muessen durch `wanduhrMs`: der Garmin-Recorder zieht Pausen aus
 * der Sample-Achse heraus, und wer das ueberspringt, liegt nach der ersten Pause um deren ganze
 * Dauer daneben (belegt 10.09.: ein Lauf um 10:00 stand als 09:08 da).
 */
function Zeitachse({ t_ms, uhrzeit }: { t_ms: number[]; uhrzeit: (t: number) => string }) {
  if (t_ms.length < 2) return null;
  const t0 = t_ms[0], t1 = t_ms[t_ms.length - 1];
  const n = 5;
  const marken = Array.from({ length: n }, (_, i) => t0 + ((t1 - t0) * i) / (n - 1));
  return (
    <div className="relative mt-1 h-4 select-none text-[10px] tabular-nums text-slate-400">
      {marken.map((t, i) => (
        <span key={i} className="absolute whitespace-nowrap"
          style={{
            left: `${(100 * (t - t0)) / Math.max(1, t1 - t0)}%`,
            // Erste Marke linksbuendig, letzte rechtsbuendig, Rest zentriert — sonst haengen die
            // aeusseren Beschriftungen halb ausserhalb.
            transform: i === 0 ? "none" : i === n - 1 ? "translateX(-100%)" : "translateX(-50%)",
          }}>
          {uhrzeit(t)}
        </span>
      ))}
    </div>
  );
}

function Kurven({ reihen, t_ms, pos, zusammen, uhrzeit, onZeigen, onWeg }: {
  reihen: { name: string; werte: number[]; farbe: string; einheit: string }[];
  t_ms: number[]; pos: number; zusammen: boolean; uhrzeit: (t: number) => string;
  onZeigen: (p: number) => void; onWeg: () => void;
}) {
  const W = 1000, H = 150;
  const t0 = t_ms[0] ?? 0, t1 = t_ms[t_ms.length - 1] ?? 1;
  const spanne = Math.max(1, t1 - t0);
  const idx = t_ms.length ? Math.min(t_ms.length - 1, Math.round(pos * (t_ms.length - 1))) : 0;
  const x = Math.min(W - 1, Math.max(1, pos * W));   // am Rand hineinziehen, sonst halb außerhalb
  const zeigen = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onZeigen(Math.min(1, Math.max(0, (e.clientX - r.left) / Math.max(1, r.width))));
  };
  const skala = (werte: number[]) => Math.max(1, ...werte.map((v) => Math.abs(v)));
  const linie = (werte: number[], max: number) =>
    werte.map((v, i) => `${((t_ms[i] - t0) / spanne) * W},${H / 2 - (v / max) * (H / 2 - 6)}`).join(" ");

  if (zusammen) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-2">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-44 w-full cursor-crosshair"
          onMouseMove={zeigen} onMouseLeave={onWeg}>
          <line x1={0} y1={H / 2} x2={W} y2={H / 2} className="stroke-slate-500" strokeWidth={1}
            vectorEffect="non-scaling-stroke" />
          {reihen.map((r) => (
            <polyline key={r.name} points={linie(r.werte, skala(r.werte))} fill="none"
              stroke={r.farbe} strokeWidth={2} vectorEffect="non-scaling-stroke" />
          ))}
          <line x1={x} y1={0} x2={x} y2={H} className="stroke-slate-300" strokeWidth={1.5}
            vectorEffect="non-scaling-stroke" />
          {reihen.map((r) => r.werte[idx] == null ? null : (
            <circle key={r.name} cx={x} cy={H / 2 - (r.werte[idx] / skala(r.werte)) * (H / 2 - 6)}
              r={4} fill={r.farbe} className="stroke-slate-900" strokeWidth={1.5}
              vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {reihen.map((r) => (
            <span key={r.name} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.farbe }} />
              <span className="font-semibold" style={{ color: r.farbe }}>{r.name}</span>
              {r.werte[idx] != null && (
                <span className="tabular-nums font-semibold text-slate-200">
                  {r.werte[idx] > 0 ? "+" : ""}{r.werte[idx].toFixed(1)}{r.einheit}
                </span>
              )}
              <span className="tabular-nums text-slate-400">
                (±{skala(r.werte).toFixed(0)}{r.einheit})
              </span>
            </span>
          ))}
        </div>
        <Zeitachse t_ms={t_ms} uhrzeit={uhrzeit} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {reihen.map((r, ri) => {
        const max = skala(r.werte);
        const wert = r.werte[idx];
        return (
          <div key={r.name} className="rounded-xl border border-slate-800 bg-slate-900/40 p-2">
            <div className="mb-1 flex items-baseline justify-between text-xs">
              <span className="font-semibold" style={{ color: r.farbe }}>{r.name}</span>
              <span className="tabular-nums text-slate-400">
                {wert != null && <span className="mr-2 font-semibold text-slate-200">
                  {wert > 0 ? "+" : ""}{wert.toFixed(1)}{r.einheit}
                </span>}
                ±{max.toFixed(0)}{r.einheit}
              </span>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-20 w-full cursor-crosshair"
              onMouseMove={zeigen} onMouseLeave={onWeg}>
              <line x1={0} y1={H / 2} x2={W} y2={H / 2} className="stroke-slate-500" strokeWidth={1}
                vectorEffect="non-scaling-stroke" />
              <polyline points={linie(r.werte, max)} fill="none" stroke={r.farbe} strokeWidth={2}
                vectorEffect="non-scaling-stroke" />
              <line x1={x} y1={0} x2={x} y2={H} className="stroke-slate-300" strokeWidth={1.5}
                vectorEffect="non-scaling-stroke" />
              {wert != null && (
                <circle cx={x} cy={H / 2 - (wert / max) * (H / 2 - 6)} r={4} fill={r.farbe}
                  className="stroke-slate-900" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
              )}
            </svg>
            {/* Nur unter der letzten Kurve — alle teilen dieselbe Zeitachse, fuenfmal dasselbe
                darunter waere nur Rauschen. */}
            {ri === reihen.length - 1 && <Zeitachse t_ms={t_ms} uhrzeit={uhrzeit} />}
          </div>
        );
      })}
    </div>
  );
}

export default function BoardAttitude({ sessionId, run, progress, playMode,
                                       startedAt, tz, pausen }: {
  sessionId: number;
  run: number | null;
  progress: number;      // 0..1, kommt aus der Wiedergabe der Detailansicht
  playMode: boolean;
  startedAt: string;             // ISO-Start der Aufnahme — fuer die Uhrzeit an der Achse
  tz?: string | null;            // Ortszeit des Spots (s. lib/time.ts)
  pausen?: number[][] | null;    // Pausenfenster, s. lib/clock.ts
}) {
  const t = useT();
  const startMs = new Date(startedAt).getTime();
  const uhrzeit = (tSessionMs: number) =>
    fmtTime(new Date(startMs + wanduhrMs(pausen, tSessionMs)).toISOString(), tz,
            { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const [fenster, setFenster] = useState(1);
  const [d, setD] = useState<Lage | null>(null);
  const [laden, setLaden] = useState(true);
  const [maus, setMaus] = useState<number | null>(null);
  const [zusammen, setZusammen] = useState(false);

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

  const hubReihe = d.hub_cm ?? null;
  const hub = hubReihe?.[idx] ?? 0;
  // Bildausschnitt der Seitenansicht: einmal aus dem ganzen Lauf bestimmt, damit er beim
  // Abspielen still steht statt mitzuatmen.
  const hubBereich = hubReihe ? Math.max(...hubReihe.map((v) => Math.abs(v))) : 0;
  const pitch = d.pitch_deg?.[idx] ?? 0;
  const roll = d.roll_deg?.[idx] ?? 0;
  const gier = d.gier_delta_deg?.[idx] ?? 0;
  const k = d.kennzahlen;
  const rig = d.rig;
  const tMs = d.t_ms ?? [];
  const sek = tMs.length ? (tMs[idx] - tMs[0]) / 1000 : 0;
  const reihen = [
    { name: t("board.pitch"), werte: d.pitch_deg ?? [], farbe: "#38bdf8", einheit: "°" },
    { name: t("board.roll"), werte: d.roll_deg ?? [], farbe: "#f59e0b", einheit: "°" },
    { name: t("board.yaw"), werte: d.gier_delta_deg ?? [], farbe: "#a78bfa", einheit: "°" },
    ...(hubReihe ? [{ name: t("board.height"), werte: hubReihe, farbe: "#34d399", einheit: " cm" }] : []),
  ];
  const NULLTEXT: Record<string, string> = {
    laeufe: "board.zeroRuns", mittelteil: "board.zeroMid", fenster: "board.zeroMean",
  };
  const nullText = NULLTEXT[d.nullpunkt ?? ""] ?? "board.zeroMean";

  return (
    <div className="space-y-3">
      {rig && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Kachel label={t("board.pitch")} hinweis={t("board.pitchHint")} kind={pitch}>
            <SeitenAnsicht rig={rig} pitch={pitch} hub={hub} hubBereich={hubBereich} />
          </Kachel>
          <Kachel label={t("board.roll")} hinweis={t("board.rollHint")} kind={roll}>
            <FrontAnsicht rig={rig} roll={roll} pitch={pitch} />
          </Kachel>
          <Kachel label={t("board.yaw")} hinweis={t("board.yawHint", { s: String(fenster) })} kind={gier}>
            <Drauf rig={rig} yaw={gier} />
          </Kachel>
        </div>
      )}

      <Kurven reihen={reihen} t_ms={tMs} pos={pos} zusammen={zusammen} uhrzeit={uhrzeit}
        onZeigen={setMaus} onWeg={() => setMaus(null)} />

      {/* Bedienelemente UNTER die Kurven (Jan, 20.09.): oben soll Karte, Animation und Kurve
          ohne Trenner hintereinander stehen, damit alles zusammen auf einen Bildschirm passt. */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button onClick={() => setZusammen((v) => !v)}
          className={`rounded-lg px-2.5 py-1 text-xs font-medium ${zusammen
            ? "bg-brand-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
          {t(zusammen ? "board.separate" : "board.combined")}
        </button>
        <span className="ml-2 text-slate-400">{t("board.window")}</span>
        {FENSTER.map((f) => (
          <button key={f} onClick={() => setFenster(f)}
            className={`rounded-lg px-2.5 py-1 text-xs ${f === fenster
              ? "bg-brand-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
            {f} s
          </button>
        ))}
        <span className="ml-auto tabular-nums text-xs text-slate-400">
          {t(playMode ? "board.atPlay" : maus != null ? "board.atMouse" : "board.atEnd")}
          {tMs.length ? ` · ${uhrzeit(tMs[idx])}` : ""}
          {" · "}{sek.toFixed(1)} s
        </span>
      </div>

      {k && (
        <p className="text-xs text-slate-400">
          {t("board.stats", {
            pitch: k.pitch_amplitude_deg.toFixed(0),
            roll: k.roll_amplitude_deg.toFixed(0),
            yaw: k.gier_rms_deg_s.toFixed(0),
          })}
          {k.pitch_hz ? ` · ${t("board.cadence", { hz: k.pitch_hz.toFixed(2) })}` : ""}
          {k.hub_pp_cm ? ` · ${t("board.heaveStat", { cm: k.hub_pp_cm.toFixed(0), s: String(d.hub_fenster_s ?? 3) })}` : ""}
          {` · ${t(nullText)}`}
          {d.quelle_hz ? ` · ${d.quelle_hz.accel} / ${d.quelle_hz.gyro ?? "–"} Hz` : ""}
        </p>
      )}

      {/* Warnung in NORMALER Schriftgroesse (Projektregel: Hinweise nie kleiner als der Fliesstext)
          und in amber, das als Nicht-slate-Ton beide Farbmodi ausdruecklich braucht. */}
      {k?.hub_pp_cm != null && k.hub_sicher === false && (
        <p className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          {t("board.heaveShaky", { s: String(d.hub_fenster_s ?? 3) })}
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
