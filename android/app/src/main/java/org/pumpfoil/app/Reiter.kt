package org.pumpfoil.app

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * Reiter oben auf einer Seite — dieselbe Leiste wie im Web (web/src/components/Reiter.tsx, Plan docs/UX-IA.md):
 * wischbar, wenn sie nicht in die Breite passt, der gewaehlte Reiter rollt ins Bild.
 *
 * - `stufe = 1`: Hauptzeile, Text mit Unterstrich; `unter = true` hinterlegt den aktiven Reiter in der Farbe der
 *   zweiten Zeile darunter, damit man sieht, was zusammengehoert.
 * - `stufe = 2`: zweite Zeile als Flaeche direkt unter der ersten, der aktive Reiter als helle Pille.
 */
data class ReiterDef(val id: String, val label: String)

@Composable
fun Reiterleiste(reiter: List<ReiterDef>, aktiv: String, onWahl: (String) -> Unit,
                 modifier: Modifier = Modifier, stufe: Int = 1, unter: Boolean = false) {
    val liste = rememberLazyListState()
    val idx = reiter.indexOfFirst { it.id == aktiv }
    LaunchedEffect(aktiv) { if (idx >= 0) liste.animateScrollToItem(maxOf(0, idx - 1)) }
    val farben = MaterialTheme.colorScheme
    val flaeche = farben.surfaceVariant
    if (stufe == 2) {
        LazyRow(state = liste, modifier = modifier.fillMaxWidth()
            .clip(RoundedCornerShape(bottomStart = 12.dp, bottomEnd = 12.dp)).background(flaeche),
            contentPadding = PaddingValues(6.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            itemsIndexed(reiter) { _, r ->
                val an = r.id == aktiv
                Text(r.label, style = MaterialTheme.typography.bodyMedium,
                    fontWeight = if (an) FontWeight.SemiBold else FontWeight.Normal,
                    color = if (an) farben.onBackground else farben.onSurfaceVariant, maxLines = 1,
                    modifier = Modifier.clip(RoundedCornerShape(8.dp))
                        .background(if (an) farben.background else androidx.compose.ui.graphics.Color.Transparent)
                        .clickable { onWahl(r.id) }.padding(horizontal = 12.dp, vertical = 6.dp))
            }
        }
        return
    }
    Column(modifier.fillMaxWidth()) {
        LazyRow(state = liste, modifier = Modifier.fillMaxWidth(), contentPadding = PaddingValues(horizontal = 8.dp)) {
            itemsIndexed(reiter) { _, r ->
                val an = r.id == aktiv
                val hinterlegt = an && unter
                Column(Modifier
                    .clip(if (hinterlegt) RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp) else RoundedCornerShape(0.dp))
                    .background(if (hinterlegt) flaeche else androidx.compose.ui.graphics.Color.Transparent)
                    .clickable { onWahl(r.id) }) {
                    Text(r.label, style = MaterialTheme.typography.bodyMedium,
                        fontWeight = if (an) FontWeight.SemiBold else FontWeight.Normal,
                        color = if (an) farben.onBackground else farben.onSurfaceVariant, maxLines = 1,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp))
                    Box(Modifier.height(2.dp).fillMaxWidth()
                        .background(if (an && !unter) farben.primary else androidx.compose.ui.graphics.Color.Transparent))
                }
            }
        }
        HorizontalDivider(color = farben.surfaceVariant)
    }
}

/**
 * Gewaehlter Reiter je Bereich fuer die Dauer der App-Sitzung (wie im Web: jeder Bereich kehrt dorthin zurueck, wo
 * man war). Neuer App-Start = `start`. Kein Speichern auf Platte — das waere „merken", das gibt es nur, wo das Web es hat.
 */
object ReiterSpeicher {
    private val zustand = mutableMapOf<String, MutableState<String>>()
    fun von(bereich: String, start: String): MutableState<String> = zustand.getOrPut(bereich) { mutableStateOf(start) }
}

@Composable
fun rememberReiter(bereich: String, ids: List<String>, start: String): MutableState<String> {
    val st = remember(bereich) { ReiterSpeicher.von(bereich, start) }
    if (st.value !in ids) st.value = if (start in ids) start else ids.firstOrNull() ?: start
    return st
}
