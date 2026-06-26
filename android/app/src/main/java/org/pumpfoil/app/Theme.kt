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

// Material-3-Theme mit Pumpfoil-Akzent (Cyan), folgt System Light/Dark.
private val Brand = Color(0xFF06B6D4)
private val BrandDark = Color(0xFF22D3EE)

private val DarkColors = darkColorScheme(
    primary = BrandDark,
    onPrimary = Color(0xFF00363D),
    background = Color(0xFF020617),
    surface = Color(0xFF0F172A),
)
private val LightColors = lightColorScheme(
    primary = Brand,
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
