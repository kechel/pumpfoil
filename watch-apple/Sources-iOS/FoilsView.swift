import SwiftUI

// Foil-Katalog (spiegelt web/Foils): durchsuchen, „meine" merken, eines als Standard
// (Stern). Persistiert via PUT /api/settings (my_foils, foil_id).
struct FoilsView: View {
    @AppStorage("appLang") private var lang = "de"
    @State private var foils: [Foil] = []
    @State private var brands: [String] = []
    @State private var brand = ""
    @State private var query = ""
    @State private var mine: Set<Int> = []
    @State private var def: Int?
    @State private var loading = true
    @State private var error: String?

    private var filtered: [Foil] {
        foils.filter { f in
            (brand.isEmpty || f.brand == brand) &&
            (query.isEmpty || "\(f.brand) \(f.model) \(f.size)".lowercased().contains(query.lowercased()))
        }
    }

    var body: some View {
        Form {
            if let error { Text(error).foregroundStyle(.secondary) }
            Section {
                TextField(Loc.t("foils.search", lang), text: $query)
                if !brands.isEmpty {
                    Picker(Loc.t("foils.brand", lang), selection: $brand) {
                        Text(Loc.t("sessions.all", lang)).tag("")
                        ForEach(brands, id: \.self) { b in Text(b).tag(b) }
                    }
                }
            }
            if loading {
                Section { HStack { Spacer(); ProgressView(); Spacer() } }
            } else {
                let mineList = filtered.filter { mine.contains($0.id) }.sorted { ($0.id == def ? 0 : 1) < ($1.id == def ? 0 : 1) }
                let restList = filtered.filter { !mine.contains($0.id) }
                if !mineList.isEmpty {
                    Section(Loc.t("foils.mine", lang)) { ForEach(mineList) { row($0) } }
                }
                Section(mineList.isEmpty ? Loc.t("foils.all", lang) : Loc.t("foils.more", lang)) { ForEach(restList) { row($0) } }
            }
        }
        .brandToolbar(Loc.t("profile.foils", lang))
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    @ViewBuilder private func row(_ f: Foil) -> some View {
        let isMine = mine.contains(f.id)
        let isDefault = f.id == def
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("\(f.brand) \(f.model) \(f.size)")
                Text("\(Int(f.area_cm2)) cm²  ·  AR \(f.aspect_ratio.map { String(format: "%.1f", $0) } ?? "–")")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Button { setDefault(f.id) } label: {
                Image(systemName: isDefault ? "star.fill" : "star")
                    .foregroundStyle(isDefault ? .yellow : .secondary)
            }.buttonStyle(.borderless)
            Button { toggleMine(f.id) } label: {
                Image(systemName: isMine ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(isMine ? Color.accentColor : .secondary)
            }.buttonStyle(.borderless)
        }
    }

    private func toggleMine(_ id: Int) {
        if mine.contains(id) { mine.remove(id); if def == id { def = nil } } else { mine.insert(id) }
        persist()
    }
    private func setDefault(_ id: Int) {
        if def == id { def = nil } else { def = id; mine.insert(id) }
        persist()
    }
    private func persist() {
        let patch: [String: Any] = ["my_foils": mine.sorted(), "foil_id": def ?? NSNull()]
        Task { try? await Api.saveSettings(patch) }
    }

    private func load() async {
        loading = true; defer { loading = false }
        do {
            foils = try await Api.foils()
            brands = (try? await Api.foilBrands()) ?? []
            if let s = try? await Api.settings() {
                if let mf = s["my_foils"] as? [Int] { mine = Set(mf) }
                else if let mf = s["my_foils"] as? [NSNumber] { mine = Set(mf.map(\.intValue)) }
                def = (s["foil_id"] as? Int) ?? (s["foil_id"] as? NSNumber)?.intValue
            }
            error = nil
        } catch { self.error = error.localizedDescription }
    }
}
