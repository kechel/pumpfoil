package org.pumpfoil.app

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import kotlinx.coroutines.launch
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import coil.compose.AsyncImage
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

private enum class Scope { MINE, SPOT, ALL }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SessionsScreen(onOpen: (Int) -> Unit) {
    var scope by remember { mutableStateOf(Scope.MINE) }
    var homespot by remember { mutableStateOf("") }
    var spot by remember { mutableStateOf("") }          // aktiver Spot (für SPOT-Scope)
    var spotInput by remember { mutableStateOf("") }     // Eingabefeld
    var own by remember { mutableStateOf<List<SessionSummary>>(emptyList()) }
    var feed by remember { mutableStateOf<List<CommunityItem>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val tick by WatchSync.tick.collectAsState()

    LaunchedEffect(Unit) {
        homespot = try { Api.settings()["homespot"]?.jsonPrimitive?.contentOrNull ?: "" } catch (_: Exception) { "" }
    }

    suspend fun load() {
        loading = true
        try {
            when (scope) {
                Scope.MINE -> own = Api.sessions()
                Scope.ALL -> feed = Api.communitySessions()
                Scope.SPOT -> feed = if (spot.isNotBlank()) Api.spotSessions(spot) else emptyList()
            }
            error = null
        } catch (e: Exception) { error = e.message }
        loading = false
    }
    LaunchedEffect(scope, spot, tick) { load() }

    Scaffold(
        topBar = {
            val title = when (scope) {
                Scope.MINE -> "${I18n.t("nav.sessions")} · ${I18n.t("sessions.mine")}"
                Scope.ALL -> "${I18n.t("nav.sessions")} · ${I18n.t("sessions.all")}"
                Scope.SPOT -> "${I18n.t("nav.sessions")} · 📍${spot}"
            }
            TopAppBar(title = { Text(title) }, actions = { SyncIndicator() })
        },
    ) { pad ->
        val scopeC = rememberCoroutineScope()
        Column(Modifier.padding(pad).fillMaxSize()) {
            // Scope-Umschalter + Spotsuche.
            Row(
                Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                FilterChip(selected = scope == Scope.MINE, onClick = { scope = Scope.MINE }, label = { Text(I18n.t("sessions.mine")) })
                if (homespot.isNotBlank()) {
                    FilterChip(
                        selected = scope == Scope.SPOT && spot == homespot,
                        onClick = { spot = homespot; scope = Scope.SPOT },
                        label = { Text("📍$homespot") },
                    )
                }
                FilterChip(selected = scope == Scope.ALL, onClick = { scope = Scope.ALL }, label = { Text(I18n.t("sessions.all")) })
            }
            OutlinedTextField(
                value = spotInput, onValueChange = { spotInput = it },
                label = { Text(I18n.t("sessions.searchSpot")) }, singleLine = true,
                trailingIcon = {
                    IconButton(onClick = { if (spotInput.isNotBlank()) { spot = spotInput.trim(); scope = Scope.SPOT } }) {
                        Icon(Icons.Filled.Search, contentDescription = "Suchen")
                    }
                },
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
            )
            Box(Modifier.fillMaxSize()) {
                Refreshable(refreshing = loading, onRefresh = { scopeC.launch { load() } }) {
                    val empty = (scope == Scope.MINE && own.isEmpty()) || (scope != Scope.MINE && feed.isEmpty())
                    if (loading && empty) {
                        CircularProgressIndicator(Modifier.align(Alignment.Center))
                    } else {
                        LazyColumn(Modifier.fillMaxSize()) {
                            error?.let { e -> item { Text(e, Modifier.padding(16.dp), color = MaterialTheme.colorScheme.error) } }
                            if (empty && !loading && error == null) {
                                item { Text(I18n.t("sessions.empty"), Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
                            }
                            if (scope == Scope.MINE) {
                                items(own) { s -> SessionRow(s, Modifier.padding(horizontal = 12.dp, vertical = 5.dp)) { onOpen(s.id) } }
                            } else {
                                items(feed) { c -> CommunityItemRow(c, Modifier.padding(horizontal = 12.dp, vertical = 5.dp)) { onOpen(c.id) } }
                            }
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SessionRow(s: SessionSummary, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val a = s.analysis
    val m = a?.metrics
    Card(onClick = onClick, modifier = modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                val av = Api.mediaUrl(s.ownerAvatarUrl)
                if (av != null) {
                    AsyncImage(model = av, contentDescription = null, contentScale = ContentScale.Crop,
                        modifier = Modifier.size(40.dp).clip(CircleShape))
                } else {
                    Icon(Icons.Filled.LocationOn, contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(40.dp))
                }
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(prettyDate(s.startedAt), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                    val foilLabel = s.foil?.let { listOf(it.brand, it.model, it.size).filter { p -> p.isNotBlank() }.joinToString(" ") }?.takeIf { it.isNotBlank() }
                    val chips = listOfNotNull(s.placeName?.takeIf { it.isNotBlank() }, foilLabel)
                    if (chips.isNotEmpty()) {
                        Row(Modifier.padding(top = 3.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            chips.forEach { Pill(it) }
                        }
                    }
                    s.caption?.takeIf { it.isNotBlank() }?.let {
                        Text(it, style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 3.dp))
                    }
                }
                Spacer(Modifier.width(8.dp))
                s.trackPreview?.let { tp ->
                    TrackPreviewCanvas(tp, Modifier.size(width = 58.dp, height = 42.dp))
                    Spacer(Modifier.width(6.dp))
                }
                Api.mediaUrl(s.thumbUrl)?.let { thumb ->
                    AsyncImage(model = thumb, contentDescription = null, contentScale = ContentScale.Crop,
                        modifier = Modifier.size(44.dp).clip(RoundedCornerShape(8.dp)))
                }
            }
            if (a != null) {
                Spacer(Modifier.height(8.dp))
                SessionStatsRow(a, m)
            }
            if (s.status != "analyzed" || s.likeCount > 0) {
                Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (s.status != "analyzed") {
                        Text(statusLabel(s.status), style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.tertiary)
                    }
                    Spacer(Modifier.weight(1f))
                    if (s.likeCount > 0) {
                        Icon(Icons.Filled.Favorite, contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(16.dp))
                        Text(" ${s.likeCount}", style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
        }
    }
}

@Composable
private fun Pill(text: String) {
    Text(text, style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis,
        modifier = Modifier.clip(RoundedCornerShape(6.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(horizontal = 6.dp, vertical = 2.dp))
}

@Composable
private fun SessionStatsRow(a: Analysis, m: Metrics?) {
    val parts = buildList {
        a.foilingDistanceM?.let { add("%.2f km".format(it / 1000.0)) }
        a.foilingTimeS?.let { add(fmtDur(it)) }
        m?.numSegments?.let { if (it > 0) add("$it " + if (it == 1) "Lauf" else "Läufe") }
        m?.avgSpeedMps?.let { add("Ø %.1f km/h".format(it * 3.6)) }
        a.pumpCount?.let { pc -> add("↕ $pc" + (m?.avgPumpHz?.let { " · %.2f Hz".format(it) } ?: "")) }
        m?.avgHr?.let { if (it > 0) add("♥ $it" + (m.maxHr?.let { mx -> "/$mx" } ?: "")) }
    }
    if (parts.isEmpty()) return
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        parts.forEach { Text(it, style = MaterialTheme.typography.bodySmall, maxLines = 1) }
    }
}

private fun fmtDur(s: Double): String { val t = s.toInt(); return "%d:%02d".format(t / 60, t % 60) }

private fun statusLabel(s: String): String = when (s) {
    "live" -> "läuft"
    "uploaded", "processing", "analyzing" -> "verarbeite…"
    else -> s
}

private val previewJson = Json { ignoreUnknownKeys = true }

@Composable
private fun TrackPreviewCanvas(data: String, modifier: Modifier) {
    val tp = remember(data) { runCatching { previewJson.decodeFromString(TrackPreview.serializer(), data) }.getOrNull() }
    if (tp == null || tp.lines.isEmpty()) return
    val color = MaterialTheme.colorScheme.primary
    Canvas(modifier) {
        val sc = minOf(size.width / tp.w.toFloat(), size.height / tp.h.toFloat())
        val ox = (size.width - tp.w.toFloat() * sc) / 2f
        val oy = (size.height - tp.h.toFloat() * sc) / 2f
        tp.lines.forEach { line ->
            if (line.size < 2) return@forEach
            val path = Path()
            line.forEachIndexed { i, pt ->
                val x = ox + pt[0].toFloat() * sc
                val y = oy + pt[1].toFloat() * sc
                if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
            }
            drawPath(path, color = color, style = Stroke(width = 3f, cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CommunityItemRow(c: CommunityItem, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Card(onClick = onClick, modifier = modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                val av = Api.mediaUrl(c.avatarUrl)
                if (av != null) {
                    AsyncImage(model = av, contentDescription = null, contentScale = ContentScale.Crop,
                        modifier = Modifier.size(40.dp).clip(CircleShape))
                } else {
                    Icon(Icons.Filled.Person, contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(40.dp))
                }
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(c.name ?: prettyDate(c.startedAt), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                    if (c.name != null) {
                        Text(prettyDate(c.startedAt), style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    c.spot?.takeIf { it.isNotBlank() }?.let {
                        Row(Modifier.padding(top = 3.dp)) { Pill(it) }
                    }
                    c.caption?.takeIf { it.isNotBlank() }?.let {
                        Text(it, style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 3.dp))
                    }
                }
                Spacer(Modifier.width(8.dp))
                c.trackPreview?.let { tp ->
                    TrackPreviewCanvas(tp, Modifier.size(width = 58.dp, height = 42.dp))
                    Spacer(Modifier.width(6.dp))
                }
                Api.mediaUrl(c.thumbUrl)?.let { thumb ->
                    AsyncImage(model = thumb, contentDescription = null, contentScale = ContentScale.Crop,
                        modifier = Modifier.size(44.dp).clip(RoundedCornerShape(8.dp)))
                }
            }
            val stats = buildList {
                if (c.runs > 0) add("${c.runs} " + if (c.runs == 1) "Lauf" else "Läufe")
                if (c.foilingKm > 0) add("%.2f km".format(c.foilingKm))
                c.maxSpeedMps?.let { add("max %.1f km/h".format(it * 3.6)) }
            }
            if (stats.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    stats.forEach { Text(it, style = MaterialTheme.typography.bodySmall, maxLines = 1) }
                }
            }
            if (c.likeCount > 0) {
                Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Spacer(Modifier.weight(1f))
                    Icon(Icons.Filled.Favorite, contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(16.dp))
                    Text(" ${c.likeCount}", style = MaterialTheme.typography.labelSmall)
                }
            }
        }
    }
}

fun prettyDate(iso: String): String = try {
    java.time.OffsetDateTime.parse(iso)
        .format(java.time.format.DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm"))
} catch (_: Exception) {
    try {
        java.time.LocalDateTime.parse(iso)
            .format(java.time.format.DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm"))
    } catch (_: Exception) { iso }
}
