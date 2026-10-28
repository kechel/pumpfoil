package org.pumpfoil.app

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import kotlinx.coroutines.async
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * Die Rekorde EINES Spots, ganz oben auf der Spot-Seite — wie in der PWA seit dem 06.09.2026.
 *
 * Warum es das braucht (Jan, 07.09.2026): auf der Spot-Ansicht fehlten die Rekorde ganz, dazu
 * teils Wetter und Beschreibungen. Die Reihenfolge ist jetzt dieselbe wie im Web: Rekorde,
 * Wetter, Beschreibungen, dann die Sessions.
 *
 * Zeitfenster wie im Web: erst zehn Tage, und wenn dort nichts steht, weiter auf 30 Tage, ein
 * Jahr, alles. Sobald der Nutzer selbst ein Fenster wählt, bleibt seine Wahl stehen. Gibt es in
 * KEINEM Fenster einen Rekord, verschwindet der Block ganz — eine Reihe „–" hilft niemandem.
 *
 * Alle Fenster kommen in EINEM Aufruf (`communityRecords(spot = …)`); `spotRecords` liefert nur
 * eins und würde für den Rückfall vier Abrufe brauchen.
 */
/** Sportart von Rekorden und Heatmap der Spot-Seite: der Filter, bei „Alle" Pumpfoil, sonst die erste des Spots. */
fun rekordSportFuer(sport: String, spotSports: List<String>): String? =
    if (sport != "all") sport else if ("pumpfoil" in spotSports) "pumpfoil" else spotSports.firstOrNull()

/**
 * Sportart-Knoepfe = Filter der ganzen Spot-Seite (Liste, Rekorde, Heatmap), fest UEBER der scrollenden
 * Liste (Jan, 28.10.2026: „die buttons sind ja jetzt die generellen filter, sollten also ueber die
 * 'records at this spot' ueberschrift und auch nicht mit scrollen"). „Alle" + die Sportarten dieses Spots
 * (Server /api/community/sports?spot=); eine per Spot-Karte gewaehlte ohne Session hier steht trotzdem
 * da, sonst kaeme man nicht zurueck. Bei nur einer Sportart und ohne Filter: keine Knoepfe.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SpotSportKnoepfe(spotSports: List<String>, sport: String, onSport: (String) -> Unit, modifier: Modifier = Modifier) {
    val knoepfe = spotSports + if (sport != "all" && sport !in spotSports) listOf(sport) else emptyList()
    if (knoepfe.size < 2 && sport == "all") return
    FlowRow(modifier, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        (listOf("all") + knoepfe).forEach { sp ->
            FilterChip(selected = sp == sport, onClick = { onSport(sp) },
                label = { Text(if (sp == "all") I18n.t("all.allSports") else I18n.t("cls.sport.$sp")) },
                colors = cyanChipColors())
        }
    }
}

/** Rekorde am Spot fuer EINE Sportart (welche, bestimmen die Knoepfe darueber, s. SpotSportKnoepfe). */
@Composable
fun SpotRecordsSection(spot: String, accelOnly: Boolean, sport: String, onOpen: (Int) -> Unit) {
    var daten by remember(spot, accelOnly, sport) { mutableStateOf<Map<String, PeriodRecords>?>(null) }
    LaunchedEffect(spot, accelOnly, sport) {
        daten = try { Api.communityRecords(accelOnly = accelOnly, spot = spot, sport = sport) } catch (_: Exception) { emptyMap() }
    }
    val titel = I18n.t("rec.spotTitle") + " · " + I18n.t("cls.sport.$sport")
    // WAEHREND DES LADENS die Ueberschrift schon zeigen, nicht nichts.
    //
    // Das ist kein Schoenheits-, sondern ein Anker-Problem gewesen. Dieser Abschnitt ist der
    // ERSTE Eintrag der Spot-Liste. Solange er nichts zeichnete, war er 0 Pixel hoch, und die
    // LazyColumn verankerte sich am ersten SICHTBAREN Eintrag — also an der ersten Session.
    // Kamen Rekorde, Wetter und Beschreibungen danach an, wuchsen sie OBERHALB des Ankers ein,
    // und die Ansicht stand ploetzlich mitten in der Sessionliste (Jan, 18.09.2026). Mit der
    // Ueberschrift ab dem ersten Bild hat der Eintrag von Anfang an Hoehe.
    val d = daten
    if (d == null) {
        Text(titel, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp))
        return
    }
    // Kein Rekord in dieser Sportart -> der Block verschwindet ganz (eine Reihe „–" hilft niemandem).
    val fenster = listOf("10d", "30d", "365d", "all")
    if (fenster.none { hatRekorde(d[it]) }) return
    Column(Modifier.padding(horizontal = 12.dp, vertical = 4.dp)) {
        Text(titel, style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(bottom = 4.dp))
        key(sport) { SpotRecordsSport(d, sport, onOpen) }
    }
}

@Composable
private fun SpotRecordsSport(daten: Map<String, PeriodRecords>, sport: String, onOpen: (Int) -> Unit) {
    val fenster = listOf("10d", "30d", "365d", "all")
    // Erstes Fenster mit Rekord; die eigene Wahl gilt, bis die Sportart wechselt (key am Aufrufer).
    var wahl by remember { mutableStateOf(fenster.firstOrNull { hatRekorde(daten[it]) } ?: "all") }
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(bottom = 6.dp)) {
        fenster.forEach { f ->
            FilterChip(selected = wahl == f, onClick = { wahl = f }, label = { Text(I18n.t("period.$f")) })
        }
    }
    RecordGrid(daten[wahl], showSpot = false, onOpen = onOpen, sport = sport, nurBelegt = true)
}

/** Steht in diesem Zeitfenster überhaupt ein Rekord? (mindestens eine Kennzahl mit Session) */
private fun hatRekorde(r: PeriodRecords?): Boolean {
    if (r == null) return false
    val alle = listOf(r.distance, r.duration, r.speed, r.glide, r.runs, r.sessionDistance,
                      r.sessionTime, r.sessionPumps, r.maxHr, r.earlyBird, r.nightOwl, r.carves180)
    return alle.any { it != null && it.value > 0.0 }
}
