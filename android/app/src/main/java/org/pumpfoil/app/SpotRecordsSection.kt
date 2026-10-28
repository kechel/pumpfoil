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
fun SpotRecordsSection(spot: String, accelOnly: Boolean, sport: String, sports: List<SportRuns>, onOpen: (Int) -> Unit) {
    // EIN Kasten fuer EINE Sportart mit Umschalter (Jan, 28.10.2026: „die rekorde bitte nur fuer eine
    // sportart und … zum umschalten"; wie die PWA). Je Sportart getrennt bleibt es (29.09.2026, Anlass
    // ein Foil-Scoot-Fahrer: ein Foil-Scoot-Tempo gegen ein Pumpfoil-Tempo waere kein Rekord). Zur Wahl
    // stehen nur Sportarten mit Rekord an diesem Spot; ein Sportarten-Filter der Seite gibt die
    // Sportart vor.
    val liste = if (sport != "all") listOf(sport)
                else sports.map { it.sport }.filter { it.isNotBlank() }.ifEmpty { listOf("pumpfoil") }
    var daten by remember(spot, accelOnly, liste) { mutableStateOf<Map<String, Map<String, PeriodRecords>>>(emptyMap()) }
    var fertig by remember(spot, accelOnly, liste) { mutableStateOf(false) }
    var wahl by remember(spot) { mutableStateOf<String?>(null) }
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
    val aktiv = if (sport != "all") sport
                else wahl?.takeIf { it in mit } ?: if ("pumpfoil" in mit) "pumpfoil" else mit.firstOrNull()

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
    // Kein Rekord in KEINER Sportart -> der Block verschwindet ganz (eine Reihe „–" hilft niemandem).
    if (aktiv == null || aktiv !in mit) return
    Column(Modifier.padding(horizontal = 12.dp, vertical = 4.dp)) {
        Text(I18n.t("rec.spotTitle") + " · " + I18n.t("cls.sport.$aktiv"), style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(bottom = 4.dp))
        if (mit.size > 1) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(bottom = 2.dp)) {
                mit.forEach { sp ->
                    FilterChip(selected = sp == aktiv, onClick = { wahl = sp }, label = { Text(I18n.t("cls.sport.$sp")) })
                }
            }
        }
        key(aktiv) { SpotRecordsSport(daten[aktiv] ?: emptyMap(), aktiv, onOpen) }
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
