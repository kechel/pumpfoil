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
private val DarkColors = darkColorScheme(
    primary = BrandDark,
    onPrimary = Color(0xFF00363D),
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
