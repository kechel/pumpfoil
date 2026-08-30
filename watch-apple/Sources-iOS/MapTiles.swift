import SwiftUI
import MapKit

/// Basiskarten fuer ALLE Karten der App: Strassenkarte und Luftbild — dasselbe Paar wie in der
/// PWA (`web/src/lib/mapTiles.ts`) und in der Android-App (`MapTiles.kt`), Nutzerwunsch vom 26.08.
///
/// Anders als Web und Android brauchen wir hier KEINEN fremden Kachel-Anbieter: MapKit bringt
/// das Luftbild mit. Deshalb steht hier auch nichts zu Esri — es wird kein Dritter angesprochen,
/// der nicht ohnehin schon die Karte liefert.
///
/// Gewaehlt wird appweit und dauerhaft, unter demselben Schluessel wie im Web ("map_layer"),
/// damit die Begriffe nicht auseinanderlaufen. `@AppStorage` sorgt dafuer, dass alle Karten
/// gleichzeitig umschalten — wer die Session-Karte auf Luftbild stellt, findet die Spot-Karte
/// genauso vor.
enum MapTiles {
    static let schluessel = "map_layer"
    static let karte = "karte"
    static let satellit = "satellit"

    /// `.hybrid` statt `.satellite`: das Luftbild OHNE Ortsnamen ist auf einem See kaum zu
    /// deuten — man sieht Wasser und weiss nicht, welches. Apples eigener „Satellit"-Schalter
    /// zeigt ebenfalls Beschriftungen, das ist hier also die erwartete Ansicht.
    static func typ(_ ebene: String) -> MKMapType {
        ebene == satellit ? .hybrid : .standard
    }
}

/// Der Umschalter, den jede Karte oben links ueber sich legt.
///
/// EIN Knopf statt einer Auswahlliste (Jan, 31.08.): bei genau zwei Ebenen waere eine Liste
/// zwei Tipp fuer etwas, das einer sein sollte. Beschriftet ist er mit dem ZIEL — steht
/// „Satellit" drauf, kommt man mit einem Tipp dorthin.
struct KartenUmschalter: View {
    @AppStorage(MapTiles.schluessel) private var ebene = MapTiles.karte
    @AppStorage("appLang") private var lang = "de"

    var body: some View {
        Button {
            ebene = (ebene == MapTiles.satellit) ? MapTiles.karte : MapTiles.satellit
        } label: {
            Text(Loc.t(ebene == MapTiles.satellit ? "map.street" : "map.satellite", lang))
                .font(.caption).fontWeight(.semibold)
                .padding(.horizontal, 10).padding(.vertical, 6)
                .background(.thinMaterial)
                .clipShape(RoundedRectangle(cornerRadius: 6))
        }
        .buttonStyle(.plain)
        .padding(8)
    }
}

extension View {
    /// Legt den Umschalter oben LINKS ueber eine Karte. Eine Zeile je Kartenstelle, damit
    /// keine der fuenf die Ausrichtung selbst kennen muss.
    ///
    /// Warum links: in der Session-Detail- und der Vergleichsansicht sitzt oben rechts schon
    /// der Vollbild- bzw. Schliessen-Knopf. Eine Ecke fuer ALLE fuenf Karten ist besser als
    /// eine, die je nach Karte wechselt.
    func mitKartenUmschalter() -> some View {
        overlay(alignment: .topLeading) { KartenUmschalter() }
    }
}
