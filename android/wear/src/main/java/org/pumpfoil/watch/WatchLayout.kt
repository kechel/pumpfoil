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
// Größenstufen: EXAKT dieselbe Ableitung wie die PWA-Vorschau (web/src/lib/watchLayout.ts:58-91),
// nicht mehr geschätzt. Grundlage ist eine echte Messung im Connect-IQ-Simulator (fenix7xpro,
// 280 px breit): Stufe i zeichnet den String "18.5" FONT_INK_W_280[i] Pixel breit. Aus der
// Tintenbreite wird die Schriftgröße: Größe = Breite / Vorschub-pro-px / Referenzbreite.
//
// Meine ersten Werte hier waren frei geschätzt und 32–56 % ZU GROSS — daher Jans Befund
// "Schrift etwas zu gross" auf beiden Uhren, mit Labels, die in die Werte liefen.
private val FONT_INK_W_280 = listOf(29, 46, 50, 61, 64, 82, 99, 146, 166)
private const val FONT_REF_W = 280f
// Vorschub von "18.5" je 1 px Schriftgröße (3 tabellarische Ziffern + Punkt) in Roboto/Sans —
// derselbe Wert, den die PWA im Browser misst (dort Fallback 1,973).
private const val SAMPLE_ADV = 1.973f
private val SIZE_FACTORS = FONT_INK_W_280.map { it / SAMPLE_ADV / FONT_REF_W }

/** Stufe -> Schriftgröße in sp, relativ zur Displaybreite. Untergrenze wie in der Vorschau. */
fun layoutTextSize(step: Int, widthPx: Float, density: Float): TextUnit {
    val f = SIZE_FACTORS[step.coerceIn(0, SIZE_FACTORS.size - 1)]
    return (maxOf(7f, widthPx * f) / density).sp
}

// Farbpalette 1…15 = PALETTE in server/app/api/layouts.py (Quelle der Wahrheit, die PWA spiegelt
// sie). Garmin muss auf seine Hardware-Farbkonstanten runden (COLOR_LT_GRAY statt #d0d0d0 usw.) —
// Wear kann die echten Werte zeichnen, deshalb hier exakt die Palette und nicht Garmins Rundung.
private val PALETTE = listOf(
    Color(0xFFFFFFFF), Color(0xFFD0D0D0), Color(0xFF808080), Color(0xFF000000),
    Color(0xFFFF0000), Color(0xFFFF5500), Color(0xFFFFAA00), Color(0xFFFFFF00),
    Color(0xFF00FF00), Color(0xFF00AA00), Color(0xFF00FFFF), Color(0xFF22D3EE),
    Color(0xFF0055FF), Color(0xFFAA00FF), Color(0xFFFF00AA),
)

/** Palette-Index -> Farbe; 0 ("auto") und Unbekanntes -> Vorgabe des Aufrufers. */
fun layoutColor(idx: Int, fallback: Color): Color =
    PALETTE.getOrNull(idx - 1) ?: fallback

// Rollen-Vorgaben für "auto" — identisch mit paletteColor() in der Vorschau.
private val AUTO_VALUE = Color(0xFFFFFFFF)
private val AUTO_LABEL = Color(0xFFD0D0D0)
private val AUTO_LINE = Color(0xFF808080)

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
                        color = layoutColor(e.color, AUTO_LINE),
                        start = Offset(px, py), end = Offset(x2, y2),
                        strokeWidth = (if (e.step < 1) 1 else e.step).toFloat(),
                    )
                }
                // REC = Punkt UND "REC"-Text (Garmin _drawRec, Vorschau EL_REC) — vorher fehlte
                // der Text, das war allein schon ein sichtbarer Unterschied zur Vorschau.
                5 -> if (recording) {
                    drawRecIndicator(measurer, px, py, w, e.flags, layoutColor(e.color, PALETTE[4]))
                }
                6 -> drawLayoutDots(
                    idx = pageIndex, count = pageCount,
                    color = layoutColor(e.color, AUTO_LABEL), x = px, y = py, w = w, flags = e.flags,
                )
                7 -> drawLayoutText(
                    measurer, pausedText, px, py, e,
                    layoutTextSize(e.step.coerceAtMost(2), w, dens),
                    layoutColor(e.color, AUTO_LABEL), bold = true,
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
                            ?: layoutColor(e.color, if (e.typ == 1) AUTO_VALUE else AUTO_LABEL)
                        // Nur Werte und der Pausiert-Hinweis sind fett — genau wie in der Vorschau.
                        drawLayoutText(
                            measurer, txt, px, py, e, layoutTextSize(e.step, w, dens), col,
                            bold = e.typ == 1,
                        )
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
    bold: Boolean,
) {
    val style = TextStyle(
        fontSize = fontSize, color = color,
        fontWeight = if (bold) FontWeight.Bold else FontWeight.Normal,
        fontFamily = FontFamily.SansSerif,
        // Tabellarische Ziffern: sonst zappeln Werte bei jedem Update in der Breite.
        fontFeatureSettings = "tnum",
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

// Seiten-Punkte AN DER ELEMENT-POSITION, aktive Seite voll, die anderen blass (Vorschau EL_DOTS:
// Durchmesser 2,2 % der Breite, Abstand = Durchmesser, inaktiv 35 % Deckkraft).
//
// Bewusste Abweichung von Garmin: dort ignoriert _drawPageDots die x/y des Elements und zeichnet
// immer unten mittig. Für das Standard-Element (500/920) kommt genau dasselbe heraus, aber wer die
// Punkte verschiebt, sieht es hier — und nur so stimmt es mit der Vorschau. Garmins Festposition
// ist der Ausreißer; das gehört gemeldet, nicht nachgebaut.
private fun DrawScope.drawLayoutDots(
    idx: Int, count: Int, color: Color,
    x: Float, y: Float, w: Float, flags: Int,
) {
    val n = count.coerceIn(1, 12)
    if (n <= 1) return
    val d = w * 0.022f
    val step = d * 2f
    val total = (n - 1) * step
    val startX = when {
        (flags and 1) != 0 -> x + d / 2f
        (flags and 2) != 0 -> x - total - d / 2f
        else -> x - total / 2f
    }
    for (i in 0 until n) {
        drawCircle(
            color = if (i == idx) color else color.copy(alpha = 0.35f),
            radius = d / 2f, center = Offset(startX + i * step, y),
        )
    }
}

// REC-Indikator: Punkt + "REC" als Gruppe, ausgerichtet wie Text (Vorschau: Punkt 3 % der Breite,
// Schrift 5,5 %, Abstand halber Punkt).
private fun DrawScope.drawRecIndicator(
    measurer: TextMeasurer, x: Float, y: Float, w: Float, flags: Int, color: Color,
) {
    val d = maxOf(4f, w * 0.03f)
    val gap = d / 2f
    val style = TextStyle(
        fontSize = (maxOf(7f, w * 0.055f) / density).sp, color = color,
        fontFamily = FontFamily.SansSerif,
    )
    val res = measurer.measure("REC", style)
    val total = d + gap + res.size.width
    val left = when {
        (flags and 1) != 0 -> x
        (flags and 2) != 0 -> x - total
        else -> x - total / 2f
    }
    drawCircle(color = color, radius = d / 2f, center = Offset(left + d / 2f, y))
    drawText(res, topLeft = Offset(left + d + gap, y - res.size.height / 2f))
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
