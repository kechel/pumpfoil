package org.pumpfoil.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** GPS-Luecke am Lauf-Ende (12.11.2026): dieselben Faelle wie watch/test/laufluecke.test.mjs. */
class LaufLueckeTest {
    /** 1-Hz-Fixe: v(s) = Tempo, loch(s) = kein Fix. Gibt LaufLuecke nach Sekunde `bis` zurueck. */
    private fun spiele(bis: Int, v: (Int) -> Double, loch: (Int) -> Boolean, laeuft: (Int) -> Boolean = { true }): LaufLuecke {
        val l = LaufLuecke(); var lat = 47.5; var d = 0.0
        for (s in 0..bis) {
            lat += v(s) / 111320.0
            if (loch(s)) continue
            d += v(s)
            l.fix(s * 1000L, d, lat, 9.0, v(s), true, 150, laeuft(s))
        }
        return l
    }

    @Test fun sturz_luecke_schneidet_am_letzten_guten_fix() {
        val l = spiele(128, { if (it in 20..88) 3.2 else 0.3 }, { it in 89..124 })
        val sn = l.schnitt(128_000, 16_000)
        assertNotNull(sn); assertEquals(88_000L, sn!!.t)
        assertTrue(l.trennen)   // 36 s > 15 s: wie GAP_SPLIT_S am Server
    }

    @Test fun kurze_luecke_durchgefahren_nichts_geschnitten() {
        val l = spiele(130, { if (it in 20..140) 3.4 else 0.3 }, { it in 70..77 })
        assertNull(l.schnitt(130_000, 16_000))
    }

    @Test fun ausreisser_nach_der_luecke_verhindert_den_schnitt_nicht() {
        val nach = doubleArrayOf(3.8, 0.6, 2.54, 0.0)
        val l = spiele(133, { if (it in 20..119) 3.6 else if (it in 130..133) nach[it - 130] else 0.3 }, { it in 120..129 })
        assertEquals(119_000L, l.schnitt(133_000, 16_000)!!.t)
    }

    @Test fun luecke_laeuft_noch_beim_ende() {
        val l = spiele(88, { if (it in 20..88) 3.2 else 0.3 }, { false })
        assertEquals(88_000L, l.schnitt(95_000, 16_000)!!.t)
    }
}
