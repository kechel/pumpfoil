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

    /** Nachrichten-Teile von der Uhr (`PF1|datei|nr|anzahl|rest|inhalt`): `|` im Inhalt bleibt erhalten. */
    @Test fun teileLesen() {
        val t = HuaweiBruecke.teilLesen("PF1|c_hw-x_000003.json|2|5|17|{\"a\":\"b|c\"")!!
        assertEquals("c_hw-x_000003.json", t.datei); assertEquals(2, t.nr); assertEquals(5, t.anzahl)
        assertEquals(17, t.rest)
        assertEquals("{\"a\":\"b|c\"", t.inhalt)
        assertNull(HuaweiBruecke.teilLesen("PF1|../x.json|0|1|1|{}"))
        assertNull(HuaweiBruecke.teilLesen("PF1|m_hw-x.json|1|1|1|{}"))      // Nummer ausserhalb
        assertNull(HuaweiBruecke.teilLesen("PF1|m_hw-x.json|0|0|1|{}"))
        assertNull(HuaweiBruecke.teilLesen("PF1|m_hw-x.json|0|1|0|{}"))      // rest mindestens 1
        assertNull(HuaweiBruecke.teilLesen("PF1|m_hw-x.json|0|1|{}"))        // altes Format ohne rest
        assertNull(HuaweiBruecke.teilLesen("XX1|m_hw-x.json|0|1|1|{}"))
        assertNull(HuaweiBruecke.teilLesen("PF1|m_hw-x.json|0|1|1|" + "x".repeat(1001)))
    }

    /** Balken Uhr -> Handy: zaehlt Dateien je Ladung, Teile fuellen anteilig, neue Ladung faengt bei 0 an. */
    @Test fun empfangFortschritt() {
        val e = HuaweiBruecke.Empfang()
        assertEquals(0, e.gesamt); assertEquals(0f, e.anteil())
        e.teil(0, 2, 3, dateiFertig = false, jetzt = 1)          // Datei 1 von 3, Teil 1 von 2
        assertEquals(0, e.fertig); assertEquals(3, e.gesamt); assertEquals(0.5f / 3, e.anteil(), 1e-6f)
        e.teil(1, 2, 3, dateiFertig = true, jetzt = 2)           // Datei 1 komplett
        assertEquals(1, e.fertig); assertEquals(3, e.gesamt)
        e.teil(1, 2, 3, dateiFertig = false, jetzt = 3)          // doppelt geschickter Teil: kein Rueckschritt im Zaehler
        assertEquals(1, e.fertig)
        e.teil(0, 1, 2, dateiFertig = true, jetzt = 4)
        e.teil(0, 1, 1, dateiFertig = true, jetzt = 5)           // letzte Datei
        assertEquals(3, e.fertig); assertEquals(3, e.gesamt); assertEquals(1f, e.anteil())
        e.teil(0, 1, 4, dateiFertig = false, jetzt = 6)          // naechste Ladung
        assertEquals(0, e.fertig); assertEquals(4, e.gesamt); assertEquals(6L, e.letzteMs)
    }
}
