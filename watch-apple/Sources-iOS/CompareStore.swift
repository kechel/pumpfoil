import SwiftUI

// Sitzungsübergreifender Vergleichskorb (spiegelt web/lib/compare + Android CompareStore):
// per Long-Press (Kontextmenü) auf einer Session-Karte hinzufügen/entfernen; der schwebende
// CompareBar öffnet den Vergleich mit genau diesen Sessions.
final class CompareStore: ObservableObject {
    static let shared = CompareStore()
    private static let MAX = 4
    @Published private(set) var ids: Set<Int> = []

    func contains(_ id: Int) -> Bool { ids.contains(id) }
    func toggle(_ id: Int) {
        if ids.contains(id) { ids.remove(id) }
        else if ids.count < Self.MAX { ids.insert(id) }
    }
    func clear() { ids.removeAll() }
}
