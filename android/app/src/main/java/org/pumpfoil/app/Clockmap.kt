package org.pumpfoil.app

/**
 * Session-ms -> Uhrzeit. Gegenstueck zu `server/app/clockmap.py` und `web/src/lib/clock.ts`;
 * die lange Begruendung steht im Python-Modul.
 *
 * Kurz: die Sample-Zeitachse einer Aufnahme laeuft in AKTIVER Zeit — der Garmin-Recorder zieht
 * Pausen ab, damit GPS/Accel lueckenlos bleiben. Wer daraus eine Uhrzeit macht, muss die Pausen
 * dazurechnen, sonst liegt jeder Lauf nach der ersten Pause um die gesamte Pausendauer zu frueh
 * (Nutzermeldung 10.09.2026). Fuer LAEUFE liefert der Server das fertig als `t_start_clock_ms`.
 */
object Clockmap {

    /** Summe der Pausen, die VOR `tSessionMs` begonnen haben. */
    fun pauseVersatzMs(pausen: List<List<Long>>?, tSessionMs: Long): Long {
        if (pausen.isNullOrEmpty()) return 0L
        var summe = 0L
        for (p in pausen) {
            if (p.size >= 2 && p[0] <= tSessionMs) summe += p[1]
        }
        return summe
    }

    /** Session-ms -> ms ab `started_at` in Wanduhr-Zeit. */
    fun wanduhrMs(pausen: List<List<Long>>?, tSessionMs: Long): Long =
        tSessionMs + pauseVersatzMs(pausen, tSessionMs)

    /**
     * Uhrzeit-Offset eines Laufs (ms ab `started_at`) oder null. `t_start_clock_ms` vom Server
     * bevorzugt; sonst selbst rechnen — und dabei NICHT `t_start_ms` nehmen, das ist auf den
     * Trim re-based.
     */
    fun laufUhrzeitMs(seg: Segment, trimStartMs: Long?, pausen: List<List<Long>>?): Long? {
        seg.tStartClockMs?.let { return it.toLong() }
        val sess = seg.tStartSessionMs?.toLong()
            ?: seg.tStartMs?.let { it.toLong() + (trimStartMs ?: 0L) }
            ?: return null
        return wanduhrMs(pausen, sess)
    }
}
