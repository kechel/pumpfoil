package org.pumpfoil.app

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.content.ContextCompat

// Foreground-Service: hält die Handy-Aufnahme im Hintergrund am Leben (Screen aus, in der Tasche),
// registriert Accel (SensorManager) + GPS (LocationManager, 1 Hz) und füttert den Recorder.
class RecorderService : Service(), SensorEventListener {
    private lateinit var sensors: SensorManager
    private lateinit var locMgr: LocationManager
    private var wakeLock: PowerManager.WakeLock? = null

    private val locListener = LocationListener { loc: Location ->
        Recorder.addGps(
            loc.latitude, loc.longitude,
            if (loc.hasSpeed()) loc.speed.toDouble() else 0.0,
            if (loc.hasAccuracy()) loc.accuracy.toDouble() else 0.0
        )
    }

    override fun onCreate() {
        super.onCreate()
        sensors = getSystemService(SENSOR_SERVICE) as SensorManager
        locMgr = getSystemService(LOCATION_SERVICE) as LocationManager
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) { stopEverything(); return START_NOT_STICKY }
        startFg()
        acquireWakeLock()
        Recorder.start(applicationContext)
        registerSensors()
        startLocation()
        return START_STICKY
    }

    private fun startFg() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(1, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        } else {
            startForeground(1, notification())
        }
    }

    // CPU wach halten, solange die Aufnahme läuft — sonst suspendiert das SoC bei Screen-off und
    // der Accelerometer (Non-Wakeup-Sensor) liefert keine Events mehr. Der Foreground-Service allein
    // garantiert das NICHT. Release in stopEverything(). Kein Timeout: Aufnahme kann lange laufen.
    private fun acquireWakeLock() {
        if (wakeLock?.isHeld == true) return
        try {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "pumpfoil:recording").apply {
                setReferenceCounted(false)
                acquire()
            }
        } catch (e: Exception) { android.util.Log.e("RecorderService", "wakelock", e) }
    }

    private fun registerSensors() {
        sensors.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)?.let {
            sensors.registerListener(this, it, 1_000_000 / Recorder.accelHzActual) // µs period
        }
    }

    private fun startLocation() {
        val fine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
        val coarse = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
        if (!fine && !coarse) return   // UI fordert die Permission an
        // GPS für präzise Geschwindigkeit; nur wenn ausschließlich COARSE erteilt, auf NETWORK ausweichen.
        val provider = if (fine) LocationManager.GPS_PROVIDER else LocationManager.NETWORK_PROVIDER
        try {
            locMgr.requestLocationUpdates(provider, 1000L, 0f, locListener)
        } catch (_: SecurityException) { /* Permission fehlt */ }
        catch (_: IllegalArgumentException) { /* Provider nicht verfügbar */ }
    }

    private fun stopEverything() {
        try { sensors.unregisterListener(this) } catch (_: Exception) {}
        try { locMgr.removeUpdates(locListener) } catch (_: Exception) {}
        try { if (wakeLock?.isHeld == true) wakeLock?.release() } catch (_: Exception) {}
        wakeLock = null
        try { Recorder.stop() } catch (e: Exception) { android.util.Log.e("RecorderService", "stop", e) }
        try { stopForeground(STOP_FOREGROUND_REMOVE) } catch (_: Exception) {}
        stopSelf()
    }

    override fun onSensorChanged(e: SensorEvent) {
        if (e.sensor.type == Sensor.TYPE_ACCELEROMETER) {
            Recorder.addAccel(e.values[0], e.values[1], e.values[2])
        }
    }
    override fun onAccuracyChanged(s: Sensor?, a: Int) {}
    override fun onBind(i: Intent?): IBinder? = null

    private fun notification(): Notification {
        val ch = "phone-rec"
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(NotificationChannel(ch, "Aufnahme", NotificationManager.IMPORTANCE_LOW))
        return Notification.Builder(this, ch)
            .setContentTitle("Pumpfoil")
            .setContentText("Aufnahme läuft")
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setOngoing(true)
            .build()
    }

    companion object {
        const val ACTION_STOP = "org.pumpfoil.app.STOP_RECORDING"
        fun start(ctx: Context) = ContextCompat.startForegroundService(ctx, Intent(ctx, RecorderService::class.java))
        fun stop(ctx: Context) = ctx.startService(
            Intent(ctx, RecorderService::class.java).setAction(ACTION_STOP))
    }
}
