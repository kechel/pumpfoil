package org.pumpfoil.app

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Ein Eintrag im Vergleichskorb: eine GANZE Session (`runIdx == null`) oder EIN Lauf daraus.
 * Genau das Modell von web/src/lib/compare.ts (`CompareRef`), damit App und PWA dasselbe koennen.
 */
data class CompareRef(val sessionId: Int, val runIdx: Int? = null) {
    /** Entspricht `refKey()` der PWA — stabile Identitaet fuer Listen. */
    val key: String get() = "$sessionId:${runIdx ?: "s"}"
}

// Sitzungsuebergreifende Auswahl fuer den Vergleich: ganze Sessions per Long-Press auf einer
// Session-Karte (Sessions/Community/Home), einzelne Laeufe ueber die Vergleichs-Spalte der
// Lauf-Tabelle in der Session-Detailansicht.
object CompareStore {
    const val MAX = 4

    // REIHENFOLGE zaehlt (die PWA haelt ein Array, kein Set): sie bestimmt die Farbzuordnung
    // in der Vergleichsansicht. Deshalb List statt Set.
    private val _refs = MutableStateFlow<List<CompareRef>>(emptyList())
    val refs = _refs.asStateFlow()

    fun contains(r: CompareRef) = r in _refs.value

    /** true = hinzugefuegt, false = entfernt oder abgelehnt (Korb voll). Wie `toggleCompare` der PWA. */
    fun toggle(r: CompareRef): Boolean {
        val list = _refs.value
        if (r in list) { _refs.value = list - r; return false }
        if (list.size >= MAX) return false
        _refs.value = list + r
        return true
    }

    /** Kurzform fuer ganze Sessions — die Session-Listen rufen weiter mit einer id auf. */
    fun toggle(sessionId: Int) = toggle(CompareRef(sessionId))
    fun contains(sessionId: Int) = contains(CompareRef(sessionId))

    fun clear() { _refs.value = emptyList() }
}
