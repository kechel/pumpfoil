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
import androidx.compose.material.icons.filled.Forum
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.PlayArrow
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
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.compose.runtime.setValue
import kotlinx.coroutines.launch
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.TextButton
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
fun SessionsScreen(onOpen: (Int) -> Unit, onCompare: () -> Unit = {}, onSpotChat: (String) -> Unit = {}) {
    var scope by remember { mutableStateOf(Scope.MINE) }
    var homespot by remember { mutableStateOf("") }
    var spot by remember { mutableStateOf("") }          // aktiver Spot (für SPOT-Scope)
    var spots by remember { mutableStateOf<List<String>>(emptyList()) }   // alle Spot-Namen (Dropdown)
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
    var incoming by remember { mutableStateOf<List<Transfer>>(emptyList()) }
    var xferTick by remember { mutableStateOf(0) }
    val tick by WatchSync.tick.collectAsState()

    LaunchedEffect(Unit) {
        homespot = try { Api.settings()["homespot"]?.jsonPrimitive?.contentOrNull ?: "" } catch (_: Exception) { "" }
        spots = try { Api.spots(accelOnly = false).all } catch (_: Exception) { emptyList() }
    }
    LaunchedEffect(tick) {
        suggestions = try { Api.mergeSuggestions() } catch (_: Exception) { emptyList() }
    }
    // Eingehende Session-Übertragungen an mich (nur in „Meine" anzeigen).
    LaunchedEffect(tick, xferTick) {
        incoming = try { Api.transfersIncoming() } catch (_: Exception) { emptyList() }
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
    // Bei jedem Betreten neu laden (neue Sessions sofort sichtbar, wie PWA/iOS). Im NavHost ist
    // LocalLifecycleOwner der NavBackStackEntry -> ON_RESUME feuert beim Tab-Wechsel.
    val listScope = rememberCoroutineScope()
    val listOwner = LocalLifecycleOwner.current
    DisposableEffect(listOwner) {
        val obs = LifecycleEventObserver { _, e -> if (e == Lifecycle.Event.ON_RESUME) listScope.launch { load() } }
        listOwner.lifecycle.addObserver(obs)
        onDispose { listOwner.lifecycle.removeObserver(obs) }
    }

    Scaffold(
        topBar = {
            val title = when (scope) {
                Scope.MINE -> "${I18n.t("nav.sessions")} · ${I18n.t("sessions.mine")}"
                Scope.ALL -> "${I18n.t("nav.sessions")} · ${I18n.t("sessions.all")}"
                Scope.SPOT -> "${I18n.t("nav.sessions")} · 📍${spot}"
            }
            PumpfoilTopBar(title) {
                // Spot-Chat, wenn ein Spot gefiltert ist (scope "spot:<name>", wie PWA/iOS).
                if (scope == Scope.SPOT && spot.isNotBlank()) {
                    IconButton(onClick = { onSpotChat(spot) }) {
                        Icon(Icons.Filled.Forum, contentDescription = I18n.t("nav.chat"), tint = MaterialTheme.colorScheme.primary)
                    }
                }
                SyncIndicator()
            }
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
                    FilterChip(selected = scope == Scope.MINE, onClick = { spot = ""; scope = Scope.MINE }, label = { Text(I18n.t("sessions.mine")) }, colors = cyanChipColors())
                    if (homespot.isNotBlank()) {
                        FilterChip(
                            selected = scope == Scope.SPOT && spot == homespot,
                            onClick = { spot = homespot; scope = Scope.SPOT },
                            label = { Text("📍$homespot") }, colors = cyanChipColors(),
                        )
                    }
                    FilterChip(selected = scope == Scope.ALL && spot.isBlank(), onClick = { spot = ""; scope = Scope.ALL }, label = { Text(I18n.t("sessions.all")) }, colors = cyanChipColors())
                }
                Spacer(Modifier.width(8.dp))
                AccelSeg(accelOnly) { accelOnly = it }
            }
            // Spot-Auswahl als Dropdown (statt Freitext, der exakte Namen brauchte).
            Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                SpotDropdown(spots, if (scope == Scope.SPOT) spot else "") { sel ->
                    if (sel.isBlank()) { spot = ""; if (scope == Scope.SPOT) scope = Scope.ALL }
                    else { spot = sel; scope = Scope.SPOT }
                }
            }
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
                            if (scope == Scope.MINE && incoming.isNotEmpty()) {
                                items(incoming, key = { "xfer-${it.id}" }) { tr ->
                                    IncomingTransferCard(
                                        tr,
                                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 5.dp),
                                        onView = { tr.session?.id?.let(onOpen) },
                                        onDone = { xferTick++ },
                                    )
                                }
                            }
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

// YouTube-Video-ID aus einer URL ziehen (watch?v=, youtu.be/, shorts/, embed/). Null wenn keine.
fun ytVideoId(url: String?): String? {
    if (url.isNullOrBlank()) return null
    return Regex("(?:v=|youtu\\.be/|/shorts/|/embed/)([A-Za-z0-9_-]{6,16})").find(url)?.groupValues?.get(1)
}

// Avatar-Palette + Hash identisch zur PWA (ui.tsx) und iOS -> gleiche Nutzerfarbe überall.
private val AVATAR_COLORS = listOf(
    0x0284c7, 0x4f46e5, 0x7c3aed, 0xc026d3, 0xdb2777, 0xe11d48,
    0xdc2626, 0xea580c, 0xca8a04, 0x16a34a, 0x059669, 0x0d9488, 0x0e7490,
).map { Color(0xFF000000L or it.toLong()) }

fun avatarColorFor(seed: String): Color {
    var h = 0
    for (ch in seed) h = h * 31 + ch.code   // Int-Overflow wickelt wie JS „| 0"
    return AVATAR_COLORS[(Math.abs(h.toLong()) % AVATAR_COLORS.size).toInt()]
}

// Profilbild ODER farbiger Kreis mit Initiale (wie PWA/iOS). avatarUrl = Roh-Pfad.
@Composable
fun AvatarCircle(name: String?, avatarUrl: String?, size: Dp = 40.dp) {
    val url = Api.mediaUrl(avatarUrl)
    if (url != null) {
        AsyncImage(model = url, contentDescription = null, contentScale = ContentScale.Crop,
            modifier = Modifier.size(size).clip(CircleShape))
    } else {
        val n = (name ?: "?").trim()
        val initial = (if (n.isEmpty()) "?" else n.substring(0, 1)).uppercase()
        Box(Modifier.size(size).clip(CircleShape).background(avatarColorFor(name ?: "?")), contentAlignment = Alignment.Center) {
            Text(initial, color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = (size.value * 0.42f).sp)
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
                AvatarCircle(name = s.ownerName, avatarUrl = s.ownerAvatarUrl, size = 40.dp)
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(dateTimeRange(s.startedAt, s.endedAt), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                    if (inCompare) Text("⇄ ${I18n.t("compare.title")}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                    val foilLabel = s.foil?.let { listOf(it.brand, it.model, it.size).filter { p -> p.isNotBlank() }.joinToString(" ") }?.takeIf { it.isNotBlank() }
                    val chips = listOfNotNull(s.placeName?.takeIf { it.isNotBlank() }, foilLabel, s.deviceLabel?.takeIf { it.isNotBlank() })
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
                // Verlinktes Video: Vorschau-Thumb (CSP-sicherer Proxy) + Play-Overlay.
                ytVideoId(s.youtubeUrl)?.let { vid ->
                    Spacer(Modifier.width(6.dp))
                    Box(Modifier.size(width = 58.dp, height = 44.dp).clip(RoundedCornerShape(8.dp)), contentAlignment = Alignment.Center) {
                        AsyncImage(model = "${Api.BASE}/api/public/video-thumb/$vid", contentDescription = null,
                            contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                        Icon(Icons.Filled.PlayArrow, contentDescription = null, tint = Color.White,
                            modifier = Modifier.size(22.dp).background(Color.Black.copy(alpha = 0.5f), CircleShape))
                    }
                }
            }
            if (a != null) {
                Spacer(Modifier.height(8.dp))
                SessionStatsRow(a, m)
            }
            Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                if (s.transferTo != null) {
                    Surface(color = MaterialTheme.colorScheme.tertiaryContainer, shape = RoundedCornerShape(4.dp)) {
                        Text(I18n.t("transfer.badge"), Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                            style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onTertiaryContainer)
                    }
                    Spacer(Modifier.width(8.dp))
                }
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
                AvatarCircle(name = c.name, avatarUrl = c.avatarUrl, size = 40.dp)
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(c.name ?: dateTimeRange(c.startedAt, c.endedAt), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                    if (inCompare) Text("⇄ ${I18n.t("compare.title")}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                    if (c.name != null) {
                        Text(dateTimeRange(c.startedAt, c.endedAt), style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    val cchips = listOfNotNull(c.spot?.takeIf { it.isNotBlank() }, c.deviceLabel?.takeIf { it.isNotBlank() })
                    if (cchips.isNotEmpty()) {
                        Row(Modifier.padding(top = 3.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) { cchips.forEach { Pill(it) } }
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
                ytVideoId(c.youtubeUrl)?.let { vid ->
                    Spacer(Modifier.width(6.dp))
                    Box(Modifier.size(width = 58.dp, height = 44.dp).clip(RoundedCornerShape(8.dp)), contentAlignment = Alignment.Center) {
                        AsyncImage(model = "${Api.BASE}/api/public/video-thumb/$vid", contentDescription = null,
                            contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                        Icon(Icons.Filled.PlayArrow, contentDescription = null, tint = Color.White,
                            modifier = Modifier.size(22.dp).background(Color.Black.copy(alpha = 0.5f), CircleShape))
                    }
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

// Spot-Auswahl (wie das PWA-<select>): „Alle Spots" + jeder Spot; ersetzt die Freitext-Suche.
@Composable
private fun SpotDropdown(spots: List<String>, selected: String, onSelect: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        AssistChip(
            onClick = { open = true },
            label = { Text(if (selected.isBlank()) I18n.t("all.allSpots") else "📍 $selected", maxLines = 1) },
            trailingIcon = { Icon(Icons.Filled.ArrowDropDown, contentDescription = null) },
        )
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            DropdownMenuItem(text = { Text(I18n.t("all.allSpots")) }, onClick = { onSelect(""); open = false })
            spots.forEach { s ->
                DropdownMenuItem(text = { Text(s) }, onClick = { onSelect(s); open = false })
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

// Nur HH:mm aus einem ISO-Zeitstempel (für die Bis-Zeit).
private fun hhmmOf(iso: String?): String? = iso?.let {
    try { java.time.OffsetDateTime.parse(it).format(java.time.format.DateTimeFormatter.ofPattern("HH:mm")) }
    catch (_: Exception) { null }
}

// Datum + Start[–Ende] + „Uhr" (nur wo üblich, via sessions.oclock). Für die Listen-Zeilen.
fun dateTimeRange(startIso: String, endIso: String?): String {
    val oc = I18n.t("sessions.oclock")
    val end = hhmmOf(endIso)
    return prettyDate(startIso) + (if (end != null) " – $end" else "") + (if (oc.isNotEmpty()) " $oc" else "")
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

// Eingehende Session-Übertragung an mich: ansehen / annehmen / ablehnen (spiegelt web/IncomingTransfers).
@Composable
fun IncomingTransferCard(tr: Transfer, modifier: Modifier = Modifier, onView: () -> Unit, onDone: () -> Unit) {
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    Card(modifier.fillMaxWidth(), colors = CardDefaults.cardColors(
        containerColor = MaterialTheme.colorScheme.tertiaryContainer)) {
        Column(Modifier.padding(12.dp)) {
            Text("${I18n.t("transfer.incomingTitle")} · ${I18n.t("transfer.from").replace("{name}", tr.other?.displayName ?: "?")}",
                style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
            tr.session?.let { s ->
                val sub = listOfNotNull(s.place?.takeIf { it.isNotBlank() }, s.startedAt?.let { prettyDate(it) }).joinToString(" · ")
                if (sub.isNotBlank()) Text(sub, style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 2.dp))
            }
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = onView, enabled = !busy) { Text(I18n.t("transfer.view")) }
                Spacer(Modifier.weight(1f))
                OutlinedButton(onClick = {
                    busy = true
                    scope.launch { try { Api.transferDecline(tr.id) } catch (_: Exception) {}; onDone() }
                }, enabled = !busy) { Text(I18n.t("transfer.decline")) }
                Button(onClick = {
                    busy = true
                    scope.launch { try { Api.transferAccept(tr.id) } catch (_: Exception) {}; onDone() }
                }, enabled = !busy) { Text(I18n.t("transfer.accept")) }
            }
        }
    }
}
