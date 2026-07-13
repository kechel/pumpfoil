import SwiftUI
import UIKit

@main
struct PumpfoilApp: App {
    @StateObject private var session = SessionStore()
    @StateObject private var sync = SyncManager.shared

    init() {
        // Nav-Bar + Statusleisten-Bereich global in Marken-Cyan (dunkle Titel/Inhalte), einmalig
        // über die UIKit-Appearance — stabil, kein per-View toolbarBackground (das löste in
        // NavigationStacks einen SwiftUI-Update-Zyklus/Hang aus, z. B. beim Zurück aus dem Chat).
        let cyan = UIColor(red: 0x22 / 255, green: 0xD3 / 255, blue: 0xEE / 255, alpha: 1)
        let a = UINavigationBarAppearance()
        a.configureWithOpaqueBackground()
        a.backgroundColor = cyan
        a.shadowColor = .clear
        // Feste dunkle Bar-Inhalte (Brand-Navy) — auf Cyan in Light UND Dark gut lesbar.
        let navy = UIColor(red: 0x02 / 255, green: 0x06 / 255, blue: 0x17 / 255, alpha: 1)
        let dark: [NSAttributedString.Key: Any] = [.foregroundColor: navy]
        a.titleTextAttributes = dark
        a.largeTitleTextAttributes = dark
        UINavigationBar.appearance().standardAppearance = a
        UINavigationBar.appearance().compactAppearance = a
        UINavigationBar.appearance().scrollEdgeAppearance = a
        UINavigationBar.appearance().tintColor = navy
    }

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
    @Published var profile: Profile? {
        didSet { UserDefaults.standard.set(profile?.language ?? "de", forKey: "appLang") }
    }
    var isLoggedIn: Bool { token != nil }

    init() {
        // Abgelaufene Session (401): Api hat schon abgemeldet, hier nur die UI zum Login.
        Api.onUnauthorized = { [weak self] in
            Task { @MainActor in self?.logout() }
        }
    }

    func bootstrap() async {
        guard token != nil else { return }
        if let p = try? await Api.getProfile() {
            profile = p
            SyncManager.shared.pushPairingToWatch()   // gekoppelte Uhr automatisch verknüpfen
            // Age-Gate läuft jetzt als View-Modifier in RootView (.ageGate) — braucht die
            // SwiftUI-Environment-Action requestAgeRange, daher nicht mehr hier im Store.
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
        // Age-Gate: siehe RootView .ageGate (View-Modifier).
    }

    func logout() {
        Api.token = nil
        token = nil
        profile = nil
        UserDefaults.standard.removeObject(forKey: "mintedWatchToken")
    }
}
