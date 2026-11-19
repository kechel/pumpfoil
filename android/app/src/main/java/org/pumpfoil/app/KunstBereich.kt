package org.pumpfoil.app

import android.graphics.BitmapFactory
import android.media.AudioAttributes
import android.media.MediaPlayer
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.floatOrNull
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.roundToInt
import kotlin.math.sin

/*
 * GPS-Kunst-Event (18.11.2026), nativ aus web/src/components/KunstBereich.tsx (Server app/api/kunst.py, app/kunst.py):
 * „Wer malt das coolste Bild aufs Wasser?" Runden mit Einreichen -> Abstimmen (anonym, bis zu 3 Herzen, Zwischenstand
 * verborgen) -> Aufloesung mit Namen, Treppchen und Fanfare. Die Linie kommt normiert vom Server (0..1000, ohne
 * Koordinaten); im Editor wird dieselbe Rechnung zur Vorschau gemacht (normiere).
 * Nicht in der App (nur Web/Admins): Testmodus und die Moderation (entfernen/zurueckholen). Melden darf jeder.
 * 19.11.2026 (Web): Enthuellung im Vollbild (Platz 3, 2, 1), Karte als Bild vom Server (karte.png) statt interaktiver
 * Karte, Doppeltipp = Herz, „Abspielen" und gemerktes Bild|Karte in der Ergebnis-Galerie, Admins: Karte schon beim Abstimmen.
 */

/** Vorlage eines GPS-Kunst-Events (Web lib/teamEvents.ts KUNST_VORLAGE). */
internal const val KUNST_VORLAGE = "gpskunst"

// ---------------------------------------------------------------------------- Datenmodell ----
// Linien kommen in zwei Formen: ein Strich [[x,y],…] (aeltere Bilder) oder Striche [[[x,y],…],…] — deshalb JsonElement.

@Serializable
data class KunstBild(
    val id: Int = 0,
    val linie: JsonElement = JsonArray(emptyList()),
    val eigen: Boolean = false,
    val herz: Boolean = false,
    val entfernt: String? = null,
    val karte: Boolean? = null,    // nur fuer Admins: Ort darf auf der Karte gezeigt werden
)

@Serializable
data class KunstEigen(
    val id: Int = 0,
    val linie: JsonElement = JsonArray(emptyList()),
    @SerialName("session_id") val sessionId: Int = 0,
    @SerialName("von_ms") val vonMs: Long = 0,
    @SerialName("bis_ms") val bisMs: Long = 0,
    val drehung: Int = 0,
    val entfernt: String? = null,
)

@Serializable
data class KunstErgebnis(
    @SerialName("bild_id") val bildId: Int = 0,
    val platz: Int = 0,
    val herzen: Int = 0,
    @SerialName("session_id") val sessionId: Int? = null,
    val linie: JsonElement = JsonArray(emptyList()),
    val name: String? = null,
    val spot: String? = null,
    val karte: Boolean = false,
    val foto: String? = null,      // erstes sichtbares Session-Foto, relativ (/media/...)
    val laeufe: List<KunstLaufWert>? = null,   // je Strich: Dauer und Strecke des Laufs (Lauf-Zaehler)
)

/** Werte eines Laufs fuer den Zaehler: s = Sekunden, m = Meter (Double, falls der Server mal Kommazahlen schickt). */
@Serializable
data class KunstLaufWert(val s: Double = 0.0, val m: Double = 0.0)

@Serializable
data class KunstRunde(
    val nr: Int = 0,
    val start: String = "",
    val ende: String = "",
    @SerialName("einreichen_bis") val einreichenBis: String? = null,
    @SerialName("abstimmen_bis") val abstimmenBis: String = "",
    val phase: String = "kommt",   // kommt | einreichen | abstimmen | fertig
    val anzahl: Int = 0,
    @SerialName("herzen_vergeben") val herzenVergeben: Int = 0,
    val galerie: List<KunstBild> = emptyList(),
    val ergebnis: List<KunstErgebnis>? = null,
    val eigen: KunstEigen? = null,
)

@Serializable
data class KunstEvent(
    @SerialName("event_id") val eventId: Int = 0,
    val titel: String = "",
    @SerialName("herzen_je_runde") val herzenJeRunde: Int = 3,
    val teilnehmen: Boolean = false,
    val moderieren: Boolean = false,
    val admin: Boolean = false,
    val runden: List<KunstRunde> = emptyList(),
)

@Serializable
data class KunstKandidat(
    val id: Int = 0,
    @SerialName("started_at") val startedAt: String = "",
    @SerialName("sport_class") val sportClass: String? = null,
    val caption: String? = null,
    val vorschau: JsonElement = JsonArray(emptyList()),
)

/** Ganze Session fuers Zuschneiden: punkte [[t_ms, x_m, y_m]], laeufe [[von_ms, bis_ms]]. */
@Serializable
data class KunstSpur(
    @SerialName("session_id") val sessionId: Int = 0,
    val punkte: List<List<Double>> = emptyList(),
    val laeufe: List<List<Double>> = emptyList(),
)

// ------------------------------------------------------------------------------ Zeichnen ----

private const val BOX = 1000f
// Winternacht (Web 18.11.2026): flaches Nachtblau, Schneeflocken je Bild fest verteilt (Saat = Bild-id), Track in
// Marken-Cyan mit leichtem Leuchten darunter.
private val NACHT = Color(0xFF0B1A33)
private val CYAN = Color(0xFF22D3EE)
// Rahmen der Vollbild-Ansichten: feste Farben, sieht in beiden Farbschemata gleich aus (Web).
private val DUNKEL = Color(0xFF020617)
private val HELL_TEXT = Color(0xFFE2E8F0)

private class Flocke(val x: Float, val y: Float, val r: Float, val o: Float)

/** Dieselbe LCG wie Web `schnee()`, damit die Flocken in App und Web an denselben Stellen sitzen. */
private fun schnee(saat: Int): List<Flocke> {
    val m = 4294967296L
    var z = Math.floorMod(saat.toLong() * 2654435761L, m)
    if (z == 0L) z = 1L
    fun zufall(): Float { z = (z * 1664525L + 1013904223L) % m; return (z.toDouble() / m).toFloat() }
    return List(46) {
        val x = zufall() * BOX; val y = zufall() * BOX; val r = 3f + zufall() * 6f; val o = 0.25f + zufall() * 0.55f
        Flocke(x, y, r, o)
    }
}

/** Einzelner Strich (aeltere Bilder) oder mehrere (ein Strich je Lauf) -> immer Liste von Strichen. */
private fun alsStriche(l: JsonElement): List<List<Offset>> {
    val a = l as? JsonArray ?: return emptyList()
    if (a.isEmpty()) return emptyList()
    fun punkt(p: JsonElement): Offset? {
        val q = p as? JsonArray ?: return null
        if (q.size < 2) return null
        val x = (q[0] as? JsonPrimitive)?.floatOrNull ?: return null
        val y = (q[1] as? JsonPrimitive)?.floatOrNull ?: return null
        return Offset(x, y)
    }
    val mehrere = a.any { (it as? JsonArray)?.firstOrNull() is JsonArray }
    return if (mehrere) a.map { st -> (st as? JsonArray)?.mapNotNull(::punkt) ?: emptyList() } else listOf(a.mapNotNull(::punkt))
}

@Composable
private fun KunstLinie(linie: JsonElement, saat: Int, modifier: Modifier = Modifier, klein: Boolean = false,
                       fortschritt: Float? = null) {
    val striche = remember(linie) { alsStriche(linie) }
    KunstLinie(striche, saat, modifier, klein, fortschritt)
}

/** Bildkachel (Web KunstLinie): quadratisch, Nachtblau, Schnee, Track zweimal (breites Leuchten + Linie).
 *  `fortschritt` 0..1: die Linie wird „gefahren" (Web `zeichnen`) — Striche nacheinander, Zeitanteil nach Laenge;
 *  spaetere Striche sind unsichtbar, bis sie dran sind. Ohne `fortschritt` steht sie sofort da. */
@Composable
private fun KunstLinie(striche: List<List<Offset>>, saat: Int, modifier: Modifier = Modifier, klein: Boolean = false,
                       fortschritt: Float? = null) {
    val flocken = remember(saat) { schnee(saat) }
    val dick = if (klein) 30f else 22f
    val laengen = remember(striche) { strichLaengen(striche) }
    Canvas(modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(8.dp)).background(NACHT)) {
        val k = size.width / BOX
        flocken.forEach { f -> drawCircle(Color.White, f.r * k, Offset(f.x * k, f.y * k), alpha = f.o) }
        val gesamt = laengen.sum()
        var vorher = 0f
        val pfade = striche.indices.mapNotNull { j ->
            val st = striche[j]; val len = laengen[j]; val start = vorher
            vorher += len
            if (st.size < 2) return@mapNotNull null
            val weg = if (fortschritt == null) len else (fortschritt * gesamt - start).coerceAtMost(len)
            if (weg <= 0f) null else teilPfad(st, weg, k)
        }
        pfade.forEach { drawPath(it, CYAN, alpha = 0.22f, style = Stroke(dick * 2.6f * k, cap = StrokeCap.Round, join = StrokeJoin.Round)) }
        pfade.forEach { drawPath(it, CYAN, style = Stroke(dick * k, cap = StrokeCap.Round, join = StrokeJoin.Round)) }
    }
}

/** Laenge je Strich (0 zaehlt als 1 wie im Web) — Grundlage des Zeitplans beim „Fahren" (Linie und Lauf-Zaehler). */
private fun strichLaengen(striche: List<List<Offset>>): List<Float> =
    striche.map { st -> (1 until st.size).fold(0f) { a, i -> a + (st[i] - st[i - 1]).getDistance() }.takeIf { it > 0f } ?: 1f }

/** Zeitplan (Web zeitplan): Gesamtfortschritt 0..1 -> (Strich-Index, Anteil 0..1 innerhalb des Strichs). Strich k
 *  startet, wenn k-1 fertig ist; Zeitanteil nach Laenge. Nach dem Ende bleibt der letzte Strich bei 1. */
private fun planStand(laengen: List<Float>, fortschritt: Float): Pair<Int, Float> {
    if (laengen.isEmpty()) return 0 to 0f
    val gesamt = laengen.sum()
    val pos = fortschritt.coerceIn(0f, 1f) * gesamt
    var start = 0f
    laengen.forEachIndexed { i, l ->
        if (pos < start + l) return i to ((pos - start) / l).coerceIn(0f, 1f)
        start += l
    }
    return laengen.lastIndex to 1f
}

/** Zaehler unter der fahrenden Linie (Web LaufZaehler, Jan 19.11.2026): Lauf n (nur bei mehreren), Zeit und Strecke
 *  zaehlen live hoch, je Lauf ab 0; gleicher Zeitplan wie KunstLinie. Nur wenn je Strich ein Wert da ist. */
@Composable
private fun LaufZaehler(linie: JsonElement, werte: List<KunstLaufWert>?, fortschritt: Float, modifier: Modifier = Modifier) {
    val laengen = remember(linie) { strichLaengen(alsStriche(linie)) }
    if (werte == null || werte.isEmpty() || werte.size != laengen.size) return
    val (i, f) = planStand(laengen, fortschritt)
    val w = werte[i]
    val sek = (w.s * f).roundToInt()
    val meter = (w.m * f).roundToInt()
    val zeitText = "${sek / 60}:${(sek % 60).toString().padStart(2, '0')}"
    val wegText = if (meter >= 1000) String.format(java.util.Locale.US, "%.2f km", meter / 1000.0) else "$meter m"
    val zahl = MaterialTheme.typography.bodyMedium.copy(fontFeatureSettings = "tnum")
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically) {
        if (werte.size > 1) Text(I18n.t("kunst.zaehler.lauf").replace("{n}", (i + 1).toString()), color = Color(0xFF94A3B8), style = zahl)
        Text(zeitText, color = Color(0xFFF1F5F9), style = zahl, fontWeight = FontWeight.SemiBold)
        Text(wegText, color = Color(0xFFF1F5F9), style = zahl, fontWeight = FontWeight.SemiBold)
    }
}

/** Strich bis zur Weglaenge `weg` (in BOX-Einheiten), skaliert mit `k`. */
private fun teilPfad(st: List<Offset>, weg: Float, k: Float): Path = Path().apply {
    moveTo(st[0].x * k, st[0].y * k)
    var rest = weg
    for (i in 1 until st.size) {
        val a = st[i - 1]; val b = st[i]; val d = (b - a).getDistance()
        if (d >= rest) {
            val p = if (d > 0f) a + (b - a) * (rest / d) else b
            lineTo(p.x * k, p.y * k)
            break
        }
        lineTo(b.x * k, b.y * k)
        rest -= d
    }
}

/** Vorschau wie server kunst.linie (Web normiere): nur Punkte in Laeufen (ein Strich je Lauf), Bildschirm-Koordinaten
 *  (Norden oben), im Uhrzeigersinn drehen, mittig einpassen. */
private fun normiere(punkte: List<List<Double>>, drehung: Int, laeufe: List<List<Double>>): List<List<Offset>> {
    val striche = ArrayList<List<Pair<Double, Double>>>()
    var akt = ArrayList<Pair<Double, Double>>()
    var aktL = -1
    for (p in punkte) {
        if (p.size < 3) continue
        val t = p[0]
        val l = laeufe.indexOfFirst { it.size >= 2 && it[0] <= t && t <= it[1] }
        if (l < 0) continue
        if (l != aktL && akt.isNotEmpty()) { striche.add(akt); akt = ArrayList() }
        aktL = l
        akt.add(p[1] to p[2])
    }
    if (akt.isNotEmpty()) striche.add(akt)
    val gut = striche.filter { it.size >= 2 }
    if (gut.isEmpty()) return emptyList()
    val w = Math.toRadians(drehung.toDouble()); val c = cos(w); val s = sin(w)
    val q = gut.map { st -> st.map { (x, y) -> (x * c + y * s) to (x * s - y * c) } }
    val alle = q.flatten()
    val minX = alle.minOf { it.first }; val minY = alle.minOf { it.second }
    val bx = alle.maxOf { it.first } - minX; val by = alle.maxOf { it.second } - minY
    val m = max(bx, by).takeIf { it > 0 } ?: 1.0
    val rand = BOX * 0.04; val f = (BOX - 2 * rand) / m
    val ox = (BOX - bx * f) / 2 - minX * f; val oy = (BOX - by * f) / 2 - minY * f
    return q.map { st -> st.map { (x, y) -> Offset((x * f + ox).roundToInt().toFloat(), (y * f + oy).roundToInt().toFloat()) } }
}

// ------------------------------------------------------------------------------- Zeiten ----

private fun formatiere(iso: String, skelett: String): String {
    val i = isoInstant(iso) ?: return iso
    return runCatching {
        android.icu.text.DateFormat.getInstanceForSkeleton(skelett, java.util.Locale.forLanguageTag(I18n.lang))
            .format(java.util.Date(i.toEpochMilli()))
    }.getOrDefault(iso)
}

/** Rundenzeitraum kurz („15.–18.11."), Ende als letzter Tag der Runde (das Ende selbst ist 0:00 des Folgetags). */
private fun zeitraum(a: String, z: String): String {
    val e = isoInstant(z) ?: return ""
    return formatiere(a, "dM") + "–" + formatiere(e.minusMillis(1).toString(), "dM")
}

/** Naechster Schritt einer Runde: kommt -> Start, einreichen -> Einreichschluss, abstimmen -> Aufloesung; fertig -> keiner. */
private fun ziel(r: KunstRunde): String? = when (r.phase) {
    "kommt" -> r.start
    "einreichen" -> r.einreichenBis ?: r.ende
    "abstimmen" -> r.abstimmenBis
    else -> null
}

/** „2d 5h 14m", in der letzten Stunde „14m 33s" — sprachneutral, wie die Event-Countdowns im Web. */
private fun restText(iso: String, jetzt: Long): String {
    val s = restSekunden(iso, jetzt)
    val d = s / 86400; val h = s % 86400 / 3600; val m = s % 3600 / 60; val sek = s % 60
    return when {
        d > 0 -> "${d}d ${h}h ${m}m"
        h > 0 -> "${h}h ${m}m"
        else -> "${m}m ${sek.toString().padStart(2, '0')}s"
    }
}

private fun datum(iso: String) = formatiere(iso, "dMMMjjmm")
private fun sessionZeit(iso: String) = formatiere(iso, "EEEdMMMjjmm")

/** Fehlertext aus dem `detail`-Code des Servers (kunst.err.<code>), sonst „unbekannt". */
private fun kunstFehlerText(e: Throwable): String {
    val code = (e as? ApiFehler)?.detail ?: "unbekannt"
    val k = "kunst.err.$code"
    val t = I18n.t(k)
    return if (t == k) I18n.t("kunst.err.unbekannt") else t
}

// ---------------------------------------------------------------------------- Hauptteil ----

/** GPS-Kunst auf der Eventseite (Web KunstBereich): Runden, eigenes Bild, Galerie mit Herzen bzw. Aufloesung. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun KunstBereich(eventId: Int, onOpenSession: (Int) -> Unit) {
    var d by remember(eventId) { mutableStateOf<KunstEvent?>(null) }
    var fehler by remember(eventId) { mutableStateOf<String?>(null) }
    var nr by remember(eventId) { mutableStateOf<Int?>(null) }
    // Gesamtuebersicht aller fertigen Runden (Web Gesamt, 18.11.2026), erst ab 2 fertigen Runden.
    var alle by remember(eventId) { mutableStateOf(false) }
    var editor by remember { mutableStateOf(false) }
    // Vollbild beim Abstimmen: Reihenfolge beim Oeffnen festgehalten, damit nach einem Herz nichts wegspringt.
    var voll by remember { mutableStateOf<Pair<List<Int>, Int>?>(null) }
    var melden by remember { mutableStateOf<Int?>(null) }
    val gemeldet = remember { mutableStateMapOf<Int, Boolean>() }
    val scope = rememberCoroutineScope()
    val jetzt = rememberJetzt()

    suspend fun neu() {
        try { d = Api.kunst(eventId); fehler = null } catch (ex: Exception) { fehler = kunstFehlerText(ex) }
    }
    fun aktion(block: suspend () -> Unit) {
        scope.launch { try { block(); neu() } catch (ex: Exception) { fehler = kunstFehlerText(ex) } }
    }
    LaunchedEffect(eventId) { neu() }

    val dd = d
    if (dd == null) {
        if (fehler != null) Text(fehler!!, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(bottom = 12.dp))
        else Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        return
    }
    // Standard-Runde: laufende Abstimmung vor laufendem Einreichen, sonst die letzte fertige.
    val r = dd.runden
    val runde = r.firstOrNull { it.nr == nr } ?: r.firstOrNull { it.phase == "abstimmen" } ?: r.firstOrNull { it.phase == "einreichen" }
        ?: r.lastOrNull { it.phase == "fertig" } ?: r.firstOrNull() ?: return
    val grau = MaterialTheme.colorScheme.onSurfaceVariant

    Column(Modifier.fillMaxWidth().padding(bottom = 16.dp)) {
        Text(I18n.t("kunst.intro").replace("{n}", dd.herzenJeRunde.toString()), style = MaterialTheme.typography.bodyMedium,
            color = grau, modifier = Modifier.padding(bottom = 10.dp))
        fehler?.let {
            Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(bottom = 10.dp))
        }
        if (r.size > 1) {
            FlowRow(Modifier.fillMaxWidth().padding(bottom = 10.dp), horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)) {
                r.forEach { x ->
                    val an = !alle && x.nr == runde.nr
                    val vg = if (an) DUNKEL else MaterialTheme.colorScheme.onSurface
                    Column(Modifier.clip(RoundedCornerShape(8.dp))
                        .background(if (an) CYAN else MaterialTheme.colorScheme.surfaceVariant)
                        .clickable { nr = x.nr; alle = false }.padding(horizontal = 12.dp, vertical = 6.dp)) {
                        Text("${I18n.t("kunst.runde").replace("{n}", x.nr.toString())} · ${zeitraum(x.start, x.ende)} · " +
                            I18n.t("kunst.phase.${x.phase}"), style = MaterialTheme.typography.bodyMedium, color = vg,
                            fontWeight = if (an) FontWeight.SemiBold else FontWeight.Normal)
                        // Countdown bis zum naechsten Schritt der Runde (Web: „eigene countdowns als 2te zeile").
                        ziel(x)?.let { z ->
                            Text(I18n.t(if (x.phase == "kommt") "kunst.startetIn" else "kunst.noch").replace("{zeit}", restText(z, jetzt)), style = MaterialTheme.typography.labelSmall,
                                color = vg.copy(alpha = 0.8f))
                        }
                    }
                }
                if (r.count { it.phase == "fertig" } >= 2) {
                    Box(Modifier.clip(RoundedCornerShape(8.dp))
                        .background(if (alle) CYAN else MaterialTheme.colorScheme.surfaceVariant)
                        .clickable { alle = true }.padding(horizontal = 12.dp, vertical = 6.dp)) {
                        Text(I18n.t("kunst.alle"), style = MaterialTheme.typography.bodyMedium,
                            color = if (alle) DUNKEL else MaterialTheme.colorScheme.onSurface,
                            fontWeight = if (alle) FontWeight.SemiBold else FontWeight.Normal)
                    }
                }
            }
        }
        if (alle && r.count { it.phase == "fertig" } >= 2) {
            Gesamt(r.filter { it.phase == "fertig" }, onOpenSession)
            return@Column
        }
        val info = when (runde.phase) {
            "kommt" -> I18n.t("kunst.info.kommt").replace("{datum}", datum(runde.start))
            "einreichen" -> I18n.t("kunst.info.einreichen").replace("{datum}", datum(runde.einreichenBis ?: runde.ende))
                .replace("{n}", runde.anzahl.toString())
            "abstimmen" -> I18n.t("kunst.info.abstimmen").replace("{datum}", datum(runde.abstimmenBis))
                .replace("{rest}", (dd.herzenJeRunde - runde.herzenVergeben).toString()).replace("{n}", dd.herzenJeRunde.toString())
            else -> I18n.t("kunst.info.fertig").replace("{n}", (runde.ergebnis?.size ?: 0).toString())
        }
        Text(info, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, modifier = Modifier.padding(bottom = 10.dp))

        // Eigenes Bild der Runde
        if (dd.teilnehmen && (runde.phase == "einreichen" || runde.phase == "abstimmen")) {
            val eigen = runde.eigen
            Card(Modifier.fillMaxWidth().padding(bottom = 12.dp), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
                Column(Modifier.padding(12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (eigen != null) {
                            Box(Modifier.width(96.dp)) { KunstLinie(eigen.linie, eigen.id, klein = true) }
                            Spacer(Modifier.width(12.dp))
                        }
                        val text = when {
                            eigen?.entfernt != null -> I18n.t("kunst.eigenEntfernt").replace("{grund}", eigen.entfernt)
                            eigen != null -> I18n.t(if (runde.phase == "einreichen") "kunst.eigenDa" else "kunst.eigenAbstimmung")
                            runde.phase == "einreichen" -> I18n.t("kunst.eigenNoch")
                            else -> I18n.t("kunst.eigenKeins")
                        }
                        Text(text, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f),
                            color = if (eigen?.entfernt != null) MaterialTheme.colorScheme.error else grau)
                    }
                    if (runde.phase == "einreichen" && eigen?.entfernt == null) {
                        Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(onClick = { editor = true },
                                colors = ButtonDefaults.buttonColors(containerColor = CYAN, contentColor = DUNKEL)) {
                                Text(I18n.t(if (eigen != null) "kunst.aendern" else "kunst.einreichen"), fontWeight = FontWeight.SemiBold)
                            }
                            if (eigen != null) TextButton(onClick = { aktion { Api.kunstZurueckziehen(eventId, runde.nr) } }) {
                                Text(I18n.t("kunst.zurueckziehen"))
                            }
                        }
                    }
                }
            }
        }

        when {
            runde.phase == "fertig" -> Aufloesung(eventId, runde, onOpenSession)
            runde.galerie.isEmpty() -> if (runde.phase != "kommt") {
                Text(I18n.t(if (runde.phase == "einreichen" && !dd.moderieren) "kunst.galerieSpaeter" else "kunst.leer"),
                    style = MaterialTheme.typography.bodyMedium, color = grau)
            }
            else -> {
                // Eigene Herzen zuerst (Web 18.11.2026), sonst die feste Mischung des Servers.
                val liste = runde.galerie.sortedByDescending { it.herz }
                val ids = liste.map { it.id }
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    liste.chunked(2).forEach { reihe ->
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            reihe.forEach { b ->
                                // key: Herz-Puls bleibt beim Bild, wenn es nach dem Herz nach vorn sortiert wird
                                key(b.id) {
                                    GalerieBild(b, runde, dd, gemeldet[b.id] == true, Modifier.weight(1f),
                                        onHerz = { aktion { Api.kunstHerz(b.id) } },
                                        onMelden = { melden = b.id },
                                        onOeffnen = { voll = ids to ids.indexOf(b.id) })
                                }
                            }
                            if (reihe.size == 1) Spacer(Modifier.weight(1f))
                        }
                    }
                }
            }
        }
    }

    voll?.let { (ids, start) ->
        AbstimmGalerie(ids, start, runde, dd, onHerz = { id -> aktion { Api.kunstHerz(id) } }, onZu = { voll = null })
    }
    melden?.let { id ->
        MeldenDialog(onZu = { melden = null }) { grund ->
            melden = null
            scope.launch {
                try { Api.kunstMelden(id, grund); gemeldet[id] = true } catch (ex: Exception) { fehler = kunstFehlerText(ex) }
            }
        }
    }
    if (editor) {
        KunstEditor(eventId, runde, onZu = { editor = false }, onFertig = { editor = false; scope.launch { neu() } })
    }
}

@Composable
private fun HerzKnopf(an: Boolean, aktiv: Boolean, gross: Boolean = false, aufDunkel: Boolean = false, onClick: () -> Unit) {
    val hg = when { an -> CYAN; aufDunkel -> Color.White.copy(alpha = 0.15f); else -> MaterialTheme.colorScheme.surfaceVariant }
    val vg = when { an -> DUNKEL; aufDunkel -> Color.White; else -> MaterialTheme.colorScheme.onSurface }
    Row(Modifier.alpha(if (aktiv) 1f else 0.4f).clip(RoundedCornerShape(if (gross) 12.dp else 8.dp)).background(hg)
        .clickable(enabled = aktiv, onClick = onClick)
        .padding(horizontal = if (gross) 16.dp else 8.dp, vertical = if (gross) 8.dp else 4.dp),
        verticalAlignment = Alignment.CenterVertically) {
        Icon(if (an) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder, contentDescription = null, tint = vg,
            modifier = Modifier.size(if (gross) 20.dp else 16.dp))
        Spacer(Modifier.width(4.dp))
        Text(I18n.t("kunst.herz"), color = vg, fontWeight = FontWeight.Bold,
            style = if (gross) MaterialTheme.typography.titleSmall else MaterialTheme.typography.labelLarge)
    }
}

@Composable
private fun GalerieBild(b: KunstBild, runde: KunstRunde, d: KunstEvent, gemeldet: Boolean, modifier: Modifier,
                        onHerz: () -> Unit, onMelden: () -> Unit, onOeffnen: () -> Unit) {
    val abstimmen = runde.phase == "abstimmen" && d.teilnehmen && !b.eigen && b.entfernt == null
    val voll = runde.herzenVergeben >= d.herzenJeRunde && !b.herz
    // Tipp oeffnet das Vollbild, Doppeltipp vergibt/nimmt ein Herz (Web 19.11.2026), mit Herz-Puls.
    var puls by remember { mutableStateOf<Pair<Int, Boolean>?>(null) }
    val herzTippen by rememberUpdatedState { puls = ((puls?.first ?: 0) + 1) to !b.herz; onHerz() }
    val oeffnen by rememberUpdatedState(onOeffnen)
    Column(modifier.alpha(if (b.entfernt != null) 0.5f else 1f).clip(RoundedCornerShape(12.dp))
        .border(1.dp, if (b.herz) CYAN else MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(12.dp)).padding(8.dp)) {
        Box(Modifier.clip(RoundedCornerShape(8.dp)).pointerInput(b.id, abstimmen && !voll) {
            detectTapGestures(onTap = { oeffnen() }, onDoubleTap = if (abstimmen && !voll) { _ -> herzTippen() } else null)
        }) {
            KunstLinie(b.linie, b.id)
            HerzPuls(puls, Modifier.matchParentSize())
        }
        Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            if (abstimmen) HerzKnopf(b.herz, !voll, onClick = onHerz)
            if (b.eigen) Text(I18n.t("kunst.deinBild"), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold,
                color = markenAkzent())
            Spacer(Modifier.weight(1f))
            if (!b.eigen) {
                Text(I18n.t(if (gemeldet) "kunst.gemeldet" else "kunst.melden"), style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.clip(RoundedCornerShape(4.dp)).clickable(enabled = !gemeldet, onClick = onMelden).padding(4.dp))
            }
        }
        b.entfernt?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}

@Composable
private fun MeldenDialog(onZu: () -> Unit, onSenden: (String) -> Unit) {
    var grund by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onZu,
        title = { Text(I18n.t("kunst.melden")) },
        text = {
            Column {
                Text(I18n.t("kunst.meldenFrage"), style = MaterialTheme.typography.bodyMedium)
                OutlinedTextField(grund, { if (it.length <= 500) grund = it }, Modifier.fillMaxWidth().padding(top = 8.dp), minLines = 2)
            }
        },
        confirmButton = { TextButton(onClick = { onSenden(grund.trim()) }) { Text(I18n.t("kunst.melden")) } },
        dismissButton = { TextButton(onClick = onZu) { Text(I18n.t("common.cancel")) } },
    )
}

/** Gemeinsamer Rahmen der Vollbild-Ansichten (Web: eigene Karte mit Rand und Hintergrund, Schliessen oben rechts,
 *  Blaettern mit Pfeilen bzw. Wischen). */
@Composable
private fun VollbildRahmen(anzahl: Int, onWeiter: (Int) -> Unit, onZu: () -> Unit, wischen: Boolean = true,
                           randSchliesst: Boolean = true, bild: @Composable () -> Unit, unten: @Composable () -> Unit) {
    Dialog(onDismissRequest = onZu, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = if (randSchliesst) 0.85f else 0.9f))
            .then(if (randSchliesst) Modifier.clickable(onClick = onZu) else Modifier).padding(12.dp),
            contentAlignment = Alignment.Center) {
            Box(Modifier.widthIn(max = 560.dp).fillMaxWidth()) {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(DUNKEL)
                    .border(1.dp, CYAN.copy(alpha = 0.35f), RoundedCornerShape(24.dp))
                    // Tipp auf die Karte selbst schliesst nicht (nur der Rand daneben): Klick hier verschlucken.
                    .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {}.padding(12.dp)) {
                    var dx by remember { mutableStateOf(0f) }
                    Box(Modifier.fillMaxWidth().then(if (wischen && anzahl > 1) Modifier.pointerInput(anzahl) {
                        detectHorizontalDragGestures(
                            onDragStart = { dx = 0f },
                            onDragEnd = { if (dx < -60f) onWeiter(1) else if (dx > 60f) onWeiter(-1); dx = 0f },
                        ) { _, d -> dx += d }
                    } else Modifier)) {
                        bild()
                        if (anzahl > 1) {
                            listOf(-1 to "‹", 1 to "›").forEach { (r, z) ->
                                Box(Modifier.align(if (r < 0) Alignment.CenterStart else Alignment.CenterEnd).padding(6.dp)
                                    .clip(CircleShape).background(Color.Black.copy(alpha = 0.55f)).clickable { onWeiter(r) }
                                    .padding(horizontal = 12.dp, vertical = 2.dp)) {
                                    Text(z, color = Color.White, fontSize = 28.sp)
                                }
                            }
                        }
                    }
                    unten()
                }
                Box(Modifier.align(Alignment.TopEnd).offset(x = 8.dp, y = (-8).dp).size(36.dp).clip(CircleShape)
                    .background(Color(0xFF0F172A)).border(1.dp, CYAN.copy(alpha = 0.5f), CircleShape).clickable(onClick = onZu),
                    contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.Close, contentDescription = I18n.t("common.close"), tint = Color.White, modifier = Modifier.size(20.dp))
                }
            }
        }
    }
}

/** Vollbild zum Abstimmen (Web AbstimmGalerie): grosses Bild, Herz-Knopf mit Restzahl, Blaettern. Herz-Stand live aus der Runde. */
@Composable
private fun AbstimmGalerie(ids: List<Int>, start: Int, runde: KunstRunde, d: KunstEvent, onHerz: (Int) -> Unit, onZu: () -> Unit) {
    var i by remember { mutableIntStateOf(start.coerceIn(0, maxOf(0, ids.size - 1))) }
    val b = runde.galerie.firstOrNull { it.id == ids.getOrNull(i) } ?: return
    val abstimmen = runde.phase == "abstimmen" && d.teilnehmen && !b.eigen && b.entfernt == null
    val voll = runde.herzenVergeben >= d.herzenJeRunde && !b.herz
    // Doppeltipp = Herz (Web 19.11.2026), mit Herz-Puls in der Bildmitte.
    var puls by remember { mutableStateOf<Pair<Int, Boolean>?>(null) }
    val herzTippen by rememberUpdatedState { puls = ((puls?.first ?: 0) + 1) to !b.herz; onHerz(b.id) }
    // Admins: schon vor der Aufloesung Bild | Karte (Web 19.11.2026), Wahl gemerkt wie in der Ergebnis-Galerie.
    val prefs = kunstPrefs()
    var karteGewaehlt by remember { mutableStateOf(liesKarteGewaehlt(prefs)) }
    val karteErlaubt = d.admin && b.karte == true
    val karte = karteErlaubt && karteGewaehlt
    VollbildRahmen(ids.size, onWeiter = { r -> i = (i + r + ids.size) % ids.size }, onZu = onZu,
        bild = {
            Box(Modifier.clip(RoundedCornerShape(16.dp)).background(if (b.herz) CYAN else Color.Transparent).padding(6.dp)
                .pointerInput(b.id, abstimmen && !voll) {
                    if (abstimmen && !voll) detectTapGestures(onDoubleTap = { herzTippen() })
                }) {
                if (karte) KunstKarteBild(b.id) else KunstLinie(b.linie, b.id)
                HerzPuls(puls, Modifier.matchParentSize())
            }
        },
        unten = {
            Row(Modifier.fillMaxWidth().padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("${i + 1} / ${ids.size}", color = HELL_TEXT, style = MaterialTheme.typography.bodyMedium)
                if (karteErlaubt) BildKarteUmschalter(karte) { k -> karteGewaehlt = k; schreibKarteGewaehlt(prefs, k) }
                if (b.eigen) Text(I18n.t("kunst.deinBild"), color = CYAN, style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.weight(1f))
                if (runde.phase == "abstimmen" && d.teilnehmen) {
                    Text(I18n.t("kunst.uebrig").replace("{rest}", (d.herzenJeRunde - runde.herzenVergeben).toString())
                        .replace("{n}", d.herzenJeRunde.toString()), color = HELL_TEXT, style = MaterialTheme.typography.bodySmall,
                        textAlign = TextAlign.End, modifier = Modifier.weight(1f, fill = false))
                }
                if (abstimmen) HerzKnopf(b.herz, !voll, gross = true, aufDunkel = true) { onHerz(b.id) }
            }
        })
}

// ---------------------------------------------------------------------------- Aufloesung ----
// Platz 1-3 als Treppchen (2-1-3, Gold/Silber/Bronze, statisch), darunter alle weiteren, Antippen -> Vollbild-Galerie mit
// Bild | Karte. Die Enthuellung (Platz 3, 2, 1 nacheinander) laeuft im Vollbild: automatisch beim ersten Ansehen je
// Event+Runde, danach per Knopf; Jingle mit der Stumm-Einstellung von EventPodest.

// Eigener Jingle (server/media/sounds/gpskunst.mp3) — fehlt die Datei, spielt die Event-Fanfare (Web TON_KUNST/TON).
private const val TON_KUNST = "/media/sounds/gpskunst.mp3"
private const val TON_ERSATZ = "/media/sounds/winner-awards-484333.mp3"
private const val STUMM_PREF = "podest-stumm"   // derselbe Schluessel wie EventPodest
private const val ANSICHT_PREF = "kunst-ansicht"   // Galerie: "karte" oder leer (= Bild), wie Web
private val METALL = listOf(Color(0xFFFACC15), Color(0xFFCBD5E1), Color(0xFFEA8A4A))        // Gold, Silber, Bronze
private val METALL_TEXT = listOf(Color(0xFFA16207), Color(0xFF475569), Color(0xFF9A3412))   // dunklere Randfarben
// Zeiten der Enthuellung (Web ZIEHEN/BLINK/STEHEN/EXTRA/FOTO)
private const val ZIEHEN_MS = 5000
private const val BLINK_MS = 400      // je Blinken (zweimal)
private const val STEHEN_MS = 2000
private const val KARTE_MS = 2000
private const val FOTO_MS = 4000

@Composable
private fun kunstPrefs(): android.content.SharedPreferences {
    val ctx = LocalContext.current
    return remember { ctx.getSharedPreferences("pumpfoil", android.content.Context.MODE_PRIVATE) }
}
private fun liesKarteGewaehlt(p: android.content.SharedPreferences) =
    runCatching { p.getString(ANSICHT_PREF, null) == "karte" }.getOrDefault(false)
private fun schreibKarteGewaehlt(p: android.content.SharedPreferences, k: Boolean) {
    runCatching { p.edit().apply { if (k) putString(ANSICHT_PREF, "karte") else remove(ANSICHT_PREF) }.apply() }
}

/** „Animationen entfernen" in den System-Einstellungen (Web prefers-reduced-motion). */
private fun animationenAus(ctx: android.content.Context): Boolean = runCatching {
    android.provider.Settings.Global.getFloat(ctx.contentResolver, android.provider.Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
}.getOrDefault(false)

/** Foto-URL vom Server: relativ (/media/...) -> mit API-Basis verbinden. */
private fun fotoUrl(f: String) = if (f.startsWith("http")) f else Api.BASE.trimEnd('/') + f

/** Siegerton vom Server (wie EventPodest, Lizenz: nie in der App); bei Fehler einmal der Ersatz. Laeuft zweimal
 *  hintereinander (Web 19.11.2026: „sonst ist der zu kurz" fuer die Enthuellung). */
private class KunstFanfare {
    private var mp: MediaPlayer? = null
    private var nochmal = 0
    fun start() { nochmal = 1; spiel(TON_KUNST, TON_ERSATZ) }
    private fun spiel(pfad: String, ersatz: String?) {
        stop()
        runCatching {
            val p = MediaPlayer()
            p.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
            p.setDataSource(Api.BASE.trimEnd('/') + pfad)
            p.setVolume(0.6f, 0.6f)
            p.setOnPreparedListener { it.start() }
            p.setOnCompletionListener {
                if (mp === it) {
                    if (nochmal > 0) { nochmal--; runCatching { it.seekTo(0); it.start() }.onFailure { stop() } } else stop()
                }
            }
            p.setOnErrorListener { x, _, _ ->
                if (mp === x) { if (ersatz != null) spiel(ersatz, null) else stop() }
                true
            }
            mp = p
            p.prepareAsync()
        }.onFailure { if (ersatz != null) spiel(ersatz, null) else stop() }
    }
    fun stop() {
        val p = mp ?: return
        mp = null
        runCatching { p.release() }
    }
}

@Composable
private fun Herzen(n: Int, gross: Boolean = false, farbe: Color = MaterialTheme.colorScheme.onSurface) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(n.toString(), color = farbe, fontWeight = FontWeight.SemiBold,
            style = if (gross) MaterialTheme.typography.titleSmall else MaterialTheme.typography.labelMedium)
        Spacer(Modifier.width(3.dp))
        Icon(Icons.Filled.Favorite, contentDescription = I18n.t("kunst.herzenN").replace("{n}", n.toString()), tint = CYAN,
            modifier = Modifier.size(if (gross) 20.dp else 14.dp))
    }
}

/** Kurz aufleuchtendes grosses Herz in der Bildmitte nach einem Doppeltipp (Web HerzPuls): `puls` = (Zaehler, gefuellt);
 *  gefuellt beim Vergeben, Umriss beim Wegnehmen. */
@Composable
private fun HerzPuls(puls: Pair<Int, Boolean>?, modifier: Modifier) {
    val p = puls ?: return
    val t = remember { Animatable(1f) }
    LaunchedEffect(p.first) { t.snapTo(0f); t.animateTo(1f, tween(700, easing = LinearEasing)) }
    // Keyframes wie Web: 0 % 0.4/0 -> 25 % 1.1/0.95 -> 70 % 1.0/0.9 -> 100 % 1.15/0
    val x = t.value
    val (skala, deck) = when {
        x < 0.25f -> (0.4f + 0.7f * x / 0.25f) to (0.95f * x / 0.25f)
        x < 0.7f -> ((x - 0.25f) / 0.45f).let { u -> (1.1f - 0.1f * u) to (0.95f - 0.05f * u) }
        else -> ((x - 0.7f) / 0.3f).let { u -> (1f + 0.15f * u) to (0.9f * (1f - u)) }
    }
    Box(modifier, contentAlignment = Alignment.Center) {
        Icon(if (p.second) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder, contentDescription = null, tint = CYAN,
            modifier = Modifier.fillMaxSize(1f / 3f).graphicsLayer { scaleX = skala; scaleY = skala; alpha = deck })
    }
}

/** Bild | Karte (feste dunkle Farben, der Vollbild-Kasten ist immer dunkel). */
@Composable
private fun BildKarteUmschalter(karte: Boolean, onWahl: (Boolean) -> Unit) {
    Row(Modifier.clip(RoundedCornerShape(8.dp)).background(Color(0xFF1E293B)).padding(2.dp)) {
        listOf(false to "kunst.ansichtBild", true to "kunst.ansichtKarte").forEach { (k, key) ->
            val an = karte == k
            Text(I18n.t(key), style = MaterialTheme.typography.labelMedium,
                color = if (an) DUNKEL else Color(0xFFCBD5E1), fontWeight = if (an) FontWeight.SemiBold else FontWeight.Normal,
                modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(if (an) CYAN else Color.Transparent)
                    .clickable { onWahl(k) }.padding(horizontal = 8.dp, vertical = 3.dp))
        }
    }
}

@Composable
private fun Aufloesung(eventId: Int, runde: KunstRunde, onOpenSession: (Int) -> Unit) {
    val e = runde.ergebnis.orEmpty()
    val ctx = LocalContext.current
    val prefs = kunstPrefs()
    var stumm by remember { mutableStateOf(runCatching { prefs.getBoolean(STUMM_PREF, false) }.getOrDefault(false)) }
    var offen by remember { mutableStateOf<Int?>(null) }
    var zeigen by remember { mutableStateOf(false) }
    val fanfare = remember { KunstFanfare() }
    val gesehenKey = "kunst-gesehen-$eventId-${runde.nr}"
    fun enthuellen() {
        runCatching { prefs.edit().putBoolean(gesehenKey, true).apply() }
        zeigen = true
        if (!stumm) fanfare.start()
    }
    // Beim ersten Ansehen der fertigen Runde automatisch (nicht bei „Animationen aus").
    LaunchedEffect(eventId, runde.nr) {
        zeigen = false
        val gesehen = runCatching { prefs.getBoolean(gesehenKey, false) }.getOrDefault(false)
        if (e.isNotEmpty() && !gesehen && !animationenAus(ctx)) enthuellen()
    }
    DisposableEffect(Unit) { onDispose { fanfare.stop() } }
    if (e.isEmpty()) {
        Text(I18n.t("kunst.leer"), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        return
    }
    fun stummSetzen(v: Boolean) {
        stumm = v
        runCatching { prefs.edit().putBoolean(STUMM_PREF, v).apply() }
        if (v) fanfare.stop()
    }
    Column(Modifier.fillMaxWidth()) {
        // Knopf zentriert ueber Platz 1, primaer (Web 178ffc3d); „Stumm" rechts daneben
        Row(Modifier.fillMaxWidth().padding(bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Spacer(Modifier.weight(1f))
            Button(onClick = { enthuellen() }, shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = CYAN, contentColor = DUNKEL),
                contentPadding = PaddingValues(horizontal = 14.dp)) {
                Icon(Icons.Filled.PlayArrow, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp))
                Text(I18n.t("kunst.enth.nochmal"), fontWeight = FontWeight.SemiBold)
            }
            Box(Modifier.weight(1f), contentAlignment = Alignment.CenterEnd) {
                Row(Modifier.clip(RoundedCornerShape(8.dp)).clickable { stummSetzen(!stumm) }, verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = stumm, onCheckedChange = { stummSetzen(it) })
                    Text(I18n.t("team.podest.stumm"), style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(end = 6.dp))
                }
            }
        }
        // Treppchen 2-1-3: Gold am hoechsten; nach Platz gruppiert (Web 19.11.2026: Gleichstand -> mehrere Bilder je Stufe,
        // leere Stufen fallen weg, z. B. 1., 1., 3. -> Gold mit zwei Bildern, Bronze).
        val n3 = e.count { it.platz <= 3 }
        val stufen = listOf(2, 1, 3).map { p -> p to e.withIndex().filter { it.value.platz == p } }.filter { it.second.isNotEmpty() }
        Row(Modifier.fillMaxWidth().padding(bottom = 16.dp), verticalAlignment = Alignment.Bottom,
            horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            stufen.forEach { (p, l) ->
                Row(Modifier.weight((if (p == 1) 1.2f else 1f) * minOf(l.size, 2))
                    .padding(bottom = when (p) { 1 -> 36.dp; 2 -> 14.dp; else -> 0.dp }),
                    verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    l.forEach { (i, z) ->
                        val einzeln = l.size == 1
                        Column(Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).clickable { offen = i },
                            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(METALL[p - 1]).padding(5.dp)) {
                                KunstLinie(z.linie, z.bildId, klein = !einzeln)
                            }
                            Text("${z.platz}.", color = METALL_TEXT[p - 1], fontWeight = FontWeight.ExtraBold,
                                fontSize = if (p == 1) 28.sp else 22.sp, lineHeight = if (p == 1) 30.sp else 24.sp)
                            Text(z.name ?: "—", fontWeight = FontWeight.ExtraBold, maxLines = 1, overflow = TextOverflow.Ellipsis,
                                textAlign = TextAlign.Center, fontSize = if (p == 1 && einzeln) 16.sp else 13.sp)
                            Herzen(z.herzen, gross = p == 1 && einzeln)
                        }
                    }
                }
            }
        }
        // Alle weiteren
        if (e.size > n3) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                e.drop(n3).withIndex().chunked(3).forEach { reihe ->
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        reihe.forEach { (k, z) ->
                            Column(Modifier.weight(1f).clip(RoundedCornerShape(8.dp))
                                .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(8.dp))
                                .clickable { offen = k + n3 }.padding(5.dp)) {
                                KunstLinie(z.linie, z.bildId, klein = true)
                                Row(Modifier.fillMaxWidth().padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Text("${z.platz}.", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                                    Spacer(Modifier.width(3.dp))
                                    Text(z.name ?: "—", style = MaterialTheme.typography.labelSmall, maxLines = 1,
                                        overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                                    Herzen(z.herzen)
                                }
                            }
                        }
                        repeat(3 - reihe.size) { Spacer(Modifier.weight(1f)) }
                    }
                }
            }
        }
    }
    offen?.let { start -> ErgebnisGalerie(e, start, onZu = { offen = null }, onOpenSession = { sid -> offen = null; onOpenSession(sid) }) }
    if (zeigen) Enthuellung(e, runde.nr, onZu = { zeigen = false })
}

/** Gesamtuebersicht (Web Gesamt): je Platz die Bilder aller fertigen Runden (nach Runde sortiert), jedes mit seiner Runde
 *  beschriftet; Antippen -> Vollbild-Galerie ueber die ganze Liste. */
@Composable
private fun Gesamt(runden: List<KunstRunde>, onOpenSession: (Int) -> Unit) {
    var offen by remember { mutableStateOf<Int?>(null) }
    val alle = remember(runden) {
        runden.flatMap { r -> r.ergebnis.orEmpty().map { it to r.nr } }
            .sortedWith(compareBy<Pair<KunstErgebnis, Int>> { it.first.platz }.thenBy { it.second }.thenByDescending { it.first.herzen })
    }
    val plaetze = alle.map { it.first.platz }.distinct()
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        plaetze.forEach { p ->
            Column {
                Text(I18n.t("kunst.platzN").replace("{n}", p.toString()), style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Bold, color = METALL_TEXT.getOrNull(p - 1) ?: MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.padding(bottom = 6.dp))
                val hier = alle.withIndex().filter { it.value.first.platz == p }
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    hier.chunked(2).forEach { reihe ->
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            reihe.forEach { (i, paar) ->
                                val (z, rn) = paar
                                val metall = METALL.getOrNull(p - 1)
                                Column(Modifier.weight(1f).clip(RoundedCornerShape(8.dp))
                                    .then(if (metall != null) Modifier.background(metall)
                                          else Modifier.border(1.dp, Color(0xFF334155), RoundedCornerShape(8.dp)))
                                    .clickable { offen = i }.padding(5.dp)) {
                                    KunstLinie(z.linie, z.bildId, klein = true)
                                    Row(Modifier.fillMaxWidth().padding(top = 4.dp).clip(RoundedCornerShape(4.dp))
                                        .background(DUNKEL.copy(alpha = 0.7f)).padding(horizontal = 4.dp, vertical = 2.dp),
                                        verticalAlignment = Alignment.CenterVertically) {
                                        Text(I18n.t("kunst.runde").replace("{n}", rn.toString()), color = HELL_TEXT,
                                            style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, maxLines = 1)
                                        Text(" · ${z.name ?: "—"}", color = HELL_TEXT, style = MaterialTheme.typography.labelSmall,
                                            maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                                        Herzen(z.herzen, farbe = Color.White)
                                    }
                                }
                            }
                            if (reihe.size == 1) Spacer(Modifier.weight(1f))
                        }
                    }
                }
            }
        }
    }
    offen?.let { start ->
        ErgebnisGalerie(alle.map { it.first }, start, onZu = { offen = null },
            onOpenSession = { sid -> offen = null; onOpenSession(sid) }, runden = alle.map { it.second })
    }
}

/** Vollbild-Galerie der Aufloesung (Web Galerie): Bild | Karte (gemerkt, gilt beim Blaettern; Bilder ohne freigegebenen
 *  Ort zeigen das Bild, die Wahl bleibt), „Abspielen" faehrt die Linie nochmal, Platz, Name, Herzen, Spot, zur Session. */
@Composable
private fun ErgebnisGalerie(liste: List<KunstErgebnis>, start: Int, onZu: () -> Unit, onOpenSession: (Int) -> Unit,
                            runden: List<Int>? = null) {
    var i by remember { mutableIntStateOf(start.coerceIn(0, maxOf(0, liste.size - 1))) }
    val prefs = kunstPrefs()
    var karteGewaehlt by remember { mutableStateOf(liesKarteGewaehlt(prefs)) }
    // „Abspielen": Linie in ZIEHEN_MS fahren wie in der Enthuellung; zeigt bis zum Blaettern das Bild.
    var spiel by remember { mutableStateOf(false) }
    val zieh = remember { Animatable(1f) }
    val scope = rememberCoroutineScope()
    var spielJob by remember { mutableStateOf<Job?>(null) }
    fun spielAus() { spielJob?.cancel(); spiel = false }
    val z = liste.getOrNull(i) ?: return
    val karte = karteGewaehlt && z.karte && !spiel
    val p = z.platz.coerceIn(1, 4)
    val metall = METALL.getOrNull(p - 1)
    VollbildRahmen(liste.size, onWeiter = { r -> spielAus(); i = (i + r + liste.size) % liste.size }, onZu = onZu,
        bild = {
            Box(Modifier.clip(RoundedCornerShape(16.dp)).background(metall ?: Color.Transparent).padding(6.dp)) {
                if (karte) KunstKarteBild(z.bildId)
                else KunstLinie(z.linie, z.bildId, fortschritt = if (spiel) zieh.value else null)
            }
        },
        unten = {
            if (spiel && !karte) LaufZaehler(z.linie, z.laeufe, zieh.value, Modifier.padding(top = 8.dp))
            Row(Modifier.fillMaxWidth().padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("${z.platz}.", color = metall ?: HELL_TEXT, fontSize = 24.sp, fontWeight = FontWeight.ExtraBold)
                Spacer(Modifier.width(10.dp))
                Text(z.name ?: "—", color = Color.White, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold,
                    maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                // Gesamtuebersicht: Runde neben dem Namen (Web Galerie z.runde).
                runden?.getOrNull(i)?.let { rn ->
                    Spacer(Modifier.width(8.dp))
                    Text(I18n.t("kunst.runde").replace("{n}", rn.toString()), color = Color(0xFF94A3B8),
                        style = MaterialTheme.typography.bodyMedium, maxLines = 1)
                }
                Spacer(Modifier.weight(1f))
                Spacer(Modifier.width(8.dp))
                Herzen(z.herzen, gross = true, farbe = Color.White)
            }
            @OptIn(ExperimentalLayoutApi::class)
            FlowRow(Modifier.fillMaxWidth().padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)) {
                z.spot?.let { Text(it, color = Color(0xFFCBD5E1), style = MaterialTheme.typography.bodyMedium, maxLines = 1,
                    overflow = TextOverflow.Ellipsis, modifier = Modifier.align(Alignment.CenterVertically)) }
                Row(Modifier.align(Alignment.CenterVertically).clip(RoundedCornerShape(8.dp)).background(Color(0xFF1E293B))
                    .clickable {
                        spielJob?.cancel()
                        spiel = true
                        // UNDISPATCHED: auf 0 setzen, bevor das naechste Bild gezeichnet wird (sonst blitzt die volle Linie auf)
                        spielJob = scope.launch(start = CoroutineStart.UNDISPATCHED) {
                            zieh.snapTo(0f); zieh.animateTo(1f, tween(ZIEHEN_MS, easing = LinearEasing))
                        }
                    }.padding(horizontal = 8.dp, vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.PlayArrow, contentDescription = null, tint = Color(0xFFF1F5F9), modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(3.dp))
                    Text(I18n.t("kunst.abspielen"), color = Color(0xFFF1F5F9), style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold)
                }
                z.sessionId?.let { sid ->
                    Row(Modifier.align(Alignment.CenterVertically).clip(RoundedCornerShape(8.dp)).background(CYAN)
                        .clickable { onOpenSession(sid) }.padding(start = 8.dp, end = 4.dp, top = 3.dp, bottom = 3.dp),
                        verticalAlignment = Alignment.CenterVertically) {
                        Text(I18n.t("kunst.zurSession"), color = DUNKEL, style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.SemiBold)
                        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = DUNKEL,
                            modifier = Modifier.size(16.dp))
                    }
                }
                if (z.karte) {
                    Box(Modifier.align(Alignment.CenterVertically)) {
                        BildKarteUmschalter(karte) { k -> spielAus(); karteGewaehlt = k; schreibKarteGewaehlt(prefs, k) }
                    }
                }
            }
        })
}

private enum class EPhase { ZIEHEN, BLINKEN, STEHEN, KARTE, FOTO, ENDE }

/** Vollbild-Enthuellung (Web Enthuellung): alle Eintraege mit Platz <= 3 in umgekehrter Listenreihenfolge (erst alle
 *  Dritten, dann Zweiten, dann Ersten; Gleichstand -> mehrere Bilder je Platz). Je Bild wird die Linie in ZIEHEN_MS
 *  gefahren, blinkt zweimal, dann Name und Herzen, STEHEN_MS stehen, danach Ueberblendung aufs Kartenbild (wenn der Ort
 *  gezeigt werden darf) und aufs Session-Foto (wenn vorhanden). Countdown in der letzten dieser Ansichten. Am Ende
 *  „Alle Plaetze ansehen"; Ueberspringen springt zum naechsten Platz bzw. ans Ende. */
@Composable
private fun Enthuellung(liste: List<KunstErgebnis>, rundeNr: Int, onZu: () -> Unit) {
    val reihe = remember(liste) { liste.indices.filter { liste[it].platz <= 3 }.reversed() }
    if (reihe.isEmpty()) { LaunchedEffect(Unit) { onZu() }; return }
    val ctx = LocalContext.current
    // Kartenbilder und Fotos aller Treppchen-Plaetze sofort vorladen, nicht erst kurz vor dem Einblenden.
    LaunchedEffect(liste) {
        reihe.map { liste[it] }.forEach { z ->
            if (z.karte) KunstKarten.vorladen(z.bildId)
            z.foto?.let { f -> runCatching { coil.Coil.imageLoader(ctx).enqueue(coil.request.ImageRequest.Builder(ctx).data(fotoUrl(f)).build()) } }
        }
    }
    var k by remember { mutableIntStateOf(0) }
    var phase by remember { mutableStateOf(EPhase.ZIEHEN) }
    var rest by remember { mutableIntStateOf(0) }
    val zieh = remember { Animatable(0f) }
    val blink = remember { Animatable(1f) }
    val scope = rememberCoroutineScope()
    var lauf by remember { mutableStateOf<Job?>(null) }
    fun folge(z: KunstErgebnis) = buildList {
        add(EPhase.STEHEN to STEHEN_MS)
        if (z.karte) add(EPhase.KARTE to KARTE_MS)
        if (z.foto != null) add(EPhase.FOTO to FOTO_MS)
    }
    // Startet Platz n (Index in reihe) bzw. das Ende; UNDISPATCHED, damit die neue Linie nie einen Frame voll dasteht.
    fun starte(n: Int) {
        lauf = scope.launch(start = CoroutineStart.UNDISPATCHED) {
            if (n >= reihe.size) { zieh.snapTo(1f); blink.snapTo(1f); phase = EPhase.ENDE; return@launch }
            zieh.snapTo(0f); blink.snapTo(1f); rest = 0; k = n; phase = EPhase.ZIEHEN
            zieh.animateTo(1f, tween(ZIEHEN_MS, easing = LinearEasing))
            phase = EPhase.BLINKEN
            repeat(2) { blink.animateTo(0.12f, tween(BLINK_MS / 2)); blink.animateTo(1f, tween(BLINK_MS / 2)) }
            val f = folge(liste[reihe[n]])
            f.forEachIndexed { j, (ph, ms) ->
                if (j == f.lastIndex) rest = ms / 1000
                phase = ph
                if (j == f.lastIndex) { while (rest > 0) { delay(1000); rest-- } } else delay(ms.toLong())
            }
            starte(n + 1)
        }
    }
    LaunchedEffect(Unit) { starte(0) }
    val z = liste[reihe[k]]
    val p = z.platz.coerceIn(1, 3)
    val letzter = k + 1 >= reihe.size
    val zaehlPhase = folge(z).last().first
    val nameDa = phase == EPhase.STEHEN || phase == EPhase.KARTE || phase == EPhase.FOTO || phase == EPhase.ENDE
    val nameA by animateFloatAsState(if (nameDa) 1f else 0f, tween(500), label = "name")
    val karteA by animateFloatAsState(if (phase == EPhase.KARTE) 1f else 0f, tween(700), label = "karte")
    val fotoA by animateFloatAsState(if (phase == EPhase.FOTO) 1f else 0f, tween(700), label = "foto")
    val vorEnde = phase == EPhase.STEHEN || phase == EPhase.KARTE || phase == EPhase.FOTO
    VollbildRahmen(1, onWeiter = {}, onZu = onZu, wischen = false, randSchliesst = false,
        bild = {
            Column {
                Row(Modifier.fillMaxWidth().padding(bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(I18n.t("kunst.enth.titel").replace("{n}", rundeNr.toString()).uppercase(), color = Color(0xFF94A3B8),
                        style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, letterSpacing = 1.sp,
                        maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    Spacer(Modifier.width(12.dp))
                    // rechts Platz fuer den Schliessen-Knopf lassen
                    Text(I18n.t("kunst.platzN").replace("{n}", z.platz.toString()), color = METALL[p - 1], fontSize = 28.sp,
                        fontWeight = FontWeight.ExtraBold, maxLines = 1, modifier = Modifier.padding(end = 20.dp))
                }
                Box(Modifier.graphicsLayer { alpha = blink.value }.clip(RoundedCornerShape(16.dp)).background(METALL[p - 1]).padding(6.dp)) {
                    KunstLinie(z.linie, z.bildId, fortschritt = if (phase == EPhase.ENDE) null else zieh.value)
                    // Karte und Foto schon in „stehen" unsichtbar bereit, damit sie beim Ueberblenden da sind
                    if (z.karte && vorEnde) Box(Modifier.matchParentSize().graphicsLayer { alpha = karteA }) { KunstKarteBild(z.bildId) }
                    if (z.foto != null && vorEnde) {
                        AsyncImage(model = fotoUrl(z.foto), contentDescription = null, contentScale = ContentScale.Crop,
                            modifier = Modifier.matchParentSize().graphicsLayer { alpha = fotoA }.clip(RoundedCornerShape(8.dp)))
                    }
                }
            }
        },
        unten = {
            // zwischen Bild und Namenszeile; Platz immer reserviert, damit die Namenszeile nicht springt
            Box(Modifier.fillMaxWidth().padding(top = 8.dp).heightIn(min = 20.dp)) {
                LaufZaehler(z.linie, z.laeufe, zieh.value)
            }
            Row(Modifier.fillMaxWidth().padding(top = 4.dp).heightIn(min = 40.dp).graphicsLayer { alpha = nameA },
                verticalAlignment = Alignment.CenterVertically) {
                Text(z.name ?: "—", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, maxLines = 1,
                    overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                Spacer(Modifier.width(8.dp))
                Herzen(z.herzen, gross = true, farbe = Color.White)
            }
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                if (phase == zaehlPhase && !letzter && rest > 0) {
                    Text(I18n.t("kunst.enth.naechster").replace("{n}", rest.toString()), color = Color(0xFF94A3B8),
                        style = MaterialTheme.typography.bodyMedium)
                }
                Spacer(Modifier.weight(1f))
                if (phase == EPhase.ENDE) {
                    Button(onClick = onZu, colors = ButtonDefaults.buttonColors(containerColor = CYAN, contentColor = DUNKEL)) {
                        Text(I18n.t("kunst.enth.alle"), fontWeight = FontWeight.SemiBold)
                    }
                } else {
                    TextButton(onClick = { lauf?.cancel(); starte(k + 1) }) {
                        Text(I18n.t("kunst.enth.skip"), color = Color(0xFFCBD5E1))
                    }
                }
            }
        })
}

/** Kartenbilder je App-Sitzung im Speicher (Web kartenSpeicher): die Enthuellung laedt die Treppchen-Plaetze beim
 *  Oeffnen vor, Galerie und Blaettern nutzen denselben Vorrat. Fehler werden nicht gemerkt (naechstes Mal neu). */
private object KunstKarten {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val fertig = java.util.concurrent.ConcurrentHashMap<Int, ImageBitmap>()
    private val laufend = HashMap<Int, Deferred<ImageBitmap>>()
    fun da(bildId: Int): ImageBitmap? = fertig[bildId]
    private fun laden(bildId: Int): Deferred<ImageBitmap> = synchronized(laufend) {
        laufend.getOrPut(bildId) {
            scope.async(start = CoroutineStart.LAZY) {
                try {
                    val b = Api.kunstKartenBild(bildId)
                    val bild = BitmapFactory.decodeByteArray(b, 0, b.size)?.asImageBitmap() ?: throw IllegalStateException("png")
                    fertig[bildId] = bild
                    bild
                } finally { synchronized(laufend) { laufend.remove(bildId) } }
            }.also { it.start() }
        }
    }
    fun vorladen(bildId: Int) { if (fertig[bildId] == null) laden(bildId) }
    suspend fun hole(bildId: Int): ImageBitmap = fertig[bildId] ?: laden(bildId).await()
}

/** Echter Track als Satellitenbild vom Server (Web KunstKarte, 19.11.2026: keine interaktive Karte im Event, zoomen geht
 *  in den Session-Details). Norden oben, Quellennennung ist eingebrannt. */
@Composable
private fun KunstKarteBild(bildId: Int) {
    var bild by remember(bildId) { mutableStateOf(KunstKarten.da(bildId)) }
    var fehler by remember(bildId) { mutableStateOf<String?>(null) }
    LaunchedEffect(bildId) {
        if (bild == null) try { bild = KunstKarten.hole(bildId) } catch (ex: CancellationException) { throw ex } catch (ex: Exception) {
            fehler = kunstFehlerText(ex)
        }
    }
    Box(Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(8.dp)).background(NACHT), contentAlignment = Alignment.Center) {
        bild?.let { Image(it, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize()) }
        fehler?.let {
            Text(it, color = Color(0xFF94A3B8), style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center,
                modifier = Modifier.padding(16.dp))
        }
    }
}

// -------------------------------------------------------------------------------- Editor ----

/** Bild einreichen bzw. aendern (Web Editor): Session waehlen (Kacheln mit Vorschau), Stueck zuschneiden, drehen. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun KunstEditor(eventId: Int, runde: KunstRunde, onZu: () -> Unit, onFertig: () -> Unit) {
    var kand by remember { mutableStateOf<List<KunstKandidat>?>(null) }
    var sid by remember { mutableStateOf(runde.eigen?.sessionId) }
    var spur by remember { mutableStateOf<List<List<Double>>?>(null) }
    var laeufe by remember { mutableStateOf<List<List<Double>>>(emptyList()) }
    var von by remember { mutableIntStateOf(0) }
    var bis by remember { mutableIntStateOf(0) }
    var dreh by remember { mutableIntStateOf(runde.eigen?.drehung ?: 0) }
    var fehler by remember { mutableStateOf<String?>(null) }
    var laeuft by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(eventId, runde.nr) { kand = runCatching { Api.kunstKandidaten(eventId, runde.nr) }.getOrDefault(emptyList()) }
    LaunchedEffect(sid) {
        val s = sid ?: return@LaunchedEffect
        spur = null; fehler = null
        try {
            val r = Api.kunstSpur(eventId, s)
            val p = r.punkte
            // Beim eigenen, schon eingereichten Bild das gewaehlte Stueck wiederherstellen, sonst die ganze Session.
            val e = runde.eigen?.takeIf { it.sessionId == s }
            val iv = if (e != null) maxOf(0, p.indexOfFirst { it[0] >= e.vonMs }) else 0
            val ib = if (e != null) p.indexOfLast { it[0] <= e.bisMs }.takeIf { it >= 0 } ?: (p.size - 1) else p.size - 1
            laeufe = r.laeufe
            von = iv; bis = maxOf(iv + 1, ib).coerceAtMost(p.size - 1)
            spur = p
        } catch (ex: Exception) { fehler = kunstFehlerText(ex) }
    }
    val sp = spur
    val drehung = Math.floorMod(dreh, 360)
    val vorschau = remember(sp, von, bis, drehung, laeufe) {
        if (sp == null || sp.size < 2) emptyList() else normiere(sp.subList(von.coerceIn(0, sp.size - 1), (bis + 1).coerceIn(1, sp.size)), drehung, laeufe)
    }
    val aufFoil = vorschau.sumOf { it.size }
    fun zeit(i: Int): Int = if (sp != null && i in sp.indices) ((sp[i][0] - sp[0][0]) / 60000.0).roundToInt() else 0
    val grau = MaterialTheme.colorScheme.onSurfaceVariant

    Dialog(onDismissRequest = onZu, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxWidth().padding(12.dp).widthIn(max = 640.dp), shape = RoundedCornerShape(20.dp),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
            Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp)) {
                Text(I18n.t("kunst.editorTitel").replace("{n}", runde.nr.toString()), style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold)
                Text(I18n.t("kunst.editorHinweis"), style = MaterialTheme.typography.bodyMedium, color = grau,
                    modifier = Modifier.padding(top = 4.dp, bottom = 10.dp))
                val kl = kand
                when {
                    kl == null -> Box(Modifier.fillMaxWidth().padding(12.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                    kl.isEmpty() -> Text(I18n.t("kunst.keineSessions").replace("{von}", datum(runde.start)).replace("{bis}", datum(runde.ende)),
                        style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(bottom = 10.dp))
                    sid != null -> {
                        // Ist eine Session gewaehlt, verschwindet die Auswahl (Web: „nur das zu bearbeitende bild anzeigen").
                        val k = kl.firstOrNull { it.id == sid }
                        Row(Modifier.fillMaxWidth().padding(bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(listOfNotNull(k?.let { sessionZeit(it.startedAt) }, k?.sportClass?.let { I18n.t("cls.sport.$it") })
                                .joinToString(" · "), style = MaterialTheme.typography.bodyMedium, maxLines = 2,
                                overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                            Spacer(Modifier.width(8.dp))
                            OutlinedButton(onClick = { sid = null; spur = null; fehler = null }, contentPadding = PaddingValues(horizontal = 12.dp)) {
                                Text(I18n.t("kunst.andereSession"))
                            }
                        }
                    }
                    else -> {
                        // Kacheln mit der ganzen Session als Vorschau (Web: „track-thumbnails zum leichteren auffinden").
                        Column(Modifier.padding(bottom = 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            kl.chunked(3).forEach { reihe ->
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    reihe.forEach { k ->
                                        Column(Modifier.weight(1f).clip(RoundedCornerShape(8.dp))
                                            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(8.dp))
                                            .clickable { sid = k.id }.padding(4.dp)) {
                                            KunstLinie(k.vorschau, k.id, klein = true)
                                            Text(sessionZeit(k.startedAt), style = MaterialTheme.typography.labelSmall, maxLines = 1,
                                                overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 3.dp))
                                            val unter = listOfNotNull(k.sportClass?.let { I18n.t("cls.sport.$it") },
                                                k.caption?.takeIf { it.isNotBlank() }).joinToString(" · ")
                                            if (unter.isNotEmpty()) Text(unter, style = MaterialTheme.typography.labelSmall, color = grau,
                                                maxLines = 1, overflow = TextOverflow.Ellipsis)
                                        }
                                    }
                                    repeat(3 - reihe.size) { Spacer(Modifier.weight(1f)) }
                                }
                            }
                        }
                    }
                }
                if (sid != null && sp == null && fehler == null) {
                    Box(Modifier.fillMaxWidth().padding(12.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                }
                if (sp != null && sp.size >= 2) {
                    KunstLinie(vorschau, sid ?: 0)
                    Spacer(Modifier.height(10.dp))
                    Text(I18n.t("kunst.von").replace("{min}", zeit(von).toString()), style = MaterialTheme.typography.bodyMedium)
                    Slider(value = von.toFloat(), valueRange = 0f..(sp.size - 2).toFloat().coerceAtLeast(0.01f), onValueChange = { x ->
                        val v = x.roundToInt().coerceIn(0, sp.size - 2); von = v; if (bis <= v) bis = v + 1
                    })
                    Text(I18n.t("kunst.bis").replace("{min}", zeit(bis).toString()), style = MaterialTheme.typography.bodyMedium)
                    Slider(value = bis.toFloat(), valueRange = 1f..(sp.size - 1).toFloat().coerceAtLeast(1.01f), onValueChange = { x ->
                        val v = x.roundToInt().coerceIn(1, sp.size - 1); bis = v; if (von >= v) von = v - 1
                    })
                    Text(I18n.t("kunst.drehung").replace("{grad}", drehung.toString()), style = MaterialTheme.typography.bodyMedium)
                    Slider(value = drehung.toFloat(), valueRange = 0f..359f, onValueChange = { dreh = it.roundToInt() })
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf(-90, -15, 15, 90).forEach { g ->
                            OutlinedButton(onClick = { dreh = drehung + g }, contentPadding = PaddingValues(horizontal = 10.dp)) {
                                Text(if (g > 0) "+$g°" else "$g°", style = MaterialTheme.typography.labelMedium)
                            }
                        }
                    }
                    Text(I18n.t("kunst.punkte").replace("{n}", aufFoil.toString()), style = MaterialTheme.typography.bodySmall,
                        color = grau, modifier = Modifier.padding(top = 6.dp))
                }
                fehler?.let {
                    Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(top = 10.dp))
                }
                Row(Modifier.padding(top = 14.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(enabled = sp != null && !laeuft && aufFoil >= 10, onClick = {
                        val s = sid ?: return@Button
                        val p = sp ?: return@Button
                        laeuft = true; fehler = null
                        scope.launch {
                            try {
                                Api.kunstEinreichen(eventId, runde.nr, s, p[von][0].toLong(), p[bis][0].toLong(), drehung)
                                onFertig()
                            } catch (ex: Exception) { fehler = kunstFehlerText(ex) }
                            laeuft = false
                        }
                    }, colors = ButtonDefaults.buttonColors(containerColor = CYAN, contentColor = DUNKEL)) {
                        Text(I18n.t(if (runde.eigen != null) "kunst.speichern" else "kunst.einreichen"), fontWeight = FontWeight.SemiBold)
                    }
                    TextButton(onClick = onZu) { Text(I18n.t("common.cancel")) }
                }
            }
        }
    }
}
