package org.pumpfoil.app

import android.content.Intent
import android.net.Uri
import androidx.compose.ui.platform.LocalContext
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material3.OutlinedButton
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

// Garmin-Uhr verbinden — beide Wege (spiegelt web ClaimFromWatch + GenerateCode):
//  - Reverse: der auf der Uhr angezeigte Code wird hier eingegeben (pair-claim).
//  - Forward: hier einen Code erzeugen und in der Garmin-Connect-App unter Pumpfoil eintragen.
/** Store-Seite der Uhr-App — dieselbe URL wie im Web (ConnectIqButton.tsx). */
/** Auch vom Anleitungs-Bildschirm benutzt — die URL steht genau einmal. */
const val CONNECT_IQ_URL = "https://apps.garmin.com/apps/9a2a753e-b52f-4587-aee4-900caf5cb351"

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GarminPairScreen(onBack: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var code by remember { mutableStateOf("") }
    var claimBusy by remember { mutableStateOf(false) }
    var claimMsg by remember { mutableStateOf<String?>(null) }
    var genBusy by remember { mutableStateOf(false) }
    var genCode by remember { mutableStateOf<String?>(null) }
    var genMsg by remember { mutableStateOf<String?>(null) }

    Scaffold(topBar = {
        TopAppBar(
            title = { Text(I18n.t("garmin.title")) },
            navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Zurück") } },
        )
    }) { pad ->
        Column(Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
            // SCHRITT 0 — der hier fehlte. Beide Karten unten setzen voraus, dass die App schon
            // auf der Uhr liegt („Pumpfoil auf der Uhr oeffnen"). Wie sie dorthin kommt, stand
            // nirgends: bei Garmin kommt sie NICHT aus dem Play Store, sondern aus dem Connect IQ
            // Store ueber die Garmin-Connect-App. Genau daran ist ein Nutzer haengengeblieben
            // („je n'arrive pas a installer l'application sur ma garmin", 27.08., aus der
            // Android-App heraus geschrieben). Die Web-App erklaert das laengst — die App nicht.
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text(I18n.t("garmin.installTitle"), style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(4.dp))
                    Text(I18n.t("garmin.installHelp"), style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(12.dp))
                    OutlinedButton(onClick = {
                        ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(CONNECT_IQ_URL)))
                    }) { Text(I18n.t("garmin.installBtn")) }
                }
            }

            Spacer(Modifier.height(16.dp))

            // Reverse: Code von der Uhr eingeben.
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text(I18n.t("garmin.claimTitle"), style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(4.dp))
                    Text(I18n.t("garmin.claimHelp"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = code,
                        onValueChange = { code = it.uppercase() },
                        singleLine = true,
                        label = { Text(I18n.t("garmin.codePlaceholder")) },
                        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
                    )
                    Spacer(Modifier.height(12.dp))
                    Button(
                        enabled = !claimBusy && code.trim().length >= 4,
                        onClick = {
                            scope.launch {
                                claimBusy = true; claimMsg = null
                                try { Api.pairClaim(code); claimMsg = I18n.t("garmin.claimOk"); code = "" }
                                catch (e: Exception) { claimMsg = e.message ?: "?" }
                                finally { claimBusy = false }
                            }
                        },
                    ) { Text(if (claimBusy) "…" else I18n.t("garmin.claimBtn")) }
                    claimMsg?.let {
                        Spacer(Modifier.height(8.dp))
                        Text(it, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }

            Spacer(Modifier.height(16.dp))

            // Forward: Code erzeugen -> in Garmin-Connect-App eintragen.
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text(I18n.t("garmin.genTitle"), style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(4.dp))
                    Text(I18n.t("garmin.genHelp"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(12.dp))
                    Button(
                        enabled = !genBusy,
                        onClick = {
                            scope.launch {
                                genBusy = true; genMsg = null
                                try { genCode = Api.generatePairingCode().code }
                                catch (e: Exception) { genMsg = e.message ?: "?" }
                                finally { genBusy = false }
                            }
                        },
                    ) { Text(if (genBusy) "…" else I18n.t("garmin.genBtn")) }
                    genCode?.let {
                        Spacer(Modifier.height(12.dp))
                        Text(it, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.primary)
                    }
                    genMsg?.let {
                        Spacer(Modifier.height(8.dp))
                        Text(it, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
}
