package org.pumpfoil.app

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Ein Spot mit eigenen Sessions (GET /api/sessions/my-spots-stats, gezaehlt am Server wie die Spot-Liste des Verlaufs). */
@Serializable
data class MeinSpot(
    @SerialName("spot_id") val spotId: Int = 0,
    val name: String? = null,
    val water: String? = null,
    val sessions: Int = 0,
    val first: String? = null,
    val last: String? = null,
    @SerialName("time_s") val timeS: Double = 0.0,
    @SerialName("distance_m") val distanceM: Double = 0.0,
    val runs: Int = 0,
    val pumps: Int = 0,
    val sports: List<String> = emptyList(),
    @SerialName("foil_sessions") val foilSessions: Int = 0,
)

/**
 * Home › Spots (Web PersonalHome.tsx `SpotsBereich`, Jan 04.11.2026): zweite Zeile = die eigenen Spots (Homespot zuerst
 * mit Haus-Symbol, dann zuletzt besuchte), wischbar wie die Reiter, „Alle (n)" rechts immer sichtbar. Ein Spot ->
 * darunter seine Reiter (`SpotReiterBereich`, derselbe Inhalt wie die Spot-Seite); „Alle" -> die Kacheln.
 * Die Wahl gilt fuer die App-Sitzung (ReiterSpeicher), wie im Web der Adress-Parameter `spot`.
 */
@Composable
fun HomeSpotsBereich(homespotId: Int?, homespotName: String?, liste: List<MeinSpot>?,
                     onOpen: (Int) -> Unit, onOpenSpot: (String) -> Unit) {
    if (liste == null) return
    data class Pille(val id: Int, val name: String)
    val pillen = buildList {
        if (homespotId != null) add(Pille(homespotId, liste.firstOrNull { it.spotId == homespotId }?.name ?: homespotName ?: "—"))
        // Der Server liefert zuletzt besuchte zuerst.
        liste.filter { it.spotId != homespotId }.forEach { add(Pille(it.spotId, it.name ?: "—")) }
    }
    var roh by remember { ReiterSpeicher.von("homespots", "") }
    val wahl = if (roh == "alle" || pillen.any { it.id.toString() == roh }) roh
               else pillen.firstOrNull()?.id?.toString() ?: "alle"
    val farben = MaterialTheme.colorScheme
    val leiste = rememberLazyListState()
    val idx = pillen.indexOfFirst { it.id.toString() == wahl }
    LaunchedEffect(wahl) { if (idx >= 0) leiste.animateScrollToItem(maxOf(0, idx - 1)) }

    @Composable
    fun pille(text: String, an: Boolean, symbol: (@Composable () -> Unit)?, onClick: () -> Unit) {
        Row(Modifier.clip(RoundedCornerShape(50)).background(if (an) farben.background else Color.Transparent)
                .clickable(onClick = onClick).padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically) {
            symbol?.invoke()
            Text(text, style = MaterialTheme.typography.bodyMedium, maxLines = 1,
                fontWeight = if (an) FontWeight.SemiBold else FontWeight.Normal,
                color = if (an) farben.onBackground else farben.onSurfaceVariant)
        }
    }

    // Die Zeile sitzt als Flaeche direkt unter den Home-Reitern (wie die zweite Reiterzeile).
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(bottomStart = 12.dp, bottomEnd = 12.dp)).background(farben.surfaceVariant)
            .padding(6.dp), verticalAlignment = Alignment.CenterVertically) {
        LazyRow(state = leiste, modifier = Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            itemsIndexed(pillen) { _, p ->
                pille(p.name, p.id.toString() == wahl, symbol = {
                    Icon(if (p.id == homespotId) Icons.Filled.Home else Icons.Filled.Place, contentDescription = null,
                        tint = farben.primary, modifier = Modifier.size(16.dp).padding(end = 2.dp))
                }) { roh = p.id.toString() }
            }
        }
        Spacer(Modifier.width(4.dp))
        pille(I18n.t("mySpots.all").replace("{n}", liste.size.toString()), wahl == "alle", null) { roh = "alle" }
    }
    Spacer(Modifier.height(8.dp))

    val gewaehlt = pillen.firstOrNull { it.id.toString() == wahl }
    if (gewaehlt != null) {
        // key: beim Spotwechsel frischer Zustand (Sessions, Wetter …); der Unterreiter bleibt stehen (ReiterSpeicher "spot").
        androidx.compose.runtime.key(gewaehlt.id) {
            SpotReiterBereich(gewaehlt.name, onOpen, kopf = {
                Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Place, contentDescription = null, tint = farben.primary, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(gewaehlt.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold,
                        maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    Text("${I18n.t("tab.spotPage")} →", style = MaterialTheme.typography.labelMedium, color = farben.primary,
                        maxLines = 1, modifier = Modifier.clickable { onOpenSpot(gewaehlt.name) }.padding(4.dp))
                }
            })
        }
    } else {
        MeineSpotsKacheln(liste, homespotId) { roh = it.toString() }
    }
}

/**
 * „Alle" unter Home › Spots (Web `MeineSpots`): eine Kachel je Spot mit Sessions, letztem Besuch, On-Foil-Zeit/-Strecke
 * (nur wenn es dort Sessions MIT Foil gibt), Laeufen, Pumps (nur > 0) und — als letztes Feld — den Sportarten, wenn eine
 * vom eigenen Standard abweicht. Klick waehlt den Spot in der Spotzeile, statt auf die Spot-Seite zu springen.
 */
@Composable
fun MeineSpotsKacheln(liste: List<MeinSpot>, homespotId: Int?, onWahl: (Int) -> Unit) {
    if (liste.isEmpty()) {
        Text(I18n.t("mySpots.empty"), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        return
    }
    val zahl = { n: Int -> java.text.NumberFormat.getIntegerInstance(java.util.Locale.forLanguageTag(I18n.lang)).format(n) }
    val km = { m: Double -> if (m < 1000) "${m.toInt()} m" else if (m < 100000) "%.1f km".format(m / 1000) else "%.0f km".format(m / 1000) }
    val zeit = { s: Double -> if (s < 3600) "${Math.round(s / 60)} min" else "%.1f h".format(s / 3600) }
    val tag = { iso: String? -> iso?.let { kurzDatum(it) }?.ifBlank { null } ?: "—" }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        liste.forEach { sp ->
            val home = sp.spotId == homespotId
            Card(Modifier.fillMaxWidth().clickable { onWahl(sp.spotId) },
                border = BorderStroke(1.dp, if (home) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                Column(Modifier.padding(12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.Place, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text(sp.name ?: "—", fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false))
                        if (home) {
                            Spacer(Modifier.width(6.dp))
                            Text(I18n.t("foiler.homespot"), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold,
                                color = MaterialTheme.colorScheme.onPrimary, maxLines = 1,
                                modifier = Modifier.clip(RoundedCornerShape(50)).background(MaterialTheme.colorScheme.primary)
                                    .padding(horizontal = 8.dp, vertical = 2.dp))
                        }
                    }
                    val unter = listOfNotNull(
                        sp.water?.takeIf { it.isNotBlank() && it != sp.name },
                        I18n.t("mySpots.last").replace("{d}", tag(sp.last)),
                        I18n.t("mySpots.since").replace("{d}", tag(sp.first)),
                    ).joinToString(" · ")
                    Text(unter, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 2.dp))
                    // Zellen: (Wert, Beschriftung, Breite in Spalten von 3). Die Sportarten fuellen die letzte Zeile auf.
                    val zellen = buildList {
                        add(Triple(zahl(sp.sessions), I18n.t("team.stat.sessions"), 1))
                        if (sp.foilSessions > 0) {
                            add(Triple(zeit(sp.timeS), I18n.t("team.stat.zeit"), 1))
                            add(Triple(km(sp.distanceM), I18n.t("team.stat.strecke"), 1))
                        }
                        add(Triple(zahl(sp.runs), I18n.t("team.stat.laeufe"), 1))
                        if (sp.pumps > 0) add(Triple(zahl(sp.pumps), I18n.t("team.stat.pumps"), 1))
                        if (sp.sports.any { it != standardSport }) {
                            val rest = 3 - size % 3
                            add(Triple(sortiereSports(sp.sports).joinToString(", ") { I18n.t("cls.sport.$it") }, I18n.t("mySpots.sports"), rest))
                        }
                    }
                    val zeilen = mutableListOf<MutableList<Triple<String, String, Int>>>()
                    zellen.forEach { z ->
                        val letzte = zeilen.lastOrNull()
                        if (letzte != null && letzte.sumOf { it.third } + z.third <= 3) letzte.add(z) else zeilen.add(mutableListOf(z))
                    }
                    zeilen.forEach { reihe ->
                        Row(Modifier.fillMaxWidth().padding(top = 6.dp)) {
                            reihe.forEach { (wert, label, breite) ->
                                Column(Modifier.weight(breite.toFloat())) {
                                    Text(wert, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.primary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                            }
                            val frei = 3 - reihe.sumOf { it.third }
                            if (frei > 0) Spacer(Modifier.weight(frei.toFloat()))
                        }
                    }
                }
            }
        }
    }
}
