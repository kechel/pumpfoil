import SwiftUI

// Community: öffentliche Sessions anderer (spiegelt web/Community + Android).
struct CommunityView: View {
    @EnvironmentObject var sync: SyncManager
    @State private var items: [CommunityItem] = []
    @State private var loading = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List {
                if let error { Text(error).foregroundStyle(.secondary) }
                ForEach(items) { s in
                    NavigationLink { SessionDetailView(id: s.id) } label: { CommunityRow(item: s) }
                }
                if items.isEmpty && !loading && error == nil {
                    Text("Noch keine Sessions").foregroundStyle(.secondary)
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Community")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    NavigationLink { CommunityRecordsView() } label: { Image(systemName: "trophy") }
                }
                ToolbarItem(placement: .topBarTrailing) { SyncButton() }
            }
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

// Community-Feed-Zeile (eigene Shape: name/spot/avatar_url/like_count).
struct CommunityRow: View {
    let item: CommunityItem

    var body: some View {
        HStack(spacing: 12) {
            avatar
            VStack(alignment: .leading, spacing: 2) {
                Text(item.name ?? "—").font(.headline)
                Text(dateText + (item.spot.map { " · \($0)" } ?? ""))
                    .font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer()
            if let likes = item.like_count, likes > 0 {
                Label("\(likes)", systemImage: "heart.fill")
                    .font(.caption).foregroundStyle(.pink).labelStyle(.titleAndIcon)
            }
        }
        .padding(.vertical, 2)
    }

    @ViewBuilder private var avatar: some View {
        if let url = Api.mediaURL(item.avatar_url) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let img): img.resizable().scaledToFill()
                default: Image(systemName: "person.crop.circle.fill").resizable().scaledToFit().foregroundStyle(.secondary)
                }
            }
            .frame(width: 36, height: 36).clipShape(Circle())
        } else {
            Image(systemName: "person.crop.circle.fill")
                .font(.title3).foregroundStyle(Color.accentColor)
                .frame(width: 36, height: 36)
        }
    }

    private var dateText: String {
        guard let d = item.startedDate else { return item.started_at }
        return d.formatted(date: .abbreviated, time: .shortened)
    }
}
