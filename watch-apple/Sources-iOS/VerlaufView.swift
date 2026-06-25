import SwiftUI

// Verlauf: chronologische Liste mit Kennzahlen je Session (spiegelt web/Verlauf).
struct VerlaufView: View {
    @State private var items: [HistoryPoint] = []
    @State private var loading = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List {
                if let error { Text(error).foregroundStyle(.secondary) }
                ForEach(items) { h in
                    NavigationLink { SessionDetailView(id: h.session_id) } label: { row(h) }
                }
                if items.isEmpty && !loading && error == nil {
                    Text("Noch keine Sessions").foregroundStyle(.secondary)
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Verlauf")
            .overlay { if loading && items.isEmpty { ProgressView() } }
            .refreshable { await load() }
            .task { if items.isEmpty { await load() } }
        }
    }

    @ViewBuilder private func row(_ h: HistoryPoint) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(dateText(h.started_at)).font(.headline)
            HStack(spacing: 14) {
                stat("\(String(format: "%.1f", h.foiling_km)) km", "Foiling")
                stat("\(h.runs)", "Läufe")
                stat("\(h.pumps)", "Pumps")
                stat("\(String(format: "%.1f", h.speed * 3.6))", "km/h")
            }
        }
        .padding(.vertical, 2)
    }

    private func stat(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(value).font(.subheadline).fontWeight(.medium).foregroundStyle(Color.accentColor)
            Text(label).font(.caption2).foregroundStyle(.secondary)
        }
    }

    private func dateText(_ iso: String) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var d = f.date(from: iso)
        if d == nil { f.formatOptions = [.withInternetDateTime]; d = f.date(from: iso) }
        guard let date = d else { return iso }
        return date.formatted(date: .abbreviated, time: .shortened)
    }

    private func load() async {
        loading = true; defer { loading = false }
        do { items = try await Api.history(); error = nil }
        catch { self.error = error.localizedDescription }
    }
}
