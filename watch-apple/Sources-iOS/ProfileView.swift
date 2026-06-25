import SwiftUI

// Profil + Abmelden. Einstellungen/Avatar-Upload folgen in späteren Phasen.
struct ProfileView: View {
    @EnvironmentObject var session: SessionStore

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(spacing: 14) {
                        avatar
                        VStack(alignment: .leading, spacing: 2) {
                            Text(session.profile?.display_name ?? "—").font(.headline)
                            if let email = session.profile?.email {
                                Text(email).font(.subheadline).foregroundStyle(.secondary)
                            }
                        }
                    }
                    .padding(.vertical, 4)
                }
                Section {
                    NavigationLink {
                        FoilsView()
                    } label: {
                        Label("Foils", systemImage: "water.waves")
                    }
                    NavigationLink {
                        FoilCalculatorView()
                    } label: {
                        Label("Foil-Rechner", systemImage: "function")
                    }
                    NavigationLink {
                        FoilStatsView()
                    } label: {
                        Label("Foil-Statistik", systemImage: "chart.bar")
                    }
                    Link("pumpfoil.org öffnen", destination: URL(string: "https://pumpfoil.org")!)
                }
                Section {
                    Button("Abmelden", role: .destructive) { session.logout() }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Profil")
            .toolbar { ToolbarItem(placement: .topBarTrailing) { SyncButton() } }
        }
    }

    @ViewBuilder private var avatar: some View {
        let url = Api.mediaURL(session.profile?.avatar_url)
        AsyncImage(url: url) { phase in
            switch phase {
            case .success(let img): img.resizable().scaledToFill()
            default:
                Image(systemName: "person.crop.circle.fill")
                    .resizable().scaledToFit().foregroundStyle(.secondary)
            }
        }
        .frame(width: 56, height: 56)
        .clipShape(Circle())
    }
}
