import SwiftUI
import UIKit

// Prozessweiter App-Start-Zeitpunkt: Rating erst nach >2 min in der App (siehe maybeShowRating).
enum AppSession { static let launch = Date() }

// Persönliches Dashboard: Gesamt-Kennzahlen, Rekorde (klickbar zur Session), letzte Sessions.
struct HomeView: View {
    @EnvironmentObject var session: SessionStore
    @EnvironmentObject var sync: SyncManager
    @AppStorage("appLang") private var lang = "de"
    // Programmatische Navigation fuer die Rekord-Kacheln (LazyVGrid) — s. CommunityView.
    @State private var navPath = NavigationPath()
    @State private var homeTab: String = ReiterSpeicher.von("home", "uebersicht")   // App-Port Phase 3 (Reiter)
    // Events (web EventHinweis.tsx, 06.11.2026): globale fuer die Hinweise auf der Uebersicht, die der eigenen Teams fuer
    // Home › Team (Kacheln + Abzeichen am Reiter). Hier geladen, weil die Ansichten leer starten (s. EventHinweise).
    @State private var globalEvents: [TeamEventKurz] = []
    @State private var teamEvents: [TeamEventKurz] = []
    // Zweite Reiterzeile unter Home › Stats (wie web PersonalHome `StatsBereich`): Verlauf · Kennzahlen · Lage des Bretts.
    @State private var statsTab: String = ReiterSpeicher.von("homestats", "verlauf")
    // Home › Spots (Phase 4): alle Spots mit eigenen Sessions (nil = laedt noch).
    @State private var meineSpots: [MeinSpot]? = nil
    // Home › Profil (Phase 5): Vorschau der eigenen Foiler-Seite als Freunde | Alle, Standard Alle (wie im Web).
    @State private var profilAls = "alle"

    @State private var stats: OverallStats?
    @State private var latest: [SessionSummary] = []
    @State private var latestGeladen = false   // vorher kein „keine Sessions" (s. load)
    @State private var weather: SpotWeather?
    // Homespot als Link in der Zeile „Letzte Sessions" (Jan, 16.10.2026)
    @State private var homespotName: String? = nil
    @State private var loading = true
    // Rekorde: nur Accel (präzise) oder alle (inkl. GPS-only). Default nur Accel,
    // aber einmalig auf "alle" fallen, wenn der Nutzer gar keine Accel-Läufe hat.
    @State private var accelOnly = true
    // Zeitraum der Rekorde UND Gesamtwerte (Paritaet Punkt 8): beides kommt aus derselben
    // Abfrage, "30 Tage" heisst also auch Foiling/Pumps der letzten 30 Tage.
    // Vorgabe seit 30.08. "10 Tage" statt "Allzeit" (wie PWA): die Startseite soll zeigen, wie es
    // GERADE laeuft — und der Block "je Foil" bleibt damit von selbst kurz.
    @State private var zeitraum = HomeView.standardZeitraum
    // true, solange das Fenster nicht von Hand gewaehlt wurde -> Rueckfall auf die naechste
    // Stufe erlaubt, wenn es im gewaehlten Fenster gar keine Session gibt.
    @State private var fensterAuto = true
    // Dieselben Kacheln zusaetzlich je Foil (PWA 30.08.). Eigene Abfrage, eigener Fehlerfall:
    // faellt sie aus, fehlt nur der Block — die Startseite bleibt vollstaendig.
    @State private var byFoil: [FoilStatsGroup] = []
    // Sportart der eigenen Rekorde (Paritaet Punkt 7). nil = der Server nimmt die haeufigste
    // und sagt in der Antwort, welche es war.
    @State private var sportart: String?
    @State private var decidedDefault = false
    @State private var updateVer: String?
    @State private var updateURL = ""
    @State private var updateDismissed = false
    @State private var community: Api.CommunityStats?
    @State private var startSuccess: StartSuccess?   // persönliche Home-Stats (unten)
    @State private var carveStats: CarveStats?
    @State private var bilanz: Jahresbilanz?
    @State private var sportRek: [SportRekordeZeile] = []
    @State private var bilanzJahr: Int?
    @State private var manVerlauf: ManoeverVerlauf?
    // Zeitfenster wie PWA: heute / gestern / 10 T / 30 T / 1 J / gesamt.
    private let statWindows: [(String, String)] = [("today", "period.today"), ("yesterday", "period.yesterday"), ("10d", "period.10d"), ("30d", "period.30d"), ("365d", "period.365d"), ("all", "period.all")]
    // Vorgabefenster und die Kette, auf die zurueckgefallen wird, solange der Nutzer nicht
    // selbst gewaehlt hat: 10 Tage -> 30 Tage -> 1 Jahr -> Allzeit (PWA 30.08.).
    static let standardZeitraum = "10d"
    private let rueckfall = ["10d", "30d", "365d", "all"]
    // News-Banner DB-gesteuert (wie PWA): der AppStorage-Wert = zuletzt weggeklickte VERSION.
    @AppStorage("foil_banner_v1") private var newsVerStored = 0
    @State private var news: NewsBanner?
    // App-Rating: ab 5 gesyncten Sessions; >=4★ -> nie mehr; Später -> 14 T; Feedback (<=3★) ->
    // 14 T (ab 2. Mal 3 Monate), erst wieder wenn seither neue Sessions da sind.
    @AppStorage("rating_done") private var ratingDone = false
    @AppStorage("rating_snooze") private var ratingSnooze = 0.0
    @AppStorage("rating_min_count") private var ratingMinCount = 0
    @AppStorage("rating_fb_count") private var ratingFbCount = 0
    @State private var showRating = false
    @AppStorage("phone_rec_enabled") private var phoneRecEnabled = false
    @State private var showRecord = false
    @State private var incomingXfer = 0
    private var showBanner: Bool { if let n = news { return n.enabled && n.version > newsVerStored } else { return false } }

    private let cols = [GridItem(.flexible()), GridItem(.flexible())]
    private let cols3 = [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())]

    // Der Body war EIN Ausdruck (66 Zeilen: 11 Kinder + 14 Modifier mit Closures) und stand mit
    // >500 ms im Build-Log — Swifts Type-Checker loest einen ViewBuilder als einen einzigen Ausdruck
    // auf. Jeder Abschnitt ist jetzt ein eigener, typisierter Teil; Ablauflogik steckt in Methoden.
    var body: some View {
        NavigationStack(path: $navPath) {
            seite
                // Wert-basiertes Session-Ziel (s. SessionDest in Models.swift) — die
                // Rekord-Kacheln unten sind ein LazyVGrid, closure-Links pushten dort doppelt.
                .navigationDestination(for: SessionDest.self) { d in
                    SessionDetailView(id: d.id, dataVersion: d.dataVersion, vorwahlLauf: d.vorwahlLauf, sprintKz: d.sprintKz)
                }
                // Ziele der eingebetteten Foiler-Seite (Home › Profil), wie in FoilerSheet.
                .navigationDestination(for: SpotDest.self) { d in
                    SpotSessionsView(spot: d.spot, vorgegebeneSpotId: d.spotId, sport: d.sport)
                }
                .navigationDestination(for: FoilerChatDest.self) { d in
                    ChatRoomView(scope: d.scope, title: d.name, otherId: d.otherId)
                }
                .navigationTitle(Loc.t("nav.home", lang))
                // Feedback-Knopf kommt jetzt aus brandToolbar (auf jeder Seite, mit Seiten-URL).
                .brandToolbar(Loc.t("nav.home", lang), feedbackUrl: "/")
                .fullScreenCover(isPresented: $showRecord) { RecordView() }
                .sheet(isPresented: $showRating) { ratingSheet }
                .overlay { if loading && stats == nil { ProgressView() } }
                .refreshable { await load() }
                .task { await load() }
                .task { await checkUpdate() }
                .task(id: sync.tick) { await eventsLaden() }
                .onChange(of: sync.tick) { _ in Task { await load() } }
                .onChange(of: stats?.count) { _ in maybeShowRating() }
                .task { await ratingAfterDelay() }
                // Garmin-Hinweis (GarminBeidesBanner): auf den Reiter Uhren schalten, darin GarminZiel den Unterreiter.
                .onReceive(NotificationCenter.default.publisher(for: .garminZiel)) { _ in homeTab = "uhren" }
                .onChange(of: accelOnly) { _ in ladeStats() }
                .onChange(of: zeitraum) { _ in ladeStats() }
                .onChange(of: sportart) { _ in ladeStats() }
        }
    }

    // Uhren und Profil sind eigene Listen (WatchView/LinkedAccountsView, FoilerView) und fuellen den Platz unter der
    // Reiterzeile; eine Liste in einem ScrollView haette keine Hoehe. Alle anderen Reiter scrollen mit Begruessung und
    // Hinweisen wie bisher.
    @ViewBuilder private var seite: some View {
        if homeTab == "uhren" || homeTab == "profil" {
            VStack(spacing: 0) {
                homeReiterleiste
                    .padding(.horizontal).padding(.top, 8)
                if homeTab == "uhren" { UhrenKontenView() } else { homeProfil }
            }
        } else {
            ScrollView { homeStack }
        }
    }

    private var homeReiterleiste: some View {
        Reiterleiste(reiter: homeReiter, aktiv: Binding(get: { homeTab }, set: { homeTab = $0; ReiterSpeicher.setze("home", $0) }),
                     unter: homeTab == "spots" || homeTab == "uhren" || homeTab == "stats")
    }

    private var homeStack: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Live-Upload-Karte ganz oben: eigene Session lädt gerade hoch (Parität zur PWA).
            UploadProgressCard()
            UhrenLiveStatus()
            updateBannerIfAny
            newsBannerIfAny
            // Garmin: genau eines von beiden verbunden -> Hinweis aufs andere (Web PersonalHome, 05.11.2026).
            GarminBeidesBanner()
            greetingRow
            // Reiter wie im Web (docs/UX-IA.md, App-Port Phase 3–5, 04.11.2026): Uebersicht · Rekorde · Team · Spots · Stats ·
            // Uhren · Profil. Je Reiter ein eigener Ausdruck (Type-Checker); Uhren und Profil s. `seite`.
            homeReiterleiste
            switch homeTab {
            case "rekorde": homeRekorde
            case "team": HomeTeamsListe(lang: lang, neuLadenTick: sync.tick, teamEvents: teamEvents)
            case "spots": HomeSpotsBereich(lang: lang, liste: meineSpots, homespotName: homespotName)
            case "stats": homeStats
            case "performance": PerformanceBereich(lang: lang)
            default: homeUebersicht
            }
        }
        .padding(.horizontal).padding(.bottom).padding(.top, 2)
    }

    private var homeReiter: [ReiterDef] {
        // Reihenfolge wie im Web (Jan 21.11.2026): Overview, Performance, Spots, Team, Records, Stats, Watches, Profile
        var r: [ReiterDef] = [ReiterDef(id: "uebersicht", label: Loc.t("tab.overview", lang)),
                              ReiterDef(id: "performance", label: Loc.t("tab.performance", lang))]
        // „Spots" nur mit Homespot oder eigenen Spots (wie im Web).
        if homespotName != nil || !(meineSpots ?? []).isEmpty { r.append(ReiterDef(id: "spots", label: Loc.t("nav.spots", lang))) }
        // Abzeichen: LIVE bzw. Zahl der kommenden Events der eigenen Teams (web 03fd4574).
        r.append(ReiterDef(id: "team", label: Loc.t("tab.team", lang), abzeichen: reiterAbzeichen(teamEvents)))
        r.append(ReiterDef(id: "rekorde", label: Loc.t("side.records", lang)))
        r.append(ReiterDef(id: "stats", label: Loc.t("tab.stats", lang)))
        r.append(ReiterDef(id: "uhren", label: Loc.t("ptab.watches", lang)))
        if session.profile?.id != nil { r.append(ReiterDef(id: "profil", label: Loc.t("nav.profile", lang))) }
        return r
    }

    // Home › Profil: die eigene Foiler-Seite, so wie andere sie sehen koennen. Oben der Hinweis, die Vorschau Freunde |
    // Alle („nur ich" waere dasselbe wie Freunde, die sehen alles) und das Zahnrad zur Privatsphaere, wo man festlegt,
    // was andere sehen (Jan, 04.11.2026).
    @ViewBuilder private var homeProfil: some View {
        if let uid = session.profile?.id {
            VStack(spacing: 0) {
                profilKopf
                    .padding(.horizontal).padding(.vertical, 8)
                FoilerView(userId: uid, pfad: $navPath, als: profilAls, eingebettet: true)
                    .id(profilAls)
            }
        }
    }

    private var profilKopf: some View {
        HStack(spacing: 8) {
            Text(Loc.t("phome.profileHint", lang)).font(.subheadline).foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 4)
            Picker("", selection: $profilAls) {
                Text(Loc.t("phome.asFriends", lang)).tag("freunde")
                Text(Loc.t("phome.asAll", lang)).tag("alle")
            }
            .pickerStyle(.segmented)
            .fixedSize()
            NavigationLink {
                EinstellungenView(start: "privat")
                    .brandToolbar(Loc.t("nav.settings", lang), feedbackUrl: "/einstellungen")
            } label: {
                Image(systemName: "gearshape").font(.title3).foregroundStyle(Color.accentColor)
            }
            .accessibilityLabel(Loc.t("ptab.privacy", lang))
        }
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(.secondarySystemBackground)))
    }

    @ViewBuilder private var homeUebersicht: some View {
        // Laufendes oder bald beginnendes globales Event (web 5ac875bc, 06.11.2026).
        if !globalEvents.isEmpty { EventHinweise(lang: lang, events: globalEvents) }
        if incomingXfer > 0 { transferHint }
        if let n = session.profile?.needs_classification, n > 0 { needsClassHint(n) }
        if let n = session.profile?.sorted_out_new, n > 0 { aussortiertHinweis(n) }
        latestSection
        // Neue Kommentare & Likes an den eigenen Sessions (PWA NeuBeiMir, 03.11.2026) — direkt unter den letzten Sessions.
        NeuBeiMirAbschnitt(lang: lang, neuLadenTick: sync.tick)
        // Freunde mit ihrer letzten Session (PWA FreundeLetzte), darunter der Community-Link.
        FreundeLetzteAbschnitt(lang: lang, neuLadenTick: sync.tick)
        // Wetter am Homespot direkt unter den letzten Sessions (Jan, 25.09.2026).
        if let sw = weather { HomeWeatherCard(sw: sw, lang: lang) }
    }

    private func eventsLaden() async {
        async let g: [TeamEventKurz]? = try? Api.teamsEventsAktuell()
        if let t = try? await Api.teamsEventsMeine() { teamEvents = t }
        if let gl = await g { globalEvents = gl }
    }

    @ViewBuilder private var homeRekorde: some View {
        if let st = stats { recordsSection(st) }
        // Eigene Bestwerte je Sportart (20.10.2026), eine Zeile je Sportart.
        if !sportRek.isEmpty { SportRekordeZeilenView(zeilen: sportRek, titel: Loc.t("phome.sportRec", lang), lang: lang) }
    }

    // Home › Stats wie im Web (StatsBereich in web/src/pages/PersonalHome.tsx, 04.11.2026): zweite Reiterzeile mit genau
    // dessen Reitern. Der Verlauf steht eingebettet hier (vorher ein Link auf die eigene Seite); Jahresbilanz,
    // Start-Erfolgsquote, Carves sowie Wenden & Halsen untereinander unter „Kennzahlen"; die Lage des Bretts erklaert sich
    // selbst, wenn es keine Brett-Aufnahmen gibt.
    private var statsReiter: [ReiterDef] {
        [ReiterDef(id: "verlauf", label: Loc.t("nav.history", lang)),
         ReiterDef(id: "kennzahlen", label: Loc.t("tab.insights", lang)),
         ReiterDef(id: "brett", label: Loc.t("home.boardAttitude", lang)),
         // Tempo-Verteilung (web 7cbc6abf, 24.11.2026)
         ReiterDef(id: "tempo", label: Loc.t("tempo.tab", lang))]
    }

    @ViewBuilder private var homeStats: some View {
        Reiterleiste(reiter: statsReiter, aktiv: Binding(get: { statsTab }, set: { statsTab = $0; ReiterSpeicher.setze("homestats", $0) }),
                     stufe: 2)
        switch statsTab {
        case "kennzahlen": statsKennzahlen
        case "brett": BrettLageStartseite(lang: lang, erklaerungWennLeer: true)
        case "tempo": TempoBereich(lang: lang)
        default: VerlaufView(eingebettet: true)
        }
    }

    private var hatKennzahlen: Bool {
        if let b = bilanz, !b.jahre.isEmpty { return true }
        if startSuccess != nil { return true }
        if let cs = carveStats, carveStatsHasAny(cs) { return true }
        if let mv = manVerlauf, mv.monate.contains(where: { $0.wende + $0.halse > 0 }) { return true }
        return false
    }

    @ViewBuilder private var statsKennzahlen: some View {
        if let b = bilanz, !b.jahre.isEmpty { bilanzSection(b) }
        if let ss = startSuccess { startSuccessSection(ss) }
        if let cs = carveStats, carveStatsHasAny(cs) { carveStatsSection(cs) }
        if let mv = manVerlauf, mv.monate.contains(where: { $0.wende + $0.halse > 0 }) { manoeverSection(mv) }
        if !hatKennzahlen { Text(Loc.t("tab.noData", lang)).font(.subheadline).foregroundStyle(.secondary) }
    }

    @ViewBuilder private var updateBannerIfAny: some View {
        if let uv = updateVer, !updateDismissed { updateBanner(uv) }
    }

    @ViewBuilder private var newsBannerIfAny: some View {
        if showBanner, let n = news { welcomeBanner(n) }
    }

    // Darunter: Freunde gerade am Pumpen (15.10.2026) — neben der Begruessung ist auf dem iPhone
    // kein Platz. Im selben Stapel mit Abstand 0, damit die leere Zeile keinen Abstand kostet (sie
    // muss da sein, sonst laedt sie nie). Unter 13 gibt es keine Freunde.
    private var greetingRow: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(helloText).font(.title2).bold()
                Spacer()
                recordButton
            }
            if session.profile?.social_allowed != false {
                FreundePumpenZeile()
                FreundesAnfragenKarte()
            }
            // Die eigenen Teams stehen seit dem App-Port im Reiter „Team" (04.11.2026), nicht mehr hier als Links.
        }
        .padding(.top, 12)
    }

    // Hängt NUR am lokalen Toggle, NICHT mehr an profile.beta (Server-Flag
    // wird für echte private Betas frei, siehe docs/TODO).
    @ViewBuilder private var recordButton: some View {
        if phoneRecEnabled {
            Button { showRecord = true } label: {
                Label(Loc.t("home.recordBtn", lang), systemImage: "record.circle")
                    .font(.headline)
            }.buttonStyle(.borderedProminent).controlSize(.large)
        }
    }

    private var ratingSheet: some View {
        RatingView(
            lang: lang,
            onLater: { ratingSnooze = Date().timeIntervalSince1970 + 14 * 24 * 3600 },
            onRated: { ratingDone = true },   // >=4 Sterne -> nie mehr
            onFeedback: { onRatingFeedback() })
    }

    private func onRatingFeedback() {
        ratingFbCount += 1
        let days: Double = ratingFbCount >= 2 ? 90 : 14   // ab 2. Feedback 3-Monats-Rhythmus
        ratingSnooze = Date().timeIntervalSince1970 + days * 24 * 3600
        ratingMinCount = stats?.count ?? 0                // erst wieder bei neuen Sessions
    }

    // Rating frühestens 2 min nach App-Start prüfen (auch wenn stats früher da sind).
    private func ratingAfterDelay() async {
        let wait: Double = max(0, 120 - Date().timeIntervalSince(AppSession.launch))
        try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000))
        maybeShowRating()
    }

    // Willkommens-/Community-Banner (schließbar). Spiegelt web WelcomeBanner.
    // In typisierte Teil-Views zerlegt (Type-Checker-Hänger beim Archivieren) — [[ios-swift-typecheck-hang]].
    private var helloText: String {
        (session.profile?.display_name?.isEmpty == false)
            ? Loc.t("phome.hello", lang).replacingOccurrences(of: "{name}", with: session.profile!.display_name!)
            : Loc.t("nav.home", lang)
    }

    // Offene Sportart-Zuordnung (docs/sport-classification.md): jemand hat gebeten, eine eigene
    // Session einzuordnen. Bewusst KEIN Push -- dieser Hinweis reicht und erklaert in Ruhe, statt
    // unaufgefordert nach Vorwurf zu klingen. Bei genau einer Session direkt dorthin.
    @ViewBuilder private func needsClassHint(_ n: Int) -> some View {
        let one = n == 1
        let sid = session.profile?.needs_classification_id
        let text = one
            ? Loc.t("home.needsClassification", lang)
            : Loc.t("home.needsClassificationN", lang).replacingOccurrences(of: "{n}", with: "\(n)")
        NavigationLink {
            if one, let sid { SessionDetailView(id: sid) } else { SessionsView() }
        } label: {
            HStack(spacing: 10) {
                Image(systemName: "questionmark.circle").foregroundStyle(.orange)
                Text(text).font(.subheadline)
                Spacer()
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(.secondary)
            }
            .padding(12)
            .frame(maxWidth: .infinity)
            .background(RoundedRectangle(cornerRadius: 12).fill(Color.orange.opacity(0.12)))
        }
        .buttonStyle(.plain)
    }

    // Aussortierte Aufnahmen: nur ein EINZEILER, und nur solange etwas Frisches dabei ist
    // (letzte 7 Tage, Server: sorted_out_new) -> verfaellt von selbst, nichts wegzuklicken. Die
    // Erklaerung steht absichtlich erst in der Aussortiert-Ansicht.
    @ViewBuilder private func aussortiertHinweis(_ n: Int) -> some View {
        let text = n == 1
            ? Loc.t("home.sortedOut", lang)
            : Loc.t("home.sortedOutN", lang).replacingOccurrences(of: "{n}", with: "\(n)")
        NavigationLink { SessionsView(startFilter: "other") } label: {
            HStack(spacing: 10) {
                Text(text).font(.subheadline)
                Spacer()
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(.secondary)
            }
            .padding(12)
            .frame(maxWidth: .infinity)
            .background(RoundedRectangle(cornerRadius: 12).fill(Color.orange.opacity(0.12)))
        }
        .buttonStyle(.plain)
    }

    private var transferHint: some View {
        NavigationLink { SessionsView() } label: {
            HStack(spacing: 10) {
                Image(systemName: "paperplane.fill").foregroundStyle(Color.accentColor)
                Text(Loc.t("transfer.homeHint", lang)).font(.subheadline)
                Spacer()
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(.secondary)
            }
            .padding(12)
            .frame(maxWidth: .infinity)
            .background(RoundedRectangle(cornerRadius: 12).fill(Color.accentColor.opacity(0.12)))
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder private var latestSection: some View {
        HStack {
            Text(Loc.t("phome.latest", lang)).font(.headline)
            Spacer()
            if let hs = homespotName {
                NavigationLink { SpotSessionsView(spot: hs) } label: {
                    Label(hs, systemImage: "mappin.and.ellipse").font(.caption).lineLimit(1)
                        .foregroundStyle(Color.accentColor).frame(maxWidth: 120)
                }
            }
            // Kacheln / eine Zeile je Session (PWA PersonalHome, 30.09.2026) — gilt fuer alle Listen.
            ListenAnsichtUmschalter(lang: lang)
            NavigationLink { SessionsView() } label: {
                Text("\(Loc.t("phome.allMine", lang)) →").font(.caption).foregroundStyle(Color.accentColor)
            }
        }
        if latest.isEmpty && !latestGeladen {
            ProgressView().frame(maxWidth: .infinity).padding(20)
        } else if latest.isEmpty {
            Text(Loc.t("sessions.empty", lang))
                .foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .center)
                .padding(20).background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
        } else {
            VStack(spacing: 0) {
                ForEach(latest) { s in
                    NavigationLink(value: SessionDest(id: s.id, dataVersion: s.data_version)) { SessionRow(session: s) }
                        .buttonStyle(.plain)
                    Divider()
                }
            }
        }
    }

    @ViewBuilder private func recordsSection(_ st: OverallStats) -> some View {
        HStack(spacing: 8) {
            Text(Loc.t("side.records", lang)).font(.headline)
            HStack(spacing: 4) {
                segButton(Loc.t("side.onlyAccel", lang), active: accelOnly) { accelOnly = true }
                segButton(Loc.t("side.all", lang), active: !accelOnly) { accelOnly = false }
            }
        }
        // Sportart — nur wenn es ueberhaupt mehr als eine gibt (Paritaet Punkt 7). Ein Auswahlfeld
        // mit einem Eintrag waere Ballast. Voreinstellung kommt vom Server.
        if let liste = st.sports, liste.count > 1 {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(liste) { sc in
                        segButton("\(Loc.t("cls.sport.\(sc.sport)", lang)) (\(sc.sessions))",
                                  active: (sportart ?? st.sport) == sc.sport) { sportart = sc.sport }
                    }
                }
            }
        }
        // Zeitraum: wirkt auf Rekorde UND Gesamtwerte (Paritaet Punkt 8). Waagerecht scrollbar,
        // damit fuenf Knoepfe auch auf schmalen iPhones alle erreichbar bleiben.
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(statWindows, id: \.0) { w in
                    segButton(Loc.t(w.1, lang), active: zeitraum == w.0) { fensterAuto = false; zeitraum = w.0 }
                }
            }
        }
        kachelGitter(st)

        // Dieselben Kacheln je Foil. Erst ab ZWEI Gruppen — bei einem einzigen Foil waere der
        // Block eine wortgleiche Wiederholung der Zahlen darueber. Welche Foils auftauchen,
        // entscheidet das gewaehlte Zeitfenster (PWA 30.08.).
        if byFoil.count > 1 {
            Text(Loc.t("phome.byFoil", lang).uppercased())
                .font(.caption).fontWeight(.semibold).foregroundStyle(.secondary)
                .padding(.top, 6)
            ForEach(byFoil) { g in
                foilBlock(g)
            }
        }
    }

    /// Die zehn Kacheln: 5 Rekorde (klickbar) + 5 Gesamtwerte.
    ///
    /// EINE Quelle fuer die Gesamtansicht UND jeden Foil-Block darunter — sonst driften
    /// Reihenfolge und Formatierung auseinander (`recTilesOf`/`statTilesOf` in PersonalHome.tsx).
    @ViewBuilder private func kachelGitter(_ st: OverallStats) -> some View {
        let r = st.records
        LazyVGrid(columns: cols3, spacing: 10) {
            recTile(r?.distance, Loc.t("rec.farthestRun", lang)) { meterOderKm($0) }
            recTile(r?.duration, Loc.t("rec.longestRun", lang)) { fmtDur($0) }
            recTile(r?.speed, Loc.t("rec.topSpeed", lang)) { String(format: "%.1f km/h", $0 * 3.6) }
            recTile(r?.glide, Loc.t("rec.longestGlide", lang)) { String(format: "%.1f s", $0) }
            recTile(r?.runs, Loc.t("rec.mostRuns", lang)) { "\(Int($0))" }
            tile("\(st.count ?? 0)", Loc.t("side.sessions", lang))
            tile("\(st.runs_total ?? 0)", Loc.t("stat.runs", lang))
            tile(String(format: "%.1f km", st.foiling_km ?? 0), Loc.t("side.foiling", lang))
            tile(fmtMin(st.foiling_min ?? 0), Loc.t("side.foilingTime", lang))
            tile("\(st.pumps ?? 0)", Loc.t("side.pumps", lang))
        }
    }

    /// Ein Foil mit Ueberschrift (Name + Session-Zahl) und seinem eigenen Kachelgitter.
    /// Bewusst eigene Funktion: der Titel-Ausdruck ist optional-lastig und laesst den
    /// Swift-Typpruefer sonst lange rechnen (s. docs — komplexe SwiftUI-Ausdruecke aufbrechen).
    @ViewBuilder private func foilBlock(_ g: FoilStatsGroup) -> some View {
        // brand/model/size sind nur in der Gruppe "ohne Foil" leer.
        let titel: String = g.foil_id != nil
            ? foilLabel(g.brand, g.model, g.size, g.aspect_ratio)
            : Loc.t("phome.noFoil", lang)
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .lastTextBaseline, spacing: 6) {
                Text(titel).font(.subheadline).fontWeight(.semibold).lineLimit(2)
                Text("\(g.sessions) \(Loc.t("side.sessions", lang))")
                    .font(.caption2).foregroundStyle(.secondary)
                Spacer(minLength: 0)
            }
            kachelGitter(g.stats)
        }
        .padding(.top, 4)
    }

    @ViewBuilder private func welcomeBanner(_ n: NewsBanner) -> some View {
        let newsText: String = n.texts[lang] ?? n.texts["de"] ?? ""
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    if !newsText.isEmpty {
                        Text(newsText).font(.subheadline).bold().foregroundStyle(Color.accentColor)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    bannerMsgLine
                }
                Spacer(minLength: 4)
                Button { newsVerStored = n.version } label: { Image(systemName: "xmark") }
                    .buttonStyle(.plain).foregroundStyle(.secondary)
            }
            if let c = community {
                CommunityStatsText(stats: c, lang: lang).font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.accentColor.opacity(0.12))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    // Text-Verkettung explizit als Text typisiert: jedes „+" zwingt den Type-Checker durch alle
    // Operator-Ueberladungen — im ViewBuilder war das mit Abstand der teuerste Teil des Banners.
    private var bannerMsgLine: some View {
        let msg: String = " " + Loc.t("banner.msg", lang)
        let line: Text = Text("👋 ") + Text("Pumpfoil.org").bold() + Text(msg)
        return line.font(.subheadline).fixedSize(horizontal: false, vertical: true)
    }

    // Nicht-blockierender Update-Hinweis (wie das PWA-Update-Banner).
    @ViewBuilder private func updateBanner(_ version: String) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(Loc.t("update.available", lang)).font(.subheadline).bold()
                Text("Version \(version)").font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Button(Loc.t("update.action", lang)) { openStore() }
                .buttonStyle(.borderedProminent).controlSize(.small)
            Button { updateDismissed = true } label: { Image(systemName: "xmark") }
                .buttonStyle(.plain).foregroundStyle(.secondary)
        }
        .padding(12)
        .background(Color.accentColor.opacity(0.15))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // Fallback-URL, falls der Server keine Store-URL mitschickt. Als Methode statt als Ternaer in
    // der Button-Aktion (Ablauflogik im ViewBuilder kostet den Type-Checker unnoetig viel).
    private func openStore() {
        let s: String = updateURL.isEmpty ? "https://apps.apple.com/app/pumpfoil" : updateURL
        if let url = URL(string: s) { UIApplication.shared.open(url) }
    }

    private func maybeShowRating() {
        guard Date().timeIntervalSince(AppSession.launch) >= 120 else { return }   // erst >2 min in der App
        let c = stats?.count ?? 0
        if c >= 5 && !ratingDone && Date().timeIntervalSince1970 >= ratingSnooze && c > ratingMinCount {
            showRating = true
        }
    }

    private func checkUpdate() async {
        news = try? await Api.newsBanner()
        community = try? await Api.communityStats()
        guard let a = try? await Api.appLatest(platform: "ios"), !a.latest.isEmpty else { return }
        let current = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0"
        if Self.versionNewer(a.latest, current) { updateVer = a.latest; updateURL = a.store_url }
    }

    // Semantischer Versionsvergleich "1.1.8" > "1.1.5".
    static func versionNewer(_ latest: String, _ current: String) -> Bool {
        func parts(_ v: String) -> [Int] { v.split(separator: ".").map { Int($0.filter(\.isNumber)) ?? 0 } }
        let a = parts(latest), b = parts(current)
        for i in 0..<max(a.count, b.count) {
            let x = i < a.count ? a[i] : 0, y = i < b.count ? b[i] : 0
            if x != y { return x > y }
        }
        return false
    }

    private func tile(_ value: String, _ label: String, _ date: String? = nil) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(.title3).bold().foregroundStyle(Color.accentColor)
            Text(label).font(.caption).foregroundStyle(.secondary)
            if let date { Text(date).font(.caption2).foregroundStyle(.secondary) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    @ViewBuilder private func recordTile(_ value: String, _ label: String, _ sessionId: Int?, _ startedAt: String? = nil, _ tz: String? = nil) -> some View {
        let date = startedAt.flatMap { TimeFmt.dateNumeric($0, tz) }
        if let sessionId {
            Button { navPath.append(SessionDest(id: sessionId)) } label: { tile(value, label, date) }
                .buttonStyle(.plain)
        } else {
            tile(value, label, date)
        }
    }

    private func dateText(_ s: SessionSummary) -> String {
        TimeFmt.dateTime(s.started_at, s.tz) ?? s.started_at
    }
    private func fmtDur(_ s: Double) -> String { fmtLaufDauer(s) }
    // Foiling-Zeit aus Minuten, Format wie Web-fmtDur: "X h Y min" bzw. "Y min".
    private func fmtMin(_ min: Double) -> String {
        let h = Int(min) / 60, m = Int(min.rounded()) % 60
        return h > 0 ? "\(h) h \(m) min" : "\(m) min"
    }

    // Rekord-Kachel: klickbar zur Session wenn Wert > 0, sonst "–".
    @ViewBuilder private func recTile(_ rec: RecordEntry?, _ label: String, _ fmt: (Double) -> String) -> some View {
        let v = rec?.value ?? 0
        if v > 0 { recordTile(fmt(v), label, rec?.session_id, rec?.started_at, rec?.tz) }
        else { tile("–", label) }
    }

    /// Stats neu holen — von allen drei Umschaltern aus (Accel/alle, Sportart, Zeitraum).
    private func ladeStats() {
        Task {
            guard let s = try? await Api.stats(accelOnly: accelOnly, period: zeitraum, sport: sportart) else { return }
            if rueckfallNoetig(s) { return }        // Fenster wurde weitergestellt -> onChange laedt neu
            stats = s
            byFoil = (try? await Api.statsByFoil(accelOnly: accelOnly, period: zeitraum, sport: sportart)) ?? []
        }
    }

    /// Leeres Fenster? Eine Stufe weiter aufmachen statt leere Kacheln zu zeigen — aber nur,
    /// solange der Nutzer den Zeitraum nicht selbst gewaehlt hat (PWA 30.08.: 38 % der Nutzer
    /// haben in den letzten 10 Tagen keine Session).
    /// Rueckgabe true = Fenster wurde weitergestellt, der Aufrufer bricht ab.
    private func rueckfallNoetig(_ s: OverallStats) -> Bool {
        guard fensterAuto, (s.count ?? 0) == 0,
              let i = rueckfall.firstIndex(of: zeitraum), i < rueckfall.count - 1 else {
            fensterAuto = false          // ab hier steht das Fenster (leer oder nicht)
            return false
        }
        zeitraum = rueckfall[i + 1]
        return true
    }

    @ViewBuilder
    private func segButton(_ label: String, active: Bool, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label).font(.caption).fontWeight(.medium)
                .padding(.horizontal, 10).padding(.vertical, 4)
                .background(active ? Color.accentColor : Color.secondary.opacity(0.18))
                .foregroundColor(active ? .white : .secondary)
                .clipShape(Capsule())
        }.buttonStyle(.plain)
    }

    private func load() async {
        loading = true; defer { loading = false }
        // Wer von der Startseite aus eine Session öffnet, kommt aus KEINER gefilterten Liste —
        // dann sollen „älter/neuer" dort wieder durch die eigenen Sessions gehen und nicht durch
        // den Spot, den man vorhin angeschaut hat (s. NachbarFilter.swift).
        NachbarFilter.aktuell = .leer
        if let s = try? await Api.stats(accelOnly: accelOnly, period: zeitraum, sport: sportart) {
            let r = s.records
            let noAccel = (r?.distance?.value ?? 0) == 0 && (r?.duration?.value ?? 0) == 0 && (r?.speed?.value ?? 0) == 0
            // Der Accel-Standard wird NUR im Standardfenster entschieden: in einem kurzen
            // Fenster sind leere Rekorde normal und wuerden den Umschalter grundlos umlegen.
            if !decidedDefault && accelOnly && noAccel && zeitraum == HomeView.standardZeitraum {
                decidedDefault = true; accelOnly = false   // onChange lädt Stats mit "alle" neu
            } else if !rueckfallNoetig(s) {                // sonst: leeres Fenster weiterstellen
                decidedDefault = true; stats = s
                byFoil = (try? await Api.statsByFoil(accelOnly: accelOnly, period: zeitraum, sport: sportart)) ?? []
            }
        }
        // Nur die drei neuesten holen, und bei einem Fehler die bisherige Liste behalten (06.11.2026: Jan sah „No sessions",
        // weil die ganze Liste geladen wurde und „laedt noch"/„Fehler" wie „leer" aussahen).
        if let neu = try? await Api.sessions(limit: 3) { latest = Array(neu.prefix(3)); latestGeladen = true }
        // `homespot_effective` statt `homespot` (s. settings.py): sonst blieb die Wetterkarte
        // bei fast allen aus, obwohl das Profil „Automatisch (letzte Session)" versprach.
        let einst = try? await Api.settings()
        let hs = (einst?["homespot_effective"] as? String) ?? (einst?["homespot"] as? String)
        if let hs, !hs.isEmpty { weather = try? await Api.spotWeather(hs) } else { weather = nil }
        homespotName = (hs?.isEmpty == false) ? hs : nil
        meineSpots = (try? await Api.mySpotsStats()) ?? meineSpots ?? []
        incomingXfer = ((try? await Api.transfersIncoming()) ?? []).count
        startSuccess = try? await Api.startSuccess()
        carveStats = try? await Api.carveStats()
        bilanz = try? await Api.jahresbilanz()
        sportRek = (try? await Api.sportRekorde())?.sportarten ?? sportRek
        manVerlauf = try? await Api.manoeverVerlauf()
    }

    // --- Persönliche Home-Stats (unten), wie PWA PersonalHome ---
    private func carveStatsHasAny(_ cs: CarveStats) -> Bool {
        cs.windows.values.contains { ($0.s + $0.m + $0.l) > 0 }
    }

    // Eigene Schwelle: ab welcher Distanz ein Start als echter Lauf gilt. Der aktuelle Wert ist
    // immer dabei, auch wenn er nicht in der Vorschlagsliste steht (der Server erlaubt jeden Wert).
    // KEIN Schwellen-Picker mehr: die Quote ist versuchsbasiert (attempts gegen echte Laeufe),
    // die Distanz-Schwelle ist wirkungslos — der Server liefert threshold_m nur noch als
    // Kompat-Konstante 0. Der Picker sprang deshalb immer auf 0 zurueck (PWA-Bug 02.08.).
    @ViewBuilder private func startSuccessSection(_ ss: StartSuccess) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Text(Loc.t("home.startSuccess", lang)).font(.headline)
                Spacer()
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(statWindows, id: \.0) { win in startSuccessTile(ss, win) }
                }
            }
        }
    }

    // Kachel + Beschriftungen als eigene, typisierte Teile: die Optional-Ketten (rate.map, ?? 0)
    // standen sonst mitten im ViewBuilder und wurden je ForEach-Element mitgeloest.
    private func startSuccessTile(_ ss: StartSuccess, _ win: (String, String)) -> some View {
        let w: SSWindow? = ss.windows[win.0]
        return VStack(spacing: 2) {
            Text(rateText(w)).font(.title3).bold()
            Text(Loc.t(win.1, lang)).font(.caption2).foregroundStyle(.secondary)
            Text(ratioText(w)).font(.caption2).foregroundStyle(.secondary)
        }
        .frame(minWidth: 64).padding(8)
        .background(Color.secondary.opacity(0.08)).clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func rateText(_ w: SSWindow?) -> String {
        guard let r = w?.rate else { return "–" }
        return "\(r)%"
    }

    private func ratioText(_ w: SSWindow?) -> String {
        let s: Int = w?.success ?? 0
        let t: Int = w?.total ?? 0
        return "\(s)/\(t)"
    }

    // Wenden/Halsen auf dem Foil je Monat (19.10.2026, wie im Web), neueste oben, hoechstens 12.
    @ViewBuilder private func manoeverSection(_ mv: ManoeverVerlauf) -> some View {
        let monate: [ManoeverMonat] = Array(mv.monate.filter { $0.wende + $0.halse > 0 }.suffix(12).reversed())
        VStack(alignment: .leading, spacing: 6) {
            Text(Loc.t("phome.manTitle", lang)).font(.headline)
            VStack(alignment: .leading, spacing: 4) {
                ForEach(monate, id: \.monat) { m in
                    Text(m.monat).font(.subheadline.weight(.semibold))
                    Text(manoeverZeile(m)).font(.caption).foregroundStyle(.secondary)
                }
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 10).fill(Color.secondary.opacity(0.08)))
        }
    }

    private func manoeverZeile(_ m: ManoeverMonat) -> String {
        func zelle(_ d: Int, _ n: Int) -> String { n > 0 ? "\(d) / \(n) (\(Int((100.0 * Double(d) / Double(n)).rounded())) %)" : "–" }
        return "\(Loc.t("sd.jibes", lang)) \(zelle(m.halse_durch, m.halse)) · \(Loc.t("sd.tacks", lang)) \(zelle(m.wende_durch, m.wende))"
    }

    // Jahresbilanz je Sportart (19.10.2026, wie im Web): Jahr waehlen, je Sportart eine Zeile.
    @ViewBuilder private func bilanzSection(_ b: Jahresbilanz) -> some View {
        let gewaehlt: BilanzJahr = b.jahre.first(where: { $0.jahr == bilanzJahr }) ?? b.jahre[0]
        VStack(alignment: .leading, spacing: 6) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    Text(Loc.t("phome.ybTitle", lang)).font(.headline)
                    ForEach(Array(b.jahre.prefix(5)), id: \.jahr) { j in
                        Button { bilanzJahr = j.jahr } label: {
                            Text(String(j.jahr)).font(.caption)
                                .padding(.horizontal, 10).padding(.vertical, 4)
                                .background(Capsule().fill(j.jahr == gewaehlt.jahr ? Color.accentColor : Color.secondary.opacity(0.15)))
                                .foregroundStyle(j.jahr == gewaehlt.jahr ? Color.black : Color.primary)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            VStack(alignment: .leading, spacing: 4) {
                ForEach(gewaehlt.sportarten, id: \.sport) { x in
                    Text(Loc.t("cls.sport.\(x.sport)", lang)).font(.subheadline.weight(.semibold))
                    Text(bilanzZeile(x)).font(.caption).foregroundStyle(.secondary)
                }
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 10).fill(Color.secondary.opacity(0.08)))
        }
    }

    private func bilanzZeile(_ x: BilanzSport) -> String {
        "\(x.sessions) \(Loc.t("phome.ybSessions", lang)) · " + String(format: "%.1f h · %.1f km · %.1f km ", x.stunden, x.km, x.foil_km)
            + Loc.t("home.foiling", lang)
    }

    @ViewBuilder private func carveStatsSection(_ cs: CarveStats) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Carves").font(.headline)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(statWindows, id: \.0) { win in carveTile(cs, win) }
                }
            }
        }
    }

    private func carveTile(_ cs: CarveStats, _ win: (String, String)) -> some View {
        let w: CarveWin? = cs.windows[win.0]
        return VStack(alignment: .leading, spacing: 2) {
            Text(Loc.t(win.1, lang)).font(.caption2).foregroundStyle(.secondary)
            Text(carveLine("90–180°", w?.s)).font(.caption)
            Text(carveLine("180–360°", w?.m)).font(.caption)
            Text(carveLine(">360°", w?.l)).font(.caption)
        }
        .padding(8).background(Color.secondary.opacity(0.08)).clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func carveLine(_ label: String, _ n: Int?) -> String {
        let v: Int = n ?? 0
        return label + ": \(v)"
    }
}

// Wetter-Karte am Homespot: aktuell + 3-Tage-Vorschau (Wind in kn, Boen, Niederschlag),
// darunter Pegelstand und Wassertemperatur samt Quellen — wie `web/src/components/SpotWeather.tsx`.
//
// Nimmt das GANZE `SpotWeather`, nicht nur den Wetterblock: Pegel und Wassertemperatur haengen
// daneben und werden auch gezeigt, wenn die Vorhersage fehlt (so macht es die PWA auch).
struct HomeWeatherCard: View {
    let sw: SpotWeather
    let lang: String
    private var wb: WeatherBlock? { sw.weather }
    /// Ueberschrift. Vorgabe ist „Wetter am Homespot" — in einer SPOT-Ansicht ist das falsch,
    /// dort steht der Titel der PWA („Wetter & Pegel"). Aufgefallen am 07.09.2026 im Simulator:
    /// die Spot-Seite trug die Homespot-Ueberschrift, weil sie diese Karte wiederverwendet.
    var titelKey: String = "home.weather"
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(Loc.t(titelKey, lang)).font(.caption).foregroundStyle(.secondary)
            if let c = wb?.current {
                HStack(spacing: 10) {
                    Text(wxIcon(c.code)).font(.title2)
                    if let t = c.temp { Text("\(Int(t.rounded()))°").font(.title2.bold()) }
                    if let w = c.wind {
                        Text("\(Int(w.rounded())) kn \(dirLabel(c.dir, lang))").font(.subheadline).foregroundStyle(.secondary)
                    }
                    Text(Loc.t("wx.now", lang)).font(.caption2).foregroundStyle(.secondary)
                }
            }
            if let days = wb?.days, !days.isEmpty {
                HStack {
                    ForEach(Array(days.prefix(3).enumerated()), id: \.offset) { i, d in
                        VStack(spacing: 2) {
                            Text(dayLabel(i, d.date, lang)).font(.caption2).foregroundStyle(.secondary)
                            Text(wxIcon(d.code))
                            Text(d.tmax.map { "\(Int($0.rounded()))°" } ?? "–").font(.caption)
                            if let wm = d.wind_max { Text("\(Int(wm.rounded())) kn").font(.caption2).foregroundStyle(.secondary) }
                            if let g = d.gust_max {
                                Text("(\(Loc.t("wx.gust", lang)) \(Int(g.rounded())))")
                                    .font(.caption2).foregroundStyle(.secondary)
                            }
                            if let p = d.precip, p > 0 {
                                Text(String(format: "☔ %.1f mm", p)).font(.caption2).foregroundStyle(.secondary)
                            }
                        }
                        .frame(maxWidth: .infinity)
                    }
                }
            }
            pegelZeile
            wasserZeile
            // Quellenangabe — dieselben drei Quellen wie im Web (Open-Meteo immer, die anderen
            // nur, wenn ihr Block auch Daten geliefert hat).
            Text(quellenText)
                .font(.caption2).foregroundStyle(.secondary)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }

    /// Pegelstand: Wert + Trendpfeil + Gewaesser/Station (km), wie in der PWA. Eigene Teilansicht,
    /// damit der Ausdruck im `body` kurz bleibt (s. Memory `ios-swift-typecheck-hang`).
    @ViewBuilder private var pegelZeile: some View {
        if let pg = sw.pegel, let v = pg.value {
            Text(pegelText(pg, v)).font(.caption).foregroundStyle(.secondary)
        }
    }

    /// Die drei Wetter-Zeilen bauen ihren Text in EINZELNEN, explizit typisierten Schritten.
    /// Vorher stand je eine Kette aus fuenf bis sieben `+` im View — fuer Swifts Type-Checker
    /// EIN Ausdruck, in dem er alle Ueberladungen von `+` durchprobiert. Jans Build brach am
    /// 11.09.2026 genau daran ab („unable to type-check this expression in reasonable time").
    /// Gleiche Ausgabe, nur in Anweisungen zerlegt.
    private func pegelText(_ pg: Pegel, _ v: Double) -> String {
        let wert: String = String(format: "%.0f", v)
        let einheit: String = pg.unit ?? "cm"
        var out: String = Loc.t("wx.level", lang)
        out += ": "
        out += wert
        out += " "
        out += einheit
        out += trendPfeil(pg.trend)
        out += "  "
        out += pegelOrt(pg)
        return out
    }

    private func wasserText(_ w: WaterTemp, _ c: Double) -> String {
        var out: String = "🌊 "
        out += Loc.t("wx.water", lang)
        out += ": "
        out += String(format: "%.1f °C", c)
        out += wasserSpanne(w)
        return out
    }

    private var quellenText: String {
        var out: String = Loc.t("wx.source", lang)
        out += ": Open-Meteo.com"
        if sw.pegel != nil { out += " · PEGELONLINE" }
        if let q = sw.water?.source { out += " · "; out += q }
        return out
    }

    /// Wassertemperatur: aktuell, Tagesspanne, Mittel.
    @ViewBuilder private var wasserZeile: some View {
        if let w = sw.water, let c = w.current {
            Text(wasserText(w, c)).font(.caption).foregroundStyle(.secondary)
        }
    }

    private func trendPfeil(_ t: Double?) -> String {
        guard let t else { return "" }
        return t > 0 ? " ↗" : (t < 0 ? " ↘" : " →")
    }

    private func pegelOrt(_ pg: Pegel) -> String {
        var teile: [String] = []
        if let w = pg.water, !w.isEmpty { teile.append(String(w.prefix(1)) + w.dropFirst().lowercased()) }
        if let st = pg.station, !st.isEmpty { teile.append(st) }
        var out = teile.joined(separator: " · ")
        if let km = pg.km { out += String(format: " (%.0f km)", km) }
        return out
    }

    private func wasserSpanne(_ w: WaterTemp) -> String {
        var out = ""
        if let mi = w.min, let ma = w.max {
            out += "   " + Loc.t("wx.today", lang) + String(format: " %.1f–%.1f °C", mi, ma)
        }
        if let a = w.avg { out += String(format: "   ⌀ %.1f °C", a) }
        return out
    }
}

private func wxIcon(_ code: Int?) -> String {
    guard let code else { return "•" }
    switch code {
    case 0: return "☀️"
    case 1, 2: return "🌤️"
    case 3: return "☁️"
    case 4...48: return "🌫️"
    case 49...57: return "🌦️"
    case 58...67: return "🌧️"
    case 68...77: return "🌨️"
    case 78...82: return "🌦️"
    case 83...86: return "🌨️"
    default: return "⛈️"
    }
}

// Himmelsrichtungen in der Sprache der App (map.compass, wie die PWA seit 16.10.2026)
private func dirLabel(_ deg: Double?, _ lang: String) -> String {
    guard let deg else { return "" }
    let teile: [String] = Loc.t("map.compass", lang).split(separator: ",").map(String.init)
    let r: [String] = teile.count == 8 ? teile : ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
    return r[(Int((deg / 45).rounded()) % 8 + 8) % 8]
}

private func dayLabel(_ i: Int, _ date: String?, _ lang: String) -> String {
    if i == 0 { return Loc.t("wx.today", lang) }
    if i == 1 { return Loc.t("wx.tomorrow", lang) }
    guard let date else { return "" }
    let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
    guard let d = f.date(from: date) else { return "" }
    let wf = DateFormatter(); wf.dateFormat = "EE"
    return wf.string(from: d)
}

/// Strecke ab 1000 m in km (Jan, 01.10.2026: „23647 m" beim weitesten Lauf).
func meterOderKm(_ m: Double) -> String { m < 1000 ? "\(Int(m.rounded())) m" : String(format: "%.2f km", m / 1000) }


// MARK: - Home › Performance (Web PerformanceBereich.tsx, 18.11.2026; Idee eines Fahrers)
// Je Kalendertag (UTC) die EIGENE Platzierung in vier Kategorien gegen alle Fahrer weltweit (/api/community/performance).
// Foil Scoot nur zusammen mit Pumpfoil (Jan 18.11.: zu wenige Scooter fuer ein eigenes Feld). Hier statt in einer neuen
// Datei, damit kein xcodegen-Lauf noetig ist.

struct PerfZeile: Codable {
    let tag: String
    let wert: Double
    let platz: Int
    let feld: Int
    let perzentil: Double
    let session_id: Int
    let run_idx: Int?      // Lauf in der Session (Server seit 20.11.2026, nur Einzel-Lauf-Kategorien) -> direkt dorthin
    let vorlaeufig: Bool?  // laufender Tag (UTC): noch vorlaeufig, Server rechnet alle ~10 min neu -> gelb hinterlegt
}

let perfVorlGelb = Color(red: 0.99, green: 0.83, blue: 0.30)   // Hinterlegung des laufenden Tags (Web amber-300)
let perfVorlPunkt = Color(red: 0.96, green: 0.62, blue: 0.04)  // Punkt des laufenden Tags (Web amber-500)

struct PerfRegel: Codable {
    let platz: [Int]
    let mitmachen: Int
    let min_feld: Int
    let kategorien: [String]
    let max_tag: Int
}

// Saison mit Punkten ab 1.1.2027 (Jan 20.11.2026), Server community._saison; fehlt bei aelteren Servern
struct PerfSaison: Codable {
    let jahr: Int
    let gestartet: Bool
    let punkte: Int
    let tage: Int
    let rang: Int?
    let fahrer: Int
    let regel: PerfRegel
}

struct PerfAntwort: Codable {
    let sport: String
    let min_feld: Int
    let ab: String
    let kategorien: [String: [PerfZeile]]
    let saison: PerfSaison?
    let saison_jahre: [Int]?          // begonnene Saisons -> Zeitraum „Seit 1.1.<jahr>" (Web 21.11.2026)
}

// Zwei Tempo-, zwei Ausdauer-Kategorien (Vorschlag eines Fahrers 19.11.2026, Jan 20.11.): Zeit auf dem Foil am Tag statt
// laengster Laufzeit. Der Server liefert `run_time` fuer aeltere Apps weiter.
private let perfKats: [String] = ["sprint_100m", "sprint_60s", "run_distance", "foil_time_day"]
private let perfCyan = Color(red: 34 / 255, green: 211 / 255, blue: 238 / 255)   // Markenfarbe (brand-design)
// Akzent wie Web text-brand-700 / dark:text-brand-400
private let perfAkzent = Color(UIColor { $0.userInterfaceStyle == .dark
    ? UIColor(red: 34 / 255, green: 211 / 255, blue: 238 / 255, alpha: 1)
    : UIColor(red: 14 / 255, green: 116 / 255, blue: 144 / 255, alpha: 1) })
// Eigene Icons wie im Web (scripts/perf-icons/bauen.py erzeugt die Assets aus web Icons.tsx, Jan 20.11.2026)
private let perfKatIcon: [String: String] = ["sprint_100m": "PerfSprint100", "sprint_60s": "PerfSprintMinute",
                                             "run_distance": "PerfLongestRun", "foil_time_day": "PerfFoilTime"]
private func perfIcon(_ name: String, _ groesse: CGFloat) -> some View {
    Image(name).renderingMode(.template).resizable().scaledToFit().frame(width: groesse, height: groesse)
        .foregroundStyle(perfAkzent).accessibilityHidden(true)
}
/// Ziel eines Verweises: direkt der Lauf, bei Sprints mit Sprint-Anzeige (wie die Bestenlisten).
private func perfZiel(_ k: String, _ z: PerfZeile) -> SessionDetailView {
    SessionDetailView(id: z.session_id, vorwahlLauf: z.run_idx, sprintKz: z.run_idx != nil && k.hasPrefix("sprint_") ? k : nil)
}
private let perfBuckets: [(String, (Int) -> Bool)] = [
    ("1", { $0 == 1 }), ("2", { $0 == 2 }), ("3", { $0 == 3 }),
    ("4–5", { $0 >= 4 && $0 <= 5 }), ("6–10", { $0 >= 6 && $0 <= 10 }),
    // Weitere Stufen (Jan 18.11.2026): die Felder haben 15 bis 80 Fahrer, „11+" sagte zu wenig.
    ("11–20", { $0 >= 11 && $0 <= 20 }), ("21–30", { $0 >= 21 && $0 <= 30 }), ("31–50", { $0 >= 31 && $0 <= 50 }),
    ("51+", { $0 > 50 })]

private func perfWertText(_ k: String, _ v: Double) -> String {
    if k == "sprint_100m" || k == "sprint_60s" { return String(format: "%.1f km/h", v * 3.6) }
    if k == "run_distance" { return v >= 1000 ? String(format: "%.1f km", v / 1000) : "\(Int(v.rounded())) m" }   // ab 1000 m in km (Web 21.11.2026)
    let s: Int = Int(v.rounded())
    if s >= 3600 { return String(format: "%d:%02d h", s / 3600, (s % 3600) / 60) }
    return String(format: "%d:%02d min", s / 60, s % 60)
}

private func perfFarbe(_ perz: Double) -> Color {
    let a: Double = 0.12 + 0.78 * max(0, min(1, perz / 100))
    return perfCyan.opacity(a)
}

struct PerformanceBereich: View {
    let lang: String
    // Vorgabe nach der eigenen Standard-Sportart (Web 21.11.2026): Foil-Scoot-Fahrer sehen die Mischung
    @State private var sport: String = standardSport == "foil_scoot" ? "pumpfoil+foil_scoot" : "pumpfoil"
    @State private var zeitraum: String = "25"   // alle | 30 | 25 (letzte 25 Tage mit Wertung, Standard seit Jan 18.11.)
    @State private var daten: PerfAntwort?
    @State private var fehler: String?
    @State private var saisonInfo: Bool = false
    // Unterreiter Uebersicht | Verlauf (Web 18.11.2026 abends) und die Kategorie des Platzverlaufs.
    @State private var sub: String = ReiterSpeicher.von("homeperf", "uebersicht")
    @State private var kat: String = "sprint_100m"
    @State private var linienZiel: PerfZeile?      // angetippter Punkt im Platz-Verlauf
    @State private var linienOffen: Bool = false

    private var saisonJahr: Int? { zeitraum.hasPrefix("s") ? Int(zeitraum.dropFirst()) : nil }
    private var grenze: String {
        if let j = saisonJahr { return "\(j)-01-01" }
        if zeitraum == "25" {
            let alleTage: [String] = Array(Set(perfKats.flatMap { k in (daten?.kategorien[k] ?? []).map { $0.tag } })).sorted(by: >)
            return alleTage.count > 24 ? alleTage[24] : ""
        }
        guard zeitraum == "30" else { return "" }
        let d: Date = Date().addingTimeInterval(-30 * 86400)
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.timeZone = TimeZone(identifier: "UTC")
        return f.string(from: d)
    }
    private var perfReiter: [ReiterDef] {
        [ReiterDef(id: "uebersicht", label: Loc.t("perf.tabUebersicht", lang)), ReiterDef(id: "verlauf", label: Loc.t("perf.tabVerlauf", lang))]
    }
    private func schnitt(_ xs: [Double]) -> Double { xs.isEmpty ? 0 : xs.reduce(0, +) / Double(xs.count) }
    private func je(_ k: String) -> [PerfZeile] {
        let bis: String = saisonJahr.map { "\($0)-12-31" } ?? "9999-12-31"
        return (daten?.kategorien[k] ?? []).filter { $0.tag >= grenze && $0.tag <= bis }
    }
    private var alle: [PerfZeile] { perfKats.flatMap { je($0) } }
    private var tage: [String] { Array(Set(alle.map { $0.tag })).sorted(by: >) }
    // Geschuetztes Leerzeichen vor „%" (web e7e90226): die Prozente brechen sonst in den schmalen Kacheln um.
    private func quote(_ n: Int) -> String { alle.isEmpty ? "–" : "\(Int((100.0 * Double(n) / Double(alle.count)).rounded()))\u{00A0}%" }
    /// Anteil der Tage mit Platz <= `bis` in einer Kategorie (Spalten Top 3 / Top 20).
    private func anteil(_ z: [PerfZeile], _ bis: Int) -> String {
        guard !z.isEmpty else { return "–" }
        let n: Int = z.filter { $0.platz <= bis }.count
        return "\(Int((100.0 * Double(n) / Double(z.count)).rounded()))\u{00A0}%"
    }

    /// Punkte eines Tages nach der Saisonregel (server community._saison_tabelle, web tagesPunkte): Platzpunkte je
    /// Kategorie ab `min_feld` Fahrern plus Mitmach-Punkt. Fuer JEDEN Tag, auch vor dem ersten Saisonstart (Jan 21.11.2026:
    /// „einfach jetzt schon in der tabelle anzeigen, zaehlt halt nicht zur saison 27"). nil = an dem Tag keine Wertung.
    private func tagesPunkte(_ tag: String, _ r: PerfRegel) -> Int? {
        var p: Int = 0
        var da: Bool = false
        for k in perfKats {
            guard let z = je(k).first(where: { $0.tag == tag }) else { continue }
            da = true
            if r.kategorien.contains(k) && z.feld >= r.min_feld && z.platz >= 1 && z.platz <= r.platz.count {
                p += r.platz[z.platz - 1]
            }
        }
        return da ? p + r.mitmachen : nil
    }
    /// Punkte je Tag (leer ohne Saisonregel vom Server).
    private var punkteJeTag: [String: Int] {
        guard let r = daten?.saison?.regel else { return [:] }
        var m: [String: Int] = [:]
        for t in tage { if let p = tagesPunkte(t, r) { m[t] = p } }
        return m
    }
    /// Bester Tag (meiste Punkte), bei Gleichstand der fruehere — wer zuerst (Vorschlag eines Fahrers, web 67f4fee2).
    private func besterTag(_ punkte: [String: Int]) -> String? {
        punkte.min { a, b in a.value != b.value ? a.value > b.value : a.key < b.key }?.key
    }
    private func sportName(_ s: String) -> String {
        s.split(separator: "+").map { Loc.t("cls.sport." + String($0), lang) }.joined(separator: " + ")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Keine Unterreiter mehr (Web 21.11.2026): Uebersicht und Verlauf auf einer Seite
            auswahl
            inhalt
            // Sportart-Umschalter ganz unten (Web 21.11.2026)
            Picker("", selection: $sport) {
                Text(sportName("pumpfoil")).tag("pumpfoil")
                Text(sportName("pumpfoil+foil_scoot")).tag("pumpfoil+foil_scoot")
            }.pickerStyle(.segmented)
            // Einleitung klein ganz unten (Web 20.11.2026)
            Text(Loc.t("perf.intro", lang).replacingOccurrences(of: "{n}", with: String(daten?.min_feld ?? 5)))
                .font(.caption).foregroundStyle(.secondary)
        }
        .navigationDestination(isPresented: $linienOffen) { if let z = linienZiel { perfZiel(kat, z) } }
        .task(id: sport) {
            await laden()
            // Der laufende Tag ist vorlaeufig (Server rechnet alle ~10 min neu): solange offen, alle 5 min still nachladen
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 300 * 1_000_000_000)
                if Task.isCancelled { break }
                if let neu = try? await Api.performance(sport: sport) { daten = neu }
            }
        }
    }

    // Legende fuer den gelb hinterlegten laufenden Tag (wie Web, Jan 20.11.2026: „Preliminary Results")
    private var vorlHinweis: some View {
        HStack(spacing: 6) {
            RoundedRectangle(cornerRadius: 3).fill(perfVorlGelb.opacity(0.6)).frame(width: 18, height: 10)
            Text(Loc.t("perf.vorlaeufigLegende", lang)).font(.caption2).foregroundStyle(.secondary)
        }
    }

    // Saison mit Punkten (wie Web, Jan 20.11.2026): kompakt rechtsbuendig, (i) zeigt Punktetabelle und Regeln.
    private func saisonZeile(_ s: PerfSaison) -> String {
        if !s.gestartet { return Loc.t("perf.saison.startet", lang).replacingOccurrences(of: "{jahr}", with: String(s.jahr)) }
        guard let r = s.rang else { return Loc.t("perf.saison.nochKeine", lang) }
        return Loc.t("perf.saison.rang", lang).replacingOccurrences(of: "{rang}", with: String(r))
            .replacingOccurrences(of: "{fahrer}", with: String(s.fahrer)).replacingOccurrences(of: "{tage}", with: String(s.tage))
    }

    /// Kennzahl-Kachel wie im Web: Icon ueber die ganze Hoehe links, Wert und Label mittig daneben.
    private func kachel(_ icon: String, _ wert: String, _ label: String, hervor: Bool = false) -> some View {
        HStack(spacing: 6) {
            perfIcon(icon, 30)
            VStack(spacing: 1) {
                Text(wert).font(.title3).fontWeight(.semibold).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
                Text(label).font(.caption2).fontWeight(hervor ? .semibold : .regular)
                    .foregroundStyle(hervor ? perfAkzent : Color.secondary).multilineTextAlignment(.center).lineLimit(2)
            }.frame(maxWidth: .infinity)
        }
        .padding(.horizontal, 8).padding(.vertical, 10).frame(maxWidth: .infinity, minHeight: 64)
        .background(hervor ? perfCyan.opacity(0.12) : Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func saisonInfoSheet(_ s: PerfSaison) -> some View {
        let kats: String = s.regel.kategorien.map { Loc.t("perf.kat." + $0, lang) }.joined(separator: " · ")
        return NavigationStack {
            List {
                Section {
                    Text(Loc.t("perf.saison.infoIntro", lang)).font(.subheadline)
                    Text(saisonZeile(s)).font(.subheadline).fontWeight(.medium)
                }
                Section(header: HStack { Text(Loc.t("perf.saison.platz", lang)); Spacer(); Text(Loc.t("perf.saison.punkte", lang)) }) {
                    ForEach(Array(s.regel.platz.enumerated()), id: \.offset) { i, p in
                        HStack { Text("\(i + 1).").monospacedDigit(); Spacer(); Text(String(p)).fontWeight(.semibold).monospacedDigit() }
                    }
                }
                Section {
                    Text(Loc.t("perf.saison.mitmachen", lang).replacingOccurrences(of: "{n}", with: String(s.regel.mitmachen)))
                    Text(Loc.t("perf.saison.kategorien", lang).replacingOccurrences(of: "{kats}", with: kats)).font(.subheadline)
                    Text(Loc.t("perf.saison.regeln", lang).replacingOccurrences(of: "{n}", with: String(s.regel.min_feld))
                        .replacingOccurrences(of: "{max}", with: String(s.regel.max_tag)).replacingOccurrences(of: "{jahr}", with: String(s.jahr)))
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            .navigationTitle(Loc.t("perf.saisonTitel", lang)).navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button(Loc.t("common.close", lang)) { saisonInfo = false } } }
        }
    }

    private func laden() async {
        daten = nil; fehler = nil
        do { daten = try await Api.performance(sport: sport) } catch { fehler = error.localizedDescription }
    }

    private var auswahl: some View {
        VStack(alignment: .leading, spacing: 8) {
            Picker(Loc.t("perf.tage", lang), selection: $zeitraum) {
                Text(Loc.t("perf.seit", lang).replacingOccurrences(of: "{datum}", with: daten?.ab ?? "…")).tag("alle")
                Text(Loc.t("perf.tage30", lang)).tag("30")
                Text(Loc.t("perf.letzte25", lang)).tag("25")
                ForEach(daten?.saison_jahre ?? [], id: \.self) { j in
                    Text(Loc.t("perf.seit", lang).replacingOccurrences(of: "{datum}", with: "1.1.\(j)")).tag("s\(j)")
                }
            }.pickerStyle(.menu)
        }
    }

    @ViewBuilder private var inhalt: some View {
        if let fehler {
            Text(fehler).foregroundStyle(.red)
        } else if daten == nil {
            ProgressView().frame(maxWidth: .infinity)
        } else if alle.isEmpty {
            Text(Loc.t("perf.leer", lang)).frame(maxWidth: .infinity).padding()
                .background(Color(.secondarySystemBackground)).clipShape(RoundedRectangle(cornerRadius: 12))
        } else {
            kennzahlen
            kategorieTabelle
            bestleistungen
            ForEach(perfKats, id: \.self) { k in kategorieKarte(k) }
            platzVerlauf
            raster
            verlauf
            Text(Loc.t("perf.hinweis", lang)).font(.caption).foregroundStyle(.secondary)
        }
    }

    // Kategorie-Tabelle: Ø Platz immer mit Ø Feld, sonst sagt die Zahl nichts.
    private var kategorieTabelle: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(Loc.t("perf.tabelle", lang)).fontWeight(.semibold)
            ForEach(perfKats, id: \.self) { k in tabellenZeile(k) }
        }
        .frame(maxWidth: .infinity, alignment: .leading).padding(12)
        .background(Color(.secondarySystemBackground)).clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func tabellenZeile(_ k: String) -> some View {
        let z: [PerfZeile] = je(k)
        return VStack(alignment: .leading, spacing: 4) {
            Divider()
            HStack(spacing: 6) {
                perfIcon(perfKatIcon[k] ?? "", 18)
                Text(Loc.t("perf.kat." + k, lang)).font(.subheadline).fontWeight(.medium)
            }
            if z.isEmpty {
                Text(Loc.t("perf.keineTage", lang)).font(.caption).foregroundStyle(.secondary)
            } else {
                tabellenWerte(k, z)
            }
        }
    }

    private func schnittText(_ z: [PerfZeile]) -> String {
        let platz: String = String(format: "%.1f", schnitt(z.map { Double($0.platz) }))
        let feld: String = String(Int(schnitt(z.map { Double($0.feld) }).rounded()))
        return Loc.t("perf.schnittVon", lang).replacingOccurrences(of: "{platz}", with: platz).replacingOccurrences(of: "{feld}", with: feld)
    }

    /// Eine Tabellenzeile: Tage, Ø Platz, bester, Top 3, Top 20 (web 6b37c730), Siege.
    private func tabellenWerte(_ k: String, _ z: [PerfZeile]) -> some View {
        // bester Platz / genau ein Sieg = ein einzelner Lauf -> antippen fuehrt hin (bei Gleichstand der neueste)
        let best: PerfZeile? = z.min { $0.platz != $1.platz ? $0.platz < $1.platz : $0.tag > $1.tag }
        let siege: [PerfZeile] = z.filter { $0.platz == 1 }
        let bestZiel: SessionDetailView? = best.map { perfZiel(k, $0) }
        let siegZiel: SessionDetailView? = siege.count == 1 ? perfZiel(k, siege[0]) : nil
        // In zwei Gruppen: elf direkte Kinder waeren ueber der alten ViewBuilder-Grenze von zehn.
        return HStack {
            tabZelle(Loc.t("perf.tage", lang), String(z.count))
            Group {
                Spacer(); tabZelle(Loc.t("perf.spSchnitt", lang), schnittText(z))
                Spacer(); tabZelle(Loc.t("perf.spBester", lang), String(best?.platz ?? 0), ziel: bestZiel)
            }
            Group {
                Spacer(); tabZelle(Loc.t("perf.spTop3", lang), anteil(z, 3))
                Spacer(); tabZelle(Loc.t("perf.spTop20", lang), anteil(z, 20))
                Spacer(); tabZelle(Loc.t("perf.siege", lang), String(siege.count), ziel: siegZiel)
            }
        }
    }

    @ViewBuilder private func tabZelle(_ label: String, _ wert: String, ziel: SessionDetailView? = nil) -> some View {
        let inhalt = VStack(spacing: 2) {
            Text(wert).font(.callout).fontWeight(ziel != nil ? .bold : .medium).foregroundStyle(ziel != nil ? perfAkzent : Color.primary)
            Text(label).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
        }
        if let ziel { NavigationLink { ziel } label: { inhalt }.buttonStyle(.plain) } else { inhalt }
    }

    // Bestleistungen: bester eigener Wert je Kategorie im Zeitraum, Tippen oeffnet die Session.
    private var bestleistungen: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(Loc.t("perf.bestleistungen", lang)).fontWeight(.semibold)
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                ForEach(perfKats, id: \.self) { k in bestKachel(k) }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading).padding(12)
        .background(Color(.secondarySystemBackground)).clipShape(RoundedRectangle(cornerRadius: 12))
    }

    @ViewBuilder private func bestKachel(_ k: String) -> some View {
        let b: PerfZeile? = je(k).max { $0.wert < $1.wert }
        if let b {
            NavigationLink { perfZiel(k, b) } label: { bestInhalt(k, b) }.buttonStyle(.plain)
        } else {
            bestInhalt(k, nil)
        }
    }

    private func bestInhalt(_ k: String, _ b: PerfZeile?) -> some View {
        // wie die Kennzahl-Kacheln: Icon ueber die ganze Hoehe, Wert und Label mittig (Web 20.11.2026)
        HStack(spacing: 6) {
            perfIcon(perfKatIcon[k] ?? "", 30)
            VStack(spacing: 1) {
                Text(b.map { perfWertText(k, $0.wert) } ?? "–").font(.headline).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
                    .foregroundStyle(b == nil ? Color.secondary : Color.primary)
                Text(Loc.t("perf.kat." + k, lang)).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                if let b {
                    Text(tagKurz(b.tag) + " · " + Loc.t("perf.platzVon", lang).replacingOccurrences(of: "{platz}", with: String(b.platz))
                        .replacingOccurrences(of: "{feld}", with: String(b.feld))).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                }
            }.frame(maxWidth: .infinity)
        }
        .frame(maxWidth: .infinity).padding(8)
        .background(Color(.tertiarySystemFill).opacity(0.5)).clipShape(RoundedRectangle(cornerRadius: 8))
    }

    // Platz je Tag in EINER Kategorie: Hoehe = Anteil geschlagener Fahrer, Zahl = Platz; Baender ab 80 % / 50 %.
    private var platzVerlauf: some View {
        let reihe: [PerfZeile] = je(kat).sorted { $0.tag < $1.tag }
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) { perfIcon("PerfPlaceLine", 20); Text(Loc.t("perf.platzverlauf", lang)).fontWeight(.semibold) }
            Picker("", selection: $kat) {
                ForEach(perfKats, id: \.self) { k in Label { Text(Loc.t("perf.kat." + k, lang)) } icon: { Image(perfKatIcon[k] ?? "") }.tag(k) }
            }.pickerStyle(.menu)
            if reihe.isEmpty {
                Text(Loc.t("perf.keineTage", lang)).font(.caption).foregroundStyle(.secondary)
            } else {
                // Punkt antippen -> Lauf dieses Tages (Web 20.11.2026)
                PerfLinie(punkte: reihe.map { $0.perzentil }, baender: true, zahlen: reihe.map { String($0.platz) },
                          vorl: reihe.map { $0.vorlaeufig == true },
                          antippen: { i in linienZiel = reihe[i]; linienOffen = true }).frame(height: 150).padding(.top, 10)
                HStack {
                    Text(reihe.first?.tag ?? "").font(.caption2).foregroundStyle(.secondary)
                    Spacer()
                    Text(reihe.last?.tag ?? "").font(.caption2).foregroundStyle(.secondary)
                }
            }
            if reihe.contains(where: { $0.vorlaeufig == true }) { vorlHinweis }
            Text(Loc.t("perf.platzverlaufHint", lang)).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading).padding(12)
        .background(Color(.secondarySystemBackground)).clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var kennzahlen: some View {
        let besser: Int = Int((alle.reduce(0.0) { $0 + $1.perzentil } / Double(max(alle.count, 1))).rounded())
        let werte: [(String, String, String)] = [
            ("PerfCalendarCheck", String(tage.count), Loc.t("perf.tage", lang)),
            ("PerfBeat", "\(besser)\u{00A0}%", Loc.t("perf.besserAls", lang)),
            ("PerfTrophy", String(alle.filter { $0.platz == 1 }.count), Loc.t("perf.siege", lang)),
            ("PerfPodium", quote(alle.filter { $0.platz <= 3 }.count), Loc.t("perf.podium", lang)),
            ("PerfMedal", quote(alle.filter { $0.platz <= 10 }.count), Loc.t("perf.top10", lang))]
        // Saison als sechste Kachel (Web 20.11.2026); Antippen zeigt Status, Punktetabelle und Regeln
        return LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
            ForEach(werte, id: \.0) { w in kachel(w.0, w.1, w.2) }
            if let s = daten?.saison {
                // Antippen waehlt die Saison als Zeitraum (ab Saisonbeginn, Web 21.11.2026); ist sie schon gewaehlt: Regeln
                Button { if s.gestartet && zeitraum != "s\(s.jahr)" { zeitraum = "s\(s.jahr)" } else { saisonInfo = true } } label: {
                    kachel("PerfSeasonCup", String(s.punkte), Loc.t("perf.saisonTitel", lang), hervor: true)
                        .overlay(alignment: .topTrailing) {
                            Image(systemName: "info.circle").font(.caption2).foregroundStyle(.secondary).padding(4)
                        }
                }.buttonStyle(.plain)
                .sheet(isPresented: $saisonInfo) { saisonInfoSheet(s) }
            }
        }
    }

    private func kategorieKarte(_ k: String) -> some View {
        let z: [PerfZeile] = je(k)
        let maxN: Int = max(1, perfBuckets.map { b in z.filter { b.1($0.platz) }.count }.max() ?? 1)
        return VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) { perfIcon(perfKatIcon[k] ?? "", 20); Text(Loc.t("perf.kat." + k, lang)).fontWeight(.semibold) }
            if z.isEmpty {
                Text(Loc.t("perf.keineTage", lang)).font(.caption).foregroundStyle(.secondary)
            } else {
                let perz: Int = Int((z.reduce(0.0) { $0 + $1.perzentil } / Double(z.count)).rounded())
                Text(Loc.t("perf.katZeile", lang).replacingOccurrences(of: "{n}", with: String(z.count))
                    .replacingOccurrences(of: "{perz}", with: String(perz)))
                    .font(.caption).foregroundStyle(.secondary)
                ForEach(perfBuckets.indices, id: \.self) { i in
                    bucketZeile(perfBuckets[i].0, z.filter { perfBuckets[i].1($0.platz) }.count, maxN)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading).padding(12)
        .background(Color(.secondarySystemBackground)).clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func bucketZeile(_ label: String, _ n: Int, _ maxN: Int) -> some View {
        HStack(spacing: 6) {
            Text(label).font(.caption2).foregroundStyle(.secondary).frame(width: 42, alignment: .trailing)
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 3).fill(Color(.tertiarySystemFill))
                    if n > 0 {
                        RoundedRectangle(cornerRadius: 3).fill(perfCyan)
                            .frame(width: g.size.width * CGFloat(n) / CGFloat(maxN))
                    }
                }
            }.frame(height: 10)
            Text(String(n)).font(.caption2).frame(width: 24, alignment: .trailing)
        }
    }

    private func tagKurz(_ t: String) -> String {
        let p = t.split(separator: "-")
        guard p.count == 3, let m = Int(p[1]), let d = Int(p[2]) else { return t }
        return "\(d).\(m)."
    }

    private var raster: some View {
        let punkte: [String: Int] = punkteJeTag
        let best: String? = besterTag(punkte)
        return VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) { perfIcon("PerfPlacingGrid", 20); Text(Loc.t("perf.raster", lang)).fontWeight(.semibold) }
            HStack(alignment: .top, spacing: 6) {
                rasterKoepfe(mitPunkten: !punkte.isEmpty)
                ScrollViewReader { roll in
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 4) {
                            // Zeit von links nach rechts wie in den anderen Darstellungen (Hinweis eines Fahrers, 19.11.2026)
                            ForEach(tage.reversed(), id: \.self) { t in rasterSpalte(t, punkte: punkte).id(t) }
                        }
                    }
                    // beim Oeffnen ganz rechts (neueste Tage, heute) — wie Web
                    .onAppear { if let t = tage.first { roll.scrollTo(t, anchor: .trailing) } }
                    .onChange(of: tage.first) { _ in if let t = tage.first { roll.scrollTo(t, anchor: .trailing) } }
                }
                // Feste Spalte „best" rechts neben dem Rollbereich (web: sticky right) — der Tag mit den meisten Punkten.
                if let best { besteSpalte(best, punkte: punkte) }
            }
            if !punkte.isEmpty {
                Text(Loc.t("perf.punkteHint", lang)).font(.caption).foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: 6) {
                Text(Loc.t("perf.legende", lang)).font(.caption2).foregroundStyle(.secondary)
                ForEach([10, 50, 90], id: \.self) { p in
                    RoundedRectangle(cornerRadius: 3).fill(perfFarbe(Double(p))).frame(width: 18, height: 10)
                    Text("\(p) %").font(.caption2).foregroundStyle(.secondary)
                }
            }
            if alle.contains(where: { $0.vorlaeufig == true }) { vorlHinweis }
        }
        .frame(maxWidth: .infinity, alignment: .leading).padding(12)
        .background(Color(.secondarySystemBackground)).clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func istVorl(_ t: String) -> Bool { alle.contains { $0.tag == t && $0.vorlaeufig == true } }

    /// Linke Spalte: Kategorie-Namen und darunter die Punkte-Zeile (Σ).
    private func rasterKoepfe(mitPunkten: Bool) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(" ").font(.caption2)
            ForEach(perfKats, id: \.self) { k in
                HStack(spacing: 4) {
                    perfIcon(perfKatIcon[k] ?? "", 16)
                    Text(Loc.t("perf.kat." + k, lang)).font(.caption2).lineLimit(2)
                }.frame(width: 100, height: 28, alignment: .leading)
            }
            if mitPunkten {
                HStack(spacing: 4) {
                    Text("Σ").font(.caption).fontWeight(.bold).foregroundStyle(perfAkzent).frame(width: 16)
                    Text(Loc.t("perf.punkteTag", lang)).font(.caption2).fontWeight(.semibold).lineLimit(1)
                }.frame(width: 100, height: 22, alignment: .leading)
            }
        }
    }

    /// Punkte eines Tages unter seiner Spalte (leer ohne Wertung).
    private func punkteZelle(_ p: Int?, hervor: Bool = false) -> some View {
        Text(p.map { String($0) } ?? "").font(.caption).fontWeight(.bold).monospacedDigit()
            .foregroundStyle(hervor ? perfAkzent : Color.primary)
            .frame(width: 30, height: 22)
    }

    private func besteSpalte(_ t: String, punkte: [String: Int]) -> some View {
        HStack(spacing: 4) {
            Rectangle().fill(perfAkzent).frame(width: 2)
            VStack(spacing: 4) {
                // Kopf in EINER Zeile (gleiche Hoehe wie die Datumskoepfe, sonst stehen die Zellen versetzt)
                HStack(spacing: 3) {
                    Text(Loc.t("perf.best", lang)).font(.caption2).fontWeight(.semibold).foregroundStyle(perfAkzent)
                    Text(tagKurz(t)).font(.caption2).foregroundStyle(.secondary)
                }.lineLimit(1)
                ForEach(perfKats, id: \.self) { k in rasterZelle(k, je(k).first { $0.tag == t }) }
                punkteZelle(punkte[t], hervor: true)
            }
        }
        .fixedSize()
    }

    private func rasterSpalte(_ t: String, punkte: [String: Int]) -> some View {
        let vorl: Bool = istVorl(t)
        return VStack(spacing: 4) {
            Text(tagKurz(t)).font(.caption2).foregroundStyle(.secondary)
            ForEach(perfKats, id: \.self) { k in rasterZelle(k, je(k).first { $0.tag == t }) }
            if !punkte.isEmpty { punkteZelle(punkte[t]) }
        }
        .padding(2)
        .background(vorl ? perfVorlGelb.opacity(0.35) : Color.clear)
        .clipShape(RoundedRectangle(cornerRadius: 4))
    }

    @ViewBuilder private func rasterZelle(_ k: String, _ z: PerfZeile?) -> some View {
        if let z {
            NavigationLink { perfZiel(k, z) } label: {
                Text(String(z.platz)).font(.caption).fontWeight(.semibold).foregroundStyle(.primary)
                    .frame(width: 30, height: 28).background(perfFarbe(z.perzentil))
                    .clipShape(RoundedRectangle(cornerRadius: 4))
            }.buttonStyle(.plain)
        } else {
            RoundedRectangle(cornerRadius: 4).fill(Color(.tertiarySystemFill)).frame(width: 30, height: 28)
        }
    }

    private var verlaufPunkte: [Double] {
        tage.reversed().map { t in
            let z: [PerfZeile] = alle.filter { $0.tag == t }
            return z.reduce(0.0) { $0 + $1.perzentil } / Double(max(z.count, 1))
        }
    }

    private var verlauf: some View {
        let punkte: [Double] = verlaufPunkte
        return VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) { perfIcon("PerfDailyAverage", 20); Text(Loc.t("perf.verlauf", lang)).fontWeight(.semibold) }
            if punkte.count < 2 {
                Text(Loc.t("perf.zuWenig", lang)).font(.caption).foregroundStyle(.secondary)
            } else {
                PerfLinie(punkte: punkte, vorl: tage.reversed().map { istVorl($0) }).frame(height: 130)
                HStack {
                    Text(tage.last ?? "").font(.caption2).foregroundStyle(.secondary)
                    Spacer()
                    Text(tage.first ?? "").font(.caption2).foregroundStyle(.secondary)
                }
                if tage.contains(where: { istVorl($0) }) { vorlHinweis }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading).padding(12)
        .background(Color(.secondarySystemBackground)).clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

private struct PerfLinie: View {
    let punkte: [Double]
    var baender: Bool = false        // ab 80 % / 50 % geschlagener Fahrer hinterlegt
    var zahlen: [String]? = nil      // Platz ueber jedem Punkt (bei vielen Punkten nur jeder n-te)
    var vorl: [Bool] = []            // je Punkt: laufender Tag -> gelb hinterlegt, Punkt orange
    var antippen: ((Int) -> Void)? = nil   // naechster Punkt zur Tippstelle
    private func px(_ i: Int, _ w: CGFloat) -> CGFloat { punkte.count == 1 ? w / 2 : w * CGFloat(i) / CGFloat(punkte.count - 1) }
    private func py(_ p: Double, _ h: CGFloat) -> CGFloat { h * CGFloat((100 - p) / 100) }
    var body: some View {
        GeometryReader { g in
            let w: CGFloat = g.size.width
            let h: CGFloat = g.size.height
            let n: Int = punkte.count
            let jeder: Int = n > 20 ? (n + 19) / 20 : 1
            ZStack {
                if baender {
                    Rectangle().fill(Color.green.opacity(0.15)).frame(width: w, height: py(80, h)).position(x: w / 2, y: py(80, h) / 2)
                    Rectangle().fill(Color.orange.opacity(0.10)).frame(width: w, height: py(50, h) - py(80, h))
                        .position(x: w / 2, y: (py(50, h) + py(80, h)) / 2)
                }
                ForEach(0..<n, id: \.self) { i in
                    if i < vorl.count && vorl[i] {
                        RoundedRectangle(cornerRadius: 3).fill(perfVorlGelb.opacity(0.35)).frame(width: 18, height: h)
                            .position(x: px(i, w), y: h / 2)
                    }
                }
                if let zahlen {
                    ForEach(Array(zahlen.enumerated()), id: \.offset) { e in
                        if e.offset % jeder == 0 {
                            Text(e.element).font(.system(size: 10, weight: .semibold))
                                .position(x: px(e.offset, w), y: py(punkte[e.offset], h) - 9)
                        }
                    }
                }
                ForEach([0.0, 50.0, 100.0], id: \.self) { p in
                    Path { pf in
                        let y: CGFloat = h * CGFloat((100 - p) / 100)
                        pf.move(to: CGPoint(x: 0, y: y)); pf.addLine(to: CGPoint(x: w, y: y))
                    }.stroke(Color.secondary.opacity(0.3), lineWidth: 1)
                }
                Path { pf in
                    for i in 0..<n {
                        let pt = CGPoint(x: px(i, w), y: py(punkte[i], h))
                        if i == 0 { pf.move(to: pt) } else { pf.addLine(to: pt) }
                    }
                }.stroke(perfCyan, lineWidth: 2)
                ForEach(0..<n, id: \.self) { i in
                    Circle().fill(i < vorl.count && vorl[i] ? perfVorlPunkt : perfCyan).frame(width: 7, height: 7)
                        .position(x: px(i, w), y: py(punkte[i], h))
                }
            }
            .contentShape(Rectangle())
            .onTapGesture { ort in
                guard let antippen, n > 0 else { return }
                let i: Int = (0..<n).min { abs(px($0, w) - ort.x) < abs(px($1, w) - ort.x) } ?? 0
                antippen(i)
            }
        }
    }
}

// MARK: - Tempo-Verteilung (24.11.2026, docs/TEMPO-VERTEILUNG.md; Port von web TempoVerteilung.tsx, TempoBereich.tsx,
// lib/tempoHist.ts)
//
// Anteil der Zeit auf dem Foil je km/h-Stufe — nur innerhalb der Laeufe. Balken = Hauptreihe, unten dunkler der Anteil in
// ERKANNTEN Gleitphasen (pg-1, findet etwa die Haelfte), Stufenlinie = Vergleich, Band oben = 10./50./90. Perzentil.
// Nur Anteile, keine Sekunden-Achse: so lassen sich Reihen mit ganz verschiedener Fahrzeit vergleichen.

/// GET /api/tempo/eigen: Sekunden je 0,5 km/h (`a`), davon in Gleitphasen (`g`), Sekunden der Laeufe mit bekanntem
/// Gleiten (`g_basis`); dazu die Foils und Spots mit Fahrzeit im Zeitraum fuer die Auswahl.
struct TempoEigen: Decodable {
    struct Eintrag: Decodable, Identifiable { let id: Int; let label: String; let s: Double }
    let breite_kmh: Double
    let a: [Double]
    var g: [Double]? = nil
    var g_basis: [Double]? = nil
    var sessions: Int = 0
    var unvollstaendig: Int = 0
    var foils: [Eintrag] = []
    var spots: [Eintrag] = []
}

/// GET /api/tempo/foil/{id}: alle Fahrer auf einem Foil, Promille der Fahrzeit (Mittel ueber die Fahrer) — erst ab
/// `min_fahrer` Fahrern (`genug`), sonst ohne Reihen.
struct TempoFoil: Decodable {
    let breite_kmh: Double
    let fahrer: Int
    let sessions: Int
    let min_fahrer: Int
    let genug: Bool
    var a: [Double]? = nil
}

extension Api {
    static func tempoEigen(period: String = "all", foilId: Int? = nil, spotId: Int? = nil, sport: String? = nil,
                           ohneSession: Int? = nil) async throws -> TempoEigen {
        var q: String = "period=" + queryWert(period)
        if let sport, !sport.isEmpty { q += "&sport=" + queryWert(sport) }
        if let foilId { q += "&foil_id=\(foilId)" }
        if let spotId { q += "&spot_id=\(spotId)" }
        if let ohneSession { q += "&ohne_session=\(ohneSession)" }
        return try await request("/api/tempo/eigen?" + q, method: "GET", body: nil, auth: true)
    }

    static func tempoFoil(_ foilId: Int) async throws -> TempoFoil {
        try await request("/api/tempo/foil/\(foilId)", method: "GET", body: nil, auth: true)
    }
}

/// Eine Reihe: Sekunden (oder Promille) je Stufe; `g`/`g_basis` nur bei der Hauptreihe.
struct TempoReihe {
    let a: [Double]
    var g: [Double]? = nil
    var g_basis: [Double]? = nil
    let label: String
}

let TEMPO_BREITE_KMH: Double = 0.5
let TEMPO_STUFEN: Int = 80

/// Tempo-Verteilung einer Session im Geraet — DIESELBE Regel wie server analysis/tempo_hist.py (web lib/tempoHist.ts):
/// nur Punkte innerhalb der Laeufe, halboffen [i_start, i_end); jeder Punkt zaehlt duration_s / (i_end - i_start)
/// Sekunden (GPS hat Loecher, Index ist nicht Sekunde); Gleiten nur aus pg-1 (`pg_glides`, wo `pg_pumps` gesetzt ist).
func tempoHist(_ segments: [Segment], _ speeds1: [Double]) -> (a: [Double], g: [Double]?, g_basis: [Double]?) {
    var a: [Double] = Array(repeating: 0, count: TEMPO_STUFEN)
    var g: [Double] = Array(repeating: 0, count: TEMPO_STUFEN)
    var gb: [Double] = Array(repeating: 0, count: TEMPO_STUFEN)
    var mitGleiten: Bool = false
    let n: Int = speeds1.count
    for sg in segments {
        let i: Int = sg.i_start
        guard sg.i_end > i, i >= 0, i < n else { continue }
        let j: Int = min(sg.i_end, n - 1)
        guard j > i else { continue }
        let w: Double = (sg.duration_s ?? 0) / Double(j - i)
        let pg: Bool = sg.pg_pumps != nil && sg.pg_glides != nil
        var gleit = Set<Int>()
        if pg {
            mitGleiten = true
            for gl in sg.pg_glides ?? [] where gl.count >= 2 {
                let x: Int = Int(gl[0]), y: Int = Int(gl[1])
                if y > x { for k in x..<y { gleit.insert(k) } }
            }
        }
        for k in i..<j {
            let v: Double = speeds1[k]
            let b: Int = min(max(Int((v * 3.6 / TEMPO_BREITE_KMH).rounded(.down)), 0), TEMPO_STUFEN - 1)
            a[b] += w
            if pg { gb[b] += w }
            if gleit.contains(k) { g[b] += w }
        }
    }
    return (a, mitGleiten ? g : nil, mitGleiten ? gb : nil)
}

private let tempoFarbe = Color(red: 34 / 255, green: 211 / 255, blue: 238 / 255)        // Marke (cyan-400)
private let tempoFarbeGleit = Color(red: 8 / 255, green: 145 / 255, blue: 178 / 255)    // cyan-600: Teil des Ganzen
private let tempoFarbeVgl = Color(red: 245 / 255, green: 158 / 255, blue: 11 / 255)     // amber-500: zweite Reihe

/// Aufbereitete Reihen (web `useMemo d`): gebuendelt, als Anteile, mit Bereich und Perzentilen.
private struct TempoDaten {
    let br: Double          // km/h je Stufe nach dem Buendeln
    let ah: [Double]        // Hauptreihe in Sekunden
    let anH: [Double]       // Hauptreihe als Anteile
    let anV: [Double]       // Vergleich als Anteile (leer = keiner)
    let anG: [Double]?      // Gleit-Anteil je Stufe, hochgerechnet
    let lo: Int
    let hi: Int
    let yMax: Double
    let sumH: Double
    let p: [Double]         // 10./50./90. Perzentil in km/h
}

private func tempoBuendeln(_ xs: [Double]?, _ faktor: Int) -> [Double] {
    guard let xs, !xs.isEmpty else { return [] }
    var out: [Double] = []
    var i: Int = 0
    while i < xs.count {
        out.append(xs[i..<min(i + faktor, xs.count)].reduce(0, +))
        i += faktor
    }
    return out
}

private func tempoPerzentil(_ anteile: [Double], _ p: Double, _ breite: Double) -> Double {
    var s: Double = 0
    for k in anteile.indices {
        if s + anteile[k] >= p {
            let f: Double = anteile[k] > 0 ? (p - s) / anteile[k] : 0
            return (Double(k) + f) * breite
        }
        s += anteile[k]
    }
    return Double(anteile.count) * breite
}

/// Ausreisser (GPS-Spruenge) abschneiden — 0,2 % an jedem Ende.
private func tempoGrenze(_ an: [Double]) -> (Int, Int) {
    var s: Double = 0
    var lo: Int = 0
    var hi: Int = max(an.count - 1, 0)
    for k in an.indices { s += an[k]; if s > 0.002 { lo = k; break } }
    s = 0
    for k in an.indices.reversed() { s += an[k]; if s > 0.002 { hi = k; break } }
    return (lo, hi)
}

private func tempoAufbereiten(_ haupt: TempoReihe, _ vergleich: TempoReihe?, _ breiteKmh: Double, _ sekunden: Bool) -> TempoDaten {
    let sumH: Double = haupt.a.reduce(0, +)
    // Feiner (0,5 km/h) erst ab 2 h Fahrzeit und ohne Vergleich, sonst wird die Kurve zackig.
    let grob: Int = max(1, Int((1 / breiteKmh).rounded()))
    let faktor: Int = (sekunden && sumH >= 7200 && vergleich == nil) ? 1 : grob
    let br: Double = breiteKmh * Double(faktor)
    let ah: [Double] = tempoBuendeln(haupt.a, faktor)
    let gh: [Double] = tempoBuendeln(haupt.g, faktor)
    let gb: [Double] = tempoBuendeln(haupt.g_basis, faktor)
    let av: [Double] = vergleich.map { tempoBuendeln($0.a, faktor) } ?? []
    let sumV: Double = av.reduce(0, +)
    let anH: [Double] = ah.map { sumH > 0 ? $0 / sumH : 0 }
    let anV: [Double] = av.map { sumV > 0 ? $0 / sumV : 0 }
    // Leere Reihe: nichts zu zeichnen (die Ansicht zeigt dann „Keine Laeufe"), aber auch kein Index ausserhalb.
    guard !anH.isEmpty, sumH > 0 else {
        return TempoDaten(br: br, ah: ah, anH: anH, anV: anV, anG: nil, lo: 0, hi: 0, yMax: 0.001, sumH: 0, p: [0, 0, 0])
    }
    // Gleit-Anteil je Stufe: Verhaeltnis aus den Laeufen mit pg-1, auf die ganze Stufe hochgerechnet.
    var anG: [Double]? = nil
    if !gh.isEmpty && gb.contains(where: { $0 > 0 }) {
        anG = anH.indices.map { k in
            (k < gb.count && k < gh.count && gb[k] > 0) ? anH[k] * min(gh[k] / gb[k], 1) : 0
        }
    }
    let g1: (Int, Int) = tempoGrenze(anH)
    let g2: (Int, Int) = (!av.isEmpty && sumV > 0) ? tempoGrenze(anV) : g1
    let lo: Int = max(0, min(g1.0, g2.0) - 1)
    let hi: Int = max(lo, min(anH.count - 1, max(g1.1, g2.1) + 1))
    var yMax: Double = 0.001
    for k in lo...hi {
        yMax = max(yMax, anH[k])
        if k < anV.count { yMax = max(yMax, anV[k]) }
    }
    let p: [Double] = [0.1, 0.5, 0.9].map { tempoPerzentil(anH, $0, br) }
    return TempoDaten(br: br, ah: ah, anH: anH, anV: anV, anG: anG, lo: lo, hi: hi, yMax: yMax, sumH: sumH, p: p)
}

private func tempoKmh(_ v: Double) -> String {
    v == v.rounded() ? String(Int(v)) : String(format: "%.1f", v)
}
private func tempoPct(_ v: Double) -> String {
    String(format: v < 0.1 ? "%.1f" : "%.0f", v * 100) + "\u{00A0}%"
}
private func tempoDauer(_ s: Double) -> String {
    if s >= 3600 { return String(format: "%.1f h", s / 3600) }
    if s >= 60 { return "\(Int((s / 60).rounded())) min" }
    return "\(Int(s.rounded())) s"
}

// Raender des Diagramms (Punkte)
private let tempoL: CGFloat = 30, tempoR: CGFloat = 6, tempoT: CGFloat = 22, tempoB: CGFloat = 30

/// Zeichnet Gitter, Band, Balken, Gleit-Anteil, Vergleichslinie und Achsen (web SVG in TempoVerteilung).
private func tempoZeichnen(_ ctx: inout GraphicsContext, _ size: CGSize, _ d: TempoDaten, _ hover: Int?) {
    let w: CGFloat = size.width
    let h: CGFloat = size.height
    let n: Int = d.hi - d.lo + 1
    let bw: CGFloat = (w - tempoL - tempoR) / CGFloat(n)
    let schritte: [Double] = [1, 2, 5, 10, 20, 25, 50]
    let schritt: Double = schritte.first(where: { d.yMax * 100 / $0 <= 5 }) ?? 50
    let yTop: Double = (d.yMax * 100 / schritt).rounded(.up) * schritt / 100
    let hoehe: CGFloat = h - tempoT - tempoB
    func y(_ v: Double) -> CGFloat { h - tempoB - CGFloat(v / yTop) * hoehe }
    func x(_ kmh: Double) -> CGFloat { tempoL + CGFloat(kmh / d.br - Double(d.lo)) * bw }
    let grau: Color = Color.secondary
    // y-Gitter in Prozent
    var v: Double = 0
    while v <= yTop + 1e-9 {
        var p = Path()
        p.move(to: CGPoint(x: tempoL, y: y(v)))
        p.addLine(to: CGPoint(x: w - tempoR, y: y(v)))
        ctx.stroke(p, with: .color(Color(.separator)), lineWidth: 0.5)
        ctx.draw(Text(String(Int((v * 100).rounded()))).font(.system(size: 9)).foregroundColor(grau),
                 at: CGPoint(x: tempoL - 4, y: y(v)), anchor: .trailing)
        v += schritt / 100
    }
    ctx.draw(Text("%").font(.system(size: 9)).foregroundColor(grau), at: CGPoint(x: tempoL - 4, y: tempoT - 12), anchor: .trailing)
    // Nutzbarer Bereich: 10.–90. Perzentil als Band oben, Median als Strich
    let x10: CGFloat = x(d.p[0]), x50: CGFloat = x(d.p[1]), x90: CGFloat = x(d.p[2])
    ctx.fill(Path(roundedRect: CGRect(x: x10, y: tempoT - 16, width: max(x90 - x10, 1), height: 4), cornerRadius: 2),
             with: .color(grau.opacity(0.5)))
    var med = Path()
    med.move(to: CGPoint(x: x50, y: tempoT - 19))
    med.addLine(to: CGPoint(x: x50, y: tempoT - 9))
    ctx.stroke(med, with: .color(Color.primary.opacity(0.7)), lineWidth: 2)
    // Angetippte Stufe hinterlegen (nicht die anderen abdunkeln — saehe aus wie der Gleit-Anteil)
    if let hk = hover, hk >= d.lo, hk <= d.hi {
        ctx.fill(Path(CGRect(x: tempoL + CGFloat(hk - d.lo) * bw, y: tempoT, width: bw, height: hoehe)), with: .color(grau.opacity(0.18)))
    }
    for k in d.lo...d.hi {
        let x0: CGFloat = tempoL + CGFloat(k - d.lo) * bw + 1
        let bb: CGFloat = max(bw - 2, 1)
        let a: Double = d.anH[k]
        if a > 0 {
            ctx.fill(Path(roundedRect: CGRect(x: x0, y: y(a), width: bb, height: y(0) - y(a)), cornerRadius: min(2, bb / 2)),
                     with: .color(tempoFarbe))
        }
        let g: Double = d.anG?[k] ?? 0
        if g > 0 {
            let luft: CGFloat = a - g > 0.0005 ? 1 : 0
            ctx.fill(Path(CGRect(x: x0, y: y(g) + luft, width: bb, height: max(y(0) - y(g) - luft, 0))), with: .color(tempoFarbeGleit))
        }
    }
    // Vergleich als Stufenlinie ueber den Balken
    if !d.anV.isEmpty {
        var pfad = Path()
        for k in d.lo...d.hi {
            let x0: CGFloat = tempoL + CGFloat(k - d.lo) * bw
            let yy: CGFloat = y(k < d.anV.count ? d.anV[k] : 0)
            if k == d.lo { pfad.move(to: CGPoint(x: x0, y: yy)) } else { pfad.addLine(to: CGPoint(x: x0, y: yy)) }
            pfad.addLine(to: CGPoint(x: x0 + bw, y: yy))
        }
        ctx.stroke(pfad, with: .color(tempoFarbeVgl), style: StrokeStyle(lineWidth: 2, lineJoin: .round))
    }
    var basis = Path()
    basis.move(to: CGPoint(x: tempoL, y: y(0)))
    basis.addLine(to: CGPoint(x: w - tempoR, y: y(0)))
    ctx.stroke(basis, with: .color(grau), lineWidth: 1)
    // x-Achse in km/h
    let spanne: Double = Double(n) * d.br
    let xSchritt: Double = spanne > 24 ? 5 : (spanne > 10 ? 2 : 1)
    var t: Double = (Double(d.lo) * d.br / xSchritt).rounded(.up) * xSchritt
    while t <= Double(d.hi + 1) * d.br {
        ctx.draw(Text(tempoKmh(t)).font(.system(size: 9)).foregroundColor(grau), at: CGPoint(x: x(t), y: h - tempoB + 9), anchor: .center)
        t += xSchritt
    }
    ctx.draw(Text("km/h").font(.system(size: 9)).foregroundColor(grau), at: CGPoint(x: w - tempoR, y: h - 2), anchor: .bottomTrailing)
}

/// Eine Darstellung fuer alle Stellen (Home › Stats › Tempo, Session-Details).
struct TempoVerteilungView: View {
    let haupt: TempoReihe
    var vergleich: TempoReihe? = nil
    let breiteKmh: Double
    var sekunden: Bool = true
    let lang: String
    @State private var hover: Int? = nil
    @State private var tabelle: Bool = false

    var body: some View {
        let d: TempoDaten = tempoAufbereiten(haupt, vergleich, breiteKmh, sekunden)
        if d.sumH <= 0 {
            Text(Loc.t("tempo.empty", lang)).font(.subheadline).foregroundStyle(.secondary)
        } else {
            VStack(alignment: .leading, spacing: 8) {
                if d.anG != nil || !d.anV.isEmpty { legende(d) }
                if let hk = hover, hk >= d.lo, hk <= d.hi { stufenInfo(d, hk) }
                diagramm(d)
                fussZeile(d)
                if tabelle { tabelleView(d) }
                if d.anG != nil {
                    Text(Loc.t("tempo.glideHint", lang)).font(.caption).foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    private func legendePunkt(_ farbe: Color, _ text: String, linie: Bool = false) -> some View {
        HStack(spacing: 5) {
            RoundedRectangle(cornerRadius: 2).fill(farbe).frame(width: linie ? 14 : 10, height: linie ? 2 : 10)
            Text(text).font(.caption).lineLimit(1)
        }
    }

    private func legende(_ d: TempoDaten) -> some View {
        HStack(spacing: 12) {
            legendePunkt(tempoFarbe, haupt.label)
            if d.anG != nil { legendePunkt(tempoFarbeGleit, Loc.t("tempo.glideShare", lang)) }
            if let v = vergleich, !d.anV.isEmpty { legendePunkt(tempoFarbeVgl, v.label, linie: true) }
        }
    }

    private func stufenText(_ d: TempoDaten, _ k: Int) -> String {
        tempoKmh(Double(k) * d.br) + "–" + tempoKmh(Double(k + 1) * d.br) + " km/h"
    }

    /// Statt des schwebenden Hinweises im Web: eine Zeile ueber dem Diagramm fuer die angetippte Stufe.
    private func stufenInfo(_ d: TempoDaten, _ k: Int) -> some View {
        var teile: [String] = [stufenText(d, k)]
        let haupttext: String = haupt.label + ": " + tempoPct(d.anH[k]) + (sekunden ? " · " + tempoDauer(d.ah[k]) : "")
        teile.append(haupttext)
        if let g = d.anG { teile.append(Loc.t("tempo.glideShare", lang) + ": " + tempoPct(g[k])) }
        if let v = vergleich, !d.anV.isEmpty { teile.append(v.label + ": " + tempoPct(k < d.anV.count ? d.anV[k] : 0)) }
        return Text(teile.joined(separator: " · ")).font(.caption).monospacedDigit()
            .fixedSize(horizontal: false, vertical: true)
    }

    private func ariaText(_ d: TempoDaten) -> String {
        Loc.t("tempo.aria", lang).replacingOccurrences(of: "{p10}", with: tempoKmh(d.p[0]))
            .replacingOccurrences(of: "{p50}", with: tempoKmh(d.p[1])).replacingOccurrences(of: "{p90}", with: tempoKmh(d.p[2]))
    }

    private func diagramm(_ d: TempoDaten) -> some View {
        GeometryReader { geo in
            Canvas { ctx, size in tempoZeichnen(&ctx, size, d, hover) }
                .contentShape(Rectangle())
                .onTapGesture(coordinateSpace: .local) { pt in antippen(pt, geo.size.width, d) }
        }
        .frame(height: 210)
        .accessibilityElement()
        .accessibilityLabel(ariaText(d))
    }

    private func antippen(_ pt: CGPoint, _ breite: CGFloat, _ d: TempoDaten) {
        let n: Int = d.hi - d.lo + 1
        let bw: CGFloat = (breite - tempoL - tempoR) / CGFloat(n)
        guard bw > 0, pt.x >= tempoL, pt.x <= breite - tempoR else { hover = nil; return }
        let k: Int = d.lo + Int((pt.x - tempoL) / bw)
        hover = (hover == k) ? nil : min(k, d.hi)
    }

    private func rangeText(_ d: TempoDaten) -> String {
        let r: String = Loc.t("tempo.range", lang).replacingOccurrences(of: "{p10}", with: tempoKmh(d.p[0]))
            .replacingOccurrences(of: "{p50}", with: tempoKmh(d.p[1])).replacingOccurrences(of: "{p90}", with: tempoKmh(d.p[2]))
        return sekunden ? r + " · " + tempoDauer(d.sumH) : r
    }

    private func fussZeile(_ d: TempoDaten) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(rangeText(d)).font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 6)
            Button(Loc.t(tabelle ? "tempo.hideTable" : "tempo.showTable", lang)) { tabelle.toggle() }
                .font(.caption).buttonStyle(.borderless)
        }
    }

    private func tabellenZeile(_ cells: [String], kopf: Bool) -> some View {
        HStack {
            Text(cells[0]).frame(maxWidth: .infinity, alignment: .leading)
            ForEach(1..<cells.count, id: \.self) { i in
                Text(cells[i]).frame(maxWidth: .infinity, alignment: .trailing)
            }
        }
        .font(.caption).fontWeight(kopf ? .semibold : .regular).monospacedDigit()
        .foregroundStyle(kopf ? Color.secondary : Color.primary)
    }

    private func tabelleView(_ d: TempoDaten) -> some View {
        let mitV: Bool = vergleich != nil && !d.anV.isEmpty
        var kopf: [String] = ["km/h", haupt.label]
        if d.anG != nil { kopf.append(Loc.t("tempo.glideShare", lang)) }
        if mitV { kopf.append(vergleich?.label ?? "") }
        return VStack(spacing: 3) {
            tabellenZeile(kopf, kopf: true)
            ForEach(d.lo...d.hi, id: \.self) { k in
                Divider()
                tabellenZeile(tabellenWerte(d, k, mitV), kopf: false)
            }
        }
        .padding(8)
        .background(Color(.tertiarySystemFill).opacity(0.5), in: RoundedRectangle(cornerRadius: 8))
    }

    private func tabellenWerte(_ d: TempoDaten, _ k: Int, _ mitV: Bool) -> [String] {
        var z: [String] = [tempoKmh(Double(k) * d.br) + "–" + tempoKmh(Double(k + 1) * d.br), tempoPct(d.anH[k])]
        if let g = d.anG { z.append(tempoPct(g[k])) }
        if mitV { z.append(tempoPct(k < d.anV.count ? d.anV[k] : 0)) }
        return z
    }
}

/// Home › Stats › Tempo (web TempoBereich.tsx): die eigene Tempo-Verteilung, gefiltert nach Zeitraum, Foil und Spot;
/// Vergleich mit einem anderen eigenen Foil oder mit allen Fahrern auf dem gewaehlten Foil.
struct TempoBereich: View {
    let lang: String
    @State private var period: String = "all"
    @State private var foilId: Int? = nil
    @State private var spotId: Int? = nil
    @State private var vgl: String = ""                 // "" | "foil:<id>" | "community"
    @State private var d: TempoEigen? = nil
    @State private var vd: TempoReihe? = nil
    @State private var vInfo: TempoFoil? = nil
    @State private var fehler: Bool = false

    private let periods: [(String, String)] = [("today", "period.today"), ("yesterday", "period.yesterday"), ("10d", "period.10d"),
                                               ("30d", "period.30d"), ("365d", "period.365d"), ("all", "period.all")]

    private var ladeSchluessel: String { "\(period)|\(foilId ?? -1)|\(spotId ?? -1)" }
    private var vglSchluessel: String { "\(vgl)|\(period)|\(spotId ?? -1)|\(foilId ?? -1)|\(d?.foils.count ?? 0)" }
    private var label: String {
        if let f = foilId, let l = d?.foils.first(where: { $0.id == f })?.label { return l }
        return Loc.t("tempo.mine", lang)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(Loc.t("tempo.title", lang)).font(.title3).fontWeight(.bold)
            Text(Loc.t("tempo.intro", lang)).font(.subheadline).foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            filterZeilen
            if fehler { Text(Loc.t("tempo.error", lang)).font(.subheadline).foregroundStyle(.red) }
            if let d {
                TempoVerteilungView(haupt: TempoReihe(a: d.a, g: d.g, g_basis: d.g_basis, label: label), vergleich: vd,
                                    breiteKmh: d.breite_kmh, lang: lang)
            } else if !fehler {
                ProgressView().frame(maxWidth: .infinity)
            }
            hinweise
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .task(id: ladeSchluessel) { await laden() }
        .task(id: vglSchluessel) { await vergleichLaden() }
        // Vergleich mit dem gerade gewaehlten Foil selbst ergibt nichts -> zuruecksetzen
        .onChange(of: foilId) { f in
            if vgl == "foil:\(f ?? -1)" || (vgl == "community" && f == nil) { vgl = "" }
        }
    }

    @ViewBuilder private var hinweise: some View {
        if vgl == "community", let vi = vInfo, !vi.genug {
            Text(Loc.t("tempo.communityTooFew", lang).replacingOccurrences(of: "{n}", with: String(vi.min_fahrer))
                .replacingOccurrences(of: "{m}", with: String(vi.fahrer)))
                .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        }
        if let d, d.unvollstaendig > 0 {
            Text(Loc.t("tempo.incomplete", lang).replacingOccurrences(of: "{n}", with: String(d.unvollstaendig)))
                .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        }
    }

    private var filterZeilen: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) { periodWahl; foilWahl; Spacer(minLength: 0) }
            HStack(spacing: 8) { spotWahl; vglWahl; Spacer(minLength: 0) }
        }
    }

    private var periodWahl: some View {
        Picker(Loc.t("tempo.period", lang), selection: $period) {
            ForEach(periods, id: \.0) { p in Text(Loc.t(p.1, lang)).tag(p.0) }
        }
        .pickerStyle(.menu)
    }

    private var foilWahl: some View {
        Picker(Loc.t("tempo.foil", lang), selection: $foilId) {
            Text(Loc.t("tempo.allFoils", lang)).tag(nil as Int?)
            ForEach(d?.foils ?? []) { f in Text(f.label).tag(f.id as Int?) }
        }
        .pickerStyle(.menu)
    }

    private var spotWahl: some View {
        Picker(Loc.t("tempo.spot", lang), selection: $spotId) {
            Text(Loc.t("tempo.allSpots", lang)).tag(nil as Int?)
            ForEach(d?.spots ?? []) { s in Text(s.label).tag(s.id as Int?) }
        }
        .pickerStyle(.menu)
    }

    private var vglFoils: [TempoEigen.Eintrag] { (d?.foils ?? []).filter { $0.id != foilId } }

    private var vglWahl: some View {
        HStack(spacing: 4) {
            Text(Loc.t("tempo.compare", lang)).font(.subheadline).foregroundStyle(.secondary)
            Picker(Loc.t("tempo.compare", lang), selection: $vgl) {
                Text("—").tag("")
                if foilId != nil { Text(Loc.t("tempo.compareCommunity", lang)).tag("community") }
                ForEach(vglFoils) { f in Text(f.label).tag("foil:\(f.id)") }
            }
            .pickerStyle(.menu)
        }
    }

    private func laden() async {
        fehler = false
        let p: String = period, f: Int? = foilId, s: Int? = spotId
        do {
            let r: TempoEigen = try await Api.tempoEigen(period: p, foilId: f, spotId: s)
            if p == period && f == foilId && s == spotId { d = r }
        } catch {
            // Abgebrochener Abruf einer alten Auswahl (schneller Wechsel) ist kein Fehler der neuen.
            if !(error is CancellationError) && p == period && f == foilId && s == spotId { fehler = true }
        }
    }

    private func vergleichLaden() async {
        vd = nil; vInfo = nil
        if vgl.hasPrefix("foil:"), let id = Int(vgl.dropFirst(5)) {
            let l: String = d?.foils.first(where: { $0.id == id })?.label ?? ""
            if let r = try? await Api.tempoEigen(period: period, foilId: id, spotId: spotId) {
                vd = TempoReihe(a: r.a, label: l)
            }
        } else if vgl == "community", let f = foilId {
            if let r = try? await Api.tempoFoil(f) {
                vInfo = r
                if r.genug, let a = r.a {
                    vd = TempoReihe(a: a, label: Loc.t("tempo.community", lang).replacingOccurrences(of: "{n}", with: String(r.fahrer)))
                }
            }
        }
    }
}
