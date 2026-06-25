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

// iOS-typische Tab-Navigation mit SF Symbols. Weitere Tabs (Community, Verlauf,
// Spots, Chat) folgen in den nächsten Phasen.
struct MainTabView: View {
    var body: some View {
        TabView {
            SessionsView()
                .tabItem { Label("Sessions", systemImage: "list.bullet") }
            ProfileView()
                .tabItem { Label("Profil", systemImage: "person.crop.circle") }
        }
    }
}
