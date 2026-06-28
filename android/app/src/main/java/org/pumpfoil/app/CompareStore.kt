package org.pumpfoil.app

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

// Sitzungsübergreifende Auswahl für den Vergleich: per Long-Press auf einer Session-Karte
// (Sessions/Community/Home) hinzufügen/entfernen; der Compare-Screen vergleicht genau diese.
object CompareStore {
    private val _ids = MutableStateFlow<Set<Int>>(emptySet())
    val ids = _ids.asStateFlow()
    fun toggle(id: Int) {
        _ids.value = if (id in _ids.value) _ids.value - id else _ids.value + id
    }
    fun clear() { _ids.value = emptySet() }
}
