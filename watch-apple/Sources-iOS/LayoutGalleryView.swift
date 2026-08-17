import SwiftUI

// Community-Galerie der Uhr-Layouts: veröffentlichte Screens anderer ansehen und in die eigenen
// kopieren. GESTALTET wird nur in der PWA (Entscheidung Jan 2026-08-17) — hier bewusst kein Editor,
// dafür steht der Hinweis auf den Browser im Ansichten-Editor.
//
// Warum das nativ überhaupt geht: der lesende Renderer (LayoutRender.swift) zeichnet ein Layout so
// wie die Uhr. Ohne ihn wäre eine Galerie sinnlos — eine Liste von Namen hilft niemandem.
//
// Layout/Design: ScrollView + LazyVStack (lädt nur Sichtbares), Vorschau links und Angaben rechts,
// damit auf schmalen iPhones nichts abgeschnitten wird. Die Safe Area kommt vom umgebenden
// NavigationStack; `.navigationTitle` bleibt inline, damit oben kein halber Bildschirm draufgeht.
struct LayoutGalleryView: View {
    let lang: String

    @State private var layouts: [WatchLayoutBrief]?
    @State private var kopiert: Int?
    @State private var fehler: String?

    var body: some View {
        Group {
            if let liste = layouts {
                inhalt(liste)
            } else {
                ProgressView().frame(maxWidth: .infinity, alignment: .center).padding(.top, 24)
            }
        }
        .navigationTitle(Loc.t("lay.galleryTitle", lang))
        .navigationBarTitleDisplayMode(.inline)
        .task { await laden() }
    }

    @ViewBuilder private func inhalt(_ liste: [WatchLayoutBrief]) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                Text(Loc.t("lay.galleryHint", lang))
                    .font(.callout).foregroundStyle(.secondary)
                if liste.isEmpty {
                    Text(Loc.t("lay.galleryEmpty", lang))
                        .font(.callout).foregroundStyle(.secondary)
                }
                ForEach(liste) { l in karte(l) }
                if let f = fehler {
                    Text("\(Loc.t("lay.saveErr", lang)) \(f)")
                        .font(.callout).foregroundStyle(.red)
                }
            }
            .padding()
        }
    }

    @ViewBuilder private func karte(_ l: WatchLayoutBrief) -> some View {
        HStack(alignment: .top, spacing: 12) {
            WatchLayoutPreview(elements: l.elements ?? [], bgColor: l.bg_color ?? 0,
                               shape: l.shape ?? "round",
                               w: l.authored_w ?? 240, h: l.authored_h ?? 240,
                               px: 104, lang: lang)
            VStack(alignment: .leading, spacing: 4) {
                Text(l.name).fontWeight(.medium)
                if let a = l.author {
                    Text(Loc.t("lay.byAuthor", lang).replacingOccurrences(of: "{name}", with: a))
                        .font(.caption).foregroundStyle(.secondary)
                }
                // Nutzung zuerst: sie sagt mehr als die Kopien-Zahl (eine bloß gespeicherte Kopie
                // liegt auf keiner Uhr).
                if !zahlen(l).isEmpty {
                    Text(zahlen(l).joined(separator: " · "))
                        .font(.caption).foregroundStyle(.secondary)
                }
                if l.has_freetext == true {
                    Text(Loc.t("lay.hasFreetext", lang)).font(.caption).foregroundStyle(.orange)
                }
                Button(Loc.t("lay.copyToMine", lang)) { kopieren(l) }
                    .buttonStyle(.bordered)
                    .padding(.top, 2)
                if kopiert == l.id {
                    Text(Loc.t("lay.copiedGoto", lang))
                        .font(.callout).foregroundStyle(Color.accentColor)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func zahlen(_ l: WatchLayoutBrief) -> [String] {
        var out: [String] = []
        if let n = l.used_by, n > 0 {
            out.append(Loc.t("lay.usedBy", lang).replacingOccurrences(of: "{n}", with: "\(n)"))
        }
        if let n = l.copies, n > 0 {
            out.append(Loc.t("lay.copies", lang).replacingOccurrences(of: "{n}", with: "\(n)"))
        }
        return out
    }

    private func laden() async {
        // Keine Sortier-Auswahl: die PWA-Galerie hat auch keine und nimmt den Server-Standard.
        layouts = (try? await Api.communityLayouts()) ?? []
    }

    private func kopieren(_ l: WatchLayoutBrief) {
        fehler = nil
        Task {
            do {
                _ = try await Api.copyLayout(l.id)
                kopiert = l.id
            } catch {
                fehler = error.localizedDescription
            }
        }
    }
}
