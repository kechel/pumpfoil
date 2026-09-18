package org.pumpfoil.app

import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.systemBars
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp

/**
 * Höhe der System-Leisten (Status- oben, Navigations-/Gestenleiste unten) als feste dp —
 * gemessen DORT, WO DER AUFRUF STEHT.
 *
 * WARUM ES DAS GIBT: in einem Compose-`Dialog` melden `systemBarsPadding()` und Verwandte je
 * nach Gerät und Android-Version 0. Der Teilen-Dialog hatte deshalb ZWEIMAL denselben Fehler —
 * 08.09.2026 („die Taste ist unter den Display Tasten", Galaxy S23) und 18.09.2026 („es fehlen
 * die save insets unten, ich kann nicht weit genug nach oben scrollen"). Beim ersten Mal war die
 * Antwort `decorFitsSystemWindows = false` plus `systemBarsPadding()`; das hat nicht gehalten.
 *
 * HARTE REGEL: **ausserhalb** des `Dialog { … }`-Blocks aufrufen, im Rumpf der umgebenden
 * Composable-Funktion. Dort läuft der Code noch in der Komposition der Activity, und dort
 * stimmen die Insets. Innerhalb des Dialogs liest diese Funktion dieselben (womöglich leeren)
 * Werte wie die Modifier und hilft nichts.
 *
 * Rückgabe: (oben, unten).
 */
@Composable
fun leistenRaender(): Pair<Dp, Dp> {
    val dichte = LocalDensity.current
    val leisten = WindowInsets.systemBars
    return with(dichte) { leisten.getTop(this).toDp() to leisten.getBottom(this).toDp() }
}
