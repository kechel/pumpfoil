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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
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
        I18n.load(applicationContext)   // gecachte Profil-Sprache (offline-tauglich)
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
            Text(I18n.t("pair.title"), style = MaterialTheme.typography.title3)
            Spacer(Modifier.height(6.dp))
            if (code.isEmpty()) {
                Text(I18n.t("pair.howto"),
                    style = MaterialTheme.typography.caption2, textAlign = TextAlign.Center)
                Spacer(Modifier.height(8.dp))
                Button(enabled = !busy, onClick = {
                    busy = true; error = ""
                    scope.launch {
                        try { val (c, t) = Api.pairInit(); code = c; claimToken = t }
                        catch (e: Exception) { error = e.message ?: I18n.t("common.error") }
                        busy = false
                    }
                }) { Text(if (busy) "…" else I18n.t("pair.gen")) }
            } else {
                Text(I18n.t("pair.enterOn"),
                    style = MaterialTheme.typography.caption2, textAlign = TextAlign.Center)
                Spacer(Modifier.height(4.dp))
                Text(code, style = MaterialTheme.typography.display2, color = Color(0xFF22D3EE))
                Spacer(Modifier.height(6.dp))
                Row(verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp)
                    Text(I18n.t("pair.waiting"),
                        style = MaterialTheme.typography.caption2, color = Color(0xFF94A3B8))
                }
            }
            if (error.isNotEmpty()) Text(error, style = MaterialTheme.typography.caption2)
            Spacer(Modifier.height(8.dp))
            // Ohne Pairing aufnehmen — Sessions werden lokal gespeichert, später gesynct.
            CompactChip(onClick = onSkip,
                label = { Text(I18n.t("pair.later"), style = MaterialTheme.typography.caption2) })
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
        var manualAlarm by remember { mutableStateOf(false) }
        var alarmDefault by remember { mutableStateOf("foil") }   // Vorwahl: "foil" | "fixed"
        var foils by remember { mutableStateOf<List<FoilOpt>>(emptyList()) }
        var showFoilPicker by remember { mutableStateOf(false) }
        var offFoil by remember { mutableStateOf(listOf(12, 17, 16)) }   // Off-Foil-Screen

        fun applyConfig(c: JSONObject) {
            if (c.has("language")) I18n.set(ctx, c.optString("language", "de"))
            val vs = c.optJSONArray("views")
            if (vs != null && vs.length() > 0) {
                views = (0 until vs.length()).map { i ->
                    val row = vs.getJSONArray(i)
                    (0 until row.length()).map { row.getInt(it) }
                }
            }
            colorBy = c.optBoolean("colorByValue", false)
            manualAlarm = c.optBoolean("alarmEnabled", false)
            alarmDefault = c.optString("alarmDefault", "foil")
            alarm = WatchAlarm(
                c.optBoolean("alarmEnabled", false),
                c.optInt("speedHigh", 0), c.optInt("speedLow", 0),
                c.optString("alarmPatternHigh", "short2"),
                c.optString("alarmPatternLow", "long2"),
                c.optString("alarmRepeat", "once"))
            val fa = c.optJSONArray("foils")
            if (fa != null) {
                foils = (0 until fa.length()).map { i ->
                    val o = fa.getJSONObject(i)
                    FoilOpt(o.optInt("id"), o.optString("label"), o.optInt("min"), o.optInt("max"))
                }
            }
            val ofa = c.optJSONArray("offFoilView")
            if (ofa != null && ofa.length() > 0) {
                offFoil = (0 until ofa.length()).map { ofa.getInt(it) }
            }
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
                        val c = Api.deviceConfig(appVersion(ctx))
                        applyConfig(c)
                        Api.cacheConfig(ctx, c)
                    } catch (_: Exception) {}
                    syncing = false
                }
            }
        }
        // Auto-Resume: solange lokal etwas wartet, alle 5 s erneut versuchen (drain prüft
        // online/busy selbst). So lädt es von allein weiter, sobald die Verbindung zurück ist.
        LaunchedEffect(s.pendingCount > 0) {
            while (s.pendingCount > 0) {
                kotlinx.coroutines.delay(5000)
                Recorder.drain(ctx)
            }
        }
        // Vibrationsalarm bei Speed-Grenzen.
        AlarmEffect(s.speedKmh, alarm)

        if (s.recording) {
            // Pager: Stop(0) | Datenansichten 1..n | Übersicht(n+1) | Stop(n+2).
            val dataCount = views.size
            val summaryPage = dataCount + 1
            val pageCount = dataCount + 3
            val pager = rememberPagerState(initialPage = 1, pageCount = { pageCount })
            var prevFoil by remember { mutableStateOf(s.isFoiling) }
            // Auto-Wechsel NUR auf der Flanke: Lauf beendet -> Übersicht (+kurze Vibration,
            // 60-s-Rücksprung); Lauf gestartet -> zurück zur Datenansicht. Manuelles Wischen
            // bricht den Rücksprung ab (dann ist currentPage != summaryPage).
            LaunchedEffect(s.isFoiling) {
                if (s.isFoiling == prevFoil) return@LaunchedEffect
                val wasFoiling = prevFoil
                prevFoil = s.isFoiling
                if (!s.isFoiling && wasFoiling) {
                    val back = pager.currentPage.coerceIn(1, dataCount)
                    pager.animateScrollToPage(summaryPage)
                    vibrate(ctx, 200)
                    kotlinx.coroutines.delay(60_000)
                    if (pager.currentPage == summaryPage) pager.animateScrollToPage(back)
                } else if (s.isFoiling && pager.currentPage == summaryPage) {
                    pager.animateScrollToPage(dataCount)
                }
            }
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.BottomCenter) {
                HorizontalPager(state = pager, modifier = Modifier.fillMaxSize()) { page ->
                    Column(
                        Modifier.fillMaxSize().padding(8.dp),
                        verticalArrangement = Arrangement.Center,
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        when {
                            page in 1..dataCount ->
                                views[page - 1].filter { it != 0 }.ifEmpty { listOf(1) }.forEach { fid ->
                                    FieldView(fid, s, colorBy)
                                }
                            page == summaryPage ->  // Übersicht (off foil)
                                offFoil.filter { it != 0 }.ifEmpty { listOf(12) }.forEach { fid ->
                                    FieldView(fid, s, colorBy)
                                }
                            else -> {  // Stop-Seiten (vorne & hinten)
                                Button(onClick = { RecorderService.stop(applicationContext) }) { Text(I18n.t("rec.stop")) }
                                Spacer(Modifier.height(6.dp))
                                Text(if (s.status.isNotEmpty()) s.status
                                     else if (page == 0) I18n.t("rec.toData") else I18n.t("rec.toSummary"),
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
        } else if (showFoilPicker) {
            FoilPicker(
                foils = foils,
                websiteAlarm = if (manualAlarm) alarm else null,
                foilsFirst = alarmDefault == "foil",
                repeatMode = alarm.repeat,
                onToggleRepeat = {
                    alarm = alarm.copy(repeat = if (alarm.repeat == "continuous") "once" else "continuous")
                },
                onWebsite = { showFoilPicker = false; RecorderService.start(applicationContext) },
                onPick = { f ->
                    // Foil-Schwellen setzen, Muster/Repeat aus der Config behalten.
                    alarm = alarm.copy(enabled = true, high = f.max, low = f.min)
                    showFoilPicker = false
                    RecorderService.start(applicationContext)
                },
                onNone = { alarm = alarm.copy(enabled = false); showFoilPicker = false; RecorderService.start(applicationContext) },
                onBack = { showFoilPicker = false },
            )
        } else {
            Column(Modifier.fillMaxSize().padding(12.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally) {
                Text("Pumpfoil", style = MaterialTheme.typography.title3)
                Text("v" + appVersion(ctx), style = MaterialTheme.typography.caption2, color = Color(0xFF94A3B8))
                Spacer(Modifier.height(10.dp))
                if (s.starting) {
                    // Startphase (GPS/Session): kein Start-Button, nur Spinner + Status.
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                    Spacer(Modifier.height(6.dp))
                    Text(if (s.status.isNotEmpty()) s.status else I18n.t("rec.starting"),
                        style = MaterialTheme.typography.caption2,
                        color = Color(0xFF94A3B8), textAlign = TextAlign.Center)
                } else {
                Button(onClick = {
                    skipSync()
                    if (manualAlarm || foils.isNotEmpty()) showFoilPicker = true
                    else RecorderService.start(applicationContext)
                }) { Text(I18n.t("rec.start")) }
                // Sync-Banner: nur online; „Jetzt nicht" überspringt sofort und gibt den Start frei.
                if (syncing) {
                    Spacer(Modifier.height(8.dp))
                    Row(verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp)
                        Text(I18n.t("rec.sync"), style = MaterialTheme.typography.caption2, color = Color(0xFF94A3B8))
                    }
                    Spacer(Modifier.height(4.dp))
                    CompactChip(onClick = { skipSync() },
                        label = { Text(I18n.t("rec.notNow"), style = MaterialTheme.typography.caption2) })
                } else if (s.status.isNotEmpty()) {
                    Spacer(Modifier.height(6.dp))
                    Text(s.status, style = MaterialTheme.typography.caption2,
                        color = Color(0xFF94A3B8), textAlign = TextAlign.Center)
                }
                // Nicht verbunden: Hinweis + Verbinden-Chip (Aufnahme geht trotzdem, lokal).
                if (Api.deviceToken == null) {
                    Spacer(Modifier.height(8.dp))
                    Text(I18n.t("rec.notLinked"),
                        style = MaterialTheme.typography.caption2,
                        color = Color(0xFFF59E0B), textAlign = TextAlign.Center)
                    Spacer(Modifier.height(4.dp))
                    CompactChip(onClick = onWantPair,
                        label = { Text(I18n.t("rec.connect"), style = MaterialTheme.typography.caption2) })
                }
                // Lokal wartende Sessions: Fortschritt + Verbindungsstatus, statt nur „X warten".
                if (s.pendingCount > 0) {
                    Spacer(Modifier.height(8.dp))
                    if (s.uploading) {
                        Row(verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp)
                            val prog = if (s.uploadTotal > 0) " ${s.uploadSent}/${s.uploadTotal}" else ""
                            Text(I18n.t("rec.uploading") + prog,
                                style = MaterialTheme.typography.caption2, color = Color(0xFF94A3B8))
                        }
                    } else if (s.uploadError == "offline" || !Api.isOnline(ctx)) {
                        Text(I18n.t("rec.waitConn"),
                            style = MaterialTheme.typography.caption2,
                            color = Color(0xFFF59E0B), textAlign = TextAlign.Center)
                        Text("${s.pendingCount} " + I18n.t("rec.pendingUpload") + " — " + I18n.t("rec.willResume"),
                            style = MaterialTheme.typography.caption2, color = Color(0xFF94A3B8),
                            textAlign = TextAlign.Center)
                    } else if (s.uploadError == "server") {
                        Text(I18n.t("rec.serverErr"),
                            style = MaterialTheme.typography.caption2,
                            color = Color(0xFFF59E0B), textAlign = TextAlign.Center)
                    } else {
                        Text("${s.pendingCount} " + I18n.t("rec.pendingUpload"),
                            style = MaterialTheme.typography.caption2, color = Color(0xFF94A3B8))
                    }
                    if (Api.deviceToken != null && !s.uploading) {
                        Spacer(Modifier.height(4.dp))
                        CompactChip(onClick = { Recorder.drain(ctx) },
                            label = { Text(I18n.t("rec.uploadNow"), style = MaterialTheme.typography.caption2) })
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
    1 -> String.format("%.1f", s.speed3sKmh) to I18n.t("f.kmh3s")
    5 -> String.format("%.1f", s.speedKmh) to I18n.t("f.kmh")
    6 -> String.format("%.1f", s.avgSpeedKmh) to I18n.t("f.kmhAvg")
    7 -> String.format("%.1f", s.maxSpeedKmh) to I18n.t("f.kmhMax")
    2 -> (if (s.hr > 0) s.hr.toString() else "–") to I18n.t("f.bpm")
    8 -> (if (s.avgHr > 0) s.avgHr.toString() else "–") to I18n.t("f.bpmAvg")
    9 -> (if (s.maxHr > 0) s.maxHr.toString() else "–") to I18n.t("f.bpmMax")
    3 -> String.format("%d:%02d", s.elapsedSec / 60, s.elapsedSec % 60) to I18n.t("f.time")
    4 -> if (s.distanceM < 1000) String.format("%.0f", s.distanceM) to "m"
         else String.format("%.2f", s.distanceM / 1000.0) to "km"
    12 -> java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault()).format(java.util.Date()) to I18n.t("f.clock")
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

data class WatchAlarm(
    val enabled: Boolean = false,
    val high: Int = 0,
    val low: Int = 0,
    val patHigh: String = "short2",
    val patLow: String = "long2",
    val repeat: String = "once",   // "once" = einmalig | "continuous" = dauerhaft
)

// Foil-Option für die Start-Auswahl (Auto-Alarm-Korridor min–max km/h).
data class FoilOpt(val id: Int, val label: String, val min: Int, val max: Int)

// Alarm-Auswahl beim Start: feste Website-Werte oder ein Foil (setzt dessen Auto-Alarm).
// Reihenfolge folgt der Web-Vorwahl (alarmDefault: foilsFirst). Repeat-Modus pro Session
// umschaltbar (Website setzt nur den Default).
@Composable
fun FoilPicker(
    foils: List<FoilOpt>,
    websiteAlarm: WatchAlarm?,
    foilsFirst: Boolean,
    repeatMode: String,
    onToggleRepeat: () -> Unit,
    onWebsite: () -> Unit,
    onPick: (FoilOpt) -> Unit,
    onNone: () -> Unit,
    onBack: () -> Unit,
) {
    val fixedChip: @Composable () -> Unit = {
        if (websiteAlarm != null) {
            Chip(
                onClick = onWebsite,
                label = { Text(I18n.t("foil.fixed")) },
                secondaryLabel = { Text("${websiteAlarm.low}–${websiteAlarm.high} km/h") },
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
    val foilChips: @Composable () -> Unit = {
        foils.forEach { f ->
            Chip(
                onClick = { onPick(f) },
                label = { Text(f.label, maxLines = 1) },
                secondaryLabel = { Text("${f.min}–${f.max} km/h") },
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 8.dp, vertical = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(I18n.t("foil.choose"), style = MaterialTheme.typography.title3)
        if (foilsFirst) { foilChips(); fixedChip() } else { fixedChip(); foilChips() }
        CompactChip(onClick = onNone, label = { Text(I18n.t("foil.none")) })
        CompactChip(
            onClick = onToggleRepeat,
            label = { Text(I18n.t("foil.triggerPrefix") + if (repeatMode == "continuous") I18n.t("foil.continuous") else I18n.t("foil.once")) },
        )
        CompactChip(onClick = onBack, label = { Text(I18n.t("common.back")) })
    }
}

// Vibrationsalarm bei Über-/Unterschreiten der Speed-Grenzen. Flanke löst sofort aus;
// im Modus "continuous" wird alle ~3 Ticks erneut vibriert, solange drüber/drunter.
// Der Min-Alarm warnt nur im schmalen Fenster [min-2, min) (Abfall knapp unter Min,
// nicht dauerhaft beim Stehen) — identisch zur Garmin-Logik.
private const val ALARM_REPEAT_TICKS = 3

@Composable
fun AlarmEffect(speedKmh: Double, alarm: WatchAlarm) {
    val ctx = LocalContext.current
    var wasHigh by remember { mutableStateOf(false) }
    var wasLow by remember { mutableStateOf(false) }
    var repeatTick by remember { mutableStateOf(0) }
    LaunchedEffect(speedKmh, alarm) {
        if (!alarm.enabled) { wasHigh = false; wasLow = false; repeatTick = 0; return@LaunchedEffect }
        val over = alarm.high > 0 && speedKmh >= alarm.high
        val under = alarm.low > 0 && speedKmh < alarm.low && speedKmh >= alarm.low - 2
        if (over && !wasHigh) vibratePattern(ctx, alarm.patHigh)
        if (under && !wasLow) vibratePattern(ctx, alarm.patLow)
        val tripped = over || under
        if (tripped && alarm.repeat == "continuous" && (wasHigh || wasLow)) {
            repeatTick++
            if (repeatTick >= ALARM_REPEAT_TICKS) {
                repeatTick = 0
                vibratePattern(ctx, if (over) alarm.patHigh else alarm.patLow)
            }
        } else if (!tripped) {
            repeatTick = 0
        }
        wasHigh = over; wasLow = under
    }
}

private fun vibrator(ctx: Context): android.os.Vibrator =
    if (Build.VERSION.SDK_INT >= 31)
        (ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as android.os.VibratorManager).defaultVibrator
    else @Suppress("DEPRECATION") (ctx.getSystemService(Context.VIBRATOR_SERVICE) as android.os.Vibrator)

private fun appVersion(ctx: Context): String =
    try { ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName ?: "" } catch (_: Exception) { "" }

private fun vibrate(ctx: Context, ms: Long) {
    vibrator(ctx).vibrate(android.os.VibrationEffect.createOneShot(ms, android.os.VibrationEffect.DEFAULT_AMPLITUDE))
}

// Muster-ID -> Waveform (off/on-Dauern in ms, beginnend mit off). IDs identisch mit
// Web + Garmin (short1/short2/long2/lsl).
private fun vibratePattern(ctx: Context, pattern: String) {
    val timings = when (pattern) {
        "short1" -> longArrayOf(0, 150)
        "long2" -> longArrayOf(0, 500, 150, 500)
        "lsl" -> longArrayOf(0, 500, 120, 150, 120, 500)
        else -> longArrayOf(0, 150, 120, 150)   // short2 (Default)
    }
    vibrator(ctx).vibrate(android.os.VibrationEffect.createWaveform(timings, -1))
}
