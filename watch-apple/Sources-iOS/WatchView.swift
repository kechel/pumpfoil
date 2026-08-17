import SwiftUI

// Uhren-Bereich (wie die PWA /account „Uhr"): Apple-Watch-Status + Garmin/Wear-Kopplung +
// On-Foil-Alarm + Datenseiten gebündelt. Die Profil-Übersicht zeigt nur EINEN „Uhr"-Eintrag.
struct WatchView: View {
    @EnvironmentObject var sync: SyncManager
    @AppStorage("appLang") private var lang = "de"
    @State private var devices: [PairedDevice] = []
    @State private var modes: [Int: String] = [:]     // record_mode je Uhr (id → full|lite|gps)
    // GNSS-Stufe je Uhr (id → best|l1|two|gps). NUR Garmin waehlt sie, ab Uhr 1.0.77.
    @State private var gnss: [Int: String] = [:]
    @State private var savedFlash = false

    private func flashSaved() {
        savedFlash = true
        Task { try? await Task.sleep(nanoseconds: 1_600_000_000); savedFlash = false }
    }

    // Ein Abschnitt = eine eigene, explizit typisierte Property. Swifts Type-Checker loest einen
    // ViewBuilder als EINEN Ausdruck auf; dieser Body war ~76 Zeilen (inkl. Geraetezeile mit
    // eigenem Binding) und stand mit >500 ms im Build-Log. Reihenfolge/Inhalte unveraendert.
    var body: some View {
        List {
            appleWatchSection
            devicesSection
            navSection
        }
        .brandToolbar(Loc.t("nav.watch", lang))
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadDevices() }
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
            } header: { Text(Loc.t("account.devicesTitle", lang)) }
            footer: { savedFooter }
        }
    }

    // Filter als typisierte Property statt als `let` im ViewBuilder.
    private var activeDevices: [PairedDevice] {
        devices.filter { $0.revoked_at == nil }
    }

    @ViewBuilder private var savedFooter: some View {
        if savedFlash { Text(Loc.t("common.saved", lang)).foregroundStyle(.green) }
    }

    private func deviceRow(_ d: PairedDevice) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Image(systemName: "applewatch").foregroundStyle(Color.accentColor)
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
            autoLiteHint(d)
            gpsOnlyHint(d)
            zeppHint(d)
            garminHint(d)
            gnssPicker(d)
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
            Text(Loc.t("account.gnssModeHint", lang)).font(.callout).foregroundStyle(.secondary)
        }
    }

    // „Nur GPS" schaltet alles ab, was aus der Bewegung kommt — das MUSS dranstehen. Fehlte der
    // App bisher, obwohl die PWA es zeigt. .callout statt .caption: keine winzigen Warnungen.
    @ViewBuilder private func gpsOnlyHint(_ d: PairedDevice) -> some View {
        if mode(d) == "gps" {
            Text(Loc.t("account.recordModeGpsHint", lang)).font(.callout).foregroundStyle(.orange)
        }
    }

    // Amazfit holt sich den Aufzeichnungsmodus gar nicht ab (watch-zepp/app-side/index.js reicht
    // ihn nicht durch) -> ehrlich dranschreiben statt den Regler wirkungslos anbieten.
    @ViewBuilder private func zeppHint(_ d: PairedDevice) -> some View {
        if d.platform == "zepp" {
            Text(Loc.t("account.recordModeZeppHint", lang)).font(.callout).foregroundStyle(.orange)
        }
    }

    private func gnssBinding(_ d: PairedDevice) -> Binding<String> {
        Binding(get: { gnss[d.id] ?? d.gnss_mode ?? "best" }, set: { setGnss(d.id, $0) })
    }

    private func setGnss(_ id: Int, _ v: String) {
        gnss[id] = v
        Task { try? await Api.setDeviceGnssMode(id, mode: v); flashSaved() }
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

    private var navSection: some View {
        Section {
            navRow("garmin.title", "link.circle") { GarminPairView() }
            navRow("profile.alarm", "waveform.path") { AlarmView() }
            navRow("profile.datafields", "square.grid.2x2") { DataFieldsView() }
        }
    }

    // NavigationLink + Label als typisierter Helfer: derselbe Ausdruck stand dreimal im
    // ViewBuilder und kostete den Checker jedes Mal die volle Auflösung von Label/Image/Color.
    private func navRow<D: View>(_ key: String, _ symbol: String,
                                @ViewBuilder destination: () -> D) -> some View {
        NavigationLink {
            destination()
        } label: {
            Label { Text(Loc.t(key, lang)) } icon: { Image(systemName: symbol).foregroundStyle(Color.accentColor) }
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
        Task { try? await Api.setDeviceRecordMode(id, mode: v); flashSaved() }
    }

    private func loadDevices() async {
        if let ds = try? await Api.myDevices() {
            devices = ds
            modes = Dictionary(uniqueKeysWithValues: ds.map { ($0.id, $0.record_mode ?? "full") })
            gnss = Dictionary(uniqueKeysWithValues: ds.map { ($0.id, $0.gnss_mode ?? "best") })
        }
    }
}
