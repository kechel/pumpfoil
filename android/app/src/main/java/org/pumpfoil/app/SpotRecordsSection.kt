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
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SpotRecordsSection(spot: String, accelOnly: Boolean, sport: String, sports: List<SportRuns>, onOpen: (Int) -> Unit,
                       onAktiv: (String?) -> Unit = {}, onSport: (String) -> Unit = {}) {
    // EIN Kasten fuer EINE Sportart (Jan, 28.10.2026; wie die PWA). Je Sportart getrennt bleibt es
    // (29.09.2026: ein Foil-Scoot-Tempo gegen ein Pumpfoil-Tempo waere kein Rekord).
    //
    // Die Knoepfe sind der SPORTARTEN-FILTER DER GANZEN SPOT-SEITE (Dropdown dort raus, „Knoepfe filtern
    // alles"): „Alle" plus die Sportarten mit Rekord an diesem Spot; ein Knopf setzt `sport` der Seite.
    // Bei „Alle" zeigen die Rekorde Pumpfoil, sonst die erste Sportart mit Rekord. Abgefragt werden IMMER
    // alle Sportarten — sonst kennte die Knopfzeile nach einem Klick nur noch die gewaehlte.
    val liste = sports.map { it.sport }.filter { it.isNotBlank() }.ifEmpty { listOf("pumpfoil") }
    var daten by remember(spot, accelOnly, liste) { mutableStateOf<Map<String, Map<String, PeriodRecords>>>(emptyMap()) }
    var fertig by remember(spot, accelOnly, liste) { mutableStateOf(false) }
    LaunchedEffect(spot, accelOnly, liste) {
        val m = mutableMapOf<String, Map<String, PeriodRecords>>()
        kotlinx.coroutines.coroutineScope {
            liste.map { sp -> async { sp to (try { Api.communityRecords(accelOnly = accelOnly, spot = spot, sport = sp) } catch (_: Exception) { emptyMap() }) } }
                .forEach { val (sp, d) = it.await(); m[sp] = d }
        }
        daten = m; fertig = true
    }
    val fenster = listOf("10d", "30d", "365d", "all")
    val mit = liste.filter { sp -> daten[sp]?.let { d -> fenster.any { hatRekorde(d[it]) } } == true }
    val aktiv = if (sport != "all") sport else if ("pumpfoil" in mit) "pumpfoil" else mit.firstOrNull()
    // Der Seite melden, welche Sportart hier steht — die Heatmap folgt ihr; null = kein Kasten.
    val gezeigt = if (fertig) aktiv?.takeIf { it in mit || sport != "all" } else null
    LaunchedEffect(gezeigt) { onAktiv(gezeigt) }

    // WAEHREND DES LADENS die Ueberschrift schon zeigen, nicht nichts.
    //
    // Das ist kein Schoenheits-, sondern ein Anker-Problem gewesen. Dieser Abschnitt ist der
    // ERSTE Eintrag der Spot-Liste. Solange er nichts zeichnete, war er 0 Pixel hoch, und die
    // LazyColumn verankerte sich am ersten SICHTBAREN Eintrag — also an der ersten Session.
    // Kamen Rekorde, Wetter und Beschreibungen danach an, wuchsen sie OBERHALB des Ankers ein,
    // und die Ansicht stand ploetzlich mitten in der Sessionliste (Jan, 18.09.2026). Mit der
    // Ueberschrift ab dem ersten Bild hat der Eintrag von Anfang an Hoehe.
    if (!fertig) {
        Text(I18n.t("rec.spotTitle"), style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp))
        return
    }
    // Kein Rekord und kein Filter -> der Block verschwindet ganz (eine Reihe „–" hilft niemandem).
    if (gezeigt == null) return
    // Eine per Spot-Karte gewaehlte Sportart ohne Rekord hier trotzdem als Knopf, sonst kaeme man nicht
    // zurueck auf „Alle".
    val knoepfe = mit + if (sport != "all" && sport !in mit) listOf(sport) else emptyList()
    Column(Modifier.padding(horizontal = 12.dp, vertical = 4.dp)) {
        Text(I18n.t("rec.spotTitle") + " · " + I18n.t("cls.sport.$gezeigt"), style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(bottom = 4.dp))
        if (knoepfe.size > 1 || sport != "all") {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(bottom = 2.dp)) {
                (listOf("all") + knoepfe).forEach { sp ->
                    FilterChip(selected = sp == sport, onClick = { onSport(sp) },
                        label = { Text(if (sp == "all") I18n.t("all.allSports") else I18n.t("cls.sport.$sp")) })
                }
            }
        }
        key(gezeigt) { SpotRecordsSport(daten[gezeigt] ?: emptyMap(), gezeigt, onOpen) }
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
