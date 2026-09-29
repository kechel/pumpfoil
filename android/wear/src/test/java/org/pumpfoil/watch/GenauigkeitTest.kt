package org.pumpfoil.watch

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Platzhalter-Genauigkeit (OnePlus OPWWE251: immer 125,0 m) vs. echte Messung. */
class GenauigkeitTest {
    @Test fun konstanter_wert_gilt_nach_20_fixes_als_platzhalter() {
        val g = Genauigkeit()
        repeat(19) { g.sehen(125.0); assertTrue(g.zuUngenau(125.0)) }   // anfangs normal gegated
        g.sehen(125.0)
        assertTrue(g.platzhalter)
        assertFalse(g.zuUngenau(125.0))
    }

    @Test fun schwankende_messung_bleibt_gegated() {
        val g = Genauigkeit()
        repeat(30) { g.sehen(if (it % 2 == 0) 4.0 else 30.0) }
        assertFalse(g.platzhalter)
        assertTrue(g.zuUngenau(30.0))
        assertFalse(g.zuUngenau(4.0))
    }

    @Test fun einmal_bewegt_heisst_messung_fuer_die_ganze_aufnahme() {
        val g = Genauigkeit()
        repeat(25) { g.sehen(125.0) }
        g.sehen(80.0)                         // Uhr meldet ploetzlich ehrlich
        repeat(25) { g.sehen(125.0) }
        assertFalse(g.platzhalter)
        assertTrue(g.zuUngenau(125.0))
        g.reset()
        repeat(20) { g.sehen(125.0) }
        assertTrue(g.platzhalter)             // neue Aufnahme, neue Pruefung
    }
}
