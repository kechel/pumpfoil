package org.pumpfoil.app

import androidx.compose.foundation.background
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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(onOpen: (Int) -> Unit, onOpenChat: () -> Unit = {}) {
    var profile by remember { mutableStateOf<Profile?>(null) }
    var stats by remember { mutableStateOf<OverallStats?>(null) }
    var latest by remember { mutableStateOf<List<SessionSummary>>(emptyList()) }
    var weather by remember { mutableStateOf<WeatherBlock?>(null) }
    var rooms by remember { mutableStateOf<List<ChatRoom>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    val tick by WatchSync.tick.collectAsState()

    LaunchedEffect(tick) {
        loading = true
        profile = try { Api.me() } catch (_: Exception) { profile }
        stats = try { Api.stats() } catch (_: Exception) { null }
        latest = try { Api.sessions().take(3) } catch (_: Exception) { emptyList() }
        rooms = try { Api.chatRooms() } catch (_: Exception) { emptyList() }
        val hs = try { Api.settings()["homespot"]?.jsonPrimitive?.contentOrNull } catch (_: Exception) { null }
        weather = if (!hs.isNullOrBlank()) try { Api.spotWeather(hs).weather } catch (_: Exception) { null } else null
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

            weather?.let { wb ->
                WeatherCard(wb)
                Spacer(Modifier.height(16.dp))
            }

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

            if (rooms.isNotEmpty()) {
                Spacer(Modifier.height(16.dp))
                Text(I18n.t("home.myChats"), style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(8.dp))
                rooms.forEach { room ->
                    Card(Modifier.fillMaxWidth().padding(vertical = 3.dp).clickable { onOpenChat() }) {
                        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(room.label, fontWeight = FontWeight.Medium)
                                if (room.lastText.isNotBlank()) {
                                    Text(room.lastText, style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                            }
                            if (room.unread > 0) {
                                Text("${room.unread}", style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onPrimary,
                                    modifier = Modifier
                                        .padding(start = 8.dp)
                                        .height(20.dp)
                                        .clip(androidx.compose.foundation.shape.CircleShape)
                                        .background(MaterialTheme.colorScheme.primary)
                                        .padding(horizontal = 7.dp, vertical = 2.dp))
                            }
                        }
                    }
                }
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
private fun WeatherCard(wb: WeatherBlock) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp)) {
            Text(I18n.t("home.weather"), style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(4.dp))
            wb.current?.let { c ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(wxIcon(c.code), style = MaterialTheme.typography.headlineSmall)
                    c.temp?.let { Text("%.0f°".format(it), style = MaterialTheme.typography.titleLarge) }
                    c.wind?.let {
                        Text("%.0f kn %s".format(it, dirLabel(c.dir)), style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            if (wb.days.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    wb.days.take(3).forEachIndexed { i, d ->
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(dayLabel(i, d.date), style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(wxIcon(d.code))
                            Text("${d.tmax?.roundToInt() ?: "–"}°", style = MaterialTheme.typography.bodySmall)
                            d.windMax?.let {
                                Text("%.0f kn".format(it), style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
        }
    }
}

// WMO-Wettercode -> Emoji (grobe Klassen, wie web/SpotWeather).
private fun wxIcon(code: Int?): String = when {
    code == null -> "•"
    code == 0 -> "☀️"
    code <= 2 -> "🌤️"
    code == 3 -> "☁️"
    code <= 48 -> "🌫️"
    code <= 57 -> "🌦️"
    code <= 67 -> "🌧️"
    code <= 77 -> "🌨️"
    code <= 82 -> "🌦️"
    code <= 86 -> "🌨️"
    else -> "⛈️"
}

private val CARD8 = listOf("N", "NO", "O", "SO", "S", "SW", "W", "NW")
private fun dirLabel(deg: Double?): String = if (deg == null) "" else CARD8[(Math.round(deg / 45) % 8).toInt()]

private fun dayLabel(i: Int, date: String): String = when (i) {
    0 -> I18n.t("wx.today")
    1 -> I18n.t("wx.tomorrow")
    else -> try {
        java.time.LocalDate.parse(date).format(java.time.format.DateTimeFormatter.ofPattern("EE"))
    } catch (_: Exception) { "" }
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
