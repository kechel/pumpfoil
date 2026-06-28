package org.pumpfoil.app

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp

// Einheitliche Top-Bar mit Markenlogo links — auf allen Hauptscreens (nutzt den oberen
// Header-Freiraum, statt nur einen nackten Titel zu zeigen).
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PumpfoilTopBar(
    title: String,
    actions: @Composable androidx.compose.foundation.layout.RowScope.() -> Unit = {},
) {
    TopAppBar(
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Image(
                    painter = painterResource(R.drawable.logo_waves),
                    contentDescription = null,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.size(28.dp),
                )
                Spacer(Modifier.width(8.dp))
                Text(title, style = MaterialTheme.typography.titleLarge)
            }
        },
        actions = actions,
    )
}
