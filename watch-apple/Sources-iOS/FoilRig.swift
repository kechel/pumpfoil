import SwiftUI

// Das Foil als Zeichnung — Seitenansicht, Frontansicht, Draufsicht. Portiert aus der PWA
// (web/src/components/FoilRig.tsx) am 25.09.2026, dieselben Pfade, Masse und Farben wie dort und
// in Android (FoilRig.kt). Die ausfuehrlichen Begruendungen stehen in der PWA.
//
// MASSSTAEBLICH in Zentimetern; x nach vorn, z nach oben, Nullpunkt = FRONTFLUEGEL (Drehpunkt in
// allen drei Ansichten). Bildkoordinaten: `p(a, z)` = (a, -z). Canvas dreht wie SVG positiv im
// Uhrzeigersinn, die Transformationen gehen also 1:1 durch. Linienstaerken in Punkten (geteilt
// durch den Massstab), wie `non-scaling-stroke` im Web. `.clipped()`: ein an Land umgedrehtes
// Brett laege sonst weit ausserhalb des ±40°-Rahmens (am Android-Emulator gesehen).

private let mastTiefe: Double = 12
private let mastDicke: Double = 1.8
private let boardDicke: Double = 8
private let rumpfDicke: Double = 2.4
private let frontUeberhoehung: Double = 2.6

private let farbeBoard = Color(red: 0x06 / 255, green: 0xB6 / 255, blue: 0xD4 / 255)   // brand-500
private let farbeTeil = Color(red: 0x94 / 255, green: 0xA3 / 255, blue: 0xB8 / 255)    // slate-400
private let farbeMast = Color(red: 0x64 / 255, green: 0x74 / 255, blue: 0x8B / 255)    // slate-500
// DER STAB IST BLAU (Jan, 25.09.2026) — damit sieht man, ob er vor oder hinter dem Foil liegt.
private let farbeStab = Color(red: 0x0E / 255, green: 0xA5 / 255, blue: 0xE9 / 255)    // sky-500

private func breiteAusLaenge(_ len: Double) -> Double { max(38, min(52, len * 0.55)) }
private func p(_ a: Double, _ z: Double) -> CGPoint { CGPoint(x: a, y: -z) }
private func o(_ y: Double, _ x: Double) -> CGPoint { CGPoint(x: y, y: -x) }

private func profilSeite(_ cx: Double, _ cz: Double, _ tiefe: Double) -> Path {
    var w = Path()
    let t = tiefe * 0.19
    w.move(to: p(cx + tiefe / 2, cz))
    w.addCurve(to: p(cx - tiefe / 2, cz), control1: p(cx + tiefe * 0.2, cz + t), control2: p(cx - tiefe * 0.2, cz + t * 0.8))
    w.addCurve(to: p(cx + tiefe / 2, cz), control1: p(cx - tiefe * 0.2, cz - t * 0.25), control2: p(cx + tiefe * 0.2, cz - t * 0.5))
    w.closeSubpath()
    return w
}

private func fluegelVorn(_ span: Double, _ tiefe: Double, _ z: Double) -> Path {
    var w = Path()
    let b = span / 2
    let sack = span * 0.07
    let t = tiefe * 0.16 * frontUeberhoehung
    let zSpitze = z - sack
    w.move(to: p(-b, zSpitze))
    w.addQuadCurve(to: p(b, zSpitze), control: p(0, z + 2 * t + sack))
    w.addQuadCurve(to: p(-b, zSpitze), control: p(0, z - 0.6 * t + sack))
    w.closeSubpath()
    return w
}

private func fluegelOben(_ span: Double, _ tiefe: Double, _ x: Double) -> Path {
    var w = Path()
    let b = span / 2
    let leWurzel = x + tiefe * 0.5, teWurzel = x - tiefe * 0.5
    let leSpitze = x - tiefe * 0.35, teSpitze = x - tiefe * 0.75
    w.move(to: o(-b, leSpitze))
    w.addQuadCurve(to: o(b, leSpitze), control: o(0, 2 * leWurzel - leSpitze))
    w.addLine(to: o(b, teSpitze))
    w.addQuadCurve(to: o(-b, teSpitze), control: o(0, 2 * teWurzel - teSpitze))
    w.closeSubpath()
    return w
}

private func boardSeite(_ len: Double, _ zUnten: Double) -> Path {
    var w = Path()
    let a = len / 2, d = boardDicke
    w.move(to: p(-a, zUnten + d * 0.25))
    w.addLine(to: p(a * 0.72, zUnten))
    w.addQuadCurve(to: p(a * 0.9, zUnten + d), control: p(a, zUnten + d * 0.2))
    w.addLine(to: p(-a, zUnten + d))
    w.closeSubpath()
    return w
}

private func boardOben(_ len: Double, _ breite: Double) -> Path {
    var w = Path()
    let a = len / 2, b = breite / 2
    w.move(to: o(0, a))
    w.addCurve(to: o(b * 0.75, -a), control1: o(b * 0.85, a * 0.5), control2: o(b, -a * 0.2))
    w.addLine(to: o(-b * 0.75, -a))
    w.addCurve(to: o(0, a), control1: o(-b, -a * 0.2), control2: o(-b * 0.85, a * 0.5))
    w.closeSubpath()
    return w
}

/// Bildausschnitt ueber den ganzen Winkelbereich — steht beim Abspielen still.
private func rahmen(_ punkte: [(Double, Double)], _ maxWinkel: Double, rand: Double = 7) -> CGRect {
    var x0 = Double.greatestFiniteMagnitude, x1 = -Double.greatestFiniteMagnitude
    var z0 = Double.greatestFiniteMagnitude, z1 = -Double.greatestFiniteMagnitude
    var a = -maxWinkel
    while a <= maxWinkel + 1e-9 {
        let r = a * .pi / 180, c = cos(r), s = sin(r)
        for (x, z) in punkte {
            let xx = x * c - z * s, zz = x * s + z * c
            x0 = min(x0, xx); x1 = max(x1, xx); z0 = min(z0, zz); z1 = max(z1, zz)
        }
        a += 5
    }
    return CGRect(x: x0 - rand, y: -(z1 + rand), width: x1 - x0 + 2 * rand, height: z1 - z0 + 2 * rand)
}

/// In Welt-Zentimeter umrechnen, eingepasst in `box` (wie preserveAspectRatio meet). Liefert den
/// Massstab (Punkte je cm) fuer die Linienstaerken.
private func einpassen(_ ctx: inout GraphicsContext, _ size: CGSize, _ box: CGRect) -> Double {
    let s = min(size.width / box.width, size.height / box.height)
    ctx.translateBy(x: (size.width - box.width * s) / 2 - box.minX * s,
                    y: (size.height - box.height * s) / 2 - box.minY * s)
    ctx.scaleBy(x: s, y: s)
    return s
}

private func bezug(_ ctx: GraphicsContext, hoehe: Double, massstab k: Double) {
    var linie = Path()
    linie.move(to: CGPoint(x: -400, y: -hoehe))
    linie.addLine(to: CGPoint(x: 400, y: -hoehe))
    ctx.stroke(linie, with: .color(.secondary), style: StrokeStyle(lineWidth: 1 / k, dash: [6 / k, 7 / k]))
    let kreis = Path(ellipseIn: CGRect(x: -3.2, y: -3.2, width: 6.4, height: 6.4))
    ctx.stroke(kreis, with: .color(.secondary), lineWidth: 1.4 / k)
}

/// SEITENANSICHT fuer das Nicken (Nase rechts); `hub` hebt/senkt das Rig gegen die Linie.
struct SeitenAnsicht: View {
    let rig: FoilRigMasse
    let pitch: Double
    let hub: Double
    let hubBereich: Double

    var body: some View {
        Canvas { ctx, size in
            let m = rig.mast_len_cm, a = rig.board_len_cm / 2
            let box = rahmen([(a, m + boardDicke + hubBereich), (-a, m + boardDicke + hubBereich), (-a, m),
                              (rig.x_stab_cm - rig.stab_chord_cm, -hubBereich), (rig.foil_chord_cm, -hubBereich)], 25)
            var c = ctx
            let k = einpassen(&c, size, box)
            bezug(c, hoehe: m / 2, massstab: k)
            c.translateBy(x: 0, y: -hub)
            c.rotate(by: .degrees(-pitch))
            c.fill(boardSeite(rig.board_len_cm, m), with: .color(farbeBoard))
            var mast = Path()
            let xm = rig.x_mast_cm
            mast.move(to: p(xm + mastTiefe / 2, m)); mast.addLine(to: p(xm + mastTiefe * 0.4, 0))
            mast.addLine(to: p(xm - mastTiefe * 0.4, 0)); mast.addLine(to: p(xm - mastTiefe / 2, m))
            mast.closeSubpath()
            c.fill(mast, with: .color(farbeMast))
            let rumpf = CGRect(x: rig.x_stab_cm, y: -rumpfDicke / 2, width: rig.x_foil_cm - rig.x_stab_cm, height: rumpfDicke)
            c.fill(Path(roundedRect: rumpf, cornerRadius: rumpfDicke / 2), with: .color(farbeMast))
            c.fill(profilSeite(rig.x_foil_cm, 0, rig.foil_chord_cm), with: .color(farbeTeil))
            c.fill(profilSeite(rig.x_stab_cm, 0, rig.stab_chord_cm), with: .color(farbeStab))
        }
        .frame(height: 140)
        .clipped()
    }
}

/// FRONTANSICHT fuer das Rollen — BLICK VON HINTEN, mit der Hoehenverschiebung aus dem Nicken.
/// Rollen dreht andersherum als Nicken (von hinten ist die Querachse gespiegelt, geeicht 21.09.).
struct FrontAnsicht: View {
    let rig: FoilRigMasse
    let roll: Double
    let pitch: Double

    var body: some View {
        Canvas { ctx, size in
            let r = pitch * .pi / 180, cs = cos(r), sn = sin(r)
            let hoehe: (Double, Double) -> Double = { x, z in z * cs + x * sn }
            let bBoard = breiteAusLaenge(rig.board_len_cm)
            let m = rig.mast_len_cm
            let zBoard = hoehe(rig.x_mast_cm, m)
            let zMastFuss = hoehe(rig.x_mast_cm, 0)
            let zStab = hoehe(rig.x_stab_cm, 0)
            let halb = max(rig.foil_span_cm, bBoard) / 2
            let box = rahmen([(halb, 0), (-halb, 0), (bBoard / 2, m + boardDicke), (-bBoard / 2, m + boardDicke),
                              (0, -rig.foil_span_cm * 0.07)], 40)
            var c = ctx
            let k = einpassen(&c, size, box)
            bezug(c, hoehe: m / 2, massstab: k)
            c.rotate(by: .degrees(roll))
            let brett = CGRect(x: -bBoard / 2, y: -(zBoard + boardDicke), width: bBoard, height: boardDicke)
            c.fill(Path(roundedRect: brett, cornerRadius: boardDicke / 2.2), with: .color(farbeBoard))
            let mb = mastDicke * frontUeberhoehung
            c.fill(Path(CGRect(x: -mb / 2, y: -zBoard, width: mb, height: max(1, zBoard - zMastFuss))), with: .color(farbeMast))
            // Erst der Frontfluegel (weiter weg), dann der Stab darueber (naeher, blau).
            c.fill(fluegelVorn(rig.foil_span_cm, rig.foil_chord_cm, hoehe(rig.x_foil_cm, 0)), with: .color(farbeTeil))
            c.fill(fluegelVorn(rig.stab_span_cm, rig.stab_chord_cm, zStab), with: .color(farbeStab))
        }
        .frame(height: 140)
        .clipped()
    }
}

/// DRAUFSICHT fuer das Gieren. Nase oben; Rechtskurve = positiv = im Uhrzeigersinn.
struct DraufAnsicht: View {
    let rig: FoilRigMasse
    let yaw: Double

    var body: some View {
        Canvas { ctx, size in
            let bBoard = breiteAusLaenge(rig.board_len_cm)
            let halb = max(rig.foil_span_cm, bBoard) / 2
            let box = rahmen([(halb, 0), (-halb, 0), (0, rig.board_len_cm / 2),
                              (0, rig.x_stab_cm - rig.stab_chord_cm)], 40)
            var c = ctx
            let k = einpassen(&c, size, box)
            bezug(c, hoehe: 0, massstab: k)
            c.rotate(by: .degrees(yaw))
            let xf = rig.x_foil_cm, xs = rig.x_stab_cm
            c.fill(Path(CGRect(x: -rumpfDicke / 2, y: -xf, width: rumpfDicke, height: max(1, xf - xs))), with: .color(farbeMast))
            c.fill(fluegelOben(rig.foil_span_cm, rig.foil_chord_cm, xf), with: .color(farbeTeil))
            c.fill(fluegelOben(rig.stab_span_cm, rig.stab_chord_cm, xs), with: .color(farbeStab))
            // Brett zuletzt und halbdurchsichtig: es liegt oben, das Foil soll durchscheinen.
            c.fill(boardOben(rig.board_len_cm, bBoard), with: .color(farbeBoard.opacity(0.75)))
        }
        .frame(height: 140)
        .clipped()
    }
}
