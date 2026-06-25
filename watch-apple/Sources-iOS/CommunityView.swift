import SwiftUI

// Community: öffentliche Sessions anderer (spiegelt web/Community + Android).
struct CommunityView: View {
    @EnvironmentObject var sync: SyncManager
    @State private var items: [SessionSummary] = []
    @State private var loading = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List {
                if let error { Text(error).foregroundStyle(.secondary) }
                ForEach(items) { s in
                    NavigationLink { SessionDetailView(id: s.id) } label: { SessionRow(session: s, showOwner: true) }
                }
                if items.isEmpty && !loading && error == nil {
                    Text("Noch keine Sessions").foregroundStyle(.secondary)
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Community")
            .toolbar { ToolbarItem(placement: .topBarTrailing) { SyncButton() } }
            .overlay { if loading && items.isEmpty { ProgressView() } }
            .refreshable { await load() }
            .task { if items.isEmpty { await load() } }
        }
    }

    private func load() async {
        loading = true; defer { loading = false }
        do { items = try await Api.communitySessions(); error = nil }
        catch { self.error = error.localizedDescription }
    }
}
