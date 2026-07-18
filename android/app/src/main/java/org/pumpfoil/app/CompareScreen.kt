package org.pumpfoil.app

import androidx.compose.foundation.background
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.coroutines.launch
import org.osmdroid.config.Configuration
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.BoundingBox
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Polyline

private enum class CompareMode { RIDER, TRACK, SPEED, PUMP, HR }

// Farbpalette je Session/Fahrer (wie PWA/iOS).
private val COMPARE_PALETTE = listOf(0x2DD4BFL, 0xF59E0BL, 0xA78BFAL, 0xF472B6L, 0x60A5FAL, 0x34D399L)
private fun compareColor(i: Int): Color = Color(0xFF000000L or COMPARE_PALETTE[i % COMPARE_PALETTE.size])
private const val CMP_GAP_M = 30.0

// Eine verglichene Session mit geparstem Track + Farben.
private class CmpTrack(
    val session: SessionDetail,
    val track: Track,
    val sessionColor: Color,
    val riderColor: Color,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CompareScreen(onBack: () -> Unit, onOpen: (Int) -> Unit = {}) {
    // Auswahl kommt per Long-Press aus den Session-Listen (CompareStore) — keine eigene Liste hier.
    val selected by CompareStore.ids.collectAsState()
    var results by remember { mutableStateOf<List<SessionDetail>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var merging by remember { mutableStateOf(false) }
    var mergeError by remember { mutableStateOf<String?>(null) }
    var mode by remember { mutableStateOf(CompareMode.TRACK) }
    var win by remember { mutableStateOf(3) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(selected) {
        loading = true
        results = selected.toList().mapNotNull { try { Api.session(it) } catch (_: Exception) { null } }
            .sortedBy { it.startedAt }
        if (results.mapNotNull { it.ownerName }.toSet().size > 1) mode = CompareMode.RIDER
        loading = false
    }

    // Fahrer in Reihenfolge des Auftretens -> Farbindex.
    val riders = results.map { it.ownerName ?: "—" }.distinct()
    fun riderColor(name: String?) = compareColor(riders.indexOf(name ?: "—").coerceAtLeast(0))

    // Geparste Tracks (nur Sessions mit Track/Segmenten).
    val cmpTracks: List<CmpTrack> = results.mapIndexedNotNull { i, s ->
        val tg = s.analysis?.trackGeojson ?: return@mapIndexedNotNull null
        val segs = s.analysis.segments.orEmpty()
        if (segs.isEmpty()) return@mapIndexedNotNull null
        val t = parseTrack(tg)
        if (t.points.size < 2) return@mapIndexedNotNull null
        CmpTrack(s, t, compareColor(i), riderColor(s.ownerName))
    }
    val hasPump = cmpTracks.any { it.track.pumpHz.any { v -> v != null } }
    val hasHr = cmpTracks.any { it.track.hr.any { v -> v != null && v > 0 } }
    val pumpVals = cmpTracks.flatMap { it.track.pumpHz.filterNotNull() }
    val hrVals = cmpTracks.flatMap { it.track.hr.filterNotNull().filter { v -> v > 0 } }
    val pumpRange = (pumpVals.minOrNull() ?: 0.0) to (pumpVals.maxOrNull() ?: 2.0)
    val hrRange = (hrVals.minOrNull() ?: 100) to (hrVals.maxOrNull() ?: 170)

    // Zusammenführen nur plausibel erlaubt: alle eigene, >=2, gleicher Tag + Spot (Server prüft final).
    val mergeable = results.size == selected.size && results.size >= 2 && results.all { it.owned } &&
        results.map { it.startedAt.take(10) }.distinct().size == 1 &&
        results.map { (it.placeName ?: "").trim().lowercase() }.distinct().size == 1

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(I18n.t("compare.title")) },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Zurück") }
                },
                actions = {
                    if (selected.isNotEmpty()) TextButton(onClick = { CompareStore.clear(); onBack() }) { Text(I18n.t("compare.clear")) }
                },
            )
        },
    ) { pad ->
        Box(Modifier.padding(pad).fillMaxSize()) {
            when {
                loading -> CircularProgressIndicator(Modifier.align(Alignment.Center))
                results.isEmpty() -> Text(I18n.t("compare.pick"), Modifier.align(Alignment.Center).padding(24.dp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                else -> Column(Modifier.fillMaxSize()) {
                    Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        // Fahrer-Chips: Farbe · Fahrer · Datum · Foil.
                        Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            results.forEachIndexed { i, s ->
                                val dot = if (mode == CompareMode.RIDER) riderColor(s.ownerName) else compareColor(i)
                                Row(Modifier.background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(16.dp))
                                    .padding(horizontal = 10.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Box(Modifier.size(10.dp).background(dot, CircleShape))
                                    Spacer(Modifier.width(6.dp))
                                    Column {
                                        Row {
                                            s.ownerName?.takeIf { it.isNotBlank() }?.let {
                                                Text(it, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
                                                Spacer(Modifier.width(4.dp))
                                            }
                                            Text(prettyDate(s.startedAt, s.tz), style = MaterialTheme.typography.labelMedium,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        }
                                        foilLabel(s)?.let {
                                            Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        }
                                    }
                                }
                            }
                        }

                        if (cmpTracks.isNotEmpty()) {
                            // Färbung.
                            val modes = buildList {
                                if (riders.size > 1) add(CompareMode.RIDER to I18n.t("compare.colorRider"))
                                add(CompareMode.TRACK to I18n.t("compare.colorTrack"))
                                add(CompareMode.SPEED to I18n.t("sd.colorSpeed"))
                                if (hasPump) add(CompareMode.PUMP to I18n.t("sd.colorPump"))
                                if (hasHr) add(CompareMode.HR to I18n.t("sd.colorPuls"))
                            }
                            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(horizontal = 12.dp)) {
                                modes.forEachIndexed { i, (m, label) ->
                                    SegmentedButton(selected = mode == m, onClick = { mode = m },
                                        shape = SegmentedButtonDefaults.itemShape(i, modes.size)) { Text(label, maxLines = 1) }
                                }
                            }
                            if (mode == CompareMode.SPEED) {
                                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(horizontal = 12.dp)) {
                                    listOf(1, 3, 5).forEachIndexed { i, w ->
                                        SegmentedButton(selected = win == w, onClick = { win = w },
                                            shape = SegmentedButtonDefaults.itemShape(i, 3)) { Text("${w}s") }
                                    }
                                }
                            }
                            CompareMap(cmpTracks, mode, win, pumpRange, hrRange,
                                Modifier.fillMaxWidth().height(240.dp).padding(horizontal = 12.dp))
                            if (mode == CompareMode.SPEED || mode == CompareMode.PUMP || mode == CompareMode.HR) {
                                GradientLegend(mode, pumpRange, hrRange)
                            }
                        }

                        CompareTable(results)
                        AllRuns(cmpTracks, mode) { s -> if (mode == CompareMode.RIDER) riderColor(s.ownerName) else compareColor(results.indexOf(s)) }
                    }
                    mergeError?.let {
                        Text(it, Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    }
                    if (mergeable) {
                        Column(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surfaceVariant).padding(12.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(I18n.t("merge.compareHint"), style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Button(
                                onClick = {
                                    val ids = selected.toList(); mergeError = null; merging = true
                                    scope.launch {
                                        try {
                                            val newId = Api.mergeSessions(ids)
                                            CompareStore.clear(); WatchSync.tick.value++; merging = false; onOpen(newId)
                                        } catch (e: Exception) { mergeError = e.message; merging = false }
                                    }
                                },
                                enabled = !merging, modifier = Modifier.fillMaxWidth(),
                            ) { Text(I18n.t("merge.action")) }
                        }
                    }
                }
            }
        }
    }
}

private fun foilLabel(s: SessionDetail): String? {
    val f = s.foil ?: return null
    return "${f.brand} ${f.model} ${f.size}".trim().ifBlank { null }
}

// Gemeinsame Karte: je Session/Fahrer/Wert gefärbte Foiling-Läufe aller verglichenen Sessions.
@Composable
private fun CompareMap(tracks: List<CmpTrack>, mode: CompareMode, win: Int,
                       pumpRange: Pair<Double, Double>, hrRange: Pair<Int, Int>, modifier: Modifier = Modifier) {
    fun colorAt(cmp: CmpTrack, i: Int): Color = when (mode) {
        CompareMode.TRACK -> cmp.sessionColor
        CompareMode.RIDER -> cmp.riderColor
        CompareMode.SPEED -> speedColor((cmp.track.speedsFor(win).getOrNull(i) ?: 0.0) * 3.6)
        CompareMode.PUMP -> cmp.track.pumpHz.getOrNull(i)?.let { rampColor((it - pumpRange.first) / (pumpRange.second - pumpRange.first).coerceAtLeast(1e-6)) } ?: GRAY
        CompareMode.HR -> cmp.track.hr.getOrNull(i)?.takeIf { it > 0 }?.let { rampColor((it - hrRange.first).toDouble() / (hrRange.second - hrRange.first).coerceAtLeast(1).toDouble()) } ?: GRAY
    }
    AndroidView(
        modifier = modifier,
        factory = { c ->
            Configuration.getInstance().userAgentValue = c.packageName
            MapView(c).apply { setTileSource(TileSourceFactory.MAPNIK); setMultiTouchControls(true); controller.setZoom(13.0) }
        },
        update = { map ->
            map.overlays.clear()
            val dens = map.context.resources.displayMetrics.density
            val all = ArrayList<GeoPoint>()
            for (cmp in tracks) {
                val pts = cmp.track.points
                for (seg in cmp.session.analysis?.segments.orEmpty()) {
                    val start = seg.iStart.coerceIn(0, pts.size - 1)
                    val end = seg.iEnd.coerceIn(0, pts.size - 1)
                    for (i in start until end) {
                        val a = pts[i]; val b = pts[i + 1]
                        val pa = GeoPoint(a.second, a.first); val pb = GeoPoint(b.second, b.first)
                        if (pa.distanceToAsDouble(pb) > CMP_GAP_M) continue
                        map.overlays.add(Polyline(map).apply {
                            setPoints(listOf(pa, pb))
                            outlinePaint.color = colorAt(cmp, i + 1).toArgb()
                            outlinePaint.strokeWidth = 4f * dens
                        })
                        all.add(pa); all.add(pb)
                    }
                }
            }
            if (all.isNotEmpty()) {
                val bb = BoundingBox.fromGeoPoints(all)
                map.post { map.zoomToBoundingBox(bb.increaseByScale(1.3f), false, 48) }
            }
            map.invalidate()
        },
    )
}

// Farbverlauf-Legende (Speed/Pump/Puls).
@Composable
private fun GradientLegend(mode: CompareMode, pumpRange: Pair<Double, Double>, hrRange: Pair<Int, Int>) {
    val lo: String; val hi: String; val unit: String
    when (mode) {
        CompareMode.PUMP -> { lo = "%.1f".format(pumpRange.first); hi = "%.1f".format(pumpRange.second); unit = "Hz" }
        CompareMode.HR -> { lo = "${hrRange.first}"; hi = "${hrRange.second}"; unit = "bpm" }
        else -> { lo = "8"; hi = "25"; unit = "km/h" }
    }
    Row(Modifier.padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(lo, style = MaterialTheme.typography.labelSmall)
        Box(Modifier.weight(1f).height(8.dp).background(
            Brush.horizontalGradient(listOf(rampColor(0.0), rampColor(0.5), rampColor(1.0))), CircleShape))
        Text(hi, style = MaterialTheme.typography.labelSmall)
        Text(unit, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

// Alle Foiling-Läufe aller verglichenen Sessions als flache Liste (wie PWA/iOS).
@Composable
private fun AllRuns(tracks: List<CmpTrack>, mode: CompareMode, dotColor: (SessionDetail) -> Color) {
    val rows = tracks.flatMap { cmp -> cmp.session.analysis?.segments.orEmpty().mapIndexed { idx, seg -> Triple(cmp.session, idx, seg) } }
    if (rows.isEmpty()) return
    Column(Modifier.fillMaxWidth()) {
        Text(I18n.t("compare.runsTitle"), style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp))
        rows.forEach { (s, idx, seg) ->
            Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(8.dp).background(dotColor(s), CircleShape))
                Spacer(Modifier.width(8.dp))
                Column(Modifier.weight(1f)) {
                    Row {
                        s.ownerName?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold); Spacer(Modifier.width(4.dp)) }
                        Text("#${idx + 1} · ${prettyDate(s.startedAt, s.tz)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    s.placeName?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text("${seg.distanceM.toInt()} m · ${cmpMmss(seg.durationS)}", style = MaterialTheme.typography.bodySmall)
                    Text("%.1f km/h · %dP".format(seg.avgSpeedMps * 3.6, seg.pumps), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            HorizontalDivider()
        }
    }
}

private fun cmpMmss(s: Double): String = "%d:%02d".format((s / 60).toInt(), (s % 60).toInt())

@Composable
private fun CompareTable(sessions: List<SessionDetail>) {
    val metrics: List<Pair<String, (SessionDetail) -> String>> = listOf(
        I18n.t("compare.distance") to { s -> s.analysis?.totalDistanceM?.let { "%.0f m".format(it) } ?: "–" },
        I18n.t("home.foiling") to { s -> s.analysis?.foilingDistanceM?.let { "%.0f m".format(it) } ?: "–" },
        I18n.t("home.topSpeed") to { s -> s.analysis?.maxSpeedMps?.let { "%.1f km/h".format(it * 3.6) } ?: "–" },
        I18n.t("home.pumps") to { s -> s.analysis?.pumpCount?.toString() ?: "–" },
        I18n.t("compare.foilTime") to { s -> s.analysis?.foilingTimeS?.let { "%d:%02d".format((it / 60).toInt(), (it % 60).toInt()) } ?: "–" },
        I18n.t("compare.cadence") to { s -> s.analysis?.avgCadenceHz?.let { "%.2f Hz".format(it) } ?: "–" },
    )
    val cell = 110.dp
    Column(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(12.dp)) {
        Row {
            Box(Modifier.width(96.dp)) {}
            sessions.forEach { s ->
                Text(prettyDate(s.startedAt, s.tz).take(10), Modifier.width(cell).padding(4.dp),
                    style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
            }
        }
        HorizontalDivider()
        metrics.forEach { (label, fn) ->
            Row(Modifier.padding(vertical = 6.dp)) {
                Text(label, Modifier.width(96.dp), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                sessions.forEach { s ->
                    Text(fn(s), Modifier.width(cell).padding(horizontal = 4.dp), style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
}
