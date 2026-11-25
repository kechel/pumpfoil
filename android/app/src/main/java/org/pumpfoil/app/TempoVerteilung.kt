package org.pumpfoil.app

import android.content.Context
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import java.util.Locale

/*
 * Tempo-Verteilung (Web 7cbc6abf6 + bc91dd51d, Jan 24.11.2026, docs/TEMPO-VERTEILUNG.md): Anteil der Zeit auf dem Foil je
 * km/h-Stufe. Port von web TempoVerteilung.tsx (Diagramm), TempoBereich.tsx (Home › Stats › Tempo), SessionTempo.tsx +
 * lib/tempoHist.ts (Session-Details, im Geraet aus den schon geladenen Daten gerechnet).
 *
 * * Balken = Hauptreihe; unten dunkler der Anteil in ERKANNTEN Gleitphasen (pg-1, findet etwa die Haelfte — der Hinweis
 *   darunter sagt das). Hochgerechnet je Stufe ueber die Laeufe, fuer die Gleiten bekannt ist (`g_basis`).
 * * Stufenlinie = Vergleich (anderes Foil, Community, ganze Session).
 * * Band oben: 10./50./90. Perzentil — der „nutzbare Bereich".
 * Nur Anteile, keine Sekunden-Achse: so lassen sich Reihen mit ganz verschiedener Fahrzeit vergleichen.
 */

@Serializable
data class TempoAuswahl(val id: Int, val label: String = "", val s: Double = 0.0)

/** GET /api/tempo/eigen — Sekunden je Stufe (`breite_kmh`), dazu die Foils/Spots mit Fahrzeit im Zeitraum. */
@Serializable
data class TempoEigen(
    @SerialName("breite_kmh") val breiteKmh: Double = TEMPO_BREITE_KMH,
    val a: List<Double> = emptyList(),
    val g: List<Double>? = null,
    @SerialName("g_basis") val gBasis: List<Double>? = null,
    val sessions: Int = 0,
    val unvollstaendig: Int = 0,
    val foils: List<TempoAuswahl> = emptyList(),
    val spots: List<TempoAuswahl> = emptyList(),
)

/** GET /api/tempo/foil/{id} — alle Fahrer auf einem Foil, Promille, erst ab `min_fahrer` (`genug`). */
@Serializable
data class TempoFoil(
    @SerialName("breite_kmh") val breiteKmh: Double = TEMPO_BREITE_KMH,
    val fahrer: Int = 0,
    val sessions: Int = 0,
    @SerialName("min_fahrer") val minFahrer: Int = 3,
    val genug: Boolean = false,
    val a: List<Double>? = null,
    val g: List<Double>? = null,
    @SerialName("g_basis") val gBasis: List<Double>? = null,
)

/** Eine Reihe fuers Diagramm (Sekunden oder Anteile — gezeigt werden immer Anteile). */
data class TempoReihe(val a: List<Double>, val g: List<Double>? = null, val gBasis: List<Double>? = null, val label: String = "")

const val TEMPO_BREITE_KMH = 0.5
const val TEMPO_STUFEN = 80

private val FARBE = Color(0xFF22D3EE)        // Marke (cyan-400)
private val FARBE_GLEIT = Color(0xFF0891B2)  // cyan-600: Teil des Ganzen, gleicher Farbton dunkler
private val FARBE_VGL = Color(0xFFF59E0B)    // amber-500: zweite Reihe

private fun stufe(v: Double) = Math.floor(v * 3.6 / TEMPO_BREITE_KMH).toInt().coerceIn(0, TEMPO_STUFEN - 1)

/**
 * Tempo-Verteilung aus Laeufen und 1-s-Tempo — DIESELBE Regel wie server analysis/tempo_hist.py (und web lib/tempoHist.ts),
 * damit Session und Stats-Reiter dieselben Zahlen zeigen: nur Punkte innerhalb der Laeufe, halboffen [i_start, i_end);
 * jeder Punkt zaehlt duration_s / (i_end - i_start) Sekunden (GPS hat Loecher, Index ist nicht Sekunde); Gleiten nur aus
 * pg-1 (`pg_glides`, wo `pg_pumps` gesetzt ist).
 */
fun tempoHistLokal(segments: List<Segment>, speeds1: List<Double?>): TempoReihe {
    val a = DoubleArray(TEMPO_STUFEN)
    val g = DoubleArray(TEMPO_STUFEN)
    val gb = DoubleArray(TEMPO_STUFEN)
    var mitGleiten = false
    val n = speeds1.size
    for (sg in segments) {
        val i = sg.iStart
        val j0 = sg.iEnd
        if (j0 <= i || i >= n || i < 0) continue
        val j = minOf(j0, n - 1)
        if (j <= i) continue
        val w = sg.durationS / (j - i)
        val glidesRoh = sg.pgGlides as? JsonArray
        val pg = sg.pgPumps != null && glidesRoh != null
        val gleit = HashSet<Int>()
        if (pg) {
            mitGleiten = true
            glidesRoh!!.forEach { gl ->
                val arr = gl as? JsonArray ?: return@forEach
                val x = (arr.getOrNull(0) as? JsonPrimitive)?.doubleOrNull
                val y = (arr.getOrNull(1) as? JsonPrimitive)?.doubleOrNull
                if (x != null && y != null && x.isFinite() && y.isFinite()) {
                    var k = x
                    while (k < y) { gleit.add(k.toInt()); k += 1.0 }
                }
            }
        }
        for (k in i until j) {
            val v = speeds1[k] ?: continue
            val b = stufe(v)
            a[b] += w
            if (pg) gb[b] += w
            if (k in gleit) g[b] += w
        }
    }
    return TempoReihe(a.toList(), if (mitGleiten) g.toList() else null, if (mitGleiten) gb.toList() else null)
}

/** 1-s-Tempo aus dem Track (properties.speeds["1"], sonst speeds_mps) MIT Luecken — parseTrack macht daraus 0,0. */
internal fun speeds1MitLuecken(trackGeojson: JsonElement?): List<Double?> = try {
    val props = (trackGeojson as? JsonObject)?.get("properties") as? JsonObject
    val arr = ((props?.get("speeds") as? JsonObject)?.get("1") as? JsonArray) ?: (props?.get("speeds_mps") as? JsonArray)
    arr?.map { if (it is JsonNull) null else (it as? JsonPrimitive)?.doubleOrNull } ?: emptyList()
} catch (_: Exception) { emptyList() }

/** Stufen auf `faktor` zusammenfassen (0,5 -> 1 km/h). */
private fun buendeln(xs: List<Double>?, faktor: Int): List<Double> = xs?.chunked(faktor) { it.sum() } ?: emptyList()

private fun perzentil(anteile: List<Double>, p: Double, breite: Double): Double {
    var s = 0.0
    for (k in anteile.indices) {
        if (s + anteile[k] >= p) return (k + (if (anteile[k] > 0) (p - s) / anteile[k] else 0.0)) * breite
        s += anteile[k]
    }
    return anteile.size * breite
}

private fun fmtMin(s: Double) = when {
    s >= 3600 -> String.format(Locale.ROOT, "%.1f h", s / 3600)
    s >= 60 -> "${Math.round(s / 60)} min"
    else -> "${Math.round(s)} s"
}
private fun kmhText(v: Double) = if (v == Math.floor(v)) "${v.toLong()}" else String.format(Locale.ROOT, "%.1f", v)
private fun pct(v: Double) = String.format(Locale.ROOT, if (v < 0.1) "%.1f %%" else "%.0f %%", v * 100)

private class TempoDaten(val br: Double, val ah: List<Double>, val anH: List<Double>, val anV: List<Double>, val anG: List<Double>?,
                         val lo: Int, val hi: Int, val yMax: Double, val sumH: Double, val p: List<Double>)

private fun rechnen(haupt: TempoReihe, vergleich: TempoReihe?, breiteKmh: Double, sekunden: Boolean): TempoDaten {
    val sumH = haupt.a.sum()
    // Feiner (0,5 km/h) erst ab 2 h Fahrzeit und ohne Vergleich, sonst wird die Kurve zackig und zwei Reihen lassen
    // sich schlecht nebeneinander lesen. Anteile statt Sekunden ab hier.
    val faktor = if (sekunden && sumH >= 7200 && vergleich == null) 1 else maxOf(1, Math.round(1 / breiteKmh).toInt())
    val br = breiteKmh * faktor
    val ah = buendeln(haupt.a, faktor)
    val gh = buendeln(haupt.g, faktor)
    val gb = buendeln(haupt.gBasis, faktor)
    val av = if (vergleich != null) buendeln(vergleich.a, faktor) else emptyList()
    val sumV = av.sum()
    val anH = ah.map { if (sumH > 0) it / sumH else 0.0 }
    val anV = av.map { if (sumV > 0) it / sumV else 0.0 }
    // Gleit-Anteil je Stufe: Verhaeltnis aus den Laeufen mit pg-1, auf die ganze Stufe hochgerechnet.
    val anG = if (gh.isNotEmpty() && gb.any { it > 0 })
        anH.mapIndexed { k, x -> val b = gb.getOrElse(k) { 0.0 }; if (b > 0) x * minOf(gh.getOrElse(k) { 0.0 } / b, 1.0) else 0.0 } else null
    // Bereich: Ausreisser (GPS-Spruenge) abschneiden — 0,2 % an jedem Ende, ueber beide Reihen.
    fun grenze(an: List<Double>): Pair<Int, Int> {
        var s = 0.0; var lo = 0; var hi = an.size - 1
        for (k in an.indices) { s += an[k]; if (s > 0.002) { lo = k; break } }
        s = 0.0
        for (k in an.indices.reversed()) { s += an[k]; if (s > 0.002) { hi = k; break } }
        return lo to hi
    }
    val (l1, h1) = grenze(anH)
    val (l2, h2) = if (av.isNotEmpty() && sumV > 0) grenze(anV) else l1 to h1
    val lo = maxOf(0, minOf(l1, l2) - 1)
    val hi = minOf(anH.size - 1, maxOf(h1, h2) + 1)
    val ausschnitt = (lo..hi).flatMap { k -> listOfNotNull(anH.getOrNull(k), anV.getOrNull(k)) }
    val yMax = maxOf(ausschnitt.maxOrNull() ?: 0.0, 0.001)
    return TempoDaten(br, ah, anH, anV, anG, lo, hi, yMax, sumH, listOf(0.1, 0.5, 0.9).map { perzentil(anH, it, br) })
}

/** Das Diagramm (web TempoVerteilung.tsx): Legende, Balken, Tipp zeigt die Stufe, Bereich, Tabelle zum Aufklappen. */
@Composable
fun TempoVerteilung(haupt: TempoReihe, vergleich: TempoReihe?, breiteKmh: Double, sekunden: Boolean = true) {
    val d = remember(haupt, vergleich, breiteKmh, sekunden) { rechnen(haupt, vergleich, breiteKmh, sekunden) }
    val grau = MaterialTheme.colorScheme.onSurfaceVariant
    var hover by remember(d) { mutableStateOf<Int?>(null) }
    var tabelle by rememberSaveable { mutableStateOf(false) }
    if (d.sumH <= 0 || d.hi < d.lo) {
        Text(I18n.t("tempo.empty"), style = MaterialTheme.typography.bodySmall, color = grau)
        return
    }
    val mitVgl = vergleich != null && d.anV.isNotEmpty()
    Column {
        // Legende nur, wenn es mehr als eine Farbe gibt
        if (d.anG != null || mitVgl) {
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(bottom = 4.dp),
                verticalAlignment = Alignment.CenterVertically) {
                LegendeEintrag(FARBE, haupt.label, balken = true)
                if (d.anG != null) LegendeEintrag(FARBE_GLEIT, I18n.t("tempo.glideShare"), balken = true)
                if (mitVgl) LegendeEintrag(FARBE_VGL, vergleich!!.label, balken = false)
            }
        }
        val messer = rememberTextMeasurer()
        val linie = MaterialTheme.colorScheme.outlineVariant
        val achse = MaterialTheme.colorScheme.outline
        val band = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.45f)
        val median = MaterialTheme.colorScheme.onSurface
        val hoverFarbe = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.10f)
        val schrift = TextStyle(fontSize = 10.sp, color = grau)
        val n = d.hi - d.lo + 1
        // y-Achse: glatter Hoechstwert in Prozent
        val schritt = listOf(1, 2, 5, 10, 20, 25, 50).firstOrNull { d.yMax * 100 / it <= 5 } ?: 50
        val yTop = Math.ceil(d.yMax * 100 / schritt) * schritt / 100
        val xSchritt = if (n * d.br > 24) 5 else if (n * d.br > 10) 2 else 1
        val aria = I18n.t("tempo.aria").replace("{p10}", kmhText(d.p[0])).replace("{p50}", kmhText(d.p[1])).replace("{p90}", kmhText(d.p[2]))
        Canvas(Modifier.fillMaxWidth().height(200.dp).semantics { contentDescription = aria }
            .pointerInput(d) {
                detectTapGestures { pos ->
                    val l = 34.dp.toPx(); val r = 8.dp.toPx()
                    val bw = (size.width - l - r) / n
                    val i = Math.floor(((pos.x - l) / bw).toDouble()).toInt()
                    hover = if (i in 0 until n) (if (hover == d.lo + i) null else d.lo + i) else null
                }
            }) {
            val L = 34.dp.toPx(); val R = 8.dp.toPx(); val T = 26.dp.toPx(); val B = 22.dp.toPx()
            val W = size.width; val H = size.height
            val bw = (W - L - R) / n
            fun x(kmh: Double) = (L + ((kmh / d.br) - d.lo) * bw).toFloat()
            fun y(v: Double) = (H - B - (v / yTop) * (H - T - B)).toFloat()
            // Gitter + y-Beschriftung (Prozent)
            var v = 0.0
            while (v <= yTop + 1e-9) {
                drawLine(linie, Offset(L, y(v)), Offset(W - R, y(v)), 1f)
                val t = messer.measure("${Math.round(v * 100)}", schrift)
                drawText(t, topLeft = Offset(L - 4.dp.toPx() - t.size.width, y(v) - t.size.height / 2f))
                v += schritt / 100.0
            }
            val prozent = messer.measure("%", schrift)
            drawText(prozent, topLeft = Offset(L - 4.dp.toPx() - prozent.size.width, T - 10.dp.toPx() - prozent.size.height))
            // Nutzbarer Bereich: 10.–90. Perzentil als Band oben, Median als Strich
            drawRoundRect(band, Offset(x(d.p[0]), T - 16.dp.toPx()), Size(maxOf(x(d.p[2]) - x(d.p[0]), 1f), 4.dp.toPx()),
                CornerRadius(2.dp.toPx()))
            drawLine(median, Offset(x(d.p[1]), T - 19.dp.toPx()), Offset(x(d.p[1]), T - 9.dp.toPx()), 2.dp.toPx())
            // Tipp: Stufe hinterlegen statt die anderen abzudunkeln — abgedunkeltes Cyan saehe aus wie der Gleit-Anteil.
            hover?.let { hk -> drawRect(hoverFarbe, Offset(L + (hk - d.lo) * bw, T), Size(bw, H - T - B)) }
            val luecke = if (bw > 4f) 1.dp.toPx().coerceAtMost(bw / 4) else 0f
            for (k in d.lo..d.hi) {
                val vk = d.anH.getOrElse(k) { 0.0 }
                val x0 = L + (k - d.lo) * bw + luecke
                val w = maxOf(bw - 2 * luecke, 1f)
                if (vk > 0) {
                    val r = minOf(3.dp.toPx(), w / 2)
                    val pfad = Path().apply {
                        addRoundRect(RoundRect(Rect(x0, y(vk), x0 + w, y(0.0)), topLeft = CornerRadius(r), topRight = CornerRadius(r)))
                    }
                    drawPath(pfad, FARBE)
                }
                val gk = d.anG?.getOrElse(k) { 0.0 } ?: 0.0
                if (gk > 0) {
                    val oben = y(gk) + (if (vk - gk > 0.0005) 1f else 0f)
                    drawRect(FARBE_GLEIT, Offset(x0, oben), Size(w, maxOf(y(0.0) - oben, 0f)))
                }
            }
            // Vergleich als Stufenlinie ueber die Balken
            if (mitVgl) {
                val pfad = Path()
                for (k in d.lo..d.hi) {
                    val x0 = L + (k - d.lo) * bw
                    val yy = y(d.anV.getOrElse(k) { 0.0 })
                    if (k == d.lo) pfad.moveTo(x0, yy) else pfad.lineTo(x0, yy)
                    pfad.lineTo(x0 + bw, yy)
                }
                drawPath(pfad, FARBE_VGL, style = Stroke(width = 2.dp.toPx(), join = StrokeJoin.Round))
            }
            drawLine(achse, Offset(L, y(0.0)), Offset(W - R, y(0.0)), 1f)
            // x-Beschriftung (km/h)
            var tv = Math.ceil(d.lo * d.br / xSchritt) * xSchritt
            while (tv <= (d.hi + 1) * d.br + 1e-9) {
                val t = messer.measure(kmhText(tv), schrift)
                drawText(t, topLeft = Offset(x(tv) - t.size.width / 2f, H - B + 3.dp.toPx()))
                tv += xSchritt
            }
            val einheit = messer.measure("km/h", schrift)
            drawText(einheit, topLeft = Offset(W - R - einheit.size.width, H - einheit.size.height))
        }
        // Angetippte Stufe (statt der schwebenden Box im Web)
        hover?.let { hk ->
            Column(Modifier.fillMaxWidth().padding(top = 4.dp).clip(RoundedCornerShape(8.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant).padding(horizontal = 8.dp, vertical = 4.dp)) {
                Text("${kmhText(hk * d.br)}–${kmhText((hk + 1) * d.br)} km/h", style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold)
                Text("${haupt.label}: ${pct(d.anH[hk])}" + (if (sekunden) " · ${fmtMin(d.ah[hk])}" else ""),
                    style = MaterialTheme.typography.labelSmall)
                d.anG?.let { Text("${I18n.t("tempo.glideShare")}: ${pct(it[hk])}", style = MaterialTheme.typography.labelSmall) }
                if (mitVgl) Text("${vergleich!!.label}: ${pct(d.anV.getOrElse(hk) { 0.0 })}", style = MaterialTheme.typography.labelSmall)
            }
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(I18n.t("tempo.range").replace("{p10}", kmhText(d.p[0])).replace("{p50}", kmhText(d.p[1]))
                .replace("{p90}", kmhText(d.p[2])) + (if (sekunden) " · ${fmtMin(d.sumH)}" else ""),
                style = MaterialTheme.typography.bodySmall, color = grau, modifier = Modifier.weight(1f))
            TextButton(onClick = { tabelle = !tabelle }) {
                Text(I18n.t(if (tabelle) "tempo.hideTable" else "tempo.showTable"), style = MaterialTheme.typography.bodySmall)
            }
        }
        if (tabelle) {
            val kopf = MaterialTheme.typography.labelSmall
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)).padding(horizontal = 8.dp, vertical = 4.dp)) {
                Row(Modifier.fillMaxWidth()) {
                    Text("km/h", style = kopf, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
                    Text(haupt.label, style = kopf, fontWeight = FontWeight.Medium, textAlign = TextAlign.End, modifier = Modifier.weight(1f))
                    if (d.anG != null) Text(I18n.t("tempo.glideShare"), style = kopf, fontWeight = FontWeight.Medium,
                        textAlign = TextAlign.End, modifier = Modifier.weight(1f))
                    if (mitVgl) Text(vergleich!!.label, style = kopf, fontWeight = FontWeight.Medium, textAlign = TextAlign.End,
                        modifier = Modifier.weight(1f), maxLines = 2)
                }
                for (k in d.lo..d.hi) {
                    Row(Modifier.fillMaxWidth().padding(vertical = 1.dp)) {
                        Text("${kmhText(k * d.br)}–${kmhText((k + 1) * d.br)}", style = kopf, color = grau, modifier = Modifier.weight(1f))
                        Text(pct(d.anH[k]), style = kopf, textAlign = TextAlign.End, modifier = Modifier.weight(1f))
                        d.anG?.let { Text(pct(it[k]), style = kopf, textAlign = TextAlign.End, modifier = Modifier.weight(1f)) }
                        if (mitVgl) Text(pct(d.anV.getOrElse(k) { 0.0 }), style = kopf, textAlign = TextAlign.End, modifier = Modifier.weight(1f))
                    }
                }
            }
        }
        if (d.anG != null) Text(I18n.t("tempo.glideHint"), style = MaterialTheme.typography.bodySmall, color = grau,
            modifier = Modifier.padding(top = 4.dp))
    }
}

@Composable
private fun LegendeEintrag(farbe: Color, text: String, balken: Boolean) {
    Row(Modifier.padding(end = 14.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(width = if (balken) 12.dp else 16.dp, height = if (balken) 12.dp else 2.dp)
            .clip(RoundedCornerShape(2.dp)).background(farbe))
        Spacer(Modifier.width(6.dp))
        Text(text, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
    }
}

// Zeitraeume wie web PERIODS (pages/Home.tsx)
private val TEMPO_ZEITRAEUME = listOf(
    "today" to "period.today", "yesterday" to "period.yesterday", "10d" to "period.10d", "30d" to "period.30d",
    "365d" to "period.365d", "all" to "period.all")

/** Kleine Beschriftung ueber einem Auswahlfeld (das Web hat sie nur als aria-label; hier sieht man sonst nicht, was es ist). */
@Composable
private fun Feld(label: String, modifier: Modifier, inhalt: @Composable () -> Unit) {
    Column(modifier) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        inhalt()
    }
}

/**
 * Home › Stats › Tempo (web TempoBereich.tsx): die eigene Tempo-Verteilung, gefiltert nach Zeitraum, Foil und Spot; Vergleich
 * mit einem anderen eigenen Foil oder mit allen Fahrern auf dem gewaehlten Foil.
 */
@Composable
fun TempoBereich() {
    var period by rememberSaveable { mutableStateOf("all") }
    var foilId by rememberSaveable { mutableStateOf<Int?>(null) }
    var spotId by rememberSaveable { mutableStateOf<Int?>(null) }
    var vgl by rememberSaveable { mutableStateOf("") }          // "" | "foil:<id>" | "community"
    var d by remember { mutableStateOf<TempoEigen?>(null) }
    var vd by remember { mutableStateOf<TempoReihe?>(null) }
    var vInfo by remember { mutableStateOf<TempoFoil?>(null) }
    var fehler by remember { mutableStateOf(false) }
    val grau = MaterialTheme.colorScheme.onSurfaceVariant

    LaunchedEffect(period, foilId, spotId) {
        fehler = false
        try { d = Api.tempoEigen(period = period, foilId = foilId, spotId = spotId) } catch (_: Exception) { fehler = true }
    }
    LaunchedEffect(vgl, period, spotId, foilId, d?.foils?.size) {
        vd = null; vInfo = null
        if (vgl.startsWith("foil:")) {
            val id = vgl.drop(5).toIntOrNull() ?: return@LaunchedEffect
            val label = d?.foils?.firstOrNull { it.id == id }?.label ?: ""
            try { vd = TempoReihe(Api.tempoEigen(period = period, foilId = id, spotId = spotId).a, label = label) } catch (_: Exception) {}
        } else if (vgl == "community" && foilId != null) {
            try {
                val r = Api.tempoFoil(foilId!!)
                vInfo = r
                if (r.genug && r.a != null) vd = TempoReihe(r.a, label = I18n.t("tempo.community").replace("{n}", "${r.fahrer}"))
            } catch (_: Exception) {}
        }
    }
    // Vergleich mit dem gerade gewaehlten Foil selbst ergibt nichts -> zuruecksetzen
    LaunchedEffect(foilId, vgl) { if (vgl == "foil:$foilId" || (vgl == "community" && foilId == null)) vgl = "" }

    val fLabel = foilId?.let { id -> d?.foils?.firstOrNull { it.id == id }?.label }
    val label = fLabel ?: I18n.t("tempo.mine")

    Column(Modifier.fillMaxWidth()) {
        Text(I18n.t("tempo.title"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Text(I18n.t("tempo.intro"), style = MaterialTheme.typography.bodySmall, color = grau, modifier = Modifier.padding(top = 2.dp, bottom = 8.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Feld(I18n.t("tempo.period"), Modifier.weight(1f)) {
                Dropdown(TEMPO_ZEITRAEUME.map { (k, l) -> k to I18n.t(l) }, period, { period = it })
            }
            Feld(I18n.t("tempo.foil"), Modifier.weight(1f)) {
                Dropdown(listOf("" to I18n.t("tempo.allFoils")) + d?.foils.orEmpty().map { "${it.id}" to it.label },
                    foilId?.toString() ?: "", { foilId = it.toIntOrNull() })
            }
        }
        Spacer(Modifier.height(6.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Feld(I18n.t("tempo.spot"), Modifier.weight(1f)) {
                Dropdown(listOf("" to I18n.t("tempo.allSpots")) + d?.spots.orEmpty().map { "${it.id}" to it.label },
                    spotId?.toString() ?: "", { spotId = it.toIntOrNull() })
            }
            Feld(I18n.t("tempo.compare"), Modifier.weight(1f)) {
                Dropdown(listOf("" to "—") +
                    (if (foilId != null) listOf("community" to I18n.t("tempo.compareCommunity")) else emptyList()) +
                    d?.foils.orEmpty().filter { it.id != foilId }.map { "foil:${it.id}" to it.label },
                    vgl, { vgl = it })
            }
        }
        Spacer(Modifier.height(10.dp))
        if (fehler) Text(I18n.t("tempo.error"), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        d?.let { e ->
            TempoVerteilung(TempoReihe(e.a, e.g, e.gBasis, label), vd, e.breiteKmh)
            if (vgl == "community" && vInfo != null && !vInfo!!.genug) {
                Text(I18n.t("tempo.communityTooFew").replace("{n}", "${vInfo!!.minFahrer}").replace("{m}", "${vInfo!!.fahrer}"),
                    style = MaterialTheme.typography.bodySmall, color = grau, modifier = Modifier.padding(top = 4.dp))
            }
            if (e.unvollstaendig > 0) Text(I18n.t("tempo.incomplete").replace("{n}", "${e.unvollstaendig}"),
                style = MaterialTheme.typography.bodySmall, color = grau, modifier = Modifier.padding(top = 4.dp))
        }
    }
}

private const val TEMPO_OFFEN = "pumpfoil_session_tempo_offen"

/**
 * Session-Details › Tempo-Verteilung (web SessionTempo.tsx): aufklappbar unter der Lauftabelle. Ganze Session, oder — ist ein
 * Lauf gewaehlt — dieser Lauf mit der Session als Vergleichslinie. Der Besitzer kann stattdessen mit seinen uebrigen Sessions
 * auf demselben Foil vergleichen (nur er: das verraet etwas ueber seine anderen Sessions). Auf-/Zugeklappt wird gemerkt.
 */
@Composable
fun SessionTempo(sessionId: Int, segments: List<Segment>, trackGeojson: JsonElement?, selectedRun: Int?,
                 foilId: Int?, foilLabel: String?, eigene: Boolean) {
    val ctx = LocalContext.current
    val prefs = remember { ctx.getSharedPreferences("pumpfoil", Context.MODE_PRIVATE) }
    var offen by remember { mutableStateOf(prefs.getBoolean(TEMPO_OFFEN, false)) }
    var vgl by remember(sessionId) { mutableStateOf("auto") }       // auto | keiner | foil
    var foilReihe by remember(sessionId) { mutableStateOf<TempoReihe?>(null) }
    var foilLeer by remember(sessionId) { mutableStateOf(false) }
    val speeds1 = remember(trackGeojson) { speeds1MitLuecken(trackGeojson) }
    val lauf = selectedRun?.takeIf { it in segments.indices }
    val session = remember(segments, speeds1) { tempoHistLokal(segments, speeds1) }
    val einLauf = remember(segments, speeds1, lauf) { lauf?.let { tempoHistLokal(listOf(segments[it]), speeds1) } }
    val sessionsAndere = I18n.t("tempo.sessionOthers").replace("{foil}", foilLabel ?: "")
    // „keiner" gibt es nur mit gewaehltem Lauf
    LaunchedEffect(lauf) { if (lauf == null && vgl == "keiner") vgl = "auto" }

    LaunchedEffect(offen, vgl, foilId, sessionId) {
        if (!offen || vgl != "foil" || foilId == null || foilReihe != null) return@LaunchedEffect
        try {
            val r = Api.tempoEigen(foilId = foilId, ohneSession = sessionId, period = "all")
            if (r.a.any { it > 0 }) foilReihe = TempoReihe(r.a, label = sessionsAndere) else foilLeer = true
        } catch (_: Exception) { foilLeer = true }
    }
    if (session.a.none { it > 0 }) return

    val laufText = lauf?.let { I18n.t("tempo.run").replace("{n}", "${it + 1}") }
    val haupt = if (einLauf != null) einLauf.copy(label = laufText ?: "") else session.copy(label = I18n.t("tempo.thisSession"))
    val vergleich = when {
        vgl == "foil" -> foilReihe
        vgl == "auto" && einLauf != null -> TempoReihe(session.a, label = I18n.t("tempo.thisSession"))
        else -> null
    }
    Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
        Column(Modifier.padding(12.dp)) {
            Text((if (offen) "▾ " else "▸ ") + I18n.t("tempo.title") + (laufText?.let { " · $it" } ?: ""),
                style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.fillMaxWidth().clickable {
                    offen = !offen
                    prefs.edit().putBoolean(TEMPO_OFFEN, offen).apply()
                })
            if (!offen) return@Column
            Spacer(Modifier.height(8.dp))
            if (einLauf != null || (eigene && foilId != null)) {
                Feld(I18n.t("tempo.compare"), Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
                    Dropdown(buildList {
                        add("auto" to (if (einLauf != null) I18n.t("tempo.wholeSession") else "—"))
                        if (einLauf != null) add("keiner" to "—")
                        if (eigene && foilId != null) add("foil" to sessionsAndere)
                    }, vgl, { vgl = it })
                }
            }
            TempoVerteilung(haupt, vergleich, TEMPO_BREITE_KMH)
            if (vgl == "foil" && foilLeer) Text(I18n.t("tempo.sessionOthersNone"), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
        }
    }
}
