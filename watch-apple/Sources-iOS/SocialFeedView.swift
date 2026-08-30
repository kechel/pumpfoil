import SwiftUI
import WebKit

// Wie viele Videos je Nachschub. Gleiche Zahl wie in der PWA (SocialFeed.tsx).
private let SCHUB = 24

/// Community-Social-Feed: alle freigegebenen YouTube-Kanaele in EINEM Strom, neueste zuerst —
/// nicht nach Kanal gruppiert und nicht danach sortiert, was ein Algorithmus fuer sehenswert
/// haelt. Genau das ist der Zweck.
///
/// Tippen oeffnet das Video im Vollbild mit Weiter/Zurueck. Das ist KEIN Widerspruch zur Regel,
/// dass Video-Vorschaubilder in den Session-Listen die Session-Detailansicht oeffnen statt eines
/// Players: hier gibt es keine Session dahinter, das Abspielen IST der Inhalt.
///
/// Vorschaubilder kommen ueber UNSEREN Server (`/api/public/video-thumb/…`), nicht von
/// img.youtube.com — sonst entsteht ein Drittkontakt zu Google, bevor der Nutzer ueberhaupt auf
/// Abspielen getippt hat. Dieselbe Entscheidung wie in der PWA.
struct SocialFeedSection: View {
    let lang: String
    @State private var items: [SocialItem] = []
    @State private var geladen = false
    @State private var ende = false
    @State private var laedt = false
    @State private var offen: Int?

    var body: some View {
        // Erst zeichnen, wenn wirklich etwas da ist — sonst stuende eine leere Ueberschrift
        // auf der Community-Seite jedes Nutzers unter 13 (Age-Gate liefert dort [] ).
        if geladen && !items.isEmpty {
            Section(Loc.t("social.title", lang)) {
                // Der mittlere Satz ist fett — er ist die Aufforderung, der Rest Erklaerung.
                // Der Text traegt <b>-Marken aus den Web-Locales, deshalb dieselbe Fettung wie
                // im Impressum statt roher Zeichen.
                Text(impText(Loc.t("social.hint", lang)))
                    .font(.caption).foregroundStyle(.secondary)
                    .listRowSeparator(.hidden)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(Array(items.enumerated()), id: \.element.id) { i, it in
                            Button { offen = i } label: { kachel(it) }
                                .buttonStyle(.plain)
                                .onAppear { if i >= items.count - 3 { Task { await nachladen() } } }
                        }
                    }
                    .padding(.vertical, 2)
                }
                .listRowInsets(EdgeInsets(top: 4, leading: 12, bottom: 8, trailing: 12))
            }
            .fullScreenCover(item: Binding(
                get: { offen.flatMap { i in items.indices.contains(i) ? SocialDest(index: i) : nil } },
                set: { neu in offen = neu?.index })
            ) { ziel in
                SocialPlayerView(
                    lang: lang,
                    item: items[ziel.index],
                    hatZurueck: ziel.index > 0,
                    hatWeiter: ziel.index < items.count - 1,
                    onZurueck: { offen = ziel.index - 1 },
                    onWeiter: { offen = ziel.index + 1 },
                    onClose: { offen = nil }
                )
            }
        } else {
            // Unsichtbarer Platzhalter, der das erste Laden anstoesst.
            Color.clear.frame(height: 0).listRowBackground(Color.clear)
                .task { await ersteSeite() }
        }
    }

    /// Hochkant 9:16 — bei uns sind fast alle Clips Shorts.
    @ViewBuilder private func kachel(_ it: SocialItem) -> some View {
        let u = URL(string: "\(Api.baseURL)/api/public/video-thumb/\(it.external_id)")
        ZStack(alignment: .bottomLeading) {
            AsyncImage(url: u) { bild in
                bild.resizable().aspectRatio(contentMode: .fill)
            } placeholder: {
                Color.secondary.opacity(0.15)
            }
            .frame(width: 130, height: 231)
            .clipped()
            // Abdunkeln nach unten, damit die weisse Schrift auf jedem Bild lesbar ist.
            LinearGradient(colors: [.clear, .black.opacity(0.8)], startPoint: .center, endPoint: .bottom)
            VStack(alignment: .leading, spacing: 1) {
                Text(it.title ?? "—").font(.caption2).fontWeight(.semibold)
                    .foregroundStyle(.white).lineLimit(2)
                Text(untertitel(it)).font(.caption2).foregroundStyle(.white.opacity(0.8)).lineLimit(1)
            }
            .padding(6)
        }
        .frame(width: 130, height: 231)
        .overlay {
            Image(systemName: "play.circle.fill")
                .font(.largeTitle).foregroundStyle(Color.accentColor)
        }
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private func untertitel(_ it: SocialItem) -> String {
        [it.user_name, it.published_at.flatMap { TimeFmt.dateNumeric($0, nil) }]
            .compactMap { $0 }.joined(separator: " · ")
    }

    private func ersteSeite() async {
        guard !geladen else { return }
        items = (try? await Api.socialFeed(limit: SCHUB, offset: 0)) ?? []
        if items.count < SCHUB { ende = true }
        geladen = true
    }

    private func nachladen() async {
        guard !ende, !laedt, !items.isEmpty else { return }
        laedt = true
        let mehr = (try? await Api.socialFeed(limit: SCHUB, offset: items.count)) ?? []
        items += mehr
        if mehr.count < SCHUB { ende = true }
        laedt = false
    }
}

/// `fullScreenCover(item:)` braucht ein Identifiable — der reine Index tut es nicht.
private struct SocialDest: Identifiable {
    let index: Int
    var id: Int { index }
}

/// Vollbild-Player.
///
/// Datensparsam ueber youtube-nocookie und erst durch das Antippen geladen — vorher geht kein
/// Byte an Google. Kein festes Seitenverhaeltnis: YouTube verraet das Format eines Videos
/// nirgends, also bekommt der Rahmen alles und der Player skaliert selbst hinein.
private struct SocialPlayerView: View {
    let lang: String
    let item: SocialItem
    let hatZurueck: Bool
    let hatWeiter: Bool
    let onZurueck: () -> Void
    let onWeiter: () -> Void
    let onClose: () -> Void
    @State private var gemeldet = false

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            VStack(spacing: 8) {
                YoutubePlayer(videoId: item.external_id)
                    .padding(.horizontal, 44)
                fusszeile
            }
            .padding(.vertical, 8)

            Button(action: onClose) {
                Image(systemName: "xmark.circle.fill").font(.title)
                    .foregroundStyle(.white, .black.opacity(0.5))
            }
            .padding()
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)

            if hatZurueck { pfeil("chevron.left", .leading, onZurueck, Loc.t("social.prev", lang)) }
            if hatWeiter { pfeil("chevron.right", .trailing, onWeiter, Loc.t("social.next", lang)) }
        }
        .onChange(of: item.id) { _ in gemeldet = false }
    }

    @ViewBuilder private func pfeil(_ symbol: String, _ kante: Alignment,
                                    _ aktion: @escaping () -> Void, _ label: String) -> some View {
        Button(action: aktion) {
            Image(systemName: symbol).font(.title).fontWeight(.bold)
                .foregroundStyle(Color.accentColor).padding(10)
        }
        .accessibilityLabel(label)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: kante)
    }

    @ViewBuilder private var fusszeile: some View {
        HStack(alignment: .center, spacing: 10) {
            VStack(alignment: .leading, spacing: 1) {
                Text(item.title ?? "—").font(.subheadline).fontWeight(.semibold)
                    .foregroundStyle(.white).lineLimit(1)
                Text(item.user_name ?? "?").font(.caption).foregroundStyle(.white.opacity(0.7)).lineLimit(1)
            }
            Spacer(minLength: 0)
            // Im datensparsamen nocookie-Modus gibt es keine YouTube-Sitzung — Liken geht nur
            // bei YouTube selbst. Auf dem Handy oeffnet das die App, wo der Nutzer angemeldet
            // ist. Deshalb auffaellig: davon lebt, wer die Clips macht.
            if let u = URL(string: item.url) {
                Link(Loc.t("social.onYoutube", lang), destination: u)
                    .font(.caption).fontWeight(.semibold)
                    .padding(.horizontal, 12).padding(.vertical, 7)
                    .background(Color.accentColor).foregroundStyle(.black)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            }
            Button {
                guard !gemeldet else { return }
                gemeldet = true
                Task { try? await Api.socialReport(item.id) }
            } label: {
                Text(Loc.t(gemeldet ? "social.reported" : "social.report", lang))
                    .font(.caption2).foregroundStyle(.white.opacity(0.7))
            }
        }
        .padding(.horizontal, 12)
    }
}

/// Der eingebettete Player: `WKWebView` mit genau dem `iframe`, den auch die PWA benutzt.
///
/// Bewusst eine **nicht-persistente** Datenablage: was der Player in dieser Sitzung ablegt,
/// verschwindet mit ihr. Fuer die Wiedergabe braucht es das nicht, und wir sammeln nichts an.
private struct YoutubePlayer: UIViewRepresentable {
    let videoId: String

    /// Merkt sich, welches Video schon geladen ist.
    final class Coordinator { var geladen: String? }
    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let konfig = WKWebViewConfiguration()
        konfig.websiteDataStore = .nonPersistent()
        konfig.allowsInlineMediaPlayback = true
        konfig.mediaTypesRequiringUserActionForPlayback = []   // autoplay wie im Web
        let web = WKWebView(frame: .zero, configuration: konfig)
        web.isOpaque = false
        web.backgroundColor = .black
        web.scrollView.isScrollEnabled = false
        return web
    }

    func updateUIView(_ web: WKWebView, context: Context) {
        // Nur laden, wenn sich das Video wirklich geaendert hat — sonst startet der Clip bei
        // jeder Zustandsaenderung der umgebenden Ansicht (z. B. „Gemeldet") von vorn.
        guard context.coordinator.geladen != videoId else { return }
        context.coordinator.geladen = videoId
        // `loop=1` wirkt bei einem EINZELNEN Video nur zusammen mit `playlist=<id>`
        // (dokumentierte Eigenart der Player-Parameter). Bei Clips von wenigen Sekunden ist
        // die Schleife das Richtige.
        let html = """
            <html><body style="margin:0;background:#000">
            <iframe width="100%" height="100%" frameborder="0" allowfullscreen
              allow="autoplay; encrypted-media; picture-in-picture"
              src="https://www.youtube-nocookie.com/embed/\(videoId)?autoplay=1&rel=0&playsinline=1&loop=1&playlist=\(videoId)"></iframe>
            </body></html>
            """
        web.loadHTMLString(html, baseURL: URL(string: "https://www.youtube-nocookie.com"))
    }
}
