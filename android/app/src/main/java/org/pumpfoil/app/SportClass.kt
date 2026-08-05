package org.pumpfoil.app

// Sportart-Klassifikation durch Menschen — Anzeige-Bausteine (docs/sport-classification.md).
// EINE Quelle für Karten, Detailansicht und Home-Hinweis, damit die Kategorien nirgends
// auseinanderlaufen. Spiegelt `web/src/lib/sportClass.ts` (Reihenfolge inklusive) und die
// Server-Tupel SPORTS/DATA_QUALITY in `server/app/api/sessions.py`.
// ACHTUNG: `SessionSummary.sport` ist etwas ANDERES — der Aktivitätstyp aus der Aufnahmedatei.

/** Auswählbare Sportarten — gültige Messungen, dürfen später eigene Rekorde begründen. */
// „wake" seit 05.08. in drei Kategorien aufgeteilt (beim Pumpen verschiedene Dinge):
// wakethief = Welle eines FREMDEN Boots mitnehmen · towed = am Seil hinterm Boot · surf_wave =
// Ozeanwelle am Strand. `wake` bleibt nur als Label fuer Altbestaende (nicht mehr auswaehlbar).
val SPORTS = listOf("pumpfoil", "wingfoil", "kitefoil", "surf_downwind", "surf_wave",
                    "sup_paddle", "wakethief", "towed", "efoil", "foildrive", "other")

/** Datenqualität — Müll/Dopplung, zählt nirgends. */
val DATA_QUALITY = listOf("ok", "false_data", "duplicate", "test")

/** Zeigt die Session eine abweichende Klassifikation, die man benennen sollte? */
fun isClassified(sportClass: String?, dataQuality: String?): Boolean =
    (sportClass ?: "pumpfoil") != "pumpfoil" || (dataQuality ?: "ok") != "ok"

/** Beschriftbare Werte: auswaehlbare Sportarten + stillgelegte Altwerte. Der Server kann Kategorien
 *  hinzufuegen, bevor diese App das Update hat — was hier NICHT drinsteht, bekommt das Label von
 *  „andere Sportart" statt eines rohen i18n-Keys auf dem Bildschirm. */
private val LABELED_SPORTS = SPORTS + listOf("wake")

/** i18n-Key des Anzeige-Labels; Datenqualität schlägt die Sportart, weil sie mehr aussagt. */
fun classLabelKey(sportClass: String?, dataQuality: String?): String {
    val dq = dataQuality ?: "ok"
    if (dq != "ok") return "cls.dq.$dq"
    val sport = sportClass ?: "pumpfoil"
    return "cls.sport.${if (sport in LABELED_SPORTS) sport else "other"}"
}
