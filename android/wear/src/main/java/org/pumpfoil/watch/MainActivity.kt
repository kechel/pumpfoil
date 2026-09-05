package org.pumpfoil.watch

import android.Manifest
import android.content.Context
import android.content.Intent
import android.location.LocationManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.wear.ambient.AmbientLifecycleObserver
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
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
import androidx.wear.compose.foundation.CurvedLayout
import androidx.wear.compose.foundation.curvedComposable
import androidx.wear.compose.foundation.CurvedModifier
import androidx.wear.compose.foundation.curvedRow
import androidx.wear.compose.foundation.padding
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.isSpecified
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.*
import androidx.compose.ui.tooling.preview.Preview
import androidx.wear.tooling.preview.devices.WearDevices
import android.os.Looper
import androidx.compose.ui.Alignment
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

class MainActivity : ComponentActivity(), AmbientLifecycleObserver.AmbientLifecycleCallback {
    private val perms = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()) {}

    /**
     * Always-on: der Beobachter wird in `onCreate` angemeldet — so verlangt es die AndroidX-Doku,
     * und offenbar nur so wirkt er.
     *
     * **Warum das hier steht:** bis 04.09. haengten wir ihn erst WAEHREND der Aufnahme aus einem
     * Compose-`DisposableEffect` ein, damit die App im Leerlauf nicht dauerhaft gedimmt stehen
     * bleibt. Ein Wear-Entwickler hat gemeldet, dass Always-on bei ihm gar nicht griff und die
     * App nach rund zwei Minuten zuging — mitten in der Aufnahme, wo man die Werte gerade sehen
     * will. Jetzt: immer angemeldet, und im Leerlauf treten wir in `onEnterAmbient` freiwillig
     * zurueck, damit das Watchface wieder erscheint. Das ist derselbe Effekt wie vorher, nur an
     * der Stelle entschieden, an der er auch funktioniert.
     */
    private val ambient by lazy { AmbientLifecycleObserver(this, this) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        lifecycle.addObserver(ambient)
        Api.load(applicationContext)
        I18n.load(applicationContext)   // gecachte Profil-Sprache (offline-tauglich)
        requestPerms()
        setContent { AppUi(
            onEnableWaterLock = { wassersperre() }
        ) }
    }

    override fun onEnterAmbient(details: AmbientLifecycleObserver.AmbientDetails) {
        if (!Recorder.state.value.recording) {
            moveTaskToBack(true)        // im Leerlauf hat das Watchface Vorrang
            return
        }
        AmbientState.aktiv.value = true
        AmbientState.einbrennschutz.value = details.burnInProtectionRequired
    }

    /** Systemtakt (~1/min): nur dann darf im Ambient neu gezeichnet werden. */
    override fun onUpdateAmbient() { AmbientState.takt.value += 1 }

    override fun onExitAmbient() { AmbientState.aktiv.value = false }

    private fun requestPerms() {
        val p = mutableListOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            pulsRecht(),
        )
        if (Build.VERSION.SDK_INT >= 33) p.add(Manifest.permission.POST_NOTIFICATIONS)
        // Merken, dass der Standort schon einmal abgefragt wurde: sagt shouldShowRequestPermission-
        // Rationale spaeter „nein", ist es ein endgueltiges Ablehnen -> direkt in die Einstellungen
        // fuehren statt einen Dialog zu starten, der sofort wieder mit „denied" zurueckkommt.
        getSharedPreferences("pumpfoil", Context.MODE_PRIVATE)
            .edit().putBoolean("locAsked", true).apply()
        perms.launch(p.toTypedArray())
    }

    /**
     * Wassersperre („Wet Mode"): sperrt die Bedienung, bis man die Krone drueckt.
     *
     * Beim Pumpen schlaegt dauernd Wasser aufs Display und loest Aktionen aus — genau das hat ein
     * Nutzer am 04.09. gemeldet, samt Weg dorthin. Der Broadcast ist von Google nicht
     * dokumentiert, auf Wear OS aber der uebliche; `relaunch_component_name` sorgt dafuer, dass
     * nach dem Entsperren WIEDER UNSERE Aufnahme vorn steht und nicht das Watchface.
     */
    internal fun wassersperre() {
        val permission = "com.google.android.clockwork.settings.WATCH_TOUCH"

        try {
            if(checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) {
                perms.launch(mutableListOf(permission).toTypedArray())
            }

            sendBroadcast(Intent("com.google.android.wearable.action.ENABLE_WET_MODE")
                .putExtra("relaunch_component_name", componentName.flattenToString()))
        } catch (t: Throwable) {
            android.util.Log.w("Pumpfoil", "Wassersperre nicht verfuegbar", t)
        }
    }
}

// Ortung systemweit aus? Dann ist die Berechtigung da, es kommen aber trotzdem nie Fixes.
// Im Zweifel (Exception) true zurueckgeben — lieber nicht warnen als falsch warnen.
internal fun locationEnabled(ctx: Context): Boolean =
    try { (ctx.getSystemService(Context.LOCATION_SERVICE) as LocationManager).isLocationEnabled }
    catch (_: Exception) { true }

@Composable
internal fun AppUi(
    onEnableWaterLock: () -> Unit
) {
    // Pairing ist optional: ohne Token kann man trotzdem aufnehmen (lokal) und
    // später verbinden -> die Sessions werden dann automatisch nachgesynct.
    var paired by remember { mutableStateOf(Api.deviceToken != null) }
    var skipped by remember { mutableStateOf(false) }
    var forcePair by remember { mutableStateOf(false) }   // „Neu verbinden" trotz (ungültigem) Token
    MaterialTheme {
        if (forcePair || (!paired && !skipped))
            PairScreen(onPaired = { paired = true; forcePair = false; skipped = false },
                       onSkip = { skipped = true; forcePair = false })
        else RecordScreen(onWantPair = { forcePair = true }, onEnableWaterLock)
    }
}

// Reverse-Pairing: die Uhr erzeugt einen Code, der Nutzer trägt ihn auf
// pumpfoil.org (Account) ein. Tippen auf der Uhr wäre umständlich -> stattdessen
// pollt die Uhr, bis der Code eingelöst ist, und holt sich dann das Token.
@Composable
internal fun PairScreen(onPaired: () -> Unit, onSkip: () -> Unit) {
    val ctx = LocalContext.current
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
            if (token != null) { Api.saveToken(ctx.applicationContext, token); onPaired(); break }
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
internal fun RecordScreen(onWantPair: () -> Unit = {}, onEnableWaterLock: () -> Unit) {
    val s by Recorder.state.collectAsState()
    RecordScreenContent(s, onWantPair, onEnableWaterLock)
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun RecordScreenContent(s: Recorder.State, onWantPair: () -> Unit = {}, onEnableWaterLock: () -> Unit) {
    val ctx = LocalContext.current
    val isPreview = androidx.compose.ui.platform.LocalInspectionMode.current
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
    // Nach VERWERFEN gehoert kein „Gespeichert"-Screen (und schon gar kein Hinweis ueber die
    // gespeicherte Aufnahme) — beides kommt sonst, weil Verwerfen genauso recording=false setzt.
    var verworfen by remember { mutableStateOf(false) }
    var wasRecording by remember { mutableStateOf(false) }
    var showFoilPicker by remember { mutableStateOf(false) }
    var foilLabel by remember { mutableStateOf("") }        // gewählte Foil (Anzeige "Foil: <name>")
    var sessionFoilId by remember { mutableStateOf<Int?>(null) }   // Foil = Metadaten (+ Auto-Schwellen)
    var alarmSource by remember { mutableStateOf("foil") }         // "foil" | "manual" (Schwellen-Quelle)
    var offFoil by remember { mutableStateOf(listOf(12, 17, 16)) }   // Lauf-Ende-Screen (kurz nach Lauf-Ende)
    // Pausen-Screen (Dümpeln zwischen den Läufen): Default Uhrzeit · Läufe · Puls, per
    // Account-Config überschreibbar (pauseView). Fehlt der Key -> Default bleibt.
    var pauseView by remember { mutableStateOf(listOf(12, 20, 2)) }
    var autoStart by remember { mutableStateOf(false) }              // GPS-Auto-Start (Config)
    // Profil-Einstellung: "hold" (Default) = 2 s halten, "press" = ein Druck genuegt.
    // Gilt fuer alle Uhren des Nutzers (kein Geraete-Override) — s. /api/devices/config.
    var stopMode by remember { mutableStateOf("hold") }
    // Eigene Layouts (F2/F3). `pages`/`offFoilPages` sind gemischte Saetze: ein Eintrag ist
    // entweder eine 3-Feld-Seite oder eine Layout-ID. `layoutsOn` ist nur die VOREINSTELLUNG
    // des Schalters beim App-Start — danach entscheidet der Nutzer am Handgelenk (wie Garmin).
    var onFoilPages by remember { mutableStateOf<List<WatchPageRef>>(emptyList()) }
    var offFoilPages by remember { mutableStateOf<List<WatchPageRef>>(emptyList()) }
    var layoutsPref by remember { mutableStateOf(LocalStore.layoutsPref(ctx)) }   // null = automatisch
    var layoutsServerDefault by remember { mutableStateOf(false) }
    // Neueste im Store freigegebene Version (Server: appmeta._APP_META["wear"]). Leer = kein
    // Hinweis. Bis 2026-07-30 fragte die Wear-App das Feld gar nicht ab, obwohl der Server es
    // mitschickt — der Nutzer erfuhr also nie von einem Update.
    var storeVersion by remember { mutableStateOf("") }

    fun applyConfig(c: JSONObject) {
        if (c.has("language")) I18n.set(ctx, c.optString("language", "de"))
        storeVersion = c.optString("latestVersion", "")
        val vs = c.optJSONArray("views")
        if (vs != null && vs.length() > 0) {
            views = (0 until vs.length()).map { i ->
                val row = vs.getJSONArray(i)
                (0 until row.length()).map { row.getInt(it) }
            }
        }
        // Layout-Paket. Die Seiten tragen ihre Layout-Definition INLINE (Tag-Byte, s. WatchLayout.kt);
        // fehlt das Paket, bleiben die klassischen 3-Feld-Seiten unveraendert stehen.
        layoutsServerDefault = c.optBoolean("layoutsOn", false)
        onFoilPages = parsePageRefs(c.optJSONArray("pages")) ?: pagesFromViews(views)
        offFoilPages = parsePageRefs(c.optJSONArray("offFoilPages"))
            ?: listOf(WatchPageRef.Classic(c.optJSONArray("offFoilView").let { a ->
                if (a == null) offFoil else (0 until a.length()).map { a.getInt(it) }
            }))
        colorBy = c.optBoolean("colorByValue", false)
        // Wert-Skalen der Layout-Grafiken. Puls-Zonen kommen aus dem Profil (Wear OS hat
        // keine Zonen-API) — fehlt der Key (alter Server), bleibt der bisherige Wert.
        c.optJSONArray("hrZones")?.let { z ->
            if (z.length() == 6) LayoutScales.hrZones = (0 until 6).map { z.getInt(it) }
        }
        c.optJSONArray("speedZones")?.let { z ->
            if (z.length() == 6) LayoutScales.speedZones = (0 until 6).map { z.getInt(it) }
        }
        autoStart = c.optBoolean("autoStart", false)
        stopMode = c.optString("stopMode", "hold")
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
        val pva = c.optJSONArray("pauseView")
        if (pva != null && pva.length() > 0) {
            pauseView = (0 until pva.length()).map { pva.getInt(it) }
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
                    val c = Api.deviceConfig(appVersion(ctx), wantLayouts = layoutsPref != false)
                    applyConfig(c)
                    Api.cacheConfig(ctx, c)
                } catch (e: ApiException) {
                    // 401 = Token serverseitig ungueltig. Auch HIER ein frisches vom Phone
                    // anfordern, nicht nur bei fehlgeschlagenem Upload: seit die Uhr fremde
                    // Pushes nicht mehr blind uebernimmt (WearPairingService), waere ein
                    // ungueltiges Token sonst erst beim naechsten Upload-Versuch geheilt
                    // worden — wer nie aufnimmt, haette dauerhaft eine stille Fehlanzeige.
                    if (e.status == 401) WearLink.requestToken(ctx)
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
        if (wasRecording && !s.recording) { showSaved = !verworfen; verworfen = false }
        wasRecording = s.recording
    }

    // Puls-Berechtigung (BODY_SENSORS): wurde der Erst-Dialog beim allerersten App-Start
    // weggewischt, blieb der Puls bisher STILL leer (Xiaomi-Feldbefund 03.08., Session mit
    // 9447 GPS-Punkten und 0 Puls-Werten). Jetzt: Zustand beobachten, vor dem Start erneut
    // fragen, und solange sie fehlt einen sichtbaren Hinweis zeigen.
    var hrMissing by remember {
        mutableStateOf(ContextCompat.checkSelfPermission(ctx, pulsRecht())
                != PackageManager.PERMISSION_GRANTED)
    }
    // Standort-Berechtigung (ACCESS_FINE_LOCATION): OHNE sie zeichnet die Uhr keine Strecke
    // auf — requestLocationUpdates wirft dann nur eine SecurityException. Feldbefund 05.08.:
    // vier Sessions ueber Stunden, 1000+ Accel-Chunks, 0 GPS-Punkte; der Nutzer hielt seine
    // Uhr fuer zu alt und kaufte eine neue. Deshalb hier HARTE Voraussetzung statt Hinweis:
    // ohne Standort wird nicht gestartet. Wichtig ist FINE: erlaubt der Nutzer auf Android 12+
    // nur „ungefaehr" (COARSE), liefert Fused grobe Netz-Fixes ohne Geschwindigkeit — fuer
    // Pumpfoil unbrauchbar. Die FINE-Pruefung faengt genau diesen Fall mit.
    var locMissing by remember {
        mutableStateOf(ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED)
    }
    var startNachLocFrage by remember { mutableStateOf(false) }
    // Zweiter Fall: Berechtigung erteilt, aber Ortung systemweit aus -> es kommen nie Fixes.
    // Hier nur WARNEN (Start bleibt erlaubt): anders als die fehlende Berechtigung ist das
    // kein sicheres Scheitern, und wer trotzdem aufnehmen will, soll nicht ausgesperrt sein.
    var locOff by remember {
        mutableStateOf(if (isPreview) false else !locationEnabled(ctx))
    }
    // Beim Zurueckkommen (z. B. aus den System-Einstellungen, wo die Berechtigung erteilt
    // wurde) neu pruefen — sonst bliebe der Hinweis bis zum App-Neustart stehen.
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val obs = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME && !isPreview) {
                hrMissing = ContextCompat.checkSelfPermission(
                    ctx, pulsRecht()) != PackageManager.PERMISSION_GRANTED
                locMissing = ContextCompat.checkSelfPermission(
                    ctx, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED
                locOff = !locationEnabled(ctx)
            }
        }
        lifecycleOwner.lifecycle.addObserver(obs)
        onDispose { lifecycleOwner.lifecycle.removeObserver(obs) }
    }
    // Puls ist ein ZUSATZ, kein Startkriterium. Deshalb wartet die Aufnahme NICHT mehr auf
    // diesen Dialog (Jans Befund 02.09.: auf dem Wear-Emulator stirbt der Prozess, waehrend
    // der Berechtigungsdialog oben ist — und mit ihm der nur im Speicher gemerkte
    // Startwunsch; ein Druck auf Start tat dann gar nichts). Jetzt laeuft die Aufnahme schon,
    // und wird der Puls nachtraeglich erlaubt, haengt der Dienst ihn an.
    // WELCHE Puls-Berechtigung: bis Android 14 `BODY_SENSORS`, ab 15 `health.READ_HEART_RATE`
    // (BODY_SENSORS ist dort abgekuendigt und zaehlt auch nicht mehr als Voraussetzung fuer
    // den Vordergrund-Dienst vom Typ `health`, s. RecorderService.starteVordergrund).
    val hrPermLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()) { granted ->
        hrMissing = !granted
        if (granted) RecorderService.enableHeartRate(ctx.applicationContext)
    }
    // Standort: nur bei Erteilung starten. Beim endgueltigen „Nein" NICHT starten — ein
    // Mitschnitt ohne Position ist fuer die Auswertung wertlos; der Hinweis bleibt stehen.
    val locPermLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()) { granted ->
        locMissing = !granted
        if (startNachLocFrage) {
            startNachLocFrage = false
            if (granted) {
                // Standort da -> SOFORT aufnehmen. Fehlt der Puls, fragen wir danach: die
                // Aufnahme laeuft dann schon, der Dialog kann sie nicht mehr verhindern.
                RecorderService.start(ctx.applicationContext)
                if (hrMissing) hrPermLauncher.launch(pulsRecht())
            }
        }
    }
    // Nach zweimaligem Ablehnen zeigt Android keinen Dialog mehr (der Launcher kommt sofort
    // mit „denied" zurueck) -> dann in die System-Einstellungen der App fuehren.
    fun askLocation(startDanach: Boolean) {
        startNachLocFrage = startDanach
        val p = ctx.getSharedPreferences("pumpfoil", Context.MODE_PRIVATE)
        if ((ctx as? android.app.Activity)?.shouldShowRequestPermissionRationale(Manifest.permission.ACCESS_FINE_LOCATION) == true ||
            !p.getBoolean("locAsked", false)) {
            p.edit().putBoolean("locAsked", true).apply()
            locPermLauncher.launch(Manifest.permission.ACCESS_FINE_LOCATION)
        } else {
            startNachLocFrage = false
            try {
                ctx.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.fromParts("package", ctx.packageName, null)))
            } catch (_: Exception) {
                locPermLauncher.launch(Manifest.permission.ACCESS_FINE_LOCATION)
            }
        }
    }
    // Wisch nach rechts = BACK: waehrend der Aufnahme verschlucken. Auf nassem Schirm passiert
    // das schnell, und der Nutzer stand dann vor dem Watchface, waehrend die Aufnahme im
    // Foreground-Service weiterlief. Der Handy-Recorder macht das schon (RecordScreen.kt:108),
    // Garmin auch (RecordDelegate.onBack) — auf Wear fehlte es. Beenden geht ueber die
    // Stop-Seite des Pagers, nicht ueber die Zurueck-Geste.
    BackHandler(enabled = s.recording) { /* bewusst ignoriert */ }
    // Always-on: ohne Ambient-Unterstuetzung zeigt Wear OS mitten im Lauf das Watchface statt
    // unserer Zahlen. Garmin braucht das nicht (MIP/Systemverhalten), die Apple Watch bleibt in
    // der HKWorkoutSession vorn — Wear war die einzige Plattform, die herausfiel.
    //
    // Der Ambient-Beobachter haengt seit 04.09. an `MainActivity.onCreate` — dort verlangt
    // ihn die AndroidX-Doku, und nur dort wirkt er (Begruendung samt Nutzer-Meldung steht an
    // `MainActivity.ambient`). Hier bleibt nur die Anzeige-Entscheidung.
    if (s.recording && AmbientState.aktiv.value) {
        AmbientRecordingScreen(s)
    } else if (s.recording) {
        // Pager: Verwerfen(0) | Stop(1) | Datenansichten 2..dataCount+1 | Übersicht | Stop | Verwerfen.
        // Verwerfen-Seiten ganz außen (versehentlich schwer erreichbar), Stop je einwärts.
        // Seitenzahl aus dem gemischten Satz (Layouts + 3-Feld-Seiten), Rueckfall views.
        val dataCount = (if (onFoilPages.isNotEmpty()) onFoilPages.size else views.size).coerceAtLeast(1)
        val firstData = 2
        val lastData = dataCount + 1
        val summaryPage = dataCount + 2
        val stopBack = dataCount + 3
        val pageCount = dataCount + 5
        val pager = rememberPagerState(initialPage = firstData, pageCount = { pageCount })
        var prevFoil by remember { mutableStateOf(s.isFoiling) }
        // Die grosse GPS-Warnung laesst sich wegtippen; sie kommt wieder, sobald die Ortung
        // erneut einfriert.
        var staleWeggetippt by remember { mutableStateOf(false) }
        LaunchedEffect(s.gpsStale) {
            if (!s.gpsStale) { staleWeggetippt = false; return@LaunchedEffect }
            // Auf dem Wasser sieht man den Bildschirm nicht — also fuehlbar. Einmal deutlich,
            // danach alle zwei Minuten kurz, solange die Ortung eingefroren bleibt.
            vibratePattern(ctx, "long2")
            while (true) {
                kotlinx.coroutines.delay(120_000)
                if (!Recorder.state.value.gpsStale) break
                vibratePattern(ctx, "short2")
            }
        }
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
                pager.animateScrollToPage(lastData)
            }
        }
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.BottomCenter) {
            HorizontalPager(state = pager, modifier = Modifier.fillMaxSize()) { page ->
                // Eigene Layouts nur, wenn der Schalter an ist (null = Server-Vorgabe).
                val useLayouts = layoutsPref ?: layoutsServerDefault
                val pageLayout = if (!useLayouts) null else when {
                    page in firstData..lastData ->
                        (onFoilPages.getOrNull(page - firstData) as? WatchPageRef.Layout)?.def
                    page == summaryPage && showRunEnd ->
                        (offFoilPages.firstOrNull() as? WatchPageRef.Layout)?.def
                    else -> null
                }
                Column(
                    // Layout-Seiten zeichnen RANDLOS über das ganze Display — genau wie Garmin
                    // (dc.getWidth/getHeight). Die 8.dp gelten nur für die klassischen Feldseiten,
                    // wo Text sonst am Rand klebt. Mit Rand war die Zeichenfläche 420 statt 454 px
                    // breit (am Emulator nachgemessen): alles 7 % zu klein UND nach innen versetzt,
                    // obwohl die Promille-Koordinaten sich auf das ganze Display beziehen.
                    Modifier.fillMaxSize().then(if (pageLayout != null) Modifier else Modifier.padding(8.dp)),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    when {
                        page in firstData..lastData -> {
                            val ref = onFoilPages.getOrNull(page - firstData)
                            val def = pageLayout
                            if (def != null) {
                                LayoutPageView(
                                    page = def, pageIndex = page - firstData, pageCount = dataCount,
                                    recording = true, pausedText = I18n.t("rec.paused"),
                                    // Die manuelle Pause gibt es auf Wear noch nicht (nur
                                    // Garmin hat sie). Bis dahin ist der Hinweis IMMER falsch,
                                    // deshalb hart false — sonst stünde "Pausiert" auf jeder
                                    // durchgeblätterten Pausen-Seite mitten in der Aufnahme.
                                    paused = false,
                                    fieldValue = { fid -> fieldValue(fid, s).first },
                                    fieldLabel = { fid -> fieldValue(fid, s).second },
                                    fieldColor = { fid -> fieldColor(fid, s).takeIf { c -> c != Color.Unspecified } },
                                    fieldNumber = { fid -> fieldNumber(fid, s) },
                                    modifier = Modifier.fillMaxSize(),
                                )
                            } else {
                                val classic = (ref as? WatchPageRef.Classic)?.fields
                                    ?: views.getOrNull(page - firstData) ?: listOf(1)
                                val fields = classic.filter { it != 0 }.ifEmpty { listOf(1) }
                                fields.forEach { fid -> FieldView(fid, s, colorBy, fields.size) }
                            }
                        }
                        page == summaryPage -> {  // Übersicht: kurz Lauf-Ende, dann Pause
                            val ref = if (showRunEnd) offFoilPages.firstOrNull() else null
                            val def = pageLayout
                            if (def != null) {
                                LayoutPageView(
                                    page = def, pageIndex = 0, pageCount = 1,
                                    recording = true, pausedText = I18n.t("rec.paused"),
                                    // Die manuelle Pause gibt es auf Wear noch nicht (nur
                                    // Garmin hat sie). Bis dahin ist der Hinweis IMMER falsch,
                                    // deshalb hart false — sonst stünde "Pausiert" auf jeder
                                    // durchgeblätterten Pausen-Seite mitten in der Aufnahme.
                                    paused = false,
                                    fieldValue = { fid -> fieldValue(fid, s).first },
                                    fieldLabel = { fid -> fieldValue(fid, s).second },
                                    fieldColor = { fid -> fieldColor(fid, s).takeIf { c -> c != Color.Unspecified } },
                                    fieldNumber = { fid -> fieldNumber(fid, s) },
                                    modifier = Modifier.fillMaxSize(),
                                )
                            } else {
                                val v = when {
                                    showRunEnd -> (ref as? WatchPageRef.Classic)?.fields ?: offFoil
                                    else -> pauseView
                                }
                                val fields = v.filter { it != 0 }.ifEmpty { listOf(12) }
                                fields.forEach { fid -> FieldView(fid, s, colorBy, fields.size) }
                            }
                        }
                        page == 1 || page == stopBack -> {  // Stop-Seiten: 2 s halten -> stoppen (speichert + lädt hoch)
                            HoldButton(
                                if (stopMode == "press") I18n.t("rec.stop") else I18n.t("rec.stopHold"),
                                Color(0xFFB91C1C), Color(0xFFF87171), press = stopMode == "press",
                            ) {
                                RecorderService.stop(ctx.applicationContext)
                            }
                            if (s.status.isNotEmpty()) {
                                Spacer(Modifier.height(6.dp))
                                Text(s.status, style = MaterialTheme.typography.caption2, color = Color(0xFF94A3B8))
                            }
                        }
                        else -> {  // Verwerfen-Seiten (ganz außen): 2 s halten -> Aufnahme löschen (kein Upload)
                            // Verwerfen im press-Modus mit ZWEITEM Druck bestaetigen: das Halten
                            // war hier der einzige Schutz davor, eine Aufnahme mit einem
                            // Fehlgriff zu loeschen. Ein Druck + „Sicher?" kostet eine Geste
                            // und rettet die Daten.
                            HoldButton(
                                // `rec.discardHold` ist auf Wear schon der blanke Wortlaut
                                // („Verwerfen"), taugt also fuer beide Wege. Die Rueckfrage
                                // haengt nur ein Fragezeichen an — das braucht keinen neuen
                                // Schluessel und liest sich in jeder Sprache richtig.
                                I18n.t("rec.discardHold"),
                                Color(0xFF92400E), Color(0xFFFBBF24), press = stopMode == "press",
                                bestaetigen = stopMode == "press",
                                bestaetigenLabel = I18n.t("rec.discardHold") + "?",
                            ) {
                                verworfen = true
                                RecorderService.discard(ctx.applicationContext)
                            }
                        }
                    }
                }
            }
            // Zeigt die aktuelle Seite ein eigenes Layout? (fuer die Punkte-Unterdrueckung unten)
            val currentIsLayoutPage = (layoutsPref ?: layoutsServerDefault) && when {
                pager.currentPage in firstData until (firstData + dataCount) ->
                    onFoilPages.getOrNull(pager.currentPage - firstData) is WatchPageRef.Layout
                pager.currentPage == summaryPage && showRunEnd ->
                    offFoilPages.firstOrNull() is WatchPageRef.Layout
                else -> false
            }
            // Seiten-Punkte unten — NICHT auf einer eigenen Layout-Seite. Dort bringt das Layout
            // seinen eigenen Punkte-Indikator mit (Element typ 6), und Garmin macht es genauso:
            // _drawLayoutPage kehrt vor _drawPageDots zurueck (RecordView.mc:98-115). Ohne das
            // standen zwei Punktreihen mit verschiedener Anzahl uebereinander (am Emulator
            // gesehen: 3 Punkte aus dem Layout, 8 aus dem Ring).
            if (!currentIsLayoutPage) {
                Row(Modifier.padding(bottom = 4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    repeat(pageCount) { i ->
                        Box(Modifier.size(5.dp).background(
                            if (i == pager.currentPage) Color(0xFF22D3EE) else Color(0xFF475569),
                            CircleShape))
                    }
                }
            }
            // Eingefrorene Ortung: die Uhr bekommt nur noch alte Fixes vorgesetzt (s.
            // Recorder.gpsStale). Das MUSS auffallen — sonst pumpt jemand eine Stunde und
            // hat hinterher nur seinen Puls (Meldung eines Nutzers am 03.09., zwei weitere
            // Konten mit demselben Muster). Deshalb ein Balken quer ueber die Seite statt
            // eines Symbols: er liegt ueber jeder Datenseite und jedem eigenen Layout.
            if (s.gpsStale) {
                // GROSS und nicht zu uebersehen (Jan, 03.09.): ein „--" im Tempo-Feld liest
                // sich wie „ich stehe ja noch am Steg". Deshalb eine ganze Seite, die den
                // Rest ueberdeckt — die Zahlen darunter sind ohnehin wertlos, solange die
                // Uhr nur eine gespeicherte Position wiederholt. Antippen legt sie weg;
                // danach bleibt der schmale Balken, damit man es nicht vergisst.
                if (!staleWeggetippt) {
                    Column(
                        Modifier.fillMaxSize().background(Color(0xFFB91C1C))
                            .clickable { staleWeggetippt = true }
                            .padding(horizontal = 14.dp),
                        verticalArrangement = Arrangement.Center,
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text("GPS", color = Color.White, fontSize = 26.sp,
                            fontWeight = FontWeight.Black)
                        Spacer(Modifier.height(6.dp))
                        Text(I18n.t("rec.gpsStale"), color = Color.White, fontSize = 15.sp,
                            fontWeight = FontWeight.Bold, textAlign = TextAlign.Center,
                            lineHeight = 18.sp)
                        Spacer(Modifier.height(8.dp))
                        Text(I18n.t("rec.gpsStaleTap"), color = Color(0xFFFECACA),
                            fontSize = 12.sp, textAlign = TextAlign.Center)
                    }
                } else {
                    Text(
                        I18n.t("rec.gpsStale"),
                        color = Color(0xFF0F172A),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center,
                        lineHeight = 14.sp,
                        modifier = Modifier.align(Alignment.TopCenter).fillMaxWidth()
                            .background(Color(0xFFFBBF24)).padding(horizontal = 10.dp, vertical = 3.dp),
                    )
                }
            }
            // Status-Leiste am oberen Rand: Upload-Ring + Wassersperre gekrümmt (Curved Row).
            // Warum es sie gibt: beim Pumpen schlaegt Wasser aufs Display und loest Aktionen aus.
            // Ein Tipp sperrt Touch, bis man die Krone drueckt.
            if (!AmbientState.aktiv.value && (s.uploading || ctx is android.app.Activity || isPreview)) {
                CurvedLayout(
                    anchor = 270f,
                    modifier = Modifier.fillMaxSize()
                ) {
                    curvedRow {
                        if (s.uploading) {
                            curvedComposable {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(12.dp),
                                    strokeWidth = 2.dp
                                )
                            }
                        }
                        curvedComposable(
                            modifier = if (s.uploading) CurvedModifier.padding(angular = 6.dp) else CurvedModifier
                        ) {
                            Box(
                                Modifier
                                    .clip(CircleShape)
                                    .background(Color(0x33FFFFFF))
                                    .clickable {
                                        onEnableWaterLock()
                                    }
                                    .padding(horizontal = 7.dp, vertical = 3.dp),
                            ) {
                                Text("\uD83D\uDCA7", fontSize = 12.sp)   // Wassertropfen
                            }
                        }
                    }
                }
            }
            // Puls wird NICHT aktiv gemessen: dann kommen Werte nur zufaellig, wenn die Uhr
            // ohnehin gerade misst — im gemeldeten Fall dreimal ueber 20 Minuten gar nichts.
            // Der Waechter im Service fordert die Messung neu an; bis das greift, soll es
            // wenigstens sichtbar sein.
            if (!s.pulsMessung) {
                Text(
                    I18n.t("rec.hrPassive"),
                    color = Color(0xFFFBBF24),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.align(Alignment.TopEnd).padding(end = 8.dp, top = 2.dp),
                )
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
                    layoutsPref = layoutsPref,
                    layoutsEffective = layoutsPref ?: layoutsServerDefault,
                    layoutsPageCount = onFoilPages.count { it is WatchPageRef.Layout },
                    onCycleLayouts = {
                        // Automatisch -> An -> Aus -> Automatisch (wie Garmin)
                        val next = when (layoutsPref) { null -> true; true -> false; false -> null }
                        layoutsPref = next
                        LocalStore.setLayoutsPref(ctx, next)
                    },
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
        // Bereit, sobald einmal ein brauchbarer Fix da war. Bleibt dann stehen (wie das
        // Garmin-Pendant `_hasGpsFix`) — ein kurzes Aussetzen soll die Anzeige nicht
        // flackern lassen.
        var gpsBereit by remember { mutableStateOf(false) }
        if (autoStart && !s.starting) {
            LaunchedEffect(Unit) {
                autoCountdown = 10; autoArmed = false
                while (autoCountdown > 0) { delay(1000); autoCountdown-- }
                autoArmed = true
            }
        }
        // GPS läuft schon im Ruhebild — NICHT erst mit dem Druck auf Start.
        //
        // Grund (31.08.): ein Kaltstart braucht im Freien gut zwei Minuten bis zum ersten
        // brauchbaren Fix. In einem gemessenen Fall kamen in den ersten 132 s der Aufnahme
        // nur 15 Positionen (eine alle 8,8 s), und der Lauf in diesem Fenster ist weder auf
        // der Uhr noch auf dem Server zu retten. Die Garmin-Fassung hält den Empfänger
        // deshalb seit jeher warm; Wear tat das bisher nur bei aktivem Auto-Start.
        //
        // Derselbe Callback erledigt beides: Bereitschaftsanzeige (immer) und die
        // Auto-Start-Überwachung (nur wenn scharf). Zwei getrennte Anforderungen wären
        // derselbe Fix und derselbe Stromverbrauch, nur doppelt verwaltet.
        val autoScharf = rememberUpdatedState(autoStart && !s.starting && autoArmed)
        DisposableEffect(Unit) {
            if (isPreview) return@DisposableEffect onDispose {}
            val attrCtx = ctx.createAttributionContext("recorder")
            val fused = LocationServices.getFusedLocationProviderClient(attrCtx)
            var streak = 0
            val cb = object : LocationCallback() {
                override fun onLocationResult(r: LocationResult) {
                    val l = r.lastLocation
                    // Brauchbar = dieselbe Schwelle wie das Qualitäts-Gate der Aufnahme
                    // (Recorder.kt, hAcc > 20 m -> gpsPoor), damit „bereit“ und „Anzeige
                    // zeigt Tempo“ nicht auseinanderlaufen.
                    // „Bereit" heisst: genau UND frisch. Ein zwischengespeicherter Fix
                    // meldet beste Genauigkeit und wuerde die Uhr sonst gruen melden,
                    // obwohl sie gar nicht ortet (Fall vom 03.09.). Hier faellt es auf,
                    // solange man noch am Steg steht — auf dem Wasser schaut niemand hin.
                    val frisch = l != null &&
                            (SystemClock.elapsedRealtimeNanos() - l.elapsedRealtimeNanos) < 5_000_000_000L
                    gpsBereit = l != null && l.hasAccuracy() && l.accuracy <= 20f && frisch
                    if (!autoScharf.value) { streak = 0; return }
                    val sp = l?.let { if (it.hasSpeed()) it.speed else 0f } ?: 0f
                    if (sp * 3.6f >= 10f) { streak++; if (streak >= 4) RecorderService.start(ctx.applicationContext) }
                    else streak = 0
                }
            }
            val req = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 1000).build()
            try { fused.requestLocationUpdates(req, cb, Looper.getMainLooper()) } catch (_: SecurityException) {}
            onDispose { fused.removeLocationUpdates(cb) }
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
                    // Update-Hinweis sprachneutral wie bei Zepp: "v1.2.17 → 1.2.18" in Cyan.
                    // Kein eigener Text, also auch keine 15 Uebersetzungen.
                    val neuer = istNeuer(storeVersion, appVersion(ctx))
                    Text(
                        if (neuer) "v" + appVersion(ctx) + " → " + storeVersion else "v" + appVersion(ctx),
                        style = MaterialTheme.typography.caption2,
                        color = if (neuer) Color(0xFF22D3EE) else Color(0xFF94A3B8),
                    )
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
                // GPS-Bereitschaft VOR dem Start. Wer vorher losläuft, verliert den ersten Lauf.
                // Der Start bleibt trotzdem möglich: unter Bäumen oder in der Halle kommt nie
                // ein Fix, und dann wäre ein gesperrter Knopf schlimmer als eine Aufnahme ohne
                // die ersten Meter. Bei fehlender Freigabe / abgeschaltetem Standort sagen das
                // schon die roten Hinweise unter dem Knopf — dann hier nichts doppeln.
                if (!s.starting && !locMissing && !locOff) {
                    Text(I18n.t(if (gpsBereit) "gps.ready" else "gps.searching"),
                        style = MaterialTheme.typography.caption2,
                        color = if (gpsBereit) Color(0xFF34C759) else Color(0xFFF59E0B),
                        textAlign = TextAlign.Center)
                    Spacer(Modifier.height(4.dp))
                }
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
                        onClick = {
                            skipSync()
                            if (locMissing) {
                                // Standort fehlt: fragen und NUR bei Erteilung starten — eine
                                // Aufnahme ohne Position ist fuer die Auswertung wertlos.
                                askLocation(startDanach = true)
                            } else {
                                // Standort da -> IMMER sofort aufnehmen. Fehlt die Puls-Berechtigung,
                                // fragen wir DANACH (der Dienst haengt den Puls dann an, s.
                                // hrPermLauncher). Vorher hing der Start am Dialog: stirbt der Prozess
                                // waehrend er oben ist — auf dem Wear-Emulator reproduzierbar —, war
                                // der Startwunsch weg und ein Druck auf Start tat gar nichts.
                                RecorderService.start(ctx.applicationContext)
                                if (hrMissing) hrPermLauncher.launch(pulsRecht())
                            }
                        },
                        colors = ButtonDefaults.buttonColors(
                            backgroundColor = Color(0xFF34C759), contentColor = Color.White),
                        modifier = Modifier.fillMaxWidth(0.72f).height(42.dp),
                    ) { Text(I18n.t("rec.start")) }
                    // Kein Standort = keine Strecke: das ist kein Nebenaspekt, sondern verhindert die
                    // Aufnahme. Deshalb zuerst und in Rot (der Puls-Hinweis darunter bleibt amber).
                    if (locMissing) {
                        Spacer(Modifier.height(6.dp))
                        Text(I18n.t("rec.locPerm"),
                            style = MaterialTheme.typography.caption2,
                            color = Color(0xFFEF4444), textAlign = TextAlign.Center,
                            modifier = Modifier.clickable { askLocation(startDanach = false) })
                    } else if (locOff) {
                        Spacer(Modifier.height(6.dp))
                        Text(I18n.t("rec.locOff"),
                            style = MaterialTheme.typography.caption2,
                            color = Color(0xFFEF4444), textAlign = TextAlign.Center,
                            modifier = Modifier.clickable {
                                try { ctx.startActivity(Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)) }
                                catch (_: Exception) {}
                            })
                    }
                    // Kein Puls moeglich: sichtbar sagen statt still ohne aufzuzeichnen (der
                    // Sensor liefert ohne BODY_SENSORS kommentarlos nichts). Tipp = nochmal fragen.
                    if (hrMissing) {
                        Spacer(Modifier.height(6.dp))
                        Text(I18n.t("rec.hrPerm"),
                            style = MaterialTheme.typography.caption2,
                            color = Color(0xFFF59E0B), textAlign = TextAlign.Center,
                            modifier = Modifier.clickable {
                                hrPermLauncher.launch(pulsRecht())
                            })
                    }
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
                            // Der Upload laeuft im App-Prozess: verlaesst der Nutzer die App, pausiert
                            // er bis zum naechsten Oeffnen. Drei Support-Faelle ("Session fehlt", kam
                            // Stunden spaeter) hatten genau diese Wissensluecke -> deutlich sagen.
                            Text(I18n.t("rec.keepOpen"),
                                style = MaterialTheme.typography.caption2,
                                color = Color(0xFFF59E0B), textAlign = TextAlign.Center)
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
internal fun UploadScreen(s: Recorder.State) {
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
internal fun SavedScreen(s: Recorder.State, onDone: () -> Unit) {
    // Fehlt die Berechtigung, sagt das schon der Hinweis auf dem Start-Screen (rec.hrPerm) —
    // dann hier nicht ein zweites Mal mit anderer Begruendung nachlegen.
    val hrPermGranted = ContextCompat.checkSelfPermission(
        LocalContext.current, Manifest.permission.BODY_SENSORS) == PackageManager.PERMISSION_GRANTED
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
                        // Ohne eine einzige Position ist der Mitschnitt nicht auswertbar (keine
                        // Strecke, keine Laeufe). Das gehoert hierhin gesagt, nicht erst wenn der
                        // Nutzer sich Tage spaeter wundert, warum die Session leer aussieht.
                        if (s.gpsFixes == 0) {
                            Spacer(Modifier.height(6.dp))
                            Text(I18n.t("rec.noGpsSaved"), style = MaterialTheme.typography.caption2,
                                color = Color(0xFFEF4444), textAlign = TextAlign.Center)
                        }
                        // Dasselbe fuer den Puls: kein einziger Wert in der ganzen Aufnahme.
                        // Feldbefund 15.08. (u171, Xiaomi Watch 2 Pro): 11 Sessions ohne Puls,
                        // Berechtigung erteilt — der Sensor schwieg, und die Uhr sagte nichts.
                        // Der Berechtigungs-Hinweis oben deckt diesen Fall NICHT ab; amber statt
                        // rot, weil eine Session ohne Puls auswertbar bleibt (anders als ohne GPS).
                        if (s.hrSamples == 0 && hrPermGranted) {
                            Spacer(Modifier.height(6.dp))
                            Text(I18n.t("rec.hrNone"), style = MaterialTheme.typography.caption2,
                                color = Color(0xFFF59E0B), textAlign = TextAlign.Center)
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
internal fun FieldView(fid: Int, s: Recorder.State, colorBy: Boolean, count: Int = 3) {
    val (value, label) = fieldValue(fid, s)
    val color = if (colorBy) fieldColor(fid, s) else Color.Unspecified
    // Weniger Felder pro Seite -> größere Schrift (1 Feld = riesig, z. B. Speed beim Pumpen).
    val valueStyle = when (count) {
        1 -> MaterialTheme.typography.display1.copy(fontSize = 60.sp, lineHeight = 62.sp)   // ein Feld: maximal groß
        2 -> MaterialTheme.typography.display2
        else -> MaterialTheme.typography.display3
    }
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 2.dp)) {
        // Breite begrenzen (86 %): auf einem RUNDEN Display ist oben und unten nur die Sehne
        // nutzbar, nicht der Durchmesser — und genau dort steht bei drei Feldern das erste
        // und das dritte.
        AutoFitText(value, valueStyle, color, Modifier.fillMaxWidth(0.86f))
        AutoFitText(label,
            if (count == 1) MaterialTheme.typography.caption1 else MaterialTheme.typography.caption2,
            Color(0xFF94A3B8), Modifier.fillMaxWidth(0.92f))
    }
}

// Text, der sich verkleinert, bis er in EINE Zeile passt. Die Schriftgroessen oben sind fest
// (60.sp usw.) und tragen deshalb nicht ueber alle Wear-Displays: ein langer Wert wie "12:34"
// oder eine lange Beschriftung lief auf kleinen Uhren ueber den Rand bzw. brach um. Statt einer
// Tabelle pro Groesse misst Compose selbst und schrumpft in 8-%-Schritten — Untergrenze 55 %,
// damit nichts unleserlich klein wird. `remember(text, groesse)` setzt den Faktor zurueck,
// sobald sich der Text aendert, sonst bliebe die Schrift nach einem langen Wert klein.
@Composable
internal fun AutoFitText(text: String, basis: TextStyle, color: Color, modifier: Modifier) {
    var faktor by remember(text, basis.fontSize) { mutableStateOf(1f) }
    Text(
        text,
        modifier = modifier,
        style = basis.copy(
            fontSize = basis.fontSize * faktor,
            lineHeight = if (basis.lineHeight.isSpecified) basis.lineHeight * faktor else basis.lineHeight,
        ),
        color = color,
        maxLines = 1,
        softWrap = false,
        textAlign = TextAlign.Center,
        onTextLayout = { r -> if (r.didOverflowWidth && faktor > 0.55f) { faktor *= 0.92f } },
    )
}

// 2 s halten zum Stoppen (wie Garmin Stop-Halten-Ring) — verhindert versehentliches Stoppen.
@OptIn(ExperimentalFoundationApi::class)
@Composable
// Generischer „2 s halten"-Button (Stop = rot, Verwerfen = amber). onHeld feuert erst nach
// 2 s ohne Loslassen (bewusste, versehentlich schwer auszulösende Geste).
internal fun HoldButton(
    label: String, fill: Color, ring: Color,
    /** Profil-Einstellung „ein Druck statt 2 s halten" (stopMode = press). */
    press: Boolean = false,
    /** Nur im press-Modus: erst der ZWEITE Druck loest aus (Schutz beim Verwerfen). */
    bestaetigen: Boolean = false,
    bestaetigenLabel: String = "",
    onHeld: () -> Unit,
) {
    var progress by remember { mutableStateOf(0f) }
    var scharf by remember { mutableStateOf(false) }   // erster Druck im Bestaetigen-Modus
    // Nach 4 s ohne zweiten Druck wieder entschaerfen — sonst loest ein spaeterer Fehlgriff aus.
    LaunchedEffect(scharf) {
        if (scharf) { kotlinx.coroutines.delay(4000); scharf = false }
    }
    Box(contentAlignment = Alignment.Center) {
        CircularProgressIndicator(
            progress = progress.coerceAtLeast(0.001f),   // immer sichtbarer Ring (zeigt „halten")
            modifier = Modifier.size(96.dp), strokeWidth = 4.dp,
            indicatorColor = ring)
        // Plain Box (KEIN Material-Button) -> dessen clickable würde sonst die Press-
        // Geste schlucken und onPress nie feuern.
        Box(
            modifier = Modifier
                .size(76.dp)
                .background(fill, CircleShape)
                .pointerInput(press, bestaetigen) {
                    // Ein Druck genuegt (Profil-Einstellung): sofort ausloesen, ohne Ring.
                    if (press) {
                        detectTapGestures(onTap = {
                            if (bestaetigen && !scharf) { scharf = true }
                            else { scharf = false; onHeld() }
                        })
                        return@pointerInput
                    }
                    detectTapGestures(onPress = {
                        progress = 0.0001f
                        val held = coroutineScope {
                            val timer = launch {
                                val start = System.currentTimeMillis()
                                while (isActive) {
                                    progress = ((System.currentTimeMillis() - start) / 2000f).coerceIn(0f, 1f)
                                    kotlinx.coroutines.delay(30)
                                }
                            }
                            val released = withTimeoutOrNull(2000) { tryAwaitRelease() }
                            timer.cancel()
                            released == null   // null => 2 s ohne Loslassen => auslösen
                        }
                        progress = 0f
                        if (held) onHeld()
                    })
                },
            contentAlignment = Alignment.Center,
        ) {
            Text(if (scharf && bestaetigenLabel.isNotEmpty()) bestaetigenLabel else label,
                textAlign = TextAlign.Center,
                style = MaterialTheme.typography.caption2, color = Color.White)
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

// Feld-IDs identisch mit web/src/lib/fields.ts + Garmin Config.mc (alle 22 Felder).
private fun fieldValue(id: Int, s: Recorder.State): Pair<String, String> = when (id) {
    // Schlechtes GPS -> "--" statt Phantom-Tempo (100 km/h am Steg, Nutzer-Video 05.08.).
    1 -> (if (s.gpsPoor) "--" else String.format("%.1f", s.speed3sKmh)) to I18n.t("f.kmh3s")
    5 -> (if (s.gpsPoor) "--" else String.format("%.1f", s.speedKmh)) to I18n.t("f.kmh")
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
    15 -> distVal(s.runDistanceM) to (distUnit(s.runDistanceM) + " " + I18n.t("f.runDist"))
    16 -> msStr(s.lastRunDurationMs) to I18n.t("f.lastRunTime")
    17 -> distVal(s.lastRunDistanceM) to (distUnit(s.lastRunDistanceM) + " " + I18n.t("f.lastRunDist"))
    18 -> String.format("%.1f", s.lastRunAvgSpeedKmh) to I18n.t("f.lastRunAvg")
    19 -> String.format("%.1f", s.lastRunMaxSpeedKmh) to I18n.t("f.lastRunMax")
    20 -> s.runCount.toString() to I18n.t("f.runs")
    21 -> (if (s.lastRunMaxHr > 0) s.lastRunMaxHr.toString() else "–") to I18n.t("f.lastRunMaxHr")
    else -> "—" to ""
}

// Rohwert der skalierbaren Felder fuer die Wert-Grafiken (km/h bzw. bpm). null = kein Messwert:
// dann bleibt die Grafik leer, statt 0 zu zeigen (0 hiesse "ganz unten in Zone 1", ein Messwert).
private fun fieldNumber(id: Int, s: Recorder.State): Float? = when (id) {
    1 -> if (s.gpsPoor) null else s.speed3sKmh.toFloat()
    5 -> if (s.gpsPoor) null else s.speedKmh.toFloat()
    6 -> s.avgSpeedKmh.toFloat()
    7 -> s.maxSpeedKmh.toFloat()
    18 -> s.lastRunAvgSpeedKmh.toFloat()
    19 -> s.lastRunMaxSpeedKmh.toFloat()
    2 -> if (s.hr > 0) s.hr.toFloat() else null
    8 -> if (s.avgHr > 0) s.avgHr.toFloat() else null
    9 -> if (s.maxHr > 0) s.maxHr.toFloat() else null
    21 -> if (s.lastRunMaxHr > 0) s.lastRunMaxHr.toFloat() else null
    else -> null
}

private fun msStr(ms: Long): String { val sec = ms / 1000; return String.format("%d:%02d", sec / 60, sec % 60) }
// Distanz wie bei Garmin (RecordView._distVal/_distUnit): die EINHEIT GEHOERT INS LABEL, nicht in
// den Wert. Vorher stand sie hier im Wert ("12 m") und das Label trug nur "Lauf-Dist" — dann sieht
// ein Layout, das Wert und Label nebeneinander stellt, doppelt oder widerspruechlich aus, und die
// PWA-Vorschau (MOCK_VALUE ohne Einheit) zeigte etwas anderes als die Uhr.
private fun distVal(m: Double): String =
    if (m < 1000) String.format("%.0f", m) else String.format("%.2f", m / 1000.0)
private fun distUnit(m: Double): String = if (m < 1000) "m" else "km"
private fun clockStr(): String =
    java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault()).format(java.util.Date())

private fun fieldColor(id: Int, s: Recorder.State): Color = when (id) {
    1, 5, 6, 7 -> speedColor(when (id) { 1 -> s.speed3sKmh; 6 -> s.avgSpeedKmh; 7 -> s.maxSpeedKmh; else -> s.speedKmh })
    18 -> speedColor(s.lastRunAvgSpeedKmh)
    19 -> speedColor(s.lastRunMaxSpeedKmh)
    2, 8, 9, 21 -> hrColor(when (id) { 8 -> s.avgHr; 9 -> s.maxHr; 21 -> s.lastRunMaxHr; else -> s.hr })
    else -> Color.Unspecified
}
// Wert-Farben aus den PROFIL-ZONEN — derselben Skala, die auch die Wert-Grafiken färbt
// (LayoutScales, docs/COLOR-ZONES.md). Vorher standen hier feste Stufen (120/150/170 bpm bzw.
// 12/16/20 km/h), während die Grafik daneben nach Profil färbte: dieselbe Geschwindigkeit
// konnte grüne Zahl und gelben Ring bedeuten.
private fun hrColor(bpm: Int): Color =
    if (bpm <= 0) Color.Unspecified
    else ZONE_COLORS[LayoutScales.zoneOf(bpm.toFloat(), LayoutScales.hrZones)]
// Geschwindigkeitsfarbe aus den PROFIL-ZONEN (LayoutScales.speedZones) — fünf Stufen, dieselbe
// Skala wie die Wert-Grafiken und wie Garmin/Apple/Zepp/PWA. Historie: erst ein stufenloser
// HSV-Verlauf 8…25 km/h (sah überall anders aus), dann feste Stufen 12/16/20 (stimmten nicht mit
// der Grafik daneben zusammen), jetzt EINE einstellbare Quelle. Doku: docs/COLOR-ZONES.md.
private fun speedColor(kmh: Double): Color =
    ZONE_COLORS[LayoutScales.zoneOf(kmh.toFloat(), LayoutScales.speedZones)]

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
    layoutsPref: Boolean?,          // null = automatisch (Server-Voreinstellung)
    layoutsEffective: Boolean,      // was gerade wirklich gilt -> Anzeige bei "Automatisch"
    layoutsPageCount: Int,          // 0 = es gibt gar keine Layout-Seiten -> Hinweis wie bei Garmin
    onCycleLayouts: () -> Unit,
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
        // Eigene Layouts: Automatisch / An / Aus — derselbe Dreiklang wie im Garmin-Menue
        // (RecordDelegate._layoutState). Der Server-Wert ist nur die Vorbelegung.
        Chip(
            onClick = onCycleLayouts,
            label = { Text(I18n.t("menu.layouts")) },
            secondaryLabel = {
                Text(
                    when (layoutsPref) {
                        null -> I18n.t("common.auto") + " (" +
                            (if (layoutsEffective) I18n.t("common.on") else I18n.t("common.off")) + ")"
                        true -> if (layoutsPageCount == 0)
                            I18n.t("common.on") + " (" + I18n.t("lay.none") + ")" else I18n.t("common.on")
                        false -> I18n.t("common.off")
                    }
                )
            },
            modifier = Modifier.fillMaxWidth(),
        )
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

// Ist `store` echt neuer als `lokal`? Zahlenweise, damit ein Entwicklungs-Build (hoehere Version
// als der Store) keinen Rueckschritt anzeigt — Zepp vergleicht nur auf Ungleichheit.
private fun istNeuer(store: String, lokal: String): Boolean {
    if (store.isBlank() || lokal.isBlank()) return false
    val a = store.split(".").mapNotNull { it.toIntOrNull() }
    val b = lokal.split(".").mapNotNull { it.toIntOrNull() }
    for (i in 0 until maxOf(a.size, b.size)) {
        val x = a.getOrElse(i) { 0 }; val y = b.getOrElse(i) { 0 }
        if (x != y) return x > y
    }
    return false
}

// internal (nicht private): auch der Recorder braucht die Version fürs Session-Meta.
// Einzige Quelle bleibt versionName aus dem Manifest/Gradle — nie hart schreiben.
internal fun appVersion(ctx: Context): String =
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


/**
 * Zustand des Ambient-Modus (Always-on). Bewusst global und nicht im Compose-Baum: der
 * Beobachter haengt an der ACTIVITY (Lifecycle), nicht an einer Composable, und die Ansicht
 * braucht ihn an zwei Stellen.
 */
object AmbientState {
    val aktiv = mutableStateOf(false)
    /** Uhr verlangt Einbrenn-Schutz (AMOLED): Inhalt darf nicht dauerhaft an derselben Stelle stehen. */
    val einbrennschutz = mutableStateOf(false)
    /** Takt des Systems, etwa einmal pro Minute — nur dann darf im Ambient neu gezeichnet werden. */
    val takt = mutableStateOf(0)
}

/**
 * Ambient-Ansicht waehrend der Aufnahme: schwarz, nur helle Schrift, keine Flaechen und keine
 * Farben. Das ist keine Design-Laune, sondern die Vorgabe fuer Always-on — gefuellte Flaechen
 * brennen ein und kosten auf AMOLED spuerbar Strom.
 *
 * Inhalt bewusst auf drei Zahlen begrenzt: Tempo (3-s-Mittel, dieselbe Zahl, auf der die
 * Lauf-Erkennung entscheidet), Dauer des laufenden Laufs und Distanz. Alles andere kann man
 * sehen, indem man das Handgelenk dreht — dann ist der Bildschirm ohnehin wieder voll da.
 */
@Composable
fun AmbientRecordingScreen(s: Recorder.State) {
    // Einbrenn-Schutz: den Inhalt im Minutentakt um wenige Pixel verschieben.
    val versatz = if (AmbientState.einbrennschutz.value) ((AmbientState.takt.value % 4) - 2) * 2 else 0
    Box(Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) {
        Column(
            modifier = Modifier.offset(x = versatz.dp, y = versatz.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                String.format("%.1f", s.speed3sKmh),
                color = Color.White, fontSize = 44.sp, fontWeight = FontWeight.Light,
            )
            Text("km/h", color = Color(0xFF9AA4B2), fontSize = 12.sp)
            Spacer(Modifier.height(6.dp))
            Text(
                ambientZeit(if (s.runDurationMs > 0) s.runDurationMs / 1000 else s.elapsedSec),
                color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.Light,
            )
            Text(
                if (s.distanceM < 1000) String.format("%.0f m", s.distanceM)
                else String.format("%.2f km", s.distanceM / 1000.0),
                color = Color(0xFF9AA4B2), fontSize = 14.sp,
            )
        }
    }
}

private fun ambientZeit(sek: Long): String = String.format("%d:%02d", sek / 60, sek % 60)

/**
 * WELCHE Puls-Berechtigung die Uhr braucht — eine Wahrheit fuer Abfrage, Pruefung und Hinweis.
 *
 * Bis Android 14: `BODY_SENSORS`. Ab Android 15: `health.READ_HEART_RATE`; BODY_SENSORS ist dort
 * abgekuendigt und zaehlt vor allem NICHT mehr als Voraussetzung fuer einen Vordergrund-Dienst vom
 * Typ `health` — genau daran starb die App beim Aufnahmestart, nachdem wir am 30.08. auf
 * targetSdk 36 gegangen sind (Jans Wear-Emulator mit Android 16, 02.09.).
 */
internal fun pulsRecht(): String =
    if (Build.VERSION.SDK_INT >= 35) "android.permission.health.READ_HEART_RATE"
    else Manifest.permission.BODY_SENSORS


@Preview(device = WearDevices.SMALL_ROUND, showSystemUi = true)
@Composable
fun RecordScreenPreview() {
    val state = Recorder.State(
        recording = true,
        isFoiling = true,
        speedKmh = 12.5,
        speed3sKmh = 12.8,
        elapsedSec = 45,
        distanceM = 120.0,
        hr = 135,
        status = "Recording...",
        uploading = true,
    )
    MaterialTheme {
        RecordScreenContent(
            s = state,
            onEnableWaterLock = {}
        )
    }
}

@Preview(device = WearDevices.SMALL_ROUND, showSystemUi = true)
@Composable
fun AmbientRecordingScreenPreview() {
    val state = Recorder.State(
        recording = true,
        isFoiling = true,
        speed3sKmh = 15.5,
        elapsedSec = 600,
        distanceM = 1500.0,
        runDurationMs = 30000
    )
    AmbientRecordingScreen(state)
}

@Preview(device = WearDevices.SMALL_ROUND, showSystemUi = true)
@Composable
fun FoilPickerPreview() {
    val foils = listOf(
        FoilOpt(1, "Takuma Kujira 1210", 12, 22),
        FoilOpt(2, "Armstrong HA 925", 14, 25)
    )
    MaterialTheme {
        FoilPicker(
            foils = foils,
            alarmOn = true,
            source = "foil",
            autoStart = false,
            manualLow = 10,
            manualHigh = 20,
            selectedFoilId = 1,
            onToggleAlarm = {},
            onToggleSource = {},
            onToggleAutoStart = {},
            layoutsPref = null,
            layoutsEffective = true,
            layoutsPageCount = 3,
            onCycleLayouts = {},
            onManualLow = {},
            onManualHigh = {},
            onPick = {},
            onNone = {},
            onBack = {}
        )
    }
}

@Preview(device = WearDevices.SMALL_ROUND, showSystemUi = true)
@Composable
fun UploadScreenPreview() {
    val state = Recorder.State(
        uploading = true,
        uploadSent = 5,
        uploadTotal = 12
    )
    MaterialTheme {
        UploadScreen(state)
    }
}

@Preview(device = WearDevices.SMALL_ROUND, showSystemUi = true)
@Composable
fun SavedScreenPreview() {
    val state = Recorder.State(
        recording = false,
        pendingCount = 0,
        gpsFixes = 100,
        hrSamples = 50
    )
    MaterialTheme {
        SavedScreen(state, onDone = {})
    }
}

@Preview(device = WearDevices.SMALL_ROUND, showSystemUi = true)
@Composable
fun PairScreenPreview() {
    MaterialTheme {
        PairScreen(onPaired = {}, onSkip = {})
    }
}
