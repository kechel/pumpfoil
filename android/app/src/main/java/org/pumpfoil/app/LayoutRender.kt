package org.pumpfoil.app

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
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
// Wert-Grafiken (Spiegel von watchLayout.ts EL_ARC/EL_BAR):
//   8 = Rand-Grafik: x = Start auf dem Display-UMFANG (0…1000 ab 12 Uhr im Uhrzeigersinn),
//       y = Laenge desselben Umfangs, size = Dicke 1…4, extra = Feld-ID.
//       Runde Uhr -> Ringsegment, eckige -> Rahmensegment. Das entscheidet DIESER Renderer aus
//       der Gehaeuseform, nicht der Autor des Layouts.
//   9 = Balken: x/y = Mitte, size = Dicke, extra = Feld-ID, extra2 = Breite 50…1000.
// flags Bit0 faerbt beide nach Zone/Skala (bei Grafiken hat Bit0 also NICHT die Text-Bedeutung
// „linksbuendig" — Grafiken haben keine Ausrichtung).
private const val EL_ARC = 8
private const val EL_BAR = 9

/** Kuratierte Palette, Index = `color`. Spiegel von layouts.py PALETTE.
 *  Index 0 = „auto": die Uhr entscheidet (Werte weiß, Labels hellgrau). */
private val PALETTE = listOf(
    null,                                                     // 0 = auto
    0xFFFFFFFF, 0xFFD0D0D0, 0xFF808080, 0xFF000000,           // 1–4 Graustufen
    0xFFFF0000, 0xFFFF5500, 0xFFFFAA00, 0xFFFFFF00,           // 5–8 rot…gelb
    0xFF00FF00, 0xFF00AA00, 0xFF00FFFF, 0xFF22D3EE, 0xFF0055FF, // 9–13 grün…blau
    0xFFAA00FF, 0xFFFF00AA,                                   // 14–15 violett/magenta
)

/** Zonen-Farben Z1…Z5 für die Wert-Grafiken (Spiegel von ZONE_COLORS in watchLayout.ts). */
private val ZONE_COLORS = listOf(
    Color(0xFF3B82F6), Color(0xFF22C55E), Color(0xFFEAB308), Color(0xFFF97316), Color(0xFFEF4444),
)

/**
 * Skalen der Wert-Grafiken. Puls-Zonen kommen aus dem PROFIL (`settings.hr_zones`) — nur Garmin
 * und Zepp können die Zonen der Uhr selbst lesen, Wear OS und watchOS haben keine API dafür.
 * Bewusst ein gemeinsamer Zustand statt eines Parameters an jeder Vorschau: die Skala ist eine
 * Eigenschaft des NUTZERS, nicht des einzelnen Layouts, und wird an drei Stellen gezeichnet.
 */
object LayoutScales {
    var hrZones: List<Int> = listOf(95, 114, 133, 152, 171, 190)
    var speedLo: Int = 8
    var speedHi: Int = 25

    fun aus(s: kotlinx.serialization.json.JsonObject) {
        val z = (s["hr_zones"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.intOrNull }
        if (z != null && z.size == 6) hrZones = z
        (s["speed_min"] as? JsonPrimitive)?.intOrNull?.let { if (it > 0) speedLo = it }
        (s["speed_max"] as? JsonPrimitive)?.intOrNull?.let { if (it > 0) speedHi = it }
    }
}

/** Füllgrad 0…1 eines Wertes auf seiner Skala (außerhalb wird gekappt, nicht extrapoliert). */
private fun fuellgrad(fieldId: Int, v: Float): Float {
    val lo: Float; val hi: Float
    if (fieldId in HR_FIELDS) {
        lo = LayoutScales.hrZones.first().toFloat(); hi = LayoutScales.hrZones.last().toFloat()
    } else {
        lo = LayoutScales.speedLo.toFloat(); hi = LayoutScales.speedHi.toFloat()
    }
    if (hi <= lo) return 0f
    return ((v - lo) / (hi - lo)).coerceIn(0f, 1f)
}

/** Zone 0…4 eines Wertes. Geschwindigkeit hat im Profil keine Zonen -> Spanne in 5 Stufen. */
private fun zone(fieldId: Int, v: Float): Int {
    val grenzen = if (fieldId in HR_FIELDS) LayoutScales.hrZones.map { it.toFloat() }
    else (0..5).map { LayoutScales.speedLo + (LayoutScales.speedHi - LayoutScales.speedLo) * it / 5f }
    var z = 0
    for (i in 1 until grenzen.size - 1) if (v >= grenzen[i]) z = i
    return z.coerceIn(0, ZONE_COLORS.size - 1)
}

/** Punkt auf dem Display-RAND, Parameter 0…1 ab 12 Uhr im Uhrzeigersinn. Rund -> Kreis,
 *  eckig -> Rechteck-Umfang (Spiegel von edgePoint in watchLayout.ts). */
private fun randPunkt(rund: Boolean, w: Float, h: Float, inset: Float, p: Float): Offset {
    val f = ((p % 1f) + 1f) % 1f
    if (rund) {
        val a = f * 2f * Math.PI.toFloat() - Math.PI.toFloat() / 2f
        return Offset(w / 2f + (w / 2f - inset) * kotlin.math.cos(a),
                      h / 2f + (h / 2f - inset) * kotlin.math.sin(a))
    }
    val bw = w - 2 * inset; val bh = h - 2 * inset
    var d = f * 2f * (bw + bh)
    if (d < bw / 2f) return Offset(inset + bw / 2f + d, inset)
    d -= bw / 2f
    if (d < bh) return Offset(w - inset, inset + d)
    d -= bh
    if (d < bw) return Offset(w - inset - d, h - inset)
    d -= bw
    if (d < bh) return Offset(inset, h - inset - d)
    d -= bh
    return Offset(inset + d, inset)
}

/** Randsegment als Pfad (Start/Länge in 0…1000). Gesampelt, damit rund und eckig EINEN Weg gehen. */
private fun randPfad(rund: Boolean, w: Float, h: Float, inset: Float, start: Float, laenge: Float): Path {
    val l = (laenge / 1000f).coerceIn(0f, 1f)
    val s0 = (start % 1000f) / 1000f
    val n = maxOf(6, (l * 120f).toInt())
    return Path().apply {
        for (i in 0..n) {
            val pt = randPunkt(rund, w, h, inset, s0 + l * i / n)
            if (i == 0) moveTo(pt.x, pt.y) else lineTo(pt.x, pt.y)
        }
    }
}

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
                // Wert-Grafiken vor dem Text: leerer Track + gefüllter Anteil, damit die Skala
                // auch bei kleinem Wert erkennbar bleibt.
                elements.filter { int(it, 0) == EL_ARC || int(it, 0) == EL_BAR }.forEach { e ->
                    val fid = int(e, 6)
                    val wert = MOCK_VALUE[fid]?.toFloatOrNull() ?: 0f
                    val anteil = fuellgrad(fid, wert)
                    val nachSkala = int(e, 5) and 1 != 0
                    val farbe = if (nachSkala) ZONE_COLORS[zone(fid, wert)] else col(int(e, 4), "value")
                    val dicke = maxOf(2f, size.width * 0.018f * int(e, 3).coerceIn(1, 4))
                    if (int(e, 0) == EL_ARC) {
                        val rund = shape != "rect"
                        val inset = dicke / 2f + 1f
                        val laenge = num(e, 2).coerceIn(0f, 1000f)
                        drawPath(randPfad(rund, size.width, size.height, inset, num(e, 1), laenge),
                            farbe.copy(alpha = 0.25f), style = Stroke(width = dicke))
                        if (anteil > 0f) {
                            drawPath(randPfad(rund, size.width, size.height, inset, num(e, 1), laenge * anteil),
                                farbe, style = Stroke(width = dicke))
                        }
                    } else {
                        val breite = num(e, 7).coerceIn(50f, 1000f) / 1000f * size.width
                        val x0 = num(e, 1) / 1000f * size.width - breite / 2f
                        val y0 = num(e, 2) / 1000f * size.height - dicke / 2f
                        val ecke = androidx.compose.ui.geometry.CornerRadius(dicke / 2f)
                        drawRoundRect(farbe.copy(alpha = 0.25f), Offset(x0, y0),
                            androidx.compose.ui.geometry.Size(breite, dicke), ecke)
                        if (anteil > 0f) {
                            drawRoundRect(farbe, Offset(x0, y0),
                                androidx.compose.ui.geometry.Size(maxOf(dicke, breite * anteil), dicke), ecke)
                        }
                    }
                }
                elements.forEach { e ->
                    val typ = int(e, 0)
                    if (typ == EL_LINE || typ == EL_ARC || typ == EL_BAR) return@forEach
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
