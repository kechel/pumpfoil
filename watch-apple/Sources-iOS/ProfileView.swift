import SwiftUI
import PhotosUI

// Profil: Avatar (antippbar zum Ändern), Anzeigename, Navigationsziele, Abmelden.
struct ProfileView: View {
    @EnvironmentObject var session: SessionStore
    @State private var editing = false
    @State private var draftName = ""
    @State private var avatarItem: PhotosPickerItem?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(spacing: 14) {
                        PhotosPicker(selection: $avatarItem, matching: .images) { avatar }
                            .buttonStyle(.plain)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(session.profile?.display_name ?? "—").font(.headline)
                            if let email = session.profile?.email {
                                Text(email).font(.subheadline).foregroundStyle(.secondary)
                            }
                        }
                        Spacer()
                        Button {
                            draftName = session.profile?.display_name ?? ""
                            editing = true
                        } label: { Image(systemName: "pencil") }
                        .buttonStyle(.borderless)
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
                    NavigationLink {
                        CompareView()
                    } label: {
                        Label("Sessions vergleichen", systemImage: "arrow.left.arrow.right")
                    }
                    NavigationLink {
                        AlarmView()
                    } label: {
                        Label("On-Foil Alarm", systemImage: "waveform.path")
                    }
                    NavigationLink {
                        DataFieldsView()
                    } label: {
                        Label("Datenseiten", systemImage: "square.grid.2x2")
                    }
                    NavigationLink {
                        SettingsView()
                    } label: {
                        Label("Einstellungen", systemImage: "gearshape")
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
            .alert("Anzeigename", isPresented: $editing) {
                TextField("Name", text: $draftName)
                Button("Speichern") {
                    let n = draftName.trimmingCharacters(in: .whitespaces)
                    if !n.isEmpty {
                        Task { if let p = try? await Api.updateDisplayName(n) { session.profile = p } }
                    }
                }
                Button("Abbrechen", role: .cancel) {}
            }
            .onChange(of: avatarItem) { item in
                Task {
                    if let data = try? await item?.loadTransferable(type: Data.self) {
                        try? await Api.uploadAvatar(data: data)
                        session.profile = try? await Api.getProfile()
                    }
                }
            }
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
