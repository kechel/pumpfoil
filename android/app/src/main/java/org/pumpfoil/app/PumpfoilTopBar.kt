package org.pumpfoil.app

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp

// Kompakte Top-Bar mit dem horizontalen Marken-Wortmarken-Logo links (wie die PWA-Topbar).
// Bewusst NICHT Material3-TopAppBar (die zentriert das 26dp-Logo in 64dp -> zu viel Leerraum
// darunter). Höhe = Logo + knappes Padding + Status-Bar-Inset. `title` nur noch für a11y.
@Composable
fun PumpfoilTopBar(
    title: String,
    actions: @Composable androidx.compose.foundation.layout.RowScope.() -> Unit = {},
) {
    val dark = MaterialTheme.colorScheme.background.luminance() < 0.5
    Surface(color = MaterialTheme.colorScheme.surface, tonalElevation = 0.dp) {
        Row(
            Modifier.fillMaxWidth().statusBarsPadding().padding(start = 16.dp, end = 4.dp, top = 6.dp, bottom = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Image(
                painter = painterResource(if (dark) R.drawable.wordmark_h_dark else R.drawable.wordmark_h_light),
                contentDescription = "Pumpfoil.org — $title",
                contentScale = ContentScale.Fit,
                modifier = Modifier.height(26.dp),
            )
            Spacer(Modifier.weight(1f).width(8.dp))
            actions()
        }
    }
}
