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

    // Der Body ist bewusst KURZ: Swifts Type-Checker loest einen ViewBuilder als EINEN Ausdruck
    // auf, und der Aufwand waechst ueberproportional mit Kindern + Modifiern. Dieser Body war
    // ~150 Zeilen und stand mit >500 ms im Build-Log (Archive hing minutenlang). Jeder Abschnitt
    // unten ist ein eigener, explizit typisierter Ausdruck und wird unabhaengig geprueft.
    var body: some View {
        NavigationStack {
            List {
                headerSection
                navSection
                socialSection
                phoneRecSection
                logoutSection
                deleteSection
                debugSections
            }
            .listStyle(.insetGrouped)
            .navigationTitle(Loc.t("nav.profile", lang))
            .brandToolbar(Loc.t("nav.profile", lang))
            .toolbar { ToolbarItem(placement: .topBarTrailing) { SyncButton() } }
            .alert(Loc.t("profile.editName", lang), isPresented: $editing) { nameAlertButtons }
            .alert(Loc.t("profile.deleteAccount", lang), isPresented: $confirmingDelete) {
                deleteAlertButtons
            } message: {
                Text(Loc.t("profile.deleteConfirm", lang))
            }
            .onChange(of: avatarItem) { item in uploadAvatar(item) }
        }
    }

    // MARK: - Abschnitte

    private var headerSection: some View {
        Section {
            HStack(spacing: 14) {
                PhotosPicker(selection: $avatarItem, matching: .images) { avatar }
                    .buttonStyle(.plain)
                VStack(alignment: .leading, spacing: 2) {
                    Text(session.profile?.display_name ?? "—").font(.headline)
                    emailLine
                }
                Spacer()
                Button {
                    startNameEdit()
                } label: { Image(systemName: "pencil") }
                .buttonStyle(.borderless)
            }
            .padding(.vertical, 4)
        }
    }

    @ViewBuilder private var emailLine: some View {
        if let email = session.profile?.email {
            Text(email).font(.subheadline).foregroundStyle(.secondary)
        }
    }

    // Übersicht wie die PWA: nur EIN „Uhr"-Eintrag (Koppeln/Alarm/Datenseiten dahinter)
    // + darunter „Verknüpfte Konten". Kein Uhr-Status/Garmin direkt in der Übersicht.
    private var navSection: some View {
        Section {
            navRow("nav.watch", "applewatch") { WatchView() }
            navRow("accounts.title", "link") { LinkedAccountsView() }
            foilsRow
            navRow("profile.calc", "function") { FoilCalculatorView() }
            navRow("profile.stats", "chart.bar") { FoilStatsView() }
            navRow("profile.compare", "arrow.left.arrow.right") { CompareView() }
            navRow("settings.title", "gearshape") { SettingsView() }
            Link(Loc.t("profile.web", lang), destination: URL(string: "https://pumpfoil.org")!)
        }
    }

    // Eigene Zeile, weil das Icon kein SF-Symbol ist (Marken-Foil-Icon).
    private var foilsRow: some View {
        NavigationLink {
            FoilsView()
        } label: {
            Label { Text(Loc.t("profile.foils", lang)) } icon: { FoilIcon(tint: .accentColor).frame(width: 22, height: 22) }
        }
    }

    // Social-Kanäle (wie im Web-Menü): öffnen in Safari/der jeweiligen App.
    private var socialSection: some View {
        Section {
            socialRow("YouTube", "https://www.youtube.com/@pumpfoil-org", "play.rectangle")
            socialRow("Instagram", "https://www.instagram.com/pumpfoil_org/", "camera")
            socialRow("TikTok", "https://www.tiktok.com/@pumpfoil.org", "music.note")
        }
    }

    // „Record on Phone" — hängt NUR am lokalen Toggle, NICHT mehr an profile.beta
    // (Server-Flag wird für echte private Betas frei, siehe docs/TODO); steuert den
    // Aufnahme-Button auf der Startseite (lokale Einstellung auf diesem Gerät).
    private var phoneRecSection: some View {
        Section {
            Toggle(isOn: $phoneRecEnabled) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(Loc.t("profile.phoneRec", lang))
                    Text(Loc.t("profile.phoneRecSub", lang)).font(.caption).foregroundStyle(.secondary)
                    waterproofHint
                }
            }
        }
    }

    @ViewBuilder private var waterproofHint: some View {
        if phoneRecEnabled {
            Text(Loc.t("rec.waterproof", lang)).font(.caption).bold().foregroundStyle(.red)
        }
    }

    private var logoutSection: some View {
        Section {
            Button(Loc.t("profile.logout", lang), role: .destructive) { session.logout() }
        }
    }

    // Konto-Löschung (App-Store-Pflicht 5.1.1(v)): DSGVO-Delete + danach abmelden.
    private var deleteSection: some View {
        Section {
            Button(Loc.t("profile.deleteAccount", lang), role: .destructive) { confirmingDelete = true }
        } footer: {
            Text(versionFooterText)
        }
    }

    @ViewBuilder private var debugSections: some View {
        #if DEBUG
        // Nur Debug: App-Rating-Dialog neu triggerbar machen (Test-Flags löschen).
        Section {
            Button("↻ Rating-Test zurücksetzen") { resetRatingFlags() }
        }
        // Nur Debug: Age-Gate erzwingen -> verifiziert Feed/Chat-Sperre (Tabs blenden aus).
        Section {
            Button("Age-Gate AN (<13)") { setAgeGate(allowed: false, bracket: "under13") }
            Button("Age-Gate AUS (18+)") { setAgeGate(allowed: true, bracket: "18+") }
        } header: {
            Text(ageGateDebugHeader)
        }
        #endif
    }

    // MARK: - Alert-Inhalte

    @ViewBuilder private var nameAlertButtons: some View {
        TextField("Name", text: $draftName)
        Button(Loc.t("common.save", lang)) { saveName() }
        Button("Abbrechen", role: .cancel) {}
    }

    @ViewBuilder private var deleteAlertButtons: some View {
        Button(Loc.t("profile.deleteConfirmBtn", lang), role: .destructive) { deleteAccount() }
        Button(Loc.t("common.cancel", lang), role: .cancel) {}
    }

    // MARK: - Bausteine

    // NavigationLink + Label als typisierter Helfer: derselbe Ausdruck stand sechsmal im
    // ViewBuilder und kostete den Checker jedes Mal die volle Auflösung von Label/Image/Color.
    private func navRow<D: View>(_ key: String, _ symbol: String,
                                @ViewBuilder destination: () -> D) -> some View {
        NavigationLink {
            destination()
        } label: {
            Label { Text(Loc.t(key, lang)) } icon: { Image(systemName: symbol).foregroundStyle(Color.accentColor) }
        }
    }

    private func socialRow(_ title: String, _ url: String, _ symbol: String) -> some View {
        Link(destination: URL(string: url)!) {
            Label { Text(title) } icon: { Image(systemName: symbol).foregroundStyle(Color.accentColor) }
        }
    }

    // Interpolation mit Cast vorab als typisierter String — im ViewBuilder ist genau das teuer.
    private var versionFooterText: String {
        let v: String = (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String) ?? ""
        return "Pumpfoil v\(v)"
    }

    #if DEBUG
    private var ageGateDebugHeader: String {
        let flag: String = String(describing: session.profile?.social_allowed)
        return "DEBUG · Age-Gate (social_allowed = \(flag))"
    }
    #endif

    // MARK: - Ablauflogik (raus aus den Closures, s. Kommentar am Body)

    private func startNameEdit() {
        draftName = session.profile?.display_name ?? ""
        editing = true
    }

    private func saveName() {
        let n = draftName.trimmingCharacters(in: .whitespaces)
        if !n.isEmpty {
            Task { if let p = try? await Api.updateDisplayName(n) { session.profile = p } }
        }
    }

    private func deleteAccount() {
        Task { try? await Api.deleteAccount(); session.logout() }
    }

    private func uploadAvatar(_ item: PhotosPickerItem?) {
        Task {
            if let data = try? await item?.loadTransferable(type: Data.self) {
                try? await Api.uploadAvatar(data: data)
                session.profile = try? await Api.getProfile()
            }
        }
    }

    #if DEBUG
    private func resetRatingFlags() {
        ["rating_done", "rating_snooze", "rating_min_count", "rating_fb_count"].forEach {
            UserDefaults.standard.removeObject(forKey: $0)
        }
    }

    private func setAgeGate(allowed: Bool, bracket: String) {
        Task { if let p = try? await Api.setAgeRange(socialAllowed: allowed, ageBracket: bracket) { session.profile = p } }
    }
    #endif

    @ViewBuilder private var avatar: some View {
        let url = Api.mediaURL(session.profile?.avatar_url)
        NetzBild(url: url) { stand in
            switch stand {
            case .da(let img): img.resizable().scaledToFill()
            default:
                Image(systemName: "person.crop.circle.fill")
                    .resizable().scaledToFit().foregroundStyle(.secondary)
            }
        }
        .frame(width: 56, height: 56)
        .clipShape(Circle())
    }
}
