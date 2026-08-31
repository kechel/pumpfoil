import SwiftUI
import WebKit

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
/// Zustand des Feeds — bewusst NICHT in der Section, sondern im Besitz der Community-Ansicht.
///
/// Grund: das Vollbild darf nicht an einer `List`-ZEILE haengen. Wird die Liste beim ersten
/// Antippen neu layoutet, raeumt SwiftUI den Traeger der Praesentation kurz ab und das Vollbild
/// geht mit — genau Jans Befund vom 31.08. („beim ersten Mal geht es auf und sofort wieder zu,
/// beim zweiten Mal klappt es"). Mit dem Modell haengt `fullScreenCover` an der `List` selbst,
/// und die steht.
@MainActor
final class SocialFeedModell: ObservableObject {
    @Published private(set) var items: [SocialItem] = []
    @Published private(set) var geladen = false
    @Published var offen: Int?
    private var ende = false
    private var laedt = false

    /// Wie viele Videos je Nachschub. Gleiche Zahl wie in der PWA (SocialFeed.tsx).
    private let schub = 24

    func ersteSeite() async {
        guard !geladen else { return }
        items = (try? await Api.socialFeed(limit: schub, offset: 0)) ?? []
        if items.count < schub { ende = true }
        geladen = true
    }

    func nachladen(abIndex i: Int) async {
        guard i >= items.count - 3, !ende, !laedt, !items.isEmpty else { return }
        laedt = true
        let mehr = (try? await Api.socialFeed(limit: schub, offset: items.count)) ?? []
        items += mehr
        if mehr.count < schub { ende = true }
        laedt = false
    }
}

struct SocialFeedSection: View {
    let lang: String
    @ObservedObject var modell: SocialFeedModell

    var body: some View {
        // Erst zeichnen, wenn wirklich etwas da ist — sonst stuende eine leere Ueberschrift
        // auf der Community-Seite jedes Nutzers unter 13 (Age-Gate liefert dort [] ).
        if modell.geladen && !modell.items.isEmpty {
            Section(Loc.t("social.title", lang)) {
                // Der mittlere Satz ist fett und in Marken-Cyan — er ist die Aufforderung, der
                // Rest Erklaerung. Der Text traegt <b>-Marken aus den Web-Locales.
                Text(impText(Loc.t("social.hint", lang), farbe: .accentColor))
                    .font(.caption).foregroundStyle(.secondary)
                    .listRowSeparator(.hidden)
                // LazyHStack, NICHT HStack: ein normaler HStack baut alle Kinder sofort, also
                // starten 24 Vorschaubilder gleichzeitig ihre Anfrage. URLSession laesst je Host
                // nur sechs Verbindungen zu — der Rest steht in der Schlange, und die danach
                // gerenderte Zeile "Neueste Medien" kam gar nicht mehr dran (Jan, 31.08.).
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(spacing: 10) {
                        ForEach(Array(modell.items.enumerated()), id: \.element.id) { i, it in
                            Button { modell.offen = i } label: { kachel(it) }
                                .buttonStyle(.plain)
                                .onAppear { Task { await modell.nachladen(abIndex: i) } }
                        }
                    }
                    .padding(.vertical, 2)
                    .frame(height: 231)
                }
                .listRowInsets(EdgeInsets(top: 4, leading: 12, bottom: 8, trailing: 12))
            }
        } else {
            // Unsichtbarer Platzhalter, der das erste Laden anstoesst.
            Color.clear.frame(height: 0).listRowBackground(Color.clear)
                .task { await modell.ersteSeite() }
        }
    }

    /// Hochkant 9:16 — bei uns sind fast alle Clips Shorts.
    ///
    /// Das Vorschaubild laedt ueber `NetzBild` (eigener Speicher-Cache) statt `AsyncImage` —
    /// sonst wird beim Tab-Wechsel jedes Bild neu angefordert und die Kacheln bleiben leer
    /// (Jans Befund 31.08.). „laedt noch" und „fehlgeschlagen" sind verschieden eingefaerbt,
    /// damit man im Zweifel sieht, woran es liegt.
    @ViewBuilder private func kachel(_ it: SocialItem) -> some View {
        let u = URL(string: "\(Api.baseURL)/api/public/video-thumb/\(it.external_id)")
        ZStack(alignment: .bottomLeading) {
            NetzBild(url: u) { stand in
                switch stand {
                case .da(let bild): bild.resizable().scaledToFill()
                case .fehler:       Color.secondary.opacity(0.25)
                case .laedt:        Color.secondary.opacity(0.12)
                }
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

}

/// Vollbild-Player.
///
/// Datensparsam ueber youtube-nocookie und erst durch das Antippen geladen — vorher geht kein
/// Byte an Google. Kein festes Seitenverhaeltnis: YouTube verraet das Format eines Videos
/// nirgends, also bekommt der Rahmen alles und der Player skaliert selbst hinein.
/// Vollbild-Player. Wird von der Community-Ansicht praesentiert, NICHT aus der List-Zeile
/// heraus — s. die Erklaerung an `SocialFeedModell`.
struct SocialPlayerView: View {
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
