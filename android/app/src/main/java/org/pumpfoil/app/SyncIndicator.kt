package org.pumpfoil.app

import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp

// Sync-Indikator oben rechts: zeigt Uhr-Verbindung (farbig), Sync läuft (Spinner);
// Tap stößt einen Sync an.
@Composable
fun SyncIndicator() {
    val ctx = LocalContext.current
    val syncing by WatchSync.syncing.collectAsState()
    val connected by WatchSync.connected.collectAsState()
    LaunchedEffect(Unit) { WatchSync.refreshConnection(ctx) }
    IconButton(onClick = { WatchSync.sync(ctx) }) {
        if (syncing) {
            CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
        } else {
            Icon(
                Icons.Filled.Refresh,
                contentDescription = "Sync",
                tint = if (connected) MaterialTheme.colorScheme.primary
                else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
