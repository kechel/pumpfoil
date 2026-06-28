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

// iOS-typische Tab-Navigation mit SF Symbols. Labels nach Profil-Sprache.
struct MainTabView: View {
    @AppStorage("appLang") private var lang = "de"
    var body: some View {
        TabView {
            HomeView()
                .tabItem { Label(Loc.t("nav.home", lang), systemImage: "house") }
            SessionsView()
                .tabItem { Label(Loc.t("nav.sessions", lang), systemImage: "list.bullet") }
            CommunityView()
                .tabItem { Label(Loc.t("nav.community", lang), systemImage: "person.2") }
            VerlaufView()
                .tabItem { Label(Loc.t("nav.history", lang), systemImage: "chart.xyaxis.line") }
            SpotsView()
                .tabItem { Label(Loc.t("nav.spots", lang), systemImage: "mappin.and.ellipse") }
            ChatView()
                .tabItem { Label(Loc.t("nav.chat", lang), systemImage: "bubble.left.and.bubble.right") }
            ProfileView()
                .tabItem { Label(Loc.t("nav.profile", lang), systemImage: "person.crop.circle") }
        }
    }
}
