package org.pumpfoil.app

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

/**
 * Puls-Streifen je Lauf (Web components/CompareHrStrips.tsx, Port 16.11.2026). Eine Zeile = ein Lauf, waagerecht die Zeit
 * AB LAUFBEGINN, alle Zeilen auf derselben Achse bis zum laengsten Lauf, gefaerbt nach Puls bzw. Anstieg gegenueber dem
 * ersten gemessenen Puls desselben Laufs. Laeufe ohne Puls fehlen ganz. Die Zeitachse kommt aus der Laufdauer
 * (`duration_s`), nicht Punkt = Sekunde: Uhren mit intelligenter Aufzeichnung speichern nur etwa alle 2 s (Web a707ccb2).
 * Wie auf dem Handy im Web nur die Puls-Spalte; Finger auf dem Streifen zeigt Zeit und Werte an dieser Stelle.
 */
private class HrZeile(val nr: Int, val hr: List<Int?>, val delta: List<Int?>)

private const val ZEILE_H = 13
private const val ZEILE_LUECKE = 8

@Composable
fun HrStreifenKarte(track: Track, segs: List<Segment>) {
    val zeilen = remember(track, segs) {
        val out = ArrayList<HrZeile>()
        segs.forEachIndexed { ri, s ->
            val von = s.iStart.coerceAtLeast(0)
            val bis = minOf(s.iEnd + 1, track.hr.size)
            if (bis <= von) return@forEachIndexed
            val werte = (von until bis).map { track.hr[it]?.takeIf { v -> v > 0 } }
            if (werte.none { it != null }) return@forEachIndexed
            val n = werte.size
            val dauer = Math.round(s.durationS).toInt()
            val umrechnen = n > 1 && kotlin.math.abs(dauer - (n - 1)) > 2
            val hrS = if (!umrechnen) werte else (0..dauer).map { sek -> werte[minOf(n - 1, Math.round(sek.toDouble() * (n - 1) / dauer).toInt())] }
            val basis = hrS.firstOrNull { it != null }
            out.add(HrZeile(ri + 1, hrS, hrS.map { v -> if (v != null && basis != null) v - basis else null }))
        }
        out
    }
    if (zeilen.isEmpty()) return
    // Rampe ueber den GANZEN Track wie die Karte (Web hrRange: Rueckfall 100…170).
    val bereich = remember(track) {
        val vs = track.hr.filterNotNull().filter { it > 0 }
        if (vs.isEmpty()) 100 to 170 else vs.min() to vs.max()
    }
    val dBereich = remember(zeilen) {
        val alle = zeilen.flatMap { it.delta }.filterNotNull()
        if (alle.isEmpty()) 0 to 10 else { val mn = minOf(alle.min(), 0); mn to maxOf(alle.max(), mn + 10) }
    }
    val maxLen = zeilen.maxOf { it.hr.size }
    var anstieg by rememberSaveable { mutableStateOf(false) }
    var hoverI by remember { mutableStateOf<Int?>(null) }
    val dunkel = MaterialTheme.colorScheme.background.luminance() < 0.5f
    val grund = if (dunkel) Color(0xFF1E293B) else Color.White
    val linie = if (dunkel) Color.White.copy(alpha = 0.8f) else Color(0xFF0F172A).copy(alpha = 0.75f)
    val grau = MaterialTheme.colorScheme.onSurfaceVariant
    fun farbe(v: Int?): Color = when {
        v == null -> Color.White
        anstieg -> rampColor((v - dBereich.first).toDouble() / maxOf(dBereich.second - dBereich.first, 1))
        else -> rampColor((v - bereich.first).toDouble() / maxOf(bereich.second - bereich.first, 1))
    }
    fun mmss(n: Int) = "${n / 60}:" + (n % 60).toString().padStart(2, '0')

    Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
        Column(Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("${I18n.t("field.2")} · ${I18n.t("compare.runsTitle").replace("{count}", zeilen.size.toString())}",
                    style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                listOf(false, true).forEach { v ->
                    FilterChip(selected = anstieg == v, onClick = { anstieg = v },
                        label = { Text(I18n.t(if (v) "hr.viewRise" else "hr.viewPeak")) }, colors = cyanChipColors(),
                        modifier = Modifier.padding(start = 4.dp))
                }
            }
            // Legende: Zeit unter dem Finger, dann min — Verlauf — max.
            Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.End) {
                hoverI?.let {
                    Text(mmss(it), style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.clip(RoundedCornerShape(4.dp)).background(MaterialTheme.colorScheme.surfaceVariant)
                            .padding(horizontal = 6.dp, vertical = 1.dp))
                    Spacer(Modifier.width(6.dp))
                }
                val lo = if (anstieg) dBereich.first.let { if (it > 0) "+$it" else "$it" } else "${bereich.first}"
                val hi = if (anstieg) "+${dBereich.second}" else "${bereich.second}"
                Text(lo, style = MaterialTheme.typography.bodySmall, color = grau)
                Box(Modifier.padding(horizontal = 6.dp).width(80.dp).height(8.dp).clip(RoundedCornerShape(4.dp))
                    .background(Brush.horizontalGradient(listOf(rampColor(0.0), rampColor(0.5), rampColor(1.0)))))
                Text("$hi bpm", style = MaterialTheme.typography.bodySmall, color = grau)
            }
            Row {
                Column(Modifier.padding(end = 6.dp)) {
                    zeilen.forEach { z ->
                        Box(Modifier.height(ZEILE_H.dp), contentAlignment = Alignment.CenterEnd) {
                            Text("#${z.nr}", style = MaterialTheme.typography.labelSmall, color = grau)
                        }
                        Spacer(Modifier.height(ZEILE_LUECKE.dp))
                    }
                }
                Column(Modifier.weight(1f)) {
                    Canvas(Modifier.fillMaxWidth().height((zeilen.size * (ZEILE_H + ZEILE_LUECKE)).dp)
                        .pointerInput(maxLen) {
                            awaitPointerEventScope {
                                while (true) {
                                    val ev = awaitPointerEvent()
                                    val p = ev.changes.firstOrNull() ?: continue
                                    hoverI = if (p.pressed) {
                                        p.consume()
                                        (p.position.x / size.width * maxLen).toInt().coerceIn(0, maxLen - 1)
                                    } else null
                                }
                            }
                        }) {
                        val w = size.width
                        val zh = ZEILE_H.dp.toPx(); val zl = ZEILE_LUECKE.dp.toPx()
                        zeilen.forEachIndexed { r, z ->
                            val y = r * (zh + zl)
                            drawRect(grund, Offset(0f, y), Size(w, zh))
                            val reihe = if (anstieg) z.delta else z.hr
                            reihe.forEachIndexed { i, v ->
                                val x0 = i.toFloat() / maxLen * w
                                val x1 = (i + 1).toFloat() / maxLen * w
                                drawRect(farbe(v), Offset(x0, y), Size(maxOf(x1 - x0, 1f), zh))
                            }
                        }
                        hoverI?.let { drawRect(linie, Offset(((it + 0.5f) / maxLen * w), 0f), Size(1.dp.toPx(), size.height)) }
                    }
                    Row(Modifier.fillMaxWidth()) {
                        Text("0:00", style = MaterialTheme.typography.bodySmall, color = grau, modifier = Modifier.weight(1f))
                        Text(mmss(maxLen), style = MaterialTheme.typography.bodySmall, color = grau)
                    }
                }
                // Werte-Spalte: unter dem Finger der Wert dieses Laufs, sonst die Zusammenfassung (Ø-Puls bzw. Anstieg am Ende).
                Column(Modifier.padding(start = 6.dp).width(44.dp)) {
                    zeilen.forEach { z ->
                        val i = hoverI
                        val txt = if (i != null) {
                            if (i < z.hr.size) (if (anstieg) z.delta[i] else z.hr[i])?.let { if (anstieg && it > 0) "+$it" else "$it" } ?: "–" else ""
                        } else if (anstieg) {
                            z.delta.lastOrNull { it != null }?.let { if (it > 0) "+$it" else "$it" } ?: "–"
                        } else {
                            z.hr.filterNotNull().takeIf { it.isNotEmpty() }?.let { "${Math.round(it.average())}" } ?: "–"
                        }
                        Box(Modifier.height(ZEILE_H.dp).fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
                            Text(txt, style = MaterialTheme.typography.labelSmall, textAlign = TextAlign.End,
                                fontWeight = if (i != null) FontWeight.SemiBold else FontWeight.Normal,
                                color = if (i != null) MaterialTheme.colorScheme.onSurface else grau)
                        }
                        Spacer(Modifier.height(ZEILE_LUECKE.dp))
                    }
                }
            }
        }
    }
}
