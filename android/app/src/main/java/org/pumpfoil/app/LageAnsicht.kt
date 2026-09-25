package org.pumpfoil.app

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.input.pointer.pointerInput
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

/*
 * LAGE DES BRETTS — Handy am Brett montiert, portiert aus der PWA am 25.09.2026
 * (SessionDetail.tsx, BoardAttitude.tsx). Bis dahin fehlte der App der ganze Bereich: keine
 * Frage, kein Schalter, keine Zahlen.
 *
 * Alles haengt an `placement == "board"`. Ohne feste Montage misst das Handy den FAHRER und
 * nicht das Brett (Kopf von server/app/analysis/lage.py) — Nick- und Rollwinkel aus einer
 * Hosentasche waeren keine Aussage ueber das Brett.
 */

/**
 * „Sass das Handy am Brett?" — nur, wenn die Erkennung anschlaegt, und dann stehen bleibend
 * (Jan, 24.09.2026: „der Hinweis soll nur kommen wenn die erkennung das sagt, dann erstmal
 * dauerhaft ist ok"). Ein Tipp setzt `placement`; danach liefert der Server `verdacht: false`,
 * und der Kasten verschwindet von selbst. Cyan statt Amber: ein Angebot, kein Problem.
 */
@Composable
fun BrettFrage(s: SessionDetail, onReload: () -> Unit) {
    var frage by remember(s.id, s.placement) { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    // Nur anfragen, wenn es Kreiseldaten gibt — ohne sie kann die Antwort nur „nein" lauten, und
    // der Aufruf kostet serverseitig einen Rechendurchgang je Lauf.
    LaunchedEffect(s.id, s.hasGyro, s.placement) {
        frage = false
        if (!s.owned || !s.hasGyro || s.placement == "board") return@LaunchedEffect
        frage = try { Api.boardHint(s.id).verdacht } catch (_: Exception) { false }
    }
    if (!frage) return
    Card(
        Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
    ) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(I18n.t("sd.boardAsk"), Modifier.weight(1f), fontWeight = FontWeight.SemiBold,
                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onPrimaryContainer)
            Button(onClick = {
                scope.launch {
                    try { Api.setPlacement(s.id, "board"); frage = false; onReload() } catch (_: Exception) {}
                }
            }) { Text(I18n.t("sd.boardAskYes")) }
        }
    }
    Spacer(Modifier.height(8.dp))
}

/**
 * „Handy war am Brett" als Haken — nur bei Aufnahmen MIT Kreisel (die liefern allein die
 * Handy-Recorder); eine schon markierte behaelt ihn, sonst liesse sich nichts zuruecknehmen.
 *
 * ABHAKEN heisst NICHT „war am Koerper": bei einer Handy-Aufnahme wird "phone" gesetzt, bei allem
 * anderen das Feld geleert — sonst stuende eine Uhr als Handy-Recording in der DB (PWA, 25.09.).
 */
@Composable
fun BrettSchalter(s: SessionDetail, onReload: () -> Unit) {
    if (!s.owned || !(s.hasGyro || s.placement == "board")) return
    val scope = rememberCoroutineScope()
    var busy by remember(s.id) { mutableStateOf(false) }
    val an = s.placement == "board"
    Row(
        Modifier.fillMaxWidth().clickable(enabled = !busy) {
            busy = true
            val wert = if (!an) "board" else if (s.hasGyro) "phone" else ""
            scope.launch {
                try { Api.setPlacement(s.id, wert); onReload() } catch (_: Exception) {}
                busy = false
            }
        },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Checkbox(checked = an, onCheckedChange = null, enabled = !busy)
        Text(I18n.t("board.markBoard"), style = MaterialTheme.typography.bodyMedium)
    }
}

/**
 * LAGE JE LAUF als eigene kleine Tabelle unter der grossen (PWA, Jan 22.09.: „sollte eher als
 * zusaetzliche stats-zeile in der tabelle je lauf angezeigt & berechnet werden"). EIN Abruf fuer
 * alle Laeufe, mit `hz = 2` — die Kurven braucht die Tabelle nicht.
 *
 * Unsicherer Hub in Klammern, geerbte Montage grau — beides ohne Warnfarbe (Jan, 23.09.: eine
 * abweichende Gradzahl sagt schon, dass die Montage eine andere war; ein Alarm machte daraus
 * einen Fehler, wo keiner ist).
 */
@Composable
fun LageJeLaufTabelle(s: SessionDetail, selected: Int?, onSelect: (Int) -> Unit) {
    if (s.placement != "board") return
    var laeufe by remember(s.id) { mutableStateOf<List<LageLauf>>(emptyList()) }
    LaunchedEffect(s.id, s.placement) {
        laeufe = try {
            val d = Api.boardAttitude(s.id, jeLauf = true, hz = 2)
            if (d.ok) d.laeufe.filter { it.ok } else emptyList()
        } catch (_: Exception) { emptyList() }
    }
    if (laeufe.isEmpty()) return
    val grau = MaterialTheme.colorScheme.onSurfaceVariant
    Spacer(Modifier.height(12.dp))
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(vertical = 10.dp)) {
            Text(I18n.t("sd.attitudePerRun").uppercase(), style = MaterialTheme.typography.labelMedium,
                color = grau, modifier = Modifier.padding(horizontal = 12.dp))
            Column(Modifier.horizontalScroll(rememberScrollState()).padding(top = 6.dp)) {
                val breiten = listOf(36, 72, 72, 104, 120, 72, 80)
                @Composable
                fun Zeile(werte: List<String>, kopf: Boolean, gedimmt: Set<Int> = emptySet(), mod: Modifier = Modifier) {
                    Row(mod.padding(horizontal = 12.dp, vertical = 6.dp)) {
                        werte.forEachIndexed { i, w ->
                            Text(w, Modifier.width(breiten[i].dp),
                                style = if (kopf) MaterialTheme.typography.labelSmall else MaterialTheme.typography.bodyMedium,
                                color = if (kopf || i in gedimmt) grau else MaterialTheme.colorScheme.onSurface)
                        }
                    }
                }
                Zeile(listOf("#", I18n.t("board.pitch"), I18n.t("board.roll"), I18n.t("board.yaw"),
                    I18n.t("sd.colPitchRhythm"), I18n.t("sd.colHeave"), I18n.t("board.mounting")), kopf = true)
                HorizontalDivider()
                laeufe.forEach { k ->
                    val hub = k.hubPpCm?.let { v ->
                        val t = "${v.roundToInt()} cm"
                        if (k.hubSicher) t else "($t)"
                    } ?: "–"
                    val gedimmt = buildSet { if (!k.hubSicher) add(5); if (!k.rotEigen) add(6) }
                    Zeile(
                        listOf(
                            "${k.lauf + 1}",
                            k.pitchAmplitudeDeg?.let { "±${it.roundToInt()}°" } ?: "–",
                            k.rollAmplitudeDeg?.let { "±${it.roundToInt()}°" } ?: "–",
                            k.gierRmsDegS?.let { "${it.roundToInt()}°/s" } ?: "–",
                            k.pitchHz?.let { String.format("%.2f Hz", it) } ?: "–",
                            hub,
                            k.rotDeg?.let { "${it.roundToInt()}°" } ?: "–",
                        ),
                        kopf = false, gedimmt = gedimmt,
                        mod = Modifier
                            .then(if (selected == k.lauf) Modifier.background(MaterialTheme.colorScheme.primary.copy(alpha = 0.18f)) else Modifier)
                            .clickable { onSelect(k.lauf) },
                    )
                }
            }
        }
    }
}

private val GIER_FENSTER = listOf(0.1, 0.5, 1.0, 3.0, 5.0)   // Sekunden fuer die Gier-Aenderung

private class Reihe(val name: String, val werte: List<Double>, val farbe: androidx.compose.ui.graphics.Color,
                    val einheit: String) {
    val max: Double = maxOf(1.0, werte.maxOfOrNull { kotlin.math.abs(it) } ?: 1.0)
}

/**
 * Die LAGE-ANSICHT: drei Kacheln mit der massstaeblichen Zeichnung (Nicken, Rollen, Gieren), die
 * Kurven darunter mit Zeiger, und die Kennzahlen. Portiert aus BoardAttitude.tsx.
 *
 * WIE DIE ZEICHNUNG SICH BEWEGT: in der PWA folgt sie der Wiedergabe der Session-Karte — die gibt
 * es in der App nicht. Hier fuehren deshalb zwei Wege zur selben Stelle, wie im Web Maus und
 * Wiedergabe: der FINGER auf den Kurven, und ein eigener Abspielknopf, der in ECHTZEIT laeuft
 * (Changelog 24.09.: „Playing back a session starts at real speed instead of eight times
 * faster"). Beide speisen denselben Index, damit Zeiger und Zeichnung nie auseinanderlaufen.
 */
@Composable
fun LageAnsicht(s: SessionDetail, run: Int?) {
    if (s.placement != "board") return
    var fenster by remember { mutableStateOf(1.0) }
    var d by remember(s.id) { mutableStateOf<BoardAttitude?>(null) }
    var laden by remember { mutableStateOf(true) }
    // Standard: alles in EINEM Bild (Jan, 21.09.) — der Vergleich der Kurven ist der Zweck.
    var zusammen by remember { mutableStateOf(true) }
    var pos by remember(s.id, run) { mutableStateOf(1f) }          // 0..1 auf der Zeitachse
    var spielt by remember(s.id, run) { mutableStateOf(false) }
    var gezogen by remember { mutableStateOf(false) }
    LaunchedEffect(s.id, run, fenster) {
        laden = true
        d = try { Api.boardAttitude(s.id, run = run, hz = 20, yawWindowS = fenster) } catch (_: Exception) { null }
        laden = false
    }
    val daten = d
    val tMs = daten?.tMs.orEmpty()
    // Abspielen in Echtzeit: die Position waechst um die vergangene Wanduhrzeit geteilt durch die
    // Spanne der Aufnahme. Vom Ende aus neu starten.
    LaunchedEffect(spielt, tMs) {
        if (!spielt || tMs.size < 2) return@LaunchedEffect
        val spanne = (tMs.last() - tMs.first()).coerceAtLeast(1L).toFloat()
        if (pos >= 1f) pos = 0f
        var vorher = androidx.compose.runtime.withFrameMillis { it }
        while (spielt && pos < 1f) {
            val jetzt = androidx.compose.runtime.withFrameMillis { it }
            if (!gezogen) pos = (pos + (jetzt - vorher) / spanne).coerceAtMost(1f)
            vorher = jetzt
        }
        spielt = false
    }

    Spacer(Modifier.height(12.dp))
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp)) {
            Text(I18n.t("board.title"), style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.height(6.dp))
            when {
                laden && daten == null -> Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
                daten == null || !daten.ok || tMs.isEmpty() -> Text(
                    daten?.grund?.let { "${I18n.t("board.noData")} ($it)" } ?: I18n.t("board.noData"),
                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                else -> LageInhalt(s, daten, fenster, zusammen, pos, spielt,
                    onPos = { pos = it }, onZiehen = { gezogen = it; if (it) spielt = false },
                    onSpielen = { spielt = !spielt }, onZusammen = { zusammen = !zusammen },
                    onFenster = { fenster = it })
            }
        }
    }
}

@Composable
private fun LageInhalt(
    s: SessionDetail, d: BoardAttitude, fenster: Double, zusammen: Boolean, pos: Float, spielt: Boolean,
    onPos: (Float) -> Unit, onZiehen: (Boolean) -> Unit, onSpielen: () -> Unit, onZusammen: () -> Unit,
    onFenster: (Double) -> Unit,
) {
    val tMs = d.tMs
    val idx = ((tMs.size - 1) * pos).roundToInt().coerceIn(0, tMs.size - 1)
    val grau = MaterialTheme.colorScheme.onSurfaceVariant
    val reihen = remember(d) {
        buildList {
            add(Reihe(I18n.t("board.pitch"), d.pitchDeg, androidx.compose.ui.graphics.Color(0xFF38BDF8), "°"))
            add(Reihe(I18n.t("board.roll"), d.rollDeg, androidx.compose.ui.graphics.Color(0xFFF59E0B), "°"))
            add(Reihe(I18n.t("board.yaw"), d.gierDeltaDeg, androidx.compose.ui.graphics.Color(0xFFA78BFA), "°"))
            d.hubCm?.let { add(Reihe(I18n.t("board.height"), it, androidx.compose.ui.graphics.Color(0xFF34D399), " cm")) }
        }
    }
    // Bildausschnitt der Seitenansicht NUR aus dem ausgewaehlten Lauf, mit robustem Maximum
    // (95. Perzentil) — sonst bestimmt der Rand (Steg, Sturz, doppelt integrierter Hub bis 147 cm)
    // den Massstab, und das Rig wird winzig (Jan, 21.09.: „warum ist das board links so klein?").
    val hubBereich = remember(d) {
        val hub = d.hubCm.orEmpty()
        if (hub.isEmpty()) 0.0 else {
            val von = d.auswahlVonMs; val bis = d.auswahlBisMs
            val nur = if (von != null && bis != null) hub.filterIndexed { i, _ -> tMs[i] in von..bis } else hub
            val basis = if (nur.size >= 8) nur else hub
            val sortiert = basis.map { kotlin.math.abs(it) }.sorted()
            maxOf(2.0, sortiert[minOf(sortiert.size - 1, (sortiert.size * 0.95).toInt())])
        }
    }
    val hub = (d.hubCm?.getOrNull(idx) ?: 0.0).coerceIn(-hubBereich, hubBereich)
    val pitch = d.pitchDeg.getOrNull(idx) ?: 0.0
    val roll = d.rollDeg.getOrNull(idx) ?: 0.0
    val gier = d.gierDeltaDeg.getOrNull(idx) ?: 0.0
    val uhrzeit = { t: Long ->
        hhmmssOffset(s.startedAt, s.tz, Clockmap.wanduhrMs(s.pauseWindows, t) / 1000) ?: ""
    }

    d.rig?.let { rig ->
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            LageKachel(I18n.t("board.pitch"), I18n.t("board.pitchHint"), pitch) {
                SeitenAnsicht(rig, pitch, hub, hubBereich, grau)
            }
            LageKachel(I18n.t("board.roll"), I18n.t("board.rollHint"), roll) {
                FrontAnsicht(rig, roll, pitch, grau)
            }
            LageKachel(I18n.t("board.yaw"),
                I18n.t("board.yawHint").replace("{s}", fensterText(fenster)), gier) {
                DraufAnsicht(rig, gier, grau)
            }
        }
        Spacer(Modifier.height(10.dp))
    }

    LageKurven(reihen, tMs, pos, idx, zusammen, d.auswahlVonMs, d.auswahlBisMs, onPos, onZiehen)
    Row(Modifier.fillMaxWidth().padding(top = 2.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        listOf(0f, 0.5f, 1f).forEach { f ->
            val i = ((tMs.size - 1) * f).roundToInt().coerceIn(0, tMs.size - 1)
            Text(uhrzeit(tMs[i]), style = MaterialTheme.typography.labelSmall, color = grau)
        }
    }

    // Bedienelemente UNTER den Kurven (Jan, 20.09.), damit Zeichnung und Kurve zusammenstehen.
    Spacer(Modifier.height(8.dp))
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        FilledTonalButton(onClick = onSpielen) {
            Icon(if (spielt) Icons.Filled.Pause else Icons.Filled.PlayArrow, contentDescription = null)
        }
        OutlinedButton(onClick = onZusammen) {
            Text(I18n.t(if (zusammen) "board.separate" else "board.combined"))
        }
        Spacer(Modifier.weight(1f))
        val sek = (tMs[idx] - tMs.first()) / 1000.0
        Text("${uhrzeit(tMs[idx])} · ${String.format("%.1f", sek)} s",
            style = MaterialTheme.typography.labelMedium, color = grau)
    }
    Row(Modifier.horizontalScroll(rememberScrollState()), verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(I18n.t("board.window"), style = MaterialTheme.typography.labelMedium, color = grau)
        GIER_FENSTER.forEach { f ->
            FilterChip(selected = f == fenster, onClick = { onFenster(f) },
                label = { Text("${fensterText(f)} s") })
        }
    }

    d.kennzahlen?.let { k ->
        val teile = buildList {
            add(I18n.t("board.stats")
                .replace("{pitch}", k.pitchAmplitudeDeg.roundToInt().toString())
                .replace("{roll}", k.rollAmplitudeDeg.roundToInt().toString())
                .replace("{yaw}", k.gierRmsDegS.roundToInt().toString()))
            k.pitchHz?.let { add(I18n.t("board.cadence").replace("{hz}", String.format("%.2f", it))) }
            k.hubPpCm?.let {
                add(I18n.t("board.heaveStat").replace("{cm}", it.roundToInt().toString())
                    .replace("{s}", fensterText(d.hubFensterS ?: 3.0)))
            }
            d.rotDeg?.let { add("${I18n.t("board.mounting")} ${it.roundToInt()}° (${I18n.t("board.mountAuto")})") }
        }
        Text(teile.joinToString(" · "), style = MaterialTheme.typography.bodyMedium, color = grau,
            modifier = Modifier.padding(top = 6.dp))
        // Unsicherer Hub: sagen, WORAUF sich das bezieht — die ganze Aufnahme oder der Lauf
        // (Jan, 23.09.2026: „hier" war je nach Auswahl etwas anderes).
        if (k.hubPpCm != null && !k.hubSicher) {
            val schluessel = if (d.auswahlVonMs == null) "board.heaveShakyAll" else "board.heaveShaky"
            Text(I18n.t(schluessel).replace("{s}", fensterText(d.hubFensterS ?: 3.0)),
                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.tertiary,
                modifier = Modifier.padding(top = 4.dp))
        }
    }
}

/** Eine Stelle nach dem Komma, ohne „.0" — das Fenster kommt aus 2/Takt und ist krumm. */
private fun fensterText(f: Double): String = String.format(java.util.Locale.US, "%.1f", f).removeSuffix(".0")

@Composable
private fun LageKachel(label: String, hinweis: String, wert: Double, zeichnung: @Composable () -> Unit) {
    Column(
        Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
            androidx.compose.foundation.shape.RoundedCornerShape(12.dp)).padding(8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(label.uppercase(), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
        zeichnung()
        Text((if (wert > 0) "+" else "") + String.format("%.1f°", wert),
            style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Text(hinweis, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center)
    }
}

/**
 * Die Kurven mit Zeiger. Im gemeinsamen Bild ist jede Reihe auf IHR EIGENES Maximum normiert —
 * Grad und Zentimeter haben keinen gemeinsamen Massstab; die Legende nennt je Farbe ihren Bereich.
 * Finger auflegen und ziehen setzt den Zeiger (wie die Maus im Web).
 */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun LageKurven(
    reihen: List<Reihe>, tMs: List<Long>, pos: Float, idx: Int, zusammen: Boolean,
    von: Long?, bis: Long?, onPos: (Float) -> Unit, onZiehen: (Boolean) -> Unit,
) {
    val linie = MaterialTheme.colorScheme.outline
    val zeiger = MaterialTheme.colorScheme.onSurface
    val t0 = tMs.first(); val spanne = (tMs.last() - t0).coerceAtLeast(1L).toFloat()
    val gruppen = if (zusammen) listOf(reihen) else reihen.map { listOf(it) }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        gruppen.forEach { gruppe ->
            if (!zusammen) {
                val r = gruppe.first()
                Row(Modifier.fillMaxWidth()) {
                    Text(r.name, color = r.farbe, style = MaterialTheme.typography.labelMedium, modifier = Modifier.weight(1f))
                    Text(wertText(r, idx) + "  ±${r.max.roundToInt()}${r.einheit}",
                        style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            androidx.compose.foundation.Canvas(
                Modifier.fillMaxWidth().height(if (zusammen) 150.dp else 72.dp)
                    .pointerInput(tMs) {
                        detectDragGestures(
                            onDragStart = { o -> onZiehen(true); onPos((o.x / size.width).coerceIn(0f, 1f)) },
                            onDragEnd = { onZiehen(false) },
                            onDragCancel = { onZiehen(false) },
                        ) { change, _ -> onPos((change.position.x / size.width).coerceIn(0f, 1f)) }
                    }
                    .pointerInput(tMs) {
                        detectTapGestures { o -> onPos((o.x / size.width).coerceIn(0f, 1f)) }
                    },
            ) {
                val w = size.width; val h = size.height
                fun x(t: Long) = (t - t0) / spanne * w
                // Grauer Rand vor und nach dem Lauf — dort liegt der Anlauf, der Grund fuer den Rand.
                if (von != null && bis != null) {
                    val a = x(von).coerceIn(0f, w); val b = x(bis).coerceIn(0f, w)
                    if (a > 0) drawRect(linie.copy(alpha = 0.14f), size = androidx.compose.ui.geometry.Size(a, h))
                    if (b < w) drawRect(linie.copy(alpha = 0.14f), topLeft = androidx.compose.ui.geometry.Offset(b, 0f),
                        size = androidx.compose.ui.geometry.Size(w - b, h))
                }
                drawLine(linie, androidx.compose.ui.geometry.Offset(0f, h / 2), androidx.compose.ui.geometry.Offset(w, h / 2), 1f)
                gruppe.forEach { r ->
                    val pfad = androidx.compose.ui.graphics.Path()
                    r.werte.forEachIndexed { i, v ->
                        val px = x(tMs[i]); val py = h / 2 - (v / r.max).toFloat() * (h / 2 - 6f)
                        if (i == 0) pfad.moveTo(px, py) else pfad.lineTo(px, py)
                    }
                    drawPath(pfad, r.farbe, style = androidx.compose.ui.graphics.drawscope.Stroke(width = 2.dp.toPx()))
                }
                val zx = (pos * w).coerceIn(1f, w - 1f)
                drawLine(zeiger, androidx.compose.ui.geometry.Offset(zx, 0f), androidx.compose.ui.geometry.Offset(zx, h), 1.5.dp.toPx())
                gruppe.forEach { r ->
                    r.werte.getOrNull(idx)?.let { v ->
                        drawCircle(r.farbe, 4.dp.toPx(), androidx.compose.ui.geometry.Offset(zx, h / 2 - (v / r.max).toFloat() * (h / 2 - 6f)))
                    }
                }
            }
        }
        if (zusammen) {
            androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                reihen.forEach { r ->
                    Text("${r.name} ${wertText(r, idx)} (±${r.max.roundToInt()}${r.einheit})",
                        color = r.farbe, style = MaterialTheme.typography.labelMedium)
                }
            }
        }
    }
}

private fun wertText(r: Reihe, idx: Int): String =
    r.werte.getOrNull(idx)?.let { (if (it > 0) "+" else "") + String.format("%.1f", it) + r.einheit } ?: ""


/**
 * Startseite ganz unten: Lage des Bretts je LAUFLAENGE, einmal gesamt und einmal je Foil (Jan,
 * 24.09.2026). Nur aus Aufnahmen mit dem Handy AM BRETT; ohne solche erscheint nichts. MEDIANE
 * mit der Zahl der Laeufe daneben — bei vier Laeufen ist ein Median keine Aussage.
 * KEIN Gieren: das ist die gewaehlte Route, keine Aussage ueber Technik (Jan, 24.09.). Fehlt
 * eine Zahl, steht dort „nicht erkannt", kein Strich.
 */
@Composable
fun BrettLageStartseite() {
    var daten by remember { mutableStateOf<BoardAttitudeStats?>(null) }
    LaunchedEffect(Unit) { daten = try { Api.boardAttitudeStats() } catch (_: Exception) { null } }
    val d = daten ?: return
    if (d.gesamt.isEmpty()) return
    Spacer(Modifier.height(16.dp))
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(I18n.t("home.boardAttitude"), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Spacer(Modifier.width(8.dp))
        // Abzeichen statt Erklaertext (Jan, 24.09.: „ganz raus") — es sagt, woher die Zahlen kommen.
        Text("Phone · ${I18n.t("session.onBoard")}", style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.background(MaterialTheme.colorScheme.primary.copy(alpha = 0.15f),
                androidx.compose.foundation.shape.RoundedCornerShape(4.dp)).padding(horizontal = 6.dp, vertical = 2.dp))
    }
    Spacer(Modifier.height(6.dp))
    BrettKlassenTabelle(d.gesamt)
    // Je Foil nur bei mehr als einem — sonst stuende dieselbe Tabelle zweimal da.
    if (d.jeFoil.size > 1) d.jeFoil.forEach { f ->
        Spacer(Modifier.height(10.dp))
        Text("${f.foil} · ${I18n.t("home.baRuns").replace("{n}", f.laeufe.toString())}",
            style = MaterialTheme.typography.labelLarge)
        BrettKlassenTabelle(f.klassen)
    }
}

@Composable
private fun BrettKlassenTabelle(klassen: List<BoardKlasse>) {
    val label = mapOf(
        "bis30s" to I18n.t("home.baUpTo30s"), "30bis60s" to I18n.t("home.ba30to60s"),
        "1bis5min" to I18n.t("home.ba1to5min"), "ueber5min" to I18n.t("home.baOver5min"),
    )
    val grau = MaterialTheme.colorScheme.onSurfaceVariant
    val akzent = MaterialTheme.colorScheme.primary
    val nichtErkannt = I18n.t("home.baNotDetected")
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(vertical = 6.dp)) {
            Row(Modifier.padding(horizontal = 12.dp, vertical = 4.dp)) {
                Text(I18n.t("home.baRunLength"), Modifier.weight(1.4f), style = MaterialTheme.typography.labelMedium, color = grau)
                listOf(I18n.t("home.baPitch"), I18n.t("home.baRoll"), I18n.t("home.baHeave"),
                    "${I18n.t("home.baCadence")} ${PumpUnit.unitLabel()}").forEach {
                    Text(it, Modifier.weight(1f), style = MaterialTheme.typography.labelMedium, color = grau,
                        textAlign = androidx.compose.ui.text.style.TextAlign.End)
                }
            }
            klassen.forEach { k ->
                HorizontalDivider()
                Row(Modifier.padding(horizontal = 12.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1.4f)) {
                        Text(label[k.klasse] ?: k.klasse, style = MaterialTheme.typography.bodyMedium)
                        Text(I18n.t("home.baRuns").replace("{n}", k.laeufe.toString()),
                            style = MaterialTheme.typography.bodySmall, color = grau)
                    }
                    @Composable
                    fun Zelle(text: String?, betont: Boolean) = Text(
                        text ?: nichtErkannt, Modifier.weight(1f),
                        style = if (text == null) MaterialTheme.typography.bodySmall else MaterialTheme.typography.bodyMedium,
                        fontWeight = if (betont && text != null) FontWeight.SemiBold else FontWeight.Normal,
                        color = if (text == null) grau else if (betont) akzent else MaterialTheme.colorScheme.onSurface,
                        textAlign = androidx.compose.ui.text.style.TextAlign.End)
                    Zelle(k.pitchDeg?.let { "${it.roundToInt()}°" }, true)
                    Zelle(k.rollDeg?.let { "${it.roundToInt()}°" }, true)
                    Zelle(k.hubCm?.let { "${it.roundToInt()} cm" }, false)
                    // Der Takt folgt der eingestellten Einheit (Hz oder /min), wie jede Kadenz-Anzeige.
                    Zelle(k.taktHz?.let { PumpUnit.fmtValue(it) }, false)
                }
            }
        }
    }
}
