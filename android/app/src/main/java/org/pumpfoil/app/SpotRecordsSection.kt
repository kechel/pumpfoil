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
@Composable
fun SpotRecordsSection(spot: String, accelOnly: Boolean, sport: String, sports: List<SportRuns>, onOpen: (Int) -> Unit) {
    // REKORDE JE SPORTART (wie die PWA seit 29.09.2026, Anlass: ein Foil-Scoot-Fahrer vermisste
    // seine Rekorde am Spot, abgefragt wurde fest „pumpfoil"). Folgt dem Sportarten-Filter der
    // Seite: eine Sportart gewaehlt -> nur deren Rekorde; „alle Sportarten" -> ein Kasten JE
    // Sportart, kein gemischter — ein Foil-Scoot-Tempo gegen ein Pumpfoil-Tempo waere kein
    // Rekord. Kaesten ohne Rekord blenden sich selbst aus (s. unten).
    val liste = if (sport != "all") listOf(sport)
                else sports.map { it.sport }.filter { it.isNotBlank() }.ifEmpty { listOf("pumpfoil") }
    Column {
        // Den Lade-Kopf (Anker, s. unten) zeigt nur der ERSTE Kasten: bei „alle Sportarten"
        // stuenden sonst kurz acht Ueberschriften untereinander, von denen die meisten gleich
        // wieder verschwinden.
        liste.forEachIndexed { i, sp ->
            key(sp) { SpotRecordsSport(spot, accelOnly, sp, ladeKopf = i == 0, onOpen = onOpen) }
        }
    }
}

@Composable
private fun SpotRecordsSport(spot: String, accelOnly: Boolean, sport: String, ladeKopf: Boolean, onOpen: (Int) -> Unit) {
    val fenster = listOf("10d", "30d", "365d", "all")
    var alle by remember(spot, sport) { mutableStateOf<Map<String, PeriodRecords>?>(null) }
    var wahl by remember(spot, sport) { mutableStateOf("10d") }
    var selbstGewaehlt by remember(spot, sport) { mutableStateOf(false) }
    val titel = I18n.t("rec.spotTitle") + " · " + I18n.t("cls.sport.$sport")

    LaunchedEffect(spot, accelOnly, sport) {
        alle = try { Api.communityRecords(accelOnly = accelOnly, spot = spot, sport = sport) } catch (_: Exception) { emptyMap() }
        if (!selbstGewaehlt) {
            wahl = fenster.firstOrNull { hatRekorde(alle?.get(it)) } ?: "all"
        }
    }

    // WAEHREND DES LADENS die Ueberschrift schon zeigen, nicht nichts.
    //
    // Das ist kein Schoenheits-, sondern ein Anker-Problem gewesen. Dieser Abschnitt ist der
    // ERSTE Eintrag der Spot-Liste. Solange er `return` machte, war er 0 Pixel hoch, und die
    // LazyColumn verankerte sich am ersten SICHTBAREN Eintrag — also an der ersten Session.
    // Kamen Rekorde, Wetter und Beschreibungen danach an, wuchsen sie OBERHALB des Ankers ein,
    // und die Ansicht stand ploetzlich mitten in der Sessionliste. Genau so gemeldet (Jan,
    // 18.09.2026): „meine -> illmensee -> meine -> illmensee ist beim 2ten mal nach unten
    // gescrollt … irgendwoher muss da noch ein wert gespeichert sein" — gespeichert war nichts,
    // der Anker rutschte. Beim ERSTEN Besuch fiel es nicht auf, weil die Sessionliste da noch
    // leer war und es nichts gab, worauf er rutschen konnte.
    //
    // Mit der Ueberschrift ab dem ersten Bild hat der Eintrag von Anfang an Hoehe, der Anker
    // bleibt auf Position 0, und alles Nachgeladene waechst UNTERHALB davon ein.
    val daten = alle
    if (daten == null) {
        if (!ladeKopf) return
        Text(titel, style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp))
        return
    }
    // Kein Rekord in KEINEM Fenster -> der Block verschwindet ganz (eine Reihe „–" hilft
    // niemandem). Das passiert erst NACH dem Laden, also im Zustand „oben", und schadet nicht.
    if (fenster.none { hatRekorde(daten[it]) }) return

    Column(Modifier.padding(horizontal = 12.dp, vertical = 4.dp)) {
        Text(titel, style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(bottom = 4.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(bottom = 6.dp)) {
            fenster.forEach { f ->
                FilterChip(
                    selected = wahl == f,
                    onClick = { wahl = f; selbstGewaehlt = true },
                    label = { Text(I18n.t("period.$f")) },
                )
            }
        }
        RecordGrid(daten[wahl], showSpot = false, onOpen = onOpen)
    }
}

/** Steht in diesem Zeitfenster überhaupt ein Rekord? (mindestens eine Kennzahl mit Session) */
private fun hatRekorde(r: PeriodRecords?): Boolean {
    if (r == null) return false
    val alle = listOf(r.distance, r.duration, r.speed, r.glide, r.runs, r.sessionDistance,
                      r.sessionTime, r.sessionPumps, r.maxHr, r.earlyBird, r.nightOwl, r.carves180)
    return alle.any { it != null && it.value > 0.0 }
}
