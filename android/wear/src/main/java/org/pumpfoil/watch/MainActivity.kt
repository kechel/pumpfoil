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
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.clickable
import androidx.compose.foundation.verticalScroll
import androidx.wear.compose.foundation.SwipeToDismissValue
import androidx.wear.compose.foundation.rememberSwipeToDismissBoxState
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.*
import android.os.Looper
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.Job
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
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
        var forcePair by remember { mutableStateOf(false) }   // „Neu verbinden" trotz (ungültigem) Token
        MaterialTheme {
            if (forcePair || (!paired && !skipped))
                PairScreen(onPaired = { paired = true; forcePair = false; skipped = false },
                           onSkip = { skipped = true; forcePair = false })
            else RecordScreen(onWantPair = { forcePair = true })
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

        // Scrollbar + großzügiger Rand: bei großer System-Schrift darf nichts am runden Rand
        // abgeschnitten werden (Wear-Qualitätsrichtlinie Schriftgröße). Scaffold + PositionIndicator
        // zeigt die von Wear geforderte Scroll-Anzeige.
        val scroll = rememberScrollState()
        Scaffold(positionIndicator = { PositionIndicator(scrollState = scroll) }) {
        Column(
            Modifier.fillMaxSize().verticalScroll(scroll)
                .padding(horizontal = 16.dp, vertical = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(I18n.t("pair.title"), style = MaterialTheme.typography.title3, textAlign = TextAlign.Center)
            Spacer(Modifier.height(6.dp))
            if (code.isEmpty()) {
                Text(I18n.t("pair.howto"),
                    style = MaterialTheme.typography.caption2, textAlign = TextAlign.Center)
                Spacer(Modifier.height(8.dp))
                // Chip statt (rundem) Button: der lange Text „Pairing-Code erzeugen" passt
                // sonst nicht in den Kreis und bricht um.
                CompactChip(enabled = !busy, onClick = {
                    busy = true; error = ""
                    scope.launch {
                        try { val (c, t) = Api.pairInit(); code = c; claimToken = t }
                        catch (e: Exception) { error = e.message ?: I18n.t("common.error") }
                        busy = false
                    }
                }, label = { Text(if (busy) "…" else I18n.t("pair.gen"), style = MaterialTheme.typography.caption2) })
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
        var showSaved by remember { mutableStateOf(false) }   // Post-Stop-Screen (wie Garmin)
        var wasRecording by remember { mutableStateOf(false) }
        var showFoilPicker by remember { mutableStateOf(false) }
        var foilLabel by remember { mutableStateOf("") }        // gewählte Foil (Anzeige "Foil: <name>")
        var sessionFoilId by remember { mutableStateOf<Int?>(null) }   // Foil = Metadaten (+ Auto-Schwellen)
        var alarmSource by remember { mutableStateOf("foil") }         // "foil" | "manual" (Schwellen-Quelle)
        var offFoil by remember { mutableStateOf(listOf(12, 17, 16)) }   // Lauf-Ende-Screen (kurz nach Lauf-Ende)
        val pauseView = listOf(12, 20, 2)                                // Pausen-Screen: Uhrzeit · Läufe · Puls
        var autoStart by remember { mutableStateOf(false) }              // GPS-Auto-Start (Config)

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
            autoStart = c.optBoolean("autoStart", false)
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
            // Default-Auswahl (bis der Nutzer wechselt) — entkoppelt wie Garmin: Alarm-An/Aus vom
            // Web-Master, Foil separat (Metadaten + Auto-Schwellen). alarm.high/low = feste Web-Werte.
            if (foilLabel.isEmpty()) {
                alarm = alarm.copy(enabled = manualAlarm)
                if (alarmDefault == "foil" && foils.isNotEmpty()) {
                    sessionFoilId = foils[0].id; foilLabel = foils[0].label; alarmSource = "foil"
                } else {
                    sessionFoilId = null; foilLabel = "—"; alarmSource = "manual"
                }
            }
            val ofa = c.optJSONArray("offFoilView")
            if (ofa != null && ofa.length() > 0) {
                offFoil = (0 until ofa.length()).map { ofa.getInt(it) }
            }
            // Aufzeichnungsmodus (full/lite/gps) persistieren -> Recorder liest beim Start (offline-tauglich).
            val rm = c.optString("recordMode", "full")
            Recorder.recordMode = rm
            ctx.getSharedPreferences("pumpfoil", Context.MODE_PRIVATE)
                .edit().putString("record_mode", rm).apply()
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
        // Token serverseitig ungültig -> automatisch ein frisches vom Phone anfordern
        // (Companion-Pairing). „Neu verbinden" bleibt als Code-Fallback bestehen.
        LaunchedEffect(s.uploadError) {
            if (s.uploadError == "auth") WearLink.requestToken(ctx)
        }
        // Auto-Resume: solange lokal etwas wartet, alle 5 s erneut versuchen (drain prüft
        // online/busy selbst). So lädt es von allein weiter, sobald die Verbindung zurück ist.
        LaunchedEffect(s.pendingCount > 0) {
            while (s.pendingCount > 0) {
                kotlinx.coroutines.delay(5000)
                Recorder.drain(ctx)
            }
        }
        // Vibrationsalarm bei Speed-Grenzen. Effektive Schwellen: bei "foil" aus der gewählten
        // Foil, sonst die manuellen (alarm.high/low). alarm.enabled = An/Aus (unabhängig).
        val effAlarm = if (alarmSource == "foil" && sessionFoilId != null)
            (foils.firstOrNull { it.id == sessionFoilId }?.let { alarm.copy(high = it.max, low = it.min) } ?: alarm)
        else alarm
        AlarmEffect(s.speedKmh, effAlarm)
        // Gewählte Foil an den Recorder durchreichen (wird als foil_id ins Meta geschrieben).
        LaunchedEffect(sessionFoilId) { Recorder.sessionFoilId = sessionFoilId }
        // Post-Stop-Screen einblenden, sobald die Aufnahme endet (Flanke recording true->false).
        // Verhindert, dass man direkt versehentlich wieder auf Start tippt (wie Garmin).
        LaunchedEffect(s.recording) {
            if (wasRecording && !s.recording) showSaved = true
            wasRecording = s.recording
        }

        if (s.recording) {
            // Pager: Stop(0) | Datenansichten 1..n | Übersicht(n+1) | Stop(n+2).
            val dataCount = views.size
            val summaryPage = dataCount + 1
            val pageCount = dataCount + 3
            val pager = rememberPagerState(initialPage = 1, pageCount = { pageCount })
            var prevFoil by remember { mutableStateOf(s.isFoiling) }
            var showRunEnd by remember { mutableStateOf(false) }   // true = Lauf-Ende, false = Pause
            // Auto-Wechsel NUR auf der Flanke: Lauf beendet -> Übersicht (+kurze Vibration): erst
            // kurz die Lauf-Zusammenfassung, nach 8 s die Pausen-Ansicht (bleibt bis zum nächsten
            // Lauf stehen — KEIN Rücksprung zur Datenansicht). Lauf gestartet -> zurück zu Daten.
            LaunchedEffect(s.isFoiling) {
                if (s.isFoiling == prevFoil) return@LaunchedEffect
                val wasFoiling = prevFoil
                prevFoil = s.isFoiling
                if (!s.isFoiling && wasFoiling) {
                    pager.animateScrollToPage(summaryPage)
                    vibrate(ctx, 200)
                    showRunEnd = true
                    kotlinx.coroutines.delay(8_000)
                    if (!Recorder.state.value.isFoiling) showRunEnd = false
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
                            page in 1..dataCount -> {
                                val fields = views[page - 1].filter { it != 0 }.ifEmpty { listOf(1) }
                                fields.forEach { fid -> FieldView(fid, s, colorBy, fields.size) }
                            }
                            page == summaryPage -> {  // Übersicht: kurz Lauf-Ende, dann Pause
                                val v = if (showRunEnd) offFoil else pauseView
                                val fields = v.filter { it != 0 }.ifEmpty { listOf(12) }
                                fields.forEach { fid -> FieldView(fid, s, colorBy, fields.size) }
                            }
                            else -> {  // Stop-Seiten (vorne & hinten): 3 s halten zum Stoppen
                                HoldStopButton()
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
        } else if (showSaved) {
            SavedScreen(s) { showSaved = false }
        } else if (showFoilPicker) {
            // Wear-Konvention: Wischen von links nach rechts schließt den Screen (statt bis
            // ganz unten zum „Zurück"-Chip zu scrollen). SwipeToDismissBox liefert die Geste.
            val dismiss = rememberSwipeToDismissBoxState()
            LaunchedEffect(dismiss.currentValue) {
                if (dismiss.currentValue == SwipeToDismissValue.Dismissed) {
                    showFoilPicker = false
                    dismiss.snapTo(SwipeToDismissValue.Default)
                }
            }
            SwipeToDismissBox(state = dismiss) { isBackground ->
                if (isBackground) {
                    Box(Modifier.fillMaxSize().background(Color.Black))
                } else {
                    FoilPicker(
                        foils = foils,
                        alarmOn = alarm.enabled,
                        source = alarmSource,
                        autoStart = autoStart,
                        manualLow = alarm.low,
                        manualHigh = alarm.high,
                        selectedFoilId = sessionFoilId,
                        onToggleAlarm = { alarm = alarm.copy(enabled = !alarm.enabled) },
                        onToggleSource = { alarmSource = if (alarmSource == "foil") "manual" else "foil" },
                        onToggleAutoStart = { autoStart = !autoStart },
                        onManualLow = { v -> alarm = alarm.copy(low = v) },
                        onManualHigh = { v -> alarm = alarm.copy(high = v) },
                        onPick = { f -> sessionFoilId = f.id; foilLabel = f.label; showFoilPicker = false },
                        onNone = { sessionFoilId = null; foilLabel = "—"; showFoilPicker = false },
                        onBack = { showFoilPicker = false },
                    )
                }
            }
        } else if (s.uploading) {
            // Nach dem Stop direkt online -> drain läuft -> hier prominent der Upload-Fortschritt
            // (kehrt automatisch zum Idle-Screen zurück, sobald fertig).
            UploadScreen(s)
        } else {
            // Auto-Start: 10 s Vorlauf ab Betreten des Start-Screens, erst dann scharf. Dieser
            // else-Zweig wird bei jedem Betreten des Start-Screens neu gemountet (auch nach
            // Session-Ende) -> das remember-State setzt sich zurück, der Countdown startet neu.
            var autoCountdown by remember { mutableStateOf(10) }
            var autoArmed by remember { mutableStateOf(false) }
            if (autoStart && !s.starting) {
                LaunchedEffect(Unit) {
                    autoCountdown = 10; autoArmed = false
                    while (autoCountdown > 0) { delay(1000); autoCountdown-- }
                    autoArmed = true
                }
            }
            // Erst nach dem Countdown GPS beobachten; bei ≥10 km/h für 4 s automatisch starten.
            // Nur solange der Idle-Screen aktiv ist (Foreground) — beim Start räumt onDispose auf.
            if (autoStart && !s.starting && autoArmed) {
                DisposableEffect(Unit) {
                    val fused = LocationServices.getFusedLocationProviderClient(ctx)
                    var streak = 0
                    val cb = object : LocationCallback() {
                        override fun onLocationResult(r: LocationResult) {
                            val sp = r.lastLocation?.let { if (it.hasSpeed()) it.speed else 0f } ?: 0f
                            if (sp * 3.6f >= 10f) { streak++; if (streak >= 4) RecorderService.start(ctx.applicationContext) }
                            else streak = 0
                        }
                    }
                    val req = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 1000).build()
                    try { fused.requestLocationUpdates(req, cb, Looper.getMainLooper()) } catch (_: SecurityException) {}
                    onDispose { fused.removeLocationUpdates(cb) }
                }
            }
            // Scrollbar + Rand: bei großer System-Schrift darf unten nichts abgeschnitten werden
            // (Wear-Schriftgrößen-Regel). Scaffold+PositionIndicator zeigt die geforderte Scroll-
            // Anzeige; bei normaler Schrift passt alles ohne Scrollen.
            val startScroll = rememberScrollState()
            Scaffold(positionIndicator = { PositionIndicator(scrollState = startScroll) }) {
            Column(Modifier.fillMaxSize().verticalScroll(startScroll)
                    .padding(horizontal = 12.dp, vertical = 22.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally) {
                // Kopf (Titel + Version + Auto-Start-Zeile) = ein Tap-Bereich -> Einstellungen (wie iOS).
                Column(
                    Modifier.clickable { showFoilPicker = true },
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text("Pumpfoil", style = MaterialTheme.typography.title3)
                    Text("v" + appVersion(ctx), style = MaterialTheme.typography.caption2, color = Color(0xFF94A3B8))
                    // Vorlauf: grau + Countdown, damit man Zeit hat, in die Einstellungen zu wechseln.
                    // Erst wenn scharf -> cyan „Auto-Start aktiv".
                    if (autoStart && !s.starting) {
                        if (autoArmed) Text(I18n.t("rec.autoStart"),
                            style = MaterialTheme.typography.caption2, color = Color(0xFF22D3EE))
                        else Text("${I18n.t("rec.autoStartIn")} ${autoCountdown}s",
                            style = MaterialTheme.typography.caption2, color = Color(0xFF94A3B8))
                    }
                }
                Spacer(Modifier.height(4.dp))   // wenig Luft über dem Start-Button
                if (s.starting) {
                    // Startphase (GPS/Session): kein Start-Button, nur Spinner + Status.
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                    Spacer(Modifier.height(6.dp))
                    Text(if (s.status.isNotEmpty()) s.status else I18n.t("rec.starting"),
                        style = MaterialTheme.typography.caption2,
                        color = Color(0xFF94A3B8), textAlign = TextAlign.Center)
                } else {
                // Start-Button OBEN, prominent (grün wie iOS, breit). Nimmt direkt mit der
                // aktuellen Auswahl auf — KEINE Foil-Abfrage erzwingen.
                Button(
                    onClick = { skipSync(); RecorderService.start(applicationContext) },
                    colors = ButtonDefaults.buttonColors(
                        backgroundColor = Color(0xFF34C759), contentColor = Color.White),
                    modifier = Modifier.fillMaxWidth(0.72f).height(42.dp),
                ) { Text(I18n.t("rec.start")) }
                // Foil DARUNTER: sitzt so mittig auf der breitesten Stelle der runden Uhr
                // (Platz für lange Namen). Tap -> Einstellungen (wie „Foil wählen").
                if (foilLabel.isNotEmpty()) {
                    Spacer(Modifier.height(8.dp))   // etwas Luft nach dem Start-Button
                    Row(Modifier.clickable { showFoilPicker = true },
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("${I18n.t("foil.prefix")}$foilLabel", style = MaterialTheme.typography.caption2, color = Color(0xFF22D3EE))
                        if (alarm.enabled) Text("🔔", style = MaterialTheme.typography.caption2)
                    }
                }
                // Sekundär-Aktionen (per vertikalem Scrollen erreichbar): Foil ändern + manuell syncen.
                // Sync-Chip nur, wenn es auch etwas hochzuladen gibt (gepairt + pending > 0).
                val canSync = Api.deviceToken != null && s.pendingCount > 0
                if (foils.isNotEmpty() || canSync) {
                    Spacer(Modifier.height(3.dp))   // wenig Luft über „Foil wählen"
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        if (foils.isNotEmpty()) CompactChip(
                            onClick = { showFoilPicker = true },
                            label = { Text(I18n.t("rec.chooseFoil"), style = MaterialTheme.typography.caption2) })
                        if (canSync) CompactChip(
                            onClick = { Recorder.drain(ctx) },
                            label = { Text(I18n.t("rec.syncNow"), style = MaterialTheme.typography.caption2) })
                    }
                }
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
                    } else if (s.uploadError == "auth") {
                        // Token ungültig/abgelaufen -> neu pairen (Aufnahmen bleiben lokal).
                        Text(I18n.t("rec.authErr"),
                            style = MaterialTheme.typography.caption2,
                            color = Color(0xFFF59E0B), textAlign = TextAlign.Center)
                        Spacer(Modifier.height(4.dp))
                        CompactChip(onClick = onWantPair,
                            label = { Text(I18n.t("rec.repair"), style = MaterialTheme.typography.caption2) })
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
                // Verbunden: jederzeit neu verbinden / Konto wechseln (überschreibt das Pairing
                // erst bei erfolgreichem Neu-Pairing). Bei "auth" zeigt der Block oben schon „Neu verbinden".
                if (Api.deviceToken != null && s.uploadError != "auth") {
                    // Kein Spacer + negativer Offset: CompactChips reservieren 48dp Tap-Fläche,
                    // wodurch trotz 0-Abstand eine sichtbare Lücke bleibt. Offset holt „Konto
                    // wechseln" näher an „Foil wählen" heran.
                    CompactChip(onClick = onWantPair,
                        modifier = Modifier.offset(y = (-8).dp),
                        label = { Text(I18n.t("rec.switch"), style = MaterialTheme.typography.caption2) })
                }
                }
            }
            }
        }
    }

    @Composable
    private fun UploadScreen(s: Recorder.State) {
        Column(
            Modifier.fillMaxSize().padding(12.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            CircularProgressIndicator(modifier = Modifier.size(44.dp), strokeWidth = 3.dp)
            Spacer(Modifier.height(10.dp))
            Text(I18n.t("rec.uploading"), style = MaterialTheme.typography.title3)
            if (s.uploadTotal > 0) {
                Spacer(Modifier.height(4.dp))
                Text("${s.uploadSent}/${s.uploadTotal}",
                    style = MaterialTheme.typography.caption1, color = Color(0xFF94A3B8))
            }
        }
    }

    // Post-Stop-Screen wie Garmin: erst „lädt hoch…", danach „Upload fertig" (gepairt +
    // online + nichts offen) ODER „Gespeichert" (offline/ungepairt). Explizites „Fertig" bzw.
    // Wischen nach rechts kehrt zum Start-Screen zurück — so tippt man nicht versehentlich Start.
    @Composable
    private fun SavedScreen(s: Recorder.State, onDone: () -> Unit) {
        val dismiss = rememberSwipeToDismissBoxState()
        LaunchedEffect(dismiss.currentValue) {
            if (dismiss.currentValue == SwipeToDismissValue.Dismissed) {
                onDone(); dismiss.snapTo(SwipeToDismissValue.Default)
            }
        }
        SwipeToDismissBox(state = dismiss) { isBackground ->
            if (isBackground) {
                Box(Modifier.fillMaxSize().background(Color.Black))
            } else {
                val savedScroll = rememberScrollState()
                Scaffold(positionIndicator = { PositionIndicator(scrollState = savedScroll) }) {
                Column(
                    Modifier.fillMaxSize().verticalScroll(savedScroll)
                        .padding(horizontal = 16.dp, vertical = 24.dp),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    if (s.uploading) {
                        CircularProgressIndicator(modifier = Modifier.size(36.dp), strokeWidth = 3.dp)
                        Spacer(Modifier.height(10.dp))
                        Text(I18n.t("saved.uploading"), style = MaterialTheme.typography.title3)
                        if (s.uploadTotal > 0) {
                            Spacer(Modifier.height(4.dp))
                            Text("${s.uploadSent}/${s.uploadTotal}",
                                style = MaterialTheme.typography.caption1, color = Color(0xFF94A3B8))
                        }
                    } else {
                        val uploaded = Api.deviceToken != null && s.pendingCount == 0 && s.uploadError.isEmpty()
                        if (uploaded) {
                            Text("✓", style = MaterialTheme.typography.display2, color = Color(0xFF34C759))
                            Spacer(Modifier.height(2.dp))
                            Text(I18n.t("saved.uploadDone"), style = MaterialTheme.typography.title3)
                        } else {
                            Text(I18n.t("saved.title"), style = MaterialTheme.typography.title3)
                            Spacer(Modifier.height(4.dp))
                            Text(I18n.t("saved.upload"), style = MaterialTheme.typography.caption2,
                                color = Color(0xFF94A3B8), textAlign = TextAlign.Center)
                        }
                        Spacer(Modifier.height(12.dp))
                        CompactChip(onClick = onDone,
                            label = { Text(I18n.t("common.done")) })
                    }
                }
                }
            }
        }
    }

    @Composable
    private fun FieldView(fid: Int, s: Recorder.State, colorBy: Boolean, count: Int = 3) {
        val (value, label) = fieldValue(fid, s)
        val color = if (colorBy) fieldColor(fid, s) else Color.Unspecified
        // Weniger Felder pro Seite -> größere Schrift (1 Feld = riesig, z. B. Speed beim Pumpen).
        val valueStyle = when (count) {
            1 -> MaterialTheme.typography.display1.copy(fontSize = 60.sp, lineHeight = 62.sp)   // ein Feld: maximal groß
            2 -> MaterialTheme.typography.display2
            else -> MaterialTheme.typography.display3
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 2.dp)) {
            Text(value, style = valueStyle, color = color)
            Text(label, style = if (count == 1) MaterialTheme.typography.caption1 else MaterialTheme.typography.caption2,
                color = Color(0xFF94A3B8))
        }
    }

    // 3 s halten zum Stoppen (wie Garmin Stop-Halten-Ring) — verhindert versehentliches Stoppen.
    @OptIn(ExperimentalFoundationApi::class)
    @Composable
    private fun HoldStopButton() {
        var progress by remember { mutableStateOf(0f) }
        Box(contentAlignment = Alignment.Center) {
            CircularProgressIndicator(
                progress = progress.coerceAtLeast(0.001f),   // immer sichtbarer Ring (zeigt „halten")
                modifier = Modifier.size(96.dp), strokeWidth = 4.dp,
                indicatorColor = Color(0xFFF87171))
            // Plain Box (KEIN Material-Button) -> dessen clickable würde sonst die Press-
            // Geste schlucken und onPress nie feuern.
            Box(
                modifier = Modifier
                    .size(76.dp)
                    .background(Color(0xFFB91C1C), CircleShape)
                    .pointerInput(Unit) {
                        detectTapGestures(onPress = {
                            progress = 0.0001f
                            val held = coroutineScope {
                                val timer = launch {
                                    val start = System.currentTimeMillis()
                                    while (isActive) {
                                        progress = ((System.currentTimeMillis() - start) / 3000f).coerceIn(0f, 1f)
                                        kotlinx.coroutines.delay(30)
                                    }
                                }
                                val released = withTimeoutOrNull(3000) { tryAwaitRelease() }
                                timer.cancel()
                                released == null   // null => 3 s ohne Loslassen => stoppen
                            }
                            progress = 0f
                            if (held) RecorderService.stop(applicationContext)
                        })
                    },
                contentAlignment = Alignment.Center,
            ) {
                Text(I18n.t("rec.stopHold"), textAlign = TextAlign.Center,
                    style = MaterialTheme.typography.caption2, color = Color.White)
            }
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

// Feld-IDs identisch mit web/src/lib/fields.ts + Garmin Config.mc (alle 21 Felder).
private fun fieldValue(id: Int, s: Recorder.State): Pair<String, String> = when (id) {
    1 -> String.format("%.1f", s.speed3sKmh) to I18n.t("f.kmh3s")
    5 -> String.format("%.1f", s.speedKmh) to I18n.t("f.kmh")
    6 -> String.format("%.1f", s.avgSpeedKmh) to I18n.t("f.kmhAvg")
    7 -> String.format("%.1f", s.maxSpeedKmh) to I18n.t("f.kmhMax")
    2 -> (if (s.hr > 0) s.hr.toString() else "–") to I18n.t("f.bpm")
    8 -> (if (s.avgHr > 0) s.avgHr.toString() else "–") to I18n.t("f.bpmAvg")
    9 -> (if (s.maxHr > 0) s.maxHr.toString() else "–") to I18n.t("f.bpmMax")
    3 -> msStr(s.elapsedSec * 1000) to I18n.t("f.time")
    4 -> if (s.distanceM < 1000) String.format("%.0f", s.distanceM) to "m"
         else String.format("%.2f", s.distanceM / 1000.0) to "km"
    10 -> "–" to I18n.t("f.alt")        // ohne Baro/Höhen-Erfassung (noch) nicht verfügbar
    11 -> "–" to I18n.t("f.temp")       // kein Temperatursensor
    12 -> clockStr() to I18n.t("f.clock")
    13 -> "–" to I18n.t("f.ascent")
    14 -> msStr(s.runDurationMs) to I18n.t("f.runTime")
    15 -> distLabeled(s.runDistanceM) to I18n.t("f.runDist")
    16 -> msStr(s.lastRunDurationMs) to I18n.t("f.lastRunTime")
    17 -> distLabeled(s.lastRunDistanceM) to I18n.t("f.lastRunDist")
    18 -> String.format("%.1f", s.lastRunAvgSpeedKmh) to I18n.t("f.lastRunAvg")
    19 -> String.format("%.1f", s.lastRunMaxSpeedKmh) to I18n.t("f.lastRunMax")
    20 -> s.runCount.toString() to I18n.t("f.runs")
    else -> "—" to ""
}

private fun msStr(ms: Long): String { val sec = ms / 1000; return String.format("%d:%02d", sec / 60, sec % 60) }
private fun distLabeled(m: Double): String =
    if (m < 1000) String.format("%.0f m", m) else String.format("%.2f km", m / 1000.0)
private fun clockStr(): String =
    java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault()).format(java.util.Date())

private fun fieldColor(id: Int, s: Recorder.State): Color = when (id) {
    1, 5, 6, 7 -> speedColor(when (id) { 1 -> s.speed3sKmh; 6 -> s.avgSpeedKmh; 7 -> s.maxSpeedKmh; else -> s.speedKmh })
    18 -> speedColor(s.lastRunAvgSpeedKmh)
    19 -> speedColor(s.lastRunMaxSpeedKmh)
    2, 8, 9 -> hrColor(when (id) { 8 -> s.avgHr; 9 -> s.maxHr; else -> s.hr })
    else -> Color.Unspecified
}
// Puls-Farbe nach Garmin-Buckets (120/150/170): grün → gelb → orange → rot.
private fun hrColor(bpm: Int): Color = when {
    bpm <= 0 -> Color.Unspecified
    bpm < 120 -> Color(0xFF4ADE80)
    bpm < 150 -> Color(0xFFFACC15)
    bpm < 170 -> Color(0xFFFB923C)
    else -> Color(0xFFF87171)
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

// „Foil & Alarm" — drei unabhängige Achsen: Alarm An/Aus, Schwellen-Quelle (Auto aus Foil /
// Manuell mit Min/Max direkt auf der Uhr), Foil-Auswahl (Metadaten). Muster/Auslösen: in den Apps.
@Composable
fun FoilPicker(
    foils: List<FoilOpt>,
    alarmOn: Boolean,
    source: String,
    autoStart: Boolean,
    manualLow: Int,
    manualHigh: Int,
    selectedFoilId: Int?,
    onToggleAlarm: () -> Unit,
    onToggleSource: () -> Unit,
    onToggleAutoStart: () -> Unit,
    onManualLow: (Int) -> Unit,
    onManualHigh: (Int) -> Unit,
    onPick: (FoilOpt) -> Unit,
    onNone: () -> Unit,
    onBack: () -> Unit,
) {
    // Kleiner grauer Hinweistext unter einem Chip (Ersatz für die Section-Footer der Apple-Uhr).
    @Composable fun Help(text: String) = Text(
        text,
        style = MaterialTheme.typography.caption2,
        color = Color(0xFF94A3B8),
        textAlign = TextAlign.Center,
        modifier = Modifier.padding(horizontal = 6.dp, vertical = 0.dp),
    )
    val foilScroll = rememberScrollState()
    Scaffold(positionIndicator = { PositionIndicator(scrollState = foilScroll) }) {
    Column(
        Modifier.fillMaxSize().verticalScroll(foilScroll).padding(horizontal = 8.dp, vertical = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(I18n.t("foil.choose"), style = MaterialTheme.typography.title3)
        // Auto-Start An/Aus (auf der Uhr umschaltbar) + Hinweis
        Chip(
            onClick = onToggleAutoStart,
            label = { Text(I18n.t("rec.autoStartToggle")) },
            secondaryLabel = { Text(if (autoStart) I18n.t("common.on") else I18n.t("common.off")) },
            modifier = Modifier.fillMaxWidth(),
        )
        Help(I18n.t("rec.autoStartHelp"))
        // Alarm An/Aus + Hinweis
        Chip(
            onClick = onToggleAlarm,
            label = { Text(I18n.t("foil.alarm")) },
            secondaryLabel = { Text(if (alarmOn) I18n.t("common.on") else I18n.t("common.off")) },
            modifier = Modifier.fillMaxWidth(),
        )
        Help(I18n.t("foil.alarmHelp"))
        // Schwellen-Quelle
        Chip(
            onClick = onToggleSource,
            label = { Text(I18n.t("foil.thresholds")) },
            secondaryLabel = { Text(if (source == "foil") I18n.t("foil.auto") else I18n.t("foil.manual")) },
            modifier = Modifier.fillMaxWidth(),
        )
        // Manuell: Min/Max direkt auf der Uhr
        if (source == "manual") {
            StepperRow(I18n.t("foil.min"), manualLow, onManualLow)
            StepperRow(I18n.t("foil.max"), manualHigh, onManualHigh)
        }
        // Foil-Auswahl (Metadaten + Auto-Schwellen)
        Help(I18n.t("foil.chooseHelp"))
        foils.forEach { f ->
            Chip(
                onClick = { onPick(f) },
                label = { Text((if (f.id == selectedFoilId) "✓ " else "") + f.label, maxLines = 1) },
                secondaryLabel = { Text("${f.min}–${f.max} km/h") },
                modifier = Modifier.fillMaxWidth(),
            )
        }
        CompactChip(onClick = onNone,
            label = { Text((if (selectedFoilId == null) "✓ " else "") + I18n.t("foil.noFoil")) })
        CompactChip(onClick = onBack, label = { Text(I18n.t("common.back")) })
    }
    }
}

// Min/Max-Stepper (−/Wert/+), 0..80 km/h.
@Composable
private fun StepperRow(label: String, value: Int, onChange: (Int) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label, style = MaterialTheme.typography.caption2)
        CompactChip(onClick = { onChange((value - 1).coerceAtLeast(0)) }, label = { Text("−") })
        Text("$value", style = MaterialTheme.typography.title3)
        CompactChip(onClick = { onChange((value + 1).coerceAtMost(80)) }, label = { Text("+") })
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
