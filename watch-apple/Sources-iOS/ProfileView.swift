import SwiftUI
import PhotosUI

// Profil: Avatar (antippbar zum Ändern), Anzeigename, Navigationsziele, Abmelden.
struct ProfileView: View {
    @EnvironmentObject var session: SessionStore
    @EnvironmentObject var sync: SyncManager
    @AppStorage("appLang") private var lang = "de"
    @AppStorage("phone_rec_enabled") private var phoneRecEnabled = false
    @State private var editing = false
    @State private var draftName = ""
    @State private var avatarItem: PhotosPickerItem?
    @State private var confirmingDelete = false

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
                // Übersicht wie die PWA: nur EIN „Uhr"-Eintrag (Koppeln/Alarm/Datenseiten dahinter)
                // + darunter „Verknüpfte Konten". Kein Uhr-Status/Garmin direkt in der Übersicht.
                Section {
                    NavigationLink {
                        WatchView()
                    } label: {
                        Label { Text(Loc.t("nav.watch", lang)) } icon: { Image(systemName: "applewatch").foregroundStyle(Color.accentColor) }
                    }
                    NavigationLink {
                        LinkedAccountsView()
                    } label: {
                        Label { Text(Loc.t("accounts.title", lang)) } icon: { Image(systemName: "link").foregroundStyle(Color.accentColor) }
                    }
                    NavigationLink {
                        FoilsView()
                    } label: {
                        Label { Text(Loc.t("profile.foils", lang)) } icon: { FoilIcon(tint: .accentColor).frame(width: 22, height: 22) }
                    }
                    NavigationLink {
                        FoilCalculatorView()
                    } label: {
                        Label { Text(Loc.t("profile.calc", lang)) } icon: { Image(systemName: "function").foregroundStyle(Color.accentColor) }
                    }
                    NavigationLink {
                        FoilStatsView()
                    } label: {
                        Label { Text(Loc.t("profile.stats", lang)) } icon: { Image(systemName: "chart.bar").foregroundStyle(Color.accentColor) }
                    }
                    NavigationLink {
                        CompareView()
                    } label: {
                        Label { Text(Loc.t("profile.compare", lang)) } icon: { Image(systemName: "arrow.left.arrow.right").foregroundStyle(Color.accentColor) }
                    }
                    NavigationLink {
                        SettingsView()
                    } label: {
                        Label { Text(Loc.t("settings.title", lang)) } icon: { Image(systemName: "gearshape").foregroundStyle(Color.accentColor) }
                    }
                    Link(Loc.t("profile.web", lang), destination: URL(string: "https://pumpfoil.org")!)
                }
                // Social-Kanäle (wie im Web-Menü): öffnen in Safari/der jeweiligen App.
                Section {
                    Link(destination: URL(string: "https://www.youtube.com/@pumpfoil-org")!) {
                        Label { Text("YouTube") } icon: { Image(systemName: "play.rectangle").foregroundStyle(Color.accentColor) }
                    }
                    Link(destination: URL(string: "https://www.instagram.com/pumpfoil_org/")!) {
                        Label { Text("Instagram") } icon: { Image(systemName: "camera").foregroundStyle(Color.accentColor) }
                    }
                    Link(destination: URL(string: "https://www.tiktok.com/@pumpfoil.org")!) {
                        Label { Text("TikTok") } icon: { Image(systemName: "music.note").foregroundStyle(Color.accentColor) }
                    }
                }
                // „Record on Phone" — hängt NUR am lokalen Toggle, NICHT mehr an profile.beta
                // (Server-Flag wird für echte private Betas frei, siehe docs/TODO); steuert den
                // Aufnahme-Button auf der Startseite (lokale Einstellung auf diesem Gerät).
                Section {
                    Toggle(isOn: $phoneRecEnabled) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(Loc.t("profile.phoneRec", lang))
                            Text(Loc.t("profile.phoneRecSub", lang)).font(.caption).foregroundStyle(.secondary)
                            if phoneRecEnabled {
                                Text(Loc.t("rec.waterproof", lang)).font(.caption).bold().foregroundStyle(.red)
                            }
                        }
                    }
                }
                Section {
                    Button(Loc.t("profile.logout", lang), role: .destructive) { session.logout() }
                }
                // Konto-Löschung (App-Store-Pflicht 5.1.1(v)): DSGVO-Delete + danach abmelden.
                Section {
                    Button(Loc.t("profile.deleteAccount", lang), role: .destructive) { confirmingDelete = true }
                } footer: {
                    Text("Pumpfoil v\((Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String) ?? "")")
                }
                #if DEBUG
                // Nur Debug: App-Rating-Dialog neu triggerbar machen (Test-Flags löschen).
                Section {
                    Button("↻ Rating-Test zurücksetzen") {
                        ["rating_done", "rating_snooze", "rating_min_count", "rating_fb_count"].forEach {
                            UserDefaults.standard.removeObject(forKey: $0)
                        }
                    }
                }
                // Nur Debug: Age-Gate erzwingen -> verifiziert Feed/Chat-Sperre (Tabs blenden aus).
                Section {
                    Button("Age-Gate AN (<13)") {
                        Task { if let p = try? await Api.setAgeRange(socialAllowed: false, ageBracket: "under13") { session.profile = p } }
                    }
                    Button("Age-Gate AUS (18+)") {
                        Task { if let p = try? await Api.setAgeRange(socialAllowed: true, ageBracket: "18+") { session.profile = p } }
                    }
                } header: {
                    Text("DEBUG · Age-Gate (social_allowed = \(String(describing: session.profile?.social_allowed)))")
                }
                #endif
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
            .alert(Loc.t("profile.deleteAccount", lang), isPresented: $confirmingDelete) {
                Button(Loc.t("profile.deleteConfirmBtn", lang), role: .destructive) {
                    Task { try? await Api.deleteAccount(); session.logout() }
                }
                Button(Loc.t("common.cancel", lang), role: .cancel) {}
            } message: {
                Text(Loc.t("profile.deleteConfirm", lang))
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
