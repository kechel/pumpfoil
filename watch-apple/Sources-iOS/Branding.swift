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

// Avatar: Profilbild ODER farbiger Kreis mit Initiale — identische Palette/Hash wie PWA (ui.tsx),
// damit ein Nutzer überall (Web/iOS/Android) dieselbe Farbe bekommt.
private let AVATAR_COLORS: [Color] = [
    Color(red: 0x02/255, green: 0x84/255, blue: 0xc7/255), Color(red: 0x4f/255, green: 0x46/255, blue: 0xe5/255),
    Color(red: 0x7c/255, green: 0x3a/255, blue: 0xed/255), Color(red: 0xc0/255, green: 0x26/255, blue: 0xd3/255),
    Color(red: 0xdb/255, green: 0x27/255, blue: 0x77/255), Color(red: 0xe1/255, green: 0x1d/255, blue: 0x48/255),
    Color(red: 0xdc/255, green: 0x26/255, blue: 0x26/255), Color(red: 0xea/255, green: 0x58/255, blue: 0x0c/255),
    Color(red: 0xca/255, green: 0x8a/255, blue: 0x04/255), Color(red: 0x16/255, green: 0xa3/255, blue: 0x4a/255),
    Color(red: 0x05/255, green: 0x96/255, blue: 0x69/255), Color(red: 0x0d/255, green: 0x94/255, blue: 0x88/255),
    Color(red: 0x0e/255, green: 0x74/255, blue: 0x90/255),
]

func avatarColor(_ seed: String) -> Color {
    var h: Int32 = 0
    for u in seed.utf16 { h = h &* 31 &+ Int32(u) }   // wie JS charCodeAt + |0 (32-bit-Overflow)
    return AVATAR_COLORS[Int(h.magnitude) % AVATAR_COLORS.count]
}

struct AvatarView: View {
    let name: String?
    let url: URL?
    var size: CGFloat = 40

    private var initialCircle: some View {
        let n = (name ?? "?").trimmingCharacters(in: .whitespaces)
        let initial = n.isEmpty ? "?" : String(n.first!).uppercased()
        return Circle().fill(avatarColor(name ?? "?"))
            .overlay(Text(initial).font(.system(size: size * 0.45, weight: .semibold)).foregroundStyle(.white))
            .frame(width: size, height: size)
    }

    var body: some View {
        if let url {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let img): img.resizable().scaledToFill()
                default: initialCircle
                }
            }
            .frame(width: size, height: size).clipShape(Circle())
        } else {
            initialCircle
        }
    }
}

extension View {
    // Horizontales Marken-Wortmarken-Logo in der Navigationsleiste (theme-adaptiv, wie PWA/Android).
    // Nav-Bar-Cyan wird global via UINavigationBarAppearance gesetzt (PumpfoilApp.init) — NICHT
    // per-View toolbarBackground, das in NavigationStacks Update-Zyklen auslösen kann.
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
