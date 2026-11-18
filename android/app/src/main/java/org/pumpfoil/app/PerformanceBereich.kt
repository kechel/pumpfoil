package org.pumpfoil.app

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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerialName
import java.time.LocalDate

/**
 * Home › Performance (Web PerformanceBereich.tsx, 18.11.2026; Idee eines Fahrers). Je Kalendertag (UTC) die EIGENE
 * Platzierung in vier Kategorien gegen alle Fahrer weltweit (Server /api/community/performance). Foil Scoot nur
 * zusammen mit Pumpfoil (Jan 18.11.: zu wenige Scooter fuer ein eigenes Feld).
 */
@Serializable
data class PerfZeile(val tag: String, val wert: Double, val platz: Int, val feld: Int, val perzentil: Double,
                     @SerialName("session_id") val sessionId: Int)

@Serializable
data class PerfAntwort(val sport: String = "pumpfoil", @SerialName("min_feld") val minFeld: Int = 5, val ab: String = "",
                       val kategorien: Map<String, List<PerfZeile>> = emptyMap())

private val KATS = listOf("sprint_100m", "sprint_60s", "run_distance", "run_time")
private val PerfCyan = Color(0xFF22D3EE)   // Markenfarbe (brand-design)
private val BUCKETS: List<Pair<String, (Int) -> Boolean>> = listOf(
    "1" to { p -> p == 1 }, "2" to { p -> p == 2 }, "3" to { p -> p == 3 },
    "4–5" to { p -> p in 4..5 }, "6–10" to { p -> p in 6..10 },
    // Weitere Stufen (Jan 18.11.2026): die Felder haben 15 bis 80 Fahrer, „11+" sagte zu wenig.
    "11–20" to { p -> p in 11..20 }, "21–30" to { p -> p in 21..30 }, "31–50" to { p -> p in 31..50 }, "51+" to { p -> p > 50 })

private fun wertText(k: String, v: Double): String = when (k) {
    "sprint_100m", "sprint_60s" -> "%.1f km/h".format(v * 3.6)
    "run_distance" -> "${Math.round(v)} m"
    else -> { val s = Math.round(v).toInt(); "%d:%02d min".format(s / 60, s % 60) }
}

// Eine Farbe, Deckkraft nach Perzentil; die Platzzahl steht immer in der Zelle.
private fun zellFarbe(perz: Double): Color = PerfCyan.copy(alpha = (0.12 + 0.78 * (perz / 100).coerceIn(0.0, 1.0)).toFloat())

@Composable
fun PerformanceBereich(onOpenSession: (Int) -> Unit) {
    var sport by rememberSaveable { mutableStateOf("pumpfoil") }
    var nur30 by rememberSaveable { mutableStateOf(false) }
    var daten by remember { mutableStateOf<PerfAntwort?>(null) }
    var fehler by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(sport) {
        daten = null; fehler = null
        try { daten = Api.performance(sport) } catch (e: Exception) { fehler = e.message ?: "?" }
    }
    val grenze = if (nur30) LocalDate.now().minusDays(30).toString() else ""
    val je = KATS.associateWith { k -> (daten?.kategorien?.get(k) ?: emptyList()).filter { it.tag >= grenze } }
    val alle = KATS.flatMap { je[it] ?: emptyList() }
    val tage = alle.map { it.tag }.distinct().sortedDescending()
    fun quote(n: Int) = if (alle.isEmpty()) "–" else "${Math.round(100.0 * n / alle.size)} %"
    val grau = MaterialTheme.colorScheme.onSurfaceVariant

    Column(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf("pumpfoil", "pumpfoil+foil_scoot").forEach { s ->
                FilterChip(selected = sport == s, onClick = { sport = s }, colors = cyanChipColors(),
                    label = { Text(s.split("+").joinToString(" + ") { I18n.t("cls.sport.$it") }) })
            }
            FilterChip(selected = !nur30, onClick = { nur30 = false }, colors = cyanChipColors(),
                label = { Text(I18n.t("perf.seit").replace("{datum}", daten?.ab ?: "…")) })
            FilterChip(selected = nur30, onClick = { nur30 = true }, colors = cyanChipColors(),
                label = { Text(I18n.t("perf.tage30")) })
        }
        Text(I18n.t("perf.intro").replace("{n}", "${daten?.minFeld ?: 5}"), style = MaterialTheme.typography.bodyMedium,
            color = grau, modifier = Modifier.padding(vertical = 8.dp))

        val d = daten
        when {
            fehler != null -> Text(fehler!!, color = MaterialTheme.colorScheme.error)
            d == null -> Box(Modifier.fillMaxWidth().padding(24.dp)) { CircularProgressIndicator(Modifier.align(Alignment.Center)) }
            alle.isEmpty() -> Card(Modifier.fillMaxWidth()) {
                Text(I18n.t("perf.leer"), Modifier.padding(16.dp), textAlign = TextAlign.Center)
            }
            else -> {
                // Kennzahlen
                val kpis = listOf(
                    I18n.t("perf.tage") to "${tage.size}",
                    I18n.t("perf.besserAls") to "${Math.round(alle.sumOf { it.perzentil } / alle.size)} %",
                    I18n.t("perf.siege") to "${alle.count { it.platz == 1 }}",
                    I18n.t("perf.podium") to quote(alle.count { it.platz <= 3 }),
                    I18n.t("perf.top10") to quote(alle.count { it.platz <= 10 }))
                kpis.chunked(3).forEach { reihe ->
                    Row(Modifier.fillMaxWidth().padding(bottom = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        reihe.forEach { (l, v) ->
                            Card(Modifier.weight(1f)) {
                                Column(Modifier.padding(10.dp)) {
                                    Text(l, style = MaterialTheme.typography.labelSmall, color = grau, maxLines = 1)
                                    Text(v, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                                }
                            }
                        }
                        repeat(3 - reihe.size) { Spacer(Modifier.weight(1f)) }
                    }
                }

                // Je Kategorie: Haeufigkeit der Plaetze
                KATS.forEach { k ->
                    val z = je[k] ?: emptyList()
                    Card(Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
                        Column(Modifier.padding(12.dp)) {
                            Text(I18n.t("perf.kat.$k"), fontWeight = FontWeight.SemiBold)
                            if (z.isEmpty()) {
                                Text(I18n.t("perf.keineTage"), style = MaterialTheme.typography.bodySmall, color = grau)
                            } else {
                                Text(I18n.t("perf.katZeile").replace("{n}", "${z.size}")
                                    .replace("{perz}", "${Math.round(z.sumOf { it.perzentil } / z.size)}"),
                                    style = MaterialTheme.typography.bodySmall, color = grau)
                                val max = maxOf(1, BUCKETS.maxOf { (_, f) -> z.count { f(it.platz) } })
                                BUCKETS.forEach { (label, f) ->
                                    val n = z.count { f(it.platz) }
                                    Row(Modifier.fillMaxWidth().padding(top = 3.dp), verticalAlignment = Alignment.CenterVertically) {
                                        Text(label, Modifier.width(44.dp), style = MaterialTheme.typography.labelSmall, color = grau, textAlign = TextAlign.End)
                                        Spacer(Modifier.width(6.dp))
                                        Box(Modifier.weight(1f).height(10.dp).clip(RoundedCornerShape(3.dp))
                                            .background(MaterialTheme.colorScheme.surfaceVariant)) {
                                            if (n > 0) Box(Modifier.fillMaxWidth(n.toFloat() / max).height(10.dp)
                                                .clip(RoundedCornerShape(3.dp)).background(PerfCyan))
                                        }
                                        Text("$n", Modifier.width(28.dp), style = MaterialTheme.typography.labelSmall, textAlign = TextAlign.End)
                                    }
                                }
                                val bestPlatz = z.minOf { it.platz }
                                val bestWert = z.maxOf { it.wert }
                                Text(I18n.t("perf.bester").replace("{platz}", "$bestPlatz").replace("{wert}", wertText(k, bestWert)),
                                    style = MaterialTheme.typography.bodySmall, color = grau, modifier = Modifier.padding(top = 6.dp))
                            }
                        }
                    }
                }

                // Raster Kategorie x Tag: Zahl = Platz, Farbe = Anteil geschlagener Fahrer, Tippen oeffnet die Session
                Card(Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
                    Column(Modifier.padding(12.dp)) {
                        Text(I18n.t("perf.raster"), fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(bottom = 6.dp))
                        Row {
                            Column {
                                Spacer(Modifier.height(18.dp))
                                KATS.forEach { k ->
                                    Box(Modifier.height(32.dp).widthIn(max = 110.dp), contentAlignment = Alignment.CenterStart) {
                                        Text(I18n.t("perf.kat.$k"), style = MaterialTheme.typography.labelSmall, maxLines = 2)
                                    }
                                }
                            }
                            Spacer(Modifier.width(6.dp))
                            Row(Modifier.horizontalScroll(rememberScrollState())) {
                                tage.forEach { tag ->
                                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                        Text(tag.substring(8, 10).trimStart('0') + "." + tag.substring(5, 7).trimStart('0') + ".",
                                            style = MaterialTheme.typography.labelSmall, color = grau, fontSize = 10.sp,
                                            modifier = Modifier.height(18.dp))
                                        KATS.forEach { k ->
                                            val z = je[k]?.firstOrNull { it.tag == tag }
                                            Box(Modifier.padding(2.dp).size(width = 30.dp, height = 28.dp).clip(RoundedCornerShape(4.dp))
                                                .background(if (z != null) zellFarbe(z.perzentil) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f))
                                                .then(if (z != null) Modifier.clickable { onOpenSession(z.sessionId) } else Modifier),
                                                contentAlignment = Alignment.Center) {
                                                if (z != null) Text("${z.platz}", fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        Row(Modifier.padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(I18n.t("perf.legende"), style = MaterialTheme.typography.labelSmall, color = grau)
                            listOf(10, 50, 90).forEach { p ->
                                Spacer(Modifier.width(6.dp))
                                Box(Modifier.size(width = 18.dp, height = 10.dp).clip(RoundedCornerShape(3.dp)).background(zellFarbe(p.toDouble())))
                                Text(" $p %", style = MaterialTheme.typography.labelSmall, color = grau)
                            }
                        }
                    }
                }

                // Verlauf: Ø Perzentil je Tag ueber alle Kategorien
                Card(Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
                    Column(Modifier.padding(12.dp)) {
                        Text(I18n.t("perf.verlauf"), fontWeight = FontWeight.SemiBold)
                        val punkte = tage.reversed().map { tag -> alle.filter { it.tag == tag }.let { z -> z.sumOf { it.perzentil } / z.size } }
                        if (punkte.size < 2) {
                            Text(I18n.t("perf.zuWenig"), style = MaterialTheme.typography.bodySmall, color = grau)
                        } else {
                            val linie = MaterialTheme.colorScheme.outlineVariant
                            Canvas(Modifier.fillMaxWidth().height(140.dp).padding(top = 8.dp)) {
                                fun x(i: Int) = size.width * i / (punkte.size - 1)
                                fun y(p: Double) = (size.height * (100 - p) / 100).toFloat()
                                listOf(0.0, 50.0, 100.0).forEach { p -> drawLine(linie, Offset(0f, y(p)), Offset(size.width, y(p)), 1f) }
                                for (i in 1 until punkte.size) drawLine(PerfCyan, Offset(x(i - 1), y(punkte[i - 1])), Offset(x(i), y(punkte[i])), 4f)
                                punkte.forEachIndexed { i, p -> drawCircle(PerfCyan, 7f, Offset(x(i), y(p))) }
                            }
                            Row(Modifier.fillMaxWidth()) {
                                Text(tage.last(), style = MaterialTheme.typography.labelSmall, color = grau)
                                Spacer(Modifier.weight(1f))
                                Text(tage.first(), style = MaterialTheme.typography.labelSmall, color = grau)
                            }
                        }
                    }
                }
                Text(I18n.t("perf.hinweis"), style = MaterialTheme.typography.bodySmall, color = grau, modifier = Modifier.padding(bottom = 12.dp))
            }
        }
    }
}
