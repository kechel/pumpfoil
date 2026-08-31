package org.pumpfoil.app

/**
 * Synchrones Abspielen im Session-Vergleich — die Zeitrechnung dahinter.
 *
 * Portiert aus `web/src/lib/syncPlayback.ts`; bewusst Zeile fuer Zeile dieselbe Rechnung, damit
 * Web und Apps denselben Moment zeigen. Wer hier etwas aendert, aendert es dort mit.
 *
 * **Warum das ueberhaupt gerechnet werden muss:** ein Trackpunkt ist NICHT eine Sekunde. Der
 * Server liefert zum Track keine Zeitstempel je Punkt, und bei GPS-Aussetzern laeuft der
 * Sample-Index gegen die Uhr auseinander (gemessen: 1000 → 1734 ms je Index innerhalb EINER
 * Session). Stuetzpunkte gibt es nur an den Laufgrenzen — `i_start`/`i_end` zusammen mit
 * `t_start_session_ms`/`t_end_session_ms`. Zwischen zwei Stuetzpunkten wird linear gerechnet,
 * an den Raendern mit 1 Hz extrapoliert.
 *
 * **Nur `t_*_session_ms` taugt fuer eine Uhrzeit**, nicht `t_start_ms` — letzteres ist auf den
 * Trim verschoben (docs/DATA-PIPELINE.md).
 */

private const val MS_JE_SAMPLE = 1000.0

/** Kuerzere Luecken NICHT ueberspringen: unter ein paar Sekunden wirkt ein Sprung wie ein Ruckler. */
private const val MIN_SPRUNG_MS = 5000.0

/** Etwas Vorlauf/Nachlauf um jeden Lauf — sonst setzt das Bild genau im ersten Pump ein. */
private const val RAND_MS = 2000.0

private fun epochMs(iso: String?): Double? =
    if (iso.isNullOrBlank()) null
    else try { java.time.OffsetDateTime.parse(iso).toInstant().toEpochMilli().toDouble() }
    catch (_: Exception) { null }

/** Umrechnung Sample-Index ↔ absolute Zeit fuer EINE Session. */
class Zeitachse(private val anker: List<Pair<Int, Double>>, val von: Double, val bis: Double,
                private val start: Double) {

    /** Absolute Zeit an einem (auch gebrochenen) Sample-Index. */
    fun zeit(i: Double): Double {
        val x = i.coerceIn(anker.first().first.toDouble(), anker.last().first.toDouble())
        var lo = 0
        var hi = anker.size - 1
        while (hi - lo > 1) {
            val m = (lo + hi) / 2
            if (anker[m].first <= x) lo = m else hi = m
        }
        val a = anker[lo]
        val b = anker[hi]
        val f = if (b.first == a.first) 0.0 else (x - a.first) / (b.first - a.first)
        return start + a.second + f * (b.second - a.second)
    }

    /** Sample-Index zu einer absoluten Zeit; `null`, wenn die Session da nicht aufgezeichnet hat. */
    fun index(tAbs: Double): Double? {
        if (tAbs < von || tAbs > bis) return null
        val ms = tAbs - start
        var lo = 0
        var hi = anker.size - 1
        while (hi - lo > 1) {
            val m = (lo + hi) / 2
            if (anker[m].second <= ms) lo = m else hi = m
        }
        val a = anker[lo]
        val b = anker[hi]
        val f = if (b.second == a.second) 0.0 else (ms - a.second) / (b.second - a.second)
        return a.first + f * (b.first - a.first)
    }
}

fun zeitachseVon(session: SessionDetail, punkte: Int): Zeitachse? {
    val segs = session.analysis?.segments ?: return null
    val start = epochMs(session.startedAt) ?: return null
    if (punkte == 0 || segs.isEmpty()) return null

    // Anker einsammeln und nach Index sortieren. Doppelte Indizes (zwei Segmente stossen
    // aneinander) fallen weg — sonst entstuende eine Stufe mit Steigung 0.
    val roh = ArrayList<Pair<Int, Double>>()
    for (s in segs) {
        s.tStartSessionMs?.let { roh.add(s.iStart to it) }
        s.tEndSessionMs?.let { roh.add(s.iEnd to it) }
    }
    roh.sortBy { it.first }
    val anker = ArrayList<Pair<Int, Double>>()
    for (a in roh) {
        val letzter = anker.lastOrNull()
        if (letzter != null && a.first == letzter.first) continue
        // Nicht-monotone Anker verwerfen statt die Achse rueckwaerts laufen zu lassen.
        if (letzter != null && a.second <= letzter.second) continue
        anker.add(a)
    }
    if (anker.size < 2) return null

    // Raender ergaenzen: vor dem ersten und nach dem letzten Lauf mit der GPS-Rate extrapolieren.
    val erster = anker.first()
    val letzter = anker.last()
    if (erster.first > 0) anker.add(0, 0 to (erster.second - erster.first * MS_JE_SAMPLE))
    if (letzter.first < punkte - 1) {
        anker.add((punkte - 1) to (letzter.second + (punkte - 1 - letzter.first) * MS_JE_SAMPLE))
    }
    return Zeitachse(anker, start + anker.first().second, start + anker.last().second, start)
}

data class Zeitraum(val von: Double, var bis: Double)

/**
 * Die Laeufe einer Session als absolute Zeitraeume — dort ist jemand on foil.
 *
 * `nur` = die im Vergleich AUSGEWAEHLTEN Laeufe (null = ganze Session). Wer einzelne Laeufe
 * nebeneinanderlegt, will auch genau die abgespielt sehen; ohne diese Einschraenkung liefen
 * Fahrer durchs Bild, die im Vergleich gar nicht stehen.
 */
fun laufZeitraeume(session: SessionDetail, nur: Set<Int>?): List<Zeitraum> {
    val segs = session.analysis?.segments ?: return emptyList()
    val start = epochMs(session.startedAt) ?: return emptyList()
    val out = ArrayList<Zeitraum>()
    segs.forEachIndexed { i, s ->
        if (nur != null && i !in nur) return@forEachIndexed
        val a = s.tStartSessionMs
        val b = s.tEndSessionMs
        if (a != null && b != null && b > a) out.add(Zeitraum(start + a, start + b))
    }
    return out
}

/** Ueberlappende/nahe Zeitraeume zu einer aufsteigenden, ueberschneidungsfreien Liste verschmelzen. */
fun verschmelzen(alle: List<Zeitraum>): List<Zeitraum> {
    val sortiert = alle.sortedBy { it.von }
    val out = ArrayList<Zeitraum>()
    for (z in sortiert) {
        val l = out.lastOrNull()
        if (l != null && z.von - l.bis <= MIN_SPRUNG_MS) l.bis = maxOf(l.bis, z.bis)
        else out.add(Zeitraum(z.von, z.bis))
    }
    return out
}

class SyncPlan(
    val sessions: List<SessionDetail>,
    val achsen: Map<Int, Zeitachse>,
    /** Die im Vergleich ausgewaehlten Laeufe je Session (null = ganze Session). */
    val laeufe: Map<Int, Set<Int>?>,
    /** Abschnitte, in denen MINDESTENS EINER on foil ist — nur die werden abgespielt. */
    val aktiv: List<Zeitraum>,
    /** Summe der aktiven Abschnitte in ms = die Laenge der Wiedergabe. */
    val dauerMs: Double,
) {
    /** Wiedergabe-Position (0…dauerMs) → absolute Uhrzeit. */
    fun zuUhrzeit(posMs: Double): Double {
        var rest = posMs.coerceIn(0.0, dauerMs)
        for (z in aktiv) {
            val laenge = z.bis - z.von
            if (rest <= laenge) return z.von + rest
            rest -= laenge
        }
        return aktiv.last().bis
    }

    /** Wie viel Leerlauf faellt weg — die Zahl, die den Nutzen erklaert. */
    val uebersprungenMin: Double
        get() {
            val von = sessions.mapNotNull { achsen[it.id]?.von }.minOrNull() ?: return 0.0
            val bis = sessions.mapNotNull { achsen[it.id]?.bis }.maxOrNull() ?: return 0.0
            return maxOf(0.0, (bis - von) - dauerMs) / 60000.0
        }
}

/**
 * Baut den Plan — oder `null`, wenn synchrones Abspielen keinen Sinn ergibt.
 *
 * Bedingung (Jan): die Sessions muessen sich **zeitlich ueberschneiden** UND am **gleichen Spot**
 * sein. Beides zusammen, sonst laufen im Bild Leute nebeneinander her, die sich nie gesehen haben.
 *
 * `auswahl` = (Session, runIdx) je Vergleichs-Eintrag; runIdx = null heisst ganze Session.
 * `punkte` = Anzahl Trackpunkte je Session-Id (die kennt nur der Aufrufer, der den Track parst).
 */
fun syncPlan(auswahl: List<Pair<SessionDetail, Int?>>, punkte: Map<Int, Int>): SyncPlan? {
    // Je Session zusammenfassen: mehrfach dieselbe Session (mehrere ausgewaehlte Laeufe) ergibt
    // EINEN Eintrag mit allen ihren Laeufen. Steht die ganze Session auch nur einmal im Vergleich,
    // gilt die ganze Session — eine Auswahl kann eine andere nicht wieder einschraenken.
    val proSession = LinkedHashMap<Int, Pair<SessionDetail, MutableSet<Int>?>>()
    for ((s, runIdx) in auswahl) {
        val da = proSession[s.id]
        if (da == null) {
            proSession[s.id] = s to (if (runIdx == null) null else mutableSetOf(runIdx))
            continue
        }
        if (da.second == null || runIdx == null) proSession[s.id] = da.first to null
        else da.second!!.add(runIdx)
    }

    class Eintrag(val s: SessionDetail, val laeufe: Set<Int>?, val a: Zeitachse)
    val mitAchse = proSession.values.mapNotNull { (s, l) ->
        zeitachseVon(s, punkte[s.id] ?: 0)?.let { Eintrag(s, l, it) }
    }
    if (mitAchse.size < 2) return null

    // Nach Spot gruppieren; ohne Spotnamen kann man Gleichzeitigkeit nicht sinnvoll behaupten.
    val nachSpot = LinkedHashMap<String, MutableList<Eintrag>>()
    for (x in mitAchse) {
        val spot = (x.s.placeName ?: "").trim()
        if (spot.isEmpty()) continue
        nachSpot.getOrPut(spot) { ArrayList() }.add(x)
    }

    // Innerhalb eines Spots in ZUSAMMENHAENGENDE Gruppen zerlegen — nicht einfach alles nehmen,
    // was sich mit irgendwem ueberschneidet. Sonst wird aus zwei Ausfahrten am selben Tag
    // (morgens zu dritt, abends zu zweit) eine Wiedergabe, die mitten im Abspielen vom Morgen in
    // den Abend schneidet.
    val gruppen = ArrayList<List<Eintrag>>()
    for (proSpot in nachSpot.values) {
        val offen = ArrayList(proSpot)
        while (offen.isNotEmpty()) {
            val gruppe = arrayListOf(offen.removeAt(0))
            var gewachsen = true
            while (gewachsen) {
                gewachsen = false
                for (k in offen.indices.reversed()) {
                    val kandidat = offen[k]
                    if (gruppe.any { kandidat.a.von < it.a.bis && it.a.von < kandidat.a.bis }) {
                        gruppe.add(kandidat); offen.removeAt(k); gewachsen = true
                    }
                }
            }
            if (gruppe.size >= 2) gruppen.add(gruppe)
        }
    }
    // Die groesste Gruppe gewinnt; bei Gleichstand die mit der laengeren gemeinsamen Zeit.
    val beste = gruppen.sortedWith(
        compareByDescending<List<Eintrag>> { it.size }
            .thenByDescending { g -> (g.maxOf { it.a.bis } - g.minOf { it.a.von }) }
    ).firstOrNull() ?: return null
    if (beste.size < 2) return null

    val roh = ArrayList<Zeitraum>()
    for (x in beste) for (z in laufZeitraeume(x.s, x.laeufe)) {
        roh.add(Zeitraum(z.von - RAND_MS, z.bis + RAND_MS))
    }
    val aktiv = verschmelzen(roh)
    if (aktiv.isEmpty()) return null

    return SyncPlan(
        sessions = beste.map { it.s },
        achsen = beste.associate { it.s.id to it.a },
        laeufe = beste.associate { it.s.id to it.laeufe },
        aktiv = aktiv,
        dauerMs = aktiv.sumOf { it.bis - it.von },
    )
}
