package org.pumpfoil.app

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Label
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.CompareArrows
import androidx.compose.material.icons.filled.ContentCut
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.FileDownload
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.Forum
import androidx.compose.material.icons.filled.HelpOutline
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.OpenInFull
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.filled.RemoveCircleOutline
import androidx.compose.material.icons.filled.Report
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Watch
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.FileProvider
import coil.compose.AsyncImage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.osmdroid.config.Configuration
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.BoundingBox
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Marker
import org.osmdroid.views.overlay.Polyline
import org.osmdroid.views.overlay.ScaleBarOverlay

// Amber für „Fake melden" (wie im Web); Rot kommt aus dem Theme (error).
private val AmberReport = Color(0xFFF59E0B)

// Sky-Blau für den Fremdkraft-Kasten (wie PWA: bg-sky-500/10, Text sky-700 hell / sky-300 dunkel).
private val SkyReport = Color(0xFF0EA5E9)
private val SkyOnLight = Color(0xFF0369A1)
private val SkyOnDark = Color(0xFF7DD3FC)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SessionDetailScreen(id: Int, onBack: () -> Unit, onLabel: (Int) -> Unit = {}, onOpenSession: (Int) -> Unit = {}, onSpotChat: (String) -> Unit = {}, onSpotSessions: (String) -> Unit = {}, dataVersion: Long? = null, social: Boolean = true) {
    var session by remember { mutableStateOf<SessionDetail?>(null) }
    var neighbors by remember(id) { mutableStateOf<Neighbors?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var confirmDelete by remember { mutableStateOf(false) }
    var showTrim by remember { mutableStateOf(false) }
    var showShare by remember { mutableStateOf(false) }
    // Session als Datei (GPX/FIT) — wie in der PWA, nur eigene Sessions. Android hat keinen
    // Browser-Download: die Datei landet im Cache und geht ans System-Teilen weiter, damit sie
    // der Nutzer in Drive/Dateien/Garmin Connect ablegen kann.
    var showExport by remember { mutableStateOf(false) }
    var exportBusy by remember { mutableStateOf(false) }
    var showLink by remember { mutableStateOf(false) }        // Teilen-Link-Popup (Besitzer)
    var shareUrl by remember { mutableStateOf<String?>(null) }
    var linkCopied by remember { mutableStateOf(false) }
    var trimStart by remember { mutableStateOf(0f) }
    var trimEnd by remember { mutableStateOf(0f) }
    // Zeitbereich aussortieren (dieselben zwei Regler wie der Zuschnitt) — Rückfrage vor dem Senden.
    var askExcludeRange by remember { mutableStateOf(false) }
    var excludeErr by remember { mutableStateOf<String?>(null) }
    var reloadTick by remember { mutableStateOf(0) }
    // In der Detailansicht ausgewählter Lauf -> Teilen-Dialog übernimmt ihn als Vorauswahl (#37).
    var shareRun by remember(id) { mutableStateOf<Int?>(null) }
    val scope = rememberCoroutineScope()
    val ctxExport = LocalContext.current
    // Datei erzeugen und ans System-Teilen geben. Dateiname wie der Server (export_track.dateiname):
    // pumpfoil-<Datum der AUFNAHME in ihrer Zeitzone>-<id>.<endung> — so heisst die Datei gleich,
    // egal ob sie im Browser oder hier geladen wurde.
    fun exportiere(kind: String) {
        val sess = session ?: return
        exportBusy = true
        scope.launch {
            try {
                val bytes = Api.exportSession(sess.id, kind)
                val dir = java.io.File(ctxExport.cacheDir, "shared").apply { mkdirs() }
                val f = java.io.File(dir, exportDateiname(sess, kind))
                f.writeBytes(bytes)
                val uri = FileProvider.getUriForFile(ctxExport, "${ctxExport.packageName}.fileprovider", f)
                val send = Intent(Intent.ACTION_SEND).apply {
                    // FIT hat einen eigenen MIME-Typ (Garmin Connect erkennt ihn), GPX ist XML.
                    type = if (kind == "fit") "application/vnd.ant.fit" else "application/gpx+xml"
                    putExtra(Intent.EXTRA_STREAM, uri)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                ctxExport.startActivity(Intent.createChooser(send, I18n.t("sd.exportFile")))
            } catch (_: Exception) {
            } finally { exportBusy = false }
        }
    }
    val durSec = remember(session) {
        val a = epochMs(session?.startedAt); val b = epochMs(session?.endedAt)
        if (a != null && b != null && b > a) ((b - a) / 1000).toFloat() else 0f
    }

    LaunchedEffect(id, reloadTick) {
        loading = true
        // Cache-Treffer (data_version passt) -> Detail aus dem Disk-Cache, kein Netz-Fetch.
        val cached = if (session == null && reloadTick == 0) SessionCache.load(id, dataVersion) else null
        if (cached != null) {
            session = cached; error = null; loading = false
        } else {
            try { val s = Api.session(id); session = s; SessionCache.store(s); error = null }
            catch (e: Exception) { error = e.message }
            loading = false
        }
    }
    LaunchedEffect(id) { neighbors = try { Api.sessionNeighbors(id) } catch (_: Exception) { null } }
    // 4a: eigene In-Progress-Session (recording/live) -> nachpollen. Der GET triggert server-seitig
    // die gps_only-Vorabanalyse; sobald sie/der fertige Upload da ist, aktualisiert sich das Detail
    // (Track/Läufe/Pumps) seamless. Stoppt, sobald der Status nicht mehr recording/live ist.
    LaunchedEffect(session?.status, session?.owned) {
        val st = session?.status
        if (session?.owned == true && (st == "recording" || st == "live")) {
            while (true) {
                kotlinx.coroutines.delay(4000)
                val fresh = try { Api.session(id) } catch (_: Exception) { null }
                if (fresh != null) { session = fresh; SessionCache.store(fresh) }
            }
        }
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text(I18n.t("sd.deleteTitle")) },
            text = { Text(I18n.t("sd.deleteBody")) },
            confirmButton = {
                TextButton(onClick = {
                    confirmDelete = false
                    scope.launch { try { Api.deleteSession(id); onBack() } catch (_: Exception) {} }
                }) { Text(I18n.t("common.delete")) }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text(I18n.t("common.cancel")) } },
        )
    }
    // Nutzer-Feedback (PWA 2026-07-30): die Lauf-Tabelle zeigt Ortszeit, das Zuschneiden zeigte nur
    // Sekunden ab Sessionbeginn -> man konnte nicht sehen, WO man schneidet. Beides nebeneinander
    // schlägt die Brücke; die Rückfrage beim Aussortieren nennt ebenfalls Uhrzeiten.
    val clockAt: (Float) -> String? = { sec ->
        hhmmssOffset(session?.startedAt, session?.tz, sec.toLong())
    }
    fun withClock(label: String, sec: Float): String =
        label + (clockAt(sec)?.let { "   $it" } ?: "")
    if (showTrim) {
        AlertDialog(
            onDismissRequest = { showTrim = false },
            title = { Text(I18n.t("sd.trim")) },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState())) {
                    Text(withClock("${I18n.t("common.start")}: ${mmss(trimStart)}", trimStart))
                    Slider(value = trimStart, onValueChange = { trimStart = it.coerceIn(0f, (trimEnd - 1).coerceAtLeast(0f)) }, valueRange = 0f..durSec)
                    Text(withClock("${I18n.t("common.end")}: ${mmss(trimEnd)}", trimEnd))
                    Slider(value = trimEnd, onValueChange = { trimEnd = it.coerceIn(trimStart + 1, durSec) }, valueRange = 0f..durSec)
                    // Denselben Bereich AUSSORTIEREN statt zuschneiden (wie PWA TrimPanel): nötig,
                    // wenn der Störteil mitten in der Aufnahme liegt — der Trim kann nur vorne/hinten weg.
                    Spacer(Modifier.height(6.dp))
                    Text(I18n.t("sd.excludeRangeHint"), style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    TextButton(onClick = { showTrim = false; askExcludeRange = true }) {
                        Text(I18n.t("sd.excludeRange"))
                    }
                    TextButton(onClick = {
                        showTrim = false
                        scope.launch { try { Api.setTrim(id, null, null); reloadTick++ } catch (_: Exception) {} }
                    }) { Text(I18n.t("sd.trimReset")) }
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    showTrim = false
                    scope.launch {
                        try { Api.setTrim(id, (trimStart * 1000).toLong(), (trimEnd * 1000).toLong()); reloadTick++ } catch (_: Exception) {}
                    }
                }) { Text(I18n.t("sd.apply")) }
            },
            dismissButton = { TextButton(onClick = { showTrim = false }) { Text(I18n.t("common.cancel")) } },
        )
    }
    // Rückfrage „Bereich aussortieren" — der Bereich steht in trimStart/trimEnd (Regler bleiben stehen).
    if (askExcludeRange) {
        AlertDialog(
            onDismissRequest = { askExcludeRange = false },
            title = { Text(I18n.t("sd.excludeRange")) },
            text = {
                // Uhrzeiten statt mm:ss: „von 12:47:10 bis 12:53:02" sagt einem im Zweifelsfall
                // etwas, „von 07:10 bis 13:02" (ab Sessionbeginn) gar nichts. Wie PWA.
                Text(I18n.t("sd.excludeRangeConfirm")
                    .replace("{from}", clockAt(trimStart) ?: mmss(trimStart))
                    .replace("{to}", clockAt(trimEnd) ?: mmss(trimEnd)),
                    style = MaterialTheme.typography.bodyMedium)
            },
            confirmButton = {
                TextButton(onClick = {
                    askExcludeRange = false
                    scope.launch {
                        try {
                            val fresh = Api.excludeRange(id, (trimStart * 1000).toLong(), (trimEnd * 1000).toLong())
                            SessionCache.store(fresh); reloadTick++
                        } catch (e: Exception) { excludeErr = I18n.t("sd.excludeFail") + (e.message ?: "") }
                    }
                }) { Text(I18n.t("sd.excludeRange")) }
            },
            dismissButton = { TextButton(onClick = { askExcludeRange = false }) { Text(I18n.t("common.cancel")) } },
        )
    }
    excludeErr?.let { msg ->
        AlertDialog(
            onDismissRequest = { excludeErr = null },
            text = { Text(msg, style = MaterialTheme.typography.bodyMedium) },
            confirmButton = { TextButton(onClick = { excludeErr = null }) { Text(I18n.t("common.close")) } },
        )
    }

    if (showShare) session?.let { ShareDialog(it, initialHighlight = shareRun ?: -1) { showShare = false } }

    if (showLink) {
        val clipboard = LocalClipboardManager.current
        AlertDialog(
            onDismissRequest = { showLink = false },
            title = { Text(I18n.t("share.linkTitle")) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(I18n.t("share.linkExplain"), style = MaterialTheme.typography.bodyMedium)
                    Text(shareUrl ?: I18n.t("common.loading"),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .background(MaterialTheme.colorScheme.surfaceVariant)
                            .padding(10.dp))
                    TextButton(
                        onClick = {
                            scope.launch { try { Api.revokeShareLink(id) } catch (_: Exception) {} }
                            shareUrl = null; showLink = false
                        },
                    ) { Text(I18n.t("share.revoke")) }
                }
            },
            confirmButton = {
                TextButton(enabled = shareUrl != null, onClick = {
                    shareUrl?.let { clipboard.setText(AnnotatedString(it)); linkCopied = true }
                }) { Text(if (linkCopied) I18n.t("share.copied") else I18n.t("share.copy")) }
            },
            dismissButton = { TextButton(onClick = { showLink = false }) { Text(I18n.t("common.close")) } },
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(I18n.t("sd.title")) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Zurück")
                    }
                },
                actions = {
                    val s = session
                    // Die Melde-Knöpfe standen früher hier in einem Überlauf-Menü hinter dem
                    // Flaggen-Symbol — praktisch unsichtbar. Sie stehen jetzt sichtbar in der
                    // Aktionszeile im Inhalt (ReportRow), genau wie in der PWA.
                    // Spot-Chat der Session (scope "spot:<name>") — für jede Session mit Spot.
                    // Bei Age-Gate (social=false) ausgeblendet; Spot/Session bleiben sichtbar, nur Chat aus.
                    if (social) s?.placeName?.takeIf { it.isNotBlank() }?.let { sp ->
                        IconButton(onClick = { onSpotChat(sp) }) {
                            Icon(Icons.Filled.Forum, contentDescription = I18n.t("nav.chat"), tint = MaterialTheme.colorScheme.primary)
                        }
                    }
                    // Zum Spot: Sessions aller Nutzer dort UND die Spot-Beschreibungen (Wunsch Jan,
                    // 24.08. — im Web steht der Knopf neben dem Spot-Chat).
                    s?.placeName?.takeIf { it.isNotBlank() }?.let { sp ->
                        IconButton(onClick = { onSpotSessions(sp) }) {
                            Icon(Icons.Filled.Place, contentDescription = I18n.t("sd.spotPage"),
                                tint = MaterialTheme.colorScheme.primary)
                        }
                    }
                    // Datei laden (GPX/FIT) — nur eigene Sessions, wie in der PWA. Ein Knopf mit
                    // Auswahl statt zweier: in der Kopfzeile ist kein Platz fuer beide.
                    if (s?.owned == true) {
                        Box {
                            IconButton(onClick = { showExport = true }, enabled = !exportBusy) {
                                Icon(Icons.Filled.FileDownload, contentDescription = I18n.t("sd.exportFile"),
                                    tint = MaterialTheme.colorScheme.primary)
                            }
                            DropdownMenu(expanded = showExport, onDismissRequest = { showExport = false }) {
                                // Im Menue ist Platz fuer die ganze Erklaerung — anders als in
                                // der PWA, wo nur „GPX"/„FIT" auf den Knopf passt.
                                DropdownMenuItem(
                                    text = { Text(I18n.t("sd.exportGpx")) },
                                    onClick = { showExport = false; exportiere("gpx") },
                                )
                                DropdownMenuItem(
                                    text = { Text(I18n.t("sd.exportFit")) },
                                    onClick = { showExport = false; exportiere("fit") },
                                )
                            }
                        }
                    }
                    if (s?.owned == true && s.analysis?.trackGeojson != null) {
                        IconButton(onClick = { showShare = true }) {
                            Icon(Icons.Filled.Share, contentDescription = I18n.t("sd.share"), tint = MaterialTheme.colorScheme.primary)
                        }
                    }
                    // Öffentlicher Teilen-Link (Besitzer): Link-Icon -> Popup mit Erklärung + Kopieren.
                    if (s?.owned == true) {
                        IconButton(onClick = {
                            showLink = true; linkCopied = false
                            if (shareUrl == null) scope.launch {
                                shareUrl = try { Api.createShareLink(id) } catch (_: Exception) { null }
                            }
                        }) {
                            Icon(Icons.Filled.Link, contentDescription = I18n.t("share.linkBtn"), tint = MaterialTheme.colorScheme.primary)
                        }
                    }
                    // Pump-Label-Ansicht mobil vorerst ausgeblendet (Jan: „machen wir andermal").
                    // Code bleibt bestehen — nur der Button ist deaktiviert.
                    @Suppress("SimplifyBooleanWithConstants")
                    if (false && s?.owned == true) {
                        IconButton(onClick = { onLabel(id) }) {
                            Icon(Icons.AutoMirrored.Filled.Label, contentDescription = I18n.t("lab.title"), tint = MaterialTheme.colorScheme.primary)
                        }
                    }
                    // Trimmen/Löschen sind selten gebraucht -> nicht mehr oben, sondern unten im Body.
                },
            )
        },
    ) { pad ->
        Box(Modifier.padding(pad).fillMaxSize().padding(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 16.dp)) {
            val s = session
            when {
                loading -> CircularProgressIndicator(Modifier.align(Alignment.Center))
                error != null -> Text(error!!, color = MaterialTheme.colorScheme.error)
                s != null -> DetailContent(s, neighbors = neighbors, onOpenSession = onOpenSession, onReload = { reloadTick++ },
                    social = social,
                    canTrim = (s.owned && durSec > 1f),
                    onTrim = {
                        // Regler auf den gespeicherten Zuschnitt setzen (wie die PWA), sonst volle Dauer.
                        trimStart = ((s.trimStartMs ?: 0L) / 1000f).coerceIn(0f, durSec)
                        trimEnd = ((s.trimEndMs?.let { e -> e / 1000f }) ?: durSec).coerceIn(0f, durSec)
                        showTrim = true
                    },
                    onDelete = { confirmDelete = true },
                    onRunSelected = { shareRun = it })
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun DetailContent(s: SessionDetail, neighbors: Neighbors? = null, onOpenSession: (Int) -> Unit = {}, onReload: () -> Unit = {},
                          canTrim: Boolean = false, onTrim: () -> Unit = {}, onDelete: () -> Unit = {},
                          onRunSelected: (Int?) -> Unit = {}, social: Boolean = true) {
    val scope = rememberCoroutineScope()
    var liked by remember(s.id) { mutableStateOf(s.liked) }
    var likeCount by remember(s.id) { mutableStateOf(s.likeCount) }
    // Karten-Ansicht kommt aus der zuletzt gewaehlten (SharedPreferences, s. SessionViewPrefs) —
    // sonst muesste man Farbmodus, Glaettung und Schalter in jeder Session neu einstellen.
    val ctxPrefs = LocalContext.current
    var colorMode by remember(s.id) { mutableStateOf(SessionViewPrefs.modus(ctxPrefs)) }
    // Carve-Daten (nur Anzeige) einmal je Session laden.
    var carve by remember(s.id) { mutableStateOf<CarveData?>(null) }
    LaunchedEffect(s.id) { carve = try { Api.sessionCarves(s.id) } catch (_: Exception) { null } }
    val hasCarves = carve?.carves?.isNotEmpty() == true
    // Skalen-Max: 0,6 g, aber höher wenn härter gecarvt (gedeckelt 1,0 g gegen GPS-Glitches).
    val carveGMax = remember(carve) {
        val vals = (carve?.g ?: emptyList()) + (carve?.arcs?.flatten()?.mapNotNull { it.getOrNull(2) } ?: emptyList())
        minOf(maxOf(0.6, vals.maxOrNull() ?: 0.6), 1.0)
    }
    var win by remember(s.id) { mutableStateOf(SessionViewPrefs.glaettung(ctxPrefs)) }
    // Vollbild-Karte, s. unten beim TrackMap.
    var mapFull by remember(s.id) { mutableStateOf(false) }
    var showPumps by remember(s.id) { mutableStateOf(SessionViewPrefs.zeigePumps(ctxPrefs)) }
    // Startversuche: die Anlaeufe, aus denen KEIN Lauf wurde. Standardmaessig an; die Linien holt
    // ein eigener Endpunkt, und zwar erst wenn der Schalter das erste Mal an ist.
    var showAttempts by remember(s.id) { mutableStateOf(SessionViewPrefs.zeigeVersuche(ctxPrefs)) }
    var attempts by remember(s.id) { mutableStateOf<List<AttemptLine>?>(null) }
    LaunchedEffect(s.id, showAttempts) {
        if (showAttempts && attempts == null) {
            attempts = try { Api.sessionAttempts(s.id) } catch (_: Exception) { emptyList() }
        }
    }
    // Jede Aenderung merken — sie gilt dann auch fuer die naechste Session.
    LaunchedEffect(colorMode, win, showPumps, showAttempts) {
        SessionViewPrefs.merke(ctxPrefs, colorMode, win, showPumps, showAttempts)
    }
    var selectedRun by remember(s.id) { mutableStateOf<Int?>(null) }   // ausgewählter Lauf -> nur dieser farbig
    LaunchedEffect(selectedRun) { onRunSelected(selectedRun) }   // hoch melden -> Teilen-Vorauswahl (#37)
    var weightKg by remember { mutableStateOf(0.0) }
    var caption by remember(s.id) { mutableStateOf(s.caption ?: "") }
    var editCaption by remember(s.id) { mutableStateOf(false) }
    var draftCaption by remember(s.id) { mutableStateOf("") }
    var allFoils by remember(s.id) { mutableStateOf<List<Foil>>(emptyList()) }
    var mineIds by remember(s.id) { mutableStateOf<Set<Int>>(emptySet()) }
    // Restliches Setup: Katalog/Listen fuer die Auswahlfelder. Mast und Shim sind reine Werte aus
    // den Einstellungen des Nutzers (my_masts/my_shims) — ohne eigene Werte kein Auswahlfeld,
    // genau wie in der PWA (FoilSelect.tsx).
    var allStabs by remember(s.id) { mutableStateOf<List<StabBrief>>(emptyList()) }
    var myStabIds by remember(s.id) { mutableStateOf<Set<Int>>(emptySet()) }
    var myMasts by remember(s.id) { mutableStateOf<List<Int>>(emptyList()) }
    var myShims by remember(s.id) { mutableStateOf<List<Double>>(emptyList()) }
    var myBoards by remember(s.id) { mutableStateOf<List<BoardBrief>>(emptyList()) }
    LaunchedEffect(Unit) {
        // Fahrergewicht fuer die Leistungsrechnung: das des BESITZERS der Session hat Vorrang.
        // Sonst rechnet man die Session eines anderen mit seinem eigenen Gewicht — die Leistung
        // haengt quadratisch davon ab und war damit einfach falsch (Meldung 27.08.). Erst wenn der
        // Server das Feld nicht liefert (alte Version) oder der Besitzer kein Gewicht hinterlegt
        // hat, das eigene Profil.
        weightKg = FoilPhysics.gewichtFuer(s, try {
            Api.settings()["weight_kg"]?.jsonPrimitive?.doubleOrNull ?: 0.0
        } catch (_: Exception) { 0.0 })
        if (s.owned) {
            try {
                val st = Api.settings()
                mineIds = st["my_foils"]?.jsonArray?.mapNotNull { it.jsonPrimitive.intOrNull }?.toSet() ?: emptySet()
                myStabIds = st["my_stabs"]?.jsonArray?.mapNotNull { it.jsonPrimitive.intOrNull }?.toSet() ?: emptySet()
                myMasts = st["my_masts"]?.jsonArray?.mapNotNull { it.jsonPrimitive.intOrNull } ?: emptyList()
                myShims = st["my_shims"]?.jsonArray?.mapNotNull { it.jsonPrimitive.doubleOrNull } ?: emptyList()
                allFoils = Api.foils()
                allStabs = try { Api.stabs() } catch (_: Exception) { emptyList() }
                myBoards = try { Api.boards() } catch (_: Exception) { emptyList() }
            } catch (_: Exception) {}
        }
    }
    if (editCaption) {
        AlertDialog(
            onDismissRequest = { editCaption = false },
            title = { Text(I18n.t("sd.caption")) },
            text = {
                OutlinedTextField(
                    value = draftCaption, onValueChange = { if (it.length <= 30) draftCaption = it },
                    singleLine = true, supportingText = { Text("${draftCaption.length}/30") },
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    val c = draftCaption.trim(); editCaption = false
                    caption = c
                    scope.launch { try { Api.setCaption(s.id, c) } catch (_: Exception) {} }
                }) { Text(I18n.t("common.save")) }
            },
            dismissButton = { TextButton(onClick = { editCaption = false }) { Text(I18n.t("common.cancel")) } },
        )
    }
    Column(
        Modifier.verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // Eigene Session laedt noch hoch -> dieselbe Karte wie in Home/Sessions statt einer
        // eigenen Notiz (Jan, 01.09.). Verschwindet von selbst, sobald der Upload durch ist.
        if (s.owned && (s.status == "recording" || s.status == "live")) {
            SessionUploadCard(s.id)
        }
        // Nur-GPS-Auswertung: OHNE diesen Satz sucht man die fehlenden Pumps in der Erkennung,
        // obwohl gar keine (brauchbaren) Beschleunigungsdaten in der Aufnahme sind. Stand bisher
        // nur in der PWA. Zwei Faelle: gar kein Accel — oder zu niedrig getaktet (FR55 & Co.).
        val mdet = s.analysis?.metrics
        if (mdet?.detection == "gps_only" && s.status != "live") {
            val hzEff = mdet.accelHzEffective
            val warnText = if (hzEff != null && hzEff > 0)
                I18n.t("sd.lowRateWarning").replace("{hz}", Math.round(hzEff).toString())
            else I18n.t("sd.gpsWarning")
            Card(
                Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.tertiaryContainer),
            ) {
                Text(warnText, Modifier.padding(12.dp), style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onTertiaryContainer)
            }
        }
        // Vor/Zurück zu Nachbar-Sessions (wie Web): deaktiviert, wenn es keine gibt.
        neighbors?.let { nb ->
            if (nb.older != null || nb.newer != null) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    TextButton(onClick = { nb.older?.let(onOpenSession) }, enabled = nb.older != null) { Text(I18n.t("sd.older")) }
                    TextButton(onClick = { nb.newer?.let(onOpenSession) }, enabled = nb.newer != null) { Text(I18n.t("sd.newer")) }
                }
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            AvatarCircle(name = s.ownerName, avatarUrl = s.ownerAvatarUrl, size = 44.dp)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(prettyDate(s.startedAt, s.tz), style = MaterialTheme.typography.headlineSmall)
                if (!s.owned && !s.ownerName.isNullOrBlank()) {
                    Text(s.ownerName, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
                }
            }
            FilledTonalButton(
                onClick = {
                    val prev = liked; liked = !liked; likeCount += if (liked) 1 else -1
                    scope.launch {
                        try { val st = Api.toggleLike(s.id); liked = st.liked; likeCount = st.like_count }
                        catch (_: Exception) { liked = prev; likeCount += if (liked) 1 else -1 }
                    }
                },
                colors = ButtonDefaults.filledTonalButtonColors(
                    containerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.12f),
                    contentColor = MaterialTheme.colorScheme.primary,
                ),
            ) {
                // Herz rosa im „geliked"-Zustand (wie Web), sonst Marken-Cyan.
                Icon(if (liked) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder, contentDescription = "Like",
                    tint = if (liked) Color(0xFFF43F5E) else MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(6.dp))
                Text("$likeCount")
            }
        }
        s.placeName?.takeIf { it.isNotBlank() }?.let {
            Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        s.placeWater?.takeIf { it.isNotBlank() && it != s.placeName }?.let {
            Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        // Start–End-Zeit + Dauer (wie Web); End-Zeit kommt vom Server (ggf. aus letztem GPS abgeleitet).
        run {
            val sMs = epochMs(s.startedAt); val eMs = epochMs(s.endedAt)
            if (sMs != null && eMs != null && eMs > sMs) {
                val secs = ((eMs - sMs) / 1000).toInt()
                val dur = if (secs >= 3600) "%d:%02d h".format(secs / 3600, (secs % 3600) / 60)
                          else "%d:%02d min".format(secs / 60, secs % 60)
                val oc = I18n.t("sessions.oclock").let { if (it.isBlank()) "" else " $it" }
                Text("${hhmmLoc(s.startedAt, s.tz)} – ${hhmmLoc(s.endedAt, s.tz)}$oc · ${I18n.t("sd.duration")} $dur",
                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        // Uhr-Badge: mit welcher Uhr aufgenommen.
        s.deviceLabel?.takeIf { it.isNotBlank() }?.let {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Watch, contentDescription = null, modifier = Modifier.size(14.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.width(4.dp))
                Text(it, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        if (caption.isNotBlank()) Text(caption)
        if (s.owned) {
            TextButton(onClick = { draftCaption = caption; editCaption = true }) {
                Text(if (caption.isBlank()) I18n.t("sd.captionAdd") else I18n.t("sd.captionEdit"))
            }
        }
        // Setup dieser Session: Foil, Stab, Mastlaenge, Shim, Board — OHNE Labels, alles in EINER
        // umbrechenden Zeile. Die Label-Spalte darueber brauchte viel zu viel Platz (Jan, 29.07.);
        // dieselbe Form hat die iOS-App und die PWA (FoilSelect.tsx). Ein Feld erscheint nur, wenn
        // dafuer ueberhaupt ein Wert gesetzt ist (explizit fuer die Session ODER als Profil-Standard)
        // — der Platzhalter „Standard verwenden" faellt damit weg. Wer eine Kategorie ganz ohne Wert
        // fuellen will, setzt zuerst den Standard im Profil.
        if (s.owned) {
            val setup = s.setup
            val stabTxt = setup?.stab?.let { "${it.brand} ${it.model} ${it.size}".trim() }
            val mastTxt = setup?.mastLenCm?.let { "$it cm" }
            val shimTxt = setup?.shimDeg?.let { fmtShim(it) }
            val boardTxt = setup?.board?.name
            val zeigeFoil = allFoils.isNotEmpty()
            if (zeigeFoil || stabTxt != null || mastTxt != null || shimTxt != null || boardTxt != null) {
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    if (zeigeFoil) {
                        FoilDropdown(
                            all = allFoils, mineIds = mineIds, selectedId = s.foil?.id,
                            onSelect = { id -> scope.launch { try { Api.setSessionFoil(s.id, id); onReload() } catch (_: Exception) {} } },
                        )
                    }
                    if (allStabs.isNotEmpty() && stabTxt != null) {
                        SetupDropdown(
                            current = stabTxt,
                            groups = listOf(
                                I18n.t("setup.myStabs") to allStabs.filter { it.id in myStabIds },
                                I18n.t("foils.allBrands") to allStabs.filter { it.id !in myStabIds },
                            ),
                            labelOf = { "${it.brand} ${it.model} ${it.size}".trim() },
                            idOf = { it.id },
                            onPick = { id ->
                                scope.launch {
                                    try { Api.setSessionSetup(s.id, stabId = id, setStab = true); onReload() } catch (_: Exception) {}
                                }
                            },
                        )
                    }
                    if (myMasts.isNotEmpty() && mastTxt != null) {
                        SetupValueDropdown(
                            current = mastTxt,
                            options = myMasts.map { it to "$it cm" },
                            onPick = { v ->
                                scope.launch {
                                    try { Api.setSessionSetup(s.id, mastLenCm = v, setMast = true); onReload() } catch (_: Exception) {}
                                }
                            },
                        )
                    }
                    if (myShims.isNotEmpty() && shimTxt != null) {
                        SetupValueDropdown(
                            current = shimTxt,
                            options = myShims.map { it to fmtShim(it) },
                            onPick = { v ->
                                scope.launch {
                                    try { Api.setSessionSetup(s.id, shimDeg = v, setShim = true); onReload() } catch (_: Exception) {}
                                }
                            },
                        )
                    }
                    if (myBoards.isNotEmpty() && boardTxt != null) {
                        SetupDropdown(
                            current = boardTxt,
                            groups = listOf("" to myBoards),
                            labelOf = { it.name },
                            idOf = { it.id },
                            onPick = { id ->
                                scope.launch {
                                    try { Api.setSessionSetup(s.id, boardId = id, setBoard = true); onReload() } catch (_: Exception) {}
                                }
                            },
                        )
                    }
                }
            }
        }

        // Sportart-Klassifikation (docs/sport-classification.md): der Besitzer ordnet selbst zu,
        // Fremde können nur bitten. Der amber Kasten erscheint, solange eine Bitte offen ist.
        if (s.owned) ClassificationNotice(s, scope, onReload)

        // Medien (Videos + Fotos): Besitzer kann Fotos hochladen + YouTube-Videos verlinken
        // (mehrere, wie PWA). Tippen -> Vollbild/Video.
        var photos by remember(s.id) { mutableStateOf<List<SessionPhoto>>(emptyList()) }
        var videos by remember(s.id) { mutableStateOf<List<SessionVideo>>(emptyList()) }
        var lightboxIdx by remember(s.id) { mutableStateOf<Int?>(null) }
        val ctx = LocalContext.current
        suspend fun reloadPhotos() { photos = try { Api.sessionPhotos(s.id) } catch (_: Exception) { emptyList() } }
        suspend fun reloadVideos() {
            videos = try { Api.sessionVideos(s.id) } catch (_: Exception) {
                // Fallback (alter Server): Legacy-Feld als Einzelvideo zeigen.
                s.youtubeUrl?.let { listOf(SessionVideo(0, it)) } ?: emptyList()
            }
        }
        LaunchedEffect(s.id) { reloadPhotos(); reloadVideos() }
        val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
            if (uri != null) scope.launch {
                val bytes = withContext(Dispatchers.IO) {
                    ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() }?.let { downscaleJpeg(it) }
                }
                if (bytes != null) { try { Api.uploadSessionPhoto(s.id, bytes); reloadPhotos() } catch (_: Exception) {} }
            }
        }
        // Festes 2-spaltiges Grid: Videos (falls verlinkt) + Fotos, alle Kacheln gleich groß (16:9).
        val shownVideos = videos.filter { youtubeId(it.youtubeUrl) != null }
        val total = shownVideos.size + photos.size
        if (total > 0) {
            val ctxYt = LocalContext.current
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                var row = 0
                while (row * 2 < total) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        for (col in 0 until 2) {
                            val idx = row * 2 + col
                            if (idx >= total) { Spacer(Modifier.weight(1f)); continue }
                            Box(Modifier.weight(1f).aspectRatio(16f / 9f).clip(RoundedCornerShape(12.dp))) {
                                if (idx < shownVideos.size) {
                                    val v = shownVideos[idx]
                                    AsyncImage(
                                        model = "${Api.BASE}/api/public/video-thumb/${youtubeId(v.youtubeUrl)}",
                                        contentDescription = "YouTube", contentScale = ContentScale.Crop,
                                        modifier = Modifier.fillMaxSize().clickable {
                                            ctxYt.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(v.youtubeUrl)))
                                        },
                                    )
                                    Icon(Icons.Filled.PlayCircle, contentDescription = null,
                                        modifier = Modifier.align(Alignment.Center).size(48.dp), tint = Color.White)
                                    if (s.owned && v.id > 0) {
                                        Icon(Icons.Filled.Close, contentDescription = I18n.t("common.delete"), tint = Color.White,
                                            modifier = Modifier.align(Alignment.TopEnd).padding(6.dp).size(24.dp)
                                                .background(Color.Black.copy(alpha = 0.5f), CircleShape)
                                                .clickable { scope.launch { try { Api.deleteSessionVideo(s.id, v.id); reloadVideos() } catch (_: Exception) {} } }
                                                .padding(3.dp))
                                    }
                                } else {
                                    val p = photos[idx - shownVideos.size]
                                    AsyncImage(
                                        model = Api.mediaUrl(p.url), contentDescription = null, contentScale = ContentScale.Crop,
                                        modifier = Modifier.fillMaxSize().clickable { lightboxIdx = photos.indexOf(p) },
                                    )
                                    if (s.owned) {
                                        Icon(Icons.Filled.Close, contentDescription = I18n.t("common.delete"), tint = Color.White,
                                            modifier = Modifier.align(Alignment.TopEnd).padding(6.dp).size(24.dp)
                                                .background(Color.Black.copy(alpha = 0.5f), CircleShape)
                                                .clickable { scope.launch { try { Api.deleteSessionPhoto(s.id, p.id); reloadPhotos() } catch (_: Exception) {} } }
                                                .padding(3.dp))
                                    }
                                }
                            }
                        }
                    }
                    row++
                }
            }
        }
        // Vollbild-Lightbox: tippen schließt; bei mehreren Fotos horizontal wischen.
        lightboxIdx?.let { startIdx ->
            PhotoLightbox(photos, startIdx, onClose = { lightboxIdx = null })
        }
        if (s.owned) {
            var videoDialog by remember { mutableStateOf(false) }
            var videoUrl by remember { mutableStateOf("") }
            var videoErr by remember { mutableStateOf<String?>(null) }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = {
                    picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                }) { Text(I18n.t("sd.addPhoto")) }
                OutlinedButton(onClick = { videoUrl = ""; videoErr = null; videoDialog = true }) {
                    Text(I18n.t("meta.linkVideo"))
                }
            }
            if (videoDialog) {
                AlertDialog(
                    onDismissRequest = { videoDialog = false },
                    title = { Text(I18n.t("meta.linkVideo")) },
                    text = {
                        Column {
                            OutlinedTextField(
                                value = videoUrl, onValueChange = { videoUrl = it },
                                placeholder = { Text(I18n.t("meta.youtubePlaceholder")) },
                                singleLine = true, modifier = Modifier.fillMaxWidth(),
                            )
                            videoErr?.let {
                                Spacer(Modifier.height(6.dp))
                                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    },
                    confirmButton = {
                        TextButton(onClick = {
                            val u = videoUrl.trim()
                            if (u.isBlank()) { videoDialog = false; return@TextButton }
                            scope.launch {
                                try { Api.addSessionVideo(s.id, u); reloadVideos(); videoDialog = false }
                                catch (_: Exception) { videoErr = I18n.t("meta.errYoutube") }
                            }
                        }) { Text(I18n.t("common.save")) }
                    },
                    dismissButton = { TextButton(onClick = { videoDialog = false }) { Text(I18n.t("common.cancel")) } },
                )
            }
        }

        val a = s.analysis
        // EINMAL geparst und hochgezogen: die Karte weiter unten braucht den Track, die Lauf-Tabelle
        // braucht daraus den Puls je Punkt. Vorher lag `track` in dem `let`-Block der Karte und war
        // fuer die Tabelle nicht sichtbar. `remember` steht bewusst UNBEDINGT (nicht im `let`), damit
        // die Composition-Struktur stabil bleibt, wenn eine Session noch keinen Track hat.
        val trackForRuns = remember(a?.trackGeojson) { a?.trackGeojson?.let { parseTrack(it) } }
        // Track auf OSM-Karte (osmdroid): nur die Foiling-Läufe, gefärbt nach Modus (Speed/Puls/Pump),
        // optional Pump-Marker — wie im Web.
        trackForRuns?.let { track ->
            val segs = a?.segments.orEmpty()
            if (track.points.size >= 2 && segs.isNotEmpty()) {
                val hasHr = remember(track) { track.hr.any { it != null && it > 0 } }
                val hasPump = remember(track) { track.pumpHz.any { it != null } }
                val hrRange = remember(track) {
                    val vs = track.hr.filterNotNull().filter { it > 0 }
                    (vs.minOrNull() ?: 0) to (vs.maxOrNull() ?: 1)
                }
                val pumpRange = remember(track) {
                    val vs = track.pumpHz.filterNotNull()
                    (vs.minOrNull() ?: 0.0) to (vs.maxOrNull() ?: 1.0)
                }
                // Farbmodus (Speed/Puls/Pump) + Marker-Umschalter in DERSELBEN Zeile (rechts).
                if (hasHr || hasPump || hasCarves) {
                    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterChip(selected = colorMode == ColorMode.SPEED, onClick = { colorMode = ColorMode.SPEED }, label = { Text(I18n.t("sd.colorSpeed")) }, colors = cyanChipColors())
                        if (hasHr) FilterChip(selected = colorMode == ColorMode.HR, onClick = { colorMode = ColorMode.HR }, label = { Text(I18n.t("sd.colorPuls")) }, colors = cyanChipColors())
                        if (hasPump) FilterChip(selected = colorMode == ColorMode.PUMP, onClick = { colorMode = ColorMode.PUMP }, label = { Text(I18n.t("sd.colorPump")) }, colors = cyanChipColors())
                        if (hasCarves) FilterChip(selected = colorMode == ColorMode.TURNS, onClick = { colorMode = ColorMode.TURNS }, label = { Text("Carves") }, colors = cyanChipColors())
                    }
                }
                // Zweite Zeile: links die Glättung (nur im Speed-Modus), rechts die
                // Startversuche. Jan, 02.09.: die obere Zeile ist waagerecht scrollbar, ein
                // Schalter am Ende wäre dort halb versteckt. Diese Zeile scrollt NICHT, deshalb
                // gibt es sie jetzt IMMER — sonst verschwände der Schalter in den anderen
                // Farbmodi (Puls/Pump/Carves), wo es keine Glättung gibt.
                // Glaettung: nur im Speed-Modus — bei Puls/Pump/Carves gibt es nichts zu
                // glaetten (die PWA macht es genauso). Eigene Zeile, links.
                if (colorMode == ColorMode.SPEED) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text(I18n.t("sd.smoothing"), style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(end = 8.dp))
                        listOf(1, 3, 5).forEach { w ->
                            FilterChip(selected = win == w, onClick = { win = w }, label = { Text("${w}s") },
                                colors = cyanChipColors(), modifier = Modifier.padding(end = 8.dp))
                        }
                    }
                }
                // Die zwei Schalter in einer eigenen, UMBRECHENDEN Zeile (FlowRow), rechts.
                // Vorher stand „Marker" am Ende der oberen Zeile — und die scrollt waagerecht,
                // der Schalter hing also halb ausserhalb (Jans Screenshot 02.09.).
                val pumpAnzahl = a?.pumpCount
                val zeigeMarker = pumpAnzahl != null && pumpAnzahl > 0
                // Startversuche nur anbieten, wenn es welche gibt (oder noch geladen wird).
                // Bewusst NICHT an der Kachel-Zahl festmachen: die gilt nur fuer den ausgewerteten
                // Bereich, Versuche vor dem Zuschnitt kommen dort nicht vor.
                val zeigeVersuchsSchalter = attempts == null || attempts!!.isNotEmpty()
                if (zeigeMarker || zeigeVersuchsSchalter) {
                    FlowRow(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.End,
                        verticalArrangement = Arrangement.Center,
                    ) {
                        if (zeigeMarker) {
                            Row(verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.padding(end = 12.dp)) {
                                Text(I18n.t("sd.markerShort"), style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Spacer(Modifier.width(4.dp))
                                Switch(checked = showPumps, onCheckedChange = { showPumps = it })
                            }
                        }
                        if (zeigeVersuchsSchalter) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(I18n.t("sd.showAttempts"), style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Spacer(Modifier.width(4.dp))
                                Switch(checked = showAttempts, onCheckedChange = { showAttempts = it })
                            }
                        }
                    }
                }
                Card(Modifier.fillMaxWidth()) {
                    Box {
                        TrackMap(track, segs, colorMode, hrRange, pumpRange, showPumps, win,
                        if (showAttempts) attempts.orEmpty() else emptyList(),
                            selectedRun, { selectedRun = if (selectedRun == it) null else it },
                            if (colorMode == ColorMode.TURNS) carve else null, carveGMax,
                            Modifier.fillMaxWidth().height(300.dp))
                        // Vollbild-Karte (PWA-Paritaet: dort ein Knopf "Vollbild" ueber der Karte
                        // bzw. die Taste F). Hier ein Knopf IN der Kartenecke — dasselbe Muster,
                        // das die Vergleichskarte dieser App schon nutzt.
                        IconButton(
                            onClick = { mapFull = true },
                            modifier = Modifier.align(Alignment.TopEnd).padding(6.dp).size(34.dp)
                                .background(Color.Black.copy(alpha = 0.45f), CircleShape),
                        ) {
                            Icon(Icons.Filled.OpenInFull, contentDescription = I18n.t("sd.fullscreen"),
                                tint = Color.White, modifier = Modifier.size(17.dp))
                        }
                    }
                }
                if (mapFull) {
                    // Vollbild als Dialog: die Karte bleibt vollstaendig bedienbar (Lauf antippen,
                    // Farb-Modus wirkt weiter), nur ohne den uebrigen Seiteninhalt.
                    Dialog(onDismissRequest = { mapFull = false },
                           properties = DialogProperties(usePlatformDefaultWidth = false)) {
                        Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
                            TrackMap(track, segs, colorMode, hrRange, pumpRange, showPumps, win,
                                if (showAttempts) attempts.orEmpty() else emptyList(),
                                selectedRun, { selectedRun = if (selectedRun == it) null else it },
                                if (colorMode == ColorMode.TURNS) carve else null, carveGMax,
                                Modifier.fillMaxSize())
                            IconButton(
                                onClick = { mapFull = false },
                                modifier = Modifier.align(Alignment.TopEnd).padding(12.dp).size(40.dp)
                                    .background(Color.Black.copy(alpha = 0.5f), CircleShape),
                            ) {
                                Icon(Icons.Filled.Close, contentDescription = I18n.t("sd.close"),
                                    tint = Color.White, modifier = Modifier.size(22.dp))
                            }
                        }
                    }
                }
                // Farb-Legende (min→max) für den gewählten Modus — wie PWA.
                if (colorMode == ColorMode.TURNS) CarveLegend(carve?.counts, carveGMax)
                else ColorLegend(colorMode, hrRange, pumpRange)
                selectedRun?.let { sel ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("${I18n.t("home.runs")} #${sel + 1}", style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.primary)
                        Spacer(Modifier.width(8.dp))
                        TextButton(onClick = { selectedRun = null }) { Text(I18n.t("sd.clearSelection")) }
                    }
                }
            }
        }
        // Leistungs-Karte (theoretische Pump-Leistung bei Ø-/Top-Speed). hasSpecs: Katalog-Einträge
        // ohne Herstellermaße stehen mit 0 in Fläche/Spannweite -> die Rechnung teilt durch 0 und
        // käme auf Unsinn. Solche Foils bleiben wählbar, die Leistungs-Karte fällt nur weg.
        if (a != null && s.foil != null && s.foil.hasSpecs && s.foil.thicknessMm > 0 && weightKg > 0) {
            PowerCard(a, s.foil, weightKg)
        }
        if (a == null) {
            Text(I18n.t("sd.analyzing"), color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            val m = a.metrics
            val segList = a.segments.orEmpty()
            fun dist(x: Double) = if (x < 1000) "%.0f m".format(x) else "%.2f km".format(x / 1000)
            fun mmssD(x: Double) = "%d:%02d".format((x / 60).toInt(), (x % 60).toInt())
            // Rekord-Läufe (für anklickbare Kacheln -> Lauf auswählen).
            val bestSpeedIdx = segList.indices.maxByOrNull { segList[it].maxSpeedMps }
            val longestRunIdx = segList.indices.maxByOrNull { segList[it].durationS }
            val farthestRunIdx = segList.indices.maxByOrNull { segList[it].distanceM }
            val bestGlideIdx = segList.indices.maxByOrNull { segList[it].longestGlideS }
            val stats = buildList {
                a.totalDistanceM?.let { add(StatItem(I18n.t("compare.distance"), dist(it))) }
                a.foilingDistanceM?.let { add(StatItem(I18n.t("home.foiling"), dist(it))) }
                a.foilingTimeS?.let { add(StatItem(I18n.t("compare.foilTime"), mmssD(it))) }
                // Laeufe/Starts (Jan, 01.09.): links die Laeufe, rechts die Startversuche — sonst
                // sieht „2 Laeufe" nach faulem Abend aus, wenn es 15 Anlaeufe waren. Zwei Zahlen
                // aus ZWEI Detektoren (Laeufe = Bewegungsmodell, Versuche = reines GPS), darum:
                // ohne Versuchsdaten oder wenn mehr Laeufe als Versuche herauskommen (im Bestand
                // 15 von 2265 Sessions) zeigen wir nur die Laufzahl statt eines unsinnigen 12/9.
                if (segList.isNotEmpty()) {
                    val ver = s.analysis?.startAttempts
                    if (ver != null && ver > 0 && ver >= segList.size) {
                        add(StatItem(I18n.t("stat.runsStarts"), "${segList.size}/$ver",
                            info = I18n.t("stat.runsStartsTip")))
                    } else {
                        add(StatItem(I18n.t("home.runs"), segList.size.toString()))
                    }
                }
                (m?.avgSpeedMps)?.let { add(StatItem(I18n.t("sd.avgSpeed"), "%.1f km/h".format(it * 3.6))) }
                a.maxSpeedMps?.let { add(StatItem(I18n.t("home.topSpeed"), "%.1f km/h".format(it * 3.6), bestSpeedIdx)) }
                a.pumpCount?.let { pc ->
                    add(StatItem(I18n.t("home.pumps"), pc.toString()))
                    if (pc > 0 && a.foilingDistanceM != null) add(StatItem(I18n.t("sd.avgDistPerPump"), "%.1f m".format(a.foilingDistanceM / pc)))
                }
                (m?.avgPumpHz ?: a.avgCadenceHz)?.let { add(StatItem(I18n.t("sd.avgPump"), PumpUnit.fmt(it))) }
                (m?.avgHr)?.let { if (it > 0) add(StatItem(I18n.t("sd.avgHr"), "$it")) }
                (m?.maxHr)?.let { if (it > 0) add(StatItem(I18n.t("sd.maxHr"), "$it")) }
                longestRunIdx?.let { add(StatItem(I18n.t("home.longestRun"), mmssD(segList[it].durationS), it)) }
                farthestRunIdx?.let { add(StatItem(I18n.t("home.farthestRun"), dist(segList[it].distanceM), it)) }
                bestGlideIdx?.let { if (segList[it].longestGlideS > 0) add(StatItem(I18n.t("home.longestGlide"), "%.1f s".format(segList[it].longestGlideS), it)) }
            }
            StatGrid(stats, selectedRun) { selectedRun = if (selectedRun == it) null else it }
            // Aussortierte/abgetrennte Läufe stehen nicht mehr in den Segmenten — die Hinweise über
            // der Tabelle sind die einzige Spur davon, deshalb auch bei 0 Läufen rendern (wie PWA).
            val excluded = s.excludedRanges.orEmpty()
            val powered = m?.fremdkraftLaeufe.orEmpty()
            val kept = s.fremdkraftKeep.orEmpty()
            if (segList.isNotEmpty() || excluded.isNotEmpty() || powered.isNotEmpty() || kept.isNotEmpty()) RunsTable(
                segments = segList, selected = selectedRun, sessionId = s.id,
                hr = trackForRuns?.hr.orEmpty(),
                excluded = excluded, poweredRuns = powered, keptWindows = kept,
                canEdit = s.owned, startedAt = s.startedAt, tz = s.tz,
                win = win, wattFuer = FoilPhysics.wattRechner(s.foil, weightKg),
                onSaved = { fresh -> selectedRun = null; SessionCache.store(fresh); onReload() },
            ) { selectedRun = if (selectedRun == it) null else it }
        }

        // Melden ganz unten, UNTER den Lauf-Statistiken (Jan, 29.07.): erst die Session ansehen,
        // dann urteilen — oben stand es im Weg. Nur bei FREMDEN Sessions; bei eigenen sitzen an
        // dieser Stelle im Ablauf die Klassifikations-Felder (oben im Inhalt).
        // Ganz unten, weil selten gebraucht: bei EIGENEN Sessions die beiden Klassifikations-
        // Anpassungen, bei FREMDEN die Melde-Knoepfe — erst ansehen, dann urteilen.
        Spacer(Modifier.height(12.dp))
        HorizontalDivider()
        Spacer(Modifier.height(8.dp))
        // Melden ist eine SOZIALE Funktion und haengt damit am Age-Gate, genau wie der Spot-Chat
        // oben. Fuer Konten unter 13 (social=false) weist der Server den Vote mit 403 ab — die
        // Knoepfe waeren also nicht nur unerlaubt, sondern kaputt. Die Klassifikation der EIGENEN
        // Session bleibt, die ist nicht sozial.
        if (s.owned) ClassificationPickers(s, scope, onReload) else if (social) ReportRow(s.id)

        // Zusammenführung wieder auflösen (nur Besitzer, ganz am Ende).
        if (s.owned && s.mergedCount > 0) {
            Spacer(Modifier.height(4.dp))
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(I18n.t("merge.mergedFrom"), Modifier.weight(1f),
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                TextButton(onClick = {
                    scope.launch { try { Api.unmergeSession(s.id); WatchSync.tick.value++; onReload() } catch (_: Exception) {} }
                }) { Text(I18n.t("merge.unmerge")) }
            }
        }

        // Selten gebrauchte Aktionen ganz unten (wie PWA): Übertragen · Trimmen · Löschen.
        if (s.owned) {
            Spacer(Modifier.height(12.dp))
            HorizontalDivider()
            Spacer(Modifier.height(8.dp))
            TransferPicker(s.id)
            Spacer(Modifier.height(8.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (canTrim) {
                    OutlinedButton(onClick = onTrim, modifier = Modifier.weight(1f)) {
                        Icon(Icons.Filled.ContentCut, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp)); Text(I18n.t("sd.trim"))
                    }
                }
                OutlinedButton(onClick = onDelete, modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error)) {
                    Icon(Icons.Filled.Delete, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp)); Text(I18n.t("common.delete"))
                }
            }
        }
    }
}

// Geparster Track: GPS-Punkte (lon,lat) + Speed je Glättungsfenster (1/3/5 s) + Puls + Pump-Hz.
class Track(
    val points: List<Pair<Double, Double>>,
    val speedsMps: List<Double>,         // 3 s (Default)
    val speeds1: List<Double>,
    val speeds5: List<Double>,
    val hr: List<Int?>,
    val pumpHz: List<Double?>,
) {
    fun speedsFor(win: Int): List<Double> = when (win) { 1 -> speeds1; 5 -> speeds5; else -> speedsMps }
}

// internal statt private: die gemerkte Karten-Ansicht (SessionViewPrefs) speichert den Modus.
internal enum class ColorMode { SPEED, HR, PUMP, TURNS }

// Kurvenlage-g -> Farbe (wie Web/turns.ts). Untere Hälfte an ABSOLUTE g gebunden (grün 0,1 →
// gelb 0,35 → rot 0,6); oberhalb 0,6 g bis zum Lauf-Max (gMax, gedeckelt 1,0) rot → magenta → weiß.
// g<=0.02 = kein Carve (grau).
fun carveColor(g: Double, gMax: Double = 0.6): Color {
    if (g <= 0.02) return GRAY
    val top = maxOf(0.6, gMax)
    val gc = g.coerceIn(0.1, top)
    fun lerp(a: Color, b: Color, t: Double): Color {
        val tt = t.coerceIn(0.0, 1.0).toFloat()
        return Color(a.red + (b.red - a.red) * tt, a.green + (b.green - a.green) * tt, a.blue + (b.blue - a.blue) * tt)
    }
    val green = Color(0xFF22C55E); val yellow = Color(0xFFEAB308); val red = Color(0xFFDC2626)
    val magenta = Color(0xFFD946EF); val white = Color(0xFFFFFFFF)
    if (gc <= 0.35) return lerp(green, yellow, (gc - 0.1) / 0.25)
    if (gc <= 0.6) return lerp(yellow, red, (gc - 0.35) / 0.25)
    val f = (gc - 0.6) / (top - 0.6)
    return if (f <= 0.5) lerp(red, magenta, f / 0.5) else lerp(magenta, white, (f - 0.5) / 0.5)
}

// Farb-Legende (horizontaler Verlauf min→max) für den gewählten Farbmodus — wie die PWA.
@Composable
private fun ColorLegend(mode: ColorMode, hrRange: Pair<Int, Int>, pumpRange: Pair<Double, Double>) {
    val (lo, hi) = when (mode) {
        ColorMode.SPEED -> "8 km/h" to "25 km/h"     // feste Speed-Skala (wie speedColor)
        ColorMode.HR -> "${hrRange.first}" to "${hrRange.second} bpm"
        ColorMode.PUMP -> PumpUnit.fmtLegend(pumpRange.first, false) to PumpUnit.fmtLegend(pumpRange.second, true)
        ColorMode.TURNS -> "" to ""   // TURNS nutzt CarveLegend, nicht diese Funktion
    }
    val ramp = remember { (0..12).map { rampColor(it / 12.0) } }
    Column(Modifier.fillMaxWidth().padding(top = 2.dp)) {
        Box(Modifier.fillMaxWidth().height(10.dp).clip(RoundedCornerShape(5.dp))
            .background(androidx.compose.ui.graphics.Brush.horizontalGradient(ramp)))
        Row(Modifier.fillMaxWidth().padding(top = 2.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(lo, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(hi, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

// Carve-Legende: Kurvenlage-Verlauf (grün→rot, oberhalb 0,6 g magenta→weiß bis Lauf-Max) +
// Carve-Zähler nach Drehung (fett wenn >0). Nur Anzeige, NICHT Rekorde/Stats.
@Composable
private fun CarveLegend(counts: CarveCounts?, gMax: Double) {
    val c = counts ?: CarveCounts()
    val ramp = remember(gMax) { (0..12).map { carveColor(0.1 + (gMax - 0.1) * it / 12.0, gMax) } }
    val maxLabel = if (gMax <= 0.6) "0,6" else String.format(java.util.Locale.US, "%.1f", gMax).replace(".", ",")
    Column(Modifier.fillMaxWidth().padding(top = 2.dp)) {
        Box(Modifier.fillMaxWidth().height(10.dp).clip(RoundedCornerShape(5.dp))
            .background(androidx.compose.ui.graphics.Brush.horizontalGradient(ramp)))
        Row(Modifier.fillMaxWidth().padding(top = 2.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("0,1 g", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("$maxLabel g", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            CarveCount("90–180°", c.s); CarveCount("180–360°", c.m); CarveCount(">360°", c.l)
        }
    }
}

@Composable
private fun CarveCount(label: String, n: Int) {
    Text("$label: $n", style = MaterialTheme.typography.bodySmall,
        fontWeight = if (n > 0) FontWeight.Bold else FontWeight.Normal,
        color = if (n > 0) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant)
}

fun parseTrack(tg: JsonElement): Track {
    return try {
        val obj = tg.jsonObject
        val coords = obj["geometry"]!!.jsonObject["coordinates"]!!.jsonArray
        val pts = coords.map { c ->
            val arr = c.jsonArray
            arr[0].jsonPrimitive.doubleOrNull!! to arr[1].jsonPrimitive.doubleOrNull!!  // lon,lat
        }
        val props = obj["properties"]?.jsonObject
        val s3def = props?.get("speeds_mps")?.jsonArray?.map { it.jsonPrimitive.doubleOrNull ?: 0.0 } ?: emptyList()
        val sw = props?.get("speeds")?.jsonObject
        fun win(key: String): List<Double> =
            sw?.get(key)?.jsonArray?.map { it.jsonPrimitive.doubleOrNull ?: 0.0 } ?: s3def
        val hr = props?.get("hr")?.jsonArray?.map { it.jsonPrimitive.intOrNull } ?: emptyList()
        val pumpHz = props?.get("pump_hz")?.jsonArray?.map { it.jsonPrimitive.doubleOrNull } ?: emptyList()
        Track(pts, win("3"), win("1"), win("5"), hr, pumpHz)
    } catch (_: Exception) { Track(emptyList(), emptyList(), emptyList(), emptyList(), emptyList(), emptyList()) }
}

// Wert -> Farbe (blau niedrig -> rot hoch).
fun rampColor(t: Double): Color {
    val hue = ((1 - t.coerceIn(0.0, 1.0)) * 240).toFloat()
    return Color(android.graphics.Color.HSVToColor(floatArrayOf(hue, 0.85f, 0.95f)))
}
// Speed -> Farbe (8..25 km/h), wie Wear/Web.
fun speedColor(kmh: Double): Color = rampColor((kmh - 8) / (25 - 8))

val GRAY = Color(0xFF64748B)
// Bernstein wie in der PWA (#f59e0b) fuer die Startversuche — klar unterscheidbar von den
// Lauf-Farbskalen (gruen/gelb/rot bzw. cyan) und von grau.
val ATTEMPT_COLOR = Color(0xFFF59E0B)

// Track auf OSM-Karte (osmdroid, FLOSS — wie Spots/Web). Nur die Foiling-Läufe
// (segments[].iStart..iEnd), je Punktpaar nach Modus gefärbt; Nicht-Foiling unsichtbar.
// Optional weiße Pump-Marker an den erkannten Pump-Stößen.
private const val MAX_DRAW_GAP_M = 30.0

private fun pumpDot(): android.graphics.drawable.Drawable {
    // Dichteskaliert: 14 PHYSISCHE px waren auf HiDPI-Displays winzig (~5 dp). Jetzt ~13 dp,
    // weißer Punkt mit dunklem Ring -> gut sichtbar über der farbigen Linie (wie im Web).
    val d = android.content.res.Resources.getSystem().displayMetrics.density
    val s = (13f * d).toInt().coerceAtLeast(14)
    val r = s / 2f
    val ring = 2f * d
    val bmp = android.graphics.Bitmap.createBitmap(s, s, android.graphics.Bitmap.Config.ARGB_8888)
    val cv = android.graphics.Canvas(bmp)
    val fill = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { color = android.graphics.Color.WHITE }
    val edge = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
        color = android.graphics.Color.rgb(15, 23, 42); style = android.graphics.Paint.Style.STROKE; strokeWidth = ring
    }
    cv.drawCircle(r, r, r - ring, fill)
    cv.drawCircle(r, r, r - ring, edge)
    return android.graphics.drawable.BitmapDrawable(null, bmp)
}

@Composable
private fun TrackMap(
    track: Track, segments: List<Segment>, mode: ColorMode,
    hrRange: Pair<Int, Int>, pumpRange: Pair<Double, Double>, showPumps: Boolean, win: Int,
    /** Misslungene Startversuche als fertige Linien; leer = nicht anzeigen. */
    attempts: List<AttemptLine>,
    selectedRun: Int?, onSelectRun: (Int) -> Unit,
    carve: CarveData?, carveGMax: Double,
    modifier: Modifier = Modifier,
) {
    val pts = track.points
    val speeds = track.speedsFor(win)
    fun colorAt(i: Int): Color = when (mode) {
        ColorMode.SPEED -> speedColor((speeds.getOrNull(i) ?: 0.0) * 3.6)
        ColorMode.HR -> {
            val v = track.hr.getOrNull(i)
            val (lo, hi) = hrRange
            if (v == null || v <= 0) GRAY else rampColor((v - lo).toDouble() / (hi - lo).coerceAtLeast(1).toDouble())
        }
        ColorMode.PUMP -> {
            val v = track.pumpHz.getOrNull(i)
            val (lo, hi) = pumpRange
            if (v == null) GRAY else rampColor((v - lo) / (hi - lo).coerceAtLeast(1e-6))
        }
        ColorMode.TURNS -> GRAY   // Basis-Track grau; die Carve-Bögen kommen farbig darüber
    }
    MapTiles.MitUmschalter(modifier) { ebene ->
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            // osmdroid raeumt NICHT von selbst auf: eine MapView haelt Kachel-Threads und
            // einen Kachel-Cache, und beides bleibt liegen, wenn Compose die View verwirft.
            // In einer scrollenden Liste heisst das: jedes Rein- und Rausscrollen legt eine neue
            // Karte an, die alte bleibt im Speicher. Jan: „die Spots-Ansicht crasht beim
            // Scrollen" (02.09.). `onDetach()` ist der von osmdroid dafuer vorgesehene Weg.
            onRelease = { it.onDetach() },
            factory = { c ->
                Configuration.getInstance().userAgentValue = c.packageName
                MapView(c).apply {
                    MapTiles.anwenden(this, ebene)
                    setMultiTouchControls(true)
                    controller.setZoom(13.0)
                }
            },
            update = { map ->
                MapTiles.anwenden(map, ebene)
                map.overlays.clear()
                val dens = map.context.resources.displayMetrics.density   // px<->dp, sonst zu dünn auf HiDPI
                // Dezente metrische Maßstabsleiste unten links (wie Web-Karte, #15).
                map.overlays.add(ScaleBarOverlay(map).apply {
                    setAlignBottom(true)
                    setScaleBarOffset((10 * dens).toInt(), (10 * dens).toInt())
                })
                val allPts = ArrayList<GeoPoint>()
                val selPts = ArrayList<GeoPoint>()
                segments.forEachIndexed { runIdx, seg ->
                    val dim = selectedRun != null && runIdx != selectedRun   // anderer Lauf -> ausgegraut
                    val start = seg.iStart.coerceIn(0, pts.size - 1)
                    val end = seg.iEnd.coerceIn(0, pts.size - 1)
                    for (i in start until end) {
                        val a = pts[i]; val b = pts[i + 1]
                        val pa = GeoPoint(a.second, a.first)   // (lat, lon)
                        val pb = GeoPoint(b.second, b.first)
                        if (pa.distanceToAsDouble(pb) > MAX_DRAW_GAP_M) continue
                        map.overlays.add(Polyline(map).apply {
                            setPoints(listOf(pa, pb))
                            outlinePaint.color = if (dim) GRAY.copy(alpha = 0.5f).toArgb() else colorAt(i + 1).toArgb()
                            outlinePaint.strokeWidth = (if (dim) 2.5f else 5f) * dens
                            setOnClickListener { _, _, _ -> onSelectRun(runIdx); true }   // Lauf antippen -> auswählen
                        })
                        allPts.add(pa); allPts.add(pb)
                        if (!dim) { selPts.add(pa); selPts.add(pb) }
                    }
                    // Pump-Marker nur für den (ggf. ausgewählten) Lauf, nicht für gedimmte.
                    if (showPumps && !dim) {
                        val dot = pumpDot()
                        for (idx in seg.pumpIdx) {
                            val p = pts.getOrNull(idx) ?: continue
                            map.overlays.add(Marker(map).apply {
                                position = GeoPoint(p.second, p.first)
                                icon = dot
                                setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
                                setInfoWindow(null)
                                setOnMarkerClickListener { _, _ -> true }
                            })
                        }
                    }
                }
                // Carve-Bögen (feine 25-Hz-Polylinie je Carve) über dem grauen Basis-Track,
                // Startversuche ZULETZT in die Overlay-Liste: osmdroid zeichnet in dieser
                // Reihenfolge, sie liegen damit ÜBER den Läufen. Ihre Linien sind dünner, ein
                // Lauf würde sie sonst verdecken (Jans Befund im Web, dort eigene Karten-Ebene).
                // Gestrichelt und bernsteinfarben wie in der PWA; außerhalb des ausgewerteten
                // Bereichs dünner gestrichelt.
                for (v in attempts) {
                    val punkte = v.points.mapNotNull { pp ->
                        if (pp.size >= 2) GeoPoint(pp[0], pp[1]) else null
                    }
                    if (punkte.size < 2) continue
                    map.overlays.add(Polyline(map).apply {
                        setPoints(punkte)
                        outlinePaint.color = ATTEMPT_COLOR.toArgb()
                        outlinePaint.strokeWidth = 3f * dens
                        outlinePaint.alpha = if (v.outsideTrim) 150 else 220
                        outlinePaint.pathEffect = android.graphics.DashPathEffect(
                            if (v.outsideTrim) floatArrayOf(2f * dens, 6f * dens)
                            else floatArrayOf(5f * dens, 5f * dens), 0f)
                    })
                }
                // je Segment nach Kurvenlage-g gefärbt (wie PWA). Nur im TURNS-Modus (carve != null).
                if (mode == ColorMode.TURNS && carve != null) {
                    for (arc in carve.arcs) {
                        for (k in 0 until arc.size - 1) {
                            val p0 = arc[k]; val p1 = arc[k + 1]
                            if (p0.size < 3 || p1.size < 3) continue
                            val g0 = GeoPoint(p0[0], p0[1]); val g1 = GeoPoint(p1[0], p1[1])   // [lat,lon,g]
                            map.overlays.add(Polyline(map).apply {
                                setPoints(listOf(g0, g1))
                                outlinePaint.color = carveColor(p1[2], carveGMax).toArgb()
                                outlinePaint.strokeWidth = 6f * dens
                            })
                            allPts.add(g0); allPts.add(g1)
                        }
                    }
                }
                // Auf den ausgewählten Lauf zoomen, sonst auf alle Foiling-Läufe.
                val fitPts = if (selectedRun != null && selPts.isNotEmpty()) selPts else allPts
                if (fitPts.isNotEmpty()) {
                    val bb = BoundingBox.fromGeoPoints(fitPts)
                    map.post { map.zoomToBoundingBox(bb.increaseByScale(1.3f), false, 48) }
                }
                map.invalidate()
            },
        )
    }
}

// Foil-Auswahl als Dropdown (wie die PWA <select>): zeigt nur den gewählten Foil,
// aufklappbar in „Standard-Foil" + „Meine Foils" + „Alle Marken".
@Composable
private fun FoilDropdown(all: List<Foil>, mineIds: Set<Int>, selectedId: Int?, onSelect: (Int?) -> Unit) {
    var open by remember { mutableStateOf(false) }
    val sel = all.firstOrNull { it.id == selectedId }
    val label = sel?.let { "${it.brand} ${it.model} ${it.size}" } ?: I18n.t("foil.useDefault")
    val mine = all.filter { it.id in mineIds }
    val others = all.filter { it.id !in mineIds }
    Box {
        OutlinedButton(onClick = { open = true }) {
            Text(label, maxLines = 1)
            Icon(Icons.Filled.ArrowDropDown, contentDescription = null)
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            DropdownMenuItem(text = { Text(I18n.t("foil.useDefault")) }, onClick = { open = false; onSelect(null) })
            if (mine.isNotEmpty()) {
                HorizontalDivider()
                Text(I18n.t("foils.title"), Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                    style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                mine.forEach { f ->
                    DropdownMenuItem(text = { Text("${f.brand} ${f.model} ${f.size}") }, onClick = { open = false; onSelect(f.id) })
                }
            }
            if (others.isNotEmpty()) {
                HorizontalDivider()
                Text(I18n.t("foils.allBrands"), Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                    style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                others.forEach { f ->
                    DropdownMenuItem(text = { Text("${f.brand} ${f.model} ${f.size}") }, onClick = { open = false; onSelect(f.id) })
                }
            }
        }
    }
}

// Leistungs-Karte: theoretische Pump-Leistung (Watt) bei Ø- und Top-Speed.
@Composable
private fun PowerCard(a: Analysis, foil: Foil, weightKg: Double) {
    val dims = FoilPhysics.FoilDims(foil.spanCm, foil.areaCm2, foil.thicknessMm)
    val rider = FoilPhysics.RiderParams(riderWeight = weightKg)
    val pump = a.avgCadenceHz?.let { FoilPhysics.PumpParams(pumpFreqHz = it) }
    val avgKmh = if ((a.foilingTimeS ?: 0.0) > 0 && a.foilingDistanceM != null)
        a.foilingDistanceM / a.foilingTimeS!! * 3.6 else null
    val topKmh = a.maxSpeedMps?.let { it * 3.6 }
    fun watt(kmh: Double?): String =
        if (kmh == null) "–" else "%.0f W".format(FoilPhysics.computeFoilPowerAtSpeed(dims, kmh, rider, pump = pump).power)
    // Erklaerung hinter einem (i) — wie die PWA seit 02.09. (dort dasselbe Popup wie bei
    // „Laeufe/Starts"). Ohne sie ist die Watt-Zahl eine Behauptung: es steht nirgends, mit welchem
    // Gewicht, welcher Geschwindigkeit und welchen Anteilen (Vortrieb + Pump-Traegheit) sie
    // gerechnet ist. Und ohne erkannte Kadenz ist der Traegheitsanteil pauschal.
    var zeigeInfo by remember { mutableStateOf(false) }
    val erklaerung = I18n.t("power.tip")
        .replace("{foil}", "${foil.brand} ${foil.model} ${foil.size}")
        .replace("{weight}", "%.0f".format(weightKg + FoilPhysics.RiderParams().equipmentWeight))
        .replace("{speed}", avgKmh?.let { "%.1f".format(it) } ?: "–")
        .replace("{drag}", "%.0f".format(avgKmh?.let {
            FoilPhysics.computeFoilPowerAtSpeed(dims, it, rider, pump = pump).dragPower } ?: 0.0))
        .replace("{inertia}", "%.0f".format(avgKmh?.let {
            FoilPhysics.computeFoilPowerAtSpeed(dims, it, rider, pump = pump).inertiaPower } ?: 0.0))
        .replace("{note}", if (pump == null) " (${I18n.t("power.estPump")})" else "") +
        (if (foil.thicknessEstimated == true) " · ${I18n.t("power.estimated")}" else "")
    if (zeigeInfo) {
        AlertDialog(
            onDismissRequest = { zeigeInfo = false },
            title = { Text(I18n.t("sd.power")) },
            text = { Text(erklaerung, style = MaterialTheme.typography.bodyMedium) },
            confirmButton = { TextButton(onClick = { zeigeInfo = false }) { Text(I18n.t("common.close")) } },
        )
    }
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("${I18n.t("sd.power")} (${foil.brand} ${foil.model} ${foil.size})",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                IconButton(onClick = { zeigeInfo = true }, modifier = Modifier.size(28.dp)) {
                    Icon(Icons.Outlined.Info, contentDescription = I18n.t("sd.power"),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(16.dp))
                }
            }
            Spacer(Modifier.height(6.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Column {
                    Text(watt(avgKmh), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
                    Text(I18n.t("sd.atAvg"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Column {
                    Text(watt(topKmh), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
                    Text(I18n.t("sd.atTop"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

// Läufe-Tabelle: je Foiling-Lauf Distanz/Dauer/Ø-/Top-Speed/Pumps. Zeile antippen -> Lauf auswählen
// (Karte zeigt dann nur diesen farbig); ausgewählte Zeile ist hervorgehoben.
// Beim Besitzer zusätzlich je Zeile „Lauf aussortieren" (Rückfrage) und über der Tabelle der
// Hinweis-Block mit den aussortierten Fenstern + „wieder aufnehmen" — wie PWA (RunsTable).
@Composable
private fun RunsTable(
    segments: List<Segment>,
    selected: Int?,
    sessionId: Int = 0,
    // Puls JE TRACKPUNKT (analysis.track_geojson.properties.hr) — gleiche Reihenfolge und Laenge wie
    // die Koordinaten, und `iStart`/`iEnd` eines Laufs sind Indizes darauf. Daraus rechnet die
    // Tabelle den Hoechstpuls je Lauf selbst; Server und Reanalyse bleiben unangetastet.
    // (`pulsAntwortBpm` im Segment ist der MITTELWERT ueber den Lauf, nicht das Maximum.)
    hr: List<Int?> = emptyList(),
    excluded: List<List<Long>> = emptyList(),
    // Fremdkraft-Vorschläge der Erkennung v2 (analysis.metrics.fremdkraft_laeufe) + bereits
    // zurückgeholte Fenster (session.fremdkraft_keep). Beides Session-ms.
    poweredRuns: List<FremdkraftLauf> = emptyList(),
    keptWindows: List<List<Long>> = emptyList(),
    canEdit: Boolean = false,
    startedAt: String = "",
    tz: String? = null,
    // Glaettungsfenster der Detailansicht (1/3/5 s) — dieselbe Wahl wie im Geschwindigkeits-
    // diagramm, damit Max/Min in der Tabelle dasselbe zeigen wie die Kurve darueber.
    win: Int = 3,
    // Watt je Lauf; null, wenn Foil-Masse oder Fahrergewicht fehlen -> Spalte entfaellt.
    wattFuer: ((Double, Double?) -> Int?)? = null,
    onSaved: (SessionDetail) -> Unit = {},
    onSelect: (Int) -> Unit,
) {
    val scope = rememberCoroutineScope()
    // Vergleichskorb: die erste Spalte legt EINZELNE LAEUFE hinein (wie die PWA-Lauf-Tabelle).
    val korb by CompareStore.refs.collectAsState()
    // NICHT isSystemInDarkTheme(): ThemeState kann Hell/Dunkel erzwingen (Theme.kt:57-60).
    val dark = MaterialTheme.colorScheme.background.luminance() < 0.5f
    val amber = if (dark) AmberOnDark else AmberOnLight
    var busy by remember(sessionId) { mutableStateOf(false) }
    var askExclude by remember(sessionId) { mutableStateOf<Int?>(null) }
    var err by remember(sessionId) { mutableStateOf<String?>(null) }

    askExclude?.let { runIdx ->
        AlertDialog(
            onDismissRequest = { askExclude = null },
            title = { Text(I18n.t("sd.excludeRun")) },
            text = { Text(I18n.t("sd.excludeConfirm"), style = MaterialTheme.typography.bodyMedium) },
            confirmButton = {
                TextButton(onClick = {
                    askExclude = null; busy = true
                    scope.launch {
                        try { onSaved(Api.excludeRun(sessionId, runIdx)) }
                        catch (e: Exception) { err = I18n.t("sd.excludeFail") + (e.message ?: "") }
                        finally { busy = false }
                    }
                }) { Text(I18n.t("sd.excludeRun")) }
            },
            dismissButton = { TextButton(onClick = { askExclude = null }) { Text(I18n.t("common.cancel")) } },
        )
    }
    err?.let { msg ->
        AlertDialog(
            onDismissRequest = { err = null },
            text = { Text(msg, style = MaterialTheme.typography.bodyMedium) },
            confirmButton = { TextButton(onClick = { err = null }) { Text(I18n.t("common.close")) } },
        )
    }

    if (excluded.isNotEmpty()) {
        Column(
            Modifier.fillMaxWidth()
                .background(AmberReport.copy(alpha = 0.12f), RoundedCornerShape(12.dp))
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Icon(Icons.Filled.RemoveCircleOutline, contentDescription = null, tint = amber, modifier = Modifier.size(18.dp))
                Text(
                    if (excluded.size == 1) I18n.t("sd.excludedTitleOne")
                    else I18n.t("sd.excludedTitle").replace("{n}", excluded.size.toString()),
                    style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = amber,
                )
            }
            Text(I18n.t("sd.excludedHint"), style = MaterialTheme.typography.bodyMedium, color = amber)
            excluded.forEachIndexed { i, win ->
                val from = win.getOrNull(0) ?: 0L
                val to = win.getOrNull(1) ?: from
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("${clockAt(startedAt, tz, from)} · ${mmss(((to - from).coerceAtLeast(0L) / 1000.0).toFloat())}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (canEdit) {
                        Spacer(Modifier.width(4.dp))
                        TextButton(enabled = !busy, onClick = {
                            busy = true
                            scope.launch {
                                try { onSaved(Api.includeRange(sessionId, i)) }
                                catch (e: Exception) { err = I18n.t("sd.excludeFail") + (e.message ?: "") }
                                finally { busy = false }
                            }
                        }) { Text(I18n.t("sd.includeRun")) }
                    }
                }
            }
        }
        Spacer(Modifier.height(8.dp))
    }
    // Fremdkraft-Vorschläge der Erkennung v2: abgetrennte Läufe (Boot/Auto/Motor-Verdacht) mit
    // Grund und Ein-Tipp-Rückholung — Vorschlag, keine stille Löschung. Für ALLE sichtbar
    // (Transparenz, warum die Zahlen so sind), Knöpfe nur mit Bearbeitungsrecht. Wie PWA RunsTable.
    if (poweredRuns.isNotEmpty() || keptWindows.isNotEmpty()) {
        val sky = if (dark) SkyOnDark else SkyOnLight
        // Grund-Text HIER bauen (lokalisiert aus den Messwerten) — metrics.grund ist deutscher
        // Admin-Klartext und erscheint nie in der UI.
        fun poweredWhy(r: FremdkraftLauf): String {
            val dur = Math.round(r.dauerS).toString()
            val kmh = "%.1f".format(r.kmh)
            val hr = r.pulsAntwortBpm
            return if (hr != null)
                I18n.t("v2.sepWhyPulse").replace("{dur}", dur).replace("{kmh}", kmh)
                    .replace("{hr}", (if (hr > 0) "+" else "") + Math.round(hr))
            else I18n.t("v2.sepWhy").replace("{dur}", dur).replace("{kmh}", kmh)
        }
        Column(
            Modifier.fillMaxWidth()
                .background(SkyReport.copy(alpha = 0.12f), RoundedCornerShape(12.dp))
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Icon(Icons.Filled.RemoveCircleOutline, contentDescription = null, tint = sky, modifier = Modifier.size(18.dp))
                Text(I18n.t("v2.sepTitle"), style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold, color = sky)
            }
            if (poweredRuns.isNotEmpty()) {
                Text(I18n.t("v2.sepIntro"), style = MaterialTheme.typography.bodyMedium, color = sky)
            }
            poweredRuns.forEach { r ->
                Column {
                    Text("${clockAt(startedAt, tz, r.tStartMs)} · ${poweredWhy(r)}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (canEdit) {
                        TextButton(enabled = !busy, onClick = {
                            busy = true
                            scope.launch {
                                try { onSaved(Api.keepPoweredRun(sessionId, r.tStartMs, r.tEndMs, keep = true)) }
                                catch (e: Exception) { err = I18n.t("sd.excludeFail") + (e.message ?: "") }
                                finally { busy = false }
                            }
                        }) { Text(I18n.t("v2.keep")) }
                    }
                }
            }
            keptWindows.forEach { win ->
                val from = win.getOrNull(0) ?: 0L
                val to = win.getOrNull(1) ?: from
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("${clockAt(startedAt, tz, from)} · ${mmss(((to - from).coerceAtLeast(0L) / 1000.0).toFloat())} · ${I18n.t("v2.keptLabel")}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (canEdit) {
                        Spacer(Modifier.width(4.dp))
                        TextButton(enabled = !busy, onClick = {
                            busy = true
                            scope.launch {
                                try { onSaved(Api.keepPoweredRun(sessionId, from, to, keep = false)) }
                                catch (e: Exception) { err = I18n.t("sd.excludeFail") + (e.message ?: "") }
                                finally { busy = false }
                            }
                        }) { Text(I18n.t("v2.unkeep")) }
                    }
                }
            }
        }
        Spacer(Modifier.height(8.dp))
    }
    if (segments.isEmpty()) return
    // Hoechstpuls im Lauf, aus dem Puls je Trackpunkt (Wunsch ThermikDreher, 15.08.).
    // Identische Logik wie die PWA: ueber iStart..iEnd laufen, Nullen und 0-Werte ignorieren.
    val maxHrImLauf: (Segment) -> Int? = { seg ->
        if (hr.isEmpty()) null else {
            var m = 0
            var i = maxOf(0, seg.iStart)
            val bis = minOf(seg.iEnd, hr.size - 1)
            while (i <= bis) { hr[i]?.let { if (it > m) m = it }; i++ }
            if (m > 0) m else null
        }
    }
    // Spalte nur zeigen, wenn wenigstens EIN Lauf einen Puls hat — sonst steht eine Spalte voller
    // Striche und nimmt auf dem Handy Platz weg (genauso macht es die PWA mit `hasHr`).
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp)) {
            Text("${I18n.t("home.runs")} (${segments.size})", style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(6.dp))
            // WAAGERECHT SCROLLBAR mit FESTEN Spaltenbreiten. Vorher standen hier sechs bis
            // sieben Spalten mit weight() und ohne Scroll — sieben der dreizehn PWA-Spalten
            // fehlten damit ganz (Jans Meldung 18.08.). Gewichte gehen bei Scroll nicht: der
            // Inhalt ist dann breiter als der Container, und Kopf und Zellen muessen exakt
            // dieselbe Breite haben, sonst laufen sie auseinander.
            val spalten = laufSpalten(segments, win, wattFuer, maxHrImLauf, startedAt, tz)
            val hScroll = rememberScrollState()
            Column(Modifier.horizontalScroll(hScroll)) {
                Row(Modifier.padding(horizontal = 4.dp), verticalAlignment = Alignment.Bottom) {
                    // Kopf der Vergleichs-Spalte: nur ein Symbol, wie in der PWA.
                    Icon(Icons.Filled.CompareArrows, contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.width(32.dp).size(16.dp))
                    Text("#", style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.width(24.dp))
                    spalten.forEach { sp ->
                        Text(sp.kopf, style = MaterialTheme.typography.labelSmall, maxLines = 2,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.width(sp.breite.dp).padding(end = 6.dp))
                    }
                    // Kopf der Aussortier-Spalte: nur Platzhalter, damit die Zellen darunter passen.
                    if (canEdit) Spacer(Modifier.width(36.dp))
                }
                segments.forEachIndexed { i, seg ->
                    val sel = selected == i
                    Row(
                        Modifier.padding(top = 4.dp)
                            .clip(RoundedCornerShape(6.dp))
                            .background(if (sel) MaterialTheme.colorScheme.primary.copy(alpha = 0.16f) else Color.Transparent)
                            .clickable { onSelect(i) }
                            .padding(vertical = 4.dp, horizontal = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        // Diesen EINEN Lauf in den Korb legen bzw. herausnehmen. Eigener Knopf,
                        // damit der Tap nicht die Zeilen-Auswahl umschaltet.
                        val ref = CompareRef(sessionId, i)
                        val drin = ref in korb
                        IconButton(onClick = { CompareStore.toggle(ref) }, modifier = Modifier.size(32.dp)) {
                            Icon(Icons.Filled.CompareArrows,
                                contentDescription = I18n.t(if (drin) "compare.remove" else "compare.add"),
                                tint = if (drin) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(16.dp))
                        }
                        Text("${i + 1}", style = MaterialTheme.typography.bodySmall,
                            color = if (sel) MaterialTheme.colorScheme.primary else Color.Unspecified,
                            modifier = Modifier.width(24.dp))
                        spalten.forEach { sp ->
                            Text(sp.wert(seg), style = MaterialTheme.typography.bodySmall, maxLines = 1,
                                color = if (sel) MaterialTheme.colorScheme.primary else Color.Unspecified,
                                modifier = Modifier.width(sp.breite.dp).padding(end = 6.dp))
                        }
                        if (canEdit) {
                            IconButton(enabled = !busy, onClick = { askExclude = i }, modifier = Modifier.size(36.dp)) {
                                Icon(Icons.Filled.RemoveCircleOutline, contentDescription = I18n.t("sd.excludeRun"),
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
                            }
                        }
                    }
                }
            }
        }
    }
}

/** Eine Spalte der Lauf-Tabelle: Kopf, feste Breite in dp, Zellwert. */
private data class LaufSpalte(val kopf: String, val breite: Int, val wert: (Segment) -> String)

/**
 * Die dreizehn Spalten der PWA-Lauf-Tabelle, in derselben Reihenfolge und mit denselben
 * Bedingungen (`hasPump` / `hasHr` / `showPower`): eine Spalte erscheint nur, wenn wenigstens EIN
 * Lauf sie fuellt — sonst stehen dort nur Striche und nehmen Breite weg.
 */
private fun laufSpalten(
    segments: List<Segment>,
    win: Int,
    wattFuer: ((Double, Double?) -> Int?)?,
    maxHr: (Segment) -> Int?,
    startedAt: String,
    tz: String?,
): List<LaufSpalte> {
    val einheit = PumpUnit.unitLabel()
    // Die PWA-Keys tragen Platzhalter ({win}, {unit}); I18n.t kennt keine Interpolation.
    fun k(key: String) = I18n.t(key).replace("{win}", win.toString()).replace("{unit}", einheit)
    val hatPump = segments.any { it.avgPumpHz != null && it.pumps > 0 }
    val zeigeMaxHr = segments.any { maxHr(it) != null }
    val zeigeWatt = wattFuer != null && segments.any { wattFuer(it.avgSpeedMps, it.avgPumpHz) != null }
    fun eine(v: Double?) = if (v == null) "–" else "%.1f".format(v)
    return buildList {
        add(LaufSpalte(k("sd.colStart"), 68) { seg ->
            seg.tStartMs?.let { clockAt(startedAt, tz, it.toLong()) } ?: "–"
        })
        // Distanz in Metern, auch oberhalb von 1000 — wie die PWA (Math.round + " m").
        add(LaufSpalte(k("sd.colDistance"), 62) { seg -> "%.0f m".format(seg.distanceM) })
        add(LaufSpalte(k("sd.colDuration"), 56) { seg ->
            "%d:%02d".format((seg.durationS / 60).toInt(), (seg.durationS % 60).toInt())
        })
        add(LaufSpalte(k("sd.colAvg"), 54) { seg -> eine(seg.avgSpeedMps * 3.6) })
        add(LaufSpalte(k("sd.colMax"), 64) { seg -> eine(seg.fenster(win, "max")?.times(3.6)) })
        add(LaufSpalte(k("sd.colMin"), 64) { seg -> eine(seg.fenster(win, "min")?.times(3.6)) })
        if (zeigeWatt) add(LaufSpalte(k("sd.colPower"), 58) { seg ->
            wattFuer!!(seg.avgSpeedMps, seg.avgPumpHz)?.let { "$it W" } ?: "–"
        })
        add(LaufSpalte(k("sd.colPumps"), 52) { seg -> if (seg.pumps > 0) "${seg.pumps}" else "–" })
        if (hatPump) {
            add(LaufSpalte(k("sd.colDistPerPump"), 70) { seg ->
                if (seg.pumps > 0) "%.1f m".format(seg.distanceM / seg.pumps) else "–"
            })
            add(LaufSpalte(k("sd.colAvgPump"), 62) { seg -> PumpUnit.fmtValue(seg.avgPumpHz) })
            add(LaufSpalte(k("sd.colPumpMaxMin"), 84) { seg ->
                PumpUnit.fmtValue(seg.maxPumpHz) + " / " + PumpUnit.fmtValue(seg.minPumpHz)
            })
        }
        if (zeigeMaxHr) add(LaufSpalte(k("sd.colMaxHr"), 62) { seg ->
            maxHr(seg)?.let { "$it bpm" } ?: "–"
        })
        add(LaufSpalte(k("sd.colGlide"), 68) { seg -> "%.1f s".format(seg.longestGlideS) })
    }
}


// Uhrzeit (HH:mm:ss) in der Ortszeit des Spots für einen Zeitpunkt „ms ab Session-Start".
// Fallback ohne tz: der Offset aus dem ISO-String der Startzeit (wie TimeFmt/web).
private val CLOCK_HMS = java.time.format.DateTimeFormatter.ofPattern("HH:mm:ss")
private fun clockAt(startedAt: String, tz: String?, offsetMs: Long): String {
    val start = try { java.time.OffsetDateTime.parse(startedAt) } catch (_: Exception) { return "–" }
    val zone: java.time.ZoneId =
        (if (!tz.isNullOrBlank()) try { java.time.ZoneId.of(tz) } catch (_: Exception) { null } else null) ?: start.offset
    return start.toInstant().plusMillis(offsetMs).atZone(zone).format(CLOCK_HMS)
}

// Eine Kennzahl-Kachel; runIdx != null => an einen Lauf gebunden (anklickbar -> Lauf auswählen).
private data class StatItem(val label: String, val value: String, val runIdx: Int? = null,
                            /** Erklaertext hinter einem (i) — z. B. was als Startversuch zaehlt. */
                            val info: String? = null)

@Composable
private fun StatGrid(stats: List<StatItem>, selected: Int? = null, onSelect: (Int) -> Unit = {}) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        stats.chunked(2).forEach { rowItems ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                rowItems.forEach { st ->
                    val sel = st.runIdx != null && st.runIdx == selected
                    val mod = Modifier.weight(1f).then(
                        if (st.runIdx != null) Modifier.clickable { onSelect(st.runIdx) } else Modifier
                    )
                    val colors = if (sel) CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
                                 else CardDefaults.cardColors()
                    Card(mod, colors = colors) {
                        Box {
                            Column(Modifier.padding(12.dp)) {
                                Text(st.value, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
                                Text(st.label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            st.info?.let { text ->
                                var zeigen by remember { mutableStateOf(false) }
                                IconButton(onClick = { zeigen = true },
                                    modifier = Modifier.align(Alignment.TopEnd).size(28.dp)) {
                                    Icon(Icons.Outlined.Info, contentDescription = st.label,
                                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                        modifier = Modifier.size(16.dp))
                                }
                                if (zeigen) {
                                    AlertDialog(
                                        onDismissRequest = { zeigen = false },
                                        title = { Text(I18n.t("stat.runsStartsInfo")) },
                                        text = { Text(text, style = MaterialTheme.typography.bodyMedium) },
                                        confirmButton = {
                                            TextButton(onClick = { zeigen = false }) { Text(I18n.t("common.close")) }
                                        },
                                    )
                                }
                            }
                        }
                    }
                }
                if (rowItems.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

// Vollbild-Foto-Ansicht (Dialog): tippen schließt, bei mehreren Fotos horizontal wischen.
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun PhotoLightbox(photos: List<SessionPhoto>, startIdx: Int, onClose: () -> Unit) {
    if (photos.isEmpty()) return
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        val pager = rememberPagerState(
            initialPage = startIdx.coerceIn(0, photos.size - 1), pageCount = { photos.size })
        Box(
            Modifier.fillMaxSize().background(Color.Black).clickable(onClick = onClose),
            contentAlignment = Alignment.Center,
        ) {
            HorizontalPager(state = pager, modifier = Modifier.fillMaxSize()) { page ->
                AsyncImage(
                    model = Api.mediaUrl(photos[page].url),
                    contentDescription = null,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.fillMaxSize(),
                )
            }
            // Sichtbares Schließen-X (zusätzlich zu Zurück/Tippen).
            IconButton(onClick = onClose, modifier = Modifier.align(Alignment.TopEnd).padding(8.dp)) {
                Icon(Icons.Filled.Close, contentDescription = I18n.t("common.cancel"), tint = Color.White)
            }
        }
    }
}

// YouTube-Video-ID aus watch?v=, youtu.be/, shorts/, embed/ ziehen (wie web/SessionDetail).
private fun youtubeId(url: String?): String? {
    if (url.isNullOrBlank()) return null
    val patterns = listOf(
        Regex("""[?&]v=([\w-]{11})"""),
        Regex("""youtu\.be/([\w-]{11})"""),
        Regex("""shorts/([\w-]{11})"""),
        Regex("""embed/([\w-]{11})"""),
    )
    for (p in patterns) p.find(url)?.let { return it.groupValues[1] }
    return null
}

private fun epochMs(iso: String?): Long? = iso?.let {
    try { java.time.OffsetDateTime.parse(it).toInstant().toEpochMilli() } catch (_: Exception) { null }
}
private fun mmss(sec: Float): String = "%d:%02d".format((sec / 60).toInt(), (sec % 60).toInt())
// HH:mm in der Ortszeit des Spots (tz), Fallback Offset aus dem ISO-String — via TimeFmt.
private fun hhmmLoc(iso: String?, tz: String?): String = hhmm(iso, tz) ?: ""

// Session an einen anderen Nutzer übertragen (spiegelt web/TransferPicker). Zeigt sonst
// den Status einer ausstehenden Übertragung + Zurücknehmen.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TransferPicker(sessionId: Int) {
    val scope = rememberCoroutineScope()
    var pending by remember(sessionId) { mutableStateOf<Transfer?>(null) }
    var open by remember { mutableStateOf(false) }
    var friends by remember { mutableStateOf<List<DmUser>>(emptyList()) }
    var q by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<DmUser>>(emptyList()) }
    var busy by remember { mutableStateOf(false) }
    var confirmUser by remember { mutableStateOf<DmUser?>(null) }

    LaunchedEffect(sessionId) {
        val t = try { Api.transferForSession(sessionId) } catch (_: Exception) { null }
        if (t?.role == "sender") pending = t
    }
    LaunchedEffect(open) { if (open) friends = try { Api.transferFriends() } catch (_: Exception) { emptyList() } }
    LaunchedEffect(q) {
        val s = q.trim()
        if (s.isEmpty()) { results = emptyList(); return@LaunchedEffect }
        kotlinx.coroutines.delay(250)
        results = try { Api.chatSearchUsers(s) } catch (_: Exception) { emptyList() }
    }

    val p = pending
    if (p != null) {
        Row(
            Modifier.fillMaxWidth().padding(top = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(I18n.t("transfer.pending").replace("{name}", p.other?.displayName ?: "?"),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.tertiary, modifier = Modifier.weight(1f))
            TextButton(onClick = {
                scope.launch { try { Api.transferCancel(p.id); pending = null } catch (_: Exception) {} }
            }) { Text(I18n.t("transfer.cancel")) }
        }
        return
    }

    OutlinedButton(onClick = { open = true }) {
        Icon(Icons.AutoMirrored.Filled.Send, contentDescription = null, modifier = Modifier.size(18.dp),
            tint = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.width(6.dp))
        Text(I18n.t("transfer.action"))
    }

    if (open) {
        ModalBottomSheet(onDismissRequest = { open = false }) {
            Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(bottom = 24.dp)) {
                Text(I18n.t("transfer.title"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Text(I18n.t("transfer.desc"), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp, bottom = 10.dp))
                OutlinedTextField(
                    value = q, onValueChange = { q = it },
                    singleLine = true, placeholder = { Text(I18n.t("transfer.searchAll")) },
                    modifier = Modifier.fillMaxWidth(),
                )
                val list = if (q.isBlank()) friends else results
                if (q.isBlank() && friends.isNotEmpty()) {
                    Text(I18n.t("transfer.friends"), style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 10.dp, bottom = 2.dp))
                }
                Column(Modifier.fillMaxWidth().heightIn(max = 320.dp).verticalScroll(rememberScrollState())) {
                    if (list.isEmpty()) {
                        Text(I18n.t("transfer.noResults"), style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = 12.dp))
                    } else list.forEach { u ->
                        Row(
                            Modifier.fillMaxWidth().clickable(enabled = !busy) { confirmUser = u }
                                .padding(vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            val av = Api.mediaUrl(u.avatarUrl)
                            if (av != null) {
                                AsyncImage(model = av, contentDescription = null, contentScale = ContentScale.Crop,
                                    modifier = Modifier.size(32.dp).clip(CircleShape))
                            } else {
                                Icon(Icons.Filled.Person, contentDescription = null,
                                    tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(32.dp))
                            }
                            Spacer(Modifier.width(10.dp))
                            Text(u.displayName ?: "?", style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
            }
        }
    }

    confirmUser?.let { u ->
        AlertDialog(
            onDismissRequest = { confirmUser = null },
            title = { Text(I18n.t("transfer.title")) },
            text = { Text(I18n.t("transfer.confirmSend").replace("{name}", u.displayName ?: "?")) },
            confirmButton = {
                TextButton(onClick = {
                    confirmUser = null
                    busy = true
                    scope.launch {
                        try {
                            pending = Api.transferInitiate(sessionId, u.id)
                            open = false; q = ""; results = emptyList()
                        } catch (_: Exception) {}
                        busy = false
                    }
                }) { Text(I18n.t("transfer.action")) }
            },
            dismissButton = { TextButton(onClick = { confirmUser = null }) { Text(I18n.t("common.cancel")) } },
        )
    }
}

// Bild vor dem Upload auf Web-Größe verkleinern (max 1920 px lange Kante, JPEG q85) — spart
// Upload-Zeit + Speicher. EXIF-Orientierung wird angewandt. Bei Fehler/kein-Gewinn: Original.
// `internal`, damit auch der Spot-Beschreibungs-Abschnitt dieselbe Verkleinerung nutzt
// (eine zweite Kopie waere die naechste Stelle, die man beim Aendern vergisst).
internal fun downscaleJpeg(src: ByteArray, maxEdge: Int = 1920, quality: Int = 85): ByteArray {
    return try {
        val bounds = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
        android.graphics.BitmapFactory.decodeByteArray(src, 0, src.size, bounds)
        val (w, h) = bounds.outWidth to bounds.outHeight
        if (w <= 0 || h <= 0) return src
        // Grob per inSampleSize vorskalieren (speicherschonend bei großen Fotos).
        var sample = 1
        while (maxOf(w, h) / sample > maxEdge * 2) sample *= 2
        val opts = android.graphics.BitmapFactory.Options().apply { inSampleSize = sample }
        var bmp = android.graphics.BitmapFactory.decodeByteArray(src, 0, src.size, opts) ?: return src
        // EXIF-Rotation anwenden.
        val ori = try {
            android.media.ExifInterface(java.io.ByteArrayInputStream(src))
                .getAttributeInt(android.media.ExifInterface.TAG_ORIENTATION, android.media.ExifInterface.ORIENTATION_NORMAL)
        } catch (_: Exception) { android.media.ExifInterface.ORIENTATION_NORMAL }
        val deg = when (ori) {
            android.media.ExifInterface.ORIENTATION_ROTATE_90 -> 90f
            android.media.ExifInterface.ORIENTATION_ROTATE_180 -> 180f
            android.media.ExifInterface.ORIENTATION_ROTATE_270 -> 270f
            else -> 0f
        }
        // Präzise auf maxEdge skalieren.
        val cur = maxOf(bmp.width, bmp.height)
        val scale = if (cur > maxEdge) maxEdge.toFloat() / cur else 1f
        if (scale < 1f || deg != 0f) {
            val m = android.graphics.Matrix().apply { if (scale < 1f) postScale(scale, scale); if (deg != 0f) postRotate(deg) }
            bmp = android.graphics.Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, m, true)
        }
        val out = java.io.ByteArrayOutputStream()
        bmp.compress(android.graphics.Bitmap.CompressFormat.JPEG, quality, out)
        val res = out.toByteArray()
        if (res.size < src.size) res else src   // kein Gewinn -> Original
    } catch (_: Exception) { src }
}

// ---------------------------------------------------------------------------------------------
// Sportart-Klassifikation (docs/sport-classification.md), Besitzer-Sicht.
// Aufbau wie in der PWA (web/src/pages/SessionDetail.tsx): amber Kasten nur solange eine Bitte
// offen ist, darunter/immer die zwei Auswahlfelder. Widerspruch ist der EINZIGE Weg zurück auf
// „Pumpfoil" — der Server lehnt das direkte Zurücksetzen nach einer Meldung mit 409 ab.
// Farben in beiden Modi lesbar (amber-800 auf hell, amber-200 auf dunkel).
// internal, weil die Session-Karten (SessionsScreen.Pill) dasselbe Amber für das
// Sportart-Kennzeichen nutzen — eine Definition, damit es überall gleich aussieht.
internal val AmberOnLight = Color(0xFF92400E)
internal val AmberOnDark = Color(0xFFFDE68A)

// ---------------------------------------------------------------------------------------------
// Melde-Knöpfe für FREMDE Sessions — an derselben Stelle, an der bei eigenen Sessions die
// Klassifikations-Felder stehen (wie in der PWA, web/src/pages/SessionDetail.tsx). Sich selbst zu
// melden ist sinnlos, deshalb nur bei fremden. Reihenfolge nach Schwere, mildestes links:
// „nicht Pumpfoil" ist nur eine Bitte um Zuordnung, „wirkt unecht" zweifelt die Daten an,
// „unangemessen" ist die Beschwerde. Waren früher in einem Überlauf-Menü versteckt.
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun ReportRow(sessionId: Int) {
    val scope = rememberCoroutineScope()
    // NICHT isSystemInDarkTheme(): ThemeState kann Hell/Dunkel erzwingen (Theme.kt:57-60).
    val dark = MaterialTheme.colorScheme.background.luminance() < 0.5f
    val amber = if (dark) AmberOnDark else AmberOnLight
    val red = MaterialTheme.colorScheme.error
    var votes by remember(sessionId) { mutableStateOf<Api.VoteState?>(null) }
    var flagDone by remember(sessionId) { mutableStateOf(false) }
    var askNotPumpfoil by remember(sessionId) { mutableStateOf(false) }
    var askInappropriate by remember(sessionId) { mutableStateOf(false) }
    LaunchedEffect(sessionId) { votes = try { Api.sessionVotes(sessionId) } catch (_: Exception) { null } }

    // Melden „sieht nicht nach Pumpfoil aus": erst erklären, dann senden. Der Text sagt ausdrücklich,
    // dass niemandem etwas vorgeworfen wird und der Melder anonym bleibt.
    if (askNotPumpfoil) {
        AlertDialog(
            onDismissRequest = { askNotPumpfoil = false },
            title = { Text(I18n.t("cls.notPumpfoil")) },
            text = { Text(I18n.t("cls.confirmFlag")) },
            confirmButton = {
                TextButton(onClick = {
                    askNotPumpfoil = false
                    // Bewusst OHNE Rückmeldung, ob die Meldung „gezählt" hat (wie PWA): sonst wird
                    // das Nachzählen zum Spiel. Der Knopf weicht einfach dem Dank.
                    flagDone = true
                    scope.launch { try { Api.flagNotPumpfoil(sessionId) } catch (_: Exception) {} }
                }) { Text(I18n.t("sd.report")) }
            },
            dismissButton = { TextButton(onClick = { askNotPumpfoil = false }) { Text(I18n.t("common.cancel")) } },
        )
    }
    if (askInappropriate) {
        AlertDialog(
            onDismissRequest = { askInappropriate = false },
            text = { Text(I18n.t("vote.reportConfirm")) },
            confirmButton = {
                TextButton(onClick = {
                    askInappropriate = false
                    scope.launch { try { votes = Api.voteSession(sessionId, "inappropriate") } catch (_: Exception) {} }
                }) { Text(I18n.t("sd.report")) }
            },
            dismissButton = { TextButton(onClick = { askInappropriate = false }) { Text(I18n.t("common.cancel")) } },
        )
    }

    val v = votes
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (flagDone) {
            Text(I18n.t("cls.thanks"), color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            FilledTonalButton(
                onClick = { askNotPumpfoil = true },
                colors = ButtonDefaults.filledTonalButtonColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant,
                    contentColor = MaterialTheme.colorScheme.onSurfaceVariant,
                ),
            ) {
                Icon(Icons.Filled.HelpOutline, contentDescription = null, modifier = Modifier.size(18.dp),
                    tint = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(6.dp))
                Text(I18n.t("cls.notPumpfoil"))
            }
        }
        // „wirkt unecht" und „unangemessen" sind umschaltbar (nochmal tippen = Stimme zurückziehen),
        // deshalb zeigt der aktive Zustand die eigene Stimme farbig an.
        FilledTonalButton(
            onClick = { scope.launch { try { votes = Api.voteSession(sessionId, "fake") } catch (_: Exception) {} } },
            colors = ButtonDefaults.filledTonalButtonColors(
                containerColor = if (v?.my_fake == true) AmberReport.copy(alpha = 0.18f) else MaterialTheme.colorScheme.surfaceVariant,
                contentColor = if (v?.my_fake == true) amber else MaterialTheme.colorScheme.onSurfaceVariant,
            ),
        ) {
            Icon(Icons.Filled.Flag, contentDescription = null, modifier = Modifier.size(18.dp), tint = amber)
            Spacer(Modifier.width(6.dp))
            Text(I18n.t("sd.fake"))
            if ((v?.fake_count ?: 0) > 0) { Spacer(Modifier.width(6.dp)); Text("${v?.fake_count}") }
        }
        FilledTonalButton(
            onClick = {
                // Vor dem Melden fragen — beim Zurückziehen der eigenen Meldung nicht.
                if (v?.my_inappropriate == true) {
                    scope.launch { try { votes = Api.voteSession(sessionId, "inappropriate") } catch (_: Exception) {} }
                } else askInappropriate = true
            },
            colors = ButtonDefaults.filledTonalButtonColors(
                containerColor = if (v?.my_inappropriate == true) red.copy(alpha = 0.18f) else MaterialTheme.colorScheme.surfaceVariant,
                contentColor = if (v?.my_inappropriate == true) red else MaterialTheme.colorScheme.onSurfaceVariant,
            ),
        ) {
            Icon(Icons.Filled.Report, contentDescription = null, modifier = Modifier.size(18.dp), tint = red)
            Spacer(Modifier.width(6.dp))
            Text(if (v?.my_inappropriate == true) I18n.t("sd.reported") else I18n.t("sd.inappropriate"))
            if ((v?.inappropriate_count ?: 0) > 0) { Spacer(Modifier.width(6.dp)); Text("${v?.inappropriate_count}") }
        }
    }
}

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun ClassificationNotice(s: SessionDetail, scope: kotlinx.coroutines.CoroutineScope, onReload: () -> Unit) {
    var appealDraft by remember(s.id) { mutableStateOf("") }
    var appealOpen by remember(s.id) { mutableStateOf(false) }
    var msg by remember(s.id) { mutableStateOf<String?>(null) }
    // NICHT isSystemInDarkTheme(): ThemeState kann Hell/Dunkel erzwingen (Theme.kt:57-60).
    val dark = MaterialTheme.colorScheme.background.luminance() < 0.5f
    val amber = if (dark) AmberOnDark else AmberOnLight

    // Hat die automatische Erkennung geurteilt (sport_source == "auto"), erklären wir das auch
    // dann, wenn nichts mehr „offen" ist: der Nutzer soll wissen, dass eine Maschine das war und
    // dass er sie hier direkt überstimmen kann (wie PWA ClassificationPanel).
    val isAuto = s.sportSource == "auto"
    if (!s.needsClassification && !isAuto) return

    // Begründungszeile aus den MESSWERTEN bauen — sport_auto.grund ist deutscher Admin-Klartext
    // und darf nie in der UI erscheinen (die Sprache macht die App, nicht der Server).
    val m = if (isAuto) s.sportAuto?.merkmale else null
    val warum = if (m == null) null else {
        val dur = Math.round(m.laengsterLaufS ?: 0.0).toString()
        val kmh = "%.1f".format(m.tempoMedianKmh ?: 0.0)
        val hr = m.pulsAntwortBpm
        if (hr != null)
            I18n.t("cls.autoWhyPulse").replace("{dur}", dur).replace("{kmh}", kmh)
                .replace("{hr}", (if (hr > 0) "+" else "") + Math.round(hr))
        else I18n.t("cls.autoWhy").replace("{dur}", dur).replace("{kmh}", kmh)
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Column(
            Modifier
                .fillMaxWidth()
                .background(AmberReport.copy(alpha = 0.12f), RoundedCornerShape(12.dp))
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                if (isAuto) {
                    if (s.needsClassification) I18n.t("cls.autoAsk")
                    else I18n.t("cls.autoSetAs")
                        .replace("{sport}", I18n.t("cls.sport.${s.sportClass ?: "other"}"))
                } else I18n.t("cls.ownerAsk"),
                color = amber,
            )
            warum?.let { Text(it, color = amber.copy(alpha = 0.85f)) }
            // Der Besitzer ordnet die Sportart direkt hier zu (dasselbe Dropdown wie unten in
            // ClassificationPickers); solange die Bitte offen ist, steht ein Platzhalter drin.
            ClassDropdown(
                options = SPORTS, selected = s.sportClass ?: "pumpfoil", keyPrefix = "cls.sport.",
                placeholder = if (s.needsClassification) I18n.t("cls.choose") else null,
                onPick = { v ->
                    scope.launch {
                        try { Api.setClassification(s.id, sport = v); msg = null; onReload() }
                        catch (_: Exception) { msg = I18n.t("cls.pickErr") }
                    }
                },
            )
            // Widerspruch geht an den Admin und ist NUR nötig, wenn ein Mensch gemeldet hat. Beim
            // reinen Maschinen-Urteil (flag_count == 0) wählt der Besitzer einfach „Pumpfoil" —
            // der Server lässt das direkt zu; der Umweg würde nur die Warteschlange füllen (PWA).
            if (!isAuto || s.flagCount > 0) {
                if (s.appealText != null) {
                    Text(I18n.t("cls.appealPending"), color = amber, fontWeight = FontWeight.SemiBold)
                } else if (!appealOpen) {
                    TextButton(onClick = { appealOpen = true }) { Text(I18n.t("cls.wasPumpfoil")) }
                } else {
                    OutlinedTextField(
                        value = appealDraft, onValueChange = { appealDraft = it },
                        placeholder = { Text(I18n.t("cls.appealPlaceholder")) },
                        modifier = Modifier.fillMaxWidth(), singleLine = false,
                    )
                    FilledTonalButton(onClick = {
                        scope.launch {
                            try { Api.appealClassification(s.id, appealDraft); appealOpen = false; onReload() }
                            catch (_: Exception) { msg = I18n.t("cls.pickErr") }
                        }
                    }) { Text(I18n.t("cls.appealSend")) }
                }
            }
            msg?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        }
    }
}

// Die beiden Anpassungen (Sportart, Datenqualitaet) sitzen GANZ UNTEN: man braucht sie selten, und
// oben nahmen sie mit Label zwei Zeilen weg (Jan, 29.07.). Der Hinweis „bitte einordnen" bleibt dagegen
// oben — als Aufforderung waere er unten wirkungslos.
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun ClassificationPickers(s: SessionDetail, scope: kotlinx.coroutines.CoroutineScope, onReload: () -> Unit) {
    var msg by remember(s.id) { mutableStateOf<String?>(null) }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        // Ohne Label und umbrechend — wie die Setup-Zeile darueber (Jan: die Labels brauchten viel
        // zu viel Platz). Was die beiden Auswahlen bedeuten, steht im gewaehlten Wert selbst.
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            ClassDropdown(
                options = SPORTS, selected = s.sportClass ?: "pumpfoil", keyPrefix = "cls.sport.",
                onPick = { v ->
                    scope.launch {
                        try { Api.setClassification(s.id, sport = v); msg = null; onReload() }
                        catch (_: Exception) { msg = I18n.t("cls.pickErr") }
                    }
                },
            )
            ClassDropdown(
                options = DATA_QUALITY, selected = s.dataQuality ?: "ok", keyPrefix = "cls.dq.",
                onPick = { v ->
                    scope.launch {
                        try { Api.setClassification(s.id, dataQuality = v); msg = null; onReload() }
                        catch (_: Exception) { msg = I18n.t("cls.pickErr") }
                    }
                },
            )
        }
        msg?.let { Text(it, color = MaterialTheme.colorScheme.error) }
    }
}

// placeholder: statt des gewählten Werts anzeigen, solange noch nichts zugeordnet ist
// (offene Bitte im Auto-Kasten — wie die leere <option> „Sportart wählen …" der PWA).
@Composable
private fun ClassDropdown(options: List<String>, selected: String, keyPrefix: String, placeholder: String? = null, onPick: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        OutlinedButton(onClick = { open = true }) {
            Text(placeholder ?: I18n.t("$keyPrefix$selected"), maxLines = 1)
            Icon(Icons.Filled.ArrowDropDown, contentDescription = null)
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            options.forEach { o ->
                DropdownMenuItem(text = { Text(I18n.t("$keyPrefix$o")) }, onClick = { open = false; onPick(o) })
            }
        }
    }
}

// Shim-Anzeige: 0 bleibt "0°", sonst mit Vorzeichen und einer Dezimale nur wenn nötig
// (1.0 -> "+1°", 0.5 -> "+0.5°"). Spiegelt fmtShim in web/src/components/FoilSelect.tsx.
private fun fmtShim(v: Double?): String {
    if (v == null) return "—"
    val txt = if (v == v.toLong().toDouble()) "${v.toLong()}" else "$v"
    return (if (v > 0) "+$txt" else txt) + "°"
}

// Auswahl aus Objekt-Listen (Stab, Board) mit optionalen Gruppen-Überschriften. Erster Eintrag ist
// immer "Standard verwenden" = Override löschen (null an den Server).
@Composable
private fun <T> SetupDropdown(
    current: String,
    groups: List<Pair<String, List<T>>>,
    labelOf: (T) -> String,
    idOf: (T) -> Int,
    onPick: (Int?) -> Unit,
) {
    var open by remember { mutableStateOf(false) }
    Box {
            OutlinedButton(onClick = { open = true }) {
                Text(current.ifBlank { I18n.t("setup.inherit") }, maxLines = 1)
                Icon(Icons.Filled.ArrowDropDown, contentDescription = null)
            }
            DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                DropdownMenuItem(text = { Text(I18n.t("setup.inherit")) }, onClick = { open = false; onPick(null) })
                groups.forEach { (header, items) ->
                    if (items.isNotEmpty()) {
                        HorizontalDivider()
                        if (header.isNotBlank()) {
                            Text(header, Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        items.forEach { it2 ->
                            DropdownMenuItem(text = { Text(labelOf(it2)) }, onClick = { open = false; onPick(idOf(it2)) })
                        }
                    }
                }
            }
        }
}

// Auswahl aus reinen Werten (Mastlänge in cm, Shim in Grad).
@Composable
private fun <V> SetupValueDropdown(
    current: String,
    options: List<Pair<V, String>>,
    onPick: (V?) -> Unit,
) {
    var open by remember { mutableStateOf(false) }
    Box {
            OutlinedButton(onClick = { open = true }) {
                Text(current, maxLines = 1)
                Icon(Icons.Filled.ArrowDropDown, contentDescription = null)
            }
            DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                DropdownMenuItem(text = { Text(I18n.t("setup.inherit")) }, onClick = { open = false; onPick(null) })
                HorizontalDivider()
                options.forEach { (v, lbl) ->
                    DropdownMenuItem(text = { Text(lbl) }, onClick = { open = false; onPick(v) })
                }
            }
        }
}


/** Dateiname wie server/app/export_track.py:dateiname — pumpfoil-<Datum>-<id>.<endung>.
 *  Datum in der Zeitzone der AUFNAHME, wenn die Session eine kennt; sonst UTC. */
private fun exportDateiname(s: SessionDetail, kind: String): String {
    val ms = epochMs(s.startedAt)
    val tag = if (ms == null) "session" else {
        val zone = try {
            s.tz?.takeIf { it.isNotBlank() }?.let { java.time.ZoneId.of(it) } ?: java.time.ZoneOffset.UTC
        } catch (_: Exception) { java.time.ZoneOffset.UTC }
        java.time.Instant.ofEpochMilli(ms).atZone(zone).toLocalDate().toString()
    }
    return "pumpfoil-$tag-${s.id}.$kind"
}
