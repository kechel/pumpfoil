package org.pumpfoil.app

import org.json.JSONObject
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Funkprotokoll v1 gegen die Pakete der ECHTEN Uhr-App (watch-suunto/app/main.js in der
 * nachgebauten Firmware, mit Abbruch und Pause; erzeugt von watch-suunto/test/golden.mjs).
 */
class SuuntoProtokollTest {
    private val golden: JSONObject by lazy {
        JSONObject(javaClass.getResourceAsStream("/suunto/pakete.json")!!.bufferedReader().readText())
    }

    private fun pakete(): List<ByteArray> {
        val a = golden.getJSONArray("pakete")
        return (0 until a.length()).map { i ->
            val p = a.getJSONArray(i); ByteArray(p.length()) { p.getInt(it).toByte() }
        }
    }

    @Test fun allesWieDieReferenz() {
        val e = SuuntoEmpfang()
        val bloecke = ArrayList<SuuntoProtokoll.Block>()
        val gps = ArrayList<SuuntoProtokoll.Gps>()
        val ereig = ArrayList<SuuntoProtokoll.Ereignis>()
        for (p in pakete()) {
            e.paket(p)
            bloecke += e.abholenBloecke(); gps += e.abholenGps(); ereig += e.abholenEreignisse()
        }
        val soll = golden.getJSONObject("erwartet")
        val h = soll.getJSONObject("hallo")
        assertEquals(h.getInt("hz"), e.hallo!!.hz)
        assertEquals(h.getLong("uhrId"), e.hallo!!.uhrId)
        assertEquals(h.getLong("sitzung"), e.hallo!!.sitzung)
        assertEquals(soll.getJSONArray("position").getDouble(0), e.position!!.first, 1e-9)

        val sb = soll.getJSONArray("bloecke")
        assertEquals(sb.length(), bloecke.size)
        for (i in 0 until sb.length()) {
            val o = sb.getJSONObject(i); val w = o.getJSONArray("werte")
            assertEquals(o.getLong("nr"), bloecke[i].nr)
            assertEquals(o.getLong("t"), bloecke[i].t)
            assertArrayEquals(ShortArray(w.length()) { w.getInt(it).toShort() }, bloecke[i].werte)
        }
        val sg = soll.getJSONArray("gps")
        assertEquals(sg.length(), gps.size)
        for (i in 0 until sg.length()) {
            val o = sg.getJSONObject(i)
            assertEquals(o.getInt("sek"), gps[i].sek)
            assertEquals(o.getDouble("lat"), gps[i].lat, 1e-9)
            assertEquals(o.getDouble("speed"), gps[i].speed, 1e-9)
            assertEquals(o.getInt("hr"), gps[i].hr)
        }
        val se = soll.getJSONArray("ereignisse")
        assertEquals((0 until se.length()).map { se.getJSONObject(it).getInt("art") }, ereig.map { it.art })
    }

    @Test fun chunksDeckenAllesAbUndQuittierenNurGesichertes() {
        val e = SuuntoEmpfang()
        val s = SuuntoSammler(hz = 25)
        val chunks = ArrayList<JSONObject>()
        for (p in pakete()) {
            e.paket(p)
            chunks += s.nimm(e.abholenBloecke(), e.abholenGps())
            // nie mehr quittieren, als in Chunks steckt
            assertTrue(s.blockGesichert <= e.blockBis)
        }
        chunks += s.leeren()
        val soll = golden.getJSONObject("erwartet")
        val werte = chunks.filter { it.getString("kind") == "accel" }.sumOf { it.getInt("count") }
        assertEquals(soll.getJSONArray("bloecke").length() * 25, werte)
        val gpsZeilen = chunks.filter { it.getString("kind") == "gps" }.sumOf { it.getInt("count") }
        assertEquals(soll.getJSONArray("gps").length(), gpsZeilen)
        // ein Zaehler fuer beide Arten, lueckenlos
        assertEquals((0 until chunks.size).toList(), chunks.map { it.getInt("index") })
        // Accel-Chunks: t1 = t0 + count/hz
        for (c in chunks.filter { it.getString("kind") == "accel" })
            assertEquals(c.getLong("t0_ms") + c.getInt("count") * 40L, c.getLong("t1_ms"))
        val q = e.quittung(s.blockGesichert, s.gpsGesichert)
        assertEquals(0x81.toByte(), q[0]); assertEquals(7, q.size)
    }

    @Test fun neustartDesHandysSetztAnDerGesichertenStelleAuf() {
        // Handy stuerzt nach der Haelfte ab: neuer Empfaenger ab dem gesicherten Stand; die Uhr
        // schickt ab Quittung+1 erneut (hier: dieselben Pakete noch einmal ab dem Anfang).
        val alle = pakete()
        val e1 = SuuntoEmpfang(); val s1 = SuuntoSammler(hz = 25)
        for (p in alle.take(alle.size / 2)) { e1.paket(p); s1.nimm(e1.abholenBloecke(), e1.abholenGps()) }
        val e2 = SuuntoEmpfang(s1.blockGesichert, s1.gpsGesichert)
        val s2 = SuuntoSammler(s1.naechsterIndex, 25)
        val nachher = ArrayList<SuuntoProtokoll.Block>()
        for (p in alle) { e2.paket(p); nachher += e2.abholenBloecke(); s2.nimm(emptyList(), e2.abholenGps()) }
        assertTrue(nachher.isNotEmpty())
        assertEquals(s1.blockGesichert + 1, nachher.first().nr)
    }
}

/** Paket -> Dateien: der ganze Handy-Weg ohne Bluetooth, mit den Paketen der echten Uhr-App. */
class SuuntoAblageTest {
    private fun pakete(): List<ByteArray> {
        val g = JSONObject(javaClass.getResourceAsStream("/suunto/pakete.json")!!.bufferedReader().readText())
        val a = g.getJSONArray("pakete")
        return (0 until a.length()).map { i -> val p = a.getJSONArray(i); ByteArray(p.length()) { p.getInt(it).toByte() } }
    }

    @Test fun aufnahmeWirdKomplettAbgelegt() {
        val dir = java.nio.file.Files.createTempDirectory("suunto").toFile()
        var uhr = 1_000_000L
        val ab = SuuntoAblage(dir) { uhr }
        var pos: Pair<Double, Double>? = null
        for (p in pakete()) { uhr += 50; ab.paket(p).position?.let { pos = it } }
        assertTrue(pos != null)
        val s = dir.listFiles()!!.single()
        assertTrue(s.name.startsWith("suunto-"))
        val meta = JSONObject(java.io.File(s, "meta.json").readText())
        assertEquals(25, meta.getInt("accel_hz")); assertEquals(true, meta.getBoolean("accel_luecken"))
        val complete = JSONObject(java.io.File(s, "complete.json").readText())
        val chunks = s.listFiles()!!.filter { it.name.startsWith("chunk-") && it.name.endsWith(".json") }
        assertEquals(complete.getInt("total_chunks"), chunks.size)
        val accel = chunks.map { JSONObject(it.readText()) }.filter { it.getString("kind") == "accel" }.sumOf { it.getInt("count") }
        assertEquals(90 * 25, accel)
        assertEquals(2, complete.getJSONArray("pauses").length().coerceAtMost(2))
        assertTrue(s.listFiles()!!.none { it.name.endsWith(".tmp") })
        // Dieselben Dateien laedt der Server-Test hoch (server/tests/test_suunto_e2e.py): sie muessen
        // zum committeten Stand passen. Nach einer gewollten Aenderung: Datei aus build/ uebernehmen.
        val alle = JSONObject()
        for (f in s.listFiles()!!.sortedBy { it.name }) if (f.name != "zustand.json") alle.put(f.name, f.readText())
        val neu = alle.toString(1)
        java.io.File("build/suunto-e2e-dateien.json").writeText(neu)
        val fix = java.io.File("../../watch-suunto/test/fixtures/suunto-e2e-dateien.json")
        if (fix.exists()) assertEquals("suunto-e2e-dateien.json veraltet (build/ uebernehmen)", fix.readText(), neu)
        dir.deleteRecursively()
    }
}

class SuuntoKonfigTest {
    @Test fun nurWasDieUhrBrauchtAlsAsciiInTeilen() {
        val cfg = JSONObject().put("views", org.json.JSONArray("[[1,20,14]]")).put("pages", org.json.JSONArray("[[1,0,[]]]"))
            .put("alarmEnabled", true).put("language", "de")
            .put("foils", org.json.JSONArray().put(JSONObject().put("id", 7).put("label", "Gong Größe M").put("min", 10).put("max", 22).put("area", 1200)))
        val t = SuuntoKonfig.fuerUhr(cfg.toString())
        val o = JSONObject(t)
        assertTrue(!o.has("pages"))   // [1,0,[]] ohne Werte faellt weg
        assertEquals(0, o.getInt("spr"))
        assertEquals("Gong Größe M", o.getJSONArray("foils").getJSONObject(0).getString("label"))
        assertTrue(!o.getJSONArray("foils").getJSONObject(0).has("area"))
        assertTrue(t.all { it.code < 128 })
        val p = SuuntoKonfig.pakete(t)
        assertTrue(p.all { it.size <= 20 && it[0] == 0x83.toByte() && it[2].toInt() == p.size })
        assertEquals(t, p.joinToString("") { String(it, 3, it.size - 3, Charsets.US_ASCII) })
    }

    @Test fun freiesLayoutWirdAufSeineWerteReduziert() {
        // Werte bei y=120 (rechts, links), y=500, y=800; ein Label (typ 2) und eine Linie zaehlen nicht
        val seite = org.json.JSONArray("[1,0,[[1,700,120,5,0,0,20],[1,300,125,5,0,0,1],[2,300,200,2,0,0,1],[4,0,300,1,0,1000,300],[1,500,500,7,0,0,14],[1,500,800,3,0,0,12],[1,500,820,3,0,0,1]]]")
        val k = SuuntoKonfig.seiteKurz(seite)!!
        assertEquals("[2,1,20,14,12]", k.toString())
        val cfg = JSONObject().put("layoutsOn", true).put("pages", org.json.JSONArray().put(seite).put(org.json.JSONArray("[0,1,2,3]")))
        val o = JSONObject(SuuntoKonfig.fuerUhr(cfg.toString()))
        assertEquals("[[2,1,20,14,12],[0,1,2,3]]", o.getJSONArray("pages").toString())
        assertEquals(true, o.getBoolean("layoutsOn"))
    }
}
