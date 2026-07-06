package org.pumpfoil.app

import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Forum
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.NotificationsOff
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.AlertDialog
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
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.text.ClickableText
import coil.compose.AsyncImage
import kotlinx.coroutines.isActive
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

@OptIn(ExperimentalMaterial3Api::class, androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
private fun ChatRoomView(room: ChatRoom, onBack: () -> Unit) {
    var msgs by remember { mutableStateOf<List<ChatMsg>>(emptyList()) }
    var input by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var actionMsg by remember { mutableStateOf<ChatMsg?>(null) }   // Long-Press -> Aktionsauswahl
    var editMsg by remember { mutableStateOf<ChatMsg?>(null) }     // Bearbeiten-Dialog
    var editText by remember { mutableStateOf("") }
    var showDict by remember { mutableStateOf(false) }            // Diktat-Vollbild
    var isAdmin by remember { mutableStateOf(false) }
    var push by remember { mutableStateOf(false) }
    var confirmLeave by remember { mutableStateOf(false) }
    var lastId by remember(room.scope) { mutableStateOf(0) }
    val scope = rememberCoroutineScope()

    suspend fun load() {
        try {
            val rows = Api.chatLatest(room.scope, limit = 100); msgs = rows; error = null
            lastId = rows.maxOfOrNull { it.id } ?: 0
            if (lastId > 0) runCatching { Api.chatMarkRead(room.scope, lastId) }
        } catch (e: Exception) { error = e.message }
    }
    LaunchedEffect(room.scope) {
        isAdmin = runCatching { Api.me().isAdmin }.getOrDefault(false)
        push = runCatching { Api.chatRoomState(room.scope).push }.getOrDefault(false)
        load()
        // Live-Polling neuer Nachrichten (~10 s) + Lesestand, wie die Web-PWA.
        while (isActive) {
            kotlinx.coroutines.delay(10_000)
            runCatching {
                val since = Api.chatSince(room.scope, lastId)
                val known = msgs.map { it.id }.toSet()
                val add = since.filter { it.id !in known }
                if (add.isNotEmpty()) {
                    msgs = msgs + add
                    lastId = msgs.maxOf { it.id }
                    Api.chatMarkRead(room.scope, lastId)
                }
            }
        }
    }

    if (showDict) {
        DictationOverlay(
            existing = input,
            title = room.label.ifBlank { room.scope },
            onDismiss = { showDict = false },
            onResult = { text, send ->
                showDict = false
                val t = (if (input.isBlank()) text else "$input $text").trim()
                if (send) {
                    if (t.isNotEmpty()) scope.launch { try { Api.chatPost(room.scope, t); input = ""; load() } catch (e: Exception) { error = e.message } }
                } else {
                    input = t
                }
            },
        )
    }

    // Aktions-Auswahl je Nachricht: eigene <1 h → Bearbeiten/Löschen; fremde → Melden;
    // Admin → Aus-/Einblenden + Nutzer stummschalten.
    actionMsg?.let { m ->
        val editable = m.mine && withinEditWindow(m.createdAt)
        AlertDialog(
            onDismissRequest = { actionMsg = null },
            title = { Text(m.text, maxLines = 2) },
            text = {
                Column {
                    if (editable) {
                        TextButton(onClick = { editText = m.text; editMsg = m; actionMsg = null }) { Text(I18n.t("chat.edit")) }
                        TextButton(onClick = {
                            val id = m.id; actionMsg = null
                            scope.launch { try { Api.chatDelete(id); load() } catch (e: Exception) { error = e.message } }
                        }) { Text(I18n.t("common.delete"), color = MaterialTheme.colorScheme.error) }
                    }
                    if (!m.mine) {
                        TextButton(onClick = { val id = m.id; actionMsg = null; scope.launch { runCatching { Api.chatReport(id) } } }) { Text(I18n.t("chat.report")) }
                    }
                    if (isAdmin) {
                        TextButton(onClick = {
                            val id = m.id; val h = !m.hidden; actionMsg = null
                            scope.launch { runCatching { Api.chatHide(id, h) }; load() }
                        }) { Text(I18n.t(if (m.hidden) "chat.unhide" else "chat.hide")) }
                        if (!m.mine) TextButton(onClick = {
                            val uid = m.userId; actionMsg = null; scope.launch { runCatching { Api.chatSetReadonly(uid, true) } }
                        }) { Text(I18n.t("chat.readonly"), color = MaterialTheme.colorScheme.error) }
                    }
                }
            },
            confirmButton = {},
            dismissButton = { TextButton(onClick = { actionMsg = null }) { Text(I18n.t("common.cancel")) } },
        )
    }
    if (confirmLeave) {
        AlertDialog(
            onDismissRequest = { confirmLeave = false },
            title = { Text(I18n.t("chat.leave")) },
            text = { Text(I18n.t("chat.leaveConfirm")) },
            confirmButton = {
                TextButton(onClick = { confirmLeave = false; scope.launch { runCatching { Api.chatLeave(room.scope) }; onBack() } }) {
                    Text(I18n.t("chat.leave"), color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = { TextButton(onClick = { confirmLeave = false }) { Text(I18n.t("common.cancel")) } },
        )
    }
    editMsg?.let { m ->
        AlertDialog(
            onDismissRequest = { editMsg = null },
            title = { Text(I18n.t("chat.edit")) },
            text = {
                OutlinedTextField(value = editText, onValueChange = { editText = it }, maxLines = 4)
            },
            confirmButton = {
                TextButton(onClick = {
                    val id = m.id; val t = editText.trim(); editMsg = null
                    if (t.isNotEmpty()) scope.launch { try { Api.chatEdit(id, t); load() } catch (e: Exception) { error = e.message } }
                }) { Text(I18n.t("common.save")) }
            },
            dismissButton = { TextButton(onClick = { editMsg = null }) { Text(I18n.t("common.cancel")) } },
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(room.label.ifBlank { room.scope }) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Zurück")
                    }
                },
                actions = {
                    // Abonnieren (Push) + Verlassen — wie Web-Chat.
                    IconButton(onClick = { scope.launch { push = runCatching { Api.chatSubscribe(room.scope, !push) }.getOrDefault(push) } }) {
                        Icon(
                            if (push) Icons.Filled.Notifications else Icons.Filled.NotificationsOff,
                            contentDescription = I18n.t("chat.subscribe"),
                            tint = if (push) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    IconButton(onClick = { confirmLeave = true }) {
                        Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = I18n.t("chat.leave"))
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
                IconButton(onClick = { showDict = true }) {
                    Icon(Icons.Filled.Mic, contentDescription = I18n.t("dict.button"), tint = MaterialTheme.colorScheme.primary)
                }
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
                val editable = m.mine && withinEditWindow(m.createdAt)
                val hasActions = editable || !m.mine || isAdmin   // Long-Press-Menü sinnvoll?
                Row(
                    Modifier.fillMaxWidth()
                        .combinedClickable(enabled = hasActions, onClick = {}, onLongClick = { actionMsg = m })
                        .padding(vertical = 6.dp)
                        .then(if (m.hidden) Modifier.alpha(0.5f) else Modifier),
                    verticalAlignment = Alignment.Top,
                ) {
                    val av = Api.mediaUrl(m.avatarUrl)
                    if (av != null) {
                        AsyncImage(model = av, contentDescription = null, contentScale = ContentScale.Crop,
                            modifier = Modifier.size(32.dp).clip(CircleShape))
                    } else {
                        Icon(Icons.Filled.Person, contentDescription = null, tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(32.dp))
                    }
                    Spacer(Modifier.width(8.dp))
                    Column(Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(m.name ?: "—", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
                            hhmmChat(m.createdAt)?.let {
                                Spacer(Modifier.width(6.dp))
                                Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                        LinkifiedText(m.text)
                    }
                }
            }
            item {
                Text(
                    I18n.t("chat.editHint"),
                    Modifier.padding(vertical = 10.dp),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

// Nachrichtentext mit klickbaren Links (wie Web-linkify).
@Composable
private fun LinkifiedText(text: String) {
    val uriHandler = LocalUriHandler.current
    val primary = MaterialTheme.colorScheme.primary
    val annotated = buildAnnotatedString {
        val regex = Regex("""https?://\S+""")
        var last = 0
        for (mr in regex.findAll(text)) {
            append(text.substring(last, mr.range.first))
            pushStringAnnotation("URL", mr.value)
            withStyle(SpanStyle(color = primary, textDecoration = TextDecoration.Underline)) { append(mr.value) }
            pop()
            last = mr.range.last + 1
        }
        append(text.substring(last))
    }
    ClickableText(
        text = annotated,
        style = LocalTextStyle.current.copy(color = LocalContentColor.current),
        onClick = { off -> annotated.getStringAnnotations("URL", off, off).firstOrNull()?.let { uriHandler.openUri(it.item) } },
    )
}

// Zeitstempel wie im Web (dd.MM. HH:mm).
private fun hhmmChat(iso: String?): String? {
    if (iso.isNullOrBlank()) return null
    return try {
        java.time.OffsetDateTime.parse(iso).toLocalDateTime()
            .format(java.time.format.DateTimeFormatter.ofPattern("dd.MM. HH:mm"))
    } catch (_: Exception) {
        try {
            java.time.LocalDateTime.parse(iso)
                .format(java.time.format.DateTimeFormatter.ofPattern("dd.MM. HH:mm"))
        } catch (_: Exception) { null }
    }
}

// Eigene Nachricht < 1 h -> bearbeitbar/löschbar (Server erzwingt es ohnehin; hier nur UI-Gate).
private fun withinEditWindow(createdAt: String?): Boolean {
    if (createdAt == null) return false
    return try {
        val t = java.time.OffsetDateTime.parse(createdAt).toInstant()
        java.time.Duration.between(t, java.time.Instant.now()).seconds < 3600
    } catch (_: Exception) {
        try {
            val t = java.time.LocalDateTime.parse(createdAt).toInstant(java.time.ZoneOffset.UTC)
            java.time.Duration.between(t, java.time.Instant.now()).seconds < 3600
        } catch (_: Exception) { true }
    }
}
