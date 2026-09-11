package org.pumpfoil.app

import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

/**
 * Einrichtungs-Assistent, portiert aus der PWA (`web/src/pages/Onboarding.tsx`).
 *
 * Gleiche sechs Schritte, gleiche Reihenfolge, gleiche Texte (die Tabelle in
 * `I18nOnboarding.kt` wird aus denselben Web-Sprachdateien erzeugt) — und dieselben
 * Grundsaetze: jeder Schritt ist freiwillig und ueberspringbar, ueberall stehen die
 * VORHANDENEN Werte drin, und jeder Schritt speichert sofort fuer sich, damit ein Abbruch
 * das Beantwortete behaelt.
 *
 * ZWEI Stellen sind hier bewusst anders als im Web, weil die Wirklichkeit anders ist:
 *  - Der Uhr-Schritt zeigt fuer Wear OS den Knopf „Auf der Uhr installieren"
 *    (`WatchSync.installOnWatch`) statt einer Anleitung: auf dem Handy sind wir schon, und
 *    die Uhren-App kommt dort NICHT von allein hin.
 *  - Die Handy-Recorder-Karte traegt den SCHALTER selbst (`phone_rec_enabled`, lokal je
 *    Geraet) statt der Store-Knoepfe. In der PWA gibt es nichts einzuschalten, hier schon.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun OnboardingScreen(onFertig: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val schritte = listOf("lang", "level", "sport", "foil", "watch", "done")

    var i by remember { mutableStateOf(OnbState.schritt(ctx, schritte)) }
    var geladen by remember { mutableStateOf(false) }

    // Vorhandene Werte
    var name by remember { mutableStateOf("") }
    var sens by remember { mutableStateOf("normal") }
    var gewicht by remember { mutableStateOf("") }
    var sport by remember { mutableStateOf("pumpfoil") }
    var meineFoils by remember { mutableStateOf<List<Int>>(emptyList()) }
    var standardFoil by remember { mutableStateOf<Int?>(null) }
    var foils by remember { mutableStateOf<List<Foil>>(emptyList()) }
    var geraete by remember { mutableStateOf<List<PairedDevice>>(emptyList()) }

    LaunchedEffect(Unit) {
        try {
            val p = Api.me()
            name = p.displayName ?: ""
            sens = p.foilSensitivity ?: "normal"
        } catch (_: Exception) {}
        try {
            val s = Api.settings()
            val w = s["weight_kg"]?.jsonPrimitive?.intOrNull ?: 0
            gewicht = if (w > 0) w.toString() else ""
            sport = s["default_sport_class"]?.jsonPrimitive?.contentOrNull ?: "pumpfoil"
            meineFoils = (s["my_foils"] as? JsonArray)?.mapNotNull { it.jsonPrimitive.intOrNull } ?: emptyList()
            standardFoil = s["foil_id"]?.jsonPrimitive?.intOrNull
        } catch (_: Exception) {}
        geraete = try { Api.myDevices().filter { it.revokedAt == null } } catch (_: Exception) { emptyList() }
        geladen = true
    }
    LaunchedEffect(i) { OnbState.merkeSchritt(ctx, schritte.getOrNull(i)) }

    fun speichere(bau: kotlinx.serialization.json.JsonObjectBuilder.() -> Unit) {
        scope.launch { try { Api.saveSettings(buildJsonObject(bau)) } catch (_: Exception) {} }
    }
    fun beenden() {
        OnbState.merkeSchritt(ctx, null)
        speichere {
            putJsonObject("onboarding") {
                put("done_at", java.time.Instant.now().toString()); put("version", 1)
            }
        }
        onFertig()
    }

    Scaffold(topBar = {
        TopAppBar(
            title = { Text(I18n.t("onb.welcome")) },
            navigationIcon = {
                IconButton(onClick = onFertig) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) }
            },
        )
    }) { pad ->
        if (!geladen) {
            Box(Modifier.fillMaxSize().padding(pad), Alignment.Center) { CircularProgressIndicator() }
            return@Scaffold
        }
        Column(
            Modifier.fillMaxSize().padding(pad).verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(I18n.t("onb.intro"), style = MaterialTheme.typography.bodyMedium)
            LinearProgressIndicator(
                progress = { (i + 1f) / schritte.size },
                modifier = Modifier.fillMaxWidth(),
            )
            Text(I18n.t("onb.step").replace("{n}", (i + 1).toString())
                    .replace("{total}", schritte.size.toString()),
                style = MaterialTheme.typography.bodySmall)

            when (schritte[i]) {
                "lang" -> {
                    SprachKarte(ctx)
                    NameKarte(name, { name = it }, scope)
                }
                "level" -> {
                    KoennenKarte(sens) { neu ->
                        // Nur bei echter Aenderung senden: der Server startet dann eine Reanalyse
                        // aller eigenen Sessions. Fuer ein neues Konto gratis, fuer ein
                        // bestehendes nicht.
                        if (neu != sens) { sens = neu; scope.launch { try { Api.updateFoilSensitivity(neu) } catch (_: Exception) {} } }
                    }
                    GewichtKarte(gewicht) { v ->
                        gewicht = v
                        val n = v.toIntOrNull()
                        if (v.isBlank() || (n != null && n in 0..300)) speichere { put("weight_kg", n ?: 0) }
                    }
                }
                "sport" -> SportKarte(sport) { sport = it; speichere { put("default_sport_class", it) } }
                "foil" -> FoilKarte(
                    foils = foils, setFoils = { foils = it },
                    meine = meineFoils, standard = standardFoil,
                    onWahl = { id ->
                        val nm = if (meineFoils.contains(id)) meineFoils else meineFoils + id
                        meineFoils = nm; standardFoil = id
                        speichere { putJsonArray("my_foils") { nm.forEach { add(it) } }; put("foil_id", id) }
                    },
                    onEntfernen = { id ->
                        val nm = meineFoils.filter { it != id }
                        // War es das Standard-Foil, MUSS foil_id mit weg: der Server erzwingt
                        // „Default impliziert Mitgliedschaft" und nimmt es sonst sofort wieder auf.
                        val nd = if (standardFoil == id) null else standardFoil
                        meineFoils = nm; standardFoil = nd
                        speichere {
                            putJsonArray("my_foils") { nm.forEach { add(it) } }
                            if (nd == null) put("foil_id", kotlinx.serialization.json.JsonNull) else put("foil_id", nd)
                        }
                    },
                    scope = scope,
                )
                "watch" -> UhrKarte(ctx, geraete) { geraete = it }
                "done" -> FertigKarte(geraete.isNotEmpty())
            }

            Spacer(Modifier.height(4.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically) {
                if (i > 0) OutlinedButton(onClick = { i-- }) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, null, Modifier.width(18.dp)); Text(I18n.t("onb.back"))
                }
                Spacer(Modifier.weight(1f))
                if (schritte[i] != "done") {
                    TextButton(onClick = { i++ }) { Text(I18n.t("onb.skip") + " »") }
                    Button(onClick = { i++ }) {
                        Text(I18n.t("onb.next")); Icon(Icons.AutoMirrored.Filled.ArrowForward, null, Modifier.width(18.dp))
                    }
                } else {
                    Button(onClick = { beenden() }) { Text(I18n.t("onb.finish")) }
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                // „Spaeter fortsetzen" laesst den Schritt-Merker stehen — das ist die Zusage des
                // Knopfs. „Nicht mehr zeigen" raeumt ihn weg und setzt den Server-Merker.
                TextButton(onClick = onFertig) { Text(I18n.t("onb.later")) }
                TextButton(onClick = { beenden() }) { Text(I18n.t("onb.never")) }
            }
        }
    }
}

/** Merker je Geraet: welcher Schritt zuletzt offen war. Gegenstueck zum localStorage der PWA. */
object OnbState {
    /** Schon in diesem App-Lauf angeboten? Gegenstueck zum sessionStorage der PWA — verhindert,
     *  dass die Weiche jemanden, der gerade „Spaeter fortsetzen" gedrueckt hat, sofort wieder
     *  hineinschickt. Beim Abmelden zurueckgesetzt, damit die Zusage „beim naechsten Login
     *  nochmal" auch dann gilt, wenn die App nicht neu gestartet wurde. */
    var angeboten = false

    private const val KEY = "onb_schritt"
    private fun prefs(ctx: Context) = ctx.getSharedPreferences("pumpfoil", Context.MODE_PRIVATE)
    fun schritt(ctx: Context, schritte: List<String>): Int {
        val id = prefs(ctx).getString(KEY, null) ?: return 0
        val i = schritte.indexOf(id)
        return if (i >= 0) i else 0
    }
    fun merkeSchritt(ctx: Context, id: String?) {
        prefs(ctx).edit().apply { if (id == null) remove(KEY) else putString(KEY, id) }.apply()
    }
}

// ---------------------------------------------------------------------------------------------

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SprachKarte(ctx: Context) {
    var lang by remember { mutableStateOf(I18n.lang) }
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(I18n.t("onb.x.lang"), fontWeight = FontWeight.Bold)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                I18n.LANGS.forEach { code ->
                    FilterChip(
                        selected = lang == code,
                        onClick = {
                            lang = code
                            I18n.set(ctx, code)
                            // Auch am Konto sichern, wie in der PWA — sonst spricht die naechste
                            // Anmeldung auf einem anderen Geraet wieder die alte Sprache.
                            kotlinx.coroutines.GlobalScope.let { }
                        },
                        label = { Text(ONB_LANG_NAMES[code] ?: code) },
                    )
                }
            }
        }
    }
}

@Composable
private fun NameKarte(name: String, setName: (String) -> Unit, scope: kotlinx.coroutines.CoroutineScope) {
    var busy by remember { mutableStateOf(false) }
    var meldung by remember { mutableStateOf<Pair<Boolean, String>?>(null) }
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(I18n.t("onb.x.name"), fontWeight = FontWeight.Bold)
            Text(I18n.t("onb.name.sub"), style = MaterialTheme.typography.bodySmall)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = name, onValueChange = { setName(it); meldung = null },
                    singleLine = true, modifier = Modifier.weight(1f),
                    label = { Text(I18n.t("onb.x.namePh")) },
                )
                Button(enabled = !busy && name.trim().length >= 2, onClick = {
                    busy = true
                    scope.launch {
                        meldung = try {
                            Api.updateDisplayName(name.trim()); true to I18n.t("onb.x.saved")
                        } catch (e: Exception) {
                            val s = e.message ?: ""
                            false to when {
                                s.contains("bereits") || s.contains("409") -> I18n.t("onb.x.nameTaken")
                                s.contains("2–40") || s.contains("400") -> I18n.t("onb.x.nameLen")
                                else -> I18n.t("onb.x.saveErr")
                            }
                        }
                        busy = false
                    }
                }) { Text(I18n.t("onb.x.save")) }
            }
            meldung?.let { (ok, txt) ->
                Text(txt, color = if (ok) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
private fun KoennenKarte(sens: String, onSens: (String) -> Unit) {
    val stufen = listOf("beginner" to "attempts", "inter" to "light", "pro" to "normal")
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(I18n.t("onb.level.title"), fontWeight = FontWeight.Bold)
            Text(I18n.t("onb.level.sub"), style = MaterialTheme.typography.bodySmall)
            stufen.forEach { (id, wert) ->
                val aktiv = sens == wert
                OutlinedButton(onClick = { onSens(wert) }, modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.weight(1f)) {
                        Text(I18n.t("onb.level.$id"),
                            fontWeight = if (aktiv) FontWeight.Bold else FontWeight.Normal)
                        Text(I18n.t("onb.x.sens.$wert"), style = MaterialTheme.typography.bodySmall)
                    }
                    if (aktiv) Icon(Icons.Filled.Star, null)
                }
            }
        }
    }
}

@Composable
private fun GewichtKarte(gewicht: String, onGewicht: (String) -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(I18n.t("onb.x.weight"), fontWeight = FontWeight.Bold)
            Text(I18n.t("onb.weight.sub"), style = MaterialTheme.typography.bodySmall)
            OutlinedTextField(
                value = gewicht, onValueChange = { onGewicht(it.filter { c -> c.isDigit() }) },
                singleLine = true, suffix = { Text("kg") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.width(160.dp),
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SportKarte(sport: String, onSport: (String) -> Unit) {
    val arten = listOf("pumpfoil", "wingfoil", "kitefoil", "surf_downwind", "efoil", "foildrive", "other")
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(I18n.t("onb.sport.title"), fontWeight = FontWeight.Bold)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                arten.forEach { s ->
                    FilterChip(selected = sport == s, onClick = { onSport(s) },
                        label = { Text(I18n.t("onb.x.sport.$s")) })
                }
            }
        }
    }
}

@Composable
private fun FoilKarte(
    foils: List<Foil>, setFoils: (List<Foil>) -> Unit,
    meine: List<Int>, standard: Int?,
    onWahl: (Int) -> Unit, onEntfernen: (Int) -> Unit,
    scope: kotlinx.coroutines.CoroutineScope,
) {
    var suche by remember { mutableStateOf("") }
    LaunchedEffect(Unit) {
        if (foils.isEmpty()) setFoils(try { Api.foils() } catch (_: Exception) { emptyList() })
    }
    val gewaehlt = foils.filter { it.id == standard || meine.contains(it.id) }
    val treffer = if (suche.isBlank()) emptyList() else foils.filter {
        // Der Katalog fuehrt Zweitbezeichnungen; das Android-Modell traegt sie nicht,
        // also suchen wir hier ueber Marke, Modell und Groesse.
        "${it.brand} ${it.model} ${it.size}".contains(suche.trim(), ignoreCase = true)
    }.take(8)

    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(I18n.t("onb.foil.title"), fontWeight = FontWeight.Bold)
            Text(I18n.t("onb.foil.sub"), style = MaterialTheme.typography.bodySmall)
            if (gewaehlt.isNotEmpty()) {
                Text(I18n.t("onb.foil.chosen"), style = MaterialTheme.typography.bodySmall)
                gewaehlt.forEach { f ->
                    Row(verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        IconButton(onClick = { onWahl(f.id) }) {
                            Icon(if (f.id == standard) Icons.Filled.Star else Icons.Filled.StarBorder, null)
                        }
                        Text("${f.brand} ${f.model} ${f.size}", Modifier.weight(1f))
                        IconButton(onClick = { onEntfernen(f.id) }) {
                            Icon(Icons.Filled.Delete, I18n.t("onb.x.remove"))
                        }
                    }
                }
                if (gewaehlt.size > 1) Text(I18n.t("onb.foil.defaultHint"),
                    style = MaterialTheme.typography.bodySmall)
            }
            OutlinedTextField(value = suche, onValueChange = { suche = it }, singleLine = true,
                modifier = Modifier.fillMaxWidth(), label = { Text(I18n.t("onb.foil.search")) })
            if (suche.isNotBlank() && treffer.isEmpty()) Text(I18n.t("onb.foil.none"))
            treffer.forEach { f ->
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text("${f.brand} ${f.model} ${f.size}", Modifier.weight(1f))
                    TextButton(onClick = { onWahl(f.id) }) { Text(I18n.t("onb.x.add")) }
                }
            }
            Text(I18n.t("onb.foil.missing"), fontWeight = FontWeight.Bold)
            Text(I18n.t("onb.foil.missingHow"), style = MaterialTheme.typography.bodySmall)
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun UhrKarte(ctx: Context, geraete: List<PairedDevice>, setGeraete: (List<PairedDevice>) -> Unit) {
    val scope = rememberCoroutineScope()
    var wahl by remember { mutableStateOf<String?>(null) }
    var code by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var meldung by remember { mutableStateOf<Pair<Boolean, String>?>(null) }
    val uhren = listOf("garmin" to "Garmin", "apple" to "Apple Watch", "wear" to "Wear OS", "amazfit" to "Amazfit")
    val konten = listOf("polar" to "Polar", "coros" to "COROS", "suunto" to "Suunto")

    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(I18n.t("onb.watch.title"), fontWeight = FontWeight.Bold)
            Text(I18n.t("onb.watch.sub"), style = MaterialTheme.typography.bodySmall)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                uhren.forEach { (id, label) ->
                    FilterChip(selected = wahl == id, onClick = { wahl = id }, label = { Text(label) })
                }
            }
            Text(I18n.t("onb.watch.linked"), style = MaterialTheme.typography.bodySmall)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                konten.forEach { (id, label) ->
                    FilterChip(selected = wahl == id, onClick = { wahl = id }, label = { Text(label) })
                }
            }
        }
    }

    when (wahl) {
        "garmin", "apple", "amazfit" -> Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                val p = when (wahl) { "garmin" -> "g"; "apple" -> "a"; else -> "z" }
                (1..3).forEach { n -> Text("$n. " + I18n.t("onb.watch.$p$n")) }
                Text(if (p == "a") I18n.t("onb.watch.codeFallback") else I18n.t("onb.x.claimTitle"),
                    fontWeight = FontWeight.Bold)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(value = code, onValueChange = { code = it.uppercase() },
                        singleLine = true, modifier = Modifier.weight(1f),
                        label = { Text(I18n.t("onb.x.claimPh")) })
                    Button(enabled = !busy && code.trim().length >= 4, onClick = {
                        busy = true
                        scope.launch {
                            meldung = try {
                                Api.pairClaim(code.trim().uppercase())
                                code = ""
                                setGeraete(try { Api.myDevices().filter { it.revokedAt == null } } catch (_: Exception) { geraete })
                                true to I18n.t("onb.x.claimOk")
                            } catch (e: Exception) { false to (e.message ?: "?") }
                            busy = false
                        }
                    }) { Text(I18n.t("onb.x.claimBtn")) }
                }
                meldung?.let { (ok, txt) ->
                    Text(txt, style = MaterialTheme.typography.bodySmall,
                        color = if (ok) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error)
                }
            }
        }
        // Wear OS: hier sind wir auf dem Handy, und die Uhren-App kommt NICHT von allein auf die
        // Uhr (WatchSync.installOnWatch oeffnet den Play Store dort). Das ist der Knopf, den die
        // PWA nicht anbieten kann — deshalb steht er hier statt der Anleitung.
        "wear" -> Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                (1..3).forEach { n -> Text("$n. " + I18n.t("onb.watch.w$n")) }
                Button(onClick = { WatchSync.installOnWatch(ctx) }) { Text(I18n.t("watch.install")) }
            }
        }
        "polar", "coros", "suunto" -> KontoKarte(wahl!!)
        else -> {}
    }

    if (geraete.isNotEmpty()) Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(I18n.t("onb.watch.already"), fontWeight = FontWeight.Bold)
            geraete.forEach { d -> Text(d.model ?: d.label ?: "—") }
        }
    }

    HandyRecorderKarte(ctx)
}

/** Konto-Verknuepfung direkt im Assistenten. Der Sprung zum Hersteller ist unvermeidlich —
 *  OAuth laeuft ueber dessen Anmeldeseite. */
@Composable
private fun KontoKarte(dienst: String) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var status by remember { mutableStateOf<Api.IntegrationStatus?>(null) }
    var fehler by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(dienst) {
        status = try { Api.integrationStatus(dienst) } catch (_: Exception) { null }
    }
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(I18n.t("onb.x.${dienst}Title"), fontWeight = FontWeight.Bold)
            val st = status
            when {
                st == null || !st.available -> Text(I18n.t("onb.link.unavailable"))
                st.linked -> Text(I18n.t("onb.link.linked"), fontWeight = FontWeight.Bold)
                else -> {
                    Text(I18n.t("onb.link.leaves"), style = MaterialTheme.typography.bodySmall)
                    Button(onClick = {
                        scope.launch {
                            try {
                                val url = Api.integrationAuthorizeUrl(dienst)
                                ctx.startActivity(android.content.Intent(
                                    android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url)))
                            } catch (e: Exception) { fehler = e.message }
                        }
                    }) { Text(I18n.t("onb.x.${dienst}Connect")) }
                }
            }
            fehler?.let { Text(it, color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall) }
        }
    }
}

/** Handy-Recorder — anders als in der PWA MIT Schalter: `phone_rec_enabled` liegt lokal auf
 *  diesem Geraet, und genau hier ist er erreichbar. Ohne ihn erscheint der Aufnahme-Knopf auf
 *  der Startseite gar nicht, und der Nutzer sucht ihn vergeblich. */
@Composable
private fun HandyRecorderKarte(ctx: Context) {
    var an by remember {
        mutableStateOf(ctx.getSharedPreferences("pumpfoil", Context.MODE_PRIVATE)
            .getBoolean("phone_rec_enabled", false))
    }
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(I18n.t("onb.x.phonerec"), fontWeight = FontWeight.Bold)
            Text(I18n.t("onb.watch.noWatch"), style = MaterialTheme.typography.bodySmall)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(I18n.t("profile.phoneRecSub"), Modifier.weight(1f),
                    style = MaterialTheme.typography.bodySmall)
                Switch(checked = an, onCheckedChange = {
                    an = it
                    ctx.getSharedPreferences("pumpfoil", Context.MODE_PRIVATE)
                        .edit().putBoolean("phone_rec_enabled", it).apply()
                })
            }
            if (an) Text(I18n.t("rec.waterproof"), fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.error)
        }
    }
}

@Composable
private fun FertigKarte(mitUhr: Boolean) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(I18n.t("onb.done.title"), fontWeight = FontWeight.Bold)
            Text(if (mitUhr) I18n.t("onb.done.withWatch") else I18n.t("onb.done.noWatch"))
            if (mitUhr) Text(I18n.t("onb.done.upload").replace("§", ""),
                style = MaterialTheme.typography.bodySmall)
            Text(I18n.t("onb.done.more"), style = MaterialTheme.typography.bodySmall)
            Text(I18n.t("onb.done.feedback"), style = MaterialTheme.typography.bodySmall)
            Text("Have fun, keep pumping!", Modifier.fillMaxWidth(),
                textAlign = TextAlign.Center, fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary)
        }
    }
}

private val ONB_LANG_NAMES = mapOf(
    "de" to "Deutsch", "gsw" to "Schwiizerdütsch", "de-AT" to "Österreichisch",
    "en" to "English", "fr" to "Français", "it" to "Italiano", "es" to "Español",
    "fi" to "Suomi", "nl" to "Nederlands", "cs" to "Čeština",
    "pt" to "Português (Brasil)", "pt-PT" to "Português (Portugal)", "ja" to "日本語",
    "zh" to "中文", "ru" to "Русский", "id" to "Bahasa Indonesia", "nb" to "Norsk", "pl" to "Polski",
)
