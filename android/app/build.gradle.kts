import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.serialization")
}

// API-Basis-URL. Committet ist IMMER Produktion (auch für Debug-Builds) -> `git pull` +
// bauen ergibt nie versehentlich eine Dev-URL. Wer lokal gegen einen eigenen Server testet
// (z. B. Emulator -> 10.0.2.2), setzt `apiBase=http://10.0.2.2:8090` in local.properties
// (gitignored, kann nicht committet/gepullt werden). Greift NUR im Debug-Build.
val PROD_API = "https://pumpfoil.org"
val localApiBase: String = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}.getProperty("apiBase") ?: PROD_API

android {
    namespace = "org.pumpfoil.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "org.pumpfoil.app"
        minSdk = 26
        // Ab 31.08.2026 nimmt Google Play nur noch Updates an, die hoechstens ein Jahr hinter
        // der neuesten Android-Version liegen — API 36 (Android 16). Geprueft, was daran haengt:
        // Edge-to-Edge wird ab 36 erzwungen (wir rufen enableEdgeToEdge() ohnehin schon),
        // Ausrichtungs-Sperren werden auf grossen Displays ignoriert (wir sperren keine),
        // Predictive Back ist Standard (Compose-BackHandler traegt das mit), und die
        // 16-KB-Seitengroesse betrifft nur Apps mit nativen Bibliotheken (wir haben keine).
        targetSdk = 36
        // Versionsschema (siehe wear/build.gradle.kts): PHONE = versionName 1.1.x + kleiner
        // versionCode; WEAR = 1.2.x + 1xxx. Das „x" ist bei beiden gleich (gemeinsam hochzählen).
        // 1.1.22/36: Paritaets-Rueckstand zur PWA abgearbeitet (docs/PARITY-AUDIT.md,
        // 9 Punkte). Der Sprung ueber die noch nicht freigegebene 1.1.21 ist Absicht — Play
        // hat sie schon, ein zweites Einreichen derselben Nummer geht nicht.
        // Nebeneffekt: das „x" stimmt damit wieder mit WEAR (1.2.22) zusammen.
        versionCode = 39
        versionName = "1.1.25"
    }
    buildFeatures { compose = true; buildConfig = true }
    composeOptions { kotlinCompilerExtensionVersion = "1.5.14" }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            buildConfigField("String", "API_BASE", "\"$PROD_API\"")   // Release: IMMER Produktion
        }
        debug {
            buildConfigField("String", "API_BASE", "\"$localApiBase\"")  // Default Prod; lokal per local.properties überschreibbar
        }
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.06.00"))
    implementation("androidx.compose.runtime:runtime")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material")            // nur für pullRefresh (M3 1.2 hat's noch nicht)
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.activity:activity-compose:1.9.0")
    // Nur damit Lint die Version SIEHT. Aufgeloest wurde ohnehin schon 1.5.7, aber im
    // Abhaengigkeitsgraphen steht ueber eine Transitive noch `fragment:1.0.0` — und
    // `InvalidFragmentVersionForActivityResult` (Lint, seit AGP 8.9 scharf beim Release-Bau)
    // liest die Version VOR der Aufloesung und bricht den Release ab: "you must upgrade your
    // Fragment version to 1.3.0". Ein Fehlalarm, aber er blockiert `bundleRelease`. Explizit
    // deklariert ist er weg — ohne die Pruefung abzuschalten und ohne Verhaltensaenderung.
    implementation("androidx.fragment:fragment:1.5.7")
    implementation("androidx.core:core-splashscreen:1.0.1")
    implementation("androidx.navigation:navigation-compose:2.7.7")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.8.1")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")
    implementation("com.google.android.gms:play-services-wearable:18.1.0")
    implementation("androidx.wear:wear-remote-interactions:1.0.0")   // Play Store auf der Uhr öffnen
    implementation("com.google.android.play:review:2.0.2")           // In-App-Review-Overlay (bleibt in der App)
    implementation("org.osmdroid:osmdroid-android:6.1.18")   // FLOSS-Karte (OSM) für Spots
    implementation("io.coil-kt:coil-compose:2.6.0")          // Async-Bildladen (Fotos)
    implementation("androidx.credentials:credentials:1.3.0")                 // „Mit Google anmelden"
    implementation("androidx.credentials:credentials-play-services-auth:1.3.0")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.1.1")
    testImplementation("junit:junit:4.13.2")
}
