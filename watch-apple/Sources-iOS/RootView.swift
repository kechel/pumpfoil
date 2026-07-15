import SwiftUI

// Auth-Gate: eingeloggt -> Tab-Navigation, sonst Login.
struct RootView: View {
    @EnvironmentObject var session: SessionStore
    @AppStorage("themeMode") private var themeMode = "auto"   // "auto" | "light" | "dark"
    @State private var showSplash = true
    var body: some View {
        Group {
            if session.isLoggedIn {
                MainTabView()
            } else {
                LoginView()
            }
        }
        .preferredColorScheme(themeMode == "light" ? .light : themeMode == "dark" ? .dark : nil)
        .ageGate(session: session)   // Declared Age Range (iOS 26+) -> social_allowed ans Backend
        .task { await session.bootstrap() }
        .overlay {
            if showSplash {
                SplashView()
                    .transition(.opacity)
                    .task {
                        try? await Task.sleep(nanoseconds: 1_100_000_000)
                        withAnimation(.easeOut(duration: 0.4)) { showSplash = false }
                    }
            }
        }
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
    private var socialOK: Bool { session.profile?.social_allowed != false }
    // Sichtbare Tab-IDs — Reihenfolge wie Android/Web: Home, Foilers(2), Sessions(1), Verlauf,
    // Spots, Chat, Profil. Age-Gate blendet NUR den Chat (5) aus; Foilers (2) darf man ansehen.
    private var visibleTabs: [Int] { socialOK ? [0, 2, 1, 3, 4, 5, 6] : [0, 2, 1, 3, 4, 6] }

    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                ForEach(visibleTabs, id: \.self) { i in
                    tabContent(i)
                        .id("tab\(i)-\(resetTokens[i])")
                        .opacity(tab == i ? 1 : 0)
                        .allowsHitTesting(tab == i)
                        .zIndex(tab == i ? 1 : 0)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            Divider()
            HStack(alignment: .top, spacing: 0) {
                ForEach(visibleTabs, id: \.self) { i in
                    Button {
                        if tab == i { resetTokens[i] += 1 } else { tab = i }
                    } label: {
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
                    .buttonStyle(.plain)
                }
            }
            .padding(.top, 6)
            .background(.bar)
        }
        .overlay(alignment: .bottom) {
            if !compare.ids.isEmpty {
                Button { showCompare = true } label: {
                    Label(Loc.t("compare.bar", lang).replacingOccurrences(of: "{n}", with: String(compare.ids.count)),
                          systemImage: "arrow.left.arrow.right")
                        .font(.subheadline.weight(.semibold))
                        .padding(.horizontal, 18).padding(.vertical, 12)
                        .background(Color.accentColor, in: Capsule())
                        .foregroundStyle(.black)
                        .shadow(color: .black.opacity(0.3), radius: 8, y: 2)
                }
                .padding(.bottom, 72)
            }
        }
        .sheet(isPresented: $showCompare) {
            NavigationStack { CompareView(preselect: compare.ids) }
        }
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
