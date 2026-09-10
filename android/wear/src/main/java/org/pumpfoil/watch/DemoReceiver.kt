package org.pumpfoil.watch

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo

// NUR für Screenshots/Debug: injiziert feste Demo-Werte (Speed/Puls) in den Recorder, ohne echte
// Sensoren/GPS. In Release-Builds wirkungslos (Debuggable-Check). Treiber: scripts/wear-demo.sh
//   adb shell am broadcast -n org.pumpfoil.app/org.pumpfoil.watch.DemoReceiver --ef speed 15.6 --ei hr 148
//
// `puls=false` schaltet den Hinweis „Puls passiv" ein. Der ist im Emulator anders NICHT zu sehen:
// `RecorderService` überspringt Health Services dort absichtlich (Sensor-HAL bricht sonst ab,
// s. RecorderService.kt:193), also wird `pulsMessung` nie auf false gesetzt. Genau dieser Text
// war aber der Grund, aus dem Google Version 1037 abgelehnt hat — er muss sich also für einen
// Beleg-Screenshot herstellen lassen:
//   adb shell am broadcast -n org.pumpfoil.app/org.pumpfoil.watch.DemoReceiver --ez puls false
class DemoReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if ((ctx.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) == 0) return
        val speed = intent.getFloatExtra("speed", 15.6f).toDouble()
        val hr = intent.getIntExtra("hr", 148)
        val puls = intent.getBooleanExtra("puls", true)
        Recorder.demo(speed, hr, puls)
    }
}
