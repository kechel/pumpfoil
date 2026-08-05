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
    // Eigene Layouts (F2/F3): gemischte Seiten-Saetze + Definitionen; `layoutsPref` ist dreistufig
    // (nil = automatisch, also Server-Voreinstellung) -- der Nutzer soll am Handgelenk umstellen
    // koennen, ohne dass der Server ihn ueberstimmt. Genau wie bei Garmin.
    @State private var onFoilPages: [WatchPageRef] = []
    @State private var offFoilPages: [WatchPageRef] = []
    @State private var layoutsServerDefault = false
    // Neueste im Store freigegebene Version (Server: appmeta._APP_META["apple"]). Das Feld kam schon
    // in der Config an, wurde aber nirgends angezeigt — der Nutzer erfuhr nie von einem Update.
    @State private var storeVersion = ""
    @AppStorage("layoutsPref") private var layoutsPrefRaw = 0   // 0 = auto, 1 = an, 2 = aus
    @State private var colorBy = false
    @State private var alarm = WatchAlarm()
    @State private var page = 2   // Start auf der ersten Datenseite (0=Verwerfen, 1=Stop davor)
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
    @State private var offFoil: [Int] = [12, 17, 16]   // Lauf-Ende-Screen (kurz nach Lauf-Ende)
    @State private var pauseView: [Int] = [12, 20, 2]  // Pausen-Screen: Uhrzeit · Läufe · Puls
    @State private var showRunEnd = false               // true = Lauf-Ende-Screen, false = Pausen-Screen
    @State private var lastDataPage = 2                 // Rücksprungziel nach der Übersicht
    @State private var autoStart = false                // GPS-Auto-Start (Config-Default, auf der Uhr umschaltbar)
    @State private var autoMon = AutoStartMonitor()     // Idle-GPS-Monitor für Auto-Start
    @State private var autoCountdown = 10               // s Vorlauf ab Betreten des Start-Screens, bis scharf
    @State private var autoArmed = false                // Monitor aktiv (Countdown durch)?
    private let autoTimer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    // Der Body ist bewusst KURZ gehalten: Swifts Type-Checker loest einen ViewBuilder als EINEN
    // Ausdruck auf, und der Aufwand waechst ueberproportional mit der Zahl der Kinder und
    // Modifier. Dieser Body war 202 Zeilen lang und stand mit >500 ms im Build-Log (Archive hing
    // minutenlang). Jede Teil-Ansicht unten ist ein eigener, EXPLIZIT typisierter Ausdruck und
    // wird unabhaengig geprueft — zusammen deutlich schneller als ein Riesenausdruck.
    var body: some View {
        Group {
            if rec.isRecording {
                recordingPager
            } else {
                idleScreen
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
        .onChange(of: rec.uploadError) { e in if e == "auth" { WatchLink.shared.requestToken(reason: "invalid") } }
        // Frisches Token eingetroffen -> sofort erneut hochladen (statt 5 s zu warten).
        .onReceive(NotificationCenter.default.publisher(for: .pumpfoilTokenUpdated)) { _ in
            Task { await rec.drain() }
        }
    }

    // MARK: - Aufnahme

    // Pager: Verwerfen(0) | Stop(1) | Daten 2..n+1 | Übersicht(n+2) | Stop(n+3) | Verwerfen(n+4).
    // Verwerfen-Seiten ganz außen (versehentlich schwer erreichbar), Stop je einwärts. Die Übersicht
    // ist eine wischbare Seite; Auto-Wechsel NUR auf der Flanke „Lauf beendet" (+kurze Vibration).
    // Die .tag()-Aufrufe bleiben ABSICHTLICH direkte Kinder des TabView — nur so findet die
    // Auswahl ihre Seiten.
    private var recordingPager: some View {
        TabView(selection: $page) {
            discardPage().tag(0)
            stopPage(WLoc.t("rec.toData", lang)).tag(1)
            ForEach(Array(dataPages.enumerated()), id: \.offset) { idx, ref in
                dataPageView(ref, idx: idx)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .tag(idx + 2)
            }
            summaryPage.tag(dataPages.count + 2)
            stopPage(WLoc.t("rec.toSummary", lang)).tag(dataPages.count + 3)
            discardPage().tag(dataPages.count + 4)
        }
        // Der System-Indikator wird auf eigenen Layout-Seiten ausgeblendet: dort bringt das
        // Layout seine eigenen Punkte mit (Element typ 6). Garmin macht es genauso
        // (_drawLayoutPage kehrt vor _drawPageDots zurueck, RecordView.mc:98-115). Sonst
        // liegen zwei Punktreihen mit verschiedener Anzahl uebereinander.
        .tabViewStyle(.page(indexDisplayMode: currentPageIsLayout ? .never : .automatic))
        .onChange(of: rec.isRecording) { r in if r { page = 2 } }
        .onChange(of: page) { p in if p >= 2 && p <= views.count + 1 { lastDataPage = p } }
        .onChange(of: rec.isFoiling) { foiling in onFoilingChanged(foiling) }
        .overlay(alignment: .top) { uploadBadge }
    }

    // Übersicht: kurz Lauf-Ende, dann Pause (Uhrzeit·Läufe·Puls).
    private var summaryPage: some View {
        let fields: [Int] = activeFields(showRunEnd ? offFoil : pauseView)
        return VStack(spacing: 10) {
            ForEach(fields, id: \.self) { fid in fieldView(fid) }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // Upload-Indikator: kleines Wolken-Symbol, wenn gerade Chunks hochgeladen werden.
    @ViewBuilder private var uploadBadge: some View {
        if rec.uploading {
            Image(systemName: "icloud.and.arrow.up")
                .font(.caption2).foregroundStyle(.secondary).padding(.top, 1)
        }
    }

    // Lauf beendet -> Übersicht: erst kurz Lauf-Ende, nach 8 s Pausen-Ansicht. KEIN Rücksprung zur
    // Datenansicht mehr — die bleibt bis zum nächsten Lauf. Als Methode statt als Closure im Body:
    // Ablauflogik kostet den Type-Checker im ViewBuilder unnötig viel.
    private func onFoilingChanged(_ foiling: Bool) {
        let summaryIdx: Int = views.count + 2
        if !foiling {
            page = summaryIdx
            showRunEnd = true
            WKInterfaceDevice.current().play(.click)
            Task {
                try? await Task.sleep(nanoseconds: 8_000_000_000)
                if !rec.isFoiling { showRunEnd = false }
            }
        } else if page == summaryIdx {
            page = lastDataPage
        }
    }

    // MARK: - Startbildschirm

    private var idleScreen: some View {
        VStack(spacing: 8) {
            idleHeader
            if rec.starting {
                // Startphase (GPS/Session): kein Start-Button, nur Spinner + Status.
                ProgressView().scaleEffect(0.8)
                Text(startingText)
                    .font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
            } else {
                idleControls
            }
        }
        .padding()
        // Auto-Start-Monitor wird NICHT hier gearmt, sondern erst nach dem Countdown
        // (tickAutoStart, autoTimer). Beim Verlassen des Idle sicher aufräumen.
        .onDisappear { autoMon.disarm(); autoArmed = false }
    }

    private var startingText: String {
        rec.status.isEmpty ? WLoc.t("rec.starting", lang) : rec.status
    }

    // Titel + Version (+ Auto-Start-Zeile) eng zusammen. Der ganze Block ist ein großer
    // Tap-Bereich (dicke Finger) -> öffnet die Einstellungen.
    private var idleHeader: some View {
        VStack(spacing: 0) {
            HStack(spacing: 6) {
                Image("Logo").resizable().frame(width: 22, height: 22)
                    .clipShape(RoundedRectangle(cornerRadius: 5))
                Text("Pumpfoil").font(.title3)
            }
            .padding(.top, 6)   // nicht in die Uhrzeit-Anzeige oben laufen
            versionLine
            autoStartLine
        }
        .contentShape(Rectangle())
        .onTapGesture { showFoilPicker = true }   // ganzer Kopfbereich -> Einstellungen
    }

    // Update-Hinweis sprachneutral wie bei Zepp und Wear: "v1.1.18 → 1.1.19" in Cyan. Kein eigener
    // Text, also keine 15 Uebersetzungen.
    @ViewBuilder private var versionLine: some View {
        let v: String? = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String
        if let v {
            let neuer: Bool = istNeuer(storeVersion, v)
            Text(neuer ? "v\(v) → \(storeVersion)" : "v\(v)")
                .font(.caption2)
                .foregroundStyle(neuer ? Color.cyan : Color.secondary)
        }
    }

    /// Ist die Store-Version echt neuer? Zahlenweise, damit ein Entwicklungs-Build keinen
    /// Rueckschritt anzeigt.
    private func istNeuer(_ store: String, _ lokal: String) -> Bool {
        guard !store.isEmpty, !lokal.isEmpty else { return false }
        let a: [Int] = store.split(separator: ".").compactMap { Int($0) }
        let b: [Int] = lokal.split(separator: ".").compactMap { Int($0) }
        for i in 0..<max(a.count, b.count) {
            let x: Int = i < a.count ? a[i] : 0
            let y: Int = i < b.count ? b[i] : 0
            if x != y { return x > y }
        }
        return false
    }

    // Vorlauf: grau + Countdown, damit man Zeit hat, in die Einstellungen zu wechseln (z. B. im
    // Auto). Erst wenn scharf -> cyan. Eng unter der Version.
    @ViewBuilder private var autoStartLine: some View {
        if autoStart && !rec.starting {
            if autoArmed {
                Text(WLoc.t("rec.autoStart", lang))
                    .font(.caption2).foregroundStyle(.cyan).padding(.top, 2)
            } else {
                Text(autoStartCountdownText)
                    .font(.caption2).foregroundStyle(.secondary).padding(.top, 2)
            }
        }
    }

    private var autoStartCountdownText: String {
        let base: String = WLoc.t("rec.autoStart", lang)
        return "\(base) in \(autoCountdown)s"
    }

    @ViewBuilder private var idleControls: some View {
        foilPreselectButton
        startButton
        syncOrStatusLine
        notLinkedBlock
        pendingUploadBlock
        switchAccountButton
    }

    // Foil-Vorwahl: nur der Foil-Name (klein, lange Namen skalieren herunter); antippen zum
    // Ändern. Standard ist gesetzt -> kein Zwangs-Sheet beim Start.
    @ViewBuilder private var foilPreselectButton: some View {
        if manualAlarm || !foils.isEmpty {
            Button { showFoilPicker = true } label: {
                HStack(spacing: 3) {
                    Text(foilButtonText).lineLimit(1).minimumScaleFactor(0.6)
                    if alarm.enabled { Image(systemName: "bell.fill").foregroundStyle(.yellow) }
                }
                .font(.caption2)
            }
            .buttonStyle(.bordered)
            .tint(.secondary)
        }
    }

    private var foilButtonText: String {
        let prefix: String = WLoc.t("foil.prefix", lang)
        return prefix + foilLabel
    }

    private var startButton: some View {
        Button(WLoc.t("rec.start", lang)) {
            skipSync()
            Task { await rec.start(foilId: selectedFoilId) }   // Foil = Metadaten, unabhängig vom Alarm
        }
        .tint(.green)
        .sheet(isPresented: $showFoilPicker) { alarmSheet }
    }

    private var alarmSheet: some View {
        AlarmPickerSheet(
            foils: foils,
            alarm: $alarm, alarmSource: $alarmSource, selectedFoilId: $selectedFoilId,
            autoStart: $autoStart,
            layoutsPrefRaw: $layoutsPrefRaw,
            hasLayoutPages: hasLayoutPages,
            onPick: { showFoilPicker = false },
            onCancel: { showFoilPicker = false })
    }

    private var hasLayoutPages: Bool {
        dataPages.contains { if case .layout = $0 { return true } else { return false } }
    }

    // Sync-Banner: läuft nur, wenn online. „Jetzt nicht" überspringt sofort.
    @ViewBuilder private var syncOrStatusLine: some View {
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
    }

    // Nicht verbunden: Hinweis + Verbinden (Aufnahme geht trotzdem, lokal).
    @ViewBuilder private var notLinkedBlock: some View {
        if Api.deviceToken == nil {
            Text(WLoc.t("rec.notLinked", lang))
                .font(.caption2).foregroundStyle(.orange).multilineTextAlignment(.center)
            Button(WLoc.t("rec.connect", lang)) { onWantPair() }
                .font(.caption2).buttonStyle(.borderless)
        }
    }

    // Lokal wartende Sessions: Fortschritt + Verbindungsstatus statt nur „X warten".
    @ViewBuilder private var pendingUploadBlock: some View {
        if rec.pendingCount > 0 {
            pendingStateLine
            if Api.deviceToken != nil && !rec.uploading {
                Button(WLoc.t("rec.uploadNow", lang)) { Task { await rec.drain() } }
                    .font(.caption2).buttonStyle(.borderless)
            }
        }
    }

    @ViewBuilder private var pendingStateLine: some View {
        if rec.uploading {
            HStack(spacing: 6) {
                ProgressView().scaleEffect(0.6)
                Text(uploadProgressText).font(.caption2).foregroundStyle(.secondary)
            }
            // Upload laeuft im App-Prozess: verlaesst der Nutzer die App, pausiert er bis zum
            // naechsten Oeffnen (drei Support-Faelle: Session "fehlt", kam Stunden spaeter).
            Text(keepOpenText)
                .font(.caption2).foregroundStyle(.orange).multilineTextAlignment(.center)
        } else if rec.uploadError == "offline" {
            Text(WLoc.t("rec.waitConn", lang))
                .font(.caption2).foregroundStyle(.orange).multilineTextAlignment(.center)
            Text(pendingResumeText)
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
            Text(pendingCountText).font(.caption2).foregroundStyle(.secondary)
        }
    }

    // Texte vorab als typisierte Strings: Verkettungen und Interpolationen im ViewBuilder sind
    // teuer fuer den Type-Checker (jede Ueberladung von + muss geprueft werden).
    private var uploadProgressText: String {
        let base: String = WLoc.t("rec.uploading", lang)
        guard rec.uploadTotal > 0 else { return base }
        return base + " \(rec.uploadSent)/\(rec.uploadTotal)"
    }

    private var pendingCountText: String {
        let unit: String = WLoc.t("rec.pendingUpload", lang)
        return "\(rec.pendingCount) " + unit
    }

    private var keepOpenText: String {
        WLoc.t("rec.keepOpen", lang)
    }

    private var pendingResumeText: String {
        let resume: String = WLoc.t("rec.willResume", lang)
        return pendingCountText + " — " + resume
    }

    // Verbunden: jederzeit neu verbinden / Konto wechseln (überschreibt das Pairing erst, wenn ein
    // neues tatsächlich durchläuft). Bei "auth" zeigt der Block oben schon „Neu verbinden".
    @ViewBuilder private var switchAccountButton: some View {
        if Api.deviceToken != nil && rec.uploadError != "auth" {
            Button(WLoc.t("rec.switch", lang)) { onWantPair() }
                .font(.caption2).buttonStyle(.borderless).tint(.secondary)
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

    // Verwerfen-Seite (ganz außen): 3 s halten -> Aufnahme löschen ohne Upload (orange statt rot).
    @ViewBuilder private func discardPage() -> some View {
        VStack(spacing: 12) {
            HoldToStopButton(label: WLoc.t("rec.discardHold", lang), tint: .orange) { rec.discard() }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func activeFields(_ f: [Int]) -> [Int] {
        let a = f.filter { $0 != 0 }
        return a.isEmpty ? [1] : a
    }

    // Seiten des Datenrings: der gemischte Satz vom Server, Rueckfall die klassischen `views`.
    private var dataPages: [WatchPageRef] {
        onFoilPages.isEmpty ? views.map { WatchPageRef.classic($0) } : onFoilPages
    }

    /// nil = automatisch (Server entscheidet), true/false = Nutzerwahl auf der Uhr.
    private var layoutsPref: Bool? {
        switch layoutsPrefRaw {
        case 1: return true
        case 2: return false
        default: return nil
        }
    }
    private var layoutsEffective: Bool { layoutsPref ?? layoutsServerDefault }

    /// Zeigt die gerade sichtbare Seite ein eigenes Layout? (Datenseiten beginnen bei Tag 2.)
    private var currentPageIsLayout: Bool {
        guard layoutsEffective else { return false }
        let idx = page - 2
        guard idx >= 0, idx < dataPages.count else { return false }
        if case .layout = dataPages[idx] { return true }
        return false
    }

    @ViewBuilder private func dataPageView(_ ref: WatchPageRef, idx: Int) -> some View {
        switch ref {
        case .layout(let def):
            if layoutsEffective {
                LayoutPageView(
                    page: def, pageIndex: idx, pageCount: dataPages.count,
                    recording: rec.isRecording, pausedText: WLoc.t("rec.paused", lang),
                    // Die manuelle Pause gibt es auf der Apple Watch noch nicht (nur Garmin hat
                    // sie). Bis dahin waere der Hinweis IMMER falsch, deshalb hart false — sonst
                    // stuende "Pausiert" auf jeder durchgeblaetterten Pausen-Seite mitten in der
                    // Aufnahme.
                    paused: false,
                    fieldValue: { fid in fieldValue(fid, rec, lang).0 },
                    fieldLabel: { fid in fieldValue(fid, rec, lang).1 },
                    fieldColor: { fid in colorBy ? fieldColor(fid, rec) : nil }
                )
            } else {
                // Layout aus oder Definition fehlt -> klassische Ansicht, damit die Seite nicht leer ist.
                VStack(spacing: 10) {
                    ForEach(activeFields(views.first ?? [1]), id: \.self) { fid in fieldView(fid) }
                }
            }
        case .classic(let fields):
            VStack(spacing: 10) {
                ForEach(activeFields(fields), id: \.self) { fid in fieldView(fid) }
            }
        }
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
        // Kein Vorab-Gate auf Reachability: NWPathMonitor false-negatet auf watchOS (Uhr ist
        // übers iPhone online) -> sonst würde die Config nie frisch geladen. Fehlschlag ist
        // via `try?` unkritisch (Cache gilt weiter).
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
        // Layout-Paket. Die Seiten tragen ihre Definition INLINE (Tag-Byte, s. WatchLayoutRender);
        // fehlt das Paket, bleiben die klassischen 3-Feld-Seiten unveraendert stehen.
        layoutsServerDefault = c.layoutsOn ?? false
        storeVersion = c.latestVersion ?? ""
        onFoilPages = (c.pages?.compactMap { WatchPageRef($0) }) ?? views.map { WatchPageRef.classic($0) }
        offFoilPages = (c.offFoilPages?.compactMap { WatchPageRef($0) })
            ?? [WatchPageRef.classic(c.offFoilView ?? offFoil)]
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
        // Pausen-Screen (zwischen den Läufen) — fehlt der Key, bleibt der lokale Default.
        if let pv = c.pauseView, !pv.isEmpty { pauseView = pv }
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
    @Binding var layoutsPrefRaw: Int     // 0 = automatisch, 1 = an, 2 = aus
    var hasLayoutPages: Bool             // false -> Hinweis "keine Seiten" wie bei Garmin
    var onPick: () -> Void
    var onCancel: () -> Void
    @AppStorage("appLang") private var lang = "de"

    // Auch hier ein Body pro Abschnitt statt sechs Sections in EINEM Ausdruck: jede Section bringt
    // eigene header/footer-Closures mit, und im ViewBuilder multipliziert sich das (s. Kommentar an
    // RecordView.body). Reihenfolge und Inhalte sind unveraendert.
    var body: some View {
        List {
            autoStartSection
            layoutsSection
            alarmToggleSection
            thresholdsSection
            foilChoiceSection
            Section { Button(WLoc.t("common.cancel", lang), role: .cancel, action: onCancel) }
        }
    }

    private var autoStartSection: some View {
        Section {
            Toggle(WLoc.t("rec.autoStartToggle", lang), isOn: $autoStart)
        } footer: {
            Text(WLoc.t("rec.autoStartHelp", lang))
        }
    }

    // Eigene Layouts: Automatisch / An / Aus -- derselbe Dreiklang wie im Garmin-Menue
    // (RecordDelegate._layoutState). Der Server-Wert ist nur die Vorbelegung beim App-Start.
    private var layoutsSection: some View {
        Section {
            Picker(WLoc.t("menu.layouts", lang), selection: $layoutsPrefRaw) {
                Text(WLoc.t("common.auto", lang)).tag(0)
                Text(WLoc.t("common.on", lang)).tag(1)
                Text(WLoc.t("common.off", lang)).tag(2)
            }
        } footer: {
            layoutsFooter
        }
    }

    // Fusstext nur, wenn er etwas Konkretes sagt: "An, aber es sind keine Seiten konfiguriert".
    // Einen allgemeinen Hilfetext gibt es im Garmin-Recorder nicht, und ich erfinde ihn nicht in
    // sieben Sprachen.
    @ViewBuilder private var layoutsFooter: some View {
        if layoutsPrefRaw == 1 && !hasLayoutPages {
            Text(WLoc.t("lay.none", lang))
        }
    }

    private var alarmToggleSection: some View {
        Section {
            Toggle(WLoc.t("foil.alarmOn", lang), isOn: $alarm.enabled)
        } header: {
            Text(WLoc.t("foil.alarm", lang))
        } footer: {
            Text(WLoc.t("foil.alarmHelp", lang))
        }
    }

    private var thresholdsSection: some View {
        Section(WLoc.t("foil.thresholds", lang)) {
            Picker(WLoc.t("foil.source", lang), selection: $alarmSource) {
                Text(WLoc.t("foil.auto", lang)).tag("foil")
                Text(WLoc.t("foil.manual", lang)).tag("manual")
            }
            manualThresholdSteppers
        }
    }

    @ViewBuilder private var manualThresholdSteppers: some View {
        if alarmSource == "manual" {
            Stepper(value: $alarm.low, in: 0...80) {
                Text(thresholdLabel("foil.min", alarm.low)).font(.footnote)
            }
            Stepper(value: $alarm.high, in: 0...80) {
                Text(thresholdLabel("foil.max", alarm.high)).font(.footnote)
            }
        }
    }

    private var foilChoiceSection: some View {
        Section {
            ForEach(foils) { f in
                Button { selectedFoilId = f.id; onPick() } label: {
                    row(foilRowTitle(f), foilRangeText(f))
                }
            }
            Button { selectedFoilId = nil; onPick() } label: {
                row(noFoilTitle, WLoc.t("foil.noneSub", lang))
            }
        } header: {
            Text(WLoc.t("foil.choose", lang))
        } footer: {
            Text(WLoc.t("foil.chooseHelp", lang))
        }
    }

    // Texte vorab typisiert: Ternary + String-Verkettung + Interpolation sind im ViewBuilder die
    // teuersten Konstrukte fuer den Type-Checker.
    private func thresholdLabel(_ key: String, _ value: Int) -> String {
        let name: String = WLoc.t(key, lang)
        return "\(name): \(value) km/h"
    }

    private func foilRowTitle(_ f: Api.FoilOpt) -> String {
        let mark: String = selectedFoilId == f.id ? "✓ " : ""
        return mark + f.label
    }

    private func foilRangeText(_ f: Api.FoilOpt) -> String {
        "\(f.min)–\(f.max) km/h"
    }

    private var noFoilTitle: String {
        let mark: String = selectedFoilId == nil ? "✓ " : ""
        return mark + WLoc.t("foil.noFoil", lang)
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
    var tint: Color = .red   // Stop = rot, Verwerfen = orange
    let onStop: () -> Void
    @State private var progress: CGFloat = 0

    var body: some View {
        ZStack {
            Circle().stroke(Color.white.opacity(0.22), lineWidth: 6)
            Circle().trim(from: 0, to: progress)
                .stroke(tint, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Text(label).font(.caption).bold().multilineTextAlignment(.center)
                .foregroundStyle(.white).padding(8)
        }
        .frame(width: 104, height: 104)
        .contentShape(Circle())
        .onLongPressGesture(minimumDuration: 2, maximumDistance: 60, pressing: { down in
            // Fuell-Dauer MUSS zu minimumDuration passen, sonst feuert die Aktion vor dem vollen Ring.
            withAnimation(down ? .linear(duration: 2) : .easeOut(duration: 0.25)) {
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
    // Schlechtes GPS -> "--" statt Phantom-Tempo (100 km/h am Steg, Nutzer-Video 05.08.).
    case 1: return (r.gpsPoor ? "--" : String(format: "%.1f", r.speed3sKmh), WLoc.t("f.kmh3s", lang))
    case 5: return (r.gpsPoor ? "--" : String(format: "%.1f", r.speedKmh), WLoc.t("f.kmh", lang))
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
    case 15: return (distVal(r.runDistanceM), distUnit(r.runDistanceM) + " " + WLoc.t("f.runDist", lang))
    case 16: return (msStr(r.lastRunDurationMs), WLoc.t("f.lastRunTime", lang))
    case 17: return (distVal(r.lastRunDistanceM), distUnit(r.lastRunDistanceM) + " " + WLoc.t("f.lastRunDist", lang))
    case 18: return (String(format: "%.1f", r.lastRunAvgSpeedKmh), WLoc.t("f.lastRunAvg", lang))
    case 19: return (String(format: "%.1f", r.lastRunMaxSpeedKmh), WLoc.t("f.lastRunMax", lang))
    case 20: return ("\(r.runCount)", WLoc.t("f.runs", lang))
    default: return ("—", "")
    }
}

private func msStr(_ ms: Int) -> String { let s = ms / 1000; return String(format: "%d:%02d", s / 60, s % 60) }
// Distanz wie bei Garmin (RecordView._distVal/_distUnit): die EINHEIT GEHOERT INS LABEL, nicht in
// den Wert. Vorher stand sie im Wert ("12 m"), das Label trug nur "Lauf-Dist" — in einem Layout mit
// Wert und Label nebeneinander wirkt das doppelt, und die PWA-Vorschau zeigte es anders.
private func distVal(_ m: Double) -> String {
    m < 1000 ? String(format: "%.0f", m) : String(format: "%.2f", m / 1000)
}
private func distUnit(_ m: Double) -> String { m < 1000 ? "m" : "km" }

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

// Geschwindigkeitsfarbe in VIER STUFEN wie Garmin (_speedColor: 12/16/20 km/h) und die
// PWA-Vorschau (watchLayout.ts watchSpeedColor) — vorher stufenloser HSV-Verlauf 8…25 km/h, der bei
// jedem Wert anders aussah als Vorschau und Garmin-Uhr. Hex-Werte = die der Vorschau.
private func speedColor(_ kmh: Double) -> Color {
    if kmh < 12 { return Color(red: 0.23, green: 0.51, blue: 0.96) }
    if kmh < 16 { return Color(red: 0.13, green: 0.77, blue: 0.37) }
    if kmh < 20 { return Color(red: 0.92, green: 0.70, blue: 0.03) }
    return Color(red: 0.94, green: 0.27, blue: 0.27)
}
// Puls-Farbe nach Garmin-Buckets (120/150/170): grün → gelb → orange → rot.
private func hrColor(_ bpm: Int) -> Color {
    switch bpm {
    case ..<1: return .primary
    case ..<120: return Color(red: 0.13, green: 0.77, blue: 0.37)
    case ..<150: return Color(red: 0.92, green: 0.70, blue: 0.03)
    case ..<170: return Color(red: 0.98, green: 0.45, blue: 0.09)
    default: return Color(red: 0.94, green: 0.27, blue: 0.27)
    }
}
