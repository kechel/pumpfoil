package org.pumpfoil.app

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.EmojiEvents
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CommunityScreen(onOpen: (Int) -> Unit, onRecords: () -> Unit = {}) {
    var items by remember { mutableStateOf<List<CommunityItem>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    suspend fun load() {
        loading = true
        try { items = Api.communitySessions(); error = null }
        catch (e: Exception) { error = e.message }
        loading = false
    }
    LaunchedEffect(Unit) { load() }

    Scaffold(
        topBar = {
            PumpfoilTopBar(I18n.t("nav.community")) {
                IconButton(onClick = onRecords) {
                    Icon(Icons.Filled.EmojiEvents, contentDescription = I18n.t("home.records"))
                }
                SyncIndicator()
            }
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
                        // Reiche Karte (Avatar, Stats, Track-Vorschau, Thumbnail) — wie Sessions Alle/Spot.
                        items(items) { c ->
                            CommunityItemRow(c, Modifier.padding(horizontal = 12.dp, vertical = 5.dp)) { onOpen(c.id) }
                        }
                    }
                }
            }
        }
    }
}
