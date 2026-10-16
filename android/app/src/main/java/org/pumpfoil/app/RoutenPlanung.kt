package org.pumpfoil.app

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/*
 * Zustand und Ablauf der Routenplanung — nach `RoutenVorschlag` in web/src/components/SpotHeatmap.tsx
 * (Jan, 16.10.2026). Die Oberflaeche steht in SpotHeatmapPanel.kt; hier nur, was passiert:
 *
 *  - Startplaetze holen (mind. Starts / mind. Fahrer / Umkreis), dabei Start, Ausschluesse und Ziel
 *    ueber die Lage uebernehmen statt auf den Anfang zu springen.
 *  - Rechnen nur auf Anstoss (Jetzt berechnen, erstes Oeffnen, Aufruf einer gemerkten Route);
 *    passt die Liste nicht mehr zu den Einstellungen, ist sie „veraltet" und verschwindet.
 *  - Eigene Punkte („+" auf der Karte) je Spot in den Einstellungen der App; Punkte einer
 *    aufgerufenen fremden Route nur fuer diese Route (weg bei der naechsten eigenen Berechnung).
 *  - Merken mit dem Formular, damit ein Aufruf alles wiederherstellt.
 */

data class EigenerPunkt(val lat: Double, val lon: Double, val lokal: Boolean)

enum class RoutenSpalte { EMPF, METER, LEGS, KREUZ, DOPPELT }

class RoutenPlanung(private val ctx: Context, val spotId: Int) {
    companion object {
        val ZUVERLAESSIG = listOf(2, 3, 5)
        val FAHRER = listOf(1, 2, 3)
        val UMKREIS = listOf(2, 5, 10, 20, 30)
        const val EIGENE_MAX = 20
        const val NAH_M = 40.0          // gemerkter Punkt == heutiger Startplatz, wenn so nah
        const val MEIN_M = 30.0         // so nah an einem eigenen Start = „schon gestartet"
    }

    var minStarts by mutableStateOf(3)
    var minFahrer by mutableStateOf(1)
    var umkreis by mutableStateOf(2)
    var start by mutableStateOf(0)
    var minM by mutableStateOf(50)
    var maxM by mutableStateOf(300)
    var anzahl by mutableStateOf(6)
    var ohneKreuzung by mutableStateOf(true)
    var rundkurs by mutableStateOf(true)
    var zielPlatz by mutableStateOf<Int?>(null)
    var richtung by mutableStateOf<Int?>(null)
    var aus by mutableStateOf<Set<Int>>(emptySet())
    var serverPos by mutableStateOf<List<Startposition>?>(null)
    var eigene by mutableStateOf(eigeneLaden())
    var ergebnis by mutableStateOf<RoutenErgebnis?>(null)
    var gerechnetMit by mutableStateOf("")
    var sortierung by mutableStateOf(RoutenSpalte.EMPF to false)
    var gewaehlt by mutableStateOf<String?>(null)
    var merkStatus by mutableStateOf<String?>(null)
    var wieder by mutableStateOf<GemerkteRoute?>(null)
    var ueberlagert by mutableStateOf<GemerkteRoute?>(null)
    var setzen by mutableStateOf(false)
    var grund by mutableStateOf<Routen.Grund?>(null)
    /** Nach einem Umkreis-Wechsel die Karte auf die Startplaetze einpassen (liest das Panel). */
    var einpassen by mutableStateOf(false)
    private var erstGerechnet = false
    private var vorher: List<Startposition>? = null

    val nServer: Int get() = serverPos?.size ?: 0
    val pos: List<Startposition>? get() = serverPos?.let { s ->
        s + eigene.map { Startposition(it.lat, it.lon, eigen = true) }
    }
    val zielAktiv: Int? get() = zielPlatz?.takeIf { !rundkurs && it != start && it !in aus }
    val einstellungsSchluessel: String get() = listOf(minStarts, minFahrer, umkreis, start, minM, maxM, anzahl, ohneKreuzung,
        rundkurs, aus.sorted(), zielAktiv, eigene.map { listOf(it.lat, it.lon) }).toString()
    val veraltet: Boolean get() = pos != null && (gerechnetMit != einstellungsSchluessel || ergebnis == null)

    // --- eigene Punkte -----------------------------------------------------------------------
    private fun prefs() = ctx.getSharedPreferences("pumpfoil", Context.MODE_PRIVATE)
    private fun eigeneLaden(): List<EigenerPunkt> = try {
        val a = org.json.JSONArray(prefs().getString("routen_eigene_$spotId", "[]"))
        (0 until a.length()).mapNotNull { i -> a.optJSONArray(i)?.let { p ->
            if (p.length() == 2) EigenerPunkt(p.getDouble(0), p.getDouble(1), true) else null } }.take(EIGENE_MAX)
    } catch (_: Exception) { emptyList() }
    fun setzeEigene(e: List<EigenerPunkt>) {
        eigene = e
        val a = org.json.JSONArray()
        e.filter { it.lokal }.forEach { a.put(org.json.JSONArray().put(it.lat).put(it.lon)) }
        prefs().edit().putString("routen_eigene_$spotId", a.toString()).apply()
    }
    fun eigenenSetzen(lat: Double, lon: Double) {
        setzen = false
        if (eigene.size >= EIGENE_MAX) return
        setzeEigene(eigene + EigenerPunkt(lat, lon, true))
    }
    fun eigenenVerschieben(k: Int, lat: Double, lon: Double) {
        setzeEigene(eigene.mapIndexed { i, q -> if (i == k) EigenerPunkt(lat, lon, true) else q })
    }
    /** Eigenen Punkt k entfernen: Indizes dahinter ruecken vor (Start, Ausschluesse, Ziel, Richtung). */
    fun eigenenEntfernen(k: Int) {
        val gi = nServer + k
        fun r(i: Int) = if (i > gi) i - 1 else i
        start = if (start == gi) 0 else r(start)
        aus = aus.filter { it != gi }.map(::r).toSet()
        zielPlatz = zielPlatz?.let { if (it == gi) null else r(it) }
        richtung = richtung?.let { if (it == gi) null else r(it) }
        setzeEigene(eigene.filterIndexed { j, _ -> j != k })
    }
    /** Punkte einer aufgerufenen fremden Route entfernen (bei eigener Berechnung, beim Schliessen). */
    fun fremdeEntfernen(): Boolean {
        if (eigene.all { it.lokal }) return false
        val neu = IntArray(nServer + eigene.size)
        var n = 0
        for (i in neu.indices) neu[i] = if (i < nServer || eigene[i - nServer].lokal) n++ else -1
        fun um(i: Int) = neu.getOrElse(i) { -1 }
        start = maxOf(0, um(start))
        aus = aus.map(::um).filter { it >= 0 }.toSet()
        zielPlatz = zielPlatz?.let { um(it).takeIf { x -> x >= 0 } }
        richtung = richtung?.let { um(it).takeIf { x -> x >= 0 } }
        setzeEigene(eigene.filter { it.lokal })
        return true
    }

    fun naechster(p: List<Startposition>, lat: Double, lon: Double): Int {
        var best = -1; var bm = NAH_M
        p.forEachIndexed { i, q -> val m = Routen.abstandM(q.lat, q.lon, lat, lon); if (m < bm) { bm = m; best = i } }
        return best
    }
    fun schonGestartet(meine: List<List<Double>>, p: Startposition) =
        meine.any { it.size == 2 && Routen.abstandM(it[0], it[1], p.lat, p.lon) < MEIN_M }

    // --- Startplaetze laden + rechnen -----------------------------------------------------------
    /** Startplaetze holen und Start/Ausschluesse/Ziel einstellen; rechnet beim ersten Mal und beim Aufruf. */
    private var geladenMit: String? = null
    suspend fun ladePositionen(sport: String) {
        // Schon geladen (Panel nur aus dem Bild gescrollt und zurueck): nichts verwerfen
        val schl = "$minStarts/$minFahrer/$umkreis/$sport"
        if (schl == geladenMit && serverPos != null && wieder == null) return
        geladenMit = schl
        pos?.let { vorher = it }
        serverPos = null; ergebnis = null
        val geholt = try { Api.spotStartpositionen(spotId, minStarts, minFahrer, sport, umkreis) } catch (_: Exception) { emptyList() }
        serverPos = geholt
        val p = pos ?: return
        val w = wieder
        val alt = if (w == null) vorher else null
        vorher = null
        fun neu(i: Int?) = if (i == null || alt == null || i !in alt.indices) -1 else naechster(p, alt[i].lat, alt[i].lon)
        var s = maxOf(0, p.indexOfFirst { it.vomSpot != false && !it.eigen })
        val ws = w?.einstellungen?.get("start")?.let { koord(it) }
        if (ws != null) naechster(p, ws.first, ws.second).takeIf { it >= 0 }?.let { s = it }
        else if (alt != null && neu(start) >= 0) s = neu(start)
        start = s
        val exAlt: List<Pair<Double, Double>> = if (w != null) koordListe(w.einstellungen["ausgeschlossen"])
            else alt?.let { a -> aus.filter { it in a.indices }.map { a[it].lat to a[it].lon } } ?: emptyList()
        aus = exAlt.map { naechster(p, it.first, it.second) }.filter { it >= 0 && it != s }.toSet()
        val wz = w?.einstellungen?.get("ziel")?.let { koord(it) }
        zielPlatz = (if (wz != null) naechster(p, wz.first, wz.second) else neu(zielPlatz)).takeIf { it >= 0 }
        richtung = richtung?.let { neu(it).takeIf { x -> x >= 0 && x != start } }
        if (!erstGerechnet || w != null) { erstGerechnet = true; rechnen() }
    }

    suspend fun rechnen() {
        val p = pos ?: return
        val opt = RoutenOptionen(punkte = minOf(anzahl, p.size), ohneKreuzung = ohneKreuzung, rundkurs = rundkurs,
            ausgeschlossen = aus, ziel = zielAktiv)
        val s = start; val a = minM.toDouble(); val b = maxOf(minM, maxM).toDouble()
        val schl = einstellungsSchluessel
        val (neu, warum) = withContext(Dispatchers.Default) {
            val r = Routen.vorschlagen(p, s, a, b, opt)
            r to (if (r.routen.isEmpty()) Routen.warumKeine(p, s, a, b, opt) else null)
        }
        ergebnis = neu; grund = warum; gerechnetMit = schl; merkStatus = null
        val w = wieder
        if (w != null) {
            // Aufgerufene gemerkte Route: in der gemerkten Richtung zuerst, sonst umgekehrt
            val idx = w.punkte.map { naechster(p, it[0], it[1]) }
            val passt = if (idx.all { it >= 0 }) (neu.routen.firstOrNull { it.punkte == idx }
                ?: neu.routen.firstOrNull { it.punkte == idx.reversed() }) else null
            val ez = w.einstellungen["erstes_ziel"]?.let { koord(it) }
            richtung = ez?.let { naechster(p, it.first, it.second).takeIf { x -> x >= 0 } }
            gewaehlt = passt?.schluessel
            ueberlagert = if (passt == null) w else null
            wieder = null
        } else {
            gewaehlt = liste(richtung).firstOrNull()?.schluessel
        }
    }

    /** Die angezeigte Liste: je Richtung die besten 20, sortiert nach der gewaehlten Spalte. */
    fun liste(rich: Int?): List<Route> {
        val e = ergebnis ?: return emptyList()
        val empf = compareBy<Route>({ it.kreuzungen }, { it.doppelt }, { it.wertung })
        val (nach, ab) = sortierung
        val vgl: Comparator<Route> = when (nach) {
            RoutenSpalte.METER -> compareBy { it.meter }
            RoutenSpalte.LEGS -> compareBy<Route>({ it.punkte.size }, { it.meter })
            RoutenSpalte.KREUZ -> compareBy<Route>({ it.kreuzungen }, { it.wertung })
            RoutenSpalte.DOPPELT -> compareBy<Route>({ it.doppelt }, { it.wertung })
            RoutenSpalte.EMPF -> empf
        }
        return e.routen.filter { rich == null || it.erstesZiel == rich }.sortedWith(empf).take(20)
            .sortedWith(if (ab) vgl.reversed() else vgl)
    }
    val routen: List<Route> get() = liste(richtung)
    val gewaehlteRoute: Route? get() = if (veraltet) null else routen.firstOrNull { it.schluessel == gewaehlt }

    /** Moegliche erste Ziele: aus der gueltigen Liste, sonst die MAX_NACHBARN naechsten im Abstand. */
    val richtungsWahl: List<Int> get() {
        val p = pos ?: return emptyList()
        val e = ergebnis
        if (!veraltet && e != null) {
            val r = e.routen.map { it.erstesZiel }.toSet()
            return (if (richtung != null && richtung !in r) r + richtung!! else r).sorted()
        }
        if (start !in p.indices) return emptyList()
        return p.indices.map { it to Routen.abstandM(p[start], p[it]) }
            .filter { (j, m) -> j != start && j !in aus && m >= minM && m <= maxOf(minM, maxM) }
            .sortedBy { it.second }.take(Routen.MAX_NACHBARN).map { it.first }.sorted()
    }

    // --- Umkreis / Aufruf / Merken --------------------------------------------------------------
    fun umkreisSetzen(km: Int) { if (km != umkreis) { einpassen = true; umkreis = km } }

    /** Gemerkte Route einstellen. Gibt true zurueck, wenn danach direkt gerechnet werden kann
     *  (gleiche Startplatz-Anforderungen) — sonst laedt die Aenderung der Anforderungen neu. */
    fun aufrufen(g: GemerkteRoute): Boolean {
        val e = g.einstellungen
        ueberlagert = null
        wieder = g
        // Manuelle Punkte der Route ersetzen die einer vorher aufgerufenen; eigene bleiben
        val lokale = eigene.filter { it.lokal }
        val dazu = koordListe(e["eigene"]).map { EigenerPunkt(it.first, it.second, false) }
            .filter { p -> lokale.none { Routen.abstandM(p.lat, p.lon, it.lat, it.lon) < 5 } }
        setzeEigene((lokale + dazu).take(EIGENE_MAX))
        e.int("min_m")?.let { minM = it }
        e.int("max_m")?.let { maxM = it }
        e.int("punkte")?.let { anzahl = it }
        e.bool("ohne_kreuzung")?.let { ohneKreuzung = it }
        e.bool("rundkurs")?.let { rundkurs = it }
        val ms = e.int("min_starts") ?: minStarts
        val mf = e.int("min_fahrer") ?: 1
        val uk = e.int("umkreis_km")?.takeIf { it > 0 } ?: 2
        if (ms != minStarts || mf != minFahrer || uk != umkreis) {
            minStarts = ms; minFahrer = mf; umkreisSetzen(uk)
            return false
        }
        val p = pos ?: return false
        val st = koord(e["start"])?.let { naechster(p, it.first, it.second) } ?: -1
        if (st >= 0) start = st
        aus = koordListe(e["ausgeschlossen"]).map { naechster(p, it.first, it.second) }.filter { it >= 0 && it != st }.toSet()
        zielPlatz = koord(e["ziel"])?.let { naechster(p, it.first, it.second).takeIf { x -> x >= 0 } }
        return true
    }

    suspend fun merken(r: Route): Boolean {
        val p = pos ?: return false
        merkStatus = "…"
        fun k(i: Int) = JsonArray(listOf(JsonPrimitive(p[i].lat), JsonPrimitive(p[i].lon)))
        val einst = buildJsonObject {
            put("min_starts", minStarts); put("min_fahrer", minFahrer); put("start", k(start))
            put("erstes_ziel", richtung?.let { k(it) } ?: kotlinx.serialization.json.JsonNull)
            put("ziel", zielAktiv?.let { k(it) } ?: kotlinx.serialization.json.JsonNull)
            put("min_m", minM); put("max_m", maxM); put("punkte", anzahl)
            put("ohne_kreuzung", ohneKreuzung); put("rundkurs", rundkurs)
            put("ausgeschlossen", JsonArray(aus.sorted().map { k(it) }))
            // nur die manuellen Punkte, die die Route wirklich anfaehrt (Jan)
            put("eigene", JsonArray(r.punkte.filter { it >= nServer }.distinct().map { k(it) }))
            put("umkreis_km", umkreis)
        }
        return try {
            Api.spotRouteMerken(spotId, r.punkte.map { listOf(p[it].lat, p[it].lon) }, einst)
            merkStatus = "ok"; true
        } catch (ex: Exception) {
            merkStatus = if ((ex.message ?: "").contains("409")) "limit" else "fehler"; false
        }
    }

    /** Ist die Planung (gewaehlte bzw. ueberlagerte Route) noch genau die gemerkte g (mit Richtung)? */
    fun istNoch(g: GemerkteRoute): Boolean {
        if (veraltet) return false
        val r = gewaehlteRoute
        val p = pos
        if (r != null && p != null) {
            if (r.punkte.size != g.punkte.size) return false
            return r.punkte.indices.all { Routen.abstandM(p[r.punkte[it]].lat, p[r.punkte[it]].lon, g.punkte[it][0], g.punkte[it][1]) < NAH_M }
        }
        return ueberlagert?.schluessel == g.schluessel
    }
}

// --- kleine Helfer fuer die rohen Einstellungen einer gemerkten Route ------------------------------
internal fun koord(e: kotlinx.serialization.json.JsonElement?): Pair<Double, Double>? = try {
    val a = e?.jsonArray ?: null
    if (a != null && a.size == 2) a[0].jsonPrimitive.doubleOrNull!! to a[1].jsonPrimitive.doubleOrNull!! else null
} catch (_: Exception) { null }

internal fun koordListe(e: kotlinx.serialization.json.JsonElement?): List<Pair<Double, Double>> = try {
    e?.jsonArray?.mapNotNull { koord(it) } ?: emptyList()
} catch (_: Exception) { emptyList() }

internal fun JsonObject.int(k: String): Int? = try { this[k]?.jsonPrimitive?.doubleOrNull?.toInt() ?: this[k]?.jsonPrimitive?.intOrNull } catch (_: Exception) { null }
internal fun JsonObject.bool(k: String): Boolean? = try { this[k]?.jsonPrimitive?.booleanOrNull } catch (_: Exception) { null }

/** Kurzangaben einer gemerkten Route fuer die Kaertchen: Startplaetze, laengster Abschnitt. */
fun gemerktKurz(g: GemerkteRoute): Pair<Int, Int> {
    val p = g.punkte
    if (p.size < 2) return p.size to 0
    val rund = p.size > 2 && Routen.abstandM(p[0][0], p[0][1], p.last()[0], p.last()[1]) < 1
    val legs = (1 until p.size).map { Routen.abstandM(p[it - 1][0], p[it - 1][1], p[it][0], p[it][1]) }
    return (if (rund) p.size - 1 else p.size) to (legs.maxOrNull() ?: 0.0).toInt()
}

/** Enthaelt die gemerkte Route selbst gesetzte Punkte? -> „manuell". */
fun mitEigenen(g: GemerkteRoute): Boolean {
    val e = koordListe(g.einstellungen["eigene"])
    return g.punkte.any { p -> e.any { Routen.abstandM(p[0], p[1], it.first, it.second) < 5 } }
}

/** Datum in der App-Sprache (wie die PWA: Tag, Monat, Jahr). */
fun routenDatum(iso: String): String = try {
    val d = java.time.OffsetDateTime.parse(iso).toLocalDate()
    d.format(java.time.format.DateTimeFormatter.ofLocalizedDate(java.time.format.FormatStyle.SHORT)
        .withLocale(java.util.Locale.forLanguageTag(I18n.lang)))
} catch (_: Exception) { try {
    java.time.LocalDateTime.parse(iso.take(19)).toLocalDate().format(java.time.format.DateTimeFormatter
        .ofLocalizedDate(java.time.format.FormatStyle.SHORT).withLocale(java.util.Locale.forLanguageTag(I18n.lang)))
} catch (_: Exception) { iso.take(10) } }
