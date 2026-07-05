import SwiftUI

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
        ]
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("pumpfoil.org/impressum").font(.footnote).foregroundStyle(Color.accentColor)

                Text(Loc.t("imp.whoSees", lang)).font(.title2).bold()
                Text(Loc.t("imp.intro", lang)).font(.subheadline).foregroundStyle(.secondary)

                ForEach(Array(sections.enumerated()), id: \.offset) { _, s in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(Loc.t(s.title, lang)).font(.headline).foregroundStyle(Color.accentColor)
                        if let i = s.intro { Text(Loc.t(i, lang)).font(.subheadline).foregroundStyle(.secondary) }
                        ForEach(s.bullets, id: \.self) { b in
                            HStack(alignment: .top, spacing: 6) {
                                Text("•"); Text(Loc.t(b, lang))
                            }.font(.subheadline).foregroundStyle(.secondary)
                        }
                        if let n = s.note { Text(Loc.t(n, lang)).font(.caption).foregroundStyle(.secondary) }
                    }
                    .padding(.top, 6)
                }

                Text(Loc.t("imp.privacyTitle", lang)).font(.title2).bold().padding(.top, 8)
                Text(Loc.t("imp.privacyText", lang)).font(.subheadline).foregroundStyle(.secondary)
            }
            .padding()
        }
        .navigationTitle(Loc.t("imp.title", lang))
        .navigationBarTitleDisplayMode(.inline)
    }
}
