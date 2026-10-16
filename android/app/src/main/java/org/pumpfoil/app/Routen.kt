package org.pumpfoil.app

import kotlin.math.PI
import kotlin.math.acos
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sign
import kotlinx.serialization.Serializable

/*
 * Routen-Vorschlaege aus den verlaesslichen Startplaetzen eines Spots — 1:1 nach
 * `web/src/lib/routen.ts` (Jan, 16.10.2026). Wer hier etwas aendert, aendert es dort mit (und in
 * `Routen.swift`): die drei sollen fuer dieselben Startplaetze dieselben Routen liefern.
 *
 * Eine Route beginnt am gewaehlten Start, geht von Platz zu Platz, jeder hoechstens einmal, jeder
 * Abschnitt zwischen minM und maxM. Sie hat genau `punkte` Startplaetze (Start mitgezaehlt). Mit
 * ohneKreuzung darf kein Abschnitt einen frueheren kreuzen. Sortiert nach Strecke plus Aufschlag
 * fuer Kehren spitzer als 90 Grad und fuer doppelt gefahrene Abschnitte.
 */

/** eigen: selbst gesetzter Punkt (nicht aus echten Starts); vomSpot: mit Umkreis false = Nachbarspot. */
@Serializable
data class Startposition(
    val lat: Double, val lon: Double, val starts: Int = 0, val sessions: Int = 0, val fahrer: Int? = null,
    @kotlinx.serialization.SerialName("vom_spot") val vomSpot: Boolean? = null,
    @kotlinx.serialization.Transient val eigen: Boolean = false,
)

data class Route(val punkte: List<Int>, val meter: Double, val wertung: Double, val erstesZiel: Int,
                 val kreuzungen: Int, val doppelt: Int) {
    val schluessel: String get() = punkte.joinToString("-")
}

data class RoutenOptionen(val punkte: Int, val ohneKreuzung: Boolean, val rundkurs: Boolean = false,
                          val jeRichtung: Int = 20, val ausgeschlossen: Set<Int> = emptySet(), val ziel: Int? = null)

data class RoutenErgebnis(val routen: List<Route>, val gekuerzt: Boolean)

object Routen {
    const val MAX_NACHBARN = 8
    private const val ZEIT_MS = 150L
    private const val ZEIT_JE_PUNKT = 15L

    fun abstandM(aLat: Double, aLon: Double, bLat: Double, bLon: Double): Double {
        val kx = 111320.0 * cos(aLat * PI / 180)
        return hypot((bLon - aLon) * kx, (bLat - aLat) * 111320.0)
    }
    fun abstandM(a: Startposition, b: Startposition) = abstandM(a.lat, a.lon, b.lat, b.lon)

    /** Schneiden sich a-b und c-d echt (gemeinsame Endpunkte zaehlen nicht)? */
    fun kreuzen(a: DoubleArray, b: DoubleArray, c: DoubleArray, d: DoubleArray): Boolean {
        fun o(p: DoubleArray, q: DoubleArray, r: DoubleArray) =
            sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]))
        return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0
    }

    fun vorschlagen(p: List<Startposition>, start: Int, minM: Double, maxM: Double, opt: RoutenOptionen): RoutenErgebnis {
        val leer = RoutenErgebnis(emptyList(), false)
        val ziel = min(max(2, opt.punkte), p.size - opt.ausgeschlossen.size)
        if (p.size < 2 || start < 0 || start >= p.size) return leer
        val k = opt.jeRichtung
        val kx = 111320.0 * cos(p[0].lat * PI / 180)
        val xy = p.map { doubleArrayOf(it.lon * kx, it.lat * 111320.0) }
        val d = p.map { a -> DoubleArray(p.size) { j -> abstandM(a, p[j]) } }
        val nachbarn = p.indices.map { i ->
            p.indices.filter { j -> j != i && d[i][j] >= minM && d[i][j] <= maxM && j !in opt.ausgeschlossen }
                .sortedBy { d[i][it] }.take(MAX_NACHBARN)
        }
        val beste = p.indices.map { mutableListOf<Route>() }
        var schritte = 0
        var gekuerzt = false
        val bis = System.currentTimeMillis() + ZEIT_MS + ZEIT_JE_PUNKT * ziel
        val weg = mutableListOf(start)
        val besucht = mutableSetOf(start)
        fun kreuztFrueheren(i: Int, j: Int): Boolean {
            for (q in 0 until weg.size - 2) if (kreuzen(xy[weg[q]], xy[weg[q + 1]], xy[i], xy[j])) return true
            return false
        }
        fun kehre(i: Int, j: Int): Double {
            if (weg.size < 2) return 0.0
            val h = xy[weg[weg.size - 2]]
            val a = doubleArrayOf(h[0] - xy[i][0], h[1] - xy[i][1])
            val b = doubleArrayOf(xy[j][0] - xy[i][0], xy[j][1] - xy[i][1])
            val nenner = (hypot(a[0], a[1]) * hypot(b[0], b[1])).takeIf { it != 0.0 } ?: 1.0
            val w = acos(max(-1.0, min(1.0, (a[0] * b[0] + a[1] * b[1]) / nenner))) * 180 / PI
            return if (w < 90) (90 - w) / 90 * d[i][j] else 0.0
        }
        fun schranke(r: Int) = if (beste[r].size < k) Double.POSITIVE_INFINITY else beste[r][k - 1].wertung
        val mitZiel = !opt.rundkurs && opt.ziel != null && opt.ziel != start
        fun gehe(i: Int, meter0: Double, wertung0: Double, r: Int) {
            if (gekuerzt) return
            if ((++schritte and 1023) == 0 && System.currentTimeMillis() > bis) { gekuerzt = true; return }
            var meter = meter0
            var wertung = wertung0
            if (wertung >= schranke(r)) return
            if (weg.size == ziel) {
                var punkte = weg.toList()
                if (opt.rundkurs) {
                    if (d[i][start] < minM || d[i][start] > maxM) return
                    if (opt.ohneKreuzung && kreuztFrueheren(i, start)) return
                    wertung += d[i][start] + kehre(i, start)
                    meter += d[i][start]
                    if (wertung >= schranke(r)) return
                    punkte = weg + start
                }
                val gesehen = mutableSetOf<String>()
                var doppelt = 0
                for (q in 0 until punkte.size - 1) {
                    val a = punkte[q]; val b = punkte[q + 1]
                    val s = if (a < b) "$a-$b" else "$b-$a"
                    if (!gesehen.add(s)) { doppelt++; wertung += d[a][b] }
                }
                if (wertung >= schranke(r)) return
                var kreuzungen = 0
                for (q in 0 until punkte.size - 1) for (u in q + 2 until punkte.size - 1) {
                    if (kreuzen(xy[punkte[q]], xy[punkte[q + 1]], xy[punkte[u]], xy[punkte[u + 1]])) kreuzungen++
                }
                val liste = beste[r]
                liste.add(Route(punkte, meter, wertung, r, kreuzungen, doppelt))
                liste.sortBy { it.wertung }
                if (liste.size > k) liste.removeAt(liste.size - 1)
                return
            }
            for (j in nachbarn[i]) {
                if (j in besucht) continue
                if (mitZiel && ((j == opt.ziel) != (weg.size == ziel - 1))) continue
                if (opt.ohneKreuzung && kreuztFrueheren(i, j)) continue
                val rr = if (weg.size == 1) j else r
                val kk = kehre(i, j)
                besucht.add(j); weg.add(j)
                gehe(j, meter + d[i][j], wertung + d[i][j] + kk, rr)
                weg.removeAt(weg.size - 1); besucht.remove(j)
            }
        }
        gehe(start, 0.0, 0.0, 0)
        return RoutenErgebnis(beste.flatten().sortedBy { it.wertung }, gekuerzt)
    }

    /** Kurzbeschreibung relativ zum Bezugspunkt, z. B. „130 m SW", ab 1 km in km. */
    fun lageText(pLat: Double, pLon: Double, bLat: Double, bLon: Double, richtungen: List<String>): String {
        val m = abstandM(bLat, bLon, pLat, pLon)
        if (m < 15) return ""
        val kx = 111320.0 * cos(bLat * PI / 180)
        val w = Math.toDegrees(kotlin.math.atan2((pLon - bLon) * kx, (pLat - bLat) * 111320.0))
        val r = richtungen.getOrElse((((w + 360) % 360) / 45).roundToInt() % 8) { "" }
        if (m < 1000) return "${(m / 10).roundToInt() * 10} m $r"
        return "${String.format(java.util.Locale.forLanguageTag(I18n.lang), "%.1f", m / 1000).removeSuffix(",0").removeSuffix(".0")} km $r"
    }

    /** Warum keine Route — die erste gelockerte Einstellung, mit der es ginge. */
    sealed class Grund {
        data class Nachbar(val naechsterM: Int?) : Grund()
        data class ZuWenig(val verfuegbar: Int) : Grund()
        object Rundkurs : Grund()
        object Kreuzung : Grund()
        data class Punkte(val hoechstens: Int) : Grund()
        object Ziel : Grund()
        object Unbekannt : Grund()
    }

    fun warumKeine(pos: List<Startposition>, start: Int, minM: Double, maxM: Double, opt: RoutenOptionen): Grund {
        val aus = opt.ausgeschlossen
        val verfuegbar = pos.size - aus.size
        if (verfuegbar < max(2, opt.punkte)) return Grund.ZuWenig(verfuegbar)
        val andere = pos.indices.filter { it != start && it !in aus }
        val abst = andere.map { abstandM(pos[start], pos[it]) }
        if (abst.none { it >= minM && it <= maxM }) return Grund.Nachbar(abst.minOrNull()?.roundToInt())
        fun geht(o: RoutenOptionen) = vorschlagen(pos, start, minM, maxM, o.copy(jeRichtung = 1)).routen.isNotEmpty()
        if (opt.rundkurs && geht(opt.copy(rundkurs = false))) return Grund.Rundkurs
        if (!opt.rundkurs && opt.ziel != null && geht(opt.copy(ziel = null))) return Grund.Ziel
        if (opt.ohneKreuzung && geht(opt.copy(ohneKreuzung = false))) return Grund.Kreuzung
        for (n in opt.punkte - 1 downTo 2) if (geht(opt.copy(punkte = n))) return Grund.Punkte(n)
        return Grund.Unbekannt
    }

    /** Name eines Startplatzes: A … Z, AA, AB … */
    fun platzName(i: Int): String {
        var n = i
        var s = ""
        do { s = ('A' + (n % 26)) + s; n = n / 26 - 1 } while (n >= 0)
        return s
    }
}

/** Gemerkte Route (GET /spot/{id}/routen bzw. /routen): nur Datum, nie wer. `einstellungen` wie
 *  beim Merken (Formular), roh gehalten, damit ein Aufruf alles wiederherstellen kann. */
@Serializable
data class GemerkteRoute(
    val id: Int? = null,
    val schluessel: String = "",
    @kotlinx.serialization.SerialName("gemerkt_am") val gemerktAm: String = "",
    val punkte: List<List<Double>> = emptyList(),
    val meter: Int = 0,
    @kotlinx.serialization.SerialName("eigene_id") val eigeneId: Int? = null,
    val einstellungen: kotlinx.serialization.json.JsonObject = kotlinx.serialization.json.JsonObject(emptyMap()),
    @kotlinx.serialization.SerialName("spot_id") val spotId: Int? = null,
    @kotlinx.serialization.SerialName("spot_name") val spotName: String? = null,
)

/** Schutzgebiete im Ausschnitt (app/schutzgebiete.py). Ringe als [[lat, lon], …]. */
@Serializable
data class SchutzAntwort(
    @kotlinx.serialization.SerialName("zu_weit") val zuWeit: Boolean = false,
    val unvollstaendig: Boolean = false,
    val flaechen: List<SchutzFlaeche> = emptyList(),
)

@Serializable
data class SchutzFlaeche(
    val id: String = "", val art: String = "", val name: String = "", val titel: String = "",
    val aussen: List<List<List<Double>>> = emptyList(), val innen: List<List<List<Double>>> = emptyList(),
)
