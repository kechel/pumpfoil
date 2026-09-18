package org.pumpfoil.app

import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LocalMinimumInteractiveComponentEnforcement
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider

// Bedienzeilen kompakt halten. Material3 blaeht JEDES Chip, jeden Schalter und jeden Knopf auf
// mindestens 48 dp Antippflaeche auf (LocalMinimumInteractiveComponentEnforcement) — unsichtbar,
// aber bei den fuenf Bedienzeilen ueber der Karte und den Lauf-Nummern darunter summierte sich das
// zu einer halben Bildschirmhoehe Leerraum (Jan, 17.09.2026: „viel weniger Padding und Spacing in
// dem Bereich"). Hier faellt nur dieser unsichtbare Rahmen weg; die Elemente selbst behalten ihre
// Groesse (Chip 32 dp, Schalter 32 dp) und bleiben bequem treffbar.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun Kompakt(content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalMinimumInteractiveComponentEnforcement provides false) { content() }
}
