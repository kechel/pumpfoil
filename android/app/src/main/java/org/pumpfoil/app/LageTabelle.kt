package org.pumpfoil.app

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

// LAGE JE LAUF MIT PHASEN — Portierung von web/src/components/TechnikTabelle.tsx (13.10.2026, Jan:
// „den rest auch noch nachziehen"). Je Lauf eine Zeile pro Phase (ruhige Phase, Kurve, gerade, ganzer
// Lauf), dazu der Umschalter korrigiert | unkorrigiert und die Legende. Benutzt von den Session-Details
// (LageAnsicht.kt) und vom Vergleich (CompareScreen.kt).

/** Eine Phasenzeile eines Laufs; `haupt` = die Hauptzahl (cyan, fett), wie in der PWA. */
data class PhaseZeile(val phase: String, val werte: Technik?, val haupt: Boolean)

/** Wie `phasenDesLaufs` in TechnikTabelle.tsx. */
fun phasenDesLaufs(k: LageLauf, korr: Boolean): List<PhaseZeile> {
    val x = k.technik
        // Ohne Technik (zu kurz/alt) wenigstens das Gieren des ganzen Laufs, wie vor der Aufteilung.
        ?: return listOf(PhaseZeile(I18n.t("tech.sWhole"), Technik(gierDegS = k.gierRmsDegS), false))
    fun f(p: TechnikPaar?) = if (korr) p?.mit else p?.ohne
    if (x.teil == "ganz") return listOf(PhaseZeile(I18n.t("tech.sWhole"), f(x), true))
    val kg = if (korr) x.kurveGerade else x.kurveGeradeOhne
    return buildList {
        add(PhaseZeile(I18n.t("tech.sStable"), f(x), true))
        if (kg != null) {
            add(PhaseZeile(I18n.t("tech.sTurn"), kg.kurve?.alsTechnik(), false))
            add(PhaseZeile(I18n.t("tech.sStraight"), kg.gerade?.alsTechnik(), false))
        }
        x.ganz?.let { add(PhaseZeile(I18n.t("tech.sWhole"), f(it), false)) }
    }
}

/** Sortierwert eines Laufs = die Zahl oben in der Zelle (Mittelteil, bei kurzen Laeufen der ganze Lauf).
 *  Schluessel wie in der PWA: pitch, roll, yaw, pitchHz, hub. */
fun lageSortWert(k: LageLauf?, key: String): Double? {
    if (k == null || !k.ok) return null
    val mit = if (k.technik?.teil != "ganz") k.technik?.mit else null
    return when (key) {
        "pitch" -> mit?.pumpNickenDeg ?: k.pitchAmplitudeDeg
        "roll" -> mit?.pumpRollenDeg ?: k.rollAmplitudeDeg
        "yaw" -> k.gierRmsDegS
        "pitchHz" -> mit?.taktHz ?: k.pitchHz
        "hub" -> mit?.hubCm ?: k.hubPpCm
        else -> null
    }
}

/** Kopf einer Spalte vor oder hinter den Phasen; `key` != null = sortierbar. */
class LageSpalte(val kopf: String, val breite: Int, val key: String? = null)

/** Eine Zeile der Tabelle = ein Lauf. `k == null` = (noch) keine Lage-Zahlen -> „…" bzw. „–". */
class LageTabZeile(
    val key: String,
    val k: LageLauf?,
    val geladen: Boolean,
    val vorne: List<@Composable () -> Unit>,
    val hinten: List<@Composable () -> Unit> = emptyList(),
    val markiert: Boolean = false,
    val onClick: (() -> Unit)? = null,
)

/** Umschalter korrigiert | unkorrigiert fuer eine ganze Lage-Tabelle (wie PWA KorrekturUmschalter). */
@Composable
fun KorrekturUmschalter(korr: Boolean, onChange: (Boolean) -> Unit) {
    @Composable
    fun knopf(an: Boolean, label: String) {
        Surface(onClick = { onChange(an) }, shape = MaterialTheme.shapes.small,
            color = if (korr == an) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant) {
            Text(label, style = MaterialTheme.typography.labelMedium, maxLines = 1,
                color = if (korr == an) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp))
        }
    }
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        knopf(true, I18n.t("tech.colWith"))
        knopf(false, I18n.t("tech.colWithout"))
    }
}

/** Legende unter der Tabelle, wie PWA LaufLegende. */
@Composable
fun LaufLegende() {
    val grau = MaterialTheme.colorScheme.onSurfaceVariant
    val zeilen = listOf(
        "${I18n.t("board.pitch")}, ${I18n.t("board.roll")}, ${I18n.t("sd.colPitchRhythm")}, ${I18n.t("sd.colHeave")}" to I18n.t("tech.gPump"),
        I18n.t("tech.wobble") to I18n.t("tech.gWobble"),
        I18n.t("tech.colLean") to I18n.t("tech.gLean"),
        I18n.t("board.yaw") to I18n.t("tech.gYaw"),
        I18n.t("tech.sStable") to I18n.t("tech.gStable"),
        "${I18n.t("tech.sTurn")} · ${I18n.t("tech.sStraight")}" to I18n.t("tech.gTurnStraight"),
        I18n.t("tech.sWhole") to I18n.t("tech.gWhole"),
    )
    Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Text(I18n.t("tech.gColumns"), style = MaterialTheme.typography.bodySmall, color = grau)
        zeilen.forEach { (k, v) ->
            Text(androidx.compose.ui.text.buildAnnotatedString {
                pushStyle(androidx.compose.ui.text.SpanStyle(fontWeight = FontWeight.SemiBold)); append("$k: "); pop(); append(v)
            }, style = MaterialTheme.typography.bodySmall, color = grau)
        }
        Text(I18n.t("tech.lCorrection"), style = MaterialTheme.typography.bodySmall, color = grau)
        Text(I18n.t("tech.gSpread"), style = MaterialTheme.typography.bodySmall, color = grau)
        Text(I18n.t("tech.gHeave"), style = MaterialTheme.typography.bodySmall, color = grau)
    }
}

/**
 * Die Tabelle selbst: Kopf mit sortierbaren Spaltentiteln (Pfeil ▲/▼ an der aktiven Spalte, wie PWA),
 * je Lauf die Zellen `vorne` einmal (links, ueber alle Phasenzeilen), dann eine Zeile je Phase.
 * `onSort == null` = nicht sortierbar.
 */
@Composable
fun LagePhasenTabelle(
    vorneSpalten: List<LageSpalte>,
    zeilen: List<LageTabZeile>,
    korr: Boolean,
    hintenSpalten: List<LageSpalte> = emptyList(),
    sortKey: String? = null,
    sortAuf: Boolean = false,
    onSort: ((String) -> Unit)? = null,
) {
    val grau = MaterialTheme.colorScheme.onSurfaceVariant
    val werte: List<Triple<String?, String, Int>> = listOf(
        Triple("pitch", I18n.t("board.pitch"), 64), Triple("roll", I18n.t("board.roll"), 64),
        Triple(null, I18n.t("tech.wobble"), 68), Triple(null, I18n.t("tech.colLean"), 60),
        Triple("pitchHz", I18n.t("sd.colPitchRhythm"), 92), Triple("hub", I18n.t("sd.colHeave"), 64),
        Triple("yaw", I18n.t("board.yaw"), 72),
    )
    val phaseBreite = 104
    @Composable
    fun kopf(text: String, breite: Int, key: String?, rechts: Boolean = false) {
        val aktiv = key != null && key == sortKey
        val mod = Modifier.width(breite.dp)
            .then(if (key != null && onSort != null) Modifier.clickable { onSort(key) } else Modifier)
            .padding(end = 6.dp)
        Text(if (aktiv) text + (if (sortAuf) " ▲" else " ▼") else text, mod,
            style = MaterialTheme.typography.labelSmall, maxLines = 2,
            textAlign = if (rechts) TextAlign.End else TextAlign.Start,
            color = if (aktiv) MaterialTheme.colorScheme.onSurface else grau)
    }
    Column(Modifier.horizontalScroll(rememberScrollState())) {
        Row(Modifier.padding(horizontal = 12.dp, vertical = 6.dp), verticalAlignment = Alignment.Bottom) {
            vorneSpalten.forEach { kopf(it.kopf, it.breite, it.key) }
            kopf(I18n.t("tech.colPhase"), phaseBreite, null)
            werte.forEach { (key, label, b) -> kopf(label, b, key, rechts = true) }
            hintenSpalten.forEach { kopf(it.kopf, it.breite, it.key) }
        }
        HorizontalDivider()
        zeilen.forEach { z ->
            val phasen = z.k?.takeIf { it.ok }?.let { phasenDesLaufs(it, korr) }
            Row(
                Modifier
                    .then(if (z.markiert) Modifier.background(MaterialTheme.colorScheme.primary.copy(alpha = 0.18f)) else Modifier)
                    .then(if (z.onClick != null) Modifier.clickable { z.onClick.invoke() } else Modifier)
                    .padding(horizontal = 12.dp, vertical = 4.dp),
                verticalAlignment = Alignment.Top,
            ) {
                z.vorne.forEachIndexed { i, zelle ->
                    Box(Modifier.width(vorneSpalten.getOrNull(i)?.breite?.dp ?: 60.dp).padding(top = 2.dp, end = 6.dp)) { zelle() }
                }
                if (phasen == null) {
                    Text(if (z.geladen) "–" else "…", Modifier.padding(top = 2.dp)
                        .width((phaseBreite + werte.sumOf { it.third }).dp), color = grau)
                } else {
                    Column {
                        phasen.forEach { p ->
                            Row(Modifier.padding(vertical = 2.dp)) {
                                Text(p.phase, Modifier.width(phaseBreite.dp).padding(end = 6.dp),
                                    style = MaterialTheme.typography.bodySmall, maxLines = 1)
                                val t = p.werte
                                val zellen = listOf(
                                    t?.pumpNickenDeg?.let { "±%.1f°".format(it) },
                                    t?.pumpRollenDeg?.let { "±%.1f°".format(it) },
                                    t?.wackelnDeg?.let { "±%.1f°".format(it) },
                                    t?.kurvenlageDeg?.let { "%.1f°".format(it) },
                                    t?.taktHz?.let { "%.2f Hz".format(it) },
                                    t?.hubCm?.let { "%.0f cm".format(it) },
                                    t?.gierDegS?.let { "%.0f°/s".format(it) },
                                )
                                zellen.forEachIndexed { i, w ->
                                    Text(w ?: "–", Modifier.width(werte[i].third.dp).padding(end = 6.dp),
                                        style = MaterialTheme.typography.bodySmall, textAlign = TextAlign.End, maxLines = 1,
                                        fontWeight = if (p.haupt && w != null) FontWeight.SemiBold else null,
                                        color = if (p.haupt && w != null) MaterialTheme.colorScheme.primary else Color.Unspecified)
                                }
                            }
                        }
                    }
                }
                z.hinten.forEachIndexed { i, zelle ->
                    Box(Modifier.width(hintenSpalten.getOrNull(i)?.breite?.dp ?: 60.dp).padding(top = 2.dp, start = 6.dp)) { zelle() }
                }
            }
            HorizontalDivider()
        }
    }
}
