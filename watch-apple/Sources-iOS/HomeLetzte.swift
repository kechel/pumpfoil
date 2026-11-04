import SwiftUI

/// Home › Uebersicht: Freunde mit ihrer letzten Session als Session-Kachel (PWA PersonalHome `FreundeLetzte`, Jan 02.11.2026)
/// — je Freund genau eine, zuletzt aktive zuerst, hoechstens 10 (Server). Ohne Freunde gar nicht da.
struct FreundeLetzteAbschnitt: View {
    let lang: String
    var neuLadenTick: Int = 0
    @State private var liste: [CommunityItem]?

    var body: some View {
        Group {
            if let l = liste, !l.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text(Loc.t("friends.title", lang)).font(.headline)
                    ForEach(l) { c in
                        NavigationLink(value: SessionDest(id: c.id)) { CommunityRow(item: c) }.buttonStyle(.plain)
                    }
                }
            } else {
                Color.clear.frame(height: 0)   // damit `.task` laeuft (Memory swiftui-leere-group-laedt-nicht)
            }
        }
        .task(id: neuLadenTick) { liste = (try? await Api.friendsLatest()) ?? liste ?? [] }
    }
}

/// Home › Team: die letzten Sessions der eigenen Teams unter der Teamliste (PWA PersonalHome `TeamLetzteMitWahl`) —
/// Standard alle Teams zusammen, ab zwei Teams eingrenzbar (wie Sessions › Team). Je Mitglied hoechstens drei (Server).
struct TeamLetzteAbschnitt: View {
    let teams: [TeamKurz]
    let lang: String
    @State private var wahl = "alle"
    @State private var liste: [CommunityItem]?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(Loc.t("phome.latest", lang)).font(.headline).padding(.top, 8)
            if teams.count > 1 {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        knopf("alle", Loc.t("team.alleMeine", lang), nil)
                        ForEach(teams) { tm in knopf(String(tm.id), tm.name, tm) }
                    }
                }
            }
            if let l = liste {
                if l.isEmpty {
                    Text("—").foregroundStyle(.secondary)
                } else {
                    ForEach(l) { c in
                        NavigationLink(value: SessionDest(id: c.id)) { CommunityRow(item: c) }.buttonStyle(.plain)
                    }
                }
            } else {
                ProgressView().padding(8)
            }
        }
        .task(id: wahl) { liste = nil; liste = (try? await Api.teamLatest(wahl)) ?? [] }
    }

    private func knopf(_ id: String, _ text: String, _ tm: TeamKurz?) -> some View {
        let an: Bool = wahl == id
        return Button { wahl = id } label: {
            HStack(spacing: 5) {
                if let t = tm { TeamWappen(name: t.name, logo: t.logo_url, farbe: t.farbe, size: 16) }
                Text(text).font(.subheadline).lineLimit(1)
            }
            .padding(.horizontal, 10).padding(.vertical, 5)
            .foregroundStyle(an ? Color.black : Color.primary)
            .background(Capsule().fill(an ? Color.accentColor : Color(.secondarySystemBackground)))
        }
        .buttonStyle(.borderless)
    }
}

extension Api {
    /// Freunde mit ihrer letzten Session (PWA api.friendsLatest).
    static func friendsLatest() async throws -> [CommunityItem] {
        try await request("/api/community/friends-latest", method: "GET", body: nil, auth: true)
    }

    /// Die letzten Sessions der Teammitglieder; `team` = "alle" oder eine Team-ID (PWA api.teamLatest).
    static func teamLatest(_ team: String) async throws -> [CommunityItem] {
        let t: String = team.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? team
        return try await request("/api/community/team-latest?team=\(t)", method: "GET", body: nil, auth: true)
    }
}
