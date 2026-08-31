package org.pumpfoil.app

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue

// Default des „nur Accel | alle"-Umschalters — Port von web/src/lib/useAccelDefault.ts.
//
// GEAENDERT 31.08.2026 (Jan): die Sessions-Listen starten jetzt IMMER mit „alle", auch wenn der
// anschauende Nutzer selbst Beschleunigungsdaten hat. Vorher wurde /api/sessions/has-accel gefragt
// und bei „ja" auf „nur Accel" gestellt. Das ist fuer eine UEBERSICHT falsch: es verschweigt still
// die Sessions der Mitfahrer, deren Uhr keine verwertbaren Accel-Daten liefert — genau daran ist
// am 29.08. ein Nutzer haengengeblieben („14 Sessions am Spot, nach dem Klick stehen drei da").
// Fuer Rekorde/Bestenlisten bleibt „nur praezise" richtig; die haben eigene Umschalter und
// benutzen diesen Default nicht.
//
// Die Form (`cached`/`preferred()`) bleibt, damit die Aufrufer unveraendert bleiben und ein
// Zurueckdrehen eine Zeile ist. `Api.hasAccel()` wird dadurch hier nicht mehr gerufen.
object AccelDefault {
    /** Startwert des Umschalters: „alle". */
    val cached: Boolean get() = false

    /** Ohne Netz-Abfrage — der Default haengt nicht mehr davon ab, was der Nutzer selbst hat. */
    suspend fun preferred(): Boolean = false
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
