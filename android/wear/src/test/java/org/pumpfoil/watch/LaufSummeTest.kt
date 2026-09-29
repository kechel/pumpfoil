package org.pumpfoil.watch

import org.junit.Assert.assertEquals
import org.junit.Test

/** Felder 22/23: Summe aller Laeufe — kein Doppelzaehlen an Lauf-Ende und bei Fortsetzung. */
class LaufSummeTest {
    private val eps = 1e-9

    @Test fun leer_ist_null() {
        val s = LaufSumme()
        assertEquals(0.0, s.distM(null, false), eps)
        assertEquals(0L, s.durMs(null, false))
    }

    @Test fun live_waechst_und_lauf_ende_zaehlt_nicht_doppelt() {
        val s = LaufSumme()
        assertEquals(120.0, s.distM(120.0, false), eps)       // erster Lauf live
        s.laufEnde(300.0, 60_000, fortsetzung = false)
        assertEquals(300.0, s.distM(null, false), eps)        // nach dem Ende genau einmal
        assertEquals(60_000L, s.durMs(null, false))
        assertEquals(350.0, s.distM(50.0, false), eps)        // zweiter Lauf live dazu
        assertEquals(70_000L, s.durMs(10_000, false))
        s.laufEnde(200.0, 40_000, fortsetzung = false)
        assertEquals(500.0, s.distM(null, false), eps)
        assertEquals(100_000L, s.durMs(null, false))
    }

    @Test fun fortsetzung_ersetzt_den_vorigen_teil() {
        val s = LaufSumme()
        s.laufEnde(100.0, 20_000, false)                      // Lauf A
        s.laufEnde(300.0, 60_000, false)                      // Lauf B (erster Teil)
        assertEquals(400.0, s.distM(null, false), eps)
        // B geht ohne Stopp weiter: live-Wert enthaelt B's ersten Teil schon (Start zurueckgesetzt).
        assertEquals(100.0 + 350.0, s.distM(350.0, fortsetzung = true), eps)
        assertEquals(20_000L + 70_000L, s.durMs(70_000, fortsetzung = true))
        s.laufEnde(500.0, 100_000, fortsetzung = true)        // ganzer Lauf B
        assertEquals(600.0, s.distM(null, false), eps)
        assertEquals(120_000L, s.durMs(null, false))
        // Fortsetzung der Fortsetzung
        s.laufEnde(650.0, 130_000, fortsetzung = true)
        assertEquals(750.0, s.distM(null, false), eps)
        assertEquals(150_000L, s.durMs(null, false))
        // danach ein neuer, eigener Lauf
        s.laufEnde(80.0, 15_000, false)
        assertEquals(830.0, s.distM(null, false), eps)
        assertEquals(165_000L, s.durMs(null, false))
    }

    @Test fun reset_bei_neuer_aufnahme() {
        val s = LaufSumme()
        s.laufEnde(300.0, 60_000, false)
        s.reset()
        assertEquals(0.0, s.distM(null, false), eps)
        s.laufEnde(40.0, 8_000, fortsetzung = true)           // darf nichts Altes abziehen
        assertEquals(40.0, s.distM(null, false), eps)
        assertEquals(8_000L, s.durMs(null, false))
    }
}
