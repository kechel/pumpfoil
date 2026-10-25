import Foundation

// Sportart-Klassifikation durch Menschen — Anzeige-Bausteine (docs/sport-classification.md).
// EINE Quelle für Karten, Detailansicht und Home-Hinweis. Spiegelt web/src/lib/sportClass.ts
// (Reihenfolge inklusive) und die Server-Tupel SPORTS/DATA_QUALITY in server/app/api/sessions.py.
// ACHTUNG: `SessionSummary.sport` ist etwas ANDERES — der Aktivitätstyp aus der Aufnahmedatei.

/// Auswählbare Sportarten — gültige Messungen, dürfen später eigene Rekorde begründen.
// „wake" seit 05.08. in drei Kategorien aufgeteilt (beim Pumpen verschiedene Dinge):
// wakethief = Welle eines FREMDEN Boots mitnehmen · towed = am Seil hinterm Boot · surf_wave =
// Ozeanwelle am Strand. `wake` bleibt nur als Label für Altbestände (nicht mehr auswählbar).
// `parawing` seit 13.09.2026: Lowkite / Parawing / Parakite sind dasselbe (Jan).
let SPORTS = ["pumpfoil", "wingfoil", "kitefoil", "parawing", "kitesurf", "windsurf", "snowkite", "kite_atb", "kitebuggy", "surf_downwind",
              "surf_wave", "sup_paddle", "sup", "wakethief", "towed", "efoil",
              "foildrive", "foil_scoot", "other"]

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

// Sortierung aller Sportart-Listen wie im Web (web/src/lib/sportClass.ts, Jan 25.10.2026: „die sportartenliste bitte
// immer alphabetisch sortieren, nur pumpfoil (oder das eigene default) ganz oben"): eigene Standard-Sportart zuerst,
// „other" zuletzt, dazwischen nach dem ANGEZEIGTEN Namen in der gewaehlten Sprache. Die Standard-Sportart setzen die
// Ansichten, die die Einstellungen laden (Profil, Foils, Einrichtung) — Pumpfoil als Rueckfall.
var standardSport: String = "pumpfoil"

func sortiereSports(_ ids: [String], lang: String, std: String? = nil) -> [String] {
    let erster: String = std ?? standardSport
    func rang(_ id: String) -> Int { id == erster ? 0 : (id == "other" ? 2 : 1) }
    return ids.sorted { (a: String, b: String) -> Bool in
        let ra: Int = rang(a), rb: Int = rang(b)
        if ra != rb { return ra < rb }
        let na: String = Loc.t("cls.sport." + a, lang).lowercased()
        let nb: String = Loc.t("cls.sport." + b, lang).lowercased()
        return na < nb
    }
}
