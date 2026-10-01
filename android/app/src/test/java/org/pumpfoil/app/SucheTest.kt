package org.pumpfoil.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Dieselben Faelle wie server/tests/test_suche.py und der Web-Test (01.10.2026). */
class SucheTest {
    @Test fun suchform_wie_server() {
        assertEquals("frederic", suchform("Frédéric"))
        assertEquals("fone", suchform("F-One"))
        assertEquals("vivoactive6", suchform("vívoactive® 6"))
        assertEquals("lodz", suchform("Łódź"))
        assertEquals("strasse", suchform("Straße"))
        assertEquals("albysurcheran", suchform("Alby-sur-Chéran"))
    }

    @Test fun treffer_und_gegenprobe() {
        assertTrue(passtZu("vivo", "vívoactive® 6"))
        assertTrue(passtZu("fenix 7", "fēnix® 7X Pro"))
        assertTrue(passtZu("zurich", "Zürich"))
        assertTrue(passtZu("fone phantom", "F-One", "PHANTOM", "1480"))
        assertTrue(passtZu("xover", "Gong", "X-Over V3"))
        assertTrue(passtZu("mach2", "Naish Mach-2"))
        assertTrue(passtZu("", "egal"))
        assertFalse(passtZu("sirus xxl", "Gong", "SIRUS", "XL"))
    }
}
