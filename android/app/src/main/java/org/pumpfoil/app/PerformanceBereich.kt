package org.pumpfoil.app

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.lifecycle.Lifecycle
import kotlinx.coroutines.delay
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerialName
import java.time.LocalDate

/**
 * Home › Performance (Web PerformanceBereich.tsx, 18.11.2026; Idee eines Fahrers). Je Kalendertag (UTC) die EIGENE
 * Platzierung in vier Kategorien gegen alle Fahrer weltweit (Server /api/community/performance). Foil Scoot nur
 * zusammen mit Pumpfoil (Jan 18.11.: zu wenige Scooter fuer ein eigenes Feld).
 * 18.11. abends wie Web: Unterreiter Uebersicht | Verlauf, Kategorie-Tabelle, Bestleistungen, Platz je Tag je Kategorie,
 * Zeitraum „letzte 25 Tage mit Wertung".
 */
@Serializable
data class PerfZeile(val tag: String, val wert: Double, val platz: Int, val feld: Int, val perzentil: Double,
                     @SerialName("session_id") val sessionId: Int,
                     // Lauf in der Session (Server seit 20.11.2026, nur Einzel-Lauf-Kategorien) -> direkt dorthin
                     @SerialName("run_idx") val runIdx: Int? = null,
                     // laufender Tag (UTC): noch vorlaeufig, Server rechnet alle ~10 min neu -> gelb hinterlegt (20.11.2026)
                     val vorlaeufig: Boolean = false)

@Serializable
data class PerfRegel(val platz: List<Int> = emptyList(), val mitmachen: Int = 1, @SerialName("min_feld") val minFeld: Int = 5,
                     val kategorien: List<String> = emptyList(), @SerialName("max_tag") val maxTag: Int = 101)

// Saison mit Punkten ab 1.1.2027 (Jan 20.11.2026), Server community._saison; fehlt bei aelteren Servern
@Serializable
data class PerfSaison(val jahr: Int = 2027, val gestartet: Boolean = false, val punkte: Int = 0, val tage: Int = 0,
                      val rang: Int? = null, val fahrer: Int = 0, val regel: PerfRegel = PerfRegel())

@Serializable
data class PerfAntwort(val sport: String = "pumpfoil", @SerialName("min_feld") val minFeld: Int = 5, val ab: String = "",
                       val kategorien: Map<String, List<PerfZeile>> = emptyMap(), val saison: PerfSaison? = null)

// Zwei Tempo-, zwei Ausdauer-Kategorien (Vorschlag eines Fahrers 19.11.2026, Jan 20.11.): Zeit auf dem Foil am Tag statt
// laengster Laufzeit (die war dem laengsten Lauf zu aehnlich). Der Server liefert `run_time` fuer aeltere Apps weiter.
private val KATS = listOf("sprint_100m", "sprint_60s", "run_distance", "foil_time_day")
private val PerfCyan = Color(0xFF22D3EE)   // Markenfarbe (brand-design)
private val BandGruen = Color(0xFF10B981)
private val BandGelb = Color(0xFFF59E0B)
private val VorlGelb = Color(0xFFFCD34D)   // Hinterlegung des laufenden (vorlaeufigen) Tags, wie Web amber-300

/** Legende fuer den gelb hinterlegten laufenden Tag (wie Web, Jan 20.11.2026: „Preliminary Results"). */
@Composable
private fun VorlHinweis() {
    Row(Modifier.padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(width = 18.dp, height = 10.dp).clip(RoundedCornerShape(3.dp)).background(VorlGelb.copy(alpha = 0.6f)))
        Spacer(Modifier.width(6.dp))
        Text(I18n.t("perf.vorlaeufigLegende"), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
private val BUCKETS: List<Pair<String, (Int) -> Boolean>> = listOf(
    "1" to { p -> p == 1 }, "2" to { p -> p == 2 }, "3" to { p -> p == 3 },
    "4–5" to { p -> p in 4..5 }, "6–10" to { p -> p in 6..10 },
    // Weitere Stufen (Jan 18.11.2026): die Felder haben 15 bis 80 Fahrer, „11+" sagte zu wenig.
    "11–20" to { p -> p in 11..20 }, "21–30" to { p -> p in 21..30 }, "31–50" to { p -> p in 31..50 }, "51+" to { p -> p > 50 })

private fun wertText(k: String, v: Double): String = when (k) {
    "sprint_100m", "sprint_60s" -> "%.1f km/h".format(v * 3.6)
    "run_distance" -> "${Math.round(v)} m"
    else -> { val s = Math.round(v).toInt()
        if (s >= 3600) "%d:%02d h".format(s / 3600, (s % 3600) / 60) else "%d:%02d min".format(s / 60, s % 60) }
}

private fun tagKurz(tag: String) = tag.substring(8, 10).trimStart('0') + "." + tag.substring(5, 7).trimStart('0') + "."
private fun schnitt(xs: List<Double>) = if (xs.isEmpty()) 0.0 else xs.sum() / xs.size

// Eigene Icons wie im Web (scripts/perf-icons/bauen.py erzeugt die Drawables aus web Icons.tsx, Jan 20.11.2026)
private val KAT_ICON = mapOf("sprint_100m" to R.drawable.perf_sprint100, "sprint_60s" to R.drawable.perf_sprint_minute,
    "run_distance" to R.drawable.perf_longest_run, "foil_time_day" to R.drawable.perf_foil_time)

/** Akzent wie Web text-brand-700 / dark:text-brand-400 */
@Composable
private fun perfAkzent(): Color = if (teamDunkel()) Color(0xFF22D3EE) else Color(0xFF0E7490)

@Composable
private fun PerfIcon(res: Int, groesse: androidx.compose.ui.unit.Dp) =
    Icon(painterResource(res), contentDescription = null, tint = perfAkzent(), modifier = Modifier.size(groesse))

/** Verweis auf einen einzelnen Lauf: direkt der Lauf, bei Sprints mit Sprint-Anzeige (wie die Bestenlisten). */
@Composable
private fun rememberOeffnen(onOpenSession: (Int) -> Unit): (String, PerfZeile) -> Unit {
    val lauf = LocalOpenSessionLauf.current
    return { k, z ->
        if (z.runIdx != null && lauf != null) lauf(z.sessionId, z.runIdx, k.takeIf { it.startsWith("sprint_") })
        else onOpenSession(z.sessionId)
    }
}

/** Kennzahl-Kachel wie im Web: Icon ueber die ganze Hoehe links, Wert und Label mittig daneben. */
@Composable
private fun KennzahlKachel(icon: Int, wert: String, label: String, modifier: Modifier = Modifier, hervor: Boolean = false,
                           labelFarbe: Color? = null, onClick: (() -> Unit)? = null, oben: (@Composable () -> Unit)? = null) {
    Card(modifier.then(if (onClick != null) Modifier.clickable { onClick() } else Modifier),
        colors = if (hervor) androidx.compose.material3.CardDefaults.cardColors(containerColor = PerfCyan.copy(alpha = 0.12f))
                 else androidx.compose.material3.CardDefaults.cardColors()) {
        Box(Modifier.fillMaxWidth()) {
            Row(Modifier.padding(horizontal = 8.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                PerfIcon(icon, 32.dp)
                Spacer(Modifier.width(6.dp))
                Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(wert, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold, maxLines = 1)
                    Text(label, style = MaterialTheme.typography.labelSmall, textAlign = TextAlign.Center, maxLines = 2,
                        color = labelFarbe ?: MaterialTheme.colorScheme.onSurfaceVariant,
                        fontWeight = if (labelFarbe != null) FontWeight.SemiBold else null)
                }
            }
            if (oben != null) Box(Modifier.align(Alignment.TopEnd).padding(4.dp)) { oben() }
        }
    }
}

// Eine Farbe, Deckkraft nach Perzentil; die Platzzahl steht immer in der Zelle.
private fun zellFarbe(perz: Double): Color = PerfCyan.copy(alpha = (0.12 + 0.78 * (perz / 100).coerceIn(0.0, 1.0)).toFloat())

@Composable
fun PerformanceBereich(onOpenSession: (Int) -> Unit) {
    var sport by rememberSaveable { mutableStateOf("pumpfoil") }
    var zeitraum by rememberSaveable { mutableStateOf("25") }   // alle | 30 | 25; Standard „letzte 25 Tage" (Jan 18.11.)
    var daten by remember { mutableStateOf<PerfAntwort?>(null) }
    var fehler by remember { mutableStateOf<String?>(null) }
    val reiter = listOf(ReiterDef("uebersicht", I18n.t("perf.tabUebersicht")), ReiterDef("verlauf", I18n.t("perf.tabVerlauf")))
    var sub by rememberReiter("homeperf", reiter.map { it.id }, "uebersicht")
    val lebenszyklus = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(sport) {
        daten = null; fehler = null
        try { daten = Api.performance(sport) } catch (e: Exception) { fehler = e.message ?: "?" }
        // Der laufende Tag ist vorlaeufig (Server rechnet alle ~10 min neu): offen und sichtbar alle 5 min still nachladen
        while (true) {
            delay(5 * 60 * 1000L)
            if (lebenszyklus.currentState.isAtLeast(Lifecycle.State.RESUMED)) {
                try { Api.performance(sport).let { daten = it } } catch (_: Exception) {}
            }
        }
    }
    val grenze = when (zeitraum) {
        "30" -> LocalDate.now().minusDays(30).toString()
        "25" -> KATS.flatMap { k -> daten?.kategorien?.get(k)?.map { it.tag } ?: emptyList() }.distinct().sortedDescending().getOrNull(24) ?: ""
        else -> ""
    }
    val je = KATS.associateWith { k -> (daten?.kategorien?.get(k) ?: emptyList()).filter { it.tag >= grenze } }
    val alle = KATS.flatMap { je[it] ?: emptyList() }
    val tage = alle.map { it.tag }.distinct().sortedDescending()
    val grau = MaterialTheme.colorScheme.onSurfaceVariant

    Column(Modifier.fillMaxWidth()) {
        Reiterleiste(reiter, sub, { sub = it }, stufe = 2, modifier = Modifier.padding(bottom = 10.dp))
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf("pumpfoil", "pumpfoil+foil_scoot").forEach { s ->
                FilterChip(selected = sport == s, onClick = { sport = s }, colors = cyanChipColors(),
                    label = { Text(s.split("+").joinToString(" + ") { I18n.t("cls.sport.$it") }) })
            }
        }
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf("alle" to I18n.t("perf.seit").replace("{datum}", daten?.ab ?: "…"), "30" to I18n.t("perf.tage30"),
                "25" to I18n.t("perf.letzte25")).forEach { (id, label) ->
                FilterChip(selected = zeitraum == id, onClick = { zeitraum = id }, colors = cyanChipColors(), label = { Text(label) })
            }
        }
        Spacer(Modifier.height(8.dp))

        val d = daten
        when {
            fehler != null -> Text(fehler!!, color = MaterialTheme.colorScheme.error)
            d == null -> Box(Modifier.fillMaxWidth().padding(24.dp)) { CircularProgressIndicator(Modifier.align(Alignment.Center)) }
            alle.isEmpty() -> Card(Modifier.fillMaxWidth()) {
                Text(I18n.t("perf.leer"), Modifier.padding(16.dp), textAlign = TextAlign.Center)
            }
            sub == "verlauf" -> VerlaufTeil(je, alle, tage, onOpenSession)
            else -> UebersichtTeil(je, alle, tage, d.saison, onOpenSession)
        }
        // Einleitung klein ganz unten (Jan 20.11.2026: „den hinweis weg oder ganz nach unten")
        Text(I18n.t("perf.intro").replace("{n}", "${daten?.minFeld ?: 5}"), style = MaterialTheme.typography.bodySmall,
            color = grau, modifier = Modifier.padding(bottom = 12.dp))
    }
}

@Composable
private fun UebersichtTeil(je: Map<String, List<PerfZeile>>, alle: List<PerfZeile>, tage: List<String>, saison: PerfSaison?,
                           onOpenSession: (Int) -> Unit) {
    val grau = MaterialTheme.colorScheme.onSurfaceVariant
    val oeffnen = rememberOeffnen(onOpenSession)
    fun quote(n: Int) = if (alle.isEmpty()) "–" else "${Math.round(100.0 * n / alle.size)} %"
    // Kennzahlen + Saison als sechste Kachel (wie Web 20.11.2026): 2 Reihen zu 3
    var saisonOffen by remember { mutableStateOf(false) }
    data class Kachel(val icon: Int, val wert: String, val label: String, val saison: Boolean = false)
    val kacheln = listOf(
        Kachel(R.drawable.perf_calendar_check, "${tage.size}", I18n.t("perf.tage")),
        Kachel(R.drawable.perf_beat, "${Math.round(schnitt(alle.map { it.perzentil }))} %", I18n.t("perf.besserAls")),
        Kachel(R.drawable.perf_trophy, "${alle.count { it.platz == 1 }}", I18n.t("perf.siege")),
        Kachel(R.drawable.perf_podium, quote(alle.count { it.platz <= 3 }), I18n.t("perf.podium")),
        Kachel(R.drawable.perf_medal, quote(alle.count { it.platz <= 10 }), I18n.t("perf.top10")),
    ) + listOfNotNull(saison?.let { Kachel(R.drawable.perf_season_cup, "${it.punkte}", I18n.t("perf.saisonTitel"), saison = true) })
    kacheln.chunked(3).forEach { reihe ->
        Row(Modifier.fillMaxWidth().padding(bottom = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            reihe.forEach { k ->
                if (k.saison) KennzahlKachel(k.icon, k.wert, k.label, Modifier.weight(1f), hervor = true, labelFarbe = perfAkzent(),
                    onClick = { saisonOffen = true },
                    oben = { Icon(Icons.Outlined.Info, contentDescription = k.label, tint = grau, modifier = Modifier.size(14.dp)) })
                else KennzahlKachel(k.icon, k.wert, k.label, Modifier.weight(1f))
            }
            repeat(3 - reihe.size) { Spacer(Modifier.weight(1f)) }
        }
    }
    if (saisonOffen && saison != null) SaisonDialog(saison) { saisonOffen = false }

    // Kategorie-Tabelle: Ø Platz immer mit Ø Feld, sonst sagt die Zahl nichts
    Card(Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
        Column(Modifier.padding(12.dp)) {
            Text(I18n.t("perf.tabelle"), fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(bottom = 6.dp))
            KATS.forEachIndexed { i, k ->
                val z = je[k] ?: emptyList()
                if (i > 0) HorizontalDivider(Modifier.padding(vertical = 6.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    PerfIcon(KAT_ICON.getValue(k), 18.dp); Spacer(Modifier.width(6.dp))
                    Text(I18n.t("perf.kat.$k"), fontWeight = FontWeight.Medium)
                }
                if (z.isEmpty()) {
                    Text(I18n.t("perf.keineTage"), style = MaterialTheme.typography.bodySmall, color = grau)
                } else {
                    Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                        tabZelle(I18n.t("perf.tage"), "${z.size}")
                        tabZelle(I18n.t("perf.spSchnitt"), I18n.t("perf.schnittVon")
                            .replace("{platz}", "%.1f".format(schnitt(z.map { it.platz.toDouble() })))
                            .replace("{feld}", "${Math.round(schnitt(z.map { it.feld.toDouble() }))}"))
                        // bester Platz / genau ein Sieg = ein einzelner Lauf -> antippen fuehrt hin (bei Gleichstand der neueste)
                        val best = z.minWith(compareBy<PerfZeile> { it.platz }.thenByDescending { it.tag })
                        tabZelle(I18n.t("perf.spBester"), "${best.platz}") { oeffnen(k, best) }
                        tabZelle(I18n.t("perf.spTop3"), "${Math.round(100.0 * z.count { it.platz <= 3 } / z.size)} %")
                        val siege = z.filter { it.platz == 1 }
                        tabZelle(I18n.t("perf.siege"), "${siege.size}", if (siege.size == 1) ({ oeffnen(k, siege[0]) }) else null)
                    }
                }
            }
        }
    }

    // Bestleistungen: bester eigener Wert je Kategorie im Zeitraum, Tippen oeffnet die Session
    Card(Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
        Column(Modifier.padding(12.dp)) {
            Text(I18n.t("perf.bestleistungen"), fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(bottom = 6.dp))
            KATS.chunked(2).forEach { paar ->
                Row(Modifier.fillMaxWidth().padding(bottom = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    paar.forEach { k ->
                        val b = je[k]?.maxByOrNull { it.wert }
                        // wie die Kennzahl-Kacheln: Icon ueber die ganze Hoehe, Wert und Label mittig (Web 20.11.2026)
                        Row(Modifier.weight(1f).clip(RoundedCornerShape(8.dp))
                            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
                            .then(if (b != null) Modifier.clickable { oeffnen(k, b) } else Modifier)
                            .padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                            PerfIcon(KAT_ICON.getValue(k), 32.dp)
                            Spacer(Modifier.width(6.dp))
                            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                                Text(b?.let { wertText(k, it.wert) } ?: "–", style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.SemiBold, maxLines = 1)
                                Text(I18n.t("perf.kat.$k"), style = MaterialTheme.typography.labelSmall, color = grau, maxLines = 1,
                                    overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center)
                                if (b != null) Text(tagKurz(b.tag) + " · " + I18n.t("perf.platzVon").replace("{platz}", "${b.platz}")
                                    .replace("{feld}", "${b.feld}"), style = MaterialTheme.typography.labelSmall, color = grau,
                                    textAlign = TextAlign.Center)
                            }
                        }
                    }
                }
            }
        }
    }

    // Je Kategorie: Haeufigkeit der Plaetze
    KATS.forEach { k ->
        val z = je[k] ?: emptyList()
        Card(Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
            Column(Modifier.padding(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    PerfIcon(KAT_ICON.getValue(k), 20.dp); Spacer(Modifier.width(6.dp))
                    Text(I18n.t("perf.kat.$k"), fontWeight = FontWeight.SemiBold)
                }
                if (z.isEmpty()) {
                    Text(I18n.t("perf.keineTage"), style = MaterialTheme.typography.bodySmall, color = grau)
                } else {
                    Text(I18n.t("perf.katZeile").replace("{n}", "${z.size}")
                        .replace("{perz}", "${Math.round(schnitt(z.map { it.perzentil }))}"),
                        style = MaterialTheme.typography.bodySmall, color = grau)
                    val max = maxOf(1, BUCKETS.maxOf { (_, f) -> z.count { f(it.platz) } })
                    BUCKETS.forEach { (label, f) ->
                        val n = z.count { f(it.platz) }
                        Row(Modifier.fillMaxWidth().padding(top = 3.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(label, Modifier.width(44.dp), style = MaterialTheme.typography.labelSmall, color = grau, textAlign = TextAlign.End)
                            Spacer(Modifier.width(6.dp))
                            Box(Modifier.weight(1f).height(10.dp).clip(RoundedCornerShape(3.dp))
                                .background(MaterialTheme.colorScheme.surfaceVariant)) {
                                if (n > 0) Box(Modifier.fillMaxWidth(n.toFloat() / max).height(10.dp)
                                    .clip(RoundedCornerShape(3.dp)).background(PerfCyan))
                            }
                            Text("$n", Modifier.width(28.dp), style = MaterialTheme.typography.labelSmall, textAlign = TextAlign.End)
                        }
                    }
                }
            }
        }
    }
    Text(I18n.t("perf.hinweis"), style = MaterialTheme.typography.bodySmall, color = grau, modifier = Modifier.padding(bottom = 12.dp))
}

@Composable
private fun tabZelle(label: String, wert: String, onClick: (() -> Unit)? = null) {
    Column(Modifier.then(if (onClick != null) Modifier.clip(RoundedCornerShape(4.dp)).clickable { onClick() } else Modifier),
        horizontalAlignment = Alignment.CenterHorizontally) {
        Text(wert, fontWeight = if (onClick != null) FontWeight.Bold else FontWeight.Medium,
            color = if (onClick != null) perfAkzent() else MaterialTheme.colorScheme.onSurface, style = MaterialTheme.typography.bodyMedium)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun VerlaufTeil(je: Map<String, List<PerfZeile>>, alle: List<PerfZeile>, tage: List<String>, onOpenSession: (Int) -> Unit) {
    val grau = MaterialTheme.colorScheme.onSurfaceVariant
    var kat by rememberSaveable { mutableStateOf("sprint_100m") }
    val oeffnen = rememberOeffnen(onOpenSession)
    val reihe = (je[kat] ?: emptyList()).sortedBy { it.tag }

    // Platz je Tag in EINER Kategorie: Hoehe = Anteil geschlagener Fahrer, Zahl = Platz; Baender ab 80 % / 50 %
    Card(Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
        Column(Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                PerfIcon(R.drawable.perf_place_line, 20.dp); Spacer(Modifier.width(6.dp))
                Text(I18n.t("perf.platzverlauf"), fontWeight = FontWeight.SemiBold)
            }
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                KATS.forEach { k ->
                    FilterChip(selected = kat == k, onClick = { kat = k }, colors = cyanChipColors(),
                        leadingIcon = { Icon(painterResource(KAT_ICON.getValue(k)), null, Modifier.size(16.dp)) },
                        label = { Text(I18n.t("perf.kat.$k")) })
                }
            }
            if (reihe.isEmpty()) {
                Text(I18n.t("perf.keineTage"), style = MaterialTheme.typography.bodySmall, color = grau)
            } else {
                val linie = MaterialTheme.colorScheme.outlineVariant
                val n = reihe.size
                val jeder = if (n > 20) (n + 19) / 20 else 1   // nicht jede Zahl, sonst ueberlappen sie
                Box(Modifier.fillMaxWidth().height(160.dp).padding(top = 12.dp)) {
                    Canvas(Modifier.fillMaxWidth().height(148.dp)) {
                        fun x(i: Int) = if (n == 1) size.width / 2 else size.width * i / (n - 1)
                        fun y(p: Double) = (size.height * (100 - p) / 100).toFloat()
                        drawRect(BandGruen.copy(alpha = 0.15f), Offset(0f, y(100.0)), Size(size.width, y(80.0) - y(100.0)))
                        drawRect(BandGelb.copy(alpha = 0.10f), Offset(0f, y(80.0)), Size(size.width, y(50.0) - y(80.0)))
                        listOf(0.0, 50.0, 80.0, 100.0).forEach { p -> drawLine(linie, Offset(0f, y(p)), Offset(size.width, y(p)), 1f) }
                        reihe.forEachIndexed { i, z ->
                            if (z.vorlaeufig) drawRect(VorlGelb.copy(alpha = 0.35f), Offset(x(i) - 22f, 0f), Size(44f, size.height))
                        }
                        for (i in 1 until n) drawLine(PerfCyan, Offset(x(i - 1), y(reihe[i - 1].perzentil)), Offset(x(i), y(reihe[i].perzentil)), 4f)
                        reihe.forEachIndexed { i, z -> drawCircle(if (z.vorlaeufig) BandGelb else PerfCyan, 7f, Offset(x(i), y(z.perzentil))) }
                    }
                }
                // Plaetze als Zahlenreihe darunter (Canvas kann hier keinen Text ohne TextMeasurer; so bleibt es lesbar)
                val zahlenRoll = rememberScrollState()
                LaunchedEffect(zahlenRoll.maxValue) { zahlenRoll.scrollTo(zahlenRoll.maxValue) }   // neueste Tage zuerst sichtbar
                Row(Modifier.fillMaxWidth().horizontalScroll(zahlenRoll), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    reihe.forEachIndexed { i, z ->
                        if (i % jeder == 0 || z.vorlaeufig) Column(Modifier.clip(RoundedCornerShape(4.dp))
                            .background(if (z.vorlaeufig) VorlGelb.copy(alpha = 0.35f) else Color.Transparent)
                            .clickable { oeffnen(kat, z) }.padding(horizontal = 2.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("${z.platz}", fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
                            Text(tagKurz(z.tag), fontSize = 9.sp, color = grau)
                        }
                    }
                }
            }
            if (reihe.any { it.vorlaeufig }) VorlHinweis()
            Text(I18n.t("perf.platzverlaufHint"), style = MaterialTheme.typography.bodySmall, color = grau, modifier = Modifier.padding(top = 6.dp))
        }
    }

    // Raster Kategorie x Tag: Zahl = Platz, Farbe = Anteil geschlagener Fahrer, Tippen oeffnet die Session
    Card(Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
        Column(Modifier.padding(12.dp)) {
            Row(Modifier.padding(bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                PerfIcon(R.drawable.perf_placing_grid, 20.dp); Spacer(Modifier.width(6.dp))
                Text(I18n.t("perf.raster"), fontWeight = FontWeight.SemiBold)
            }
            Row {
                Column {
                    Spacer(Modifier.height(18.dp))
                    KATS.forEach { k ->
                        Row(Modifier.height(32.dp).widthIn(max = 120.dp), verticalAlignment = Alignment.CenterVertically) {
                            PerfIcon(KAT_ICON.getValue(k), 16.dp); Spacer(Modifier.width(4.dp))
                            Text(I18n.t("perf.kat.$k"), style = MaterialTheme.typography.labelSmall, maxLines = 2)
                        }
                    }
                }
                Spacer(Modifier.width(6.dp))
                // Zeit von links nach rechts wie in den anderen Darstellungen (Hinweis eines Fahrers, 19.11.2026)
                val rasterRoll = rememberScrollState()
                // beim Oeffnen ganz rechts (neueste Tage, heute) — wie Web
                LaunchedEffect(rasterRoll.maxValue) { rasterRoll.scrollTo(rasterRoll.maxValue) }
                Row(Modifier.horizontalScroll(rasterRoll)) {
                    tage.reversed().forEach { tag ->
                        val vorl = alle.any { it.tag == tag && it.vorlaeufig }
                        Column(Modifier.clip(RoundedCornerShape(4.dp)).background(if (vorl) VorlGelb.copy(alpha = 0.35f) else Color.Transparent),
                            horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(tagKurz(tag), style = MaterialTheme.typography.labelSmall, color = grau, fontSize = 10.sp,
                                modifier = Modifier.height(18.dp))
                            KATS.forEach { k ->
                                val z = je[k]?.firstOrNull { it.tag == tag }
                                Box(Modifier.padding(2.dp).size(width = 30.dp, height = 28.dp).clip(RoundedCornerShape(4.dp))
                                    .background(if (z != null) zellFarbe(z.perzentil) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f))
                                    .then(if (z != null) Modifier.clickable { oeffnen(k, z) } else Modifier),
                                    contentAlignment = Alignment.Center) {
                                    if (z != null) Text("${z.platz}", fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
                                }
                            }
                        }
                    }
                }
            }
            Row(Modifier.padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(I18n.t("perf.legende"), style = MaterialTheme.typography.labelSmall, color = grau)
                listOf(10, 50, 90).forEach { p ->
                    Spacer(Modifier.width(6.dp))
                    Box(Modifier.size(width = 18.dp, height = 10.dp).clip(RoundedCornerShape(3.dp)).background(zellFarbe(p.toDouble())))
                    Text(" $p %", style = MaterialTheme.typography.labelSmall, color = grau)
                }
            }
            if (alle.any { it.vorlaeufig }) VorlHinweis()
        }
    }

    // Verlauf: Ø Perzentil je Tag ueber alle Kategorien
    Card(Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
        Column(Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                PerfIcon(R.drawable.perf_daily_average, 20.dp); Spacer(Modifier.width(6.dp))
                Text(I18n.t("perf.verlauf"), fontWeight = FontWeight.SemiBold)
            }
            val punkte = tage.reversed().map { tag -> schnitt(alle.filter { it.tag == tag }.map { it.perzentil }) }
            val vorlTage = tage.reversed().map { tag -> alle.any { it.tag == tag && it.vorlaeufig } }
            if (punkte.size < 2) {
                Text(I18n.t("perf.zuWenig"), style = MaterialTheme.typography.bodySmall, color = grau)
            } else {
                val linie = MaterialTheme.colorScheme.outlineVariant
                Canvas(Modifier.fillMaxWidth().height(140.dp).padding(top = 8.dp)) {
                    fun x(i: Int) = size.width * i / (punkte.size - 1)
                    fun y(p: Double) = (size.height * (100 - p) / 100).toFloat()
                    listOf(0.0, 50.0, 100.0).forEach { p -> drawLine(linie, Offset(0f, y(p)), Offset(size.width, y(p)), 1f) }
                    vorlTage.forEachIndexed { i, v -> if (v) drawRect(VorlGelb.copy(alpha = 0.35f), Offset(x(i) - 22f, 0f), Size(44f, size.height)) }
                    for (i in 1 until punkte.size) drawLine(PerfCyan, Offset(x(i - 1), y(punkte[i - 1])), Offset(x(i), y(punkte[i])), 4f)
                    punkte.forEachIndexed { i, p -> drawCircle(if (vorlTage[i]) BandGelb else PerfCyan, 7f, Offset(x(i), y(p))) }
                }
                Row(Modifier.fillMaxWidth()) {
                    Text(tage.last(), style = MaterialTheme.typography.labelSmall, color = grau)
                    Spacer(Modifier.weight(1f))
                    Text(tage.first(), style = MaterialTheme.typography.labelSmall, color = grau)
                }
                if (vorlTage.any { it }) VorlHinweis()
            }
        }
    }
}


/** Saison-Fenster (wie Web (i)): Status (startet am … / Rang), Punktetabelle und Regeln. */
@Composable
private fun SaisonDialog(s: PerfSaison, schliessen: () -> Unit) {
    val grau = MaterialTheme.colorScheme.onSurfaceVariant
    val status = when {
        !s.gestartet -> I18n.t("perf.saison.startet").replace("{jahr}", "${s.jahr}")
        s.rang != null -> I18n.t("perf.saison.rang").replace("{rang}", "${s.rang}").replace("{fahrer}", "${s.fahrer}")
            .replace("{tage}", "${s.tage}")
        else -> I18n.t("perf.saison.nochKeine")
    }
    AlertDialog(onDismissRequest = schliessen,
            confirmButton = { TextButton(onClick = schliessen) { Text(I18n.t("common.close")) } },
            title = { Text(I18n.t("perf.saisonTitel")) },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState())) {
                    Text(I18n.t("perf.saison.infoIntro"), style = MaterialTheme.typography.bodyMedium)
                    Spacer(Modifier.height(8.dp))
                    Text(status, fontWeight = FontWeight.Medium,
                        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(PerfCyan.copy(alpha = 0.12f)).padding(8.dp))
                    Spacer(Modifier.height(8.dp))
                    Row(Modifier.fillMaxWidth()) {
                        Text(I18n.t("perf.saison.platz"), style = MaterialTheme.typography.labelSmall, color = grau, modifier = Modifier.weight(1f))
                        Text(I18n.t("perf.saison.punkte"), style = MaterialTheme.typography.labelSmall, color = grau)
                    }
                    s.regel.platz.forEachIndexed { i, p ->
                        Row(Modifier.fillMaxWidth().padding(vertical = 1.dp)) {
                            Text("${i + 1}.", modifier = Modifier.weight(1f))
                            Text("$p", fontWeight = FontWeight.SemiBold)
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    Text(I18n.t("perf.saison.mitmachen").replace("{n}", "${s.regel.mitmachen}"),
                        modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(PerfCyan.copy(alpha = 0.12f)).padding(8.dp))
                    Spacer(Modifier.height(8.dp))
                    Text(I18n.t("perf.saison.kategorien").replace("{kats}", s.regel.kategorien.joinToString(" · ") { I18n.t("perf.kat.$it") }),
                        style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.height(6.dp))
                    Text(I18n.t("perf.saison.regeln").replace("{n}", "${s.regel.minFeld}").replace("{max}", "${s.regel.maxTag}")
                        .replace("{jahr}", "${s.jahr}"), style = MaterialTheme.typography.bodySmall, color = grau)
                }
            })
}
