package org.pumpfoil.app

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier

/*
 * Ausruestung (App-Port Phase 7, 04.11.2026; Web Foils.tsx `Ausruestung` + Setup.tsx): frueher zwei lange Seiten
 * „Meine Foils & Sportarten" und „Detailliertes Setup", jetzt EINE Ansicht mit Reitern Foils · Stabilizer · Boards ·
 * Mast & Shim · Sportarten. Die Teile sind die alten Bildschirme mit `teil` (FoilsScreen, SetupScreen), damit es keine
 * zweite Kopie der Logik gibt. Erreichbar als Reiter in den Einstellungen.
 */

private val AUSRUESTUNG_IDS = listOf("foils", "stabs", "boards", "mast", "sport")

/** Die Reiter samt Inhalt. Fuellt den Platz, den der Aufrufer gibt (die Teile scrollen selbst). */
@Composable
fun AusruestungInhalt(modifier: Modifier = Modifier, stufe: Int = 1) {
    val reiter = listOf(
        ReiterDef("foils", "Foils"),
        ReiterDef("stabs", I18n.t("setup.stabTitle")),
        ReiterDef("boards", I18n.t("setup.boardTitle")),
        ReiterDef("mast", I18n.t("gear.mastShim")),
        ReiterDef("sport", I18n.t("mySpots.sports")),
    )
    var tab by rememberReiter("ausruestung", AUSRUESTUNG_IDS, "foils")
    Column(modifier) {
        Reiterleiste(reiter, tab, { tab = it }, stufe = stufe)
        Box(Modifier.fillMaxWidth().weight(1f)) {
            // key: jeder Teil laedt beim Wechsel frisch — was ein anderer Teil gespeichert hat, ist dann schon da.
            androidx.compose.runtime.key(tab) {
                when (tab) {
                    "foils" -> FoilsScreen(teil = "foils", eingebettet = true)
                    "sport" -> FoilsScreen(teil = "sport", eingebettet = true)
                    else -> SetupScreen(onBack = {}, teil = tab, eingebettet = true)
                }
            }
        }
    }
}
