package org.pumpfoil.app

import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File

/**
 * Aufnahmen vom Handy nachspielen: Lauferkennung des Recorders gegen den Server (Regel vom 13.11.2026 zur GPS-Luecke).
 * Nur mit `PUMPFOIL_REPLAY=<ordner>` (Textdateien je Session, aus der Prod-DB exportiert — Nutzerdaten, NIE ins Repo):
 *   # <id> <sport>
 *   P <t_ms> <lat> <lon> <doppler_mps> <genauigkeit_m>
 *   S <start_ms> <ende_ms> <dauer_s> <strecke_m>        (Server-Laeufe)
 * Aufgerufen wird die private `updateFoilingRun` + `LaufLuecke` per Reflection; nachgebaut ist nur der Klebstoff aus
 * `addGps` (Strecke mit denselben Grenzen, 3-s-Median, Kilometerverlauf). „alt" = ohne `luecke.fix` (dann schneidet
 * LaufLuecke nie — Stand vor dem 12.11.), „neu" = wie live. Ergebnis je Lauf gegen den Server.
 */
class RecorderReplayTest {
    private data class Lauf(val start: Long, val dur: Long, val dist: Double)

    private val r = Recorder
    private fun feld(n: String) = Recorder::class.java.getDeclaredField(n).apply { isAccessible = true }
    private fun setze(n: String, v: Any?) = feld(n).set(r, v)
    private fun hole(n: String): Any? = feld(n).get(r)

    private fun zuruecksetzen() {
        setze("foiling", false); setze("foilEnterStreak", 0); setze("foilExitStreak", 0); setze("runEndedMs", -100000L)
        setze("runCount", 0); setze("runStartMs", 0L); setze("runStartDist", 0.0); setze("runMaxMps", 0.0)
        setze("lastRunDurMs", 0L); setze("lastRunDistM", 0.0); setze("lastRunAvgMps", 0.0); setze("lastRunMaxMps", 0.0)
        setze("lastRunStartMs", 0L); setze("lastRunStartDist", 0.0); setze("minSpeedSeitEnde", 99.0)
        setze("runIstFortsetzung", false); setze("luecke", LaufLuecke())
        (hole("laeufeListe") as ArrayList<*>).clear(); (hole("distVerlauf") as ArrayDeque<*>).clear()
        setze("spdMaxGlatt", 0.0); (hole("maxGlattWin") as ArrayList<*>).clear()
    }

    @Suppress("UNCHECKED_CAST")
    private fun spiele(punkte: List<DoubleArray>, mitLuecke: Boolean): List<Lauf> {
        zuruecksetzen()
        val upd = Recorder::class.java.getDeclaredMethod("updateFoilingRun", Double::class.java, Long::class.java,
            Double::class.java, Double::class.java).apply { isAccessible = true }
        val luecke = hole("luecke") as LaufLuecke
        val distVerlauf = hole("distVerlauf") as ArrayDeque<Pair<Long, Double>>
        val spWin = ArrayList<DoubleArray>()
        var dist = 0.0; var pLat = Double.NaN; var pLon = 0.0; var pT = 0L
        for (p in punkte) {
            val t = p[0].toLong(); val lat = p[1]; val lon = p[2]; val acc = p[4]
            val sp = maxOf(0.0, p[3])
            if (!pLat.isNaN()) {      // wie addGps: brauchbar && bewegt && plausibel
                val dla = Math.toRadians(lat - pLat); val dlo = Math.toRadians(lon - pLon) * Math.cos(Math.toRadians(lat))
                val schritt = 6371000.0 * Math.sqrt(dla * dla + dlo * dlo)
                val plausibel = schritt / maxOf(1.0, (t - pT) / 1000.0) <= 22.2
                if (acc <= 20.0 && sp > 0.5 && plausibel) dist += schritt
            }
            pLat = lat; pLon = lon; pT = t
            spWin.add(doubleArrayOf(t.toDouble(), sp)); while (spWin.isNotEmpty() && t - spWin[0][0] > 3000) spWin.removeAt(0)
            val sp3 = spWin.map { it[1] }.sorted()[spWin.size / 2]
            distVerlauf.addLast(t to dist); while (distVerlauf.size > 1 && t - distVerlauf.first().first > 8000) distVerlauf.removeFirst()
            if (mitLuecke) luecke.fix(t, dist, lat, lon, sp, acc <= 20.0, 0, hole("foiling") as Boolean)
            upd.invoke(r, sp3 * 3.6, t, dist, sp)
        }
        return (hole("laeufeListe") as ArrayList<Recorder.LiveLauf>).map { Lauf(it.startSek * 1000, it.durMs, it.distM) }
    }

    @Test fun echteAufnahmenMitGpsLuecken() {
        val ordner = System.getenv("PUMPFOIL_REPLAY")
        assumeTrue("nur mit PUMPFOIL_REPLAY", ordner != null && File(ordner).isDirectory)
        val bericht = StringBuilder(); val zahl = StringBuilder()
        var nAlt = 0; var nNeu = 0; var geschnitten = 0; var naeherAmServer = 0; var weiterWeg = 0; var sessions = 0
        for (f in File(ordner!!).listFiles { x -> x.name.endsWith(".txt") }!!.sorted()) {
            val zeilen = f.readLines()
            val punkte = zeilen.filter { it.startsWith("P ") }.map { z -> z.split(" ").drop(1).map { it.toDouble() }.toDoubleArray() }
            val server = zeilen.filter { it.startsWith("S ") }.map { z -> z.split(" ").drop(1).map { it.toDouble() } }
            if (punkte.size < 30) continue
            sessions++
            val alt = spiele(punkte, false); val neu = spiele(punkte, true)
            nAlt += alt.size; nNeu += neu.size
            val sv = server.size
            zahl.append("${zeilen[0].removePrefix("# ")} server=$sv alt=${alt.size} neu=${neu.size}\n")
            // Laeufe, die sich unterscheiden: gleicher Start (+-2 s), andere Dauer
            for (a in alt) {
                val n = neu.firstOrNull { kotlin.math.abs(it.start - a.start) <= 2000 } ?: continue
                if (kotlin.math.abs(n.dur - a.dur) < 1000) continue
                geschnitten++
                val s = server.minByOrNull { kotlin.math.abs(it[0] - a.start) }
                val sDur = s?.let { (it[1] - it[0]) } ?: Double.NaN
                val dA = kotlin.math.abs(a.dur - sDur); val dN = kotlin.math.abs(n.dur - sDur)
                if (dN < dA) naeherAmServer++ else if (dN > dA) weiterWeg++
                bericht.append("${zeilen[0].removePrefix("# ")} Lauf ab ${a.start / 1000} s: alt ${a.dur / 1000} s / ${a.dist.toInt()} m" +
                    " -> neu ${n.dur / 1000} s / ${n.dist.toInt()} m | Server ${"%.0f".format(sDur / 1000)} s\n")
            }
        }
        bericht.insert(0, "Sessions $sessions, Laeufe alt $nAlt -> neu $nNeu, durch die Luecken-Regel geaendert $geschnitten " +
            "(naeher am Server $naeherAmServer, weiter weg $weiterWeg)\n")
        File(ordner, "ergebnis.txt").writeText(bericht.toString())
        File(ordner, "laufzahl.txt").writeText(zahl.toString())
        println(bericht)
    }
}
