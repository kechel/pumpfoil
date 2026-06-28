import Foundation
import WatchConnectivity

extension Notification.Name {
    static let pumpfoilTokenUpdated = Notification.Name("pumpfoilTokenUpdated")
}

// Empfängt das Device-Token von der iPhone-Begleit-App (WatchConnectivity) und
// speichert es -> Apple-idiomatisches Pairing OHNE Code-Tippen: das eingeloggte
// iPhone mintet ein Token und schiebt es per updateApplicationContext herüber.
// Bei ungültigem Token (401) bittet die Uhr das iPhone um ein frisches (needToken).
// Reverse-Pairing (Code an der Uhr erzeugen) bleibt als Fallback bestehen.
final class WatchLink: NSObject, WCSessionDelegate {
    static let shared = WatchLink()
    private var lastRequest = Date.distantPast

    func activate() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    // Das iPhone ist die Quelle der Wahrheit fürs Companion-Pairing: ein vom (eingeloggten)
    // iPhone geschobenes Token überschreibt ein vorhandenes (z. B. abgelaufenes) Token.
    private func store(_ ctx: [String: Any]) {
        guard let t = ctx["deviceToken"] as? String, !t.isEmpty, Api.deviceToken != t else { return }
        Api.deviceToken = t
        NotificationCenter.default.post(name: .pumpfoilTokenUpdated, object: nil)
    }

    // Frisches Token beim iPhone anfordern (debounced, damit ein 401-Loop kein Mint-Spam auslöst).
    func requestToken() {
        let s = WCSession.default
        guard s.activationState == .activated, s.isReachable else { return }
        guard Date().timeIntervalSince(lastRequest) > 30 else { return }
        lastRequest = Date()
        s.sendMessage(["action": "needToken"],
                      replyHandler: { [weak self] reply in self?.store(reply) },
                      errorHandler: { _ in })
    }

    func session(_ session: WCSession,
                 activationDidCompleteWith state: WCSessionActivationState,
                 error: Error?) {
        store(session.receivedApplicationContext)
        if Api.deviceToken == nil { requestToken() }   // noch kein Token -> beim iPhone anfragen
    }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        store(applicationContext)
    }
}
