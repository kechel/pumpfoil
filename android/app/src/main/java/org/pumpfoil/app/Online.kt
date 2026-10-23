package org.pumpfoil.app

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Gruener Online-Punkt am Profilbild, portiert aus der PWA (web/src/lib/online.ts, Jan 01.10.2026:
 * „ueberall wo das profilbild angezeigt wird", „egal ob app oder web").
 *
 * EIN zentraler Speicher statt eines Abrufs je Profilbild: jedes gerade sichtbare Bild meldet
 * seine User-ID an, ein gebuendelter Aufruf (`GET /api/chat/online?ids=…`) fragt alle zusammen ab —
 * ~400 ms nach neuen IDs (eine frisch geladene Liste bringt zwanzig Bilder auf einmal, die sollen
 * EINEN Aufruf ausloesen), danach im Minutentakt. So bekommt keine der vielen Listen-Antworten ein
 * eigenes Feld, und der Server muss den Online-Stand nicht in jede Antwort rechnen.
 *
 * Nur solange die App im Vordergrund ist (`setVordergrund`, aus MainScaffold per Lifecycle): im
 * Hintergrund schaut niemand auf die Punkte, und jeder Aufruf hielte das Funkmodul wach.
 */
object OnlineStatus {
    private const val TAKT_MS = 60_000L
    private const val BUENDEL_MS = 400L

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val angemeldet = HashMap<Int, Int>()      // id -> Zahl der sichtbaren Profilbilder
    private var gefragt: Set<Int> = emptySet()        // was der letzte Abruf schon enthielt
    private var bald: Job? = null
    private var takt: Job? = null

    private val _online = MutableStateFlow<Set<Int>>(emptySet())
    val online: StateFlow<Set<Int>> = _online

    // Supporter-Badge (Web lib/supporter.ts, 23.10.2026): gleiche angemeldete IDs, aber seltener abgefragt —
    // die Stufe aendert sich hoechstens taeglich. Neue IDs sofort mit dem naechsten Abruf, sonst alle 10 min.
    private const val SUPPORTER_MS = 10 * 60_000L
    private var supporterGefragt: Set<Int> = emptySet()
    private var supporterZeit = 0L
    private val _stufen = MutableStateFlow<Map<Int, Int>>(emptyMap())
    val stufen: StateFlow<Map<Int, Int>> = _stufen

    /**
     * App im Vordergrund? Liest auch `Api.http`: im Hintergrund (Upload-Worker, Recorder) geht
     * `X-Foil-Sichtbar: 0` mit, damit ein Upload in der Hosentasche niemanden „online" macht —
     * dieselbe Regel wie beim Hintergrund-Tab der PWA (server/app/api/deps.py).
     */
    @Volatile var vordergrund: Boolean = false
        private set

    fun setVordergrund(an: Boolean) {
        if (vordergrund == an) return
        vordergrund = an
        if (an) {
            planen(sofort = true)
            if (takt?.isActive != true) takt = scope.launch {
                while (isActive) { delay(TAKT_MS); abfragen() }
            }
        } else {
            takt?.cancel(); takt = null
            bald?.cancel(); bald = null
        }
    }

    private suspend fun abfragen() {
        if (!vordergrund || Api.token == null || angemeldet.isEmpty()) return
        val ids = angemeldet.keys.take(200)
        try {
            val r = Api.chatOnline(ids)
            gefragt = ids.toSet()
            _online.value = r.toSet()
        } catch (_: Exception) { /* offline oder abgemeldet: Punkte bleiben, wie sie sind */ }
        val jetzt = System.currentTimeMillis()
        if (!supporterGefragt.containsAll(ids) || jetzt - supporterZeit > SUPPORTER_MS) {
            try {
                _stufen.value = Api.supporterStufen(ids)
                supporterGefragt = ids.toSet()
                supporterZeit = jetzt
            } catch (_: Exception) { /* Badges bleiben, wie sie sind */ }
        }
    }

    private fun planen(sofort: Boolean = false) {
        bald?.cancel()
        bald = scope.launch {
            if (!sofort) delay(BUENDEL_MS)
            abfragen()
        }
    }

    // Aufrufe kommen aus DisposableEffect, also immer vom Main-Thread — keine Sperre noetig.
    fun anmelden(id: Int) {
        angemeldet[id] = (angemeldet[id] ?: 0) + 1
        if ((id !in gefragt || id !in supporterGefragt) && vordergrund) planen()
    }

    fun abmelden(id: Int) {
        val n = (angemeldet[id] ?: 1) - 1
        if (n <= 0) angemeldet.remove(id) else angemeldet[id] = n
    }
}

/** Ist dieser Nutzer gerade online? `null`/0 (unbekannte ID) -> nie. */
@Composable
fun rememberOnline(userId: Int?): Boolean {
    val id = userId?.takeIf { it > 0 }
    DisposableEffect(id) {
        if (id != null) OnlineStatus.anmelden(id)
        onDispose { if (id != null) OnlineStatus.abmelden(id) }
    }
    val alle by OnlineStatus.online.collectAsState()
    return id != null && id in alle
}

/** Supporter-Stufe 1-3 dieses Nutzers, 0 = kein Badge (Anmeldung laeuft ueber rememberOnline). */
@Composable
fun rememberSupporter(userId: Int?): Int {
    val alle by OnlineStatus.stufen.collectAsState()
    return userId?.let { alle[it] } ?: 0
}

/**
 * Tipp aufs Profilbild -> native Profilseite dieses Nutzers (Web 5272d67a: „das profilbild
 * ueberall als link zur jeweiligen profil-seite"). Kommt als CompositionLocal statt als Parameter:
 * Profilbilder sitzen tief in Karten, Zeilen und Chat-Nachrichten, und jede Ebene muesste sonst
 * einen Rueckruf durchreichen. MainScaffold setzt ihn; die Profilseite selbst setzt einen, der
 * ihre eigene ID ignoriert (kein Tipp, der auf dieselbe Seite fuehrt). null = nicht verlinken.
 */
val LocalOpenFoiler = staticCompositionLocalOf<((Int) -> Unit)?> { null }

private val EMERALD_500 = Color(0xFF10B981)

/**
 * Rahmen um ein beliebiges Profilbild: zeichnet den Online-Punkt und macht es antippbar. Als
 * Rahmen statt als fertiges Bild, weil die Stellen ihr Bild unterschiedlich zeichnen (Chat mit
 * Personen-Symbol als Platzhalter, Rekord-Kacheln mit eigenem AsyncImage) — die Optik dort soll
 * sich nicht aendern, nur der Punkt dazukommen.
 *
 * `link = false`, wo der Tipp schon etwas anderes tut (DM-Liste und Personensuche oeffnen den
 * Chat, die Empfaenger-Auswahl beim Uebertragen waehlt aus) — wie `link={false}` im Web.
 * Der Klick sitzt AUF dem Bild: ein umgebendes `clickable` (Session-Karte) bekommt den Tipp dann
 * nicht mehr, genau wie `stopPropagation` im Web.
 */
@Composable
fun ProfilbildRahmen(
    userId: Int?,
    size: Dp,
    link: Boolean = true,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val online = rememberOnline(userId)
    val stufe = rememberSupporter(userId)
    val oeffnen = LocalOpenFoiler.current
    val id = userId?.takeIf { it > 0 }
    val verlinkt = link && id != null && oeffnen != null
    // Kein clip auf den Rahmen: der Punkt sitzt in der Ecke und laege sonst halb ausserhalb des Kreises.
    Box(
        modifier
            .then(if (verlinkt) Modifier.clickable(role = Role.Button) { oeffnen!!(id!!) } else Modifier),
    ) {
        content()
        if (stufe > 0) {
            // Supporter-Badge unten LINKS (rechts unten der Online-Punkt), 40 % des Bildes, Ring in Hintergrundfarbe.
            val b = maxOf(11.dp, size * 0.4f)
            val text = I18n.t("sup.badge") + when (stufe) { 3 -> " · " + I18n.t("sup.level3"); 2 -> " · " + I18n.t("sup.level2"); else -> "" }
            Box(
                Modifier.align(Alignment.BottomStart).size(b)
                    .clip(CircleShape).background(MaterialTheme.colorScheme.surface).padding(1.dp)
                    .semantics { contentDescription = text },
            ) {
                androidx.compose.foundation.Image(supporterIcon(stufe), contentDescription = null)
            }
        }
        if (online) {
            // 28 % des Bildes, mindestens 8 dp (wie Web). Der Rand in Hintergrundfarbe trennt den
            // Punkt vom Bild — ohne ihn verschwimmt er auf einem gruenen Foto.
            val punkt = maxOf(8.dp, size * 0.28f)
            val text = I18n.t("presence.online")
            Box(
                Modifier.align(Alignment.BottomEnd).size(punkt)
                    .clip(CircleShape).background(MaterialTheme.colorScheme.surface)
                    .padding(if (punkt >= 12.dp) 2.dp else 1.5.dp)
                    .clip(CircleShape).background(EMERALD_500)
                    .semantics { contentDescription = text },
            )
        }
    }
}


// Supporter-Badge „Welle + Herz" (brand/badges/supporter.svg), drei Stufen wie Web components/SupporterBadge.tsx:
// 1 Cyan, 2 Smaragd, 3 Gold. Keine Verlaeufe.
private val SUP_FARBE = mapOf(
    1 to (Color(0xFF22D3EE) to Color(0xFF0E7490)),
    2 to (Color(0xFF34D399) to Color(0xFF047857)),
    3 to (Color(0xFFFBBF24) to Color(0xFFB45309)),
)
private val supCache = HashMap<Int, androidx.compose.ui.graphics.vector.ImageVector>()

internal fun supporterIcon(stufe: Int): androidx.compose.ui.graphics.vector.ImageVector = supCache.getOrPut(stufe) {
    val (fuell, rand) = SUP_FARBE[stufe] ?: SUP_FARBE.getValue(1)
    val navy = androidx.compose.ui.graphics.SolidColor(Color(0xFF020617))
    androidx.compose.ui.graphics.vector.ImageVector.Builder("supporter$stufe", 24.dp, 24.dp, 24f, 24f).apply {
        addPath(androidx.compose.ui.graphics.vector.addPathNodes("M12 2.4a9.6 9.6 0 1 0 0 19.2a9.6 9.6 0 1 0 0-19.2z"),
            fill = androidx.compose.ui.graphics.SolidColor(fuell),
            stroke = androidx.compose.ui.graphics.SolidColor(rand), strokeLineWidth = 1.6f)
        addPath(androidx.compose.ui.graphics.vector.addPathNodes("M5 16.4c1.2-.9 2.3-.9 3.5 0s2.3.9 3.5 0 2.3-.9 3.5 0 2.3.9 3.5 0"),
            stroke = navy, strokeLineWidth = 1.5f, strokeLineCap = androidx.compose.ui.graphics.StrokeCap.Round)
        addPath(androidx.compose.ui.graphics.vector.addPathNodes("M12 13.4c-2.5-1.7-3.6-2.9-3.6-4.4a1.9 1.9 0 0 1 3.6-1 1.9 1.9 0 0 1 3.6 1c0 1.5-1.1 2.7-3.6 4.4z"),
            fill = navy)
    }.build()
}
