package org.pumpfoil.app

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.Button
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import kotlinx.coroutines.launch

private data class Provider(val id: String, val label: String, val canSync: Boolean, val logo: Int? = null)

private val PROVIDERS = listOf(
    Provider("polar", "Polar", canSync = true, logo = R.drawable.polar_logo),
    Provider("coros", "COROS", canSync = false),   // Push-basiert: kein manueller Import
    Provider("suunto", "Suunto", canSync = true, logo = R.drawable.suunto_logo),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LinkedAccountsScreen(onBack: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val status = remember { mutableStateMapOf<String, Api.IntegrationStatus>() }
    var busy by remember { mutableStateOf<String?>(null) }
    var syncMsg by remember { mutableStateOf<String?>(null) }

    suspend fun refresh() {
        for (p in PROVIDERS) {
            status[p.id] = try { Api.integrationStatus(p.id) } catch (_: Exception) { Api.IntegrationStatus() }
        }
    }
    // Beim (Wieder-)Erscheinen laden — fängt die Rückkehr aus dem OAuth-Browser ab.
    val owner = LocalLifecycleOwner.current
    DisposableEffect(owner) {
        val obs = LifecycleEventObserver { _, e -> if (e == Lifecycle.Event.ON_RESUME) scope.launch { refresh() } }
        owner.lifecycle.addObserver(obs)
        onDispose { owner.lifecycle.removeObserver(obs) }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(I18n.t("accounts.title")) },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Zurück") }
                },
            )
        },
    ) { pad ->
        Column(Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
            Text(I18n.t("accounts.sub"), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Box(Modifier.padding(top = 12.dp))
            PROVIDERS.forEach { p ->
                val st = status[p.id]
                if (st != null && !st.available && !st.linked) {
                    // Nicht konfiguriert -> als "bald verfügbar" grau anzeigen.
                    ProviderCard(p.label, sub = I18n.t("accounts.notAvailable"), logo = p.logo) {}
                } else if (st != null) {
                    ProviderCard(
                        title = p.label,
                        logo = p.logo,
                        sub = when {
                            st.linked && p.id == "coros" -> I18n.t("accounts.corosNote")
                            st.linked -> I18n.t("accounts.connected")
                            else -> I18n.t("accounts.sub")
                        },
                        connected = st.linked,
                    ) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (!st.linked) {
                                Button(
                                    enabled = busy == null,
                                    onClick = {
                                        busy = p.id
                                        scope.launch {
                                            try {
                                                val url = Api.integrationAuthorizeUrl(p.id)
                                                ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                                            } catch (_: Exception) {}
                                            busy = null
                                        }
                                    },
                                ) { Text(I18n.t("accounts.connect")) }
                            } else {
                                if (p.canSync) {
                                    Button(
                                        enabled = busy == null,
                                        onClick = {
                                            busy = p.id
                                            scope.launch {
                                                val r = try { Api.integrationSync(p.id) } catch (_: Exception) { null }
                                                syncMsg = when {
                                                    r == null -> I18n.t("accounts.importError")
                                                    !r.message.isNullOrBlank() -> r.message
                                                    else -> I18n.t("accounts.importResult")
                                                        .replace("{imported}", r.imported.toString())
                                                        .replace("{skipped}", r.skipped.toString())
                                                }
                                                refresh(); busy = null
                                            }
                                        },
                                    ) { Text(I18n.t("accounts.import")) }
                                }
                                OutlinedButton(
                                    enabled = busy == null,
                                    onClick = {
                                        busy = p.id
                                        scope.launch { try { Api.integrationUnlink(p.id) } catch (_: Exception) {}; refresh(); busy = null }
                                    },
                                ) { Text(I18n.t("accounts.disconnect")) }
                            }
                        }
                    }
                }
            }
        }
    }

    syncMsg?.let { m ->
        AlertDialog(
            onDismissRequest = { syncMsg = null },
            confirmButton = { TextButton(onClick = { syncMsg = null }) { Text("OK") } },
            title = { Text(I18n.t("accounts.import")) },
            text = { Text(m) },
        )
    }
}

@Composable
private fun ProviderCard(title: String, sub: String, connected: Boolean = false, logo: Int? = null, actions: @Composable () -> Unit) {
    Card(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (logo != null) {
                    Image(painter = painterResource(logo), contentDescription = title, contentScale = ContentScale.Fit,
                        modifier = Modifier.height(22.dp).padding(end = 8.dp))
                }
                Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                if (connected) Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            }
            Text(sub, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Box(Modifier.padding(top = 8.dp)); actions()
        }
    }
}
