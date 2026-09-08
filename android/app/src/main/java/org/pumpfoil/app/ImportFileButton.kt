package org.pumpfoil.app

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FileUpload
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Aufgezeichnete Aktivitaet als Datei importieren (FIT/TCX/GPX, auch als ZIP).
 *
 * Gegenstueck zu `web/src/components/UploadFitButton.tsx`. In den Apps fehlte der Import
 * KOMPLETT (geprueft 08.09.2026: kein Aufruf von `/api/sessions/upload-fit` in Android und iOS) —
 * die Zeile „Session-Datei laden (GPX + FIT) ✅ 26.08." in `docs/PARITY-AUDIT.md` meinte den
 * EXPORT (`ba407138`). In der PWA sitzt der Knopf seit dem 07.09. in „Meine Sessions" unter den
 * Filtern, weil ihn auf der Import-Seite niemand fand; hier steht er an derselben Stelle.
 *
 * `onImported` bekommt die zuletzt angelegte Session (oder null, wenn keine entstand) — der
 * Aufrufer oeffnet sie bzw. laedt die Liste neu, genau wie die PWA es tut.
 */
@Composable
fun ImportFileButton(onImported: (Int?) -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var fortschritt by remember { mutableStateOf("") }
    var meldung by remember { mutableStateOf<String?>(null) }
    var zuletzt by remember { mutableStateOf<Int?>(null) }

    // "*/*": .fit und .gpx haben auf Android oft gar keinen registrierten MIME-Typ, eine engere
    // Liste versteckt genau die Dateien, die importiert werden sollen. Der Server prueft ohnehin.
    val waehler = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenMultipleDocuments()
    ) { uris ->
        if (uris.isNullOrEmpty()) return@rememberLauncherForActivityResult
        busy = true
        scope.launch {
            var fehler = 0
            // Uebersprungen ist KEIN Fehler: der Garmin-Gesamtexport enthaelt Aktivitaeten und
            // Tagesaufzeichnungen gemischt (am Dateinamen nicht unterscheidbar). Wer den Ordner
            // hochlaedt, soll „12 importiert, 87 uebersprungen" lesen, nicht „87 fehlgeschlagen".
            var uebersprungen = 0
            var grund = ""
            var letzte: Int? = null
            uris.forEachIndexed { i, uri ->
                if (uris.size > 1) fortschritt = "${i + 1}/${uris.size}"
                try {
                    val bytes = withContext(Dispatchers.IO) {
                        ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                    } ?: throw RuntimeException("leer")
                    val r = Api.uploadFit(bytes, dateiname(ctx, uri))
                    if (r.skipped != null) {
                        uebersprungen++
                        if (grund.isEmpty() && !r.detail.isNullOrBlank()) grund = r.detail
                    } else if (r.sessionId != null) {
                        letzte = r.sessionId
                    }
                } catch (_: Exception) {
                    fehler++
                }
            }
            fortschritt = ""
            busy = false
            zuletzt = letzte
            val text = when {
                fehler > 0 -> I18n.t("sessions.uploadFail")
                    .replace("{fail}", fehler.toString()).replace("{total}", uris.size.toString())
                // Bei genau EINER Datei den Grund im Klartext zeigen — sonst raetselt man, warum
                // nichts passiert ist (dieselbe Regel wie in der PWA).
                uebersprungen > 0 && uris.size == 1 && grund.isNotEmpty() ->
                    I18n.t("sessions.uploadSkippedOne").replace("{reason}", grund)
                uebersprungen > 0 -> I18n.t("sessions.uploadSkipped")
                    .replace("{skipped}", uebersprungen.toString()).replace("{total}", uris.size.toString())
                else -> null
            }
            if (text != null) meldung = text else onImported(letzte)
        }
    }

    Row(
        Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.End,
    ) {
        OutlinedButton(onClick = { waehler.launch(arrayOf("*/*")) }, enabled = !busy) {
            Icon(Icons.Filled.FileUpload, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(6.dp))
            Text(
                if (busy) I18n.t("sessions.importing") + (if (fortschritt.isNotEmpty()) " $fortschritt" else "") + " …"
                else I18n.t("sessions.uploadFitZip")
            )
        }
    }

    if (meldung != null) {
        AlertDialog(
            onDismissRequest = { meldung = null; onImported(zuletzt) },
            title = { Text(I18n.t("import.title")) },
            text = { Text(meldung ?: "", style = MaterialTheme.typography.bodyMedium) },
            confirmButton = {
                TextButton(onClick = { meldung = null; onImported(zuletzt) }) { Text(I18n.t("common.close")) }
            },
        )
    }
}

/** Anzeigename der gewaehlten Datei — der Server erkennt TCX/GPX auch an der Endung. */
private fun dateiname(ctx: android.content.Context, uri: android.net.Uri): String {
    ctx.contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)
        ?.use { c -> if (c.moveToFirst()) return c.getString(0) ?: "import.fit" }
    return uri.lastPathSegment?.substringAfterLast('/') ?: "import.fit"
}
