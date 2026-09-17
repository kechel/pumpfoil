package org.pumpfoil.app

/**
 * Filter der Liste, aus der man ins Session-Detail gekommen ist.
 *
 * „Älter/neuer" im Detail soll GENAU dieser Liste folgen (Jan, 17.09.2026: „wenn ich auf meine
 * bin, mit nur Accel, dann auch bei meinen nur Accel die frühere oder nächste Session … wenn ich
 * aber an diesem Spot bin, die nächste an meinem Spot von allen Fahrern"). Der Server nimmt dafür
 * dieselben Parameter wie die Listen-Endpunkte.
 *
 * Bewusst ein einfacher Merker im Speicher — genau wie in der PWA (`lastSession.ts`). Wer das
 * Detail über einen Rekord, die Startseite oder eine Benachrichtigung öffnet, hat keinen
 * Listen-Kontext; dann steht hier `Leer` und der Server antwortet wie bisher (eigene Sessions).
 */
data class NachbarFilter(
    val scope: String = "mine",        // "mine" | "all"
    val spot: String? = null,          // Spot-Name oder -id; gesetzt = alle Fahrer an diesem Spot
    val sport: String? = null,         // null = Serverdefault ("all")
    val accelOnly: Boolean = false,
    val filter: String? = null,        // "pump" | "other" (nur eigene)
    val month: String? = null,         // "YYYY-MM" (nur eigene)
) {
    companion object {
        val Leer = NachbarFilter()

        @Volatile
        var aktuell: NachbarFilter = Leer
            private set

        fun merken(f: NachbarFilter) { aktuell = f }
    }
}
