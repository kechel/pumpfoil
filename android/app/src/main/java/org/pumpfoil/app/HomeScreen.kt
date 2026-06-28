package org.pumpfoil.app

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(onOpen: (Int) -> Unit) {
    var profile by remember { mutableStateOf<Profile?>(null) }
    var stats by remember { mutableStateOf<OverallStats?>(null) }
    var latest by remember { mutableStateOf<List<SessionSummary>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    val tick by WatchSync.tick.collectAsState()

    LaunchedEffect(tick) {
        loading = true
        profile = try { Api.me() } catch (_: Exception) { profile }
        stats = try { Api.stats() } catch (_: Exception) { null }
        latest = try { Api.sessions().take(3) } catch (_: Exception) { emptyList() }
        loading = false
    }

    Scaffold(topBar = { PumpfoilTopBar(I18n.t("nav.home")) { SyncIndicator() } }) { pad ->
        if (loading && stats == null) {
            Box(Modifier.padding(pad).fillMaxSize()) { CircularProgressIndicator(Modifier.align(Alignment.Center)) }
            return@Scaffold
        }
        Column(Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
            Text("${I18n.t("home.hello")} ${profile?.displayName ?: ""}".trim(), style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(12.dp))

            stats?.let { st ->
                // Gesamt-Kennzahlen.
                val totals = listOf(
                    I18n.t("nav.sessions") to st.count.toString(),
                    I18n.t("home.foiling") to "%.1f km".format(st.foilingKm),
                    I18n.t("home.runs") to st.runsTotal.toString(),
                    I18n.t("home.pumps") to st.pumps.toString(),
                )
                TileGrid(totals.map { Triple(it.first, it.second, null as Int?) }, onOpen)
                Spacer(Modifier.height(16.dp))
                // Persönliche Rekorde (klickbar zur Session).
                Text(I18n.t("home.records"), style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(8.dp))
                val r = st.records
                val recs = buildList {
                    r?.speed?.let { add(Triple(I18n.t("home.topSpeed"), "%.1f km/h".format(it.value * 3.6), it.sessionId)) }
                    r?.distance?.let { add(Triple(I18n.t("home.farthestRun"), fmtDist(it.value), it.sessionId)) }
                    r?.duration?.let { add(Triple(I18n.t("home.longestRun"), fmtDur(it.value), it.sessionId)) }
                    r?.glide?.let { add(Triple(I18n.t("home.longestGlide"), fmtDur(it.value), it.sessionId)) }
                    r?.runs?.let { add(Triple(I18n.t("home.mostRuns"), it.value.roundToInt().toString(), it.sessionId)) }
                }
                TileGrid(recs, onOpen)
            }

            if (latest.isNotEmpty()) {
                Spacer(Modifier.height(16.dp))
                Text(I18n.t("home.latest"), style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(8.dp))
                latest.forEach { s ->
                    SessionRow(s, Modifier.padding(vertical = 5.dp)) { onOpen(s.id) }
                }
            }
        }
    }
}

@Composable
private fun TileGrid(tiles: List<Triple<String, String, Int?>>, onOpen: (Int) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        tiles.chunked(2).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { (label, value, sid) ->
                    Card(
                        Modifier.weight(1f).then(
                            if (sid != null) Modifier.clickable { onOpen(sid) } else Modifier
                        )
                    ) {
                        Column(Modifier.padding(12.dp)) {
                            Text(value, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
                            Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
                if (row.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

private fun fmtDist(m: Double): String = if (m < 1000) "%.0f m".format(m) else "%.2f km".format(m / 1000)
private fun fmtDur(s: Double): String = "%d:%02d".format((s / 60).toInt(), (s % 60).toInt())
