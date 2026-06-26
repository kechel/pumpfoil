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
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt

// Pro Aufruf evaluiert, damit der Sprachwechsel greift.
private fun periods() = listOf(
    "today" to I18n.t("records.today"),
    "10d" to "10 ${I18n.t("verlauf.daysAbbr")}", "30d" to "30 ${I18n.t("verlauf.daysAbbr")}",
    "365d" to I18n.t("records.year"), "all" to I18n.t("verlauf.total"),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CommunityRecordsScreen(onBack: () -> Unit, onOpen: (Int) -> Unit) {
    var data by remember { mutableStateOf<Map<String, PeriodRecords>?>(null) }
    var period by remember { mutableStateOf("all") }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        try { data = Api.communityRecords() } catch (e: Exception) { error = e.message }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(I18n.t("home.records")) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Zurück") } },
            )
        },
    ) { pad ->
        val d = data
        if (d == null) {
            Box(Modifier.padding(pad).fillMaxSize()) {
                if (error != null) Text(error!!, Modifier.align(Alignment.Center), color = MaterialTheme.colorScheme.error)
                else CircularProgressIndicator(Modifier.align(Alignment.Center))
            }
            return@Scaffold
        }
        Column(Modifier.padding(pad).fillMaxSize().padding(16.dp)) {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                periods().forEach { (id, label) ->
                    FilterChip(selected = period == id, onClick = { period = id }, label = { Text(label) })
                }
            }
            Spacer(Modifier.height(12.dp))
            val r = d[period]
            val tiles = buildList {
                r?.speed?.let { add(Triple(I18n.t("home.topSpeed"), "%.1f km/h".format(it.value * 3.6), it)) }
                r?.distance?.let { add(Triple(I18n.t("home.farthestRun"), fmtDistR(it.value), it)) }
                r?.duration?.let { add(Triple(I18n.t("home.longestRun"), fmtDurR(it.value), it)) }
                r?.glide?.let { add(Triple(I18n.t("home.longestGlide"), fmtDurR(it.value), it)) }
                r?.runs?.let { add(Triple(I18n.t("home.mostRuns"), it.value.roundToInt().toString(), it)) }
            }.filter { it.third.value > 0.0 || it.first == I18n.t("home.mostRuns") }
            if (tiles.isEmpty()) {
                Text(I18n.t("records.empty"), color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    tiles.forEach { (label, value, e) ->
                        Card(Modifier.fillMaxWidth().then(
                            if (e.sessionId != null) Modifier.clickable { onOpen(e.sessionId) } else Modifier
                        )) {
                            Column(Modifier.padding(12.dp)) {
                                Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text(value, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
                                val holder = listOfNotNull(e.name?.takeIf { it.isNotBlank() }, e.spot?.takeIf { it.isNotBlank() }).joinToString(" · ")
                                if (holder.isNotBlank()) Text(holder, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun fmtDistR(m: Double): String = if (m < 1000) "%.0f m".format(m) else "%.2f km".format(m / 1000)
private fun fmtDurR(s: Double): String = "%d:%02d".format((s / 60).toInt(), (s % 60).toInt())
