package org.pumpfoil.watch

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.SystemClock
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

/**
 * Erinnerung in der Pause (Jan, 22.10.2026): alle 10 min deutlich vibrieren und auf die Aktionsseite
 * (Fortsetzen, oben „Pausiert") springen — IMMER, nicht abschaltbar („wenn man das nicht will kann man ja
 * speichern und spaeter neu starten"). Anlass #17726: eine Pause blieb 85 min unbemerkt, alle Laeufe danach fehlten.
 *
 * Warum ein System-Wecker und keine Schleife in der Oberflaeche: in der Pause gibt der Dienst seinen
 * PARTIAL_WAKE_LOCK frei (RecorderService.cpuSchlafenLassen), die CPU darf schlafen und eine
 * Coroutine wuerde mitschlafen. `setAndAllowWhileIdle` braucht keine Exakt-Wecker-Berechtigung und
 * ist ungenau, s. `naechste`.
 * Ein BroadcastReceiver (statt Service-PendingIntent), weil das System die CPU waehrend `onReceive` wach haelt.
 */
class PauseMahnung : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val st = Recorder.state.value
        if (!st.recording || !st.paused) return          // inzwischen fortgesetzt/gestoppt
        if (SystemClock.elapsedRealtime() >= ziel()) {
            try {
                vibrator(ctx).vibrate(VibrationEffect.createWaveform(longArrayOf(0, 500, 250, 500, 250, 500), -1))
            } catch (_: RuntimeException) {}
            Recorder.pauseMahnen()                       // MainActivity springt auf die Aktionsseite
            gezeigt++
        }
        naechste(ctx)
    }

    companion object {
        const val ABSTAND_MS = 600_000L
        private const val MIN_SCHRITT_MS = 60_000L
        private var startEr = 0L      // elapsedRealtime beim Pausieren
        private var gezeigt = 0       // Erinnerungen in dieser Pause

        private fun ziel() = startEr + (gezeigt + 1) * ABSTAND_MS

        private fun pi(ctx: Context): PendingIntent = PendingIntent.getBroadcast(
            ctx, 4711, Intent(ctx, PauseMahnung::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

        /** Beim Pausieren. */
        fun planen(ctx: Context) {
            startEr = SystemClock.elapsedRealtime(); gezeigt = 0
            naechste(ctx)
        }

        /**
         * `setAndAllowWhileIdle` ist UNGENAU: das System darf bis 75 % der Verzoegerung spaeter feuern
         * (im Emulator gemessen: +9:57 geplant, Fenster +7:30 -> bis 17:27 nach der Pause). Deshalb in
         * Schritten an die 10-min-Marke herantasten: jeweils 4/7 der Restzeit (spaetestens genau an der
         * Marke), unter 1 min Rest direkt die Restzeit -> hoechstens ~45 s zu spaet, ~5 Weckungen je 10 min.
         * Der genaue Wecker (setExact…) braeuchte SCHEDULE_EXACT_ALARM bzw. USE_EXACT_ALARM (Play-Pruefung).
         */
        private fun naechste(ctx: Context) {
            val jetzt = SystemClock.elapsedRealtime()
            val rest = ziel() - jetzt
            val schritt = when {
                rest <= MIN_SCHRITT_MS -> rest.coerceAtLeast(1_000L)
                else -> (rest * 4 / 7).coerceAtLeast(MIN_SCHRITT_MS)
            }
            val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, jetzt + schritt, pi(ctx))
        }

        fun absagen(ctx: Context) {
            try { (ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(pi(ctx)) } catch (_: RuntimeException) {}
        }

        private fun vibrator(ctx: Context): Vibrator =
            if (Build.VERSION.SDK_INT >= 31)
                (ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
            else @Suppress("DEPRECATION") (ctx.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator)
    }
}
