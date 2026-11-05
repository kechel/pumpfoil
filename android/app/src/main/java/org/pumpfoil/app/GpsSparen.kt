package org.pumpfoil.app

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import android.provider.Settings

// Energiesparen gegen GPS (Befund 04.11.2026): Bei zwei Fahrern mit Samsung (A70/Android 11, S24 Ultra)
// lief die Handy-Aufnahme samt Bewegungsdaten und Live-Upload weiter, nur das GPS fiel 1-2 min nach dem
// Start aus und kam erst beim Stoppen zurueck, also genau solange das Display dunkel war. Ohne GPS keine
// Laeufe; fuer die Fahrer sah es aus wie „nicht aufgezeichnet". Der Dienst ist richtig als Ortungsdienst
// angemeldet und haelt die CPU wach (auf dem Xiaomi daneben lief alles durch). VERMUTUNG, nicht belegt:
// der Energiesparmodus, der bei Android das GPS bei dunklem Display drosseln oder abschalten darf
// (PowerManager.getLocationPowerSaveMode). Deshalb warnen wir bei JEDEM aktiven Energiesparen, nicht
// nur bei gemeldetem Ortungsmodus: Samsung kann eigene Regeln haben, die die API nicht verraet.
object GpsSparen {
    /** -1 = Energiesparen aus; sonst der Android-Ortungsmodus im Energiesparen (0 = laut API keine Einschraenkung). */
    fun modus(ctx: Context): Int {
        val pm = ctx.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return -1
        if (!pm.isPowerSaveMode) return -1
        return if (Build.VERSION.SDK_INT >= 28) pm.locationPowerSaveMode else 0
    }

    fun an(ctx: Context) = modus(ctx) >= 0

    /** Energiespar-Einstellungen; gibt es die Seite nicht (manche Hersteller), die allgemeinen Einstellungen. */
    fun einstellungenOeffnen(ctx: Context) {
        for (aktion in listOf(Settings.ACTION_BATTERY_SAVER_SETTINGS, Settings.ACTION_SETTINGS)) {
            try {
                ctx.startActivity(Intent(aktion).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                return
            } catch (_: Exception) { /* naechste versuchen */ }
        }
    }
}
