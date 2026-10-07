package org.pumpfoil.watch

/**
 * Reine Hilfen fuer den Messweg nach Doku (Wear 1.2.40, 07.10.2026) — ohne Android, damit sie in
 * JUnit laufen. Hintergrund: GPS brach auf mehreren Uhren nach Minuten ab, waehrend der
 * Beschleunigungssensor weiterlief (u818 #13822, u574 #13051). Der dokumentierte Weg ist
 *  - GPS ueber Health Services (`ExerciseClient`, `isGpsEnabled`): misst bei dunklem Display im
 *    selben Takt weiter und liefert gebuendelt, ohne den Prozessor zu wecken;
 *  - Beschleunigung als Wake-up-Sensor MIT Hardware-Batching (`maxReportLatencyUs`), Zeit aus
 *    `SensorEvent.timestamp` statt aus der Ankunft.
 * Beides liefert Messwerte VERSPAETET und gebuendelt — die Zeit eines Werts muss deshalb aus seinem
 * eigenen Zeitstempel kommen, nie aus dem Moment, in dem er bei uns ankommt.
 */
object MessZeit {
    /** Hoechstes plausibles Alter eines Werts. Health Services buendelt laut Doku bis ~150 s;
     *  was deutlich aelter wirkt, hat einen anderen Zeitbezug und gilt als unbekannt. */
    const val MAX_ALTER_MS = 10 * 60_000L

    /**
     * Alter eines Messwerts in ms gegenueber jetzt, beides in Nanosekunden seit dem Start der Uhr
     * (`SystemClock.elapsedRealtimeNanos`, derselbe Bezug wie `SensorEvent.timestamp` und
     * `DataPoint.timeDurationFromBoot`). -1 = unbekannt (Zeit aus der Zukunft oder unplausibel alt);
     * dann nimmt der Aufrufer die Ankunftszeit wie bisher.
     */
    fun alterMs(jetztBootNs: Long, ereignisBootNs: Long): Long {
        val ms = (jetztBootNs - ereignisBootNs) / 1_000_000L
        return if (ms in 0..MAX_ALTER_MS) ms else -1L
    }
}

/**
 * Duennt die Beschleunigung auf die angeforderte Rate aus.
 *
 * Gemessen 07.10.2026: die Wake-up-Variante liefert ihre eigene Rate (118 bzw. 220 Hz statt der
 * angeforderten 25) — `samplingPeriodUs` ist laut Android nur ein Wunsch. Der Server baut die Achse
 * aus `t0_ms` + Anzahl je Block und nimmt gleichmaessige Abstaende an; also nehmen wir je Periode
 * genau einen Wert, nach dem Sensor-Zeitstempel. Toleranz 10 %, damit eine Uhr, die mit 24,8 Hz
 * liefert, nicht jeden zweiten Wert verliert.
 */
class AccelAusduenner(private val periodeNs: Long) {
    private var letzter = Long.MIN_VALUE

    fun nehmen(tNs: Long): Boolean {
        if (letzter == Long.MIN_VALUE || tNs - letzter >= periodeNs * 9 / 10) {
            letzter = tNs
            return true
        }
        return false
    }

    fun reset() { letzter = Long.MIN_VALUE }
}

/**
 * Health Services liefert Position (`LOCATION`) und Geschwindigkeit (`SPEED`) als zwei getrennte
 * Reihen. Der Server braucht je GPS-Punkt die Doppler-Geschwindigkeit (`v_mps`, s. data-format.md);
 * also bekommt jeder Punkt den zeitlich naechsten Tempo-Wert aus derselben Lieferung, wenn der
 * hoechstens [MAX_ABSTAND_MS] entfernt ist — sonst -1 („keine Geschwindigkeit", wie bisher bei
 * Uhren ohne Doppler).
 */
object HsOrtPaar {
    const val MAX_ABSTAND_MS = 1500L

    data class Ort(val bootMs: Long, val lat: Double, val lon: Double, val genauigkeitM: Double)
    data class Tempo(val bootMs: Long, val mps: Double)
    data class Punkt(val bootMs: Long, val lat: Double, val lon: Double, val mps: Double, val genauigkeitM: Double)

    fun paaren(orte: List<Ort>, tempi: List<Tempo>): List<Punkt> {
        val sortiert = tempi.sortedBy { it.bootMs }
        return orte.sortedBy { it.bootMs }.map { o ->
            val naechstes = sortiert.minByOrNull { kotlin.math.abs(it.bootMs - o.bootMs) }
            val mps = if (naechstes != null && kotlin.math.abs(naechstes.bootMs - o.bootMs) <= MAX_ABSTAND_MS)
                naechstes.mps else -1.0
            Punkt(o.bootMs, o.lat, o.lon, mps, o.genauigkeitM)
        }
    }
}
