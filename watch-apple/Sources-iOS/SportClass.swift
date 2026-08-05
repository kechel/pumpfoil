import Foundation

// Sportart-Klassifikation durch Menschen — Anzeige-Bausteine (docs/sport-classification.md).
// EINE Quelle für Karten, Detailansicht und Home-Hinweis. Spiegelt web/src/lib/sportClass.ts
// (Reihenfolge inklusive) und die Server-Tupel SPORTS/DATA_QUALITY in server/app/api/sessions.py.
// ACHTUNG: `SessionSummary.sport` ist etwas ANDERES — der Aktivitätstyp aus der Aufnahmedatei.

/// Auswählbare Sportarten — gültige Messungen, dürfen später eigene Rekorde begründen.
// „wake" seit 05.08. in drei Kategorien aufgeteilt (beim Pumpen verschiedene Dinge):
// wakethief = Welle eines FREMDEN Boots mitnehmen · towed = am Seil hinterm Boot · surf_wave =
// Ozeanwelle am Strand. `wake` bleibt nur als Label für Altbestände (nicht mehr auswählbar).
let SPORTS = ["pumpfoil", "wingfoil", "kitefoil", "surf_downwind", "surf_wave",
              "sup_paddle", "wakethief", "towed", "efoil", "foildrive", "other"]

/// Datenqualität — Müll/Dopplung, zählt nirgends.
let DATA_QUALITY = ["ok", "false_data", "duplicate", "test"]

/// Zeigt die Session eine abweichende Klassifikation, die man benennen sollte?
func isClassified(sportClass: String?, dataQuality: String?) -> Bool {
    (sportClass ?? "pumpfoil") != "pumpfoil" || (dataQuality ?? "ok") != "ok"
}

/// Beschriftbare Werte: auswählbare Sportarten + stillgelegte Altwerte. Der Server kann Kategorien
/// hinzufügen, bevor diese App das Update hat — was hier NICHT drinsteht, bekommt das Label von
/// „andere Sportart" statt eines rohen i18n-Keys auf dem Bildschirm.
private let LABELED_SPORTS = SPORTS + ["wake"]

/// i18n-Key des Anzeige-Labels; Datenqualität schlägt die Sportart, weil sie mehr aussagt.
func classLabelKey(sportClass: String?, dataQuality: String?) -> String {
    let dq = dataQuality ?? "ok"
    if dq != "ok" { return "cls.dq.\(dq)" }
    let sport = sportClass ?? "pumpfoil"
    return "cls.sport.\(LABELED_SPORTS.contains(sport) ? sport : "other")"
}
