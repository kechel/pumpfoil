import SwiftUI

// Sessions eines Spots (Tippen auf einen Pin/Eintrag in den Spots) — reiche Karten wie der Feed.
//
// ACHTUNG, DOPPELUNG: dasselbe zeigt `SessionsView` im Spot-Modus (dort ueber die Chips in der
// Sessionliste erreichbar). Die PWA hat nur EINE Ansicht — ein Klick auf der Spot-Karte fuehrt
// dort zu `/sessions?spot=…`. Die beiden iOS-Ansichten sind auseinandergelaufen: hier fehlten
// Rekorde UND Wetter, dort fehlten die Rekorde (Jan, 07.09.2026). Angeglichen sind sie jetzt,
// zusammengelegt gehoeren sie trotzdem — s. docs/TODO.md.
struct SpotSessionsView: View {
    let spot: String
    /// Vom Einstieg mitgegebene Spot-Zeile (Karte/Liste/Session). Ist sie da, wird nicht mehr
    /// gesucht — genau diese Suche hat die Beschreibungen verschluckt.
    var vorgegebeneSpotId: Int? = nil
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
    @State private var weather: SpotWeather?

    var body: some View {
        List {
            // Der Spotname MUSS in die Liste: `brandToolbar` belegt die Titelzeile mit der
            // Wortmarke und benutzt den uebergebenen Titel nur als Vorlesetext — sichtbar war
            // der Name also nie (Jan, 07.09.2026). Die PWA zeigt ihn als Ueberschrift.
            Section {
                VStack(alignment: .leading, spacing: 2) {
                    Text("📍 \(spot)").font(.title3.bold())
                    if let w = spotLabel, !w.isEmpty {
                        Text(w).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            if let error { Text(error).foregroundStyle(.secondary) }
            // Reihenfolge wie in der PWA: Rekorde, Wetter, Beschreibungen, dann die Sessions
            // (Jan, 07.09.: „die 3 muessen nach oben wie in der pwa").
            SpotRecordsView(spot: spot, lang: lang, accelOnly: showAll ? false : true)
            if let sw = weather { Section { HomeWeatherCard(sw: sw, lang: lang, titelKey: "spot.weatherTitle") } }
            // `?? vorgegebeneSpotId`: die id des Einstiegs gilt SOFORT. Vorher wurde sie erst
            // im Task uebernommen — nach dem Laden der Sessions — und bis dahin (oder wenn der
            // Task nicht durchlief) stand hier nichts.
            if let sid = spotId ?? vorgegebeneSpotId { SpotNotesView(spotId: sid, lang: lang) }
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
        // EIN Task fuer alles. Vorher hingen drei `.task`-Blocke an derselben Liste — dass alle
        // drei laufen, ist nicht garantiert genug, um sich darauf zu verlassen, und ein stumm
        // ausgefallener Block ist von „keine Daten" nicht zu unterscheiden (Jan, 07.09.: Wetter
        // da, Rekorde und Beschreibungen nicht). Nacheinander in einem Block, mit den
        // Nebenlaeufen in einer Gruppe, damit nichts aufeinander wartet.
        .task {
            if items.isEmpty { await load() }
            if spotId == nil { spotId = vorgegebeneSpotId }
            async let w = Api.spotWeather(spot)
            async let karte = Api.spotMap(accelOnly: false)
            weather = try? await w
            if let m = (try? await karte)?.first(where: { $0.spot == spot }) {
                spotId = m.spot_id
                if let wn = m.water, !wn.isEmpty, wn.lowercased() != spot.lowercased() { spotLabel = wn }
            }
        }
    }

    private func load() async {
        loading = true; defer { loading = false }
        do {
            // Default wie die PWA (useAccelDefault): seit 31.08. IMMER „alle", auch wenn der
            // Nutzer selbst Accel-Läufe hat — s. AccelDefault.swift.
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
