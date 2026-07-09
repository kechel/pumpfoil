package org.pumpfoil.app

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
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
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

// Uhren-Statistik (spiegelt web/WatchStats): Community-Aggregat je Uhr-Modell — welche
// Werte werden mit welcher Uhr gefahren. Mobil als Cards statt breiter Tabelle.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WatchStatsScreen(onBack: () -> Unit) {
    var rows by remember { mutableStateOf<List<WatchStat>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        try { rows = Api.watchStats() } catch (e: Exception) { error = e.message; rows = emptyList() }
    }

    Scaffold(topBar = {
        TopAppBar(
            title = { Text(I18n.t("watchStats.title")) },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Zurück")
                }
            },
        )
    }) { pad ->
        val list = rows
        if (list == null) {
            Box(Modifier.padding(pad).fillMaxSize()) { CircularProgressIndicator(Modifier.align(Alignment.Center)) }
            return@Scaffold
        }
        LazyColumn(Modifier.padding(pad).fillMaxSize().padding(horizontal = 12.dp)) {
            item {
                Text(I18n.t("watchStats.hint"),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(vertical = 8.dp))
            }
            error?.let { e -> item { Text(e, color = MaterialTheme.colorScheme.error) } }
            if (list.isEmpty() && error == null) {
                item { Text(I18n.t("watchStats.none"), color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(8.dp)) }
            }
            items(list, key = { it.watch }) { s -> watchCard(s) }
        }
    }
}

@Composable
private fun watchCard(s: WatchStat) {
    Card(Modifier.fillMaxWidth().padding(bottom = 10.dp)) {
        Column(Modifier.padding(12.dp)) {
            Text(s.watch, fontWeight = FontWeight.SemiBold)
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                wMetric("${s.sessions}", I18n.t("nav.sessions"))
                wMetric("${s.users}", I18n.t("watchStats.users"))
                wMetric(s.foilingKm?.let { "%.1f".format(it) } ?: "–", I18n.t("watchStats.km"))
            }
            Row(Modifier.fillMaxWidth().padding(top = 10.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                wMetric(s.avgSpeedKmh?.let { "%.1f".format(it) } ?: "–", "Ø km/h")
                wMetric(s.bestSpeedKmh?.let { "%.1f".format(it) } ?: "–", I18n.t("watchStats.bestSpeed"))
                wMetric(s.avgPumpHz?.let { "%.2f".format(it) } ?: "–", "Ø Hz")
            }
        }
    }
}

@Composable
private fun wMetric(value: String, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.primary)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
