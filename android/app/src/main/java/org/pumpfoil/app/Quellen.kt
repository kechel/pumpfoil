package org.pumpfoil.app

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.layout.padding

/**
 * Quellen einer Anzeige, klein darunter wie die Wetterquelle (Web components/Quellen.tsx, 05.11.2026): „Daten von:
 * Garmin · Apple Watch · …". Der Server liefert die Codes (community.quellen). Erfuellt Garmins Markenvorgabe — sobald
 * Daten aus Garmin-Geraeten drinstecken, steht „Garmin" da. Herstellernamen unuebersetzt, nur „Handy"/„Datei-Upload".
 */
private val QUELLEN_NAMEN = mapOf(
    "garmin" to "Garmin", "apple" to "Apple Watch", "wear" to "Wear OS", "amazfit" to "Amazfit", "huawei" to "Huawei",
    "polar" to "Polar", "suunto" to "Suunto", "coros" to "COROS",
)

internal fun quellenText(quellen: List<String>?): String? {
    if (quellen.isNullOrEmpty()) return null
    val namen = quellen.map { q ->
        QUELLEN_NAMEN[q] ?: when (q) { "phone" -> I18n.t("quellen.phone"); "file" -> I18n.t("quellen.file"); else -> q }
    }
    return "${I18n.t("quellen.titel")}: ${namen.joinToString(" · ")}"
}

@Composable
internal fun QuellenZeile(quellen: List<String>?, modifier: Modifier = Modifier) {
    val text = quellenText(quellen) ?: return
    Text(text, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = modifier.padding(top = 6.dp))
}
