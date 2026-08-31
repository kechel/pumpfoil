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
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.material3.Slider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.coroutines.launch
import org.osmdroid.config.Configuration
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.BoundingBox
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Marker
import org.osmdroid.views.overlay.Polyline

private enum class CompareMode { RIDER, TRACK, SPEED, PUMP, HR }

// Farbpalette je Session/Fahrer (wie PWA/iOS).
private val COMPARE_PALETTE = listOf(0x2DD4BFL, 0xF59E0BL, 0xA78BFAL, 0xF472B6L, 0x60A5FAL, 0x34D399L)
private fun compareColor(i: Int): Color = Color(0xFF000000L or COMPARE_PALETTE[i % COMPARE_PALETTE.size])
private const val CMP_GAP_M = 30.0

// Eine verglichene Session mit geparstem Track + Farben.
private class CmpTrack(
    val ref: CompareRef,
    val session: SessionDetail,
    val track: Track,
    val sessionColor: Color,
    val riderColor: Color,
    // Die anzuzeigenden Laeufe MIT ihrem Original-Index: bei einem Lauf-Eintrag genau einer,
    // bei einer ganzen Session alle. Der Index ist die Lauf-Nummer in der Session, nicht die
    // Position in dieser Liste — sonst stuende bei Lauf 5 eine 1.
    val laeufe: List<Pair<Int, Segment>>,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CompareScreen(onBack: () -> Unit, onOpen: (Int) -> Unit = {}) {
    // Auswahl kommt per Long-Press aus den Session-Listen (CompareStore) — keine eigene Liste hier.
    val selected by CompareStore.refs.collectAsState()
    // Fahrergewicht fuer die Leistungs-Kennzahl (Profil). 0 = unbekannt -> die Karte bleibt leer,
    // genauso wie in der PWA, wo powerOf() ohne Gewicht/Foil-Masse null liefert.
    var weightKg by remember { mutableStateOf(0.0) }
    // Je Korb-Eintrag der geladene Datensatz; dieselbe Session darf zweimal vorkommen (zwei
    // Laeufe). `results` bleibt als abgeleitete Liste, damit die uebrige Anzeige unveraendert geht.
    var items by remember { mutableStateOf<List<Pair<CompareRef, SessionDetail>>>(emptyList()) }
    val results = items.map { it.second }
    var loading by remember { mutableStateOf(true) }
    var merging by remember { mutableStateOf(false) }
    var mergeError by remember { mutableStateOf<String?>(null) }
    var mode by remember { mutableStateOf(CompareMode.TRACK) }
    var win by remember { mutableStateOf(3) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(selected) {
        loading = true
        // Jede Session nur EINMAL laden, auch wenn zwei ihrer Laeufe im Korb liegen.
        val geladen = selected.map { it.sessionId }.distinct().mapNotNull { id ->
            try { id to Api.session(id) } catch (_: Exception) { null }
        }.toMap()
        // Reihenfolge des Korbs beibehalten (bestimmt die Farbe), NICHT sortieren.
        items = selected.mapNotNull { r -> geladen[r.sessionId]?.let { r to it } }
        weightKg = try { Api.settings()["weight_kg"]?.jsonPrimitive?.doubleOrNull ?: 0.0 } catch (_: Exception) { 0.0 }
        if (results.mapNotNull { it.ownerName }.toSet().size > 1) mode = CompareMode.RIDER
        loading = false
    }

    // Fahrer in Reihenfolge des Auftretens -> Farbindex.
    val riders = results.map { it.ownerName ?: "—" }.distinct()
    fun riderColor(name: String?) = compareColor(riders.indexOf(name ?: "—").coerceAtLeast(0))

    // Geparste Tracks (nur Sessions mit Track/Segmenten).
    val cmpTracks: List<CmpTrack> = items.mapIndexedNotNull { i, (ref, s) ->
        val tg = s.analysis?.trackGeojson ?: return@mapIndexedNotNull null
        val alle = s.analysis.segments.orEmpty()
        if (alle.isEmpty()) return@mapIndexedNotNull null
        // Lauf-Eintrag -> genau dieser Lauf; ganze Session -> alle. Die Karte zeichnet nur
        // innerhalb iStart..iEnd je Segment, damit erscheint bei einem Lauf-Eintrag nur er.
        val laeufe = if (ref.runIdx != null) {
            alle.getOrNull(ref.runIdx)?.let { listOf(ref.runIdx to it) } ?: return@mapIndexedNotNull null
        } else alle.mapIndexed { idx, seg -> idx to seg }
        val t = parseTrack(tg)
        if (t.points.size < 2) return@mapIndexedNotNull null
        CmpTrack(ref, s, t, compareColor(i), riderColor(s.ownerName), laeufe)
    }
    val hasPump = cmpTracks.any { it.track.pumpHz.any { v -> v != null } }
    val hasHr = cmpTracks.any { it.track.hr.any { v -> v != null && v > 0 } }
    val pumpVals = cmpTracks.flatMap { it.track.pumpHz.filterNotNull() }
    val hrVals = cmpTracks.flatMap { it.track.hr.filterNotNull().filter { v -> v > 0 } }
    val pumpRange = (pumpVals.minOrNull() ?: 0.0) to (pumpVals.maxOrNull() ?: 2.0)
    val hrRange = (hrVals.minOrNull() ?: 100) to (hrVals.maxOrNull() ?: 170)

    // ---- Synchrones Abspielen (wie PWA CompareMap.tsx) -------------------------------------
    // Nur angeboten, wenn sich mindestens zwei der verglichenen Sessions zeitlich ueberschneiden
    // UND am gleichen Spot liegen. Die Zeitrechnung steckt in SyncPlayback.kt — dort steht auch,
    // warum „ein Trackpunkt = eine Sekunde" hier NICHT reicht.
    val plan = remember(cmpTracks.map { it.ref.key to it.track.points.size }) {
        if (cmpTracks.size < 2) null
        else syncPlan(cmpTracks.map { it.session to it.ref.runIdx },
                      cmpTracks.associate { it.session.id to it.track.points.size })
    }
    var spielt by remember(plan) { mutableStateOf(false) }
    var tempo by remember(plan) { mutableStateOf(8) }
    var pos by remember(plan) { mutableStateOf(0.0) }   // ms in der Wiedergabe (ohne Leerlauf)
    // Die Karte gehoert dem Abspieler, sobald er einmal gelaufen ist. Bei Position 0 und Pause
    // steht wieder die normale Vergleichsansicht mit allen vollstaendigen Strecken da.
    val spielModus = plan != null && (spielt || pos > 0.0)

    if (plan != null && spielt) {
        LaunchedEffect(spielt, tempo, plan) {
            var zuletzt = 0L
            while (spielt) {
                withFrameNanos { jetzt ->
                    if (zuletzt != 0L) {
                        val dt = (jetzt - zuletzt) / 1_000_000.0 * tempo
                        val n = pos + dt
                        if (n >= plan.dauerMs) { pos = plan.dauerMs; spielt = false } else pos = n
                    }
                    zuletzt = jetzt
                }
            }
        }
    }

    // Zusammenführen nur plausibel erlaubt: alle eigene, >=2, gleicher Tag + Spot (Server prüft final).
    // Einzelne Laeufe lassen sich nicht zusammenfuehren (wie `mergeableIds` in der PWA).
    val mergeable = selected.all { it.runIdx == null } &&
        results.size == selected.size && results.size >= 2 && results.all { it.owned } &&
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
                            items.forEachIndexed { i, (ref, s) ->
                                val dot = if (mode == CompareMode.RIDER) riderColor(s.ownerName) else compareColor(i)
                                Row(Modifier.background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(16.dp))
                                    .padding(horizontal = 10.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Box(Modifier.size(10.dp).background(dot, CircleShape))
                                    Spacer(Modifier.width(6.dp))
                                    Column {
                                        Row {
                                            // Bei einem Lauf-Eintrag steht die Lauf-Nummer vorn (PWA: itemLabel).
                                            ref.runIdx?.let { ri ->
                                                Text(I18n.t("compare.run").replace("{n}", (ri + 1).toString()),
                                                    style = MaterialTheme.typography.labelMedium,
                                                    fontWeight = FontWeight.SemiBold,
                                                    color = MaterialTheme.colorScheme.primary)
                                                Spacer(Modifier.width(4.dp))
                                            }
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
                                Modifier.fillMaxWidth().height(240.dp).padding(horizontal = 12.dp),
                                plan = plan, posMs = pos, spielModus = spielModus)
                            if (plan != null) {
                                SyncBedienzeile(
                                    plan = plan, spielt = spielt, tempo = tempo, pos = pos,
                                    tz = cmpTracks.firstOrNull()?.session?.tz,
                                    onPlay = { if (pos >= plan.dauerMs) pos = 0.0; spielt = !spielt },
                                    onTempo = { tempo = it },
                                    onPos = { spielt = false; pos = it },
                                )
                            }
                            if (mode == CompareMode.SPEED || mode == CompareMode.PUMP || mode == CompareMode.HR) {
                                GradientLegend(mode, pumpRange, hrRange)
                            }
                        }

                        CompareTable(items, win, weightKg) { i ->
                            if (mode == CompareMode.RIDER) riderColor(items.getOrNull(i)?.second?.ownerName) else compareColor(i)
                        }
                        AllRuns(cmpTracks, mode)
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
                                    val ids = selected.map { it.sessionId }.distinct(); mergeError = null; merging = true
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
                       pumpRange: Pair<Double, Double>, hrRange: Pair<Int, Int>, modifier: Modifier = Modifier,
                       plan: SyncPlan? = null, posMs: Double = 0.0, spielModus: Boolean = false) {
    fun colorAt(cmp: CmpTrack, i: Int): Color = when (mode) {
        CompareMode.TRACK -> cmp.sessionColor
        CompareMode.RIDER -> cmp.riderColor
        CompareMode.SPEED -> speedColor((cmp.track.speedsFor(win).getOrNull(i) ?: 0.0) * 3.6)
        CompareMode.PUMP -> cmp.track.pumpHz.getOrNull(i)?.let { rampColor((it - pumpRange.first) / (pumpRange.second - pumpRange.first).coerceAtLeast(1e-6)) } ?: GRAY
        CompareMode.HR -> cmp.track.hr.getOrNull(i)?.takeIf { it > 0 }?.let { rampColor((it - hrRange.first).toDouble() / (hrRange.second - hrRange.first).coerceAtLeast(1).toDouble()) } ?: GRAY
    }
    MapTiles.MitUmschalter(modifier) { ebene ->
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { c ->
                Configuration.getInstance().userAgentValue = c.packageName
                MapView(c).apply { MapTiles.anwenden(this, ebene); setMultiTouchControls(true); controller.setZoom(13.0) }
            },
            update = { map ->
                MapTiles.anwenden(map, ebene)
                map.overlays.clear()
                val dens = map.context.resources.displayMetrics.density
                val all = ArrayList<GeoPoint>()

                // Waehrend der Wiedergabe zeichnet NUR der Abspieler: je Fahrer der Lauf, in dem
                // er GERADE ist, und der nur bis zu seiner aktuellen Position. Laege die
                // vollstaendige Strecke darunter, waere der wachsende Lauf darin nicht zu erkennen
                // — bei mehreren Fahrern am selben Spot ist das ein Knaeuel (Jans Befund 31.08.).
                if (spielModus && plan != null) {
                    val tAbs = plan.zuUhrzeit(posMs)
                    for (cmp in tracks) {
                        val pts = cmp.track.points
                        val nur = plan.laeufe[cmp.session.id]
                        val segs = cmp.session.analysis?.segments.orEmpty()
                            .withIndex()
                            .filter { (i, g) ->
                                (nur == null || i in nur) &&
                                    g.tStartSessionMs != null && g.tEndSessionMs != null
                            }
                        if (segs.isEmpty()) continue
                        val start = try {
                            java.time.OffsetDateTime.parse(cmp.session.startedAt).toInstant().toEpochMilli().toDouble()
                        } catch (_: Exception) { continue }

                        val lauf = segs.firstOrNull { (_, g) ->
                            tAbs >= start + g.tStartSessionMs!! && tAbs <= start + g.tEndSessionMs!!
                        }?.value
                        if (lauf == null) {
                            // Pause: am Ende des letzten schon gefahrenen Laufs PARKEN, nicht
                            // weitergleiten. Stuetzpunkte gibt es nur an den Laufgrenzen; dazwischen
                            // wuerde ein interpolierter Punkt gemaechlich ueber den See ziehen,
                            // waehrend der Fahrer am Steg steht. Vor dem ersten Lauf: gar nicht da.
                            val vorher = segs.lastOrNull { (_, g) -> start + g.tEndSessionMs!! <= tAbs }?.value
                                ?: continue
                            val p = pts.getOrNull(vorher.iEnd.coerceIn(0, pts.size - 1)) ?: continue
                            map.overlays.add(punktMarker(map, GeoPoint(p.second, p.first),
                                cmp.riderColor, dens, hohl = true))
                            continue
                        }
                        // Im Lauf: Index aus der Zeit INNERHALB dieses Laufs — damit ist die
                        // Uhrzeit bei jedem Laufbeginn neu gesetzt (innerhalb eines Laufs laeuft
                        // die Aufzeichnung sauber mit 1 Hz, nachgemessen: 0 ms Abweichung).
                        val spanne = lauf.tEndSessionMs!! - lauf.tStartSessionMs!!
                        val f = if (spanne > 0) (tAbs - (start + lauf.tStartSessionMs!!)) / spanne else 0.0
                        val idx = lauf.iStart + f * (lauf.iEnd - lauf.iStart)
                        val bis = minOf(idx.toInt(), lauf.iEnd)
                        for (i in lauf.iStart until bis) {
                            val a = pts.getOrNull(i) ?: continue
                            val b = pts.getOrNull(i + 1) ?: continue
                            val pa = GeoPoint(a.second, a.first)
                            val pb = GeoPoint(b.second, b.first)
                            if (pa.distanceToAsDouble(pb) > CMP_GAP_M) continue
                            map.overlays.add(Polyline(map).apply {
                                setPoints(listOf(pa, pb))
                                outlinePaint.color = colorAt(cmp, i + 1).toArgb()
                                outlinePaint.strokeWidth = 4f * dens
                            })
                            all.add(pa); all.add(pb)
                        }
                        val a = pts.getOrNull(idx.toInt().coerceIn(0, pts.size - 1))
                        val b = pts.getOrNull((idx.toInt() + 1).coerceIn(0, pts.size - 1))
                        if (a != null) {
                            val g = idx - idx.toInt()
                            val lat = a.second + ((b?.second ?: a.second) - a.second) * g
                            val lon = a.first + ((b?.first ?: a.first) - a.first) * g
                            val gp = GeoPoint(lat, lon)
                            map.overlays.add(punktMarker(map, gp, cmp.riderColor, dens, hohl = false))
                            all.add(gp)
                        }
                    }
                    if (all.isNotEmpty()) {
                        val bb = BoundingBox.fromGeoPoints(all)
                        map.post { map.zoomToBoundingBox(bb.increaseByScale(1.3f), false, 48) }
                    }
                    map.invalidate()
                    return@AndroidView
                }

                for (cmp in tracks) {
                    val pts = cmp.track.points
                    for ((_, seg) in cmp.laeufe) {
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
}

// Farbverlauf-Legende (Speed/Pump/Puls).
@Composable
private fun GradientLegend(mode: CompareMode, pumpRange: Pair<Double, Double>, hrRange: Pair<Int, Int>) {
    val lo: String; val hi: String; val unit: String
    when (mode) {
        CompareMode.PUMP -> { lo = PumpUnit.fmtLegend(pumpRange.first, false); hi = PumpUnit.fmtLegend(pumpRange.second, false); unit = PumpUnit.unitLabel() }
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
private fun AllRuns(tracks: List<CmpTrack>, mode: CompareMode) {
    // Farbe kommt vom EINTRAG, nicht von der Session: liegt dieselbe Session zweimal im Korb
    // (zwei ihrer Laeufe), muessen die Zeilen verschiedene Farben haben — wie in der PWA, wo die
    // Farbe am Eintrag haengt. Vorher suchte dotColor() die Session in der Liste und traf immer
    // die erste.
    val rows = tracks.flatMap { cmp ->
        cmp.laeufe.map { (idx, seg) ->
            val farbe = if (mode == CompareMode.RIDER) cmp.riderColor else cmp.sessionColor
            Triple(cmp.session, idx to seg, farbe)
        }
    }
    if (rows.isEmpty()) return
    Column(Modifier.fillMaxWidth()) {
        Text(I18n.t("compare.runsTitle"), style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp))
        rows.forEach { (s, lauf, farbe) ->
            val (idx, seg) = lauf
            Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(8.dp).background(farbe, CircleShape))
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
private fun CompareTable(
    items: List<Pair<CompareRef, SessionDetail>>,
    win: Int,
    weightKg: Double,
    farbe: (Int) -> Color,
) {
    // KARTENRASTER mit allen 15 Kennzahlen — dieselbe Liste, Reihenfolge und Formatierung wie
    // `metrics` in web/src/pages/Compare.tsx. Vorher standen hier sechs Werte in einer Matrix.
    // Je Karte eine Kennzahl, darin eine Zeile je Korb-Eintrag; der Bestwert wird hervorgehoben,
    // aber nur wenn die Kennzahl eine Richtung hat UND mindestens zwei Werte vergleichbar sind
    // (sonst waere in einem Einzelvergleich alles "best").
    val ms = cmpMetrics(win, weightKg)
    Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        // Kein LazyVerticalGrid: das Ganze steckt in einem senkrecht scrollenden Column, zwei
        // Lazy-Container derselben Achse verschachtelt wirft zur Laufzeit.
        ms.chunked(2).forEach { paar ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                paar.forEach { m ->
                    val werte = items.map { (r, s) -> m.wert(r, s) }
                    val zahlen = werte.filterNotNull()
                    val best = if (m.dir != null && zahlen.size >= 2) {
                        if (m.dir == "max") zahlen.max() else zahlen.min()
                    } else null
                    Column(
                        Modifier.weight(1f)
                            .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(10.dp))
                            .padding(8.dp),
                        verticalArrangement = Arrangement.spacedBy(3.dp),
                    ) {
                        Text(m.label.uppercase(), style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2)
                        werte.forEachIndexed { i, v ->
                            val istBest = best != null && v != null && v == best
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(Modifier.size(8.dp).background(farbe(i), CircleShape))
                                Spacer(Modifier.width(6.dp))
                                Text(if (v == null) "–" else m.fmt(v),
                                    style = if (istBest) MaterialTheme.typography.titleSmall else MaterialTheme.typography.bodyMedium,
                                    fontWeight = if (istBest) FontWeight.Bold else FontWeight.SemiBold,
                                    color = if (istBest) MaterialTheme.colorScheme.primary else Color.Unspecified)
                                m.unit?.takeIf { v != null }?.let {
                                    Spacer(Modifier.width(3.dp))
                                    Text(it, style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    }
                }
                // Ungerade Anzahl: die letzte Zeile haette sonst eine doppelt breite Karte.
                if (paar.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

/** Eine Vergleichs-Kennzahl. `dir` = Richtung des Bestwerts ("max"/"min"), null = nicht markieren. */
private class CmpMetric(
    val label: String,
    val unit: String?,
    val dir: String?,
    val fmt: (Double) -> String,
    val wert: (CompareRef, SessionDetail) -> Double?,
)

/** Bestwert je Segment-Kennzahl ueber alle Laeufe einer Session (PWA: `bestSeg`). */
private fun bestSeg(segs: List<Segment>, getter: (Segment) -> Double?, besser: (Double, Double) -> Boolean): Double? {
    var b: Double? = null
    for (s in segs) {
        val v = getter(s)
        if (v != null && (b == null || besser(v, b))) b = v
    }
    return b
}

/**
 * Die 15 Kennzahlen des Vergleichs, 1:1 aus `statsFor` in web/src/pages/Compare.tsx — inklusive
 * des Zweigs fuer einen LAUF-Eintrag: dort kommen die Werte aus dem Segment, Laufzahl und Puls
 * bleiben leer (ein einzelner Lauf hat keine Lauf-Anzahl, und Puls liegt nur session-weit vor).
 */
private fun cmpMetrics(win: Int, weightKg: Double): List<CmpMetric> {
    fun mmss(v: Double) = "%d:%02d".format((v / 60).toInt(), (v % 60).toInt())
    fun ein(v: Double) = "%.1f".format(v)
    fun ganz(v: Double) = "%.0f".format(v)
    // Gewicht JE SESSION: der Vergleich ist fuer mehrere Fahrer gebaut (bei zwei Namen schaltet
    // er selbst in den Fahrer-Modus, s. oben) — mit dem Gewicht des Betrachters gerechnet stand
    // ein 70-kg-Fahrer neben einem 95-kg-Fahrer falsch da. `weightKg` gilt nur noch als Rueckfall
    // fuer die EIGENEN Sessions im Korb.
    fun watt(s: SessionDetail, mps: Double?, hz: Double?): Double? {
        val f = FoilPhysics.wattRechner(s.foil, FoilPhysics.gewichtFuer(s, weightKg)) ?: return null
        return mps?.let { f(it, hz) }?.toDouble()
    }
    fun segs(s: SessionDetail) = s.analysis?.segments.orEmpty()
    return listOf(
        CmpMetric(I18n.t("stat.foiling"), "km", "max", { "%.2f".format(it) }) { r, s ->
            lauf(r, s)?.let { it.distanceM / 1000.0 } ?: s.analysis?.foilingDistanceM?.div(1000.0)
        },
        CmpMetric(I18n.t("stat.foilingTime"), "min:s", "max", ::mmss) { r, s ->
            lauf(r, s)?.durationS ?: s.analysis?.foilingTimeS
        },
        CmpMetric(I18n.t("stat.runs"), null, "max", ::ganz) { r, s ->
            if (r.runIdx != null) null else segs(s).size.takeIf { it > 0 }?.toDouble()
        },
        CmpMetric(I18n.t("sd.avgSpeed"), "km/h", "max", ::ein) { r, s ->
            (lauf(r, s)?.avgSpeedMps ?: s.analysis?.metrics?.avgSpeedMps)?.times(3.6)
        },
        CmpMetric(I18n.t("power.title"), "W", null, ::ganz) { r, s ->
            val l = lauf(r, s)
            if (l != null) watt(s, l.avgSpeedMps, l.avgPumpHz)
            else watt(s, s.analysis?.metrics?.avgSpeedMps, s.analysis?.metrics?.avgPumpHz)
        },
        CmpMetric(I18n.t("sd.maxSpeed").replace("{win}", win.toString()), "km/h", "max", ::ein) { r, s ->
            lauf(r, s)?.fenster(win, "max")?.times(3.6)
                ?: bestSeg(segs(s), { it.fenster(win, "max") }, { x, y -> x > y })?.times(3.6)
        },
        CmpMetric(I18n.t("sd.minSpeed").replace("{win}", win.toString()), "km/h", null, ::ein) { r, s ->
            lauf(r, s)?.fenster(win, "min")?.times(3.6)
                ?: bestSeg(segs(s), { it.fenster(win, "min") }, { x, y -> x < y })?.times(3.6)
        },
        CmpMetric(I18n.t("sd.maxGlide"), "s", "max", ::ein) { r, s ->
            lauf(r, s)?.longestGlideS ?: bestSeg(segs(s), { it.longestGlideS }, { x, y -> x > y })
        },
        CmpMetric(I18n.t("stat.pumps"), null, null, ::ganz) { r, s ->
            lauf(r, s)?.pumps?.toDouble() ?: s.analysis?.pumpCount?.toDouble()
        },
        CmpMetric(I18n.t("sd.avgPump"), PumpUnit.unitLabel(), null, { PumpUnit.fmtValue(it) }) { r, s ->
            lauf(r, s)?.avgPumpHz ?: s.analysis?.metrics?.avgPumpHz
        },
        CmpMetric(I18n.t("sd.avgDistPerPump"), "m/Pump", "max", ::ein) { r, s ->
            val l = lauf(r, s)
            if (l != null) if (l.pumps > 0) l.distanceM / l.pumps else null
            else {
                val n = s.analysis?.pumpCount ?: 0
                val d = s.analysis?.foilingDistanceM
                if (n > 0 && d != null) d / n else null
            }
        },
        CmpMetric(I18n.t("sd.avgHr"), "bpm", null, ::ganz) { r, s ->
            if (r.runIdx != null) null else s.analysis?.metrics?.avgHr?.toDouble()
        },
        CmpMetric(I18n.t("sd.maxHr"), "bpm", null, ::ganz) { r, s ->
            if (r.runIdx != null) null else s.analysis?.metrics?.maxHr?.toDouble()
        },
        CmpMetric(I18n.t("rec.longestRun"), "min:s", "max", ::mmss) { r, s ->
            lauf(r, s)?.durationS ?: bestSeg(segs(s), { it.durationS }, { x, y -> x > y })
        },
        CmpMetric(I18n.t("rec.farthestRun"), "m", "max", ::ganz) { r, s ->
            lauf(r, s)?.distanceM ?: bestSeg(segs(s), { it.distanceM }, { x, y -> x > y })
        },
    )
}

/** Das referenzierte Segment, oder null bei einem Eintrag fuer die ganze Session. */
private fun lauf(r: CompareRef, s: SessionDetail): Segment? =
    r.runIdx?.let { s.analysis?.segments?.getOrNull(it) }

// Ein Fahrer-Punkt auf der Karte. osmdroid kennt keinen „Kreis-Marker", also malen wir einen:
// gefuellt = faehrt gerade, hohl+blass = geparkt in der Pause. KEINE Namensschilder — die Farbe
// reicht, die Kacheln ueber der Karte sind bereits die Legende (Jan, 31.08.).
private fun punktMarker(map: MapView, p: GeoPoint, farbe: Color, dens: Float, hohl: Boolean): Marker {
    val r = (if (hohl) 5f else 7f) * dens
    val rand = 2f * dens
    val size = ((r + rand) * 2f).toInt().coerceAtLeast(4)
    val bmp = android.graphics.Bitmap.createBitmap(size, size, android.graphics.Bitmap.Config.ARGB_8888)
    val c = android.graphics.Canvas(bmp)
    val mitte = size / 2f
    val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG)
    if (hohl) {
        paint.style = android.graphics.Paint.Style.FILL
        paint.color = android.graphics.Color.argb(140, 15, 23, 42)   // dunkler Kern, halbtransparent
        c.drawCircle(mitte, mitte, r, paint)
        paint.style = android.graphics.Paint.Style.STROKE
        paint.strokeWidth = rand
        paint.color = farbe.copy(alpha = 0.55f).toArgb()
        c.drawCircle(mitte, mitte, r, paint)
    } else {
        paint.style = android.graphics.Paint.Style.FILL
        paint.color = farbe.toArgb()
        c.drawCircle(mitte, mitte, r, paint)
        paint.style = android.graphics.Paint.Style.STROKE
        paint.strokeWidth = rand
        paint.color = android.graphics.Color.WHITE
        c.drawCircle(mitte, mitte, r, paint)
    }
    return Marker(map).apply {
        position = p
        setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
        icon = android.graphics.drawable.BitmapDrawable(map.context.resources, bmp)
        setInfoWindow(null)          // kein Popup beim Antippen
    }
}

// Bedienzeile des synchronen Abspielens — wie die PWA: Start/Pause, Tempo, Uhrzeit in Spot-Ortszeit,
// Regler und die uebersprungene Leerlaufzeit (sonst wundert man sich ueber eine „Wiedergabe" von
// vier Minuten fuer zwei Stunden am Wasser).
@Composable
private fun SyncBedienzeile(
    plan: SyncPlan, spielt: Boolean, tempo: Int, pos: Double, tz: String?,
    onPlay: () -> Unit, onTempo: (Int) -> Unit, onPos: (Double) -> Unit,
) {
    val uhr = remember(pos, plan) {
        val ms = plan.zuUhrzeit(pos).toLong()
        val zone = try { java.time.ZoneId.of(tz ?: "UTC") } catch (_: Exception) { java.time.ZoneId.systemDefault() }
        java.time.Instant.ofEpochMilli(ms).atZone(zone)
            .format(java.time.format.DateTimeFormatter.ofPattern("HH:mm:ss"))
    }
    Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp)) {
        Text(I18n.t("compare.syncTitle"), style = MaterialTheme.typography.titleSmall)
        Text(I18n.t("compare.syncWho").replace("{n}", plan.sessions.size.toString()),
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(I18n.t("compare.syncHint"),
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(6.dp))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = onPlay, contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp)) {
                Text(I18n.t(if (spielt) "sd.pause" else "sd.play"))
            }
            listOf(2, 8, 30).forEach { m ->
                val an = tempo == m
                TextButton(onClick = { onTempo(m) }, contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp)) {
                    Text("${m}×", color = if (an) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Text(uhr, style = MaterialTheme.typography.bodyMedium)
        }
        Text(I18n.t("compare.syncSkipped").replace("{min}", Math.round(plan.uebersprungenMin).toString()),
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Slider(
            value = (pos / plan.dauerMs).toFloat().coerceIn(0f, 1f),
            onValueChange = { onPos(it.toDouble() * plan.dauerMs) },
            modifier = Modifier.fillMaxWidth(),
        )
    }
}
