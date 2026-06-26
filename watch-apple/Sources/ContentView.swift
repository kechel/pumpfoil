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

// Reverse-Pairing: die Uhr erzeugt einen Code, der Nutzer trägt ihn auf
// pumpfoil.org (Account) ein. Tippen auf der Uhr wäre umständlich -> stattdessen
// pollt die Uhr, bis der Code eingelöst ist, und holt sich dann das Token.
struct PairView: View {
    var onPaired: () -> Void
    var onSkip: () -> Void
    @State private var code = ""
    @State private var claimToken = ""
    @State private var busy = false
    @State private var error = ""
    @State private var pollTask: Task<Void, Never>?

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                Text("Uhr verbinden").font(.headline)
                if code.isEmpty {
                    Text("Pairing-Code erzeugen und auf pumpfoil.org (Account) eingeben.")
                        .font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    Button(busy ? "…" : "Pairing-Code erzeugen") { startPairing() }
                        .disabled(busy)
                } else {
                    Text("Auf pumpfoil.org eingeben:")
                        .font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    Text(code)
                        .font(.system(.largeTitle, design: .rounded)).bold()
                        .monospacedDigit().kerning(2)
                    HStack(spacing: 6) {
                        ProgressView().scaleEffect(0.6)
                        Text("warte auf Bestätigung…").font(.caption2).foregroundStyle(.secondary)
                    }
                }
                if !error.isEmpty {
                    Text(error).font(.caption2).foregroundStyle(.red)
                }
                // Ohne Pairing aufnehmen — Sessions lokal speichern, später syncen.
                Button("Später verbinden") { pollTask?.cancel(); onSkip() }
                    .font(.caption2).buttonStyle(.borderless).tint(.secondary)
            }.padding()
        }
        .onDisappear { pollTask?.cancel() }
    }

    private func startPairing() {
        busy = true; error = ""
        Task {
            do {
                let r = try await Api.pairInit()
                code = r.code
                claimToken = r.claim_token
                startPolling()
            } catch {
                self.error = error.localizedDescription
            }
            busy = false
        }
    }

    private func startPolling() {
        pollTask?.cancel()
        pollTask = Task {
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 3_000_000_000)   // alle 3 s
                if Task.isCancelled { return }
                if let r = try? await Api.pairPoll(claimToken: claimToken),
                   let token = r.device_token {
                    Api.deviceToken = token
                    onPaired()
                    return
                }
            }
        }
    }
}

struct WatchAlarm {
    var enabled = false; var high = 0; var low = 0
    var patHigh = "short2"; var patLow = "long2"
    var repeatMode = "once"   // "once" = einmalig | "continuous" = dauerhaft
}

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
    @State private var manualAlarm = false
    @State private var alarmDefault = "foil"   // Uhr-Vorwahl: "foil" | "fixed"
    @State private var repeatTick = 0          // Zähler für continuous-Wiederholung
    @State private var foils: [Api.FoilOpt] = []
    @State private var showFoilPicker = false
    @State private var offFoil: [Int] = [12, 17, 16]   // Off-Foil-Screen (Auto-Umschaltung)
    @State private var lastDataPage = 1                 // Rücksprungziel nach der Übersicht

    var body: some View {
        Group {
            if rec.isRecording {
                // Pager: Stop(0) | Daten 1..n | Übersicht(n+1) | Stop(n+2). Übersicht ist eine
                // wischbare Seite; Auto-Wechsel NUR auf der Flanke „Lauf beendet" -> Übersicht
                // (+kurze Vibration), nach 60 s ohne Wischen zurück; „Lauf gestartet" -> zurück.
                TabView(selection: $page) {
                    stopPage("Datenfelder →").tag(0)
                    ForEach(Array(views.enumerated()), id: \.offset) { idx, fields in
                        VStack(spacing: 10) {
                            ForEach(activeFields(fields), id: \.self) { fid in fieldView(fid) }
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .tag(idx + 1)
                    }
                    VStack(spacing: 10) {   // Übersicht (off foil)
                        ForEach(activeFields(offFoil), id: \.self) { fid in fieldView(fid) }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .tag(views.count + 1)
                    stopPage("← Übersicht").tag(views.count + 2)
                }
                .tabViewStyle(.page)
                .onChange(of: rec.isRecording) { r in if r { page = 1 } }
                .onChange(of: page) { p in if p >= 1 && p <= views.count { lastDataPage = p } }
                .onChange(of: rec.isFoiling) { foiling in
                    let summaryPage = views.count + 1
                    if !foiling {
                        page = summaryPage
                        WKInterfaceDevice.current().play(.click)
                        Task {
                            try? await Task.sleep(nanoseconds: 60_000_000_000)
                            if page == summaryPage { page = lastDataPage }
                        }
                    } else if page == summaryPage {
                        page = lastDataPage
                    }
                }
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
                    Button("Start") {
                        skipSync()
                        if manualAlarm || !foils.isEmpty { showFoilPicker = true }
                        else { Task { await rec.start() } }
                    }
                    .tint(.green)
                    .sheet(isPresented: $showFoilPicker) {
                        AlarmPickerSheet(
                            foils: foils, manualAlarm: manualAlarm, alarmDefault: alarmDefault,
                            alarm: $alarm,
                            onPick: { showFoilPicker = false; Task { await rec.start() } },
                            onCancel: { showFoilPicker = false })
                    }
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
        manualAlarm = c.alarmEnabled
        alarmDefault = c.alarmDefault ?? "foil"
        alarm = WatchAlarm(enabled: c.alarmEnabled, high: c.speedHigh, low: c.speedLow,
                           patHigh: c.alarmPatternHigh ?? "short2", patLow: c.alarmPatternLow ?? "long2",
                           repeatMode: c.alarmRepeat ?? "once")
        foils = c.foils ?? []
        if let off = c.offFoilView, !off.isEmpty { offFoil = off }
    }

    // Flanke löst sofort aus; im Modus "continuous" alle ~3 Ticks erneut, solange drüber/drunter.
    // Min-Alarm nur im Fenster [min-2, min) — identisch zur Garmin-/Wear-Logik.
    private func checkAlarm(_ sp: Double) {
        guard alarm.enabled else { wasHigh = false; wasLow = false; repeatTick = 0; return }
        let over = alarm.high > 0 && sp >= Double(alarm.high)
        let under = alarm.low > 0 && sp < Double(alarm.low) && sp >= Double(alarm.low) - 2
        if over && !wasHigh { playHaptic(alarm.patHigh) }
        if under && !wasLow { playHaptic(alarm.patLow) }
        let tripped = over || under
        if tripped && alarm.repeatMode == "continuous" && (wasHigh || wasLow) {
            repeatTick += 1
            if repeatTick >= 3 { repeatTick = 0; playHaptic(over ? alarm.patHigh : alarm.patLow) }
        } else if !tripped {
            repeatTick = 0
        }
        wasHigh = over; wasLow = under
    }

    // watchOS bietet keine frei definierbaren Waveforms -> Muster auf den nächstliegenden
    // System-Haptiktyp abbilden (IDs identisch mit Web/Garmin: short1/short2/long2/lsl).
    private func playHaptic(_ pattern: String) {
        let type: WKHapticType
        switch pattern {
        case "short1": type = .click
        case "long2": type = .directionUp
        case "lsl": type = .retry
        default: type = .notification   // short2
        }
        WKInterfaceDevice.current().play(type)
    }
}

// Alarm-Auswahl beim Start (Sheet mit Form): feste Website-Werte oder ein Foil, plus
// Repeat-Modus pro Session umschaltbar. Reihenfolge folgt der Web-Vorwahl (alarmDefault).
// Muster bleiben aus der Config erhalten.
struct AlarmPickerSheet: View {
    let foils: [Api.FoilOpt]
    let manualAlarm: Bool
    let alarmDefault: String
    @Binding var alarm: WatchAlarm
    var onPick: () -> Void
    var onCancel: () -> Void

    var body: some View {
        List {
            Section("Auslösen") {
                Toggle("Dauerhaft", isOn: Binding(
                    get: { alarm.repeatMode == "continuous" },
                    set: { alarm.repeatMode = $0 ? "continuous" : "once" }))
            }
            Section {
                if alarmDefault == "foil" {
                    foilRows
                    if manualAlarm { fixedRow }
                } else {
                    if manualAlarm { fixedRow }
                    foilRows
                }
                Button { alarm.enabled = false; onPick() } label: { row("Ohne Alarm", "kein Alarm") }
            } header: { Text("Alarm wählen") }
            Section {
                Button("Abbrechen", role: .cancel, action: onCancel)
            }
        }
    }

    private var fixedRow: some View {
        Button { alarm.enabled = true; onPick() } label: {
            row("Feste Werte", "\(alarm.low)–\(alarm.high) km/h")
        }
    }
    private var foilRows: some View {
        ForEach(foils) { f in
            Button {
                alarm.enabled = true; alarm.high = f.max; alarm.low = f.min; onPick()
            } label: { row(f.label, "\(f.min)–\(f.max) km/h") }
        }
    }
    @ViewBuilder private func row(_ title: String, _ sub: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(title)
            Text(sub).font(.caption2).foregroundStyle(.secondary)
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
    case 4: return r.distanceM < 1000
        ? (String(format: "%.0f", r.distanceM), "m")
        : (String(format: "%.2f", r.distanceM / 1000), "km")
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
