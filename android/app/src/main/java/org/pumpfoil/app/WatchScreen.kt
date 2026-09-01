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
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Zurück") }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackHost) },
    ) { pad ->
        Column(Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
            WatchCard(ctx)
            Spacer(Modifier.height(8.dp))
            PairedDevicesCard(onSaved = { scope.launch { snackHost.showSnackbar(I18n.t("common.saved")) } })
            Spacer(Modifier.height(4.dp))
            // Anleitung GANZ OBEN in der Liste: wer hier landet und die Uhr noch nicht
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
    LaunchedEffect(zeigeAusgeblendete, neuLaden) {
        devices = try { Api.myDevices(includeHidden = zeigeAusgeblendete) } catch (_: Exception) { emptyList() }
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
                Spacer(Modifier.height(6.dp))
                Text(I18n.t("account.recordMode"), style = MaterialTheme.typography.labelMedium)
                var open by remember(d.id) { mutableStateOf(false) }
                var mode by remember(d.id) { mutableStateOf(d.recordMode) }
                Box {
                    OutlinedButton(onClick = { open = true }, modifier = Modifier.fillMaxWidth()) {
                        Text(modes.firstOrNull { it.first == mode }?.second ?: mode)
                    }
                    DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                        modes.forEach { (id, lbl) ->
                            DropdownMenuItem(text = { Text(lbl) }, onClick = {
                                open = false
                                if (id != mode) { mode = id; scope.launch { try { Api.setDeviceRecordMode(d.id, id); onSaved() } catch (_: Exception) {} } }
                            })
                        }
                    }
                }
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
                // Amazfit holt sich den Modus gar nicht ab (watch-zepp/app-side/index.js reicht ihn
                // nicht durch) -> ehrlich dranschreiben statt den Regler wirkungslos anbieten.
                if (d.platform == "zepp") {
                    Text(I18n.t("account.recordModeZeppHint"), style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.tertiary, modifier = Modifier.padding(top = 4.dp))
                }
                // Satellitensysteme — nur Garmin. Der groesste Akku-Hebel (s. Changelog 17.08.).
                if (d.platform == "garmin") {
                    Spacer(Modifier.height(10.dp))
                    Text(I18n.t("account.gnssMode"), style = MaterialTheme.typography.labelMedium)
                    var gnssOffen by remember(d.id) { mutableStateOf(false) }
                    var gnss by remember(d.id) { mutableStateOf(d.gnssMode ?: "best") }
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
                                        scope.launch {
                                            try { Api.setDeviceGnssMode(d.id, id); onSaved() } catch (_: Exception) {}
                                        }
                                    }
                                })
                            }
                        }
                    }
                    Text(I18n.t("account.gnssModeHint"), style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
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
