package org.pumpfoil.watch

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo

// NUR für Screenshots/Debug: injiziert feste Demo-Werte (Speed/Puls) in den Recorder, ohne echte
// Sensoren/GPS. In Release-Builds wirkungslos (Debuggable-Check). Treiber: scripts/wear-demo.sh
//   adb shell am broadcast -n org.pumpfoil.app/org.pumpfoil.watch.DemoReceiver --ef speed 15.6 --ei hr 148
class DemoReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if ((ctx.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) == 0) return
        val speed = intent.getFloatExtra("speed", 15.6f).toDouble()
        val hr = intent.getIntExtra("hr", 148)
        Recorder.demo(speed, hr)
    }
}
