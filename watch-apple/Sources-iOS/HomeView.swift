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
        var r: [ReiterDef] = [ReiterDef(id: "uebersicht", label: Loc.t("tab.overview", lang)),
                              ReiterDef(id: "rekorde", label: Loc.t("side.records", lang)),
                              // Abzeichen: LIVE bzw. Zahl der kommenden Events der eigenen Teams (web 03fd4574).
                              ReiterDef(id: "team", label: Loc.t("tab.team", lang), abzeichen: reiterAbzeichen(teamEvents))]
        // „Spots" nur mit Homespot oder eigenen Spots (wie im Web).
        if homespotName != nil || !(meineSpots ?? []).isEmpty { r.append(ReiterDef(id: "spots", label: Loc.t("nav.spots", lang))) }
        r.append(ReiterDef(id: "stats", label: Loc.t("tab.stats", lang)))
        r.append(ReiterDef(id: "performance", label: Loc.t("tab.performance", lang)))
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
         ReiterDef(id: "brett", label: Loc.t("home.boardAttitude", lang))]
    }

    @ViewBuilder private var homeStats: some View {
        Reiterleiste(reiter: statsReiter, aktiv: Binding(get: { statsTab }, set: { statsTab = $0; ReiterSpeicher.setze("homestats", $0) }),
                     stufe: 2)
        switch statsTab {
        case "kennzahlen": statsKennzahlen
        case "brett": BrettLageStartseite(lang: lang, erklaerungWennLeer: true)
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
}

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
}

// Zwei Tempo-, zwei Ausdauer-Kategorien (Vorschlag eines Fahrers 19.11.2026, Jan 20.11.): Zeit auf dem Foil am Tag statt
// laengster Laufzeit. Der Server liefert `run_time` fuer aeltere Apps weiter.
private let perfKats: [String] = ["sprint_100m", "sprint_60s", "run_distance", "foil_time_day"]
private let perfCyan = Color(red: 34 / 255, green: 211 / 255, blue: 238 / 255)   // Markenfarbe (brand-design)
private let perfBuckets: [(String, (Int) -> Bool)] = [
    ("1", { $0 == 1 }), ("2", { $0 == 2 }), ("3", { $0 == 3 }),
    ("4–5", { $0 >= 4 && $0 <= 5 }), ("6–10", { $0 >= 6 && $0 <= 10 }),
    // Weitere Stufen (Jan 18.11.2026): die Felder haben 15 bis 80 Fahrer, „11+" sagte zu wenig.
    ("11–20", { $0 >= 11 && $0 <= 20 }), ("21–30", { $0 >= 21 && $0 <= 30 }), ("31–50", { $0 >= 31 && $0 <= 50 }),
    ("51+", { $0 > 50 })]

private func perfWertText(_ k: String, _ v: Double) -> String {
    if k == "sprint_100m" || k == "sprint_60s" { return String(format: "%.1f km/h", v * 3.6) }
    if k == "run_distance" { return "\(Int(v.rounded())) m" }
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
    @State private var sport: String = "pumpfoil"
    @State private var zeitraum: String = "25"   // alle | 30 | 25 (letzte 25 Tage mit Wertung, Standard seit Jan 18.11.)
    @State private var daten: PerfAntwort?
    @State private var fehler: String?
    @State private var saisonInfo: Bool = false
    // Unterreiter Uebersicht | Verlauf (Web 18.11.2026 abends) und die Kategorie des Platzverlaufs.
    @State private var sub: String = ReiterSpeicher.von("homeperf", "uebersicht")
    @State private var kat: String = "sprint_100m"

    private var grenze: String {
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
    private func je(_ k: String) -> [PerfZeile] { (daten?.kategorien[k] ?? []).filter { $0.tag >= grenze } }
    private var alle: [PerfZeile] { perfKats.flatMap { je($0) } }
    private var tage: [String] { Array(Set(alle.map { $0.tag })).sorted(by: >) }
    private func quote(_ n: Int) -> String { alle.isEmpty ? "–" : "\(Int((100.0 * Double(n) / Double(alle.count)).rounded())) %" }
    private func sportName(_ s: String) -> String {
        s.split(separator: "+").map { Loc.t("cls.sport." + String($0), lang) }.joined(separator: " + ")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Reiterleiste(reiter: perfReiter, aktiv: Binding(get: { sub }, set: { sub = $0; ReiterSpeicher.setze("homeperf", $0) }),
                         stufe: 2)
            auswahl
            Text(Loc.t("perf.intro", lang).replacingOccurrences(of: "{n}", with: String(daten?.min_feld ?? 5)))
                .font(.subheadline).foregroundStyle(.secondary)
            if let s = daten?.saison { saisonKachel(s) }
            inhalt
        }
        .task(id: sport) { await laden() }
    }

    // Saison mit Punkten (wie Web, Jan 20.11.2026): kompakt rechtsbuendig, (i) zeigt Punktetabelle und Regeln.
    private func saisonZeile(_ s: PerfSaison) -> String {
        if !s.gestartet { return Loc.t("perf.saison.startet", lang).replacingOccurrences(of: "{jahr}", with: String(s.jahr)) }
        guard let r = s.rang else { return Loc.t("perf.saison.nochKeine", lang) }
        return Loc.t("perf.saison.rang", lang).replacingOccurrences(of: "{rang}", with: String(r))
            .replacingOccurrences(of: "{fahrer}", with: String(s.fahrer)).replacingOccurrences(of: "{tage}", with: String(s.tage))
    }

    private func saisonKachel(_ s: PerfSaison) -> some View {
        HStack {
            Spacer(minLength: 0)
            VStack(alignment: .trailing, spacing: 2) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(Loc.t("perf.saisonTitel", lang)).font(.caption).fontWeight(.semibold).foregroundStyle(perfCyan)
                    Text(String(s.punkte)).font(.title2).fontWeight(.bold).monospacedDigit()
                    Text(Loc.t("perf.saison.punkte", lang)).font(.caption).foregroundStyle(.secondary)
                    Button { saisonInfo = true } label: { Image(systemName: "info.circle").foregroundStyle(.secondary) }
                        .buttonStyle(.borderless)
                }
                Text(saisonZeile(s)).font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.trailing)
            }
            .padding(.vertical, 8).padding(.horizontal, 12)
            .background(perfCyan.opacity(0.12)).clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .sheet(isPresented: $saisonInfo) { saisonInfoSheet(s) }
    }

    private func saisonInfoSheet(_ s: PerfSaison) -> some View {
        let kats: String = s.regel.kategorien.map { Loc.t("perf.kat." + $0, lang) }.joined(separator: " · ")
        return NavigationStack {
            List {
                Section { Text(Loc.t("perf.saison.infoIntro", lang)).font(.subheadline) }
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
            Picker("", selection: $sport) {
                Text(sportName("pumpfoil")).tag("pumpfoil")
                Text(sportName("pumpfoil+foil_scoot")).tag("pumpfoil+foil_scoot")
            }.pickerStyle(.segmented)
            Picker(Loc.t("perf.tage", lang), selection: $zeitraum) {
                Text(Loc.t("perf.seit", lang).replacingOccurrences(of: "{datum}", with: daten?.ab ?? "…")).tag("alle")
                Text(Loc.t("perf.tage30", lang)).tag("30")
                Text(Loc.t("perf.letzte25", lang)).tag("25")
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
        } else if sub == "verlauf" {
            platzVerlauf
            raster
            verlauf
        } else {
            kennzahlen
            kategorieTabelle
            bestleistungen
            ForEach(perfKats, id: \.self) { k in kategorieKarte(k) }
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
            Text(Loc.t("perf.kat." + k, lang)).font(.subheadline).fontWeight(.medium)
            if z.isEmpty {
                Text(Loc.t("perf.keineTage", lang)).font(.caption).foregroundStyle(.secondary)
            } else {
                let schnittText: String = Loc.t("perf.schnittVon", lang)
                    .replacingOccurrences(of: "{platz}", with: String(format: "%.1f", schnitt(z.map { Double($0.platz) })))
                    .replacingOccurrences(of: "{feld}", with: String(Int(schnitt(z.map { Double($0.feld) }).rounded())))
                let top3: Int = Int((100.0 * Double(z.filter { $0.platz <= 3 }.count) / Double(z.count)).rounded())
                HStack {
                    tabZelle(Loc.t("perf.tage", lang), String(z.count))
                    Spacer(); tabZelle(Loc.t("perf.spSchnitt", lang), schnittText)
                    Spacer(); tabZelle(Loc.t("perf.spBester", lang), String(z.map { $0.platz }.min() ?? 0))
                    Spacer(); tabZelle(Loc.t("perf.spTop3", lang), "\(top3) %")
                    Spacer(); tabZelle(Loc.t("perf.siege", lang), String(z.filter { $0.platz == 1 }.count))
                }
            }
        }
    }

    private func tabZelle(_ label: String, _ wert: String) -> some View {
        VStack(spacing: 2) {
            Text(wert).font(.callout).fontWeight(.medium).foregroundStyle(Color.accentColor)
            Text(label).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
        }
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
            NavigationLink { SessionDetailView(id: b.session_id) } label: { bestInhalt(k, b) }.buttonStyle(.plain)
        } else {
            bestInhalt(k, nil)
        }
    }

    private func bestInhalt(_ k: String, _ b: PerfZeile?) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(Loc.t("perf.kat." + k, lang)).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
            Text(b.map { perfWertText(k, $0.wert) } ?? "–").font(.headline).foregroundStyle(b == nil ? Color.secondary : perfCyan)
            if let b {
                Text(tagKurz(b.tag) + " · " + Loc.t("perf.platzVon", lang).replacingOccurrences(of: "{platz}", with: String(b.platz))
                    .replacingOccurrences(of: "{feld}", with: String(b.feld))).font(.caption2).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading).padding(8)
        .background(Color(.tertiarySystemFill).opacity(0.5)).clipShape(RoundedRectangle(cornerRadius: 8))
    }

    // Platz je Tag in EINER Kategorie: Hoehe = Anteil geschlagener Fahrer, Zahl = Platz; Baender ab 80 % / 50 %.
    private var platzVerlauf: some View {
        let reihe: [PerfZeile] = je(kat).sorted { $0.tag < $1.tag }
        return VStack(alignment: .leading, spacing: 8) {
            Text(Loc.t("perf.platzverlauf", lang)).fontWeight(.semibold)
            Picker("", selection: $kat) {
                ForEach(perfKats, id: \.self) { k in Text(Loc.t("perf.kat." + k, lang)).tag(k) }
            }.pickerStyle(.menu)
            if reihe.isEmpty {
                Text(Loc.t("perf.keineTage", lang)).font(.caption).foregroundStyle(.secondary)
            } else {
                PerfLinie(punkte: reihe.map { $0.perzentil }, baender: true,
                          zahlen: reihe.map { String($0.platz) }).frame(height: 150).padding(.top, 10)
                HStack {
                    Text(reihe.first?.tag ?? "").font(.caption2).foregroundStyle(.secondary)
                    Spacer()
                    Text(reihe.last?.tag ?? "").font(.caption2).foregroundStyle(.secondary)
                }
            }
            Text(Loc.t("perf.platzverlaufHint", lang)).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading).padding(12)
        .background(Color(.secondarySystemBackground)).clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var kennzahlen: some View {
        let besser: Int = Int((alle.reduce(0.0) { $0 + $1.perzentil } / Double(max(alle.count, 1))).rounded())
        let werte: [(String, String)] = [
            (Loc.t("perf.tage", lang), String(tage.count)),
            (Loc.t("perf.besserAls", lang), "\(besser) %"),
            (Loc.t("perf.siege", lang), String(alle.filter { $0.platz == 1 }.count)),
            (Loc.t("perf.podium", lang), quote(alle.filter { $0.platz <= 3 }.count)),
            (Loc.t("perf.top10", lang), quote(alle.filter { $0.platz <= 10 }.count))]
        return LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
            ForEach(werte, id: \.0) { w in
                VStack(alignment: .leading, spacing: 2) {
                    Text(w.0).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                    Text(w.1).font(.title3).fontWeight(.semibold)
                }
                .frame(maxWidth: .infinity, alignment: .leading).padding(8)
                .background(Color(.secondarySystemBackground)).clipShape(RoundedRectangle(cornerRadius: 10))
            }
        }
    }

    private func kategorieKarte(_ k: String) -> some View {
        let z: [PerfZeile] = je(k)
        let maxN: Int = max(1, perfBuckets.map { b in z.filter { b.1($0.platz) }.count }.max() ?? 1)
        return VStack(alignment: .leading, spacing: 4) {
            Text(Loc.t("perf.kat." + k, lang)).fontWeight(.semibold)
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
        VStack(alignment: .leading, spacing: 6) {
            Text(Loc.t("perf.raster", lang)).fontWeight(.semibold)
            HStack(alignment: .top, spacing: 6) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(" ").font(.caption2)
                    ForEach(perfKats, id: \.self) { k in
                        Text(Loc.t("perf.kat." + k, lang)).font(.caption2).lineLimit(2)
                            .frame(width: 90, height: 28, alignment: .leading)
                    }
                }
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 4) {
                        // Zeit von links nach rechts wie in den anderen Darstellungen (Hinweis eines Fahrers, 19.11.2026)
                        ForEach(tage.reversed(), id: \.self) { t in rasterSpalte(t) }
                    }
                }
            }
            HStack(spacing: 6) {
                Text(Loc.t("perf.legende", lang)).font(.caption2).foregroundStyle(.secondary)
                ForEach([10, 50, 90], id: \.self) { p in
                    RoundedRectangle(cornerRadius: 3).fill(perfFarbe(Double(p))).frame(width: 18, height: 10)
                    Text("\(p) %").font(.caption2).foregroundStyle(.secondary)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading).padding(12)
        .background(Color(.secondarySystemBackground)).clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func rasterSpalte(_ t: String) -> some View {
        VStack(spacing: 4) {
            Text(tagKurz(t)).font(.caption2).foregroundStyle(.secondary)
            ForEach(perfKats, id: \.self) { k in rasterZelle(je(k).first { $0.tag == t }) }
        }
    }

    @ViewBuilder private func rasterZelle(_ z: PerfZeile?) -> some View {
        if let z {
            NavigationLink { SessionDetailView(id: z.session_id) } label: {
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
            Text(Loc.t("perf.verlauf", lang)).fontWeight(.semibold)
            if punkte.count < 2 {
                Text(Loc.t("perf.zuWenig", lang)).font(.caption).foregroundStyle(.secondary)
            } else {
                PerfLinie(punkte: punkte).frame(height: 130)
                HStack {
                    Text(tage.last ?? "").font(.caption2).foregroundStyle(.secondary)
                    Spacer()
                    Text(tage.first ?? "").font(.caption2).foregroundStyle(.secondary)
                }
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
                    Circle().fill(perfCyan).frame(width: 7, height: 7)
                        .position(x: px(i, w), y: py(punkte[i], h))
                }
            }
        }
    }
}
