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
]

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
        for e in elements {
            let typ = int(e, 0)
            if typ == EL_LINE { continue }
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
