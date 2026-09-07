package org.pumpfoil.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * Ein Foil im Einzelnen: die Community-Rekorde MIT DIESEM Fluegel und alle Sessions, die damit
 * aufgezeichnet wurden — ueber alle Fahrer, nicht nur die eigenen.
 *
 * Kam als Nutzer-Vorschlag (04.09.2026): „Why not make the foil model clickable, so clicking it
 * shows all sessions recorded with that specific front wing?" In der PWA gibt es die Seite seit
 * dem 04.09.; in den Apps fehlte sie — aufgefallen erst am 07.09., weil docs/PARITY-AUDIT.md
 * teils vom 17.08. war.
 *
 * Serverseitig brauchte es keinen neuen Endpunkt: die Rekorde kennen das synthetische Band
 * `foil:<id>` (s. community._band_filter), die Sessionliste den Parameter `foil_id`.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FoilDetailScreen(foil: FoilStat, onBack: () -> Unit, onOpen: (Int) -> Unit) {
    var records by remember(foil.foilId) { mutableStateOf<Map<String, PeriodRecords>?>(null) }
    var sessions by remember(foil.foilId) { mutableStateOf<List<CommunityItem>>(emptyList()) }
    var mehr by remember(foil.foilId) { mutableStateOf(true) }
    var laedt by remember(foil.foilId) { mutableStateOf(false) }
    val seite = 20

    val name = listOf(foil.brand, foil.model, foil.size).filter { it.isNotBlank() }.joinToString(" ")

    LaunchedEffect(foil.foilId) {
        // Rekorde bewusst mit accelOnly = false: bei einem einzelnen Foil ist der Topf klein, und
        // ein GPS-only-Lauf ist hier immer noch die beste bekannte Marke.
        records = try {
            Api.communityRecords(accelOnly = false, foilBand = "foil:${foil.foilId}")
        } catch (_: Exception) { emptyMap() }
    }

    suspend fun seiteHolen() {
        if (laedt || !mehr) return
        laedt = true
        // ALLE Fahrer, nicht nur die eigenen: der Vorschlag lautete „all sessions recorded with
        // that specific front wing", und die eigene Liste ist bei fremden Foils leer.
        val teil = try {
            Api.communitySessions(limit = seite, offset = sessions.size, accelOnly = false,
                                  sport = "pumpfoil", foilId = foil.foilId)
        } catch (_: Exception) { emptyList() }
        sessions = sessions + teil
        mehr = teil.size == seite
        laedt = false
    }

    LaunchedEffect(foil.foilId) { seiteHolen() }

    Scaffold(topBar = {
        TopAppBar(
            title = { Text(name, style = MaterialTheme.typography.titleMedium) },
            navigationIcon = {
                IconButton(onClick = onBack) { Icon(Icons.Filled.ArrowBack, contentDescription = null) }
            },
        )
    }) { pad ->
        LazyColumn(Modifier.padding(pad).fillMaxSize()) {
            item {
                Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                    val teile = buildList {
                        foil.aspectRatio?.let { add("AR %.1f".format(it)) }
                        add(I18n.t("foilDetail.community")
                            .replace("{sessions}", foil.sessions.toString())
                            .replace("{users}", foil.users.toString()))
                    }
                    Text(teile.joinToString(" · "), style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            item {
                Text(I18n.t("foilDetail.records"), style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp))
            }
            item {
                val r = records
                when {
                    r == null -> Column(Modifier.fillMaxWidth().padding(16.dp),
                        verticalArrangement = Arrangement.Center) { CircularProgressIndicator() }
                    else -> RecordGrid(r["all"], showSpot = true, onOpen = onOpen,
                        modifier = Modifier.padding(horizontal = 12.dp))
                }
            }
            item {
                Text(I18n.t("foilDetail.sessions"), style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp))
            }
            if (sessions.isEmpty() && !mehr) {
                item {
                    Text(I18n.t("foilDetail.none"), Modifier.padding(16.dp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            items(sessions) { c ->
                CommunityItemRow(c, Modifier.padding(horizontal = 12.dp, vertical = 5.dp)) { onOpen(c.id) }
            }
            if (mehr) {
                item {
                    // Fuehler zum Nachladen: sobald diese Zeile gezeichnet wird, kommt die
                    // naechste Seite (dieselbe Mechanik wie in der Sessionliste).
                    LaunchedEffect(sessions.size) { seiteHolen() }
                    Column(Modifier.fillMaxWidth().padding(16.dp),
                        verticalArrangement = Arrangement.Center) { CircularProgressIndicator() }
                }
            }
        }
    }
}
