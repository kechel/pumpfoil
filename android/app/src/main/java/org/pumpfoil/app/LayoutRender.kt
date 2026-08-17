package org.pumpfoil.app

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull

// LESENDE Vorschau eines eigenen Uhr-Layouts — kein Editor.
//
// Entscheidung Jan (2026-08-17): "den Layout-Editor brauchen wir nativ nicht, das macht man eh nur
// am pc". Anzeige, Galerie und Auswahl per Vorschau sollen aber gehen. Genau das ist diese Datei:
// sie ZEICHNET nur, sie bearbeitet nichts. Zum Bauen/Ändern verweisen die Apps auf den Browser.
//
// Spiegel von web/src/components/LayoutPreview.tsx + web/src/lib/watchLayout.ts. Beim Ändern dort
// muss es HIER mitgeändert werden — die Uhr ist die Wahrheit, Web und App sind zwei Nachbauten.
//
// Datenmodell (identisch zum Server, s. server/app/api/layouts.py):
//   Ein Element ist eine Liste: [typ, x, y, size, color, flags, extra, extra2]
//   x/y sind RELATIV 0…1000 (nicht Pixel) — dadurch passt ein Layout auf jede Auflösung.
//   flags: Bit0 linksbündig · Bit1 rechtsbündig · Bit2 Farbe nach Wert (nur Werte)
//   extra: bei Werten/Labels die Feld-ID, bei Freitext der Text, bei Linien der 2. Punkt (x in
//          extra, y in extra2).

private const val EL_VALUE = 1
private const val EL_LABEL = 2
private const val EL_TEXT = 3
private const val EL_LINE = 4
private const val EL_REC = 5
private const val EL_DOTS = 6
private const val EL_PAUSED = 7

/** Kuratierte Palette, Index = `color`. Spiegel von layouts.py PALETTE.
 *  Index 0 = „auto": die Uhr entscheidet (Werte weiß, Labels hellgrau). */
private val PALETTE = listOf(
    null,                                                     // 0 = auto
    0xFFFFFFFF, 0xFFD0D0D0, 0xFF808080, 0xFF000000,           // 1–4 Graustufen
    0xFFFF0000, 0xFFFF5500, 0xFFFFAA00, 0xFFFFFF00,           // 5–8 rot…gelb
    0xFF00FF00, 0xFF00AA00, 0xFF00FFFF, 0xFF22D3EE, 0xFF0055FF, // 9–13 grün…blau
)

/** Fontgröße als Anteil der Displaybreite, je Größenstufe.
 *  Abgeleitet aus watchLayout.ts: FONT_MEASURED[i]/SAMPLE_ADV/FONT_REF_W mit den dort gemessenen
 *  Breiten von „18.5" (29,46,50,61,64,82,99,146,166 px bei 280 px Display) und dem Fallback-Vorschub
 *  1,973. Bewusst dieselben Zahlen wie im Web — Web und App sollen gleich aussehen. */
private val SIZE_FACTOR = listOf(
    0.05249f, 0.08327f, 0.09051f, 0.11042f, 0.11585f, 0.14843f, 0.17920f, 0.26428f, 0.30049f,
)

/** Beispielwerte je Feld-ID — Spiegel von MOCK_VALUE in watchLayout.ts. Echte Textbreiten machen
 *  die Vorschau ehrlich: ein Layout, das im Editor passt, aber auf der Uhr überläuft, fällt so auf. */
private val MOCK_VALUE = mapOf(
    1 to "18.5", 5 to "19.2", 6 to "15.1", 7 to "24.0",
    2 to "142", 8 to "131", 9 to "168",
    3 to "12:34", 4 to "2.10", 10 to "402", 13 to "35",
    11 to "24", 12 to "14:25", 14 to "0:48", 15 to "0.21",
    16 to "0:51", 17 to "0.22", 18 to "14.9", 19 to "19.6", 20 to "7", 21 to "162",
)

private val SPEED_FIELDS = setOf(1, 5, 6, 7, 18, 19)
private val HR_FIELDS = setOf(2, 8, 9, 21)

private fun col(idx: Int, rolle: String): Color {
    val p = PALETTE.getOrNull(idx)
    if (p != null) return Color(p)
    // „auto": wie die Uhr — Werte weiß, alles andere hellgrau.
    return if (rolle == "value") Color.White else Color(0xFFD0D0D0)
}

/** Farbe nach Wert (flags Bit2): dieselben Schwellen wie die Uhr/Web, nur für Speed und Puls. */
private fun valueColor(fieldId: Int): Color? {
    val v = MOCK_VALUE[fieldId]?.toFloatOrNull() ?: return null
    if (fieldId in SPEED_FIELDS) return when {
        v < 12f -> Color(0xFF808080); v < 18f -> Color(0xFF00FFFF)
        v < 24f -> Color(0xFF00FF00); else -> Color(0xFFFFAA00)
    }
    if (fieldId in HR_FIELDS) return when {
        v < 120f -> Color(0xFF00FF00); v < 150f -> Color(0xFFFFFF00)
        v < 170f -> Color(0xFFFF5500); else -> Color(0xFFFF0000)
    }
    return null
}

private fun num(a: JsonArray, i: Int): Float =
    (a.getOrNull(i) as? JsonPrimitive)?.doubleOrNull?.toFloat() ?: 0f

private fun int(a: JsonArray, i: Int): Int =
    (a.getOrNull(i) as? JsonPrimitive)?.intOrNull ?: 0

private fun str(a: JsonArray, i: Int): String =
    (a.getOrNull(i) as? JsonPrimitive)?.contentOrNull ?: ""

/**
 * Zeichnet ein Layout so, wie die Uhr es zeichnen würde.
 *
 * @param elements Elemente wie vom Server geliefert.
 * @param bgColor  Hintergrund-Palettenindex (0 = schwarz).
 * @param shape    "round" | "rect" | "semioctagon" — bestimmt die Maske.
 * @param w,h      Zielauflösung, nur fürs Seitenverhältnis.
 * @param px       Breite auf dem Bildschirm.
 * @param pageCount/pageIndex  Für die Seiten-Punkte: die sind auf der Uhr DYNAMISCH. Wer den echten
 *        Wert kennt, gibt ihn mit — sonst lügt die Vorschau über die Anzahl (im Web real passiert:
 *        Vorschau 3 Punkte, Uhr 5).
 *
 * ABWEICHUNG, bewusst: Labels zeigen `field.<id>` statt der KURZEN Uhr-Texte (`fw.<id>` im Web).
 * Die Kurzformen liegen nur in den Uhr-Sprachdateien, nicht in der App-i18n; sie hier nachzuziehen
 * wären 20 Keys × 16 Sprachen. Für den Zweck — ein Layout wiedererkennen — genügt der lange Name,
 * er ist nur etwas breiter.
 */
@Composable
fun WatchLayoutPreview(
    elements: List<JsonArray>,
    bgColor: Int,
    shape: String,
    w: Int,
    h: Int,
    px: Dp = 120.dp,
    pageCount: Int = 3,
    pageIndex: Int = 0,
) {
    val messer = rememberTextMeasurer()
    val boxW = px
    val boxH = px * (if (w > 0) h.toFloat() / w.toFloat() else 1f)
    Box(Modifier.size(boxW, boxH)) {
        Canvas(Modifier.size(boxW, boxH)) {
            val bg = if (bgColor == 0) Color.Black else col(bgColor, "value")
            clipPath(maske(shape, size.width, size.height)) {
                drawRect(bg)
                // Trennlinien zuerst — sie liegen hinter dem Text.
                elements.filter { int(it, 0) == EL_LINE }.forEach { e ->
                    drawLine(
                        color = col(int(e, 4), "line"),
                        start = Offset(num(e, 1) / 1000f * size.width, num(e, 2) / 1000f * size.height),
                        end = Offset(num(e, 6) / 1000f * size.width, num(e, 7) / 1000f * size.height),
                        strokeWidth = maxOf(1f, num(e, 3)),
                    )
                }
                elements.forEach { e ->
                    val typ = int(e, 0)
                    if (typ == EL_LINE) return@forEach
                    val x = num(e, 1) / 1000f * size.width
                    val y = num(e, 2) / 1000f * size.height
                    val flags = int(e, 5)
                    when (typ) {
                        EL_VALUE -> {
                            val fid = int(e, 6)
                            val farbe = (if (flags and 4 != 0) valueColor(fid) else null)
                                ?: col(int(e, 4), "value")
                            text(messer, MOCK_VALUE[fid] ?: "--", x, y, stufe(e), farbe, flags, true)
                        }
                        EL_LABEL -> text(messer, I18n.t("field.${int(e, 6)}"), x, y, stufe(e),
                            col(int(e, 4), "label"), flags, false)
                        EL_TEXT -> text(messer, str(e, 6), x, y, stufe(e),
                            col(int(e, 4), "label"), flags, false)
                        EL_PAUSED -> text(messer, I18n.t("lay.pausedHint"), x, y, stufe(e),
                            col(int(e, 4), "label"), flags, true)
                        EL_REC -> {
                            val c = col(if (int(e, 4) == 0) 5 else int(e, 4), "value")
                            val r = maxOf(2f, size.width * 0.015f)
                            drawCircle(c, r, Offset(x, y))
                            text(messer, "REC", x + r * 2.5f, y, 0, c, 1, false)
                        }
                        EL_DOTS -> {
                            val c = col(if (int(e, 4) == 0) 2 else int(e, 4), "label")
                            val r = maxOf(1.5f, size.width * 0.011f)
                            val n = pageCount.coerceIn(1, 12)
                            val abstand = r * 4f
                            val start = x - (n - 1) * abstand / 2f
                            for (d in 0 until n) {
                                drawCircle(c.copy(alpha = if (d == pageIndex) 1f else 0.35f), r,
                                    Offset(start + d * abstand, y))
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun stufe(e: JsonArray) = int(e, 3).coerceIn(0, SIZE_FACTOR.size - 1)

/** Maske je Gehäuseform. semioctagon = Instinct-Klasse (rund mit abgeflachtem Segment). */
private fun maske(shape: String, w: Float, h: Float): Path = Path().apply {
    when (shape) {
        "round" -> addOval(androidx.compose.ui.geometry.Rect(0f, 0f, w, h))
        "semioctagon" -> {
            moveTo(0.22f * w, 0f); lineTo(0.78f * w, 0f); lineTo(w, 0.22f * h)
            lineTo(w, 0.78f * h); lineTo(0.78f * w, h); lineTo(0.22f * w, h)
            lineTo(0f, 0.78f * h); lineTo(0f, 0.22f * h); close()
        }
        else -> addRoundRect(androidx.compose.ui.geometry.RoundRect(
            0f, 0f, w, h,
            androidx.compose.ui.geometry.CornerRadius(0.14f * w, 0.14f * w)))
    }
}

/** Text an relativer Position. Die Uhr zentriert um den Punkt; flags kippen auf links/rechts. */
private fun DrawScope.text(
    messer: TextMeasurer, s: String, x: Float, y: Float, stufe: Int,
    farbe: Color, flags: Int, fett: Boolean,
) {
    if (s.isEmpty()) return
    val groesse = maxOf(7f, SIZE_FACTOR[stufe] * size.width)
    val stil = TextStyle(color = farbe, fontSize = groesse.toSp(),
        fontWeight = if (fett) FontWeight.Bold else FontWeight.Normal)
    val gemessen = messer.measure(s, stil)
    val bx = when {
        flags and 1 != 0 -> x                                   // linksbündig
        flags and 2 != 0 -> x - gemessen.size.width             // rechtsbündig
        else -> x - gemessen.size.width / 2f                    // zentriert (Standard)
    }
    drawText(gemessen, topLeft = Offset(bx, y - gemessen.size.height / 2f))
}
