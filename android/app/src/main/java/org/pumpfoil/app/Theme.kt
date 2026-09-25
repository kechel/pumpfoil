package org.pumpfoil.app

import android.content.Context
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color

// Theme-Wahl (Dark/Light/Auto), persistiert in SharedPreferences "pumpfoil".
object ThemeState {
    var mode by mutableStateOf("auto")   // "auto" | "light" | "dark"
    private fun prefs(ctx: Context) = ctx.getSharedPreferences("pumpfoil", Context.MODE_PRIVATE)
    fun load(ctx: Context) { mode = prefs(ctx).getString("theme", "auto") ?: "auto" }
    fun set(ctx: Context, m: String) { mode = m; prefs(ctx).edit().putString("theme", m).apply() }
}

// Material-3-Theme mit Pumpfoil-Akzent (Cyan). Wie die PWA: auf DUNKLEM Grund das helle Cyan
// (#22d3ee), auf HELLEM Grund das dunkle Cyan (#0e7490) — damit blauer Text/Akzent lesbar bleibt.
private val BrandLight = Color(0xFF0E7490)   // dark cyan (brand-700) — Text/Akzent auf Weiß
private val BrandDark = Color(0xFF22D3EE)    // bright cyan (brand-400) — auf Navy

// Neutrale Slate-Flächen (wie die PWA) — sonst tönt Material-3 die Neutrals lila ("Rotstich").
//
// ALLE Farbrollen gesetzt, nicht nur `primary` (Jan, 25.09.2026: „in android ist mir schon bei
// vielen hervorhebungen diese unpassende lila farbe aufgefallen … kommt auch bei 'session
// aussortiert' und anderen meldungen vor"). Was nicht gesetzt ist, faellt auf die VIOLETTE
// Material-Grundpalette zurueck — genau das war es: `primaryContainer` (gewaehlte Kachel),
// `secondaryContainer` (Tonal-Knopf, gewaehlte Chips, Markierung in der unteren Leiste) und
// `tertiaryContainer` (alle Hinweiskaesten). Die Rollen tragen jetzt die Bedeutung der PWA:
//   primary/secondaryContainer = Hervorhebung/Auswahl  -> Cyan (brand-500/20 in der PWA)
//   tertiary/tertiaryContainer = Hinweis/Warnung       -> Bernstein (amber in der PWA)
private val DarkColors = darkColorScheme(
    primary = BrandDark,
    onPrimary = Color(0xFF00363D),
    primaryContainer = Color(0xFF164E63),        // cyan-900
    onPrimaryContainer = Color(0xFFCFFAFE),      // cyan-100
    secondary = Color(0xFF94A3B8),               // slate-400
    onSecondary = Color(0xFF0F172A),
    secondaryContainer = Color(0xFF155E75),      // cyan-800
    onSecondaryContainer = Color(0xFFCFFAFE),
    tertiary = Color(0xFFFBBF24),                // amber-400
    onTertiary = Color(0xFF451A03),
    tertiaryContainer = Color(0xFF422006),       // amber-Grund auf Navy
    onTertiaryContainer = Color(0xFFFDE68A),     // amber-200
    background = Color(0xFF020617),
    onBackground = Color(0xFFE2E8F0),
    surface = Color(0xFF0F172A),
    onSurface = Color(0xFFE2E8F0),
    surfaceVariant = Color(0xFF1E293B),
    onSurfaceVariant = Color(0xFF94A3B8),
    surfaceContainerHighest = Color(0xFF1E293B),
    surfaceContainerHigh = Color(0xFF1A2436),
    surfaceContainer = Color(0xFF152032),
)
private val LightColors = lightColorScheme(
    primary = BrandLight,
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFCFFAFE),        // cyan-100
    onPrimaryContainer = Color(0xFF164E63),      // cyan-900
    secondary = Color(0xFF475569),               // slate-600
    onSecondary = Color(0xFFFFFFFF),
    secondaryContainer = Color(0xFFCFFAFE),
    onSecondaryContainer = Color(0xFF155E75),    // cyan-800
    tertiary = Color(0xFFB45309),                // amber-700 — auf Weiss lesbar
    onTertiary = Color(0xFFFFFFFF),
    tertiaryContainer = Color(0xFFFEF3C7),       // amber-100
    onTertiaryContainer = Color(0xFF78350F),     // amber-900
    background = Color(0xFFFFFFFF),
    onBackground = Color(0xFF0F172A),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF0F172A),
    surfaceVariant = Color(0xFFF1F5F9),
    onSurfaceVariant = Color(0xFF475569),
    surfaceContainerHighest = Color(0xFFF1F5F9),
    surfaceContainerHigh = Color(0xFFF1F5F9),
    surfaceContainer = Color(0xFFF8FAFC),
)

@Composable
fun PumpfoilTheme(content: @Composable () -> Unit) {
    val dark = when (ThemeState.mode) {
        "light" -> false
        "dark" -> true
        else -> isSystemInDarkTheme()
    }
    MaterialTheme(
        colorScheme = if (dark) DarkColors else LightColors,
        content = content,
    )
}
