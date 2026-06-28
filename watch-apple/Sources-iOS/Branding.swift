import SwiftUI

// Markenlogo: drei cyan Wellen (identisch zu web/oauth-logo + Android logo_waves).
// Als Path gezeichnet -> auflösungsunabhängig, kein Bild-Asset nötig.
struct WavesLogo: View {
    var tint: Color = Color(red: 0x22 / 255, green: 0xD3 / 255, blue: 0xEE / 255)
    var lineWidth: CGFloat = 1.6

    var body: some View {
        Canvas { ctx, size in
            let s = min(size.width, size.height) / 24
            // Eine Welle (x 3..18) um die Grundlinie b, wie das Original-Pfaddaten-Set.
            func wave(_ b: CGFloat) -> Path {
                var p = Path()
                p.move(to: CGPoint(x: 3, y: b))
                p.addCurve(to: CGPoint(x: 6, y: b - 1.5), control1: CGPoint(x: 4.5, y: b), control2: CGPoint(x: 4.5, y: b - 1.5))
                p.addCurve(to: CGPoint(x: 9, y: b), control1: CGPoint(x: 7.5, y: b - 1.5), control2: CGPoint(x: 7.5, y: b))
                p.addCurve(to: CGPoint(x: 12, y: b - 1.5), control1: CGPoint(x: 10.5, y: b), control2: CGPoint(x: 10.5, y: b - 1.5))
                p.addCurve(to: CGPoint(x: 15, y: b), control1: CGPoint(x: 13.5, y: b - 1.5), control2: CGPoint(x: 13.5, y: b))
                p.addCurve(to: CGPoint(x: 18, y: b - 1.5), control1: CGPoint(x: 16.5, y: b), control2: CGPoint(x: 16.5, y: b - 1.5))
                return p
            }
            // zentrieren (Wellen sitzen links/oben im 24er-Raster) und skalieren.
            let t = CGAffineTransform(translationX: 1.5, y: 0.75).concatenating(CGAffineTransform(scaleX: s, y: s))
            let style = StrokeStyle(lineWidth: lineWidth, lineCap: .round, lineJoin: .round)
            for b in [CGFloat(8.5), 12, 15.5] {
                ctx.stroke(wave(b).applying(t), with: .color(tint), style: style)
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

extension View {
    // Logo + Titel mittig in der Navigationsleiste (spiegelt Androids PumpfoilTopBar).
    func brandToolbar(_ title: String) -> some View {
        self.navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    HStack(spacing: 7) {
                        WavesLogo().frame(width: 22, height: 22)
                        Text(title).font(.headline)
                    }
                }
            }
    }
}
