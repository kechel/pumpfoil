package org.pumpfoil.watch

import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.json.JSONArray

// Eigene Layouts auf der Uhr zeichnen — portiert von watch/source/RecordView.mc (Garmin ist die
// Referenz). Elementformat: [typ, x, y, size, color, flags, extra…], Koordinaten sind PROMILLE
// der Displaybreite/-höhe, damit dasselbe Layout auf jeder Uhrengröße passt.
//
//   typ 1 = Wert eines Datenfelds      (extra = Feld-ID; flags Bit2 = Farbe nach Wert)
//   typ 2 = übersetztes Feld-Label     (extra = Feld-ID)
//   typ 3 = Freitext                   (extra = Text)
//   typ 4 = Trennlinie                 (extra = Zielpunkt x2,y2; size = Strichbreite)
//   typ 5 = REC-Punkt
//   typ 6 = Seiten-Punkte
//   typ 7 = „Pausiert"-Hinweis         (Pflicht in Pausen-Layouts, nicht entfernbar)
//   flags Bit0 = links, Bit1 = rechts, sonst zentriert
//
// NICHT übernommen: die Garmin-Größenstufen selbst. Deren Zahlen sind gemessene Connect-IQ-Fonts
// (FONT_XTINY…FONT_NUMBER_THAI_HOT); auf Wear OS gibt es frei skalierbare Größen. Die Stufen 0…8
// werden deshalb auf einen Anteil der Displaybreite abgebildet — dasselbe Verhältnis wie im
// Editor der PWA, aber plattformeigen berechnet.
private val SIZE_FACTORS = listOf(0.075f, 0.11f, 0.13f, 0.15f, 0.17f, 0.23f, 0.28f, 0.36f, 0.42f)

/** Stufe -> Schriftgröße in sp, relativ zur Displaybreite. */
fun layoutTextSize(step: Int, widthPx: Float, density: Float): TextUnit {
    val f = SIZE_FACTORS[step.coerceIn(0, SIZE_FACTORS.size - 1)]
    return ((widthPx * f) / density).sp
}

/** Farbpalette 1…15 wie RecordView.mc:_layoutColor; 0/unbekannt -> Vorgabe des Aufrufers. */
fun layoutColor(idx: Int, fallback: Color): Color = when (idx) {
    1 -> Color.White
    2 -> Color(0xFFAAAAAA)
    3 -> Color(0xFF555555)
    4 -> Color.Black
    5 -> Color(0xFFFF0000)
    6 -> Color(0xFFFF5500)
    7 -> Color(0xFFFFAA00)
    8 -> Color(0xFFFFFF00)
    9 -> Color(0xFF00FF00)
    10 -> Color(0xFF008800)
    11 -> Color(0xFF00FFFF)
    12 -> Color(0xFF22D3EE)   // Marken-Cyan
    13 -> Color(0xFF0000FF)
    14 -> Color(0xFFAA00FF)
    15 -> Color(0xFFFF00AA)
    else -> fallback
}

/** Ein Element als Zahlenliste; `extraText` nur bei typ 3 (Freitext) belegt. */
data class LayoutElement(
    val typ: Int,
    val x: Int,
    val y: Int,
    val step: Int,
    val color: Int,
    val flags: Int,
    val extraInt: Int? = null,
    val extraText: String? = null,
    val x2: Int? = null,
    val y2: Int? = null,
)

/** Eine Layout-Seite: Hintergrundfarbe + Elemente. */
data class LayoutPageDef(val bg: Int, val elements: List<LayoutElement>)

/** Parst eine Layout-Seite `[1, bg, [elements…]]` (Tag-Byte an Position 0). */
fun parseLayoutPage(arr: JSONArray): LayoutPageDef? {
    if (arr.length() < 3) return null
    val bg = arr.optInt(1, 0)
    val els = arr.optJSONArray(2) ?: return null
    val out = mutableListOf<LayoutElement>()
    for (i in 0 until els.length()) {
        val e = els.optJSONArray(i) ?: continue
        if (e.length() < 6) continue
        val typ = e.optInt(0)
        // typ 3 trägt Text, typ 4 zwei weitere Koordinaten, sonst eine Feld-ID.
        val extraText = if (typ == 3 && e.length() > 6) e.optString(6, "") else null
        val extraInt = if (typ != 3 && e.length() > 6) e.optInt(6, 0) else null
        out.add(
            LayoutElement(
                typ = typ, x = e.optInt(1), y = e.optInt(2), step = e.optInt(3),
                color = e.optInt(4), flags = e.optInt(5),
                extraInt = extraInt, extraText = extraText,
                x2 = if (typ == 4 && e.length() > 6) e.optInt(6) else null,
                y2 = if (typ == 4 && e.length() > 7) e.optInt(7) else null,
            )
        )
    }
    return LayoutPageDef(bg, out)
}

/**
 * Zeichnet eine Layout-Seite. `fieldValue`/`fieldLabel` liefern Text zum Feld, `fieldColor` die
 * wertabhängige Farbe (nur wenn flags Bit2 gesetzt ist); `pausedText` ist der übersetzte
 * „Pausiert"-Hinweis. Reihenfolge wie bei Garmin: erst Linien, dann alles andere — sonst liegen
 * Striche über den Werten.
 */
@Composable
fun LayoutPageView(
    page: LayoutPageDef,
    pageIndex: Int,
    pageCount: Int,
    recording: Boolean,
    pausedText: String,
    fieldValue: (Int) -> String,
    fieldLabel: (Int) -> String,
    fieldColor: (Int) -> Color?,
    modifier: Modifier = Modifier,
) {
    val measurer = rememberTextMeasurer()
    Canvas(modifier) {
        val w = size.width
        val h = size.height
        val dens = density
        // Hintergrundfarbe der Seite zuerst (RecordView.mc:479-481) — sonst bleibt jedes Layout schwarz.
        drawRect(color = layoutColor(page.bg, Color.Black), size = size)
        val sorted = page.elements.sortedBy { if (it.typ == 4) 0 else 1 }
        for (e in sorted) {
            val px = w * e.x / 1000f
            val py = h * e.y / 1000f
            when (e.typ) {
                4 -> {
                    val x2 = w * (e.x2 ?: e.x) / 1000f
                    val y2 = h * (e.y2 ?: e.y) / 1000f
                    drawLine(
                        color = layoutColor(e.color, Color(0xFF555555)),
                        start = Offset(px, py), end = Offset(x2, y2),
                        strokeWidth = (if (e.step < 1) 1 else e.step).toFloat(),
                    )
                }
                5 -> if (recording) {
                    drawCircle(layoutColor(e.color, Color(0xFFFF0000)), radius = 4.dp.toPx(), center = Offset(px, py))
                }
                6 -> drawPageDots(pageIndex, pageCount, layoutColor(e.color, Color(0xFFAAAAAA)), w, h)
                7 -> drawLayoutText(
                    measurer, pausedText, px, py, e,
                    layoutTextSize(e.step.coerceAtMost(2), w, dens),
                    layoutColor(e.color, Color(0xFF22D3EE)), dens,
                )
                1, 2, 3 -> {
                    val txt = when (e.typ) {
                        1 -> fieldValue(e.extraInt ?: 0)
                        2 -> fieldLabel(e.extraInt ?: 0)
                        else -> e.extraText ?: ""
                    }
                    if (txt.isNotEmpty()) {
                        val byValue = if (e.typ == 1 && (e.flags and 4) != 0) fieldColor(e.extraInt ?: 0) else null
                        val col = byValue
                            ?: layoutColor(e.color, if (e.typ == 1) Color.White else Color(0xFFAAAAAA))
                        drawLayoutText(measurer, txt, px, py, e, layoutTextSize(e.step, w, dens), col, dens)
                    }
                }
            }
        }
    }
}

// Text an (x,y) ausrichten: flags Bit0 links, Bit1 rechts, sonst zentriert; vertikal immer
// mittig — genau wie TEXT_JUSTIFY_VCENTER bei Garmin.
private fun DrawScope.drawLayoutText(
    measurer: TextMeasurer,
    text: String,
    x: Float,
    y: Float,
    e: LayoutElement,
    fontSize: TextUnit,
    color: Color,
    dens: Float,
) {
    val style = TextStyle(
        fontSize = fontSize, color = color, fontWeight = FontWeight.Medium,
        fontFamily = FontFamily.SansSerif,
    )
    val res = measurer.measure(text, style)
    val tw = res.size.width.toFloat()
    val th = res.size.height.toFloat()
    val left = when {
        (e.flags and 1) != 0 -> x
        (e.flags and 2) != 0 -> x - tw
        else -> x - tw / 2f
    }
    drawText(res, topLeft = Offset(left, y - th / 2f))
}

// Seiten-Punkte unten mittig, aktive Seite hell — Gegenstück zu RecordView._drawPageDots.
private fun DrawScope.drawPageDots(idx: Int, count: Int, active: Color, w: Float, h: Float) {
    if (count <= 1) return
    val r = w * 0.012f
    val gap = r * 3f
    val total = (count - 1) * gap
    val startX = w / 2f - total / 2f
    val y = h * 0.92f
    for (i in 0 until count) {
        drawCircle(
            color = if (i == idx) active else Color(0xFF555555),
            radius = r, center = Offset(startX + i * gap, y),
        )
    }
}

// --- Seiten-Sätze (F3) ---------------------------------------------------------------------
// WICHTIG, hier lag mein Fehler: der Server schickt KEINE Layout-IDs mit separatem Definitions-
// Wörterbuch. Jeder Eintrag in `pages`/`offFoilPages`/`pausePages` ist eine LISTE mit einem
// TAG-Byte vorneweg (server/app/api/devices.py:_layouts_for_watch, wie RecordView.mc:98-114):
//   [0, a, b, c]          klassische Seite mit drei Feld-IDs
//   [1, bg, [elemente…]]  eigenes Layout, Hintergrundfarbe + Elemente INLINE
// Damit ist beides in derselben Liste unterscheidbar, ohne zweiten Request.

sealed interface WatchPageRef {
    data class Classic(val fields: List<Int>) : WatchPageRef
    /** Layout kommt fertig mit; keine ID, kein Nachladen. */
    data class Layout(val def: LayoutPageDef) : WatchPageRef
}

/** Parst einen gemischten Seiten-Satz; null wenn das Feld fehlt (Aufrufer nimmt den Rückfall). */
fun parsePageRefs(arr: JSONArray?): List<WatchPageRef>? {
    if (arr == null) return null
    val out = mutableListOf<WatchPageRef>()
    for (i in 0 until arr.length()) {
        val row = arr.optJSONArray(i) ?: continue
        when (row.optInt(0, 0)) {
            1 -> parseLayoutPage(row)?.let { out.add(WatchPageRef.Layout(it)) }
            else -> out.add(WatchPageRef.Classic(listOf(row.optInt(1, 0), row.optInt(2, 0), row.optInt(3, 0))))
        }
    }
    return out.ifEmpty { null }
}

/** Rückfall: die klassische `views`-Liste (ohne Tag-Byte) als Seiten-Satz. */
fun pagesFromViews(views: List<List<Int>>): List<WatchPageRef> =
    views.map { WatchPageRef.Classic(it) }
