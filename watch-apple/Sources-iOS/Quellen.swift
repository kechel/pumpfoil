import SwiftUI

/// Quellen einer Anzeige, klein darunter wie die Wetterquelle (web components/Quellen.tsx, 05.11.2026): „Daten von:
/// Garmin · Apple Watch · …". Der Server liefert die Codes (community.quellen). Erfuellt Garmins Markenvorgabe — sobald
/// Daten aus Garmin-Geraeten drinstecken, steht „Garmin" da. Herstellernamen unuebersetzt, nur „Handy"/„Datei-Upload".
private let quellenNamen: [String: String] = [
    "garmin": "Garmin", "apple": "Apple Watch", "wear": "Wear OS", "amazfit": "Amazfit", "huawei": "Huawei",
    "polar": "Polar", "suunto": "Suunto", "coros": "COROS",
]

func quellenText(_ quellen: [String]?, lang: String) -> String? {
    guard let q = quellen, !q.isEmpty else { return nil }
    let namen: [String] = q.map { k in
        if let n = quellenNamen[k] { return n }
        if k == "phone" { return Loc.t("quellen.phone", lang) }
        if k == "file" { return Loc.t("quellen.file", lang) }
        return k
    }
    return Loc.t("quellen.titel", lang) + ": " + namen.joined(separator: " · ")
}

/// Alle Uhren, Konten und Wege, mit denen man aufnehmen kann — in JEDEM Teilen-Bild statt der Quellen der einzelnen
/// Liste (web bestenlisteBild.ts plattformZeile, Jan 07.11.2026: „das ist ja werbung fuer uns"). Herstellernamen
/// unuebersetzt, nur Handy und Datei-Upload. Neue Plattform -> hier und im Web ergaenzen.
func plattformZeile(_ lang: String) -> String {
    let namen: [String] = ["Garmin", "Apple Watch", "Wear OS", "Huawei", "Amazfit", "Suunto", "Polar", "COROS", "Xiaomi",
                           Loc.t("quellen.phone", lang), Loc.t("quellen.file", lang)]
    return namen.joined(separator: " · ")
}

struct QuellenZeile: View {
    let quellen: [String]?
    let lang: String
    var body: some View {
        if let t = quellenText(quellen, lang: lang) {
            Text(t).font(.caption2).foregroundStyle(.secondary)
        }
    }
}
