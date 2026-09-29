import SwiftUI
import Foundation

/// Text mit `<b>…</b>` als echte Fettung.
///
/// Die Impressum-Texte kommen unveraendert aus den Web-Locales und enthalten dort `<b>`-Marken,
/// die der Browser rendert. Die App zeigte sie bis 31.08. als sichtbare Zeichen („<b>Hochgeladene
/// Fotos</b>: …") — in acht der Abschnitte. Statt die Marken zu entfernen (und die Betonung zu
/// verlieren) werden sie hier in Markdown uebersetzt, das `AttributedString` versteht.
/// - Parameter farbe: optional zusaetzlich zur Fettung. Der Social-Hinweis nutzt Marken-Cyan,
///   weil der fette Satz dort die Aufforderung ist (Jan, 31.08.); im Impressum bleibt es fett.
///
/// LINKS (29.09.2026): seit dem Hosting-Block und in den Overlays cs/nl/fi/nb/pl stehen auch
/// `<a href>`-Marken in den Texten — die App zeigte sie als rohes HTML. Sie werden zu Markdown-
/// Links (`[Text](Ziel)`), die SwiftUI antippbar in Akzentfarbe zeigt; relative Ziele wie
/// `/datenloeschung` zeigen auf pumpfoil.org. Jede ANDERE Marke faellt stumm weg.
func impText(_ roh: String, farbe: Color? = nil) -> AttributedString {
    var md = roh.replacingOccurrences(of: "<b>", with: "**")
                .replacingOccurrences(of: "</b>", with: "**")
    md = impLinks(md)
    // `interpretedSyntax: .inlineOnlyPreservingWhitespace` — sonst frisst Markdown Zeilenumbrueche.
    guard var s = try? AttributedString(markdown: md,
        options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))
    else { return AttributedString(roh) }
    if let farbe {
        // Genau die Laeufe einfaerben, die Markdown fett gesetzt hat.
        for lauf in s.runs where lauf.inlinePresentationIntent?.contains(.stronglyEmphasized) == true {
            s[lauf.range].foregroundColor = farbe
        }
    }
    return s
}

/// `<a … href="X" …>T</a>` -> `[T](X)`, danach alle uebrigen Marken entfernen.
private func impLinks(_ s: String) -> String {
    let ns = s as NSString
    guard let re = try? NSRegularExpression(pattern: "<a\\b[^>]*?href\\s*=\\s*\"([^\"]*)\"[^>]*>(.*?)</a>",
                                            options: [.caseInsensitive, .dotMatchesLineSeparators])
    else { return s }
    var aus = ""
    var pos = 0
    for m in re.matches(in: s, range: NSRange(location: 0, length: ns.length)) {
        aus += ns.substring(with: NSRange(location: pos, length: m.range.location - pos))
        var ziel = ns.substring(with: m.range(at: 1))
        if ziel.hasPrefix("/") { ziel = "https://pumpfoil.org" + ziel }
        let text = ns.substring(with: m.range(at: 2))
        aus += "[\(text)](\(ziel))"
        pos = m.range.location + m.range.length
    }
    aus += ns.substring(from: pos)
    return aus.replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
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
            Sec(title: "imp.hostTitle", intro: nil, bullets: ["imp.host1", "imp.host2"], note: nil),   // Server + Hosting (29.09.2026, wie PWA)
            Sec(title: "imp.googleTitle", intro: "imp.googleIntro", bullets: ["imp.google1", "imp.google2", "imp.google3", "imp.google4"], note: "imp.googleNote"),
            Sec(title: "imp.appleTitle", intro: "imp.appleIntro", bullets: ["imp.apple1", "imp.apple2", "imp.apple3"], note: nil),
            // Facebook-Anmeldung und KI-Unterstuetzung (29.09.2026): standen nur in der PWA.
            // Reihenfolge ab hier wie web /impressum: Facebook, Konten, KI, Karten, YouTube.
            Sec(title: "imp.fbTitle", intro: "imp.fbIntro", bullets: ["imp.fb1", "imp.fb2", "imp.fb3", "imp.fb4", "imp.fb5"], note: "imp.fbNote"),
            Sec(title: "imp.connTitle", intro: "imp.connIntro", bullets: ["imp.conn1", "imp.conn2", "imp.conn3"], note: nil),
            Sec(title: "imp.aiTitle", intro: "imp.aiIntro", bullets: ["imp.ai1", "imp.ai2", "imp.ai3", "imp.ai4"], note: "imp.aiNote"),
            Sec(title: "imp.mapTitle", intro: nil, bullets: ["imp.map1", "imp.map2", "imp.mapApple"], note: nil),
            Sec(title: "imp.ytTitle", intro: nil, bullets: ["imp.yt1", "imp.yt2"], note: "imp.ytNote"),
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
