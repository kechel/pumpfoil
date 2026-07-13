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
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Forum
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.NotificationsOff
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Place
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
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
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

// Öffentlicher Einstieg in einen bestimmten Chatraum per scope (Spot-/Session-Chat) von
// außerhalb des Chat-Tabs — generisch für alle Direkt-Links (Spot-Buttons, Home „Meine Chats").
@Composable
fun ChatRoomByScope(scope: String, label: String, onBack: () -> Unit) {
    ChatRoomView(ChatRoom(scope = scope, label = label), onBack = onBack)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ChatRoomsList(onOpen: (ChatRoom) -> Unit) {
    var rooms by remember { mutableStateOf<List<ChatRoom>>(emptyList()) }
    var allSpots by remember { mutableStateOf<List<SpotChat>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var tab by remember { mutableStateOf(0) }   // 0 = Meine, 1 = Spot-Chats
    var q by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<DmUser>>(emptyList()) }
    var blockedUsers by remember { mutableStateOf<List<DmUser>>(emptyList()) }   // zum Entblocken
    var showBlocked by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    suspend fun load() {
        loading = true
        try { rooms = Api.chatRooms(); error = null }
        catch (e: Exception) { error = e.message }
        loading = false
    }
    LaunchedEffect(Unit) {
        load()
        allSpots = runCatching { Api.chatAllSpots() }.getOrDefault(emptyList())
        blockedUsers = runCatching { Api.chatBlocks() }.getOrDefault(emptyList())
    }
    // Globale Suche (Personen), leicht entprellt; Spots werden clientseitig gefiltert.
    LaunchedEffect(q) {
        val term = q.trim()
        if (term.isEmpty()) { results = emptyList(); return@LaunchedEffect }
        kotlinx.coroutines.delay(250)
        results = runCatching { Api.chatSearchUsers(term) }.getOrDefault(emptyList())
    }

    val term = q.trim()
    val joined = rooms.map { it.scope }.toSet()                        // Spots, in denen man drin ist
    val subscribed = rooms.filter { it.push }.map { it.scope }.toSet()  // abonniert → Glocke
    val blockedIds = blockedUsers.map { it.id }.toSet()
    // Blockierte DM-Chats gar nicht in „Meine" listen (nur unten in der Blockiert-Liste).
    val visibleRooms = rooms.filter { !(it.kind == "dm" && (it.other?.id ?: 0) in blockedIds) }
    val spotsSorted = allSpots.sortedByDescending { it.messages }      // aktivste zuerst
    val spotsShown = if (term.isEmpty()) spotsSorted
                     else spotsSorted.filter { it.label.contains(term, ignoreCase = true) }

    val openDm: (DmUser) -> Unit = { u ->
        scope.launch {
            runCatching { Api.chatDmOpen(u.id) }.getOrNull()?.let { d ->
                q = ""; results = emptyList()
                onOpen(ChatRoom(scope = d.scope, label = d.other.name ?: "", kind = "dm", other = d.other))
            }
        }
    }
    val unblock: (DmUser) -> Unit = { u ->
        scope.launch { runCatching { Api.chatUnblock(u.id) }; blockedUsers = blockedUsers.filter { it.id != u.id } }
    }

    Scaffold(topBar = { PumpfoilTopBar(I18n.t("nav.chat")) }) { pad ->
        Column(Modifier.padding(pad).fillMaxSize()) {
            TabRow(selectedTabIndex = tab) {
                Tab(selected = tab == 0, onClick = { tab = 0; q = "" }, text = { Text(I18n.t("dm.tabMine")) })
                Tab(selected = tab == 1, onClick = { tab = 1; q = "" }, text = { Text(I18n.t("dm.tabSpots")) })
            }
            OutlinedTextField(
                value = q, onValueChange = { q = it },
                modifier = Modifier.fillMaxWidth().padding(12.dp),
                placeholder = { Text(I18n.t("dm.searchAll")) }, singleLine = true,
            )
            androidx.compose.foundation.layout.Box(Modifier.fillMaxSize()) {
                if (loading && rooms.isEmpty()) {
                    CircularProgressIndicator(Modifier.align(Alignment.Center))
                } else {
                    LazyColumn(Modifier.fillMaxSize()) {
                        error?.let { e -> item { Text(e, Modifier.padding(16.dp), color = MaterialTheme.colorScheme.error) } }
                        if (term.isNotEmpty()) {
                            // Globale Suche: Personen (→ DM) + Spots (→ öffnen), egal welcher Tab.
                            items(results) { u -> UserRow(u, onClick = { openDm(u) }); HorizontalDivider() }
                            items(spotsShown) { s -> SpotRow(s, joined = s.scope in joined, subscribed = s.scope in subscribed, onClick = { onOpen(ChatRoom(scope = s.scope, label = s.label)) }); HorizontalDivider() }
                            if (results.isEmpty() && spotsShown.isEmpty()) {
                                item { Text(I18n.t("dm.noResults"), Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
                            }
                        } else if (tab == 0) {
                            if (visibleRooms.isEmpty() && error == null) {
                                item { Text(I18n.t("chat.empty"), Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
                            }
                            items(visibleRooms) { r ->
                                val isDm = r.kind == "dm"
                                ListItem(
                                    modifier = Modifier.clickable { onOpen(r) },
                                    headlineContent = { Text(if (isDm) (r.other?.name ?: r.label.ifBlank { r.scope }) else r.label.ifBlank { r.scope }) },
                                    supportingContent = { if (r.lastText.isNotBlank()) Text(r.lastText, maxLines = 1) },
                                    leadingContent = { Icon(if (isDm) Icons.Filled.Person else Icons.Filled.Forum, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
                                    trailingContent = {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            if (r.scope in subscribed) {
                                                Icon(Icons.Filled.Notifications, contentDescription = I18n.t("chat.subscribe"), tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(16.dp))
                                                Spacer(Modifier.width(4.dp))
                                            }
                                            if (r.unread > 0) Text(r.unread.toString(), color = MaterialTheme.colorScheme.primary)
                                        }
                                    },
                                )
                                HorizontalDivider()
                            }
                            // Blockierte: aus der Liste raus, hier ausklappbar zum Entblocken.
                            if (blockedUsers.isNotEmpty()) {
                                item {
                                    Text(
                                        "${if (showBlocked) "▾" else "▸"} ${I18n.t("dm.blockedList")} (${blockedUsers.size})",
                                        Modifier.fillMaxWidth().clickable { showBlocked = !showBlocked }.padding(16.dp),
                                        style = MaterialTheme.typography.labelMedium,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                if (showBlocked) items(blockedUsers) { u ->
                                    ListItem(
                                        headlineContent = { Text(u.displayName ?: "—") },
                                        leadingContent = { Icon(Icons.Filled.Person, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
                                        trailingContent = { TextButton(onClick = { unblock(u) }) { Text(I18n.t("dm.unblock")) } },
                                    )
                                    HorizontalDivider()
                                }
                            }
                        } else {
                            // Globaler Community-Chat: fester Eintrag ganz oben (Einstieg & Wieder-Beitritt).
                            item {
                                ListItem(
                                    modifier = Modifier.clickable { onOpen(ChatRoom(scope = "global:main", label = I18n.t("chat.globalName"), kind = "global")) },
                                    headlineContent = { Text(I18n.t("chat.globalName")) },
                                    leadingContent = { Icon(Icons.Filled.Forum, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
                                    trailingContent = { if ("global:main" in joined) Icon(Icons.Filled.Check, contentDescription = I18n.t("dm.tabMine"), tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(16.dp)) },
                                )
                                HorizontalDivider()
                            }
                            if (spotsShown.isEmpty()) {
                                item { Text(I18n.t("chat.empty"), Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
                            }
                            items(spotsShown) { s -> SpotRow(s, joined = s.scope in joined, subscribed = s.scope in subscribed, onClick = { onOpen(ChatRoom(scope = s.scope, label = s.label)) }); HorizontalDivider() }
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun UserRow(u: DmUser, onClick: () -> Unit) {
    ListItem(
        modifier = Modifier.clickable { onClick() },
        headlineContent = { Text(u.displayName ?: "—") },
        leadingContent = { Icon(Icons.Filled.Person, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SpotRow(s: SpotChat, joined: Boolean, subscribed: Boolean, onClick: () -> Unit) {
    ListItem(
        modifier = Modifier.clickable { onClick() },
        headlineContent = { Text(s.label.ifBlank { s.scope }) },
        leadingContent = { Icon(Icons.Filled.Place, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
        trailingContent = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                // Abonniert → Glocke; sonst beigetreten → Häkchen.
                if (subscribed) {
                    Icon(Icons.Filled.Notifications, contentDescription = I18n.t("chat.subscribe"), tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                } else if (joined) {
                    Icon(Icons.Filled.Check, contentDescription = I18n.t("dm.tabMine"), tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                }
                Text(s.messages.toString(), color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
    )
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
    val isDm = room.scope.startsWith("dm:")
    val otherId = room.other?.id ?: 0
    var blocked by remember(room.scope) { mutableStateOf(false) }
    var confirmBlock by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val listState = rememberLazyListState()

    // Beim Öffnen und bei neuen Nachrichten ans Ende scrollen (wie die Web-PWA).
    LaunchedEffect(msgs.size) {
        val n = msgs.size + (if (error != null) 1 else 0)
        if (n > 0) listState.animateScrollToItem(n - 1)
    }

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
        if (isDm && otherId > 0) blocked = runCatching { Api.chatBlocks().any { it.id == otherId } }.getOrDefault(false)
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
    if (confirmBlock) {
        AlertDialog(
            onDismissRequest = { confirmBlock = false },
            title = { Text(I18n.t("dm.block")) },
            text = { Text(I18n.t("dm.blockConfirm")) },
            confirmButton = {
                TextButton(onClick = { confirmBlock = false; scope.launch { runCatching { Api.chatBlock(otherId) }; blocked = true } }) {
                    Text(I18n.t("dm.block"), color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = { TextButton(onClick = { confirmBlock = false }) { Text(I18n.t("common.cancel")) } },
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
                    // DM: blockieren/entblocken.
                    if (isDm && otherId > 0) {
                        IconButton(onClick = {
                            if (blocked) scope.launch { runCatching { Api.chatUnblock(otherId) }; blocked = false }
                            else confirmBlock = true
                        }) {
                            Icon(Icons.Filled.Block, contentDescription = I18n.t(if (blocked) "dm.unblock" else "dm.block"),
                                tint = if (blocked) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
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
        LazyColumn(state = listState, modifier = Modifier.padding(pad).fillMaxSize().padding(horizontal = 12.dp)) {
            if (blocked) item { Text(I18n.t("dm.blockedNote"), Modifier.padding(vertical = 6.dp), color = MaterialTheme.colorScheme.error) }
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
