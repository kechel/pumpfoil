package org.pumpfoil.app

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import org.osmdroid.tileprovider.tilesource.OnlineTileSourceBase
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.MapTileIndex
import org.osmdroid.views.MapView

/**
 * Basiskarten fuer ALLE Karten der App: Strassenkarte (OpenStreetMap) und Luftbild
 * (Esri World Imagery) — dasselbe Paar wie in der PWA (`web/src/lib/mapTiles.ts`),
 * Nutzerwunsch vom 26.08.
 *
 * Warum Esri und nicht OSM: OpenStreetMap ist ein DATEN-Projekt und hat keine Luftbilder.
 * Esri liefert sie ohne Schluessel und ohne Kosten gegen Namensnennung.
 *
 * Datenschutz: die Kacheln kommen vom jeweiligen Anbieter, dabei sieht er IP und
 * Kartenausschnitt. Fuer OSM gilt das ohnehin; das Luftbild laedt NUR, wenn jemand es
 * einschaltet. Beides steht in der Datenschutzerklaerung (imp.map*).
 *
 * Die Wahl gilt appweit und ueberlebt den Neustart — wer die Session-Karte auf Luftbild
 * stellt, findet die Spot-Karte genauso vor. Gespeichert unter demselben Schluessel wie im
 * Web ("map_layer"), damit die Begriffe nicht auseinanderlaufen.
 */
object MapTiles {
    private const val SPEICHER = "map_layer"
    const val KARTE = "karte"
    const val SATELLIT = "satellit"

    /**
     * Esri World Imagery. Die Kachel-Adresse laeuft in der Reihenfolge z/y/x — nicht z/x/y wie
     * bei OSM. Genau deshalb reicht `XYTileSource` hier nicht und wir bauen die URL selbst.
     *
     * `maxNativeZoom` 19: darueber skaliert osmdroid die vorhandene Kachel hoch, statt eine
     * nicht existierende nachzuladen (sonst bleibt die Karte ab Zoom 20 weiss).
     */
    private val ESRI: OnlineTileSourceBase = object : OnlineTileSourceBase(
        "EsriWorldImagery", 0, 19, 256, "",
        arrayOf("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/"),
        "© Esri, Maxar, Earthstar Geographics",
    ) {
        override fun getTileURLString(pMapTileIndex: Long): String =
            baseUrl + MapTileIndex.getZoom(pMapTileIndex) + "/" +
                MapTileIndex.getY(pMapTileIndex) + "/" + MapTileIndex.getX(pMapTileIndex)
    }

    fun gewaehlt(ctx: android.content.Context): String =
        if (ctx.getSharedPreferences("pumpfoil", android.content.Context.MODE_PRIVATE)
                .getString(SPEICHER, KARTE) == SATELLIT) SATELLIT else KARTE

    private fun merken(ctx: android.content.Context, wahl: String) {
        ctx.getSharedPreferences("pumpfoil", android.content.Context.MODE_PRIVATE)
            .edit().putString(SPEICHER, wahl).apply()
    }

    /** Setzt die Kachelquelle passend zur Wahl. Von jeder Karte in `factory` UND `update`
     *  aufrufen — sonst bleibt eine schon gebaute Karte auf der alten Ebene stehen. */
    fun anwenden(map: MapView, wahl: String) {
        map.setTileSource(if (wahl == SATELLIT) ESRI else TileSourceFactory.MAPNIK)
    }

    /**
     * Der Umschalter, den jede Karte ueber ihr `AndroidView` legt.
     *
     * EIN Knopf statt einer Auswahlliste (Jan, 31.08.): bei genau zwei Ebenen waere eine Liste
     * zwei Tipp fuer etwas, das einer sein sollte. Beschriftet ist er mit dem ZIEL — steht
     * „Satellit" drauf, kommt man mit einem Tipp dorthin.
     *
     * @param onWechsel bekommt die neue Wahl; die Karte ruft damit [anwenden] auf.
     */
    @Composable
    fun Umschalter(wahl: String, modifier: Modifier = Modifier, onWechsel: (String) -> Unit) {
        val ctx = LocalContext.current
        Text(
            text = I18n.t(if (wahl == SATELLIT) "map.street" else "map.satellite"),
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = modifier
                .padding(8.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.92f))
                .clickable {
                    val neu = if (wahl == SATELLIT) KARTE else SATELLIT
                    merken(ctx, neu)
                    onWechsel(neu)
                }
                .padding(horizontal = 10.dp, vertical = 6.dp),
        )
    }

    /**
     * Karte + Umschalter in einem Aufruf: die Karte fuellt die Box, der Knopf sitzt oben LINKS.
     * So muss keine der fuenf Kartenstellen die Ausrichtung selbst kennen.
     *
     * Warum links: in der Session-Detail- und der Vergleichsansicht sitzt oben rechts schon der
     * Vollbild- bzw. Schliessen-Knopf. Eine Ecke fuer ALLE fuenf Karten ist besser als eine, die
     * je nach Karte wechselt (iOS macht es genauso).
     */
    @Composable
    fun MitUmschalter(modifier: Modifier = Modifier, karte: @Composable (String) -> Unit) {
        val ctx = LocalContext.current
        var wahl by remember { mutableStateOf(gewaehlt(ctx)) }
        Box(modifier) {
            karte(wahl)
            Umschalter(wahl, Modifier.align(Alignment.TopStart)) { wahl = it }
        }
    }
}
