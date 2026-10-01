package org.pumpfoil.watch

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** GPS-Zeitstempel = Messzeit, nicht Zustellzeit (SM-L715F, #8529: 709 Punkte in 6 s). */
class GpsZeitTest {
    /** Laesst eine Folge von (Zustellzeit, Alter) durch `stempel` laufen wie `addGps`. */
    private fun lauf(fixes: List<Pair<Int, Long>>): List<Int> {
        var letzte = -1
        return fixes.map { (jetzt, alter) -> GpsZeit.stempel(jetzt, alter, letzte).also { letzte = it } }
    }

    @Test fun frische_fixes_bleiben_praktisch_unveraendert() {
        val t = lauf((1..60).map { it * 1000 to 300L })
        assertEquals((1..60).map { it * 1000 - 300 }, t)
    }

    @Test fun gebuendelt_nachgereichte_fixes_bekommen_ihre_messzeit() {
        // 10 s normal, dann haelt die Uhr 600 s zurueck und liefert alles binnen 6 s.
        val normal = (1..10).map { it * 1000 to 0L }
        val buendel = (0 until 600).map { i -> (616_000 + i * 10) to (616_000L + i * 10 - (11_000 + i * 1000)) }
        val t = lauf(normal + buendel)
        val nachgereicht = t.drop(10)
        assertEquals(11_000, nachgereicht.first())
        assertEquals(11_000 + 599_000, nachgereicht.last())
        // Abstand wieder 1 s statt 10 ms — die Laeufe haben ihre echte Dauer.
        assertTrue(nachgereicht.zipWithNext().all { (a, b) -> b - a == 1000 })
    }

    @Test fun eingefrorene_ortung_bleibt_bei_der_zustellzeit() {
        // Dasselbe Fix von t=5 s wird ab 10 s jede Sekunde neu geliefert, sein Alter waechst.
        val t = lauf(listOf(4000 to 0L, 5000 to 0L) + (10..20).map { (it * 1000) to (it * 1000L - 5000) })
        assertEquals(listOf(4000, 5000), t.take(2))
        assertEquals((10..20).map { it * 1000 }, t.drop(2))
    }

    @Test fun ueber_die_pause_hinweg_zustellzeit() {
        // Aktive Zeit steht in der Pause still; ein vor der Pause gemessenes Fix kommt danach mit
        // grossem (Wanduhr-)Alter an und faellt vor den letzten Punkt -> Zustellzeit.
        val t = lauf(listOf(30_000 to 0L, 31_000 to 0L, 31_500 to 120_000L, 32_500 to 0L))
        assertEquals(listOf(30_000, 31_000, 31_500, 32_500), t)
    }

    @Test fun immer_streng_steigend_auch_bei_unsinn() {
        val t = lauf(listOf(1000 to 0L, 1000 to 0L, 1000 to -5L, 900 to 0L, 2000 to 99_999L, 2000 to 0L))
        assertTrue(t.zipWithNext().all { (a, b) -> b > a })
    }

    @Test fun alter_groesser_als_aufnahme_faellt_zurueck() {
        // lastKnownLocation von vor einer Stunde direkt nach dem Start.
        assertEquals(500, GpsZeit.stempel(500, 3_600_000L, -1))
    }
}
