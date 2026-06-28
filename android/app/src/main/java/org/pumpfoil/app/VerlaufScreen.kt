package org.pumpfoil.app

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ShowChart
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VerlaufScreen(onOpen: (Int) -> Unit) {
    var items by remember { mutableStateOf<List<HistoryPoint>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var windowDays by remember { mutableStateOf(0) }   // 0 = Gesamt, sonst Tage
    var metric by remember { mutableStateOf(HMetric.KM) }

    suspend fun load() {
        loading = true
        try { items = Api.history().reversed(); error = null }  // neueste zuerst
        catch (e: Exception) { error = e.message }
        loading = false
    }
    LaunchedEffect(Unit) { load() }

    Scaffold(topBar = { TopAppBar(title = { Text(I18n.t("nav.history")) }) }) { pad ->
        val scope = rememberCoroutineScope()
        Box(Modifier.padding(pad)) {
            Refreshable(refreshing = loading, onRefresh = { scope.launch { load() } }) {
            if (loading && items.isEmpty()) {
                CircularProgressIndicator(Modifier.align(Alignment.Center))
            } else {
                val shown = if (windowDays == 0) items else items.filter { withinDays(it.startedAt, windowDays) }
                LazyColumn(Modifier.fillMaxSize()) {
                    error?.let { e -> item { Text(e, Modifier.padding(16.dp), color = MaterialTheme.colorScheme.error) } }
                    if (items.isEmpty() && !loading && error == null) {
                        item { Text(I18n.t("verlauf.empty"), Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    }
                    if (items.isNotEmpty()) {
                        item {
                            Row(Modifier.fillMaxWidth().padding(start = 12.dp, end = 12.dp, top = 8.dp),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                listOf(0 to I18n.t("verlauf.total"), 30 to "30 ${I18n.t("verlauf.daysAbbr")}", 7 to "7 ${I18n.t("verlauf.daysAbbr")}").forEach { (d, lbl) ->
                                    FilterChip(selected = windowDays == d, onClick = { windowDays = d }, label = { Text(lbl) })
                                }
                            }
                        }
                        item { CumulativeSummary(shown, windowDays) }
                        if (shown.size >= 2) {
                            // shown ist neueste-zuerst -> für den Chart chronologisch (alt->neu).
                            item { HistoryChartCard(shown.asReversed().map { metric.value(it) }, metric) { metric = it } }
                        }
                    }
                    items(shown) { p ->
                        ListItem(
                            modifier = Modifier.clickable { onOpen(p.sessionId) },
                            headlineContent = { Text(prettyDate(p.startedAt)) },
                            // Verbund-String: Einheiten universell, nur Wörter lokalisiert.
                            supportingContent = {
                                val mpp = if (p.pumps > 0) p.foilingKm * 1000.0 / p.pumps else 0.0
                                Text("%.2f km · %d %s · %d Pumps · %s m/Pump · max %.1f km/h"
                                    .format(p.foilingKm, p.runs, I18n.t("home.runs"), p.pumps,
                                        if (mpp > 0) "%.1f".format(mpp) else "–", p.speed * 3.6))
                            },
                            leadingContent = {
                                Icon(Icons.Filled.ShowChart, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                            },
                        )
                        HorizontalDivider()
                    }
                }
            }
            }
        }
    }
}

// Auswählbare Trend-Metrik (spiegelt iOS/Web-History-Serien).
private enum class HMetric(val labelKey: String?, val literal: String?) {
    KM(null, "km"), RUNS("home.runs", null), PUMPS("home.pumps", null), SPEED(null, "km/h"), PER_PUMP(null, "m/P");

    fun short(): String = literal ?: I18n.t(labelKey!!)

    fun value(p: HistoryPoint): Double = when (this) {
        KM -> p.foilingKm
        RUNS -> p.runs.toDouble()
        PUMPS -> p.pumps.toDouble()
        SPEED -> p.speed * 3.6
        PER_PUMP -> if (p.pumps > 0) p.foilingKm * 1000.0 / p.pumps else 0.0
    }

    fun fmt(v: Double): String = when (this) {
        RUNS, PUMPS -> v.toInt().toString()
        else -> "%.1f".format(v)
    }
}

// Schlanker Balken-Trend (Canvas) — ein Balken je Session, alt->neu; umschaltbare Metrik.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun HistoryChartCard(points: List<Double>, metric: HMetric, onMetric: (HMetric) -> Unit) {
    Card(Modifier.fillMaxWidth().padding(horizontal = 12.dp)) {
        Column(Modifier.padding(12.dp)) {
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                HMetric.values().forEach { m ->
                    FilterChip(selected = m == metric, onClick = { onMetric(m) }, label = { Text(m.short()) })
                }
            }
            Spacer(Modifier.height(10.dp))
            val barColor = MaterialTheme.colorScheme.primary
            Canvas(Modifier.fillMaxWidth().height(120.dp)) {
                if (points.isEmpty()) return@Canvas
                val maxV = (points.maxOrNull() ?: 1.0).coerceAtLeast(1e-4)
                val n = points.size
                val gap = if (n > 1) (size.width / n * 0.3f).coerceAtMost(3f) else 0f
                val bw = ((size.width - gap * (n - 1)) / n).coerceAtLeast(1f)
                points.forEachIndexed { i, v ->
                    val h = (v.coerceAtLeast(0.0) / maxV).toFloat() * size.height
                    val x = i * (bw + gap)
                    drawRoundRect(
                        color = barColor,
                        topLeft = Offset(x, size.height - h),
                        size = Size(bw, h.coerceAtLeast(1f)),
                        cornerRadius = CornerRadius(minOf(2f, bw / 2f)),
                    )
                }
            }
            points.maxOrNull()?.let {
                Text("max ${metric.fmt(it)}", style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
            }
        }
    }
}

// Kumuliert über alle geladenen Sessions (wie web/Verlauf): Summen-Karte oben.
@Composable
private fun CumulativeSummary(items: List<HistoryPoint>, windowDays: Int) {
    val km = items.sumOf { it.foilingKm }
    val runs = items.sumOf { it.runs }
    val pumps = items.sumOf { it.pumps }
    val windowLabel = if (windowDays == 0) I18n.t("verlauf.total") else "$windowDays ${I18n.t("verlauf.daysWord")}"
    Card(Modifier.fillMaxWidth().padding(12.dp)) {
        Column(Modifier.padding(12.dp)) {
            Text("${I18n.t("verlauf.cumulative")} · $windowLabel", style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                metric("${items.size}", I18n.t("nav.sessions"))
                metric("%.1f".format(km), I18n.t("verlauf.kmFoiling"))
                metric("$runs", I18n.t("home.runs"))
                metric("$pumps", I18n.t("home.pumps"))
            }
        }
    }
}

@Composable
private fun metric(value: String, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.primary)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

// started_at (ISO) innerhalb der letzten N Tage? Bei Parse-Fehler einschließen.
private fun withinDays(iso: String, days: Int): Boolean {
    return try {
        val t = try { java.time.Instant.parse(iso) }
        catch (_: Exception) { java.time.OffsetDateTime.parse(iso).toInstant() }
        t.isAfter(java.time.Instant.now().minus(days.toLong(), java.time.temporal.ChronoUnit.DAYS))
    } catch (_: Exception) { true }
}
