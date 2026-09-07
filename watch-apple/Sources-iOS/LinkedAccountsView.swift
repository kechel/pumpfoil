import SwiftUI
import SafariServices

// Verknüpfte Konten (Polar/COROS/Suunto): OAuth im In-App-Safari, Import/Trennen.
// Spiegelt die Web-Seite „Verknüpfte Konten".
//
// ZWEI SACHEN WAREN HIER FALSCH (gefunden am 07.09.2026):
//  * COROS zeigte auf `/api/integrations/coros/…` — das ist der PARTNER-Weg, für den uns der
//    Vertrag fehlt; der Endpunkt meldet `available: false`. COROS war aus der App also nie
//    verbindbar, obwohl es im Web längst läuft. Der funktionierende Weg ist `coros/mcp`.
//  * Die Notiz sagte „COROS ist push-basiert (kein manueller Import)" — genau umgekehrt: der
//    MCP-Weg kann NICHT pushen (nur abholen), während Polar seit 07.09. wirklich pusht.
struct LinkedAccountsView: View {
    @AppStorage("appLang") private var lang = "de"

    // `id` ist der Anzeige-/Zustandsschlüssel, `apiPath` der Pfad beim Server — die beiden
    // unterscheiden sich nur bei COROS (s. Kommentar oben).
    private struct Provider {
        let id: String
        let label: String
        let canSync: Bool
        var apiPath: String? = nil
        var logo: String? = nil
        var pfad: String { apiPath ?? id }
    }
    private let providers = [
        Provider(id: "polar", label: "Polar", canSync: true, logo: "PolarLogo"),
        Provider(id: "coros", label: "COROS", canSync: true, apiPath: "coros/mcp"),
        Provider(id: "suunto", label: "Suunto", canSync: true, logo: "SuuntoLogo"),
    ]

    @State private var status: [String: Api.IntegrationStatus] = [:]
    @State private var busy: String?
    @State private var safariURL: IdentifiedURL?
    @State private var syncMsg: String?

    var body: some View {
        List {
            Section { Text(Loc.t("accounts.sub", lang)).font(.footnote).foregroundStyle(.secondary) }
            ForEach(providers, id: \.id) { p in
                if let st = status[p.id] {
                    if !st.available && !st.linked {
                        row(p.label, sub: Loc.t("accounts.notAvailable", lang), connected: false, logo: p.logo) { EmptyView() }
                    } else {
                        row(p.label,
                            sub: st.linked ? Loc.t(p.id == "coros" ? "accounts.corosNote"
                                                    : (p.id == "polar" ? "accounts.polarNote"
                                                       : "accounts.connected"), lang)
                                           : Loc.t("accounts.sub", lang),
                            connected: st.linked, logo: p.logo) {
                            HStack {
                                if !st.linked {
                                    Button(Loc.t("accounts.connect", lang)) { connect(p) }
                                        .buttonStyle(.borderedProminent).controlSize(.small).disabled(busy != nil)
                                } else {
                                    if p.canSync {
                                        Button(Loc.t("accounts.import", lang)) { sync(p) }
                                            .buttonStyle(.bordered).controlSize(.small).disabled(busy != nil)
                                    }
                                    Button(Loc.t("accounts.disconnect", lang), role: .destructive) { unlink(p) }
                                        .buttonStyle(.bordered).controlSize(.small).disabled(busy != nil)
                                }
                            }
                        }
                        if st.linked { SportAuswahl(pfad: p.pfad, lang: lang) }
                    }
                }
            }
        }
        .brandToolbar(Loc.t("accounts.title", lang))
        .navigationBarTitleDisplayMode(.inline)
        .task { await refresh() }
        .sheet(item: $safariURL) { item in SafariView(url: item.url).ignoresSafeArea() .onDisappear { Task { await refresh() } } }
        .alert(Loc.t("accounts.import", lang), isPresented: Binding(get: { syncMsg != nil }, set: { if !$0 { syncMsg = nil } })) {
            Button("OK", role: .cancel) { syncMsg = nil }
        } message: { Text(syncMsg ?? "") }
    }

    @ViewBuilder private func row(_ title: String, sub: String, connected: Bool, logo: String? = nil, @ViewBuilder actions: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                if let logo { Image(logo).resizable().scaledToFit().frame(height: 20) }
                Text(title).font(.headline)
                if connected { Image(systemName: "checkmark.circle.fill").foregroundStyle(Color.accentColor) }
            }
            Text(sub).font(.caption).foregroundStyle(.secondary)
            actions()
        }
        .padding(.vertical, 2)
    }

    private func refresh() async {
        for p in providers { status[p.id] = try? await Api.integrationStatus(p.pfad) }
    }
    private func connect(_ p: Provider) {
        busy = p.id
        Task {
            if let s = try? await Api.integrationAuthorizeURL(p.pfad), let u = URL(string: s) { safariURL = IdentifiedURL(url: u) }
            busy = nil
        }
    }
    private func sync(_ p: Provider) {
        busy = p.id
        Task {
            do {
                let r = try await Api.integrationSync(p.pfad)
                if let m = r.message, !m.isEmpty {
                    syncMsg = m
                } else {
                    syncMsg = Loc.t("accounts.importResult", lang)
                        .replacingOccurrences(of: "{imported}", with: String(r.imported ?? 0))
                        .replacingOccurrences(of: "{skipped}", with: String(r.skipped ?? 0))
                }
            } catch {
                syncMsg = Loc.t("accounts.importError", lang)
            }
            await refresh(); busy = nil
        }
    }
    private func unlink(_ p: Provider) {
        busy = p.id
        Task { try? await Api.integrationUnlink(p.pfad); await refresh(); busy = nil }
    }
}

// Kein retroaktives URL: Identifiable (Warnung/Fehler bei importiertem Typ) — eigener Wrapper.
struct IdentifiedURL: Identifiable { let url: URL; var id: String { url.absoluteString } }

// SFSafariViewController-Brücke für den OAuth-Flow.
struct SafariView: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> SFSafariViewController { SFSafariViewController(url: url) }
    func updateUIViewController(_ vc: SFSafariViewController, context: Context) {}
}


/// Welche Sportart-Modi eines verknüpften Kontos importiert werden.
///
/// Für Pumpfoil gibt es auf keiner Uhr einen eigenen Modus, also stellen die Leute irgendetwas
/// ein — an unseren eigenen Daten nachgezählt kamen acht Suunto-Sessions als „cycling" herein
/// und waren echtes Pumpfoilen. Eine feste Liste erlaubter Sportarten wäre deshalb ein
/// Verlustgeschäft. Der Server merkt sich, was das Konto tatsächlich liefert; hier kann man
/// abwählen. Neu Auftauchendes ist immer ausgewählt, bis der Nutzer etwas anderes sagt.
///
/// Angezeigt werden nur Modi mit Ortung — ein Hallenmodus wäre hier eine Zeile ohne Sinn.
private struct SportAuswahl: View {
    let pfad: String
    let lang: String
    @State private var sports: [Api.ImportSport] = []
    @State private var geladen = false

    var body: some View {
        Group {
            if geladen {
                VStack(alignment: .leading, spacing: 4) {
                    Text(Loc.t("accounts.sports.title", lang)).font(.subheadline.weight(.semibold))
                    Text(Loc.t("accounts.sports.hint", lang)).font(.caption).foregroundStyle(.secondary)
                    if sports.isEmpty {
                        Text(Loc.t("accounts.sports.none", lang)).font(.caption).foregroundStyle(.secondary)
                    } else {
                        ForEach(sports) { sp in
                            Toggle(isOn: Binding(
                                get: { sp.importieren },
                                set: { neu in umschalten(sp.sport_key, neu) }
                            )) {
                                HStack(spacing: 6) {
                                    Text(sp.label)
                                    Text("(\(sp.gesehen)×)").foregroundStyle(.secondary)
                                }
                                .font(.callout)
                            }
                            .toggleStyle(.switch)
                        }
                    }
                }
                .padding(.top, 6)
            }
        }
        .task {
            sports = (try? await Api.importSports(pfad)) ?? []
            geladen = true
        }
    }

    private func umschalten(_ key: String, _ an: Bool) {
        // Erst anzeigen, dann speichern — ein Schalter soll sofort reagieren.
        if let i = sports.firstIndex(where: { $0.sport_key == key }) {
            let alt = sports[i]
            sports[i] = Api.ImportSport(sport_key: alt.sport_key, label: alt.label,
                                        importieren: an, gesehen: alt.gesehen)
        }
        Task {
            if let neu = try? await Api.setImportSports(pfad, [key: an]) { sports = neu }
        }
    }
}
