package org.pumpfoil.app

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

/**
 * ENDE-ZU-ENDE, Teil Handy (Jan, 08.10.2026: „wir testen vorher was wir koennen"). Die Nachrichten,
 * die im Test der Uhr (watch-huawei/test/e2e-uebertragung.test.mjs, der ECHTE recorder.js) beim Handy
 * ankamen — samt Doppelten nach Sendefehlern —, laufen durch genau den Code der Bruecke:
 * teilLesen -> teilSpeichern -> ablegenIn -> uploadVon. Am Ende muessen dieselben Dateien dastehen,
 * die die Uhr schrieb, und der Upload muss jeden Chunk genau einmal enthalten, GPS zuerst.
 * Teil Server: server/tests/test_huawei_e2e.py.
 */
class HuaweiBrueckeE2ETest {
    @get:Rule val tmp = TemporaryFolder()

    // Gradle startet Unit-Tests im Modulordner (android/app).
    private val fixtures = File("../../watch-huawei/test/fixtures")

    @Test fun nachrichtenDerUhrErgebenDieselbenDateienUndEinenVollstaendigenUpload() {
        val nachrichten = File(fixtures, "huawei-e2e-nachrichten.txt").readLines().filter { it.isNotEmpty() }
        val soll = JSONObject(File(fixtures, "huawei-e2e-dateien.json").readText())
        val teile = tmp.newFolder("huawei-teile")
        val wurzel = tmp.newFolder("huawei-sessions")

        var fertigeSessions = 0
        var abgelegt = 0
        for (n in nachrichten) {
            val t = HuaweiBruecke.teilLesen(n)
            assertTrue("Teil abgelehnt: ${n.take(60)}", t != null)
            val ganz = HuaweiBruecke.teilSpeichern(teile, t!!) ?: continue
            if (t.datei == HuaweiBruecke.HALLO) continue
            abgelegt++
            if (HuaweiBruecke.ablegenIn(wurzel, t.datei, ganz)) fertigeSessions++
        }
        assertTrue("doppelte Teile in den Testdaten", nachrichten.size > nachrichten.toSet().size)

        val sessions = wurzel.listFiles()!!.filter { it.isDirectory }
        assertEquals(1, sessions.size)
        assertTrue("complete.json kam an", fertigeSessions >= 1)
        val dir = sessions[0]

        // Jede Datei der Uhr steht inhaltsgleich in der Ablage (Text kann sich durch \\uXXXX unterscheiden).
        for (name in soll.keys()) {
            val (id, ziel) = HuaweiBruecke.zielName(name)!!
            assertEquals(dir.name, id)
            val ist = JSONObject(File(dir, ziel).readText())
            assertTrue("$name inhaltsgleich", jsonGleich(JSONObject(soll.getString(name)), ist))
        }
        assertEquals("keine Datei zu viel", soll.length(), dir.listFiles()!!.size)

        // Upload: jeder Index genau einmal, GPS vor Accel, expected_chunks stimmt.
        val up = HuaweiBruecke.uploadVon(dir)
        val reihe = HuaweiBruecke.uploadReihenfolge(up.chunks, emptySet())
        val idx = reihe.map { it.getInt("index") }
        assertEquals((0 until up.chunks.size).toList(), idx.sorted())
        assertEquals(up.chunks.size, up.meta.getInt("expected_chunks"))
        val erstesAccel = reihe.indexOfFirst { it.getString("kind") == "accel" }
        assertTrue("GPS zuerst", reihe.take(erstesAccel).all { it.getString("kind") == "gps" } &&
            reihe.drop(erstesAccel).all { it.getString("kind") == "accel" })
        assertEquals(up.chunks.size, up.complete.getInt("total_chunks"))
        // Abgebrochener Upload: was der Server schon hat, geht nicht noch einmal raus.
        assertEquals(up.chunks.size - 3, HuaweiBruecke.uploadReihenfolge(up.chunks, setOf(0, 1, 2)).size)
    }

    private fun jsonGleich(a: Any?, b: Any?): Boolean = when {
        a is JSONObject && b is JSONObject -> a.length() == b.length() && a.keys().asSequence().all { jsonGleich(a.get(it), b.opt(it)) }
        a is org.json.JSONArray && b is org.json.JSONArray -> a.length() == b.length() && (0 until a.length()).all { jsonGleich(a.get(it), b.get(it)) }
        a is Number && b is Number -> a.toDouble() == b.toDouble()
        else -> a == b
    }
}
