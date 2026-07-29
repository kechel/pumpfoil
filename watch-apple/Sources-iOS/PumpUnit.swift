import Foundation

// Anzeige-Einheit der Pump-Kadenz. „Hz" ist für viele schwer vorstellbar (was sind 1,43 Hz?),
// deshalb kann man auf Pumps pro Minute umstellen: ppm = Hz × 60.
// REINE DARSTELLUNG — es wird nichts neu analysiert, Analyse- und Rekordwerte bleiben unberührt.
//
// Quelle der Wahrheit ist das Profil (users.pump_unit, GET/PUT /api/auth/me). Lokal gespiegelt in
// UserDefaults unter "pumpUnit", damit jede View ohne eigenen Netz-Aufruf formatieren kann; die
// Views beobachten den Wert per @AppStorage("pumpUnit") -> eine Änderung wirkt sofort überall.
//
// Die eine Stelle, die aus einem Hz-Wert Text macht — nicht in den Views nachrechnen.
enum PumpUnit {
    static let storeKey = "pumpUnit"

    static var current: String {
        UserDefaults.standard.string(forKey: storeKey) == "ppm" ? "ppm" : "hz"
    }

    // Vom Profil übernehmen (Login/Start/Resume) — eine Änderung im Web kommt so hier an.
    static func store(_ v: String?) {
        UserDefaults.standard.set(v == "ppm" ? "ppm" : "hz", forKey: storeKey)
    }

    // Aktuelle UI-Sprache — für statische Formatier-Closures ohne View-Kontext (z. B. VerlaufView).
    static var curLang: String { UserDefaults.standard.string(forKey: "appLang") ?? "de" }

    private static func isPpm() -> Bool { current == "ppm" }

    // Kürzel für Spaltenköpfe/Sortier-Chips: „Hz" bzw. „Pumps/min".
    static func unitLabel(_ lang: String) -> String {
        isPpm() ? Loc.t("unit.pumpsPerMin", lang) : "Hz"
    }

    // Wert MIT Einheit (1.43 -> „1.43 Hz" bzw. „86/min").
    static func fmt(_ hz: Double?, _ lang: String, dash: String = "–") -> String {
        guard let v = hz else { return dash }
        if isPpm() {
            let ppm: Double = v * 60.0
            return String(format: "%.0f", ppm) + Loc.t("unit.pumpPerMin", lang)
        }
        return String(format: "%.2f Hz", v)
    }

    // Wert OHNE Einheit — für Tabellen/Kacheln, deren Kopf schon unitLabel() zeigt.
    static func fmtValue(_ hz: Double?, dash: String = "–") -> String {
        guard let v = hz else { return dash }
        if isPpm() {
            let ppm: Double = v * 60.0
            return String(format: "%.0f", ppm)
        }
        return String(format: "%.2f", v)
    }

    // Farb-Legende (min→max): grob gerundet, Einheit nur am oberen Ende.
    static func fmtLegend(_ hz: Double, _ lang: String, withUnit: Bool) -> String {
        if isPpm() {
            let ppm: Double = hz * 60.0
            let s: String = String(format: "%.0f", ppm)
            return withUnit ? s + Loc.t("unit.pumpPerMin", lang) : s
        }
        let s: String = String(format: "%.1f", hz)
        return withUnit ? s + " Hz" : s
    }
}
