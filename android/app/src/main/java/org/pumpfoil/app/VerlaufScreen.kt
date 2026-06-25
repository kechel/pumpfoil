package org.pumpfoil.app

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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

    suspend fun load() {
        loading = true
        try { items = Api.history().reversed(); error = null }  // neueste zuerst
        catch (e: Exception) { error = e.message }
        loading = false
    }
    LaunchedEffect(Unit) { load() }

    Scaffold(topBar = { TopAppBar(title = { Text("Verlauf") }) }) { pad ->
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
                        item { Text("Noch keine Auswertungen", Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    }
                    if (items.isNotEmpty()) {
                        item {
                            Row(Modifier.fillMaxWidth().padding(start = 12.dp, end = 12.dp, top = 8.dp),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                listOf(0 to "Gesamt", 30 to "30 T", 7 to "7 T").forEach { (d, lbl) ->
                                    FilterChip(selected = windowDays == d, onClick = { windowDays = d }, label = { Text(lbl) })
                                }
                            }
                        }
                        item { CumulativeSummary(shown, windowDays) }
                    }
                    items(shown) { p ->
                        ListItem(
                            modifier = Modifier.clickable { onOpen(p.sessionId) },
                            headlineContent = { Text(prettyDate(p.startedAt)) },
                            supportingContent = {
                                Text("%.2f km Foiling · %d Läufe · %d Pumps · max %.1f km/h"
                                    .format(p.foilingKm, p.runs, p.pumps, p.speed * 3.6))
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

// Kumuliert über alle geladenen Sessions (wie web/Verlauf): Summen-Karte oben.
@Composable
private fun CumulativeSummary(items: List<HistoryPoint>, windowDays: Int) {
    val km = items.sumOf { it.foilingKm }
    val runs = items.sumOf { it.runs }
    val pumps = items.sumOf { it.pumps }
    val windowLabel = if (windowDays == 0) "Gesamt" else "$windowDays Tage"
    Card(Modifier.fillMaxWidth().padding(12.dp)) {
        Column(Modifier.padding(12.dp)) {
            Text("Kumuliert · $windowLabel", style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                metric("${items.size}", "Sessions")
                metric("%.1f".format(km), "km Foiling")
                metric("$runs", "Läufe")
                metric("$pumps", "Pumps")
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
