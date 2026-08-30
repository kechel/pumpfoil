import SwiftUI

/// Text mit `<b>…</b>` als echte Fettung.
///
/// Die Impressum-Texte kommen unveraendert aus den Web-Locales und enthalten dort `<b>`-Marken,
/// die der Browser rendert. Die App zeigte sie bis 31.08. als sichtbare Zeichen („<b>Hochgeladene
/// Fotos</b>: …") — in acht der Abschnitte. Statt die Marken zu entfernen (und die Betonung zu
/// verlieren) werden sie hier in Markdown uebersetzt, das `AttributedString` versteht.
func impText(_ roh: String) -> AttributedString {
    let md = roh.replacingOccurrences(of: "<b>", with: "**")
                .replacingOccurrences(of: "</b>", with: "**")
    // `interpretedSyntax: .inlineOnlyPreservingWhitespace` — sonst frisst Markdown Zeilenumbrueche.
    return (try? AttributedString(markdown: md,
        options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)))
        ?? AttributedString(roh)
}

// Impressum + Datenschutzhinweis in der App. Gleiche Reihenfolge/Inhalte wie web /impressum + Android.
struct ImpressumView: View {
    @AppStorage("appLang") private var lang = "de"

    private struct Sec { let title: String; let intro: String?; let bullets: [String]; let note: String? }
    private var sections: [Sec] {
        [
            Sec(title: "imp.publicTitle", intro: nil, bullets: ["imp.public1", "imp.public2"], note: nil),
            Sec(title: "imp.communityTitle", intro: "imp.communityIntro", bullets: ["imp.community1", "imp.community2", "imp.community3", "imp.community4"], note: "imp.communityNote"),
            Sec(title: "imp.ownerTitle", intro: nil, bullets: ["imp.owner1", "imp.owner2", "imp.owner3", "imp.owner4"], note: nil),
            Sec(title: "imp.operatorTitle", intro: nil, bullets: ["imp.operator1", "imp.operator2"], note: nil),
            Sec(title: "imp.googleTitle", intro: "imp.googleIntro", bullets: ["imp.google1", "imp.google2", "imp.google3", "imp.google4"], note: "imp.googleNote"),
            Sec(title: "imp.appleTitle", intro: "imp.appleIntro", bullets: ["imp.apple1", "imp.apple2", "imp.apple3"], note: nil),
            Sec(title: "imp.connTitle", intro: "imp.connIntro", bullets: ["imp.conn1", "imp.conn2", "imp.conn3"], note: nil),
            Sec(title: "imp.ytTitle", intro: nil, bullets: ["imp.yt1", "imp.yt2"], note: "imp.ytNote"),
            Sec(title: "imp.mapTitle", intro: nil, bullets: ["imp.map1", "imp.map2", "imp.mapApple"], note: nil),
        ]
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("pumpfoil.org/impressum").font(.footnote).foregroundStyle(Color.accentColor)

                Text(Loc.t("imp.whoSees", lang)).font(.title2).bold()
                Text(impText(Loc.t("imp.intro", lang))).font(.subheadline).foregroundStyle(.secondary)

                ForEach(Array(sections.enumerated()), id: \.offset) { _, s in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(Loc.t(s.title, lang)).font(.headline).foregroundStyle(Color.accentColor)
                        if let i = s.intro { Text(impText(Loc.t(i, lang))).font(.subheadline).foregroundStyle(.secondary) }
                        ForEach(s.bullets, id: \.self) { b in
                            HStack(alignment: .top, spacing: 6) {
                                Text("•"); Text(impText(Loc.t(b, lang)))
                            }.font(.subheadline).foregroundStyle(.secondary)
                        }
                        if let n = s.note { Text(impText(Loc.t(n, lang))).font(.caption).foregroundStyle(.secondary) }
                    }
                    .padding(.top, 6)
                }

                Text(Loc.t("imp.privacyTitle", lang)).font(.title2).bold().padding(.top, 8)
                Text(impText(Loc.t("imp.privacyText", lang))).font(.subheadline).foregroundStyle(.secondary)
            }
            .padding()
        }
        .brandToolbar(Loc.t("imp.title", lang))
        .navigationBarTitleDisplayMode(.inline)
    }
}
