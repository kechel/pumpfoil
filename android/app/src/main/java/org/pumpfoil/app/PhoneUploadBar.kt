package org.pumpfoil.app

import androidx.compose.foundation.background
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
import androidx.compose.material.icons.filled.CloudUpload
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.runtime.collectAsState

// Upload-Anzeige des HANDY-RECORDERS — sichtbar auf JEDEM Bildschirm, nicht nur im Aufnahme-Screen.
//
// Jan, 22.09.2026: „dass der visuell anzeigt und x/y chunks und ne progress bar und unabhaengig
// von der ansicht ueberall in der app natuerlich im hintergrund hochlaedt wenn noch was offen ist."
//
// Was vorher fehlte — und was NICHT fehlte: hochgeladen wurde schon immer im `Recorder`-eigenen
// CoroutineScope, ein Bildschirmwechsel bricht also nichts ab. Und `uploadSent`/`uploadTotal`
// standen bereits im State. Es fehlten genau zwei Dinge: der Upload wurde NUR vom
// Aufnahme-Bildschirm aus angestossen (wer nach der Fahrt gleich auf „Verlauf" ging, dessen
// Aufnahme blieb liegen), und zu sehen war eine kleine graue Textzeile ohne Zahlen.
//
// Absichtlich EINE Leiste statt einer Karte je Bildschirm: sie sitzt in `MainActivity` ueber der
// Navigationsleiste und ist damit ueberall dieselbe. Die Server-seitige `UploadProgressCard`
// (Home + Sessions) bleibt daneben bestehen — die zeigt, was beim SERVER ankommt, diese hier,
// was das Handy noch loswerden muss. Zwei verschiedene Fragen.
@Composable
fun PhoneUploadBar(modifier: Modifier = Modifier) {
    val ctx = LocalContext.current
    val st by Recorder.state.collectAsState()
    // Waehrend der Aufnahme nicht: dort fuehrt der Aufnahme-Bildschirm, und die Leiste wuerde
    // im fokussierten Modus stoeren (dort ist auch die Navigationsleiste ausgeblendet).
    if (st.recording || (st.pendingCount == 0 && !st.uploading)) return

    val fehler = st.uploadError.isNotEmpty() && !st.uploading
    val farbe = if (fehler) MaterialTheme.colorScheme.errorContainer
                else MaterialTheme.colorScheme.primaryContainer
    val darauf = if (fehler) MaterialTheme.colorScheme.onErrorContainer
                 else MaterialTheme.colorScheme.onPrimaryContainer
    val text = when {
        st.uploading && st.uploadTotal > 0 ->
            I18n.t("upload.progressPct")
                .replace("{pct}", (st.uploadSent * 100 / st.uploadTotal.coerceAtLeast(1)).toString())
                .replace("{n}", st.uploadSent.toString())
                .replace("{total}", st.uploadTotal.toString())
        st.uploading -> I18n.t("rec.upRunning")
        st.uploadError == "offline" -> I18n.t("rec.upOffline")
        st.uploadError == "server" || st.uploadError == "auth" -> I18n.t("rec.upFailed")
        else -> I18n.t("rec.pending").replace("{n}", st.pendingCount.toString())
    }

    Column(
        modifier.fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 6.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(farbe)
            // Antippen heisst „jetzt versuchen" — solange nichts laeuft. Waehrend des Uploads
            // waere ein zweiter Anstoss wirkungslos (`drain` haelt sich selbst ab).
            .clickable(enabled = !st.uploading) { Recorder.drain(ctx) }
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.CloudUpload, contentDescription = null,
                modifier = Modifier.size(18.dp), tint = darauf)
            Spacer(Modifier.width(8.dp))
            Text(I18n.t("upload.title"), color = darauf, fontWeight = FontWeight.Bold,
                style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.weight(1f))
            Text(text, color = darauf, style = MaterialTheme.typography.bodySmall)
            if (!st.uploading) {
                Spacer(Modifier.width(8.dp))
                Text(I18n.t("rec.uploadNow"), color = darauf, fontWeight = FontWeight.Bold,
                    style = MaterialTheme.typography.bodySmall)
            }
        }
        // Balken nur, wenn die Gesamtzahl bekannt ist — ein unbestimmter Balken, der sich nie
        // fuellt, sieht aus wie „haengt". Ohne Zahlen bleibt es bei der Textzeile.
        if (st.uploading && st.uploadTotal > 0) {
            LinearProgressIndicator(
                progress = { st.uploadSent.toFloat() / st.uploadTotal.toFloat() },
                modifier = Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)),
                color = MaterialTheme.colorScheme.primary,
                trackColor = MaterialTheme.colorScheme.surfaceVariant,
            )
        }
    }
}
