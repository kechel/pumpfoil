package org.pumpfoil.app

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.KeyboardArrowLeft
import androidx.compose.material.icons.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import kotlinx.coroutines.launch

// Wie viele Videos je Nachschub. Gleiche Zahl wie in der PWA (SocialFeed.tsx).
private const val SCHUB = 24

/**
 * Community-Social-Feed: alle freigegebenen YouTube-Kanaele in EINEM Strom, neueste zuerst —
 * nicht nach Kanal gruppiert und nicht danach sortiert, was ein Algorithmus fuer sehenswert
 * haelt. Genau das ist der Zweck.
 *
 * Tippen oeffnet das Video im Vollbild mit Weiter/Zurueck. Das ist KEIN Widerspruch zur Regel,
 * dass Video-Vorschaubilder in den Session-Listen die Session-Detailansicht oeffnen statt eines
 * Players: hier gibt es keine Session dahinter, das Abspielen IST der Inhalt.
 *
 * Vorschaubilder kommen ueber UNSEREN Server (`/api/public/video-thumb/…`), nicht von
 * img.youtube.com — sonst entsteht ein Drittkontakt zu Google, bevor der Nutzer ueberhaupt auf
 * Abspielen getippt hat. Dieselbe Entscheidung wie in der PWA.
 */
@Composable
fun SocialFeedSection(modifier: Modifier = Modifier) {
    val scope = rememberCoroutineScope()
    var items by remember { mutableStateOf<List<SocialItem>>(emptyList()) }
    var geladen by remember { mutableStateOf(false) }
    var ende by remember { mutableStateOf(false) }
    var laedt by remember { mutableStateOf(false) }
    var offen by remember { mutableStateOf<Int?>(null) }
    val listState = rememberLazyListState()

    LaunchedEffect(Unit) {
        items = try { Api.socialFeed(SCHUB, 0) } catch (_: Exception) { emptyList() }
        if (items.size < SCHUB) ende = true
        geladen = true
    }
    // Nachladen, sobald die letzten drei Kacheln in Sicht kommen (wie das Scroll-Ende der PWA).
    LaunchedEffect(listState, items.size, ende) {
        snapshotFlow { listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0 }
            .collect { letzter ->
                if (!ende && !laedt && items.isNotEmpty() && letzter >= items.size - 3) {
                    laedt = true
                    val mehr = try { Api.socialFeed(SCHUB, items.size) } catch (_: Exception) { emptyList() }
                    items = items + mehr
                    if (mehr.size < SCHUB) ende = true
                    laedt = false
                }
            }
    }

    if (!geladen || items.isEmpty()) return

    Column(modifier) {
        SectionHeader(I18n.t("social.title"))
        // Der mittlere Satz ist fett — er ist die Aufforderung, der Rest Erklaerung.
        // Der Text traegt <b>-Marken aus den Web-Locales, deshalb dieselbe Fettung wie im
        // Impressum statt roher Zeichen.
        Text(
            richText(I18n.t("social.hint"), MaterialTheme.colorScheme.primary),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 12.dp).padding(bottom = 6.dp),
        )
        LazyRow(
            state = listState,
            contentPadding = PaddingValues(horizontal = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(items.size) { i ->
                val it = items[i]
                // Hochkant 9:16 — bei uns sind fast alle Clips Shorts.
                Box(
                    Modifier.width(140.dp).aspectRatio(9f / 16f)
                        .clip(RoundedCornerShape(16.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .clickable { offen = i },
                ) {
                    AsyncImage(
                        model = "${Api.BASE}/api/public/video-thumb/${it.externalId}",
                        contentDescription = it.title,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize(),
                    )
                    // Abdunkeln nach unten, damit die weisse Schrift auf jedem Bild lesbar ist.
                    Box(Modifier.fillMaxSize().background(
                        Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.8f)))))
                    Box(
                        Modifier.align(Alignment.Center).size(42.dp)
                            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.9f), CircleShape),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Filled.PlayArrow, contentDescription = null,
                            tint = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(24.dp))
                    }
                    Column(Modifier.align(Alignment.BottomStart).padding(8.dp)) {
                        Text(it.title ?: "—", style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.SemiBold, color = Color.White,
                            maxLines = 2, overflow = TextOverflow.Ellipsis)
                        Text(
                            listOfNotNull(it.userName, it.publishedAt?.let { p -> shortDateFull(p, null) })
                                .joinToString(" · "),
                            style = MaterialTheme.typography.labelSmall, color = Color.White.copy(alpha = 0.8f),
                            maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
    }

    offen?.let { idx ->
        items.getOrNull(idx)?.let { it ->
            SocialPlayerDialog(
                item = it,
                hatZurueck = idx > 0,
                hatWeiter = idx < items.size - 1,
                onZurueck = { offen = idx - 1 },
                onWeiter = { offen = idx + 1 },
                onClose = { offen = null },
                onMelden = { scope.launch { runCatching { Api.socialReport(it.id) } } },
            )
        }
    }
}

/**
 * Vollbild-Player.
 *
 * Datensparsam ueber youtube-nocookie und erst durch das Antippen geladen — vorher geht kein
 * Byte an Google. `loop=1` wirkt bei einem EINZELNEN Video nur zusammen mit `playlist=<id>`
 * (dokumentierte Eigenart der Player-Parameter); bei Clips von wenigen Sekunden ist die
 * Schleife das Richtige.
 *
 * Kein festes Seitenverhaeltnis: YouTube verraet das Format eines Videos nirgends, also
 * bekommt der Rahmen alles und der Player skaliert selbst hinein.
 */
@Composable
private fun SocialPlayerDialog(
    item: SocialItem,
    hatZurueck: Boolean,
    hatWeiter: Boolean,
    onZurueck: () -> Unit,
    onWeiter: () -> Unit,
    onClose: () -> Unit,
    onMelden: () -> Unit,
) {
    val ctx = LocalContext.current
    var gemeldet by remember(item.id) { mutableStateOf(false) }
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            Column(Modifier.fillMaxSize().padding(top = 44.dp, bottom = 8.dp)) {
                Box(Modifier.fillMaxWidth().weight(1f).padding(horizontal = 52.dp)) {
                    YoutubePlayer(item.externalId, Modifier.fillMaxSize())
                }
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(item.title ?: "—", color = Color.White, maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            style = MaterialTheme.typography.titleSmall)
                        Text(item.userName ?: "?", color = Color.White.copy(alpha = 0.7f),
                            maxLines = 1, overflow = TextOverflow.Ellipsis,
                            style = MaterialTheme.typography.bodySmall)
                    }
                    // Im datensparsamen nocookie-Modus gibt es keine YouTube-Sitzung — Liken
                    // geht nur bei YouTube selbst. Auf dem Handy oeffnet das die App, wo der
                    // Nutzer angemeldet ist. Deshalb auffaellig: davon lebt, wer die Clips macht.
                    Button(
                        onClick = { runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(item.url))) } },
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                    ) { Text(I18n.t("social.onYoutube"), style = MaterialTheme.typography.labelMedium) }
                    Spacer(Modifier.width(6.dp))
                    TextButton(
                        onClick = { if (!gemeldet) { onMelden(); gemeldet = true } },
                        colors = ButtonDefaults.textButtonColors(contentColor = Color.White.copy(alpha = 0.7f)),
                        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                    ) {
                        Text(I18n.t(if (gemeldet) "social.reported" else "social.report"),
                             style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
            IconButton(onClick = onClose, modifier = Modifier.align(Alignment.TopEnd).padding(8.dp)) {
                Icon(Icons.Filled.Close, contentDescription = I18n.t("common.close"), tint = Color.White)
            }
            if (hatZurueck) {
                IconButton(onClick = onZurueck, modifier = Modifier.align(Alignment.CenterStart).padding(4.dp)) {
                    Icon(Icons.Filled.KeyboardArrowLeft, contentDescription = I18n.t("social.prev"),
                        tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(40.dp))
                }
            }
            if (hatWeiter) {
                IconButton(onClick = onWeiter, modifier = Modifier.align(Alignment.CenterEnd).padding(4.dp)) {
                    Icon(Icons.Filled.KeyboardArrowRight, contentDescription = I18n.t("social.next"),
                        tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(40.dp))
                }
            }
        }
    }
}

/**
 * Der eingebettete Player. WebView mit genau dem `iframe`, den auch die PWA benutzt.
 *
 * Bewusst KEIN eigener Speicher: `domStorageEnabled` bleibt aus und der Cache wird beim
 * Verlassen geleert — die Wiedergabe braucht das nicht, und wir sammeln nichts an. JavaScript
 * muss an sein, ohne das spielt der YouTube-Player nicht.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun YoutubePlayer(videoId: String, modifier: Modifier = Modifier) {
    AndroidView(
        modifier = modifier,
        factory = { c ->
            WebView(c).apply {
                webViewClient = WebViewClient()
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = false
                settings.mediaPlaybackRequiresUserGesture = false   // autoplay wie im Web
                setBackgroundColor(android.graphics.Color.BLACK)
            }
        },
        update = { web ->
            web.loadDataWithBaseURL(
                "https://www.youtube-nocookie.com",
                """<html><body style="margin:0;background:#000">
                   <iframe width="100%" height="100%" frameborder="0" allowfullscreen
                     allow="autoplay; encrypted-media; picture-in-picture"
                     src="https://www.youtube-nocookie.com/embed/$videoId?autoplay=1&rel=0&playsinline=1&loop=1&playlist=$videoId"></iframe>
                   </body></html>""",
                "text/html", "utf-8", null,
            )
        },
        onRelease = { web ->
            web.loadUrl("about:blank")
            web.clearCache(true)
            web.destroy()
        },
    )
}
