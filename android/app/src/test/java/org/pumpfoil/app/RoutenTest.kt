package org.pumpfoil.app

import org.json.JSONArray
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Routen.kt muss fuer dieselben Startplaetze dieselben Routen liefern wie die PWA
 * (web/src/lib/routen.ts). Erwartung aus Node erzeugt (test/resources/routen/erwart.json),
 * Startplaetze echt: Illmensee und Zuerichsee (30 km Umkreis), Stand 16.10.2026.
 */
class RoutenTest {
    private fun lesen(name: String) = javaClass.classLoader!!.getResource("routen/$name")!!.readText()

    private fun positionen(name: String): List<Startposition> {
        val a = JSONArray(lesen(name))
        return (0 until a.length()).map { a.getJSONObject(it).let { o ->
            Startposition(o.getDouble("lat"), o.getDouble("lon"), o.getInt("starts"), o.getInt("sessions"))
        } }
    }

    @Test fun gleicheRoutenWieDiePwa() {
        val pos = mapOf("ill" to positionen("illpos.json"), "zh" to positionen("zhpos.json"))
        val faelle = JSONArray(lesen("erwart.json"))
        for (i in 0 until faelle.length()) {
            val f = faelle.getJSONObject(i)
            val aus = f.getJSONArray("aus").let { a -> (0 until a.length()).map { a.getInt(it) }.toSet() }
            val r = Routen.vorschlagen(pos.getValue(f.getString("n")), f.getInt("s"), f.getDouble("a"), f.getDouble("b"),
                RoutenOptionen(punkte = f.getInt("punkte"), ohneKreuzung = f.getBoolean("kr"), rundkurs = f.getBoolean("rund"),
                    ausgeschlossen = aus, ziel = if (f.isNull("ziel")) null else f.getInt("ziel")))
            assertEquals("Fall $i Anzahl", f.getInt("anzahl"), r.routen.size)
            val erste = f.getJSONArray("erste").let { a -> (0 until a.length()).map { a.getString(it) } }
            assertEquals("Fall $i Reihenfolge", erste, r.routen.take(5).map { it.schluessel })
            val meter = f.getJSONArray("meter").let { a -> (0 until a.length()).map { a.getInt(it) } }
            assertEquals("Fall $i Meter", meter, r.routen.take(5).map { Math.round(it.meter).toInt() })
        }
    }

    @Test fun platzNamen() {
        assertEquals(listOf("A", "Z", "AA", "AB"), listOf(0, 25, 26, 27).map { Routen.platzName(it) })
    }
}
