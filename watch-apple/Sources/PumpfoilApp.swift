import SwiftUI

@main
struct PumpfoilApp: App {
    @StateObject private var rec = Recorder()
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(rec)
                .onAppear { rec.requestAuth() }
        }
    }
}
