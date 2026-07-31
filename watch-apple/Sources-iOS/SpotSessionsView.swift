import SwiftUI

// Sessions eines Spots (Tippen auf einen Pin/Eintrag in den Spots) — reiche Karten wie der Feed.
struct SpotSessionsView: View {
    let spot: String
    @EnvironmentObject private var store: SessionStore
    @AppStorage("appLang") private var lang = "de"
    @State private var items: [CommunityItem] = []
    @State private var loading = false
    @State private var error: String?
    // Automatik „Spot ohne eine einzige Session mit Beschleunigungsdaten": statt einer leeren Liste
    // einmal mit accel_only=false nachfragen und dann alle zeigen. Beides ist View-State dieses
    // Spots -> beim Verlassen/Wechseln wieder weg (NICHT gemerkt), es gilt wieder der Default.
    @State private var showAll = false
    @State private var autoTried = false

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
        .brandToolbar("📍 \(spot)")
        .toolbar {
            // Spot-Chat (scope "spot:<name>", wie Web/PWA) — bei Age-Gate (social_allowed=false) aus.
            if store.profile?.social_allowed != false {
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink { ChatRoomView(scope: "spot:\(spot)", title: spot) } label: {
                        Image(systemName: "bubble.left.and.bubble.right")
                    }
                }
            }
        }
        .overlay { if loading && items.isEmpty { ProgressView() } }
        .refreshable { await load() }
        .task { if items.isEmpty { await load() } }
    }

    private func load() async {
        loading = true; defer { loading = false }
        do {
            // Default wie die PWA (useAccelDefault): „nur Accel", wenn der Nutzer selbst
            // Accel-Läufe hat, sonst „alle".
            let only = showAll ? false : await AccelDefault.preferred()
            var rows = try await Api.spotSessions(spot, accelOnly: only)
            if only, rows.isEmpty, !autoTried {
                autoTried = true
                let all = try await Api.spotSessions(spot, accelOnly: false)
                if !all.isEmpty { showAll = true; rows = all }
            }
            items = rows
            error = nil
        } catch { self.error = error.localizedDescription }
    }
}
