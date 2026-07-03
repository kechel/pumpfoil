import SwiftUI
import WatchKit
import Combine

struct ContentView: View {
    @EnvironmentObject var rec: Recorder
    @State private var paired = Api.deviceToken != nil
    @State private var skipped = false
    @State private var forcePair = false   // „Neu verbinden" — auch wenn (ungültiges) Token da ist

    var body: some View {
        // Pairing ist optional: ohne Token kann man trotzdem aufnehmen (lokal) und
        // später verbinden -> die Sessions werden dann automatisch nachgesynct.
        // forcePair erzwingt den Pair-Screen auch bei vorhandenem (z. B. abgelaufenem) Token.
        if forcePair || (!paired && !skipped) {
            PairView(onPaired: { paired = true; forcePair = false; skipped = false },
                     onSkip: { skipped = true; forcePair = false })
        } else {
            RecordView(onWantPair: { forcePair = true })
        }
    }
}

// Reverse-Pairing: die Uhr erzeugt einen Code, der Nutzer trägt ihn auf
// pumpfoil.org (Account) ein. Tippen auf der Uhr wäre umständlich -> stattdessen
// pollt die Uhr, bis der Code eingelöst ist, und holt sich dann das Token.
struct PairView: View {
    var onPaired: () -> Void
    var onSkip: () -> Void
    @AppStorage("appLang") private var lang = "de"
    @State private var code = ""
    @State private var claimToken = ""
    @State private var busy = false
    @State private var error = ""
    @State private var pollTask: Task<Void, Never>?

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                Text(WLoc.t("pair.title", lang)).font(.headline)
                if code.isEmpty {
                    Text(WLoc.t("pair.howto", lang))
                        .font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    Button(busy ? "…" : WLoc.t("pair.gen", lang)) { startPairing() }
                        .disabled(busy)
                } else {
                    Text(WLoc.t("pair.enterOn", lang))
                        .font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    Text(code)
                        .font(.system(.largeTitle, design: .rounded)).bold()
                        .monospacedDigit().kerning(2)
                    HStack(spacing: 6) {
                        ProgressView().scaleEffect(0.6)
                        Text(WLoc.t("pair.waiting", lang)).font(.caption2).foregroundStyle(.secondary)
                    }
                }
                if !error.isEmpty {
                    Text(error).font(.caption2).foregroundStyle(.red)
                }
                // Ohne Pairing aufnehmen — Sessions lokal speichern, später syncen.
                Button(WLoc.t("pair.later", lang)) { pollTask?.cancel(); onSkip() }
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
    @AppStorage("appLang") private var lang = "de"
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
    @State private var selectedFoilId: Int?    // für diese Session gewähltes Foil (Server-Override)
    @State private var fixedLow = 0            // feste Alarm-Werte aus der Config (für „Feste Werte")
    @State private var fixedHigh = 0
    @State private var selInit = false         // Default-Vorwahl nur einmal setzen
    @State private var alarmSource = "foil"     // Schwellen-Quelle: "foil" (Auto) | "manual"
    @State private var offFoil: [Int] = [12, 17, 16]   // Off-Foil-Screen (Auto-Umschaltung)
    @State private var lastDataPage = 1                 // Rücksprungziel nach der Übersicht
    @State private var autoStart = false                // GPS-Auto-Start (Config-Default, auf der Uhr umschaltbar)
    @State private var autoMon = AutoStartMonitor()     // Idle-GPS-Monitor für Auto-Start
    @State private var autoCountdown = 10               // s Vorlauf ab Betreten des Start-Screens, bis scharf
    @State private var autoArmed = false                // Monitor aktiv (Countdown durch)?
    private let autoTimer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        Group {
            if rec.isRecording {
                // Pager: Stop(0) | Daten 1..n | Übersicht(n+1) | Stop(n+2). Übersicht ist eine
                // wischbare Seite; Auto-Wechsel NUR auf der Flanke „Lauf beendet" -> Übersicht
                // (+kurze Vibration), nach 60 s ohne Wischen zurück; „Lauf gestartet" -> zurück.
                TabView(selection: $page) {
                    stopPage(WLoc.t("rec.toData", lang)).tag(0)
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
                    stopPage(WLoc.t("rec.toSummary", lang)).tag(views.count + 2)
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
                VStack(spacing: 8) {
                    // Titel + Version (+ Auto-Start-Zeile) eng zusammen. Der ganze Block ist ein
                    // großer Tap-Bereich (dicke Finger) -> öffnet die Einstellungen.
                    VStack(spacing: 0) {
                        HStack(spacing: 6) {
                            Image("Logo").resizable().frame(width: 22, height: 22)
                                .clipShape(RoundedRectangle(cornerRadius: 5))
                            Text("Pumpfoil").font(.title3)
                        }
                        .padding(.top, 6)   // nicht in die Uhrzeit-Anzeige oben laufen
                        if let v = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String {
                            Text("v\(v)").font(.caption2).foregroundStyle(.secondary)
                        }
                        if autoStart && !rec.starting {
                            // Vorlauf: grau + Countdown, damit man Zeit hat, in die Einstellungen zu wechseln
                            // (z.B. im Auto). Erst wenn scharf -> blau. Eng unter der Version.
                            if autoArmed {
                                Text(WLoc.t("rec.autoStart", lang)).font(.caption2).foregroundStyle(.cyan).padding(.top, 2)
                            } else {
                                Text("\(WLoc.t("rec.autoStart", lang)) in \(autoCountdown)s").font(.caption2).foregroundStyle(.secondary).padding(.top, 2)
                            }
                        }
                    }
                    .contentShape(Rectangle())
                    .onTapGesture { showFoilPicker = true }   // ganzer Kopfbereich -> Einstellungen
                    if rec.starting {
                        // Startphase (GPS/Session): kein Start-Button, nur Spinner + Status.
                        ProgressView().scaleEffect(0.8)
                        Text(rec.status.isEmpty ? WLoc.t("rec.starting", lang) : rec.status)
                            .font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    } else {
                    // Foil-Vorwahl: nur der Foil-Name (klein, lange Namen skalieren herunter);
                    // antippen zum Ändern. Standard ist gesetzt -> kein Zwangs-Sheet beim Start.
                    if manualAlarm || !foils.isEmpty {
                        Button { showFoilPicker = true } label: {
                            HStack(spacing: 3) {
                                Text("\(WLoc.t("foil.prefix", lang))\(foilLabel)")
                                    .lineLimit(1).minimumScaleFactor(0.6)
                                if alarm.enabled { Image(systemName: "bell.fill").foregroundStyle(.yellow) }
                            }
                            .font(.caption2)
                        }
                        .buttonStyle(.bordered)
                        .tint(.secondary)
                    }
                    Button(WLoc.t("rec.start", lang)) {
                        skipSync()
                        Task { await rec.start(foilId: selectedFoilId) }   // Foil = Metadaten, unabhängig vom Alarm
                    }
                    .tint(.green)
                    .sheet(isPresented: $showFoilPicker) {
                        AlarmPickerSheet(
                            foils: foils,
                            alarm: $alarm, alarmSource: $alarmSource, selectedFoilId: $selectedFoilId,
                            autoStart: $autoStart,
                            onPick: { showFoilPicker = false },
                            onCancel: { showFoilPicker = false })
                    }
                    // Sync-Banner: läuft nur, wenn online. „Jetzt nicht" überspringt sofort.
                    if syncing {
                        HStack(spacing: 6) {
                            ProgressView().scaleEffect(0.6)
                            Text(WLoc.t("rec.sync", lang)).font(.caption2).foregroundStyle(.secondary)
                            Button(WLoc.t("rec.notNow", lang)) { skipSync() }
                                .font(.caption2).buttonStyle(.borderless).tint(.secondary)
                        }
                    } else if !rec.status.isEmpty {
                        Text(rec.status).font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    }
                    // Nicht verbunden: Hinweis + Verbinden (Aufnahme geht trotzdem, lokal).
                    if Api.deviceToken == nil {
                        Text(WLoc.t("rec.notLinked", lang))
                            .font(.caption2).foregroundStyle(.orange).multilineTextAlignment(.center)
                        Button(WLoc.t("rec.connect", lang)) { onWantPair() }
                            .font(.caption2).buttonStyle(.borderless)
                    }
                    // Lokal wartende Sessions: Fortschritt + Verbindungsstatus statt nur „X warten".
                    if rec.pendingCount > 0 {
                        if rec.uploading {
                            HStack(spacing: 6) {
                                ProgressView().scaleEffect(0.6)
                                Text(WLoc.t("rec.uploading", lang) + (rec.uploadTotal > 0 ? " \(rec.uploadSent)/\(rec.uploadTotal)" : ""))
                                    .font(.caption2).foregroundStyle(.secondary)
                            }
                        } else if rec.uploadError == "offline" || !Reachability.shared.isOnline {
                            Text(WLoc.t("rec.waitConn", lang))
                                .font(.caption2).foregroundStyle(.orange).multilineTextAlignment(.center)
                            Text("\(rec.pendingCount) " + WLoc.t("rec.pendingUpload", lang) + " — " + WLoc.t("rec.willResume", lang))
                                .font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
                        } else if rec.uploadError == "auth" {
                            // Token ungültig/abgelaufen -> neu pairen (Aufnahmen bleiben lokal).
                            Text(WLoc.t("rec.authErr", lang))
                                .font(.caption2).foregroundStyle(.orange).multilineTextAlignment(.center)
                            Button(WLoc.t("rec.repair", lang)) { onWantPair() }
                                .font(.caption2).buttonStyle(.borderless)
                        } else if rec.uploadError == "server" {
                            Text(WLoc.t("rec.serverErr", lang))
                                .font(.caption2).foregroundStyle(.orange).multilineTextAlignment(.center)
                        } else {
                            Text("\(rec.pendingCount) " + WLoc.t("rec.pendingUpload", lang))
                                .font(.caption2).foregroundStyle(.secondary)
                        }
                        if Api.deviceToken != nil && !rec.uploading {
                            Button(WLoc.t("rec.uploadNow", lang)) { Task { await rec.drain() } }
                                .font(.caption2).buttonStyle(.borderless)
                        }
                    }
                    // Verbunden: jederzeit neu verbinden / Konto wechseln (überschreibt das
                    // Pairing erst, wenn ein neues tatsächlich durchläuft). Bei "auth" zeigt
                    // der Block oben schon „Neu verbinden" -> hier nicht doppeln.
                    if Api.deviceToken != nil && rec.uploadError != "auth" {
                        Button(WLoc.t("rec.switch", lang)) { onWantPair() }
                            .font(.caption2).buttonStyle(.borderless).tint(.secondary)
                    }
                    }
                }.padding()
                // Auto-Start-Monitor wird NICHT hier gearmt, sondern erst nach dem Countdown
                // (tickAutoStart, autoTimer). Beim Verlassen des Idle sicher aufräumen.
                .onDisappear { autoMon.disarm(); autoArmed = false }
            }
        }
        .task {
            startConfigLoad()
            rec.refreshPending()   // wie viele Sessions warten lokal?
            await rec.drain()      // gepairt + online -> jetzt hochladen
        }
        // Auto-Resume: solange lokal etwas wartet, alle 5 s erneut versuchen (drain prüft
        // online/busy selbst). So lädt es von allein weiter, sobald die Verbindung zurück ist.
        .task(id: rec.pendingCount > 0) {
            while rec.pendingCount > 0 {
                try? await Task.sleep(nanoseconds: 5_000_000_000)
                if Task.isCancelled { return }
                await rec.drain()
            }
        }
        .onChange(of: rec.speedKmh) { sp in checkAlarm(sp) }   // watchOS-9-kompatible Signatur
        .onReceive(autoTimer) { _ in tickAutoStart() }         // Auto-Start-Vorlauf + Arming
        // Token serverseitig ungültig -> automatisch ein frisches vom iPhone anfordern
        // (Companion-Pairing). „Neu verbinden" bleibt als Code-Fallback bestehen.
        .onChange(of: rec.uploadError) { e in if e == "auth" { WatchLink.shared.requestToken() } }
        // Frisches Token eingetroffen -> sofort erneut hochladen (statt 5 s zu warten).
        .onReceive(NotificationCenter.default.publisher(for: .pumpfoilTokenUpdated)) { _ in
            Task { await rec.drain() }
        }
    }

    // Gewählte Foil (Metadaten) als Label; "—" wenn keine.
    private var foilLabel: String {
        if let id = selectedFoilId, let f = foils.first(where: { $0.id == id }) { return f.label }
        return "—"
    }

    // Effektive Alarm-Schwellen: bei "foil" aus der gewählten Foil, sonst die manuellen (alarm.low/high).
    private func effThresholds() -> (Int, Int) {
        if alarmSource == "foil", let id = selectedFoilId, let f = foils.first(where: { $0.id == id }) {
            return (f.min, f.max)
        }
        return (alarm.low, alarm.high)
    }

    @ViewBuilder private func stopPage(_ hint: String) -> some View {
        VStack(spacing: 12) {
            // 3 s halten zum Stoppen; Ring füllt sich sichtbar als Fortschritt (wie Garmin Stop-Halten).
            HoldToStopButton(label: WLoc.t("rec.stopHold", lang)) { Task { await rec.stop() } }
            Text(hint).font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func activeFields(_ f: [Int]) -> [Int] {
        let a = f.filter { $0 != 0 }
        return a.isEmpty ? [1] : a
    }

    @ViewBuilder private func fieldView(_ fid: Int) -> some View {
        let fv = fieldValue(fid, rec, lang)
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
        if let l = c.language, !l.isEmpty { lang = l }   // Profil-Sprache übernehmen (persistiert via @AppStorage)
        if !c.views.isEmpty { views = c.views }
        colorBy = c.colorByValue
        manualAlarm = c.alarmEnabled
        alarmDefault = c.alarmDefault ?? "foil"
        fixedLow = c.speedLow; fixedHigh = c.speedHigh
        foils = c.foils ?? []
        // Vibrationsmuster/Repeat immer aus der Config übernehmen.
        alarm.patHigh = c.alarmPatternHigh ?? "short2"
        alarm.patLow = c.alarmPatternLow ?? "long2"
        alarm.repeatMode = c.alarmRepeat ?? "once"
        // Default-Vorwahl nur EINMAL setzen — danach nicht die Nutzerwahl überschreiben.
        if !selInit {
            selInit = true
            alarm.enabled = c.alarmEnabled                     // Web-Master = Alarm-Default
            alarm.low = c.speedLow; alarm.high = c.speedHigh   // manuelle Schwellen = feste Web-Werte
            if alarmDefault == "foil", let f = foils.first {
                selectedFoilId = f.id; alarmSource = "foil"    // Standard-Foil (Metadaten + Auto-Schwellen)
            } else {
                selectedFoilId = nil; alarmSource = "manual"
            }
            autoStart = c.autoStart ?? false                   // Config-Default; danach auf der Uhr umschaltbar
        }
        if let off = c.offFoilView, !off.isEmpty { offFoil = off }
        // Aufzeichnungsmodus persistieren -> Recorder liest beim Start (offline-tauglich).
        UserDefaults.standard.set(c.recordMode ?? "full", forKey: "recordMode")
    }

    // Flanke löst sofort aus; im Modus "continuous" alle ~3 Ticks erneut, solange drüber/drunter.
    // Min-Alarm nur im Fenster [min-2, min) — identisch zur Garmin-/Wear-Logik.
    // Auto-Start-Vorlauf: läuft nur auf dem Start-Screen (nicht Aufnahme/Startphase/Einstellungen-Sheet).
    // Zählt ab Betreten von 10 herunter; bei 0 wird der GPS-Monitor scharf. Beim Verlassen -> Reset auf 10,
    // sodass der Vorlauf bei jeder Rückkehr (App-Start, nach Session-Ende, Sheet zu) neu beginnt.
    private func tickAutoStart() {
        let onStart = !rec.isRecording && !rec.starting && !showFoilPicker
        guard autoStart && onStart else {
            if autoArmed { autoMon.disarm(); autoArmed = false }
            autoCountdown = 10
            return
        }
        if autoCountdown > 0 {
            autoCountdown -= 1
            if autoCountdown == 0 {
                autoArmed = true
                autoMon.arm { Task { @MainActor in await rec.start() } }
            }
        }
    }

    private func checkAlarm(_ sp: Double) {
        guard alarm.enabled else { wasHigh = false; wasLow = false; repeatTick = 0; return }
        let (elow, ehigh) = effThresholds()
        let over = ehigh > 0 && sp >= Double(ehigh)
        let under = elow > 0 && sp < Double(elow) && sp >= Double(elow) - 2
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
    @Binding var alarm: WatchAlarm
    @Binding var alarmSource: String
    @Binding var selectedFoilId: Int?
    @Binding var autoStart: Bool
    var onPick: () -> Void
    var onCancel: () -> Void
    @AppStorage("appLang") private var lang = "de"

    var body: some View {
        List {
            Section {
                Toggle(WLoc.t("rec.autoStartToggle", lang), isOn: $autoStart)
            } footer: {
                Text(WLoc.t("rec.autoStartHelp", lang))
            }
            Section {
                Toggle(WLoc.t("foil.alarmOn", lang), isOn: $alarm.enabled)
            } header: {
                Text(WLoc.t("foil.alarm", lang))
            } footer: {
                Text(WLoc.t("foil.alarmHelp", lang))
            }
            Section(WLoc.t("foil.thresholds", lang)) {
                Picker(WLoc.t("foil.source", lang), selection: $alarmSource) {
                    Text(WLoc.t("foil.auto", lang)).tag("foil")
                    Text(WLoc.t("foil.manual", lang)).tag("manual")
                }
                if alarmSource == "manual" {
                    Stepper(value: $alarm.low, in: 0...80) {
                        Text("\(WLoc.t("foil.min", lang)): \(alarm.low) km/h").font(.footnote)
                    }
                    Stepper(value: $alarm.high, in: 0...80) {
                        Text("\(WLoc.t("foil.max", lang)): \(alarm.high) km/h").font(.footnote)
                    }
                }
            }
            Section {
                ForEach(foils) { f in
                    Button { selectedFoilId = f.id; onPick() } label: {
                        row((selectedFoilId == f.id ? "✓ " : "") + f.label, "\(f.min)–\(f.max) km/h")
                    }
                }
                Button { selectedFoilId = nil; onPick() } label: {
                    row((selectedFoilId == nil ? "✓ " : "") + WLoc.t("foil.noFoil", lang), WLoc.t("foil.noneSub", lang))
                }
            } header: {
                Text(WLoc.t("foil.choose", lang))
            } footer: {
                Text(WLoc.t("foil.chooseHelp", lang))
            }
            Section { Button(WLoc.t("common.cancel", lang), role: .cancel, action: onCancel) }
        }
    }
    @ViewBuilder private func row(_ title: String, _ sub: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(title)
            Text(sub).font(.caption2).foregroundStyle(.secondary)
        }
    }
}

// Stop-Knopf mit „3 s halten": ein Ring füllt sich während des Drückens, damit
// sichtbar ist, wie lange noch zu halten ist. Loslassen vor Ablauf bricht ab.
struct HoldToStopButton: View {
    let label: String
    let onStop: () -> Void
    @State private var progress: CGFloat = 0

    var body: some View {
        ZStack {
            Circle().stroke(Color.white.opacity(0.22), lineWidth: 6)
            Circle().trim(from: 0, to: progress)
                .stroke(Color.red, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Text(label).font(.caption).bold().multilineTextAlignment(.center)
                .foregroundStyle(.white).padding(8)
        }
        .frame(width: 104, height: 104)
        .contentShape(Circle())
        .onLongPressGesture(minimumDuration: 3, maximumDistance: 60, pressing: { down in
            withAnimation(down ? .linear(duration: 3) : .easeOut(duration: 0.25)) {
                progress = down ? 1 : 0
            }
        }, perform: {
            progress = 0
            WKInterfaceDevice.current().play(.success)
            onStop()
        })
    }
}

// Kernfeldsatz (IDs wie web/src/lib/fields.ts); Rest "—".
@MainActor private func fieldValue(_ id: Int, _ r: Recorder, _ lang: String) -> (String, String) {
    switch id {
    case 1: return (String(format: "%.1f", r.speed3sKmh), WLoc.t("f.kmh3s", lang))
    case 5: return (String(format: "%.1f", r.speedKmh), WLoc.t("f.kmh", lang))
    case 6: return (String(format: "%.1f", r.avgSpeedKmh), WLoc.t("f.kmhAvg", lang))
    case 7: return (String(format: "%.1f", r.maxSpeedKmh), WLoc.t("f.kmhMax", lang))
    case 2: return (r.hr > 0 ? "\(r.hr)" : "–", WLoc.t("f.bpm", lang))
    case 8: return (r.avgHr > 0 ? "\(r.avgHr)" : "–", WLoc.t("f.bpmAvg", lang))
    case 9: return (r.maxHr > 0 ? "\(r.maxHr)" : "–", WLoc.t("f.bpmMax", lang))
    case 3: let s = Int(r.elapsed); return (String(format: "%d:%02d", s / 60, s % 60), WLoc.t("f.time", lang))
    case 4: return r.distanceM < 1000
        ? (String(format: "%.0f", r.distanceM), "m")
        : (String(format: "%.2f", r.distanceM / 1000), "km")
    case 10: return ("–", WLoc.t("f.alt", lang))       // ohne Höhen-Erfassung (noch) nicht verfügbar
    case 11: return ("–", WLoc.t("f.temp", lang))      // kein Temperatursensor
    case 12: let f = DateFormatter(); f.dateFormat = "HH:mm"; return (f.string(from: Date()), WLoc.t("f.clock", lang))
    case 13: return ("–", WLoc.t("f.ascent", lang))
    case 14: return (msStr(r.runDurationMs), WLoc.t("f.runTime", lang))
    case 15: return (distLabeled(r.runDistanceM), WLoc.t("f.runDist", lang))
    case 16: return (msStr(r.lastRunDurationMs), WLoc.t("f.lastRunTime", lang))
    case 17: return (distLabeled(r.lastRunDistanceM), WLoc.t("f.lastRunDist", lang))
    case 18: return (String(format: "%.1f", r.lastRunAvgSpeedKmh), WLoc.t("f.lastRunAvg", lang))
    case 19: return (String(format: "%.1f", r.lastRunMaxSpeedKmh), WLoc.t("f.lastRunMax", lang))
    case 20: return ("\(r.runCount)", WLoc.t("f.runs", lang))
    default: return ("—", "")
    }
}

private func msStr(_ ms: Int) -> String { let s = ms / 1000; return String(format: "%d:%02d", s / 60, s % 60) }
private func distLabeled(_ m: Double) -> String {
    m < 1000 ? String(format: "%.0f m", m) : String(format: "%.2f km", m / 1000)
}

@MainActor private func fieldColor(_ id: Int, _ r: Recorder) -> Color {
    switch id {
    case 1: return speedColor(r.speed3sKmh)
    case 5: return speedColor(r.speedKmh)
    case 6: return speedColor(r.avgSpeedKmh)
    case 7: return speedColor(r.maxSpeedKmh)
    case 18: return speedColor(r.lastRunAvgSpeedKmh)
    case 19: return speedColor(r.lastRunMaxSpeedKmh)
    case 2: return hrColor(r.hr)
    case 8: return hrColor(r.avgHr)
    case 9: return hrColor(r.maxHr)
    default: return .primary
    }
}

private func speedColor(_ kmh: Double) -> Color {
    let t = min(max((kmh - 8) / (25 - 8), 0), 1)
    return Color(hue: (1 - t) * 240 / 360, saturation: 0.85, brightness: 0.95)
}
// Puls-Farbe nach Garmin-Buckets (120/150/170): grün → gelb → orange → rot.
private func hrColor(_ bpm: Int) -> Color {
    switch bpm {
    case ..<1: return .primary
    case ..<120: return Color(red: 0.29, green: 0.87, blue: 0.50)
    case ..<150: return Color(red: 0.98, green: 0.80, blue: 0.08)
    case ..<170: return Color(red: 0.98, green: 0.57, blue: 0.24)
    default: return Color(red: 0.97, green: 0.44, blue: 0.44)
    }
}
