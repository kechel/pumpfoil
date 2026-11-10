import SwiftUI
import UniformTypeIdentifiers

// Einstellungen mit Reitern (App-Port Phase 6, docs/UX-IA.md, 04.11.2026), wie web/src/pages/Settings.tsx:
// Uebersicht · Uhren · Freunde · Team · Ausruestung · Ich · Fahren · Privatsphaere · Darstellung · Konto.
// Die Kacheln der Uebersicht schalten auf den Reiter (keine eigene Seite); Uhren, Freunde, Team und Ausruestung sind die
// vorhandenen Ansichten eingebettet, Ich/Fahren/Privatsphaere/Darstellung/Konto die Abschnitte von `SettingsView`.
// Ohne eigenen NavigationStack: die Zahnrad-Seite (`ProfileView`) legt ihn darum, Home › Profil schiebt sie mit
// `start: "privat"` auf den eigenen Stapel.
struct EinstellungenView: View {
    @EnvironmentObject var session: SessionStore
    @AppStorage("appLang") private var lang = "de"
    @State private var tab: String

    init(start: String) {
        _tab = State(initialValue: start)
    }

    private var socialOK: Bool { session.profile?.social_allowed != false }

    private var reiter: [ReiterDef] {
        var r: [ReiterDef] = [ReiterDef(id: "uebersicht", label: Loc.t("tab.overview", lang)),
                              ReiterDef(id: "konten", label: Loc.t("ptab.watches", lang))]
        // Unter 13 keine Freunde (Server: 403), wie Chat und Community.
        if socialOK { r.append(ReiterDef(id: "freunde", label: Loc.t("friends.title", lang))) }
        r.append(ReiterDef(id: "team", label: Loc.t("tab.team", lang)))
        r.append(ReiterDef(id: "sportarten", label: Loc.t("mySpots.sports", lang)))
        r.append(ReiterDef(id: "ausruestung", label: Loc.t("gear.title", lang)))
        r.append(ReiterDef(id: "ich", label: Loc.t("ptab.me", lang)))
        r.append(ReiterDef(id: "fahren", label: Loc.t("ptab.riding", lang)))
        r.append(ReiterDef(id: "privat", label: Loc.t("ptab.privacy", lang)))
        r.append(ReiterDef(id: "darstellung", label: Loc.t("ptab.display", lang)))
        r.append(ReiterDef(id: "konto", label: Loc.t("ptab.account", lang)))
        return r
    }

    var body: some View {
        VStack(spacing: 0) {
            // `unter`: Uhren und Ausruestung haben eine zweite Reiterzeile, der aktive Reiter haengt sich farblich an.
            Reiterleiste(reiter: reiter, aktiv: $tab, unter: tab == "konten" || tab == "ausruestung")
                .padding(.horizontal)
            inhalt
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    // Je Reiter eine eigene, volle Flaeche (Liste/Formular) unter der Reiterzeile.
    @ViewBuilder private var inhalt: some View {
        switch tab {
        case "konten": UhrenKontenView()
        case "freunde": FreundeView()
        case "team": EinstellungenTeamView(lang: lang)
        // Standard-Sportart, Auswahl an der Uhr, Ausruestung je Sportart (vorher Ausruestung › Sportarten).
        case "sportarten": SetupView(teil: "jeSport", eingebettet: true).id("sportarten")
        case "ausruestung": AusruestungView(eingebettet: true)
        case "ich", "fahren", "privat", "darstellung", "konto": SettingsView(teil: tab).id(tab)
        default: EinstellungenUebersicht(lang: lang, tab: $tab)
        }
    }
}

// MARK: - Uebersicht

/// Erster Reiter: Sprache ganz oben (Jan, 13.09.2026 / 02.11.2026), darunter die Kacheln, die auf die Reiter schalten,
/// dann die Wege, die es nur in der App als Liste gibt (Foil-Rechner, Stats, Vergleich, Changelog, Web, Kanaele).
struct EinstellungenUebersicht: View {
    @EnvironmentObject var session: SessionStore
    let lang: String
    @Binding var tab: String
    @AppStorage("appLang") private var appLang = "de"
    @State private var anfragen = 0
    @State private var teamAnfragen = 0
    // „Meine Foils & Sportarten" (Jan, 21.10.2026, wie im Web): Standard vorn und hervorgehoben.
    @State private var meineSportarten: [ProfilEintrag] = []
    @State private var meineFoils: [ProfilEintrag] = []
    // Import-Kachel (wie web Settings › Uebersicht „Aktivitaet importieren", 04.11.2026) — derselbe Datei-Import wie in
    // „Meine Sessions" (dateienImportieren in SessionsView.swift).
    @State private var importWaehler = false
    @State private var importLaeuft = false
    @State private var importFortschritt = ""
    @State private var importMeldung: String?
    @State private var importierteId: Int?
    @State private var oeffneImport = false
    @StateObject private var ersetzenFrage = ErsetzenFrage()

    var body: some View {
        List {
            sprachSection
            // Handy-Recorder direkt unter der Sprache, vor den Kacheln (Jan, 05.11.2026: „das ist das erste was viele
            // suchen die die app gerade neu installiert haben"); vorher im Reiter Fahren.
            PhoneRecSection(lang: lang)
            kachelSection
            wegeSection
            socialSection
        }
        .listStyle(.insetGrouped)
        .task { await laden() }
        .fileImporter(isPresented: $importWaehler, allowedContentTypes: [.data], allowsMultipleSelection: true) { ergebnis in
            if case .success(let urls) = ergebnis { importiere(urls) }
        }
        .alert(Loc.t("import.title", lang), isPresented: importMeldungAktiv) {
            Button(Loc.t("common.close", lang)) {
                importMeldung = nil
                if importierteId != nil { oeffneImport = true }
            }
        } message: {
            Text(importMeldung ?? "")
        }
        .navigationDestination(isPresented: $oeffneImport) {
            if let id = importierteId { SessionDetailView(id: id) }
        }
        .ersetzenFrageAlert(ersetzenFrage, lang: lang)
        // Sprache wirkt sofort (appLang) und geht ans Profil (synct zu Web/Uhr), wie bisher in SettingsView.
        .onChange(of: appLang) { l in Task { try? await Api.updateLanguage(l) } }
    }

    private var sprachSection: some View {
        Section(Loc.t("settings.language", lang)) {
            Picker(Loc.t("settings.language", lang), selection: $appLang) {
                ForEach(Loc.langs, id: \.self) { code in
                    Text(Loc.langName(code)).tag(code)
                }
            }
        }
    }

    @ViewBuilder private var kachelSection: some View {
        Section {
            kachel("konten", symbol: "applewatch", titel: Loc.t("tab.watchAccounts", lang), unter: Loc.t("accounts.title", lang))
            if session.profile?.social_allowed != false { freundeKachel }
            // Teams: drei Personen, die Fahne steht seit 06.11.2026 fuer Events (web fefda447 TeamIcon/EventIcon).
            kachel("team", symbol: "person.3", titel: Loc.t("team.profilKnopf", lang), unter: Loc.t("team.profilHinweis", lang), zahl: teamAnfragen)
            ausruestungKachel
            importKachel
        }
    }

    private var importMeldungAktiv: Binding<Bool> {
        Binding(get: { importMeldung != nil }, set: { if !$0 { importMeldung = nil } })
    }

    private var importKachel: some View {
        Button { importWaehler = true } label: {
            HStack(spacing: 12) {
                Image(systemName: "square.and.arrow.down").font(.title3).foregroundStyle(Color.accentColor).frame(width: 28)
                Text(Loc.t("import.title", lang)).foregroundStyle(.primary)
                Spacer(minLength: 4)
                if importLaeuft {
                    if !importFortschritt.isEmpty { Text(importFortschritt).font(.caption).foregroundStyle(.secondary) }
                    ProgressView()
                } else {
                    Image(systemName: "chevron.right").font(.caption).foregroundStyle(.secondary)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(importLaeuft)
    }

    private func importiere(_ urls: [URL]) {
        guard !urls.isEmpty else { return }
        importLaeuft = true
        // Auf dem Main-Actor: der Fortschritt setzt @State (vorher aus einem beliebigen Task heraus).
        Task { @MainActor in
            let (text, letzte) = await dateienImportieren(urls, lang: lang, fortschritt: { importFortschritt = $0 },
                                                          frage: { await ersetzenFrage.fragen($0) })
            importFortschritt = ""
            importLaeuft = false
            importierteId = letzte
            if let text { importMeldung = text } else if letzte != nil { oeffneImport = true }
        }
    }

    private var wegeSection: some View {
        Section {
            navZeile("profile.calc", "function") { FoilCalculatorView() }
            navZeile("profile.stats", "chart.bar") { FoilStatsView() }
            navZeile("profile.compare", "arrow.left.arrow.right") { CompareView() }
            // Changelog nativ (12.10.2026, Nutzer-Meldung) — wie der Menuepunkt im Web.
            navZeile("nav.changelog", "sparkles") { ChangelogView() }
            Link(Loc.t("profile.web", lang), destination: URL(string: "https://pumpfoil.org")!)
        }
    }

    // Social-Kanäle (wie im Web-Menü): öffnen in Safari/der jeweiligen App.
    private var socialSection: some View {
        Section {
            socialZeile("YouTube", "https://www.youtube.com/@pumpfoil-org", "play.rectangle")
            socialZeile("Instagram", "https://www.instagram.com/pumpfoil_org/", "camera")
            socialZeile("TikTok", "https://www.tiktok.com/@pumpfoil.org", "music.note")
        }
    }

    // MARK: Kacheln (schalten den Reiter um)

    private func kachel(_ ziel: String, symbol: String, titel: String, unter: String?, zahl: Int = 0) -> some View {
        Button { tab = ziel } label: {
            HStack(spacing: 12) {
                Image(systemName: symbol).font(.title3).foregroundStyle(Color.accentColor).frame(width: 28)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(titel).foregroundStyle(.primary)
                        if zahl > 0 { TeamAnfragenZahl(n: zahl) }
                    }
                    if let unter { Text(unter).font(.caption).foregroundStyle(.secondary) }
                }
                Spacer(minLength: 4)
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(.secondary)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var freundeKachel: some View {
        Button { tab = "freunde" } label: {
            HStack(spacing: 12) {
                Image(systemName: "person.2").font(.title3).foregroundStyle(Color.accentColor).frame(width: 28)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(Loc.t("friends.manage", lang)).foregroundStyle(.primary)
                        NeuBadge()
                        if anfragen > 0 { TeamAnfragenZahl(n: anfragen) }
                    }
                    Text(Loc.t("friends.profileHint", lang)).font(.caption).foregroundStyle(.secondary)
                }
                Spacer(minLength: 4)
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(.secondary)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var ausruestungKachel: some View {
        Button { tab = "ausruestung" } label: {
            HStack(spacing: 12) {
                FoilIcon(tint: .accentColor).frame(width: 24, height: 24).frame(width: 28)
                VStack(alignment: .leading, spacing: 2) {
                    Text(Loc.t("gear.title", lang)).foregroundStyle(.primary)
                    if !meineSportarten.isEmpty { profilZeile(meineSportarten) }
                    if !meineFoils.isEmpty { profilZeile(meineFoils) }
                }
                Spacer(minLength: 4)
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(.secondary)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
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

    // MARK: Bausteine

    private func navZeile<D: View>(_ key: String, _ symbol: String, @ViewBuilder destination: () -> D) -> some View {
        NavigationLink {
            destination()
        } label: {
            Label { Text(Loc.t(key, lang)) } icon: { Image(systemName: symbol).foregroundStyle(Color.accentColor) }
        }
    }

    private func socialZeile(_ title: String, _ url: String, _ symbol: String) -> some View {
        Link(destination: URL(string: url)!) {
            Label { Text(title) } icon: { Image(systemName: symbol).foregroundStyle(Color.accentColor) }
        }
    }

    // MARK: Laden

    private func laden() async {
        anfragen = (try? await Api.friendsCount()) ?? anfragen
        if let l = try? await Api.teamsMine() { teamAnfragen = l.reduce(0) { $0 + $1.anfragen } }
        await ausruestungLaden()
    }

    private func ausruestungLaden() async {
        guard let s = try? await Api.settings() else { return }
        let defRoh: String = (s["default_sport_class"] as? String) ?? ""
        let def: String = defRoh.isEmpty ? "pumpfoil" : defRoh
        standardSport = def
        let mine: [String] = (s["my_sports"] as? [String]) ?? []
        var sp: [ProfilEintrag] = [ProfilEintrag(text: Loc.t("cls.sport." + def, lang), standard: true)]
        for k in sortiereSports(SPORTS, lang: lang) where k != def && mine.contains(k) {
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
}

// MARK: - Uhren & Konten

/// Uhren und verknuepfte Konten in EINER Ansicht mit zweiter Reiterzeile Uhr | Polar | COROS | Suunto | Xiaomi | MCP
/// (wie /konten im Web, web LinkedAccounts.tsx; je Anbieter ein Reiter seit 04.11.2026) — fuer Home › Uhren und
/// Einstellungen › Uhren. „Uhr" hat darunter die dritte Zeile (`UhrReiterView`), die Anbieter je ihre Karte aus
/// `LinkedAccountsView`. Strava fehlt (zurueckgestellt, die App hatte nie eine Karte dafuer).
struct UhrenKontenView: View {
    @AppStorage("appLang") private var lang = "de"
    @State private var wahl: String = ReiterSpeicher.von("uhren", "uhr")
    // Garmin Connect nur, wenn der Server es diesem Konto anbietet (vor der Freigabe nur Admins/Tester, 05.11.2026).
    @State private var garmin = false

    private var reiter: [ReiterDef] {
        var r: [ReiterDef] = [ReiterDef(id: "uhr", label: Loc.t("nav.watch", lang))]
        if garmin { r.append(ReiterDef(id: "garmin", label: "Garmin Connect")) }
        return r + [ReiterDef(id: "polar", label: "Polar"),
         ReiterDef(id: "coros", label: "COROS"),
         ReiterDef(id: "suunto", label: "Suunto"),
         ReiterDef(id: "xiaomi", label: "Xiaomi"),
         ReiterDef(id: "mcp", label: "MCP")]
    }

    /// Unbekannter Wert (z. B. "konten" aus der alten Aufteilung) -> „Uhr".
    private var aktiv: String { reiter.contains(where: { $0.id == wahl }) ? wahl : "uhr" }

    var body: some View {
        VStack(spacing: 0) {
            Reiterleiste(reiter: reiter, aktiv: Binding(get: { aktiv }, set: { wahl = $0; ReiterSpeicher.setze("uhren", $0) }),
                         stufe: 2)
                .padding(.horizontal).padding(.top, 8)
            if aktiv == "uhr" {
                UhrReiterView()
            } else {
                // `.id`: je Anbieter eine frische Ansicht (eigener Stand, eigenes Laden).
                LinkedAccountsView(eingebettet: true, nur: aktiv).id(aktiv)
            }
        }
        .task { garmin = (try? await Api.integrationStatus("garmin"))?.available ?? false }
        // Garmin-Hinweise (LinkedAccountsView GarminZiel): auf Garmin Connect bzw. auf „Uhr" schalten.
        .onReceive(NotificationCenter.default.publisher(for: .garminZiel)) { n in
            wahl = (n.object as? String) == "gc" ? "garmin" : "uhr"
            if wahl == "garmin" { garmin = true }
        }
    }
}

// MARK: - Team

/// Einstellungen › Team (wie web Teams.tsx eingebettet): eigene Teams (aktiv und angefragt), die Teamsuche und darunter
/// das Gruenden — seit 04.11.2026 nativ (TeamGruenden.swift), verwaltet wird in TeamVerwaltung.swift.
struct EinstellungenTeamView: View {
    let lang: String
    @State private var teams: [TeamKurz]? = nil

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                meineTeams
                TeamSuche(lang: lang)
                TeamGruendenKarte(lang: lang)
                linkZeile
            }
            .padding()
        }
        .task { teams = (try? await Api.teamsMine()) ?? teams ?? [] }
        .refreshable { teams = (try? await Api.teamsMine()) ?? teams }
    }

    @ViewBuilder private var meineTeams: some View {
        if let t = teams {
            if t.isEmpty {
                Text(Loc.t("team.keineTeams", lang)).font(.subheadline).foregroundStyle(.secondary)
            } else {
                VStack(spacing: 0) {
                    ForEach(t) { tm in zeile(tm) }
                }
                .padding(6)
                .background(RoundedRectangle(cornerRadius: 12).fill(Color(.secondarySystemBackground)))
                if mehrereWertbar {
                    Text(Loc.t("team.primaerHinweis", lang)).font(.footnote).foregroundStyle(.secondary)
                }
            }
        } else {
            ProgressView().frame(maxWidth: .infinity)
        }
    }

    // Primaeres Team (web Teams.tsx, 10.11.2026): nur sinnvoll, wenn man in mehr als einem Team ist, das in globalen
    // Events zaehlt.
    private var mehrereWertbar: Bool { (teams ?? []).filter { $0.wertbar == true }.count > 1 }

    private func primaerSetzen(_ slug: String) {
        Task {
            guard (try? await Api.teamPrimaer(slug)) != nil else { return }
            teams = (try? await Api.teamsMine()) ?? teams
        }
    }

    @ViewBuilder private func primaerMarke(_ tm: TeamKurz) -> some View {
        if mehrereWertbar && tm.primaer == true {
            Text("★ " + Loc.t("team.primaer", lang))
                .font(.caption.weight(.semibold)).foregroundStyle(Color.accentColor)
                .padding(.horizontal, 8).padding(.vertical, 2)
                .background(Color.accentColor.opacity(0.15), in: Capsule())
        } else if mehrereWertbar && tm.wertbar == true {
            Button { primaerSetzen(tm.slug) } label: {
                Text("☆ " + Loc.t("team.primaerSetzen", lang)).font(.caption).foregroundStyle(.secondary)
                    .padding(.horizontal, 8).padding(.vertical, 2)
                    .overlay(Capsule().stroke(Color.secondary.opacity(0.5), lineWidth: 1))
            }
            .buttonStyle(.borderless)
        }
    }

    private func rolleText(_ tm: TeamKurz) -> String {
        let r: String = Loc.t(tm.status == "angefragt" ? "team.join.wartet" : "team.rolle." + tm.rolle, lang)
        // Freigabe-Stand fuer die Leitung (wie web Teams.tsx), solange der Auftritt nicht frei ist.
        guard let f = tm.freigabe, f != "frei" else { return r }
        return r + " · " + teamFreigabeText(f, lang)
    }

    private func zeile(_ tm: TeamKurz) -> some View {
        NavigationLink { TeamView(slug: tm.slug) } label: {
            HStack(spacing: 10) {
                TeamWappen(name: tm.name, logo: tm.logo_url, farbe: tm.farbe, size: 40)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 5) {
                        Text(tm.name).font(.subheadline.weight(.semibold)).foregroundStyle(TeamFarbe(tm.farbe).akzent).lineLimit(1)
                        TeamHerkunftMarke(land: tm.land)
                    }
                    Text(rolleText(tm)).font(.caption).foregroundStyle(.secondary)
                    let sp: String = teamSportartenText(tm.sportarten, lang)
                    if !sp.isEmpty { Text(sp).font(.caption).foregroundStyle(.secondary).lineLimit(1) }
                    primaerMarke(tm)
                }
                Spacer(minLength: 4)
                if tm.anfragen > 0 { TeamAnfragenZahl(n: tm.anfragen) }
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(.secondary)
            }
            .padding(8)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var linkZeile: some View {
        HStack(spacing: 16) {
            NavigationLink { TeamsAlleView() } label: {
                Text(Loc.t("team.alle", lang) + " →").font(.subheadline).foregroundStyle(Color.accentColor)
            }
            NavigationLink { EventsAlleView() } label: {
                Text(Loc.t("team.alleEvents", lang) + " →").font(.subheadline).foregroundStyle(Color.accentColor)
            }
        }
    }
}

/// Suche durch alle freigegebenen Teams (web `TeamSuche`, 04.11.2026). Dieselbe Regel wie alle Suchen (`passtZu` in
/// Models.swift, wie web/src/lib/suche.ts): klein, ohne Akzente, Bindestriche und Leerzeichen egal, jedes Wort muss
/// vorkommen. Treffer erst mit Suchbegriff, die groessten Teams zuerst. Fuer Einstellungen › Team und Home › Team
/// ohne eigenes Team — beide liegen in einem ScrollView, nicht in einer List (mehrere Links in einer Listenzeile).
struct TeamSuche: View {
    let lang: String
    @State private var q = ""
    @State private var alle: [TeamListenEintrag]? = nil

    private var treffer: [TeamListenEintrag] {
        let ql: String = q.trimmingCharacters(in: .whitespaces)
        guard !ql.isEmpty, let a = alle else { return [] }
        return a.filter { passtZu(ql, $0.name + " " + $0.slug) }.sorted { $0.mitglieder_anzahl > $1.mitglieder_anzahl }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(Loc.t("team.finden", lang)).font(.subheadline.weight(.semibold))
            TextField(Loc.t("team.findenPlatzhalter", lang), text: $q)
                .textFieldStyle(.roundedBorder)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            ergebnis
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(.secondarySystemBackground)))
        .task { if alle == nil { alle = (try? await Api.teamsListe()) ?? [] } }
    }

    @ViewBuilder private var ergebnis: some View {
        if !q.trimmingCharacters(in: .whitespaces).isEmpty && alle != nil {
            if treffer.isEmpty {
                Text(Loc.t("gear.noHits", lang)).font(.subheadline).foregroundStyle(.secondary)
            } else {
                VStack(spacing: 0) {
                    ForEach(treffer) { tm in zeile(tm) }
                }
            }
        }
    }

    private func unterzeile(_ tm: TeamListenEintrag) -> String {
        let n: String = teamText(tm.mitglieder_anzahl == 1 ? "team.mitgliederAnzahl1" : "team.mitgliederAnzahl", lang, ["n": String(tm.mitglieder_anzahl)])
        let sp: String = teamSportartenText(tm.sportarten, lang)
        return sp.isEmpty ? n : n + " · " + sp
    }

    private func zeile(_ tm: TeamListenEintrag) -> some View {
        NavigationLink { TeamView(slug: tm.slug) } label: {
            HStack(spacing: 10) {
                TeamWappen(name: tm.name, logo: tm.logo_url, farbe: tm.farbe, size: 36)
                VStack(alignment: .leading, spacing: 2) {
                    Text(tm.name).font(.subheadline.weight(.medium)).foregroundStyle(.primary).lineLimit(1)
                    Text(unterzeile(tm)).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer(minLength: 4)
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(.secondary)
            }
            .padding(.vertical, 6)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
