import SwiftUI
import PhotosUI

// Profil: Avatar (antippbar zum Ändern), Anzeigename, Navigationsziele, Abmelden.
struct ProfileView: View {
    @EnvironmentObject var session: SessionStore
    @EnvironmentObject var sync: SyncManager
    @AppStorage("appLang") private var lang = "de"
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
                // Apple-Watch-Status: Updates kommen automatisch mit der iPhone-App (eingebettet);
                // ist die Uhr gekoppelt, aber die App fehlt -> Hinweis (Installieren via Watch-App).
                Section(Loc.t("watch.title", lang)) {
                    if sync.watchAppInstalled {
                        Label(Loc.t("watch.ok", lang), systemImage: "checkmark.circle.fill")
                            .font(.caption).foregroundStyle(.secondary)
                    } else if sync.watchPaired {
                        Label(Loc.t("watch.notInstalled", lang), systemImage: "applewatch.slash")
                            .font(.caption).foregroundStyle(.secondary)
                    } else {
                        Label(Loc.t("watch.none", lang), systemImage: "applewatch")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
                .task { sync.refreshConnection() }
                Section {
                    NavigationLink {
                        FoilsView()
                    } label: {
                        Label(Loc.t("profile.foils", lang), systemImage: "water.waves")
                    }
                    NavigationLink {
                        FoilCalculatorView()
                    } label: {
                        Label(Loc.t("profile.calc", lang), systemImage: "function")
                    }
                    NavigationLink {
                        FoilStatsView()
                    } label: {
                        Label(Loc.t("profile.stats", lang), systemImage: "chart.bar")
                    }
                    NavigationLink {
                        CompareView()
                    } label: {
                        Label(Loc.t("profile.compare", lang), systemImage: "arrow.left.arrow.right")
                    }
                    NavigationLink {
                        AlarmView()
                    } label: {
                        Label(Loc.t("profile.alarm", lang), systemImage: "waveform.path")
                    }
                    NavigationLink {
                        DataFieldsView()
                    } label: {
                        Label(Loc.t("profile.datafields", lang), systemImage: "square.grid.2x2")
                    }
                    NavigationLink {
                        SettingsView()
                    } label: {
                        Label(Loc.t("settings.title", lang), systemImage: "gearshape")
                    }
                    Link(Loc.t("profile.web", lang), destination: URL(string: "https://pumpfoil.org")!)
                }
                Section {
                    Button(Loc.t("profile.logout", lang), role: .destructive) { session.logout() }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle(Loc.t("nav.profile", lang))
            .brandToolbar(Loc.t("nav.profile", lang))
            .toolbar { ToolbarItem(placement: .topBarTrailing) { SyncButton() } }
            .alert(Loc.t("profile.editName", lang), isPresented: $editing) {
                TextField("Name", text: $draftName)
                Button(Loc.t("common.save", lang)) {
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
