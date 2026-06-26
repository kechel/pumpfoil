import SwiftUI

// Uhr-Datenseiten konfigurieren (settings.views): bis zu 3 Felder pro Seite.
// Feld-IDs identisch mit web/src/lib/fields.ts + Garmin.
private let FIELD_OPTIONS: [(Int, String)] = [
    (0, "— leer —"), (1, "Speed (3 s)"), (5, "Speed (aktuell)"), (6, "Ø Speed"), (7, "Max Speed"),
    (2, "Puls"), (8, "Ø Puls"), (9, "Max Puls"), (3, "Zeit"), (4, "Distanz"), (10, "Höhe"),
    (13, "Aufstieg"), (11, "Temperatur"), (12, "Uhrzeit"), (14, "Lauf Dauer (live)"),
    (15, "Lauf Strecke (live)"), (16, "Letzter Lauf: Dauer"), (17, "Letzter Lauf: Strecke"),
    (18, "Letzter Lauf: Ø Speed"), (19, "Letzter Lauf: Max Speed"), (20, "Läufe (Anzahl)"),
]

struct DataFieldsView: View {
    @State private var views: [[Int]] = [[1, 2, 0]]
    @State private var loaded = false
    @State private var saved = false

    var body: some View {
        Form {
            Section { Text("Bis zu 3 Felder pro Seite. Leere Seiten entfallen auf der Uhr.").font(.footnote).foregroundStyle(.secondary) }
            ForEach(views.indices, id: \.self) { vi in
                Section("Seite \(vi + 1)") {
                    ForEach(0..<3, id: \.self) { slot in
                        Picker("Feld \(slot + 1)", selection: binding(vi, slot)) {
                            ForEach(FIELD_OPTIONS, id: \.0) { id, label in Text(label).tag(id) }
                        }
                    }
                    if views.count > 1 {
                        Button("Seite entfernen", role: .destructive) { views.remove(at: vi); saved = false }
                    }
                }
            }
            Section {
                if views.count < 8 {
                    Button("Seite hinzufügen") { views.append([0, 0, 0]); saved = false }
                }
                Button("Speichern") { save() }
                if saved { Text("Gespeichert").foregroundStyle(.green).font(.footnote) }
            }
        }
        .navigationTitle("Datenseiten")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func binding(_ vi: Int, _ slot: Int) -> Binding<Int> {
        Binding(
            get: { views.indices.contains(vi) && views[vi].indices.contains(slot) ? views[vi][slot] : 0 },
            set: { newVal in
                if views.indices.contains(vi) {
                    var row = views[vi]
                    while row.count < 3 { row.append(0) }
                    row[slot] = newVal
                    views[vi] = row
                    saved = false
                }
            }
        )
    }

    private func load() async {
        let s = (try? await Api.settings()) ?? [:]
        if let raw = s["views"] as? [[Any]], !raw.isEmpty {
            views = raw.map { row in (0..<3).map { i in (i < row.count ? (row[i] as? Int) : nil) ?? 0 } }
        }
        loaded = true
    }

    private func save() {
        Task {
            try? await Api.saveSettings(["views": views])
            saved = true
        }
    }
}
