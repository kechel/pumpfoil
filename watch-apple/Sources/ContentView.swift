import SwiftUI
import WatchKit

struct ContentView: View {
    @EnvironmentObject var rec: Recorder
    @State private var paired = Api.deviceToken != nil
    @State private var skipped = false

    var body: some View {
        // Pairing ist optional: ohne Token kann man trotzdem aufnehmen (lokal) und
        // später verbinden -> die Sessions werden dann automatisch nachgesynct.
        if paired || skipped {
            RecordView(onWantPair: { skipped = false })
        } else {
            PairView(onPaired: { paired = true }, onSkip: { skipped = true })
        }
    }
}

// Pairing: Code aus der Web-App (Account-Seite) eingeben -> Device-Token holen.
struct PairView: View {
    var onPaired: () -> Void
    var onSkip: () -> Void
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
                // Ohne Pairing aufnehmen — Sessions lokal speichern, später syncen.
                Button("Später verbinden") { onSkip() }
                    .font(.caption2).buttonStyle(.borderless).tint(.secondary)
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

struct WatchAlarm { var enabled = false; var high = 0; var low = 0 }

// Aufnahme: konfigurierte, wischbare Datenseiten (aus /api/devices/config) + Alarm.
struct RecordView: View {
    var onWantPair: () -> Void = {}
    @EnvironmentObject var rec: Recorder
    // Default = sinnvolles 3-Seiten-Layout, bis die Account-Config gesynct ist.
    @State private var views: [[Int]] = [[1, 2], [6, 7], [4, 3]]
    @State private var colorBy = false
    @State private var alarm = WatchAlarm()
    @State private var page = 1
    @State private var wasHigh = false
    @State private var wasLow = false
    @State private var syncing = false
    @State private var configTask: Task<Void, Never>?

    var body: some View {
        Group {
            if rec.isRecording {
                // Stop an BEIDEN Enden (kein Umlauf-Wischen möglich); Start landet auf 1. Datenseite.
                TabView(selection: $page) {
                    stopPage("Datenfelder →").tag(0)
                    ForEach(Array(views.enumerated()), id: \.offset) { idx, fields in
                        VStack(spacing: 10) {
                            ForEach(activeFields(fields), id: \.self) { fid in fieldView(fid) }
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .tag(idx + 1)
                    }
                    stopPage("← Datenfelder").tag(views.count + 1)
                }
                .tabViewStyle(.page)
                .onChange(of: rec.isRecording) { rec in if rec { page = 1 } }
                // Upload-Indikator: kleines Wolken-Symbol, wenn gerade Chunks hochgeladen werden.
                .overlay(alignment: .top) {
                    if rec.uploading {
                        Image(systemName: "icloud.and.arrow.up")
                            .font(.caption2).foregroundStyle(.secondary).padding(.top, 1)
                    }
                }
            } else {
                VStack(spacing: 12) {
                    Text("Pumpfoil").font(.title3)
                    if rec.starting {
                        // Startphase (GPS/Session): kein Start-Button, nur Spinner + Status.
                        ProgressView().scaleEffect(0.8)
                        Text(rec.status.isEmpty ? "starte…" : rec.status)
                            .font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    } else {
                    Button("Start") { skipSync(); Task { await rec.start() } }.tint(.green)
                    // Sync-Banner: läuft nur, wenn online. „Jetzt nicht" überspringt sofort.
                    if syncing {
                        HStack(spacing: 6) {
                            ProgressView().scaleEffect(0.6)
                            Text("Sync…").font(.caption2).foregroundStyle(.secondary)
                            Button("Jetzt nicht") { skipSync() }
                                .font(.caption2).buttonStyle(.borderless).tint(.secondary)
                        }
                    } else if !rec.status.isEmpty {
                        Text(rec.status).font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    }
                    // Nicht verbunden: Hinweis + Verbinden (Aufnahme geht trotzdem, lokal).
                    if Api.deviceToken == nil {
                        Text("Nicht verbunden – Sessions lokal")
                            .font(.caption2).foregroundStyle(.orange).multilineTextAlignment(.center)
                        Button("Verbinden") { onWantPair() }
                            .font(.caption2).buttonStyle(.borderless)
                    }
                    // Lokal wartende Sessions (+ manueller Upload, wenn möglich).
                    if rec.pendingCount > 0 {
                        Text("\(rec.pendingCount) warten auf Upload")
                            .font(.caption2).foregroundStyle(.secondary)
                        if Api.deviceToken != nil {
                            Button("Jetzt hochladen") { Task { await rec.drain() } }
                                .font(.caption2).buttonStyle(.borderless)
                        }
                    }
                    }
                }.padding()
            }
        }
        .task {
            startConfigLoad()
            rec.refreshPending()   // wie viele Sessions warten lokal?
            await rec.drain()      // gepairt + online -> jetzt hochladen
        }
        .onChange(of: rec.speedKmh) { sp in checkAlarm(sp) }   // watchOS-9-kompatible Signatur
    }

    @ViewBuilder private func stopPage(_ hint: String) -> some View {
        VStack(spacing: 12) {
            Button("Stop") { Task { await rec.stop() } }.tint(.red)
            Text(hint).font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func activeFields(_ f: [Int]) -> [Int] {
        let a = f.filter { $0 != 0 }
        return a.isEmpty ? [1] : a
    }

    @ViewBuilder private func fieldView(_ fid: Int) -> some View {
        let fv = fieldValue(fid, rec)
        VStack(spacing: 0) {
            Text(fv.0).font(.system(.title, design: .rounded)).monospacedDigit()
                .foregroundStyle(colorBy ? fieldColor(fid, rec) : Color.primary)
            Text(fv.1).font(.caption2).foregroundStyle(.secondary)
        }
    }

    // Sofort die letzte bekannte Config anwenden (offline-tauglich), dann – falls online –
    // im Hintergrund aktualisieren. Der Sync blockiert nie den Start.
    private func startConfigLoad() {
        applyConfig(Api.cachedConfig())
        guard Reachability.shared.isOnline else { return }   // offline: Sync überspringen
        syncing = true
        configTask = Task {
            let c = try? await Api.deviceConfig()
            if !Task.isCancelled {
                applyConfig(c)
                syncing = false
            }
        }
    }

    private func skipSync() {
        configTask?.cancel()
        syncing = false
    }

    private func applyConfig(_ c: Api.DeviceConfig?) {
        guard let c else { return }
        if !c.views.isEmpty { views = c.views }
        colorBy = c.colorByValue
        alarm = WatchAlarm(enabled: c.alarmEnabled, high: c.speedHigh, low: c.speedLow)
    }

    private func checkAlarm(_ sp: Double) {
        guard alarm.enabled else { return }
        if alarm.high > 0 {
            let now = sp >= Double(alarm.high)
            if now && !wasHigh { WKInterfaceDevice.current().play(.notification) }
            wasHigh = now
        }
        if alarm.low > 0 {
            let now = sp > 0.1 && sp <= Double(alarm.low)
            if now && !wasLow { WKInterfaceDevice.current().play(.directionUp) }
            wasLow = now
        }
    }
}

// Kernfeldsatz (IDs wie web/src/lib/fields.ts); Rest "—".
@MainActor private func fieldValue(_ id: Int, _ r: Recorder) -> (String, String) {
    switch id {
    case 1: return (String(format: "%.1f", r.speed3sKmh), "km/h (3s)")
    case 5: return (String(format: "%.1f", r.speedKmh), "km/h")
    case 6: return (String(format: "%.1f", r.avgSpeedKmh), "Ø km/h")
    case 7: return (String(format: "%.1f", r.maxSpeedKmh), "max km/h")
    case 2: return (r.hr > 0 ? "\(r.hr)" : "–", "bpm")
    case 8: return (r.avgHr > 0 ? "\(r.avgHr)" : "–", "Ø bpm")
    case 9: return (r.maxHr > 0 ? "\(r.maxHr)" : "–", "max bpm")
    case 3: let s = Int(r.elapsed); return (String(format: "%d:%02d", s / 60, s % 60), "Zeit")
    case 4: return (String(format: "%.2f", r.distanceM / 1000), "km")
    case 12: let f = DateFormatter(); f.dateFormat = "HH:mm"; return (f.string(from: Date()), "Uhr")
    default: return ("—", "")
    }
}

@MainActor private func fieldColor(_ id: Int, _ r: Recorder) -> Color {
    switch id {
    case 1: return speedColor(r.speed3sKmh)
    case 5: return speedColor(r.speedKmh)
    case 6: return speedColor(r.avgSpeedKmh)
    case 7: return speedColor(r.maxSpeedKmh)
    case 2, 8, 9: return Color(red: 0.97, green: 0.44, blue: 0.44)
    default: return .primary
    }
}

private func speedColor(_ kmh: Double) -> Color {
    let t = min(max((kmh - 8) / (25 - 8), 0), 1)
    return Color(hue: (1 - t) * 240 / 360, saturation: 0.85, brightness: 0.95)
}
