package org.pumpfoil.app

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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckBox
import androidx.compose.material.icons.filled.CheckBoxOutlineBlank
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
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
fun CompareScreen(onBack: () -> Unit, onOpen: (Int) -> Unit = {}) {
    var sessions by remember { mutableStateOf<List<SessionSummary>>(emptyList()) }
    val selected by CompareStore.ids.collectAsState()   // per Long-Press in den Listen befüllt
    var results by remember { mutableStateOf<List<SessionDetail>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var comparing by remember { mutableStateOf(false) }
    var merging by remember { mutableStateOf(false) }
    var mergeError by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        sessions = try { Api.sessions() } catch (_: Exception) { emptyList() }
        loading = false
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (comparing) I18n.t("compare.result") else I18n.t("compare.title")) },
                navigationIcon = {
                    IconButton(onClick = { if (comparing) comparing = false else onBack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Zurück")
                    }
                },
            )
        },
    ) { pad ->
        Box(Modifier.padding(pad).fillMaxSize()) {
            when {
                loading -> CircularProgressIndicator(Modifier.align(Alignment.Center))
                comparing -> CompareTable(results)
                else -> Column(Modifier.fillMaxSize()) {
                    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(I18n.t("compare.pick"), color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(I18n.t("compare.hint"), style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        if (selected.isNotEmpty()) TextButton(onClick = { CompareStore.clear() }) { Text(I18n.t("compare.clear")) }
                    }
                    LazyColumn(Modifier.weight(1f)) {
                        items(sessions) { s ->
                            val on = selected.contains(s.id)
                            ListItem(
                                modifier = Modifier.clickable { CompareStore.toggle(s.id) },
                                headlineContent = { Text(prettyDate(s.startedAt)) },
                                supportingContent = { s.placeName?.takeIf { it.isNotBlank() }?.let { Text(it) } },
                                leadingContent = {
                                    Icon(
                                        if (on) Icons.Filled.CheckBox else Icons.Filled.CheckBoxOutlineBlank,
                                        contentDescription = null,
                                        tint = if (on) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                },
                            )
                            HorizontalDivider()
                        }
                    }
                    mergeError?.let {
                        Text(it, Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    }
                    Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = {
                                scope.launch {
                                    results = selected.toList().mapNotNull { try { Api.session(it) } catch (_: Exception) { null } }
                                    comparing = true
                                }
                            },
                            enabled = selected.size >= 2,
                            modifier = Modifier.weight(1f),
                        ) { Text("${I18n.t("compare.title")} (${selected.size})") }
                        Button(
                            onClick = {
                                val ids = selected.toList(); mergeError = null; merging = true
                                scope.launch {
                                    try {
                                        val newId = Api.mergeSessions(ids)
                                        CompareStore.clear(); WatchSync.tick.value++; merging = false; onOpen(newId)
                                    } catch (e: Exception) { mergeError = e.message; merging = false }
                                }
                            },
                            enabled = selected.size >= 2 && !merging,
                            modifier = Modifier.weight(1f),
                        ) { Text(I18n.t("merge.action")) }
                    }
                }
            }
        }
    }
}

@Composable
private fun CompareTable(sessions: List<SessionDetail>) {
    // Kennzahlen-Zeilen; Spalten = Sessions.
    val metrics: List<Pair<String, (SessionDetail) -> String>> = listOf(
        I18n.t("compare.distance") to { s -> s.analysis?.totalDistanceM?.let { "%.0f m".format(it) } ?: "–" },
        I18n.t("home.foiling") to { s -> s.analysis?.foilingDistanceM?.let { "%.0f m".format(it) } ?: "–" },
        I18n.t("home.topSpeed") to { s -> s.analysis?.maxSpeedMps?.let { "%.1f km/h".format(it * 3.6) } ?: "–" },
        I18n.t("home.pumps") to { s -> s.analysis?.pumpCount?.toString() ?: "–" },
        I18n.t("compare.foilTime") to { s -> s.analysis?.foilingTimeS?.let { "%d:%02d".format((it / 60).toInt(), (it % 60).toInt()) } ?: "–" },
        I18n.t("compare.cadence") to { s -> s.analysis?.avgCadenceHz?.let { "%.2f Hz".format(it) } ?: "–" },
    )
    val cell = 110.dp
    Column(Modifier.fillMaxSize().horizontalScroll(rememberScrollState()).padding(12.dp)) {
        // Kopfzeile mit Datum je Session.
        Row {
            Box(Modifier.width(96.dp)) {}
            sessions.forEach { s ->
                Text(prettyDate(s.startedAt).take(10), Modifier.width(cell).padding(4.dp),
                    style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
            }
        }
        HorizontalDivider()
        metrics.forEach { (label, fn) ->
            Row(Modifier.padding(vertical = 6.dp)) {
                Text(label, Modifier.width(96.dp), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                sessions.forEach { s ->
                    Text(fn(s), Modifier.width(cell).padding(horizontal = 4.dp), style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
}
