import SwiftUI

// Sessions eines Spots (Tippen auf einen Pin/Eintrag in den Spots) — reiche Karten wie der Feed.
struct SpotSessionsView: View {
    let spot: String
    @AppStorage("appLang") private var lang = "de"
    @State private var items: [CommunityItem] = []
    @State private var loading = false
    @State private var error: String?

    var body: some View {
        List {
            if let error { Text(error).foregroundStyle(.secondary) }
            ForEach(items) { c in
                NavigationLink { SessionDetailView(id: c.id) } label: { CommunityRow(item: c) }
            }
            if items.isEmpty && !loading && error == nil {
                Text(Loc.t("sessions.empty", lang)).foregroundStyle(.secondary)
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("📍 \(spot)")
        .navigationBarTitleDisplayMode(.inline)
        .overlay { if loading && items.isEmpty { ProgressView() } }
        .refreshable { await load() }
        .task { if items.isEmpty { await load() } }
    }

    private func load() async {
        loading = true; defer { loading = false }
        do { items = try await Api.spotSessions(spot); error = nil }
        catch { self.error = error.localizedDescription }
    }
}
