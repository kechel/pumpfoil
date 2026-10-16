package org.pumpfoil.app

import org.osmdroid.util.GeoPoint

/*
 * GPS-Luecke innerhalb eines Laufs als weiche Kurve zeichnen — wie web/src/lib/kurve.ts (Jan,
 * 16.10.2026: „wenn es schon als ein Lauf erkannt wurde, dann sollte der gps-track auch durchgehend
 * gezeichnet werden"). Amazfit setzt mitten im Lauf 7-14 s aus. Catmull-Rom durch die Nachbarpunkte,
 * gerechnet direkt in Grad (auf einigen Dutzend Metern bedeutungslos verzerrt).
 */
object Kurve {
    /** Ab diesem Abstand (m) Kurve statt Gerade — normale 1-Hz-Schritte sind 3-8 m. */
    const val AB_M = 12.0

    /** Linienzug fuer Abschnitt i -> i+1 eines Laufs; `pts` sind (lon, lat), Nachbarn nur aus [lo, hi]. */
    fun abschnitt(pts: List<Pair<Double, Double>>, i: Int, lo: Int, hi: Int): List<GeoPoint> {
        val a = pts[i]; val b = pts[i + 1]
        val pa = GeoPoint(a.second, a.first); val pb = GeoPoint(b.second, b.first)
        if (pa.distanceToAsDouble(pb) < AB_M) return listOf(pa, pb)
        val v = if (i - 1 >= lo) pts[i - 1] else a
        val n = if (i + 2 <= hi) pts[i + 2] else b
        val schritte = 12
        return (0..schritte).map { k ->
            val t = k.toDouble() / schritte; val t2 = t * t; val t3 = t2 * t
            fun f(p0: Double, p1: Double, p2: Double, p3: Double) =
                0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
            GeoPoint(f(v.second, a.second, b.second, n.second), f(v.first, a.first, b.first, n.first))
        }
    }
}
