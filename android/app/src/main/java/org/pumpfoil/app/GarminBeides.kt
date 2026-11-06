package org.pumpfoil.app

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/*
 * Garmin: BEIDES verbinden (Web GarminBeides.tsx, 05.11.2026; App-Port 06.11.). Garmin Connect bringt die vollstaendige
 * Aufnahme, nur die Kopplung per Code bringt Einstellungen, Foils und Layouts auf die Uhr. Kurz halten (Jan: „der hinweis
 * ist viiiiiil zu lang"). Die Ziele sind Reiter, nicht Seiten: Garmin Connect = Uhren › Garmin Connect, Code = Uhren › Uhr
 * › Anleitung › Garmin — umgeschaltet ueber ReiterSpeicher, damit es von Home, Einstellungen und Anleitung aus gleich geht.
 */

private data class GarminStand(val uhr: Boolean, val gc: Boolean, val da: Boolean)

@Composable
private fun rememberGarminStand(): GarminStand? {
    var stand by remember { mutableStateOf<GarminStand?>(null) }
    LaunchedEffect(Unit) {
        stand = try {
            val st = Api.integrationStatus("garmin")
            val geraete = Api.myDevices()
            GarminStand(uhr = geraete.any { it.platform == "garmin" && it.revokedAt == null }, gc = st.linked, da = st.available)
        } catch (_: Exception) { null }
    }
    return stand
}

/** Auf den Reiter Garmin Connect (zu = "gc") bzw. auf die Garmin-Anleitung (zu = "code") schalten. */
private fun garminZiel(zu: String) {
    ReiterSpeicher.von("home", "uebersicht").value = "uhren"
    if (zu == "gc") {
        ReiterSpeicher.von("konten", "uhr").value = "garmin"
    } else {
        ReiterSpeicher.von("konten", "uhr").value = "uhr"
        UhrStartWahl.fest = true
        ReiterSpeicher.von("uhr", "anleitung").value = "anleitung"
        ReiterSpeicher.von("uhrguide", "garmin").value = "garmin"
    }
}

@Composable
private fun ZielLink(zu: String) {
    Text(I18n.t(if (zu == "gc") "garmin.beides.zuGc" else "garmin.beides.zuCode") + " →",
        style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(top = 4.dp).clickable { garminZiel(zu) })
}

@Composable
private fun Kasten(modifier: Modifier = Modifier, inhalt: @Composable BoxScope.() -> Unit) {
    val farbe = MaterialTheme.colorScheme.primary
    Box(modifier.fillMaxWidth().background(farbe.copy(alpha = 0.10f), RoundedCornerShape(12.dp))
        .border(1.dp, farbe.copy(alpha = 0.30f), RoundedCornerShape(12.dp))) { inhalt() }
}

/** Zwei Schritte fuer Anleitung, Garmin-Karte und „Meine Uhr(en)". `wann`: „immer" (Garmin-Anleitung), „nichtBeide"
 *  (Garmin-Connect-Karte), sonst „genauEins" — nur wer eines von beiden schon hat, bekommt den Hinweis aufs andere. */
@Composable
fun GarminBeidesHinweis(zu: String? = null, wann: String = "genauEins") {
    val stand = rememberGarminStand()
    if (wann != "immer") {
        if (stand == null) return
        if (stand.uhr && stand.gc) return
        if (wann == "genauEins" && !stand.uhr && !stand.gc) return
    }
    Kasten(Modifier.padding(bottom = 12.dp)) {
        Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
            Text("1. " + I18n.t("garmin.beides.schritt1"), style = MaterialTheme.typography.bodyMedium)
            Text("2. " + I18n.t("garmin.beides.schritt2"), style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(top = 2.dp))
            if (zu != null) ZielLink(zu)
        }
    }
}

/** Home: nur wenn genau EINES von beiden verbunden ist, wegklickbar je Fall (Merker wie im Web `foil_garmin_beides`). */
@Composable
fun GarminBeidesBanner() {
    val ctx = LocalContext.current
    val prefs = remember { ctx.getSharedPreferences("pumpfoil", android.content.Context.MODE_PRIVATE) }
    val stand = rememberGarminStand()
    var weg by remember { mutableStateOf(prefs.getString("foil_garmin_beides", null)) }
    val fehlt = when {
        stand == null || !stand.da -> null
        stand.uhr && !stand.gc -> "gc"
        stand.gc && !stand.uhr -> "code"
        else -> null
    }
    if (fehlt == null || weg == fehlt) return
    Kasten(Modifier.padding(bottom = 12.dp)) {
        Column(Modifier.padding(start = 14.dp, top = 12.dp, bottom = 12.dp, end = 44.dp)) {
            Text(I18n.t(if (fehlt == "gc") "garmin.fehltGc" else "garmin.fehltCode"), style = MaterialTheme.typography.bodyMedium)
            ZielLink(fehlt)
        }
        IconButton(onClick = { prefs.edit().putString("foil_garmin_beides", fehlt).apply(); weg = fehlt },
            modifier = Modifier.align(Alignment.TopEnd)) {
            Icon(Icons.Filled.Close, contentDescription = I18n.t("banner.dismiss"))
        }
    }
}
