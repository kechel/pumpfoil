import SwiftUI
import PhotosUI

// Profil: Avatar (antippbar zum Ändern), Anzeigename, Navigationsziele, Abmelden.
struct ProfileView: View {
    @EnvironmentObject var session: SessionStore
    @EnvironmentObject var sync: SyncManager
    @AppStorage("appLang") private var lang = "de"
    @AppStorage("phone_rec_enabled") private var phoneRecEnabled = false
    @AppStorage("phone_live_upload") private var phoneLiveUpload = true
    @State private var editing = false
    @State private var draftName = ""
    @State private var avatarItem: PhotosPickerItem?
    @State private var confirmingDelete = false
    // Datenauskunft: fertige JSON-Datei fuer das System-Teilen-Blatt (iOS hat keinen Download).
    @State private var exportURL: ExportItem?
    @State private var exportBusy = false
    // „Meine Foils & Sportarten" (Jan, 21.10.2026, wie im Web): Standard vorn und hervorgehoben.
    @State private var meineSportarten: [ProfilEintrag] = []
    @State private var meineFoils: [ProfilEintrag] = []

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
                exportSection
                deleteSection
                debugSections
            }
            .listStyle(.insetGrouped)
            .task { await ausruestungLaden() }
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
            .sheet(item: $exportURL) { item in ActivityView(items: [item.url]) }
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
            // Unter 13 keine Freunde (Server: 403), wie Chat und Community.
            if session.profile?.social_allowed != false { FreundeZeile() }
            foilsRow
            navRow("profile.calc", "function") { FoilCalculatorView() }
            navRow("profile.stats", "chart.bar") { FoilStatsView() }
            navRow("profile.compare", "arrow.left.arrow.right") { CompareView() }
            navRow("settings.title", "gearshape") { SettingsView() }
            // Einrichtungs-Assistent: fuer ALLE und jederzeit, nicht nur fuer neue Konten
            // (die erreicht zusaetzlich die Weiche beim ersten Start, s. RootView).
            navRow("onb.startTitle", "checklist") { OnboardingView() }
            // Changelog nativ (12.10.2026, Nutzer-Meldung) — wie der Menuepunkt im Web.
            navRow("nav.changelog", "sparkles") { ChangelogView() }
            Link(Loc.t("profile.web", lang), destination: URL(string: "https://pumpfoil.org")!)
        }
    }

    // Eigene Zeile, weil das Icon kein SF-Symbol ist (Marken-Foil-Icon).
    private var foilsRow: some View {
        NavigationLink {
            FoilsView()
        } label: {
            Label { foilsRowText } icon: { FoilIcon(tint: .accentColor).frame(width: 22, height: 22) }
        }
    }

    private var foilsRowText: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(Loc.t("profile.foilsSports", lang))
            if !meineSportarten.isEmpty { profilZeile(meineSportarten) }
            if !meineFoils.isEmpty { profilZeile(meineFoils) }
        }
    }

    private func profilZeile(_ eintraege: [ProfilEintrag]) -> some View {
        var t: Text = Text("")
        for (i, e) in eintraege.enumerated() {
            if i > 0 { t = t + Text(" · ") }
            let teil: Text = e.standard ? Text(e.text).foregroundColor(.accentColor) : Text(e.text)
            t = t + teil
        }
        return t.font(.caption).foregroundColor(.secondary)
    }

    private func ausruestungLaden() async {
        guard let s = try? await Api.settings() else { return }
        let defRoh: String = (s["default_sport_class"] as? String) ?? ""
        let def: String = defRoh.isEmpty ? "pumpfoil" : defRoh
        let mine: [String] = (s["my_sports"] as? [String]) ?? []
        var sp: [ProfilEintrag] = [ProfilEintrag(text: Loc.t("cls.sport." + def, lang), standard: true)]
        for k in SPORTS where k != def && mine.contains(k) {
            sp.append(ProfilEintrag(text: Loc.t("cls.sport." + k, lang), standard: false))
        }
        meineSportarten = sp
        let ids: [Int] = ((s["my_foils"] as? [NSNumber]) ?? []).map { $0.intValue }
        let defFoil: Int? = (s["foil_id"] as? NSNumber)?.intValue
        guard !ids.isEmpty, let katalog = try? await Api.foils() else { return }
        var fs: [ProfilEintrag] = []
        for id in ids {
            guard let f = katalog.first(where: { $0.id == id }) else { continue }
            fs.append(ProfilEintrag(text: foilLabel(f.brand, f.model, f.size, f.aspect_ratio), standard: f.id == defFoil))
        }
        meineFoils = fs.filter { $0.standard } + fs.filter { !$0.standard }
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
            liveUploadToggle
        }
    }

    // Live-Upload waehrend der Aufnahme (PhoneRecorder.liveLoop), Standard an.
    @ViewBuilder private var liveUploadToggle: some View {
        if phoneRecEnabled {
            // ohne Erklaertext (Jan, 18.10.2026)
            Toggle(Loc.t("profile.phoneLive", lang), isOn: $phoneLiveUpload)
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

    // Datenauskunft (DSGVO-Gegenstueck zur Loeschung, wie in der PWA unter Einstellungen).
    private var exportSection: some View {
        Section {
            Button(Loc.t("profile.exportData", lang)) { exportiereDaten() }
                .disabled(exportBusy)
        }
    }

    private func exportiereDaten() {
        exportBusy = true
        Task {
            defer { exportBusy = false }
            // In eine Datei laden statt in den Speicher — der Export ist bei vielen Sessions
            // dreistellig MB gross (s. Api.exportMyDataToFile).
            guard let ziel = try? await Api.exportMyDataToFile() else { return }
            exportURL = ExportItem(url: ziel)
        }
    }

    // Konto-Löschung (App-Store-Pflicht 5.1.1(v)): DSGVO-Delete + danach abmelden.
    private var deleteSection: some View {
        Section {
            // Impressum/Datenschutz: war nach dem Login nirgends erreichbar, nur auf dem Login-
            // Bildschirm (Jan, 29.09.2026: „im profil ganz unten neben der versionsnummer").
            NavigationLink(Loc.t("nav.imprint", lang)) { ImpressumView() }
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

// Datei fuer das Teilen-Blatt. Gleichnamiger Typ steht auch in SessionDetailView — beide sind
// dateiprivat, das ist kein Konflikt.
private struct ExportItem: Identifiable { let id = UUID(); let url: URL }

// MARK: - Changelog

// Changelog nativ (12.10.2026, Nutzer-Meldung): dieselbe Seite wie web/src/pages/Changelog.tsx —
// oben der Release-Stand (Live / in Pruefung / abgelehnt / als Naechstes / Ideen), darunter die
// Tage, neueste zuerst. Inhalt bewusst ENGLISCH wie im Web (Memory changelog-page), uebersetzt sind
// nur Titel, „Details (n)" und die Fehlerzeile. Hier statt in einer eigenen Datei, damit kein
// xcodegen-Lauf noetig ist. Beide Abrufe sind unabhaengig: faellt der Release-Stand aus,
// verschwindet nur sein Block (wie im Web).
struct ChangelogView: View {
    @AppStorage("appLang") private var lang = "de"
    @State private var tage: [ChangelogTag]?
    @State private var fehler = false
    @State private var stand: ReleaseStand?
    @State private var sport: SportStand?

    var body: some View {
        List {
            standSections
            if let sp = sport { ChangelogSportSection(stand: sp) }
            ladeZeile
            ForEach(tage ?? []) { tag in
                ChangelogTagSection(tag: tag)
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(Loc.t("nav.changelog", lang))
        .navigationBarTitleDisplayMode(.inline)
        .feedbackToolbar("/changelog")
        .task { await laden() }
    }

    @ViewBuilder private var standSections: some View {
        if let s = stand {
            let probleme: [BekanntesProblem] = s.probleme ?? []
            if !probleme.isEmpty {
                ChangelogProblemSection(probleme: probleme)
            }
            ChangelogReleaseSection(stand: s, lang: lang)
        }
    }

    @ViewBuilder private var ladeZeile: some View {
        if fehler {
            Text(Loc.t("common.loadFailed", lang)).foregroundStyle(.secondary)
        } else if tage == nil {
            Text(Loc.t("common.loading", lang)).foregroundStyle(.secondary)
        }
    }

    /// Beide parallel laden, aber ZUSAMMEN setzen (Jan, 12.10.2026): kamen die Tage zuerst, rutschte
    /// die Release-Tabelle danach oberhalb des sichtbaren Bereichs in die Liste.
    private func laden() async {
        async let s: ReleaseStand? = try? Api.releaseStand()
        async let a: ChangelogAntwort? = try? Api.changelog()
        async let sp: SportStand? = try? Api.sportStand()
        let st: ReleaseStand? = await s
        let an: ChangelogAntwort? = await a
        let spd: SportStand? = await sp
        stand = st
        sport = spd
        if let an { tage = an.days ?? [] } else { fehler = true }
    }
}

/// `[label](ziel)` -> nur `label`. Die Links fuehren meist auf Web-Seiten; nativ bleibt der Text.
private func changelogOhneLinks(_ t: String) -> String {
    t.replacingOccurrences(of: #"\[([^\]]+)\]\(([^)]+)\)"#, with: "$1", options: .regularExpression)
}

/// „October 12, 2026" — fest Englisch wie das Web (`tagLang`).
private func changelogTagLang(_ iso: String) -> String {
    let ein = DateFormatter()
    ein.locale = Locale(identifier: "en_US_POSIX")
    ein.dateFormat = "yyyy-MM-dd"
    guard let d = ein.date(from: iso) else { return iso }
    let aus = DateFormatter()
    aus.locale = Locale(identifier: "en_US_POSIX")
    aus.dateFormat = "MMMM d, yyyy"
    return aus.string(from: d)
}

// „Analysis by sport" (19.10.2026) — wie der Abschnitt im Web (Changelog.tsx `SportStand`): je
// Sportart eine aufklappbare Zeile mit Zaehlern, aufgeklappt jedes Merkmal mit Status und Satz.
// Englisch wie die ganze Seite. Kleine Teil-Views, damit der Type-Checker nicht haengt.
private func sportStatusFarbe(_ st: String) -> Color {
    switch st {
    case "live": return .green
    case "teilweise": return .blue
    case "geplant": return Color(red: 0.76, green: 0.25, blue: 0)
    default: return .secondary
    }
}

private struct SportStatusChip: View {
    let text: String
    let status: String

    var body: some View {
        Text(text).font(.caption.weight(.medium))
            .padding(.horizontal, 7).padding(.vertical, 2)
            .foregroundStyle(sportStatusFarbe(status))
            .background(Capsule().fill(sportStatusFarbe(status).opacity(0.14)))
    }
}

private struct ChangelogSportSection: View {
    let stand: SportStand
    private let reihe = ["live", "teilweise", "geplant"]

    var body: some View {
        Section {
            legende
            // Zuerst, was fuer ALLE Sportarten gleich gilt (Jan, 19.10.2026).
            if let alle = stand.allgemein, !alle.isEmpty {
                ChangelogSportZeile(sp: SportStandSport(id: "_alle", name: stand.allgemein_titel ?? "All sports",
                                                        gruppe: "", merkmale: alle), stand: stand)
            }
            ForEach(stand.sportarten ?? [], id: \.id) { sp in
                ChangelogSportZeile(sp: sp, stand: stand)
            }
        } header: {
            Text("Analysis by sport")
        } footer: {
            Text("The analysis started with pumpfoil. This shows what is already tuned for each sport and what is planned. As of \(changelogTagLang(stand.stand ?? "")).")
        }
    }

    private var legende: some View {
        HStack(spacing: 6) {
            ForEach(reihe, id: \.self) { st in
                SportStatusChip(text: stand.status?[st] ?? st, status: st)
            }
            Text("basic = works, not tuned yet").font(.caption).foregroundStyle(.secondary)
        }
    }
}

private struct ChangelogSportZeile: View {
    let sp: SportStandSport
    let stand: SportStand
    private let reihe = ["live", "teilweise", "geplant"]

    private func zahl(_ st: String) -> Int { (sp.merkmale ?? []).filter { $0.status == st }.count }

    var body: some View {
        DisclosureGroup {
            ForEach(sp.merkmale ?? [], id: \.id) { m in
                merkmalZeile(m)
            }
        } label: {
            kopf
        }
    }

    private var kopf: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Text(sp.name ?? sp.id).font(.subheadline.weight(.medium))
                Text(sp.gruppe ?? "").font(.subheadline).foregroundStyle(.secondary)
            }
            HStack(spacing: 4) {
                ForEach(reihe.filter { zahl($0) > 0 }, id: \.self) { st in
                    SportStatusChip(text: "\(zahl(st)) \(stand.status?[st] ?? st)", status: st)
                }
            }
        }
    }

    private func merkmalZeile(_ m: SportStandMerkmal) -> some View {
        let name: String = m.name ?? (stand.merkmale ?? []).first { $0.id == m.id }?.name ?? m.id
        let st: String = m.status ?? "nein"
        let seit: String = (m.seit != nil && st != "geplant") ? " Since \(changelogTagLang(m.seit ?? ""))." : ""
        return VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 6) {
                Text(name).font(.subheadline)
                SportStatusChip(text: stand.status?[st] ?? st, status: st)
            }
            Text((m.text ?? "") + seit).font(.subheadline).foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }
}

// Bekannte Probleme — Warnbox ueber dem Release-Stand (Web `BekannteProbleme`).
private struct ChangelogProblemSection: View {
    let probleme: [BekanntesProblem]

    var body: some View {
        Section {
            ForEach(Array(probleme.enumerated()), id: \.offset) { _, p in
                zeile(p)
            }
        } header: {
            Text("Known problems right now").foregroundStyle(Color.orange)
        }
    }

    private func zeile(_ p: BekanntesProblem) -> some View {
        let kopf: String = (p.titel ?? "") + ": " + (p.text ?? "")
        return VStack(alignment: .leading, spacing: 2) {
            Text(kopf).font(.subheadline)
            if let n = p.note, !n.isEmpty {
                Text(n).font(.subheadline).foregroundStyle(.secondary)
            }
        }
    }
}

// Release-Stand: dieselben Abschnitte in derselben Reihenfolge und Farbfamilie wie das Web.
private struct ChangelogReleaseSection: View {
    let stand: ReleaseStand
    let lang: String

    private struct Gruppe { let titel: String; let farbe: Color; let zeilen: [ReleaseZeile] }

    private var gruppen: [Gruppe] {
        let alle: [Gruppe] = [
            Gruppe(titel: "Live now", farbe: .accentColor, zeilen: stand.live ?? []),
            Gruppe(titel: "Being reviewed", farbe: .green, zeilen: stand.review ?? []),
            Gruppe(titel: "Rejected", farbe: .orange, zeilen: stand.rejected ?? []),
            Gruppe(titel: "Coming next", farbe: Color(red: 1.0, green: 0x55 / 255, blue: 0), zeilen: stand.next ?? []),
        ]
        return alle.filter { !$0.zeilen.isEmpty }
    }

    var body: some View {
        Section {
            ForEach(Array(gruppen.enumerated()), id: \.offset) { _, g in
                gruppeView(g)
            }
            ideenView
        } header: {
            Text("Release status")
        } footer: {
            Text("Where everything stands right now — website, phone apps and watch apps.")
        }
    }

    private func gruppeView(_ g: Gruppe) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(g.titel.uppercased()).font(.caption.weight(.semibold)).foregroundStyle(g.farbe)
            ForEach(Array(g.zeilen.enumerated()), id: \.offset) { _, r in
                ChangelogReleaseZeile(r: r, lang: lang)
            }
        }
        .padding(.vertical, 2)
    }

    @ViewBuilder private var ideenView: some View {
        let ideen: [String] = stand.ideen ?? []
        if !ideen.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                Text("IDEAS FOR FUTURE DEVELOPMENT").font(.caption.weight(.semibold)).foregroundStyle(Color.purple)
                Text("No dates and no order — things we would like to build.")
                    .font(.subheadline).foregroundStyle(.secondary)
                ChangelogAufklapper(punkte: ideen, lang: lang)
            }
            .padding(.vertical, 2)
        }
    }
}

// Eine Einreichung: Name, Version (mit Store-Link, wenn es einen gibt), Notiz, eingeklappte Punkte.
private struct ChangelogReleaseZeile: View {
    let r: ReleaseZeile
    let lang: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(r.name ?? "").font(.subheadline.weight(.medium))
            version
            if let n = r.note, !n.isEmpty {
                Text(n).font(.subheadline).foregroundStyle(.secondary)
            }
            let punkte: [String] = r.items ?? []
            if !punkte.isEmpty {
                ChangelogAufklapper(punkte: punkte, lang: lang)
            }
        }
    }

    @ViewBuilder private var version: some View {
        let v: String = r.version ?? ""
        if let s = r.store_url, !s.isEmpty, let u = URL(string: s) {
            Link(v, destination: u).font(.subheadline.weight(.medium)).buttonStyle(.borderless)
        } else {
            Text(v).font(.subheadline.weight(.medium))
        }
    }
}

// „Details (n)" — zu, bis man es aufmacht (wie <details> im Web). `.borderless`, damit der Tipp in
// der Listenzeile nur den Knopf trifft (Memory swiftui-listenzeile-mehrere-knoepfe).
private struct ChangelogAufklapper: View {
    let punkte: [String]
    let lang: String
    @State private var offen = false

    private var titel: String {
        Loc.t("changelog.details", lang).replacingOccurrences(of: "{n}", with: String(punkte.count))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Button { offen.toggle() } label: {
                Label(titel, systemImage: offen ? "chevron.down" : "chevron.right").font(.subheadline)
            }
            .buttonStyle(.borderless)
            if offen {
                ForEach(Array(punkte.enumerated()), id: \.offset) { _, t in
                    ChangelogAufzaehlung(text: t, gedaempft: false)
                }
            }
        }
    }
}

private struct ChangelogAufzaehlung: View {
    let text: String
    let gedaempft: Bool

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text("•")
            Text(text).foregroundStyle(gedaempft ? Color.secondary : Color.primary)
        }
        .font(.subheadline)
    }
}

// Ein Tag: Datum als Kopf, darunter die Punkte. Store-Ereignisse ohne Aufzaehlungspunkt, gedaempft
// und mit Strich links — gleiche Schriftgroesse („Hinweise nie winzig"), wie im Web.
private struct ChangelogTagSection: View {
    let tag: ChangelogTag

    var body: some View {
        Section {
            ForEach(Array((tag.items ?? []).enumerated()), id: \.offset) { _, p in
                ChangelogPunktZeile(p: p)
            }
        } header: {
            Text(changelogTagLang(tag.date)).foregroundStyle(Color.accentColor)
        }
    }
}

private struct ChangelogPunktZeile: View {
    let p: ChangelogPunkt

    private var ereignis: Bool { p.art == "ereignis" }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            textZeile
            plaketten
            bild
        }
    }

    @ViewBuilder private var textZeile: some View {
        let t: String = changelogOhneLinks(p.text ?? "")
        if ereignis {
            HStack(spacing: 10) {
                Rectangle().fill(Color.secondary.opacity(0.4)).frame(width: 2)
                Text(t).font(.subheadline).foregroundStyle(.secondary)
            }
            .fixedSize(horizontal: false, vertical: true)
        } else {
            ChangelogAufzaehlung(text: t, gedaempft: false)
        }
    }

    // Plattform-Plaketten: welche App-Version den Punkt bringt (Web: `plattformen`).
    @ViewBuilder private var plaketten: some View {
        let pl: [ChangelogPlattform] = p.plattformen ?? []
        if !pl.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(Array(pl.enumerated()), id: \.offset) { _, x in
                        plakette(x)
                    }
                }
            }
            .padding(.leading, 14)
        }
    }

    private func plakette(_ x: ChangelogPlattform) -> some View {
        let n: String = x.name ?? ""
        let v: String = x.version ?? ""
        let t: String = v.isEmpty ? n : n + " " + v
        return Text(t)
            .font(.caption.weight(.medium))
            .foregroundStyle(.secondary)
            .padding(.horizontal, 8).padding(.vertical, 2)
            .background(Color(.tertiarySystemFill), in: Capsule())
    }

    @ViewBuilder private var bild: some View {
        if let u = Api.mediaURL(p.img) {
            NetzBild(url: u) { stand in
                switch stand {
                case .da(let img): img.resizable().scaledToFit()
                default: Color(.tertiarySystemBackground).frame(height: 120)
                }
            }
            .frame(maxWidth: 260)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .accessibilityLabel(p.img_alt ?? "")
            .padding(.leading, 14)
        }
    }
}

/// Ein Eintrag der Profil-Zeile „Meine Foils & Sportarten" (Sportart oder Foil; Standard hervorgehoben).
struct ProfilEintrag {
    let text: String
    let standard: Bool
}
