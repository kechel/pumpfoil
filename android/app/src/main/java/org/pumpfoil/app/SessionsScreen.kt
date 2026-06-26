package org.pumpfoil.app

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
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
import kotlinx.coroutines.launch
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

private enum class Scope { MINE, SPOT, ALL }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SessionsScreen(onOpen: (Int) -> Unit) {
    var scope by remember { mutableStateOf(Scope.MINE) }
    var homespot by remember { mutableStateOf("") }
    var spot by remember { mutableStateOf("") }          // aktiver Spot (für SPOT-Scope)
    var spotInput by remember { mutableStateOf("") }     // Eingabefeld
    var own by remember { mutableStateOf<List<SessionSummary>>(emptyList()) }
    var feed by remember { mutableStateOf<List<CommunityItem>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val tick by WatchSync.tick.collectAsState()

    LaunchedEffect(Unit) {
        homespot = try { Api.settings()["homespot"]?.jsonPrimitive?.contentOrNull ?: "" } catch (_: Exception) { "" }
    }

    suspend fun load() {
        loading = true
        try {
            when (scope) {
                Scope.MINE -> own = Api.sessions()
                Scope.ALL -> feed = Api.communitySessions()
                Scope.SPOT -> feed = if (spot.isNotBlank()) Api.spotSessions(spot) else emptyList()
            }
            error = null
        } catch (e: Exception) { error = e.message }
        loading = false
    }
    LaunchedEffect(scope, spot, tick) { load() }

    Scaffold(
        topBar = {
            val title = when (scope) {
                Scope.MINE -> "${I18n.t("nav.sessions")} · ${I18n.t("sessions.mine")}"
                Scope.ALL -> "${I18n.t("nav.sessions")} · ${I18n.t("sessions.all")}"
                Scope.SPOT -> "${I18n.t("nav.sessions")} · 📍${spot}"
            }
            TopAppBar(title = { Text(title) }, actions = { SyncIndicator() })
        },
    ) { pad ->
        val scopeC = rememberCoroutineScope()
        Column(Modifier.padding(pad).fillMaxSize()) {
            // Scope-Umschalter + Spotsuche.
            Row(
                Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                FilterChip(selected = scope == Scope.MINE, onClick = { scope = Scope.MINE }, label = { Text(I18n.t("sessions.mine")) })
                if (homespot.isNotBlank()) {
                    FilterChip(
                        selected = scope == Scope.SPOT && spot == homespot,
                        onClick = { spot = homespot; scope = Scope.SPOT },
                        label = { Text("📍$homespot") },
                    )
                }
                FilterChip(selected = scope == Scope.ALL, onClick = { scope = Scope.ALL }, label = { Text(I18n.t("sessions.all")) })
            }
            OutlinedTextField(
                value = spotInput, onValueChange = { spotInput = it },
                label = { Text(I18n.t("sessions.searchSpot")) }, singleLine = true,
                trailingIcon = {
                    IconButton(onClick = { if (spotInput.isNotBlank()) { spot = spotInput.trim(); scope = Scope.SPOT } }) {
                        Icon(Icons.Filled.Search, contentDescription = "Suchen")
                    }
                },
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
            )
            Box(Modifier.fillMaxSize()) {
                Refreshable(refreshing = loading, onRefresh = { scopeC.launch { load() } }) {
                    val empty = (scope == Scope.MINE && own.isEmpty()) || (scope != Scope.MINE && feed.isEmpty())
                    if (loading && empty) {
                        CircularProgressIndicator(Modifier.align(Alignment.Center))
                    } else {
                        LazyColumn(Modifier.fillMaxSize()) {
                            error?.let { e -> item { Text(e, Modifier.padding(16.dp), color = MaterialTheme.colorScheme.error) } }
                            if (empty && !loading && error == null) {
                                item { Text(I18n.t("sessions.empty"), Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
                            }
                            if (scope == Scope.MINE) {
                                items(own) { s -> SessionRow(s, onClick = { onOpen(s.id) }); HorizontalDivider() }
                            } else {
                                items(feed) { c -> CommunityItemRow(c, onClick = { onOpen(c.id) }); HorizontalDivider() }
                            }
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SessionRow(s: SessionSummary, onClick: () -> Unit) {
    ListItem(
        modifier = Modifier.clickable(onClick = onClick),
        headlineContent = { Text(prettyDate(s.startedAt)) },
        supportingContent = {
            val sub = s.placeName?.takeIf { it.isNotBlank() } ?: s.caption?.takeIf { it.isNotBlank() }
            if (sub != null) Text(sub)
        },
        leadingContent = {
            Icon(Icons.Filled.LocationOn, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
        },
        trailingContent = {
            if (s.likeCount > 0) {
                Icon(Icons.Filled.Favorite, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            }
        },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CommunityItemRow(c: CommunityItem, onClick: () -> Unit) {
    ListItem(
        modifier = Modifier.clickable(onClick = onClick),
        headlineContent = { Text(c.name ?: prettyDate(c.startedAt)) },
        supportingContent = {
            Text(prettyDate(c.startedAt) + (c.spot?.let { " · $it" } ?: ""))
        },
        leadingContent = {
            Icon(Icons.Filled.LocationOn, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
        },
        trailingContent = {
            if (c.likeCount > 0) {
                Icon(Icons.Filled.Favorite, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            }
        },
    )
}

fun prettyDate(iso: String): String = try {
    java.time.OffsetDateTime.parse(iso)
        .format(java.time.format.DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm"))
} catch (_: Exception) {
    try {
        java.time.LocalDateTime.parse(iso)
            .format(java.time.format.DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm"))
    } catch (_: Exception) { iso }
}
