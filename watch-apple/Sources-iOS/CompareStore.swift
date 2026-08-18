import SwiftUI

/// Ein Eintrag im Vergleichskorb: eine GANZE Session (`runIdx == nil`) oder EIN Lauf daraus.
/// Genau das Modell von web/src/lib/compare.ts (`CompareRef`), damit App und PWA dasselbe koennen.
struct CompareRef: Hashable, Identifiable {
    let sessionId: Int
    let runIdx: Int?
    /// Entspricht `refKey()` der PWA — auch als SwiftUI-Identitaet nutzbar, wenn dieselbe
    /// Session zweimal im Korb liegt (zwei verschiedene Laeufe).
    var id: String { "\(sessionId):\(runIdx.map(String.init) ?? "s")" }
}

// Sitzungsuebergreifender Vergleichskorb (spiegelt web/lib/compare + Android CompareStore).
// Ganze Sessions kommen per Long-Press aus den Session-Listen hinein, einzelne Laeufe ueber die
// Vergleichs-Spalte der Lauf-Tabelle in der Session-Detailansicht. Der schwebende CompareBar
// oeffnet den Vergleich mit genau diesen Eintraegen.
final class CompareStore: ObservableObject {
    static let shared = CompareStore()
    static let MAX = 4

    // REIHENFOLGE zaehlt (die PWA haelt ein Array, kein Set): sie bestimmt die Farbzuordnung
    // in der Vergleichsansicht. Deshalb Array statt Set.
    @Published private(set) var refs: [CompareRef] = []

    func contains(_ r: CompareRef) -> Bool { refs.contains(r) }
    /// Kurzform fuer ganze Sessions — die Session-Listen rufen weiter mit einer id auf.
    func contains(_ sessionId: Int) -> Bool { contains(CompareRef(sessionId: sessionId, runIdx: nil)) }

    /// true = hinzugefuegt, false = entfernt oder abgelehnt (Korb voll). Wie `toggleCompare` der PWA.
    @discardableResult func toggle(_ r: CompareRef) -> Bool {
        if let i = refs.firstIndex(of: r) { refs.remove(at: i); return false }
        guard refs.count < Self.MAX else { return false }
        refs.append(r)
        return true
    }
    @discardableResult func toggle(_ sessionId: Int) -> Bool {
        toggle(CompareRef(sessionId: sessionId, runIdx: nil))
    }

    func set(_ list: [CompareRef]) { refs = Array(list.prefix(Self.MAX)) }
    func clear() { refs.removeAll() }
}
