package org.pumpfoil.app

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SessionsScreen() {
    var sessions by remember { mutableStateOf<List<SessionSummary>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    suspend fun load() {
        loading = true
        try { sessions = Api.sessions(); error = null }
        catch (e: Exception) { error = e.message }
        loading = false
    }
    LaunchedEffect(Unit) { load() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Sessions") },
                actions = {
                    IconButton(onClick = { scope.launch { load() } }) {
                        Icon(Icons.Filled.Refresh, contentDescription = "Aktualisieren")
                    }
                },
            )
        },
    ) { pad ->
        Box(Modifier.padding(pad).fillMaxSize()) {
            if (loading && sessions.isEmpty()) {
                CircularProgressIndicator(Modifier.align(Alignment.Center))
            } else {
                LazyColumn(Modifier.fillMaxSize()) {
                    error?.let { e ->
                        item { Text(e, Modifier.padding(16.dp), color = MaterialTheme.colorScheme.error) }
                    }
                    if (sessions.isEmpty() && !loading && error == null) {
                        item {
                            Text(
                                "Noch keine Sessions", Modifier.padding(16.dp),
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    items(sessions) { s ->
                        SessionRow(s)
                        HorizontalDivider()
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SessionRow(s: SessionSummary) {
    ListItem(
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

private fun prettyDate(iso: String): String = try {
    java.time.OffsetDateTime.parse(iso)
        .format(java.time.format.DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm"))
} catch (_: Exception) {
    try {
        java.time.LocalDateTime.parse(iso)
            .format(java.time.format.DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm"))
    } catch (_: Exception) { iso }
}
