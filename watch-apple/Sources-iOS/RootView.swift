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
    @ObservedObject private var compare = CompareStore.shared
    @State private var showCompare = false
    var body: some View {
        tabs
            // Schwebender Vergleichs-Button (wie Web-CompareBar): sichtbar, sobald per Long-Press
            // Sessions markiert sind; öffnet den Vergleich mit genau diesen.
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
                    .padding(.bottom, 58)
                }
            }
            .sheet(isPresented: $showCompare) {
                NavigationStack { CompareView(preselect: compare.ids) }
            }
    }

    private var tabs: some View {
        TabView {
            HomeView()
                .tabItem { Label(Loc.t("nav.home", lang), systemImage: "house") }
            SessionsView()
                .tabItem { Label(Loc.t("nav.sessions", lang), systemImage: "list.bullet") }
            CommunityView()
                .tabItem { Label("Foilers", systemImage: "person.2") }
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
