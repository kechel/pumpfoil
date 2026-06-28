import SwiftUI

// Community: öffentliche Sessions anderer (spiegelt web/Community + Android).
struct CommunityView: View {
    @EnvironmentObject var sync: SyncManager
    @AppStorage("appLang") private var lang = "de"
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
                    Text(Loc.t("sessions.empty", lang)).foregroundStyle(.secondary)
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle(Loc.t("nav.community", lang))
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
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top, spacing: 12) {
                avatar
                VStack(alignment: .leading, spacing: 3) {
                    Text(item.name ?? dateText).font(.headline)
                    if item.name != nil { Text(dateText).font(.caption).foregroundStyle(.secondary) }
                    if let spot = item.spot, !spot.isEmpty {
                        HStack(spacing: 6) { sessionPill(spot) }
                    }
                    if let cap = item.caption, !cap.isEmpty {
                        Text(cap).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                    }
                }
                Spacer(minLength: 8)
                if let tp = item.track_preview {
                    TrackPreviewView(data: tp).frame(width: 58, height: 42)
                }
                if let url = Api.mediaURL(item.thumb_url) {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let img): img.resizable().scaledToFill()
                        default: Color.secondary.opacity(0.15)
                        }
                    }
                    .frame(width: 44, height: 44).clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }
            if let stats = statsText { Text(stats).font(.caption).lineLimit(1) }
            if let likes = item.like_count, likes > 0 {
                HStack {
                    Spacer()
                    Label("\(likes)", systemImage: "heart.fill")
                        .font(.caption2).foregroundStyle(.pink).labelStyle(.titleAndIcon)
                }
            }
        }
        .padding(.vertical, 4)
    }

    private var statsText: String? {
        var parts: [String] = []
        if let r = item.runs, r > 0 { parts.append("\(r) " + (r == 1 ? "Lauf" : "Läufe")) }
        if let km = item.foiling_km, km > 0 { parts.append(String(format: "%.2f km", km)) }
        if let mx = item.max_speed_mps { parts.append(String(format: "max %.1f km/h", mx * 3.6)) }
        return parts.isEmpty ? nil : parts.joined(separator: "  ·  ")
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
