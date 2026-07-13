package org.pumpfoil.app

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.osmdroid.config.Configuration
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.BoundingBox
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Polyline

private enum class Mode { CUMULATIVE, W7, W30 }
private enum class Kind { MAX, SUM, COUNT, AVG, RATIO }
private const val DAY_MS = 24L * 3600 * 1000

private class Pt(val t: Long, val v: Double)

// Eine Verlauf-Kennzahl: wie über die Zeit aggregiert wird + Formatierung/Farbe.
private class HMetric(
    val labelKey: String,
    val color: Color,
    val kind: Kind,
    val value: (HistoryPoint) -> Double?,
    val num: ((HistoryPoint) -> Double?)? = null,
    val den: ((HistoryPoint) -> Double?)? = null,
    val fmt: (Double) -> String,
)

private fun mmssMin(s: Double) = "%d:%02d min".format((s / 60).toInt(), (s % 60).toInt())

// Best-pro-Session-Metriken (kumuliert = laufender Bestwert, Fenster = Max im Fenster).
private val METRICS = listOf(
    HMetric("home.farthestRun", Color(0xFF22D3EE), Kind.MAX, { it.distance }, fmt = { "%.0f m".format(it) }),
    HMetric("home.longestRun", Color(0xFF34D399), Kind.MAX, { it.duration }, fmt = { mmssMin(it) }),
    HMetric("home.longestGlide", Color(0xFFA78BFA), Kind.MAX, { it.glide }, fmt = { "%.1f s".format(it) }),
    HMetric("verlauf.foilingPerSession", Color(0xFF60A5FA), Kind.MAX, { it.foilingKm }, fmt = { "%.1f km".format(it) }),
    HMetric("sd.avgSpeed", Color(0xFFF59E0B), Kind.MAX, { it.avgSpeed?.let { v -> v * 3.6 } }, fmt = { "%.1f km/h".format(it) }),
    HMetric("sd.avgPump", Color(0xFFF472B6), Kind.MAX, { it.avgPumpHz }, fmt = { "%.2f Hz".format(it) }),
    HMetric("verlauf.pumpsPerSession", Color(0xFFFB7185), Kind.RATIO, { null },
        num = { it.pumps.toDouble() }, den = { 1.0 }, fmt = { "%.0f".format(it) }),
    HMetric("sd.avgDistPerPump", Color(0xFF2DD4BF), Kind.RATIO, { null },
        num = { it.foilingKm }, den = { it.pumps.toDouble() }, fmt = { "%.1f m".format(it * 1000) }),
)

// Summen über das Fenster bzw. kumuliert.
private val METRICS_SUM = listOf(
    HMetric("nav.sessions", Color(0xFF60A5FA), Kind.COUNT, { 1.0 }, fmt = { "%.0f".format(it) }),
    HMetric("home.runs", Color(0xFF34D399), Kind.SUM, { it.runs.toDouble() }, fmt = { "%.0f".format(it) }),
    HMetric("verlauf.kmFoiling", Color(0xFF22D3EE), Kind.SUM, { it.foilingKm }, fmt = { "%.1f km".format(it) }),
    HMetric("home.pumps", Color(0xFFA78BFA), Kind.SUM, { it.pumps.toDouble() }, fmt = { "%.0f".format(it) }),
)

private fun winMs(mode: Mode) = (if (mode == Mode.W7) 7L else 30L) * DAY_MS

// Zeitreihe für eine Metrik (kumuliert oder gleitendes Fenster über das Tagesraster).
private fun series(data: List<Pair<Long, HistoryPoint>>, m: HMetric, mode: Mode, domain: Pair<Long, Long>): List<Pt> {
    if (m.kind == Kind.RATIO) {
        val valid = data.mapNotNull { (t, h) ->
            val n = m.num!!(h); val d = m.den!!(h)
            if (n != null && d != null && n.isFinite() && d.isFinite() && n > 0 && d > 0) Triple(t, n, d) else null
        }
        if (valid.size < 2) return emptyList()
        if (mode == Mode.CUMULATIVE) {
            var sn = 0.0; var sd = 0.0
            return valid.map { (t, n, d) -> sn += n; sd += d; Pt(t, if (sd > 0) sn / sd else 0.0) }
        }
        val w = winMs(mode)
        fun at(tt: Long): Pt {
            var sn = 0.0; var sd = 0.0
            for ((t, n, d) in valid) if (t > tt - w && t <= tt) { sn += n; sd += d }
            return Pt(tt, if (sd > 0) sn / sd else 0.0)
        }
        val out = ArrayList<Pt>()
        var tt = domain.first; while (tt < domain.second) { out.add(at(tt)); tt += DAY_MS }
        out.add(at(domain.second)); return out
    }
    val valid = data.mapNotNull { (t, h) -> m.value(h)?.let { v -> if (v.isFinite()) t to v else null } }
    if (valid.size < 2) return emptyList()
    if (mode == Mode.CUMULATIVE) {
        var sum = 0.0; var n = 0; var mx = 0.0
        return valid.map { (t, v) ->
            sum += v; n++; if (v > mx) mx = v
            Pt(t, when (m.kind) { Kind.AVG -> sum / n; Kind.COUNT -> n.toDouble(); Kind.MAX -> mx; else -> sum })
        }
    }
    val w = winMs(mode)
    fun at(tt: Long): Pt {
        var sum = 0.0; var n = 0; var mx = 0.0
        for ((t, v) in valid) if (t > tt - w && t <= tt) { sum += v; n++; if (v > mx) mx = v }
        return Pt(tt, when (m.kind) { Kind.AVG -> if (n > 0) sum / n else 0.0; Kind.COUNT -> n.toDouble(); Kind.MAX -> mx; else -> sum })
    }
    val out = ArrayList<Pt>()
    var tt = domain.first; while (tt < domain.second) { out.add(at(tt)); tt += DAY_MS }
    out.add(at(domain.second)); return out
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VerlaufScreen(onOpen: (Int) -> Unit) {
    var items by remember { mutableStateOf<List<HistoryPoint>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var mode by remember { mutableStateOf(Mode.W7) }

    suspend fun load() {
        loading = true
        try { items = Api.history(); error = null }
        catch (e: Exception) { error = e.message }
        loading = false
    }
    LaunchedEffect(Unit) { load() }

    // Gemeinsame Zeitachse (epoch ms), chronologisch.
    val data = remember(items) {
        items.mapNotNull { hp -> epochMsIso(hp.startedAt)?.let { it to hp } }.sortedBy { it.first }
    }
    val domain = remember(data) {
        if (data.isEmpty()) 0L to 1L else data.first().first to data.last().first
    }

    Scaffold(topBar = { PumpfoilTopBar(I18n.t("nav.history")) }) { pad ->
        val scope = rememberCoroutineScope()
        Box(Modifier.padding(pad)) {
            Refreshable(refreshing = loading, onRefresh = { scope.launch { load() } }) {
                if (loading && items.isEmpty()) {
                    CircularProgressIndicator(Modifier.align(Alignment.Center))
                } else if (data.size < 2) {
                    Text(I18n.t("verlauf.empty"), Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else {
                    LazyColumn(Modifier.fillMaxSize().padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        item {
                            Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                FilterChip(selected = mode == Mode.CUMULATIVE, onClick = { mode = Mode.CUMULATIVE }, label = { Text(I18n.t("verlauf.cumulative")) }, colors = cyanChipColors())
                                FilterChip(selected = mode == Mode.W7, onClick = { mode = Mode.W7 }, label = { Text("7 ${I18n.t("verlauf.daysAbbr")}") }, colors = cyanChipColors())
                                FilterChip(selected = mode == Mode.W30, onClick = { mode = Mode.W30 }, label = { Text("30 ${I18n.t("verlauf.daysAbbr")}") }, colors = cyanChipColors())
                            }
                        }
                        items(METRICS) { m -> MetricChartCard(data, m, mode, domain) }
                        item {
                            val suffix = when (mode) {
                                Mode.W7 -> " · 7 ${I18n.t("verlauf.daysAbbr")}"
                                Mode.W30 -> " · 30 ${I18n.t("verlauf.daysAbbr")}"
                                else -> ""
                            }
                            Text(I18n.t("verlauf.aggTitle") + suffix, style = MaterialTheme.typography.titleMedium,
                                modifier = Modifier.padding(top = 6.dp))
                        }
                        items(METRICS_SUM) { m -> MetricChartCard(data, m, mode, domain) }
                        item { SpotProgression() }
                        item { Box(Modifier.height(8.dp)) }
                    }
                }
            }
        }
    }
}

@Composable
private fun MetricChartCard(data: List<Pair<Long, HistoryPoint>>, metric: HMetric, mode: Mode, domain: Pair<Long, Long>) {
    val pts = remember(data, metric, mode, domain) { series(data, metric, mode, domain) }
    val cur = pts.lastOrNull()?.v ?: 0.0
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(I18n.t(metric.labelKey), style = MaterialTheme.typography.titleSmall)
                Text(if (cur > 0) metric.fmt(cur) else "–", style = MaterialTheme.typography.titleSmall, color = metric.color)
            }
            LineChart(pts, metric.color, domain, Modifier.fillMaxWidth().height(110.dp).padding(top = 6.dp))
            if (pts.size >= 2) {
                // Kurze Zeitspanne -> Tag+Monat (wie Web), sonst Monat+Jahr.
                val shortSpan = (domain.second - domain.first) <= 120L * DAY_MS
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(histDate(domain.first, shortSpan), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(histDate(domain.second, shortSpan), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun LineChart(pts: List<Pt>, color: Color, domain: Pair<Long, Long>, modifier: Modifier) {
    if (pts.size < 2) {
        Box(modifier) { Text(I18n.t("verlauf.empty"), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        return
    }
    val tmin = domain.first.toDouble()
    val tmax = domain.second.toDouble().coerceAtLeast(tmin + 1)
    val vmax = (pts.maxOf { it.v } * 1.05).coerceAtLeast(1e-6)
    Canvas(modifier) {
        val w = size.width; val h = size.height; val padB = 6f
        fun px(t: Long) = (((t - tmin) / (tmax - tmin)) * w).toFloat()
        fun py(v: Double) = (h - padB - (v / vmax) * (h - padB)).toFloat()
        val line = Path(); val area = Path()
        pts.forEachIndexed { i, p ->
            val x = px(p.t); val y = py(p.v)
            if (i == 0) { line.moveTo(x, y); area.moveTo(x, h - padB); area.lineTo(x, y) }
            else { line.lineTo(x, y); area.lineTo(x, y) }
        }
        area.lineTo(px(pts.last().t), h - padB); area.close()
        drawPath(area, color = color, alpha = 0.13f)
        drawPath(line, color = color, style = Stroke(width = 3f, cap = StrokeCap.Round))
        drawLine(Color(0xFF334155), Offset(0f, h - padB), Offset(w, h - padB), strokeWidth = 1f)
    }
}

private fun epochMsIso(iso: String): Long? = try {
    java.time.OffsetDateTime.parse(iso).toInstant().toEpochMilli()
} catch (_: Exception) {
    try { java.time.LocalDateTime.parse(iso).toInstant(java.time.ZoneOffset.UTC).toEpochMilli() } catch (_: Exception) { null }
}

private fun histDate(ms: Long, shortSpan: Boolean): String =
    java.time.Instant.ofEpochMilli(ms).atZone(java.time.ZoneId.systemDefault())
        .format(java.time.format.DateTimeFormatter.ofPattern(if (shortSpan) "dd. MMM" else "MMM yy"))

private fun spotDate(iso: String?): String = iso?.let { epochMsIso(it) }?.let {
    java.time.Instant.ofEpochMilli(it).atZone(java.time.ZoneId.systemDefault())
        .format(java.time.format.DateTimeFormatter.ofPattern("dd.MM.yyyy"))
} ?: ""

// „Entwicklung am Spot": alle eigenen Sessions eines Spots chronologisch durchschalten,
// auf FIXEM Ausschnitt (Union aller Spuren). Farbe = Speed. Wie PWA/SpotProgression.tsx.
@Composable
fun SpotProgression() {
    var spots by remember { mutableStateOf<List<SpotCount>>(emptyList()) }
    var spot by remember { mutableStateOf("") }
    var open by remember { mutableStateOf(false) }
    var tracks by remember { mutableStateOf<List<SpotTrack>?>(null) }
    var idx by remember { mutableStateOf(0) }
    var playing by remember { mutableStateOf(false) }
    var mul by remember { mutableStateOf(1) }

    LaunchedEffect(Unit) {
        try { spots = Api.mySpots(); if (spot.isEmpty()) spots.firstOrNull()?.let { spot = it.spot } } catch (_: Exception) {}
    }
    LaunchedEffect(spot) {
        if (spot.isEmpty()) return@LaunchedEffect
        tracks = null; idx = 0; playing = false
        tracks = try { Api.spotTracks(spot) } catch (_: Exception) { emptyList() }
    }
    // Autoplay: eine Session pro Tick.
    LaunchedEffect(playing, tracks, mul) {
        val tr = tracks ?: return@LaunchedEffect
        while (playing && tr.isNotEmpty()) {
            delay((1100L / mul).coerceAtLeast(120L))
            if (idx >= tr.size - 1) { playing = false; break }
            idx += 1
        }
    }

    // Globale Speed-Skala (km/h) über ALLE Spuren des Spots -> eine Skala für alle.
    val (lo, hi) = remember(tracks) {
        var mn = Double.POSITIVE_INFINITY; var mx = Double.NEGATIVE_INFINITY
        tracks?.forEach { tr -> tr.track.forEach { p -> p.getOrNull(2)?.let { val k = it * 3.6; if (k < mn) mn = k; if (k > mx) mx = k } } }
        if (!mn.isFinite() || !mx.isFinite()) 8.0 to 25.0
        else Math.floor(mn) to Math.max(Math.ceil(mx), Math.floor(mn) + 1)
    }

    Card(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
        Column(Modifier.padding(12.dp)) {
            Text(I18n.t("hist.spotAnim"), style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(8.dp))
            Box {
                OutlinedButton(onClick = { open = true }, enabled = spots.isNotEmpty()) {
                    val c = spots.firstOrNull { it.spot == spot }
                    Text(if (c != null) "${c.spot} (${c.count})" else if (spots.isEmpty()) "–" else spot)
                }
                DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                    spots.forEach { s ->
                        DropdownMenuItem(text = { Text("${s.spot} (${s.count})") }, onClick = { open = false; if (s.spot != spot) spot = s.spot })
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            val trs = tracks
            when {
                spot.isEmpty() -> Text(I18n.t("hist.spotAnimHint"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                trs == null -> Box(Modifier.fillMaxWidth().height(60.dp), Alignment.Center) { CircularProgressIndicator() }
                trs.isEmpty() -> Text(I18n.t("sessions.none"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                else -> {
                    val safeIdx = idx.coerceIn(0, trs.size - 1)
                    var fitted by remember(spot) { mutableStateOf(false) }
                    AndroidView(
                        modifier = Modifier.fillMaxWidth().height(300.dp).clip(RoundedCornerShape(12.dp)),
                        factory = { c ->
                            Configuration.getInstance().userAgentValue = c.packageName
                            MapView(c).apply { setTileSource(TileSourceFactory.MAPNIK); setMultiTouchControls(true) }
                        },
                        update = { map ->
                            val dens = map.context.resources.displayMetrics.density
                            if (!fitted) {
                                val all = ArrayList<GeoPoint>()
                                trs.forEach { tr -> tr.track.forEach { p -> val la = p.getOrNull(0); val lo2 = p.getOrNull(1); if (la != null && lo2 != null) all.add(GeoPoint(la, lo2)) } }
                                if (all.isNotEmpty()) { val bb = BoundingBox.fromGeoPoints(all); map.post { map.zoomToBoundingBox(bb.increaseByScale(1.3f), false, 48) } }
                                fitted = true
                            }
                            map.overlays.clear()
                            val pts = trs[safeIdx].track
                            for (i in 0 until pts.size - 1) {
                                val a = pts[i]; val b = pts[i + 1]
                                val la = a.getOrNull(0); val lo2 = a.getOrNull(1); val lb = b.getOrNull(0); val lob = b.getOrNull(1)
                                if (la == null || lo2 == null || lb == null || lob == null) continue
                                val col = b.getOrNull(2)?.let { rampColor(((it * 3.6) - lo) / (hi - lo).coerceAtLeast(1e-6)) } ?: GRAY
                                map.overlays.add(Polyline(map).apply {
                                    setPoints(listOf(GeoPoint(la, lo2), GeoPoint(lb, lob)))
                                    outlinePaint.color = col.toArgb(); outlinePaint.strokeWidth = 4f * dens
                                })
                            }
                            map.invalidate()
                        },
                    )
                    Spacer(Modifier.height(8.dp))
                    // Legende (Speed lo..hi km/h).
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("${lo.toInt()}", style = MaterialTheme.typography.labelSmall)
                        Box(Modifier.weight(1f).height(8.dp).background(Brush.horizontalGradient(listOf(rampColor(0.0), rampColor(0.5), rampColor(1.0))), CircleShape))
                        Text("${hi.toInt()}", style = MaterialTheme.typography.labelSmall)
                        Text("km/h", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Spacer(Modifier.height(8.dp))
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        IconButton(onClick = { if (idx >= trs.size - 1) idx = 0; playing = !playing }) {
                            Icon(if (playing) Icons.Filled.Pause else Icons.Filled.PlayArrow, contentDescription = if (playing) I18n.t("sd.pause") else I18n.t("sd.play"))
                        }
                        listOf(1, 2, 4).forEach { m ->
                            FilterChip(selected = mul == m, onClick = { mul = m }, label = { Text("${m}×") }, colors = cyanChipColors())
                        }
                        Slider(value = safeIdx.toFloat(), onValueChange = { playing = false; idx = it.toInt() },
                            valueRange = 0f..(trs.size - 1).coerceAtLeast(1).toFloat(),
                            steps = (trs.size - 2).coerceAtLeast(0), modifier = Modifier.weight(1f))
                    }
                    Text("${spotDate(trs[safeIdx].startedAt)} · %.1f km · ${safeIdx + 1}/${trs.size}".format(trs[safeIdx].foilingKm),
                        style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}
