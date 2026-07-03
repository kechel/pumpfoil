plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "org.pumpfoil.watch"
    compileSdk = 34

    defaultConfig {
        // Gleiche applicationId wie die Phone-App: Voraussetzung für den Wearable
        // Data Layer (Token-Push Phone->Watch). namespace bleibt org.pumpfoil.watch.
        applicationId = "org.pumpfoil.app"
        minSdk = 30          // Wear OS 3
        targetSdk = 34
        // Versionsschema zur klaren Trennung im Play-Console (Phone + Wear teilen die
        // applicationId): WEAR = versionName 1.2.x + versionCode 1xxx; PHONE = 1.1.x + kleiner Code.
        // Das „x" (letzte Ziffer) ist bei Phone und Wear IMMER gleich -> beide je Release-Runde
        // gemeinsam hochzählen. -> „1.2." / 1xxx = Wear, „1.1." / kleine Zahl = Phone.
        versionCode = 1013
        versionName = "1.2.2"
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
    implementation("androidx.wear.compose:compose-material:1.3.1")
    implementation("androidx.wear.compose:compose-foundation:1.3.1")
    implementation("androidx.lifecycle:lifecycle-service:2.8.3")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.3")
    implementation("com.google.android.gms:play-services-location:21.3.0")
    implementation("com.google.android.gms:play-services-wearable:18.1.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
}
