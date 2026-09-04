import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "./ui";
import { useT } from "../i18n";
import { rampColor, hrColor, hrRange as hrRangeOf } from "../lib/trackColors";
import type { SessionSummary } from "../lib/api";

// Puls-Streifen je Lauf auf der Vergleichsseite (Jans Entwurf 19.08., ausgeloest durch
// ThermikDrehers Frage, wie der Puls beim Pumpen steigt).
//
// Eine Zeile = EIN Lauf. Waagerecht die Zeit AB LAUFBEGINN, alle Zeilen auf derselben Achse von 0
// bis zum laengsten gezeigten Lauf — dadurch sieht man auf einen Blick, wer wie lange durchhaelt
// UND wo im Lauf der Puls hochgeht. Eingefaerbt nach Puls ueber die uebliche Rampe.
//
// Regeln (Jan): Laeufe OHNE Puls werden komplett ignoriert, nicht grau gezeichnet. Sind einzelne
// Laeufe im Vergleichskorb markiert, zaehlen nur diese; sonst alle Laeufe aller Eintraege. Viele
// Zeilen sind ausdruecklich in Ordnung, die Seite scrollt.

export interface HrStripItem {
  key: string;
  // Fahrer bzw. Datum — wird im Demo-Modus unkenntlich gemacht. LEER lassen, wenn alle Zeilen
  // ohnehin von derselben Session stammen (Session-Detailansicht): dort stuende sonst in jeder
  // Zeile derselbe Name und die Lauf-Nummer ginge darin unter.
  label: string;
  session: SessionSummary | null;
  runIdx: number | null;  // null = alle Laeufe dieser Session
}

interface Zeile {
  key: string;
  label: string;
  nr: number;             // Lauf-Nummer INNERHALB der Session (1-basiert)
  hr: (number | null)[];  // ein Wert je Sekunde ab Laufbeginn
  dist: number[];         // aufsummierte Strecke in Metern ab Laufbeginn, gleiche Laenge
}

// Abstand zweier Punkte in Metern. Leaflets map.distance macht das sonst in der App, hier gibt es
// aber keine Karte — und ein Canvas-Baustein soll Leaflet nicht mitschleppen.
function meterZwischen(a: number[], b: number[]): number {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad, dLon = (b[0] - a[0]) * rad;
  const la1 = a[1] * rad, la2 = b[1] * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
// GPS-Spruenge nicht mitzaehlen — dieselbe Schwelle wie in der Karten-/Abspiel-Logik.
const MAX_LUECKE_M = 200;

const ZEILE_H = 13;
const ZEILE_LUECKE = 4;

export function CompareHrStrips({ items }: { items: HrStripItem[] }) {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // Hell-/Dunkel-Modus fuer den Balken-Hintergrund (Jan: ab Lauf-Ende nach rechts hell weiss,
  // dunkel schwarz lassen). Ein Canvas kennt keine CSS-Klassen, die Farbe muss also hier fallen.
  // Das Thema haengt als Klasse `theme-light` am <html> (lib/theme.ts) und aendert sich ohne
  // Event — deshalb ein MutationObserver, sonst bliebe der Balken nach dem Umschalten falsch.
  // Zeit-Position unter dem Zeiger (Index auf der gemeinsamen Achse, also Sekunde ab Laufbeginn).
  // null = kein Zeiger auf dem Diagramm.
  const [hoverI, setHoverI] = useState<number | null>(null);
  const [hell, setHell] = useState(() => document.documentElement.classList.contains("theme-light"));
  useEffect(() => {
    const el = document.documentElement;
    const beobachter = new MutationObserver(() => setHell(el.classList.contains("theme-light")));
    beobachter.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => beobachter.disconnect();
  }, []);

  const zeilen = useMemo<Zeile[]>(() => {
    const out: Zeile[] = [];
    for (const it of items) {
      const a = it.session?.analysis;
      const segs = a?.segments ?? [];
      const hr: (number | null)[] = a?.track_geojson?.properties?.hr ?? [];
      const coords: number[][] = a?.track_geojson?.geometry?.coordinates ?? [];
      if (!segs.length || !hr.length) continue;
      const idxs = it.runIdx != null ? [it.runIdx] : segs.map((_, i) => i);
      for (const ri of idxs) {
        const s: any = segs[ri];
        if (!s || s.i_start == null || s.i_end == null) continue;
        const werte = hr.slice(Math.max(0, s.i_start), Math.min(s.i_end + 1, hr.length))
          .map((v) => (v != null && v > 0 ? v : null));
        // Laeufe ohne Puls komplett ueberspringen (Jan) — eine graue Zeile hilft niemandem.
        if (!werte.some((v) => v != null)) continue;
        // Strecke ab Laufbeginn, damit die Maus-Anzeige beides zeigen kann.
        const von = Math.max(0, s.i_start);
        const dist: number[] = [];
        let summe = 0;
        for (let k = 0; k < werte.length; k++) {
          if (k > 0) {
            const p1 = coords[von + k - 1], p2 = coords[von + k];
            if (p1 && p2) {
              const d = meterZwischen(p1, p2);
              if (d <= MAX_LUECKE_M) summe += d;
            }
          }
          dist.push(summe);
        }
        // Auf die Lauf-Strecke des Servers normieren. Meine Punkt-fuer-Punkt-Summe liegt 0,3-0,5 %
        // daneben (an echten Daten gemessen) — ohne das zeigte die Maus-Anzeige am Laufende 615 m,
        // waehrend die Lauf-Tabelle direkt darueber 618 m sagt. Der Verlauf bleibt derselbe, nur
        // der Endwert stimmt mit der Tabelle ueberein.
        const soll = typeof s.distance_m === "number" ? s.distance_m : null;
        const ist = dist[dist.length - 1] ?? 0;
        if (soll != null && ist > 0) {
          const f = soll / ist;
          for (let k = 0; k < dist.length; k++) dist[k] *= f;
        }
        out.push({ key: `${it.key}:${ri}`, label: it.label, nr: ri + 1, hr: werte, dist });
      }
    }
    return out;
  }, [items]);

  // Puls-Bereich fuer die Farbrampe — ueber die GANZEN Tracks, nicht nur ueber die Laufabschnitte.
  //
  // Das ist wichtig und war zuerst falsch: die Karten (SessionDetail und CompareMap) spannen ihre
  // Rampe ueber alle Punkte der ganzen Session bzw. aller verglichenen Sessions. Wer nur ueber die
  // Laeufe skaliert, zeigt DIESELBE Pulszahl in einer anderen Farbe als die Karte direkt darueber.
  // An echten Daten gemessen (Session #2350): 114 bpm liegen auf der Karte bei 49 % der Rampe,
  // ueber die Laeufe skaliert bei 84 % — gruen-gelb gegen orange-rot, fuer denselben Wert.
  // Gleiche Formel wie dort: Minimum/Maximum ueber alle nicht-leeren Werte, Rueckfall 100…170.
  const bereich = useMemo<[number, number]>(
    () => hrRangeOf(...items.map((it) => it.session?.analysis?.track_geojson?.properties?.hr ?? [])),
    [items],
  );
  const [lo, hi] = bereich;

  const maxLen = useMemo(() => zeilen.reduce((m, z) => Math.max(m, z.hr.length), 0), [zeilen]);

  useEffect(() => {
    const cv = canvasRef.current, box = boxRef.current;
    if (!cv || !box || !zeilen.length || !maxLen) return;
    const dpr = window.devicePixelRatio || 1;
    const w = box.clientWidth;
    const h = zeilen.length * (ZEILE_H + ZEILE_LUECKE);
    cv.width = Math.max(1, Math.round(w * dpr));
    cv.height = Math.max(1, Math.round(h * dpr));
    cv.style.width = `${w}px`;
    cv.style.height = `${h}px`;
    const g = cv.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    zeilen.forEach((z, r) => {
      const y = r * (ZEILE_H + ZEILE_LUECKE);
      // Hintergrund der vollen Achse: zeigt, wie weit dieser Lauf im Vergleich reicht.
      // Ab Lauf-Ende nach rechts bleibt er sichtbar — hell weiss, dunkel dunkelgrau.
      g.fillStyle = hell ? "#ffffff" : "#1e293b";
      g.fillRect(0, y, w, ZEILE_H);
      for (let i = 0; i < z.hr.length; i++) {
        const v = z.hr[i];
        const x0 = (i / maxLen) * w;
        const x1 = ((i + 1) / maxLen) * w;
        // Kein Messwert -> WEISS (Jan, 04.09.). Vorher blieb der Streifen dort einfach in der
        // Hintergrundfarbe, im dunklen Modus also dunkelgrau — das sah nach „niedrige Zone" aus
        // statt nach „nicht gemessen". Stehengebliebene Pulswerte nimmt die Analyse heraus
        // (detect_v2.puls_ohne_eingefrorene), sie landen also hier als null.
        g.fillStyle = v == null ? "#ffffff" : hrColor(v, bereich);
        g.fillRect(x0, y, Math.max(x1 - x0, 1), ZEILE_H);
      }
    });
    // Fuehrungslinie an der Zeit-Position unter dem Zeiger, ueber alle Zeilen hinweg.
    if (hoverI != null) {
      const x = ((hoverI + 0.5) / maxLen) * w;
      g.fillStyle = hell ? "rgba(15,23,42,0.75)" : "rgba(255,255,255,0.8)";
      g.fillRect(Math.round(x), 0, 1, h);
    }
  }, [zeilen, maxLen, bereich, hell, hoverI]);

  const dauer = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;

  if (!zeilen.length) return null;

  return (
    <Card className="p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-200">
          {t("field.2")} · {t("compare.runsTitle").replace("{count}", String(zeilen.length))}
        </h3>
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
          {hoverI != null && (
            <span className="mr-1 rounded bg-slate-800 px-1.5 py-0.5 font-semibold tabular-nums text-slate-200">
              {dauer(hoverI)}
            </span>
          )}
          <span className="tabular-nums">{lo}</span>
          <span
            className="inline-block h-2 w-24 rounded"
            style={{ background: `linear-gradient(to right, ${rampColor(0)}, ${rampColor(0.5)}, ${rampColor(1)})` }}
          />
          <span className="tabular-nums">{hi} bpm</span>
        </div>
      </div>
      <div className="flex gap-2">
        <div className="shrink-0">
          {zeilen.map((z) => (
            <div
              key={z.key}
              className="flex items-center justify-end gap-1 text-[10px] leading-none text-slate-400"
              style={{ height: ZEILE_H, marginBottom: ZEILE_LUECKE }}
            >
              {z.label && <span className="pf-name max-w-[9rem] truncate">{z.label}</span>}
              <span className="tabular-nums text-slate-500">#{z.nr}</span>
            </div>
          ))}
        </div>
        <div
          ref={boxRef}
          className="min-w-0 flex-1"
          // pointer statt mouse: funktioniert damit auch beim Ziehen auf dem Touchscreen.
          onPointerMove={(ev) => {
            const r = ev.currentTarget.getBoundingClientRect();
            const f = (ev.clientX - r.left) / Math.max(r.width, 1);
            setHoverI(Math.max(0, Math.min(maxLen - 1, Math.floor(f * maxLen))));
          }}
          onPointerLeave={() => setHoverI(null)}
        >
          <canvas ref={canvasRef} className="cursor-crosshair" />
          <div className="mt-1 flex justify-between text-[10px] tabular-nums text-slate-500">
            <span>0:00</span>
            <span>{dauer(maxLen)}</span>
          </div>
        </div>
        {/* Werte-Spalte: zeigt fuer JEDEN Lauf die Zahlen an der Zeit-Position unter dem Zeiger.
            Immer vorhanden (auch leer), damit beim Ueberfahren nichts springt. Laeufe, die zu
            diesem Zeitpunkt schon vorbei sind, bleiben leer statt „0" zu behaupten. */}
        <div className="w-[104px] shrink-0">
          {zeilen.map((z) => {
            const i = hoverI;
            const da = i != null && i < z.hr.length;
            const puls = da ? z.hr[i!] : null;
            return (
              <div
                key={z.key}
                className="flex items-center gap-1 whitespace-nowrap text-[10px] leading-none tabular-nums text-slate-400"
                style={{ height: ZEILE_H, marginBottom: ZEILE_LUECKE }}
              >
                {da ? (
                  <>
                    <span className="w-11 text-right font-semibold text-slate-200">
                      {puls != null ? `${puls}` : "–"}
                    </span>
                    <span className="text-slate-500">bpm</span>
                    <span className="ml-auto">{Math.round(z.dist[i!])} m</span>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
