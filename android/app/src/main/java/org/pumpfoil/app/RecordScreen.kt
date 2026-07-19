package org.pumpfoil.app

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Looper
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import org.osmdroid.config.Configuration
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Polyline
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.intOrNull

// „Record on Phone": das Handy selbst als Recorder. Aufnahme läuft im Foreground-Service
// (RecorderService) weiter, auch mit Screen aus / in der Tasche. Gleiche Live-Werte wie die
// Uhr-Apps, aber ohne Einstellungs-Optionen (die stehen in der App an anderer Stelle) — dafür
// die Session-Foil direkt wählbar. Halten zum Stoppen (gegen versehentliches Beenden).
private fun hasLocationPerm(ctx: Context): Boolean =
    ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
    ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RecordScreen(onBack: () -> Unit) {
    val ctx = LocalContext.current
    val st by Recorder.state.collectAsState()
    val scope = rememberCoroutineScope()
    var foils by remember { mutableStateOf<List<Foil>>(emptyList()) }       // ganzer Katalog
    var favFoils by remember { mutableStateOf<List<Foil>>(emptyList()) }    // Favoriten (my_foils) als Chips
    var foilId by remember { mutableStateOf<Int?>(Recorder.sessionFoilId) }
    var foilMenu by remember { mutableStateOf(false) }
    var defaultLoaded by remember { mutableStateOf(false) }
    var holdProgress by remember { mutableStateOf(0f) }
    val prefs = remember { ctx.getSharedPreferences("pumpfoil", Context.MODE_PRIVATE) }
    var autoStart by remember { mutableStateOf(prefs.getBoolean("phone_autostart", true)) }
    var permGranted by remember { mutableStateOf(hasLocationPerm(ctx)) }
    var pendingStart by remember { mutableStateOf(false) }
    var gpsReady by remember { mutableStateOf(false) }

    fun startRecording() { Recorder.sessionFoilId = foilId; RecorderService.start(ctx) }

    // Während der Aufnahme Zurück/Swipe-back schlucken — nicht versehentlich raus (nur „Halten zum Stoppen").
    BackHandler(enabled = st.recording) { /* bewusst ignoriert */ }

    LaunchedEffect(Unit) {
        Recorder.refreshPending(ctx)
        Recorder.drain(ctx)   // offen gebliebene Uploads gleich versuchen (falls jetzt Inet da)
        foils = try { Api.foils() } catch (_: Exception) { emptyList() }
        try {
            val s = Api.settings()
            val favIds = s["my_foils"]?.jsonArray?.mapNotNull { it.jsonPrimitive.intOrNull } ?: emptyList()
            favFoils = foils.filter { it.id in favIds }
            if (!defaultLoaded) {   // Default-Foil vorwählen (nur beim ersten Laden)
                val defId = s["foil_id"]?.jsonPrimitive?.intOrNull
                foilId = Recorder.sessionFoilId ?: defId
                defaultLoaded = true
            }
        } catch (_: Exception) {}
    }

    // Permissions (Standort fürs GPS, Benachrichtigung für den Foreground-Service ab Android 13).
    val perms = buildList {
        // FINE + COARSE zusammen anfragen — ab Android 12 wird eine FINE-only-Anfrage sonst abgelehnt.
        add(Manifest.permission.ACCESS_FINE_LOCATION)
        add(Manifest.permission.ACCESS_COARSE_LOCATION)
        if (Build.VERSION.SDK_INT >= 33) add(Manifest.permission.POST_NOTIFICATIONS)
    }.toTypedArray()
    val permLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { result ->
        // Genügt, wenn irgendeine Standort-Genauigkeit gewährt wurde (FINE ODER COARSE).
        permGranted = result[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            result[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        if (permGranted && pendingStart) { pendingStart = false; startRecording() }
    }
    // Beim Öffnen die Permission holen, damit GPS-Status + Autostart schon auf dem Start-Screen laufen.
    LaunchedEffect(permGranted) { if (!permGranted) permLauncher.launch(perms) }

    // Idle-GPS wie auf der Uhr: solange nicht aufgenommen wird, Position beziehen -> „GPS bereit" +
    // Autostart. Schwellen exakt wie Garmin/Wear: 10 s Vorlauf, dann ab 2,8 m/s für 4 s losfahren.
    val arm = remember { intArrayOf(0, 0) }   // [Vorlauf-Ticks, Speed-Streak]
    DisposableEffect(permGranted, st.recording) {
        arm[0] = 0; arm[1] = 0
        if (!permGranted || st.recording) { onDispose { } }
        else {
            val lm = ctx.getSystemService(Context.LOCATION_SERVICE) as LocationManager
            val listener = LocationListener { loc ->
                val acc = if (loc.hasAccuracy()) loc.accuracy else 999f
                gpsReady = acc <= 25f
                val spd = if (loc.hasSpeed()) loc.speed else 0f
                if (autoStart && gpsReady) {
                    if (arm[0] < 10) { arm[0]++; arm[1] = 0 }          // Vorlauf abwarten
                    else if (spd >= 2.8f) { arm[1]++; if (arm[1] >= 4) startRecording() }
                    else arm[1] = 0
                } else arm[1] = 0
            }
            val fine = ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED
            val prov = if (fine) LocationManager.GPS_PROVIDER else LocationManager.NETWORK_PROVIDER
            try { lm.requestLocationUpdates(prov, 1000L, 0f, listener, Looper.getMainLooper()) }
            catch (_: SecurityException) {} catch (_: IllegalArgumentException) {}
            onDispose { try { lm.removeUpdates(listener) } catch (_: Exception) {}; gpsReady = false }
        }
    }

    val foilLabel = { id: Int? ->
        if (id == null) I18n.t("rec.foilNone")
        else foils.firstOrNull { it.id == id }?.let { "${it.brand} ${it.model} ${it.size}".trim() }
            ?: I18n.t("rec.foilNone")
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(I18n.t("rec.title")) },
                navigationIcon = {
                    IconButton(onClick = { if (!st.recording) onBack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Zurück")
                    }
                },
            )
        },
    ) { pad ->
        Column(
            Modifier.padding(pad).fillMaxSize().padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            when {
                st.recording -> RecordingBody(st)
                st.status == "gespeichert" || st.status == "speichere…" -> SavedBody(st, onBack)
                else -> {
                    // Idle: Titel + Hinweis, Live-GPS-Status (wie Uhr), Autostart, Foil-Auswahl, START.
                    Spacer(Modifier.height(8.dp))
                    Text(I18n.t("rec.pageTitle"),
                        style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(4.dp))
                    Text(I18n.t("rec.waterproof"),
                        style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.error)
                    Spacer(Modifier.height(16.dp))
                    Text(if (gpsReady) I18n.t("rec.gpsReady") else I18n.t("rec.gpsSearch"),
                        style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold,
                        color = if (gpsReady) MaterialTheme.colorScheme.primary
                                else MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(6.dp))
                    Text(I18n.t("rec.gpsHint"),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(16.dp))
                    // Autostart-Schalter (wie Uhr): losfahren startet die Aufnahme automatisch.
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(I18n.t("rec.autostart"), style = MaterialTheme.typography.titleSmall)
                            if (autoStart) Text(I18n.t("rec.autostartHint"),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Switch(checked = autoStart, onCheckedChange = {
                            autoStart = it; arm[0] = 0; arm[1] = 0
                            prefs.edit().putBoolean("phone_autostart", it).apply()
                        })
                    }
                    Spacer(Modifier.height(20.dp))
                    Text(I18n.t("rec.foilLabel").uppercase(),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(6.dp))
                    // Favoriten (my_foils) direkt als Chips; Standard-Foil vorausgewählt.
                    val chips: List<Pair<Int?, String>> = listOf(null to I18n.t("rec.foilNone")) +
                        favFoils.map { (it.id as Int?) to "${it.brand} ${it.model} ${it.size}".trim() }
                    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        chips.chunked(2).forEach { rowItems ->
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                rowItems.forEach { (id, label) ->
                                    FoilChip(label, foilId == id, Modifier.weight(1f)) { foilId = id }
                                }
                                if (rowItems.size == 1) Spacer(Modifier.weight(1f))
                            }
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    // Zusätzlich: ganzer Katalog, falls ein Foil außerhalb der Favoriten gebraucht wird.
                    Box(Modifier.fillMaxWidth()) {
                        OutlinedButton(onClick = { foilMenu = true }, modifier = Modifier.fillMaxWidth()) {
                            val other = foilId != null && favFoils.none { it.id == foilId }
                            Text(if (other) foilLabel(foilId) else I18n.t("rec.foilOther"),
                                Modifier.weight(1f), maxLines = 1)
                            Icon(Icons.Filled.ArrowDropDown, contentDescription = null)
                        }
                        DropdownMenu(expanded = foilMenu, onDismissRequest = { foilMenu = false }) {
                            DropdownMenuItem(text = { Text(I18n.t("rec.foilNone")) },
                                onClick = { foilId = null; foilMenu = false })
                            foils.forEach { f ->
                                DropdownMenuItem(
                                    text = { Text("${f.brand} ${f.model} ${f.size}".trim()) },
                                    onClick = { foilId = f.id; foilMenu = false })
                            }
                        }
                    }
                    Spacer(Modifier.height(28.dp))
                    Button(
                        onClick = {
                            if (permGranted) startRecording()
                            else { pendingStart = true; permLauncher.launch(perms) }
                        },
                        modifier = Modifier.fillMaxWidth().height(56.dp),
                    ) { Text(I18n.t("rec.start"), fontWeight = FontWeight.Bold) }
                    if (st.pendingCount > 0) {
                        Spacer(Modifier.height(16.dp))
                        val statusText = when {
                            st.uploading -> I18n.t("rec.upRunning")
                            st.uploadError == "offline" -> I18n.t("rec.upOffline")
                            st.uploadError == "server" || st.uploadError == "auth" -> I18n.t("rec.upFailed")
                            else -> I18n.t("rec.pending").replace("{n}", st.pendingCount.toString())
                        }
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(statusText,
                                style = MaterialTheme.typography.bodySmall,
                                color = if (st.uploadError.isNotEmpty() && !st.uploading)
                                            MaterialTheme.colorScheme.error
                                        else MaterialTheme.colorScheme.onSurfaceVariant)
                            if (!st.uploading) {
                                Spacer(Modifier.width(8.dp))
                                Text(I18n.t("rec.uploadNow"),
                                    style = MaterialTheme.typography.bodySmall,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.clickable { Recorder.drain(ctx) })
                            }
                        }
                    }
                    Spacer(Modifier.weight(1f))
                    // Halten-zum-Stoppen ist nur während der Aufnahme; hier Platzhalter-Ende.
                }
            }

            if (st.recording) {
                // Live-Track-Karte füllt den Platz zwischen Statistik und dem fixen STOPP-Button.
                Spacer(Modifier.height(12.dp))
                TrackCanvas(st.track, st.isFoiling, Modifier.fillMaxWidth().weight(1f))
                Spacer(Modifier.height(12.dp))
                Text(I18n.t("rec.holdStop"),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(6.dp))
                Box(
                    Modifier.fillMaxWidth().height(56.dp)
                        .clip(RoundedCornerShape(28.dp))
                        .background(MaterialTheme.colorScheme.error)
                        .pointerInput(Unit) {
                            detectTapGestures(onPress = {
                                var fired = false
                                val job = scope.launch {
                                    val steps = 30
                                    for (i in 1..steps) { kotlinx.coroutines.delay(100); holdProgress = i / steps.toFloat() }
                                    fired = true
                                    RecorderService.stop(ctx)
                                }
                                tryAwaitRelease()
                                if (!fired) { job.cancel(); holdProgress = 0f }
                            })
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    Text(I18n.t("rec.stop"), color = Color.White, fontWeight = FontWeight.Bold)
                }
                // Halte-Fortschritt als schmaler Balken (versionsunabhängig, kein ProgressIndicator).
                Box(Modifier.fillMaxWidth().height(3.dp).padding(top = 0.dp)) {
                    Box(Modifier.fillMaxWidth(holdProgress).height(3.dp)
                        .background(MaterialTheme.colorScheme.primary))
                }
            }
        }
    }
}

@Composable
private fun RecordingBody(st: Recorder.State) {
    Spacer(Modifier.height(4.dp))
    Text(if (st.isFoiling) I18n.t("rec.onfoil") else I18n.t("rec.recording"),
        style = MaterialTheme.typography.titleMedium,
        color = if (st.isFoiling) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
    Spacer(Modifier.height(16.dp))
    val mmss = { s: Long -> "%d:%02d".format(s / 60, s % 60) }
    val km = { m: Double -> if (m >= 1000) "%.2f km".format(m / 1000) else "%d m".format(m.toInt()) }
    StatRow(I18n.t("rec.time"), mmss(st.elapsedSec), I18n.t("rec.dist"), km(st.distanceM))
    StatRow(I18n.t("rec.speed"), "%.1f".format(st.speedKmh), I18n.t("rec.speedMax"), "%.1f".format(st.maxSpeedKmh))
    StatRow(I18n.t("rec.runs"), st.runCount.toString(), I18n.t("rec.runDur"), mmss(st.runDurationMs / 1000))
    Spacer(Modifier.height(10.dp))
    if (st.uploading || st.pendingCount > 0 || st.uploadError.isNotEmpty()) {
        val txt = when {
            st.uploadError == "offline" -> I18n.t("rec.upOffline")
            st.uploading -> I18n.t("rec.upRunning")
            else -> ""
        }
        if (txt.isNotEmpty()) Text(txt, style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun SavedBody(st: Recorder.State, onBack: () -> Unit) {
    Spacer(Modifier.height(30.dp))
    Text(if (st.status == "speichere…") I18n.t("rec.saving") else I18n.t("rec.saved"),
        style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
    Spacer(Modifier.height(12.dp))
    val info = when {
        st.uploading -> I18n.t("rec.upRunning")
        st.uploadError == "offline" -> I18n.t("rec.upLater")
        st.pendingCount == 0 && st.status == "gespeichert" -> I18n.t("rec.upDone")
        else -> ""
    }
    if (info.isNotEmpty()) Text(info, style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant)
    Spacer(Modifier.height(28.dp))
    Button(onClick = onBack, modifier = Modifier.fillMaxWidth().height(52.dp)) {
        Text(I18n.t("common.done"))
    }
}

@Composable
private fun StatRow(l1: String, v1: String, l2: String, v2: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        StatCell(l1, v1, Modifier.weight(1f)); StatCell(l2, v2, Modifier.weight(1f))
    }
}

@Composable
private fun StatCell(label: String, value: String, modifier: Modifier = Modifier) {
    Card(modifier, colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
        Column(Modifier.padding(12.dp)) {
            Text(value, fontSize = 26.sp, fontWeight = FontWeight.Bold)
            Text(label, style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

// Live-Track auf der echten OSM-Karte (osmdroid, FLOSS — wie Spots/Session-Detail). Polyline des
// bisherigen Laufs, Karte folgt der aktuellen Position. Tiles cachen; offline bleibt die Linie sichtbar.
@Composable
private fun TrackCanvas(track: List<DoubleArray>, onFoil: Boolean, modifier: Modifier = Modifier) {
    val lineColor = (if (onFoil) MaterialTheme.colorScheme.primary
                     else MaterialTheme.colorScheme.onSurfaceVariant).toArgb()
    val density = LocalContext.current.resources.displayMetrics.density
    Box(modifier.clip(RoundedCornerShape(16.dp)), contentAlignment = Alignment.Center) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { c ->
                Configuration.getInstance().userAgentValue = c.packageName
                MapView(c).apply {
                    setTileSource(TileSourceFactory.MAPNIK)
                    setMultiTouchControls(true)
                    controller.setZoom(16.5)
                }
            },
            update = { map ->
                map.overlays.clear()
                if (track.size >= 2) {
                    val gpts = track.map { GeoPoint(it[0], it[1]) }
                    map.overlays.add(Polyline(map).apply {
                        setPoints(gpts)
                        outlinePaint.color = lineColor
                        outlinePaint.strokeWidth = 6f * density
                    })
                    map.controller.setCenter(gpts.last())   // der aktuellen Position folgen
                }
                map.invalidate()
            },
        )
        if (track.size < 2) {
            Text(I18n.t("rec.gpsSearch"), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

// Direkt antippbarer Foil-Chip (Favoriten + „Ohne Foil"); hervorgehoben, wenn ausgewählt.
@Composable
private fun FoilChip(label: String, selected: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Surface(
        modifier = modifier.clickable { onClick() },
        shape = RoundedCornerShape(10.dp),
        color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
    ) {
        Text(label, Modifier.padding(vertical = 10.dp, horizontal = 8.dp), maxLines = 1,
            style = MaterialTheme.typography.bodyMedium,
            color = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface)
    }
}
