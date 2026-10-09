package org.pumpfoil.app

import kotlin.math.roundToInt

// Laufdauer wie im Web (web/src/lib/dauer.ts): m:ss, ab einer Stunde h:mm:ss. Vorher stand an vielen
// Stellen "%d:%02d".format(s / 60, s % 60) — ein 6-h-Lauf (Nicolas_I, 04.10.2026) erschien als „361:09".
// Erst auf ganze Sekunden runden, sonst wird aus 59,6 s „0:60".
fun fmtLaufDauer(s: Double): String {
    val t = s.roundToInt().coerceAtLeast(0)
    val h = t / 3600
    val m = (t % 3600) / 60
    return if (h > 0) "%d:%02d:%02d".format(h, m, t % 60) else "%d:%02d".format(m, t % 60)
}

/** Mit Einheit: „6:01:09 h" bzw. „4:12 min". */
fun fmtLaufDauerEinheit(s: Double): String = fmtLaufDauer(s) + if (s.roundToInt() >= 3600) " h" else " min"
