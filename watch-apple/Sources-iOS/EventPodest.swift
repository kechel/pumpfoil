import SwiftUI
import AVFoundation
import UIKit

// Siegertreppchen ueber der Bestenliste beendeter Events — Port von web/src/components/EventPodest.tsx (09.11.2026).
// Zeigt die gerade gewaehlte Bestenliste: Fahrer als drei schwebende Foils (Reihenfolge 2 – 1 – 3, Gold am hoechsten,
// keine Sockel), bei globalen Events umschaltbar auf die Team-Wertung — je Team ein Foil (Mastlaenge = Platz), darauf je
// Mitglied ein Kopf (hell = im Event gefahren, grau = nicht). Die Foil-Formen sind die SVG-Pfade des Webs 1:1.
//
// Ton: „Winner Awards Logo" von tunetank (Pixabay, ID 484333, Pixabay-Lizenz: Einbau ohne Namensnennung erlaubt,
// Weitergabe der Datei fuer sich allein nicht) — darum NICHT in der App, sondern vom Server gestreamt
// (/media/sounds/…). Spielt beim Betreten der Seite (je Event), dazu per Knopf; stumm schaltbar, gemerkt auf dem Geraet
// (UserDefaults „podest-stumm", wie localStorage im Web). Audio-Kategorie .ambient: folgt dem Stummschalter und mischt
// sich unter laufende Musik, statt sie zu unterbrechen.

private let PODEST_TON = "/media/sounds/winner-awards-484333.mp3"

private func podestFarbe(_ hex: UInt32) -> Color {
    Color(red: Double((hex >> 16) & 0xff) / 255, green: Double((hex >> 8) & 0xff) / 255, blue: Double(hex & 0xff) / 255)
}

/// Gold / Silber / Bronze (web METALL): Flaeche und Rand.
private struct PodestMetall {
    let fill: Color
    let rand: Color

    static let alle: [PodestMetall] = [
        PodestMetall(fill: podestFarbe(0xfacc15), rand: podestFarbe(0xa16207)),
        PodestMetall(fill: podestFarbe(0xcbd5e1), rand: podestFarbe(0x475569)),
        PodestMetall(fill: podestFarbe(0xea8a4a), rand: podestFarbe(0x9a3412)),
    ]

    static func fuer(_ platz: Int) -> PodestMetall { platz >= 1 && platz <= 3 ? alle[platz - 1] : alle[2] }
}

/// Reihenfolge im Raster: 2 – 1 – 3 (bei weniger als drei Plaetzen nur die vorhandenen), wie web `treppe`.
private func podestTreppe<T>(_ l: [T]) -> [(x: T, platz: Int)] {
    let mit: [(x: T, platz: Int)] = l.prefix(3).enumerated().map { (x: $0.element, platz: $0.offset + 1) }
    if mit.count == 3 { return [mit[1], mit[0], mit[2]] }
    if mit.count == 2 { return [mit[1], mit[0]] }
    return mit
}

/// Pfad in SVG-Koordinaten bauen (die Canvas skaliert danach auf die Breite).
private func svgPfad(_ bau: (inout Path) -> Void) -> Path {
    var p = Path()
    bau(&p)
    return p
}

private func svgRect(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, _ r: CGFloat = 0) -> Path {
    let rect = CGRect(x: x, y: y, width: w, height: h)
    return r > 0 ? Path(roundedRect: rect, cornerRadius: r) : Path(rect)
}

/// `<ellipse cx cy rx ry transform="rotate(grad cx cy)">`.
private func svgEllipse(_ cx: CGFloat, _ cy: CGFloat, _ rx: CGFloat, _ ry: CGFloat, _ grad: CGFloat) -> Path {
    let e = Path(ellipseIn: CGRect(x: -rx, y: -ry, width: 2 * rx, height: 2 * ry))
    let t = CGAffineTransform(rotationAngle: grad * .pi / 180).concatenating(CGAffineTransform(translationX: cx, y: cy))
    return e.applying(t)
}

// MARK: - Formen

/// Foil in Seitenansicht wie im Wappen von Team 9 (web `Foil`, viewBox "-20 22 162 82"): Brett flach, Mast bei ~80 %,
/// Frontfluegel mittig, Stab hinten; Gold mit Lorbeer.
private struct PodestFoil: View {
    let platz: Int

    private static let teile: [Path] = [
        svgRect(4, 28, 96, 8, 4),
        svgRect(80, 36, 6.5, 58),
        svgRect(40, 94, 78, 4, 2),
        svgPfad { p in
            p.move(to: CGPoint(x: 36, y: 96))
            p.addQuadCurve(to: CGPoint(x: 58, y: 92.6), control: CGPoint(x: 44, y: 91.6))
            p.addQuadCurve(to: CGPoint(x: 68, y: 96), control: CGPoint(x: 68, y: 93.4))
            p.addQuadCurve(to: CGPoint(x: 58, y: 99.4), control: CGPoint(x: 68, y: 98.6))
            p.addQuadCurve(to: CGPoint(x: 36, y: 96), control: CGPoint(x: 44, y: 100.4))
            p.closeSubpath()
        },
        svgPfad { p in
            p.move(to: CGPoint(x: 101, y: 96))
            p.addQuadCurve(to: CGPoint(x: 118.5, y: 94.8), control: CGPoint(x: 109, y: 92.8))
            p.addLine(to: CGPoint(x: 118.5, y: 97.2))
            p.addQuadCurve(to: CGPoint(x: 101, y: 96), control: CGPoint(x: 109, y: 99.2))
            p.closeSubpath()
        },
    ]

    private static let blaetter: [Path] = [
        svgEllipse(-12, 88, 6, 3, -70), svgEllipse(-12, 70, 6, 3, -95), svgEllipse(-6, 53, 6, 3, -120),
        svgEllipse(134, 88, 6, 3, 70), svgEllipse(134, 70, 6, 3, 95), svgEllipse(128, 53, 6, 3, 120),
    ]

    private static let zweige: [Path] = [
        svgPfad { p in
            p.move(to: CGPoint(x: -4, y: 100))
            p.addQuadCurve(to: CGPoint(x: -2, y: 44), control: CGPoint(x: -20, y: 75))
        },
        svgPfad { p in
            p.move(to: CGPoint(x: 126, y: 100))
            p.addQuadCurve(to: CGPoint(x: 124, y: 44), control: CGPoint(x: 142, y: 75))
        },
    ]

    var body: some View {
        let m: PodestMetall = PodestMetall.fuer(platz)
        let gold: Bool = platz == 1
        return Canvas { ctx, size in
            let s: CGFloat = size.width / 162
            ctx.scaleBy(x: s, y: s)
            ctx.translateBy(x: 20, y: -22)
            if gold {
                let gruen: Color = podestFarbe(0x16a34a)
                for b in PodestFoil.blaetter { ctx.fill(b, with: .color(gruen)) }
                for z in PodestFoil.zweige { ctx.stroke(z, with: .color(gruen), lineWidth: 2) }
            }
            for t in PodestFoil.teile {
                ctx.fill(t, with: .color(m.fill))
                ctx.stroke(t, with: .color(m.rand), lineWidth: 0.8)
            }
        }
        .aspectRatio(162.0 / 82.0, contentMode: .fit)
        .accessibilityHidden(true)
    }
}

/// Mastlaenge je Platz (web MAST): Gold am laengsten, alle Fluegel auf einer Linie.
private let PODEST_MAST: [CGFloat] = [70, 44, 22]
/// Hoechstens so viele Koepfe (web KOEPFE_MAX); die echten Zahlen stehen darunter.
private let PODEST_KOEPFE_MAX = 30

/// Team-Foil (web `TeamFoil`, viewBox "0 0 122 <y+6>"): ganz in Gold/Silber/Bronze, auch das Brett (6 hoch).
private struct PodestTeamFoil: View {
    let platz: Int

    private var mast: CGFloat { platz >= 1 && platz <= 3 ? PODEST_MAST[platz - 1] : 22 }

    private static func teile(_ L: CGFloat) -> [Path] {
        let y: CGFloat = 6.5 + L
        let front: Path = svgPfad { p in
            p.move(to: CGPoint(x: 36, y: y))
            p.addQuadCurve(to: CGPoint(x: 58, y: y - 3.4), control: CGPoint(x: 44, y: y - 4.4))
            p.addQuadCurve(to: CGPoint(x: 68, y: y), control: CGPoint(x: 68, y: y - 2.6))
            p.addQuadCurve(to: CGPoint(x: 58, y: y + 3.4), control: CGPoint(x: 68, y: y + 2.6))
            p.addQuadCurve(to: CGPoint(x: 36, y: y), control: CGPoint(x: 44, y: y + 4.4))
            p.closeSubpath()
        }
        let stab: Path = svgPfad { p in
            p.move(to: CGPoint(x: 101, y: y))
            p.addQuadCurve(to: CGPoint(x: 118.5, y: y - 1.2), control: CGPoint(x: 109, y: y - 3.2))
            p.addLine(to: CGPoint(x: 118.5, y: y + 1.2))
            p.addQuadCurve(to: CGPoint(x: 101, y: y), control: CGPoint(x: 109, y: y + 3.2))
            p.closeSubpath()
        }
        return [svgRect(80, 6.5, 6, L), svgRect(40, y - 2, 78, 4, 2), front, stab, svgRect(4, 0.75, 96, 6, 3)]
    }

    var body: some View {
        let m: PodestMetall = PodestMetall.fuer(platz)
        let L: CGFloat = mast
        let hoehe: CGFloat = 6.5 + L + 6
        return Canvas { ctx, size in
            let s: CGFloat = size.width / 122
            ctx.scaleBy(x: s, y: s)
            for t in PodestTeamFoil.teile(L) {
                ctx.fill(t, with: .color(m.fill))
                ctx.stroke(t, with: .color(m.rand), lineWidth: 0.6)
            }
        }
        .aspectRatio(122 / hoehe, contentMode: .fit)
        .accessibilityHidden(true)
    }
}

/// Ein Kopf (web `Kopf`, viewBox 0 0 18 28): hell = gefahren, grau = nicht. Fuellt die vorgeschlagene Hoehe, mittig.
private struct PodestKopf: View {
    let gefahren: Bool

    private static let form: Path = {
        var p = Path(ellipseIn: CGRect(x: 9 - 4.8, y: 6 - 4.8, width: 9.6, height: 9.6))
        p.move(to: CGPoint(x: 1.6, y: 27.4))
        p.addQuadCurve(to: CGPoint(x: 9, y: 13.6), control: CGPoint(x: 1.6, y: 13.6))
        p.addQuadCurve(to: CGPoint(x: 16.4, y: 27.4), control: CGPoint(x: 16.4, y: 13.6))
        p.closeSubpath()
        return p
    }()

    // slate-100 / slate-600 wie im Web; in der hellen Fassung kippen sie dort mit der Palette (dunkel / hellgrau).
    private static let hell: Color = Color(UIColor { tc in
        tc.userInterfaceStyle == .dark ? UIColor(red: 0xf1 / 255, green: 0xf5 / 255, blue: 0xf9 / 255, alpha: 1)
            : UIColor(red: 0x1e / 255, green: 0x29 / 255, blue: 0x3b / 255, alpha: 1)
    })
    private static let grau: Color = Color(UIColor { tc in
        tc.userInterfaceStyle == .dark ? UIColor(red: 0x47 / 255, green: 0x55 / 255, blue: 0x69 / 255, alpha: 1)
            : UIColor(red: 0xcb / 255, green: 0xd5 / 255, blue: 0xe1 / 255, alpha: 1)
    })

    var body: some View {
        let farbe: Color = gefahren ? PodestKopf.hell : PodestKopf.grau
        return Canvas { ctx, size in
            let s: CGFloat = size.height / 28
            ctx.translateBy(x: (size.width - 18 * s) / 2, y: 0)
            ctx.scaleBy(x: s, y: s)
            ctx.fill(PodestKopf.form, with: .color(farbe))
        }
    }
}

/// Koepfe auf dem Brett: zentrierte Reihen, die Kopfgroesse schrumpft, bis hoechstens 5 Reihen reichen — auf
/// Handybreite ueberlappt so nichts und das Feld bleibt niedrig (web: feste Groesse, beliebig viele Reihen).
private struct PodestKopfFeld: Layout {
    let anzahl: Int
    private let maxReihen = 5
    private let luecke: CGFloat = 2

    /// Abstand je Kopf (web: 22 px breit mit -2 px Rand je Seite = 18), Koepfe je Reihe, Reihen.
    private func masse(_ breite: CGFloat) -> (p: CGFloat, pro: Int, reihen: Int) {
        var p: CGFloat = 18
        while true {
            let pro: Int = max(1, Int(breite / p))
            let reihen: Int = (anzahl + pro - 1) / pro
            if reihen <= maxReihen || p <= 6 { return (p, pro, reihen) }
            p -= 0.5
        }
    }

    private func kopfHoehe(_ p: CGFloat) -> CGFloat { p * 34 / 18 }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let w: CGFloat = proposal.width.flatMap { $0.isFinite ? $0 : nil } ?? 160
        let m = masse(w)
        let h: CGFloat = CGFloat(m.reihen) * kopfHoehe(m.p) + CGFloat(max(0, m.reihen - 1)) * luecke
        return CGSize(width: w, height: h)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let m = masse(bounds.width)
        let kh: CGFloat = kopfHoehe(m.p)
        let n: Int = subviews.count
        for (i, v) in subviews.enumerated() {
            let reihe: Int = i / m.pro
            let spalte: Int = i % m.pro
            let inReihe: Int = min(m.pro, n - reihe * m.pro)
            let x0: CGFloat = bounds.minX + (bounds.width - CGFloat(inReihe) * m.p) / 2
            let pt = CGPoint(x: x0 + CGFloat(spalte) * m.p, y: bounds.minY + CGFloat(reihe) * (kh + luecke))
            v.place(at: pt, anchor: .topLeading, proposal: ProposedViewSize(width: m.p, height: kh))
        }
    }
}

// MARK: - Ton

/// Fanfare vom Server, gestreamt (nie in der App gebuendelt — Lizenz). Eine Instanz fuer die ganze App.
final class PodestTon {
    static let shared = PodestTon()
    private var player: AVPlayer?

    func abspielen() {
        guard let url = Api.mediaURL(PODEST_TON) else { return }
        // .ambient: der Stummschalter gilt, laufende Musik spielt weiter (keine Unterbrechung).
        try? AVAudioSession.sharedInstance().setCategory(.ambient, mode: .default, options: [.mixWithOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
        player?.pause()
        let p = AVPlayer(url: url)
        p.volume = 0.6
        player = p
        p.play()
    }

    func anhalten() {
        player?.pause()
        player = nil
    }
}

// MARK: - Karte

struct EventPodest: View {
    let evId: Int
    let tf: TeamTafel
    let global: Bool
    let farbe: String?
    let lang: String
    @AppStorage("podest-stumm") private var stumm = false
    @State private var teamsAnsicht = false
    /// Fuer welches Event die Fanfare schon lief — zurueck von einer Foiler-Seite spielt sie nicht noch einmal.
    @State private var gespielt: Int?

    private var k: TeamKennzahl { teamKennzahl(tf.kennzahl) }
    private var teamsDa: Bool { global && !(tf.teams ?? []).isEmpty }
    private var zeilen: [TeamZeile] { Array(tf.zeilen.prefix(3)) }
    private var teams: [TeamWertungZeile] { Array((tf.teams ?? []).prefix(3)) }
    private var zeigeTeams: Bool { teamsDa && teamsAnsicht }

    var body: some View {
        if !zeilen.isEmpty || !teams.isEmpty {
            karte
                // Beim Betreten (je Event), wenn nicht stumm.
                .onAppear { fanfareBeimBetreten() }
                .onChange(of: evId) { _ in fanfareBeimBetreten() }
                .onDisappear { PodestTon.shared.anhalten() }
        }
    }

    private func fanfareBeimBetreten() {
        guard gespielt != evId else { return }
        gespielt = evId
        if !stumm { PodestTon.shared.abspielen() }
    }

    private var karte: some View {
        VStack(alignment: .leading, spacing: 10) {
            kopf
            if zeigeTeams { teamRaster } else { fahrerRaster }
        }
        .padding(.horizontal, 16)
        .padding(.top, 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private var kopf: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text(Loc.t(k.labelKey, lang)).font(.title3.weight(.bold)).foregroundStyle(TeamFarbe(farbe).akzent)
                    .frame(maxWidth: .infinity, alignment: .leading)
                tonKnopf
            }
            HStack(spacing: 10) {
                stummSchalter
                Spacer(minLength: 4)
                if teamsDa { ansichtWahl }
            }
        }
    }

    private var tonKnopf: some View {
        Button { PodestTon.shared.abspielen() } label: {
            Image(systemName: "speaker.wave.2").font(.system(size: 17))
                .frame(width: 40, height: 40)
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.secondary.opacity(0.5), lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Loc.t("team.podest.ton", lang))
    }

    private var stummSchalter: some View {
        Button {
            stumm.toggle()
            if stumm { PodestTon.shared.anhalten() }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: stumm ? "checkmark.square.fill" : "square")
                Text(Loc.t("team.podest.stumm", lang))
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .buttonStyle(.plain)
    }

    private var ansichtWahl: some View {
        Picker("", selection: $teamsAnsicht) {
            Text(Loc.t("team.podest.fahrer", lang)).tag(false)
            Text(Loc.t("team.event.teams", lang)).tag(true)
        }
        .pickerStyle(.segmented)
        .fixedSize()
    }

    private var fahrerRaster: some View {
        HStack(alignment: .bottom, spacing: 8) {
            ForEach(podestTreppe(zeilen), id: \.platz) { e in
                PodestFahrerPlatz(z: e.x, platz: e.platz, wert: k.fmt(e.x.value, lang))
                    .frame(maxWidth: .infinity)
            }
        }
        .padding(.top, 4)
        .padding(.bottom, 20)
    }

    private var teamRaster: some View {
        HStack(alignment: .bottom, spacing: 8) {
            ForEach(podestTreppe(teams), id: \.platz) { e in
                PodestTeamPlatz(x: e.x, platz: e.platz, wert: k.fmt(e.x.value, lang))
                    .frame(maxWidth: .infinity)
            }
        }
        .padding(.top, 8)
    }
}

/// Schriftgroessen je Platz wie im Web auf dem Handy (text-3xl / 2xl / xl bzw. base / sm).
private func podestRangSchrift(_ platz: Int) -> Font {
    .system(size: platz == 1 ? 30 : platz == 2 ? 24 : 20, weight: .heavy)
}

private func podestNameSchrift(_ platz: Int) -> Font {
    .system(size: platz == 1 ? 16 : 14, weight: .heavy)
}

private struct PodestFahrerPlatz: View {
    let z: TeamZeile
    let platz: Int
    let wert: String

    private var abstandUnten: CGFloat { platz == 1 ? 56 : platz == 2 ? 24 : 0 }
    private var foilBreite: CGFloat { platz == 1 ? 230 : platz == 2 ? 180 : 160 }
    private var name: String { z.name ?? z.initialen ?? "—" }

    var body: some View {
        VStack(spacing: 6) {
            PodestFoil(platz: platz).frame(maxWidth: foilBreite)
            Text(String(platz) + ".").font(podestRangSchrift(platz)).monospacedDigit()
                .foregroundStyle(PodestMetall.fuer(platz).rand)
            Text(name).font(podestNameSchrift(platz)).lineLimit(1).truncationMode(.tail)
            herkunft
            Text(wert).font(podestNameSchrift(platz)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
        }
        .padding(.bottom, abstandUnten)
    }

    /// Flagge und Wappen des (ersten) Teams; der Teamname steht im Web erst ab Tablet-Breite — auf dem Handy nicht.
    private var herkunft: some View {
        HStack(spacing: 6) {
            TeamHerkunftMarke(land: z.land, kuerzel: false)
            if let w = z.teams?.first { TeamWappen(name: w.name, logo: w.logo_url, farbe: w.farbe, size: 20) }
        }
    }
}

private struct PodestTeamPlatz: View {
    let x: TeamWertungZeile
    let platz: Int
    let wert: String

    private var mitglieder: Int { max(x.mitglieder ?? x.teilnehmer, x.teilnehmer) }
    private var koepfe: Int { min(mitglieder, PODEST_KOEPFE_MAX) }
    /// Ueber 30 Mitgliedern im Verhaeltnis verkleinert, mindestens ein heller Kopf, wenn jemand gefahren ist.
    private var hell: Int {
        guard mitglieder > PODEST_KOEPFE_MAX else { return x.teilnehmer }
        let anteil: Int = Int((Double(x.teilnehmer) * Double(PODEST_KOEPFE_MAX) / Double(mitglieder)).rounded())
        return max(x.teilnehmer > 0 ? 1 : 0, anteil)
    }
    private var boxBreite: CGFloat { platz == 1 ? 230 : platz == 2 ? 190 : 170 }

    var body: some View {
        VStack(spacing: 6) {
            Text(String(platz) + ".").font(podestRangSchrift(platz)).monospacedDigit()
                .foregroundStyle(PodestMetall.fuer(platz).rand)
            TeamWappen(name: x.name, logo: x.logo_url, farbe: x.farbe, size: platz == 1 ? 56 : 44)
            NavigationLink { TeamView(slug: x.slug) } label: {
                Text(x.name).font(.system(size: 14, weight: .heavy)).lineLimit(1).multilineTextAlignment(.center)
            }
            .buttonStyle(.plain)
            TeamHerkunftMarke(land: x.land, kuerzel: false)
            Text(wert).font(.system(size: 16, weight: .heavy)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
            foilMitKoepfen
            Text(String(x.teilnehmer) + " / " + String(mitglieder)).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
        }
        .padding(.bottom, 16)
    }

    /// Die Mitglieder stehen auf dem Brett (Brett = 3 % … 82 % der Breite), darunter das Team-Foil.
    private var foilMitKoepfen: some View {
        VStack(spacing: 0) {
            PodestKoepfeZeile(koepfe: koepfe, hell: hell)
            PodestTeamFoil(platz: platz)
        }
        .frame(maxWidth: boxBreite)
    }
}

/// 3 % Rand links, 79 % Breite fuer die Koepfe, Rest frei — ueber eine HStack mit Anteilen der Breite.
private struct PodestKoepfeZeile: View {
    let koepfe: Int
    let hell: Int

    var body: some View {
        PodestAnteilLayout(links: 0.03, breite: 0.79) {
            PodestKopfFeld(anzahl: koepfe) {
                ForEach(0..<koepfe, id: \.self) { i in PodestKopf(gefahren: i < hell) }
            }
        }
    }
}

/// Legt das eine Kind bei `links` × Breite ab, `breite` × Breite breit (web ml-[3%] w-[79%]).
private struct PodestAnteilLayout: Layout {
    let links: CGFloat
    let breite: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let w: CGFloat = proposal.width.flatMap { $0.isFinite ? $0 : nil } ?? 160
        let h: CGFloat = subviews.first?.sizeThatFits(ProposedViewSize(width: w * breite, height: nil)).height ?? 0
        return CGSize(width: w, height: h)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        guard let v = subviews.first else { return }
        let w: CGFloat = bounds.width * breite
        let h: CGFloat = v.sizeThatFits(ProposedViewSize(width: w, height: nil)).height
        v.place(at: CGPoint(x: bounds.minX + bounds.width * links, y: bounds.minY), anchor: .topLeading,
                proposal: ProposedViewSize(width: w, height: h))
    }
}
