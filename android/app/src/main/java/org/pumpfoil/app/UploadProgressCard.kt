package org.pumpfoil.app

import androidx.compose.animation.core.animateFloat
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.material.icons.filled.Watch
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.CloudUpload
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay

// Prominente Live-Upload-Karte (Home + Sessions): eigene Sessions im Zwischenzustand
// (recording/live), sobald Chunks am Server ankommen — inkl. „GPS da"-Anzeige, Stall-Hinweis
// (>5 min kein Chunk) und Klick -> Detailseite (dort triggert der Server die gps_only-Analyse).
// Pollt schnell (4 s) solange etwas läuft, sonst träge (20 s). Rendert nichts, wenn leer.
// Parität zur PWA. Farben aus dem Theme (kippt automatisch light/dark).
@Composable
fun UploadProgressCard(onOpen: (Int) -> Unit, modifier: Modifier = Modifier) {
    var rows by remember { mutableStateOf<List<InProgressSession>>(emptyList()) }
    LaunchedEffect(Unit) {
        while (true) {
            rows = try { Api.inProgress() } catch (_: Exception) { rows }
            delay(if (rows.isNotEmpty()) 4000L else 20000L)
        }
    }
    if (rows.isEmpty()) return
    // Column (mit Bottom-Abstand) nur wenn gerendert -> kein Phantom-Gap, wenn leer.
    // UEBERHOLTE Aufnahmen (die Uhr hat ihren Puffer weitergedreht, es kommt nichts mehr) stehen
    // NICHT als grosse Karte ueber allem — dort saesse sonst dauerhaft ein langer Hinweis, obwohl
    // nichts laeuft und nichts zu tun ist, solange man nicht hineingeht (Jan, 11.09.2026; in der
    // PWA seit demselben Tag so). Sie verschwinden aber auch nicht: eine `live`-Session steht in
    // der Liste nur unter „Aussortiert", und genau daran lag der Befund vom 03.09. — 30
    // haengende Uploads sahen ihre Besitzer NIRGENDS. Deshalb bleibt eine schmale Zeile mit dem
    // Weg zur Session; entschieden wird dort (auswerten oder loeschen).
    val laufend = rows.filter { !it.ueberholt }
    val ueberholt = rows.filter { it.ueberholt }
    Column(modifier.padding(bottom = 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        laufend.forEach { s ->
            // Handy-Recorder mit Live-Upload: laufende AUFNAHME, kein haengender Upload (wie PWA, 14.10.2026)
            if (s.placement == "phone" && s.status == "live") HandyLiveZeile(s, onOpen) else UploadRow(s, onOpen)
        }
        ueberholt.forEach { s -> SchmaleZeile(s, onOpen) }
    }
}

private fun minutenSeit(iso: String?): Int = try {
    if (iso.isNullOrBlank()) 0
    else ((System.currentTimeMillis() - java.time.OffsetDateTime.parse(iso).toInstant().toEpochMilli()) / 60000L)
        .toInt().coerceAtLeast(0)
} catch (_: Exception) { 0 }

/** „Dein Handy nimmt auf – seit X min" (rot pulsierend) bzw. „letzte Daten vor X min" (orange). */
@Composable
private fun HandyLiveZeile(s: InProgressSession, onOpen: (Int) -> Unit) {
    val ago = minutenSeit(s.lastReceivedAt)
    val frisch = ago <= 3
    val takt = androidx.compose.animation.core.rememberInfiniteTransition(label = "live").animateFloat(
        initialValue = 1f, targetValue = 0.35f,
        animationSpec = androidx.compose.animation.core.infiniteRepeatable(
            androidx.compose.animation.core.tween(900), androidx.compose.animation.core.RepeatMode.Reverse),
        label = "punkt").value
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
            .border(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.4f), RoundedCornerShape(12.dp))
            .clickable { onOpen(s.id) }.padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(12.dp).clip(androidx.compose.foundation.shape.CircleShape)
            .background(if (frisch) Color(0xFFEF4444).copy(alpha = takt) else Color(0xFFF59E0B)))
        Spacer(Modifier.width(10.dp))
        Text(
            if (frisch) I18n.t("live.phoneActive").replace("{min}", minutenSeit(s.startedAt).toString())
            else I18n.t("live.phoneStale").replace("{ago}", ago.toString()),
            style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium,
        )
    }
}

/**
 * Eigene Uhren, die sich in der letzten Stunde gemeldet und seitdem nichts hochgeladen haben:
 * „… nimmt vermutlich auf" (wie die PWA-Startseite, 14.10.2026). Fragt einmal pro Minute.
 */
@Composable
fun UhrenLiveStatus(modifier: Modifier = Modifier) {
    var uhren by remember { mutableStateOf<List<LiveWatch>>(emptyList()) }
    LaunchedEffect(Unit) {
        while (true) {
            uhren = try { Api.liveStatus().watches.filter { it.state == "probably_recording" } } catch (_: Exception) { uhren }
            delay(60_000L)
        }
    }
    if (uhren.isEmpty()) return
    Column(modifier.padding(bottom = 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        uhren.forEach { w ->
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                    .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(12.dp)).padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.Watch, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text(I18n.t("live.watchProbably").replace("{device}", w.device)
                        .replace("{ago}", (w.lastSeenAgeS / 60).toString()),
                    style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

/** Eine ueberholte Aufnahme in der Uebersicht: eine Zeile, kein Block. Sie sagt, was ist, und
 *  fuehrt zur Session. Gegenstueck zu `SchmaleZeile` in der PWA. */
@Composable
private fun SchmaleZeile(s: InProgressSession, onOpen: (Int) -> Unit) {
    Row(
        Modifier.fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .clickable { onOpen(s.id) }
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.Info, null, tint = MaterialTheme.colorScheme.tertiary,
            modifier = Modifier.size(16.dp))
        Spacer(Modifier.width(8.dp))
        Text(I18n.t("upload.supersededShort"), style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
    }
}

// Dieselbe Karte auf der Detailseite EINER Session (Jan, 01.09.: „die session sollte auch die
// gleiche anzeige verwenden wie die session-uebersicht waehrend eines uploads"). Ohne Klickziel —
// sie wuerde auf sich selbst verlinken. Rendert nichts, sobald der Upload durch ist (dann steht
// die Session nicht mehr in /in-progress) und die Analyse allein weiterlaeuft.
@Composable
fun SessionUploadCard(id: Int, modifier: Modifier = Modifier) {
    var row by remember(id) { mutableStateOf<InProgressSession?>(null) }
    LaunchedEffect(id) {
        while (true) {
            row = try { Api.inProgress().firstOrNull { it.id == id } } catch (_: Exception) { row }
            delay(if (row != null) 4000L else 20000L)
        }
    }
    row?.let { UploadRow(it, onOpen = null, modifier = modifier) }
}

@Composable
private fun UploadRow(s: InProgressSession, onOpen: ((Int) -> Unit)?, modifier: Modifier = Modifier) {
    val accent = MaterialTheme.colorScheme.primary
    val pct = s.uploadTotal?.takeIf { it > 0 }?.let {
        (s.uploadReceived.toFloat() / it).coerceIn(0f, 1f)
    }
    val stalled = remember(s.lastReceivedAt) {
        s.lastReceivedAt?.let {
            try {
                System.currentTimeMillis() -
                    java.time.OffsetDateTime.parse(it).toInstant().toEpochMilli() > 5 * 60 * 1000
            } catch (_: Exception) { false }
        } ?: false
    }
    val inhalt: @Composable () -> Unit = {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.CloudUpload, null, tint = accent, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(8.dp))
                Text(I18n.t("upload.title"), fontWeight = FontWeight.SemiBold,
                    style = MaterialTheme.typography.titleSmall)
                if (!s.deviceLabel.isNullOrBlank()) {
                    Spacer(Modifier.width(8.dp))
                    Text(s.deviceLabel, style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Spacer(Modifier.height(6.dp))
            Row(verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (s.hasGps) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.LocationOn, null, tint = accent, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(3.dp))
                        Text(I18n.t("upload.gpsReady"), color = accent,
                            style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                        Icon(Icons.Filled.CheckCircle, null, tint = accent, modifier = Modifier.size(14.dp))
                    }
                } else {
                    Text(I18n.t("upload.waiting"), style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Text(
                    if (pct != null) "${(pct * 100).toInt()} % · ${s.uploadReceived}/${s.uploadTotal}"
                    else I18n.t("upload.chunks").replace("{n}", s.uploadReceived.toString()),
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            Spacer(Modifier.height(8.dp))
            if (pct != null) {
                LinearProgressIndicator(progress = { pct }, modifier = Modifier.fillMaxWidth().height(6.dp),
                    color = accent)
            } else {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth().height(6.dp), color = accent)
            }
            Spacer(Modifier.height(8.dp))
            // „Ueberholt": seither ist eine neuere Session komplett angekommen, die Uhr hat ihren
            // Puffer also weitergedreht — „App auf der Uhr oeffnen" waere ein falscher Rat.
            if (s.ueberholt) {
                Row(verticalAlignment = Alignment.Top) {
                    Icon(Icons.Filled.Info, null, tint = MaterialTheme.colorScheme.tertiary,
                        modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(I18n.t(if (s.hasGps) "upload.supersededHint" else "upload.supersededEmpty"),
                        style = MaterialTheme.typography.bodyMedium)
                }
            } else if (stalled) {
                Row(verticalAlignment = Alignment.Top) {
                    Icon(Icons.Filled.Info, null, tint = MaterialTheme.colorScheme.tertiary,
                        modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(I18n.t("upload.stalledHint"), style = MaterialTheme.typography.bodyMedium)
                }
            } else {
                Text(I18n.t("upload.hint"), style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
    val farben = CardDefaults.cardColors(containerColor = accent.copy(alpha = 0.10f))
    val form = RoundedCornerShape(14.dp)
    if (onOpen != null) {
        Card(onClick = { onOpen(s.id) }, modifier = modifier.fillMaxWidth(), colors = farben, shape = form) { inhalt() }
    } else {
        Card(modifier = modifier.fillMaxWidth(), colors = farben, shape = form) { inhalt() }
    }
}
