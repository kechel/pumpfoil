package org.pumpfoil.app

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

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
    MaterialTheme(
        colorScheme = if (isSystemInDarkTheme()) DarkColors else LightColors,
        content = content,
    )
}
