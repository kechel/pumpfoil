package org.pumpfoil.app

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

// Spot-Beschreibungen (Paritaet zur PWA, /sessions?spot=<id>): je Nutzer EIN Textblock + Fotos,
// alle untereinander, mit Herzchen bewertbar. Steht wie im Web zwischen Wetter und Session-Liste.
//
// Schreiben darf nur, wer eine eigene Session an dem Spot hat — das entscheidet der Server
// (`can_write`), die App zeigt sonst keinen Knopf. Fremde Beitraege sind unantastbar.
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SpotNotesSection(spotId: Int) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var data by remember(spotId) { mutableStateOf<SpotNotesOut?>(null) }
    var editText by remember(spotId) { mutableStateOf<String?>(null) }   // != null => Dialog offen
    var busy by remember(spotId) { mutableStateOf(false) }
    var gross by remember(spotId) { mutableStateOf<String?>(null) }      // Foto im Vollbild

    suspend fun laden() { data = try { Api.spotNotes(spotId) } catch (_: Exception) { null } }
    LaunchedEffect(spotId) { laden() }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) scope.launch {
            busy = true
            val bytes = withContext(Dispatchers.IO) {
                ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() }?.let { downscaleJpeg(it) }
            }
            if (bytes != null) try { Api.uploadSpotNotePhoto(spotId, bytes); laden() } catch (_: Exception) {}
            busy = false
        }
    }

    val d = data ?: return
    // Nichts zu sehen und selbst nicht schreibberechtigt -> Abschnitt ganz weglassen.
    if (!d.can_write && d.notes.isEmpty()) return
    val meine = d.notes.firstOrNull { it.mine }
    val fremde = d.notes.filter { !it.mine }

    Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp)) {
        Text(I18n.t("spotnote.title"), fontWeight = FontWeight.Bold,
            style = MaterialTheme.typography.titleSmall)
        Text(I18n.t("spotnote.disclaimer"), style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 2.dp, bottom = 6.dp))

        if (d.can_write) {
            Card(Modifier.fillMaxWidth().padding(bottom = 8.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                Column(Modifier.padding(10.dp)) {
                    if (meine == null) {
                        Text(I18n.t("spotnote.invite"), style = MaterialTheme.typography.bodySmall)
                    } else {
                        NoteKopf(meine, spotId, onChanged = { scope.launch { laden() } })
                        if (meine.text.isNotBlank()) {
                            Text(meine.text, Modifier.padding(top = 4.dp),
                                style = MaterialTheme.typography.bodyMedium)
                        }
                        FotoReihe(meine, eigen = true, onOpen = { gross = it },
                            onDelete = { pid -> scope.launch { busy = true
                                try { Api.deleteSpotNotePhoto(spotId, pid); laden() } catch (_: Exception) {}
                                busy = false } })
                    }
                    Row(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = { editText = meine?.text ?: "" }, enabled = !busy) {
                            Text(if (meine == null) I18n.t("spotnote.write") else I18n.t("spotnote.edit"))
                        }
                        if ((meine?.photos?.size ?: 0) < d.max_photos) {
                            OutlinedButton(
                                onClick = { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                                enabled = !busy,
                            ) {
                                Icon(Icons.Filled.PhotoCamera, contentDescription = null, Modifier.size(16.dp))
                                Spacer(Modifier.width(4.dp))
                                Text(I18n.t("spotnote.addPhoto"))
                            }
                        }
                    }
                }
            }
        }

        fremde.forEach { n ->
            Card(Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
                Column(Modifier.padding(10.dp)) {
                    NoteKopf(n, spotId, onChanged = { scope.launch { laden() } })
                    if (n.text.isNotBlank()) {
                        Text(n.text, Modifier.padding(top = 4.dp), style = MaterialTheme.typography.bodyMedium)
                    }
                    FotoReihe(n, eigen = false, onOpen = { gross = it }, onDelete = {})
                }
            }
        }
        if (fremde.isEmpty() && !d.can_write) {
            Text(I18n.t("spotnote.none"), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }

    // Text bearbeiten — bewusst ein Dialog: der Abschnitt sitzt in einer scrollenden Liste,
    // ein Inline-Textfeld wuerde beim Tippen unter der Tastatur verschwinden.
    editText?.let { txt ->
        AlertDialog(
            onDismissRequest = { editText = null },
            title = { Text(I18n.t("spotnote.write")) },
            text = {
                Column {
                    OutlinedTextField(
                        value = txt,
                        onValueChange = { editText = it.take(d.max_text) },
                        minLines = 5,
                        placeholder = { Text(I18n.t("spotnote.placeholder")) },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Text("${txt.length}/${d.max_text}", style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    scope.launch {
                        busy = true
                        try { Api.saveSpotNote(spotId, txt); laden() } catch (_: Exception) {}
                        busy = false; editText = null
                    }
                }) { Text(I18n.t("common.save")) }
            },
            dismissButton = {
                Row {
                    if (meine != null) {
                        TextButton(onClick = {
                            scope.launch {
                                busy = true
                                try { Api.deleteSpotNote(spotId); laden() } catch (_: Exception) {}
                                busy = false; editText = null
                            }
                        }) { Text(I18n.t("common.delete"), color = MaterialTheme.colorScheme.error) }
                    }
                    TextButton(onClick = { editText = null }) { Text(I18n.t("common.cancel")) }
                }
            },
        )
    }

    gross?.let { url ->
        AlertDialog(
            onDismissRequest = { gross = null },
            confirmButton = { TextButton(onClick = { gross = null }) { Text(I18n.t("common.close")) } },
            text = {
                AsyncImage(model = url, contentDescription = null, contentScale = ContentScale.Fit,
                    modifier = Modifier.fillMaxWidth())
            },
        )
    }
}

// Kopfzeile eines Abschnitts: Nutzer, Datum, Herzchen (+ Melden bei fremden).
@Composable
private fun NoteKopf(n: SpotNote, spotId: Int, onChanged: () -> Unit) {
    val scope = rememberCoroutineScope()
    var liked by remember(n.id) { mutableStateOf(n.liked) }
    var likes by remember(n.id) { mutableStateOf(n.like_count) }
    Row(verticalAlignment = Alignment.CenterVertically) {
        AvatarCircle(name = n.name, avatarUrl = n.avatar_url, size = 28.dp)
        Spacer(Modifier.width(6.dp))
        Column(Modifier.weight(1f)) {
            Text(n.name ?: "—", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
            n.updated_at?.let {
                Text("${I18n.t("spotnote.updated")} ${kurzDatum(it)}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        IconButton(onClick = {
            scope.launch {
                try { val r = Api.likeSpotNote(n.id); liked = r.liked; likes = r.like_count } catch (_: Exception) {}
            }
        }) {
            Icon(if (liked) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                contentDescription = "Like",
                tint = if (liked) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (likes > 0) Text("$likes", style = MaterialTheme.typography.labelMedium)
        if (!n.mine) {
            IconButton(onClick = {
                scope.launch { try { Api.reportSpotNote(n.id); onChanged() } catch (_: Exception) {} }
            }) {
                Icon(Icons.Filled.Flag, contentDescription = "Report",
                    tint = if (n.my_report) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FotoReihe(n: SpotNote, eigen: Boolean, onOpen: (String) -> Unit, onDelete: (Int) -> Unit) {
    if (n.photos.isEmpty()) return
    FlowRow(Modifier.fillMaxWidth().padding(top = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        n.photos.forEach { p ->
            Box {
                AsyncImage(
                    model = (p.thumb_url ?: p.url).let { if (it.startsWith("http")) it else Api.BASE + it },
                    contentDescription = null, contentScale = ContentScale.Crop,
                    modifier = Modifier.size(88.dp).clip(RoundedCornerShape(10.dp))
                        .clickable { onOpen(if (p.url.startsWith("http")) p.url else Api.BASE + p.url) },
                )
                if (eigen) {
                    Text("×", Modifier.align(Alignment.TopEnd).padding(2.dp)
                        .clickable { onDelete(p.id) }, color = MaterialTheme.colorScheme.error,
                        fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

// ISO-Zeitstempel -> kurzes Datum (die Uhrzeit sagt bei einer Spot-Beschreibung nichts).
private fun kurzDatum(iso: String): String = iso.take(10)
