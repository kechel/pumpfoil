import SwiftUI
import UIKit

// Teamfarben (Port von web/src/lib/teamFarben.ts, 01.11.2026). Eine feste Palette mit 36 Schluesseln
// (`{farbton}-hell|''|-dunkel`), die zu server/app/teams.py FARBEN passen muss. Je Farbe getrennt:
//  * TEXT/Rahmen (`akzent`): kontrastsicher (>= 4,5:1) — dunkler Modus Tailwind 400, heller 700.
//  * FLAECHE (`flaeche`) mit passender Schrift (`aufFlaeche`): `-hell` = Tailwind 200 (dunkel) / 300 (hell)
//    mit dunkler Schrift, `-dunkel` = 700 / 900 mit weisser. Fehlt ein Wert, gilt die Textfarbe bzw. die
//    Standardschrift (Navy im dunklen, Weiss im hellen Modus).
// Die Farben sind dynamische UIColors: sie kippen mit dem Hell-/Dunkel-Modus, ohne dass jede Ansicht
// `colorScheme` lesen muss.

private struct TeamFarbWerte {
    let dunkel: UInt32
    let hell: UInt32
    var dunkelFlaeche: UInt32? = nil
    var hellFlaeche: UInt32? = nil
    var dunkelAuf: UInt32? = nil
    var hellAuf: UInt32? = nil
}

// In Bloecke geteilt (Type-Checker, s. Loc.swift): je Farbton ein kleines Literal.
private let _tfBlau: [String: TeamFarbWerte] = [
    "cyan-hell": TeamFarbWerte(dunkel: 0x67e8f9, hell: 0x0e7490, dunkelFlaeche: 0xa5f3fc, hellFlaeche: 0x67e8f9, hellAuf: 0x020617),
    "cyan": TeamFarbWerte(dunkel: 0x22d3ee, hell: 0x0e7490),
    "cyan-dunkel": TeamFarbWerte(dunkel: 0x06b6d4, hell: 0x155e75, dunkelFlaeche: 0x0e7490, hellFlaeche: 0x164e63, dunkelAuf: 0xffffff),
    "blau-hell": TeamFarbWerte(dunkel: 0x93c5fd, hell: 0x1d4ed8, dunkelFlaeche: 0xbfdbfe, hellFlaeche: 0x93c5fd, hellAuf: 0x020617),
    "blau": TeamFarbWerte(dunkel: 0x60a5fa, hell: 0x1d4ed8),
    "blau-dunkel": TeamFarbWerte(dunkel: 0x3b82f6, hell: 0x1e40af, dunkelFlaeche: 0x1d4ed8, hellFlaeche: 0x1e3a8a, dunkelAuf: 0xffffff),
    "indigo-hell": TeamFarbWerte(dunkel: 0xa5b4fc, hell: 0x4338ca, dunkelFlaeche: 0xc7d2fe, hellFlaeche: 0xa5b4fc, hellAuf: 0x020617),
    "indigo": TeamFarbWerte(dunkel: 0x818cf8, hell: 0x4338ca),
    "indigo-dunkel": TeamFarbWerte(dunkel: 0x6e74f4, hell: 0x3730a3, dunkelFlaeche: 0x4338ca, hellFlaeche: 0x312e81, dunkelAuf: 0xffffff),
]
private let _tfRot: [String: TeamFarbWerte] = [
    "violett-hell": TeamFarbWerte(dunkel: 0xc4b5fd, hell: 0x6d28d9, dunkelFlaeche: 0xddd6fe, hellFlaeche: 0xc4b5fd, hellAuf: 0x020617),
    "violett": TeamFarbWerte(dunkel: 0xa78bfa, hell: 0x6d28d9),
    "violett-dunkel": TeamFarbWerte(dunkel: 0x9166f7, hell: 0x5b21b6, dunkelFlaeche: 0x6d28d9, hellFlaeche: 0x4c1d95, dunkelAuf: 0xffffff),
    "pink-hell": TeamFarbWerte(dunkel: 0xf9a8d4, hell: 0xbe185d, dunkelFlaeche: 0xfbcfe8, hellFlaeche: 0xf9a8d4, hellAuf: 0x020617),
    "pink": TeamFarbWerte(dunkel: 0xf472b6, hell: 0xbe185d),
    "pink-dunkel": TeamFarbWerte(dunkel: 0xec4899, hell: 0x9d174d, dunkelFlaeche: 0xbe185d, hellFlaeche: 0x831843, dunkelAuf: 0xffffff),
    "rot-hell": TeamFarbWerte(dunkel: 0xfca5a5, hell: 0xb91c1c, dunkelFlaeche: 0xfecaca, hellFlaeche: 0xfca5a5, hellAuf: 0x020617),
    "rot": TeamFarbWerte(dunkel: 0xf87171, hell: 0xb91c1c),
    "rot-dunkel": TeamFarbWerte(dunkel: 0xef4444, hell: 0x991b1b, dunkelFlaeche: 0xb91c1c, hellFlaeche: 0x7f1d1d, dunkelAuf: 0xffffff),
]
private let _tfGelb: [String: TeamFarbWerte] = [
    "orange-hell": TeamFarbWerte(dunkel: 0xfdba74, hell: 0xc2410c, dunkelFlaeche: 0xfed7aa, hellFlaeche: 0xfdba74, hellAuf: 0x020617),
    "orange": TeamFarbWerte(dunkel: 0xfb923c, hell: 0xc2410c),
    "orange-dunkel": TeamFarbWerte(dunkel: 0xf97316, hell: 0x9a3412, dunkelFlaeche: 0xc2410c, hellFlaeche: 0x7c2d12, dunkelAuf: 0xffffff),
    "amber-hell": TeamFarbWerte(dunkel: 0xfcd34d, hell: 0xb45309, dunkelFlaeche: 0xfde68a, hellFlaeche: 0xfcd34d, hellAuf: 0x020617),
    "amber": TeamFarbWerte(dunkel: 0xfbbf24, hell: 0xb45309),
    "amber-dunkel": TeamFarbWerte(dunkel: 0xf59e0b, hell: 0x92400e, dunkelFlaeche: 0xb45309, hellFlaeche: 0x78350f, dunkelAuf: 0xffffff),
    "gelb-hell": TeamFarbWerte(dunkel: 0xfde047, hell: 0xa16207, dunkelFlaeche: 0xfef08a, hellFlaeche: 0xfde047, hellAuf: 0x020617),
    "gelb": TeamFarbWerte(dunkel: 0xfacc15, hell: 0xa16207),
    "gelb-dunkel": TeamFarbWerte(dunkel: 0xeab308, hell: 0x854d0e, dunkelFlaeche: 0xa16207, hellFlaeche: 0x713f12, dunkelAuf: 0xffffff),
]
private let _tfGruen: [String: TeamFarbWerte] = [
    "limette-hell": TeamFarbWerte(dunkel: 0xbef264, hell: 0x4d7c0f, dunkelFlaeche: 0xd9f99d, hellFlaeche: 0xbef264, hellAuf: 0x020617),
    "limette": TeamFarbWerte(dunkel: 0xa3e635, hell: 0x4d7c0f),
    "limette-dunkel": TeamFarbWerte(dunkel: 0x84cc16, hell: 0x3f6212, dunkelFlaeche: 0x4d7c0f, hellFlaeche: 0x365314, dunkelAuf: 0xffffff),
    "gruen-hell": TeamFarbWerte(dunkel: 0x86efac, hell: 0x15803d, dunkelFlaeche: 0xbbf7d0, hellFlaeche: 0x86efac, hellAuf: 0x020617),
    "gruen": TeamFarbWerte(dunkel: 0x4ade80, hell: 0x15803d),
    "gruen-dunkel": TeamFarbWerte(dunkel: 0x22c55e, hell: 0x166534, dunkelFlaeche: 0x15803d, hellFlaeche: 0x14532d, dunkelAuf: 0xffffff),
    "petrol-hell": TeamFarbWerte(dunkel: 0x5eead4, hell: 0x0f766e, dunkelFlaeche: 0x99f6e4, hellFlaeche: 0x5eead4, hellAuf: 0x020617),
    "petrol": TeamFarbWerte(dunkel: 0x2dd4bf, hell: 0x0f766e),
    "petrol-dunkel": TeamFarbWerte(dunkel: 0x14b8a6, hell: 0x115e59, dunkelFlaeche: 0x0f766e, hellFlaeche: 0x134e4a, dunkelAuf: 0xffffff),
]

private let TEAM_FARBEN: [String: TeamFarbWerte] = {
    var d: [String: TeamFarbWerte] = [:]
    for p in [_tfBlau, _tfRot, _tfGelb, _tfGruen] { d.merge(p) { a, _ in a } }
    return d
}()

/// Alle Farbschluessel in der Reihenfolge der Auswahl (je Farbton hell, Mitte, dunkel) wie web TEAM_FARBEN —
/// fuer die Farbwahl in der Team-Verwaltung (04.11.2026).
let TEAM_FARB_SCHLUESSEL: [String] = ["cyan", "blau", "indigo", "violett", "pink", "rot", "orange", "amber", "gelb",
                                      "limette", "gruen", "petrol"].flatMap { [$0 + "-hell", $0, $0 + "-dunkel"] }

private func uiFarbe(_ hex: UInt32) -> UIColor {
    UIColor(red: CGFloat((hex >> 16) & 0xff) / 255, green: CGFloat((hex >> 8) & 0xff) / 255,
            blue: CGFloat(hex & 0xff) / 255, alpha: 1)
}

private func dynamisch(dunkel: UInt32, hell: UInt32) -> Color {
    let d = uiFarbe(dunkel)
    let h = uiFarbe(hell)
    return Color(UIColor { tc in tc.userInterfaceStyle == .dark ? d : h })
}

/// Die drei Farben eines Teams; unbekannter/fehlender Schluessel -> cyan.
struct TeamFarbe {
    /// Text, Rahmen, Akzent (kontrastsicher).
    let akzent: Color
    /// Flaeche fuer Knoepfe, Wappen, laufendes Status-Abzeichen.
    let flaeche: Color
    /// Schrift auf der Flaeche.
    let aufFlaeche: Color

    init(_ schluessel: String?) {
        let f: TeamFarbWerte = TEAM_FARBEN[schluessel ?? "cyan"] ?? TEAM_FARBEN["cyan"]!
        akzent = dynamisch(dunkel: f.dunkel, hell: f.hell)
        flaeche = dynamisch(dunkel: f.dunkelFlaeche ?? f.dunkel, hell: f.hellFlaeche ?? f.hell)
        aufFlaeche = dynamisch(dunkel: f.dunkelAuf ?? 0x020617, hell: f.hellAuf ?? 0xffffff)
    }
}

// MARK: - Wappen

/// Initialen eines Teams (wie TeamWappen.tsx `teamInitialen`).
func teamInitialen(_ name: String?) -> String {
    let trenner = CharacterSet(charactersIn: " ._-").union(.whitespacesAndNewlines)
    let teile: [String] = (name ?? "").components(separatedBy: trenner).filter { !$0.isEmpty }
    guard let erstes = teile.first else { return "?" }
    if teile.count == 1 { return String(erstes.prefix(2)).uppercased() }
    let letztes: String = teile[teile.count - 1]
    return (String(erstes.prefix(1)) + String(letztes.prefix(1))).uppercased()
}

/// Team-Wappen: hochgeladenes Logo, sonst die Initialen auf der Teamfarbe.
struct TeamWappen: View {
    let name: String?
    let logo: String?
    let farbe: String?
    var size: CGFloat = 40

    private var tf: TeamFarbe { TeamFarbe(farbe) }
    private var schrift: CGFloat { (size * 0.38).rounded() }
    private var ecke: CGFloat { max(4, size * 0.2) }

    var body: some View {
        if let url = Api.mediaURL(logo) {
            NetzBild(url: url) { stand in
                switch stand {
                case .da(let img): img.resizable().scaledToFit()
                default: initialen
                }
            }
            .frame(width: size, height: size)
            .clipShape(RoundedRectangle(cornerRadius: ecke))
        } else {
            initialen
        }
    }

    private var initialen: some View {
        Text(teamInitialen(name))
            .font(.system(size: schrift, weight: .bold))
            .foregroundStyle(tf.aufFlaeche)
            .frame(width: size, height: size)
            .background(tf.flaeche, in: RoundedRectangle(cornerRadius: ecke))
    }
}

// MARK: - Team-/Eventbild

/// Fokuspunkt „x,y" in Prozent -> 0…1 (wie TeamBanner.tsx `fokusPosition`).
func teamBannerFokus(_ fokus: String?) -> CGPoint {
    let teile: [Double] = (fokus ?? "50,50").split(separator: ",").map { Double($0.trimmingCharacters(in: .whitespaces)) ?? 50 }
    let x: Double = teile.count > 0 ? teile[0] : 50
    let y: Double = teile.count > 1 ? teile[1] : 50
    return CGPoint(x: max(0, min(100, x)) / 100, y: max(0, min(100, y)) / 100)
}

/// Team- bzw. Eventbild, nie zugeschnitten gespeichert: Anzeige 2,5:1 ueber die volle Breite, der Fokuspunkt
/// bleibt sichtbar (Entsprechung zu CSS `object-fit: cover` + `object-position`).
struct TeamBanner: View {
    let url: URL
    let fokus: String?
    /// Ecken: 16 auf Team-/Eventseite, 12 unten in den Event-Kacheln (web `!rounded-xl`).
    var ecke: CGFloat = 16

    var body: some View {
        Color.clear
            .aspectRatio(2.5, contentMode: .fit)
            .frame(maxWidth: .infinity)
            .overlay { GeometryReader { geo in bild(geo.size) } }
            .clipShape(RoundedRectangle(cornerRadius: ecke))
    }

    private func bild(_ rahmen: CGSize) -> some View {
        NetzBild(url: url) { stand in
            switch stand {
            case .da(let img): TeamBannerBild(bild: img, rahmen: rahmen, fokus: teamBannerFokus(fokus))
            default: Color(.secondarySystemBackground)
            }
        }
    }
}

/// Das geladene Bild: so gross skaliert, dass es den Rahmen fuellt, und so verschoben, dass der Fokuspunkt
/// an derselben relativen Stelle liegt wie bei `object-position: x% y%` — Versatz = Fokus * (Rahmen - Bild).
/// Die Ausrichtungslinien des Bildes werden dafuer um genau diesen Betrag verschoben.
private struct TeamBannerBild: View {
    let bild: Image
    let rahmen: CGSize
    let fokus: CGPoint

    var body: some View {
        bild.resizable().scaledToFill()
            .alignmentGuide(.leading) { d in (d.width - rahmen.width) * fokus.x }
            .alignmentGuide(.top) { d in (d.height - rahmen.height) * fokus.y }
            .frame(width: rahmen.width, height: rahmen.height, alignment: .topLeading)
            .clipped()
    }
}

// MARK: - Herkunft (Flagge)

/// Flagge eines Landes (ISO 3166-1 alpha-2) als Emoji aus den Regional-Indicator-Zeichen. Das Web nimmt SVGs
/// (/flags/<code>.svg, flag-icons) — Emoji-Flaggen hat es nur wegen Windows verworfen, wo nur zwei Buchstaben
/// erscheinen; iOS zeichnet sie zuverlaessig, und UIImage kann kein SVG. nil fuer Kontinente ("k:…") und Unsinn.
func teamFlaggenEmoji(_ land: String?) -> String? {
    guard let l = land, l.count == 2, !l.hasPrefix("k:") else { return nil }
    var s = ""
    for u in l.uppercased().unicodeScalars {
        guard u.value >= 65 && u.value <= 90, let r = Unicode.Scalar(0x1F1E6 + u.value - 65) else { return nil }
        s.unicodeScalars.append(r)
    }
    return s
}

/// Die Flagge als Bild, auf den sichtbaren Teil zugeschnitten (das Emoji hat oben und unten leeren Rand) — damit
/// sie im Teilen-Bild wie im Web in einem 4:3-Kaestchen mit feinem Rand stehen kann. Zwischengespeichert je Code.
enum TeamFlaggenBild {
    private static var cache: [String: UIImage] = [:]

    static func bild(_ land: String?) -> UIImage? {
        if let l = land, l.hasPrefix("k:") { return kontinent(String(l.dropFirst(2)), hell: false) }
        guard let e = teamFlaggenEmoji(land), let code = land?.uppercased() else { return nil }
        if let b = cache[code] { return b }
        let seite: CGFloat = 160
        let fmt = UIGraphicsImageRendererFormat.default()
        fmt.scale = 1
        fmt.opaque = false
        let roh = UIGraphicsImageRenderer(size: CGSize(width: seite, height: seite), format: fmt).image { _ in
            let attr: [NSAttributedString.Key: Any] = [.font: UIFont.systemFont(ofSize: seite * 0.8)]
            let ns = e as NSString
            let g = ns.size(withAttributes: attr)
            ns.draw(at: CGPoint(x: (seite - g.width) / 2, y: (seite - g.height) / 2), withAttributes: attr)
        }
        guard let cg = roh.cgImage, let rahmen = sichtbarerRahmen(cg), let teil = cg.cropping(to: rahmen) else { return nil }
        let b = UIImage(cgImage: teil)
        cache[code] = b
        return b
    }

    /// Kontinent oder Erde als Umriss im Flaggen-Kaestchen wie im Web (TeamHerkunft.tsx), 4:3: dunkel cyan auf slate-900,
    /// hell dunkles Cyan (#0e7490, Akzent des hellen Bildes) auf slate-100.
    static func kontinent(_ k: String, hell: Bool) -> UIImage? {
        let schluessel: String = "k:" + k + (hell ? "|hell" : "")
        if let b = cache[schluessel] { return b }
        guard let d = KontinentPfade.pfad(k) else { return nil }
        let fmt = UIGraphicsImageRendererFormat.default()
        fmt.scale = 1
        let massstab: CGFloat = 4
        let b = UIGraphicsImageRenderer(size: CGSize(width: 48 * massstab, height: 36 * massstab), format: fmt).image { ctx in
            let g = ctx.cgContext
            g.setFillColor(hell ? UIColor(red: 0.95, green: 0.96, blue: 0.98, alpha: 1).cgColor     // slate-100
                                : UIColor(red: 0.06, green: 0.09, blue: 0.16, alpha: 1).cgColor)    // slate-900
            g.fill(CGRect(x: 0, y: 0, width: 48 * massstab, height: 36 * massstab))
            g.scaleBy(x: massstab, y: massstab)
            g.addPath(svgPfad(d))
            g.setFillColor(hell ? UIColor(red: 0.05, green: 0.45, blue: 0.56, alpha: 1).cgColor     // #0e7490
                                : UIColor(red: 0.13, green: 0.83, blue: 0.93, alpha: 1).cgColor)    // brand-400 #22d3ee
            g.fillPath()
        }
        cache[schluessel] = b
        return b
    }

    /// SVG-Pfad aus M/L/Z mit absoluten Zahlen (so erzeugt scripts/kontinente-erzeugen.py ihn).
    private static func svgPfad(_ d: String) -> CGPath {
        let p = CGMutablePath()
        var befehl: Character = "M"
        var zahlen: [CGFloat] = []
        var zahl = ""
        func zahlFertig() {
            if let v = Double(zahl) { zahlen.append(CGFloat(v)) }
            zahl = ""
            if zahlen.count == 2 {
                let pt = CGPoint(x: zahlen[0], y: zahlen[1])
                if befehl == "M" { p.move(to: pt); befehl = "L" } else { p.addLine(to: pt) }
                zahlen = []
            }
        }
        for c in d {
            if c == "M" || c == "L" { zahlFertig(); befehl = c }
            else if c == "Z" { zahlFertig(); p.closeSubpath() }
            else if c == " " || c == "," { zahlFertig() }
            else if c == "-" && !zahl.isEmpty { zahlFertig(); zahl.append(c) }
            else { zahl.append(c) }
        }
        zahlFertig()
        return p
    }

    /// Kleinstes Rechteck um alle nicht durchsichtigen Pixel.
    private static func sichtbarerRahmen(_ cg: CGImage) -> CGRect? {
        let w = cg.width, h = cg.height
        var px = [UInt8](repeating: 0, count: w * h * 4)
        guard let ctx = CGContext(data: &px, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                                  space: CGColorSpaceCreateDeviceRGB(),
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
        var x0 = w, y0 = h, x1 = -1, y1 = -1
        for y in 0..<h {
            for x in 0..<w where px[(y * w + x) * 4 + 3] > 24 {
                if x < x0 { x0 = x }
                if x > x1 { x1 = x }
                if y < y0 { y0 = y }
                if y > y1 { y1 = y }
            }
        }
        guard x1 >= x0, y1 >= y0 else { return nil }
        return CGRect(x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1)
    }
}

/// Herkunft eines Teams neben dem Namen (web TeamHerkunft.tsx): Land als Flagge, Kontinent/Erde als Kuerzel.
struct TeamHerkunftMarke: View {
    let land: String?
    var gross: Bool = false
    /// `false`: nur der Umriss, ohne „EU" daneben (web `kuerzel={false}`, Team-Wertung globaler Events).
    var kuerzel: Bool = true
    @Environment(\.colorScheme) private var schema

    var body: some View {
        if let e = teamFlaggenEmoji(land) {
            Text(e).font(.system(size: gross ? 18 : 13))
        } else if let l = land, l.hasPrefix("k:") {
            HStack(spacing: 3) {
                if let b = TeamFlaggenBild.kontinent(String(l.dropFirst(2)), hell: schema == .light) {
                    Image(uiImage: b).resizable().frame(width: gross ? 24 : 18, height: gross ? 18 : 13.5)
                        .clipShape(RoundedRectangle(cornerRadius: 2))
                } else {
                    Image(systemName: "globe").font(.system(size: gross ? 13 : 10)).foregroundStyle(Color.accentColor)
                }
                if kuerzel {
                    Text(String(l.dropFirst(2)).uppercased()).font(.system(size: gross ? 12 : 10, weight: .semibold))
                        .foregroundStyle(.secondary)
                }
            }
        }
    }
}
