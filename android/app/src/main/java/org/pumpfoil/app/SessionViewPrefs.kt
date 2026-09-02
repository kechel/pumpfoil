package org.pumpfoil.app

import android.content.Context

// Gemerkte Einstellungen der Session-Karte (wie in der PWA, `web/src/lib/sessionViewPrefs.ts`):
// Farbmodus, Glaettung, Pump-Marker und Startversuche gelten ueber Sessions hinweg — wer die
// Karte nach Puls einfaerbt, will das beim naechsten Oeffnen wieder so.
//
// Bewusst LOKAL (SharedPreferences) und nicht im Profil: es ist eine Ansichts-Wahl dieses
// Geraets, wie Sprache, Theme und Kartenebene. Nicht gemerkt wird die Skala — die haengt an der
// einzelnen Session.
internal object SessionViewPrefs {
    private const val DATEI = "pumpfoil"
    private const val K_MODUS = "sd_color_mode"
    private const val K_GLAETTUNG = "sd_smooth_win"
    private const val K_PUMPS = "sd_show_pumps"
    private const val K_VERSUCHE = "sd_show_attempts"

    private fun p(ctx: Context) = ctx.getSharedPreferences(DATEI, Context.MODE_PRIVATE)

    internal fun modus(ctx: Context): ColorMode =
        runCatching { ColorMode.valueOf(p(ctx).getString(K_MODUS, null) ?: "SPEED") }
            .getOrDefault(ColorMode.SPEED)

    /** Glaettungsfenster in Sekunden (1|3|5). */
    fun glaettung(ctx: Context): Int = p(ctx).getInt(K_GLAETTUNG, 3).let { if (it in listOf(1, 3, 5)) it else 3 }

    fun zeigePumps(ctx: Context): Boolean = p(ctx).getBoolean(K_PUMPS, true)

    /** Startversuche: standardmaessig AN (wie im Web, Jans Vorgabe). */
    fun zeigeVersuche(ctx: Context): Boolean = p(ctx).getBoolean(K_VERSUCHE, true)

    internal fun merke(ctx: Context, modus: ColorMode, glaettung: Int, pumps: Boolean, versuche: Boolean) {
        p(ctx).edit()
            .putString(K_MODUS, modus.name)
            .putInt(K_GLAETTUNG, glaettung)
            .putBoolean(K_PUMPS, pumps)
            .putBoolean(K_VERSUCHE, versuche)
            .apply()
    }
}
