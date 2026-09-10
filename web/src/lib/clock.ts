// Session-ms -> Uhrzeit. Gegenstueck zu server/app/clockmap.py; dort steht die lange Begruendung.
//
// Kurz: die Sample-Zeitachse einer Aufnahme laeuft in AKTIVER Zeit — der Garmin-Recorder zieht
// Pausen ab, damit GPS/Accel lueckenlos bleiben. Wer daraus eine Uhrzeit macht, muss die Pausen
// wieder dazurechnen, sonst liegt jeder Lauf nach der ersten Pause um die gesamte Pausendauer
// zu frueh (Nutzermeldung 10.09.2026: Lauf um 10:00 stand als 09:08 da).
//
// Fuer LAEUFE gibt es das fertig vom Server: `t_start_clock_ms` je Segment (Trim UND Pausen
// verrechnet) — `laufUhrzeitMs()` unten nimmt das und rechnet nur noch selbst, wenn ein altes
// Ergebnis das Feld nicht hat. Fuer alles andere in Session-Koordinaten (Ausschluss-Fenster,
// Fremdkraft-Vorschlaege, Zuschnitt-Regler) ist `wanduhrMs()` der Weg.

export type Pausen = number[][] | null | undefined;

/** Summe der Pausen, die VOR `tSessionMs` begonnen haben. */
export function pauseVersatzMs(pausen: Pausen, tSessionMs: number): number {
  if (!pausen || pausen.length === 0) return 0;
  let summe = 0;
  for (const p of pausen) {
    const t = p?.[0], d = p?.[1];
    if (typeof t === "number" && typeof d === "number" && t <= tSessionMs) summe += d;
  }
  return summe;
}

/** Session-ms -> ms ab `started_at` in Wanduhr-Zeit. */
export function wanduhrMs(pausen: Pausen, tSessionMs: number): number {
  return tSessionMs + pauseVersatzMs(pausen, tSessionMs);
}

/**
 * Uhrzeit-Offset eines Laufs (ms ab `started_at`). `t_start_clock_ms` vom Server bevorzugt;
 * sonst selbst rechnen — und dabei NICHT `t_start_ms` nehmen, das ist auf den Trim re-based.
 * Gibt null zurueck, wenn der Lauf keine brauchbare Zeit hat (dann zeigt die UI „–").
 */
export function laufUhrzeitMs(
  seg: { t_start_clock_ms?: number | null; t_start_session_ms?: number | null; t_start_ms?: number | null } | null | undefined,
  trimStartMs: number | null | undefined,
  pausen: Pausen,
): number | null {
  if (typeof seg?.t_start_clock_ms === "number") return seg.t_start_clock_ms;
  const sess = typeof seg?.t_start_session_ms === "number"
    ? seg.t_start_session_ms
    : (typeof seg?.t_start_ms === "number" ? seg.t_start_ms + (trimStartMs ?? 0) : null);
  return sess == null ? null : wanduhrMs(pausen, sess);
}
