import SwiftUI

struct ContentView: View {
    @EnvironmentObject var rec: Recorder
    @State private var paired = Api.deviceToken != nil

    var body: some View {
        if paired {
            RecordView()
        } else {
            PairView(onPaired: { paired = true })
        }
    }
}

// Pairing: Code aus der Web-App (Account-Seite) eingeben -> Device-Token holen.
struct PairView: View {
    var onPaired: () -> Void
    @State private var code = ""
    @State private var busy = false
    @State private var error = ""

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                Text("Uhr verbinden").font(.headline)
                Text("Pairing-Code aus der Pumpfoil-Web-App (Account).")
                    .font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
                TextField("CODE", text: $code)
                    .textCase(.uppercase)
                    .multilineTextAlignment(.center)
                Button(busy ? "…" : "Verbinden") { pair() }
                    .disabled(busy || code.count < 4)
                if !error.isEmpty {
                    Text(error).font(.caption2).foregroundStyle(.red)
                }
            }.padding()
        }
    }

    private func pair() {
        busy = true; error = ""
        Task {
            do {
                let r = try await Api.pair(code: code.trimmingCharacters(in: .whitespaces),
                                           label: "Apple Watch")
                Api.deviceToken = r.device_token
                onPaired()
            } catch {
                self.error = error.localizedDescription
            }
            busy = false
        }
    }
}

// Aufnahme: Start/Stop + Live-Stats.
struct RecordView: View {
    @EnvironmentObject var rec: Recorder

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                Text(timeStr(rec.elapsed)).font(.system(.title2, design: .rounded)).monospacedDigit()
                HStack {
                    stat(String(format: "%.1f", rec.speedKmh), "km/h")
                    stat(rec.hr > 0 ? "\(rec.hr)" : "–", "bpm")
                }
                Button(rec.isRecording ? "Stop" : "Start") {
                    Task { rec.isRecording ? await rec.stop() : await rec.start() }
                }
                .tint(rec.isRecording ? .red : .green)
                if !rec.status.isEmpty {
                    Text(rec.status).font(.caption2).foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
            }.padding()
        }
    }

    private func stat(_ v: String, _ unit: String) -> some View {
        VStack(spacing: 0) {
            Text(v).font(.system(.title3, design: .rounded)).monospacedDigit()
            Text(unit).font(.caption2).foregroundStyle(.secondary)
        }.frame(maxWidth: .infinity)
    }

    private func timeStr(_ t: TimeInterval) -> String {
        let s = Int(t); return String(format: "%d:%02d", s / 60, s % 60)
    }
}
