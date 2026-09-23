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

/**
 * Graue Flaechen links und rechts, wo der RAND liegt (die 10 s vor und nach dem Lauf).
 *
 * Ohne das waere nicht zu sehen, wo der Lauf wirklich anfaengt — und genau der Anlauf ist der
 * Grund, warum der Rand ueberhaupt mitgezeigt wird.
 */
function Randmarken({ t_ms, von, bis, W, H }: {
  t_ms: number[]; von?: number | null; bis?: number | null; W: number; H: number;
}) {
  if (von == null || bis == null || t_ms.length < 2) return null;
  const t0 = t_ms[0], t1 = t_ms[t_ms.length - 1], spanne = Math.max(1, t1 - t0);
  const x = (t: number) => Math.min(W, Math.max(0, ((t - t0) / spanne) * W));
  const a = x(von), b = x(bis);
  return (
    <g className="fill-slate-500" opacity={0.14}>
      {a > 0 && <rect x={0} y={0} width={a} height={H} />}
      {b < W && <rect x={b} y={0} width={W - b} height={H} />}
    </g>
  );
}

function Kurven({ reihen, t_ms, pos, zusammen, uhrzeit, auswahlVon, auswahlBis, onZeigen, onWeg }: {
  reihen: { name: string; werte: number[]; farbe: string; einheit: string }[];
  t_ms: number[]; pos: number; zusammen: boolean; uhrzeit: (t: number) => string;
  auswahlVon?: number | null; auswahlBis?: number | null;
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
  // Die Punktlisten aendern sich nur mit den DATEN, nicht mit dem Zeiger. Sie bei jedem Bild
  // neu zu bauen hiess vier Reihen à mehrere hundert Punkte, 60-mal je Sekunde — spuerbar
  // (Jans „sehr ruckelig", 21.09.). Jetzt einmal, und die Wiedergabe bewegt nur noch Linie
  // und Punkte.
  const gerechnet = useMemo(() => reihen.map((r) => {
    const max = Math.max(1, ...r.werte.map((v) => Math.abs(v)));
    return {
      max,
      punkte: r.werte
        .map((v, i) => `${((t_ms[i] - t0) / spanne) * W},${H / 2 - (v / max) * (H / 2 - 6)}`)
        .join(" "),
    };
  }), [reihen, t_ms, t0, spanne]);
  const skala = (i: number) => gerechnet[i].max;

  if (zusammen) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-2">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-44 w-full cursor-crosshair"
          onMouseMove={zeigen} onMouseLeave={onWeg}>
          <Randmarken t_ms={t_ms} von={auswahlVon} bis={auswahlBis} W={W} H={H} />
          <line x1={0} y1={H / 2} x2={W} y2={H / 2} className="stroke-slate-500" strokeWidth={1}
            vectorEffect="non-scaling-stroke" />
          {reihen.map((r, i) => (
            <polyline key={r.name} points={gerechnet[i].punkte} fill="none"
              stroke={r.farbe} strokeWidth={2} vectorEffect="non-scaling-stroke" />
          ))}
          <line x1={x} y1={0} x2={x} y2={H} className="stroke-slate-300" strokeWidth={1.5}
            vectorEffect="non-scaling-stroke" />
          {reihen.map((r, i) => r.werte[idx] == null ? null : (
            <circle key={r.name} cx={x} cy={H / 2 - (r.werte[idx] / skala(i)) * (H / 2 - 6)}
              r={4} fill={r.farbe} className="stroke-slate-900" strokeWidth={1.5}
              vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {reihen.map((r, i) => (
            <span key={r.name} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.farbe }} />
              <span className="font-semibold" style={{ color: r.farbe }}>{r.name}</span>
              {r.werte[idx] != null && (
                <span className="tabular-nums font-semibold text-slate-200">
                  {r.werte[idx] > 0 ? "+" : ""}{r.werte[idx].toFixed(1)}{r.einheit}
                </span>
              )}
              <span className="tabular-nums text-slate-400">
                (±{skala(i).toFixed(0)}{r.einheit})
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
        const max = skala(ri);
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
              <Randmarken t_ms={t_ms} von={auswahlVon} bis={auswahlBis} W={W} H={H} />
              <line x1={0} y1={H / 2} x2={W} y2={H / 2} className="stroke-slate-500" strokeWidth={1}
                vectorEffect="non-scaling-stroke" />
              <polyline points={gerechnet[ri].punkte} fill="none" stroke={r.farbe} strokeWidth={2}
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

export default function BoardAttitude({ sessionId, run, vonMs, bisMs, progress, playMode,
                                       playTMs, onZeit, onHinweis, randS, startedAt,
                                       tz, pausen, token }: {
  sessionId: number;
  run: number | null;
  // Alternativ zum Lauf: ein freies Fenster (Startversuch). `run` hat Vorrang.
  vonMs?: number | null;
  bisMs?: number | null;
  progress: number;      // 0..1, kommt aus der Wiedergabe der Detailansicht
  playMode: boolean;
  // ABSOLUTE Zeit des Abspielzeigers in Session-ms. Vorrang vor `progress`: die Karte kann
  // einen anderen Zeitraum zeigen als diese Ansicht (Zuschnitt gegen ganze Aufnahme), dann
  // ergibt ein gemeinsamer Bruchteil zwei verschiedene Stellen.
  playTMs?: number | null;
  // Meldet die Zeit unter der Maus nach oben (Session-ms), damit die KARTE bis dorthin
  // gezeichnet wird. null = Maus ist weg.
  onZeit?: (tMs: number | null) => void;
  // Warnhinweise nach oben melden statt sie hier zu zeigen: Jan will sie unter dem
  // Abspielen-Knopf haben, und der steht in der Detailansicht.
  onHinweis?: (text: string | null) => void;
  // Sekunden vor und nach der Auswahl, die mitgezeigt werden. Kommt von oben, damit Karte,
  // Wiedergabe und Kurven denselben Rand benutzen.
  randS?: number;
  startedAt: string;             // ISO-Start der Aufnahme — fuer die Uhrzeit an der Achse
  tz?: string | null;            // Ortszeit des Spots (s. lib/time.ts)
  pausen?: number[][] | null;    // Pausenfenster, s. lib/clock.ts
  // Teilen-Token der oeffentlichen Ansicht. Gesetzt heisst: ueber den oeffentlichen Endpunkt
  // holen, denn ohne Login antwortet der angemeldete mit 401 — und die Ansicht blieb leer.
  token?: string | null;
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
  // Standard: alles in EINEM Bild (Jan, 21.09.) — der Vergleich der Kurven ist der Zweck.
  const [zusammen, setZusammen] = useState(true);

  useEffect(() => {
    setLaden(true);
    api.boardAttitude(sessionId, { run, vonMs, bisMs, yawWindowS: fenster, hz: 20, padS: randS, token })
      .then(setD).catch(() => setD(null)).finally(() => setLaden(false));
  }, [sessionId, run, vonMs, bisMs, fenster, randS, token]);

  // Beim Abspielen führt die Wiedergabe, sonst die Maus; ohne beides steht der Zeiger am Ende.
  // Im Abspielmodus ueber die ECHTE Zeit, nicht ueber den Bruchteil (s. `playTMs`) — nur wenn
  // die Karte keine Zeit liefert, bleibt der Bruchteil als Rueckfall.
  const idx = useMemo(() => {
    const t = d?.t_ms ?? [];
    if (!t.length) return 0;
    // DIE MAUS HAT VORRANG. Sie schiebt zugleich die Karte (s. `onZeit`), und die schaltet dabei
    // in den Abspielmodus — ohne diesen Vorrang wuerde die Ansicht danach ihrer eigenen
    // Rueckmeldung folgen statt der Maus.
    if (maus != null) return Math.min(t.length - 1, Math.round(maus * (t.length - 1)));
    if (playMode && playTMs != null) {
      // Naechstgelegene Stuetzstelle; ausserhalb des Bereichs der jeweilige Rand.
      let lo = 0, hi = t.length - 1;
      while (lo < hi) { const m = (lo + hi) >> 1; if (t[m] < playTMs) lo = m + 1; else hi = m; }
      if (lo > 0 && Math.abs(t[lo - 1] - playTMs) <= Math.abs(t[lo] - playTMs)) lo--;
      return lo;
    }
    const p = playMode ? Math.min(1, Math.max(0, progress)) : 1;
    return Math.min(t.length - 1, Math.round(p * (t.length - 1)));
  }, [d, playMode, playTMs, progress, maus]);

  // Hub-Warnung nach oben melden (s. `onHinweis`).
  // Bewusst aus `d`, nicht aus dem spaeteren `k`: Hooks muessen VOR den fruehen Returns stehen.
  const hubUnsicher = d?.kennzahlen?.hub_pp_cm != null && d.kennzahlen.hub_sicher === false;
  const hubFenster = d?.hub_fenster_s ?? 3;
  // WORAUF sich die Warnung bezieht, gehoert in den Text (Jan, 23.09.2026). Vorher stand dort
  // „hier", und „hier" war je nach Auswahl etwas anderes: bei #9656 meldete die Gesamtansicht
  // zu Recht einen unbrauchbaren Hub (Takt 0,33 Hz ueber 33 Minuten, das ist das Schaukeln
  // zwischen den Laeufen), waehrend BEIDE Laeufe mit 1,59 und 1,80 Hz sauber waren und ihre
  // 16/15 cm ohne Klammern dastanden. Die Warnung stand trotzdem direkt ueber dieser Tabelle,
  // und Jan hat sie logischerweise auf seine Laeufe bezogen — „das war echtes Pumpen".
  const ganzeAufnahme = run == null && vonMs == null && bisMs == null;
  useEffect(() => {
    // Eine Stelle nach dem Komma. Das Fenster kommt aus 2/Takt und ist damit krumm — ungerundet
    // stand im Hinweis woertlich „3.4482758620689657-second window" (Jan, 22.09.).
    onHinweis?.(hubUnsicher
      ? t(ganzeAufnahme ? "board.heaveShakyAll" : "board.heaveShaky",
          { s: hubFenster.toFixed(1).replace(/\.0$/, "") }) : null);
    return () => onHinweis?.(null);
  }, [hubUnsicher, hubFenster, ganzeAufnahme, onHinweis, t]);

  // Zeit unter der Maus nach oben melden. Als Effekt, nicht im Zeichnen: `onZeit` setzt oben
  // Zustand, und das waehrend des Renderns waere eine Schleife.
  const tMsAlle = d?.t_ms;
  useEffect(() => {
    if (!onZeit) return;
    onZeit(maus != null && tMsAlle?.length ? tMsAlle[idx] : null);
  }, [maus, idx, tMsAlle, onZeit]);
  // Stellung des Zeigers in DIESER Ansicht — aus dem Index, damit Linie und Zahl nie auseinander
  // laufen koennen.
  const pos = useMemo(() => {
    const n = d?.t_ms?.length ?? 0;
    return n > 1 ? idx / (n - 1) : 0;
  }, [d, idx]);

  // ALLE Hooks stehen VOR den fruehen Returns. `reihen` hing zwischenzeitlich dahinter, und
  // React zaehlte beim naechsten Rendern einen Hook mehr — Fehler #310, die Seite war weg.
  const hubReihe = d?.hub_cm ?? null;
  // Gemerkt, weil diese Ansicht beim Abspielen 60-mal je Sekunde rendert: ein frisches Array
  // wuerde die Memoisierung der Kurven-Polylinien darunter wertlos machen.
  const reihen = useMemo(() => [
    { name: t("board.pitch"), werte: d?.pitch_deg ?? [], farbe: "#38bdf8", einheit: "°" },
    { name: t("board.roll"), werte: d?.roll_deg ?? [], farbe: "#f59e0b", einheit: "°" },
    { name: t("board.yaw"), werte: d?.gier_delta_deg ?? [], farbe: "#a78bfa", einheit: "°" },
    ...(hubReihe ? [{ name: t("board.height"), werte: hubReihe, farbe: "#34d399", einheit: " cm" }] : []),
  ], [d, hubReihe, t]);

  if (laden) return <div className="py-8"><Spinner /></div>;
  if (!d || !d.ok) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-300">
        {d?.grund ? `${t("board.noData")} (${d.grund})` : t("board.noData")}
      </div>
    );
  }

  const tMs = d.t_ms ?? [];
  // Bildausschnitt der Seitenansicht: einmal bestimmt, damit er beim Abspielen still steht
  // statt mitzuatmen — aber NUR aus dem ausgewaehlten Lauf, nicht aus dem Rand davor und
  // danach. Dort liegt das Brett am Steg, wird umgedreht oder fliegt beim Sturz durch die
  // Gegend; der Hub kommt aus zweimaligem Integrieren und schlaegt dann auf ueber 140 cm aus
  // (#9535 gemessen: im Lauf 15 cm, ueber die ganze Aufnahme 147 cm). Der Rahmen war damit
  // dreimal so hoch wie das Rig und alles darin winzig — Jans Befund am 21.09.2026: „warum ist
  // das board links so klein?". Zusaetzlich ein robustes Maximum (95. Perzentil), damit auch
  // innerhalb eines Laufs ein einzelner Ausschlag nicht den Maszstab bestimmt.
  const hubImLauf = (() => {
    if (!hubReihe?.length) return [];
    const von = d.auswahl_von_ms, bis = d.auswahl_bis_ms;
    if (von == null || bis == null || !tMs.length) return hubReihe;
    const nur = hubReihe.filter((_, i) => tMs[i] >= von && tMs[i] <= bis);
    return nur.length >= 8 ? nur : hubReihe;
  })();
  const hubBereich = (() => {
    if (!hubImLauf.length) return 0;
    const sortiert = hubImLauf.map((v) => Math.abs(v)).sort((a, b) => a - b);
    const p95 = sortiert[Math.min(sortiert.length - 1, Math.floor(sortiert.length * 0.95))];
    return Math.max(2, p95);
  })();
  // Steht der Zeiger im Rand, kann der Hub weit ausserhalb des Rahmens liegen. Dann am Rand
  // anstehen lassen, statt das Rig aus dem Bild fliegen zu lassen: dort ist die Zahl aus der
  // doppelten Integration ohnehin nicht belastbar, die Kurve darunter zeigt sie trotzdem.
  const hub = Math.max(-hubBereich, Math.min(hubBereich, hubReihe?.[idx] ?? 0));
  const pitch = d.pitch_deg?.[idx] ?? 0;
  const roll = d.roll_deg?.[idx] ?? 0;
  const gier = d.gier_delta_deg?.[idx] ?? 0;
  const k = d.kennzahlen;
  const rig = d.rig;
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
        auswahlVon={d.auswahl_von_ms} auswahlBis={d.auswahl_bis_ms}
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
          {k.hub_pp_cm ? ` · ${t("board.heaveStat", { cm: k.hub_pp_cm.toFixed(0),
            s: (d.hub_fenster_s ?? 3).toFixed(1).replace(/\.0$/, "") })}` : ""}
          {` · ${t(nullText)}`}
          {/* Was die Automatik gefunden hat, sichtbar machen — sonst ist nicht zu unterscheiden,
              ob das Brett schief steht oder die Montage falsch erkannt wurde. */}
          {d.rot_deg != null
            ? ` · ${t("board.mounting")} ${Math.round(d.rot_deg)}°${
              d.rot_quelle && d.rot_quelle !== "manuell" ? ` (${t("board.mountAuto")})` : ""}`
            : ""}
          {/* Die GPS-Gegenprobe mit anzeigen: sie belegt das Vorzeichen des Gierens und faellt
              auf, wenn eine Aufnahme aus der Reihe taenzt. */}
          {d.gier_gps
            ? ` · ${t("board.yaw")}/GPS ${d.gier_gps.steigung.toFixed(2)} (r ${d.gier_gps.r.toFixed(2)})${
              d.gier_umgekehrt ? " ↔" : ""}`
            : ""}
          {d.quelle_hz ? ` · ${d.quelle_hz.accel} / ${d.quelle_hz.gyro ?? "–"} Hz` : ""}
        </p>
      )}

      {/* KEINE Ausruestungs-Zeile mehr (Jan, 22.09.2026): Foil, Stab, Mast und Brett stehen
          bereits ganz oben auf der Seite als Chips (`FoilSelect`) — hier standen sie ein zweites
          Mal, nur mit anderen Worten. Einzig die Rumpflaenge und der Hinweis „Laengspositionen
          geschaetzt" waren neu; die laesst Jan vorerst weg. Die Zeichnung darueber braucht die
          Masse weiterhin, sie kommen unveraendert aus `d.rig`. Die Schluessel `board.rig` und
          `board.rigAssumed` bleiben in den Sprachdateien stehen — „erstmal weglassen". */}
    </div>
  );
}
