import SwiftUI

// Eigene Layouts auf der Apple Watch zeichnen — portiert von watch/source/RecordView.mc
// (Garmin ist die Referenz) und deckungsgleich mit der Wear-Fassung
// (android/wear/.../WatchLayout.kt). Elementformat: [typ, x, y, size, color, flags, extra…],
// Koordinaten sind PROMILLE der Displaybreite/-höhe, damit dasselbe Layout auf 40 mm wie auf
// Ultra passt.
//
//   typ 1 = Wert eines Datenfelds   (extra = Feld-ID; flags Bit2 = Farbe nach Wert)
//   typ 2 = übersetztes Feld-Label  (extra = Feld-ID)
//   typ 3 = Freitext                (extra = Text)
//   typ 4 = Trennlinie              (extra = Zielpunkt x2,y2; size = Strichbreite)
//   typ 5 = REC-Punkt
//   typ 6 = Seiten-Punkte
//   typ 7 = „Pausiert"-Hinweis      (Pflicht in Pausen-Layouts, nicht entfernbar)
//   flags Bit0 = links, Bit1 = rechts, sonst zentriert
//
// Die Größenstufen sind NICHT die Garmin-Zahlen (das sind gemessene Connect-IQ-Fonts). watchOS
// skaliert frei, also bilden die Stufen 0…8 auf einen Anteil der Displaybreite ab — gleiche
// Verhältnisse wie im Editor, plattformeigen gerechnet. Dynamic Type wird bewusst NICHT
// mitskaliert: absolut positionierte Elemente würden sonst überlappen.
private let LAYOUT_SIZE_FACTORS: [CGFloat] = [0.075, 0.11, 0.13, 0.15, 0.17, 0.23, 0.28, 0.36, 0.42]

func layoutFontSize(_ step: Int, width: CGFloat) -> CGFloat {
    let i = min(max(step, 0), LAYOUT_SIZE_FACTORS.count - 1)
    return width * LAYOUT_SIZE_FACTORS[i]
}

/// Farbpalette 1…15 wie RecordView.mc:_layoutColor; 0/unbekannt -> Vorgabe des Aufrufers.
func layoutColor(_ idx: Int, _ fallback: Color) -> Color {
    switch idx {
    case 1: return .white
    case 2: return Color(red: 0.67, green: 0.67, blue: 0.67)
    case 3: return Color(red: 0.33, green: 0.33, blue: 0.33)
    case 4: return .black
    case 5: return Color(red: 1, green: 0, blue: 0)
    case 6: return Color(red: 1, green: 0.33, blue: 0)
    case 7: return Color(red: 1, green: 0.67, blue: 0)
    case 8: return Color(red: 1, green: 1, blue: 0)
    case 9: return Color(red: 0, green: 1, blue: 0)
    case 10: return Color(red: 0, green: 0.53, blue: 0)
    case 11: return Color(red: 0, green: 1, blue: 1)
    case 12: return Color(red: 0.13, green: 0.83, blue: 0.93)   // Marken-Cyan
    case 13: return Color(red: 0, green: 0, blue: 1)
    case 14: return Color(red: 0.67, green: 0, blue: 1)
    case 15: return Color(red: 1, green: 0, blue: 0.67)
    default: return fallback
    }
}

/// Ein Wert aus dem Layout-JSON. Die Element-Arrays sind gemischt (Zahlen und, bei Freitext,
/// Strings) — deshalb kein `[Int]`, sondern diese kleine Variante.
enum LayoutPrim: Codable {
    case int(Int)
    case dbl(Double)
    case str(String)
    case none

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .none; return }
        if let i = try? c.decode(Int.self) { self = .int(i); return }
        if let d = try? c.decode(Double.self) { self = .dbl(d); return }
        if let s = try? c.decode(String.self) { self = .str(s); return }
        self = .none
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .int(let i): try c.encode(i)
        case .dbl(let d): try c.encode(d)
        case .str(let s): try c.encode(s)
        case .none: try c.encodeNil()
        }
    }

    var asInt: Int {
        switch self {
        case .int(let i): return i
        case .dbl(let d): return Int(d)
        case .str(let s): return Int(s) ?? 0
        case .none: return 0
        }
    }

    var asString: String {
        switch self {
        case .str(let s): return s
        case .int(let i): return String(i)
        case .dbl(let d): return String(d)
        case .none: return ""
        }
    }
}

struct LayoutElement {
    let typ: Int
    let x: Int
    let y: Int
    let step: Int
    let color: Int
    let flags: Int
    let extraInt: Int?
    let extraText: String?
    let x2: Int?
    let y2: Int?

    init(_ raw: [LayoutPrim]) {
        typ = raw.count > 0 ? raw[0].asInt : 0
        x = raw.count > 1 ? raw[1].asInt : 0
        y = raw.count > 2 ? raw[2].asInt : 0
        step = raw.count > 3 ? raw[3].asInt : 0
        color = raw.count > 4 ? raw[4].asInt : 0
        flags = raw.count > 5 ? raw[5].asInt : 0
        extraText = (typ == 3 && raw.count > 6) ? raw[6].asString : nil
        extraInt = (typ != 3 && raw.count > 6) ? raw[6].asInt : nil
        x2 = (typ == 4 && raw.count > 6) ? raw[6].asInt : nil
        y2 = (typ == 4 && raw.count > 7) ? raw[7].asInt : nil
    }
}

struct LayoutPageDef {
    let bg: Int
    let elements: [LayoutElement]

    /// Aus einem Layout-Eintrag `[1, bg, [elements…]]`.
    init?(_ raw: [LayoutPrimOrList]) {
        guard raw.count >= 3, case .list(let els) = raw[2] else { return nil }
        bg = raw[1].asIntValue
        elements = els.compactMap { item -> LayoutElement? in
            guard case .list(let e) = item else { return nil }
            let prims = e.map { $0.asPrim }
            return prims.count >= 6 ? LayoutElement(prims) : nil
        }
    }
}

/// Ein Element im Layout-JSON kann ein Wert ODER eine Liste sein (Elemente stecken in Listen).
enum LayoutPrimOrList: Codable {
    case prim(LayoutPrim)
    case list([LayoutPrimOrList])

    init(from decoder: Decoder) throws {
        if let arr = try? [LayoutPrimOrList](from: decoder) { self = .list(arr); return }
        self = .prim(try LayoutPrim(from: decoder))
    }

    func encode(to encoder: Encoder) throws {
        switch self {
        case .prim(let p): try p.encode(to: encoder)
        case .list(let l): try l.encode(to: encoder)
        }
    }

    var asPrim: LayoutPrim {
        if case .prim(let p) = self { return p }
        return .none
    }
    var asIntValue: Int { asPrim.asInt }
}

/// Eine Seite je Zustand: klassische 3-Feld-Seite oder ein eigenes Layout.
///
/// WICHTIG: der Server schickt KEINE Layout-IDs und kein Definitions-Woerterbuch. Jeder Eintrag in
/// `pages`/`offFoilPages`/`pausePages` ist eine Liste mit TAG-Byte vorneweg — genauso wie Garmin es
/// liest (RecordView.mc:98-114), erzeugt in server/app/api/devices.py:_layouts_for_watch:
///   `[0, a, b, c]`         klassische Seite mit drei Feld-IDs
///   `[1, bg, [elemente…]]` eigenes Layout, Hintergrund + Elemente INLINE
enum WatchPageRef {
    case classic([Int])
    case layout(LayoutPageDef)

    /// Aus einem Eintrag von `pages`/`offFoilPages`/`pausePages`.
    init?(_ item: LayoutPrimOrList) {
        guard case .list(let l) = item, !l.isEmpty else { return nil }
        if l[0].asIntValue == 1 {
            guard let def = LayoutPageDef(l) else { return nil }
            self = .layout(def)
        } else {
            // Tag 0: die drei Feld-IDs stehen ab Index 1.
            self = .classic((1..<4).map { $0 < l.count ? l[$0].asIntValue : 0 })
        }
    }
}

// MARK: - Zeichnen

/// Zeichnet eine Layout-Seite. Absolut positionierte Elemente in einem ZStack — für Text ist das
/// in SwiftUI direkter als ein Canvas mit eigener Textmessung, und die Ausrichtung über die
/// flags-Bits lässt sich mit `alignmentGuide`-freier Offset-Rechnung exakt nachbilden.
struct LayoutPageView: View {
    let page: LayoutPageDef
    let pageIndex: Int
    let pageCount: Int
    let recording: Bool
    let pausedText: String
    let fieldValue: (Int) -> String
    let fieldLabel: (Int) -> String
    let fieldColor: (Int) -> Color?

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            ZStack(alignment: .topLeading) {
                // Hintergrundfarbe der Seite zuerst (RecordView.mc:479-481) — sonst bleibt jedes
                // Layout schwarz, obwohl der Nutzer in der PWA eine Farbe gewaehlt hat.
                layoutColor(page.bg, .black).frame(width: w, height: h)
                // Linien zuerst — sonst liegen Striche über den Werten (derselbe 2-Pass wie Garmin).
                ForEach(Array(page.elements.enumerated()), id: \.offset) { pair in
                    lineIfNeeded(pair.element, w: w, h: h)
                }
                ForEach(Array(page.elements.enumerated()), id: \.offset) { pair in
                    contentIfNeeded(pair.element, w: w, h: h)
                }
            }
        }
    }

    @ViewBuilder private func lineIfNeeded(_ e: LayoutElement, w: CGFloat, h: CGFloat) -> some View {
        if e.typ == 4 {
            Path { p in
                p.move(to: CGPoint(x: w * CGFloat(e.x) / 1000, y: h * CGFloat(e.y) / 1000))
                p.addLine(to: CGPoint(x: w * CGFloat(e.x2 ?? e.x) / 1000, y: h * CGFloat(e.y2 ?? e.y) / 1000))
            }
            .stroke(layoutColor(e.color, Color(red: 0.33, green: 0.33, blue: 0.33)),
                    lineWidth: CGFloat(max(e.step, 1)))
        }
    }

    @ViewBuilder private func contentIfNeeded(_ e: LayoutElement, w: CGFloat, h: CGFloat) -> some View {
        let px = w * CGFloat(e.x) / 1000
        let py = h * CGFloat(e.y) / 1000
        switch e.typ {
        case 5:
            if recording {
                Circle()
                    .fill(layoutColor(e.color, Color(red: 1, green: 0, blue: 0)))
                    .frame(width: 8, height: 8)
                    .position(x: px, y: py)
            }
        case 6:
            pageDots(w: w, h: h, active: layoutColor(e.color, Color(red: 0.67, green: 0.67, blue: 0.67)))
        case 7:
            layoutText(pausedText, e, px: px, py: py, w: w,
                       step: min(e.step, 2),
                       color: layoutColor(e.color, Color(red: 0.13, green: 0.83, blue: 0.93)))
        case 1, 2, 3:
            let txt = textFor(e)
            if !txt.isEmpty {
                let byValue = (e.typ == 1 && (e.flags & 4) != 0) ? fieldColor(e.extraInt ?? 0) : nil
                let col = byValue ?? layoutColor(e.color, e.typ == 1 ? .white : Color(red: 0.67, green: 0.67, blue: 0.67))
                layoutText(txt, e, px: px, py: py, w: w, step: e.step, color: col)
            }
        default:
            EmptyView()
        }
    }

    private func textFor(_ e: LayoutElement) -> String {
        switch e.typ {
        case 1: return fieldValue(e.extraInt ?? 0)
        case 2: return fieldLabel(e.extraInt ?? 0)
        default: return e.extraText ?? ""
        }
    }

    // Ausrichtung: flags Bit0 links, Bit1 rechts, sonst zentriert; vertikal immer mittig
    // (entspricht TEXT_JUSTIFY_VCENTER bei Garmin).
    @ViewBuilder private func layoutText(
        _ txt: String, _ e: LayoutElement, px: CGFloat, py: CGFloat, w: CGFloat, step: Int, color: Color
    ) -> some View {
        let size = layoutFontSize(step, width: w)
        Text(txt)
            .font(.system(size: size, weight: .medium, design: .rounded))
            .monospacedDigit()
            .foregroundStyle(color)
            .lineLimit(1)
            .fixedSize()
            .frame(maxWidth: w, alignment: alignmentFor(e.flags))
            .position(x: anchorX(e.flags, px: px, w: w), y: py)
    }

    private func alignmentFor(_ flags: Int) -> Alignment {
        if (flags & 1) != 0 { return .leading }
        if (flags & 2) != 0 { return .trailing }
        return .center
    }

    // `position` setzt den MITTELPUNKT. Für links-/rechtsbündige Elemente wird der Rahmen so
    // verschoben, dass die jeweilige Kante auf x liegt.
    private func anchorX(_ flags: Int, px: CGFloat, w: CGFloat) -> CGFloat {
        if (flags & 1) != 0 { return px + w / 2 }
        if (flags & 2) != 0 { return px - w / 2 }
        return px
    }

    @ViewBuilder private func pageDots(w: CGFloat, h: CGFloat, active: Color) -> some View {
        if pageCount > 1 {
            let r = w * 0.012
            let gap = r * 3
            let startX = w / 2 - CGFloat(pageCount - 1) * gap / 2
            ForEach(0..<pageCount, id: \.self) { i in
                Circle()
                    .fill(i == pageIndex ? active : Color(red: 0.33, green: 0.33, blue: 0.33))
                    .frame(width: r * 2, height: r * 2)
                    .position(x: startX + CGFloat(i) * gap, y: h * 0.92)
            }
        }
    }
}
