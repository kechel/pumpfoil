package org.pumpfoil.app

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.ClickableText
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage

// Anleitung fuer die Uhr — bisher gab es die NUR in der Web-App (Tab "Anleitung", 98
// guide.*-Schluessel); die nativen Apps hatten davon keinen einzigen. Dieser Bildschirm bringt
// die beiden Teile, an denen Nutzer wirklich haengenbleiben:
//   1. der Weg auf die Garmin (die Uhr-App kommt aus dem Connect IQ Store, nicht aus dem Store
//      des Handys) — genau daran ist am 27.08. ein Nutzer gescheitert,
//   2. "wann laedt die Uhr eigentlich hoch?" — die haeufigste Supportfrage: Session fehlt,
//      liegt aber noch auf der Uhr und geht beim naechsten App-Start raus.
// Die Texte sind dieselben wie im Web (aus den Web-Locales uebernommen), damit ein Satz nicht an
// zwei Stellen unterschiedlich lautet.
// Seit 04.11.2026 derselbe Aufbau wie web/src/components/WatchGuide.tsx: Plattform-Reiter (Garmin | Apple Watch |
// Wear OS | Amazfit | Huawei | Kompatibilitaet), darunter je Plattform Schritte, Store-Link und Vorschaubilder, dann die
// gemeinsamen Karten Verbinden / Einstellungen an der Uhr / Hochladen. Die Bilder kommen vom Server (dieselben Pfade
// wie im Web), damit es sie nur einmal gibt.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GuideScreen(onBack: () -> Unit) {
    Scaffold(topBar = {
        TopAppBar(
            title = { Text(I18n.t("guide.howto")) },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null)
                }
            },
            actions = { FeedbackKnopf() },
        )
    }) { pad ->
        Column(
            Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)
        ) { UhrAnleitung(onConnect = null) }
    }
}

// Store-Adressen wie im Web (StoreBadge.tsx, WatchMatrix.tsx); CONNECT_IQ_URL steht in GarminPairScreen.kt.
private const val APP_STORE_URL = "https://apps.apple.com/app/id6783975714"
private const val PLAY_URL = "https://play.google.com/store/apps/details?id=org.pumpfoil.app"
private const val ZEPP_IOS_URL = "https://apps.apple.com/app/id1127269366"
private const val ZEPP_ANDROID_URL = "https://play.google.com/store/apps/details?id=com.huami.watch.hmwatchmanager"
private const val APPGALLERY_URL = "https://appgallery.huawei.com/app/detail?id=org.pumpfoil.huawei"

/** Ein Vorschaubild: Pfad beim Server + Bildunterschrift; `eckig` = abgerundete Ecken statt Kreis. */
private class Bild(val pfad: String, val cap: String, val eckig: Boolean = false)

private val GARMIN_BILDER = listOf(
    Bild("/guide/garmin/start.webp", "guide.cap.gStart"), Bild("/guide/garmin/settings.webp", "guide.cap.gSettings"),
    Bild("/guide/garmin/pairing-code.webp", "guide.cap.gPairCode"), Bild("/guide/garmin/pairing-success.webp", "guide.cap.gPairOk"),
    Bild("/guide/garmin/alarm-1.webp", "guide.cap.gAlarm1"), Bild("/guide/garmin/alarm-2.webp", "guide.cap.gAlarm2"),
    Bild("/guide/garmin/alarm-3.webp", "guide.cap.gAlarm3"), Bild("/guide/garmin/on-foil-1.webp", "guide.cap.onFoil"),
    Bild("/guide/garmin/on-foil-2.webp", "guide.cap.onFoil"),
)
private val WEAR_BILDER = listOf(
    Bild("/guide/wear/connect.webp", "guide.cap.wConnect"), Bild("/guide/wear/start.webp", "guide.cap.wStart"),
    Bild("/guide/wear/alarm.webp", "guide.cap.wAlarm"), Bild("/guide/wear/data.webp", "guide.cap.onFoil"),
    Bild("/guide/wear/stats.webp", "guide.cap.wStats"), Bild("/guide/wear/run.webp", "guide.cap.wRun"),
    Bild("/guide/wear/stop.webp", "guide.cap.wStop"),
)
private val APPLE_BILDER = listOf(
    Bild("/guide/apple/connect.webp", "guide.cap.aConnect", true), Bild("/guide/apple/code.webp", "guide.cap.aCode", true),
    Bild("/guide/apple/start.webp", "guide.cap.aStart", true), Bild("/guide/apple/alarm.webp", "guide.cap.aAlarm", true),
    Bild("/guide/apple/data-1.webp", "guide.cap.onFoil", true), Bild("/guide/apple/data-2.webp", "guide.cap.onFoil", true),
    Bild("/guide/apple/stop.webp", "guide.cap.aStop", true), Bild("/guide/apple/upload.webp", "guide.cap.aUpload", true),
)
private val AMAZFIT_BILDER = listOf(
    Bild("/guide/amazfit/pair-code.webp", "guide.cap.gPairCode", true), Bild("/guide/amazfit/pair-ok.webp", "guide.cap.gPairOk", true),
    Bild("/watch-amazfit-v2-7.webp", "guide.cap.wStart"), Bild("/watch-amazfit-v2-1.webp", "guide.cap.onFoil"),
    Bild("/watch-amazfit-v2-2.webp", "guide.cap.onFoil"), Bild("/watch-amazfit-v2-3.webp", "guide.cap.onFoil"),
    Bild("/watch-amazfit-v2-6.webp", "guide.cap.wRun"), Bild("/watch-amazfit-v2-8.webp", "guide.cap.wStats"),
    Bild("/watch-amazfit-v2-4.webp", "guide.cap.wStop"),
)
private val HUAWEI_BILDER = listOf(
    Bild("/guide/huawei/connect.webp", "guide.cap.wConnect"), Bild("/guide/huawei/start.webp", "guide.cap.wStart"),
    Bild("/guide/huawei/data-1.webp", "guide.cap.onFoil"), Bild("/guide/huawei/data-2.webp", "guide.cap.onFoil"),
    Bild("/guide/huawei/run.webp", "guide.cap.wRun"), Bild("/guide/huawei/stop.webp", "guide.cap.wStop"),
    Bild("/guide/huawei/upload.webp", "guide.cap.aUpload"),
)

/**
 * Die Anleitung ohne Titelzeile und ohne eigenes Scrollen — Reiter „Anleitung" im Uhr-Bereich (WatchScreen.kt) und
 * Inhalt der eigenen Seite (Route guide). `onConnect` schaltet auf „Meine Uhr(en)"; null = der Verweis steht nur als Text.
 */
@Composable
fun UhrAnleitung(onConnect: (() -> Unit)?) {
    val reiter = listOf(
        ReiterDef("garmin", "Garmin"), ReiterDef("apple", "Apple Watch"), ReiterDef("wear", "Wear OS"),
        ReiterDef("amazfit", "Amazfit"), ReiterDef("huawei", "Huawei"), ReiterDef("compat", I18n.t("account.tabCompat")),
    )
    var sel by rememberReiter("uhrguide", reiter.map { it.id }, "garmin")
    val verbinden = Seg(I18n.t("guide.connect"), fett = true, verbinden = true)
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Reiterleiste(reiter, sel, { sel = it })
        when (sel) {
            "compat" -> Kompatibilitaet()
            "garmin" -> Karte("Garmin", I18n.t("guide.garminSub")) {
                StoreKasten(I18n.t("guide.g.storeLead")) { StoreKnopf(I18n.t("guide.g.storeCta"), CONNECT_IQ_URL) }
                Text(I18n.t("guide.g.manualLead"), style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 12.dp, bottom = 6.dp))
                // Schritt 1 fuehrt im Web auf den Download-Reiter (/account?tab=app) — den hat die App nicht, also dorthin im Browser.
                Satz(1, listOf(Seg(I18n.t("guide.g.s1Title"), fett = true), Seg(" " + I18n.t("guide.g.s1a") + " "),
                    Seg(I18n.t("guide.g.s1Download"), fett = true, url = Api.BASE + "/account?tab=app"),
                    Seg(" " + I18n.t("guide.g.s1b") + " "), Seg("OpenMTP", fett = true, url = "https://openmtp.ganeshrvel.com/"),
                    Seg(" " + I18n.t("guide.g.s1c") + " "), Seg("GARMIN/APPS/", mono = true), Seg(" " + I18n.t("guide.g.s1d"))), onConnect)
                Satz(2, titelText("guide.g.s2Title", "guide.g.s2"), onConnect)
                Satz(3, listOf(Seg(I18n.t("guide.g.s3Title"), fett = true), Seg(" "), verbinden, Seg(" " + I18n.t("guide.g.s3"))), onConnect)
                Satz(4, titelText("guide.g.s4Title", "guide.g.s4"), onConnect)
                Satz(5, titelText("guide.g.s5Title", "guide.g.s5"), onConnect)
                Satz(6, titelText("guide.g.s6Title", "guide.g.s6"), onConnect)
                Vorschau(I18n.t("guide.previewVer"), GARMIN_BILDER)
            }
            "apple" -> Karte("Apple Watch", I18n.t("guide.appleSub")) {
                StoreKnopf("App Store", APP_STORE_URL)
                Satz(1, titelText("guide.a.s1Title", "guide.a.s1"), onConnect)
                Satz(2, listOf(Seg(I18n.t("guide.a.s2Title"), fett = true), Seg(" " + I18n.t("guide.a.s2a") + " "), verbinden,
                    Seg(" " + I18n.t("guide.a.s2b"))), onConnect)
                Satz(3, titelText("guide.a.s3Title", "guide.a.s3"), onConnect)
                Satz(4, titelText("guide.a.s4Title", "guide.a.s4"), onConnect)
                Vorschau(I18n.t("guide.preview"), APPLE_BILDER)
            }
            "wear" -> Karte("Wear OS", I18n.t("guide.wearSub")) {
                StoreKnopf("Google Play", PLAY_URL)
                Satz(1, titelText("guide.w.s1Title", "guide.w.s1"), onConnect)
                // Handy- und Uhr-App teilen die applicationId: wer am Handy installiert, wartet vergeblich auf die Uhr.
                Text(I18n.t("guide.w.s1Note"), style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.tertiary, modifier = Modifier.padding(start = 18.dp, bottom = 8.dp))
                Satz(2, listOf(Seg(I18n.t("guide.w.s2Title"), fett = true), Seg(" " + I18n.t("guide.w.s2a") + " "), verbinden,
                    Seg(" " + I18n.t("guide.w.s2b"))), onConnect)
                Satz(3, titelText("guide.w.s3Title", "guide.w.s3"), onConnect)
                Satz(4, titelText("guide.w.s4Title", "guide.w.s4"), onConnect)
                Vorschau(I18n.t("guide.preview"), WEAR_BILDER)
            }
            "amazfit" -> Karte("Amazfit", I18n.t("guide.amazfitSub")) {
                // Einen Web-Store fuer einzelne Zepp-OS-Apps gibt es nicht: erst die Zepp-App, darin „Pumpfoil".
                StoreKasten(I18n.t("guide.z.store")) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        StoreKnopf("Zepp · iOS", ZEPP_IOS_URL)
                        StoreKnopf("Zepp · Android", ZEPP_ANDROID_URL)
                    }
                    Text("Zepp App → „Pumpfoil\"", style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Spacer(Modifier.height(8.dp))
                Satz(1, listOf(Seg(I18n.t("guide.z.s1"))), onConnect)
                Satz(2, listOf(Seg(I18n.t("guide.z.s2"))), onConnect)
                Satz(3, listOf(Seg(I18n.t("guide.z.s3") + " "), verbinden), onConnect)
                Satz(4, listOf(Seg(I18n.t("guide.z.s4"))), onConnect)
                Vorschau(I18n.t("guide.preview"), AMAZFIT_BILDER)
            }
            "huawei" -> Karte("HUAWEI WATCH 5", I18n.t("guide.huaweiSub")) {
                StoreKnopf("AppGallery → „Pumpfoil\"", APPGALLERY_URL)
                Satz(1, listOf(Seg(I18n.t("guide.h.s1"))), onConnect)
                Satz(2, listOf(Seg(I18n.t("guide.h.s2") + " "), verbinden), onConnect)
                Satz(3, listOf(Seg(I18n.t("guide.h.s3"))), onConnect)
                Satz(4, listOf(Seg(I18n.t("guide.h.s4"))), onConnect)
                Vorschau(I18n.t("guide.preview"), HUAWEI_BILDER)
            }
        }
        if (sel != "compat") {
            // Plattformuebergreifend: Verbinden, was sich an der Uhr einstellen laesst, wann die Uhr hochlaedt.
            Karte(I18n.t("guide.pair.title"), I18n.t("guide.pair.intro")) {
                Satz(null, titelText("guide.pair.autoTitle", "guide.pair.auto"), onConnect)
                Satz(null, listOf(Seg(I18n.t("guide.pair.codeTitle"), fett = true), Seg(" " + I18n.t("guide.pair.code") + " "), verbinden), onConnect)
                Satz(null, titelText("guide.pair.relinkTitle", "guide.pair.relink"), onConnect)
                Hinweis(I18n.t("guide.pair.note"))
            }
            Karte(I18n.t("guide.settings.title"), null) {
                Satz(null, listOf(Seg(I18n.t("guide.settings.intro") + " "), verbinden, Seg(" " + I18n.t("guide.settings.intro2"))), onConnect)
                Satz(null, titelText("guide.settings.recordTitle", "guide.settings.record"), onConnect)
                Satz(null, titelText("guide.settings.gnssTitle", "guide.settings.gnss"), onConnect)
                Text(I18n.t("guide.settings.gpsWarn"), style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onTertiaryContainer,
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp))
                        .background(MaterialTheme.colorScheme.tertiaryContainer).padding(10.dp))
                Spacer(Modifier.height(8.dp))
                Hinweis(I18n.t("guide.settings.zepp"))
            }
            Karte(I18n.t("guide.sync.title"), null) {
                Satz(null, titelText("guide.sync.nowTitle", "guide.sync.now"), onConnect)
                Satz(null, titelText("guide.sync.retryTitle", "guide.sync.retry"), onConnect)
                Satz(null, titelText("guide.sync.laterTitle", "guide.sync.later"), onConnect)
                Hinweis(I18n.t("guide.sync.note"))
            }
        }
    }
}

/** Ein Stueck Satz: fett, Link nach draussen (`url`), Verweis auf „Meine Uhr(en)" (`verbinden`) oder Festbreite. */
private class Seg(val text: String, val fett: Boolean = false, val url: String? = null,
                  val verbinden: Boolean = false, val mono: Boolean = false)

private fun titelText(titel: String, text: String) = listOf(Seg(I18n.t(titel), fett = true), Seg(" " + I18n.t(text)))

@Composable
private fun Karte(titel: String, untertitel: String?, inhalt: @Composable () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text(titel, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary)
            if (untertitel != null) Text(untertitel, style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
            Spacer(Modifier.height(10.dp))
            inhalt()
        }
    }
}

/** Ein Schritt (nummeriert, wenn `nr` gesetzt) mit Links im Satz wie im Web. */
@Composable
private fun Satz(nr: Int?, teile: List<Seg>, onConnect: (() -> Unit)?) {
    val ctx = LocalContext.current
    val farben = MaterialTheme.colorScheme
    val text = buildAnnotatedString {
        if (nr != null) withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append("$nr. ") }
        teile.forEach { t ->
            val link = t.url != null || (t.verbinden && onConnect != null)
            val stil = SpanStyle(
                fontWeight = if (t.fett) FontWeight.SemiBold else null,
                fontFamily = if (t.mono) FontFamily.Monospace else null,
                color = if (link) farben.primary else androidx.compose.ui.graphics.Color.Unspecified,
                textDecoration = if (link) TextDecoration.Underline else null,
            )
            if (link) pushStringAnnotation("ziel", t.url ?: "verbinden")
            withStyle(stil) { append(t.text) }
            if (link) pop()
        }
    }
    ClickableText(text, style = MaterialTheme.typography.bodyMedium.copy(color = farben.onSurface),
        modifier = Modifier.padding(bottom = 10.dp)) { pos ->
        val ziel = text.getStringAnnotations("ziel", pos, pos).firstOrNull()?.item ?: return@ClickableText
        if (ziel == "verbinden") onConnect?.invoke()
        else try { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(ziel))) } catch (_: Exception) {}
    }
}

@Composable
private fun Hinweis(text: String) {
    Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

/** Hinterlegter Kasten mit Satz und Store-Knopf (Web: brand-Rahmen um Store-Badge). */
@Composable
private fun StoreKasten(text: String, knoepfe: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surfaceVariant).padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(text, style = MaterialTheme.typography.bodyMedium)
        knoepfe()
    }
}

/** Store-Link als schlichter Knopf — die Store-Badges des Webs gibt es in der App nicht als Bild. */
@Composable
private fun StoreKnopf(text: String, url: String) {
    val ctx = LocalContext.current
    OutlinedButton(onClick = {
        try { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } catch (_: Exception) {}
    }) { Text(text) }
}

/** Vorschaubilder im Raster zu drei, geladen vom Server (Coil), rund oder mit abgerundeten Ecken wie im Web. */
@Composable
private fun Vorschau(titel: String, bilder: List<Bild>) {
    Text(titel, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(top = 8.dp, bottom = 8.dp))
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        bilder.chunked(3).forEach { zeile ->
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                zeile.forEach { b ->
                    Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                        AsyncImage(model = Api.BASE + b.pfad, contentDescription = I18n.t(b.cap), contentScale = ContentScale.FillWidth,
                            modifier = Modifier.fillMaxWidth().clip(if (b.eckig) RoundedCornerShape(14.dp) else CircleShape))
                        Text(I18n.t(b.cap), style = MaterialTheme.typography.labelSmall, textAlign = TextAlign.Center,
                            color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
                    }
                }
                repeat(3 - zeile.size) { Box(Modifier.weight(1f)) }
            }
        }
    }
}

// --- Kompatibilitaet (web/src/components/WatchMatrix.tsx) ---

private enum class Kann { JA, TEILS, NEIN }

/** Eine Zeile der Uhren-Matrix. `store`/`zepp`/`konto`/`weg` bestimmen die Status-Zeile wie im Web. */
private class Uhrzeile(
    val name: String, val sub: String?, val subKey: String? = null, val gps: Kann, val hr: Kann, val pump: Kann,
    val status: String, val noteKey: String, val store: Pair<String, String>? = null, val zepp: Boolean = false,
    val konto: String? = null, val weg: Pair<String, String>? = null,
)

private val UHRZEILEN = listOf(
    Uhrzeile("Garmin", "Connect IQ · Fenix, Forerunner, Epix …", gps = Kann.JA, hr = Kann.JA, pump = Kann.JA, status = "avail",
        noteKey = "watches.nGarmin", store = "Connect IQ Store" to CONNECT_IQ_URL),
    Uhrzeile("Apple Watch", "watchOS", gps = Kann.JA, hr = Kann.JA, pump = Kann.JA, status = "avail",
        noteKey = "watches.nApple", store = "App Store" to APP_STORE_URL),
    Uhrzeile("Wear OS", "Samsung Galaxy, Google Pixel, TicWatch …", gps = Kann.JA, hr = Kann.JA, pump = Kann.JA, status = "avail",
        noteKey = "watches.nWear", store = "Google Play" to PLAY_URL),
    Uhrzeile("Amazfit", "Zepp OS", gps = Kann.JA, hr = Kann.JA, pump = Kann.TEILS, status = "avail",
        noteKey = "watches.nAmazfit", zepp = true),
    Uhrzeile("Huawei Watch 5", "HarmonyOS 5/6 · AppGallery", gps = Kann.JA, hr = Kann.JA, pump = Kann.JA, status = "avail",
        noteKey = "watches.nHuaweiW5", weg = "AppGallery → „Pumpfoil\"" to APPGALLERY_URL),
    Uhrzeile("Huawei", "Lite Wearable (GT 3–7, Fit 2–5, D2)", gps = Kann.JA, hr = Kann.JA, pump = Kann.TEILS, status = "planned",
        noteKey = "watches.nHuawei"),
    Uhrzeile("Polar", "Vantage, Grit X …", gps = Kann.JA, hr = Kann.JA, pump = Kann.NEIN, status = "import",
        noteKey = "watches.nPolar", konto = "watches.linkAccount"),
    Uhrzeile("Suunto", "Race, Vertical …", gps = Kann.JA, hr = Kann.JA, pump = Kann.NEIN, status = "import",
        noteKey = "watches.nSuunto", konto = "watches.linkAccount"),
    Uhrzeile("Xiaomi", "Redmi Watch, Watch S …", gps = Kann.JA, hr = Kann.JA, pump = Kann.NEIN, status = "import",
        noteKey = "watches.nXiaomi", konto = "watches.linkViaSuunto"),
    Uhrzeile("COROS", "Apex, Vertix …", gps = Kann.JA, hr = Kann.JA, pump = Kann.NEIN, status = "import",
        noteKey = "watches.nSuunto", konto = "watches.linkAccount"),
    Uhrzeile("Fitbit", "—", gps = Kann.NEIN, hr = Kann.NEIN, pump = Kann.NEIN, status = "no", noteKey = "watches.nFitbit"),
    Uhrzeile("Strava", null, subKey = "watches.subStrava", gps = Kann.JA, hr = Kann.JA, pump = Kann.NEIN, status = "nope",
        noteKey = "watches.nStrava"),
)

/** Welche Uhr liefert welche Daten — auf dem Handy als Karten wie die Mobil-Ansicht im Web. */
@Composable
private fun Kompatibilitaet() {
    val farben = MaterialTheme.colorScheme
    @Composable
    fun zeichen(k: Kann) = Text(when (k) { Kann.JA -> "✓"; Kann.TEILS -> "~"; Kann.NEIN -> "–" },
        fontWeight = FontWeight.Bold,
        color = when (k) { Kann.JA -> farben.primary; Kann.TEILS -> farben.tertiary; Kann.NEIN -> farben.onSurfaceVariant })
    Karte(I18n.t("watches.title"), I18n.t("watches.intro")) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            UHRZEILEN.forEach { r ->
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(farben.surfaceVariant).padding(12.dp)) {
                    Text(r.name, fontWeight = FontWeight.SemiBold)
                    Text(r.subKey?.let { I18n.t(it) } ?: r.sub.orEmpty(), style = MaterialTheme.typography.bodySmall,
                        color = farben.onSurfaceVariant)
                    Text(I18n.t(r.noteKey), style = MaterialTheme.typography.bodySmall, color = farben.onSurfaceVariant,
                        modifier = Modifier.padding(top = 2.dp))
                    Row(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        listOf("watches.colGps" to r.gps, "watches.colHr" to r.hr, "watches.colPump" to r.pump).forEach { (k, v) ->
                            Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                                Text(I18n.t(k), style = MaterialTheme.typography.bodyMedium); zeichen(v)
                            }
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    when {
                        r.zepp -> Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            StoreKnopf("Zepp · iOS", ZEPP_IOS_URL); StoreKnopf("Zepp · Android", ZEPP_ANDROID_URL)
                        }
                        r.store != null -> StoreKnopf(r.store.first, r.store.second)
                        r.konto != null -> Text("✓ " + I18n.t(r.konto), style = MaterialTheme.typography.bodySmall,
                            color = farben.onSurfaceVariant)
                        else -> {
                            Text(I18n.t("watches.st.${r.status}"), style = MaterialTheme.typography.labelMedium,
                                color = if (r.status == "no" || r.status == "nope") farben.error else farben.primary)
                            r.weg?.let { (text, url) -> Satz(null, listOf(Seg(text, url = url)), null) }
                        }
                    }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Row { zeichen(Kann.JA); Text(" " + I18n.t("watches.legYes"), style = MaterialTheme.typography.bodySmall) }
                Row { zeichen(Kann.TEILS); Text(" " + I18n.t("watches.legPartial"), style = MaterialTheme.typography.bodySmall) }
                Row { zeichen(Kann.NEIN); Text(" " + I18n.t("watches.legNo"), style = MaterialTheme.typography.bodySmall) }
            }
            Hinweis(I18n.t("watches.foot"))
        }
    }
}
