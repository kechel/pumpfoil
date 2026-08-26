import SwiftUI

// LESENDE Vorschau eines eigenen Uhr-Layouts — kein Editor.
//
// Entscheidung Jan (2026-08-17): "den Layout-Editor brauchen wir nativ nicht, das macht man eh nur
// am pc". Anzeige, Galerie und Auswahl per Vorschau sollen aber gehen. Diese Datei ZEICHNET nur.
// Zum Bauen/Ändern verweist die App auf den Browser.
//
// Spiegel von android/.../LayoutRender.kt und web/src/components/LayoutPreview.tsx. Beim Ändern
// dort muss es HIER mit — die Uhr ist die Wahrheit, Web/Android/iOS sind drei Nachbauten.
//
// Datenmodell (identisch zum Server, s. server/app/api/layouts.py):
//   Ein Element ist eine Liste: [typ, x, y, size, color, flags, extra, extra2]
//   x/y sind RELATIV 0…1000 (nicht Pixel) — dadurch passt ein Layout auf jede Auflösung.
//   flags: Bit0 linksbündig · Bit1 rechtsbündig · Bit2 Farbe nach Wert (nur Werte)
//   extra: bei Werten/Labels die Feld-ID, bei Freitext der Text, bei Linien der 2. Punkt.

private let EL_VALUE = 1
private let EL_LABEL = 2
private let EL_TEXT = 3
private let EL_LINE = 4
private let EL_REC = 5
private let EL_DOTS = 6
private let EL_PAUSED = 7
// Wert-Grafiken (Spiegel von watchLayout.ts EL_ARC/EL_BAR):
//   8 = Rand-Grafik: x = Start auf dem Display-UMFANG (0…1000 ab 12 Uhr im Uhrzeigersinn),
//       y = Länge desselben Umfangs, size = Dicke 1…4, extra = Feld-ID. Runde Uhr -> Ringsegment,
//       eckige -> Rahmensegment; das entscheidet DIESER Renderer aus der Gehäuseform.
//   9 = Balken: x/y = Mitte, size = Dicke, extra = Feld-ID, extra2 = Breite 50…1000.
// flags Bit0 färbt beide nach Zone/Skala (bei Grafiken also NICHT „linksbündig" — eine Grafik hat
// keine Textausrichtung).
private let EL_ARC = 8
private let EL_BAR = 9

/// Kuratierte Palette, Index = `color`. Spiegel von layouts.py PALETTE.
/// Index 0 = „auto": die Uhr entscheidet (Werte weiß, Labels hellgrau).
private let PALETTE: [Color?] = [
    nil,
    Color(white: 1.0), Color(white: 0.816), Color(white: 0.502), Color(white: 0.0),
    Color(red: 1, green: 0, blue: 0), Color(red: 1, green: 0.333, blue: 0),
    Color(red: 1, green: 0.667, blue: 0), Color(red: 1, green: 1, blue: 0),
    Color(red: 0, green: 1, blue: 0), Color(red: 0, green: 0.667, blue: 0),
    Color(red: 0, green: 1, blue: 1), Color(red: 0.133, green: 0.827, blue: 0.933),
    Color(red: 0, green: 0.333, blue: 1),
    Color(red: 0.667, green: 0, blue: 1), Color(red: 1, green: 0, blue: 0.667),
]

/// Zonen-Farben Z1…Z5 der Wert-Grafiken (Spiegel von ZONE_COLORS in watchLayout.ts).
private let ZONE_COLORS: [Color] = [
    Color(red: 0.231, green: 0.510, blue: 0.965),
    Color(red: 0.133, green: 0.773, blue: 0.369),
    Color(red: 0.918, green: 0.702, blue: 0.031),
    Color(red: 0.976, green: 0.451, blue: 0.086),
    Color(red: 0.937, green: 0.267, blue: 0.267),
]

/// Skalen der Wert-Grafiken. Die Puls-Zonen kommen aus dem PROFIL (`settings.hr_zones`): nur Garmin
/// und Zepp können die Zonen der Uhr selbst lesen, watchOS und Wear OS haben keine API dafür.
/// Bewusst gemeinsamer Zustand statt eines Parameters an jeder Vorschau — die Skala gehört dem
/// NUTZER, nicht dem einzelnen Layout, und wird an drei Stellen gezeichnet.
enum LayoutScales {
    static var hrZones: [Int] = [95, 114, 133, 152, 171, 190]
    static var speedLo: Int = 8
    static var speedHi: Int = 25

    static func aus(hrZones z: [Int]?, speedMin: Int?, speedMax: Int?) {
        if let z = z, z.count == 6 { hrZones = z }
        if let lo = speedMin, lo > 0 { speedLo = lo }
        if let hi = speedMax, hi > 0 { speedHi = hi }
    }
}

/// Füllgrad 0…1 eines Wertes auf seiner Skala (außerhalb gekappt, nicht extrapoliert).
private func fuellgrad(_ fieldId: Int, _ v: Double) -> Double {
    var lo = Double(LayoutScales.speedLo)
    var hi = Double(LayoutScales.speedHi)
    if HR_FIELDS.contains(fieldId) {
        lo = Double(LayoutScales.hrZones.first ?? 0)
        hi = Double(LayoutScales.hrZones.last ?? 0)
    }
    if hi <= lo { return 0 }
    return min(max((v - lo) / (hi - lo), 0), 1)
}

/// Zone 0…4 eines Wertes. Geschwindigkeit hat im Profil keine Zonen -> Spanne in fünf Stufen.
private func zone(_ fieldId: Int, _ v: Double) -> Int {
    var grenzen: [Double] = []
    if HR_FIELDS.contains(fieldId) {
        grenzen = LayoutScales.hrZones.map { Double($0) }
    } else {
        let lo = Double(LayoutScales.speedLo)
        let hi = Double(LayoutScales.speedHi)
        for i in 0...5 { grenzen.append(lo + (hi - lo) * Double(i) / 5.0) }
    }
    var z = 0
    if grenzen.count > 2 {
        for i in 1..<(grenzen.count - 1) where v >= grenzen[i] { z = i }
    }
    return min(max(z, 0), ZONE_COLORS.count - 1)
}

/// Punkt auf dem Display-RAND, Parameter 0…1 ab 12 Uhr im Uhrzeigersinn (Spiegel von edgePoint).
private func randPunkt(_ rund: Bool, _ w: CGFloat, _ h: CGFloat, _ inset: CGFloat, _ p: Double) -> CGPoint {
    let f = CGFloat((p.truncatingRemainder(dividingBy: 1) + 1).truncatingRemainder(dividingBy: 1))
    if rund {
        let a = f * 2 * .pi - .pi / 2
        return CGPoint(x: w / 2 + (w / 2 - inset) * cos(a), y: h / 2 + (h / 2 - inset) * sin(a))
    }
    let bw = w - 2 * inset
    let bh = h - 2 * inset
    var d = f * 2 * (bw + bh)
    if d < bw / 2 { return CGPoint(x: inset + bw / 2 + d, y: inset) }
    d -= bw / 2
    if d < bh { return CGPoint(x: w - inset, y: inset + d) }
    d -= bh
    if d < bw { return CGPoint(x: w - inset - d, y: h - inset) }
    d -= bw
    if d < bh { return CGPoint(x: inset, y: h - inset - d) }
    d -= bh
    return CGPoint(x: inset + d, y: inset)
}

/// Randsegment als Pfad (Start/Länge 0…1000). Gesampelt: rund und eckig gehen EINEN Weg.
private func randPfad(_ rund: Bool, _ w: CGFloat, _ h: CGFloat, _ inset: CGFloat,
                      _ start: Double, _ laenge: Double) -> Path {
    let l = min(max(laenge / 1000, 0), 1)
    let s0 = start.truncatingRemainder(dividingBy: 1000) / 1000
    let n = max(6, Int(l * 120))
    var pfad = Path()
    for i in 0...n {
        let pt = randPunkt(rund, w, h, inset, s0 + l * Double(i) / Double(n))
        if i == 0 { pfad.move(to: pt) } else { pfad.addLine(to: pt) }
    }
    return pfad
}

/// Fontgröße als Anteil der Displaybreite, je Größenstufe. Abgeleitet aus watchLayout.ts
/// (FONT_MEASURED/SAMPLE_ADV/FONT_REF_W) — dieselben Zahlen wie Web und Android.
private let SIZE_FACTOR: [CGFloat] = [
    0.05249, 0.08327, 0.09051, 0.11042, 0.11585, 0.14843, 0.17920, 0.26428, 0.30049,
]

/// Beispielwerte je Feld-ID — Spiegel von MOCK_VALUE in watchLayout.ts. Echte Textbreiten machen
/// die Vorschau ehrlich: ein Layout, das im Editor passt, aber auf der Uhr überläuft, fällt auf.
private let MOCK_VALUE: [Int: String] = [
    1: "18.5", 5: "19.2", 6: "15.1", 7: "24.0",
    2: "142", 8: "131", 9: "168",
    3: "12:34", 4: "2.10", 10: "402", 13: "35",
    11: "24", 12: "14:25", 14: "0:48", 15: "0.21",
    16: "0:51", 17: "0.22", 18: "14.9", 19: "19.6", 20: "7", 21: "162",
]

private let SPEED_FIELDS: Set<Int> = [1, 5, 6, 7, 18, 19]
private let HR_FIELDS: Set<Int> = [2, 8, 9, 21]

private func farbe(_ idx: Int, _ rolle: String) -> Color {
    if idx >= 0, idx < PALETTE.count, let c = PALETTE[idx] { return c }
    // „auto": wie die Uhr — Werte weiß, alles andere hellgrau.
    return rolle == "value" ? .white : Color(white: 0.816)
}

/// Farbe nach Wert (flags Bit2): dieselben Schwellen wie Uhr/Web, nur Speed und Puls.
private func wertFarbe(_ fieldId: Int) -> Color? {
    guard let v = Double(MOCK_VALUE[fieldId] ?? "") else { return nil }
    if SPEED_FIELDS.contains(fieldId) {
        if v < 12 { return Color(white: 0.502) }
        if v < 18 { return Color(red: 0, green: 1, blue: 1) }
        if v < 24 { return Color(red: 0, green: 1, blue: 0) }
        return Color(red: 1, green: 0.667, blue: 0)
    }
    if HR_FIELDS.contains(fieldId) {
        if v < 120 { return Color(red: 0, green: 1, blue: 0) }
        if v < 150 { return Color(red: 1, green: 1, blue: 0) }
        if v < 170 { return Color(red: 1, green: 0.333, blue: 0) }
        return Color(red: 1, green: 0, blue: 0)
    }
    return nil
}

/// Zeichnet ein Layout so, wie die Uhr es zeichnen würde.
///
/// ABWEICHUNG, bewusst: Labels zeigen `field.<id>` statt der KURZEN Uhr-Texte (`fw.<id>` im Web).
/// Die Kurzformen liegen nur in den Uhr-Sprachdateien; sie hier nachzuziehen wären 20 Keys × 16
/// Sprachen für einen Breitenunterschied. Zum Wiedererkennen genügt der lange Name.
struct WatchLayoutPreview: View {
    let elements: [[LayoutValue]]
    let bgColor: Int
    let shape: String
    let w: Int
    let h: Int
    var px: CGFloat = 120
    /// Seiten-Punkte sind auf der Uhr DYNAMISCH: so viele Punkte wie Seiten. Wer den echten Wert
    /// kennt, gibt ihn mit — sonst lügt die Vorschau über die Anzahl.
    var pageCount: Int = 3
    var pageIndex: Int = 0
    var lang: String = "en"

    private var boxH: CGFloat { px * (w > 0 ? CGFloat(h) / CGFloat(w) : 1) }

    var body: some View {
        Canvas { ctx, size in
            zeichne(&ctx, size)
        }
        .frame(width: px, height: boxH)
        .background(bgColor == 0 ? Color.black : farbe(bgColor, "value"))
        .clipShape(maske)
        .overlay(maske.stroke(Color.secondary.opacity(0.5), lineWidth: 1))
    }

    /// EIN Shape-Typ statt zweier: ein Kreis ist ein RoundedRectangle mit Radius = halbe Seite.
    /// So bleibt der Rückgabetyp konkret — `some Shape` könnte Circle und RoundedRectangle nicht
    /// beide liefern, und `@ViewBuilder` baut Views, keine Shapes. AnyShape gäbe es erst ab
    /// iOS 17, das wollen wir hier nicht erzwingen.
    /// semioctagon (Instinct-Klasse) wird als abgerundetes Rechteck angedeutet — ein echtes Achteck
    /// lohnt in dieser Größe nicht.
    private var maske: RoundedRectangle {
        RoundedRectangle(cornerRadius: shape == "round" ? px / 2 : px * 0.14)
    }

    private func zeichne(_ ctx: inout GraphicsContext, _ size: CGSize) {
        // Trennlinien zuerst — sie liegen hinter dem Text.
        for e in elements where int(e, 0) == EL_LINE {
            var pfad = Path()
            pfad.move(to: CGPoint(x: rel(e, 1, size.width), y: rel(e, 2, size.height)))
            pfad.addLine(to: CGPoint(x: rel(e, 6, size.width), y: rel(e, 7, size.height)))
            ctx.stroke(pfad, with: .color(farbe(int(e, 4), "line")),
                       lineWidth: max(1, CGFloat(num(e, 3))))
        }
        // Wert-Grafiken vor dem Text: leerer Track + gefüllter Anteil, damit die Skala auch bei
        // kleinem Wert erkennbar bleibt.
        for e in elements where int(e, 0) == EL_ARC || int(e, 0) == EL_BAR {
            grafik(&ctx, e, size)
        }
        for e in elements {
            let typ = int(e, 0)
            if typ == EL_LINE || typ == EL_ARC || typ == EL_BAR { continue }
            let x = rel(e, 1, size.width)
            let y = rel(e, 2, size.height)
            let flags = int(e, 5)
            switch typ {
            case EL_VALUE:
                let fid = int(e, 6)
                let c = (flags & 4 != 0 ? wertFarbe(fid) : nil) ?? farbe(int(e, 4), "value")
                text(&ctx, MOCK_VALUE[fid] ?? "--", x, y, stufe(e), c, flags, size.width, true)
            case EL_LABEL:
                text(&ctx, Loc.t("field.\(int(e, 6))", lang), x, y, stufe(e),
                     farbe(int(e, 4), "label"), flags, size.width, false)
            case EL_TEXT:
                text(&ctx, str(e, 6), x, y, stufe(e), farbe(int(e, 4), "label"), flags, size.width, false)
            case EL_PAUSED:
                text(&ctx, Loc.t("lay.pausedHint", lang), x, y, stufe(e),
                     farbe(int(e, 4), "label"), flags, size.width, true)
            case EL_REC:
                let c = farbe(int(e, 4) == 0 ? 5 : int(e, 4), "value")
                let r = max(2, size.width * 0.015)
                ctx.fill(Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)),
                         with: .color(c))
                text(&ctx, "REC", x + r * 2.5, y, 0, c, 1, size.width, false)
            case EL_DOTS:
                let c = farbe(int(e, 4) == 0 ? 2 : int(e, 4), "label")
                let r = max(1.5, size.width * 0.011)
                let n = min(max(pageCount, 1), 12)
                let abstand = r * 4
                let start = x - CGFloat(n - 1) * abstand / 2
                for d in 0..<n {
                    let cx = start + CGFloat(d) * abstand
                    ctx.fill(Path(ellipseIn: CGRect(x: cx - r, y: y - r, width: r * 2, height: r * 2)),
                             with: .color(c.opacity(d == pageIndex ? 1 : 0.35)))
                }
            default:
                break
            }
        }
    }

    /// Rand-Grafik bzw. Balken. Bewusst in eine eigene Funktion: SwiftUIs Type-Checker wird bei
    /// langen Ausdrücken in einem Canvas-Block schnell unbrauchbar langsam.
    private func grafik(_ ctx: inout GraphicsContext, _ e: [LayoutValue], _ size: CGSize) {
        let fid = int(e, 6)
        let wert = Double(MOCK_VALUE[fid] ?? "") ?? 0
        let anteil = fuellgrad(fid, wert)
        let nachSkala = int(e, 5) & 1 != 0
        let grund: Color = nachSkala ? ZONE_COLORS[zone(fid, wert)] : farbe(int(e, 4), "value")
        let stufeD = CGFloat(min(max(int(e, 3), 1), 4))
        let dicke = max(2, size.width * 0.018 * stufeD)
        if int(e, 0) == EL_ARC {
            let rund = shape != "rect"
            let inset = dicke / 2 + 1
            let laenge = min(max(num(e, 2), 0), 1000)
            let track = randPfad(rund, size.width, size.height, inset, num(e, 1), laenge)
            ctx.stroke(track, with: .color(grund.opacity(0.25)), lineWidth: dicke)
            if anteil > 0 {
                let voll = randPfad(rund, size.width, size.height, inset, num(e, 1), laenge * anteil)
                ctx.stroke(voll, with: .color(grund), lineWidth: dicke)
            }
        } else {
            let breite = CGFloat(min(max(num(e, 7), 50), 1000)) / 1000 * size.width
            let x0 = rel(e, 1, size.width) - breite / 2
            let y0 = rel(e, 2, size.height) - dicke / 2
            let leer = CGRect(x: x0, y: y0, width: breite, height: dicke)
            ctx.fill(Path(roundedRect: leer, cornerRadius: dicke / 2), with: .color(grund.opacity(0.25)))
            if anteil > 0 {
                let vollBreite = max(dicke, breite * CGFloat(anteil))
                let voll = CGRect(x: x0, y: y0, width: vollBreite, height: dicke)
                ctx.fill(Path(roundedRect: voll, cornerRadius: dicke / 2), with: .color(grund))
            }
        }
    }

    /// Text an relativer Position. Die Uhr zentriert um den Punkt; flags kippen auf links/rechts.
    private func text(_ ctx: inout GraphicsContext, _ s: String, _ x: CGFloat, _ y: CGFloat,
                      _ stufe: Int, _ c: Color, _ flags: Int, _ breite: CGFloat, _ fett: Bool) {
        if s.isEmpty { return }
        let groesse = max(7, SIZE_FACTOR[stufe] * breite)
        var t = ctx.resolve(Text(s).font(.system(size: groesse, weight: fett ? .bold : .regular)))
        t.shading = .color(c)
        let m = t.measure(in: CGSize(width: breite * 2, height: breite))
        let bx: CGFloat = flags & 1 != 0 ? x : (flags & 2 != 0 ? x - m.width : x - m.width / 2)
        ctx.draw(t, in: CGRect(x: bx, y: y - m.height / 2, width: m.width, height: m.height))
    }

    private func num(_ e: [LayoutValue], _ i: Int) -> Double { i < e.count ? e[i].alsZahl : 0 }
    private func int(_ e: [LayoutValue], _ i: Int) -> Int { i < e.count ? e[i].alsInt : 0 }
    private func str(_ e: [LayoutValue], _ i: Int) -> String { i < e.count ? e[i].alsText : "" }
    private func rel(_ e: [LayoutValue], _ i: Int, _ span: CGFloat) -> CGFloat {
        CGFloat(num(e, i)) / 1000 * span
    }
    private func stufe(_ e: [LayoutValue]) -> Int {
        min(max(int(e, 3), 0), SIZE_FACTOR.count - 1)
    }
}
