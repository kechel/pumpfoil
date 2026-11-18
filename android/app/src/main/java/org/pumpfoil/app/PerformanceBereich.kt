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
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerialName
import java.time.LocalDate

/**
 * Home › Performance (Web PerformanceBereich.tsx, 18.11.2026; Idee eines Fahrers). Je Kalendertag (UTC) die EIGENE
 * Platzierung in vier Kategorien gegen alle Fahrer weltweit (Server /api/community/performance). Foil Scoot nur
 * zusammen mit Pumpfoil (Jan 18.11.: zu wenige Scooter fuer ein eigenes Feld).
 * 18.11. abends wie Web: Unterreiter Uebersicht | Verlauf, Kategorie-Tabelle, Bestleistungen, Platz je Tag je Kategorie,
 * Zeitraum „letzte 25 Tage mit Wertung".
 */
@Serializable
data class PerfZeile(val tag: String, val wert: Double, val platz: Int, val feld: Int, val perzentil: Double,
                     @SerialName("session_id") val sessionId: Int)

@Serializable
data class PerfAntwort(val sport: String = "pumpfoil", @SerialName("min_feld") val minFeld: Int = 5, val ab: String = "",
                       val kategorien: Map<String, List<PerfZeile>> = emptyMap())

private val KATS = listOf("sprint_100m", "sprint_60s", "run_distance", "run_time")
private val PerfCyan = Color(0xFF22D3EE)   // Markenfarbe (brand-design)
private val BandGruen = Color(0xFF10B981)
private val BandGelb = Color(0xFFF59E0B)
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

private fun tagKurz(tag: String) = tag.substring(8, 10).trimStart('0') + "." + tag.substring(5, 7).trimStart('0') + "."
private fun schnitt(xs: List<Double>) = if (xs.isEmpty()) 0.0 else xs.sum() / xs.size

// Eine Farbe, Deckkraft nach Perzentil; die Platzzahl steht immer in der Zelle.
private fun zellFarbe(perz: Double): Color = PerfCyan.copy(alpha = (0.12 + 0.78 * (perz / 100).coerceIn(0.0, 1.0)).toFloat())

@Composable
fun PerformanceBereich(onOpenSession: (Int) -> Unit) {
    var sport by rememberSaveable { mutableStateOf("pumpfoil") }
    var zeitraum by rememberSaveable { mutableStateOf("alle") }   // alle | 30 | 25
    var daten by remember { mutableStateOf<PerfAntwort?>(null) }
    var fehler by remember { mutableStateOf<String?>(null) }
    val reiter = listOf(ReiterDef("uebersicht", I18n.t("perf.tabUebersicht")), ReiterDef("verlauf", I18n.t("perf.tabVerlauf")))
    var sub by rememberReiter("homeperf", reiter.map { it.id }, "uebersicht")
    LaunchedEffect(sport) {
        daten = null; fehler = null
        try { daten = Api.performance(sport) } catch (e: Exception) { fehler = e.message ?: "?" }
    }
    val grenze = when (zeitraum) {
        "30" -> LocalDate.now().minusDays(30).toString()
        "25" -> KATS.flatMap { k -> daten?.kategorien?.get(k)?.map { it.tag } ?: emptyList() }.distinct().sortedDescending().getOrNull(24) ?: ""
        else -> ""
    }
    val je = KATS.associateWith { k -> (daten?.kategorien?.get(k) ?: emptyList()).filter { it.tag >= grenze } }
    val alle = KATS.flatMap { je[it] ?: emptyList() }
    val tage = alle.map { it.tag }.distinct().sortedDescending()
    val grau = MaterialTheme.colorScheme.onSurfaceVariant

    Column(Modifier.fillMaxWidth()) {
        Reiterleiste(reiter, sub, { sub = it }, stufe = 2, modifier = Modifier.padding(bottom = 10.dp))
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf("pumpfoil", "pumpfoil+foil_scoot").forEach { s ->
                FilterChip(selected = sport == s, onClick = { sport = s }, colors = cyanChipColors(),
                    label = { Text(s.split("+").joinToString(" + ") { I18n.t("cls.sport.$it") }) })
            }
        }
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf("alle" to I18n.t("perf.seit").replace("{datum}", daten?.ab ?: "…"), "30" to I18n.t("perf.tage30"),
                "25" to I18n.t("perf.letzte25")).forEach { (id, label) ->
                FilterChip(selected = zeitraum == id, onClick = { zeitraum = id }, colors = cyanChipColors(), label = { Text(label) })
            }
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
            sub == "verlauf" -> VerlaufTeil(je, alle, tage, onOpenSession)
            else -> UebersichtTeil(je, alle, tage, onOpenSession)
        }
    }
}

@Composable
private fun UebersichtTeil(je: Map<String, List<PerfZeile>>, alle: List<PerfZeile>, tage: List<String>, onOpenSession: (Int) -> Unit) {
    val grau = MaterialTheme.colorScheme.onSurfaceVariant
    fun quote(n: Int) = if (alle.isEmpty()) "–" else "${Math.round(100.0 * n / alle.size)} %"
    // Kennzahlen
    val kpis = listOf(
        I18n.t("perf.tage") to "${tage.size}",
        I18n.t("perf.besserAls") to "${Math.round(schnitt(alle.map { it.perzentil }))} %",
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

    // Kategorie-Tabelle: Ø Platz immer mit Ø Feld, sonst sagt die Zahl nichts
    Card(Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
        Column(Modifier.padding(12.dp)) {
            Text(I18n.t("perf.tabelle"), fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(bottom = 6.dp))
            KATS.forEachIndexed { i, k ->
                val z = je[k] ?: emptyList()
                if (i > 0) HorizontalDivider(Modifier.padding(vertical = 6.dp))
                Text(I18n.t("perf.kat.$k"), fontWeight = FontWeight.Medium)
                if (z.isEmpty()) {
                    Text(I18n.t("perf.keineTage"), style = MaterialTheme.typography.bodySmall, color = grau)
                } else {
                    Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                        tabZelle(I18n.t("perf.tage"), "${z.size}")
                        tabZelle(I18n.t("perf.spSchnitt"), I18n.t("perf.schnittVon")
                            .replace("{platz}", "%.1f".format(schnitt(z.map { it.platz.toDouble() })))
                            .replace("{feld}", "${Math.round(schnitt(z.map { it.feld.toDouble() }))}"))
                        tabZelle(I18n.t("perf.spBester"), "${z.minOf { it.platz }}")
                        tabZelle(I18n.t("perf.spTop3"), "${Math.round(100.0 * z.count { it.platz <= 3 } / z.size)} %")
                        tabZelle(I18n.t("perf.siege"), "${z.count { it.platz == 1 }}")
                    }
                }
            }
        }
    }

    // Bestleistungen: bester eigener Wert je Kategorie im Zeitraum, Tippen oeffnet die Session
    Card(Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
        Column(Modifier.padding(12.dp)) {
            Text(I18n.t("perf.bestleistungen"), fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(bottom = 6.dp))
            KATS.chunked(2).forEach { paar ->
                Row(Modifier.fillMaxWidth().padding(bottom = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    paar.forEach { k ->
                        val b = je[k]?.maxByOrNull { it.wert }
                        Column(Modifier.weight(1f).clip(RoundedCornerShape(8.dp))
                            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
                            .then(if (b != null) Modifier.clickable { onOpenSession(b.sessionId) } else Modifier)
                            .padding(8.dp)) {
                            Text(I18n.t("perf.kat.$k"), style = MaterialTheme.typography.labelSmall, color = grau, maxLines = 1,
                                overflow = TextOverflow.Ellipsis)
                            Text(b?.let { wertText(k, it.wert) } ?: "–", style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold, color = if (b != null) PerfCyan else grau)
                            if (b != null) Text(tagKurz(b.tag) + " · " + I18n.t("perf.platzVon").replace("{platz}", "${b.platz}")
                                .replace("{feld}", "${b.feld}"), style = MaterialTheme.typography.labelSmall, color = grau)
                        }
                    }
                }
            }
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
                        .replace("{perz}", "${Math.round(schnitt(z.map { it.perzentil }))}"),
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
                }
            }
        }
    }
    Text(I18n.t("perf.hinweis"), style = MaterialTheme.typography.bodySmall, color = grau, modifier = Modifier.padding(bottom = 12.dp))
}

@Composable
private fun tabZelle(label: String, wert: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(wert, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodyMedium)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun VerlaufTeil(je: Map<String, List<PerfZeile>>, alle: List<PerfZeile>, tage: List<String>, onOpenSession: (Int) -> Unit) {
    val grau = MaterialTheme.colorScheme.onSurfaceVariant
    var kat by rememberSaveable { mutableStateOf("sprint_100m") }
    val reihe = (je[kat] ?: emptyList()).sortedBy { it.tag }

    // Platz je Tag in EINER Kategorie: Hoehe = Anteil geschlagener Fahrer, Zahl = Platz; Baender ab 80 % / 50 %
    Card(Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
        Column(Modifier.padding(12.dp)) {
            Text(I18n.t("perf.platzverlauf"), fontWeight = FontWeight.SemiBold)
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                KATS.forEach { k ->
                    FilterChip(selected = kat == k, onClick = { kat = k }, colors = cyanChipColors(),
                        label = { Text(I18n.t("perf.kat.$k")) })
                }
            }
            if (reihe.isEmpty()) {
                Text(I18n.t("perf.keineTage"), style = MaterialTheme.typography.bodySmall, color = grau)
            } else {
                val linie = MaterialTheme.colorScheme.outlineVariant
                val n = reihe.size
                val jeder = if (n > 20) (n + 19) / 20 else 1   // nicht jede Zahl, sonst ueberlappen sie
                Box(Modifier.fillMaxWidth().height(160.dp).padding(top = 12.dp)) {
                    Canvas(Modifier.fillMaxWidth().height(148.dp)) {
                        fun x(i: Int) = if (n == 1) size.width / 2 else size.width * i / (n - 1)
                        fun y(p: Double) = (size.height * (100 - p) / 100).toFloat()
                        drawRect(BandGruen.copy(alpha = 0.15f), Offset(0f, y(100.0)), Size(size.width, y(80.0) - y(100.0)))
                        drawRect(BandGelb.copy(alpha = 0.10f), Offset(0f, y(80.0)), Size(size.width, y(50.0) - y(80.0)))
                        listOf(0.0, 50.0, 80.0, 100.0).forEach { p -> drawLine(linie, Offset(0f, y(p)), Offset(size.width, y(p)), 1f) }
                        for (i in 1 until n) drawLine(PerfCyan, Offset(x(i - 1), y(reihe[i - 1].perzentil)), Offset(x(i), y(reihe[i].perzentil)), 4f)
                        reihe.forEachIndexed { i, z -> drawCircle(PerfCyan, 7f, Offset(x(i), y(z.perzentil))) }
                    }
                }
                // Plaetze als Zahlenreihe darunter (Canvas kann hier keinen Text ohne TextMeasurer; so bleibt es lesbar)
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    reihe.forEachIndexed { i, z ->
                        if (i % jeder == 0) Column(Modifier.clickable { onOpenSession(z.sessionId) }, horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("${z.platz}", fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
                            Text(tagKurz(z.tag), fontSize = 9.sp, color = grau)
                        }
                    }
                }
            }
            Text(I18n.t("perf.platzverlaufHint"), style = MaterialTheme.typography.bodySmall, color = grau, modifier = Modifier.padding(top = 6.dp))
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
                            Text(tagKurz(tag), style = MaterialTheme.typography.labelSmall, color = grau, fontSize = 10.sp,
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
            val punkte = tage.reversed().map { tag -> schnitt(alle.filter { it.tag == tag }.map { it.perzentil }) }
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
}
