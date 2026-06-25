import SwiftUI

// Spots: Übersicht der Spots nach Anzahl Sessions (spiegelt web/Spots).
struct SpotsView: View {
    @State private var items: [SpotMapItem] = []
    @State private var loading = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List {
                if let error { Text(error).foregroundStyle(.secondary) }
                ForEach(items) { s in
                    HStack {
                        Image(systemName: "mappin.circle.fill")
                            .foregroundStyle(Color.accentColor)
                        Text(s.spot)
                        Spacer()
                        Text("\(s.sessions)")
                            .font(.subheadline).foregroundStyle(.secondary)
                            .padding(.horizontal, 8).padding(.vertical, 2)
                            .background(Color(.secondarySystemBackground), in: Capsule())
                    }
                }
                if items.isEmpty && !loading && error == nil {
                    Text("Noch keine Spots").foregroundStyle(.secondary)
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Spots")
            .overlay { if loading && items.isEmpty { ProgressView() } }
            .refreshable { await load() }
            .task { if items.isEmpty { await load() } }
        }
    }

    private func load() async {
        loading = true; defer { loading = false }
        do { items = try await Api.spotMap().sorted { $0.sessions > $1.sessions }; error = nil }
        catch { self.error = error.localizedDescription }
    }
}
