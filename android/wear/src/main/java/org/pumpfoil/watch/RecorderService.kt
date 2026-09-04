package org.pumpfoil.watch

import android.app.Notification
import android.app.PendingIntent
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.SystemClock
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.health.services.client.ExerciseClient
import androidx.health.services.client.ExerciseUpdateCallback
import androidx.health.services.client.HealthServices
import androidx.health.services.client.data.Availability
import androidx.health.services.client.data.DataType
import androidx.health.services.client.data.ExerciseConfig
import androidx.health.services.client.data.ExerciseLapSummary
import androidx.health.services.client.data.ExerciseType
import androidx.health.services.client.data.ExerciseUpdate
import androidx.wear.ongoing.OngoingActivity
import androidx.wear.ongoing.Status
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
    // Zeitpunkt des letzten Werts aus Health Services + Zahl der Neuversuche. Beides fuer den
    // Waechter unten: bleibt die Messung stehen, fordern wir sie neu an, statt stumm auf den
    // passiven Sensor zurueckzufallen.
    private var letzterHsMs = 0L
    private var hsNeustarts = 0
    private var waechter: java.util.concurrent.ScheduledExecutorService? = null
    private val fused by lazy { LocationServices.getFusedLocationProviderClient(this) }
    private val locCb = object : LocationCallback() {
        override fun onLocationResult(r: LocationResult) {
            r.lastLocation?.let {
                Recorder.addGps(it.latitude, it.longitude,
                    // -1 = Geraet liefert KEINE Geschwindigkeit. Vorher stand hier 0.0 — das
                    // war von einem echten Stillstand nicht zu unterscheiden, und genau darauf
                    // entscheidet die Distanz-Schwelle (Recorder.STAND_MPS).
                    if (it.hasSpeed()) it.speed.toDouble() else -1.0, it.accuracy.toDouble(),
                    // Alter des Fixes: `elapsedRealtimeNanos` ist der Zeitpunkt der MESSUNG auf
                    // der monotonen Uhr. Ein frischer GNSS-Fix ist 0-2 s alt; wiederholt der
                    // Fused-Provider einen zwischengespeicherten Fix, bleibt der Zeitstempel
                    // stehen und das Alter waechst. Genau daran erkennt die Uhr, dass sie nur
                    // eine alte Position vorgesetzt bekommt (Feldbefund 03.09., s. Recorder).
                    ((SystemClock.elapsedRealtimeNanos() - it.elapsedRealtimeNanos) / 1_000_000L)
                        .coerceAtLeast(0L))
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
        // Puls-Berechtigung wurde WAEHREND der Aufnahme erteilt -> Health Services jetzt anhaengen,
        // statt die Session ohne Puls zu Ende laufen zu lassen. Kommt vom Start-Bildschirm, der
        // die Aufnahme nicht mehr auf den Dialog warten laesst (s. MainActivity).
        if (intent?.action == ACTION_HR_ON) {
            if (Recorder.state.value.recording) startHeartRate()
            return START_STICKY
        }
        starteVordergrund()
        Recorder.start(applicationContext)
        registerSensors()
        startHeartRate()
        startLocation()
        return START_STICKY
    }

    /**
     * Vordergrund-Dienst anmelden — mit dem Typ, den das System auch ERLAUBT.
     *
     * Ab targetSdk 34 prueft Android die Typen; fuer `health` verlangt Android 15/16 zusaetzlich
     * eine aus [ACTIVITY_RECOGNITION, HIGH_SAMPLING_RATE_SENSORS, health.READ_HEART_RATE, …].
     * `BODY_SENSORS` zaehlt dort NICHT mehr. Fehlt sie, wirft `startForeground` eine
     * SecurityException — und die App stirbt beim Druck auf START (Jans Wear-Emulator, 02.09.,
     * Android 16, nach unserem Wechsel auf targetSdk 36 am 30.08.).
     *
     * Deshalb hier zwei Vorkehrungen:
     *  1. `health` nur anmelden, wenn die Puls-Berechtigung wirklich erteilt ist.
     *  2. Und selbst dann abgesichert: scheitert es doch, laeuft der Dienst mit `location` weiter.
     *     Eine Aufnahme ohne Puls ist brauchbar — eine abgestuerzte App nicht.
     */
    private fun starteVordergrund() {
        val hatPuls =
            checkSelfPermission("android.permission.health.READ_HEART_RATE") == PackageManager.PERMISSION_GRANTED ||
            checkSelfPermission(android.Manifest.permission.BODY_SENSORS) == PackageManager.PERMISSION_GRANTED
        val nurOrt = ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
        val mitPuls = nurOrt or ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH
        try {
            startForeground(NOTIF_ID, notification(), if (hatPuls) mitPuls else nurOrt)
        } catch (e: SecurityException) {
            android.util.Log.w("Pumpfoil", "FGS-Typ health abgelehnt -> nur location", e)
            startForeground(NOTIF_ID, notification(), nurOrt)
        }
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
    /**
     * IM EMULATOR NICHT: der Sensor-Treiber der Emulator-Images (`goldfish::MultihalSensors`)
     * bricht mit `SIGABRT` ab, sobald ein Sensor aktiviert wird, den er nicht kennt —
     * `activationOnChangeSensorEvent: unexpected sensor type: 26` (= WRIST_TILT_GESTURE). Health
     * Services registriert beim Start einer Uebung genau solche Sensoren mit. Der Absturz trifft
     * den SENSOR-DIENST des Systems, und der reisst jeden Prozess mit, der gerade Sensoren nutzt:
     * unsere App war damit beim Druck auf START sofort weg, ohne eigene Exception (Jans
     * Emulator-Befund 02.09., Tombstone eindeutig).
     *
     * `Build.HARDWARE` ist bei allen Android-Emulatoren `ranchu` (aeltere: `goldfish`) — eine
     * echte Uhr meldet das nie. Auf ihr bleibt also alles wie es war.
     */
    private fun imEmulator(): Boolean =
        Build.HARDWARE == "ranchu" || Build.HARDWARE == "goldfish"

    private fun startHeartRate() {
        // START_STICKY: das System kann den Service mit leerem Intent neu starten. Dann laeuft die
        // Uebung schon — kein zweites Mal starten.
        if (hsClient != null) return
        if (imEmulator()) {
            // Kein Puls im Emulator — aber auch kein Absturz des Sensor-Dienstes (s. oben).
            android.util.Log.i("Pumpfoil", "Health Services im Emulator uebersprungen (Sensor-HAL bricht sonst ab)")
            return
        }
        hsDelivered = false
        try {
            val client = HealthServices.getClient(this).exerciseClient
            hsClient = client
            client.setUpdateCallback(object : ExerciseUpdateCallback {
                override fun onRegistered() {}
                override fun onRegistrationFailed(throwable: Throwable) {
                    hsClient = null
                    Recorder.setPulsMessung(false)
                    android.util.Log.w("Pumpfoil", "Health Services lehnt ab", throwable)
                }
                override fun onLapSummaryReceived(lapSummary: ExerciseLapSummary) {}
                override fun onAvailabilityChanged(dataType: DataType<*, *>, availability: Availability) {}
                override fun onExerciseUpdateReceived(update: ExerciseUpdate) {
                    // ZUSTAND ZUERST — bis 04.09. lasen wir nur die Messwerte. Endete die Uebung,
                    // lief die Aufnahme stumm weiter und der Puls kam nur noch aus dem passiven
                    // Sensor, der bloss mitliest, was das System ohnehin gerade misst. Ein Nutzer
                    // hat genau das gemeldet: in einer 81-Minuten-Session Luecken von 29, 28 und
                    // 9 Minuten, dazwischen sauber im Sekundentakt. Ob die Uhr untergetaucht war,
                    // eine andere App die Uebung uebernommen hat oder das System sie beendete,
                    // koennen wir nicht wissen — aber wir koennen es MERKEN und neu anfordern.
                    if (update.exerciseStateInfo.state.isEnded) {
                        android.util.Log.w("Pumpfoil",
                            "Puls-Uebung beendet (${update.exerciseStateInfo.state}) — neu anfordern")
                        hsClient = null
                        Recorder.setPulsMessung(false)
                        return
                    }
                    val points = update.latestMetrics.getData(DataType.HEART_RATE_BPM)
                    val bpm = points.lastOrNull()?.value?.toInt() ?: return
                    // 0 bedeutet bei Health Services "gerade kein Kontakt", kein Messwert.
                    if (bpm > 0) {
                        hsDelivered = true
                        letzterHsMs = System.currentTimeMillis()
                        Recorder.setPulsMessung(true)
                        Recorder.setHr(bpm)
                    }
                }
            })
            val config = ExerciseConfig.builder(ExerciseType.WORKOUT)
                .setDataTypes(setOf(DataType.HEART_RATE_BPM))
                .setIsAutoPauseAndResumeEnabled(false)
                .setIsGpsEnabled(false)
                .build()
            // Das Ergebnis NICHT wegwerfen: scheitert der Start — haeufigster Fall ist, dass eine
            // andere App gerade eine Uebung haelt, denn Health Services erlaubt nur eine —, fielen
            // wir bisher stumm auf den passiven Sensor zurueck.
            val start = client.startExerciseAsync(config)
            start.addListener({
                try {
                    start.get()
                    letzterHsMs = System.currentTimeMillis()
                    Recorder.setPulsMessung(true)
                } catch (t: Throwable) {
                    hsClient = null
                    Recorder.setPulsMessung(false)
                    android.util.Log.w("Pumpfoil", "Puls-Messung konnte nicht starten", t)
                }
            }, java.util.concurrent.Executors.newSingleThreadExecutor())
            starteWaechter()
        } catch (t: Throwable) {
            // Health Services nicht verfuegbar -> roher Sensor bleibt die einzige Quelle.
            hsClient = null
            Recorder.setPulsMessung(false)
            android.util.Log.w("Pumpfoil", "Health Services nicht verfuegbar", t)
        }
    }

    /**
     * Waechter: kommt laenger als PULS_STILL_MS kein Wert aus Health Services, wird die Uebung
     * neu angefordert.
     *
     * Warum ueberhaupt: die Messung kann aus Gruenden aufhoeren, die wir nicht sehen — die Uhr
     * taucht unter (kein Hautkontakt, nasses Display), eine andere App startet eine Uebung, das
     * System raeumt auf. Der gemeldete Fall (04.09.) hatte drei Luecken von 29, 28 und 9 Minuten
     * in einer Session, und niemand hat es bemerkt, weil der passive Sensor noch alle paar
     * Minuten einen Wert einstreute.
     *
     * Hoechstens PULS_MAX_NEUSTARTS Versuche: laeuft die Uhr in einen Zustand, in dem keine
     * Uebung moeglich ist (fremde App haelt sie dauerhaft), soll das nicht die ganze Aufnahme
     * lang alle zwei Minuten neu probieren.
     */
    private fun starteWaechter() {
        if (waechter != null) return
        val ex = java.util.concurrent.Executors.newSingleThreadScheduledExecutor()
        waechter = ex
        ex.scheduleWithFixedDelay({
            try {
                if (!Recorder.state.value.recording) return@scheduleWithFixedDelay
                val still = System.currentTimeMillis() - letzterHsMs
                if (letzterHsMs > 0 && still > PULS_STILL_MS && hsNeustarts < PULS_MAX_NEUSTARTS) {
                    hsNeustarts++
                    android.util.Log.w("Pumpfoil",
                        "Puls seit ${still / 1000} s still — Uebung neu anfordern ($hsNeustarts)")
                    Recorder.setPulsMessung(false)
                    stopHeartRate()
                    startHeartRate()
                }
            } catch (_: Throwable) {
                // Ein Waechter darf die Aufnahme nie stoppen.
            }
        }, 60, 60, java.util.concurrent.TimeUnit.SECONDS)
    }

    private fun stopHeartRate() {
        val client = hsClient ?: return
        hsClient = null
        hsDelivered = false
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
        waechter?.shutdownNow(); waechter = null
        hsNeustarts = 0; letzterHsMs = 0L
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
        // Weg zurueck in die App. Ohne den gab es keinen: landet die Uhr auf dem Watchface —
        // weil der Nutzer die Seitentaste drueckt, ein Anruf kommt oder "Always-on Display" in
        // den Systemeinstellungen aus ist —, half nur noch der App-Starter, waehrend im
        // Hintergrund weiter aufgezeichnet wurde (Nutzermeldung 27.08., Galaxy Watch).
        // REORDER_TO_FRONT holt die LAUFENDE Activity nach vorn, statt eine zweite zu starten.
        val zurueck = PendingIntent.getActivity(
            this, 0,
            // NEW_TASK ist Pflicht: der PendingIntent wird vom SYSTEM ausgeloest, nicht aus einer
            // Activity heraus — ohne das Flag startet die Activity nicht. Genau das hat ein
            // Wear-Entwickler am 04.09. gemeldet („the Ongoing Activity didn't link back to the
            // workout tracking activity"). SINGLE_TOP + REORDER_TO_FRONT holen die LAUFENDE
            // Activity nach vorn, statt eine zweite zu starten.
            Intent(this, MainActivity::class.java).setFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val b = NotificationCompat.Builder(this, ch)
            .setContentTitle("Pumpfoil")
            .setContentText(I18n.t("rec.recording"))
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_WORKOUT)
            .setContentIntent(zurueck)
        // Ongoing Activity ist der Wear-Weg dafuer: solange aufgezeichnet wird, sitzt ein Chip
        // auf dem Watchface, der mit einem Tipp zurueckfuehrt. Ambient (Always-on) verhindert den
        // Sprung aufs Watchface nur, solange der Nutzer Always-on ueberhaupt eingeschaltet hat —
        // dieser Chip greift auch dann, wenn nicht.
        OngoingActivity.Builder(applicationContext, NOTIF_ID, b)
            .setStaticIcon(android.R.drawable.ic_media_play)
            .setTouchIntent(zurueck)
            .setStatus(Status.Builder().addTemplate(I18n.t("rec.recording")).build())
            .build()
            .apply(applicationContext)
        return b.build()
    }

    companion object {
        /** Muss zwischen startForeground und OngoingActivity dieselbe sein. */
        const val NOTIF_ID = 1
        const val ACTION_STOP = "org.pumpfoil.watch.STOP"
        const val ACTION_DISCARD = "org.pumpfoil.watch.DISCARD"
        const val ACTION_HR_ON = "org.pumpfoil.watch.HR_ON"
        /** Solange darf die Puls-Messung stillstehen, bevor wir sie neu anfordern. */
        const val PULS_STILL_MS = 120_000L
        const val PULS_MAX_NEUSTARTS = 8
        fun start(ctx: Context) = ctx.startForegroundService(Intent(ctx, RecorderService::class.java))
        /** Puls nachtraeglich anhaengen (Berechtigung waehrend der Aufnahme erteilt). */
        fun enableHeartRate(ctx: Context) = ctx.startService(
            Intent(ctx, RecorderService::class.java).setAction(ACTION_HR_ON))
        fun stop(ctx: Context) = ctx.startService(
            Intent(ctx, RecorderService::class.java).setAction(ACTION_STOP))
        fun discard(ctx: Context) = ctx.startService(
            Intent(ctx, RecorderService::class.java).setAction(ACTION_DISCARD))
    }
}
