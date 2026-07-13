import SwiftUI

// Uhren-Bereich (wie die PWA /account „Uhr"): Apple-Watch-Status + Garmin/Wear-Kopplung +
// On-Foil-Alarm + Datenseiten gebündelt. Die Profil-Übersicht zeigt nur EINEN „Uhr"-Eintrag.
struct WatchView: View {
    @EnvironmentObject var sync: SyncManager
    @AppStorage("appLang") private var lang = "de"
    @State private var devices: [PairedDevice] = []
    @State private var modes: [Int: String] = [:]     // record_mode je Uhr (id → full|lite|gps)
    @State private var savedFlash = false

    private func flashSaved() {
        savedFlash = true
        Task { try? await Task.sleep(nanoseconds: 1_600_000_000); savedFlash = false }
    }

    var body: some View {
        List {
            // Apple-Watch-Status: Updates kommen automatisch mit der iPhone-App (eingebettet);
            // ist die Uhr gekoppelt, aber die App fehlt -> Hinweis (Installieren via Watch-App).
            Section(Loc.t("watch.title", lang)) {
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
            .task { sync.refreshConnection() }

            // Verbundene Uhren mit Aufzeichnungsmodus je Uhr (wie PWA). Nur aktive Geräte.
            let active = devices.filter { $0.revoked_at == nil }
            if !active.isEmpty {
                Section {
                    ForEach(active) { d in
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Image(systemName: "applewatch").foregroundStyle(Color.accentColor)
                                Text(d.model ?? d.label ?? Loc.t("account.deviceUnnamed", lang)).fontWeight(.medium)
                                Spacer()
                                if let v = d.app_version { Text("v\(v)").font(.caption2).foregroundStyle(.secondary) }
                            }
                            Picker(Loc.t("account.recordMode", lang), selection: Binding(
                                get: { modes[d.id] ?? "full" },
                                set: { v in modes[d.id] = v; Task { try? await Api.setDeviceRecordMode(d.id, mode: v); flashSaved() } }
                            )) {
                                Text(Loc.t("account.recordModeFull", lang)).tag("full")
                                Text(Loc.t("account.recordModeLite", lang)).tag("lite")
                                Text(Loc.t("account.recordModeGps", lang)).tag("gps")
                            }
                            if (d.low_accel ?? false) && (modes[d.id] ?? "full") == "full" {
                                Text(Loc.t("account.recordModeAutoLite", lang)).font(.caption).foregroundStyle(.orange)
                            }
                        }
                    }
                } header: { Text(Loc.t("account.devicesTitle", lang)) }
                footer: { if savedFlash { Text(Loc.t("common.saved", lang)).foregroundStyle(.green) } }
            }

            Section {
                NavigationLink {
                    GarminPairView()
                } label: {
                    Label { Text(Loc.t("garmin.title", lang)) } icon: { Image(systemName: "link.circle").foregroundStyle(Color.accentColor) }
                }
                NavigationLink {
                    AlarmView()
                } label: {
                    Label { Text(Loc.t("profile.alarm", lang)) } icon: { Image(systemName: "waveform.path").foregroundStyle(Color.accentColor) }
                }
                NavigationLink {
                    DataFieldsView()
                } label: {
                    Label { Text(Loc.t("profile.datafields", lang)) } icon: { Image(systemName: "square.grid.2x2").foregroundStyle(Color.accentColor) }
                }
            }
        }
        .brandToolbar(Loc.t("nav.watch", lang))
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if let ds = try? await Api.myDevices() {
                devices = ds
                modes = Dictionary(uniqueKeysWithValues: ds.map { ($0.id, $0.record_mode ?? "full") })
            }
        }
    }
}
