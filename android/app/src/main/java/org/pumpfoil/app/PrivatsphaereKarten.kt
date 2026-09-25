package org.pumpfoil.app

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import kotlinx.serialization.json.*

/*
 * Die drei Privatsphaere-Karten der Einstellungen, portiert aus der PWA (Settings.tsx,
 * PublicProfileCard.tsx) am 25.09.2026 — bis dahin gab es keine davon in der App:
 *
 *  - OEFFENTLICHE FOILER-SEITE: Hauptschalter + Einzelschalter. Der SERVER entscheidet, was auf
 *    der Seite landet (community.foiler_profil liest genau diese Werte); die Karte schreibt sie
 *    nur und filtert nicht selbst, sonst gaebe es zwei Wahrheiten. Die Seite selbst gibt es nur
 *    im Web, der Link oeffnet sie im Browser.
 *  - ORT VERBERGEN als Voreinstellung fuer ALLE eigenen Aufnahmen, rueckwirkend.
 *  - GETEILTE AUFNAHMEN: jede Aufnahme mit aktivem Teilen-Link, Knopf zum Zuruecknehmen. Die
 *    Karte erscheint nicht, wenn nichts geteilt ist. Wann ein Link erzeugt oder ob er je geoeffnet
 *    wurde, wissen wir nicht — dafuer braeuchte es ein Zugriffsprotokoll, und das waere Tracking.
 */

private val PUBPROF_FELDER = listOf(
    "join", "watch", "foil", "homespot", "records", "media", "spots", "sessions", "titles", "channel",
)

@Composable
fun OeffentlicheSeiteKarte(onSaved: () -> Unit) {
    val scope = rememberCoroutineScope()
    val ctx = LocalContext.current
    var werte by remember { mutableStateOf<Map<String, Boolean>?>(null) }
    var eigeneId by remember { mutableStateOf(0) }
    LaunchedEffect(Unit) {
        try {
            val p = Api.settings()["public_profile"] as? JsonObject
            // Fehlt ein Wert, gilt er als an — dieselbe Vorgabe wie settings.DEFAULTS.
            werte = (listOf("enabled") + PUBPROF_FELDER).associateWith { k ->
                p?.get(k)?.jsonPrimitive?.booleanOrNull != false
            }
        } catch (_: Exception) {}
        eigeneId = try { Api.me().id } catch (_: Exception) { 0 }
    }
    val w = werte ?: return
    fun setzen(k: String, v: Boolean) {
        val alt = w
        val neu = w + (k to v)
        werte = neu                              // sofort sichtbar, der Server bestaetigt danach
        scope.launch {
            try {
                Api.saveSettings(buildJsonObject {
                    put("public_profile", buildJsonObject { neu.forEach { (a, b) -> put(a, b) } })
                })
                onSaved()
            } catch (_: Exception) { werte = alt }
        }
    }
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp)) {
            Text(I18n.t("pubprof.title"), style = MaterialTheme.typography.titleMedium)
            Text(I18n.t("pubprof.hint"), style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp, bottom = 6.dp))
            Haken(I18n.t("pubprof.enabled"), w["enabled"] == true) { setzen("enabled", it) }
            // Die Einzelschalter nur, wenn die Seite ueberhaupt an ist.
            if (w["enabled"] == true) {
                HorizontalDivider(Modifier.padding(vertical = 8.dp))
                Text(I18n.t("pubprof.fields"), style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                PUBPROF_FELDER.forEach { k ->
                    Haken(I18n.t("pubprof.$k"), w[k] == true) { setzen(k, it) }
                }
                if (eigeneId > 0) {
                    TextButton(onClick = {
                        ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("${Api.BASE}/foiler/$eigeneId")))
                    }) { Text(I18n.t("pubprof.view")) }
                }
            }
        }
    }
}

@Composable
fun OrtVerbergenKarte(onSaved: () -> Unit) {
    val scope = rememberCoroutineScope()
    var an by remember { mutableStateOf<Boolean?>(null) }
    var busy by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        an = try { Api.settings()["hide_location"]?.jsonPrimitive?.booleanOrNull ?: false } catch (_: Exception) { false }
    }
    val wert = an ?: return
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp)) {
            Text(I18n.t("hideloc.title"), style = MaterialTheme.typography.titleMedium)
            Text(I18n.t("hideloc.hint"), style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp, bottom = 6.dp))
            Haken(I18n.t("hideloc.switch"), wert, aktiv = !busy) { neu ->
                busy = true
                scope.launch {
                    try {
                        Api.saveSettings(buildJsonObject { put("hide_location", neu) })
                        an = neu; onSaved()
                    } catch (_: Exception) {}
                    busy = false
                }
            }
            // Ausdruecklich, was NICHT verborgen wird — ein Schalter, bei dem man raten muss, wie
            // weit er reicht, ist schlimmer als keiner.
            Text(I18n.t("hideloc.scope"), style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp))
            Text(I18n.t("hideloc.single"), style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 2.dp))
        }
    }
}

@Composable
fun GeteilteAufnahmenKarte(onOpenSession: ((Int) -> Unit)? = null) {
    val scope = rememberCoroutineScope()
    var zeilen by remember { mutableStateOf<List<GeteilterLink>?>(null) }
    var busy by remember { mutableStateOf<Int?>(null) }
    LaunchedEffect(Unit) { zeilen = try { Api.geteilteLinks() } catch (_: Exception) { emptyList() } }
    val liste = zeilen ?: return
    if (liste.isEmpty()) return
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp)) {
            Text(I18n.t("shared.title"), style = MaterialTheme.typography.titleMedium)
            Text(I18n.t("shared.hint"), style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp, bottom = 6.dp))
            liste.forEach { z ->
                Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f).then(
                        if (onOpenSession != null) Modifier.clickable { onOpenSession(z.id) } else Modifier)) {
                        Text(z.startedAt?.let { prettyDate(it, z.tz) } ?: "#${z.id}", fontWeight = FontWeight.Medium)
                        z.placeName?.let {
                            Text(it, style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    OutlinedButton(enabled = busy != z.id, onClick = {
                        busy = z.id
                        scope.launch {
                            try {
                                Api.revokeShareLink(z.id)
                                // Ohne Nachladen: die Zeile verschwindet sofort, das ist die Rueckmeldung.
                                zeilen = zeilen?.filter { it.id != z.id }
                            } catch (_: Exception) {}
                            busy = null
                        }
                    }) { Text(I18n.t("shared.revoke")) }
                }
            }
        }
    }
}

@Composable
private fun Haken(text: String, wert: Boolean, aktiv: Boolean = true, onChange: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(enabled = aktiv) { onChange(!wert) },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Checkbox(checked = wert, onCheckedChange = { onChange(it) }, enabled = aktiv)
        Text(text, style = MaterialTheme.typography.bodyMedium)
    }
}


/**
 * KI-Zugang (MCP) — die Adresse zum Eintragen und wer gerade Zugriff hat. Portiert aus der PWA
 * (LinkedAccounts.tsx McpCard). Die Liste ist der wichtigere Teil: man kann nur zumachen, was man
 * sieht. Ein schon ausgegebenes Token laesst sich nicht zurueckholen, es laeuft nur ab — das sagt
 * der Hinweis, statt „sofort gesperrt" zu behaupten.
 */
@Composable
fun McpKarte() {
    val scope = rememberCoroutineScope()
    val clipboard = androidx.compose.ui.platform.LocalClipboardManager.current
    var st by remember { mutableStateOf<McpStatus?>(null) }
    var busy by remember { mutableStateOf<String?>(null) }
    var kopiert by remember { mutableStateOf(false) }
    suspend fun laden() { st = try { Api.mcpStatus() } catch (_: Exception) { st } }
    LaunchedEffect(Unit) { laden() }
    val s = st ?: return
    Spacer(Modifier.height(12.dp))
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp)) {
            Text(I18n.t("mcp.cardTitle"), style = MaterialTheme.typography.titleMedium)
            Text(I18n.t("mcp.cardHint"), style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp, bottom = 8.dp))
            Text(I18n.t("mcp.cardUrlLabel"), style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(s.url, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium,
                    fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace)
                TextButton(onClick = {
                    clipboard.setText(androidx.compose.ui.text.AnnotatedString(s.url)); kopiert = true
                }) { Text(I18n.t(if (kopiert) "mcp.copied" else "mcp.copy")) }
            }
            Text(I18n.t("mcp.cardScope"), style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = 6.dp))
            if (s.verbunden.isEmpty()) {
                Text(I18n.t("mcp.none"), style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                Text(I18n.t("mcp.connectedTitle"), style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                s.verbunden.forEach { v ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(v.name, fontWeight = FontWeight.Medium)
                            val seit = I18n.t("mcp.since").replace("{d}", shortDateFull(v.seit) ?: v.seit)
                            val zuletzt = v.zuletzt?.let { " · " + I18n.t("mcp.last").replace("{d}", shortDateFull(it) ?: it) } ?: ""
                            Text(seit + zuletzt, style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        OutlinedButton(enabled = busy != v.clientId, onClick = {
                            busy = v.clientId
                            scope.launch {
                                try { Api.mcpVerbindungSchliessen(v.clientId); laden() } catch (_: Exception) {}
                                busy = null
                            }
                        }) { Text(I18n.t("mcp.revoke")) }
                    }
                }
                Text(I18n.t("mcp.revokeNote"), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
            }
        }
    }
}
