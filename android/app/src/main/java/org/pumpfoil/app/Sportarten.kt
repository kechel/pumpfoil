package org.pumpfoil.app

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

// Die Sportarten-Liste kommt vom Server (GET /api/app/sports, server/app/data/sportarten.json — Jan, 25.10.2026: „eine
// einzige zentrale liste der sportarten fuer alle apps/uhren/web"). Neue Sportarten erscheinen damit ohne App-Update:
// Name in allen Sprachen, Gruppe (pump/wind/welle/motor/paddel), ob es On-Foil-Fahren gibt, Rekord-Satz.
// Eingebaut bleibt eine Liste als Rueckfall (erster Start ohne Netz); der letzte Abruf wird in den Prefs gemerkt.

@Serializable
data class SportEintrag(
    val id: String,
    val gruppe: String = "pump",
    val foil: Boolean = true,
    val land: Boolean = false,
    val rekorde: String? = null,
    val namen: Map<String, String> = emptyMap(),
)

@Serializable
data class SportListe(val version: String = "", val sportarten: List<SportEintrag> = emptyList())

object Sportarten {
    private const val PREF = "sportarten_json"
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }

    // Rueckfall = Stand der Server-Liste vom 25.10.2026 (Reihenfolge wie dort, `other` zuletzt). Namen kommen dann aus
    // den eingebauten Uebersetzungen (cls.sport.*).
    private val EINGEBAUT: List<SportEintrag> = listOf(
        SportEintrag("pumpfoil"), SportEintrag("wingfoil", "wind", rekorde = "wind"),
        SportEintrag("kitefoil", "wind", rekorde = "wind"), SportEintrag("parawing", "wind", rekorde = "wind"),
        SportEintrag("kitesurf", "wind", foil = false, rekorde = "wind_ohne_foil"),
        SportEintrag("windsurf", "wind", foil = false, rekorde = "wind_ohne_foil"),
        SportEintrag("snowkite", "wind", foil = false, land = true, rekorde = "wind_ohne_foil"),
        SportEintrag("kite_atb", "wind", foil = false, land = true, rekorde = "wind_ohne_foil"),
        SportEintrag("kitebuggy", "wind", foil = false, land = true, rekorde = "wind_ohne_foil"),
        SportEintrag("surf_downwind", "welle", rekorde = "downwind"), SportEintrag("surf_wave", "welle"),
        SportEintrag("sup_paddle", rekorde = "sup"), SportEintrag("sup", "paddel", foil = false, rekorde = "paddel"),
        SportEintrag("wakethief", rekorde = "wake"), SportEintrag("towed", "motor"), SportEintrag("efoil", "motor"),
        SportEintrag("foildrive", "motor"), SportEintrag("foil_scoot"), SportEintrag("other", foil = false),
    )

    @Volatile private var liste: List<SportEintrag> = EINGEBAUT

    fun ids(): List<String> = liste.map { it.id }
    fun eintrag(id: String?): SportEintrag? = liste.firstOrNull { it.id == (id ?: "pumpfoil") }
    fun gruppe(id: String?): String = eintrag(id)?.gruppe ?: "pump"
    fun foil(id: String?): Boolean = eintrag(id)?.foil ?: true

    /** Wind und Paddeln ohne Foil: keine Pumps, keine Laufzahl, keine Gleit-/Carve-Rekorde (wie die PWA). */
    fun windArtig(id: String?): Boolean = gruppe(id) in setOf("wind", "paddel")
    fun motor(id: String?): Boolean = gruppe(id) == "motor"

    /** Name vom Server in der Sprache (pt-PT faellt auf pt, sonst Englisch) — fuer Sportarten, die diese App noch nicht kennt. */
    fun name(id: String, lang: String): String? {
        val n = eintrag(id)?.namen ?: return null
        return n[lang] ?: (if (lang == "pt-PT") n["pt"] else null) ?: n["en"]
    }

    /** Gemerkten Stand lesen und im Hintergrund frisch holen. Fehler lassen die bisherige Liste stehen. */
    fun laden(ctx: Context) {
        val prefs = ctx.getSharedPreferences("pumpfoil", Context.MODE_PRIVATE)
        prefs.getString(PREF, null)?.let { roh -> uebernehmen(roh) }
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val roh = Api.appSportsRoh()
                if (uebernehmen(roh)) prefs.edit().putString(PREF, roh).apply()
            } catch (_: Exception) { /* offline: eingebaute oder gemerkte Liste bleibt */ }
        }
    }

    private fun uebernehmen(roh: String): Boolean = try {
        val l = json.decodeFromString(SportListe.serializer(), roh).sportarten.filter { it.id.isNotBlank() }
        if (l.size >= 2) { liste = l; true } else false
    } catch (_: Exception) { false }
}
