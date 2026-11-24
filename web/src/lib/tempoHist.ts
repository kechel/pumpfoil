// Tempo-Verteilung im Browser (Session-Details, docs/TEMPO-VERTEILUNG.md Schritt 2) — DIESELBE Regel wie
// server/app/analysis/tempo_hist.py, damit Session und Stats-Reiter dieselben Zahlen zeigen:
// nur Punkte innerhalb der Laeufe, halboffen [i_start, i_end); jeder Punkt zaehlt duration_s / (i_end - i_start)
// Sekunden (GPS hat Loecher, Index ist nicht Sekunde); Gleiten nur aus pg-1 (`pg_glides`, wo `pg_pumps` gesetzt ist).

export const TEMPO_BREITE_KMH = 0.5;
export const TEMPO_STUFEN = 80;

export interface TempoHistLokal { a: number[]; g: number[] | null; g_basis: number[] | null }

const stufe = (v: number) => Math.min(Math.max(Math.floor((v * 3.6) / TEMPO_BREITE_KMH), 0), TEMPO_STUFEN - 1);

export function tempoHist(segments: any[], speeds1: (number | null)[]): TempoHistLokal {
  const a = new Array(TEMPO_STUFEN).fill(0);
  const g = new Array(TEMPO_STUFEN).fill(0);
  const gb = new Array(TEMPO_STUFEN).fill(0);
  let mitGleiten = false;
  const n = speeds1.length;
  for (const sg of segments ?? []) {
    if (!sg || typeof sg !== "object") continue;
    const i = sg.i_start, j0 = sg.i_end;
    if (i == null || j0 == null || j0 <= i || i >= n) continue;
    const j = Math.min(j0, n - 1);
    if (j <= i) continue;
    const w = Number(sg.duration_s || 0) / (j - i);
    const pg = sg.pg_pumps != null && Array.isArray(sg.pg_glides);
    const gleit = new Set<number>();
    if (pg) {
      mitGleiten = true;
      for (const gl of sg.pg_glides) {
        const x = Number(gl?.[0]), y = Number(gl?.[1]);
        if (Number.isFinite(x) && Number.isFinite(y)) for (let k = x; k < y; k++) gleit.add(k);
      }
    }
    for (let k = i; k < j; k++) {
      const v = speeds1[k];
      if (v == null) continue;
      const b = stufe(v);
      a[b] += w;
      if (pg) gb[b] += w;
      if (gleit.has(k)) g[b] += w;
    }
  }
  return { a, g: mitGleiten ? g : null, g_basis: mitGleiten ? gb : null };
}
