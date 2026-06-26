import SwiftUI

// Uhr-Datenseiten konfigurieren (settings.views): bis zu 3 Felder pro Seite.
// Feld-IDs identisch mit web/src/lib/fields.ts + Garmin. Labels via Loc "field.<id>".
private let FIELD_IDS = [0, 1, 5, 6, 7, 2, 8, 9, 3, 4, 10, 13, 11, 12, 14, 15, 16, 17, 18, 19, 20]

struct DataFieldsView: View {
    @AppStorage("appLang") private var lang = "de"
    @State private var views: [[Int]] = [[1, 2, 0]]
    @State private var loaded = false
    @State private var saved = false

    var body: some View {
        Form {
            Section { Text(Loc.t("datafields.intro", lang)).font(.footnote).foregroundStyle(.secondary) }
            ForEach(views.indices, id: \.self) { vi in
                Section("\(Loc.t("datafields.page", lang)) \(vi + 1)") {
                    ForEach(0..<3, id: \.self) { slot in
                        Picker("\(Loc.t("datafields.field", lang)) \(slot + 1)", selection: binding(vi, slot)) {
                            ForEach(FIELD_IDS, id: \.self) { id in Text(Loc.t("field.\(id)", lang)).tag(id) }
                        }
                    }
                    if views.count > 1 {
                        Button(Loc.t("datafields.removePage", lang), role: .destructive) { views.remove(at: vi); saved = false }
                    }
                }
            }
            Section {
                if views.count < 8 {
                    Button(Loc.t("datafields.addPage", lang)) { views.append([0, 0, 0]); saved = false }
                }
                Button(Loc.t("common.save", lang)) { save() }
                if saved { Text(Loc.t("common.saved", lang)).foregroundStyle(.green).font(.footnote) }
            }
        }
        .navigationTitle(Loc.t("profile.datafields", lang))
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
