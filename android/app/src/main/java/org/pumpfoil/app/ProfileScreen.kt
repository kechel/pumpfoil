package org.pumpfoil.app

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Calculate
import androidx.compose.material.icons.automirrored.filled.CompareArrows
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.QueryStats
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Surfing
import androidx.compose.material.icons.filled.Vibration
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Watch
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
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
import kotlinx.coroutines.launch
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(onLogout: () -> Unit, onFoilCalc: () -> Unit = {}, onFoils: () -> Unit = {}, onFoilStats: () -> Unit = {}, onWatch: () -> Unit = {}, onSettings: () -> Unit = {}, onCompare: () -> Unit = {}, onAccounts: () -> Unit = {}, onImprint: () -> Unit = {}) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var profile by remember { mutableStateOf<Profile?>(null) }
    var editing by remember { mutableStateOf(false) }
    var draftName by remember { mutableStateOf("") }
    var confirmingDelete by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        profile = try { Api.me() } catch (e: Exception) { null }
    }
    val avatarPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) scope.launch {
            val bytes = withContext(Dispatchers.IO) { ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() } }
            if (bytes != null) {
                try { Api.uploadAvatar(bytes); profile = Api.me() } catch (_: Exception) {}
            }
        }
    }

    if (editing) {
        AlertDialog(
            onDismissRequest = { editing = false },
            title = { Text(I18n.t("profile.editName")) },
            text = {
                OutlinedTextField(value = draftName, onValueChange = { draftName = it }, singleLine = true)
            },
            confirmButton = {
                TextButton(onClick = {
                    val n = draftName.trim()
                    editing = false
                    if (n.isNotEmpty()) scope.launch {
                        try { profile = Api.updateDisplayName(n) } catch (_: Exception) {}
                    }
                }) { Text(I18n.t("common.save")) }
            },
            dismissButton = { TextButton(onClick = { editing = false }) { Text(I18n.t("common.cancel")) } },
        )
    }
    Scaffold(topBar = { PumpfoilTopBar(I18n.t("nav.profile")) { SyncIndicator() } }) { pad ->
        Column(Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                val avatar = Api.mediaUrl(profile?.avatarUrl)
                val pickAvatar = { avatarPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
                if (avatar != null) {
                    AsyncImage(
                        model = avatar,
                        contentDescription = "Profilbild ändern",
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.size(56.dp).clip(CircleShape).clickable { pickAvatar() },
                    )
                } else {
                    Icon(
                        Icons.Filled.AccountCircle, contentDescription = "Profilbild hinzufügen",
                        modifier = Modifier.size(56.dp).clip(CircleShape).clickable { pickAvatar() },
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f)) {
                    Text(profile?.displayName ?: "—", style = MaterialTheme.typography.titleLarge)
                    profile?.email?.let {
                        Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                IconButton(onClick = { draftName = profile?.displayName ?: ""; editing = true }) {
                    Icon(Icons.Filled.Edit, contentDescription = "Anzeigename ändern")
                }
            }
            Spacer(Modifier.height(20.dp))
            // Übersicht wie die PWA: nur EIN „Uhr"-Eintrag (koppeln/Alarm/Datenseiten dahinter)
            // + darunter „Verknüpfte Konten". Kein Wear-Status/Garmin direkt in der Übersicht.
            ListItem(
                modifier = Modifier.clickable { onWatch() },
                headlineContent = { Text(I18n.t("nav.watch")) },
                supportingContent = { Text(I18n.t("watch.sectionSub")) },
                leadingContent = { Icon(Icons.Filled.Watch, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
                trailingContent = { Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null) },
            )
            ListItem(
                modifier = Modifier.clickable { onAccounts() },
                headlineContent = { Text(I18n.t("accounts.title")) },
                supportingContent = { Text(I18n.t("accounts.sub")) },
                leadingContent = { Icon(Icons.Filled.Link, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
                trailingContent = { Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null) },
            )
            ListItem(
                modifier = Modifier.clickable { onFoils() },
                headlineContent = { Text(I18n.t("profile.foils")) },
                supportingContent = { Text(I18n.t("profile.foilsSub")) },
                leadingContent = { Icon(Icons.Filled.Surfing, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
                trailingContent = { Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null) },
            )
            ListItem(
                modifier = Modifier.clickable { onFoilCalc() },
                headlineContent = { Text(I18n.t("profile.calc")) },
                supportingContent = { Text(I18n.t("profile.calcSub")) },
                leadingContent = { Icon(Icons.Filled.Calculate, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
                trailingContent = { Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null) },
            )
            ListItem(
                modifier = Modifier.clickable { onFoilStats() },
                headlineContent = { Text(I18n.t("profile.stats")) },
                supportingContent = { Text(I18n.t("profile.statsSub")) },
                leadingContent = { Icon(Icons.Filled.QueryStats, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
                trailingContent = { Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null) },
            )
            ListItem(
                modifier = Modifier.clickable { onCompare() },
                headlineContent = { Text(I18n.t("profile.compare")) },
                supportingContent = { Text(I18n.t("profile.compareSub")) },
                leadingContent = { Icon(Icons.AutoMirrored.Filled.CompareArrows, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
                trailingContent = { Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null) },
            )
            ListItem(
                modifier = Modifier.clickable { onSettings() },
                headlineContent = { Text(I18n.t("settings.title")) },
                supportingContent = {
                    Text("${I18n.t("settings.weight")}, ${I18n.t("settings.homespot")}, ${I18n.t("settings.design")}, ${I18n.t("settings.notifications")}")
                },
                leadingContent = { Icon(Icons.Filled.Settings, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
                trailingContent = { Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null) },
            )
            ListItem(
                modifier = Modifier.clickable { onImprint() },
                headlineContent = { Text(I18n.t("nav.imprint")) },
                leadingContent = { Icon(Icons.Filled.Info, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
                trailingContent = { Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null) },
            )
            Spacer(Modifier.height(24.dp))
            Button(
                onClick = { Api.logout(ctx); onLogout() },
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
            ) {
                Text(I18n.t("profile.logout"))
            }
            // Konto-Löschung (Google-Play-Pflicht, analog Apple 5.1.1(v)): DSGVO-Delete + Logout.
            Spacer(Modifier.height(8.dp))
            TextButton(onClick = { confirmingDelete = true }) {
                Text(I18n.t("profile.deleteAccount"), color = MaterialTheme.colorScheme.error)
            }
            Spacer(Modifier.height(16.dp))
            Text(
                "Pumpfoil v${BuildConfig.VERSION_NAME}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            // Nur Debug: App-Rating-Dialog neu triggerbar machen (Test-Flags löschen).
            if (BuildConfig.DEBUG) {
                TextButton(onClick = {
                    ctx.getSharedPreferences("pumpfoil", android.content.Context.MODE_PRIVATE).edit()
                        .remove("rating_done").remove("rating_snooze").remove("rating_min_count").remove("rating_fb_count").apply()
                }) { Text("↻ Rating-Test zurücksetzen") }
            }
            // Platz, damit der letzte Button nicht hinter der Mobile-Bottom-Nav klebt.
            Spacer(Modifier.height(96.dp))
        }
    }

    if (confirmingDelete) {
        AlertDialog(
            onDismissRequest = { confirmingDelete = false },
            title = { Text(I18n.t("profile.deleteAccount")) },
            text = { Text(I18n.t("profile.deleteConfirm")) },
            confirmButton = {
                TextButton(onClick = {
                    confirmingDelete = false
                    scope.launch {
                        try { Api.deleteAccount() } catch (_: Exception) {}
                        Api.logout(ctx); onLogout()
                    }
                }) { Text(I18n.t("profile.deleteConfirmBtn"), color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { confirmingDelete = false }) { Text(I18n.t("common.cancel")) } },
        )
    }
}
