import SwiftUI

// Freunde (Jan, 15.10.2026), portiert aus der PWA (web/src/pages/Friends.tsx +
// components/Freundschaft.tsx). Der Dialog sagt WOERTLICH, was Freunde sehen — einen Schalter
// dafuer gibt es bewusst nicht. Was der Server freigibt, regelt server/app/freunde.py; die App
// entscheidet nichts, sie zeigt nur den Stand.

enum FreundArt { case anfragen, annehmen, beenden, zurueckziehen }

/// Gruen fuer „pumpt gerade", wie die PWA (emerald).
private func freundGruen(_ schema: ColorScheme) -> Color {
    schema == .dark ? Color(red: 0.204, green: 0.827, blue: 0.600) : Color(red: 0.016, green: 0.471, blue: 0.341)
}

/// Kleines „neu"-Abzeichen, wie `NewBadge` in der PWA.
struct NeuBadge: View {
    @AppStorage("appLang") private var lang = "de"
    @Environment(\.colorScheme) private var schema
    var body: some View {
        let g: Color = freundGruen(schema)
        Text(Loc.t("badge.new", lang).uppercased())
            .font(.caption2.weight(.semibold))
            .foregroundStyle(g)
            .padding(.horizontal, 6).padding(.vertical, 1)
            .background(Capsule().fill(g.opacity(0.15)))
    }
}

/// Titel, Text und Knoepfe des Bestaetigungsdialogs — eine Quelle fuer Foiler- und Freunde-Seite.
private struct FreundDialogTexte {
    let titel: String
    let text: String
    let ja: String
    let rot: Bool

    init(_ art: FreundArt, name: String, lang: String) {
        switch art {
        case .anfragen:
            titel = Loc.t("friends.request", lang)
            text = Loc.t("friends.termsTitle", lang) + "\n\n" + Loc.t("friends.terms", lang)
            ja = Loc.t("friends.requestConfirm", lang); rot = false
        case .annehmen:
            titel = Loc.t("friends.incomingFrom", lang).replacingOccurrences(of: "{name}", with: name)
            text = Loc.t("friends.termsTitle", lang) + "\n\n" + Loc.t("friends.terms", lang)
            ja = Loc.t("friends.accept", lang); rot = false
        case .beenden:
            titel = Loc.t("friends.remove", lang)
            text = Loc.t("friends.removeConfirm", lang).replacingOccurrences(of: "{name}", with: name)
            ja = Loc.t("friends.remove", lang); rot = true
        case .zurueckziehen:
            titel = Loc.t("friends.withdraw", lang)
            text = Loc.t("friends.withdrawConfirm", lang).replacingOccurrences(of: "{name}", with: name)
            ja = Loc.t("friends.withdraw", lang); rot = true
        }
    }
}

/// Offener Dialog: welche Art, fuer wen.
struct FreundDialog: Identifiable {
    let art: FreundArt
    let userId: Int
    let name: String
    var id: String { "\(userId)-\(art)" }
}

extension View {
    /// Der Bestaetigungsdialog. `ausfuehren` bekommt die Aktion, die der Nutzer gewaehlt hat.
    func freundschaftDialog(_ offen: Binding<FreundDialog?>, lang: String,
                            ausfuehren: @escaping (FreundDialog, _ ablehnen: Bool) -> Void) -> some View {
        let d: FreundDialog? = offen.wrappedValue
        let t: FreundDialogTexte? = d.map { FreundDialogTexte($0.art, name: $0.name, lang: lang) }
        return alert(t?.titel ?? "", isPresented: Binding(get: { offen.wrappedValue != nil },
                                                         set: { if !$0 { offen.wrappedValue = nil } }),
                     presenting: d) { dd in
            Button(t?.ja ?? "", role: (t?.rot ?? false) ? .destructive : nil) { ausfuehren(dd, false) }
            if dd.art == .annehmen {
                Button(Loc.t("friends.decline", lang)) { ausfuehren(dd, true) }
            }
            Button(Loc.t("common.cancel", lang), role: .cancel) {}
        } message: { _ in
            Text(t?.text ?? "")
        }
    }
}

/// Die Server-Aktion zu einer Dialog-Wahl. Gibt den neuen Stand zurueck.
func freundAktion(_ d: FreundDialog, ablehnen: Bool) async throws -> String? {
    if ablehnen { return try await Api.friendDecline(d.userId) }
    switch d.art {
    case .anfragen: return try await Api.friendRequest(d.userId)
    case .annehmen: return try await Api.friendAccept(d.userId)
    case .beenden, .zurueckziehen: return try await Api.friendRemove(d.userId)
    }
}

/// Knopf fuer die Foiler-Seite: zeigt den Stand und oeffnet den passenden Dialog.
struct FreundschaftKnopf: View {
    let userId: Int
    let name: String
    let status: String?
    let onChange: (String?) -> Void
    @AppStorage("appLang") private var lang = "de"
    @State private var offen: FreundDialog?
    @State private var busy = false

    private var art: FreundArt {
        switch status {
        case "freund": return .beenden
        case "angefragt": return .zurueckziehen
        case "eingehend": return .annehmen
        default: return .anfragen
        }
    }
    private var label: String {
        switch status {
        case "freund": return Loc.t("friends.isFriend", lang)
        case "angefragt": return Loc.t("friends.requested", lang)
        case "eingehend": return Loc.t("friends.accept", lang)
        default: return Loc.t("friends.request", lang)
        }
    }

    var body: some View {
        knopf
            .disabled(busy)
            .freundschaftDialog($offen, lang: lang) { d, ablehnen in
                busy = true
                Task {
                    do { onChange(try await freundAktion(d, ablehnen: ablehnen)) } catch {}
                    busy = false
                }
            }
    }

    @ViewBuilder private var knopf: some View {
        let tippen = { offen = FreundDialog(art: art, userId: userId, name: name) }
        if status == nil || status == "eingehend" {
            Button(action: tippen) { Label(label, systemImage: "person.badge.plus") }
                .buttonStyle(.borderedProminent)
        } else {
            Button(action: tippen) { Label(label, systemImage: status == "freund" ? "person.2.fill" : "clock") }
                .buttonStyle(.bordered)
        }
    }
}

/// Freunde verwalten: wer gerade pumpt, Anfragen an mich, meine Freunde, meine offenen Anfragen.
/// Angefragt wird auf der Foiler-Seite des anderen, nicht hier.
struct FreundeView: View {
    @AppStorage("appLang") private var lang = "de"
    @Environment(\.colorScheme) private var schema
    @State private var d: FreundeListe?
    @State private var offen: FreundDialog?
    @State private var foiler: FoilerZiel?

    struct FoilerZiel: Identifiable { let id: Int }

    var body: some View {
        inhalt
            .navigationTitle(Loc.t("friends.title", lang))
            .navigationBarTitleDisplayMode(.inline)
            .task { await laden() }
            .refreshable { await laden() }
            .sheet(item: $foiler) { z in FoilerSheet(userId: z.id) }
            .freundschaftDialog($offen, lang: lang) { dd, ablehnen in
                Task {
                    _ = try? await freundAktion(dd, ablehnen: ablehnen)
                    await laden()
                }
            }
    }

    // Drei Zustaende — ohne sichtbaren Ladezustand liefe `.task` nie (swiftui-leere-group-laedt-nicht).
    @ViewBuilder private var inhalt: some View {
        if let d {
            liste(d)
        } else {
            ProgressView(Loc.t("common.loading", lang))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func liste(_ l: FreundeListe) -> some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 6) {
                    Text(Loc.t("friends.termsTitle", lang)).font(.subheadline.weight(.semibold))
                    Text(Loc.t("friends.terms", lang)).font(.subheadline)
                    Text(Loc.t("friends.howTo", lang)).font(.subheadline).foregroundStyle(.secondary)
                }
                .padding(.vertical, 4)
            }
            aktivSection(l)
            eingehendSection(l)
            freundeSection(l)
            ausgehendSection(l)
        }
        .listStyle(.insetGrouped)
    }

    @ViewBuilder private func aktivSection(_ l: FreundeListe) -> some View {
        if !l.aktiv.isEmpty {
            Section(Loc.t("friends.pumpingNowTitle", lang)) {
                ForEach(l.aktiv) { f in
                    zeile(f) {
                        let g: Color = freundGruen(schema)
                        if let spot = f.spot {
                            NavigationLink {
                                SpotSessionsView(spot: spot, vorgegebeneSpotId: f.spot_id)
                            } label: {
                                Label(spot, systemImage: "mappin.and.ellipse").font(.subheadline).foregroundStyle(g)
                            }
                        } else {
                            Text(Loc.t("friends.pumpingNow", lang)).font(.subheadline).foregroundStyle(g)
                        }
                    } aktion: { EmptyView() }
                }
            }
        }
    }

    @ViewBuilder private func eingehendSection(_ l: FreundeListe) -> some View {
        if !l.eingehend.isEmpty {
            Section {
                ForEach(l.eingehend) { f in
                    zeile(f) { unterText(f.am.map { datum($0) }) } aktion: {
                        // Ablehnen direkt und still (Jan, 16.10.2026) — der andere erfaehrt es nicht.
                        Button(Loc.t("friends.decline", lang)) {
                            Task {
                                _ = try? await Api.friendDecline(f.user_id)
                                await laden()
                            }
                        }
                        .buttonStyle(.bordered)
                        Button(Loc.t("friends.accept", lang)) {
                            offen = FreundDialog(art: .annehmen, userId: f.user_id, name: f.name ?? "—")
                        }
                        .buttonStyle(.borderedProminent)
                    }
                }
            } header: {
                Text(Loc.t("friends.incoming", lang))
            } footer: {
                Text(Loc.t("friends.declineSilent", lang))
            }
        }
    }

    private func freundeSection(_ l: FreundeListe) -> some View {
        let titel: String = Loc.t("friends.list", lang) + (l.freunde.isEmpty ? "" : " (\(l.freunde.count))")
        return Section(titel) {
            if l.freunde.isEmpty {
                Text(Loc.t("friends.none", lang)).font(.subheadline).foregroundStyle(.secondary)
            }
            ForEach(l.freunde) { f in
                let seit: String? = f.seit.map { Loc.t("friends.since", lang).replacingOccurrences(of: "{date}", with: datum($0)) }
                zeile(f) { unterText(seit) } aktion: {
                    Button(Loc.t("friends.remove", lang), role: .destructive) {
                        offen = FreundDialog(art: .beenden, userId: f.user_id, name: f.name ?? "—")
                    }
                    .buttonStyle(.bordered)
                }
            }
        }
    }

    @ViewBuilder private func ausgehendSection(_ l: FreundeListe) -> some View {
        if !l.ausgehend.isEmpty {
            Section(Loc.t("friends.outgoing", lang)) {
                ForEach(l.ausgehend) { f in
                    zeile(f) { unterText(f.am.map { datum($0) }) } aktion: {
                        Button(Loc.t("friends.withdraw", lang)) {
                            offen = FreundDialog(art: .zurueckziehen, userId: f.user_id, name: f.name ?? "—")
                        }
                        .buttonStyle(.bordered)
                    }
                }
            }
        }
    }

    @ViewBuilder private func unterText(_ s: String?) -> some View {
        if let s { Text(s).font(.subheadline).foregroundStyle(.secondary) }
    }

    // Mehrere Knoepfe in einer Listenzeile: jeder braucht einen eigenen Button-Stil, sonst loest
    // ein Tipp irgendwo in der Zeile ALLE aus (Memory swiftui-listenzeile-mehrere-knoepfe).
    private func zeile<U: View, A: View>(_ f: FreundKurz, @ViewBuilder unter: () -> U,
                                         @ViewBuilder aktion: () -> A) -> some View {
        HStack(spacing: 10) {
            AvatarView(name: f.name, url: Api.mediaURL(f.avatar_url), size: 36, userId: f.user_id, link: false)
            VStack(alignment: .leading, spacing: 2) {
                Button { foiler = FoilerZiel(id: f.user_id) } label: {
                    Text(f.name ?? "—").font(.body.weight(.semibold)).lineLimit(1).foregroundStyle(.primary)
                }
                .buttonStyle(.borderless)
                unter()
            }
            Spacer(minLength: 8)
            aktion()
        }
        .padding(.vertical, 2)
    }

    /// Datum in der PROFILSPRACHE (wie die Foiler-Seite). Nur der Tag zaehlt — der Server schickt
    /// Mikrosekunden, die ISO8601DateFormatter nicht ueberall liest.
    private func datum(_ iso: String) -> String {
        let ein = DateFormatter()
        ein.locale = Locale(identifier: "en_US_POSIX")
        ein.dateFormat = "yyyy-MM-dd"
        guard let d = ein.date(from: String(iso.prefix(10))) else { return String(iso.prefix(10)) }
        let aus = DateFormatter()
        aus.locale = Locale(identifier: lang == "gsw" ? "de-CH" : lang)
        aus.dateStyle = .long
        aus.timeStyle = .none
        return aus.string(from: d)
    }

    private func laden() async {
        d = (try? await Api.friends()) ?? d ?? FreundeListe()
    }
}

/// Eintrag „Freunde verwalten" im Profil (Jan, 15.10.2026: „zwischen verknuepfte Konten und meine
/// foils und ein 'neu' Badge mit dran"). Die Zahl zaehlt offene Anfragen an mich; sie wird bei
/// jedem Erscheinen neu geholt (nach Annehmen/Ablehnen stimmt sie sonst nicht mehr).
struct FreundeZeile: View {
    @AppStorage("appLang") private var lang = "de"
    @State private var anfragen = 0

    var body: some View {
        NavigationLink { FreundeView() } label: { label }
            .onAppear { Task { anfragen = (try? await Api.friendsCount()) ?? anfragen } }
    }

    private var label: some View {
        Label {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(Loc.t("friends.manage", lang))
                    NeuBadge()
                    if anfragen > 0 {
                        Text("\(anfragen)").font(.caption2.bold()).foregroundStyle(.white)
                            .padding(.horizontal, 6).padding(.vertical, 1)
                            .background(Capsule().fill(Color.accentColor))
                    }
                }
                Text(Loc.t("friends.profileHint", lang)).font(.caption).foregroundStyle(.secondary)
            }
        } icon: { Image(systemName: "person.2").foregroundStyle(Color.accentColor) }
    }
}

/// Unter der Begruessung auf der Startseite: welche meiner Freunde gerade wo pumpen (Jan,
/// 15.10.2026: „wenn es mehr als 3 sind dann nur noch x Friends currently pumping und bei klick
/// dann darunter oeffnen"). Nichts da -> nichts gezeigt (Hoehe 0). Alle zwei Minuten neu, wie die
/// Spot-Karte. Wer zaehlt und welcher Spot, entscheidet der Server (app/freunde.py).
struct FreundePumpenZeile: View {
    @AppStorage("appLang") private var lang = "de"
    @Environment(\.colorScheme) private var schema
    @State private var aktiv: [FreundKurz] = []
    @State private var offen = false
    @State private var foiler: FreundeView.FoilerZiel?
    private let bisEinzeln = 3

    var body: some View {
        inhalt
            .task {
                while !Task.isCancelled {
                    if let r = try? await Api.friendsActive() { aktiv = r }
                    try? await Task.sleep(nanoseconds: 120_000_000_000)
                }
            }
            .sheet(item: $foiler) { z in FoilerSheet(userId: z.id) }
            .padding(.top, aktiv.isEmpty ? 0 : 8)
    }

    @ViewBuilder private var inhalt: some View {
        let g: Color = freundGruen(schema)
        if aktiv.isEmpty {
            Color.clear.frame(height: 0)
        } else if aktiv.count <= bisEinzeln {
            VStack(alignment: .leading, spacing: 4) {
                ForEach(aktiv) { f in
                    HStack(spacing: 6) {
                        Circle().fill(g).frame(width: 8, height: 8)
                        eintrag(f, g)
                    }
                }
            }
        } else {
            VStack(alignment: .leading, spacing: 6) {
                Button { withAnimation { offen.toggle() } } label: {
                    HStack(spacing: 6) {
                        Circle().fill(g).frame(width: 8, height: 8)
                        Text(Loc.t("friends.nPumping", lang).replacingOccurrences(of: "{n}", with: "\(aktiv.count)"))
                            .font(.subheadline.weight(.semibold))
                        Image(systemName: offen ? "chevron.up" : "chevron.down").font(.caption)
                    }
                    .foregroundStyle(g)
                    .padding(.horizontal, 10).padding(.vertical, 4)
                    .background(Capsule().fill(g.opacity(0.12)))
                }
                .buttonStyle(.plain)
                if offen {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(aktiv) { f in eintrag(f, g) }
                    }
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: 10).fill(g.opacity(0.06)))
                }
            }
        }
    }

    /// „Anna @ Illmensee": der Name oeffnet die Foiler-Seite, der Spot die Spot-Sessions.
    private func eintrag(_ f: FreundKurz, _ g: Color) -> some View {
        HStack(spacing: 4) {
            Button { foiler = FreundeView.FoilerZiel(id: f.user_id) } label: {
                Text(f.name ?? "—").font(.subheadline.weight(.semibold))
            }
            .buttonStyle(.plain)
            if let spot = f.spot {
                Text("@").font(.subheadline)
                NavigationLink {
                    SpotSessionsView(spot: spot, vorgegebeneSpotId: f.spot_id)
                } label: {
                    Text(spot).font(.subheadline)
                }
                .buttonStyle(.plain)
            }
        }
        .foregroundStyle(g)
    }
}

/// Anfragen an mich, ganz oben auf der Startseite (Jan, 16.10.2026: „sollte vermutlich auch in meinem
/// home gleich ganz oben mit auftauchen"). Annehmen oeffnet den Dialog mit dem Wortlaut, Ablehnen geht
/// sofort und still — der andere erfaehrt es nicht. Wie FreundesAnfragen in web/src/components/Freundschaft.tsx.
/// Steht in einem ScrollView (keine List), daher teilen sich die Knoepfe keine Tippflaeche.
struct FreundesAnfragenKarte: View {
    @AppStorage("appLang") private var lang = "de"
    @State private var liste: [FreundKurz] = []
    @State private var offen: FreundDialog?
    @State private var foiler: FreundeView.FoilerZiel?

    var body: some View {
        inhalt
            .task { await laden() }
            .sheet(item: $foiler) { z in FoilerSheet(userId: z.id) }
            .freundschaftDialog($offen, lang: lang) { dd, ablehnen in
                Task {
                    _ = try? await freundAktion(dd, ablehnen: ablehnen)
                    await laden()
                }
            }
            .padding(.top, liste.isEmpty ? 0 : 8)
    }

    private func laden() async {
        guard let n = try? await Api.friendsCount() else { return }
        if n == 0 { liste = []; return }
        if let l = try? await Api.friends() { liste = l.eingehend }
    }

    // Leer: eine Zeile der Hoehe 0, sonst liefe `.task` nie (swiftui-leere-group-laedt-nicht).
    @ViewBuilder private var inhalt: some View {
        if liste.isEmpty {
            Color.clear.frame(height: 0)
        } else {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(liste) { f in eintrag(f) }
                Text(Loc.t("friends.declineSilent", lang)).font(.footnote).foregroundStyle(.secondary)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 12).fill(Color.accentColor.opacity(0.12)))
        }
    }

    private func eintrag(_ f: FreundKurz) -> some View {
        let name: String = f.name ?? "—"
        let text: String = Loc.t("friends.incomingFrom", lang).replacingOccurrences(of: "{name}", with: name)
        return VStack(alignment: .leading, spacing: 6) {
            Button { foiler = FreundeView.FoilerZiel(id: f.user_id) } label: {
                Text(text).font(.subheadline.weight(.semibold)).foregroundStyle(.primary)
                    .multilineTextAlignment(.leading)
            }
            .buttonStyle(.plain)
            HStack(spacing: 8) {
                Spacer()
                Button(Loc.t("friends.decline", lang)) {
                    Task {
                        _ = try? await Api.friendDecline(f.user_id)
                        await laden()
                    }
                }
                .buttonStyle(.bordered)
                Button(Loc.t("friends.accept", lang)) {
                    offen = FreundDialog(art: .annehmen, userId: f.user_id, name: name)
                }
                .buttonStyle(.borderedProminent)
            }
        }
    }
}
