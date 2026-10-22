package org.pumpfoil.app

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

/** „Auswertung bewerten" (22.10.2026): dieselben Faelle, die Jan im Web durchgespielt hat. */
class BewertungTest {
    private fun j(s: String) = Json.parseToJsonElement(s).jsonObject

    @Test
    fun rundlaufAllerFelder() {
        val roh = j("""{"sterne":4,"laeufe":"fehlen","laeufe_echt":3,"pumps":"viel","tempo_ok":false,"probleme":true,"probleme_art":["gps","pause"]}""")
        val a = ausJson(roh)
        assertEquals(Antworten(4, "fehlen", 3, "viel", false, true, listOf("gps", "pause")), a)
        assertEquals(roh, zuJson(a))
    }

    @Test
    fun geleerteLaufzahlFaelltWeg() {
        val a = ausJson(j("""{"sterne":3,"laeufe_echt":6}""")).copy(laeufeEcht = null)
        assertFalse(zuJson(a).containsKey("laeufe_echt"))
    }

    @Test
    fun neinFuerFalseBleibtUndProblemArtNurBeiJa() {
        val a = Antworten(tempoOk = false, probleme = false, problemeArt = listOf("gps"))
        val o = zuJson(a)
        assertEquals("false", o["tempo_ok"].toString())
        assertEquals("false", o["probleme"].toString())
        assertFalse(o.containsKey("probleme_art"))
    }

    @Test
    fun leereAntwortenSindLeer() {
        assertEquals(j("{}"), zuJson(Antworten()))
        assertEquals(Antworten(), ausJson(null))
    }
}
