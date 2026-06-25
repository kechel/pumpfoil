import SwiftUI

// Auth-Gate: eingeloggt -> Tab-Navigation, sonst Login.
struct RootView: View {
    @EnvironmentObject var session: SessionStore
    var body: some View {
        Group {
            if session.isLoggedIn {
                MainTabView()
            } else {
                LoginView()
            }
        }
        .task { await session.bootstrap() }
    }
}

// iOS-typische Tab-Navigation mit SF Symbols.
struct MainTabView: View {
    var body: some View {
        TabView {
            SessionsView()
                .tabItem { Label("Sessions", systemImage: "list.bullet") }
            CommunityView()
                .tabItem { Label("Community", systemImage: "person.2") }
            VerlaufView()
                .tabItem { Label("Verlauf", systemImage: "chart.xyaxis.line") }
            SpotsView()
                .tabItem { Label("Spots", systemImage: "mappin.and.ellipse") }
            ChatView()
                .tabItem { Label("Chat", systemImage: "bubble.left.and.bubble.right") }
            ProfileView()
                .tabItem { Label("Profil", systemImage: "person.crop.circle") }
        }
    }
}
