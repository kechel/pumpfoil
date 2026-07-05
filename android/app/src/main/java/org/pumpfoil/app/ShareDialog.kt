package org.pumpfoil.app

import android.content.Intent
import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.core.content.FileProvider
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.io.File

// Konfig-Dialog vor dem Teilen einer Session-Card. Spiegelt web/components/ShareDialog.tsx:
// Track-Farbmodus, Titel, Stats-Auswahl, Hell/Dunkel-Blau. Card kommt server-generiert (PNG);
// Farbe/Stats/Track/Shade werden als Profil-Default (settings.share) gespeichert.
// (Foto-Hintergrund mit Pinch/Pan folgt separat — hier zunaechst bg=navy.)

private val STAT_ORDER = listOf("foiling", "runs", "pumps", "speed", "time", "longest", "distance", "pumprate")

private fun availableStats(s: SessionDetail): List<String> {
    val a = s.analysis ?: return emptyList()
    val m = a.metrics
    val runs = a.segments?.size ?: m?.numSegments ?: 0
    val ok = mapOf(
        "foiling" to ((a.foilingDistanceM ?: 0.0) > 0),
        "runs" to (runs > 0),
        "pumps" to ((a.pumpCount ?: 0) > 0),
        "speed" to ((a.maxSpeedMps ?: 0.0) > 0),
        "time" to ((a.foilingTimeS ?: 0.0) > 0),
        "longest" to ((m?.farthestSegmentM ?: 0.0) > 0),
        "distance" to ((a.totalDistanceM ?: 0.0) > 0),
        "pumprate" to ((a.foilingTimeS ?: 0.0) > 0 && (a.pumpCount ?: 0) > 0),
    )
    return STAT_ORDER.filter { ok[it] == true }
}

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun ShareDialog(session: SessionDetail, onDismiss: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val avail = remember(session.id) { availableStats(session) }
    val hasHr = remember(session.id) { session.analysis?.metrics?.let { it.avgHr != null || it.maxHr != null } ?: false }

    var color by remember { mutableStateOf("cyan") }
    var sel by remember { mutableStateOf(avail.toSet()) }
    var track by remember { mutableStateOf(true) }
    var shade by remember { mutableStateOf("light") }
    var title by remember { mutableStateOf("") }
    var loaded by remember { mutableStateOf(false) }

    var preview by remember { mutableStateOf<androidx.compose.ui.graphics.ImageBitmap?>(null) }
    var bytes by remember { mutableStateOf<ByteArray?>(null) }
    var loading by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }

    // Defaults aus dem Profil laden.
    LaunchedEffect(Unit) {
        try {
            val sh = Api.settings()["share"]?.jsonObject
            sh?.get("color")?.jsonPrimitive?.contentOrNull?.let { if (it == "cyan" || it == "speed" || (it == "hr" && hasHr)) color = it }
            sh?.get("stats")?.jsonArray?.mapNotNull { it.jsonPrimitive.contentOrNull }?.filter { it in avail }?.let { if (it.isNotEmpty()) sel = it.toSet() }
            sh?.get("track")?.jsonPrimitive?.booleanOrNull?.let { track = it }
            sh?.get("shade")?.jsonPrimitive?.contentOrNull?.let { if (it == "light" || it == "dark") shade = it }
        } catch (_: Exception) {}
        loaded = true
    }

    // Card (server) neu holen bei Aenderung — entprellt; Bytes fuer Vorschau + Teilen behalten.
    LaunchedEffect(color, sel, track, shade, title, loaded) {
        if (!loaded) return@LaunchedEffect
        loading = true
        delay(220)
        try {
            val chosen = STAT_ORDER.filter { sel.contains(it) }
            val b = Api.shareCard(session.id, color, chosen, track, title, shade)
            bytes = b
            preview = BitmapFactory.decodeByteArray(b, 0, b.size)?.asImageBitmap()
        } catch (_: Exception) {} finally { loading = false }
    }

    // Default speichern (entprellt).
    LaunchedEffect(color, sel, track, shade, loaded) {
        if (!loaded) return@LaunchedEffect
        delay(500)
        try {
            Api.saveSettings(buildJsonObject {
                put("share", buildJsonObject {
                    put("color", color)
                    put("stats", buildJsonArray { STAT_ORDER.filter { sel.contains(it) }.forEach { add(it) } })
                    put("track", track)
                    put("shade", shade)
                })
            })
        } catch (_: Exception) {}
    }

    fun doShare() {
        val b = bytes ?: return
        busy = true
        scope.launch {
            try {
                val dir = File(ctx.cacheDir, "shared").apply { mkdirs() }
                val f = File(dir, "pumpfoil-${session.id}.png")
                f.writeBytes(b)
                val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.fileprovider", f)
                val send = Intent(Intent.ACTION_SEND).apply {
                    type = "image/png"
                    putExtra(Intent.EXTRA_STREAM, uri)
                    putExtra(Intent.EXTRA_TEXT, "pumpfoil.org")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                ctx.startActivity(Intent.createChooser(send, I18n.t("sd.share")))
            } catch (_: Exception) {} finally { busy = false }
        }
    }

    Dialog(onDismissRequest = onDismiss) {
        Column(
            Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(20.dp))
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(I18n.t("sd.share"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)

            // Vorschau (quadratisch)
            Box(
                Modifier.fillMaxWidth().aspectRatio(1f)
                    .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(14.dp)),
                contentAlignment = Alignment.Center,
            ) {
                preview?.let { Image(it, contentDescription = null, modifier = Modifier.fillMaxWidth()) }
                if (loading) CircularProgressIndicator()
            }

            OutlinedTextField(
                value = title, onValueChange = { if (it.length <= 40) title = it },
                label = { Text(I18n.t("share.cardTitle")) },
                placeholder = { Text(I18n.t("share.cardTitlePlaceholder")) },
                singleLine = true, modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions.Default,
            )

            Row(verticalAlignment = Alignment.CenterVertically) {
                Switch(checked = track, onCheckedChange = { track = it })
                Spacer(Modifier.width(8.dp))
                Text(I18n.t("share.showTrack"))
            }

            if (track) {
                Text(I18n.t("share.trackColor"), style = MaterialTheme.typography.labelMedium)
                val colors = if (hasHr) listOf("cyan", "speed", "hr") else listOf("cyan", "speed")
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                    colors.forEachIndexed { i, c ->
                        SegmentedButton(
                            selected = color == c, onClick = { color = c },
                            shape = SegmentedButtonDefaults.itemShape(i, colors.size),
                        ) { Text(I18n.t("share.color.$c")) }
                    }
                }
            }

            Text(I18n.t("share.textColor"), style = MaterialTheme.typography.labelMedium)
            val shades = listOf("light", "dark")
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                shades.forEachIndexed { i, sh ->
                    SegmentedButton(
                        selected = shade == sh, onClick = { shade = sh },
                        shape = SegmentedButtonDefaults.itemShape(i, shades.size),
                    ) { Text(I18n.t("share.shade.$sh")) }
                }
            }

            if (avail.isNotEmpty()) {
                Text(I18n.t("share.stats"), style = MaterialTheme.typography.labelMedium)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    avail.forEach { k ->
                        FilterChip(
                            selected = sel.contains(k),
                            onClick = { sel = if (sel.contains(k)) sel - k else sel + k },
                            label = { Text(I18n.t("share.stat.$k")) },
                        )
                    }
                }
            }

            Button(
                onClick = { doShare() }, enabled = !busy && bytes != null,
                modifier = Modifier.fillMaxWidth().height(48.dp),
            ) {
                Icon(Icons.Filled.Share, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text(I18n.t("sd.share"))
            }
        }
    }
}
