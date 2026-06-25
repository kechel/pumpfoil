package org.pumpfoil.app

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import coil.compose.AsyncImage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material3.FilledTonalButton
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.launch
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.unit.dp
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.math.cos
import kotlin.math.PI

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SessionDetailScreen(id: Int, onBack: () -> Unit) {
    var session by remember { mutableStateOf<SessionDetail?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(id) {
        loading = true
        try { session = Api.session(id); error = null }
        catch (e: Exception) { error = e.message }
        loading = false
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Session") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Zurück")
                    }
                },
            )
        },
    ) { pad ->
        Box(Modifier.padding(pad).fillMaxSize().padding(16.dp)) {
            val s = session
            when {
                loading -> CircularProgressIndicator(Modifier.align(Alignment.Center))
                error != null -> Text(error!!, color = MaterialTheme.colorScheme.error)
                s != null -> DetailContent(s)
            }
        }
    }
}

@Composable
private fun DetailContent(s: SessionDetail) {
    val scope = rememberCoroutineScope()
    var liked by remember(s.id) { mutableStateOf(s.liked) }
    var likeCount by remember(s.id) { mutableStateOf(s.likeCount) }
    Column(
        Modifier.verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(prettyDate(s.startedAt), style = MaterialTheme.typography.headlineSmall, modifier = Modifier.weight(1f))
            FilledTonalButton(onClick = {
                val prev = liked; liked = !liked; likeCount += if (liked) 1 else -1
                scope.launch {
                    try { val st = Api.toggleLike(s.id); liked = st.liked; likeCount = st.like_count }
                    catch (_: Exception) { liked = prev; likeCount += if (liked) 1 else -1 }
                }
            }) {
                Icon(if (liked) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder, contentDescription = "Like")
                Spacer(Modifier.width(6.dp))
                Text("$likeCount")
            }
        }
        s.placeName?.takeIf { it.isNotBlank() }?.let {
            Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        s.caption?.takeIf { it.isNotBlank() }?.let { Text(it) }

        // Fotos der Session: read-only Strip; Besitzer kann hinzufügen.
        var photos by remember(s.id) { mutableStateOf<List<SessionPhoto>>(emptyList()) }
        val ctx = LocalContext.current
        suspend fun reloadPhotos() { photos = try { Api.sessionPhotos(s.id) } catch (_: Exception) { emptyList() } }
        LaunchedEffect(s.id) { reloadPhotos() }
        val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
            if (uri != null) scope.launch {
                val bytes = withContext(Dispatchers.IO) { ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() } }
                if (bytes != null) { try { Api.uploadSessionPhoto(s.id, bytes); reloadPhotos() } catch (_: Exception) {} }
            }
        }
        if (photos.isNotEmpty()) {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                items(photos, key = { it.id }) { p ->
                    AsyncImage(
                        model = Api.mediaUrl(p.url),
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.size(width = 200.dp, height = 140.dp).clip(RoundedCornerShape(12.dp)),
                    )
                }
            }
        }
        if (s.owned) {
            OutlinedButton(onClick = {
                picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
            }) { Text("Foto hinzufügen") }
        }

        val a = s.analysis
        // Track: GPS-Polyline (speed-gefärbt) + Speed-Verlauf — ohne externe
        // Kartenkacheln, leichtgewichtig.
        a?.trackGeojson?.let { tg ->
            val track = remember(tg) { parseTrack(tg) }
            if (track.points.size >= 2) {
                Card(Modifier.fillMaxWidth()) {
                    TrackMap(track, Modifier.fillMaxWidth().aspectRatio(1.3f).padding(8.dp))
                }
            }
            val speedsKmh = remember(track) { track.speedsMps.map { it * 3.6 } }
            if (speedsKmh.size >= 2) {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp)) {
                        Text("Geschwindigkeit (km/h)", style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.height(6.dp))
                        SpeedChart(speedsKmh, Modifier.fillMaxWidth().aspectRatio(2.4f))
                    }
                }
            }
        }
        if (a == null) {
            Text("Auswertung läuft noch …", color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            val stats = buildList {
                a.totalDistanceM?.let { add("Strecke" to "%.0f m".format(it)) }
                a.foilingDistanceM?.let { add("Foiling" to "%.0f m".format(it)) }
                a.maxSpeedMps?.let { add("Top-Speed" to "%.1f km/h".format(it * 3.6)) }
                a.pumpCount?.let { add("Pumps" to it.toString()) }
                a.foilingTimeS?.let { add("Foil-Zeit" to "%d:%02d".format((it / 60).toInt(), (it % 60).toInt())) }
                a.avgCadenceHz?.let { add("Cadence" to "%.2f Hz".format(it)) }
            }
            StatGrid(stats)
        }
    }
}

// Geparster Track: GPS-Punkte (lon,lat) + 3-s-Speed (m/s) je Punkt.
private class Track(val points: List<Pair<Double, Double>>, val speedsMps: List<Double>)

private fun parseTrack(tg: JsonElement): Track {
    return try {
        val obj = tg.jsonObject
        val coords = obj["geometry"]!!.jsonObject["coordinates"]!!.jsonArray
        val pts = coords.map { c ->
            val arr = c.jsonArray
            arr[0].jsonPrimitive.doubleOrNull!! to arr[1].jsonPrimitive.doubleOrNull!!  // lon,lat
        }
        val speeds = obj["properties"]?.jsonObject?.get("speeds_mps")?.jsonArray
            ?.map { it.jsonPrimitive.doubleOrNull ?: 0.0 } ?: emptyList()
        Track(pts, speeds)
    } catch (_: Exception) { Track(emptyList(), emptyList()) }
}

// Speed -> Farbe (blau langsam -> rot schnell), wie Wear/Web (8..25 km/h).
private fun speedColor(kmh: Double): Color {
    val t = ((kmh - 8) / (25 - 8)).coerceIn(0.0, 1.0)
    val hue = ((1 - t) * 240).toFloat()
    return Color(android.graphics.Color.HSVToColor(floatArrayOf(hue, 0.85f, 0.95f)))
}

// Track-Polyline auf Canvas: BoundingBox-normiert mit cos(lat)-Längenkorrektur,
// Segmente nach 3-s-Speed eingefärbt. Keine Kartenkacheln nötig.
@Composable
private fun TrackMap(track: Track, modifier: Modifier = Modifier) {
    val pts = track.points
    val latMin = pts.minOf { it.second }; val latMax = pts.maxOf { it.second }
    val lonMin = pts.minOf { it.first }; val lonMax = pts.maxOf { it.first }
    val latMid = (latMin + latMax) / 2
    val lonScale = cos(latMid * PI / 180.0)
    val w = ((lonMax - lonMin) * lonScale).coerceAtLeast(1e-9)
    val h = (latMax - latMin).coerceAtLeast(1e-9)
    val grid = MaterialTheme.colorScheme.surfaceVariant

    Canvas(modifier) {
        val pad = 12f
        val availW = size.width - 2 * pad
        val availH = size.height - 2 * pad
        val scale = minOf(availW / w, availH / h)
        val drawW = w * scale; val drawH = h * scale
        val offX = pad + (availW - drawW) / 2
        val offY = pad + (availH - drawH) / 2
        fun project(p: Pair<Double, Double>): Offset {
            val x = (p.first - lonMin) * lonScale * scale + offX
            val y = (latMax - p.second) * scale + offY   // lat invertiert (Norden oben)
            return Offset(x.toFloat(), y.toFloat())
        }
        for (i in 0 until pts.size - 1) {
            val sp = (track.speedsMps.getOrNull(i) ?: 0.0) * 3.6
            drawLine(
                color = if (track.speedsMps.isEmpty()) grid else speedColor(sp),
                start = project(pts[i]), end = project(pts[i + 1]),
                strokeWidth = 4f, cap = StrokeCap.Round,
            )
        }
    }
}

// Speed-Verlauf als Canvas-Liniendiagramm (speed-gefärbt), Baseline 0, Top = Maxwert.
@Composable
private fun SpeedChart(speedsKmh: List<Double>, modifier: Modifier = Modifier) {
    val maxV = (speedsKmh.maxOrNull() ?: 1.0).coerceAtLeast(1.0)
    val axis = MaterialTheme.colorScheme.surfaceVariant
    Canvas(modifier) {
        val pad = 6f
        val availW = size.width - 2 * pad
        val availH = size.height - 2 * pad
        // Nulllinie unten.
        drawLine(axis, Offset(pad, pad + availH), Offset(pad + availW, pad + availH), strokeWidth = 2f)
        val n = speedsKmh.size
        fun project(i: Int, v: Double): Offset {
            val x = pad + availW * (if (n > 1) i.toFloat() / (n - 1) else 0f)
            val y = pad + availH * (1f - (v / maxV).toFloat())
            return Offset(x, y)
        }
        for (i in 0 until n - 1) {
            drawLine(
                color = speedColor((speedsKmh[i] + speedsKmh[i + 1]) / 2),
                start = project(i, speedsKmh[i]), end = project(i + 1, speedsKmh[i + 1]),
                strokeWidth = 3f, cap = StrokeCap.Round,
            )
        }
    }
}

@Composable
private fun StatGrid(stats: List<Pair<String, String>>) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        stats.chunked(2).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { (label, value) ->
                    Card(Modifier.weight(1f)) {
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
