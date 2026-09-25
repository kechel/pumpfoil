package org.pumpfoil.app

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.unit.dp
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/*
 * Das Foil als Zeichnung — Seitenansicht, Frontansicht, Draufsicht. Portiert aus der PWA
 * (web/src/components/FoilRig.tsx) am 25.09.2026; Formeln, Masse und Farben wie dort, und die
 * Begruendungen stehen dort ausfuehrlich — hier nur, was fuer die Uebertragung wichtig ist.
 *
 * MASSSTAEBLICH, in echten Zentimetern: Spannweite und Flaeche aus dem Katalog, Mast- und
 * Boardlaenge aus dem Setup der Session. KOORDINATEN: x nach vorn, y nach steuerbord, z nach
 * oben, Nullpunkt ist der FRONTFLUEGEL — in allen drei Ansichten der Drehpunkt.
 *
 * Der SVG-Weg (y nach unten, Drehung positiv = im Uhrzeigersinn) ist derselbe wie der des
 * Compose-Canvas, deshalb gehen die Transformationen 1:1 durch: `P(a, z)` = Offset(a, -z).
 * Die Linienstaerken sind — wie `vector-effect: non-scaling-stroke` im Web — in Bildpunkten,
 * nicht in Zentimetern (geteilt durch den Massstab).
 */

private const val MAST_TIEFE = 12f
private const val MAST_DICKE = 1.8f
private const val BOARD_DICKE = 8f
private const val RUMPF_DICKE = 2.4f
// Nur in der Frontansicht: Fluegeldicke und Mastbreite ueberhoeht, sonst Haarlinien (s. PWA).
private const val FRONT_UEBERHOEHUNG = 2.6f

private val FARBE_BOARD = Color(0xFF06B6D4)   // brand-500
private val FARBE_TEIL = Color(0xFF94A3B8)    // slate-400
private val FARBE_MAST = Color(0xFF64748B)    // slate-500
// DER STAB IST BLAU (Jan, 25.09.2026): damit sieht man, ob er vor oder hinter dem Foil liegt,
// und damit, von wo man schaut. Nur die Farbe — Form und Masse wie der Frontfluegel-Stil.
private val FARBE_STAB = Color(0xFF0EA5E9)    // sky-500

private fun breiteAusLaenge(len: Float) = max(38f, min(52f, len * 0.55f))
private fun p(a: Float, z: Float) = Offset(a, -z)
private fun o(y: Float, x: Float) = Offset(y, -x)

private fun Path.m(q: Offset) = moveTo(q.x, q.y)
private fun Path.l(q: Offset) = lineTo(q.x, q.y)
private fun Path.q(c: Offset, e: Offset) = quadraticBezierTo(c.x, c.y, e.x, e.y)
private fun Path.c(c1: Offset, c2: Offset, e: Offset) = cubicTo(c1.x, c1.y, c2.x, c2.y, e.x, e.y)

/** Fluegelprofil von der SEITE: Nase nach +x, gewoelbte Oberseite, spitze Hinterkante. */
private fun profilSeite(cx: Float, cz: Float, tiefe: Float) = Path().apply {
    val t = tiefe * 0.19f
    m(p(cx + tiefe / 2, cz))
    c(p(cx + tiefe * 0.2f, cz + t), p(cx - tiefe * 0.2f, cz + t * 0.8f), p(cx - tiefe / 2, cz))
    c(p(cx - tiefe * 0.2f, cz - t * 0.25f), p(cx + tiefe * 0.2f, cz - t * 0.5f), p(cx + tiefe / 2, cz))
    close()
}

/** Fluegel von VORN: flache Sichel, Spitzen tiefer als die Wurzel (Anhedral). */
private fun fluegelVorn(span: Float, tiefe: Float, z: Float) = Path().apply {
    val b = span / 2
    val sack = span * 0.07f
    val t = tiefe * 0.16f * FRONT_UEBERHOEHUNG
    val zSpitze = z - sack
    m(p(-b, zSpitze))
    q(p(0f, z + 2 * t + sack), p(b, zSpitze))
    q(p(0f, z - 0.6f * t + sack), p(-b, zSpitze))
    close()
}

/** Fluegel von OBEN: nach hinten gepfeilt, Spitzen schmaler als die Wurzel. */
private fun fluegelOben(span: Float, tiefe: Float, x: Float) = Path().apply {
    val b = span / 2
    val leWurzel = x + tiefe * 0.5f; val teWurzel = x - tiefe * 0.5f
    val leSpitze = x - tiefe * 0.35f; val teSpitze = x - tiefe * 0.75f
    m(o(-b, leSpitze))
    q(o(0f, 2 * leWurzel - leSpitze), o(b, leSpitze))
    l(o(b, teSpitze))
    q(o(0f, 2 * teWurzel - teSpitze), o(-b, teSpitze))
    close()
}

private fun boardSeite(len: Float, zUnten: Float) = Path().apply {
    val a = len / 2; val d = BOARD_DICKE
    m(p(-a, zUnten + d * 0.25f))
    l(p(a * 0.72f, zUnten))
    q(p(a, zUnten + d * 0.2f), p(a * 0.9f, zUnten + d))
    l(p(-a, zUnten + d))
    close()
}

private fun boardOben(len: Float, breite: Float) = Path().apply {
    val a = len / 2; val b = breite / 2
    m(o(0f, a))
    c(o(b * 0.85f, a * 0.5f), o(b, -a * 0.2f), o(b * 0.75f, -a))
    l(o(-b * 0.75f, -a))
    c(o(-b, -a * 0.2f), o(-b * 0.85f, a * 0.5f), o(0f, a))
    close()
}

/**
 * Bildausschnitt, der das Rig ueber den ganzen erwarteten Winkelbereich fasst — einmal ueber den
 * Bereich gedreht und die Huelle genommen, damit der Ausschnitt beim Abspielen still steht.
 * Liefert ein Rechteck in Bildkoordinaten (y nach unten).
 */
private fun rahmen(punkte: List<Pair<Float, Float>>, maxWinkel: Float, rand: Float = 7f): Rect {
    var x0 = Float.MAX_VALUE; var x1 = -Float.MAX_VALUE; var z0 = Float.MAX_VALUE; var z1 = -Float.MAX_VALUE
    var a = -maxWinkel
    while (a <= maxWinkel + 1e-6f) {
        val r = a * PI.toFloat() / 180f; val c = cos(r); val s = sin(r)
        for ((x, z) in punkte) {
            val xx = x * c - z * s; val zz = x * s + z * c
            x0 = min(x0, xx); x1 = max(x1, xx); z0 = min(z0, zz); z1 = max(z1, zz)
        }
        a += 5f
    }
    return Rect(x0 - rand, -(z1 + rand), x1 + rand, -(z0 - rand))
}

/** Zeichnet `inhalt` in Welt-Zentimetern, eingepasst in `box` (wie preserveAspectRatio meet). */
private fun DrawScope.inBox(box: Rect, inhalt: DrawScope.(pxJeCm: Float) -> Unit) {
    val s = min(size.width / box.width, size.height / box.height)
    val dx = (size.width - box.width * s) / 2 - box.left * s
    val dy = (size.height - box.height * s) / 2 - box.top * s
    withTransform({
        translate(dx, dy)
        scale(s, s, pivot = Offset.Zero)
    }) { inhalt(s) }
}

/** Gestrichelte Wasserlinie (Mitte des Masts) + Drehpunkt-Kreis am Frontfluegel. */
private fun DrawScope.bezug(hoehe: Float, pxJeCm: Float, farbe: Color) {
    val w = 1f / pxJeCm
    drawLine(farbe, Offset(-400f, -hoehe), Offset(400f, -hoehe), strokeWidth = w,
        pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f * w, 7f * w)))
    drawCircle(farbe, radius = 3.2f, center = Offset.Zero, style = Stroke(width = 1.4f * w))
}

/** SEITENANSICHT fuer das Nicken (Nase rechts). `hub` hebt/senkt das Rig gegen die Linie. */
@Composable
fun SeitenAnsicht(rig: FoilRigMasse, pitch: Double, hub: Double = 0.0, hubBereich: Double = 0.0, linie: Color) {
    val m = rig.mastLenCm.toFloat(); val a = rig.boardLenCm.toFloat() / 2; val hb = hubBereich.toFloat()
    val box = rahmen(listOf(
        a to m + BOARD_DICKE + hb, -a to m + BOARD_DICKE + hb, -a to m,
        (rig.xStabCm - rig.stabChordCm).toFloat() to -hb, rig.foilChordCm.toFloat() to -hb,
    ), 25f)
    Canvas(Modifier.fillMaxWidth().height(140.dp)) {
        inBox(box) { k ->
            bezug(m / 2, k, linie)
            translate(0f, -hub.toFloat()) {
                rotate(-pitch.toFloat(), pivot = Offset.Zero) {
                    drawPath(boardSeite(rig.boardLenCm.toFloat(), m), FARBE_BOARD)
                    val xm = rig.xMastCm.toFloat()
                    drawPath(Path().apply {
                        m(p(xm + MAST_TIEFE / 2, m)); l(p(xm + MAST_TIEFE * 0.4f, 0f))
                        l(p(xm - MAST_TIEFE * 0.4f, 0f)); l(p(xm - MAST_TIEFE / 2, m)); close()
                    }, FARBE_MAST)
                    val xs = rig.xStabCm.toFloat(); val xf = rig.xFoilCm.toFloat()
                    drawRoundRect(FARBE_MAST, topLeft = Offset(xs, -RUMPF_DICKE / 2),
                        size = androidx.compose.ui.geometry.Size(xf - xs, RUMPF_DICKE),
                        cornerRadius = CornerRadius(RUMPF_DICKE / 2))
                    drawPath(profilSeite(xf, 0f, rig.foilChordCm.toFloat()), FARBE_TEIL)
                    drawPath(profilSeite(xs, 0f, rig.stabChordCm.toFloat()), FARBE_STAB)
                }
            }
        }
    }
}

/**
 * FRONTANSICHT fuer das Rollen — BLICK VON HINTEN, mit der Hoehenverschiebung aus dem Nicken
 * (z·cos + x·sin). Rollen dreht ANDERSHERUM als Nicken: von hinten gesehen ist die Querachse
 * gespiegelt (an einer echten Aufnahme geeicht, 21.09.). Der Stab ist das naehere Teil und wird
 * zuletzt gezeichnet.
 */
@Composable
fun FrontAnsicht(rig: FoilRigMasse, roll: Double, pitch: Double, linie: Color) {
    val r = pitch * PI / 180; val c = cos(r).toFloat(); val s = sin(r).toFloat()
    fun hoehe(x: Double, z: Double) = (z * c + x * s).toFloat()
    val bBoard = breiteAusLaenge(rig.boardLenCm.toFloat())
    val m = rig.mastLenCm.toFloat()
    val zBoard = hoehe(rig.xMastCm, rig.mastLenCm)
    val zMastFuss = hoehe(rig.xMastCm, 0.0)
    val zStab = hoehe(rig.xStabCm, 0.0)
    val halb = max(rig.foilSpanCm.toFloat(), bBoard) / 2
    val box = rahmen(listOf(
        halb to 0f, -halb to 0f, bBoard / 2 to m + BOARD_DICKE, -bBoard / 2 to m + BOARD_DICKE,
        0f to -rig.foilSpanCm.toFloat() * 0.07f,
    ), 40f)
    Canvas(Modifier.fillMaxWidth().height(140.dp)) {
        inBox(box) { k ->
            bezug(m / 2, k, linie)
            rotate(roll.toFloat(), pivot = Offset.Zero) {
                drawRoundRect(FARBE_BOARD, topLeft = Offset(-bBoard / 2, -(zBoard + BOARD_DICKE)),
                    size = androidx.compose.ui.geometry.Size(bBoard, BOARD_DICKE),
                    cornerRadius = CornerRadius(BOARD_DICKE / 2.2f))
                val mb = MAST_DICKE * FRONT_UEBERHOEHUNG
                drawRect(FARBE_MAST, topLeft = Offset(-mb / 2, -zBoard),
                    size = androidx.compose.ui.geometry.Size(mb, max(1f, zBoard - zMastFuss)))
                drawPath(fluegelVorn(rig.foilSpanCm.toFloat(), rig.foilChordCm.toFloat(),
                    hoehe(rig.xFoilCm, 0.0)), FARBE_TEIL)
                drawPath(fluegelVorn(rig.stabSpanCm.toFloat(), rig.stabChordCm.toFloat(), zStab), FARBE_STAB)
            }
        }
    }
}

/** DRAUFSICHT fuer das Gieren. Nase oben; Rechtskurve = positiv = im Uhrzeigersinn. */
@Composable
fun DraufAnsicht(rig: FoilRigMasse, yaw: Double, linie: Color) {
    val bBoard = breiteAusLaenge(rig.boardLenCm.toFloat())
    val halb = max(rig.foilSpanCm.toFloat(), bBoard) / 2
    val box = rahmen(listOf(
        halb to 0f, -halb to 0f, 0f to rig.boardLenCm.toFloat() / 2,
        0f to (rig.xStabCm - rig.stabChordCm).toFloat(),
    ), 40f)
    Canvas(Modifier.fillMaxWidth().height(140.dp)) {
        inBox(box) { k ->
            bezug(0f, k, linie)
            rotate(yaw.toFloat(), pivot = Offset.Zero) {
                val xf = rig.xFoilCm.toFloat(); val xs = rig.xStabCm.toFloat()
                drawRect(FARBE_MAST, topLeft = Offset(-RUMPF_DICKE / 2, -xf),
                    size = androidx.compose.ui.geometry.Size(RUMPF_DICKE, max(1f, xf - xs)))
                drawPath(fluegelOben(rig.foilSpanCm.toFloat(), rig.foilChordCm.toFloat(), xf), FARBE_TEIL)
                drawPath(fluegelOben(rig.stabSpanCm.toFloat(), rig.stabChordCm.toFloat(), xs), FARBE_STAB)
                // Brett zuletzt und halbdurchsichtig: es liegt oben, das Foil soll durchscheinen.
                drawPath(boardOben(rig.boardLenCm.toFloat(), bBoard), FARBE_BOARD.copy(alpha = 0.75f))
            }
        }
    }
}
