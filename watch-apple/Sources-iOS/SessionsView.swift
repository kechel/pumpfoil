import SwiftUI

// Native Sessions-Liste mit Pull-to-Refresh + Large Title.
struct SessionsView: View {
    @EnvironmentObject var sync: SyncManager
    @State private var items: [SessionSummary] = []
    @State private var loading = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List {
                if let error {
                    Text(error).foregroundStyle(.secondary)
                }
                ForEach(items) { s in
                    NavigationLink { SessionDetailView(id: s.id) } label: { SessionRow(session: s) }
                }
                if items.isEmpty && !loading && error == nil {
                    Text("Noch keine Sessions").foregroundStyle(.secondary)
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Sessions")
            .toolbar { ToolbarItem(placement: .topBarTrailing) { SyncButton() } }
            .overlay { if loading && items.isEmpty { ProgressView() } }
            .refreshable { await load() }
            .task { if items.isEmpty { await load() } }
            .onChange(of: sync.tick) { _ in Task { await load() } }
        }
    }

    private func load() async {
        loading = true; defer { loading = false }
        do { items = try await Api.sessions(); error = nil }
        catch { self.error = error.localizedDescription }
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
