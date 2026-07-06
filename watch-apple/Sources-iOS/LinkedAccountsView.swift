import SwiftUI
import SafariServices

// Verknüpfte Konten (Polar/COROS/Suunto): OAuth im In-App-Safari, Import/Trennen.
// Spiegelt die Web-Seite „Verknüpfte Konten". COROS ist push-basiert (kein manueller Import).
struct LinkedAccountsView: View {
    @AppStorage("appLang") private var lang = "de"

    private struct Provider { let id: String; let label: String; let canSync: Bool }
    private let providers = [
        Provider(id: "polar", label: "Polar", canSync: true),
        Provider(id: "coros", label: "COROS", canSync: false),
        Provider(id: "suunto", label: "Suunto", canSync: true),
    ]

    @State private var status: [String: Api.IntegrationStatus] = [:]
    @State private var busy: String?
    @State private var safariURL: URL?
    @State private var syncMsg: String?

    var body: some View {
        List {
            Section { Text(Loc.t("accounts.sub", lang)).font(.footnote).foregroundStyle(.secondary) }
            ForEach(providers, id: \.id) { p in
                if let st = status[p.id] {
                    if !st.available && !st.linked {
                        row(p.label, sub: Loc.t("accounts.notAvailable", lang), connected: false) { EmptyView() }
                    } else {
                        row(p.label,
                            sub: st.linked ? (p.id == "coros" ? Loc.t("accounts.corosNote", lang) : Loc.t("accounts.connected", lang)) : Loc.t("accounts.sub", lang),
                            connected: st.linked) {
                            HStack {
                                if !st.linked {
                                    Button(Loc.t("accounts.connect", lang)) { connect(p.id) }
                                        .buttonStyle(.borderedProminent).controlSize(.small).disabled(busy != nil)
                                } else {
                                    if p.canSync {
                                        Button(Loc.t("accounts.import", lang)) { sync(p.id) }
                                            .buttonStyle(.bordered).controlSize(.small).disabled(busy != nil)
                                    }
                                    Button(Loc.t("accounts.disconnect", lang), role: .destructive) { unlink(p.id) }
                                        .buttonStyle(.bordered).controlSize(.small).disabled(busy != nil)
                                }
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle(Loc.t("accounts.title", lang))
        .navigationBarTitleDisplayMode(.inline)
        .task { await refresh() }
        .sheet(item: $safariURL) { url in SafariView(url: url).ignoresSafeArea() .onDisappear { Task { await refresh() } } }
        .alert(Loc.t("accounts.import", lang), isPresented: Binding(get: { syncMsg != nil }, set: { if !$0 { syncMsg = nil } })) {
            Button("OK", role: .cancel) { syncMsg = nil }
        } message: { Text(syncMsg ?? "") }
    }

    @ViewBuilder private func row(_ title: String, sub: String, connected: Bool, @ViewBuilder actions: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(title).font(.headline)
                if connected { Image(systemName: "checkmark.circle.fill").foregroundStyle(Color.accentColor) }
            }
            Text(sub).font(.caption).foregroundStyle(.secondary)
            actions()
        }
        .padding(.vertical, 2)
    }

    private func refresh() async {
        for p in providers { status[p.id] = try? await Api.integrationStatus(p.id) }
    }
    private func connect(_ id: String) {
        busy = id
        Task {
            if let s = try? await Api.integrationAuthorizeURL(id), let u = URL(string: s) { safariURL = u }
            busy = nil
        }
    }
    private func sync(_ id: String) {
        busy = id
        Task {
            do {
                let r = try await Api.integrationSync(id)
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
    private func unlink(_ id: String) {
        busy = id; Task { try? await Api.integrationUnlink(id); await refresh(); busy = nil }
    }
}

extension URL: Identifiable { public var id: String { absoluteString } }

// SFSafariViewController-Brücke für den OAuth-Flow.
struct SafariView: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> SFSafariViewController { SFSafariViewController(url: url) }
    func updateUIViewController(_ vc: SFSafariViewController, context: Context) {}
}
