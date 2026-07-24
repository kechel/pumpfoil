package org.pumpfoil.app

import androidx.compose.foundation.clickable
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
    Column(modifier.padding(bottom = 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        rows.forEach { s -> UploadRow(s, onOpen) }
    }
}

@Composable
private fun UploadRow(s: InProgressSession, onOpen: (Int) -> Unit) {
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
    Card(
        onClick = { onOpen(s.id) },
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = accent.copy(alpha = 0.10f)),
        shape = RoundedCornerShape(14.dp),
    ) {
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
            if (stalled) {
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
}
