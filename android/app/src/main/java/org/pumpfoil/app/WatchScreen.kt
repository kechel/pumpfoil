package org.pumpfoil.app

import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.HelpOutline
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Vibration
import androidx.compose.material.icons.filled.Watch
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

// Uhren-Bereich (wie die PWA /account „Uhr"): Wear-OS-Status + Garmin/Wear-Kopplung +
// On-Foil-Alarm + Datenseiten gebündelt. Die Profil-Übersicht zeigt nur EINEN „Uhr"-Eintrag.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WatchScreen(
    onBack: () -> Unit,
    onGarminPair: () -> Unit = {},
    onGuide: () -> Unit = {},
    onAlarm: () -> Unit = {},
    onDataFields: () -> Unit = {},
) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val snackHost = remember { SnackbarHostState() }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(I18n.t("nav.watch")) },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = I18n.t("a11y.back")) }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackHost) },
    ) { pad ->
        Column(Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
            WatchCard(ctx)
            HuaweiKarte()
            Spacer(Modifier.height(8.dp))
            // Die vier Verweise auf die anderen Seiten stehen VOR der Uhren-Liste (Jan, 02.09.):
            // wer viele Uhren gepairt hat, musste vorher an allen vorbeiscrollen, um zur
            // Anleitung, zum Alarm oder zu den Datenfeldern zu kommen.
            // Die Anleitung bleibt dabei die erste: wer hier landet und die Uhr noch nicht
            // eingerichtet hat, braucht zuerst den Weg dorthin — nicht den Code-Bildschirm.
            ListItem(
                modifier = Modifier.clickable { onGuide() },
                headlineContent = { Text(I18n.t("guide.howto")) },
                leadingContent = { Icon(Icons.AutoMirrored.Filled.HelpOutline, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
                trailingContent = { Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null) },
            )
            ListItem(
                modifier = Modifier.clickable { onGarminPair() },
                headlineContent = { Text(I18n.t("garmin.title")) },
                supportingContent = { Text(I18n.t("garmin.sub")) },
                leadingContent = { Icon(Icons.Filled.Watch, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
                trailingContent = { Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null) },
            )
            ListItem(
                modifier = Modifier.clickable { onAlarm() },
                headlineContent = { Text(I18n.t("profile.alarm")) },
                supportingContent = { Text(I18n.t("profile.alarmSub")) },
                leadingContent = { Icon(Icons.Filled.Vibration, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
                trailingContent = { Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null) },
            )
            ListItem(
                modifier = Modifier.clickable { onDataFields() },
                headlineContent = { Text(I18n.t("profile.datafields")) },
                supportingContent = { Text(I18n.t("profile.datafieldsSub")) },
                leadingContent = { Icon(Icons.Filled.Dashboard, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
                trailingContent = { Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null) },
            )
            Spacer(Modifier.height(8.dp))
            // Rueckmeldung „gespeichert" steht seit 28.09.2026 direkt unter dem jeweiligen Regler
            // (wie die PWA), nicht mehr als Snackbar am unteren Rand.
            PairedDevicesCard()
        }
    }
}

// Wear-OS-Status: zeigt, ob unsere App auf der gekoppelten Uhr ist. Wenn die Uhr gekoppelt
// ist, die App aber fehlt -> Button öffnet den Play Store DIREKT auf der Uhr. Updates laufen
// danach automatisch über den Play Store (kein eigener Updater nötig/möglich).
@Composable
fun WatchCard(ctx: android.content.Context) {
    val paired by WatchSync.watchPaired.collectAsState()
    val installed by WatchSync.watchInstalled.collectAsState()
    LaunchedEffect(Unit) { WatchSync.refreshConnection(ctx) }
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Watch, contentDescription = null)
                Spacer(Modifier.width(10.dp))
                Text(I18n.t("watch.title"), style = MaterialTheme.typography.titleMedium)
            }
            Spacer(Modifier.height(6.dp))
            when {
                installed -> Text(I18n.t("watch.ok"),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                paired -> {
                    Text(I18n.t("watch.notInstalled"),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(8.dp))
                    Button(onClick = { WatchSync.installOnWatch(ctx) }) {
                        Text(I18n.t("watch.install"))
                    }
                }
                else -> Text(I18n.t("watch.none"),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

// Verbundene Uhren mit Aufzeichnungsmodus je Uhr (wie PWA „Verbundene Uhren"). Nur aktive
// (nicht widerrufene) Geräte; Auto-Save + Snackbar-Feedback. FR55-low_accel-Hinweis.
@Composable
fun PairedDevicesCard(onSaved: () -> Unit = {}) {
    val scope = rememberCoroutineScope()
    var devices by remember { mutableStateOf<List<PairedDevice>?>(null) }
    // Ausgeblendete mitladen, sobald man sie sehen will — sonst waere Ausblenden eine Einbahnstrasse.
    var zeigeAusgeblendete by remember { mutableStateOf(false) }
    var neuLaden by remember { mutableStateOf(0) }
    var frage by remember { mutableStateOf<Triple<String, String, () -> Unit>?>(null) }
    // Rueckmeldung je Uhr UND Einstellung (PWA 3ffb76ca, Jan 26.09.2026: „fehlt der uebliche
    // 'gespeichert' hinweis"): die Regler speichern sofort beim Umstellen. „Gespeichert" steht
    // 3 s unter dem Regler; schlaegt es fehl, steht der Fehler da und die Liste wird neu geladen,
    // damit der Regler wieder den echten Wert zeigt. Schluessel "<id>:mode|gnss|water|accel".
    var rueckmeldung by remember { mutableStateOf<Pair<String, Boolean>?>(null) }
    var rueckJob by remember { mutableStateOf<kotlinx.coroutines.Job?>(null) }
    fun speichern(k: String, tun: suspend () -> Unit) {
        rueckJob?.cancel()
        rueckmeldung = null
        rueckJob = scope.launch {
            try {
                tun()
                onSaved()
                rueckmeldung = k to true
                kotlinx.coroutines.delay(3000)
                rueckmeldung = null
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (_: Exception) {
                rueckmeldung = k to false
                neuLaden++
            }
        }
    }
    @Composable
    fun Rueck(k: String) {
        val r = rueckmeldung ?: return
        if (r.first != k) return
        Text(I18n.t(if (r.second) "common.saved" else "profile.saveError"),
            style = MaterialTheme.typography.bodyMedium,
            color = if (r.second) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
            modifier = Modifier.padding(top = 4.dp))
    }
    // Zaehlt jede frisch geladene Liste mit: die Regler-Zustaende haengen daran, damit sie nach
    // einem fehlgeschlagenen Speichern (-> Neuladen) wieder den Wert vom Server zeigen.
    var ladeStand by remember { mutableStateOf(0) }
    LaunchedEffect(zeigeAusgeblendete, neuLaden) {
        devices = try { Api.myDevices(includeHidden = zeigeAusgeblendete) } catch (_: Exception) { emptyList() }
        ladeStand++
    }
    val active = devices?.filter { it.revokedAt == null } ?: return
    val ausgeblendet = devices?.firstOrNull()?.hiddenTotal ?: 0
    if (active.isEmpty() && ausgeblendet == 0) return

    // Rueckfrage vor Entfernen/Widerrufen — dieselben Texte wie in der PWA.
    frage?.let { (titel, text, tun) ->
        AlertDialog(
            onDismissRequest = { frage = null },
            title = { Text(titel) },
            text = { Text(text, style = MaterialTheme.typography.bodyMedium) },
            confirmButton = { TextButton(onClick = { frage = null; tun() }) { Text(titel) } },
            dismissButton = { TextButton(onClick = { frage = null }) { Text(I18n.t("common.cancel")) } },
        )
    }

    val modes = listOf(
        "full" to I18n.t("account.recordModeFull"),
        "lite" to I18n.t("account.recordModeLite"),
        "gps" to I18n.t("account.recordModeGps"),
    )
    // GNSS-Stufen wie in der PWA. NUR Garmin: nur dort waehlt unsere App die Stufe selbst
    // (ab Uhr 1.0.77). Voreinstellung bleibt das Maximum.
    val gnssStufen = listOf(
        "best" to I18n.t("account.gnssModeBest"),
        "l1" to I18n.t("account.gnssModeL1"),
        "two" to I18n.t("account.gnssModeTwo"),
        "gps" to I18n.t("account.gnssModeGps"),
    )
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp)) {
            Text(I18n.t("account.devicesTitle"), style = MaterialTheme.typography.titleMedium)
            // Was die Regler eigentlich tun — sie wirken auf die UHR und greifen dort beim naechsten
            // App-Start. Ohne den Satz sucht man den Effekt an der falschen Stelle; belegt daran,
            // dass gnss_mode bei ALLEN 115 Garmin-Uhren auf NULL stand.
            Spacer(Modifier.height(4.dp))
            Text(I18n.t("account.devicesSettingsIntro"), style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            active.forEachIndexed { idx, d ->
                if (idx > 0) HorizontalDivider(Modifier.padding(vertical = 10.dp))
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Watch, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.width(8.dp))
                    Text(d.model ?: d.label ?: I18n.t("account.deviceUnnamed"), fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
                    d.appVersion?.let { Text("v$it", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
                // Update-Hinweis je Uhr — die PWA zeigt ihn seit Langem, die Apps nicht. Ohne ihn
                // faehrt man monatelang eine alte Uhr-App, ohne es zu erfahren. Hier bewusst NUR
                // der Hinweis: den .prg-Download hat das Telefon nicht, die Uhr holt sich das
                // Update ueber ihren eigenen Store.
                if (d.updateAvailable && !d.latestVersion.isNullOrBlank()) {
                    // Bewusst `settings.watchUpdate` und NICHT `account.deviceUpdate`: letzterer
                    // endet auf „→ herunterladen", und den .prg-Download gibt es nur im Web.
                    val plattform = (d.platform ?: "").replaceFirstChar { it.uppercase() }
                    Text(I18n.t("settings.watchUpdate")
                            .replace("{platform}", plattform)
                            .replace("{version}", d.latestVersion),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.tertiary,
                        modifier = Modifier.padding(top = 2.dp))
                }
                Spacer(Modifier.height(6.dp))
                Text(I18n.t("account.recordMode"), style = MaterialTheme.typography.labelMedium)
                var open by remember(d.id) { mutableStateOf(false) }
                var mode by remember(d.id, ladeStand) { mutableStateOf(d.recordMode) }
                Box {
                    OutlinedButton(onClick = { open = true }, modifier = Modifier.fillMaxWidth()) {
                        Text(modes.firstOrNull { it.first == mode }?.second ?: mode)
                    }
                    DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                        modes.forEach { (id, lbl) ->
                            DropdownMenuItem(text = { Text(lbl) }, onClick = {
                                open = false
                                if (id != mode) { mode = id; speichern("${d.id}:mode") { Api.setDeviceRecordMode(d.id, id) } }
                            })
                        }
                    }
                }
                Rueck("${d.id}:mode")
                if (d.lowAccel && mode == "full") {
                    Text(I18n.t("account.recordModeAutoLite"), style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.tertiary, modifier = Modifier.padding(top = 4.dp))
                }
                // "Nur GPS" schaltet alles ab, was aus der Bewegung kommt — das MUSS dranstehen.
                // Fehlte der App bisher, obwohl die PWA es zeigt.
                if (mode == "gps") {
                    Text(I18n.t("account.recordModeGpsHint"), style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.tertiary, modifier = Modifier.padding(top = 4.dp))
                }
                if (d.platform == "garmin") {
                    Text(I18n.t("account.recordModeGarminHint"), style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
                }
                // Satellitensysteme — nur Garmin. Der groesste Akku-Hebel (s. Changelog 17.08.).
                if (d.platform == "garmin") {
                    Spacer(Modifier.height(10.dp))
                    Text(I18n.t("account.gnssMode"), style = MaterialTheme.typography.labelMedium)
                    var gnssOffen by remember(d.id) { mutableStateOf(false) }
                    var gnss by remember(d.id, ladeStand) { mutableStateOf(d.gnssMode ?: "best") }
                    Box {
                        OutlinedButton(onClick = { gnssOffen = true }, modifier = Modifier.fillMaxWidth()) {
                            Text(gnssStufen.firstOrNull { it.first == gnss }?.second ?: gnss)
                        }
                        DropdownMenu(expanded = gnssOffen, onDismissRequest = { gnssOffen = false }) {
                            gnssStufen.forEach { (id, lbl) ->
                                DropdownMenuItem(text = { Text(lbl) }, onClick = {
                                    gnssOffen = false
                                    if (id != gnss) {
                                        gnss = id
                                        speichern("${d.id}:gnss") { Api.setDeviceGnssMode(d.id, id) }
                                    }
                                })
                            }
                        }
                    }
                    Rueck("${d.id}:gnss")
                    Text(I18n.t("account.gnssModeHint"), style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
                }
                // Je Uhr NUR, was sie auch umsetzt — wie die PWA (Jan, 25.09.2026: „je uhr einfach
                // nur das anbieten was auch sinn ergibt"). Wassersperre: alle ausser Garmin, dort hat
                // der Aufnahme-Bildschirm gar keine Tipp-Behandlung.
                if (d.platform != "garmin") {
                    Spacer(Modifier.height(10.dp))
                    UhrAuswahl(
                        titel = I18n.t("account.waterLock"),
                        optionen = listOf(
                            "auto" to I18n.t("account.waterLockAuto"),
                            "on" to I18n.t("account.waterLockOn"),
                            "off" to I18n.t("account.waterLockOff"),
                        ),
                        start = d.waterLock ?: "auto",
                        schluessel = d.id,
                        stand = ladeStand,
                        hinweis = I18n.t("account.waterLockHint"),
                        rueck = { Rueck("${d.id}:water") },
                    ) { id -> speichern("${d.id}:water") { Api.setDeviceWaterLock(d.id, id) } }
                }
                // Wake-up-Sensor — nur Wear OS (s. RecorderService.accelSensor). „Standard" entfernt
                // den Override, damit man spaeter mitzieht, wenn der Standard umgestellt wird.
                if (d.platform == "wear") {
                    Spacer(Modifier.height(10.dp))
                    val std = I18n.t(if (d.accelWakeupStandard == "on") "account.accelWakeupOn" else "account.accelWakeupOff")
                    UhrAuswahl(
                        titel = I18n.t("account.accelWakeup"),
                        optionen = listOf(
                            "default" to I18n.t("account.accelWakeupDefault").replace("{v}", std),
                            "on" to I18n.t("account.accelWakeupOn"),
                            "off" to I18n.t("account.accelWakeupOff"),
                        ),
                        start = d.accelWakeup ?: "default",
                        schluessel = d.id,
                        stand = ladeStand,
                        hinweis = I18n.t("account.accelWakeupHint"),
                        rueck = { Rueck("${d.id}:accel") },
                    ) { id -> speichern("${d.id}:accel") { Api.setDeviceAccelWakeup(d.id, id) } }
                }

                // Aufraeumen je Uhr — bisher nur in der PWA, dadurch war eine verkaufte oder
                // doppelt gepairte Uhr aus den Apps nicht loszuwerden.
                //  * Ausblenden ist reversibel und rein kosmetisch (die Uhr laedt weiter hoch).
                //  * Entfernen NUR ohne Session — sonst verliert die Session ihre Geraetezuordnung;
                //    das trifft genau die fehlgeschlagenen Pairing-Versuche.
                //  * Widerrufen macht den Token ungueltig, die Sessions bleiben.
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    TextButton(onClick = {
                        scope.launch {
                            try { Api.hideDevice(d.id, d.hiddenAt == null) } catch (_: Exception) {}
                            neuLaden++
                        }
                    }) { Text(I18n.t(if (d.hiddenAt != null) "account.deviceUnhide" else "account.deviceHide")) }
                    if (d.sessions == 0) {
                        TextButton(onClick = {
                            val name = d.model ?: d.label ?: I18n.t("account.deviceUnnamed")
                            frage = Triple(
                                I18n.t("account.deviceForget"),
                                I18n.t("account.deviceForgetConfirm").replace("{name}", name),
                            ) {
                                scope.launch {
                                    try { Api.forgetDevice(d.id) } catch (_: Exception) {}
                                    neuLaden++
                                }
                            }
                        }) { Text(I18n.t("account.deviceForget")) }
                    }
                    TextButton(onClick = {
                        val name = d.model ?: d.label ?: I18n.t("account.deviceUnnamed")
                        frage = Triple(
                            I18n.t("account.deviceRevoke"),
                            I18n.t("account.revokeConfirm").replace("{name}", name),
                        ) {
                            scope.launch {
                                try { Api.revokeDevice(d.id) } catch (_: Exception) {}
                                neuLaden++
                            }
                        }
                    }) { Text(I18n.t("account.deviceRevoke"), color = MaterialTheme.colorScheme.error) }
                }
            }
            Text(I18n.t("account.deviceHideHint"), style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
            // "N ausgeblendete anzeigen" — ohne das waere Ausblenden auf dem Handy endgueltig.
            if (ausgeblendet > 0 || zeigeAusgeblendete) {
                TextButton(onClick = { zeigeAusgeblendete = !zeigeAusgeblendete }) {
                    Text(if (zeigeAusgeblendete) I18n.t("account.devicesHideHidden")
                         else I18n.t("account.devicesShowHidden").replace("{n}", ausgeblendet.toString()))
                }
            }
        }
    }
}


/** Auswahl je Uhr (Titel, Knopf mit Aufklappliste, Hinweis darunter) — dieselbe Form wie
 *  Aufzeichnungsmodus und GNSS-Stufe, fuer die Einstellungen, die nur manche Uhren haben. */
@Composable
private fun UhrAuswahl(
    titel: String,
    optionen: List<Pair<String, String>>,
    start: String,
    schluessel: Int,
    hinweis: String,
    stand: Int = 0,
    rueck: @Composable () -> Unit = {},
    onWahl: (String) -> Unit,
) {
    Text(titel, style = MaterialTheme.typography.labelMedium)
    var offen by remember(schluessel) { mutableStateOf(false) }
    var wert by remember(schluessel, start, stand) { mutableStateOf(start) }
    Box {
        OutlinedButton(onClick = { offen = true }, modifier = Modifier.fillMaxWidth()) {
            Text(optionen.firstOrNull { it.first == wert }?.second ?: wert)
        }
        DropdownMenu(expanded = offen, onDismissRequest = { offen = false }) {
            optionen.forEach { (id, lbl) ->
                DropdownMenuItem(text = { Text(lbl) }, onClick = {
                    offen = false
                    if (id != wert) { wert = id; onWahl(id) }
                })
            }
        }
    }
    // „Gespeichert"/Fehler direkt unter dem Regler, vor dem Hinweis — wie in der PWA.
    rueck()
    Text(hinweis, style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
}


// HUAWEI-Uhr (Beta, 07.10.2026): nur sichtbar, wenn Huawei Health auf dem Handy ist oder schon
// verbunden wurde — alle anderen sehen nichts davon. Die Uhren-App schickt ihre Aufnahmen ueber
// dieses Handy (HuaweiBruecke); hier verbindet man und sieht, ob etwas wartet oder klemmt.
@Composable
fun HuaweiKarte() {
    val ctx = LocalContext.current
    val st by HuaweiBruecke.stand.collectAsState()
    LaunchedEffect(Unit) { HuaweiBruecke.start(ctx) }
    if (!st.healthDa && !st.verbunden) return
    Card(Modifier.fillMaxWidth().padding(top = 8.dp)) {
        Column(Modifier.padding(16.dp)) {
            Text(I18n.t("huawei.title"), style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(4.dp))
            Text(I18n.t("huawei.body"), style = MaterialTheme.typography.bodyMedium)
            if (st.verbunden && st.uhren.isNotEmpty()) {
                Spacer(Modifier.height(6.dp))
                Text(I18n.t("huawei.connected").replace("{uhren}", st.uhren.joinToString(", ")),
                    style = MaterialTheme.typography.bodyMedium)
            }
            // Zwei Balken, unabhaengig voneinander und auch gleichzeitig: Uhr -> Handy (Dateien,
            // je ~5 s Aufnahme; die Uhr zeigt dieselbe Zahl) und Handy -> Server (Chunks).
            if (st.empfGesamt > 0 && st.empfFertig < st.empfGesamt) {
                // Meldet sich die Uhr mitten in einer Ladung nicht mehr, steht das da — sonst sieht
                // ein abgebrochener Transfer aus wie ein langsamer (Regel 13.09.: nicht stumm).
                var jetzt by remember { mutableLongStateOf(System.currentTimeMillis()) }
                LaunchedEffect(st.empfLetzteMs) {
                    while (true) { jetzt = System.currentTimeMillis(); kotlinx.coroutines.delay(5000) }
                }
                Spacer(Modifier.height(8.dp))
                Text(I18n.t("huawei.receiving").replace("{a}", st.empfFertig.toString())
                    .replace("{b}", st.empfGesamt.toString()), style = MaterialTheme.typography.bodyMedium)
                LinearProgressIndicator(progress = { st.empfAnteil },
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp))
                if (jetzt - st.empfLetzteMs > 30_000) {
                    Text(I18n.t("huawei.watchSilent"), style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 4.dp))
                }
            }
            if (st.laedt && st.hochGesamt > 0) {
                Spacer(Modifier.height(8.dp))
                Text(I18n.t("huawei.uploading").replace("{a}", st.hochFertig.toString())
                    .replace("{b}", st.hochGesamt.toString()), style = MaterialTheme.typography.bodyMedium)
                LinearProgressIndicator(progress = { (st.hochFertig.toFloat() / st.hochGesamt).coerceIn(0f, 1f) },
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp))
            } else if (st.offen > 0) {
                Spacer(Modifier.height(6.dp))
                Text(I18n.t("huawei.pending").replace("{n}", st.offen.toString()),
                    style = MaterialTheme.typography.bodyMedium)
            }
            // Fehler stehen sichtbar da, solange es sie gibt (Berechtigungen nie stumm scheitern).
            val fehler = when {
                st.fehler.isEmpty() -> ""
                st.fehler == "health" -> I18n.t("huawei.errHealth")
                st.fehler == "config" -> I18n.t("huawei.errConfig")
                st.fehler == "keine-uhr" -> I18n.t("huawei.errNoWatch")
                st.fehler == "abgelehnt" -> I18n.t("huawei.errDenied")
                else -> I18n.t("huawei.errOther").replace("{f}", st.fehler)
            }
            if (fehler.isNotEmpty()) {
                Spacer(Modifier.height(6.dp))
                Text(fehler, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error)
            }
            Spacer(Modifier.height(8.dp))
            // Upload haengt (Netz weg, Server-Fehler): von Hand neu anstossen. Bereits angekommene
            // Chunks fragt der Upload beim Server ab und schickt sie nicht noch einmal.
            if (st.offen > 0 && !st.laedt) {
                OutlinedButton(onClick = { HuaweiBruecke.hochladen(ctx) }) { Text(I18n.t("huawei.retry")) }
                Spacer(Modifier.height(4.dp))
            }
            if (st.verbunden) {
                OutlinedButton(onClick = { HuaweiBruecke.trennen(ctx) }) { Text(I18n.t("huawei.disconnect")) }
            } else {
                Button(onClick = { (ctx as? android.app.Activity)?.let { HuaweiBruecke.verbinden(it) } }) {
                    Text(I18n.t("huawei.connect"))
                }
            }
        }
    }
}
