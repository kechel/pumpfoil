package org.pumpfoil.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt

// Foil-Statistik (spiegelt web/FoilStats): Community-Vergleich je Foil — welche Werte
// werden mit welchem Material gefahren. Mobil als Cards statt breiter Tabelle;
// Sortierung über Chips (wie die sortierbaren Web-Spalten), leere Werte immer unten.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FoilStatsScreen(onBack: () -> Unit, onWatchStats: () -> Unit = {}) {
    var rows by remember { mutableStateOf<List<FoilStat>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var sortKey by remember { mutableStateOf("sessions") }
    var sortAsc by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        try { rows = Api.foilStats() } catch (e: Exception) { error = e.message; rows = emptyList() }
    }

    Scaffold(topBar = {
        TopAppBar(
            title = { Text(I18n.t("profile.stats")) },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Zurück")
                }
            },
            actions = {
                // Wie im Web: oben rechts zur jeweils anderen Statistik.
                TextButton(onClick = onWatchStats) { Text(I18n.t("watchStats.title")) }
            },
        )
    }) { pad ->
        val list = rows
        if (list == null) {
            Box(Modifier.padding(pad).fillMaxSize()) { CircularProgressIndicator(Modifier.align(Alignment.Center)) }
            return@Scaffold
        }
        val sorted = remember(list, sortKey, sortAsc) {
            sortStats(list, sortAsc, nameKey = if (sortKey == "name") ({ f: FoilStat -> "${f.brand} ${f.model} ${f.size}".lowercase() }) else null) {
                when (sortKey) {
                    "sessions" -> it.sessions.toDouble()
                    "users" -> it.users.toDouble()
                    "speed" -> it.avgSpeedKmh
                    "mpp" -> it.metersPerPump
                    "best" -> it.bestDistanceM
                    "hz" -> it.avgPumpHz
                    else -> it.sessions.toDouble()
                }
            }
        }
        fun sel(k: String) { if (sortKey == k) sortAsc = !sortAsc else { sortKey = k; sortAsc = (k == "name") } }
        LazyColumn(Modifier.padding(pad).fillMaxSize().padding(horizontal = 12.dp)) {
            item {
                Text(I18n.t("foilstats.intro"),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(vertical = 8.dp))
            }
            item {
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(bottom = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    sortChip("Foil", "name", sortKey, sortAsc, ::sel)
                    sortChip(I18n.t("nav.sessions"), "sessions", sortKey, sortAsc, ::sel)
                    sortChip(I18n.t("foilstats.riders"), "users", sortKey, sortAsc, ::sel)
                    sortChip("Ø km/h", "speed", sortKey, sortAsc, ::sel)
                    sortChip("m/Pump", "mpp", sortKey, sortAsc, ::sel)
                    sortChip(I18n.t("foilstats.bestKm"), "best", sortKey, sortAsc, ::sel)
                    sortChip("Ø Hz", "hz", sortKey, sortAsc, ::sel)
                }
            }
            error?.let { e -> item { Text(e, color = MaterialTheme.colorScheme.error) } }
            if (list.isEmpty() && error == null) {
                item { Text(I18n.t("common.noData"), color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(8.dp)) }
            }
            items(sorted, key = { it.foilId }) { s -> statCard(s) }
        }
    }
}

// Sortier-Chip: ausgewählt = gefüllt + Richtungspfeil; erneutes Tippen dreht die Richtung.
@Composable
fun sortChip(label: String, key: String, sortKey: String, sortAsc: Boolean, onSelect: (String) -> Unit) {
    FilterChip(selected = sortKey == key, onClick = { onSelect(key) },
        label = { Text(if (sortKey == key) "$label ${if (sortAsc) "↑" else "↓"}" else label) },
        colors = cyanChipColors())
}

// Nach Kennzahl sortieren; Einträge ohne Wert immer unten (wie web/SortableTable).
fun <T> sortStats(list: List<T>, asc: Boolean, nameKey: ((T) -> String)? = null, key: (T) -> Double?): List<T> {
    if (nameKey != null) {
        val s = list.sortedBy(nameKey)
        return if (asc) s else s.reversed()
    }
    val (has, none) = list.partition { key(it) != null }
    val s = has.sortedBy { key(it)!! }
    return (if (asc) s else s.reversed()) + none
}

@Composable
private fun statCard(s: FoilStat) {
    Card(Modifier.fillMaxWidth().padding(bottom = 10.dp)) {
        Column(Modifier.padding(12.dp)) {
            Text("${s.brand} ${s.model} ${s.size}", fontWeight = FontWeight.SemiBold)
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                metric("${s.sessions}", I18n.t("nav.sessions"))
                metric("${s.users}", I18n.t("foilstats.riders"))
                metric(s.avgSpeedKmh?.let { "%.1f".format(it) } ?: "–", "Ø km/h")
            }
            Row(Modifier.fillMaxWidth().padding(top = 10.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                metric(s.metersPerPump?.let { "%.1f".format(it) } ?: "–", "m/Pump")
                metric(s.bestDistanceM?.let { "${(it / 1000).let { km -> "%.2f".format(km) }}" } ?: "–", I18n.t("foilstats.bestKm"))
                metric(s.avgPumpHz?.let { "%.2f".format(it) } ?: "–", "Ø Hz")
            }
        }
    }
}

@Composable
private fun metric(value: String, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.primary)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Suppress("unused")
private fun roundKm(m: Double) = (m / 1000).roundToInt()
