package org.pumpfoil.app

import org.json.JSONArray
import org.json.JSONObject
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.TreeMap
import java.util.UUID
import java.io.File

/**
 * Funkprotokoll v1 der Suunto-App, Handy-Seite (docs/SUUNTO.md „Funkprotokoll"). Rein, ohne
 * Android — in Unit-Tests gegen die Pakete der echten Uhr-App geprueft
 * (src/test/resources/suunto/pakete.json, erzeugt von watch-suunto/test/golden.mjs).
 *
 * Referenz ist watch-suunto/test/empfaenger.mjs; wer hier etwas aendert, aendert es dort mit.
 */
object SuuntoProtokoll {
    val SERVICE: UUID = UUID.fromString("0022c44b-105d-4fba-842c-f2c3c143eb6b")
    val SCHREIBEN: UUID = UUID.fromString("0022c44c-105d-4fba-842c-f2c3c143eb6b")
    val NOTIFY: UUID = UUID.fromString("0022c44d-105d-4fba-842c-f2c3c143eb6b")
    /** int16 je 1 g, wie alle Uhren (docs/data-format.md). */
    const val ACCEL_SCALE = 2048

    data class Hallo(val ver: Int, val hz: Int, val display: Char, val appVer: Int, val uhrId: Long,
                     val sitzung: Long, val laeuft: Boolean, val pause: Boolean, val einheit: Int)
    class Block(val nr: Long, val t: Long, val werte: ShortArray)
    data class Gps(val nr: Long, val sek: Int, val lat: Double, val lon: Double, val speed: Double,
                   val hr: Int, val acc: Int?, val alt: Int)
    data class Ereignis(val nr: Int, val art: Int, val t: Long, val sek: Int)

    const val START = 1; const val PAUSE = 2; const val WEITER = 3; const val ENDE = 4; const val VERWORFEN = 5
}

/**
 * Setzt die Pakete einer Aufnahme zusammen. Die Uhr sendet streng aufsteigend ab der letzten
 * Quittung + 1; was hinter einem schon vollstaendigen spaeteren Eintrag fehlt, kommt nie mehr
 * (Ringpuffer der Uhr uebergelaufen) und gilt als verloren — die Luecke steht dann in den
 * Blocknummern und Zeiten.
 *
 * `abholen*` liefert Neues in Reihenfolge genau einmal. Quittiert wird nur, was der Aufrufer als
 * gesichert meldet (in einem geschriebenen Chunk), damit ein Absturz des Handys nichts verliert:
 * die Uhr haelt es bis dahin vor.
 */
class SuuntoEmpfang(startBlock: Long = -1, startGps: Long = -1) {
    var hallo: SuuntoProtokoll.Hallo? = null; private set
    var position: Pair<Double, Double>? = null
    private class Teil(val nr: Long, val n: Int) { var t = 0L; val daten = ByteArray(n * 6); val hat = HashSet<Int>() }
    private val teile = TreeMap<Long, Teil>()
    private val gps = TreeMap<Long, SuuntoProtokoll.Gps>()
    private val ereignisse = LinkedHashMap<Int, SuuntoProtokoll.Ereignis>()
    /** Accel/GPS: alles bis hier ist vollstaendig oder aufgegeben, und abgeholt. */
    var blockBis = startBlock; private set
    var gpsBis = startGps; private set
    var ereigBis = -1; private set
    private val fertigeBloecke = ArrayList<SuuntoProtokoll.Block>()
    private val fertigeGps = ArrayList<SuuntoProtokoll.Gps>()
    private val neueEreignisse = ArrayList<SuuntoProtokoll.Ereignis>()
    var pakete = 0; private set

    private fun teileZahl(n: Int) = 1 + maxOf(0, (n * 6 - 12 + 17) / 18)
    private fun Teil.voll() = hat.size >= teileZahl(n)

    fun paket(p: ByteArray) {
        if (p.isEmpty()) return
        pakete++
        val b = ByteBuffer.wrap(p).order(ByteOrder.LITTLE_ENDIAN)
        fun u8(i: Int) = p[i].toInt() and 255
        fun u16(i: Int) = b.getShort(i).toInt() and 0xFFFF
        fun u32(i: Int) = b.getInt(i).toLong() and 0xFFFFFFFFL
        when (u8(0) and 15) {
            1 -> if (p.size >= 16) hallo = SuuntoProtokoll.Hallo(u8(1), u8(2), u8(3).toChar(), u16(4), u32(6), u32(10),
                u8(14) and 1 != 0, u8(14) and 2 != 0, u8(15))
            2 -> if (p.size >= 8) {
                val nr = voll(u16(1), blockBis)
                if (nr > blockBis) {
                    val n = u8(7).coerceIn(0, 25)
                    val t = teile.getOrPut(nr) { Teil(nr, n) }
                    t.t = u32(3)
                    kopiere(p, 8, t.daten, 0)
                    t.hat.add(0)
                }
            }
            3 -> if (p.size >= 2) {
                val teil = u8(0) shr 4
                val lo = u8(1)
                // juengster offener Block mit diesem unteren Byte
                val t = teile.descendingMap().values.firstOrNull { (it.nr and 255L).toInt() == lo && !it.voll() }
                if (t != null && teil >= 1) { kopiere(p, 2, t.daten, 12 + (teil - 1) * 18); t.hat.add(teil) }
            }
            4 -> if (p.size >= 19) {
                val nr = voll(u16(17), gpsBis)
                val sp = u16(11)
                if (nr > gpsBis) gps[nr] = SuuntoProtokoll.Gps(nr, u16(1), b.getInt(3) / 1e7, b.getInt(7) / 1e7,
                    if (sp == 0xFFFF) -1.0 else sp / 100.0, u8(13), if (u8(14) == 255) null else u8(14), b.getShort(15).toInt())
            }
            5 -> if (p.size >= 9) {
                val nr = u8(1)
                val d = (nr - ereigBis) and 255   // umlaufend: nur Nummern NACH dem letzten abgeholten
                if (ereigBis < 0 || d in 1..127) ereignisse[nr] = SuuntoProtokoll.Ereignis(nr, u8(2), u32(3), u16(7))
            }
            6 -> if (p.size >= 9) position = b.getInt(1) / 1e7 to b.getInt(5) / 1e7
        }
        nachziehen()
    }

    private fun kopiere(p: ByteArray, von: Int, ziel: ByteArray, ab: Int) {
        val n = minOf(p.size - von, ziel.size - ab)
        if (n > 0 && ab >= 0) System.arraycopy(p, von, ziel, ab, n)
    }

    /** u16 -> voller Zaehler, aufsteigend ab `bis` + 1 (Abstand hoechstens 32768). */
    private fun voll(u: Int, bis: Long): Long {
        val ref = bis + 1
        var v = ref - ((ref - u) and 0xFFFF)
        if (ref - v > 0x8000) v += 0x10000
        return v
    }

    private fun nachziehen() {
        while (true) {
            val n = blockBis + 1
            val t = teile[n]
            if (t != null && t.voll()) {
                val w = ShortArray(t.n * 3)
                ByteBuffer.wrap(t.daten).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer().get(w)
                fertigeBloecke.add(SuuntoProtokoll.Block(n, t.t, w)); teile.remove(n); blockBis = n; continue
            }
            if (t == null && teile.tailMap(n, false).values.any { it.voll() }) { blockBis = n; continue }
            break
        }
        while (true) {
            val n = gpsBis + 1
            val g = gps.remove(n)
            if (g != null) { fertigeGps.add(g); gpsBis = n; continue }
            if (gps.ceilingKey(n) != null) { gpsBis = n; continue }
            break
        }
        while (true) {
            val e = ereignisse.remove((ereigBis + 1) and 255) ?: break
            neueEreignisse.add(e); ereigBis = e.nr
        }
    }

    fun abholenBloecke(): List<SuuntoProtokoll.Block> = ArrayList(fertigeBloecke).also { fertigeBloecke.clear() }
    fun abholenGps(): List<SuuntoProtokoll.Gps> = ArrayList(fertigeGps).also { fertigeGps.clear() }
    fun abholenEreignisse(): List<SuuntoProtokoll.Ereignis> = ArrayList(neueEreignisse).also { neueEreignisse.clear() }

    /** QUITTUNG fuer die Uhr: nur bis zu dem, was gesichert ist (-1 = noch nichts). */
    fun quittung(blockGesichert: Long, gpsGesichert: Long): ByteArray {
        val f = (if (blockGesichert >= 0) 1 else 0) or (if (gpsGesichert >= 0) 2 else 0) or (if (ereigBis >= 0) 4 else 0)
        val b = (blockGesichert and 0xFFFF).toInt(); val s = (gpsGesichert and 0xFFFF).toInt()
        return byteArrayOf(0x81.toByte(), b.toByte(), (b shr 8).toByte(), s.toByte(), (s shr 8).toByte(),
            ereigBis.toByte(), f.toByte())
    }
}

/**
 * Baut aus Bloecken und GPS-Sekunden Upload-Chunks (docs/data-format.md): GPS als JSON-Zeilen
 * `[t_ms, lat, lon, speed, hr, h_acc]`, Accel als int16-b64 mit `t0_ms` und `t1_ms` (die Uhr kann
 * Luecken haben -> `accel_luecken: true` in der Meta). EIN Index-Zaehler fuer beide Arten
 * (Resume am Server liest nur die Indizes).
 */
class SuuntoSammler(var naechsterIndex: Int = 0, val hz: Int = 25) {
    private val gpsZeilen = ArrayList<SuuntoProtokoll.Gps>()
    private val bloecke = ArrayList<SuuntoProtokoll.Block>()
    /** Bis hier steckt alles in geschriebenen Chunks (fuer die Quittung). */
    var blockGesichert = -1L
    var gpsGesichert = -1L
    var hrWerte = 0; private set

    /** Fertige Chunks (JSON), die der Aufrufer schreiben soll — in dieser Reihenfolge. */
    fun nimm(bl: List<SuuntoProtokoll.Block>, gp: List<SuuntoProtokoll.Gps>): List<JSONObject> {
        val aus = ArrayList<JSONObject>()
        for (b in bl) {
            val letzter = bloecke.lastOrNull()
            val passt = letzter != null && b.nr == letzter.nr + 1 &&
                b.t == letzter.t + letzter.werte.size / 3 * 1000L / hz
            if (letzter != null && (!passt || bloecke.size >= BLOECKE_JE_CHUNK)) aus.add(accelChunk())
            bloecke.add(b)
        }
        for (g in gp) {
            if (g.lat == 0.0 && g.lon == 0.0) { gpsGesichert = maxOf(gpsGesichert, g.nr); continue }  // ohne Fix
            gpsZeilen.add(g)
            if (gpsZeilen.size >= GPS_JE_CHUNK) aus.add(gpsChunk())
        }
        return aus
    }

    /** Alles Angefangene abschliessen (Pause, Ende). */
    fun leeren(): List<JSONObject> {
        val aus = ArrayList<JSONObject>()
        if (bloecke.isNotEmpty()) aus.add(accelChunk())
        if (gpsZeilen.isNotEmpty()) aus.add(gpsChunk())
        return aus
    }

    private fun accelChunk(): JSONObject {
        val n = bloecke.sumOf { it.werte.size }
        val buf = ByteBuffer.allocate(n * 2).order(ByteOrder.LITTLE_ENDIAN)
        for (b in bloecke) for (v in b.werte) buf.putShort(v)
        val erst = bloecke.first(); val letzt = bloecke.last()
        val o = JSONObject().put("index", naechsterIndex++).put("kind", "accel").put("encoding", "int16-b64")
            .put("t0_ms", erst.t).put("t1_ms", letzt.t + letzt.werte.size / 3 * 1000L / hz)
            .put("count", n / 3)
            .put("data", java.util.Base64.getEncoder().encodeToString(buf.array()))
        blockGesichert = letzt.nr
        bloecke.clear()
        return o
    }

    private fun gpsChunk(): JSONObject {
        val zeilen = JSONArray()
        for (g in gpsZeilen) {
            zeilen.put(JSONArray().put(g.sek * 1000L).put(g.lat).put(g.lon).put(g.speed)
                .put(if (g.hr > 0) g.hr else JSONObject.NULL).put(g.acc ?: JSONObject.NULL))
            if (g.hr > 0) hrWerte++
        }
        val o = JSONObject().put("index", naechsterIndex++).put("kind", "gps").put("encoding", "json")
            .put("t0_ms", gpsZeilen.first().sek * 1000L).put("count", gpsZeilen.size).put("data", zeilen)
        gpsGesichert = maxOf(gpsGesichert, gpsZeilen.last().nr)
        gpsZeilen.clear()
        return o
    }

    companion object {
        /** 10 Bloecke = 10 s bei 25 Hz, 5 s bei 50 Hz — die Uhr haelt bis zur Quittung ~80 Bloecke vor. */
        const val BLOECKE_JE_CHUNK = 10
        /** 30 s GPS — die Uhr haelt 150 Sekunden vor. */
        const val GPS_JE_CHUNK = 30
    }
}

/**
 * Ablage der Suunto-Aufnahmen auf dem Handy (eigener Ordner, wie bei der Huawei-Bruecke): je
 * Aufnahme ein Ordner `suunto-<uhr>-<start>` mit meta.json, chunk-N.json und zustand.json, am
 * Ende complete.json — dasselbe Format, das der Upload der Huawei-Bruecke kennt.
 *
 * Rein (nur java.io + org.json), damit der ganze Weg Paket -> Datei im Unit-Test laeuft.
 * `jetzt` ist die Wanduhr des Handys (Pausendauer: die Uhr zaehlt nur aktive Zeit).
 *
 * Abschluss einer Aufnahme: Ereignis ENDE; oder die Uhr meldet sich mit einer anderen Sitzung
 * (App neu gestartet, Ende ging verloren — nach `onExerciseEnd` entlaedt die Firmware die App
 * sofort); oder `pruefen()` findet sie 10 min pausiert bzw. 30 min stumm.
 */
class SuuntoAblage(val wurzel: File, private val jetzt: () -> Long = { System.currentTimeMillis() }) {
    class Laufend(val uhrId: Long, val sitzung: Long, val dir: File, val empfang: SuuntoEmpfang,
                  val sammler: SuuntoSammler, val hz: Int) {
        val pausen = JSONArray()
        var pauseSeit = 0L          // Wanduhr, 0 = keine Pause
        var pauseT = 0L             // aktive ms beim Pausieren
        var letztT = 0L             // letzte aktive ms (Block oder GPS)
        var letztPaket = 0L
        var verloren = 0L           // Accel-Bloecke, die nie ankamen (Uhr ausser Reichweite)
        var naechsterBlock = 0L
    }
    data class Antwort(val quittung: ByteArray?, val position: Pair<Double, Double>?, val uhrId: Long,
                       val geaendert: Boolean)

    var aktuell: Laufend? = null; private set
    private var hallo: SuuntoProtokoll.Hallo? = null
    private var vorab = SuuntoEmpfang()      // vor dem Start (nur HALLO/Position)

    fun uuid(uhrId: Long, sitzung: Long) = "suunto-" + java.lang.Long.toHexString(uhrId) + "-" + sitzung

    fun paket(p: ByteArray): Antwort {
        if (p.isEmpty()) return Antwort(null, null, 0, false)
        val typ = p[0].toInt() and 15
        var pos: Pair<Double, Double>? = null
        var geaendert = false
        if (typ == 1) {
            vorab = SuuntoEmpfang(); vorab.paket(p)
            val h = vorab.hallo ?: return Antwort(null, null, 0, false)
            hallo = h
            val a = aktuell
            if (a != null && (a.uhrId != h.uhrId || a.sitzung != h.sitzung)) { abschliessen(a); geaendert = true }
            if (h.sitzung != 0L && (aktuell == null)) { aktuell = oeffnen(h); geaendert = true }
            val l = aktuell
            return Antwort(l?.let { it.empfang.quittung(it.sammler.blockGesichert, it.sammler.gpsGesichert) }, null,
                h.uhrId, geaendert)
        }
        if (typ == 6) { vorab.paket(p); pos = vorab.position; vorab.position = null }
        val a = aktuell ?: return Antwort(null, pos, hallo?.uhrId ?: 0, false)
        a.letztPaket = jetzt()
        a.empfang.paket(p)
        val chunks = ArrayList<JSONObject>()
        val bl = a.empfang.abholenBloecke()
        for (b in bl) {
            if (b.nr > a.naechsterBlock) a.verloren += b.nr - a.naechsterBlock
            a.naechsterBlock = b.nr + 1
            a.letztT = maxOf(a.letztT, b.t + b.werte.size / 3 * 1000L / a.hz)
        }
        val gp = a.empfang.abholenGps()
        for (g in gp) a.letztT = maxOf(a.letztT, g.sek * 1000L)
        chunks += a.sammler.nimm(bl, gp)
        var ende = false
        for (e in a.empfang.abholenEreignisse()) {
            geaendert = true
            when (e.art) {
                SuuntoProtokoll.PAUSE -> { chunks += a.sammler.leeren(); a.pauseSeit = jetzt(); a.pauseT = e.t }
                SuuntoProtokoll.WEITER -> {
                    if (a.pauseSeit > 0) a.pausen.put(JSONArray().put(a.pauseT).put(jetzt() - a.pauseSeit))
                    a.pauseSeit = 0
                }
                SuuntoProtokoll.ENDE -> { chunks += a.sammler.leeren(); ende = true }
                SuuntoProtokoll.VERWORFEN -> { a.dir.deleteRecursively(); aktuell = null
                    return Antwort(a.empfang.quittung(a.sammler.blockGesichert, a.sammler.gpsGesichert), pos, a.uhrId, true) }
            }
        }
        for (c in chunks) schreibe(File(a.dir, "chunk-%06d.json".format(c.getInt("index"))), c.toString())
        if (chunks.isNotEmpty() || geaendert) zustandSpeichern(a)
        val q = a.empfang.quittung(a.sammler.blockGesichert, a.sammler.gpsGesichert)
        if (ende) { abschliessen(a); geaendert = true }
        return Antwort(q, pos, a.uhrId, geaendert || chunks.isNotEmpty())
    }

    /** Regelmaessig aufrufen: haengende Aufnahmen abschliessen. */
    fun pruefen(): Boolean {
        val a = aktuell ?: return false
        val still = jetzt() - maxOf(a.letztPaket, a.pauseSeit)
        if ((a.pauseSeit > 0 && still > 10 * 60_000L) || still > 30 * 60_000L) { abschliessen(a); return true }
        return false
    }

    private fun oeffnen(h: SuuntoProtokoll.Hallo): Laufend {
        val dir = File(wurzel, uuid(h.uhrId, h.sitzung))
        val z = File(dir, "zustand.json").takeIf { it.exists() }?.let { JSONObject(it.readText()) }
        if (z != null && !File(dir, "complete.json").exists()) {
            val l = Laufend(h.uhrId, h.sitzung, dir, SuuntoEmpfang(z.optLong("block", -1), z.optLong("gps", -1)),
                SuuntoSammler(z.optInt("index", 0), z.optInt("hz", h.hz)).also {
                    it.blockGesichert = z.optLong("block", -1); it.gpsGesichert = z.optLong("gps", -1)
                }, z.optInt("hz", h.hz))
            z.optJSONArray("pausen")?.let { for (i in 0 until it.length()) l.pausen.put(it.get(i)) }
            l.pauseSeit = z.optLong("pauseSeit", 0); l.pauseT = z.optLong("pauseT", 0)
            l.letztT = z.optLong("letztT", 0); l.verloren = z.optLong("verloren", 0)
            l.naechsterBlock = z.optLong("block", -1) + 1; l.letztPaket = jetzt()
            return l
        }
        dir.mkdirs()
        val meta = JSONObject().put("session_uuid", dir.name)
            .put("started_at", java.time.Instant.ofEpochSecond(h.sitzung).toString())
            .put("sport", "pumpfoil").put("gps_hz", 1).put("accel_hz", h.hz)
            .put("accel_scale", SuuntoProtokoll.ACCEL_SCALE).put("accel_luecken", true)
            .put("device_model", modell(h.display)).put("app_version", "%d.%02d".format(h.appVer / 100, h.appVer % 100))
        schreibe(File(dir, "meta.json"), meta.toString())
        val l = Laufend(h.uhrId, h.sitzung, dir, SuuntoEmpfang(), SuuntoSammler(0, h.hz), h.hz)
        l.letztPaket = jetzt()
        zustandSpeichern(l)
        return l
    }

    private fun abschliessen(a: Laufend) {
        if (aktuell === a) aktuell = null
        if (!File(a.dir, "meta.json").exists()) return
        for (c in a.sammler.leeren()) schreibe(File(a.dir, "chunk-%06d.json".format(c.getInt("index"))), c.toString())
        if (a.pauseSeit > 0) a.pausen.put(JSONArray().put(a.pauseT).put(jetzt() - a.pauseSeit))
        var pausenMs = 0L
        for (i in 0 until a.pausen.length()) pausenMs += a.pausen.getJSONArray(i).getLong(1)
        val ende = java.time.Instant.ofEpochSecond(a.sitzung).plusMillis(a.letztT + pausenMs)
        val c = JSONObject().put("ended_at", ende.toString()).put("total_chunks", a.sammler.naechsterIndex)
            .put("pauses", a.pausen).put("hr_samples", a.sammler.hrWerte)
            .put("hr_source", if (a.sammler.hrWerte > 0) "active" else "none")
            .put("messweg", JSONObject().put("quelle", "suunto-ble").put("hz", a.hz).put("verloren_bloecke", a.verloren))
        zustandSpeichern(a)
        schreibe(File(a.dir, "complete.json"), c.toString())
    }

    private fun zustandSpeichern(a: Laufend) {
        val z = JSONObject().put("uhrId", a.uhrId).put("sitzung", a.sitzung).put("hz", a.hz)
            .put("index", a.sammler.naechsterIndex).put("block", a.sammler.blockGesichert)
            .put("gps", a.sammler.gpsGesichert).put("pausen", a.pausen).put("pauseSeit", a.pauseSeit)
            .put("pauseT", a.pauseT).put("letztT", a.letztT).put("verloren", a.verloren)
        schreibe(File(a.dir, "zustand.json"), z.toString())
    }

    /** Atomar: erst .tmp, dann umbenennen — ein Absturz hinterlaesst nie eine halbe Datei. */
    private fun schreibe(f: File, text: String) {
        val tmp = File(f.parentFile, f.name + ".tmp")
        tmp.writeText(text)
        if (!tmp.renameTo(f)) { f.delete(); tmp.renameTo(f) }
    }

    companion object {
        fun modell(display: Char) = when (display) {
            'n' -> "Suunto 9 Peak Pro"
            'o' -> "Suunto Vertical"
            else -> "Suunto Race / Vertical 2 / Ocean"
        } + " · SuuntoPlus"
    }
}

/**
 * Konfiguration fuer die Suunto-Uhr: aus /api/devices/config nur, was die Uhr-App nutzt (klassische
 * Seiten, Foils, Alarme, Sprache) — ihr Speicher (data.json/localStorage) ist klein. Als ASCII-JSON
 * (Nicht-ASCII als \uXXXX, die Uhr setzt Bytes 1:1 in Zeichen um) in KONFIG-Paketen
 * [0x83, nr u16, anzahl u16, bis zu 15 Bytes]. Gegenstueck: watch-suunto/quelle/funk.js `konfigTeil`.
 */
object SuuntoKonfig {
    private val SCHLUESSEL = listOf("views", "offFoilView", "pauseView", "browseAll", "foils", "alarmEnabled",
        "alarmDefault", "speedLow", "speedHigh", "hrHigh", "alarmPatternHigh", "alarmPatternLow", "alarmPatternHr",
        "alarmRepeat", "alarmRepeatS", "runDistM", "runDistMode", "alarmPatternDist", "runTimeS", "runTimeMode",
        "alarmPatternTime", "layoutsOn", "latestVersion", "colorByValue", "hrZones", "speedZones")
    private val SEITEN = listOf("pages", "offFoilPages", "pausePages")

    /** Freies Layout -> [2, f1..f6] (Werte in Lese-Reihenfolge) — nur noch Rueckfall, die Uhr zeichnet Layouts selbst. */
    fun seiteKurz(seite: JSONArray): JSONArray? {
        val art = seite.optInt(0, -1)
        if (art == 0) return seite
        if (art != 1) return null
        val els = seite.optJSONArray(2) ?: return null
        val werte = ArrayList<Triple<Int, Int, Int>>()
        for (i in 0 until els.length()) {
            val e = els.optJSONArray(i) ?: continue
            if (e.length() > 6 && e.optInt(0) == 1 && e.optInt(6) > 0) werte.add(Triple(e.optInt(2), e.optInt(1), e.optInt(6)))
        }
        val fids = werte.sortedWith(compareBy({ it.first / 60 }, { it.second })).map { it.third }.distinct().take(6)
        if (fids.isEmpty()) return null
        return JSONArray().put(2).apply { fids.forEach { put(it) } }
    }
    /** Sprache des Profils -> Spalte der Feld-Texte auf der Uhr (watch-suunto/bau.mjs SPRACHEN). */
    private val SPALTE = mapOf("de" to 0, "gsw" to 1, "de-AT" to 2, "en" to 3, "fr" to 4, "it" to 5, "es" to 6,
        "pt" to 7, "pt-PT" to 7, "id" to 8, "ru" to 9, "nl" to 10, "fi" to 11, "cs" to 12, "ja" to 13, "zh" to 14)

    fun fuerUhr(config: String, appSprache: String? = null): String {
        val k = JSONObject(config)
        val o = JSONObject()
        for (s in SCHLUESSEL) if (k.has(s)) o.put(s, k.get(s))
        // Seiten vollstaendig: die Uhr zeichnet freie Layouts wie die anderen Uhren (watch-suunto/quelle/anzeige.js)
        for (s in SEITEN) k.optJSONArray(s)?.let { if (it.length() > 0) o.put(s, it) }
        o.optJSONArray("foils")?.let { fs ->
            val kurz = JSONArray()
            for (i in 0 until fs.length()) {
                val f = fs.optJSONObject(i) ?: continue
                kurz.put(JSONObject().put("id", f.opt("id")).put("label", f.optString("label").take(24))
                    .put("min", f.opt("min")).put("max", f.opt("max")))
            }
            o.put("foils", kurz)
        }
        val lang = k.optString("language").ifBlank { appSprache ?: "" }
        SPALTE[lang]?.let { o.put("spr", it) }
        return ascii(o.toString())
    }

    fun ascii(s: String): String {
        val b = StringBuilder()
        for (c in s) if (c.code < 128) b.append(c) else b.append("\\u%04x".format(c.code))
        return b.toString()
    }

    /** [0x83, nr u16, anzahl u16, bis zu 15 Bytes] — Layouts koennen einige KB gross sein. */
    fun pakete(text: String): List<ByteArray> {
        val bytes = text.toByteArray(Charsets.US_ASCII)
        val n = (bytes.size + 14) / 15
        require(n in 1..0xFFFF) { "Konfiguration zu gross: ${bytes.size} Bytes" }
        return (0 until n).map { i ->
            val teil = bytes.copyOfRange(i * 15, minOf(bytes.size, (i + 1) * 15))
            byteArrayOf(0x83.toByte(), i.toByte(), (i shr 8).toByte(), n.toByte(), (n shr 8).toByte()) + teil
        }
    }
}
