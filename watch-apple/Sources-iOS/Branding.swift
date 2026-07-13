import SwiftUI

// Markenlogo: drei cyan Wellen (identisch zu web/oauth-logo + Android logo_waves).
// Als Path gezeichnet -> auflösungsunabhängig, kein Bild-Asset nötig.
struct WavesLogo: View {
    var tint: Color = Color(red: 0x22 / 255, green: 0xD3 / 255, blue: 0xEE / 255)
    var lineWidth: CGFloat = 1.6

    var body: some View {
        Canvas { ctx, size in
            let s = min(size.width, size.height) / 24
            // Eine Welle um Grundlinie b, horizontal um dx phasenverschoben (Marken-Look:
            // die drei Wellen sind VERSETZT/verschränkt, nicht gleichphasig gestapelt).
            // Periode = 6; über 0..24 durchgezeichnet, Canvas clippt den Überstand.
            func wave(_ b: CGFloat, _ dx: CGFloat) -> Path {
                var p = Path()
                var x: CGFloat = -6
                p.move(to: CGPoint(x: x + dx, y: b))
                while x < 24 {
                    p.addCurve(to: CGPoint(x: x + 3 + dx, y: b - 1.5),
                               control1: CGPoint(x: x + 1.5 + dx, y: b), control2: CGPoint(x: x + 1.5 + dx, y: b - 1.5))
                    p.addCurve(to: CGPoint(x: x + 6 + dx, y: b),
                               control1: CGPoint(x: x + 4.5 + dx, y: b - 1.5), control2: CGPoint(x: x + 4.5 + dx, y: b))
                    x += 6
                }
                return p
            }
            let t = CGAffineTransform(translationX: 1.5, y: 0.75).concatenating(CGAffineTransform(scaleX: s, y: s))
            let style = StrokeStyle(lineWidth: lineWidth, lineCap: .round, lineJoin: .round)
            // (Grundlinie, Phasenversatz) — mittlere Welle um halbe Periode versetzt.
            for (b, dx) in [(CGFloat(8.5), CGFloat(0)), (12, 3), (15.5, 0)] {
                ctx.stroke(wave(b, dx).applying(t), with: .color(tint), style: style)
            }
        }
    }
}

// Branded Splash beim App-Start (dunkel + Logo), kurz eingeblendet.
struct SplashView: View {
    var body: some View {
        ZStack {
            Color(red: 0x02 / 255, green: 0x06 / 255, blue: 0x17 / 255).ignoresSafeArea()
            VStack(spacing: 18) {
                WavesLogo(lineWidth: 1.8).frame(width: 120, height: 120)
                Text("Pumpfoil").font(.largeTitle).bold().foregroundStyle(.white)
            }
        }
    }
}

// Unser Foil-Icon (Flügel + Mast + Basis) — portiert aus dem Web (Icons.tsx FoilIcon).
struct FoilIcon: View {
    var tint: Color = .accentColor
    var body: some View {
        GeometryReader { geo in
            let u = min(geo.size.width, geo.size.height) / 24
            Path { p in
                p.move(to: CGPoint(x: 2 * u, y: 7 * u))
                p.addCurve(to: CGPoint(x: 22 * u, y: 7 * u), control1: CGPoint(x: 8 * u, y: 4 * u), control2: CGPoint(x: 16 * u, y: 4 * u))
                p.addCurve(to: CGPoint(x: 2 * u, y: 7 * u), control1: CGPoint(x: 16 * u, y: 9.5 * u), control2: CGPoint(x: 8 * u, y: 9.5 * u))
                p.closeSubpath()
                p.move(to: CGPoint(x: 12 * u, y: 7 * u)); p.addLine(to: CGPoint(x: 12 * u, y: 18 * u))
                p.move(to: CGPoint(x: 8.5 * u, y: 18 * u)); p.addLine(to: CGPoint(x: 15.5 * u, y: 18 * u))
            }
            .stroke(tint, style: StrokeStyle(lineWidth: 2 * u, lineCap: .round, lineJoin: .round))
        }
    }
}

extension View {
    // Horizontales Marken-Wortmarken-Logo in der Navigationsleiste (theme-adaptiv, wie PWA/Android).
    func brandToolbar(_ title: String) -> some View {
        self.navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Image("WordmarkH").resizable().scaledToFit().frame(height: 24)
                        .accessibilityLabel("Pumpfoil.org — \(title)")
                }
            }
    }
}
