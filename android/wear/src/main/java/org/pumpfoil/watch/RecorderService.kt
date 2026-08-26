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
import androidx.health.services.client.ExerciseClient
import androidx.health.services.client.ExerciseUpdateCallback
import androidx.health.services.client.HealthServices
import androidx.health.services.client.data.Availability
import androidx.health.services.client.data.DataType
import androidx.health.services.client.data.ExerciseConfig
import androidx.health.services.client.data.ExerciseLapSummary
import androidx.health.services.client.data.ExerciseType
import androidx.health.services.client.data.ExerciseUpdate
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority

// Foreground-Service: hält Aufnahme im Hintergrund am Leben, registriert Sensoren
// (Accel 25 Hz, HR) + GPS (1 Hz) und füttert den Recorder.
class RecorderService : Service(), SensorEventListener {
    private lateinit var sensors: SensorManager
    // Puls ueber Health Services (s. startHeartRate). Solange von dort Werte kommen, haben sie
    // Vorrang vor dem rohen Sensor — sonst wuerde ein alter Sensor-Wert einen frischen ueberschreiben.
    private var hsClient: ExerciseClient? = null
    private var hsDelivered = false
    private val fused by lazy { LocationServices.getFusedLocationProviderClient(this) }
    private val locCb = object : LocationCallback() {
        override fun onLocationResult(r: LocationResult) {
            r.lastLocation?.let {
                Recorder.addGps(it.latitude, it.longitude,
                    // -1 = Geraet liefert KEINE Geschwindigkeit. Vorher stand hier 0.0 — das
                    // war von einem echten Stillstand nicht zu unterscheiden, und genau darauf
                    // entscheidet die Distanz-Schwelle (Recorder.STAND_MPS).
                    if (it.hasSpeed()) it.speed.toDouble() else -1.0, it.accuracy.toDouble())
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        sensors = getSystemService(SENSOR_SERVICE) as SensorManager
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) { stopEverything(save = true); return START_NOT_STICKY }
        if (intent?.action == ACTION_DISCARD) { stopEverything(save = false); return START_NOT_STICKY }
        startForeground(1, notification())
        Recorder.start(applicationContext)
        registerSensors()
        startHeartRate()
        startLocation()
        return START_STICKY
    }

    private fun registerSensors() {
        // Modus "gps": kein Roh-Accel (minimaler Speicher); sonst Rate je Modus (full=25, lite=10).
        if (Recorder.recordMode != "gps") {
            sensors.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)?.let {
                sensors.registerListener(this, it, 1_000_000 / Recorder.accelHzActual) // µs period
            }
        }
        // Roher Puls-Sensor: bleibt als Rueckfall registriert (s. startHeartRate), kostet nichts.
        sensors.getDefaultSensor(Sensor.TYPE_HEART_RATE)?.let {
            sensors.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL)
        }
    }

    /**
     * Puls AKTIV anfordern statt nur mitzulesen.
     *
     * Feldbefund 15.08. (u171, Xiaomi Watch 2 Pro): 11 Sessions, **0** Puls-Werte, Berechtigung
     * erteilt — und zwei Galaxy-Watch-Nutzer mit 4/8 bzw. 3/6. `SensorManager` mit
     * `TYPE_HEART_RATE` liest auf Wear OS 3+ nur mit, was das System ohnehin gerade misst; es
     * schaltet die PPG-Messung NICHT ein. Wo die Dauermessung der Uhr an ist (Pixel/Samsung-
     * Standard), kommen Werte; wo der Hersteller sparsam misst, kommt stundenlang nichts, und
     * ein einzelner Treffer ist eine zufaellig hineingefallene Hintergrund-Stichprobe.
     *
     * Health Services (`ExerciseClient`) fordert die Messung fuer die Dauer der Aufnahme an —
     * der von Google fuer Wear OS 3+ vorgesehene Weg, und der einzige, der auch bei
     * ausgeschaltetem Bildschirm weiterlaeuft. Wir melden nur HEART_RATE_BPM an: GPS macht
     * weiter Fused (`startLocation`), Auto-Pause wollen wir nicht.
     *
     * Scheitert das (Health Services fehlt, eine andere App haelt gerade eine Uebung, Uhr ohne
     * Puls-Sensor), bleibt es beim rohen Sensor von oben — also nie schlechter als vorher.
     */
    private fun startHeartRate() {
        // START_STICKY: das System kann den Service mit leerem Intent neu starten. Dann laeuft die
        // Uebung schon — kein zweites Mal starten.
        if (hsClient != null) return
        hsDelivered = false
        try {
            val client = HealthServices.getClient(this).exerciseClient
            hsClient = client
            client.setUpdateCallback(object : ExerciseUpdateCallback {
                override fun onRegistered() {}
                override fun onRegistrationFailed(throwable: Throwable) { hsClient = null }
                override fun onLapSummaryReceived(lapSummary: ExerciseLapSummary) {}
                override fun onAvailabilityChanged(dataType: DataType<*, *>, availability: Availability) {}
                override fun onExerciseUpdateReceived(update: ExerciseUpdate) {
                    val points = update.latestMetrics.getData(DataType.HEART_RATE_BPM)
                    val bpm = points.lastOrNull()?.value?.toInt() ?: return
                    // 0 bedeutet bei Health Services "gerade kein Kontakt", kein Messwert.
                    if (bpm > 0) { hsDelivered = true; Recorder.setHr(bpm) }
                }
            })
            val config = ExerciseConfig.builder(ExerciseType.WORKOUT)
                .setDataTypes(setOf(DataType.HEART_RATE_BPM))
                .setIsAutoPauseAndResumeEnabled(false)
                .setIsGpsEnabled(false)
                .build()
            client.startExerciseAsync(config)
        } catch (_: Throwable) {
            // Health Services nicht verfuegbar -> roher Sensor bleibt die einzige Quelle.
            hsClient = null
        }
    }

    private fun stopHeartRate() {
        val client = hsClient ?: return
        hsClient = null
        // Beendet die Uebung und damit die Messung. Der Callback stirbt mit dem Service.
        try { client.endExerciseAsync() } catch (_: Throwable) {}
    }

    private fun startLocation() {
        val req = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 1000).build()
        try {
            fused.requestLocationUpdates(req, locCb, Looper.getMainLooper())
            Recorder.setGpsDenied(false)
        } catch (_: SecurityException) {
            // Fehlende Standort-Berechtigung: NICHT stumm weiterlaufen. Feldbefund 05.08.:
            // vier Wear-Sessions ueber Stunden mit 1000+ Accel-Chunks und 0 GPS-Punkten —
            // der Nutzer hielt die Uhr fuer inkompatibel. Jetzt sagt die Aufnahme es.
            Recorder.setGpsDenied(true)
        }
    }

    private fun stopEverything(save: Boolean = true) {
        sensors.unregisterListener(this)
        stopHeartRate()
        fused.removeLocationUpdates(locCb)
        if (save) Recorder.stop() else Recorder.discard()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onSensorChanged(e: SensorEvent) {
        when (e.sensor.type) {
            Sensor.TYPE_ACCELEROMETER -> Recorder.addAccel(e.values[0], e.values[1], e.values[2])
            // Nur solange Health Services nichts liefert — sonst wuerde ein alter, passiv
            // mitgelesener Wert den frisch gemessenen ueberschreiben.
            Sensor.TYPE_HEART_RATE -> if (!hsDelivered) Recorder.setHr(e.values[0].toInt())
        }
    }
    override fun onAccuracyChanged(s: Sensor?, a: Int) {}
    override fun onBind(i: Intent?): IBinder? = null

    private fun notification(): Notification {
        val ch = "rec"
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(NotificationChannel(ch, I18n.t("rec.recording"), NotificationManager.IMPORTANCE_LOW))
        return Notification.Builder(this, ch)
            .setContentTitle("Pumpfoil")
            .setContentText(I18n.t("rec.recording"))
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setOngoing(true)
            .build()
    }

    companion object {
        const val ACTION_STOP = "org.pumpfoil.watch.STOP"
        const val ACTION_DISCARD = "org.pumpfoil.watch.DISCARD"
        fun start(ctx: Context) = ctx.startForegroundService(Intent(ctx, RecorderService::class.java))
        fun stop(ctx: Context) = ctx.startService(
            Intent(ctx, RecorderService::class.java).setAction(ACTION_STOP))
        fun discard(ctx: Context) = ctx.startService(
            Intent(ctx, RecorderService::class.java).setAction(ACTION_DISCARD))
    }
}
