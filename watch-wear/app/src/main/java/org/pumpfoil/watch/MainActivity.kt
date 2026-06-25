package org.pumpfoil.watch

import android.Manifest
import android.content.Context
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.wear.compose.material.*
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import org.json.JSONObject

class MainActivity : ComponentActivity() {
    private val perms = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()) {}

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Api.load(applicationContext)
        requestPerms()
        setContent { AppUi() }
    }

    private fun requestPerms() {
        val p = mutableListOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.BODY_SENSORS,
            Manifest.permission.ACTIVITY_RECOGNITION,
        )
        if (Build.VERSION.SDK_INT >= 33) p.add(Manifest.permission.POST_NOTIFICATIONS)
        perms.launch(p.toTypedArray())
    }

    @Composable
    private fun AppUi() {
        // Pairing ist optional: ohne Token kann man trotzdem aufnehmen (lokal) und
        // später verbinden -> die Sessions werden dann automatisch nachgesynct.
        var paired by remember { mutableStateOf(Api.deviceToken != null) }
        var skipped by remember { mutableStateOf(false) }
        MaterialTheme {
            if (paired || skipped) RecordScreen(onWantPair = { skipped = false })
            else PairScreen(onPaired = { paired = true }, onSkip = { skipped = true })
        }
    }

    // Reverse-Pairing: die Uhr erzeugt einen Code, der Nutzer trägt ihn auf
    // pumpfoil.org (Account) ein. Tippen auf der Uhr wäre umständlich -> stattdessen
    // pollt die Uhr, bis der Code eingelöst ist, und holt sich dann das Token.
    @Composable
    private fun PairScreen(onPaired: () -> Unit, onSkip: () -> Unit) {
        val scope = rememberCoroutineScope()
        var code by remember { mutableStateOf("") }
        var claimToken by remember { mutableStateOf("") }
        var error by remember { mutableStateOf("") }
        var busy by remember { mutableStateOf(false) }

        // Solange ein Code da ist: alle 3 s pollen, ob er eingelöst wurde.
        LaunchedEffect(claimToken) {
            if (claimToken.isEmpty()) return@LaunchedEffect
            while (true) {
                kotlinx.coroutines.delay(3000)
                val token = try { Api.pairPoll(claimToken) } catch (_: Exception) { null }
                if (token != null) { Api.saveToken(applicationContext, token); onPaired(); break }
            }
        }

        Column(
            Modifier.fillMaxSize().padding(12.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text("Uhr verbinden", style = MaterialTheme.typography.title3)
            Spacer(Modifier.height(6.dp))
            if (code.isEmpty()) {
                Text("Pairing-Code erzeugen und auf pumpfoil.org (Account) eingeben.",
                    style = MaterialTheme.typography.caption2, textAlign = TextAlign.Center)
                Spacer(Modifier.height(8.dp))
                Button(enabled = !busy, onClick = {
                    busy = true; error = ""
                    scope.launch {
                        try { val (c, t) = Api.pairInit(); code = c; claimToken = t }
                        catch (e: Exception) { error = e.message ?: "Fehler" }
                        busy = false
                    }
                }) { Text(if (busy) "…" else "Pairing-Code erzeugen") }
            } else {
                Text("Auf pumpfoil.org eingeben:",
                    style = MaterialTheme.typography.caption2, textAlign = TextAlign.Center)
                Spacer(Modifier.height(4.dp))
                Text(code, style = MaterialTheme.typography.display2, color = Color(0xFF22D3EE))
                Spacer(Modifier.height(6.dp))
                Row(verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp)
                    Text("warte auf Bestätigung…",
                        style = MaterialTheme.typography.caption2, color = Color(0xFF94A3B8))
                }
            }
            if (error.isNotEmpty()) Text(error, style = MaterialTheme.typography.caption2)
            Spacer(Modifier.height(8.dp))
            // Ohne Pairing aufnehmen — Sessions werden lokal gespeichert, später gesynct.
            CompactChip(onClick = onSkip,
                label = { Text("Später verbinden", style = MaterialTheme.typography.caption2) })
        }
    }

    @OptIn(ExperimentalFoundationApi::class)
    @Composable
    private fun RecordScreen(onWantPair: () -> Unit = {}) {
        val s by Recorder.state.collectAsState()
        val ctx = LocalContext.current
        val scope = rememberCoroutineScope()
        // Konfigurierte Ansichten von der Web-App laden (Felder je Seite + Farbe/Alarm).
        // Default = sinnvolles Mehr-Seiten-Layout, bis die Account-Config gesynct ist.
        var views by remember { mutableStateOf(DEFAULT_VIEWS) }
        var colorBy by remember { mutableStateOf(false) }
        var alarm by remember { mutableStateOf(WatchAlarm()) }
        var syncing by remember { mutableStateOf(false) }
        var configJob by remember { mutableStateOf<Job?>(null) }

        fun applyConfig(c: JSONObject) {
            val vs = c.optJSONArray("views")
            if (vs != null && vs.length() > 0) {
                views = (0 until vs.length()).map { i ->
                    val row = vs.getJSONArray(i)
                    (0 until row.length()).map { row.getInt(it) }
                }
            }
            colorBy = c.optBoolean("colorByValue", false)
            alarm = WatchAlarm(c.optBoolean("alarmEnabled", false),
                c.optInt("speedHigh", 0), c.optInt("speedLow", 0))
        }
        fun skipSync() { configJob?.cancel(); syncing = false }

        LaunchedEffect(Unit) {
            Recorder.refreshPending(ctx)            // wie viele Sessions warten lokal?
            Recorder.drain(ctx)                     // gepairt + online -> jetzt hochladen
            // Sofort letzte bekannte Config anwenden (offline-tauglich), dann ggf. online aktualisieren.
            Api.cachedConfig(ctx)?.let { applyConfig(it) }
            if (Api.isOnline(ctx)) {
                syncing = true
                configJob = scope.launch {
                    try {
                        val c = Api.deviceConfig()
                        applyConfig(c)
                        Api.cacheConfig(ctx, c)
                    } catch (_: Exception) {}
                    syncing = false
                }
            }
        }
        // Vibrationsalarm bei Speed-Grenzen.
        AlarmEffect(s.speedKmh, alarm)

        if (s.recording) {
            // Stop an BEIDEN Enden (Pager läuft nicht um); Start landet auf 1. Datenseite.
            val pageCount = views.size + 2
            val pager = rememberPagerState(initialPage = 1, pageCount = { pageCount })
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.BottomCenter) {
                HorizontalPager(state = pager, modifier = Modifier.fillMaxSize()) { page ->
                    Column(
                        Modifier.fillMaxSize().padding(8.dp),
                        verticalArrangement = Arrangement.Center,
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        when {
                            page in 1..views.size ->
                                views[page - 1].filter { it != 0 }.ifEmpty { listOf(1) }.forEach { fid ->
                                    FieldView(fid, s, colorBy)
                                }
                            else -> {  // Stop-Seiten (vorne & hinten)
                                Button(onClick = { RecorderService.stop(applicationContext) }) { Text("Stop") }
                                Spacer(Modifier.height(6.dp))
                                Text(if (s.status.isNotEmpty()) s.status
                                     else if (page == 0) "Datenfelder →" else "← Datenfelder",
                                    style = MaterialTheme.typography.caption2, color = Color(0xFF94A3B8))
                            }
                        }
                    }
                }
                // Seiten-Punkte unten.
                Row(Modifier.padding(bottom = 4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    repeat(pageCount) { i ->
                        Box(Modifier.size(5.dp).background(
                            if (i == pager.currentPage) Color(0xFF22D3EE) else Color(0xFF475569),
                            CircleShape))
                    }
                }
                // Upload-Indikator oben, wenn gerade Chunks hochgeladen werden.
                if (s.uploading) {
                    CircularProgressIndicator(
                        modifier = Modifier.align(Alignment.TopCenter).padding(top = 2.dp).size(12.dp),
                        strokeWidth = 2.dp)
                }
            }
        } else {
            Column(Modifier.fillMaxSize().padding(12.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally) {
                Text("Pumpfoil", style = MaterialTheme.typography.title3)
                Spacer(Modifier.height(10.dp))
                if (s.starting) {
                    // Startphase (GPS/Session): kein Start-Button, nur Spinner + Status.
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                    Spacer(Modifier.height(6.dp))
                    Text(if (s.status.isNotEmpty()) s.status else "starte…",
                        style = MaterialTheme.typography.caption2,
                        color = Color(0xFF94A3B8), textAlign = TextAlign.Center)
                } else {
                Button(onClick = { skipSync(); RecorderService.start(applicationContext) }) { Text("Start") }
                // Sync-Banner: nur online; „Jetzt nicht" überspringt sofort und gibt den Start frei.
                if (syncing) {
                    Spacer(Modifier.height(8.dp))
                    Row(verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp)
                        Text("Sync…", style = MaterialTheme.typography.caption2, color = Color(0xFF94A3B8))
                    }
                    Spacer(Modifier.height(4.dp))
                    CompactChip(onClick = { skipSync() },
                        label = { Text("Jetzt nicht", style = MaterialTheme.typography.caption2) })
                } else if (s.status.isNotEmpty()) {
                    Spacer(Modifier.height(6.dp))
                    Text(s.status, style = MaterialTheme.typography.caption2,
                        color = Color(0xFF94A3B8), textAlign = TextAlign.Center)
                }
                // Nicht verbunden: Hinweis + Verbinden-Chip (Aufnahme geht trotzdem, lokal).
                if (Api.deviceToken == null) {
                    Spacer(Modifier.height(8.dp))
                    Text("Nicht verbunden – Sessions lokal",
                        style = MaterialTheme.typography.caption2,
                        color = Color(0xFFF59E0B), textAlign = TextAlign.Center)
                    Spacer(Modifier.height(4.dp))
                    CompactChip(onClick = onWantPair,
                        label = { Text("Verbinden", style = MaterialTheme.typography.caption2) })
                }
                // Lokal wartende Sessions anzeigen (+ manueller Upload, wenn möglich).
                if (s.pendingCount > 0) {
                    Spacer(Modifier.height(8.dp))
                    Text("${s.pendingCount} warten auf Upload",
                        style = MaterialTheme.typography.caption2, color = Color(0xFF94A3B8))
                    if (Api.deviceToken != null) {
                        Spacer(Modifier.height(4.dp))
                        CompactChip(onClick = { Recorder.drain(ctx) },
                            label = { Text("Jetzt hochladen", style = MaterialTheme.typography.caption2) })
                    }
                }
                }
            }
        }
    }

    @Composable
    private fun FieldView(fid: Int, s: Recorder.State, colorBy: Boolean) {
        val (value, label) = fieldValue(fid, s)
        val color = if (colorBy) fieldColor(fid, s) else Color.Unspecified
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 2.dp)) {
            Text(value, style = MaterialTheme.typography.display3, color = color)
            Text(label, style = MaterialTheme.typography.caption2, color = Color(0xFF94A3B8))
        }
    }
}

// Eingebauter Default, bis die Account-Config gesynct ist: drei sinnvolle Seiten
// statt einer einzelnen. Nach erstem Sync wird die Web-App-Config gecacht + genutzt.
private val DEFAULT_VIEWS = listOf(
    listOf(1, 2),   // 3-s-Speed + Puls
    listOf(6, 7),   // Ø + max Speed
    listOf(4, 3),   // Distanz + Zeit
)

// Feld-IDs identisch mit web/src/lib/fields.ts + Garmin Config.mc (Kernsatz; Rest "—").
private fun fieldValue(id: Int, s: Recorder.State): Pair<String, String> = when (id) {
    1 -> String.format("%.1f", s.speed3sKmh) to "km/h (3s)"
    5 -> String.format("%.1f", s.speedKmh) to "km/h"
    6 -> String.format("%.1f", s.avgSpeedKmh) to "Ø km/h"
    7 -> String.format("%.1f", s.maxSpeedKmh) to "max km/h"
    2 -> (if (s.hr > 0) s.hr.toString() else "–") to "bpm"
    8 -> (if (s.avgHr > 0) s.avgHr.toString() else "–") to "Ø bpm"
    9 -> (if (s.maxHr > 0) s.maxHr.toString() else "–") to "max bpm"
    3 -> String.format("%d:%02d", s.elapsedSec / 60, s.elapsedSec % 60) to "Zeit"
    4 -> String.format("%.2f", s.distanceM / 1000.0) to "km"
    12 -> java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault()).format(java.util.Date()) to "Uhr"
    else -> "—" to ""
}

private fun fieldColor(id: Int, s: Recorder.State): Color = when (id) {
    1, 5, 6, 7 -> speedColor(when (id) { 1 -> s.speed3sKmh; 6 -> s.avgSpeedKmh; 7 -> s.maxSpeedKmh; else -> s.speedKmh })
    2, 8, 9 -> Color(0xFFF87171) // Puls rötlich
    else -> Color.Unspecified
}
private fun speedColor(kmh: Double): Color {
    val tcl = ((kmh - 8) / (25 - 8)).coerceIn(0.0, 1.0)   // blau(langsam) -> rot(schnell)
    val hue = ((1 - tcl) * 240).toFloat()
    return Color(android.graphics.Color.HSVToColor(floatArrayOf(hue, 0.85f, 0.95f)))
}

data class WatchAlarm(val enabled: Boolean = false, val high: Int = 0, val low: Int = 0)

// Vibrationsalarm bei Über-/Unterschreiten der Speed-Grenzen (Flankenerkennung).
@Composable
fun AlarmEffect(speedKmh: Double, alarm: WatchAlarm) {
    val ctx = LocalContext.current
    var wasHigh by remember { mutableStateOf(false) }
    var wasLow by remember { mutableStateOf(false) }
    LaunchedEffect(speedKmh, alarm) {
        if (!alarm.enabled) return@LaunchedEffect
        if (alarm.high > 0) {
            val now = speedKmh >= alarm.high
            if (now && !wasHigh) vibrate(ctx, 200)
            wasHigh = now
        }
        if (alarm.low > 0) {
            val now = speedKmh in 0.1..alarm.low.toDouble()
            if (now && !wasLow) vibrate(ctx, 400)
            wasLow = now
        }
    }
}

private fun vibrate(ctx: Context, ms: Long) {
    val v = if (Build.VERSION.SDK_INT >= 31)
        (ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as android.os.VibratorManager).defaultVibrator
    else @Suppress("DEPRECATION") (ctx.getSystemService(Context.VIBRATOR_SERVICE) as android.os.Vibrator)
    v.vibrate(android.os.VibrationEffect.createOneShot(ms, android.os.VibrationEffect.DEFAULT_AMPLITUDE))
}
