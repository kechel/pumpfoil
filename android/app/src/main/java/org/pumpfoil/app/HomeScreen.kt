package org.pumpfoil.app

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Forum
import androidx.compose.material.icons.filled.Groups
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
fun HomeScreen(onOpen: (Int) -> Unit, onOpenChat: () -> Unit = {}, onOpenSessions: () -> Unit = {}, onOpenCommunity: () -> Unit = {}) {
    var profile by remember { mutableStateOf<Profile?>(null) }
    var stats by remember { mutableStateOf<OverallStats?>(null) }
    var latest by remember { mutableStateOf<List<SessionSummary>>(emptyList()) }
    var weather by remember { mutableStateOf<WeatherBlock?>(null) }
    var rooms by remember { mutableStateOf<List<ChatRoom>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    // Rekorde: nur Accel (präzise) oder alle (inkl. GPS-only). Default nur Accel,
    // aber einmalig auf "alle" fallen, wenn der Nutzer gar keine Accel-Läufe hat.
    var accelOnly by remember { mutableStateOf(true) }
    var decidedDefault by remember { mutableStateOf(false) }
    var updateVer by remember { mutableStateOf<String?>(null) }
    var updateUrl by remember { mutableStateOf("") }
    var updateDismissed by remember { mutableStateOf(false) }
    var community by remember { mutableStateOf<Api.CommunityStats?>(null) }
    val ctxTop = androidx.compose.ui.platform.LocalContext.current
    var bannerDismissed by remember {
        mutableStateOf(ctxTop.getSharedPreferences("pumpfoil", android.content.Context.MODE_PRIVATE).getString("foil_banner_v1", null) == "1")
    }
    val tick by WatchSync.tick.collectAsState()

    // In-App-Update-Hinweis: fragt die (manuell gepflegte) neueste Store-Version ab.
    LaunchedEffect(Unit) {
        try {
            val a = Api.appLatest("android")
            if (a.latest.isNotBlank() && versionNewer(a.latest, BuildConfig.VERSION_NAME)) {
                updateVer = a.latest; updateUrl = a.store_url
            }
        } catch (_: Exception) {}
    }

    LaunchedEffect(tick) {
        loading = true
        profile = try { Api.me() } catch (_: Exception) { profile }
        latest = try { Api.sessions().take(3) } catch (_: Exception) { emptyList() }
        rooms = try { Api.chatRooms() } catch (_: Exception) { emptyList() }
        if (!bannerDismissed) community = try { Api.communityStats() } catch (_: Exception) { community }
        val hs = try { Api.settings()["homespot"]?.jsonPrimitive?.contentOrNull } catch (_: Exception) { null }
        weather = if (!hs.isNullOrBlank()) try { Api.spotWeather(hs).weather } catch (_: Exception) { null } else null
        loading = false
    }
    // Stats separat: reagiert zusätzlich auf den Accel/alle-Umschalter.
    LaunchedEffect(tick, accelOnly) {
        val s = try { Api.stats(accelOnly) } catch (_: Exception) { null }
        if (s != null) {
            if (!decidedDefault) {
                decidedDefault = true
                val r = s.records
                val noAccel = (r?.distance?.value ?: 0.0) == 0.0 &&
                    (r?.duration?.value ?: 0.0) == 0.0 && (r?.speed?.value ?: 0.0) == 0.0
                if (accelOnly && noAccel) { accelOnly = false; return@LaunchedEffect }
            }
            stats = s
        }
    }

    Scaffold(topBar = { PumpfoilTopBar(I18n.t("nav.home")) { SyncIndicator() } }) { pad ->
        if (loading && stats == null) {
            Box(Modifier.padding(pad).fillMaxSize()) { CircularProgressIndicator(Modifier.align(Alignment.Center)) }
            return@Scaffold
        }
        val ctx = androidx.compose.ui.platform.LocalContext.current
        Column(Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
            val uv = updateVer
            if (uv != null && !updateDismissed) {
                UpdateBanner(
                    version = uv,
                    onUpdate = {
                        val url = updateUrl.ifBlank { "https://play.google.com/store/apps/details?id=${ctx.packageName}" }
                        try { ctx.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url))) } catch (_: Exception) {}
                    },
                    onDismiss = { updateDismissed = true },
                )
                Spacer(Modifier.height(12.dp))
            }
            if (!bannerDismissed) {
                WelcomeBanner(
                    stats = community,
                    onDismiss = {
                        ctxTop.getSharedPreferences("pumpfoil", android.content.Context.MODE_PRIVATE).edit().putString("foil_banner_v1", "1").apply()
                        bannerDismissed = true
                    },
                )
                Spacer(Modifier.height(16.dp))
            }
            // Begrüßung + Chat-Button (wie PWA).
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                val hello = profile?.displayName?.takeIf { it.isNotBlank() }
                    ?.let { I18n.t("phome.hello").replace("{name}", it) } ?: I18n.t("nav.home")
                Text(hello, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.weight(1f))
                Button(onClick = { onOpenChat() }) {
                    Icon(Icons.Filled.Forum, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(I18n.t("chat.title"))
                }
            }
            Spacer(Modifier.height(16.dp))

            stats?.let { st ->
                // Rekorde-Kopf + Accel/alle-Umschalter (zuerst, wie PWA).
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(I18n.t("side.records"), style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.width(8.dp))
                    @Composable
                    fun seg(active: Boolean, label: String, onClick: () -> Unit) {
                        Surface(
                            onClick = onClick, shape = MaterialTheme.shapes.small,
                            color = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                        ) {
                            Text(label, style = MaterialTheme.typography.labelMedium,
                                color = if (active) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp))
                        }
                    }
                    seg(accelOnly, I18n.t("side.onlyAccel")) { accelOnly = true }
                    Spacer(Modifier.width(4.dp))
                    seg(!accelOnly, I18n.t("side.all")) { accelOnly = false }
                }
                Spacer(Modifier.height(8.dp))

                // EIN Grid: 5 Rekorde (klickbar) + 5 Gesamtwerte — Reihenfolge/Format wie PWA.
                val r = st.records
                fun rt(label: String, rec: RecordEntry?, fmt: (Double) -> String): RecTile {
                    val v = rec?.value ?: 0.0
                    return if (v > 0) RecTile(label, fmt(v), rec?.sessionId, shortDate(rec?.startedAt))
                           else RecTile(label, "–", null, null)
                }
                val tiles = listOf(
                    rt(I18n.t("rec.farthestRun"), r?.distance) { "%.0f m".format(it) },
                    rt(I18n.t("rec.longestRun"), r?.duration) { fmtDur(it) },
                    rt(I18n.t("rec.topSpeed"), r?.speed) { "%.1f km/h".format(it * 3.6) },
                    rt(I18n.t("rec.longestGlide"), r?.glide) { "%.1f s".format(it) },
                    rt(I18n.t("rec.mostRuns"), r?.runs) { "%.0f".format(it) },
                    RecTile(I18n.t("side.sessions"), st.count.toString(), null, null),
                    RecTile(I18n.t("stat.runs"), st.runsTotal.toString(), null, null),
                    RecTile(I18n.t("side.foiling"), "%.1f km".format(st.foilingKm), null, null),
                    RecTile(I18n.t("side.foilingTime"), fmtMin(st.foilingMin), null, null),
                    RecTile(I18n.t("side.pumps"), "%,d".format(st.pumps), null, null),
                )
                TileGrid(tiles, onOpen, columns = 3)
            }

            weather?.let { wb ->
                Spacer(Modifier.height(16.dp))
                WeatherCard(wb)
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

            // Letzte Sessions: immer Kopf + "Alle meine →" (wie PWA), Liste oder leer-Hinweis.
            Spacer(Modifier.height(16.dp))
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(I18n.t("phome.latest"), style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                TextButton(onClick = onOpenSessions) {
                    Text("${I18n.t("phome.allMine")} →", style = MaterialTheme.typography.labelMedium)
                }
            }
            Spacer(Modifier.height(8.dp))
            if (latest.isEmpty()) {
                Card(Modifier.fillMaxWidth()) {
                    Text(I18n.t("sessions.empty"), Modifier.padding(20.dp).fillMaxWidth(),
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            } else {
                latest.forEach { s ->
                    SessionRow(s, Modifier.padding(vertical = 5.dp)) { onOpen(s.id) }
                }
            }

            // Community-Link (wie PWA).
            Spacer(Modifier.height(16.dp))
            TextButton(onClick = onOpenCommunity, contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
                Icon(Icons.Filled.Groups, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp))
                Text("${I18n.t("home.community")} →", style = MaterialTheme.typography.bodyMedium)
            }
            Spacer(Modifier.height(8.dp))
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

private data class RecTile(val label: String, val value: String, val sessionId: Int?, val date: String?)

@Composable
private fun TileGrid(tiles: List<RecTile>, onOpen: (Int) -> Unit, columns: Int = 3) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        tiles.chunked(columns).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { tile ->
                    Card(
                        Modifier.weight(1f).then(
                            if (tile.sessionId != null) Modifier.clickable { onOpen(tile.sessionId) } else Modifier
                        )
                    ) {
                        Column(Modifier.padding(10.dp)) {
                            Text(tile.value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.primary, maxLines = 1)
                            Text(tile.label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2)
                            tile.date?.let {
                                Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
                // Restspalten auffüllen, damit die letzte Reihe gleich breite Kacheln behält.
                repeat(columns - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

private fun fmtDist(m: Double): String = if (m < 1000) "%.0f m".format(m) else "%.2f km".format(m / 1000)
private fun fmtDur(s: Double): String = "%d:%02d".format((s / 60).toInt(), (s % 60).toInt())
// Foiling-Zeit aus Minuten, Format wie Web-fmtDur: "X h Y min" bzw. "Y min".
private fun fmtMin(min: Double): String {
    val h = (min / 60).toInt(); val m = (min % 60).roundToInt()
    return if (h > 0) "$h h $m min" else "$m min"
}

// Kurzes Datum (dd.MM.yyyy) aus ISO-Startzeit fuer die Rekord-Kacheln.
private fun shortDate(iso: String?): String? {
    if (iso.isNullOrBlank()) return null
    return try {
        val d = java.time.OffsetDateTime.parse(iso).toLocalDate()
        "%02d.%02d.%d".format(d.dayOfMonth, d.monthValue, d.year)
    } catch (_: Exception) {
        try {
            val d = java.time.LocalDate.parse(iso.take(10))
            "%02d.%02d.%d".format(d.dayOfMonth, d.monthValue, d.year)
        } catch (_: Exception) { null }
    }
}

// Community-Stats-Satz mit fett/cyan hervorgehobenen Zahlen (§-markiert, wie im Web).
@Composable
internal fun bannerStatsAnnotated(s: Api.CommunityStats): AnnotatedString {
    val primary = MaterialTheme.colorScheme.primary
    val raw = I18n.t("banner.stats")
        .replace("{foilers}", s.foilers.toString())
        .replace("{spots}", s.spots.toString())
        .replace("{sessions}", s.sessions.toString())
        .replace("{pumps}", "%,d".format(s.pumps))
    return buildAnnotatedString {
        raw.split("§").forEachIndexed { i, p ->
            if (i % 2 == 1) withStyle(SpanStyle(color = primary, fontWeight = FontWeight.Bold)) { append(p) }
            else append(p)
        }
    }
}

// Willkommens-/Community-Banner oben auf Home (schließbar). Spiegelt web WelcomeBanner.
@Composable
private fun WelcomeBanner(stats: Api.CommunityStats?, onDismiss: () -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.35f))) {
        Row(Modifier.fillMaxWidth().padding(start = 14.dp, top = 10.dp, bottom = 12.dp, end = 4.dp)) {
            Column(Modifier.weight(1f)) {
                Text("👋 Pumpfoil.org ${I18n.t("banner.msg")}", style = MaterialTheme.typography.bodyMedium)
                stats?.let {
                    Spacer(Modifier.height(6.dp))
                    Text(bannerStatsAnnotated(it), style = MaterialTheme.typography.bodySmall)
                }
            }
            IconButton(onClick = onDismiss) {
                Icon(Icons.Filled.Close, contentDescription = I18n.t("banner.dismiss"), tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

// Nicht-blockierender Update-Hinweis (wie das PWA-Update-Banner).
@Composable
private fun UpdateBanner(version: String, onUpdate: () -> Unit, onDismiss: () -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
        Row(Modifier.fillMaxWidth().padding(start = 14.dp, top = 6.dp, bottom = 6.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(I18n.t("update.available"), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onPrimaryContainer)
                Text("Version $version", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onPrimaryContainer)
            }
            Button(onClick = onUpdate) { Text(I18n.t("update.action")) }
            IconButton(onClick = onDismiss) {
                Icon(Icons.Filled.Close, contentDescription = I18n.t("common.cancel"), tint = MaterialTheme.colorScheme.onPrimaryContainer)
            }
        }
    }
}

// Semantischer Versionsvergleich "1.1.8" > "1.1.5". Nicht-numerische Teile -> 0.
private fun versionNewer(latest: String, current: String): Boolean {
    fun parts(v: String) = v.trim().split(".").map { it.filter(Char::isDigit).toIntOrNull() ?: 0 }
    val a = parts(latest); val b = parts(current)
    for (i in 0 until maxOf(a.size, b.size)) {
        val x = a.getOrElse(i) { 0 }; val y = b.getOrElse(i) { 0 }
        if (x != y) return x > y
    }
    return false
}
