package org.pumpfoil.app

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp

// Einheitliche Top-Bar mit dem horizontalen Marken-Wortmarken-Logo links (wie die PWA-Topbar) —
// theme-adaptiv (dunkles Logo auf hellem Grund, helles auf dunklem). `title` nur noch für a11y.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PumpfoilTopBar(
    title: String,
    actions: @Composable androidx.compose.foundation.layout.RowScope.() -> Unit = {},
) {
    val dark = MaterialTheme.colorScheme.background.luminance() < 0.5
    TopAppBar(
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Image(
                    painter = painterResource(if (dark) R.drawable.wordmark_h_dark else R.drawable.wordmark_h_light),
                    contentDescription = "Pumpfoil.org — $title",
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.height(26.dp),
                )
            }
        },
        actions = actions,
    )
}
