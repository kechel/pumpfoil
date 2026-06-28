package org.pumpfoil.app

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CommunityScreen(onOpen: (Int) -> Unit, onRecords: () -> Unit = {}) {
    var feed by remember { mutableStateOf<List<CommunityItem>>(emptyList()) }
    var leaders by remember { mutableStateOf<Leaders?>(null) }
    var media by remember { mutableStateOf<List<MediaItem>>(emptyList()) }
    var topLiked by remember { mutableStateOf<List<CommunityItem>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var lbMetric by remember { mutableStateOf("sessions") }
    var spotQuery by remember { mutableStateOf("") }
    var spotRecords by remember { mutableStateOf<PeriodRecords?>(null) }
    var spotShown by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    suspend fun load() {
        loading = true
        try {
            feed = Api.communitySessions(); error = null
            leaders = try { Api.leaders() } catch (_: Exception) { null }
            media = try { Api.latestPhotos() } catch (_: Exception) { emptyList() }
            topLiked = try { Api.topLiked(limit = 5) } catch (_: Exception) { emptyList() }
        } catch (e: Exception) { error = e.message }
        loading = false
    }
    LaunchedEffect(Unit) { load() }

    Scaffold(
        topBar = {
            PumpfoilTopBar(I18n.t("nav.community")) {
                IconButton(onClick = onRecords) {
                    Icon(Icons.Filled.EmojiEvents, contentDescription = I18n.t("home.records"))
                }
                SyncIndicator()
            }
        },
    ) { pad ->
        Box(Modifier.padding(pad)) {
            Refreshable(refreshing = loading, onRefresh = { scope.launch { load() } }) {
                if (loading && feed.isEmpty()) {
                    CircularProgressIndicator(Modifier.align(Alignment.Center))
                } else {
                    LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 12.dp)) {
                        error?.let { e -> item { Text(e, Modifier.padding(16.dp), color = MaterialTheme.colorScheme.error) } }

                        // Bestenliste (Rangliste je Metrik).
                        leaders?.let { lb ->
                            item {
                                SectionHeader(I18n.t("community.leaderboard"))
                                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp),
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    listOf(
                                        "sessions" to I18n.t("nav.sessions"), "runs" to I18n.t("home.runs"),
                                        "pumps" to I18n.t("home.pumps"), "spots" to I18n.t("nav.spots"),
                                    ).forEach { (id, label) ->
                                        FilterChip(selected = lbMetric == id, onClick = { lbMetric = id }, label = { Text(label) })
                                    }
                                }
                                val list = when (lbMetric) { "runs" -> lb.runs; "pumps" -> lb.pumps; "spots" -> lb.spots; else -> lb.sessions }
                                Card(Modifier.fillMaxWidth().padding(12.dp)) {
                                    Column(Modifier.padding(8.dp)) {
                                        list.take(5).forEachIndexed { i, e ->
                                            val v = when (lbMetric) { "runs" -> e.runs; "pumps" -> e.pumps; "spots" -> e.spots; else -> e.sessions }
                                            Row(Modifier.fillMaxWidth().padding(vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
                                                Text("${i + 1}", Modifier.width(20.dp), style = MaterialTheme.typography.titleSmall,
                                                    color = MaterialTheme.colorScheme.primary)
                                                Api.mediaUrl(e.avatarUrl)?.let { av ->
                                                    AsyncImage(model = av, contentDescription = null, contentScale = ContentScale.Crop,
                                                        modifier = Modifier.size(28.dp).clip(CircleShape))
                                                    Spacer(Modifier.width(8.dp))
                                                }
                                                Text(e.name ?: "—", Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                                                Text("$v", fontWeight = FontWeight.SemiBold)
                                            }
                                        }
                                        if (list.isEmpty()) Text(I18n.t("records.empty"), style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                }
                            }
                        }

                        // Neueste Medien (Fotos + YouTube), Tippen -> Session.
                        if (media.isNotEmpty()) {
                            item {
                                SectionHeader(I18n.t("community.latestMedia"))
                                LazyRow(Modifier.padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    items(media.size) { idx ->
                                        val m = media[idx]
                                        val thumb = if (m.kind == "video") ytId(m.youtubeUrl)?.let { "https://img.youtube.com/vi/$it/hqdefault.jpg" }
                                                    else Api.mediaUrl(m.url)
                                        AsyncImage(
                                            model = thumb, contentDescription = m.caption,
                                            contentScale = ContentScale.Crop,
                                            modifier = Modifier.size(width = 150.dp, height = 100.dp)
                                                .clip(RoundedCornerShape(10.dp))
                                                .clickable { onOpen(m.sessionId) },
                                        )
                                    }
                                }
                            }
                        }

                        // Best bewertet (meiste Likes).
                        if (topLiked.isNotEmpty()) {
                            item { SectionHeader(I18n.t("community.topRated")) }
                            items(topLiked) { c -> CommunityItemRow(c, Modifier.padding(horizontal = 12.dp, vertical = 5.dp)) { onOpen(c.id) } }
                        }

                        // Rekorde an einem Spot (Suche).
                        item {
                            SectionHeader(I18n.t("community.spotRecords"))
                            OutlinedTextField(
                                value = spotQuery, onValueChange = { spotQuery = it },
                                label = { Text(I18n.t("sessions.searchSpot")) }, singleLine = true,
                                trailingIcon = {
                                    IconButton(onClick = {
                                        val q = spotQuery.trim()
                                        if (q.isNotBlank()) scope.launch {
                                            spotShown = q
                                            spotRecords = try { Api.spotRecords(q) } catch (_: Exception) { null }
                                        }
                                    }) { Icon(Icons.Filled.Search, contentDescription = "Suchen") }
                                },
                                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
                            )
                            spotRecords?.let { rec ->
                                Text("📍 $spotShown", Modifier.padding(start = 12.dp, top = 8.dp),
                                    style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                RecordTiles(rec, onOpen)
                            }
                        }

                        // Feed.
                        item { SectionHeader(I18n.t("sessions.all")) }
                        items(feed) { c -> CommunityItemRow(c, Modifier.padding(horizontal = 12.dp, vertical = 5.dp)) { onOpen(c.id) } }
                    }
                }
            }
        }
    }
}

@Composable
private fun SectionHeader(title: String) {
    Text(title, style = MaterialTheme.typography.titleMedium,
        modifier = Modifier.padding(start = 12.dp, end = 12.dp, top = 14.dp, bottom = 6.dp))
}

@Composable
private fun RecordTiles(r: PeriodRecords, onOpen: (Int) -> Unit) {
    val tiles = buildList {
        r.speed?.let { add(Triple(I18n.t("home.topSpeed"), "%.1f km/h".format(it.value * 3.6), it)) }
        r.distance?.let { add(Triple(I18n.t("home.farthestRun"), fmtDistC(it.value), it)) }
        r.duration?.let { add(Triple(I18n.t("home.longestRun"), fmtDurC(it.value), it)) }
        r.glide?.let { add(Triple(I18n.t("home.longestGlide"), fmtDurC(it.value), it)) }
        r.runs?.let { add(Triple(I18n.t("home.mostRuns"), it.value.roundToInt().toString(), it)) }
    }.filter { it.third.value > 0.0 }
    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (tiles.isEmpty()) {
            Text(I18n.t("records.empty"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else tiles.forEach { (label, value, e) ->
            Card(Modifier.fillMaxWidth().then(if (e.sessionId != null) Modifier.clickable { onOpen(e.sessionId) } else Modifier)) {
                Column(Modifier.padding(12.dp)) {
                    Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(value, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
                    e.name?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
            }
        }
    }
}

private fun ytId(url: String?): String? {
    if (url.isNullOrBlank()) return null
    return Regex("""(?:v=|youtu\.be/|shorts/|embed/)([\w-]{11})""").find(url)?.groupValues?.get(1)
}
private fun fmtDistC(m: Double): String = if (m < 1000) "%.0f m".format(m) else "%.2f km".format(m / 1000)
private fun fmtDurC(s: Double): String = "%d:%02d".format((s / 60).toInt(), (s % 60).toInt())
