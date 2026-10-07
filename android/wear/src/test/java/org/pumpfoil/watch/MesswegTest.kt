package org.pumpfoil.watch

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Messweg nach Doku (Wear 1.2.40): Zeit aus Zeitstempeln, Ausduennen, Paaren von Ort und Tempo. */
class MesswegTest {
    private val s = 1_000_000_000L   // 1 s in ns

    @Test fun alterAusZeitstempeln() {
        assertEquals(1500L, MessZeit.alterMs(100 * s, 100 * s - 1_500_000_000L))
        assertEquals(0L, MessZeit.alterMs(100 * s, 100 * s))
        // Health Services buendelt bis ~150 s — das ist noch ein gueltiges Alter.
        assertEquals(150_000L, MessZeit.alterMs(1000 * s, 850 * s))
    }

    @Test fun unplausibleZeitIstUnbekannt() {
        assertEquals(-1L, MessZeit.alterMs(100 * s, 101 * s))          // aus der Zukunft
        assertEquals(-1L, MessZeit.alterMs(10_000 * s, 100 * s))       // anderer Zeitbezug
    }

    @Test fun ausduennenAufDieAngeforderteRate() {
        // Wake-up-Sensor liefert 200 Hz, angefordert sind 25 Hz -> 25 Werte je Sekunde.
        val a = AccelAusduenner(40_000_000L)
        var genommen = 0
        for (i in 0 until 200) if (a.nehmen(i * 5_000_000L)) genommen++
        assertEquals(25, genommen)
    }

    @Test fun etwasLangsamerAlsAngefordertVerliertNichts() {
        // 24,8 Hz bei 25 angefordert: jeder Wert bleibt (Toleranz 10 %).
        val a = AccelAusduenner(40_000_000L)
        val periode = (1e9 / 24.8).toLong()
        var genommen = 0
        for (i in 0 until 100) if (a.nehmen(i * periode)) genommen++
        assertEquals(100, genommen)
    }

    @Test fun nachResetZaehltDerNaechsteWert() {
        val a = AccelAusduenner(40_000_000L)
        assertTrue(a.nehmen(0)); assertFalse(a.nehmen(10_000_000L))
        a.reset(); assertTrue(a.nehmen(10_000_000L))
    }

    @Test fun ortUndTempoPaaren() {
        val orte = listOf(HsOrtPaar.Ort(2000, 47.0, 9.0, 4.0), HsOrtPaar.Ort(1000, 47.1, 9.1, 5.0))
        val tempi = listOf(HsOrtPaar.Tempo(1100, 3.5), HsOrtPaar.Tempo(2050, 4.2))
        val p = HsOrtPaar.paaren(orte, tempi)
        assertEquals(listOf(1000L, 2000L), p.map { it.bootMs })      // nach Zeit sortiert
        assertEquals(3.5, p[0].mps, 1e-9)
        assertEquals(4.2, p[1].mps, 1e-9)
        assertEquals(5.0, p[0].genauigkeitM, 1e-9)
    }

    @Test fun ohnePassendesTempoKeineGeschwindigkeit() {
        val p = HsOrtPaar.paaren(listOf(HsOrtPaar.Ort(1000, 47.0, 9.0, 4.0)), listOf(HsOrtPaar.Tempo(5000, 3.0)))
        assertEquals(-1.0, p[0].mps, 1e-9)
        assertEquals(-1.0, HsOrtPaar.paaren(listOf(HsOrtPaar.Ort(1000, 47.0, 9.0, 4.0)), emptyList())[0].mps, 1e-9)
    }
}
