import { useEffect, useMemo, useRef } from "react";
import { Card } from "./ui";
import { useT } from "../i18n";
import { rampColor } from "../lib/trackColors";
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
}

const ZEILE_H = 13;
const ZEILE_LUECKE = 4;

export function CompareHrStrips({ items }: { items: HrStripItem[] }) {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const zeilen = useMemo<Zeile[]>(() => {
    const out: Zeile[] = [];
    for (const it of items) {
      const a = it.session?.analysis;
      const segs = a?.segments ?? [];
      const hr: (number | null)[] = a?.track_geojson?.properties?.hr ?? [];
      if (!segs.length || !hr.length) continue;
      const idxs = it.runIdx != null ? [it.runIdx] : segs.map((_, i) => i);
      for (const ri of idxs) {
        const s: any = segs[ri];
        if (!s || s.i_start == null || s.i_end == null) continue;
        const werte = hr.slice(Math.max(0, s.i_start), Math.min(s.i_end + 1, hr.length))
          .map((v) => (v != null && v > 0 ? v : null));
        // Laeufe ohne Puls komplett ueberspringen (Jan) — eine graue Zeile hilft niemandem.
        if (!werte.some((v) => v != null)) continue;
        out.push({ key: `${it.key}:${ri}`, label: it.label, nr: ri + 1, hr: werte });
      }
    }
    return out;
  }, [items]);

  // Puls-Bereich ueber ALLE gezeigten Zeilen: nur so sind die Farben vergleichbar.
  const [lo, hi] = useMemo(() => {
    const v = zeilen.flatMap((z) => z.hr).filter((x): x is number => x != null);
    return v.length ? [Math.min(...v), Math.max(...v)] : [100, 170];
  }, [zeilen]);

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
      g.fillStyle = "#1e293b";
      g.fillRect(0, y, w, ZEILE_H);
      for (let i = 0; i < z.hr.length; i++) {
        const v = z.hr[i];
        if (v == null) continue;
        const x0 = (i / maxLen) * w;
        const x1 = ((i + 1) / maxLen) * w;
        g.fillStyle = rampColor((v - lo) / Math.max(hi - lo, 1));
        g.fillRect(x0, y, Math.max(x1 - x0, 1), ZEILE_H);
      }
    });
  }, [zeilen, maxLen, lo, hi]);

  if (!zeilen.length) return null;

  const dauer = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;

  return (
    <Card className="p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-200">
          {t("field.2")} · {t("compare.runsTitle").replace("{count}", String(zeilen.length))}
        </h3>
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
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
        <div ref={boxRef} className="min-w-0 flex-1">
          <canvas ref={canvasRef} />
          <div className="mt-1 flex justify-between text-[10px] tabular-nums text-slate-500">
            <span>0:00</span>
            <span>{dauer(maxLen)}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
