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
                val breiten = listOf(36, 64, 64, 72, 88, 72, 72)
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
