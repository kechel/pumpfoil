package org.pumpfoil.watch

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.IBinder
import android.os.Looper
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority

// Foreground-Service: hält Aufnahme im Hintergrund am Leben, registriert Sensoren
// (Accel 25 Hz, HR) + GPS (1 Hz) und füttert den Recorder.
class RecorderService : Service(), SensorEventListener {
    private lateinit var sensors: SensorManager
    private val fused by lazy { LocationServices.getFusedLocationProviderClient(this) }
    private val locCb = object : LocationCallback() {
        override fun onLocationResult(r: LocationResult) {
            r.lastLocation?.let {
                Recorder.addGps(it.latitude, it.longitude,
                    if (it.hasSpeed()) it.speed.toDouble() else 0.0, it.accuracy.toDouble())
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        sensors = getSystemService(SENSOR_SERVICE) as SensorManager
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) { stopEverything(); return START_NOT_STICKY }
        startForeground(1, notification())
        Recorder.start(applicationContext)
        registerSensors()
        startLocation()
        return START_STICKY
    }

    private fun registerSensors() {
        sensors.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)?.let {
            sensors.registerListener(this, it, 1_000_000 / Recorder.ACCEL_HZ) // µs period → 25 Hz
        }
        sensors.getDefaultSensor(Sensor.TYPE_HEART_RATE)?.let {
            sensors.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL)
        }
    }

    private fun startLocation() {
        val req = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 1000).build()
        try { fused.requestLocationUpdates(req, locCb, Looper.getMainLooper()) }
        catch (_: SecurityException) { /* Permission fehlt – UI fordert sie an */ }
    }

    private fun stopEverything() {
        sensors.unregisterListener(this)
        fused.removeLocationUpdates(locCb)
        Recorder.stop()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onSensorChanged(e: SensorEvent) {
        when (e.sensor.type) {
            Sensor.TYPE_ACCELEROMETER -> Recorder.addAccel(e.values[0], e.values[1], e.values[2])
            Sensor.TYPE_HEART_RATE -> Recorder.setHr(e.values[0].toInt())
        }
    }
    override fun onAccuracyChanged(s: Sensor?, a: Int) {}
    override fun onBind(i: Intent?): IBinder? = null

    private fun notification(): Notification {
        val ch = "rec"
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
        const val ACTION_STOP = "org.pumpfoil.watch.STOP"
        fun start(ctx: Context) = ctx.startForegroundService(Intent(ctx, RecorderService::class.java))
        fun stop(ctx: Context) = ctx.startService(
            Intent(ctx, RecorderService::class.java).setAction(ACTION_STOP))
    }
}
