import Foundation
import WatchConnectivity

// Empfängt das Device-Token von der iPhone-Begleit-App (WatchConnectivity) und
// speichert es -> Apple-idiomatisches Pairing OHNE Code-Tippen: das eingeloggte
// iPhone mintet ein Token und schiebt es per updateApplicationContext herüber.
// Reverse-Pairing (Code an der Uhr erzeugen) bleibt als Fallback bestehen.
final class WatchLink: NSObject, WCSessionDelegate {
    static let shared = WatchLink()

    func activate() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    private func store(_ ctx: [String: Any]) {
        guard let t = ctx["deviceToken"] as? String, !t.isEmpty else { return }
        // Vorhandenes Token (z. B. via Reverse-Pairing) nicht überschreiben.
        if Api.deviceToken == nil { Api.deviceToken = t }
    }

    func session(_ session: WCSession,
                 activationDidCompleteWith state: WCSessionActivationState,
                 error: Error?) {
        store(session.receivedApplicationContext)
    }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        store(applicationContext)
    }
}
