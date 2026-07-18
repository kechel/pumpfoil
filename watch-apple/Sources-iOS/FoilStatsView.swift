import SwiftUI

// Sortier-Zeile für die Stats-Listen (wie die sortierbaren Web-Spalten): Chip je Kennzahl,
// erneutes Tippen dreht die Richtung; Einträge ohne Wert immer unten.
struct StatSortBar: View {
    let options: [(key: String, label: String)]
    @Binding var sortKey: String
    @Binding var sortAsc: Bool

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(options, id: \.key) { o in
                    chip(o.key, o.label)
                }
            }
        }
    }

    private func chip(_ key: String, _ label: String) -> some View {
        let selected = sortKey == key
        let text = selected ? "\(label) \(sortAsc ? "↑" : "↓")" : label
        return Button {
            if selected { sortAsc.toggle() } else { sortKey = key; sortAsc = (key == "name") }
        } label: {
            Text(text).font(.caption)
                .padding(.horizontal, 10).padding(.vertical, 5)
                .background(selected ? Color.accentColor.opacity(0.2) : Color(.secondarySystemBackground))
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

// Nach Kennzahl sortieren; Einträge ohne Wert immer unten (wie web/SortableTable).
func sortStats<T>(_ list: [T], asc: Bool, key: (T) -> Double?) -> [T] {
    let has = list.filter { key($0) != nil }.sorted { (key($0) ?? 0) < (key($1) ?? 0) }
    let none = list.filter { key($0) == nil }
    return (asc ? has : has.reversed()) + none
}

// Foil-Statistik (spiegelt web/FoilStats): Community-Vergleich je Foil als Cards.
struct FoilStatsView: View {
    @AppStorage("appLang") private var lang = "de"
    @State private var rows: [FoilStat] = []
    @State private var loading = true
    @State private var error: String?
    @State private var sortKey = "sessions"
    @State private var sortAsc = false

    private var sorted: [FoilStat] {
        if sortKey == "name" {
            let s = rows.sorted { "\($0.brand) \($0.model) \($0.size)".lowercased() < "\($1.brand) \($1.model) \($1.size)".lowercased() }
            return sortAsc ? s : s.reversed()
        }
        return sortStats(rows, asc: sortAsc) { s in
            switch sortKey {
            case "users": return Double(s.users)
            case "speed": return s.avg_speed_kmh
            case "mpp": return s.meters_per_pump
            case "best": return s.best_distance_m
            case "hz": return s.avg_pump_hz
            default: return Double(s.sessions)
            }
        }
    }

    var body: some View {
        List {
            Section {
                Text(Loc.t("foilstats.intro", lang))
                    .font(.caption).foregroundStyle(.secondary)
                StatSortBar(options: [
                    ("name", "Foil"),
                    ("sessions", Loc.t("nav.sessions", lang)),
                    ("users", Loc.t("foilstats.riders", lang)),
                    ("speed", "Ø km/h"),
                    ("mpp", "m/Pump"),
                    ("best", Loc.t("foilstats.bestKm", lang)),
                    ("hz", "Ø Hz"),
                ], sortKey: $sortKey, sortAsc: $sortAsc)
            }
            if let error { Text(error).foregroundStyle(.secondary) }
            if !loading && rows.isEmpty && error == nil {
                Text(Loc.t("common.noData", lang)).foregroundStyle(.secondary)
            }
            ForEach(sorted) { s in
                Section("\(s.brand) \(s.model) \(s.size)") {
                    HStack {
                        metric("\(s.sessions)", Loc.t("nav.sessions", lang))
                        Spacer(); metric("\(s.users)", Loc.t("foilstats.riders", lang))
                        Spacer(); metric(s.avg_speed_kmh.map { String(format: "%.1f", $0) } ?? "–", "Ø km/h")
                    }
                    HStack {
                        metric(s.meters_per_pump.map { String(format: "%.1f", $0) } ?? "–", "m/Pump")
                        Spacer(); metric(s.best_distance_m.map { String(format: "%.2f", $0 / 1000) } ?? "–", Loc.t("foilstats.bestKm", lang))
                        Spacer(); metric(s.avg_pump_hz.map { String(format: "%.2f", $0) } ?? "–", "Ø Hz")
                    }
                }
            }
        }
        .overlay { if loading { ProgressView() } }
        .brandToolbar(Loc.t("profile.stats", lang))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            // Wie im Web: oben rechts zur jeweils anderen Statistik.
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink(Loc.t("watchStats.title", lang)) { WatchStatsView() }
            }
        }
        .task { await load() }
    }

    private func metric(_ value: String, _ label: String) -> some View {
        VStack(spacing: 2) {
            Text(value).fontWeight(.medium).foregroundStyle(Color.accentColor)
            Text(label).font(.caption2).foregroundStyle(.secondary)
        }
    }

    private func load() async {
        loading = true; defer { loading = false }
        do { rows = try await Api.foilStats(); error = nil }
        catch { self.error = error.localizedDescription }
    }
}
