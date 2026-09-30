package org.pumpfoil.app

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage

/**
 * Bilder an einer Chat-Nachricht — Gegenstueck zu `web/src/components/FotoStapel.tsx` (Jan,
 * 30.09.2026: „wenn mehr Bilder als eins in einer Nachricht, dann gestapelt"). EIN Bild: normal
 * gross. MEHRERE: ein Stapel — das erste obenauf, bis zu zwei weitere leicht versetzt und gedreht
 * dahinter, dazu die Anzahl. Ein Tipp oeffnet das Vollbild mit allen Bildern der Nachricht
 * (wischen zum Blaettern, BilderVollbild in SessionDetailScreen.kt).
 *
 * Gezeigt wird das Vorschaubild (480 px); das volle Bild erst im Vollbild.
 */
@Composable
internal fun ChatFotoStapel(photos: List<ChatPhoto>, modifier: Modifier = Modifier) {
    if (photos.isEmpty()) return
    var offen by remember(photos) { mutableStateOf<Int?>(null) }
    fun klein(p: ChatPhoto) = Api.mediaUrl(p.thumbUrl ?: p.url)
    val rand = MaterialTheme.colorScheme.outlineVariant
    if (photos.size == 1) {
        AsyncImage(
            model = klein(photos[0]), contentDescription = I18n.t("chat.photoOpen"),
            contentScale = ContentScale.Crop,
            modifier = modifier.padding(top = 6.dp).widthIn(max = 240.dp).heightIn(max = 220.dp)
                .clip(RoundedCornerShape(12.dp)).border(1.dp, rand, RoundedCornerShape(12.dp))
                .clickable { offen = 0 },
        )
    } else {
        val label = I18n.t("chat.photosOpen").replace("{n}", photos.size.toString())
        Box(
            modifier.padding(top = 12.dp, start = 4.dp, bottom = 4.dp).size(width = 200.dp, height = 150.dp)
                .semantics { contentDescription = label }
                .clickable { offen = 0 },
        ) {
            // Hinten zuerst zeichnen: das zweite Bild leicht, das dritte staerker versetzt/gedreht.
            photos.drop(1).take(2).reversed().forEachIndexed { i, p ->
                val tief = if (photos.size >= 3) 1 - i else 0   // 1 = ganz hinten
                AsyncImage(
                    model = klein(p), contentDescription = null, contentScale = ContentScale.Crop,
                    alpha = if (tief == 1) 0.75f else 0.9f,
                    modifier = Modifier.fillMaxSize()
                        .offset(x = if (tief == 1) 14.dp else 7.dp, y = if (tief == 1) (-10).dp else (-5).dp)
                        .rotate(if (tief == 1) 6f else 3f)
                        .clip(RoundedCornerShape(12.dp)).border(1.dp, rand, RoundedCornerShape(12.dp)),
                )
            }
            AsyncImage(
                model = klein(photos[0]), contentDescription = null, contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize().clip(RoundedCornerShape(12.dp))
                    .border(1.dp, rand, RoundedCornerShape(12.dp)),
            )
            Text("+${photos.size - 1}", color = Color.White, fontWeight = FontWeight.SemiBold,
                style = MaterialTheme.typography.labelMedium,
                modifier = Modifier.align(Alignment.BottomEnd).padding(6.dp)
                    .background(Color.Black.copy(alpha = 0.7f), RoundedCornerShape(50))
                    .padding(horizontal = 8.dp, vertical = 2.dp))
        }
    }
    offen?.let { start -> BilderVollbild(photos.map { it.url }, start, onClose = { offen = null }) }
}

/**
 * Ein Anhang im Eingabefeld: frisch gewaehlt (`uri`, Upload laeuft oder fertig) oder beim
 * Bearbeiten ein schon versandtes Bild (`url` = sein Vorschaubild). `id` fehlt, solange der
 * Upload laeuft; `fehler` = Upload gescheitert (bleibt stehen, bis man es entfernt — wie Web).
 */
internal data class ChatAnhang(
    val key: String,
    val uri: android.net.Uri? = null,
    val url: String? = null,
    val id: Int? = null,
    val fehler: Boolean = false,
)

/** Vorschau der Anhaenge mit Entfernen-Knopf je Bild; darunter der Fehlerhinweis, falls einer scheiterte. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun ChatAnhangLeiste(anhaenge: List<ChatAnhang>, onWeg: (String) -> Unit, modifier: Modifier = Modifier) {
    if (anhaenge.isEmpty()) return
    Column(modifier) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            anhaenge.forEach { a ->
                Box(Modifier.size(64.dp)) {
                    AsyncImage(
                        model = a.uri ?: Api.mediaUrl(a.url), contentDescription = null,
                        contentScale = ContentScale.Crop,
                        alpha = if (a.id == null) 0.5f else 1f,
                        modifier = Modifier.fillMaxSize().clip(RoundedCornerShape(8.dp))
                            .then(if (a.fehler) Modifier.border(BorderStroke(2.dp, MaterialTheme.colorScheme.error), RoundedCornerShape(8.dp)) else Modifier),
                    )
                    if (a.id == null && !a.fehler) {
                        CircularProgressIndicator(Modifier.align(Alignment.Center).size(20.dp), strokeWidth = 2.dp)
                    }
                    Box(
                        Modifier.align(Alignment.TopEnd).padding(2.dp).size(22.dp)
                            .clip(CircleShape).background(Color.Black.copy(alpha = 0.65f))
                            .clickable { onWeg(a.key) },
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Filled.Close, contentDescription = I18n.t("chat.photoRemove"),
                            tint = Color.White, modifier = Modifier.size(14.dp))
                    }
                }
            }
        }
        if (anhaenge.any { it.fehler }) {
            Text(I18n.t("chat.photoFailed"), style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error, modifier = Modifier.fillMaxWidth().padding(top = 4.dp))
        }
    }
}
