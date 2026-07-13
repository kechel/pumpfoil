package org.pumpfoil.app

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.heightIn
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import coil.compose.AsyncImage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Forum
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCut
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.filled.Report
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Watch
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.TextButton
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.launch
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Label
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Switch
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import org.osmdroid.config.Configuration
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.BoundingBox
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Marker
import org.osmdroid.views.overlay.Polyline
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

// Amber für „Fake melden" (wie im Web); Rot kommt aus dem Theme (error).
private val AmberReport = Color(0xFFF59E0B)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SessionDetailScreen(id: Int, onBack: () -> Unit, onLabel: (Int) -> Unit = {}, onOpenSession: (Int) -> Unit = {}, onSpotChat: (String) -> Unit = {}) {
    var session by remember { mutableStateOf<SessionDetail?>(null) }
    var neighbors by remember(id) { mutableStateOf<Neighbors?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var confirmDelete by remember { mutableStateOf(false) }
    var showReport by remember { mutableStateOf(false) }
    var showTrim by remember { mutableStateOf(false) }
    var showShare by remember { mutableStateOf(false) }
    var trimStart by remember { mutableStateOf(0f) }
    var trimEnd by remember { mutableStateOf(0f) }
    var reloadTick by remember { mutableStateOf(0) }
    val scope = rememberCoroutineScope()
    val durSec = remember(session) {
        val a = epochMs(session?.startedAt); val b = epochMs(session?.endedAt)
        if (a != null && b != null && b > a) ((b - a) / 1000).toFloat() else 0f
    }

    LaunchedEffect(id, reloadTick) {
        loading = true
        try { session = Api.session(id); error = null }
        catch (e: Exception) { error = e.message }
        loading = false
    }
    LaunchedEffect(id) { neighbors = try { Api.sessionNeighbors(id) } catch (_: Exception) { null } }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text(I18n.t("sd.deleteTitle")) },
            text = { Text(I18n.t("sd.deleteBody")) },
            confirmButton = {
                TextButton(onClick = {
                    confirmDelete = false
                    scope.launch { try { Api.deleteSession(id); onBack() } catch (_: Exception) {} }
                }) { Text(I18n.t("common.delete")) }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text(I18n.t("common.cancel")) } },
        )
    }
    if (showTrim) {
        AlertDialog(
            onDismissRequest = { showTrim = false },
            title = { Text(I18n.t("sd.trim")) },
            text = {
                Column {
                    Text("${I18n.t("common.start")}: ${mmss(trimStart)}")
                    Slider(value = trimStart, onValueChange = { trimStart = it.coerceIn(0f, (trimEnd - 1).coerceAtLeast(0f)) }, valueRange = 0f..durSec)
                    Text("${I18n.t("common.end")}: ${mmss(trimEnd)}")
                    Slider(value = trimEnd, onValueChange = { trimEnd = it.coerceIn(trimStart + 1, durSec) }, valueRange = 0f..durSec)
                    TextButton(onClick = {
                        showTrim = false
                        scope.launch { try { Api.setTrim(id, null, null); reloadTick++ } catch (_: Exception) {} }
                    }) { Text(I18n.t("sd.trimReset")) }
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    showTrim = false
                    scope.launch {
                        try { Api.setTrim(id, (trimStart * 1000).toLong(), (trimEnd * 1000).toLong()); reloadTick++ } catch (_: Exception) {}
                    }
                }) { Text(I18n.t("sd.apply")) }
            },
            dismissButton = { TextButton(onClick = { showTrim = false }) { Text(I18n.t("common.cancel")) } },
        )
    }

    if (showShare) session?.let { ShareDialog(it) { showShare = false } }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(I18n.t("sd.title")) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Zurück")
                    }
                },
                actions = {
                    val s = session
                    if (s != null && !s.owned) {
                        Box {
                            IconButton(onClick = { showReport = true }) {
                                Icon(Icons.Filled.Flag, contentDescription = I18n.t("sd.report"))
                            }
                            DropdownMenu(expanded = showReport, onDismissRequest = { showReport = false }) {
                                DropdownMenuItem(
                                    text = { Text(I18n.t("sd.reportFake")) },
                                    leadingIcon = { Icon(Icons.Filled.Flag, contentDescription = null, tint = AmberReport) },
                                    onClick = {
                                        showReport = false
                                        scope.launch { try { Api.voteSession(id, "fake") } catch (_: Exception) {} }
                                    },
                                )
                                DropdownMenuItem(
                                    text = { Text(I18n.t("sd.reportInappropriate")) },
                                    leadingIcon = { Icon(Icons.Filled.Report, contentDescription = null, tint = MaterialTheme.colorScheme.error) },
                                    onClick = {
                                        showReport = false
                                        scope.launch { try { Api.voteSession(id, "inappropriate") } catch (_: Exception) {} }
                                    },
                                )
                            }
                        }
                    }
                    // Spot-Chat der Session (scope "spot:<name>") — für jede Session mit Spot.
                    s?.placeName?.takeIf { it.isNotBlank() }?.let { sp ->
                        IconButton(onClick = { onSpotChat(sp) }) {
                            Icon(Icons.Filled.Forum, contentDescription = I18n.t("nav.chat"), tint = MaterialTheme.colorScheme.primary)
                        }
                    }
                    if (s?.owned == true && s.analysis?.trackGeojson != null) {
                        IconButton(onClick = { showShare = true }) {
                            Icon(Icons.Filled.Share, contentDescription = I18n.t("sd.share"), tint = MaterialTheme.colorScheme.primary)
                        }
                    }
                    // Pump-Label-Ansicht mobil vorerst ausgeblendet (Jan: „machen wir andermal").
                    // Code bleibt bestehen — nur der Button ist deaktiviert.
                    @Suppress("SimplifyBooleanWithConstants")
                    if (false && s?.owned == true) {
                        IconButton(onClick = { onLabel(id) }) {
                            Icon(Icons.AutoMirrored.Filled.Label, contentDescription = I18n.t("lab.title"), tint = MaterialTheme.colorScheme.primary)
                        }
                    }
                    // Trimmen/Löschen sind selten gebraucht -> nicht mehr oben, sondern unten im Body.
                },
            )
        },
    ) { pad ->
        Box(Modifier.padding(pad).fillMaxSize().padding(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 16.dp)) {
            val s = session
            when {
                loading -> CircularProgressIndicator(Modifier.align(Alignment.Center))
                error != null -> Text(error!!, color = MaterialTheme.colorScheme.error)
                s != null -> DetailContent(s, neighbors = neighbors, onOpenSession = onOpenSession, onReload = { reloadTick++ },
                    canTrim = (s.owned && durSec > 1f),
                    onTrim = { trimStart = 0f; trimEnd = durSec; showTrim = true },
                    onDelete = { confirmDelete = true })
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DetailContent(s: SessionDetail, neighbors: Neighbors? = null, onOpenSession: (Int) -> Unit = {}, onReload: () -> Unit = {},
                          canTrim: Boolean = false, onTrim: () -> Unit = {}, onDelete: () -> Unit = {}) {
    val scope = rememberCoroutineScope()
    var liked by remember(s.id) { mutableStateOf(s.liked) }
    var likeCount by remember(s.id) { mutableStateOf(s.likeCount) }
    var colorMode by remember(s.id) { mutableStateOf(ColorMode.SPEED) }
    var win by remember(s.id) { mutableStateOf(3) }
    var showPumps by remember(s.id) { mutableStateOf(true) }
    var selectedRun by remember(s.id) { mutableStateOf<Int?>(null) }   // ausgewählter Lauf -> nur dieser farbig
    var weightKg by remember { mutableStateOf(0.0) }
    var caption by remember(s.id) { mutableStateOf(s.caption ?: "") }
    var editCaption by remember(s.id) { mutableStateOf(false) }
    var draftCaption by remember(s.id) { mutableStateOf("") }
    var allFoils by remember(s.id) { mutableStateOf<List<Foil>>(emptyList()) }
    var mineIds by remember(s.id) { mutableStateOf<Set<Int>>(emptySet()) }
    LaunchedEffect(Unit) {
        weightKg = try { Api.settings()["weight_kg"]?.jsonPrimitive?.doubleOrNull ?: 0.0 } catch (_: Exception) { 0.0 }
        if (s.owned) {
            try {
                mineIds = Api.settings()["my_foils"]?.jsonArray?.mapNotNull { it.jsonPrimitive.intOrNull }?.toSet() ?: emptySet()
                allFoils = Api.foils()
            } catch (_: Exception) {}
        }
    }
    if (editCaption) {
        AlertDialog(
            onDismissRequest = { editCaption = false },
            title = { Text(I18n.t("sd.caption")) },
            text = {
                OutlinedTextField(
                    value = draftCaption, onValueChange = { if (it.length <= 30) draftCaption = it },
                    singleLine = true, supportingText = { Text("${draftCaption.length}/30") },
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    val c = draftCaption.trim(); editCaption = false
                    caption = c
                    scope.launch { try { Api.setCaption(s.id, c) } catch (_: Exception) {} }
                }) { Text(I18n.t("common.save")) }
            },
            dismissButton = { TextButton(onClick = { editCaption = false }) { Text(I18n.t("common.cancel")) } },
        )
    }
    Column(
        Modifier.verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // Vor/Zurück zu Nachbar-Sessions (wie Web): deaktiviert, wenn es keine gibt.
        neighbors?.let { nb ->
            if (nb.older != null || nb.newer != null) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    TextButton(onClick = { nb.older?.let(onOpenSession) }, enabled = nb.older != null) { Text(I18n.t("sd.older")) }
                    TextButton(onClick = { nb.newer?.let(onOpenSession) }, enabled = nb.newer != null) { Text(I18n.t("sd.newer")) }
                }
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(prettyDate(s.startedAt), style = MaterialTheme.typography.headlineSmall, modifier = Modifier.weight(1f))
            FilledTonalButton(
                onClick = {
                    val prev = liked; liked = !liked; likeCount += if (liked) 1 else -1
                    scope.launch {
                        try { val st = Api.toggleLike(s.id); liked = st.liked; likeCount = st.like_count }
                        catch (_: Exception) { liked = prev; likeCount += if (liked) 1 else -1 }
                    }
                },
                colors = ButtonDefaults.filledTonalButtonColors(
                    containerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.12f),
                    contentColor = MaterialTheme.colorScheme.primary,
                ),
            ) {
                // Herz rosa im „geliked"-Zustand (wie Web), sonst Marken-Cyan.
                Icon(if (liked) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder, contentDescription = "Like",
                    tint = if (liked) Color(0xFFF43F5E) else MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(6.dp))
                Text("$likeCount")
            }
        }
        s.placeName?.takeIf { it.isNotBlank() }?.let {
            Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        s.placeWater?.takeIf { it.isNotBlank() && it != s.placeName }?.let {
            Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        // Start–End-Zeit + Dauer (wie Web); End-Zeit kommt vom Server (ggf. aus letztem GPS abgeleitet).
        run {
            val sMs = epochMs(s.startedAt); val eMs = epochMs(s.endedAt)
            if (sMs != null && eMs != null && eMs > sMs) {
                val secs = ((eMs - sMs) / 1000).toInt()
                val dur = if (secs >= 3600) "%d:%02d h".format(secs / 3600, (secs % 3600) / 60)
                          else "%d:%02d min".format(secs / 60, secs % 60)
                val oc = I18n.t("sessions.oclock").let { if (it.isBlank()) "" else " $it" }
                Text("${hhmmLoc(s.startedAt)} – ${hhmmLoc(s.endedAt)}$oc · ${I18n.t("sd.duration")} $dur",
                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        // Uhr-Badge: mit welcher Uhr aufgenommen.
        s.deviceLabel?.takeIf { it.isNotBlank() }?.let {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Watch, contentDescription = null, modifier = Modifier.size(14.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.width(4.dp))
                Text(it, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        if (caption.isNotBlank()) Text(caption)
        if (s.owned) {
            TextButton(onClick = { draftCaption = caption; editCaption = true }) {
                Text(if (caption.isBlank()) I18n.t("sd.captionAdd") else I18n.t("sd.captionEdit"))
            }
        }
        // Foil dieser Session (Metadaten, wie PWA): beeinflusst Leistung + Community-Foil-Stats.
        if (s.owned && allFoils.isNotEmpty()) {
            Column {
                Text(I18n.t("sd.foilOfSession"), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(4.dp))
                FoilDropdown(
                    all = allFoils, mineIds = mineIds, selectedId = s.foil?.id,
                    onSelect = { id -> scope.launch { try { Api.setSessionFoil(s.id, id); onReload() } catch (_: Exception) {} } },
                )
            }
        }

        // YouTube-Video (falls verlinkt): Thumbnail -> öffnet die URL.
        val ytId = remember(s.youtubeUrl) { youtubeId(s.youtubeUrl) }
        // Medien (Video + Fotos): Besitzer kann Fotos hinzufügen. Tippen -> Vollbild/Video.
        var photos by remember(s.id) { mutableStateOf<List<SessionPhoto>>(emptyList()) }
        var lightboxIdx by remember(s.id) { mutableStateOf<Int?>(null) }
        val ctx = LocalContext.current
        suspend fun reloadPhotos() { photos = try { Api.sessionPhotos(s.id) } catch (_: Exception) { emptyList() } }
        LaunchedEffect(s.id) { reloadPhotos() }
        val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
            if (uri != null) scope.launch {
                val bytes = withContext(Dispatchers.IO) {
                    ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() }?.let { downscaleJpeg(it) }
                }
                if (bytes != null) { try { Api.uploadSessionPhoto(s.id, bytes); reloadPhotos() } catch (_: Exception) {} }
            }
        }
        // Festes 2-spaltiges Grid: Video (falls verlinkt) + Fotos, alle Kacheln gleich groß (16:9).
        val hasVideo = ytId != null
        val total = (if (hasVideo) 1 else 0) + photos.size
        if (total > 0) {
            val ctxYt = LocalContext.current
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                var row = 0
                while (row * 2 < total) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        for (col in 0 until 2) {
                            val idx = row * 2 + col
                            if (idx >= total) { Spacer(Modifier.weight(1f)); continue }
                            Box(Modifier.weight(1f).aspectRatio(16f / 9f).clip(RoundedCornerShape(12.dp))) {
                                if (hasVideo && idx == 0) {
                                    AsyncImage(
                                        model = "https://img.youtube.com/vi/$ytId/hqdefault.jpg",
                                        contentDescription = "YouTube", contentScale = ContentScale.Crop,
                                        modifier = Modifier.fillMaxSize().clickable {
                                            ctxYt.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(s.youtubeUrl)))
                                        },
                                    )
                                    Icon(Icons.Filled.PlayCircle, contentDescription = null,
                                        modifier = Modifier.align(Alignment.Center).size(48.dp), tint = Color.White)
                                } else {
                                    val p = photos[idx - if (hasVideo) 1 else 0]
                                    AsyncImage(
                                        model = Api.mediaUrl(p.url), contentDescription = null, contentScale = ContentScale.Crop,
                                        modifier = Modifier.fillMaxSize().clickable { lightboxIdx = photos.indexOf(p) },
                                    )
                                    if (s.owned) {
                                        Icon(Icons.Filled.Close, contentDescription = I18n.t("common.delete"), tint = Color.White,
                                            modifier = Modifier.align(Alignment.TopEnd).padding(6.dp).size(24.dp)
                                                .background(Color.Black.copy(alpha = 0.5f), CircleShape)
                                                .clickable { scope.launch { try { Api.deleteSessionPhoto(s.id, p.id); reloadPhotos() } catch (_: Exception) {} } }
                                                .padding(3.dp))
                                    }
                                }
                            }
                        }
                    }
                    row++
                }
            }
        }
        // Vollbild-Lightbox: tippen schließt; bei mehreren Fotos horizontal wischen.
        lightboxIdx?.let { startIdx ->
            PhotoLightbox(photos, startIdx, onClose = { lightboxIdx = null })
        }
        if (s.owned) {
            OutlinedButton(onClick = {
                picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
            }) { Text(I18n.t("sd.addPhoto")) }
        }

        val a = s.analysis
        // Track auf OSM-Karte (osmdroid): nur die Foiling-Läufe, gefärbt nach Modus (Speed/Puls/Pump),
        // optional Pump-Marker — wie im Web.
        a?.trackGeojson?.let { tg ->
            val track = remember(tg) { parseTrack(tg) }
            val segs = a.segments.orEmpty()
            if (track.points.size >= 2 && segs.isNotEmpty()) {
                val hasHr = remember(track) { track.hr.any { it != null && it > 0 } }
                val hasPump = remember(track) { track.pumpHz.any { it != null } }
                val hrRange = remember(track) {
                    val vs = track.hr.filterNotNull().filter { it > 0 }
                    (vs.minOrNull() ?: 0) to (vs.maxOrNull() ?: 1)
                }
                val pumpRange = remember(track) {
                    val vs = track.pumpHz.filterNotNull()
                    (vs.minOrNull() ?: 0.0) to (vs.maxOrNull() ?: 1.0)
                }
                if (hasHr || hasPump) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterChip(selected = colorMode == ColorMode.SPEED, onClick = { colorMode = ColorMode.SPEED }, label = { Text(I18n.t("sd.colorSpeed")) }, colors = cyanChipColors())
                        if (hasHr) FilterChip(selected = colorMode == ColorMode.HR, onClick = { colorMode = ColorMode.HR }, label = { Text(I18n.t("sd.colorPuls")) }, colors = cyanChipColors())
                        if (hasPump) FilterChip(selected = colorMode == ColorMode.PUMP, onClick = { colorMode = ColorMode.PUMP }, label = { Text(I18n.t("sd.colorPump")) }, colors = cyanChipColors())
                    }
                }
                // Steuerzeile über der Karte: Glättung (nur Speed) links, Marker-Umschalter rechts.
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    if (colorMode == ColorMode.SPEED) {
                        listOf(1, 3, 5).forEach { w ->
                            FilterChip(selected = win == w, onClick = { win = w }, label = { Text("${w}s") },
                                colors = cyanChipColors(), modifier = Modifier.padding(end = 8.dp))
                        }
                    }
                    Spacer(Modifier.weight(1f))
                    if (a.pumpCount != null && a.pumpCount > 0) {
                        Text(I18n.t("sd.markerShort"), style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.width(4.dp))
                        Switch(checked = showPumps, onCheckedChange = { showPumps = it })
                    }
                }
                Card(Modifier.fillMaxWidth()) {
                    TrackMap(track, segs, colorMode, hrRange, pumpRange, showPumps, win,
                        selectedRun, { selectedRun = if (selectedRun == it) null else it },
                        Modifier.fillMaxWidth().height(300.dp))
                }
                // Farb-Legende (min→max) für den gewählten Modus — wie PWA.
                ColorLegend(colorMode, hrRange, pumpRange)
                selectedRun?.let { sel ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("${I18n.t("home.runs")} #${sel + 1}", style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.primary)
                        Spacer(Modifier.width(8.dp))
                        TextButton(onClick = { selectedRun = null }) { Text(I18n.t("sd.clearSelection")) }
                    }
                }
            }
        }
        // Leistungs-Karte (theoretische Pump-Leistung bei Ø-/Top-Speed).
        if (a != null && s.foil != null && weightKg > 0) {
            PowerCard(a, s.foil, weightKg)
        }
        if (a == null) {
            Text(I18n.t("sd.analyzing"), color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            val m = a.metrics
            val segList = a.segments.orEmpty()
            fun dist(x: Double) = if (x < 1000) "%.0f m".format(x) else "%.2f km".format(x / 1000)
            fun mmssD(x: Double) = "%d:%02d".format((x / 60).toInt(), (x % 60).toInt())
            // Rekord-Läufe (für anklickbare Kacheln -> Lauf auswählen).
            val bestSpeedIdx = segList.indices.maxByOrNull { segList[it].maxSpeedMps }
            val longestRunIdx = segList.indices.maxByOrNull { segList[it].durationS }
            val farthestRunIdx = segList.indices.maxByOrNull { segList[it].distanceM }
            val bestGlideIdx = segList.indices.maxByOrNull { segList[it].longestGlideS }
            val stats = buildList {
                a.totalDistanceM?.let { add(StatItem(I18n.t("compare.distance"), dist(it))) }
                a.foilingDistanceM?.let { add(StatItem(I18n.t("home.foiling"), dist(it))) }
                a.foilingTimeS?.let { add(StatItem(I18n.t("compare.foilTime"), mmssD(it))) }
                if (segList.isNotEmpty()) add(StatItem(I18n.t("home.runs"), segList.size.toString()))
                (m?.avgSpeedMps)?.let { add(StatItem(I18n.t("sd.avgSpeed"), "%.1f km/h".format(it * 3.6))) }
                a.maxSpeedMps?.let { add(StatItem(I18n.t("home.topSpeed"), "%.1f km/h".format(it * 3.6), bestSpeedIdx)) }
                a.pumpCount?.let { pc ->
                    add(StatItem(I18n.t("home.pumps"), pc.toString()))
                    if (pc > 0 && a.foilingDistanceM != null) add(StatItem(I18n.t("sd.avgDistPerPump"), "%.1f m".format(a.foilingDistanceM / pc)))
                }
                (m?.avgPumpHz ?: a.avgCadenceHz)?.let { add(StatItem(I18n.t("sd.avgPump"), "%.2f Hz".format(it))) }
                (m?.avgHr)?.let { if (it > 0) add(StatItem(I18n.t("sd.avgHr"), "$it")) }
                (m?.maxHr)?.let { if (it > 0) add(StatItem(I18n.t("sd.maxHr"), "$it")) }
                longestRunIdx?.let { add(StatItem(I18n.t("home.longestRun"), mmssD(segList[it].durationS), it)) }
                farthestRunIdx?.let { add(StatItem(I18n.t("home.farthestRun"), dist(segList[it].distanceM), it)) }
                bestGlideIdx?.let { if (segList[it].longestGlideS > 0) add(StatItem(I18n.t("home.longestGlide"), "%.1f s".format(segList[it].longestGlideS), it)) }
            }
            StatGrid(stats, selectedRun) { selectedRun = if (selectedRun == it) null else it }
            if (segList.isNotEmpty()) RunsTable(segList, selectedRun) { selectedRun = if (selectedRun == it) null else it }
        }

        // Zusammenführung wieder auflösen (nur Besitzer, ganz am Ende).
        if (s.owned && s.mergedCount > 0) {
            Spacer(Modifier.height(4.dp))
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(I18n.t("merge.mergedFrom"), Modifier.weight(1f),
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                TextButton(onClick = {
                    scope.launch { try { Api.unmergeSession(s.id); WatchSync.tick.value++; onReload() } catch (_: Exception) {} }
                }) { Text(I18n.t("merge.unmerge")) }
            }
        }

        // Selten gebrauchte Aktionen ganz unten (wie PWA): Übertragen · Trimmen · Löschen.
        if (s.owned) {
            Spacer(Modifier.height(12.dp))
            HorizontalDivider()
            Spacer(Modifier.height(8.dp))
            TransferPicker(s.id)
            Spacer(Modifier.height(8.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (canTrim) {
                    OutlinedButton(onClick = onTrim, modifier = Modifier.weight(1f)) {
                        Icon(Icons.Filled.ContentCut, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp)); Text(I18n.t("sd.trim"))
                    }
                }
                OutlinedButton(onClick = onDelete, modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error)) {
                    Icon(Icons.Filled.Delete, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp)); Text(I18n.t("common.delete"))
                }
            }
        }
    }
}

// Geparster Track: GPS-Punkte (lon,lat) + Speed je Glättungsfenster (1/3/5 s) + Puls + Pump-Hz.
class Track(
    val points: List<Pair<Double, Double>>,
    val speedsMps: List<Double>,         // 3 s (Default)
    val speeds1: List<Double>,
    val speeds5: List<Double>,
    val hr: List<Int?>,
    val pumpHz: List<Double?>,
) {
    fun speedsFor(win: Int): List<Double> = when (win) { 1 -> speeds1; 5 -> speeds5; else -> speedsMps }
}

private enum class ColorMode { SPEED, HR, PUMP }

// Farb-Legende (horizontaler Verlauf min→max) für den gewählten Farbmodus — wie die PWA.
@Composable
private fun ColorLegend(mode: ColorMode, hrRange: Pair<Int, Int>, pumpRange: Pair<Double, Double>) {
    val (lo, hi) = when (mode) {
        ColorMode.SPEED -> "8 km/h" to "25 km/h"     // feste Speed-Skala (wie speedColor)
        ColorMode.HR -> "${hrRange.first}" to "${hrRange.second} bpm"
        ColorMode.PUMP -> "%.1f".format(pumpRange.first) to "%.1f Hz".format(pumpRange.second)
    }
    val ramp = remember { (0..12).map { rampColor(it / 12.0) } }
    Column(Modifier.fillMaxWidth().padding(top = 2.dp)) {
        Box(Modifier.fillMaxWidth().height(10.dp).clip(RoundedCornerShape(5.dp))
            .background(androidx.compose.ui.graphics.Brush.horizontalGradient(ramp)))
        Row(Modifier.fillMaxWidth().padding(top = 2.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(lo, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(hi, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

fun parseTrack(tg: JsonElement): Track {
    return try {
        val obj = tg.jsonObject
        val coords = obj["geometry"]!!.jsonObject["coordinates"]!!.jsonArray
        val pts = coords.map { c ->
            val arr = c.jsonArray
            arr[0].jsonPrimitive.doubleOrNull!! to arr[1].jsonPrimitive.doubleOrNull!!  // lon,lat
        }
        val props = obj["properties"]?.jsonObject
        val s3def = props?.get("speeds_mps")?.jsonArray?.map { it.jsonPrimitive.doubleOrNull ?: 0.0 } ?: emptyList()
        val sw = props?.get("speeds")?.jsonObject
        fun win(key: String): List<Double> =
            sw?.get(key)?.jsonArray?.map { it.jsonPrimitive.doubleOrNull ?: 0.0 } ?: s3def
        val hr = props?.get("hr")?.jsonArray?.map { it.jsonPrimitive.intOrNull } ?: emptyList()
        val pumpHz = props?.get("pump_hz")?.jsonArray?.map { it.jsonPrimitive.doubleOrNull } ?: emptyList()
        Track(pts, win("3"), win("1"), win("5"), hr, pumpHz)
    } catch (_: Exception) { Track(emptyList(), emptyList(), emptyList(), emptyList(), emptyList(), emptyList()) }
}

// Wert -> Farbe (blau niedrig -> rot hoch).
fun rampColor(t: Double): Color {
    val hue = ((1 - t.coerceIn(0.0, 1.0)) * 240).toFloat()
    return Color(android.graphics.Color.HSVToColor(floatArrayOf(hue, 0.85f, 0.95f)))
}
// Speed -> Farbe (8..25 km/h), wie Wear/Web.
fun speedColor(kmh: Double): Color = rampColor((kmh - 8) / (25 - 8))

val GRAY = Color(0xFF64748B)

// Track auf OSM-Karte (osmdroid, FLOSS — wie Spots/Web). Nur die Foiling-Läufe
// (segments[].iStart..iEnd), je Punktpaar nach Modus gefärbt; Nicht-Foiling unsichtbar.
// Optional weiße Pump-Marker an den erkannten Pump-Stößen.
private const val MAX_DRAW_GAP_M = 30.0

private fun pumpDot(): android.graphics.drawable.Drawable {
    // Dichteskaliert: 14 PHYSISCHE px waren auf HiDPI-Displays winzig (~5 dp). Jetzt ~13 dp,
    // weißer Punkt mit dunklem Ring -> gut sichtbar über der farbigen Linie (wie im Web).
    val d = android.content.res.Resources.getSystem().displayMetrics.density
    val s = (13f * d).toInt().coerceAtLeast(14)
    val r = s / 2f
    val ring = 2f * d
    val bmp = android.graphics.Bitmap.createBitmap(s, s, android.graphics.Bitmap.Config.ARGB_8888)
    val cv = android.graphics.Canvas(bmp)
    val fill = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { color = android.graphics.Color.WHITE }
    val edge = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
        color = android.graphics.Color.rgb(15, 23, 42); style = android.graphics.Paint.Style.STROKE; strokeWidth = ring
    }
    cv.drawCircle(r, r, r - ring, fill)
    cv.drawCircle(r, r, r - ring, edge)
    return android.graphics.drawable.BitmapDrawable(null, bmp)
}

@Composable
private fun TrackMap(
    track: Track, segments: List<Segment>, mode: ColorMode,
    hrRange: Pair<Int, Int>, pumpRange: Pair<Double, Double>, showPumps: Boolean, win: Int,
    selectedRun: Int?, onSelectRun: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val pts = track.points
    val speeds = track.speedsFor(win)
    fun colorAt(i: Int): Color = when (mode) {
        ColorMode.SPEED -> speedColor((speeds.getOrNull(i) ?: 0.0) * 3.6)
        ColorMode.HR -> {
            val v = track.hr.getOrNull(i)
            val (lo, hi) = hrRange
            if (v == null || v <= 0) GRAY else rampColor((v - lo).toDouble() / (hi - lo).coerceAtLeast(1).toDouble())
        }
        ColorMode.PUMP -> {
            val v = track.pumpHz.getOrNull(i)
            val (lo, hi) = pumpRange
            if (v == null) GRAY else rampColor((v - lo) / (hi - lo).coerceAtLeast(1e-6))
        }
    }
    AndroidView(
        modifier = modifier,
        factory = { c ->
            Configuration.getInstance().userAgentValue = c.packageName
            MapView(c).apply {
                setTileSource(TileSourceFactory.MAPNIK)
                setMultiTouchControls(true)
                controller.setZoom(13.0)
            }
        },
        update = { map ->
            map.overlays.clear()
            val dens = map.context.resources.displayMetrics.density   // px<->dp, sonst zu dünn auf HiDPI
            val allPts = ArrayList<GeoPoint>()
            val selPts = ArrayList<GeoPoint>()
            segments.forEachIndexed { runIdx, seg ->
                val dim = selectedRun != null && runIdx != selectedRun   // anderer Lauf -> ausgegraut
                val start = seg.iStart.coerceIn(0, pts.size - 1)
                val end = seg.iEnd.coerceIn(0, pts.size - 1)
                for (i in start until end) {
                    val a = pts[i]; val b = pts[i + 1]
                    val pa = GeoPoint(a.second, a.first)   // (lat, lon)
                    val pb = GeoPoint(b.second, b.first)
                    if (pa.distanceToAsDouble(pb) > MAX_DRAW_GAP_M) continue
                    map.overlays.add(Polyline(map).apply {
                        setPoints(listOf(pa, pb))
                        outlinePaint.color = if (dim) GRAY.copy(alpha = 0.5f).toArgb() else colorAt(i + 1).toArgb()
                        outlinePaint.strokeWidth = (if (dim) 2.5f else 5f) * dens
                        setOnClickListener { _, _, _ -> onSelectRun(runIdx); true }   // Lauf antippen -> auswählen
                    })
                    allPts.add(pa); allPts.add(pb)
                    if (!dim) { selPts.add(pa); selPts.add(pb) }
                }
                // Pump-Marker nur für den (ggf. ausgewählten) Lauf, nicht für gedimmte.
                if (showPumps && !dim) {
                    val dot = pumpDot()
                    for (idx in seg.pumpIdx) {
                        val p = pts.getOrNull(idx) ?: continue
                        map.overlays.add(Marker(map).apply {
                            position = GeoPoint(p.second, p.first)
                            icon = dot
                            setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
                            setInfoWindow(null)
                            setOnMarkerClickListener { _, _ -> true }
                        })
                    }
                }
            }
            // Auf den ausgewählten Lauf zoomen, sonst auf alle Foiling-Läufe.
            val fitPts = if (selectedRun != null && selPts.isNotEmpty()) selPts else allPts
            if (fitPts.isNotEmpty()) {
                val bb = BoundingBox.fromGeoPoints(fitPts)
                map.post { map.zoomToBoundingBox(bb.increaseByScale(1.3f), false, 48) }
            }
            map.invalidate()
        },
    )
}

// Foil-Auswahl als Dropdown (wie die PWA <select>): zeigt nur den gewählten Foil,
// aufklappbar in „Standard-Foil" + „Meine Foils" + „Alle Marken".
@Composable
private fun FoilDropdown(all: List<Foil>, mineIds: Set<Int>, selectedId: Int?, onSelect: (Int?) -> Unit) {
    var open by remember { mutableStateOf(false) }
    val sel = all.firstOrNull { it.id == selectedId }
    val label = sel?.let { "${it.brand} ${it.model} ${it.size}" } ?: I18n.t("foil.useDefault")
    val mine = all.filter { it.id in mineIds }
    val others = all.filter { it.id !in mineIds }
    Box {
        OutlinedButton(onClick = { open = true }) {
            Text(label, maxLines = 1)
            Icon(Icons.Filled.ArrowDropDown, contentDescription = null)
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            DropdownMenuItem(text = { Text(I18n.t("foil.useDefault")) }, onClick = { open = false; onSelect(null) })
            if (mine.isNotEmpty()) {
                HorizontalDivider()
                Text(I18n.t("foils.title"), Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                    style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                mine.forEach { f ->
                    DropdownMenuItem(text = { Text("${f.brand} ${f.model} ${f.size}") }, onClick = { open = false; onSelect(f.id) })
                }
            }
            if (others.isNotEmpty()) {
                HorizontalDivider()
                Text(I18n.t("foils.allBrands"), Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                    style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                others.forEach { f ->
                    DropdownMenuItem(text = { Text("${f.brand} ${f.model} ${f.size}") }, onClick = { open = false; onSelect(f.id) })
                }
            }
        }
    }
}

// Leistungs-Karte: theoretische Pump-Leistung (Watt) bei Ø- und Top-Speed.
@Composable
private fun PowerCard(a: Analysis, foil: Foil, weightKg: Double) {
    val dims = FoilPhysics.FoilDims(foil.spanCm, foil.areaCm2, foil.thicknessMm)
    val rider = FoilPhysics.RiderParams(riderWeight = weightKg)
    val pump = a.avgCadenceHz?.let { FoilPhysics.PumpParams(pumpFreqHz = it) }
    val avgKmh = if ((a.foilingTimeS ?: 0.0) > 0 && a.foilingDistanceM != null)
        a.foilingDistanceM / a.foilingTimeS!! * 3.6 else null
    val topKmh = a.maxSpeedMps?.let { it * 3.6 }
    fun watt(kmh: Double?): String =
        if (kmh == null) "–" else "%.0f W".format(FoilPhysics.computeFoilPowerAtSpeed(dims, kmh, rider, pump = pump).power)
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp)) {
            Text("${I18n.t("sd.power")} (${foil.brand} ${foil.model} ${foil.size})",
                style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(6.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Column {
                    Text(watt(avgKmh), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
                    Text(I18n.t("sd.atAvg"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Column {
                    Text(watt(topKmh), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
                    Text(I18n.t("sd.atTop"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

// Läufe-Tabelle: je Foiling-Lauf Distanz/Dauer/Ø-/Top-Speed/Pumps. Zeile antippen -> Lauf auswählen
// (Karte zeigt dann nur diesen farbig); ausgewählte Zeile ist hervorgehoben.
@Composable
private fun RunsTable(segments: List<Segment>, selected: Int?, onSelect: (Int) -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp)) {
            Text("${I18n.t("home.runs")} (${segments.size})", style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(6.dp))
            Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                listOf("#", I18n.t("sd.hDist"), I18n.t("field.3"), "Ø", "Top", I18n.t("home.pumps")).forEach {
                    Text(it, style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                }
            }
            segments.forEachIndexed { i, seg ->
                val sel = selected == i
                Row(
                    Modifier.fillMaxWidth().padding(top = 4.dp)
                        .clip(RoundedCornerShape(6.dp))
                        .background(if (sel) MaterialTheme.colorScheme.primary.copy(alpha = 0.16f) else Color.Transparent)
                        .clickable { onSelect(i) }
                        .padding(vertical = 4.dp, horizontal = 4.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    val cells = listOf(
                        "${i + 1}",
                        if (seg.distanceM < 1000) "%.0f m".format(seg.distanceM) else "%.2f km".format(seg.distanceM / 1000),
                        "%d:%02d".format((seg.durationS / 60).toInt(), (seg.durationS % 60).toInt()),
                        "%.0f".format(seg.avgSpeedMps * 3.6),
                        "%.0f".format(seg.maxSpeedMps * 3.6),
                        if (seg.pumps > 0) "${seg.pumps}" else "–",
                    )
                    cells.forEach {
                        Text(it, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f),
                            color = if (sel) MaterialTheme.colorScheme.primary else Color.Unspecified)
                    }
                }
            }
        }
    }
}

// Eine Kennzahl-Kachel; runIdx != null => an einen Lauf gebunden (anklickbar -> Lauf auswählen).
private data class StatItem(val label: String, val value: String, val runIdx: Int? = null)

@Composable
private fun StatGrid(stats: List<StatItem>, selected: Int? = null, onSelect: (Int) -> Unit = {}) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        stats.chunked(2).forEach { rowItems ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                rowItems.forEach { st ->
                    val sel = st.runIdx != null && st.runIdx == selected
                    val mod = Modifier.weight(1f).then(
                        if (st.runIdx != null) Modifier.clickable { onSelect(st.runIdx) } else Modifier
                    )
                    val colors = if (sel) CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
                                 else CardDefaults.cardColors()
                    Card(mod, colors = colors) {
                        Column(Modifier.padding(12.dp)) {
                            Text(st.value, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
                            Text(st.label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
                if (rowItems.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

// Vollbild-Foto-Ansicht (Dialog): tippen schließt, bei mehreren Fotos horizontal wischen.
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun PhotoLightbox(photos: List<SessionPhoto>, startIdx: Int, onClose: () -> Unit) {
    if (photos.isEmpty()) return
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        val pager = rememberPagerState(
            initialPage = startIdx.coerceIn(0, photos.size - 1), pageCount = { photos.size })
        Box(
            Modifier.fillMaxSize().background(Color.Black).clickable(onClick = onClose),
            contentAlignment = Alignment.Center,
        ) {
            HorizontalPager(state = pager, modifier = Modifier.fillMaxSize()) { page ->
                AsyncImage(
                    model = Api.mediaUrl(photos[page].url),
                    contentDescription = null,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.fillMaxSize(),
                )
            }
            // Sichtbares Schließen-X (zusätzlich zu Zurück/Tippen).
            IconButton(onClick = onClose, modifier = Modifier.align(Alignment.TopEnd).padding(8.dp)) {
                Icon(Icons.Filled.Close, contentDescription = I18n.t("common.cancel"), tint = Color.White)
            }
        }
    }
}

// YouTube-Video-ID aus watch?v=, youtu.be/, shorts/, embed/ ziehen (wie web/SessionDetail).
private fun youtubeId(url: String?): String? {
    if (url.isNullOrBlank()) return null
    val patterns = listOf(
        Regex("""[?&]v=([\w-]{11})"""),
        Regex("""youtu\.be/([\w-]{11})"""),
        Regex("""shorts/([\w-]{11})"""),
        Regex("""embed/([\w-]{11})"""),
    )
    for (p in patterns) p.find(url)?.let { return it.groupValues[1] }
    return null
}

private fun epochMs(iso: String?): Long? = iso?.let {
    try { java.time.OffsetDateTime.parse(it).toInstant().toEpochMilli() } catch (_: Exception) { null }
}
private fun mmss(sec: Float): String = "%d:%02d".format((sec / 60).toInt(), (sec % 60).toInt())
// HH:mm in der Zeitzone der Aufnahme (Offset aus dem ISO-String).
private fun hhmmLoc(iso: String?): String = iso?.let {
    try { java.time.OffsetDateTime.parse(it).format(java.time.format.DateTimeFormatter.ofPattern("HH:mm")) }
    catch (_: Exception) { null }
} ?: ""

// Session an einen anderen Nutzer übertragen (spiegelt web/TransferPicker). Zeigt sonst
// den Status einer ausstehenden Übertragung + Zurücknehmen.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TransferPicker(sessionId: Int) {
    val scope = rememberCoroutineScope()
    var pending by remember(sessionId) { mutableStateOf<Transfer?>(null) }
    var open by remember { mutableStateOf(false) }
    var friends by remember { mutableStateOf<List<DmUser>>(emptyList()) }
    var q by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<DmUser>>(emptyList()) }
    var busy by remember { mutableStateOf(false) }
    var confirmUser by remember { mutableStateOf<DmUser?>(null) }

    LaunchedEffect(sessionId) {
        val t = try { Api.transferForSession(sessionId) } catch (_: Exception) { null }
        if (t?.role == "sender") pending = t
    }
    LaunchedEffect(open) { if (open) friends = try { Api.transferFriends() } catch (_: Exception) { emptyList() } }
    LaunchedEffect(q) {
        val s = q.trim()
        if (s.isEmpty()) { results = emptyList(); return@LaunchedEffect }
        kotlinx.coroutines.delay(250)
        results = try { Api.chatSearchUsers(s) } catch (_: Exception) { emptyList() }
    }

    val p = pending
    if (p != null) {
        Row(
            Modifier.fillMaxWidth().padding(top = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(I18n.t("transfer.pending").replace("{name}", p.other?.displayName ?: "?"),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.tertiary, modifier = Modifier.weight(1f))
            TextButton(onClick = {
                scope.launch { try { Api.transferCancel(p.id); pending = null } catch (_: Exception) {} }
            }) { Text(I18n.t("transfer.cancel")) }
        }
        return
    }

    OutlinedButton(onClick = { open = true }) {
        Icon(Icons.AutoMirrored.Filled.Send, contentDescription = null, modifier = Modifier.size(18.dp),
            tint = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.width(6.dp))
        Text(I18n.t("transfer.action"))
    }

    if (open) {
        ModalBottomSheet(onDismissRequest = { open = false }) {
            Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(bottom = 24.dp)) {
                Text(I18n.t("transfer.title"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Text(I18n.t("transfer.desc"), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp, bottom = 10.dp))
                OutlinedTextField(
                    value = q, onValueChange = { q = it },
                    singleLine = true, placeholder = { Text(I18n.t("transfer.searchAll")) },
                    modifier = Modifier.fillMaxWidth(),
                )
                val list = if (q.isBlank()) friends else results
                if (q.isBlank() && friends.isNotEmpty()) {
                    Text(I18n.t("transfer.friends"), style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 10.dp, bottom = 2.dp))
                }
                Column(Modifier.fillMaxWidth().heightIn(max = 320.dp).verticalScroll(rememberScrollState())) {
                    if (list.isEmpty()) {
                        Text(I18n.t("transfer.noResults"), style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = 12.dp))
                    } else list.forEach { u ->
                        Row(
                            Modifier.fillMaxWidth().clickable(enabled = !busy) { confirmUser = u }
                                .padding(vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            val av = Api.mediaUrl(u.avatarUrl)
                            if (av != null) {
                                AsyncImage(model = av, contentDescription = null, contentScale = ContentScale.Crop,
                                    modifier = Modifier.size(32.dp).clip(CircleShape))
                            } else {
                                Icon(Icons.Filled.Person, contentDescription = null,
                                    tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(32.dp))
                            }
                            Spacer(Modifier.width(10.dp))
                            Text(u.displayName ?: "?", style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
            }
        }
    }

    confirmUser?.let { u ->
        AlertDialog(
            onDismissRequest = { confirmUser = null },
            title = { Text(I18n.t("transfer.title")) },
            text = { Text(I18n.t("transfer.confirmSend").replace("{name}", u.displayName ?: "?")) },
            confirmButton = {
                TextButton(onClick = {
                    confirmUser = null
                    busy = true
                    scope.launch {
                        try {
                            pending = Api.transferInitiate(sessionId, u.id)
                            open = false; q = ""; results = emptyList()
                        } catch (_: Exception) {}
                        busy = false
                    }
                }) { Text(I18n.t("transfer.action")) }
            },
            dismissButton = { TextButton(onClick = { confirmUser = null }) { Text(I18n.t("common.cancel")) } },
        )
    }
}

// Bild vor dem Upload auf Web-Größe verkleinern (max 1920 px lange Kante, JPEG q85) — spart
// Upload-Zeit + Speicher. EXIF-Orientierung wird angewandt. Bei Fehler/kein-Gewinn: Original.
private fun downscaleJpeg(src: ByteArray, maxEdge: Int = 1920, quality: Int = 85): ByteArray {
    return try {
        val bounds = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
        android.graphics.BitmapFactory.decodeByteArray(src, 0, src.size, bounds)
        val (w, h) = bounds.outWidth to bounds.outHeight
        if (w <= 0 || h <= 0) return src
        // Grob per inSampleSize vorskalieren (speicherschonend bei großen Fotos).
        var sample = 1
        while (maxOf(w, h) / sample > maxEdge * 2) sample *= 2
        val opts = android.graphics.BitmapFactory.Options().apply { inSampleSize = sample }
        var bmp = android.graphics.BitmapFactory.decodeByteArray(src, 0, src.size, opts) ?: return src
        // EXIF-Rotation anwenden.
        val ori = try {
            android.media.ExifInterface(java.io.ByteArrayInputStream(src))
                .getAttributeInt(android.media.ExifInterface.TAG_ORIENTATION, android.media.ExifInterface.ORIENTATION_NORMAL)
        } catch (_: Exception) { android.media.ExifInterface.ORIENTATION_NORMAL }
        val deg = when (ori) {
            android.media.ExifInterface.ORIENTATION_ROTATE_90 -> 90f
            android.media.ExifInterface.ORIENTATION_ROTATE_180 -> 180f
            android.media.ExifInterface.ORIENTATION_ROTATE_270 -> 270f
            else -> 0f
        }
        // Präzise auf maxEdge skalieren.
        val cur = maxOf(bmp.width, bmp.height)
        val scale = if (cur > maxEdge) maxEdge.toFloat() / cur else 1f
        if (scale < 1f || deg != 0f) {
            val m = android.graphics.Matrix().apply { if (scale < 1f) postScale(scale, scale); if (deg != 0f) postRotate(deg) }
            bmp = android.graphics.Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, m, true)
        }
        val out = java.io.ByteArrayOutputStream()
        bmp.compress(android.graphics.Bitmap.CompressFormat.JPEG, quality, out)
        val res = out.toByteArray()
        if (res.size < src.size) res else src   // kein Gewinn -> Original
    } catch (_: Exception) { src }
}
