import SwiftUI

// Uhren-Bereich wie die PWA (web Account.tsx, Reiter „Uhr" in Uhr & Konten): `UhrReiterView` mit den Reitern
// Anleitung | Einstellungen | Meine Uhr(en). `WatchView` ist „Meine Uhr(en)": Uhr verbinden (Code eingeben/erzeugen),
// Apple-Watch-Status, HUAWEI, Suunto, darunter die verbundenen Uhren mit ihren Einstellungen je Uhr.
// Anleitung, Datenseiten und Alarm waren bis 04.11.2026 Verweise in dieser Liste; jetzt sind es Reiter.
struct WatchView: View {
    @EnvironmentObject var sync: SyncManager
    @AppStorage("appLang") private var lang = "de"
    /// Als Reiter in Home › Uhren / Einstellungen › Uhren (App-Port, 04.11.2026): ohne eigene Kopfleiste.
    var eingebettet: Bool = false
    @State private var devices: [PairedDevice] = []
    @State private var modes: [Int: String] = [:]     // record_mode je Uhr (id → full|lite|gps)
    // GNSS-Stufe je Uhr (id → best|l1|two|gps). NUR Garmin waehlt sie, ab Uhr 1.0.77.
    @State private var gnss: [Int: String] = [:]
    // Wassersperre (nicht Garmin) und Wake-up-Sensor (nur Wear) je Uhr, id → Wert.
    @State private var waterLocks: [Int: String] = [:]
    @State private var wakeups: [Int: String] = [:]
    // Speicher sparen je Uhr (id → an/aus), nur Garmin.
    @State private var sparen: [Int: Bool] = [:]
    // Rueckmeldung je Uhr UND Einstellung (PWA Account.tsx, 26.09.2026): die Regler speichern
    // sofort beim Umstellen. Vorher kam nur ein kurzes „Gespeichert" unten am Abschnitt, auch wenn
    // der Aufruf scheiterte (`try?`). Jetzt steht es direkt unter dem Regler, 3 s lang; bei einem
    // Fehler die Meldung, und die Liste wird neu geladen, damit der Regler den echten Wert zeigt.
    @State private var rueckmeldung: Rueckmeldung? = nil
    // Zaehler, damit das Ausblenden einer ALTEN Meldung nicht die neue wegnimmt.
    @State private var rueckLauf = 0
    // Aufraeumen je Uhr (wie PWA): ausgeblendete auf Wunsch mitladen — sonst waere Ausblenden auf
    // dem Telefon eine Einbahnstrasse. `frage` haelt die offene Rueckfrage.
    @State private var zeigeAusgeblendete = false
    @State private var frage: GeraeteFrage? = nil

    /// Speichern mit Rueckmeldung unter genau diesem Regler (`k` = "<id>:mode|gnss|water|accel").
    private func speichern(_ k: String, _ aufruf: @escaping () async throws -> Void) {
        rueckLauf += 1
        let meiner: Int = rueckLauf
        rueckmeldung = nil
        Task {
            do {
                try await aufruf()
                guard meiner == rueckLauf else { return }
                rueckmeldung = Rueckmeldung(k: k, fehler: nil)
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                if meiner == rueckLauf { rueckmeldung = nil }
            } catch {
                guard meiner == rueckLauf else { return }
                rueckmeldung = Rueckmeldung(k: k, fehler: error.localizedDescription)
                await loadDevices()
            }
        }
    }

    /// „Gespeichert" bzw. die Fehlermeldung unter dem Regler — normale Hinweisgroesse, nie winzig.
    @ViewBuilder private func rueck(_ k: String) -> some View {
        if let r = rueckmeldung, r.k == k {
            if let f = r.fehler {
                Text(f).font(.callout).foregroundStyle(.red)
            } else {
                Text(Loc.t("common.saved", lang)).font(.callout).foregroundStyle(.green)
            }
        }
    }

    // Ein Abschnitt = eine eigene, explizit typisierte Property. Swifts Type-Checker loest einen
    // ViewBuilder als EINEN Ausdruck auf; dieser Body war ~76 Zeilen (inkl. Geraetezeile mit
    // eigenem Binding) und stand mit >500 ms im Build-Log. Reihenfolge/Inhalte unveraendert.
    var body: some View {
        List {
            // Uhr verbinden zuerst (web: ClaimFromWatch vor PairedDevices).
            GarminPairView(eingebettet: true)
            appleWatchSection
            // HUAWEI-Uhr (Beta, 07.10.2026) — erscheint nur mit eingebautem Wear-Engine-SDK.
            HuaweiKarte()
            // Suunto-Uhr (Beta, 17.10.2026) — nur mit verknuepftem Suunto-Konto oder eingeschaltetem Empfang.
            SuuntoKarte()
            devicesSection
        }
        .brandToolbarWenn(!eingebettet, Loc.t("nav.watch", lang))
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadDevices() }
        .confirmationDialog(frageTitel, isPresented: zeigeFrage, titleVisibility: .visible) {
            frageAktionen
        } message: {
            Text(frageText)
        }
    }

    // MARK: - Abschnitte

    // Apple-Watch-Status: Updates kommen automatisch mit der iPhone-App (eingebettet);
    // ist die Uhr gekoppelt, aber die App fehlt -> Hinweis (Installieren via Watch-App).
    private var appleWatchSection: some View {
        Section(Loc.t("watch.title", lang)) {
            appleWatchStatus
        }
        .task { sync.refreshConnection() }
    }

    @ViewBuilder private var appleWatchStatus: some View {
        if sync.watchAppInstalled {
            Label(Loc.t("watch.ok", lang), systemImage: "checkmark.circle.fill")
                .font(.caption).foregroundStyle(.secondary)
        } else if sync.watchPaired {
            Label(Loc.t("watch.notInstalled", lang), systemImage: "applewatch.slash")
                .font(.caption).foregroundStyle(.secondary)
        } else {
            Label(Loc.t("watch.none", lang), systemImage: "applewatch")
                .font(.caption).foregroundStyle(.secondary)
        }
    }

    // Verbundene Uhren mit Aufzeichnungsmodus je Uhr (wie PWA). Nur aktive Geräte.
    @ViewBuilder private var devicesSection: some View {
        if !activeDevices.isEmpty {
            Section {
                // Was die Regler tun: sie wirken auf die UHR und greifen dort beim naechsten
                // App-Start. Ohne den Satz sucht man den Effekt an der falschen Stelle — belegt
                // daran, dass gnss_mode bei ALLEN 115 Garmin-Uhren auf NULL stand.
                Text(Loc.t("account.devicesSettingsIntro", lang))
                    .font(.callout).foregroundStyle(.secondary)
                ForEach(activeDevices) { d in deviceRow(d) }
                Text(Loc.t("account.deviceHideHint", lang)).font(.subheadline).foregroundStyle(.secondary)
                ausgeblendetKnopf
            } header: { Text(Loc.t("account.devicesTitle", lang)) }
        }
    }

    // Filter als typisierte Property statt als `let` im ViewBuilder.
    private var activeDevices: [PairedDevice] {
        devices.filter { $0.revoked_at == nil }
    }

    private func deviceRow(_ d: PairedDevice) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                uhrBild(d)
                Text(deviceTitle(d)).fontWeight(.medium)
                Spacer()
                versionLabel(d)
            }
            // Die .tag()-Aufrufe bleiben ABSICHTLICH direkte Kinder des Pickers — nur so findet
            // die Auswahl ihre Einträge.
            Picker(Loc.t("account.recordMode", lang), selection: recordModeBinding(d)) {
                Text(Loc.t("account.recordModeFull", lang)).tag("full")
                Text(Loc.t("account.recordModeLite", lang)).tag("lite")
                Text(Loc.t("account.recordModeGps", lang)).tag("gps")
            }
            rueck("\(d.id):mode")
            updateHinweis(d)
            autoLiteHint(d)
            gpsOnlyHint(d)
            garminHint(d)
            gnssPicker(d)
            speicherSparen(d)
            waterLockPicker(d)
            accelWakeupPicker(d)
            geraeteAktionen(d)
        }
    }

    // Ausblenden / Entfernen / Widerrufen — bisher nur in der PWA, dadurch war eine verkaufte
    // oder doppelt gepairte Uhr aus der App nicht loszuwerden.
    //  * Ausblenden ist reversibel und rein kosmetisch (die Uhr laedt weiter hoch).
    //  * Entfernen NUR ohne Session — sonst verliert die Session ihre Geraetezuordnung; das
    //    trifft genau die fehlgeschlagenen Pairing-Versuche.
    //  * Widerrufen macht den Token ungueltig, die Sessions bleiben.
    @ViewBuilder private func geraeteAktionen(_ d: PairedDevice) -> some View {
        HStack(spacing: 14) {
            Button(Loc.t(d.hidden_at != nil ? "account.deviceUnhide" : "account.deviceHide", lang)) {
                Task {
                    try? await Api.hideDevice(d.id, hidden: d.hidden_at == nil)
                    await loadDevices()
                }
            }
            if (d.sessions ?? 1) == 0 {
                Button(Loc.t("account.deviceForget", lang)) {
                    frage = GeraeteFrage(id: d.id, art: .entfernen, name: deviceTitle(d))
                }
            }
            Button(Loc.t("account.deviceRevoke", lang), role: .destructive) {
                frage = GeraeteFrage(id: d.id, art: .widerrufen, name: deviceTitle(d))
            }
            Spacer(minLength: 0)
        }
        .font(.subheadline)
        .buttonStyle(.borderless)
    }

    @ViewBuilder private var ausgeblendetKnopf: some View {
        let n = devices.first?.hidden_total ?? 0
        if n > 0 || zeigeAusgeblendete {
            Button(zeigeAusgeblendete
                   ? Loc.t("account.devicesHideHidden", lang)
                   : Loc.t("account.devicesShowHidden", lang)
                        .replacingOccurrences(of: "{n}", with: String(n))) {
                zeigeAusgeblendete.toggle()
                Task { await loadDevices() }
            }
            .font(.subheadline)
        }
    }

    // Update-Hinweis je Uhr — die PWA zeigt ihn seit Langem, die Apps nicht. Ohne ihn faehrt man
    // monatelang eine alte Uhr-App, ohne es zu erfahren. Bewusst `settings.watchUpdate` und NICHT
    // `account.deviceUpdate`: letzterer endet auf „→ herunterladen", und den .prg-Download gibt es
    // nur im Web — die Uhr holt sich das Update ueber ihren eigenen Store.
    @ViewBuilder private func updateHinweis(_ d: PairedDevice) -> some View {
        if d.update_available == true, let v = d.latest_version, !v.isEmpty {
            Text(Loc.t("settings.watchUpdate", lang)
                    .replacingOccurrences(of: "{platform}", with: (d.platform ?? "").capitalized)
                    .replacingOccurrences(of: "{version}", with: v))
                .font(.subheadline).foregroundStyle(.orange)
        }
    }

    // Satellitensysteme — nur Garmin, wie in der PWA. Groesster Akku-Hebel.
    @ViewBuilder private func gnssPicker(_ d: PairedDevice) -> some View {
        if d.platform == "garmin" {
            Picker(Loc.t("account.gnssMode", lang), selection: gnssBinding(d)) {
                Text(Loc.t("account.gnssModeBest", lang)).tag("best")
                Text(Loc.t("account.gnssModeL1", lang)).tag("l1")
                Text(Loc.t("account.gnssModeTwo", lang)).tag("two")
                Text(Loc.t("account.gnssModeGps", lang)).tag("gps")
            }
            rueck("\(d.id):gnss")
            Text(Loc.t("account.gnssModeHint", lang)).font(.callout).foregroundStyle(.secondary)
        }
    }

    // Bild der verknuepften Uhr (nur Garmin, aus dem Simulator; PWA seit 09.10.2026), sonst das Symbol.
    @ViewBuilder private func uhrBild(_ d: PairedDevice) -> some View {
        if let u = Api.mediaURL(d.bild_url) {
            NetzBild(url: u) { stand in
                switch stand {
                case .da(let img): img.resizable().scaledToFit()
                default: Image(systemName: "applewatch").foregroundStyle(Color.accentColor)
                }
            }
            .frame(width: 56, height: 56)
        } else {
            Image(systemName: "applewatch").foregroundStyle(Color.accentColor)
        }
    }

    // Speicher sparen (Garmin ab 1.0.92) mit dem Hinweis der PWA: was gespart wird, die Zahlen DIESER Uhr,
    // das Umschalten auf nur GPS bei wenig Speicher, wann man es ausschaltet (Jan: „genau erklaert").
    @ViewBuilder private func speicherSparen(_ d: PairedDevice) -> some View {
        if d.gps_sparen_moeglich == true {
            Toggle(Loc.t("account.gpsSparen", lang), isOn: sparenBinding(d))
            rueck("\(d.id):gpsSparen")
            Text(Loc.t("account.gpsSparenHint", lang)).font(.callout).foregroundStyle(.secondary)
            Text(sparenUhrText(d)).font(.callout)
            Text(Loc.t("account.gpsSparenNotfall", lang)).font(.callout).foregroundStyle(.secondary)
            Text(Loc.t("account.gpsSparenAus", lang)).font(.callout).foregroundStyle(.secondary)
        }
    }

    private func sparenBinding(_ d: PairedDevice) -> Binding<Bool> {
        Binding(get: { sparen[d.id] ?? (d.gps_sparen != false) }, set: { setSparen(d.id, $0) })
    }

    private func setSparen(_ id: Int, _ an: Bool) {
        sparen[id] = an
        speichern("\(id):gpsSparen") { try await Api.setDeviceGpsSparen(id, an: an) }
    }

    /// Aufnahmezeit bis „Speicher voll" — dieselbe Rechnung wie die PWA (Account.tsx `sparMinuten`) und
    /// die Uhr: 90 % der gemessenen Grenze; 11,5 KB/min bei 25 Hz, 6,1 bei 10 Hz, 2,5 nur GPS; mit Sparen
    /// meist Faktor 2 bis 3. Ohne Messung keine Zahl.
    private func sparenUhrText(_ d: PairedDevice) -> String {
        let kb = d.speicher_kb ?? 0
        if kb <= 0 || kb >= 5000 { return Loc.t("account.gpsSparenUhrUnbekannt", lang) }
        let m = mode(d)
        let modus: String
        if d.seiten_klasse == "lite" || m == "gps" { modus = "gps" }
        else if m == "lite" || d.low_accel == true { modus = "lite" }
        else { modus = "full" }
        let kbMin: Double = modus == "gps" ? 2.5 : (modus == "lite" ? 6.1 : 11.5)
        let ohne = Int((Double(kb) * 0.9 / kbMin).rounded())
        let key: String = modus == "gps" ? "account.sparModusGps" : (modus == "lite" ? "account.sparModusLite" : "account.sparModusFull")
        var s = Loc.t("account.gpsSparenUhr", lang)
        s = s.replacingOccurrences(of: "{kb}", with: String(kb))
        s = s.replacingOccurrences(of: "{modus}", with: Loc.t(key, lang))
        s = s.replacingOccurrences(of: "{ohne}", with: String(ohne))
        s = s.replacingOccurrences(of: "{von}", with: String(ohne * 2))
        s = s.replacingOccurrences(of: "{bis}", with: String(ohne * 3))
        return s
    }

    // „Nur GPS" schaltet alles ab, was aus der Bewegung kommt — das MUSS dranstehen. Fehlte der
    // App bisher, obwohl die PWA es zeigt. .callout statt .caption: keine winzigen Warnungen.
    @ViewBuilder private func gpsOnlyHint(_ d: PairedDevice) -> some View {
        if mode(d) == "gps" {
            Text(Loc.t("account.recordModeGpsHint", lang)).font(.callout).foregroundStyle(.orange)
        }
    }

    // Je Uhr NUR, was sie auch umsetzt — wie die PWA (Jan, 25.09.2026: „je uhr einfach nur das
    // anbieten was auch sinn ergibt"). Wassersperre: alle ausser Garmin.
    @ViewBuilder private func waterLockPicker(_ d: PairedDevice) -> some View {
        if d.platform != "garmin" {
            Picker(Loc.t("account.waterLock", lang), selection: waterLockBinding(d)) {
                Text(Loc.t("account.waterLockAuto", lang)).tag("auto")
                Text(Loc.t("account.waterLockOn", lang)).tag("on")
                Text(Loc.t("account.waterLockOff", lang)).tag("off")
            }
            rueck("\(d.id):water")
            Text(Loc.t("account.waterLockHint", lang)).font(.callout).foregroundStyle(.secondary)
        }
    }

    // Wake-up-Sensor — nur Wear OS. „Standard" entfernt den Override, damit man spaeter mitzieht,
    // wenn der Standard umgestellt wird.
    @ViewBuilder private func accelWakeupPicker(_ d: PairedDevice) -> some View {
        if d.platform == "wear" {
            Picker(Loc.t("account.accelWakeup", lang), selection: wakeupBinding(d)) {
                Text(wakeupStandardLabel(d)).tag("default")
                Text(Loc.t("account.accelWakeupOn", lang)).tag("on")
                Text(Loc.t("account.accelWakeupOff", lang)).tag("off")
            }
            rueck("\(d.id):accel")
            Text(Loc.t("account.accelWakeupHint", lang)).font(.callout).foregroundStyle(.secondary)
        }
    }

    private func wakeupStandardLabel(_ d: PairedDevice) -> String {
        let key: String = (d.accel_wakeup_standard ?? "off") == "on" ? "account.accelWakeupOn" : "account.accelWakeupOff"
        return Loc.t("account.accelWakeupDefault", lang).replacingOccurrences(of: "{v}", with: Loc.t(key, lang))
    }

    private func waterLockBinding(_ d: PairedDevice) -> Binding<String> {
        Binding(get: { waterLocks[d.id] ?? d.water_lock ?? "auto" }, set: { v in
            waterLocks[d.id] = v
            speichern("\(d.id):water") { try await Api.setDeviceWaterLock(d.id, mode: v) }
        })
    }

    private func wakeupBinding(_ d: PairedDevice) -> Binding<String> {
        Binding(get: { wakeups[d.id] ?? d.accel_wakeup ?? "default" }, set: { v in
            wakeups[d.id] = v
            speichern("\(d.id):accel") { try await Api.setDeviceAccelWakeup(d.id, mode: v) }
        })
    }

    private func gnssBinding(_ d: PairedDevice) -> Binding<String> {
        Binding(get: { gnss[d.id] ?? d.gnss_mode ?? "best" }, set: { setGnss(d.id, $0) })
    }

    private func setGnss(_ id: Int, _ v: String) {
        gnss[id] = v
        speichern("\(id):gnss") { try await Api.setDeviceGnssMode(id, mode: v) }
    }

    @ViewBuilder private func versionLabel(_ d: PairedDevice) -> some View {
        if let v = d.app_version { Text("v\(v)").font(.caption2).foregroundStyle(.secondary) }
    }

    @ViewBuilder private func autoLiteHint(_ d: PairedDevice) -> some View {
        if showsAutoLiteHint(d) {
            Text(Loc.t("account.recordModeAutoLite", lang)).font(.caption).foregroundStyle(.orange)
        }
    }

    @ViewBuilder private func garminHint(_ d: PairedDevice) -> some View {
        if d.platform == "garmin" {
            Text(Loc.t("account.recordModeGarminHint", lang)).font(.caption).foregroundStyle(.secondary)
        }
    }

    // MARK: - Werte/Ablauflogik vorab typisiert

    private func deviceTitle(_ d: PairedDevice) -> String {
        d.model ?? d.label ?? Loc.t("account.deviceUnnamed", lang)
    }

    private func mode(_ d: PairedDevice) -> String { modes[d.id] ?? "full" }

    private func showsAutoLiteHint(_ d: PairedDevice) -> Bool {
        (d.low_accel ?? false) && mode(d) == "full"
    }

    // Binding + Speichern als Methode statt als Closure im ViewBuilder.
    private func recordModeBinding(_ d: PairedDevice) -> Binding<String> {
        Binding(get: { mode(d) }, set: { v in setMode(d.id, v) })
    }

    private func setMode(_ id: Int, _ v: String) {
        modes[id] = v
        speichern("\(id):mode") { try await Api.setDeviceRecordMode(id, mode: v) }
    }

    private func loadDevices() async {
        if let ds = try? await Api.myDevices(includeHidden: zeigeAusgeblendete) {
            devices = ds
            modes = Dictionary(uniqueKeysWithValues: ds.map { ($0.id, $0.record_mode ?? "full") })
            gnss = Dictionary(uniqueKeysWithValues: ds.map { ($0.id, $0.gnss_mode ?? "best") })
            waterLocks = [:]
            wakeups = [:]
            sparen = [:]
        }
    }

    // MARK: - Rueckfrage (Entfernen/Widerrufen)

    private var zeigeFrage: Binding<Bool> {
        Binding(get: { frage != nil }, set: { if !$0 { frage = nil } })
    }

    private var frageTitel: String {
        guard let f = frage else { return "" }
        return Loc.t(f.art == .entfernen ? "account.deviceForget" : "account.deviceRevoke", lang)
    }

    private var frageText: String {
        guard let f = frage else { return "" }
        let roh = Loc.t(f.art == .entfernen ? "account.deviceForgetConfirm" : "account.revokeConfirm", lang)
        return roh.replacingOccurrences(of: "{name}", with: f.name)
    }

    @ViewBuilder private var frageAktionen: some View {
        if let f = frage {
            Button(frageTitel, role: .destructive) {
                frage = nil
                Task {
                    if f.art == .entfernen { try? await Api.forgetDevice(f.id) }
                    else { try? await Api.revokeDevice(f.id) }
                    await loadDevices()
                }
            }
            Button(Loc.t("common.cancel", lang), role: .cancel) { frage = nil }
        }
    }
}

// MARK: - Reiter des Uhr-Bereichs

/// Uhr & Konten › Uhr: dritte Reiterzeile Anleitung | Einstellungen | Meine Uhr(en), wie web Account.tsx (eingebettet).
/// Startreiter wie im Web: wer schon eine (nicht widerrufene) Uhr verbunden hat, kommt nicht wegen der Anleitung, sondern
/// zum Einstellen — also „Einstellungen". Selbst gewaehlt gilt fuer die App-Sitzung (`ReiterSpeicher`) und springt nie um.
struct UhrReiterView: View {
    @AppStorage("appLang") private var lang = "de"
    /// "" = noch nichts selbst gewaehlt, dann gilt `start`.
    @State private var wahl: String = ReiterSpeicher.von("uhrteil", "")
    @State private var start = "guide"

    private var reiter: [ReiterDef] {
        [ReiterDef(id: "guide", label: Loc.t("account.tabGuide", lang)),
         ReiterDef(id: "views", label: Loc.t("tab.watchSettings", lang)),
         ReiterDef(id: "connect", label: Loc.t("account.tabConnect", lang))]
    }

    private var aktiv: String { wahl.isEmpty ? start : wahl }

    private var bindung: Binding<String> {
        Binding(get: { aktiv }, set: { wahl = $0; ReiterSpeicher.setze("uhrteil", $0) })
    }

    var body: some View {
        VStack(spacing: 0) {
            Reiterleiste(reiter: reiter, aktiv: bindung)
                .padding(.horizontal)
            inhalt
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .task { await startWaehlen() }
    }

    // Je Reiter eine eigene, volle Liste/Form unter den Reiterzeilen.
    @ViewBuilder private var inhalt: some View {
        switch aktiv {
        case "views": UhrEinstellungenReiter()
        case "connect": WatchView(eingebettet: true)
        default: GuideView(eingebettet: true, zuVerbinden: { bindung.wrappedValue = "connect" })
        }
    }

    private func startWaehlen() async {
        guard wahl.isEmpty, let ds = try? await Api.myDevices() else { return }
        if ds.contains(where: { $0.revoked_at == nil }) { start = "views" }
    }
}

/// Uhr › Einstellungen: vierte Reiterzeile wie web EinstellungenReiter (Account.tsx): Uhr-Einstellungen |
/// Zifferblaetter / Datenfelder | Layouts der Community | Eigene Layouts | On-Foil-Alarm.
/// Einstellungen je Uhr (Aufnahmemodus, Wassersperre …) bleiben bei den Uhren unter „Meine Uhr(en)".
struct UhrEinstellungenReiter: View {
    @AppStorage("appLang") private var lang = "de"
    @State private var wahl: String = ReiterSpeicher.von("uhreinst", "uhr")

    private var reiter: [ReiterDef] {
        [ReiterDef(id: "uhr", label: Loc.t("tab.watchSettingsUhr", lang)),
         ReiterDef(id: "seiten", label: Loc.t("account.tabFaces", lang)),
         ReiterDef(id: "community", label: Loc.t("lay.galleryTitle", lang)),
         ReiterDef(id: "eigene", label: Loc.t("account.toLayouts", lang)),
         ReiterDef(id: "alarm", label: Loc.t("account.tabAlarm", lang))]
    }

    var body: some View {
        VStack(spacing: 0) {
            Reiterleiste(reiter: reiter, aktiv: Binding(get: { wahl }, set: { wahl = $0; ReiterSpeicher.setze("uhreinst", $0) }))
                .padding(.horizontal)
            inhalt
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    // `.id`: die beiden DataFieldsView-Teile sind eigene Ansichten mit eigenem Laden (sonst behielte SwiftUI den Zustand).
    @ViewBuilder private var inhalt: some View {
        switch wahl {
        case "seiten": DataFieldsView(eingebettet: true, teil: "seiten").id("seiten")
        case "community": LayoutGalleryView(lang: lang, eingebettet: true)
        case "eigene": EigeneLayoutsView()
        case "alarm": AlarmView(eingebettet: true)
        default: DataFieldsView(eingebettet: true, teil: "einstellungen").id("uhr")
        }
    }
}

/// Uhr › Einstellungen › Eigene Layouts: gestaltet wird nur im Browser (Jan, 17.08.) — hier der Hinweis mit Link zur
/// Web-Seite /layouts und die eigenen Layouts als Vorschau (nur ansehen, wie in den Datenseiten).
struct EigeneLayoutsView: View {
    @AppStorage("appLang") private var lang = "de"
    @State private var layouts: [WatchLayoutBrief]? = nil

    var body: some View {
        Form {
            Section {
                Text(Loc.t("datafields.editorInBrowser", lang)).font(.callout)
                Link(Loc.t("account.toLayouts", lang) + " · pumpfoil.org", destination: URL(string: "\(Api.baseURL)/layouts")!)
            }
            liste
        }
        .task { layouts = (try? await Api.watchLayouts()) ?? layouts ?? [] }
    }

    @ViewBuilder private var liste: some View {
        if let ls = layouts, !ls.isEmpty {
            Section(Loc.t("account.toLayouts", lang)) {
                ForEach(ls) { l in zeile(l) }
            }
        }
    }

    private func zeile(_ l: WatchLayoutBrief) -> some View {
        HStack(spacing: 10) {
            WatchLayoutPreview(elements: l.elements ?? [], bgColor: l.bg_color ?? 0, shape: l.shape ?? "round",
                               w: l.authored_w ?? 240, h: l.authored_h ?? 240,
                               px: 80, pageCount: 1, pageIndex: 0, lang: lang)
            Text(l.name)
        }
    }
}

/// Rueckmeldung nach dem Speichern einer Einstellung je Uhr; `fehler` nil = gespeichert.
struct Rueckmeldung {
    let k: String
    let fehler: String?
}

/// Offene Rueckfrage zu einer Uhr — Wert statt Flut von Bool-Zustaenden.
struct GeraeteFrage: Identifiable {
    enum Art: Equatable { case entfernen, widerrufen }
    let id: Int
    let art: Art
    let name: String
}
