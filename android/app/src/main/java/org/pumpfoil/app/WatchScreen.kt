package org.pumpfoil.app

import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Vibration
import androidx.compose.material.icons.filled.Watch
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
    LaunchedEffect(Unit) { devices = try { Api.myDevices() } catch (_: Exception) { emptyList() } }
    val active = devices?.filter { it.revokedAt == null } ?: return
    if (active.isEmpty()) return

    val modes = listOf(
        "full" to I18n.t("account.recordModeFull"),
        "lite" to I18n.t("account.recordModeLite"),
        "gps" to I18n.t("account.recordModeGps"),
    )
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp)) {
            Text(I18n.t("account.devicesTitle"), style = MaterialTheme.typography.titleMedium)
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
            }
        }
    }
}
