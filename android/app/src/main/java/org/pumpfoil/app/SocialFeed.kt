package org.pumpfoil.app

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
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
/**
 * Zustand des Feeds, absichtlich AUSSERHALB der Sektion gehalten.
 *
 * Grund (02.09.): der Vollbild-Player lag vorher in einem `Dialog` — also in einem EIGENEN
 * Fenster. Video zeichnet der WebView ueber eine separate GPU-Ebene, und in einem Nebenfenster
 * landete die nicht auf dem Schirm: Dekoder lief, Audio-Fokus wurde gehalten, Flaeche blieb
 * schwarz (Jan im Android-Emulator; auf iOS lief dasselbe Video einwandfrei). Jetzt liegt der
 * Player als Ebene IM Hauptfenster.
 *
 * Dafuer muss er eine Schicht hoeher haengen als die Sektion: die Sektion ist ein Eintrag in der
 * LazyColumn der Community-Seite und wuerde eine Vollbild-Ebene abschneiden. Also halten wir
 * Liste und „welches Video ist offen" hier, die Community-Seite zeichnet die Ebene ueber ihren
 * Inhalt (s. `SocialPlayerOverlay`).
 */
internal class SocialFeedZustand {
    var items by mutableStateOf<List<SocialItem>>(emptyList())
    var geladen by mutableStateOf(false)
    var ende by mutableStateOf(false)
    var laedt by mutableStateOf(false)
    var offen by mutableStateOf<Int?>(null)
}

@Composable
internal fun rememberSocialFeed(): SocialFeedZustand = remember { SocialFeedZustand() }

@Composable
internal fun SocialFeedSection(z: SocialFeedZustand, modifier: Modifier = Modifier) {
    val scope = rememberCoroutineScope()
    val listState = rememberLazyListState()

    LaunchedEffect(Unit) {
        z.items = try { Api.socialFeed(SCHUB, 0) } catch (_: Exception) { emptyList() }
        if (z.items.size < SCHUB) z.ende = true
        z.geladen = true
    }
    // Nachladen, sobald die letzten drei Kacheln in Sicht kommen (wie das Scroll-Ende der PWA).
    LaunchedEffect(listState, z.items.size, z.ende) {
        snapshotFlow { listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0 }
            .collect { letzter ->
                if (!z.ende && !z.laedt && z.items.isNotEmpty() && letzter >= z.items.size - 3) {
                    z.laedt = true
                    val mehr = try { Api.socialFeed(SCHUB, z.items.size) } catch (_: Exception) { emptyList() }
                    z.items = z.items + mehr
                    if (mehr.size < SCHUB) z.ende = true
                    z.laedt = false
                }
            }
    }

    if (!z.geladen || z.items.isEmpty()) return

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
            items(z.items.size) { i ->
                val it = z.items[i]
                // Hochkant 9:16 — bei uns sind fast alle Clips Shorts.
                Box(
                    Modifier.width(140.dp).aspectRatio(9f / 16f)
                        .clip(RoundedCornerShape(16.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .clickable { z.offen = i },
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

    // Der Player wird NICHT hier gezeichnet — s. `SocialPlayerOverlay`, das die
    // Community-Seite ueber ihren ganzen Inhalt legt.
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
 *
 * **Kein `Dialog` mehr** (02.09.): als eigenes Fenster blieb die Videoflaeche schwarz, obwohl der
 * Dekoder lief und der Audio-Fokus gehalten wurde — die GPU-Ebene des Videos landete nicht auf
 * dem Schirm, waehrend HTML im selben WebView normal gezeichnet wurde (die YouTube-Fehlerseite
 * war lesbar). Jetzt eine Ebene im Hauptfenster; die Zurueck-Taste uebernimmt `BackHandler`.
 */
@Composable
internal fun SocialPlayerOverlay(z: SocialFeedZustand) {
    val idx = z.offen ?: return
    val item = z.items.getOrNull(idx) ?: return
    val hatZurueck = idx > 0
    val hatWeiter = idx < z.items.size - 1
    val onZurueck = { z.offen = idx - 1 }
    val onWeiter = { z.offen = idx + 1 }
    val onClose = { z.offen = null }
    val scope = rememberCoroutineScope()
    val onMelden = { scope.launch { runCatching { Api.socialReport(item.id) } }; Unit }

    val ctx = LocalContext.current
    var gemeldet by remember(item.id) { mutableStateOf(false) }
    // Die Zurueck-Taste schliesst den Player, nicht die Seite — das machte vorher das Dialogfenster.
    BackHandler(onBack = onClose)
    run {
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
 * Geprueft am 02.09. auf der Fehlersuche: `domStorageEnabled = true` aendert NICHTS — der Player
 * startete auch damit nicht, die Ursache war die Eltern-Herkunft (s. HERKUNFT unten). Also bleibt
 * der Speicher aus; wer den Schalter erneut erwaegt, hat ihn schon ausprobiert.
 *
 * Bewusst KEIN eigener Speicher: `domStorageEnabled` bleibt aus und der Cache wird beim
 * Verlassen geleert — die Wiedergabe braucht das nicht, und wir sammeln nichts an. JavaScript
 * muss an sein, ohne das spielt der YouTube-Player nicht.
 */
// Die ELTERN-Herkunft, die der YouTube-Player zu sehen bekommt. Muss unsere eigene sein.
//
// Vorher stand hier `youtube-nocookie.com` selbst als Basis-URL — damit war die Elternseite aus
// Sicht des Players seine eigene Domain, und YouTube lehnte ab: **Error 153**, „Video player
// configuration error". Sichtbar wurde das nie, weil der Fehler IM iframe landete und der
// Rahmen schwarz blieb; nach aussen sah es wie ein kaputtes Video aus (Jan, 02.09.:
// „Abspielen geht nicht mehr, die Vorschauen sind prima").
//
// In der PWA ist die Elternseite `https://pumpfoil.org` — deshalb laeuft es dort. Genau das
// stellen wir hier nach: Basis-URL = unsere Herkunft, plus `origin=` im Embed, wie es die
// Player-Parameter vorschreiben. Datenschutzseitig aendert das nichts gegenueber der Web-Seite:
// derselbe Referrer, dieselbe nocookie-Domain, und geladen wird erst nach dem Antippen.
private const val HERKUNFT = "https://pumpfoil.org"

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun YoutubePlayer(videoId: String, modifier: Modifier = Modifier) {
    AndroidView(
        modifier = modifier,
        factory = { c ->
            WebView(c).apply {
                // Nur im Debug-Build: die ECHTEN Groessen ins Log, sobald die Seite steht.
                // Anlass (02.09.): schwarze Videoflaeche bei laufendem Ton. Aus einem Screenshot
                // ist nicht zu unterscheiden, ob der WebView null hoch ist, das iframe null hoch
                // ist, oder alles passt und nur das Video nicht gezeichnet wird. Eine Zeile Log
                // beantwortet genau das — ohne sie raet man an drei Stellen gleichzeitig.
                webViewClient = object : WebViewClient() {
                    override fun onPageFinished(view: WebView, url: String) {
                        if (!BuildConfig.DEBUG) return
                        view.postDelayed({
                            view.evaluateJavascript(
                                "(function(){var f=document.querySelector('iframe');" +
                                    "return JSON.stringify({doc:[document.documentElement.clientWidth," +
                                    "document.documentElement.clientHeight],body:[document.body.clientWidth," +
                                    "document.body.clientHeight],frame:f?[f.clientWidth,f.clientHeight]:null});})()"
                            ) { r ->
                                android.util.Log.i(
                                    "PumpfoilPlayer",
                                    "webview=${view.width}x${view.height} px, html=$r"
                                )
                            }
                        }, 1500)
                    }
                }
                // Ohne WebChromeClient bekommt der HTML5-Player keine Rueckrufe fuer Vollbild
                // und Medien-Zustand. Wir brauchen kein eigenes Verhalten, aber der Player
                // fragt danach — fehlt der Client, verhaelt sich Video je nach WebView anders.
                webChromeClient = android.webkit.WebChromeClient()
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = false
                settings.mediaPlaybackRequiresUserGesture = false   // autoplay wie im Web
                setBackgroundColor(android.graphics.Color.BLACK)
            }
        },
        update = { web ->
            // NUR laden, wenn sich das Video wirklich geaendert hat. `update` laeuft bei JEDER
            // Recomposition — und ein `loadDataWithBaseURL` darin startet das laufende Video neu.
            // Es genuegt, dass sich irgendwo drumherum ein Zustand aendert (der Feed laedt Nachschub,
            // „gemeldet" kippt, die Liste waechst), und das Video springt zurueck auf Anfang.
            // Der Merker haengt am View selbst (`tag`): er ueberlebt die Recomposition und loest
            // keine aus (ein Compose-State an dieser Stelle waere die naechste Schleife).
            if (web.tag == videoId) return@AndroidView
            web.tag = videoId
            web.loadDataWithBaseURL(
                HERKUNFT,
                // `html` UND `body` brauchen ausdruecklich Hoehe, sonst rechnet die 100 %-Angabe
                // des iframes gegen einen Block ohne Hoehe — und das Ergebnis ist ~0.
                // GENAU DAS war der schwarze Player (02.09.): Jan sah unten am Bildschirmrand
                // „eine 1px hohe Zeile, die sich beim Videowechsel farblich aendert" — das WAR
                // das Video, volle Breite, ein Pixel hoch. Ton lief die ganze Zeit.
                // Deshalb hier alles explizit statt `width/height`-Attribute: Attribute sind nur
                // Darstellungs-HINWEISE, und ohne Hoehe am Elternteil bringen sie nichts.
                """<html style="height:100%"><body style="margin:0;height:100%;background:#000">
                   <iframe style="display:block;width:100%;height:100%;border:0" allowfullscreen
                     allow="autoplay; encrypted-media; picture-in-picture"
                     src="https://www.youtube-nocookie.com/embed/$videoId?autoplay=1&rel=0&playsinline=1&loop=1&playlist=$videoId&origin=$HERKUNFT"></iframe>
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
