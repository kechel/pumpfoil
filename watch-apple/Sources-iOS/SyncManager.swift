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
    // Einmal minten und cachen; per applicationContext (auch wenn Uhr-App inaktiv) zustellen.
    func pushPairingToWatch() {
        guard Api.token != nil, WCSession.isSupported() else { return }
        let s = WCSession.default
        guard s.activationState == .activated, s.isPaired, s.isWatchAppInstalled else { return }
        Task {
            let token: String
            if let cached = UserDefaults.standard.string(forKey: "mintedWatchToken") {
                token = cached
            } else if let minted = try? await Api.mintDeviceToken() {
                UserDefaults.standard.set(minted, forKey: "mintedWatchToken")
                token = minted
            } else {
                return
            }
            try? s.updateApplicationContext(["deviceToken": token])
        }
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
