package org.pumpfoil.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

// Community-Galerie der Uhr-Layouts: veroeffentlichte Screens anderer ansehen und in die eigenen
// kopieren. GESTALTET wird nur in der PWA (Entscheidung Jan 2026-08-17) — hier gibt es bewusst
// keinen Editor, dafuer steht der Hinweis auf den Browser im Ansichten-Editor.
//
// Warum das nativ ueberhaupt geht: der lesende Renderer (LayoutRender.kt) zeichnet ein Layout so
// wie die Uhr. Ohne ihn waere eine Galerie sinnlos — eine Liste von Namen hilft niemandem.
//
// Layout/Design: LazyColumn (scrollt, laedt nur Sichtbares), Scaffold bringt die System-Insets mit,
// die Vorschau steht LINKS und die Angaben rechts daneben, damit auf schmalen Geraeten nichts
// abgeschnitten wird.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LayoutGalleryScreen(onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    var layouts by remember { mutableStateOf<List<WatchLayoutBrief>?>(null) }
    var kopiert by remember { mutableStateOf<Int?>(null) }
    var fehler by remember { mutableStateOf<String?>(null) }

    // Keine Sortier-Auswahl: die PWA-Galerie hat auch keine und nimmt den Server-Standard
    // (sort=used, rankt nach tatsaechlicher Nutzung). Paritaet heisst gleich, nicht mehr.
    LaunchedEffect(Unit) {
        layouts = try { Api.communityLayouts() } catch (_: Exception) { emptyList() }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(I18n.t("lay.galleryTitle")) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null)
                    }
                },
            )
        },
    ) { pad ->
        val liste = layouts
        if (liste == null) {
            Column(Modifier.fillMaxSize().padding(pad), horizontalAlignment = Alignment.CenterHorizontally) {
                Spacer(Modifier.height(24.dp))
                CircularProgressIndicator()
            }
            return@Scaffold
        }
        LazyColumn(
            Modifier.fillMaxSize().padding(pad).padding(horizontal = 12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                Spacer(Modifier.height(4.dp))
                Text(I18n.t("lay.galleryHint"), style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (liste.isEmpty()) {
                item {
                    Text(I18n.t("lay.galleryEmpty"), style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            items(liste, key = { it.id }) { l ->
                Card(Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(12.dp), verticalAlignment = Alignment.Top,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        WatchLayoutPreview(
                            elements = l.elements, bgColor = l.bg_color, shape = l.shape,
                            w = l.authored_w ?: 240, h = l.authored_h ?: 240, px = 110.dp)
                        Column(Modifier.fillMaxWidth()) {
                            Text(l.name, fontWeight = FontWeight.Medium,
                                style = MaterialTheme.typography.bodyLarge)
                            l.author?.let {
                                Text(I18n.t("lay.byAuthor").replace("{name}", it),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            // Nutzung zuerst: sie sagt mehr als die Kopien-Zahl (eine bloss
                            // gespeicherte Kopie liegt auf keiner Uhr).
                            val zahlen = buildList {
                                val genutzt = l.used_by ?: 0
                                // Einzahl eigener Schluessel: „von 1 Foilern" ist falsches Deutsch.
                                if (genutzt > 0) add(
                                    I18n.t(if (genutzt == 1) "lay.usedBy1" else "lay.usedBy")
                                        .replace("{n}", "$genutzt")
                                )
                                val kopien = l.copies ?: 0
                                if (kopien > 0) add(I18n.t("lay.copies").replace("{n}", "$kopien"))
                            }
                            if (zahlen.isNotEmpty()) {
                                Text(zahlen.joinToString(" · "), style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            if (l.has_freetext) {
                                Text(I18n.t("lay.hasFreetext"), style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.tertiary)
                            }
                            Spacer(Modifier.height(6.dp))
                            OutlinedButton(onClick = {
                                scope.launch {
                                    fehler = null
                                    try { Api.copyLayout(l.id); kopiert = l.id }
                                    catch (e: Exception) { fehler = e.message }
                                }
                            }) { Text(I18n.t("lay.copyToMine")) }
                            if (kopiert == l.id) {
                                Text(I18n.t("lay.copiedGoto"), style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.padding(top = 4.dp))
                            }
                        }
                    }
                }
            }
            fehler?.let { m ->
                item {
                    Text("${I18n.t("lay.saveErr")} $m", style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error)
                }
            }
            item { Spacer(Modifier.height(16.dp)) }
        }
    }
}
