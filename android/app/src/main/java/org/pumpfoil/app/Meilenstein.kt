package org.pumpfoil.app

/**
 * Wann eine Zahl in der Community-Leiste pulsiert — dieselbe Regel wie im Web
 * (`web/src/lib/pumpPulse.ts`).
 *
 * Jan, 23.09.2026: die Pump-Zahl soll pulsieren, sobald die Million steht; am 24.09. erweitert
 * auf Foiler und Spots, dort ab 1.000. Die Abschalt-Regel ist seine: „puls bei 1000-1100 fuer
 * nutzer und spots, und 1000000-1100000 bei pumps" — ein Fenster von zehn Prozent ueber der
 * Stufe. Kein Merker, kein Zeitrechnen: die Regel steht in der Zahl selbst, jeder sieht
 * denselben Zustand, und sie erlischt, wenn die Gemeinschaft zehn Prozent weiter gewachsen ist.
 *
 * JEDE STUFE ZAEHLT: die zweite Million pulst wieder, von 2.000.000 bis 2.200.000.
 *
 * WENN SICH DIE REGEL AENDERT, aendert sie sich an DREI Stellen — Web, hier und
 * `watch-apple/Sources-iOS/Meilenstein.swift`. Eine gemeinsame Quelle gibt es fuer diese drei
 * Zeilen nicht; dafuer steht in jeder derselbe Kommentar, damit die anderen beiden beim Suchen
 * gefunden werden.
 */
object Meilenstein {
    const val PUMPS = 1_000_000L
    const val LEUTE = 1_000L          // Foiler und Spots
    private const val FENSTER = 0.1

    /** Liegt der Wert im Feier-Fenster ueber einer erreichten Stufe? */
    fun imFenster(wert: Long, stufe: Long): Boolean {
        if (wert < stufe) return false
        val erreicht = (wert / stufe) * stufe
        return wert < erreicht * (1 + FENSTER)
    }
}
