package org.pumpfoil.app

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

// Default des „nur Accel | alle"-Umschalters — Port von web/src/lib/useAccelDefault.ts.
// „nur Accel", wenn der anschauende Nutzer selbst Läufe mit Beschleunigungsdaten hat, sonst „alle".
// Der Wert kommt aus /api/sessions/has-accel und wird prozessweit EINMAL geladen (wie der
// session-weite Cache der PWA).
object AccelDefault {
    @Volatile private var cache: Boolean? = null
    private val mutex = Mutex()

    /** Bereits bekannter Default; solange noch nichts geladen ist optimistisch „nur Accel" (wie PWA). */
    val cached: Boolean get() = cache ?: true

    /** Lädt has-accel höchstens einmal pro Prozess; Fehler -> „alle" (wie PWA). */
    suspend fun preferred(): Boolean = mutex.withLock {
        cache ?: (try { Api.hasAccel() } catch (_: Exception) { false }).also { cache = it }
    }
}

// State-Halter für den Umschalter mit den DREI Setzern der PWA-Hook:
//  - set      = Nutzer hat selbst umgeschaltet -> seine Wahl bleibt, keine Automatik mehr
//  - setAuto  = die Ansicht schaltet selbst um (z. B. Spot ohne eine einzige Session mit
//               Beschleunigungsdaten -> sonst stünde man vor einer leeren Liste). Bewusst NICHT
//               als Nutzer-Wahl gemerkt.
//  - resetAuto = beim Spot-Wechsel/Verlassen wieder den Default aus der eigenen Uhr herstellen.
class AccelToggleState(initial: Boolean) {
    var value by mutableStateOf(initial)
        private set
    private var touched by mutableStateOf(false)

    fun set(v: Boolean) { touched = true; value = v }
    fun setAuto(v: Boolean) { if (!touched) value = v }
    fun resetAuto() { if (!touched) value = AccelDefault.cached }
    /** true, sobald der Nutzer den Umschalter selbst angefasst hat (Automatik dann aus). */
    val userChose: Boolean get() = touched
}

@Composable
fun rememberAccelDefault(): AccelToggleState {
    val state = remember { AccelToggleState(AccelDefault.cached) }
    LaunchedEffect(Unit) { state.setAuto(AccelDefault.preferred()) }
    return state
}
