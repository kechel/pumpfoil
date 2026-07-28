import Foundation

// Sportart-Klassifikation durch Menschen — Anzeige-Bausteine (docs/sport-classification.md).
// EINE Quelle für Karten, Detailansicht und Home-Hinweis. Spiegelt web/src/lib/sportClass.ts
// (Reihenfolge inklusive) und die Server-Tupel SPORTS/DATA_QUALITY in server/app/api/sessions.py.
// ACHTUNG: `SessionSummary.sport` ist etwas ANDERES — der Aktivitätstyp aus der Aufnahmedatei.

/// Auswählbare Sportarten — gültige Messungen, dürfen später eigene Rekorde begründen.
let SPORTS = ["pumpfoil", "wingfoil", "kitefoil", "surf_downwind", "sup_paddle",
              "wake", "efoil", "foildrive", "other"]

/// Datenqualität — Müll/Dopplung, zählt nirgends.
let DATA_QUALITY = ["ok", "false_data", "duplicate", "test"]

/// Zeigt die Session eine abweichende Klassifikation, die man benennen sollte?
func isClassified(sportClass: String?, dataQuality: String?) -> Bool {
    (sportClass ?? "pumpfoil") != "pumpfoil" || (dataQuality ?? "ok") != "ok"
}

/// i18n-Key des Anzeige-Labels; Datenqualität schlägt die Sportart, weil sie mehr aussagt.
func classLabelKey(sportClass: String?, dataQuality: String?) -> String {
    let dq = dataQuality ?? "ok"
    if dq != "ok" { return "cls.dq.\(dq)" }
    return "cls.sport.\(sportClass ?? "pumpfoil")"
}
