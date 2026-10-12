package org.pumpfoil.app

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

// Changelog nativ (12.10.2026, Nutzer-Meldung): dieselbe Seite wie web/src/pages/Changelog.tsx —
// oben der Release-Stand (Live / in Pruefung / abgelehnt / als Naechstes / Ideen), darunter die
// Tage, neueste zuerst. Inhalt bewusst ENGLISCH wie im Web (Memory changelog-page), uebersetzt
// sind nur Titel, „Details (n)" und die Fehlerzeile. Beide Abrufe sind oeffentlich und
// unabhaengig: faellt der Release-Stand aus, verschwindet nur sein Block (wie im Web).

private val LINK_RE = Regex("""\[([^\]]+)\]\(([^)]+)\)""")

/** `[label](ziel)` -> nur `label`. Die Links fuehren meist auf Web-Seiten; nativ bleibt der Text. */
private fun ohneLinks(t: String): String = LINK_RE.replace(t) { it.groupValues[1] }

/** „October 12, 2026" — fest Englisch wie das Web (`tagLang`). */
private fun tagLang(iso: String): String = try {
    LocalDate.parse(iso).format(DateTimeFormatter.ofPattern("MMMM d, yyyy", Locale.ENGLISH))
} catch (_: Exception) { iso }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChangelogScreen(onBack: () -> Unit) {
    var tage by remember { mutableStateOf<List<ChangelogTag>?>(null) }
    var fehler by remember { mutableStateOf(false) }
    var stand by remember { mutableStateOf<ReleaseStand?>(null) }

    LaunchedEffect(Unit) {
        try { tage = Api.changelog().days } catch (_: Exception) { fehler = true }
    }
    LaunchedEffect(Unit) {
        stand = try { Api.releaseStand() } catch (_: Exception) { null }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(I18n.t("nav.changelog")) },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = I18n.t("common.back")) }
                },
            )
        },
    ) { pad ->
        LazyColumn(
            Modifier.padding(pad).fillMaxWidth(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            stand?.let { s ->
                if (s.probleme.isNotEmpty()) item { ProblemBox(s.probleme) }
                item { ReleaseKarte(s) }
            }
            if (tage == null && !fehler) item {
                Text(I18n.t("common.loading"), color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (fehler) item {
                Text(I18n.t("common.loadFailed"), color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            items(tage ?: emptyList(), key = { it.date }) { tag -> TagBlock(tag) }
        }
    }
}

@Composable
private fun istDunkel(): Boolean = MaterialTheme.colorScheme.background.luminance() < 0.5f

// Bekannte Probleme — Warnbox ueber dem Release-Stand (Web `BekannteProbleme`). Leer = kein Block.
@Composable
private fun ProblemBox(probleme: List<BekanntesProblem>) {
    val dunkel = istDunkel()
    val fg = if (dunkel) Color(0xFFFCD34D) else Color(0xFF92400E)   // amber-300 / amber-800
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
            .background(Color(0xFFF59E0B).copy(alpha = 0.12f)).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text("Known problems right now", fontWeight = FontWeight.Bold, color = fg,
            style = MaterialTheme.typography.titleSmall)
        probleme.forEach { p ->
            Text("${p.titel}: ${p.text}", color = fg, style = MaterialTheme.typography.bodyMedium)
            p.note?.takeIf { it.isNotBlank() }?.let {
                Text(it, color = fg.copy(alpha = 0.8f), style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

// Release-Stand: dieselben Abschnitte in derselben Reihenfolge und Farbfamilie wie das Web.
@Composable
private fun ReleaseKarte(s: ReleaseStand) {
    val dunkel = istDunkel()
    val gruppen = listOf(
        Triple("Live now", MaterialTheme.colorScheme.primary, s.live),
        Triple("Being reviewed", if (dunkel) Color(0xFF34D399) else Color(0xFF047857), s.review),
        Triple("Rejected", if (dunkel) Color(0xFFFBBF24) else Color(0xFFB45309), s.rejected),
        Triple("Coming next", if (dunkel) Color(0xFFFF5500) else Color(0xFFC24100), s.next),
    ).filter { it.third.isNotEmpty() }
    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors()) {
        Column(Modifier.padding(14.dp)) {
            Text("Release status", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
            Text("Where everything stands right now — website, phone apps and watch apps.",
                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            gruppen.forEach { (titel, farbe, zeilen) ->
                Spacer(Modifier.height(12.dp))
                Text(titel.uppercase(), style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold, color = farbe)
                zeilen.forEach { r -> ReleaseZeileView(r) }
            }
            if (s.ideen.isNotEmpty()) {
                Spacer(Modifier.height(14.dp))
                Text("IDEAS FOR FUTURE DEVELOPMENT", style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold, color = if (dunkel) Color(0xFFA78BFA) else Color(0xFF6D28D9))
                Text("No dates and no order — things we would like to build.",
                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Aufklapper(s.ideen)
            }
        }
    }
}

// Eine Einreichung: Name, Version (mit Store-Link, wenn es einen gibt), Notiz, eingeklappte Punkte.
@Composable
private fun ReleaseZeileView(r: ReleaseZeile) {
    val ctx = LocalContext.current
    val url = r.storeUrl?.takeIf { it.isNotBlank() }
    Column(Modifier.fillMaxWidth().padding(top = 8.dp)) {
        Text(r.name, fontWeight = FontWeight.Medium, style = MaterialTheme.typography.bodyMedium)
        Text(
            r.version,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            color = if (url != null) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
            modifier = if (url != null) Modifier.clickable {
                try { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } catch (_: Exception) {}
            } else Modifier,
        )
        r.note?.takeIf { it.isNotBlank() }?.let {
            Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (r.items.isNotEmpty()) Aufklapper(r.items)
    }
}

// „Details (n)" — zu, bis man es aufmacht (wie <details> im Web).
@Composable
private fun Aufklapper(punkte: List<String>) {
    var offen by remember { mutableStateOf(false) }
    Row(
        Modifier.clickable { offen = !offen }.padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(if (offen) Icons.Filled.KeyboardArrowDown else Icons.AutoMirrored.Filled.KeyboardArrowRight,
            contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
        Text(I18n.t("changelog.details").replace("{n}", punkte.size.toString()),
            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
    }
    if (offen) {
        Column(Modifier.padding(start = 6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            punkte.forEach { Aufzaehlung(it) }
        }
    }
}

@Composable
private fun Aufzaehlung(text: String) {
    Row {
        Text("•", modifier = Modifier.width(14.dp), style = MaterialTheme.typography.bodyMedium)
        Text(text, style = MaterialTheme.typography.bodyMedium)
    }
}

// Ein Tag: Datum, darunter die Punkte. Store-Ereignisse ohne Aufzaehlungspunkt, gedaempft und mit
// Strich links — gleiche Schriftgroesse („Hinweise nie winzig"), wie im Web.
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TagBlock(tag: ChangelogTag) {
    Column(Modifier.fillMaxWidth().padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(tagLang(tag.date), style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.primary)
        tag.items.forEach { p ->
            val ereignis = p.art == "ereignis"
            val inhalt: @Composable () -> Unit = {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(ohneLinks(p.text), style = MaterialTheme.typography.bodyMedium,
                        color = if (ereignis) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface)
                    if (p.plattformen.isNotEmpty()) {
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            p.plattformen.forEach { pl ->
                                Text(
                                    if (pl.version.isNotBlank()) "${pl.name} ${pl.version}" else pl.name,
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.clip(RoundedCornerShape(50))
                                        .background(MaterialTheme.colorScheme.surfaceVariant)
                                        .padding(horizontal = 8.dp, vertical = 2.dp),
                                )
                            }
                        }
                    }
                    Api.mediaUrl(p.img)?.let { u ->
                        AsyncImage(model = u, contentDescription = p.imgAlt, contentScale = ContentScale.FillWidth,
                            modifier = Modifier.widthIn(max = 260.dp).clip(RoundedCornerShape(8.dp)))
                    }
                }
            }
            if (ereignis) {
                Row(Modifier.height(IntrinsicSize.Min)) {
                    Box(Modifier.width(2.dp).fillMaxHeight().background(MaterialTheme.colorScheme.outlineVariant))
                    Spacer(Modifier.width(10.dp))
                    inhalt()
                }
            } else {
                Row {
                    Text("•", modifier = Modifier.width(14.dp), style = MaterialTheme.typography.bodyMedium)
                    inhalt()
                }
            }
        }
    }
}
