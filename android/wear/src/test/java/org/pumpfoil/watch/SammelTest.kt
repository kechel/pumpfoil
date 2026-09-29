package org.pumpfoil.watch

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Sammel-Upload (29.09.2026): Pakete schneiden und Indizes aus dem Dateinamen lesen. */
class SammelTest {
    @Test fun schneidetInPaketeOhneEtwasZuVerlieren() {
        val p = Sammel.pakete((0 until 45).toList(), 20)
        assertEquals(listOf(20, 20, 5), p.map { it.size })
        assertEquals((0 until 45).toList(), p.flatten())          // Reihenfolge bleibt
    }

    @Test fun leereListeGibtKeinePakete() {
        assertEquals(0, Sammel.pakete(emptyList<Int>(), 20).size)
    }

    @Test fun indexAusDemDateinamen() {
        assertEquals(123, LocalStore.chunkIndex("chunk-000123.json"))
        assertEquals(0, LocalStore.chunkIndex("chunk-000000.json"))
        assertNull(LocalStore.chunkIndex("meta.json"))
        assertNull(LocalStore.chunkIndex("session.json"))
    }
}
