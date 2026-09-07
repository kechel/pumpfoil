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
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.LinearProgressIndicator
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
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import androidx.compose.material3.Switch
import androidx.compose.runtime.LaunchedEffect

/**
 * Ein verknüpfbarer Anbieter. `id` ist der Anzeige-/Zustandsschlüssel, `pfad` der Pfad beim
 * Server — die beiden unterscheiden sich nur bei COROS.
 *
 * ZWEI SACHEN WAREN HIER FALSCH (gefunden am 07.09.2026):
 *  * COROS zeigte auf `/api/integrations/coros/…` — das ist der PARTNER-Weg, für den uns der
 *    Vertrag fehlt; der Endpunkt meldet `available: false`. COROS war aus der App also nie
 *    verbindbar, obwohl es im Web längst läuft. Der funktionierende Weg ist `coros/mcp`.
 *  * Der Kommentar sagte „Push-basiert: kein manueller Import" — genau umgekehrt: der MCP-Weg
 *    kann NICHT pushen (nur abholen), während Polar seit dem 07.09. wirklich pusht.
 */
private data class Provider(
    val id: String,
    val label: String,
    val canSync: Boolean,
    val logo: Int? = null,
    val apiPath: String? = null,
) {
    val pfad: String get() = apiPath ?: id
}

private val PROVIDERS = listOf(
    Provider("polar", "Polar", canSync = true, logo = R.drawable.polar_logo),
    Provider("coros", "COROS", canSync = true, apiPath = "coros/mcp"),
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
    // Stand des laufenden Imports (nur einer zur Zeit, `busy` sagt welcher).
    var stand by remember { mutableStateOf<Api.SyncStand?>(null) }
    // Zählt fertige Importe. Die Sportart-Liste hängt daran und holt sich neu — sonst erschiene
    // ein beim Import NEU entdeckter Modus erst nach einem Neustart der App.
    var fertigZaehler by remember { mutableStateOf(0) }

    suspend fun refresh() {
        for (p in PROVIDERS) {
            status[p.id] = try { Api.integrationStatus(p.pfad) } catch (_: Exception) { Api.IntegrationStatus() }
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
                            st.linked && p.id == "polar" -> I18n.t("accounts.polarNote")
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
                                                val url = Api.integrationAuthorizeUrl(p.pfad)
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
                                        // Der Import läuft serverseitig im Hintergrund weiter,
                                        // nachdem `POST /sync` zurückkam (sonst Proxy-Timeout).
                                        // Der Aufruf stößt also nur an; danach wird der Stand
                                        // abgefragt, bis er fertig ist.
                                        onClick = {
                                            busy = p.id
                                            stand = Api.SyncStand(laeuft = true)
                                            scope.launch {
                                                syncMsg = try {
                                                    Api.integrationSync(p.pfad)
                                                    var letzter: Api.SyncStand? = null
                                                    while (true) {
                                                        val st2 = Api.syncProgress(p.pfad)
                                                        letzter = st2
                                                        if (!st2.laeuft) break
                                                        stand = st2
                                                        delay(1500)
                                                    }
                                                    ergebnisText(letzter)
                                                } catch (_: Exception) {
                                                    I18n.t("accounts.importError")
                                                }
                                                stand = null
                                                fertigZaehler += 1
                                                refresh(); busy = null
                                            }
                                        },
                                    ) { Text(I18n.t("accounts.import")) }
                                }
                                OutlinedButton(
                                    enabled = busy == null,
                                    onClick = {
                                        busy = p.id
                                        scope.launch { try { Api.integrationUnlink(p.pfad) } catch (_: Exception) {}; refresh(); busy = null }
                                    },
                                ) { Text(I18n.t("accounts.disconnect")) }
                            }
                        }
                        stand?.let { fort -> if (busy == p.id && fort.laeuft) Fortschritt(fort) }
                        // Nur COROS: welchen Modus man auf der Uhr wählt, und was der Export
                        // NICHT liefert. Pumpfoil gibt es auf keiner COROS-Uhr als Sportart.
                        if (p.id == "coros" && st.linked) {
                            Text(I18n.t("accounts.coros.best"), style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(top = 8.dp))
                            Text(I18n.t("accounts.coros.limit"), style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(top = 4.dp))
                        }
                        if (st.linked) SportAuswahl(p.pfad, fertigZaehler)
                    }
                }
            }
            XiaomiHinweis()
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

/** Balken samt „x von y Trainings" — dasselbe Bild wie in der PWA. */
@Composable
private fun Fortschritt(st: Api.SyncStand) {
    Column(Modifier.fillMaxWidth().padding(top = 8.dp)) {
        if (st.gesamt > 0) {
            LinearProgressIndicator(
                progress = { st.fertig.toFloat() / st.gesamt.toFloat() },
                modifier = Modifier.fillMaxWidth(),
            )
            Text(
                I18n.t("accounts.sync.progress")
                    .replace("{fertig}", st.fertig.toString())
                    .replace("{gesamt}", st.gesamt.toString()),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp),
            )
        } else {
            LinearProgressIndicator(Modifier.fillMaxWidth())
            if (!st.schritt.isNullOrBlank()) {
                Text(st.schritt, style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 4.dp))
            }
        }
    }
}

/**
 * Der Schlusssatz eines Imports.
 *
 * Vorher zeigte die App die ROHE englische Servermeldung („no new exercises") — genau das hat Jan
 * am 07.09.2026 in der PWA gemeldet. Zählt der Server die Gründe mit (Suunto), sind sie
 * aussagekräftiger als eine nackte „übersprungen"-Zahl: „3 zu kurz" sagt, was zu tun ist,
 * „3 übersprungen" nicht. Codes aus `suunto._grund_code`; unbekannte werden weggelassen statt
 * roh gezeigt.
 */
private val GRUND_KEYS = listOf(
    "kein_gps" to "noGps", "doppelt" to "dupe", "zu_kurz" to "tooShort",
    "gefiltert" to "filtered", "spaeter" to "later", "fehler" to "error",
)

private fun ergebnisText(st: Api.SyncStand?): String {
    val d = st?.daten
    val gruende = GRUND_KEYS.mapNotNull { (code, key) ->
        val n = d?.reasons?.get(code) ?: 0
        if (n > 0) I18n.t("accounts.sync.why.$key").replace("{n}", n.toString()) else null
    }
    if (gruende.isNotEmpty()) {
        val teile = mutableListOf<String>()
        val imp = d?.imported ?: 0
        if (imp > 0) teile.add(I18n.t("accounts.sync.imported").replace("{n}", imp.toString()))
        teile.addAll(gruende)
        return teile.joinToString(" \u00b7 ")
    }
    // Ohne Gründe beide Zahlen nennen — bei COROS sind die übersprungenen die schon vorhandenen
    // Trainings, und „9 importiert" allein ließe offen, was mit den anderen war.
    val imp = d?.imported ?: 0
    val skip = d?.skipped ?: 0
    if (imp > 0 || skip > 0) {
        return I18n.t("accounts.importResult")
            .replace("{imported}", imp.toString())
            .replace("{skipped}", skip.toString())
    }
    return I18n.t("accounts.sync.nothingNew")
}

/**
 * Xiaomi/Redmi haben keine eigene Schnittstelle für uns (Xiaomis Health-Cloud ist nur für Partner
 * offen, und eine App auf der Uhr lässt Xiaomi nicht zu). Der Umweg ist aber offiziell: Xiaomi und
 * Suunto haben ihre Apps 2024 miteinander verbunden, weltweit außer China. Deshalb steht hier eine
 * Anleitung und keine Xiaomi-Verknüpfung — Spiegel der PWA (`db914137`).
 */
@Composable
private fun XiaomiHinweis() {
    Card(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Column(Modifier.padding(14.dp)) {
            Text(I18n.t("accounts.xiaomi.title"), style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold)
            Text(I18n.t("accounts.xiaomi.hint"), style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = 4.dp))
            listOf("accounts.xiaomi.step1", "accounts.xiaomi.step2", "accounts.xiaomi.step3")
                .forEachIndexed { i, key ->
                    Row(Modifier.padding(top = 6.dp)) {
                        Text("${i + 1}.", style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(end = 6.dp))
                        Text(I18n.t(key), style = MaterialTheme.typography.bodySmall)
                    }
                }
            Text(I18n.t("accounts.xiaomi.note"), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 8.dp))
        }
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


/**
 * Welche Sportart-Modi eines verknüpften Kontos importiert werden.
 *
 * Für Pumpfoil gibt es auf keiner Uhr einen eigenen Modus, also stellen die Leute irgendetwas
 * ein — an unseren eigenen Daten nachgezählt kamen acht Suunto-Sessions als „cycling" herein und
 * waren echtes Pumpfoilen. Eine feste Liste erlaubter Sportarten wäre deshalb ein
 * Verlustgeschäft. Der Server merkt sich, was das Konto tatsächlich liefert; hier kann man
 * abwählen. Neu Auftauchendes ist immer ausgewählt, bis der Nutzer etwas anderes sagt.
 *
 * Angezeigt werden nur Modi mit Ortung — ein Hallenmodus wäre hier eine Zeile ohne Sinn.
 */
@Composable
private fun SportAuswahl(pfad: String, neuLaden: Int) {
    val scope = rememberCoroutineScope()
    var sports by remember(pfad) { mutableStateOf<List<Api.ImportSport>?>(null) }

    LaunchedEffect(pfad, neuLaden) {
        sports = try { Api.importSports(pfad) } catch (_: Exception) { emptyList() }
    }

    val liste = sports ?: return
    Column(Modifier.padding(top = 10.dp)) {
        Text(I18n.t("accounts.sports.title"), style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold)
        Text(I18n.t("accounts.sports.hint"), style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (liste.isEmpty()) {
            Text(I18n.t("accounts.sports.none"), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            // Die Schalter brauchen Luft: ohne Abstand berühren sich die Kapseln fast und die
            // Liste liest sich als ein Block (Jan, 07.09.2026, am iOS-Screenshot gemeldet — hier
            // war es genauso). Trenner dazu, damit man Zeile und Schalter zusammen liest.
            liste.forEachIndexed { i, sp ->
                if (i > 0) HorizontalDivider()
                Row(verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                    Column(Modifier.weight(1f)) {
                        Text(sp.label, style = MaterialTheme.typography.bodyMedium)
                        Text("${sp.gesehen}\u00d7", style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Switch(
                        checked = sp.importieren,
                        onCheckedChange = { an ->
                            // Erst anzeigen, dann speichern — ein Schalter soll sofort reagieren.
                            sports = liste.map { if (it.sport_key == sp.sport_key) it.copy(importieren = an) else it }
                            scope.launch {
                                try { sports = Api.setImportSports(pfad, mapOf(sp.sport_key to an)) }
                                catch (_: Exception) {}
                            }
                        },
                    )
                }
            }
        }
    }
}
