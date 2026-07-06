package org.pumpfoil.app

import android.Manifest
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import android.content.pm.PackageManager

// App-Sprache -> BCP-47-Locale für die Spracherkennung (AT/CH-Varianten wie im Web).
private fun localeTag(lang: String): String = when (lang) {
    "gsw" -> "de-CH"
    "de-AT" -> "de-AT"
    "de" -> "de-DE"
    "en" -> "en-US"
    "fr" -> "fr-FR"
    "it" -> "it-IT"
    "es" -> "es-ES"
    else -> "de-DE"
}

// Vollbild-Diktat (weiche Brand-Farben, Diktattext fett + brand-blau). Spiegelt web MicButton.
// existing = vorbestehender Feldtext (gedimmt angezeigt); onResult(text, send).
@Composable
fun DictationOverlay(existing: String, title: String, onDismiss: () -> Unit, onResult: (String, Boolean) -> Unit) {
    val ctx = LocalContext.current
    var text by remember { mutableStateOf("") }        // erkannter Text (final o. partial)
    var listening by remember { mutableStateOf(false) }
    var granted by remember {
        mutableStateOf(ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED)
    }
    val available = remember { SpeechRecognizer.isRecognitionAvailable(ctx) }

    val recognizer = remember {
        if (available) SpeechRecognizer.createSpeechRecognizer(ctx) else null
    }
    fun intent() = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, localeTag(I18n.lang))
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
    }
    fun start() {
        val r = recognizer ?: return
        text = ""; listening = true
        r.startListening(intent())
    }

    DisposableEffect(recognizer) {
        recognizer?.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() { listening = false }
            override fun onError(error: Int) { listening = false }
            override fun onPartialResults(partial: Bundle?) {
                partial?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.let { if (it.isNotBlank()) text = it }
            }
            override fun onResults(results: Bundle?) {
                results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.let { if (it.isNotBlank()) text = it }
                listening = false
            }
            override fun onEvent(eventType: Int, params: Bundle?) {}
        })
        onDispose { recognizer?.destroy() }
    }

    val permLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        granted = ok; if (ok) start()
    }
    LaunchedEffect(Unit) {
        if (!granted) permLauncher.launch(Manifest.permission.RECORD_AUDIO) else start()
    }

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Column(
            Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surface).padding(24.dp),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Column(Modifier.fillMaxWidth()) {
                Text(title, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                // Hinweis „jetzt sprechen" anzeigen, sobald das Mikro bereit ist (nicht nur während
                // aktiver Erkennung) — sonst bleibt der Hinweis auf manchen Geräten unsichtbar.
                Text(if (granted && available) I18n.t("dict.listening") else " ",
                    style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
            }
            Box(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()), contentAlignment = Alignment.Center) {
                Column(Modifier.fillMaxWidth()) {
                    if (existing.isNotBlank()) {
                        Text(existing, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f))
                    }
                    if (!granted && !available) {
                        Text(I18n.t("dict.permDenied"), color = MaterialTheme.colorScheme.error)
                    } else {
                        Text(
                            text.ifBlank { "…" },
                            style = MaterialTheme.typography.headlineSmall,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                }
            }
            // Aktionen: Abbrechen · Noch mal · Bearbeiten · Senden (alle gleich breit).
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                DictButton(Modifier.weight(1f), Icons.Filled.Close, I18n.t("common.cancel")) { onDismiss() }
                DictButton(Modifier.weight(1f), Icons.Filled.Refresh, I18n.t("dict.retry")) { start() }
                TextButton(onClick = { if (text.isNotBlank()) onResult(text, false) }, modifier = Modifier.weight(1f), enabled = text.isNotBlank()) {
                    Text(I18n.t("dict.edit"), maxLines = 1)
                }
                DictButton(Modifier.weight(1f), Icons.AutoMirrored.Filled.Send, I18n.t("chat.send"), enabled = text.isNotBlank(), tint = MaterialTheme.colorScheme.primary) {
                    if (text.isNotBlank()) onResult(text, true)
                }
            }
        }
    }
}

@Composable
private fun DictButton(
    modifier: Modifier, icon: androidx.compose.ui.graphics.vector.ImageVector, label: String,
    enabled: Boolean = true, tint: Color = Color.Unspecified, onClick: () -> Unit,
) {
    TextButton(onClick = onClick, modifier = modifier, enabled = enabled) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(icon, contentDescription = label, tint = if (tint == Color.Unspecified) MaterialTheme.colorScheme.onSurfaceVariant else tint)
            Text(label, style = MaterialTheme.typography.labelSmall, maxLines = 1)
        }
    }
}
