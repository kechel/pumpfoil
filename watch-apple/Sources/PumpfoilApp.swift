import SwiftUI

@main
struct PumpfoilApp: App {
    @StateObject private var rec = Recorder()
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(rec)
                .onAppear {
                    rec.requestAuth()
                    WatchLink.shared.activate()   // Token-Empfang vom iPhone (Companion-Pairing)
                }
        }
    }
}
