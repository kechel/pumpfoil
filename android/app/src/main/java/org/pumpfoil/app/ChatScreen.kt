package org.pumpfoil.app

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Forum
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

@Composable
fun ChatScreen() {
    var room by remember { mutableStateOf<ChatRoom?>(null) }
    val r = room
    if (r == null) ChatRoomsList(onOpen = { room = it })
    else ChatRoomView(r, onBack = { room = null })
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ChatRoomsList(onOpen: (ChatRoom) -> Unit) {
    var rooms by remember { mutableStateOf<List<ChatRoom>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    suspend fun load() {
        loading = true
        try { rooms = Api.chatRooms(); error = null }
        catch (e: Exception) { error = e.message }
        loading = false
    }
    LaunchedEffect(Unit) { load() }

    Scaffold(topBar = { PumpfoilTopBar(I18n.t("nav.chat")) }) { pad ->
        androidx.compose.foundation.layout.Box(Modifier.padding(pad).fillMaxSize()) {
            if (loading && rooms.isEmpty()) {
                CircularProgressIndicator(Modifier.align(Alignment.Center))
            } else {
                LazyColumn(Modifier.fillMaxSize()) {
                    error?.let { e -> item { Text(e, Modifier.padding(16.dp), color = MaterialTheme.colorScheme.error) } }
                    if (rooms.isEmpty() && !loading && error == null) {
                        item { Text(I18n.t("chat.empty"), Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    }
                    items(rooms) { r ->
                        ListItem(
                            modifier = Modifier.clickable { onOpen(r) },
                            headlineContent = { Text(r.label.ifBlank { r.scope }) },
                            supportingContent = { if (r.lastText.isNotBlank()) Text(r.lastText, maxLines = 1) },
                            leadingContent = { Icon(Icons.Filled.Forum, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
                            trailingContent = { if (r.unread > 0) Text(r.unread.toString(), color = MaterialTheme.colorScheme.primary) },
                        )
                        HorizontalDivider()
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ChatRoomView(room: ChatRoom, onBack: () -> Unit) {
    var msgs by remember { mutableStateOf<List<ChatMsg>>(emptyList()) }
    var input by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    suspend fun load() {
        try { msgs = Api.chatLatest(room.scope); error = null }
        catch (e: Exception) { error = e.message }
    }
    LaunchedEffect(room.scope) { load() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(room.label.ifBlank { room.scope }) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Zurück")
                    }
                },
            )
        },
        bottomBar = {
            Row(
                Modifier.fillMaxWidth().padding(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                OutlinedTextField(
                    value = input, onValueChange = { input = it },
                    modifier = Modifier.weight(1f),
                    placeholder = { Text("${I18n.t("chat.placeholder")}…") }, maxLines = 3,
                )
                IconButton(onClick = {
                    val t = input.trim()
                    if (t.isEmpty() || sending) return@IconButton
                    sending = true
                    scope.launch {
                        try { Api.chatPost(room.scope, t); input = ""; load() }
                        catch (e: Exception) { error = e.message }
                        sending = false
                    }
                }) { Icon(Icons.AutoMirrored.Filled.Send, contentDescription = I18n.t("chat.send"), tint = MaterialTheme.colorScheme.primary) }
            }
        },
    ) { pad ->
        LazyColumn(Modifier.padding(pad).fillMaxSize().padding(horizontal = 12.dp)) {
            error?.let { e -> item { Text(e, color = MaterialTheme.colorScheme.error) } }
            items(msgs) { m ->
                Column(Modifier.padding(vertical = 6.dp)) {
                    Text(m.name ?: "—", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                    Text(m.text)
                }
            }
        }
    }
}
