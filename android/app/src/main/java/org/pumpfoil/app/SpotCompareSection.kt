package org.pumpfoil.app

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

// Spot-Vergleich unter der Karte — dieselbe Sache wie SpotCompare.tsx in der PWA: je Kennzahl
// der fuehrende Spot, darunter der eigene/gewaehlte Spot mit Wert und Rang. Zwei der acht
// Kennzahlen sind Einzel-Rekorde (weitester Lauf, Topspeed) — dort steht zusaetzlich, WER ihn
// gefahren hat und wann, und die Karte fuehrt zu genau dieser Session. Die Aggregate fuehren
// zur Session-Liste des Spots.
//
// Zeitfenster wie bei den Community-Rekorden. accelOnly bleibt false (wie im Web), sonst
// verschwinden GPS-only-Spots aus dem Vergleich.
private val PERIODEN = listOf("today" to "period.today", "10d" to "period.10d",
    "30d" to "period.30d", "365d" to "period.365d", "all" to "period.all")

private class Kennzahl(
    val titel: String,
    val wert: (SpotAgg) -> Double,
    val zeige: (Double) -> String,
    val halter: ((SpotAgg) -> SpotRecHolder?)? = null,
)

private fun dauer(s: Double): String {
    val m = Math.round(s / 60.0).toInt()
    return if (m >= 60) "${m / 60}h ${m % 60}m" else "${m}m"
}

@Composable
fun SpotCompareSection(onOpenSession: (Int) -> Unit, onOpenSpot: (String) -> Unit) {
    var period by remember { mutableStateOf("10d") }
    var daten by remember { mutableStateOf<List<SpotAgg>?>(null) }
    var sel by remember { mutableStateOf("") }        // Vergleichsspot (place_name)
    var offen by remember { mutableStateOf(false) }

    // Beim Wechsel des Zeitfensters die alten Daten NICHT leeren (wie im Web): sonst klappt der
    // Abschnitt kurz zusammen. Spaete Antworten eines ueberholten Aufrufs verwerfen.
    LaunchedEffect(period) {
        val angefragt = period
        val neu = try { Api.spotCompare(angefragt) } catch (_: Exception) { emptyList() }
        if (angefragt == period) daten = neu
    }
    // Vorbelegung: der eigene Homespot, sobald bekannt.
    LaunchedEffect(Unit) {
        if (sel.isEmpty()) {
            val h = try { Api.settings()["homespot"]?.jsonPrimitive?.contentOrNull } catch (_: Exception) { null }
            if (!h.isNullOrBlank()) sel = h
        }
    }

    val kennzahlen = listOf(
        Kennzahl(I18n.t("leader.mostSessions"), { it.sessions.toDouble() }, { "%.0f".format(it) }),
        Kennzahl(I18n.t("leader.mostRuns"), { it.runs.toDouble() }, { "%.0f".format(it) }),
        Kennzahl(I18n.t("leader.mostPumps"), { it.pumps.toDouble() }, { "%.0f".format(it) }),
        Kennzahl(I18n.t("spotcmp.foilers"), { it.foilers.toDouble() }, { "%.0f".format(it) }),
        Kennzahl(I18n.t("spotcmp.distance"), { it.foilingKm }, { "%.1f km".format(it) }),
        Kennzahl(I18n.t("rec.sessionTime"), { it.onfoilS.toDouble() }, { dauer(it) }),
        Kennzahl(I18n.t("rec.farthestRun"), { it.longestRun?.value ?: 0.0 },
            { if (it >= 1000) "%.2f km".format(it / 1000) else "%.0f m".format(it) }, { it.longestRun }),
        Kennzahl(I18n.t("rec.topSpeed"), { it.topSpeed?.value ?: 0.0 }, { "%.1f km/h".format(it) }, { it.topSpeed }),
    )
    val gewaehlt = daten?.firstOrNull { it.spot == sel }

    Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp)) {
        HorizontalDivider(Modifier.padding(bottom = 10.dp))
        Text(I18n.t("spotcmp.title"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(8.dp))

        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            PERIODEN.forEach { (p, key) ->
                FilterChip(selected = period == p, onClick = { period = p }, label = { Text(I18n.t(key)) })
            }
        }

        val liste = daten
        if (liste != null && liste.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            TextButton(onClick = { offen = true }) {
                Text(if (sel.isEmpty()) I18n.t("spotcmp.pick") else sel,
                    maxLines = 1, overflow = TextOverflow.Ellipsis)
                Icon(Icons.Filled.ArrowDropDown, contentDescription = null)
            }
            DropdownMenu(expanded = offen, onDismissRequest = { offen = false }) {
                DropdownMenuItem(text = { Text(I18n.t("spotcmp.pick")) }, onClick = { sel = ""; offen = false })
                liste.sortedBy { it.spot }.forEach { s ->
                    DropdownMenuItem(text = { Text(s.spot) }, onClick = { sel = s.spot; offen = false })
                }
            }
        }

        Spacer(Modifier.height(4.dp))
        when {
            liste == null -> Text("…", color = MaterialTheme.colorScheme.onSurfaceVariant)
            liste.isEmpty() -> Text(I18n.t("spots.none"), color = MaterialTheme.colorScheme.onSurfaceVariant)
            else -> {
                // Zwei Karten je Zeile (wie das 2-spaltige Raster im Web auf dem Handy).
                kennzahlen.chunked(2).forEach { paar ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 3.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        paar.forEach { k ->
                            val rang = liste.filter { k.wert(it) > 0 }.sortedByDescending { k.wert(it) }
                            val fuehrend = rang.firstOrNull()
                            if (fuehrend == null) {
                                Spacer(Modifier.weight(1f))
                            } else {
                                KennzahlKarte(k, fuehrend, rang, gewaehlt, Modifier.weight(1f),
                                    onOpenSession, onOpenSpot)
                            }
                        }
                        if (paar.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

@Composable
private fun KennzahlKarte(
    k: Kennzahl,
    fuehrend: SpotAgg,
    rang: List<SpotAgg>,
    gewaehlt: SpotAgg?,
    modifier: Modifier,
    onOpenSession: (Int) -> Unit,
    onOpenSpot: (String) -> Unit,
) {
    val halter = k.halter?.invoke(fuehrend)
    val platz = if (gewaehlt != null) rang.indexOfFirst { it.spot == gewaehlt.spot } + 1 else 0
    Card(
        modifier = modifier.clickable {
            // Einzel-Rekord -> genau diese Session; Aggregat -> Session-Liste des Spots.
            val sid = halter?.sessionId
            if (sid != null) onOpenSession(sid) else onOpenSpot(fuehrend.spot)
        },
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Column(Modifier.padding(10.dp)) {
            Text(k.zeige(k.wert(fuehrend)), style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
            Text(k.titel, style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Place, contentDescription = null, modifier = Modifier.size(14.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.width(3.dp))
                Text(fuehrend.spot, style = MaterialTheme.typography.labelMedium,
                    maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            // Name + Datum nur bei Einzel-Rekorden — ein Aggregat hat keinen Halter.
            if (halter != null && (!halter.name.isNullOrBlank() || halter.startedAt != null)) {
                val datum = halter.startedAt?.let { prettyDate(it, halter.tz) }
                Text(listOfNotNull(halter.name?.takeIf { it.isNotBlank() }, datum).joinToString(" · "),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            // Vergleichsspot, nur wenn gewaehlt und nicht selbst der Fuehrende.
            if (gewaehlt != null && gewaehlt.spot != fuehrend.spot) {
                HorizontalDivider(Modifier.padding(vertical = 4.dp))
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(gewaehlt.spot + if (platz > 0) "  #$platz/${rang.size}" else "",
                        style = MaterialTheme.typography.labelMedium, maxLines = 1,
                        overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(if (k.wert(gewaehlt) > 0) k.zeige(k.wert(gewaehlt)) else "—",
                        style = MaterialTheme.typography.labelMedium)
                }
            }
        }
    }
}
