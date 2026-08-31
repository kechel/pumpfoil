import SwiftUI

/// Ein Bild aus dem Netz — mit eigenem Cache im Arbeitsspeicher.
///
/// **Warum nicht einfach `AsyncImage`:** `AsyncImage` haelt nichts fest. Verlaesst man den Tab
/// und kommt zurueck, wird die Ansicht neu gebaut und JEDES Bild neu angefordert. Auf der
/// Community-Seite sind das zwei Galerien auf einmal; `URLSession` laesst je Host nur sechs
/// Verbindungen zu, und was hinten in der Schlange steht, kam bei Jan im Simulator gar nicht
/// mehr an — die Kacheln blieben leer (31.08., beide Zeilen betroffen). Mit Cache passiert beim
/// Zurueckkommen gar keine Anfrage mehr, und beim ersten Aufbau sind es deutlich weniger.
///
/// Der Cache ist bewusst klein und nur im Speicher: die Platte macht schon `URLCache.shared`
/// (in `PumpfoilApp` auf 300 MB gesetzt, die Bilder kommen mit `max-age=86400`). Hier geht es
/// nur darum, das erneute Anfordern und Dekodieren beim Blaettern zu sparen.
@MainActor
final class BildCache {
    static let shared = BildCache()
    private let cache: NSCache<NSURL, UIImage> = {
        let c = NSCache<NSURL, UIImage>()
        c.countLimit = 300            // Kacheln sind klein; 300 reichen fuer alle Galerien
        return c
    }()

    func bild(_ url: URL) -> UIImage? { cache.object(forKey: url as NSURL) }
    func merken(_ url: URL, _ bild: UIImage) { cache.setObject(bild, forKey: url as NSURL) }
}

/// Zustand einer Kachel — die Aufrufer faerben „laedt noch" und „fehlgeschlagen" unterschiedlich,
/// damit man im Zweifel sieht, woran es liegt.
enum BildStand {
    case laedt
    case da(Image)
    case fehler
}

struct NetzBild<Inhalt: View>: View {
    let url: URL?
    @ViewBuilder let inhalt: (BildStand) -> Inhalt

    @State private var stand: BildStand = .laedt

    var body: some View {
        inhalt(stand)
            .task(id: url) { await laden() }
    }

    private func laden() async {
        guard let url else { stand = .fehler; return }
        if let fertig = BildCache.shared.bild(url) {
            stand = .da(Image(uiImage: fertig))
            return
        }
        stand = .laedt
        do {
            let (daten, antwort) = try await URLSession.shared.data(from: url)
            guard let http = antwort as? HTTPURLResponse, (200..<300).contains(http.statusCode),
                  let bild = UIImage(data: daten) else { stand = .fehler; return }
            BildCache.shared.merken(url, bild)
            stand = .da(Image(uiImage: bild))
        } catch {
            // Abbruch beim Wegscrollen ist kein Fehler — dann bleibt es beim Ladezustand und
            // der naechste `task(id:)` versucht es erneut.
            stand = Task.isCancelled ? .laedt : .fehler
        }
    }
}
