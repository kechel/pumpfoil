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
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.TextButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
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
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.io.File

// Konfig-Dialog vor dem Teilen einer Session-Card. Spiegelt web/components/ShareDialog.tsx:
// Track-Farbmodus, Titel, Stats-Auswahl, Hell/Dunkel-Blau. Card kommt server-generiert (PNG);
// Farbe/Stats/Track/Shade werden als Profil-Default (settings.share) gespeichert.
// (Foto-Hintergrund mit Pinch/Pan folgt separat — hier zunaechst bg=navy.)

private const val N = 1080f   // Card-/Composite-Kantenlänge in px (wie die PWA)

private val STAT_ORDER = listOf("foiling", "runs", "pumps", "speed", "time", "longest", "distance", "pumprate")

// Foto-Rechteck in 1080-Einheiten (wie web/xf): Position + Größe des Hintergrundfotos.
private data class Xf(val x: Float, val y: Float, val w: Float, val h: Float)

// Foto (cover-fit + Gesten) + Scrim (dim) + server-Card zusammensetzen — wie das Canvas der PWA.
private fun composeCard(card: android.graphics.Bitmap?, photo: android.graphics.Bitmap?, xf: Xf, dim: Float): android.graphics.Bitmap? {
    card ?: return null
    val out = android.graphics.Bitmap.createBitmap(N.toInt(), N.toInt(), android.graphics.Bitmap.Config.ARGB_8888)
    val c = android.graphics.Canvas(out)
    val paint = android.graphics.Paint(android.graphics.Paint.FILTER_BITMAP_FLAG)
    if (photo != null) {
        c.drawBitmap(photo, null, android.graphics.RectF(xf.x, xf.y, xf.x + xf.w, xf.y + xf.h), paint)
        c.drawColor(android.graphics.Color.argb((dim * 255).toInt().coerceIn(0, 255), 2, 6, 23))
    }
    c.drawBitmap(card, null, android.graphics.RectF(0f, 0f, N, N), paint)
    return out
}

private fun availableStats(s: SessionDetail): List<String> {
    val a = s.analysis ?: return emptyList()
    // Exakt wie die PWA (web/components/ShareDialog.tsx): „runs" und „longest" liegen NICHT
    // im Analysis-Objekt (num_runs/best_distance_m sind serverseitig separate Spalten) → dort
    // nie wählbar. Wir spiegeln das, damit die Auswahl 1:1 zur PWA passt (6 statt 8 Chips).
    val ok = mapOf(
        "foiling" to ((a.foilingDistanceM ?: 0.0) > 0),
        "runs" to false,
        "pumps" to ((a.pumpCount ?: 0) > 0),
        "speed" to ((a.maxSpeedMps ?: 0.0) > 0),
        "time" to ((a.foilingTimeS ?: 0.0) > 0),
        "longest" to false,
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
    var dim by remember { mutableStateOf(0.55f) }
    var loaded by remember { mutableStateOf(false) }
    val segments = session.analysis?.segments ?: emptyList()
    var highlight by remember { mutableStateOf(-1) }   // -1 = alle Läufe, sonst 0-basiert
    var hlOpen by remember { mutableStateOf(false) }

    // Foto-Hintergrund (optional, wie die PWA): darunter komponiert, Card kommt dann transparent.
    var photo by remember { mutableStateOf<android.graphics.Bitmap?>(null) }
    var card by remember { mutableStateOf<android.graphics.Bitmap?>(null) }   // server-Card (navy o. transparent)
    var xf by remember { mutableStateOf(Xf(0f, 0f, N, N)) }                    // Foto-Rechteck in 1080-Einheiten
    var previewPx by remember { mutableStateOf(1) }
    var composed by remember { mutableStateOf<androidx.compose.ui.graphics.ImageBitmap?>(null) }
    var loading by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }

    val picker = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.GetContent()
    ) { uri ->
        if (uri != null) {
            val bmp = try { ctx.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it) } } catch (_: Exception) { null }
            if (bmp != null) {
                photo = bmp
                val s = maxOf(N / bmp.width, N / bmp.height)
                xf = Xf((N - bmp.width * s) / 2f, (N - bmp.height * s) / 2f, bmp.width * s, bmp.height * s)
            }
        }
    }

    // Defaults aus dem Profil laden.
    LaunchedEffect(Unit) {
        try {
            val sh = Api.settings()["share"]?.jsonObject
            sh?.get("color")?.jsonPrimitive?.contentOrNull?.let { if (it == "cyan" || it == "speed" || (it == "hr" && hasHr)) color = it }
            sh?.get("stats")?.jsonArray?.mapNotNull { it.jsonPrimitive.contentOrNull }?.filter { it in avail }?.let { if (it.isNotEmpty()) sel = it.toSet() }
            sh?.get("track")?.jsonPrimitive?.booleanOrNull?.let { track = it }
            sh?.get("shade")?.jsonPrimitive?.contentOrNull?.let { if (it == "light" || it == "dark") shade = it }
            sh?.get("dim")?.jsonPrimitive?.doubleOrNull?.let { dim = it.toFloat() }
        } catch (_: Exception) {}
        loaded = true
    }

    // Card (server) neu holen bei Aenderung — entprellt. Mit Foto: transparenter Hintergrund.
    LaunchedEffect(color, sel, track, shade, title, photo != null, highlight, loaded) {
        if (!loaded) return@LaunchedEffect
        loading = true
        delay(220)
        try {
            val chosen = STAT_ORDER.filter { sel.contains(it) }
            val bg = if (photo != null) "transparent" else "navy"
            val b = Api.shareCard(session.id, color, chosen, track, title, shade, bg, highlight)
            card = BitmapFactory.decodeByteArray(b, 0, b.size)
        } catch (_: Exception) {} finally { loading = false }
    }

    // Vorschau lokal komponieren (Foto + Scrim + Card), reagiert auch auf Gesten/Slider.
    LaunchedEffect(card, photo, xf, dim) {
        composed = composeCard(card, photo, xf, dim)?.asImageBitmap()
    }

    // Default speichern (entprellt).
    LaunchedEffect(color, sel, track, shade, dim, loaded) {
        if (!loaded) return@LaunchedEffect
        delay(500)
        try {
            Api.saveSettings(buildJsonObject {
                put("share", buildJsonObject {
                    put("color", color)
                    put("stats", buildJsonArray { STAT_ORDER.filter { sel.contains(it) }.forEach { add(it) } })
                    put("track", track)
                    put("shade", shade)
                    put("dim", dim.toDouble())
                })
            })
        } catch (_: Exception) {}
    }

    fun doShare() {
        val bmp = composeCard(card, photo, xf, dim) ?: return
        busy = true
        scope.launch {
            try {
                val dir = File(ctx.cacheDir, "shared").apply { mkdirs() }
                val f = File(dir, "pumpfoil-${session.id}.png")
                f.outputStream().use { bmp.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
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

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Column(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp)   // nur schmaler Rand zum Bildschirm (kein großer Default-Dialog-Rand)
                .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(20.dp))
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(I18n.t("sd.share"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f))
                IconButton(onClick = onDismiss) { Icon(Icons.Filled.Close, contentDescription = I18n.t("common.cancel")) }
            }

            // Vorschau (quadratisch); mit Foto: ein Finger schieben, zwei Finger zoomen.
            Box(
                Modifier.fillMaxWidth().aspectRatio(1f)
                    .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(14.dp))
                    .onSizeChanged { if (it.width > 0) previewPx = it.width }
                    .then(
                        if (photo != null) Modifier.pointerInput(Unit) {
                            detectTransformGestures { centroid, pan, zoom, _ ->
                                val k = N / previewPx.toFloat()   // px → 1080-Einheiten
                                val fx = centroid.x * k; val fy = centroid.y * k
                                var nx = xf.x + pan.x * k; var ny = xf.y + pan.y * k
                                nx = fx + (nx - fx) * zoom; ny = fy + (ny - fy) * zoom
                                xf = Xf(nx, ny, xf.w * zoom, xf.h * zoom)
                            }
                        } else Modifier
                    ),
                contentAlignment = Alignment.Center,
            ) {
                composed?.let { Image(it, contentDescription = null, modifier = Modifier.fillMaxWidth()) }
                if (loading) CircularProgressIndicator()
            }
            if (photo != null) {
                Text(I18n.t("share.photoHint"), style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.fillMaxWidth(),
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center)
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

            // Track-Farbe (Labels weggelassen — selbsterklärend).
            if (track) {
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

            // Foto-Hintergrund links + Lauf-Auswahl rechts in einer Zeile.
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                androidx.compose.material3.OutlinedButton(onClick = { picker.launch("image/*") }) {
                    Text(if (photo != null) I18n.t("share.changePhoto") else I18n.t("share.addPhoto"))
                }
                if (photo != null) {
                    androidx.compose.material3.TextButton(onClick = { photo = null }) { Text(I18n.t("share.noPhoto")) }
                }
                Spacer(Modifier.weight(1f))
                if (track && segments.size >= 2) {
                    Box {
                        androidx.compose.material3.OutlinedButton(onClick = { hlOpen = true }) {
                            Text(if (highlight < 0) I18n.t("share.allRuns")
                                 else I18n.t("share.runLabel").replace("{n}", "${highlight + 1}"))
                        }
                        androidx.compose.material3.DropdownMenu(expanded = hlOpen, onDismissRequest = { hlOpen = false }) {
                            androidx.compose.material3.DropdownMenuItem(text = { Text(I18n.t("share.allRuns")) },
                                onClick = { highlight = -1; hlOpen = false })
                            segments.forEachIndexed { i, seg ->
                                val km = if (seg.distanceM >= 1000) "%.1f km".format(seg.distanceM / 1000) else "${seg.distanceM.toInt()} m"
                                androidx.compose.material3.DropdownMenuItem(
                                    text = { Text("${I18n.t("share.runLabel").replace("{n}", "${i + 1}")} · $km") },
                                    onClick = { highlight = i; hlOpen = false })
                            }
                        }
                    }
                }
            }
            if (photo != null) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(I18n.t("share.darken"), style = MaterialTheme.typography.labelMedium, modifier = Modifier.weight(1f))
                    Text("${(dim * 100).toInt()}%", style = MaterialTheme.typography.labelMedium)
                }
                Slider(value = dim, onValueChange = { dim = it }, valueRange = 0f..0.85f, steps = 16)
            }

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
                onClick = { doShare() }, enabled = !busy && card != null,
                modifier = Modifier.fillMaxWidth().height(48.dp),
            ) {
                Icon(Icons.Filled.Share, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text(I18n.t("sd.share"))
            }
        }
    }
}
