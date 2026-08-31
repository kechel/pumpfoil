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
    // Beschreibungen haengen an der spot_id, hierher kommt nur der NAME (die Navigation ist
    // namensbasiert). Einmal ueber die Karte zuordnen; ohne Spot-Zeile bleibt es nil.
    @State private var spotId: Int?
    @State private var spotLabel: String?      // Gewaesser bzw. Steg/Ortslage, fuer den Titel

    var body: some View {
        List {
            if let error { Text(error).foregroundStyle(.secondary) }
            // Erst der Spot (Beschreibungen), dann was dort gefahren wurde — wie im Web.
            if let sid = spotId { SpotNotesView(spotId: sid, lang: lang) }
            ForEach(items) { c in
                NavigationLink { SessionDetailView(id: c.id) } label: { CommunityRow(item: c) }
            }
            if items.isEmpty && !loading && error == nil {
                Text(Loc.t("sessions.empty", lang)).foregroundStyle(.secondary)
            }
        }
        .listStyle(.insetGrouped)
        .brandToolbar("📍 \(spot)" + (spotLabel.map { " · \($0)" } ?? ""))
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
        .task {
            if spotId == nil {
                let m = (try? await Api.spotMap(accelOnly: false))?.first { $0.spot == spot }
                spotId = m?.spot_id
                if let w = m?.water, !w.isEmpty, w.lowercased() != spot.lowercased() { spotLabel = w }
            }
        }
    }

    private func load() async {
        loading = true; defer { loading = false }
        do {
            // Default wie die PWA (useAccelDefault): „nur Accel", wenn der Nutzer selbst
            // Accel-Läufe hat, sonst „alle".
            let only = showAll ? false : await AccelDefault.preferred()
            var rows = try await Api.spotSessions(spot, accelOnly: only)
            // Frueher griff das NUR bei einer komplett leeren Liste, und genau daran ist am 29.08. ein
            // Nutzer haengen geblieben: die Spot-Karte sagte „Meerkerk · 14“, nach dem Klick standen dort
            // seine eigenen drei. Die anderen elf sind ohne verwertbare Beschleunigungsdaten aufgenommen
            // (`detection = gps_only`) — die Karte zaehlt mit accel_only=false, die Liste filterte mit true.
            // Die Liste war also nicht leer, nur kuerzer als das Etikett versprach; auf 0 zu pruefen reicht
            // nicht. Verglichen wird jetzt die erste Seite gegen „alle“.
            if only, !autoTried {
                autoTried = true
                let all = try await Api.spotSessions(spot, accelOnly: false)
                if all.count > rows.count { showAll = true; rows = all }
            }
            items = rows
            error = nil
        } catch { self.error = error.localizedDescription }
    }
}
