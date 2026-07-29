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
// Größenstufen: EXAKT dieselbe Ableitung wie die PWA-Vorschau (web/src/lib/watchLayout.ts:58-91)
// und die Wear-Fassung — nicht geschätzt. Grundlage ist eine echte Messung im Connect-IQ-Simulator
// (fenix7xpro, 280 px breit): Stufe i zeichnet "18.5" FONT_INK_W_280[i] Pixel breit. Daraus die
// Schriftgröße: Größe = Tintenbreite / Vorschub-pro-px / Referenzbreite.
//
// Meine ersten Werte waren frei geschätzt und 32–56 % ZU GROSS — Jans Befund "Schrift etwas zu
// gross", mit Labels, die in die Werte liefen. Dynamic Type wird bewusst NICHT mitskaliert:
// absolut positionierte Elemente würden sonst überlappen.
private let FONT_INK_W_280: [CGFloat] = [29, 46, 50, 61, 64, 82, 99, 146, 166]
private let FONT_REF_W: CGFloat = 280
/// Vorschub von "18.5" je 1 pt Schriftgröße (3 tabellarische Ziffern + Punkt).
private let SAMPLE_ADV: CGFloat = 1.973
private let LAYOUT_SIZE_FACTORS: [CGFloat] = FONT_INK_W_280.map { $0 / SAMPLE_ADV / FONT_REF_W }

func layoutFontSize(_ step: Int, width: CGFloat) -> CGFloat {
    let i = min(max(step, 0), LAYOUT_SIZE_FACTORS.count - 1)
    return max(7, width * LAYOUT_SIZE_FACTORS[i])
}

// Farbpalette 1…15 = PALETTE in server/app/api/layouts.py (Quelle der Wahrheit, die PWA spiegelt
// sie). Garmin rundet auf seine Hardware-Farbkonstanten; watchOS kann die echten Werte zeichnen,
// deshalb hier exakt die Palette statt Garmins Rundung.
private func hexColor(_ v: UInt32) -> Color {
    Color(red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255,
          blue: Double(v & 0xFF) / 255)
}
private let LAYOUT_PALETTE: [Color] = [
    hexColor(0xFFFFFF), hexColor(0xD0D0D0), hexColor(0x808080), hexColor(0x000000),
    hexColor(0xFF0000), hexColor(0xFF5500), hexColor(0xFFAA00), hexColor(0xFFFF00),
    hexColor(0x00FF00), hexColor(0x00AA00), hexColor(0x00FFFF), hexColor(0x22D3EE),
    hexColor(0x0055FF), hexColor(0xAA00FF), hexColor(0xFF00AA),
]
/// Rollen-Vorgaben für Palette 0 ("auto") — identisch mit paletteColor() in der Vorschau.
let autoValueColor = hexColor(0xFFFFFF)
let autoLabelColor = hexColor(0xD0D0D0)
let autoLineColor = hexColor(0x808080)

/// Palette-Index -> Farbe; 0 ("auto") und Unbekanntes -> Vorgabe des Aufrufers.
func layoutColor(_ idx: Int, _ fallback: Color) -> Color {
    let i = idx - 1
    return (i >= 0 && i < LAYOUT_PALETTE.count) ? LAYOUT_PALETTE[i] : fallback
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
    /// Ist die Aufnahme WIRKLICH pausiert? Nur dann zeichnet Element typ 7 seinen Hinweis.
    let paused: Bool
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
            .stroke(layoutColor(e.color, autoLineColor), lineWidth: CGFloat(max(e.step, 1)))
        }
    }

    @ViewBuilder private func contentIfNeeded(_ e: LayoutElement, w: CGFloat, h: CGFloat) -> some View {
        let px = w * CGFloat(e.x) / 1000
        let py = h * CGFloat(e.y) / 1000
        switch e.typ {
        case 5:
            // REC = Punkt UND "REC"-Text (Garmin _drawRec, Vorschau EL_REC); vorher nur ein Punkt.
            if recording {
                recIndicator(e, px: px, py: py, w: w, color: layoutColor(e.color, LAYOUT_PALETTE[4]))
            }
        case 6:
            pageDots(e, px: px, py: py, w: w, color: layoutColor(e.color, autoLabelColor))
        case 7:
            // „Pausiert"-Hinweis NUR bei echter Pause: mit „Alle Seiten durchblättern" laufen die
            // Pausen-Layouts auch während der Aufnahme durch den Ring, dort wäre er falsch
            // (Jan, 29.07.). Garmin macht es jetzt genauso (RecordView._drawElement).
            if paused {
                layoutText(pausedText, e, px: px, py: py, w: w,
                           step: min(e.step, 2),
                           color: layoutColor(e.color, autoLabelColor), bold: true)
            }
        case 1, 2, 3:
            let txt = textFor(e)
            if !txt.isEmpty {
                let byValue = (e.typ == 1 && (e.flags & 4) != 0) ? fieldColor(e.extraInt ?? 0) : nil
                let col = byValue ?? layoutColor(e.color, e.typ == 1 ? autoValueColor : autoLabelColor)
                // Nur Werte sind fett — genau wie in der Vorschau.
                layoutText(txt, e, px: px, py: py, w: w, step: e.step, color: col, bold: e.typ == 1)
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
        _ txt: String, _ e: LayoutElement, px: CGFloat, py: CGFloat, w: CGFloat, step: Int,
        color: Color, bold: Bool
    ) -> some View {
        let size = layoutFontSize(step, width: w)
        // Normale Sans (nicht .rounded) und nur Werte fett — sonst weicht es von der Vorschau ab.
        Text(txt)
            .font(.system(size: size, weight: bold ? .bold : .regular))
            .monospacedDigit()
            .foregroundStyle(color)
            .lineLimit(1)
            .fixedSize()
            .frame(maxWidth: w, alignment: alignmentFor(e.flags))
            .position(x: anchorX(e.flags, px: px, w: w), y: py)
    }

    /// Linke Kante der Punktgruppe, ausgerichtet wie Text (flags Bit0 links, Bit1 rechts).
    private func dotsStartX(_ flags: Int, px: CGFloat, total: CGFloat, d: CGFloat) -> CGFloat {
        if (flags & 1) != 0 { return px + d / 2 }
        if (flags & 2) != 0 { return px - total - d / 2 }
        return px - total / 2
    }

    /// REC-Indikator: Punkt + "REC" als Gruppe (Vorschau: Punkt 3 % der Breite, Schrift 5,5 %,
    /// Abstand halber Punkt). Ausrichtung wie bei Text.
    @ViewBuilder private func recIndicator(
        _ e: LayoutElement, px: CGFloat, py: CGFloat, w: CGFloat, color: Color
    ) -> some View {
        let d = max(4, w * 0.03)
        HStack(spacing: d / 2) {
            Circle().fill(color).frame(width: d, height: d)
            Text("REC").font(.system(size: max(7, w * 0.055))).foregroundStyle(color)
        }
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

    // Seiten-Punkte AN DER ELEMENT-POSITION (Vorschau EL_DOTS: Durchmesser 2,2 % der Breite,
    // Abstand = Durchmesser, inaktiv 35 % Deckkraft).
    //
    // Bewusste Abweichung von Garmin: dort ignoriert _drawPageDots x/y und zeichnet immer unten
    // mittig. Beim Standard-Element (500/920) kommt dasselbe heraus, aber wer die Punkte
    // verschiebt, sieht es hier — und nur so stimmt es mit der Vorschau.
    @ViewBuilder private func pageDots(
        _ e: LayoutElement, px: CGFloat, py: CGFloat, w: CGFloat, color: Color
    ) -> some View {
        let n = min(max(pageCount, 1), 12)
        if n > 1 {
            let d = w * 0.022
            let stepX = d * 2
            let total = CGFloat(n - 1) * stepX
            let startX = dotsStartX(e.flags, px: px, total: total, d: d)
            ForEach(0..<n, id: \.self) { i in
                Circle()
                    .fill(color.opacity(i == pageIndex ? 1 : 0.35))
                    .frame(width: d, height: d)
                    .position(x: startX + CGFloat(i) * stepX, y: py)
            }
        }
    }
}
