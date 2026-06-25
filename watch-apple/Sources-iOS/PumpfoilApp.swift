import SwiftUI

@main
struct PumpfoilApp: App {
    @StateObject private var session = SessionStore()
    @StateObject private var sync = SyncManager.shared
    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
                .environmentObject(sync)
        }
    }
}

// Hält Auth-Zustand (JWT-Token + Profil) für die ganze App.
@MainActor
final class SessionStore: ObservableObject {
    @Published var token: String? = Api.token
    @Published var profile: Profile?
    var isLoggedIn: Bool { token != nil }

    func bootstrap() async {
        guard token != nil else { return }
        if let p = try? await Api.getProfile() { profile = p }
        else { logout() }   // Token ungültig -> abmelden
    }

    func login(email: String, password: String) async throws {
        let t = try await Api.login(email: email, password: password)
        Api.token = t
        token = t
        profile = try? await Api.getProfile()
    }

    func logout() {
        Api.token = nil
        token = nil
        profile = nil
    }
}
