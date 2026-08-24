package org.pumpfoil.app

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Forum
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

// Sessions eines Spots (Tippen auf einen Pin/Eintrag in den Spots) — reiche Karten wie der Feed.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SpotSessionsScreen(spot: String, onBack: () -> Unit, onOpen: (Int) -> Unit, onSpotChat: (String) -> Unit = {}, social: Boolean = true) {
    var items by remember(spot) { mutableStateOf<List<CommunityItem>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    // Automatik „Spot ohne eine einzige Session mit Beschleunigungsdaten": statt einer leeren Liste
    // einmal mit accel_only=false nachfragen und dann alle zeigen. Beide Werte hängen an `spot` ->
    // beim Spot-Wechsel/Verlassen ist das wieder weg (NICHT gemerkt), es gilt wieder der Default.
    var showAll by remember(spot) { mutableStateOf(false) }
    var autoTried by remember(spot) { mutableStateOf(false) }
    // Spot-Beschreibungen haengen an der spot_id, hierher kommt aber nur der NAME (die Navigation
    // ist namensbasiert). Einmal die Karte holen und zuordnen; ohne Spot-Zeile (Altbestand) bleibt
    // es null und der Abschnitt entfaellt.
    var spotId by remember(spot) { mutableStateOf<Int?>(null) }
    LaunchedEffect(spot) {
        spotId = try { Api.spotMap(accelOnly = false).firstOrNull { it.spot == spot }?.spotId }
                 catch (_: Exception) { null }
    }

    suspend fun load() {
        loading = true
        try {
            // Default wie die PWA (useAccelDefault): „nur Accel", wenn der Nutzer selbst
            // Accel-Läufe hat, sonst „alle".
            val only = if (showAll) false else AccelDefault.preferred()
            var rows = Api.spotSessions(spot, accelOnly = only)
            if (only && rows.isEmpty() && !autoTried) {
                autoTried = true
                val all = Api.spotSessions(spot, accelOnly = false)
                if (all.isNotEmpty()) { showAll = true; rows = all }
            }
            items = rows
            error = null
        } catch (e: Exception) { error = e.message }
        loading = false
    }
    LaunchedEffect(spot) { load() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("📍 $spot") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Zurück")
                    }
                },
                actions = {
                    // Spot-Chat (scope "spot:<name>", wie PWA/iOS) — bei Age-Gate (social=false) aus.
                    if (social) IconButton(onClick = { onSpotChat(spot) }) {
                        Icon(Icons.Filled.Forum, contentDescription = I18n.t("nav.chat"), tint = MaterialTheme.colorScheme.primary)
                    }
                },
            )
        },
    ) { pad ->
        val scope = rememberCoroutineScope()
        Box(Modifier.padding(pad)) {
            Refreshable(refreshing = loading, onRefresh = { scope.launch { load() } }) {
                if (loading && items.isEmpty()) {
                    CircularProgressIndicator(Modifier.align(Alignment.Center))
                } else {
                    LazyColumn(Modifier.fillMaxSize()) {
                        error?.let { e -> item { Text(e, Modifier.padding(16.dp), color = MaterialTheme.colorScheme.error) } }
                        // Beschreibungen ueber der Session-Liste (wie im Web: erst der Spot, dann
                        // was dort gefahren wurde).
                        spotId?.let { sid -> item { SpotNotesSection(sid) } }
                        if (items.isEmpty() && !loading && error == null) {
                            item { Text(I18n.t("sessions.empty"), Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
                        }
                        items(items) { c ->
                            CommunityItemRow(c, Modifier.padding(horizontal = 12.dp, vertical = 5.dp)) { onOpen(c.id) }
                        }
                    }
                }
            }
        }
    }
}
