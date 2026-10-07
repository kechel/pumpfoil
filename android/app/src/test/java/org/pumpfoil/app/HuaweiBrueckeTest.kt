package org.pumpfoil.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Dateinamen von der Huawei-Uhr: nur das erwartete Muster, nie ein Weg aus dem eigenen Ordner. */
class HuaweiBrueckeTest {
    @Test fun gueltigeNamen() {
        assertEquals("hw-abc-1" to "meta.json", HuaweiBruecke.zielName("m_hw-abc-1.json"))
        assertEquals("hw-abc-1" to "complete.json", HuaweiBruecke.zielName("e_hw-abc-1.json"))
        assertEquals("hw-abc-1" to "chunk-000042.json", HuaweiBruecke.zielName("c_hw-abc-1_000042.json"))
        // Wear Engine liefert teils den vollen Pfad der Uhr mit
        assertEquals("hw-x" to "meta.json", HuaweiBruecke.zielName("internal://app/m_hw-x.json"))
    }

    @Test fun boeseNamenAbgelehnt() {
        assertNull(HuaweiBruecke.zielName("m_../../evil.json"))
        assertNull(HuaweiBruecke.zielName("c_hw-x_..json"))
        assertNull(HuaweiBruecke.zielName("m_hw x.json"))
        assertNull(HuaweiBruecke.zielName("plan.json"))
        assertNull(HuaweiBruecke.zielName("e_hw-x.json.exe"))
        assertNull(HuaweiBruecke.zielName("c_hw-x_1234567.json"))
    }
}
