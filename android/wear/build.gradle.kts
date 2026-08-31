plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "org.pumpfoil.watch"
    compileSdk = 36

    defaultConfig {
        // Gleiche applicationId wie die Phone-App: Voraussetzung für den Wearable
        // Data Layer (Token-Push Phone->Watch). namespace bleibt org.pumpfoil.watch.
        applicationId = "org.pumpfoil.app"
        minSdk = 30          // Wear OS 3
        targetSdk = 36       // Google-Play-Vorgabe: ab 31.08.2026 nimmt Play nur noch Updates
                             // an, die hoechstens ein Jahr hinter der neuesten Android-Version
                             // liegen — das ist API 36 (Android 16). Vorher stand hier 35.
        // Versionsschema zur klaren Trennung im Play-Console (Phone + Wear teilen die
        // applicationId): WEAR = versionName 1.2.x + versionCode 1xxx; PHONE = 1.1.x + kleiner Code.
        // Das „x" (letzte Ziffer) ist bei Phone und Wear IMMER gleich -> beide je Release-Runde
        // gemeinsam hochzählen. -> „1.2." / 1xxx = Wear, „1.1." / kleine Zahl = Phone.
        // 1.2.21 war zuerst ein Wear-only-Nachzug (Token-Selbstheilung bei Config-401); mit dem
        // Teilen-Dialog-Fix ist das Phone auf 1.1.21/35 nachgezogen -> „x gleich" gilt wieder.
        // 1.2.22 ist wieder ein Wear-only-Nachzug (Puls ueber Health Services): 1.2.21/1031 lag
        // beim Fund schon in der Play-Pruefung, deshalb der eigene Bump statt einer Ergaenzung.
        versionCode = 1035
        versionName = "1.2.25"
    }
    buildFeatures { compose = true }
    composeOptions { kotlinCompilerExtensionVersion = "1.5.14" }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildTypes {
        release { isMinifyEnabled = false }
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.06.00"))
    implementation("androidx.compose.runtime:runtime")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.activity:activity-compose:1.9.0")
    // ECHTER Befund, kein Fehlalarm (Lint `InvalidFragmentVersionForActivityResult`, aufgefallen
    // beim ersten Release-Bau gegen API 36): das Wear-Modul loeste `androidx.fragment` auf 1.2.4
    // auf — unter der von den ActivityResult-APIs geforderten 1.3.0. Genau diese alten Versionen
    // riefen `super.onRequestPermissionsResult()` NICHT auf und benutzten ungueltige Request-Codes;
    // MainActivity holt darueber die Standort-/Sensor-Berechtigungen (registerForActivityResult).
    // Auf 1.5.7 gehoben, dieselbe Version wie in :app.
    implementation("androidx.fragment:fragment:1.5.7")
    implementation("androidx.wear.compose:compose-material:1.3.1")
    implementation("androidx.wear.compose:compose-foundation:1.3.1")
    // Ambient-Modus (Always-on-Anzeige waehrend der Aufnahme): AmbientLifecycleObserver.
    // Ohne das zeigt die Uhr mitten im Lauf das Watchface statt unserer Zahlen — Garmin und
    // Apple stehen dort vorn, Wear fiel als einzige Plattform heraus.
    implementation("androidx.wear:wear:1.3.0")
    // Ongoing Activity: Chip auf dem Watchface, solange aufgezeichnet wird -> ein Tipp fuehrt
    // zurueck in die App. Ohne das kommt man vom Watchface nur ueber den App-Starter zurueck.
    implementation("androidx.wear:wear-ongoing:1.0.0")
    implementation("androidx.lifecycle:lifecycle-service:2.8.3")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.3")
    // Puls AKTIV messen statt nur den rohen Sensor mitzulesen (s. RecorderService.startHeartRate).
    implementation("androidx.health:health-services-client:1.0.0")
    // Health Services gibt `ListenableFuture` zurueck, zieht guava aber nur zur LAUFZEIT nach ->
    // ohne diese Zeile fehlt die Klasse im Compile-Classpath. Genau die Version nehmen, die
    // health-services ohnehin mitbringt (31.1-android), sonst liegt sie doppelt im Dex.
    // Der naheliegende Umweg ueber `com.google.guava:listenablefuture:1.0` funktioniert NICHT:
    // guava enthaelt dieselbe Klasse -> `checkDebugDuplicateClasses` schlaegt fehl.
    implementation("com.google.guava:guava:31.1-android")
    implementation("com.google.android.gms:play-services-location:21.3.0")
    implementation("com.google.android.gms:play-services-wearable:18.1.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
}
