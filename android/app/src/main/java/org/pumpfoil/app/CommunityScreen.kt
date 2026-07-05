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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Surfing
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
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
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

private val PERIODS = listOf("today" to "period.today", "10d" to "period.10d", "30d" to "period.30d", "365d" to "period.365d", "all" to "period.all")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CommunityScreen(onOpen: (Int) -> Unit, onFoilStats: () -> Unit = {}) {
    var records by remember { mutableStateOf<Map<String, PeriodRecords>?>(null) }
    var leaders by remember { mutableStateOf<Leaders?>(null) }
    var media by remember { mutableStateOf<List<MediaItem>>(emptyList()) }
    var topLiked by remember { mutableStateOf<List<CommunityItem>>(emptyList()) }
    var cstats by remember { mutableStateOf<Api.CommunityStats?>(null) }
    var spots by remember { mutableStateOf<SpotsList?>(null) }
    val spotShown = remember { mutableStateListOf<String>() }
    val spotRecs = remember { mutableStateMapOf<String, PeriodRecords>() }
    var spotQuery by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var period by remember { mutableStateOf("10d") }
    var accelOnly by remember { mutableStateOf(true) }
    var lbMetric by remember { mutableStateOf("sessions") }
    val scope = rememberCoroutineScope()

    // Basis (accel-abhängig): Rekorde je Zeitraum, Spots (Liste immer vollständig), Stats, Medien.
    suspend fun loadBase() {
        loading = true
        try {
            records = Api.communityRecords(accelOnly); error = null
            cstats = try { Api.communityStats() } catch (_: Exception) { cstats }
            media = try { Api.latestPhotos() } catch (_: Exception) { emptyList() }
            val sp = try { Api.spots(accelOnly = false) } catch (_: Exception) { null }
            if (sp != null) {
                spots = sp
                spotShown.clear(); spotShown.addAll(sp.mine)
                spotRecs.clear()
            }
        } catch (e: Exception) { error = e.message }
        loading = false
    }
    LaunchedEffect(accelOnly) { loadBase() }
    // Zeitraum- + accel-abhängig: Bestenliste, Best bewertet.
    LaunchedEffect(period, accelOnly) {
        leaders = try { Api.leaders(period, accelOnly) } catch (_: Exception) { leaders }
        topLiked = try { Api.topLiked(period) } catch (_: Exception) { topLiked }
    }
    // Rekorde je gezeigtem Spot (Zeitraum + accel).
    LaunchedEffect(spotShown.toList(), period, accelOnly) {
        spotShown.forEach { sp ->
            val key = "$accelOnly:$period:$sp"
            if (key !in spotRecs) {
                try { spotRecs[key] = Api.spotRecords(sp, period, accelOnly) } catch (_: Exception) {}
            }
        }
    }

    Scaffold(
        topBar = {
            PumpfoilTopBar(I18n.t("nav.community")) {
                IconButton(onClick = onFoilStats) {
                    Icon(Icons.Filled.Surfing, contentDescription = I18n.t("foilStats.title"))
                }
                SyncIndicator()
            }
        },
    ) { pad ->
        Box(Modifier.padding(pad)) {
            Refreshable(refreshing = loading, onRefresh = { scope.launch { loadBase() } }) {
                if (loading && records == null) {
                    CircularProgressIndicator(Modifier.align(Alignment.Center))
                } else {
                    LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 16.dp)) {
                        error?.let { e -> item { Text(e, Modifier.padding(16.dp), color = MaterialTheme.colorScheme.error) } }

                        // Dauerhafte Community-Stats-Leiste (Foiler/Spots/Sessions/Pumps).
                        cstats?.let { cs ->
                            item {
                                Card(
                                    Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
                                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.10f)),
                                ) {
                                    Text(bannerStatsAnnotated(cs), Modifier.padding(horizontal = 14.dp, vertical = 8.dp), style = MaterialTheme.typography.bodySmall)
                                }
                            }
                        }

                        // Zeitraum-Filter + Accel/alle-Umschalter (wie PWA).
                        item {
                            Row(
                                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 2.dp),
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                PERIODS.forEach { (id, key) ->
                                    FilterChip(selected = period == id, onClick = { period = id }, label = { Text(I18n.t(key)) }, colors = cyanChipColors())
                                }
                            }
                            Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp), horizontalArrangement = Arrangement.End) {
                                AccelSeg(accelOnly) { accelOnly = it }
                            }
                        }

                        // Community-Rekorde (mit Nutzer/Spot), klickbar -> Session.
                        item { RecordGrid(records?.get(period), showSpot = true, onOpen = onOpen, modifier = Modifier.padding(horizontal = 12.dp)) }

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

                        // Bestenliste (Rangliste je Metrik).
                        leaders?.let { lb ->
                            item {
                                SectionHeader(I18n.t("community.leaderboard"))
                                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp),
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    listOf(
                                        "sessions" to "leader.mostSessions", "runs" to "leader.mostRuns",
                                        "pumps" to "leader.mostPumps", "spots" to "leader.mostSpots",
                                    ).forEach { (id, key) ->
                                        FilterChip(selected = lbMetric == id, onClick = { lbMetric = id }, label = { Text(I18n.t(key)) }, colors = cyanChipColors())
                                    }
                                }
                                val list = when (lbMetric) { "runs" -> lb.runs; "pumps" -> lb.pumps; "spots" -> lb.spots; else -> lb.sessions }
                                val unit = when (lbMetric) { "runs" -> I18n.t("unit.runs"); "pumps" -> I18n.t("unit.pumps"); "spots" -> I18n.t("unit.spots"); else -> I18n.t("unit.sessions") }
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
                                                Spacer(Modifier.width(4.dp))
                                                Text(unit, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                            }
                                        }
                                        if (list.isEmpty()) Text(I18n.t("records.empty"), style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                }
                            }
                        }

                        // Best bewertet (meiste Likes).
                        if (topLiked.isNotEmpty()) {
                            item { SectionHeader(I18n.t("community.topRated")) }
                            items(topLiked) { c -> CommunityItemRow(c, Modifier.padding(horizontal = 12.dp, vertical = 5.dp)) { onOpen(c.id) } }
                        }

                        // Spots: eigene Spots + Suche, je Spot ein Rekord-Grid.
                        item {
                            SectionHeader(I18n.t("home.spots"))
                            OutlinedTextField(
                                value = spotQuery, onValueChange = { spotQuery = it },
                                label = { Text(I18n.t("home.spotSearch")) }, singleLine = true,
                                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
                            )
                            val matches = spotQuery.trim().takeIf { it.isNotBlank() }?.let { q ->
                                spots?.all?.filter { it.lowercase().contains(q.lowercase()) && it !in spotShown }?.take(6) ?: emptyList()
                            } ?: emptyList()
                            matches.forEach { m ->
                                Text("📍 $m", Modifier.fillMaxWidth().clickable { if (m !in spotShown) spotShown.add(0, m); spotQuery = "" }
                                    .padding(horizontal = 16.dp, vertical = 8.dp), color = MaterialTheme.colorScheme.primary)
                            }
                            if (spotShown.isEmpty()) {
                                Text(I18n.t("home.noSpots"), Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                        items(spotShown.toList()) { sp ->
                            Column(Modifier.padding(top = 4.dp)) {
                                Row(Modifier.padding(horizontal = 12.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Text("📍 $sp", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
                                    if (spots?.mine?.contains(sp) != true) {
                                        Spacer(Modifier.width(8.dp))
                                        Text(I18n.t("home.remove"), Modifier.clickable { spotShown.remove(sp) },
                                            style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                }
                                RecordGrid(spotRecs["$accelOnly:$period:$sp"], showSpot = false, onOpen = onOpen, modifier = Modifier.padding(horizontal = 12.dp))
                            }
                        }
                    }
                }
            }
        }
    }
}

// Ausgewählter Chip in Marken-Cyan (statt M3-Lavendel), wie die PWA-Pills.
@Composable
internal fun cyanChipColors() = FilterChipDefaults.filterChipColors(
    selectedContainerColor = MaterialTheme.colorScheme.primary,
    selectedLabelColor = MaterialTheme.colorScheme.onPrimary,
)

// Accel/alle-Umschalter (zwei Segmente, wie PWA + Home).
@Composable
internal fun AccelSeg(accelOnly: Boolean, onChange: (Boolean) -> Unit) {
    @Composable
    fun seg(active: Boolean, label: String, onClick: () -> Unit) {
        Surface(
            onClick = onClick, shape = MaterialTheme.shapes.small,
            color = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
        ) {
            Text(label, style = MaterialTheme.typography.labelMedium, maxLines = 1, softWrap = false,
                color = if (active) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp))
        }
    }
    Row(verticalAlignment = Alignment.CenterVertically) {
        seg(accelOnly, I18n.t("side.onlyAccel")) { onChange(true) }
        Spacer(Modifier.width(4.dp))
        seg(!accelOnly, I18n.t("side.all")) { onChange(false) }
    }
}

@Composable
private fun SectionHeader(title: String) {
    Text(title, style = MaterialTheme.typography.titleMedium,
        modifier = Modifier.padding(start = 12.dp, end = 12.dp, top = 14.dp, bottom = 6.dp))
}

// Community-Rekorde-Grid (2 Spalten): Wert (cyan) + Label + Nutzer(Avatar+Name) + Datum · Spot.
private data class RecItem(val label: String, val value: String, val e: CommunityRecordEntry)

@Composable
private fun RecordGrid(r: PeriodRecords?, showSpot: Boolean, onOpen: (Int) -> Unit, modifier: Modifier = Modifier) {
    val items = buildList {
        r?.distance?.let { add(RecItem(I18n.t("rec.farthestRun"), "%.0f m".format(it.value), it)) }
        r?.duration?.let { add(RecItem(I18n.t("rec.longestRun"), fmtDurC(it.value), it)) }
        r?.speed?.let { add(RecItem(I18n.t("rec.topSpeed"), "%.1f km/h".format(it.value * 3.6), it)) }
        r?.glide?.let { add(RecItem(I18n.t("rec.longestGlide"), "%.1f s".format(it.value), it)) }
        r?.runs?.let { add(RecItem(I18n.t("rec.mostRuns"), it.value.roundToInt().toString(), it)) }
    }
    Column(modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items.chunked(2).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { ri ->
                    val has = ri.e.value > 0.0 && ri.e.sessionId != null
                    Card(
                        Modifier.weight(1f).then(if (has) Modifier.clickable { onOpen(ri.e.sessionId!!) } else Modifier),
                    ) {
                        Column(Modifier.padding(10.dp)) {
                            Text(if (has) ri.value else "–", style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary, maxLines = 1)
                            Text(ri.label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2)
                            if (has) {
                                ri.e.name?.takeIf { it.isNotBlank() }?.let { nm ->
                                    Spacer(Modifier.height(2.dp))
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Api.mediaUrl(ri.e.avatarUrl)?.let { av ->
                                            AsyncImage(model = av, contentDescription = null, contentScale = ContentScale.Crop,
                                                modifier = Modifier.size(18.dp).clip(CircleShape))
                                            Spacer(Modifier.width(4.dp))
                                        }
                                        Text(nm, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary,
                                            maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    }
                                }
                                val date = shortDateC(ri.e.startedAt)
                                val sub = listOfNotNull(date, if (showSpot) ri.e.spot else null).joinToString(" · ")
                                if (sub.isNotBlank()) Text(sub, style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                        }
                    }
                }
                if (row.size == 1) Spacer(Modifier.weight(1f))
            }
        }
        if (items.all { it.e.value <= 0.0 }) {
            Text(I18n.t("records.empty"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

private fun ytId(url: String?): String? {
    if (url.isNullOrBlank()) return null
    return Regex("""(?:v=|youtu\.be/|shorts/|embed/)([\w-]{11})""").find(url)?.groupValues?.get(1)
}
private fun fmtDurC(s: Double): String = "%d:%02d".format((s / 60).toInt(), (s % 60).toInt())
private fun shortDateC(iso: String?): String? {
    if (iso.isNullOrBlank()) return null
    return try {
        val d = java.time.OffsetDateTime.parse(iso).toLocalDate()
        "%02d.%02d.%02d".format(d.dayOfMonth, d.monthValue, d.year % 100)
    } catch (_: Exception) {
        try {
            val d = java.time.LocalDate.parse(iso.take(10))
            "%02d.%02d.%02d".format(d.dayOfMonth, d.monthValue, d.year % 100)
        } catch (_: Exception) { null }
    }
}
