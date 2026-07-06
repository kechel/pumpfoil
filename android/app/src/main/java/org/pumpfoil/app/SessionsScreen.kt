package org.pumpfoil.app

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
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
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AssistChip
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material.icons.filled.ArrowDropDown
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
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
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
fun SessionsScreen(onOpen: (Int) -> Unit, onCompare: () -> Unit = {}) {
    var scope by remember { mutableStateOf(Scope.MINE) }
    var homespot by remember { mutableStateOf("") }
    var spot by remember { mutableStateOf("") }          // aktiver Spot (für SPOT-Scope)
    var spotInput by remember { mutableStateOf("") }     // Eingabefeld
    var own by remember { mutableStateOf<List<SessionSummary>>(emptyList()) }
    var feed by remember { mutableStateOf<List<CommunityItem>>(emptyList()) }
    var suggestions by remember { mutableStateOf<List<MergeSuggestion>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var accelOnly by remember { mutableStateOf(false) }   // wie PWA-Umschalter (Default: alle)
    var filter by remember { mutableStateOf("pump") }      // pump | other (nur eigene)
    var month by remember { mutableStateOf("") }           // "YYYY-MM" | "" (nur eigene)
    var months by remember { mutableStateOf<List<MonthCount>>(emptyList()) }
    var weather by remember { mutableStateOf<WeatherBlock?>(null) }
    val tick by WatchSync.tick.collectAsState()

    LaunchedEffect(Unit) {
        homespot = try { Api.settings()["homespot"]?.jsonPrimitive?.contentOrNull ?: "" } catch (_: Exception) { "" }
    }
    LaunchedEffect(tick) {
        suggestions = try { Api.mergeSuggestions() } catch (_: Exception) { emptyList() }
    }
    // Monats-Facetten je Filter (für den Monats-Dropdown der eigenen Sessions).
    LaunchedEffect(filter) {
        months = try { Api.sessionMonths(filter) } catch (_: Exception) { emptyList() }
    }
    // Spot-Wetter im Spot-Scope (wie PWA).
    LaunchedEffect(spot) {
        weather = if (spot.isNotBlank()) try { Api.spotWeather(spot).weather } catch (_: Exception) { null } else null
    }

    suspend fun load() {
        loading = true
        try {
            when (scope) {
                Scope.MINE -> own = Api.sessions(month = month.ifBlank { null }, filter = filter, accelOnly = accelOnly)
                Scope.ALL -> feed = Api.communitySessions(accelOnly = accelOnly)
                Scope.SPOT -> feed = if (spot.isNotBlank()) Api.spotSessions(spot, accelOnly) else emptyList()
            }
            error = null
        } catch (e: Exception) { error = e.message }
        loading = false
    }
    LaunchedEffect(scope, spot, tick, accelOnly, filter, month) { load() }

    Scaffold(
        topBar = {
            val title = when (scope) {
                Scope.MINE -> "${I18n.t("nav.sessions")} · ${I18n.t("sessions.mine")}"
                Scope.ALL -> "${I18n.t("nav.sessions")} · ${I18n.t("sessions.all")}"
                Scope.SPOT -> "${I18n.t("nav.sessions")} · 📍${spot}"
            }
            PumpfoilTopBar(title) { SyncIndicator() }
        },
    ) { pad ->
        val scopeC = rememberCoroutineScope()
        Column(Modifier.padding(pad).fillMaxSize()) {
            // Scope-Umschalter (scrollbar) + Accel/alle-Umschalter rechts.
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(Modifier.weight(1f).horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(selected = scope == Scope.MINE, onClick = { scope = Scope.MINE }, label = { Text(I18n.t("sessions.mine")) }, colors = cyanChipColors())
                    if (homespot.isNotBlank()) {
                        FilterChip(
                            selected = scope == Scope.SPOT && spot == homespot,
                            onClick = { spot = homespot; scope = Scope.SPOT },
                            label = { Text("📍$homespot") }, colors = cyanChipColors(),
                        )
                    }
                    FilterChip(selected = scope == Scope.ALL, onClick = { scope = Scope.ALL }, label = { Text(I18n.t("sessions.all")) }, colors = cyanChipColors())
                }
                Spacer(Modifier.width(8.dp))
                AccelSeg(accelOnly) { accelOnly = it }
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
            // Sportart-Filter + Monat (nur eigene, scrollbar) — wie PWA.
            if (scope == Scope.MINE) {
                Row(
                    Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    FilterChip(selected = filter == "pump", onClick = { filter = "pump"; month = "" },
                        label = { Text(I18n.t("sessions.filterPump")) }, colors = cyanChipColors())
                    FilterChip(selected = filter == "other", onClick = { filter = "other"; month = "" },
                        label = { Text(I18n.t("sessions.filterOther")) }, colors = cyanChipColors())
                    MonthDropdown(months, month) { month = it }
                }
            }
            if (scope == Scope.SPOT) {
                weather?.let { wb -> Box(Modifier.padding(horizontal = 12.dp, vertical = 4.dp)) { WeatherCard(wb) } }
            }
            Box(Modifier.fillMaxSize()) {
                Refreshable(refreshing = loading, onRefresh = { scopeC.launch { load() } }) {
                    val empty = (scope == Scope.MINE && own.isEmpty()) || (scope != Scope.MINE && feed.isEmpty())
                    if (loading && empty) {
                        CircularProgressIndicator(Modifier.align(Alignment.Center))
                    } else {
                        LazyColumn(Modifier.fillMaxSize()) {
                            error?.let { e -> item { Text(e, Modifier.padding(16.dp), color = MaterialTheme.colorScheme.error) } }
                            if (scope == Scope.MINE && suggestions.isNotEmpty()) {
                                items(suggestions) { sug ->
                                    MergeSuggestionCard(sug) {
                                        CompareStore.clear(); sug.ids.forEach { CompareStore.toggle(it) }; onCompare()
                                    }
                                }
                            }
                            if (empty && !loading && error == null) {
                                val msg = if (scope == Scope.MINE && month.isNotBlank()) I18n.t("sessions.noneMonth") else I18n.t("sessions.empty")
                                item { Text(msg, Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
                            }
                            if (scope == Scope.MINE) {
                                items(own) { s -> SessionRow(s, Modifier.padding(horizontal = 12.dp, vertical = 5.dp)) { onOpen(s.id) } }
                                if (own.isNotEmpty()) item {
                                    Text(I18n.t("sessions.listEnd"), Modifier.fillMaxWidth().padding(vertical = 12.dp),
                                        style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                                }
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

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun SessionRow(s: SessionSummary, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val a = s.analysis
    val m = a?.metrics
    val inCompare = CompareStore.ids.collectAsState().value.contains(s.id)
    Card(
        modifier = modifier.fillMaxWidth().combinedClickable(
            onClick = onClick, onLongClick = { CompareStore.toggle(s.id) }),
        border = if (inCompare) BorderStroke(2.dp, MaterialTheme.colorScheme.primary) else null,
    ) {
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
                    if (inCompare) Text("⇄ ${I18n.t("compare.title")}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
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
            Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                if (s.status != "analyzed") {
                    Text(statusLabel(s.status), style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.tertiary)
                }
                Spacer(Modifier.weight(1f))
                LikeToggle(s.id, s.liked, s.likeCount)
            }
        }
    }
}

// Tappbarer Like-Button in Listenkarten (optimistisch, wie Web): rosa wenn geliked.
@Composable
private fun LikeToggle(sessionId: Int, liked0: Boolean, count0: Int) {
    var liked by remember(sessionId) { mutableStateOf(liked0) }
    var count by remember(sessionId) { mutableStateOf(count0) }
    val scope = rememberCoroutineScope()
    val c = if (liked) Color(0xFFF43F5E) else MaterialTheme.colorScheme.onSurfaceVariant
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable {
            val prev = liked; liked = !liked; count += if (liked) 1 else -1
            scope.launch {
                try { val st = Api.toggleLike(sessionId); liked = st.liked; count = st.like_count }
                catch (_: Exception) { liked = prev; count += if (liked) 1 else -1 }
            }
        }.padding(horizontal = 4.dp, vertical = 2.dp),
    ) {
        Icon(if (liked) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
            contentDescription = I18n.t(if (liked) "row.unlike" else "row.like"),
            tint = c, modifier = Modifier.size(18.dp))
        if (count > 0) Text(" $count", style = MaterialTheme.typography.labelSmall, color = c)
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
        m?.avgHr?.let { if (it > 0) add("$it" + (m.maxHr?.let { mx -> "/$mx" } ?: "") + " bpm") }
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

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun CommunityItemRow(c: CommunityItem, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val inCompare = CompareStore.ids.collectAsState().value.contains(c.id)
    Card(
        modifier = modifier.fillMaxWidth().combinedClickable(
            onClick = onClick, onLongClick = { CompareStore.toggle(c.id) }),
        border = if (inCompare) BorderStroke(2.dp, MaterialTheme.colorScheme.primary) else null,
    ) {
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
                    if (inCompare) Text("⇄ ${I18n.t("compare.title")}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
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
            Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Spacer(Modifier.weight(1f))
                LikeToggle(c.id, c.liked, c.likeCount)
            }
        }
    }
}

// Monats-Auswahl (wie das PWA-<select>): „Alle Monate" + Monat (Anzahl).
@Composable
private fun MonthDropdown(months: List<MonthCount>, month: String, onSelect: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        AssistChip(
            onClick = { open = true },
            label = { Text(if (month.isBlank()) I18n.t("sessions.allMonths") else monthLabel(month)) },
            trailingIcon = { Icon(Icons.Filled.ArrowDropDown, contentDescription = null) },
        )
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            DropdownMenuItem(text = { Text(I18n.t("sessions.allMonths")) }, onClick = { onSelect(""); open = false })
            months.forEach { mc ->
                DropdownMenuItem(text = { Text("${monthLabel(mc.month)} (${mc.count})") }, onClick = { onSelect(mc.month); open = false })
            }
        }
    }
}

private fun monthLabel(m: String): String = try {
    val ym = java.time.YearMonth.parse(m)
    ym.month.getDisplayName(java.time.format.TextStyle.FULL, java.util.Locale.getDefault())
        .replaceFirstChar { it.uppercase() } + " " + ym.year
} catch (_: Exception) { m }

fun prettyDate(iso: String): String = try {
    java.time.OffsetDateTime.parse(iso)
        .format(java.time.format.DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm"))
} catch (_: Exception) {
    try {
        java.time.LocalDateTime.parse(iso)
            .format(java.time.format.DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm"))
    } catch (_: Exception) { iso }
}

// Vorschlags-Karte: heutige Sessions, die zusammengehören könnten -> Vergleichen & Mergen.
@Composable
private fun MergeSuggestionCard(sug: MergeSuggestion, onOpen: () -> Unit) {
    Card(
        Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.35f)),
    ) {
        Row(Modifier.padding(start = 14.dp, top = 10.dp, bottom = 10.dp, end = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(I18n.t("merge.suggestTitle"), style = MaterialTheme.typography.titleSmall)
                val sub = listOfNotNull(sug.place?.takeIf { it.isNotBlank() }, sug.date, "${sug.count}×").joinToString(" · ")
                Text(sub, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Button(onClick = onOpen) { Text(I18n.t("merge.open")) }
        }
    }
}
