import SwiftUI

// Auth-Gate: eingeloggt -> Tab-Navigation, sonst Login.
struct RootView: View {
    @EnvironmentObject var session: SessionStore
    @AppStorage("themeMode") private var themeMode = "auto"   // "auto" | "light" | "dark"
    @Environment(\.scenePhase) private var scenePhase
    @State private var showSplash = true
    @State private var wasBackground = false
    var body: some View {
        content
            .preferredColorScheme(preferredScheme)
            .ageGate(session: session)   // Declared Age Range (iOS 26+) -> social_allowed ans Backend
            .task { await session.bootstrap() }
            // Nur echte Rückkehr aus dem Hintergrund (nicht der Start — den macht bootstrap()).
            .onChange(of: scenePhase) { phase in handleScenePhase(phase) }
            .overlay { splashOverlay }
    }

    private var content: some View {
        Group {
            if session.isLoggedIn {
                MainTabView()
            } else {
                LoginView()
            }
        }
    }

    // War ein verschachteltes Ternary direkt im Modifier — das ist teuer, weil der Type-Checker
    // dafuer alle ColorScheme-Ueberladungen durchgeht. "auto" = nil, also System-Einstellung.
    private var preferredScheme: ColorScheme? {
        if themeMode == "light" { return .light }
        if themeMode == "dark" { return .dark }
        return nil
    }

    // Inhaltlich unveraendert (frischer Fix): nur die echte Rueckkehr aus dem Hintergrund laedt
    // die Anzeige-Einstellungen neu — den Kaltstart macht bootstrap(). Als Methode statt als
    // onChange-Closure: Ablauflogik kostet den Type-Checker im ViewBuilder unnoetig viel.
    private func handleScenePhase(_ phase: ScenePhase) {
        if phase == .background {
            wasBackground = true
        } else if phase == .active, wasBackground {
            wasBackground = false
            Task { await session.refreshDisplayPrefs() }
        }
    }

    @ViewBuilder private var splashOverlay: some View {
        if showSplash {
            SplashView()
                .transition(.opacity)
                .task { await hideSplash() }
        }
    }

    private func hideSplash() async {
        try? await Task.sleep(nanoseconds: 1_100_000_000)
        withAnimation(.easeOut(duration: 0.4)) { showSplash = false }
    }
}

// Eigener 7-Button-Tab-Bar (statt System-TabView, das ab >5 Tabs ein „…"-Mehr-Menü zeigt).
// Alle Ziele direkt erreichbar; erneutes Tippen auf den aktiven Tab setzt ihn auf die Wurzel
// zurück (Remount via .id). Views bleiben pro Tab am Leben (ZStack + opacity) → Zustand erhalten.
struct MainTabView: View {
    @AppStorage("appLang") private var lang = "de"
    @EnvironmentObject private var session: SessionStore
    @ObservedObject private var compare = CompareStore.shared
    @State private var showCompare = false
    @State private var tab = 0
    @State private var resetTokens = Array(repeating: 0, count: 7)
    // Schon geoeffnete Tabs. Sie bleiben danach im ZStack liegen (unveraendert) — aber ein Tab,
    // den der Nutzer noch nie angetippt hat, wird gar nicht erst gebaut. Siehe tabPages.
    @State private var besucht: Set<Int> = [0]
    private var socialOK: Bool { session.profile?.social_allowed != false }
    // Sichtbare Tab-IDs — Reihenfolge wie Android/Web: Home, Foilers(2), Sessions(1), Verlauf,
    // Spots, Chat, Profil. Age-Gate blendet NUR den Chat (5) aus; Foilers (2) darf man ansehen.
    private var visibleTabs: [Int] { socialOK ? [0, 2, 1, 3, 4, 5, 6] : [0, 2, 1, 3, 4, 6] }

    // Seiten-Stapel, Tab-Leiste und Vergleichs-Balken sind je ein eigener, explizit typisierter
    // Ausdruck: Swifts Type-Checker loest einen ViewBuilder als EINEN Ausdruck auf, und dieser Body
    // war ~58 Zeilen mit zwei ForEach + Button-Closure darin. Layout und Reihenfolge unveraendert.
    var body: some View {
        VStack(spacing: 0) {
            tabPages
            Divider()
            tabBar
        }
        .overlay(alignment: .bottom) { compareOverlay }
        .sheet(isPresented: $showCompare) {
            NavigationStack { CompareView(preselect: compare.refs) }
        }
    }

    // Ein Tab entsteht ERST beim ersten Oeffnen. Vorher baute der ZStack beim Kaltstart alle
    // sieben Bildschirme auf einmal — samt Spots-Karte mit ueber 200 MapKit-Pins und samt der
    // `.task`-Ladevorgaenge jedes Tabs. Belegt durch ein Crash-Log eines Nutzers (20.08., 1.1.24):
    // FRONTBOARD 0x8BADF00D, „scene-update watchdog transgression: exhausted real (wall clock)
    // time allowance of 10.00 seconds", Hauptthread in LazyLayoutViewCache.updatePrefetchPhases —
    // iOS schiesst die App ab, wenn EIN Layout-Durchgang zehn Sekunden braucht. Am Verhalten
    // aendert das nichts: selectTab() zaehlt resetTokens hoch, ein Tab wurde also ohnehin bei
    // jedem Antippen neu gebaut.
    private var tabPages: some View {
        ZStack {
            ForEach(visibleTabs, id: \.self) { i in
                if besucht.contains(i) {
                tabContent(i)
                    .id("tab\(i)-\(resetTokens[i])")
                    .opacity(tab == i ? 1 : 0)
                    .allowsHitTesting(tab == i)
                    .zIndex(tab == i ? 1 : 0)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var tabBar: some View {
        HStack(alignment: .top, spacing: 0) {
            ForEach(visibleTabs, id: \.self) { i in tabButton(i) }
        }
        .padding(.top, 6)
        .background(.bar)
    }

    private func tabButton(_ i: Int) -> some View {
        Button { selectTab(i) } label: { tabButtonLabel(i) }
            .buttonStyle(.plain)
    }

    private func tabButtonLabel(_ i: Int) -> some View {
        VStack(spacing: 2) {
            // Feste Icon-Höhe -> alle Labels auf identischer Höhe (SF-Symbole sind
            // unterschiedlich hoch, z. B. mappin höher als house).
            Image(systemName: tabIcon(i)).font(.system(size: 17))
                .frame(height: 20)
            Text(tabLabel(i)).font(.system(size: 9)).lineLimit(1)
        }
        .frame(maxWidth: .infinity)
        .foregroundStyle(tab == i ? Color.accentColor : Color.secondary)
        .contentShape(Rectangle())
    }

    // Ein Tipp im Menue fuehrt IMMER zur Uebersicht des Bereichs — bei JEDEM Tab, nicht nur bei
    // Sessions. Die Ansichten bleiben pro Tab am Leben, also bleibt auch ihr NavigationStack stehen:
    // eine zuvor geoeffnete Session lag sonst noch darunter. Zum Blaettern zwischen Sessions gibt es
    // „Aelter"/„Neuer". Preis: die Scroll-Position eines Tabs geht beim Wechsel verloren.
    private func selectTab(_ i: Int) {
        besucht.insert(i)
        resetTokens[i] += 1
        if tab != i { tab = i }
    }

    @ViewBuilder private var compareOverlay: some View {
        if !compare.refs.isEmpty {
            Button { showCompare = true } label: {
                Label(compareBarText, systemImage: "arrow.left.arrow.right")
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, 18).padding(.vertical, 12)
                    .background(Color.accentColor, in: Capsule())
                    .foregroundStyle(.black)
                    .shadow(color: .black.opacity(0.3), radius: 8, y: 2)
            }
            .padding(.bottom, 72)
        }
    }

    private var compareBarText: String {
        Loc.t("compare.bar", lang).replacingOccurrences(of: "{n}", with: String(compare.refs.count))
    }

    @ViewBuilder private func tabContent(_ i: Int) -> some View {
        switch i {
        case 0: HomeView()
        case 1: SessionsView()
        case 2: CommunityView()
        case 3: VerlaufView()
        case 4: SpotsView()
        case 5: ChatView()
        default: ProfileView()
        }
    }

    private func tabIcon(_ i: Int) -> String {
        switch i {
        case 0: return "house"
        case 1: return "list.bullet"
        case 2: return "person.2"
        case 3: return "chart.xyaxis.line"
        case 4: return "mappin.and.ellipse"
        case 5: return "bubble.left.and.bubble.right"
        default: return "person.crop.circle"
        }
    }

    private func tabLabel(_ i: Int) -> String {
        switch i {
        case 0: return Loc.t("nav.home", lang)
        case 1: return Loc.t("nav.sessions", lang)
        case 2: return "Foilers"
        case 3: return Loc.t("nav.history", lang)
        case 4: return Loc.t("nav.spots", lang)
        case 5: return Loc.t("nav.chat", lang)
        default: return Loc.t("nav.profile", lang)
        }
    }
}
