package org.pumpfoil.app

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** Karten (Spots, Session-Details, Spot-Heatmap) nehmen 2/3 der Bildschirmhoehe ein (Jan, 16.11.2026; iOS KARTE_HOEHE). */
@Composable
fun kartenHoehe(): Dp = (LocalConfiguration.current.screenHeightDp * 2 / 3).dp
