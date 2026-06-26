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
        if let p = try? await Api.getProfile() {
            profile = p
            SyncManager.shared.pushPairingToWatch()   // gekoppelte Uhr automatisch verknüpfen
        } else { logout() }   // Token ungültig -> abmelden
    }

    func login(email: String, password: String) async throws {
        let t = try await Api.login(email: email, password: password)
        await finishAuth(t)
    }

    func register(email: String, password: String, name: String) async throws {
        let t = try await Api.register(email: email, password: password, name: name)
        await finishAuth(t)
    }

    func appleNative(idToken: String, name: String) async throws {
        let t = try await Api.nativeApple(idToken: idToken, name: name)
        await finishAuth(t)
    }

    private func finishAuth(_ t: String) async {
        Api.token = t
        token = t
        profile = try? await Api.getProfile()
        SyncManager.shared.pushPairingToWatch()       // nach Login die Uhr verknüpfen
    }

    func logout() {
        Api.token = nil
        token = nil
        profile = nil
        UserDefaults.standard.removeObject(forKey: "mintedWatchToken")
    }
}
