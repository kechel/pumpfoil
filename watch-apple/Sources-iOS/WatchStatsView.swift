import SwiftUI

// Uhren-Statistik (spiegelt web/WatchStats): Community-Aggregat je Uhr-Modell als Cards.
struct WatchStatsView: View {
    @AppStorage("appLang") private var lang = "de"
    @State private var rows: [WatchStat] = []
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        List {
            Section {
                Text(Loc.t("watchStats.intro", lang))
                    .font(.caption).foregroundStyle(.secondary)
            }
            if let error { Text(error).foregroundStyle(.secondary) }
            if !loading && rows.isEmpty && error == nil {
                Text(Loc.t("common.noData", lang)).foregroundStyle(.secondary)
            }
            ForEach(rows) { s in
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
