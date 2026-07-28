package org.pumpfoil.app

// Sportart-Klassifikation durch Menschen — Anzeige-Bausteine (docs/sport-classification.md).
// EINE Quelle für Karten, Detailansicht und Home-Hinweis, damit die Kategorien nirgends
// auseinanderlaufen. Spiegelt `web/src/lib/sportClass.ts` (Reihenfolge inklusive) und die
// Server-Tupel SPORTS/DATA_QUALITY in `server/app/api/sessions.py`.
// ACHTUNG: `SessionSummary.sport` ist etwas ANDERES — der Aktivitätstyp aus der Aufnahmedatei.

/** Auswählbare Sportarten — gültige Messungen, dürfen später eigene Rekorde begründen. */
val SPORTS = listOf("pumpfoil", "wingfoil", "kitefoil", "surf_downwind", "sup_paddle",
                    "wake", "efoil", "foildrive", "other")

/** Datenqualität — Müll/Dopplung, zählt nirgends. */
val DATA_QUALITY = listOf("ok", "false_data", "duplicate", "test")

/** Zeigt die Session eine abweichende Klassifikation, die man benennen sollte? */
fun isClassified(sportClass: String?, dataQuality: String?): Boolean =
    (sportClass ?: "pumpfoil") != "pumpfoil" || (dataQuality ?: "ok") != "ok"

/** i18n-Key des Anzeige-Labels; Datenqualität schlägt die Sportart, weil sie mehr aussagt. */
fun classLabelKey(sportClass: String?, dataQuality: String?): String {
    val dq = dataQuality ?: "ok"
    if (dq != "ok") return "cls.dq.$dq"
    return "cls.sport.${sportClass ?: "pumpfoil"}"
}
