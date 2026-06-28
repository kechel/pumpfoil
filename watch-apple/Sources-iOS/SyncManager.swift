import SwiftUI
import WatchConnectivity

// Sync-Status für den Indikator oben rechts (wie Garmin Connect).
// - connected: ist eine Apple Watch gekoppelt + App installiert?
// - syncing:   läuft gerade ein Sync (Spinner)?
// - tick:      erhöht sich nach jedem Sync -> Views laden neu.
//
// Hinweis: Der echte Uhr->iPhone-Datentransfer kommt in einer späteren Phase
// (WatchConnectivity-Übertragung der Roh-Session). Aktuell: Verbindungsanzeige
// + Server-Refresh + best-effort Anstoß an die Uhr.
@MainActor
final class SyncManager: NSObject, ObservableObject {
    static let shared = SyncManager()
    @Published var connected = false
    @Published var syncing = false
    @Published var tick = 0

    private override init() {
        super.init()
        if WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        }
    }

    func refreshConnection() {
        guard WCSession.isSupported() else { connected = false; return }
        let s = WCSession.default
        connected = s.isPaired && s.isWatchAppInstalled
        if connected { pushPairingToWatch() }
    }

    // Companion-Pairing (Apple-idiomatisch): die eingeloggte iPhone-App mintet ein
    // Device-Token und schiebt es per WatchConnectivity auf die Uhr -> kein Code-Tippen.
    // Token wird gecacht und per applicationContext (auch bei inaktiver Uhr-App) zugestellt.
    func pushPairingToWatch(force: Bool = false) {
        guard Api.token != nil, WCSession.isSupported() else { return }
        let s = WCSession.default
        guard s.activationState == .activated, s.isPaired, s.isWatchAppInstalled else { return }
        Task {
            guard let token = await mintedToken(force: force) else { return }
            try? s.updateApplicationContext(["deviceToken": token])
        }
    }

    // Liefert das Companion-Token; mit force=true wird neu gemintet (Recovery, wenn das
    // bisherige Token serverseitig ungültig ist). Der Cache wird bei jedem Mint aktualisiert,
    // damit spätere proaktive Pushes immer das GÜLTIGE Token tragen.
    private func mintedToken(force: Bool) async -> String? {
        if !force, let cached = UserDefaults.standard.string(forKey: "mintedWatchToken") { return cached }
        if let minted = try? await Api.mintDeviceToken() {
            UserDefaults.standard.set(minted, forKey: "mintedWatchToken")
            return minted
        }
        return UserDefaults.standard.string(forKey: "mintedWatchToken")   // Fallback: alter Wert
    }

    func sync() {
        guard !syncing else { return }
        syncing = true
        if WCSession.isSupported(), WCSession.default.isReachable {
            WCSession.default.sendMessage(["action": "sync"], replyHandler: nil, errorHandler: { _ in })
        }
        Task {
            try? await Task.sleep(nanoseconds: 400_000_000)
            tick += 1
            syncing = false
        }
    }
}

extension SyncManager: WCSessionDelegate {
    nonisolated func session(_ session: WCSession,
                             activationDidCompleteWith state: WCSessionActivationState,
                             error: Error?) {
        Task { @MainActor in self.refreshConnection() }
    }
    nonisolated func sessionDidBecomeInactive(_ session: WCSession) {}
    nonisolated func sessionDidDeactivate(_ session: WCSession) {
        WCSession.default.activate()
    }
    nonisolated func sessionWatchStateDidChange(_ session: WCSession) {
        Task { @MainActor in self.refreshConnection() }
    }
    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        Task { @MainActor in self.refreshConnection() }
    }

    // Die Uhr bittet um ein (frisches) Token — z. B. nach 401 (Token serverseitig ungültig).
    // Wir minten neu (force) und antworten direkt; zusätzlich via applicationContext absichern.
    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any],
                             replyHandler: @escaping ([String: Any]) -> Void) {
        guard message["action"] as? String == "needToken" else { replyHandler([:]); return }
        Task { @MainActor in
            guard Api.token != nil, let token = await self.mintedToken(force: true) else { replyHandler([:]); return }
            try? WCSession.default.updateApplicationContext(["deviceToken": token])
            replyHandler(["deviceToken": token])
        }
    }
}

// Toolbar-Button oben rechts.
struct SyncButton: View {
    @EnvironmentObject var sync: SyncManager
    var body: some View {
        Button(action: { sync.sync() }) {
            if sync.syncing {
                ProgressView()
            } else {
                Image(systemName: "arrow.triangle.2.circlepath")
                    .foregroundStyle(sync.connected ? Color.accentColor : Color.secondary)
            }
        }
        .task { sync.refreshConnection() }
    }
}
