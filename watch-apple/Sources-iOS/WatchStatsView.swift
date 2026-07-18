import SwiftUI

// Uhren-Statistik (spiegelt web/WatchStats): Community-Aggregat je Uhr-Modell als Cards.
struct WatchStatsView: View {
    @AppStorage("appLang") private var lang = "de"
    @State private var rows: [WatchStat] = []
    @State private var loading = true
    @State private var error: String?
    @State private var sortKey = "sessions"
    @State private var sortAsc = false

    private var sorted: [WatchStat] {
        if sortKey == "name" {
            let s = rows.sorted { $0.watch.lowercased() < $1.watch.lowercased() }
            return sortAsc ? s : s.reversed()
        }
        return sortStats(rows, asc: sortAsc) { s in
            switch sortKey {
            case "users": return Double(s.users)
            case "km": return s.foiling_km
            case "speed": return s.avg_speed_kmh
            case "bestSpeed": return s.best_speed_kmh
            case "hz": return s.avg_pump_hz
            default: return Double(s.sessions)
            }
        }
    }

    var body: some View {
        List {
            Section {
                Text(Loc.t("watchStats.intro", lang))
                    .font(.caption).foregroundStyle(.secondary)
                StatSortBar(options: [
                    ("name", Loc.t("nav.watch", lang)),
                    ("sessions", Loc.t("nav.sessions", lang)),
                    ("users", Loc.t("watchStats.users", lang)),
                    ("km", Loc.t("watchStats.km", lang)),
                    ("speed", "Ø km/h"),
                    ("bestSpeed", Loc.t("watchStats.bestSpeed", lang)),
                    ("hz", "Ø Hz"),
                ], sortKey: $sortKey, sortAsc: $sortAsc)
            }
            if let error { Text(error).foregroundStyle(.secondary) }
            if !loading && rows.isEmpty && error == nil {
                Text(Loc.t("common.noData", lang)).foregroundStyle(.secondary)
            }
            ForEach(sorted) { s in
                Section(s.watch) {
                    HStack {
                        metric("\(s.sessions)", Loc.t("nav.sessions", lang))
                        Spacer(); metric("\(s.users)", Loc.t("watchStats.users", lang))
                        Spacer(); metric(s.foiling_km.map { String(format: "%.1f", $0) } ?? "–", Loc.t("watchStats.km", lang))
                    }
                    HStack {
                        metric(s.avg_speed_kmh.map { String(format: "%.1f", $0) } ?? "–", "Ø km/h")
                        Spacer(); metric(s.best_speed_kmh.map { String(format: "%.1f", $0) } ?? "–", Loc.t("watchStats.bestSpeed", lang))
                        Spacer(); metric(s.avg_pump_hz.map { String(format: "%.2f", $0) } ?? "–", "Ø Hz")
                    }
                }
            }
        }
        .overlay { if loading { ProgressView() } }
        .navigationTitle(Loc.t("watchStats.title", lang))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            // Wie im Web: oben rechts zur jeweils anderen Statistik.
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink(Loc.t("profile.stats", lang)) { FoilStatsView() }
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
        do { rows = try await Api.watchStats(); error = nil }
        catch { self.error = error.localizedDescription }
    }
}
