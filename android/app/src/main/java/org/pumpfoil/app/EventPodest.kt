package org.pumpfoil.app

import android.media.AudioAttributes
import android.media.MediaPlayer
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedIconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/*
 * Siegertreppchen ueber der Bestenliste beendeter Events (nativ aus web/src/components/EventPodest.tsx, Web 09.11.2026).
 * Zeigt die gerade gewaehlte Bestenliste: Fahrer als schwebende Foils (Gold am hoechsten, Reihenfolge 2 – 1 – 3, keine
 * Sockel), bei globalen Events umschaltbar auf die Team-Wertung — je Team ein Foil (Mastlaenge = Platz), darauf je Mitglied
 * ein Kopf (hell = im Event gefahren, grau = nicht).
 *
 * Ton: „Winner Awards Logo" (Pixabay, Pixabay-Lizenz: Einbau erlaubt, Weitergabe der Datei fuer sich allein nicht) —
 * deshalb NICHT in der App, sondern vom Server gestreamt (server/media/sounds/). Spielt beim Betreten der Seite, dazu per
 * Knopf; „Stumm" merkt sich die App (wie der Browser `podest-stumm`). Beim Verlassen wird der Spieler freigegeben.
 */

private const val TON_PFAD = "/media/sounds/winner-awards-484333.mp3"
private const val STUMM_PREF = "podest-stumm"

private class Metall(val fill: Color, val rand: Color)

// Gold, Silber, Bronze (Web METALL)
private val METALL = listOf(
    Metall(Color(0xFFFACC15), Color(0xFFA16207)),
    Metall(Color(0xFFCBD5E1), Color(0xFF475569)),
    Metall(Color(0xFFEA8A4A), Color(0xFF9A3412)),
)
private fun metall(platz: Int) = METALL.getOrElse(platz - 1) { METALL[2] }
private val LORBEER = Color(0xFF16A34A)

private fun svgPfad(d: String): Path = PathParser().parsePathString(d).toPath()

// Foil in Seitenansicht wie im Wappen von Team 9 (Web Foil, viewBox "-20 22 162 82"): Brett flach, Mast bei ~80 %,
// Frontfluegel mittig, Stab hinten. Die Pfade 1:1 aus dem SVG.
private val FOIL_FRONT = "M36 96 Q44 91.6 58 92.6 Q68 93.4 68 96 Q68 98.6 58 99.4 Q44 100.4 36 96 Z"
private val FOIL_HECK = "M101 96 Q109 92.8 118.5 94.8 L118.5 97.2 Q109 99.2 101 96 Z"
private val LORBEER_STIELE = listOf("M-4 100 Q-20 75 -2 44", "M126 100 Q142 75 124 44")
// Lorbeerblaetter: cx, cy, Drehung (rx 6, ry 3)
private val LORBEER_BLAETTER = listOf(
    Triple(-12f, 88f, -70f), Triple(-12f, 70f, -95f), Triple(-6f, 53f, -120f),
    Triple(134f, 88f, 70f), Triple(134f, 70f, 95f), Triple(128f, 53f, 120f),
)

/** Abgerundetes Rechteck aus dem SVG: gefuellt, mit duennem Rand. */
private fun DrawScope.svgRect(x: Float, y: Float, w: Float, h: Float, rx: Float, m: Metall, strich: Float) {
    drawRoundRect(m.fill, Offset(x, y), Size(w, h), CornerRadius(rx, rx))
    drawRoundRect(m.rand, Offset(x, y), Size(w, h), CornerRadius(rx, rx), style = Stroke(strich))
}

private fun DrawScope.svgPfadMalen(p: Path, m: Metall, strich: Float) {
    drawPath(p, m.fill)
    drawPath(p, m.rand, style = Stroke(strich))
}

@Composable
private fun PodestFoil(platz: Int, modifier: Modifier = Modifier) {
    val m = metall(platz)
    val gold = platz == 1
    val front = remember { svgPfad(FOIL_FRONT) }
    val heck = remember { svgPfad(FOIL_HECK) }
    val stiele = remember { LORBEER_STIELE.map(::svgPfad) }
    Canvas(modifier.aspectRatio(162f / 82f)) {
        val k = size.width / 162f
        withTransform({ scale(k, k, pivot = Offset.Zero); translate(20f, -22f) }) {
            if (gold) {
                LORBEER_BLAETTER.forEach { (cx, cy, grad) ->
                    rotate(grad, pivot = Offset(cx, cy)) { drawOval(LORBEER, Offset(cx - 6f, cy - 3f), Size(12f, 6f)) }
                }
                stiele.forEach { drawPath(it, LORBEER, style = Stroke(2f)) }
            }
            svgRect(4f, 28f, 96f, 8f, 4f, m, 0.8f)
            svgRect(80f, 36f, 6.5f, 58f, 0f, m, 0.8f)
            svgRect(40f, 94f, 78f, 4f, 2f, m, 0.8f)
            svgPfadMalen(front, m, 0.8f)
            svgPfadMalen(heck, m, 0.8f)
        }
    }
}

// Teams (Web 09.11.2026): ein Foil je Team ganz in Gold/Silber/Bronze, die Mastlaenge gibt die Hoehe (Gold am laengsten).
private val MAST = listOf(70f, 44f, 22f)
// Hoechstens so viele Koepfe; die echten Zahlen stehen darunter.
private const val KOEPFE_MAX = 30

@Composable
private fun TeamFoil(platz: Int, modifier: Modifier = Modifier) {
    val m = metall(platz)
    val l = MAST.getOrElse(platz - 1) { 22f }
    val y = 6.5f + l   // Hoehe der Fluegel (Brett 6 hoch)
    val front = remember(y) { svgPfad("M36 $y Q44 ${y - 4.4f} 58 ${y - 3.4f} Q68 ${y - 2.6f} 68 $y Q68 ${y + 2.6f} 58 ${y + 3.4f} Q44 ${y + 4.4f} 36 $y Z") }
    val heck = remember(y) { svgPfad("M101 $y Q109 ${y - 3.2f} 118.5 ${y - 1.2f} L118.5 ${y + 1.2f} Q109 ${y + 3.2f} 101 $y Z") }
    Canvas(modifier.fillMaxWidth().aspectRatio(122f / (y + 6f))) {
        val k = size.width / 122f
        withTransform({ scale(k, k, pivot = Offset.Zero) }) {
            svgRect(80f, 6.5f, 6f, l, 0f, m, 0.6f)
            svgRect(40f, y - 2f, 78f, 4f, 2f, m, 0.6f)
            svgPfadMalen(front, m, 0.6f)
            svgPfadMalen(heck, m, 0.6f)
            svgRect(4f, 0.75f, 96f, 6f, 3f, m, 0.6f)
        }
    }
}

private val KOPF_RUMPF = "M1.6 27.4 Q1.6 13.6 9 13.6 Q16.4 13.6 16.4 27.4 Z"

/** Ein Mitglied (viewBox 18 × 28): Kopf und Schultern. */
@Composable
private fun Kopf(farbe: Color, breite: Dp) {
    val rumpf = remember { svgPfad(KOPF_RUMPF) }
    Canvas(Modifier.size(breite, breite * 28f / 18f)) {
        val k = size.width / 18f
        withTransform({ scale(k, k, pivot = Offset.Zero) }) {
            drawCircle(farbe, 4.8f, Offset(9f, 6f))
            drawPath(rumpf, farbe)
        }
    }
}

/** Reihenfolge nebeneinander: 2 – 1 – 3 (bei weniger als drei Plaetzen nur die vorhandenen). */
private fun <T> treppe(l: List<T>): List<Pair<T, Int>> {
    val mit = l.take(3).mapIndexed { i, x -> x to i + 1 }
    return when (mit.size) { 3 -> listOf(mit[1], mit[0], mit[2]); 2 -> listOf(mit[1], mit[0]); else -> mit }
}

private fun rangGroesse(platz: Int) = when (platz) { 1 -> 30.sp; 2 -> 24.sp; else -> 20.sp }

@Composable
private fun FahrerPlatz(z: TeamZeile, platz: Int, kennzahl: String, modifier: Modifier) {
    val oeffneFoiler = LocalOpenFoiler.current
    val w = z.teams?.firstOrNull()
    val uid = z.userId
    Column(modifier.padding(bottom = when (platz) { 1 -> 56.dp; 2 -> 24.dp; else -> 0.dp }),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        PodestFoil(platz, Modifier.fillMaxWidth().widthIn(max = when (platz) { 1 -> 230.dp; 2 -> 180.dp; else -> 160.dp }))
        Text("$platz.", color = metall(platz).rand, fontSize = rangGroesse(platz), fontWeight = FontWeight.ExtraBold, lineHeight = rangGroesse(platz))
        val nameGr = if (platz == 1) 16.sp else 14.sp
        Text(z.name ?: z.initialen, fontSize = nameGr, fontWeight = FontWeight.ExtraBold, maxLines = 1, overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center,
            modifier = if (uid != null && oeffneFoiler != null) Modifier.clip(RoundedCornerShape(4.dp)).clickable { oeffneFoiler(uid) } else Modifier)
        val flagge = flaggeEmoji(z.land)
        if (flagge != null || w != null) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                flagge?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
                w?.let { TeamWappen(it.name, it.logoUrl, it.farbe, 20.dp) }
            }
        }
        Text(kennzahlWert(kennzahl, z.value), fontSize = nameGr, fontWeight = FontWeight.ExtraBold, maxLines = 1,
            overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TeamPlatz(x: TeamWertungZeile, platz: Int, kennzahl: String, onOpenTeam: (String) -> Unit, modifier: Modifier) {
    val mitglieder = maxOf(x.mitglieder ?: x.teilnehmer, x.teilnehmer)
    // Ueber KOEPFE_MAX: im Verhaeltnis verkleinert, mindestens ein heller Kopf, wenn jemand gefahren ist.
    val koepfe = minOf(mitglieder, KOEPFE_MAX)
    val hell = if (mitglieder <= KOEPFE_MAX) x.teilnehmer
               else maxOf(if (x.teilnehmer > 0) 1 else 0, Math.round(x.teilnehmer * KOEPFE_MAX.toFloat() / mitglieder))
    val dunkel = teamDunkel()
    // Web: text-slate-100 / text-slate-600, die im hellen Modus kippen.
    val farbeGefahren = if (dunkel) Color(0xFFF1F5F9) else Color(0xFF0F172A)
    val farbeNicht = if (dunkel) Color(0xFF475569) else Color(0xFFA8B3C4)
    Column(modifier.padding(bottom = 16.dp), horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("$platz.", color = metall(platz).rand, fontSize = rangGroesse(platz), fontWeight = FontWeight.ExtraBold, lineHeight = rangGroesse(platz))
        TeamWappen(x.name, x.logoUrl, x.farbe, if (platz == 1) 56.dp else 44.dp)
        Text(x.name, fontSize = 14.sp, fontWeight = FontWeight.ExtraBold, maxLines = 1, overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center, modifier = Modifier.clip(RoundedCornerShape(4.dp)).clickable { onOpenTeam(x.slug) })
        TeamHerkunftZeichen(x.land, kuerzel = false)
        Text(kennzahlWert(kennzahl, x.value), fontSize = 16.sp, fontWeight = FontWeight.ExtraBold, maxLines = 1,
            overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center)
        BoxWithConstraints(Modifier.fillMaxWidth().widthIn(max = when (platz) { 1 -> 230.dp; 2 -> 190.dp; else -> 170.dp })) {
            // Die Mitglieder stehen auf dem Brett (3 % … 82 % der Breite). Kopfgroesse so, dass sie hoechstens vier
            // Reihen brauchen (auf dem Handy sonst ein Turm), nie ueberlappend: jeder Kopf hat seine eigene Zelle.
            val breite = maxWidth
            val platzKoepfe = breite * 0.79f
            val kw = listOf(18, 16, 14, 12, 11, 10).map { it.dp }.firstOrNull { b ->
                val jeReihe = maxOf(1, (platzKoepfe / b).toInt())
                (koepfe + jeReihe - 1) / jeReihe <= 4
            } ?: (platzKoepfe / 8f).coerceAtMost(9.dp)
            Column {
                FlowRow(Modifier.padding(start = breite * 0.03f).width(platzKoepfe),
                    horizontalArrangement = Arrangement.Center, verticalArrangement = Arrangement.Bottom) {
                    repeat(koepfe) { i -> Kopf(if (i < hell) farbeGefahren else farbeNicht, kw) }
                }
                TeamFoil(platz)
            }
        }
        Text("${x.teilnehmer} / $mitglieder", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/** Siegerton: vom Server gestreamt (Lizenz, s. o.), nie in der App. Ein Spieler zur Zeit; `stop` gibt ihn frei. */
private class Fanfare {
    private var mp: MediaPlayer? = null
    fun start() {
        stop()
        runCatching {
            val p = MediaPlayer()
            p.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
            p.setDataSource(Api.BASE.trimEnd('/') + TON_PFAD)
            p.setVolume(0.6f, 0.6f)
            p.setOnPreparedListener { it.start() }
            p.setOnCompletionListener { if (mp === it) stop() }
            p.setOnErrorListener { _, _, _ -> stop(); true }
            mp = p
            p.prepareAsync()
        }.onFailure { stop() }
    }
    fun stop() {
        val p = mp ?: return
        mp = null
        runCatching { p.release() }
    }
}

/**
 * Siegertreppchen (Web EventPodest): die gerade gewaehlte Bestenliste `tf`, bei globalen Events mit Team-Wertung
 * umschaltbar auf die Teams. Nur fuer beendete Events (entscheidet der Aufrufer).
 */
@Composable
internal fun EventPodest(evId: Int, tf: TeamTafel, global: Boolean, farbe: TeamFarbe, onOpenTeam: (String) -> Unit) {
    val ctx = LocalContext.current
    val prefs = remember { ctx.getSharedPreferences("pumpfoil", android.content.Context.MODE_PRIVATE) }
    var stumm by remember { mutableStateOf(runCatching { prefs.getBoolean(STUMM_PREF, false) }.getOrDefault(false)) }
    var teamsAnsicht by remember { mutableStateOf(false) }
    val fanfare = remember { Fanfare() }
    // Beim Betreten (je Event), wenn nicht stumm; beim Verlassen der Seite Spieler freigeben.
    LaunchedEffect(evId) { if (!stumm) fanfare.start() }
    DisposableEffect(Unit) { onDispose { fanfare.stop() } }

    val zeilen = tf.zeilen.take(3)
    val teams = tf.teams.orEmpty().take(3)
    if (zeilen.isEmpty() && teams.isEmpty()) return
    val teamsDa = global && tf.teams.orEmpty().isNotEmpty()
    val zeigeTeams = teamsDa && teamsAnsicht
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(kennzahlLabel(tf.kennzahl), color = farbe.akzent, style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                OutlinedIconButton(onClick = { fanfare.start() }, shape = RoundedCornerShape(12.dp), modifier = Modifier.size(40.dp),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
                    Icon(Icons.AutoMirrored.Filled.VolumeUp, contentDescription = I18n.t("team.podest.ton"), modifier = Modifier.size(20.dp))
                }
                Spacer(Modifier.width(4.dp))
                Row(Modifier.clip(RoundedCornerShape(8.dp)).clickable {
                    stumm = !stumm
                    runCatching { prefs.edit().putBoolean(STUMM_PREF, stumm).apply() }
                    if (stumm) fanfare.stop()
                }, verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = stumm, onCheckedChange = { v ->
                        stumm = v
                        runCatching { prefs.edit().putBoolean(STUMM_PREF, v).apply() }
                        if (v) fanfare.stop()
                    })
                    Text(I18n.t("team.podest.stumm"), style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(end = 6.dp))
                }
            }
            if (teamsDa) {
                // Umschalter Fahrer / Teams (Web: Pillengruppe)
                Row(Modifier.padding(top = 6.dp).clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surfaceVariant).padding(2.dp)) {
                    listOf(false to "team.podest.fahrer", true to "team.event.teams").forEach { (an, key) ->
                        val gewaehlt = teamsAnsicht == an
                        Box(Modifier.clip(RoundedCornerShape(10.dp))
                            .then(if (gewaehlt) Modifier.background(MaterialTheme.colorScheme.surface) else Modifier)
                            .clickable { teamsAnsicht = an }.padding(horizontal = 12.dp, vertical = 8.dp)) {
                            Text(I18n.t(key), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold,
                                color = if (gewaehlt) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
            if (zeigeTeams) {
                Row(Modifier.fillMaxWidth().padding(top = 12.dp), verticalAlignment = Alignment.Bottom,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    treppe(teams).forEach { (x, platz) -> TeamPlatz(x, platz, tf.kennzahl, onOpenTeam, Modifier.weight(1f)) }
                }
            } else {
                Row(Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 20.dp), verticalAlignment = Alignment.Bottom,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    treppe(zeilen).forEach { (z, platz) -> FahrerPlatz(z, platz, tf.kennzahl, Modifier.weight(1f)) }
                }
            }
        }
    }
}

/**
 * Event-Uebersicht als Teilen-Bild (Web EventUebersichtBild, c0d044a2, 07.11.2026): Gesamtsummen plus die ersten 3 je
 * Kategorie; welche Kategorien (Bestenlisten, bei globalen Events auch ihre Team-Wertungen), waehlt man im Dialog.
 */
@Composable
internal fun EventUebersichtDialog(ev: TeamEvent, team: TeamInfo, stand: String?, abzeichen: String?, onClose: () -> Unit) {
    class Kategorie(val key: String, val titel: String, val tf: TeamTafel, val team: Boolean)
    val kategorien = remember(ev) {
        ev.tafeln.mapIndexed { i, tf -> Kategorie("p$i", kennzahlLabel(tf.kennzahl), tf, false) } +
            (if (ev.global) ev.tafeln.mapIndexed { i, tf ->
                Kategorie("t$i", "${I18n.t("team.event.teams")} · ${kennzahlLabel(tf.kennzahl)}", tf, true)
            } else emptyList())
    }
    // Standard: die Bestenlisten der Fahrer (hoechstens 4, damit das Bild nicht zu lang wird), Team-Wertungen abgewaehlt.
    var wahl by remember(ev) { mutableStateOf(kategorien.filter { !it.team }.take(4).map { it.key }.toSet()) }
    val d = remember(ev, wahl, stand) {
        val summen = EVENT_SUMMEN.filter { it.first in ev.summenAuswahl }.map { (key, label, fmt) ->
            val v = ev.summen[key] ?: 0.0
            fmt(v) to I18n.t(if (v == 1.0 && key == "aktive") "team.event.teilnehmer1" else label)
        }
        val gruppen = kategorien.filter { it.key in wahl }.map { k ->
            val zeilen = if (k.team) k.tf.teams.orEmpty().take(3).map { x ->
                BildZeile(x.rang, x.name, kennzahlWert(k.tf.kennzahl, x.value), false, land = x.land,
                    wappen = true, logoUrl = x.logoUrl, farbe = x.farbe)
            } else k.tf.zeilen.take(3).map { z ->
                val w = if (ev.global) z.teams?.firstOrNull() else null
                BildZeile(z.rang, z.name ?: z.initialen, kennzahlWert(k.tf.kennzahl, z.value), false, land = z.land,
                    wappen = w != null, logoUrl = w?.logoUrl, farbe = w?.farbe)
            }
            BildGruppe(k.titel, zeilen)
        }
        TeamBildDaten(ev.titel,
            listOfNotNull(team.name, eventZeitraum(ev.start, ev.ende, ev.zeitzone), stand).joinToString(" · "),
            emptyList(), "${team.slug}-event-${ev.id}-uebersicht.png", abzeichen = abzeichen, leer = "—",
            summen = summen, gruppen = gruppen, hoehe = uebersichtHoehe(summen.size, gruppen.size),
            wappenPlatz = gruppen.any { gr -> gr.zeilen.any { it.wappen } })
    }
    TeamBildDialog(d, onClose, titel = I18n.t("team.event.uebersichtTeilen"), extra = {
        Column(Modifier.padding(bottom = 8.dp)) {
            Text(I18n.t("team.event.uebersichtWahl"), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            kategorien.forEach { k ->
                val an = k.key in wahl
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).clickable { wahl = if (an) wahl - k.key else wahl + k.key },
                    verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = an, onCheckedChange = { v -> wahl = if (v) wahl + k.key else wahl - k.key })
                    Text(k.titel, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    })
}
