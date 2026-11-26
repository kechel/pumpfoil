package org.pumpfoil.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

// Uhren-Statistik (spiegelt web/WatchStats): Community-Aggregat je Uhr-Modell — welche
// Werte werden mit welcher Uhr gefahren. Mobil als Cards statt breiter Tabelle;
// Sortierung über Chips (wie die sortierbaren Web-Spalten), leere Werte immer unten.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WatchStatsScreen(onBack: () -> Unit, onFoilStats: () -> Unit = {}) {
    var rows by remember { mutableStateOf<List<WatchStat>?>(null) }
    var quali by remember { mutableStateOf<WatchQuality?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var sortKey by remember { mutableStateOf("sessions") }
    var sortAsc by remember { mutableStateOf(false) }
    // Sortierung der Uhren-Auswertung (web 7ea40a5b, Jan 21.11.: „spalten … direkt sortierbar"): bei zwei Wegen zaehlt der
    // bessere Wert, leere unten, Gleichstand nach Name.
    var qSortKey by remember { mutableStateOf("sessions") }
    var qSortAsc by remember { mutableStateOf(false) }
    // Welche Haelfte: 0 = Nutzung, 1 = Aufnahmequalitaet. Vorher untereinander, die Qualitaet erst
    // nach allen Modellen — Jan fand sie nicht (07.10.2026). Gleich wie iOS.
    // Seit 05.11.2026 als Reiter mit den Ueberschriften des Webs (WatchStats.tsx), gemerkt wie die anderen Reiter.
    var reiterWahl by rememberReiter("watchstats", listOf("foiling", "qualitaet"), "foiling")
    val teil = if (reiterWahl == "qualitaet") 1 else 0

    LaunchedEffect(Unit) {
        try { rows = Api.watchStats() } catch (e: Exception) { error = e.message; rows = emptyList() }
        // Zweiter, unabhaengiger Abruf: schlaegt er fehl, fehlt nur dieser Abschnitt.
        try { quali = Api.watchQuality() } catch (_: Exception) { quali = null }
    }

    Scaffold(topBar = {
        TopAppBar(
            title = { Text(I18n.t("watchStats.title")) },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = I18n.t("a11y.back"))
                }
            },
            actions = {
                // Wie im Web: oben rechts zur jeweils anderen Statistik.
                TextButton(onClick = onFoilStats) { Text(I18n.t("profile.stats")) }
                FeedbackKnopf()   // ganz rechts, wie auf den Haupt-Tabs
            },
        )
    }) { pad ->
        val list = rows
        if (list == null) {
            Box(Modifier.padding(pad).fillMaxSize()) { CircularProgressIndicator(Modifier.align(Alignment.Center)) }
            return@Scaffold
        }
        val sorted = remember(list, sortKey, sortAsc) {
            sortStats(list, sortAsc, nameKey = if (sortKey == "name") ({ w: WatchStat -> w.watch.lowercase() }) else null) {
                when (sortKey) {
                    "sessions" -> it.sessions.toDouble()
                    "users" -> it.users.toDouble()
                    "km" -> it.foilingKm
                    "speed" -> it.avgSpeedKmh
                    "bestSpeed" -> it.bestSpeedKmh
                    "hz" -> it.avgPumpHz
                    else -> it.sessions.toDouble()
                }
            }
        }
        fun sel(k: String) { if (sortKey == k) sortAsc = !sortAsc else { sortKey = k; sortAsc = (k == "name") } }
        val hatQuali = quali?.modelle?.isNotEmpty() == true
        LazyColumn(Modifier.padding(pad).fillMaxSize().padding(horizontal = 12.dp)) {
            if (hatQuali) {
                item {
                    Reiterleiste(listOf(ReiterDef("foiling", I18n.t("watchStats.sectionFoiling")),
                                        ReiterDef("qualitaet", I18n.t("watchQuality.title"))),
                        reiterWahl, { reiterWahl = it }, Modifier.padding(top = 8.dp))
                }
            }
            if (teil == 0 || !hatQuali) {
            item {
                Text(I18n.t("watchStats.hint"),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(vertical = 8.dp))
            }
            item {
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(bottom = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    sortChip(I18n.t("nav.watch"), "name", sortKey, sortAsc, ::sel)
                    sortChip(I18n.t("nav.sessions"), "sessions", sortKey, sortAsc, ::sel)
                    sortChip(I18n.t("watchStats.users"), "users", sortKey, sortAsc, ::sel)
                    sortChip(I18n.t("watchStats.km"), "km", sortKey, sortAsc, ::sel)
                    sortChip("Ø km/h", "speed", sortKey, sortAsc, ::sel)
                    sortChip(I18n.t("watchStats.bestSpeed"), "bestSpeed", sortKey, sortAsc, ::sel)
                    sortChip("Ø ${PumpUnit.unitLabel()}", "hz", sortKey, sortAsc, ::sel)
                }
            }
            error?.let { e -> item { Text(e, color = MaterialTheme.colorScheme.error) } }
            if (list.isEmpty() && error == null) {
                item { Text(I18n.t("watchStats.none"), color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(8.dp)) }
            }
            items(sorted, key = { it.watch }) { s -> watchCard(s) }
            }

            // Uhren-Auswertung: was die Geraete wirklich abliefern. Bewusst OHNE Urteil —
            // das entscheiden Nutzer selbst (Jan, 05.09.); die Zahlen stehen dafuer da.
            if (teil == 1) quali?.takeIf { it.modelle.isNotEmpty() }?.let { q ->
                item {
                    Column(Modifier.padding(top = 8.dp, bottom = 6.dp)) {
                        Text(
                            I18n.t("watchQuality.lead")
                                .replace("{sessions}", q.sessions.toString())
                                .replace("{hours}", q.stunden.toString())
                                .replace("{date}", q.stand),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                        Text(
                            I18n.t("watchQuality.new"),
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(top = 8.dp),
                        )
                    }
                }
                // Je Modell eine Karte mit beiden Wegen (App, Garmin Connect; 15.11.2026, wie WatchStats.tsx).
                fun qSel(k: String) { if (qSortKey == k) qSortAsc = !qSortAsc else { qSortKey = k; qSortAsc = (k == "name") } }
                item {
                    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(bottom = 6.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        sortChip(I18n.t("nav.watch"), "name", qSortKey, qSortAsc, ::qSel)
                        sortChip(I18n.t("watchStats.users"), "users", qSortKey, qSortAsc, ::qSel)
                        sortChip(I18n.t("nav.sessions"), "sessions", qSortKey, qSortAsc, ::qSel)
                        sortChip(I18n.t("watchQuality.colPump"), "pump", qSortKey, qSortAsc, ::qSel)
                        sortChip(I18n.t("watchQuality.colGps"), "gps", qSortKey, qSortAsc, ::qSel)
                        sortChip(I18n.t("watchQuality.colHr"), "puls", qSortKey, qSortAsc, ::qSel)
                        sortChip(I18n.t("watchQuality.colComplete"), "komplett", qSortKey, qSortAsc, ::qSel)
                        sortChip(I18n.t("watchQuality.colLongest"), "laengste", qSortKey, qSortAsc, ::qSel)
                    }
                }
                fun best(w: List<Double?>): Double? = w.filterNotNull().maxOrNull()
                fun qWert(rs: List<WatchQualityModel>): Double? = when (qSortKey) {
                    "users" -> rs.maxOf { it.nutzer }.toDouble()
                    "pump" -> best(rs.map { it.accelHz })
                    "gps" -> best(rs.map { it.gueteGut })   // Garmin-Guete; Meter sind nicht vergleichbar -> unten
                    "puls" -> best(rs.map { it.pulsWechsel })
                    "komplett" -> best(rs.map { it.vollstaendig })
                    "laengste" -> best(rs.map { it.laengsteAccelS })
                    else -> rs.sumOf { it.sessions }.toDouble()
                }
                val gruppen = (q.modelle + q.modelleKonto).groupBy { it.modell }.toList()
                    .sortedWith { (am, ars), (bm, brs) ->
                        if (qSortKey == "name") {
                            val c = am.lowercase().compareTo(bm.lowercase()); if (qSortAsc) c else -c
                        } else {
                            val av = qWert(ars); val bv = qWert(brs)
                            when {
                                av == null && bv == null -> am.compareTo(bm)
                                av == null -> 1
                                bv == null -> -1
                                else -> (if (qSortAsc) av.compareTo(bv) else bv.compareTo(av)).takeIf { it != 0 } ?: am.compareTo(bm)
                            }
                        }
                    }
                val mitKonto = q.modelleKonto.isNotEmpty()
                items(gruppen, key = { "q-" + it.first }) { (modell, rs) ->
                    qualiCard(modell, rs.sortedBy { if (it.weg == "gc") 1 else 0 }, mitKonto)
                }
                item {
                    Text(
                        I18n.t("watchQuality.note") +
                            (if (q.modelleKonto.isNotEmpty()) "\n\n" + I18n.t("watchQuality.noteWays") else ""),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 8.dp, bottom = 16.dp),
                    )
                }
            }
        }
    }
}

// Eine Karte der Uhren-Auswertung: das Modell, darunter je Weg (App / Garmin Connect) die Werte. Ab drei Fahrern
// abwaerts steht der Hinweis dabei, dass die Datenbasis duenn ist — die Zahlen bleiben aber stehen (s. Web-Fassung).
@Composable
private fun qualiCard(modell: String, rs: List<WatchQualityModel>, wegZeigen: Boolean) {
    Card(Modifier.fillMaxWidth().padding(bottom = 10.dp)) {
        Column(Modifier.padding(12.dp)) {
            Text(modell, fontWeight = FontWeight.SemiBold)
            rs.forEachIndexed { i, m ->
                if (rs.size > 1 || m.weg == "gc") {   // Kennzeichen nur, wo es unterscheidet (fast alles ist App)
                    Text(
                        if (m.weg == "gc") I18n.t("watchQuality.viaGc") else I18n.t("watchQuality.viaApp"),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = if (i == 0) 4.dp else 12.dp),
                    )
                }
                if (m.nutzer <= 3) {
                    Text(
                        I18n.t("watchQuality.few"),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.tertiary,
                    )
                }
                Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    wMetric("${m.nutzer}", I18n.t("watchStats.users"))
                    wMetric("${m.sessions}", I18n.t("nav.sessions"))
                    // Rate UND Anteil der Sessions mit brauchbarer Beschleunigung (ueber Garmin Connect oft nur ein Teil).
                    val anteil = m.mitAccel ?: (100.0 - m.gpsOnly).coerceAtLeast(0.0)
                    // Garmin Connect zaehlt nur Dateien MIT Beschleunigung — der Anteil waere dort immer 100 %.
                    wMetric(m.accelHz?.let { if (m.weg == "gc") "%.0f Hz".format(it) else "%.0f Hz · %.0f %%".format(it, anteil) }
                        ?: I18n.t("watchQuality.gpsOnly"),
                        I18n.t("watchQuality.colPump"))
                }
                Row(Modifier.fillMaxWidth().padding(top = 10.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    // Garmin meldet eine Guete-Stufe, die anderen Meter — nie in EINE Zahl mischen.
                    wMetric(
                        m.gueteGut?.let { I18n.t("watchQuality.gpsGood").replace("{pct}", "%.0f".format(it)) }
                            ?: m.haccM?.let { "%.1f m".format(it) }
                            // ohne Guete/Meter (Garmin-Connect-Datei): Anteil eingefrorener Punkte, sonst saehe es nach „kein GPS" aus
                            ?: m.ortungSteht?.let { I18n.t("watchQuality.gpsStale").replace("{pct}", "%.1f".format(it)) } ?: "–",
                        I18n.t("watchQuality.colGps"),
                    )
                    wMetric(
                        m.pulsWechsel?.let { I18n.t("watchQuality.hrRate").replace("{n}", "%.0f".format(it)) } ?: "–",
                        I18n.t("watchQuality.colHr"),
                    )
                    wMetric(m.vollstaendig?.let { "%.0f %%".format(it) } ?: "–", I18n.t("watchQuality.colComplete"))
                    wMetric(m.laengsteAccelS?.let { val min = Math.round(it / 60).toInt(); "%d:%02d h".format(min / 60, min % 60) } ?: "–",
                        I18n.t("watchQuality.colLongest"))
                }
            }
        }
    }
}

@Composable
private fun watchCard(s: WatchStat) {
    Card(Modifier.fillMaxWidth().padding(bottom = 10.dp)) {
        Column(Modifier.padding(12.dp)) {
            Text(s.watch, fontWeight = FontWeight.SemiBold)
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                wMetric("${s.sessions}", I18n.t("nav.sessions"))
                wMetric("${s.users}", I18n.t("watchStats.users"))
                wMetric(s.foilingKm?.let { "%.1f".format(it) } ?: "–", I18n.t("watchStats.km"))
            }
            Row(Modifier.fillMaxWidth().padding(top = 10.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                wMetric(s.avgSpeedKmh?.let { "%.1f".format(it) } ?: "–", "Ø km/h")
                wMetric(s.bestSpeedKmh?.let { "%.1f".format(it) } ?: "–", I18n.t("watchStats.bestSpeed"))
                wMetric(PumpUnit.fmtValue(s.avgPumpHz), "Ø ${PumpUnit.unitLabel()}")
            }
        }
    }
}

@Composable
private fun wMetric(value: String, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.primary)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
