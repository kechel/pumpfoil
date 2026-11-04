import SwiftUI

// „Team gruenden" nativ (App-Port, 04.11.2026) wie die Karte in web/src/pages/Teams.tsx: Name, Adresse aus dem Namen
// vorgeschlagen (solange man sie nicht selbst aendert), selbst gewaehlte Adresse geprueft, Fehler als `team.err.<code>`.
// Danach geht es direkt in die Grundeinstellungen des neuen Teams (web: /teams/<slug>/einstellungen). Bisher oeffnete
// die Karte nur das Web. Steht unter Einstellungen › Team (unter der Teamsuche) und auf Home › Team ohne eigenes Team.
struct TeamGruendenKarte: View {
    let lang: String
    @State private var name = ""
    @State private var slug = ""
    @State private var slugAnders = false
    @State private var slugFehler: String?
    @State private var busy = false
    @State private var fehler: String?
    @State private var neuSlug: String?
    @State private var zeigeNeu = false

    private var nameOk: Bool { name.trimmingCharacters(in: .whitespaces).count >= 3 }
    private var hinweis: String { slugFehler.map { Loc.t("team.err." + $0, lang) } ?? Loc.t("team.adresseHinweis", lang) }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(Loc.t("team.gruenden", lang)).font(.subheadline.weight(.semibold))
            Text(Loc.t("team.gruendenHinweis", lang)).font(.footnote).foregroundStyle(.secondary)
            Text(Loc.t("team.name", lang)).font(.footnote).padding(.top, 4)
            TextField("", text: $name)
                .textFieldStyle(.roundedBorder)
                .onChange(of: name) { n in if n.count > 60 { name = String(n.prefix(60)) } }
            Text(Loc.t("team.adresse", lang)).font(.footnote).padding(.top, 4)
            TeamAdressFeld(slug: $slug) { slugAnders = true }
            Text(hinweis).font(.caption).foregroundStyle(slugFehler == nil ? Color.secondary : Color.orange)
            if let f = fehler { Text(f).font(.subheadline).foregroundStyle(.red) }
            TeamKnopf(titel: Loc.t("team.gruendenKnopf", lang), farbe: nil, deaktiviert: busy || !nameOk || slugFehler != nil) {
                Task { await gruenden() }
            }
            .padding(.top, 4)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(.secondarySystemBackground)))
        // Vorschlag aus dem Namen bzw. Pruefung der eigenen Adresse, je 300 ms nach der letzten Eingabe (wie im Web).
        .task(id: name) { await vorschlagen() }
        .task(id: slug) { await pruefen() }
        .navigationDestination(isPresented: $zeigeNeu) {
            if let s = neuSlug { TeamVerwaltungView(slug: s, start: "einstellungen") }
        }
    }

    private func vorschlagen() async {
        guard !slugAnders, nameOk else { return }
        try? await Task.sleep(nanoseconds: 300_000_000)
        if Task.isCancelled { return }
        if let r = try? await Api.teamSlug(name: name) { slug = r.slug; slugFehler = nil; slugAnders = false }
    }

    private func pruefen() async {
        guard slugAnders, !slug.isEmpty else { return }
        try? await Task.sleep(nanoseconds: 300_000_000)
        if Task.isCancelled { return }
        if let r = try? await Api.teamSlug(slug: slug) { slugFehler = r.fehler }
    }

    private func gruenden() async {
        busy = true
        fehler = nil
        defer { busy = false }
        do {
            let r = try await Api.teamAnlegen(name: name.trimmingCharacters(in: .whitespaces), slug: slug.isEmpty ? nil : slug)
            name = ""; slug = ""; slugAnders = false; slugFehler = nil
            neuSlug = r.slug
            zeigeNeu = true
        } catch {
            fehler = Api.teamFehlerText(error, lang)
        }
    }
}

/// Adresse „pumpfoil.org/teams/<slug>": nur a–z, 0–9 und Bindestrich, hoechstens 40 Zeichen (wie im Web).
/// `geaendert` meldet eine Eingabe des Nutzers (nicht den Vorschlag).
struct TeamAdressFeld: View {
    @Binding var slug: String
    var geaendert: () -> Void = {}

    var body: some View {
        HStack(spacing: 0) {
            Text("pumpfoil.org/teams/").font(.subheadline).foregroundStyle(.secondary)
            TextField("", text: Binding(get: { slug }, set: { neu in
                let erlaubt = Set("abcdefghijklmnopqrstuvwxyz0123456789-")
                let s = String(neu.lowercased().filter { erlaubt.contains($0) }.prefix(40))
                if s != slug { slug = s; geaendert() }
            }))
            .font(.subheadline)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
        }
        .padding(.horizontal, 8).padding(.vertical, 7)
        .background(RoundedRectangle(cornerRadius: 6).fill(Color(.systemBackground)))
        .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color.secondary.opacity(0.3), lineWidth: 1))
    }
}
