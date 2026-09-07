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
    // Stand des laufenden Imports (nur einer zur Zeit, `busy` sagt welcher).
    @State private var stand: Api.SyncStand?
    // Zaehlt fertige Importe. Die Sportart-Liste haengt daran und holt sich neu — sonst
    // erschiene ein beim Import NEU entdeckter Modus erst nach einem Neustart der App.
    @State private var fertigZaehler = 0

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
                        if busy == p.id, let stand, stand.laeuft { balken(stand) }
                        // Nur COROS: welchen Modus man auf der Uhr waehlt, und was der Export
                        // NICHT liefert. Pumpfoil gibt es auf keiner COROS-Uhr als Sportart.
                        if p.id == "coros" && st.linked {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(Loc.t("accounts.coros.best", lang))
                                Text(Loc.t("accounts.coros.limit", lang))
                            }
                            .font(.caption).foregroundStyle(.secondary)
                            .padding(.top, 6)
                        }
                        if st.linked {
                            SportAuswahl(pfad: p.pfad, lang: lang, neuLaden: fertigZaehler)
                        }
                    }
                }
            }
            XiaomiHinweis(lang: lang)
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
    /// Balken samt „x von y Trainings" — dasselbe Bild wie in der PWA.
    @ViewBuilder private func balken(_ st: Api.SyncStand) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            if st.gesamt > 0 {
                ProgressView(value: Double(st.fertig), total: Double(st.gesamt))
                Text(Loc.t("accounts.sync.progress", lang)
                        .replacingOccurrences(of: "{fertig}", with: String(st.fertig))
                        .replacingOccurrences(of: "{gesamt}", with: String(st.gesamt)))
                    .font(.caption).foregroundStyle(.secondary)
            } else {
                ProgressView()
                if let s = st.schritt, !s.isEmpty {
                    Text(s).font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .padding(.top, 6)
    }

    /// Der Import laeuft serverseitig im Hintergrund weiter, nachdem `POST /sync` zurueckkam
    /// (sonst laeuft der Proxy in den Timeout — im Web gab es dafuer am 07.09.2026 einen
    /// „502 Proxy Error", waehrend der Import in Ruhe durchlief). Der Aufruf stoesst also nur an;
    /// hier wird der Stand abgefragt, bis er fertig ist.
    private func sync(_ p: Provider) {
        busy = p.id
        stand = Api.SyncStand(laeuft: true, gesamt: 0, fertig: 0, schritt: nil, daten: nil)
        Task {
            do {
                _ = try await Api.integrationSync(p.pfad)
                var letzter: Api.SyncStand?
                while true {
                    let st = try await Api.syncProgress(p.pfad)
                    letzter = st
                    if !st.laeuft { break }
                    stand = st
                    try await Task.sleep(nanoseconds: 1_500_000_000)
                }
                syncMsg = ergebnisText(letzter)
            } catch {
                syncMsg = Loc.t("accounts.importError", lang)
            }
            stand = nil
            fertigZaehler += 1
            await refresh(); busy = nil
        }
    }

    /// Der Schlusssatz. Vorher zeigte die App die ROHE englische Servermeldung
    /// („no new exercises") — genau das hat Jan am 07.09.2026 im Web gemeldet.
    /// Codes stammen aus `suunto._grund_code`; unbekannte werden weggelassen statt roh gezeigt.
    private func ergebnisText(_ st: Api.SyncStand?) -> String {
        let d = st?.daten
        // Zaehlt der Server die Gruende mit (Suunto), sind sie aussagekraeftiger als eine nackte
        // „uebersprungen"-Zahl: „3 zu kurz" sagt, was zu tun ist, „3 uebersprungen" nicht.
        // Codes aus `suunto._grund_code`; unbekannte werden weggelassen statt roh gezeigt.
        let bekannt = [("kein_gps", "noGps"), ("doppelt", "dupe"), ("zu_kurz", "tooShort"),
                       ("gefiltert", "filtered"), ("spaeter", "later"), ("fehler", "error")]
        let gruende = bekannt.compactMap { code, key -> String? in
            guard let n = d?.reasons?[code], n > 0 else { return nil }
            return Loc.t("accounts.sync.why." + key, lang)
                .replacingOccurrences(of: "{n}", with: String(n))
        }
        if !gruende.isEmpty {
            var teile: [String] = []
            if let n = d?.imported, n > 0 {
                teile.append(Loc.t("accounts.sync.imported", lang)
                                .replacingOccurrences(of: "{n}", with: String(n)))
            }
            teile.append(contentsOf: gruende)
            return teile.joined(separator: " \u{00b7} ")
        }
        // Ohne Gruende beide Zahlen nennen — bei COROS sind die uebersprungenen die schon
        // vorhandenen Trainings, und „9 importiert" allein liesse offen, was mit den anderen war.
        let imp = d?.imported ?? 0, skip = d?.skipped ?? 0
        if imp > 0 || skip > 0 {
            return Loc.t("accounts.importResult", lang)
                .replacingOccurrences(of: "{imported}", with: String(imp))
                .replacingOccurrences(of: "{skipped}", with: String(skip))
        }
        return Loc.t("accounts.sync.nothingNew", lang)
    }
    private func unlink(_ p: Provider) {
        busy = p.id
        Task { try? await Api.integrationUnlink(p.pfad); await refresh(); busy = nil }
    }
}

/// Xiaomi/Redmi haben keine eigene Schnittstelle fuer uns (Xiaomis Health-Cloud ist nur fuer
/// Partner offen, und eine App auf der Uhr laesst Xiaomi nicht zu). Der Umweg ist aber offiziell:
/// Xiaomi und Suunto haben ihre Apps 2024 miteinander verbunden, weltweit ausser China. Deshalb
/// steht hier eine Anleitung und keine Xiaomi-Verknuepfung — Spiegel der PWA (`db914137`).
private struct XiaomiHinweis: View {
    let lang: String
    var body: some View {
        Section {
            VStack(alignment: .leading, spacing: 6) {
                Text(Loc.t("accounts.xiaomi.hint", lang)).font(.footnote)
                // Ein Parameter statt `{ i, key in }` — beides ist gueltig (mit `-typecheck`
                // nachgeprueft, Swift zerlegt ein Tupel-Argument durchaus in zwei Parameter,
                // wie es `FeedbackView.anhangBereich` seit dem Release auch tut).
                ForEach(Array(["accounts.xiaomi.step1", "accounts.xiaomi.step2",
                               "accounts.xiaomi.step3"].enumerated()), id: \.offset) { schritt in
                    HStack(alignment: .top, spacing: 6) {
                        Text("\(schritt.offset + 1).").font(.footnote.weight(.semibold))
                        Text(Loc.t(schritt.element, lang)).font(.footnote)
                    }
                }
                Text(Loc.t("accounts.xiaomi.note", lang)).font(.caption).foregroundStyle(.secondary)
            }
            .padding(.vertical, 2)
        } header: {
            Text(Loc.t("accounts.xiaomi.title", lang))
        }
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
    /// Wird nach jedem fertigen Import hochgezaehlt; die Liste holt sich dann neu, damit ein
    /// dabei NEU entdeckter Modus sofort erscheint.
    let neuLaden: Int
    @State private var sports: [Api.ImportSport] = []
    @State private var geladen = false

    var body: some View {
        Group {
            // ACHTUNG: der Ladehinweis ist keine Kosmetik. Eine View, die im Ausgangszustand
            // NICHTS ausgibt, fuehrt ihren `.task` nicht aus — am 07.09.2026 an zwei Ansichten
            // belegt (SpotRecordsView, SpotNotesView). Ohne diesen Zweig lud die Liste nie.
            if !geladen {
                Text(Loc.t("common.loading", lang)).font(.caption).foregroundStyle(.secondary)
            } else {
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
        .task(id: neuLaden) {
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
