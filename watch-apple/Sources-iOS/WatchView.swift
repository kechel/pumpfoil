import SwiftUI

// Uhren-Bereich (wie die PWA /account „Uhr"): Apple-Watch-Status + Garmin/Wear-Kopplung +
// On-Foil-Alarm + Datenseiten gebündelt. Die Profil-Übersicht zeigt nur EINEN „Uhr"-Eintrag.
struct WatchView: View {
    @EnvironmentObject var sync: SyncManager
    @AppStorage("appLang") private var lang = "de"

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
        .navigationTitle(Loc.t("nav.watch", lang))
        .navigationBarTitleDisplayMode(.inline)
    }
}
