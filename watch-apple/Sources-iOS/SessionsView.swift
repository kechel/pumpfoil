import SwiftUI

private enum SessionScope { case mine, spot, all }

// Sessions-Liste mit Scope-Umschalter (Meine / Homespot / Alle) + Spot-Suche.
struct SessionsView: View {
    @EnvironmentObject var sync: SyncManager
    @State private var own: [SessionSummary] = []
    @State private var feed: [CommunityItem] = []
    @State private var scope: SessionScope = .mine
    @State private var homespot = ""
    @State private var spot = ""          // aktiver Spot (für .spot)
    @State private var spotInput = ""
    @State private var loading = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    scopeChips
                    HStack {
                        TextField("Spot suchen", text: $spotInput)
                            .textInputAutocapitalization(.never)
                            .onSubmit { applySpotSearch() }
                        Button { applySpotSearch() } label: { Image(systemName: "magnifyingglass") }
                            .buttonStyle(.borderless)
                    }
                }
                if let error { Text(error).foregroundStyle(.secondary) }
                if scope == .mine {
                    ForEach(own) { s in
                        NavigationLink { SessionDetailView(id: s.id) } label: { SessionRow(session: s) }
                    }
                } else {
                    ForEach(feed) { c in
                        NavigationLink { SessionDetailView(id: c.id) } label: { CommunityRow(item: c) }
                    }
                }
                if isEmpty && !loading && error == nil {
                    Text("Keine Sessions").foregroundStyle(.secondary)
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { SyncButton() } }
            .overlay { if loading && isEmpty { ProgressView() } }
            .refreshable { await load() }
            .task {
                if homespot.isEmpty {
                    homespot = ((try? await Api.settings())?["homespot"] as? String) ?? ""
                }
                await load()
            }
            .onChange(of: scope) { _ in Task { await load() } }
            .onChange(of: spot) { _ in Task { await load() } }
            .onChange(of: sync.tick) { _ in Task { await load() } }
        }
    }

    private var title: String {
        switch scope {
        case .mine: return "Sessions · Meine"
        case .all: return "Sessions · Alle"
        case .spot: return "Sessions · 📍\(spot)"
        }
    }

    private var isEmpty: Bool { scope == .mine ? own.isEmpty : feed.isEmpty }

    @ViewBuilder private var scopeChips: some View {
        HStack(spacing: 8) {
            chip("Meine", scope == .mine) { scope = .mine }
            if !homespot.isEmpty {
                chip("📍\(homespot)", scope == .spot && spot == homespot) { spot = homespot; scope = .spot }
            }
            chip("Alle", scope == .all) { scope = .all }
        }
    }

    private func chip(_ label: String, _ active: Bool, _ action: @escaping () -> Void) -> some View {
        Button(action: action) { Text(label).font(.subheadline) }
            .buttonStyle(.bordered)
            .tint(active ? .accentColor : .secondary)
    }

    private func applySpotSearch() {
        let s = spotInput.trimmingCharacters(in: .whitespaces)
        if !s.isEmpty { spot = s; scope = .spot }
    }

    private func load() async {
        loading = true; defer { loading = false }
        do {
            switch scope {
            case .mine: own = try await Api.sessions()
            case .all: feed = try await Api.communitySessions()
            case .spot: feed = spot.isEmpty ? [] : (try await Api.spotSessions(spot))
            }
            error = nil
        } catch { self.error = error.localizedDescription }
    }
}

struct SessionRow: View {
    let session: SessionSummary
    var showOwner: Bool = false

    var body: some View {
        HStack(spacing: 12) {
            leading
            VStack(alignment: .leading, spacing: 2) {
                if showOwner, let owner = session.owner_name, !owner.isEmpty {
                    Text(owner).font(.headline)
                    Text(dateText + (session.place_name.map { " · \($0)" } ?? ""))
                        .font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                } else {
                    Text(dateText).font(.headline)
                    if let place = session.place_name, !place.isEmpty {
                        Label(place, systemImage: "mappin.and.ellipse")
                            .font(.subheadline).foregroundStyle(.secondary)
                            .labelStyle(.titleAndIcon)
                    } else if let cap = session.caption, !cap.isEmpty {
                        Text(cap).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                    }
                }
            }
            Spacer()
            if let likes = session.like_count, likes > 0 {
                Label("\(likes)", systemImage: "heart.fill")
                    .font(.caption).foregroundStyle(.pink).labelStyle(.titleAndIcon)
            }
        }
        .padding(.vertical, 2)
    }

    @ViewBuilder private var leading: some View {
        if showOwner, let url = Api.mediaURL(session.owner_avatar_url) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let img): img.resizable().scaledToFill()
                default: Image(systemName: "person.crop.circle.fill").resizable().scaledToFit().foregroundStyle(.secondary)
                }
            }
            .frame(width: 36, height: 36).clipShape(Circle())
        } else {
            Image(systemName: showOwner ? "person.crop.circle.fill" : "water.waves")
                .font(.title3)
                .foregroundStyle(Color.accentColor)
                .frame(width: 36, height: 36)
                .background(Color.accentColor.opacity(0.12), in: RoundedRectangle(cornerRadius: 8))
        }
    }

    private var dateText: String {
        guard let d = session.startedDate else { return session.started_at }
        return d.formatted(date: .abbreviated, time: .shortened)
    }
}
