import SwiftUI
import AVFoundation
import UIKit
import MapKit

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
    /// Beobachtet beim Ton mit Ersatz, ob die Datei laedt (GPS-Kunst, 18.11.2026).
    private var beobachter: NSKeyValueObservation?

    /// Eigener Ton mit Ersatz (GPS-Kunst, 18.11.2026, web KunstBereich `spiel(TON_KUNST, TON)`): fehlt die Datei auf dem
    /// Server (Status `failed`), spielt `ersatz`.
    func abspielen(_ pfad: String, ersatz: String?) {
        guard let url = Api.mediaURL(pfad) else { return }
        try? AVAudioSession.sharedInstance().setCategory(.ambient, mode: .default, options: [.mixWithOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
        player?.pause()
        beobachter = nil
        let item = AVPlayerItem(url: url)
        let p = AVPlayer(playerItem: item)
        p.volume = 0.6
        player = p
        if let ersatz {
            beobachter = item.observe(\.status, options: [.new]) { [weak self] (it: AVPlayerItem, _: NSKeyValueObservedChange<AVPlayerItem.Status>) in
                guard it.status == .failed else { return }
                DispatchQueue.main.async { self?.abspielen(ersatz, ersatz: nil) }
            }
        }
        p.play()
    }

    func abspielen() {
        beobachter = nil
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
        beobachter = nil
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
                PodestFahrerPlatz(z: e.x, platz: e.platz, wert: k.fmt(e.x.value, lang), sprintKz: tf.kennzahl.hasPrefix("sprint_") ? tf.kennzahl : nil)
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
    /// Sprint-Kennzahl: dann markiert die Session den gewerteten Abschnitt (wie die Bestenlisten-Zeile, 11.11.2026)
    var sprintKz: String? = nil

    @State private var profil = false

    private var abstandUnten: CGFloat { platz == 1 ? 56 : platz == 2 ? 24 : 0 }
    private var foilBreite: CGFloat { platz == 1 ? 230 : platz == 2 ? 180 : 160 }
    private var name: String { z.name ?? z.initialen ?? "—" }

    var body: some View {
        VStack(spacing: 6) {
            PodestFoil(platz: platz).frame(maxWidth: foilBreite)
            Text(String(platz) + ".").font(podestRangSchrift(platz)).monospacedDigit()
                .foregroundStyle(PodestMetall.fuer(platz).rand)
            nameFeld
            herkunft
            wertFeld
        }
        .padding(.bottom, abstandUnten)
    }

    private var nameText: some View {
        Text(name).font(podestNameSchrift(platz)).lineLimit(1).truncationMode(.tail)
    }

    private func wertText(_ linie: Bool) -> some View {
        Text(wert).font(podestNameSchrift(platz)).monospacedDigit().underline(linie).lineLimit(1).minimumScaleFactor(0.7)
    }

    /// Name -> Profil des Fahrers (web EventPodest, 11.11.2026), als Sheet wie die Profilbilder.
    @ViewBuilder private var nameFeld: some View {
        if let uid = z.user_id {
            Button { profil = true } label: { nameText }
                .buttonStyle(.plain)
                .sheet(isPresented: $profil) { FoilerSheet(userId: uid) }
        } else {
            nameText
        }
    }

    /// Wert aus einer Session bzw. einem Lauf -> dorthin, der Lauf vorausgewaehlt (web 713147c3).
    @ViewBuilder private var wertFeld: some View {
        if z.user_id != nil, let sid = z.session_id {
            NavigationLink { SessionDetailView(id: sid, vorwahlLauf: z.run_idx, sprintKz: sprintKz) } label: { wertText(true) }
                .buttonStyle(.plain)
        } else {
            wertText(false)
        }
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

// MARK: - GPS-Kunst (18.11.2026) — Port von web/src/components/KunstBereich.tsx
//
// „Wer malt das coolste Bild aufs Wasser?" (server app/kunst.py, app/api/kunst.py): Runden mit Einreichen -> Abstimmen
// (anonym, bis zu 3 Herzen, Zwischenstand verborgen) -> Aufloesung mit Namen. Die Linie kommt normiert vom Server
// (0..1000, ohne Koordinaten); im Editor rechnet `kunstNormiere` dieselbe Vorschau wie das Web. Steht hier und nicht
// in einer eigenen Datei, damit kein xcodegen-Lauf noetig ist — und weil die Aufloesung Treppchen-Bausteine
// (PodestMetall, podestTreppe, Schriften, PodestTon) dieser Datei mitbenutzt.
// Nicht portiert (nur Admins/Moderation, bleibt im Web): Testmodus mit Phasenschaltern, Entfernen/Zurueckholen.

/// `vorlage` eines GPS-Kunst-Events (web KUNST_VORLAGE).
let KUNST_VORLAGE = "gpskunst"
/// Eigener Jingle der Aufloesung; fehlt er auf dem Server, spielt die Event-Fanfare (web TON_KUNST / TON).
private let KUNST_TON = "/media/sounds/gpskunst.mp3"
private let KUNST_BOX: Double = 1000

// Winternacht (web NACHT/CYAN): flaches Nachtblau, Schneeflocken je Bild fest verteilt, Track in Marken-Cyan mit Leuchten.
private let kunstCyan = Color(red: 34 / 255, green: 211 / 255, blue: 238 / 255)
private let kunstNacht = Color(red: 11 / 255, green: 26 / 255, blue: 51 / 255)
/// Hintergrund der Vollbild-Karten (web #020617), in beiden Farbschemata gleich.
private let kunstTief = Color(red: 2 / 255, green: 6 / 255, blue: 23 / 255)

// MARK: Daten

private func kunstPunkt(_ p: [Double]) -> CGPoint? {
    guard p.count >= 2 else { return nil }
    return CGPoint(x: p[0], y: p[1])
}

/// Linie eines Bilds: ein Strich (aeltere Bilder, `[[x,y]]`) oder mehrere (ein Strich je Lauf, `[[[x,y]]]`) — immer als
/// Liste von Strichen (web `alsStriche`).
struct KunstStriche: Decodable {
    let striche: [[CGPoint]]

    init(_ s: [[CGPoint]]) { striche = s }

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let mehr = try? c.decode([[[Double]]].self) {
            striche = mehr.map { (st: [[Double]]) -> [CGPoint] in st.compactMap(kunstPunkt) }
        } else if let einer = try? c.decode([[Double]].self) {
            let st: [CGPoint] = einer.compactMap(kunstPunkt)
            striche = st.isEmpty ? [] : [st]
        } else {
            striche = []
        }
    }
}

struct KunstBildDaten: Decodable, Identifiable {
    let id: Int
    let linie: KunstStriche
    var eigen: Bool? = nil
    var herz: Bool? = nil
    /// nur fuer die Moderation: Grund, falls entfernt
    var entfernt: String? = nil
    var meldungen: Int? = nil
}

struct KunstEigenesBild: Decodable {
    let id: Int
    let linie: KunstStriche
    var session_id: Int? = nil
    var von_ms: Double? = nil
    var bis_ms: Double? = nil
    var drehung: Int? = nil
    var entfernt: String? = nil
}

struct KunstErgebnisZeile: Decodable, Identifiable {
    let bild_id: Int
    let platz: Int
    let herzen: Int
    let linie: KunstStriche
    var user_id: Int? = nil
    var session_id: Int? = nil
    var name: String? = nil
    var spot: String? = nil
    /// Ort sichtbar -> Kartenansicht moeglich
    var karte: Bool? = nil
    /// Nur in der Gesamtuebersicht gesetzt (nicht vom Server): Runde des Bilds.
    var runde: Int? = nil
    var id: Int { bild_id }
}

struct KunstRundeDaten: Decodable {
    let nr: Int
    let start: String
    let ende: String
    var einreichen_bis: String? = nil
    let abstimmen_bis: String
    let phase: String                         // kommt | einreichen | abstimmen | fertig
    var anzahl: Int? = nil
    var herzen_vergeben: Int? = nil
    var galerie: [KunstBildDaten]? = nil
    var ergebnis: [KunstErgebnisZeile]? = nil
    var eigen: KunstEigenesBild? = nil

    var bilder: [KunstBildDaten] { galerie ?? [] }
    var vergeben: Int { herzen_vergeben ?? 0 }
}

struct KunstEventDaten: Decodable {
    let event_id: Int
    var herzen_je_runde: Int? = nil
    var teilnehmen: Bool? = nil
    var moderieren: Bool? = nil
    let runden: [KunstRundeDaten]

    var herzenJeRunde: Int { herzen_je_runde ?? 3 }
    var darfTeilnehmen: Bool { teilnehmen == true }
}

struct KunstKandidat: Decodable, Identifiable {
    let id: Int
    let started_at: String
    var sport_class: String? = nil
    var caption: String? = nil
    let vorschau: KunstStriche
}

/// Ganze eigene Session fuers Zuschneiden: Punkte `[t_ms, x, y]` in relativen Metern, erkannte Laeufe `[a, z]`.
struct KunstSpur: Decodable {
    let punkte: [[Double]]
    let laeufe: [[Double]]
}

struct KunstKarteDaten: Decodable {
    let striche: [[[Double]]]
}

/// Antworten der Schreib-Aufrufe — der Inhalt wird nicht gebraucht (danach wird neu geladen).
private struct KunstAntwort: Decodable { var ok: Bool? = nil }

extension Api {
    static func kunst(_ eventId: Int) async throws -> KunstEventDaten {
        try await request("/api/kunst/" + String(eventId), method: "GET", body: nil, auth: true)
    }

    static func kunstKandidaten(_ eventId: Int, runde: Int) async throws -> [KunstKandidat] {
        try await request("/api/kunst/" + String(eventId) + "/kandidaten?runde=" + String(runde), method: "GET", body: nil, auth: true)
    }

    static func kunstSpur(_ eventId: Int, sessionId: Int) async throws -> KunstSpur {
        try await request("/api/kunst/" + String(eventId) + "/spur/" + String(sessionId), method: "GET", body: nil, auth: true)
    }

    static func kunstEinreichen(_ eventId: Int, runde: Int, sessionId: Int, vonMs: Int, bisMs: Int, drehung: Int) async throws {
        let body: [String: Any] = ["runde": runde, "session_id": sessionId, "von_ms": vonMs, "bis_ms": bisMs, "drehung": drehung]
        let _: KunstAntwort = try await request("/api/kunst/" + String(eventId) + "/bild", method: "POST", body: body, auth: true)
    }

    static func kunstZurueckziehen(_ eventId: Int, runde: Int) async throws {
        let _: KunstAntwort = try await request("/api/kunst/" + String(eventId) + "/bild?runde=" + String(runde),
                                                method: "DELETE", body: nil, auth: true)
    }

    static func kunstHerz(_ bildId: Int) async throws {
        let _: KunstAntwort = try await request("/api/kunst/bild/" + String(bildId) + "/herz", method: "POST", body: nil, auth: true)
    }

    static func kunstMelden(_ bildId: Int, grund: String) async throws {
        let body: [String: Any] = ["grund": grund]
        let _: KunstAntwort = try await request("/api/kunst/bild/" + String(bildId) + "/melden", method: "POST", body: body, auth: true)
    }

    static func kunstKarte(_ bildId: Int) async throws -> KunstKarteDaten {
        try await request("/api/kunst/bild/" + String(bildId) + "/karte", method: "GET", body: nil, auth: true)
    }
}

/// Fehlertext aus `{"detail":"<code>"}` -> `kunst.err.<code>`, unbekannte Codes -> `kunst.err.unbekannt`.
func kunstFehlerText(_ e: Error, _ lang: String) -> String {
    let key: String = "kunst.err." + Api.teamFehlerCode(e)
    let text: String = Loc.t(key, lang)
    return text == key ? Loc.t("kunst.err.unbekannt", lang) : text
}

// MARK: Zeit-Helfer

private func kunstFormat(_ vorlage: String, _ lang: String) -> DateFormatter {
    let f = DateFormatter()
    f.locale = teamLocale(lang)
    f.setLocalizedDateFormatFromTemplate(vorlage)
    return f
}

/// Rundenzeitraum kurz („15.–18.11."), Ende als letzter Tag der Runde (das Ende selbst ist 0:00 des Folgetags).
private func kunstZeitraum(_ a: String, _ z: String, _ lang: String) -> String {
    guard let da = teamDatum(a), let dz = teamDatum(z) else { return "" }
    let f: DateFormatter = kunstFormat("dM", lang)
    return f.string(from: da) + "–" + f.string(from: dz.addingTimeInterval(-0.001))
}

/// Zeitpunkt mittel (web `datum`: Tag, Monat kurz, Uhrzeit).
private func kunstDatum(_ iso: String, _ lang: String) -> String {
    guard let d = teamDatum(iso) else { return iso }
    return kunstFormat("dMMMjmm", lang).string(from: d)
}

/// Naechster Schritt einer Runde: kommt -> Start, einreichen -> Einreichschluss, abstimmen -> Aufloesung.
private func kunstZiel(_ r: KunstRundeDaten) -> String? {
    switch r.phase {
    case "kommt": return r.start
    case "einreichen": return r.einreichen_bis ?? r.ende
    case "abstimmen": return r.abstimmen_bis
    default: return nil
    }
}

/// „2d 5h 14m", in der letzten Stunde „14m 33s" — sprachneutral wie im Web.
private func kunstRest(_ iso: String, _ jetzt: Date) -> String {
    let ziel: Date = teamDatum(iso) ?? jetzt
    let s: Int = max(0, Int(ziel.timeIntervalSince(jetzt)))
    let d: Int = s / 86400
    let h: Int = (s % 86400) / 3600
    let m: Int = (s % 3600) / 60
    let sek: Int = s % 60
    if d > 0 { return String(d) + "d " + String(h) + "h " + String(m) + "m" }
    if h > 0 { return String(h) + "h " + String(m) + "m" }
    return String(m) + "m " + String(format: "%02d", sek) + "s"
}

private func kunstNorm360(_ x: Int) -> Int { ((x % 360) + 360) % 360 }

// MARK: Bild

private struct KunstFlocke {
    let x: CGFloat
    let y: CGFloat
    let r: CGFloat
    let o: Double
}

/// Schneeflocken je Bild fest verteilt (Saat = Bild-id) — derselbe Zufallsgenerator wie web `schnee()`, damit App und
/// Web gleich aussehen.
private func kunstSchnee(_ saat: Int) -> [KunstFlocke] {
    let mod: UInt64 = 4_294_967_296
    var z: UInt64 = (UInt64(max(0, saat)) &* 2_654_435_761) % mod
    if z == 0 { z = 1 }
    func zufall() -> Double {
        z = (z &* 1_664_525 &+ 1_013_904_223) % mod
        return Double(z) / Double(mod)
    }
    var aus: [KunstFlocke] = []
    aus.reserveCapacity(46)
    for _ in 0..<46 {
        let x: Double = zufall() * KUNST_BOX
        let y: Double = zufall() * KUNST_BOX
        let r: Double = 3 + zufall() * 6
        let o: Double = 0.25 + zufall() * 0.55
        aus.append(KunstFlocke(x: CGFloat(x), y: CGFloat(y), r: CGFloat(r), o: o))
    }
    return aus
}

private func kunstPfad(_ st: [CGPoint], _ s: CGFloat) -> Path {
    var p = Path()
    guard let erst = st.first else { return p }
    p.move(to: CGPoint(x: erst.x * s, y: erst.y * s))
    for q in st.dropFirst() { p.addLine(to: CGPoint(x: q.x * s, y: q.y * s)) }
    return p
}

private func kunstZeichnen(_ ctx: inout GraphicsContext, _ size: CGSize, _ flocken: [KunstFlocke], _ striche: [[CGPoint]],
                           _ dick: CGFloat) {
    let s: CGFloat = size.width / CGFloat(KUNST_BOX)
    for f in flocken {
        let r = CGRect(x: (f.x - f.r) * s, y: (f.y - f.r) * s, width: 2 * f.r * s, height: 2 * f.r * s)
        ctx.fill(Path(ellipseIn: r), with: .color(Color.white.opacity(f.o)))
    }
    let pfade: [Path] = striche.map { (st: [CGPoint]) -> Path in kunstPfad(st, s) }
    let glow = StrokeStyle(lineWidth: dick * 2.6 * s, lineCap: .round, lineJoin: .round)
    let voll = StrokeStyle(lineWidth: dick * s, lineCap: .round, lineJoin: .round)
    for p in pfade { ctx.stroke(p, with: .color(kunstCyan.opacity(0.22)), style: glow) }
    for p in pfade { ctx.stroke(p, with: .color(kunstCyan), style: voll) }
}

/// Ein Bild (web `KunstLinie`): Nachtblau, Schnee, der Track doppelt gezeichnet (breites Leuchten + Linie), quadratisch.
struct KunstLinienBild: View {
    let striche: [[CGPoint]]
    var saat: Int = 0
    var klein: Bool = false

    var body: some View {
        let flocken: [KunstFlocke] = kunstSchnee(saat)
        let linien: [[CGPoint]] = striche
        let dick: CGFloat = klein ? 30 : 22
        return Canvas { (ctx: inout GraphicsContext, size: CGSize) in
            kunstZeichnen(&ctx, size, flocken, linien, dick)
        }
        .aspectRatio(1, contentMode: .fit)
        .background(kunstNacht)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .accessibilityHidden(true)
    }
}

/// Vorschau wie server kunst.linie (web `normiere`): nur Punkte in Laeufen (ein Strich je Lauf), Norden oben, im
/// Uhrzeigersinn drehen, mittig in die 1000er-Box einpassen.
func kunstNormiere(_ punkte: [[Double]], _ drehung: Int, _ laeufe: [[Double]]) -> [[CGPoint]] {
    var striche: [[CGPoint]] = []
    var akt: [CGPoint] = []
    var aktL: Int = -1
    for p in punkte where p.count >= 3 {
        let t: Double = p[0]
        let treffer: Int? = laeufe.firstIndex { (z: [Double]) -> Bool in z.count >= 2 && z[0] <= t && t <= z[1] }
        guard let l = treffer else { continue }
        if l != aktL && !akt.isEmpty {
            striche.append(akt)
            akt = []
        }
        aktL = l
        akt.append(CGPoint(x: p[1], y: p[2]))
    }
    if !akt.isEmpty { striche.append(akt) }
    let gut: [[CGPoint]] = striche.filter { (st: [CGPoint]) -> Bool in st.count >= 2 }
    if gut.isEmpty { return [] }
    let w: Double = Double(drehung) * Double.pi / 180
    let c: Double = cos(w)
    let s: Double = sin(w)
    var q: [[CGPoint]] = []
    var minX: Double = Double.infinity
    var minY: Double = Double.infinity
    var maxX: Double = -Double.infinity
    var maxY: Double = -Double.infinity
    for st in gut {
        var neu: [CGPoint] = []
        neu.reserveCapacity(st.count)
        for pt in st {
            let x: Double = Double(pt.x)
            let y: Double = Double(pt.y)
            let nx: Double = x * c + y * s
            let ny: Double = x * s - y * c
            minX = min(minX, nx)
            minY = min(minY, ny)
            maxX = max(maxX, nx)
            maxY = max(maxY, ny)
            neu.append(CGPoint(x: nx, y: ny))
        }
        q.append(neu)
    }
    let bx: Double = maxX - minX
    let by: Double = maxY - minY
    let m0: Double = max(bx, by)
    let m: Double = m0 > 0 ? m0 : 1
    let rand: Double = KUNST_BOX * 0.04
    let f: Double = (KUNST_BOX - 2 * rand) / m
    let ox: Double = (KUNST_BOX - bx * f) / 2 - minX * f
    let oy: Double = (KUNST_BOX - by * f) / 2 - minY * f
    return q.map { (st: [CGPoint]) -> [CGPoint] in
        st.map { (pt: CGPoint) -> CGPoint in
            CGPoint(x: (Double(pt.x) * f + ox).rounded(), y: (Double(pt.y) * f + oy).rounded())
        }
    }
}

// MARK: Kleine Bausteine

/// Herz-Knopf (Abstimmen) — in der Galerie klein, im Vollbild gross auf dunklem Grund.
private struct KunstHerzKnopf: View {
    let an: Bool
    let voll: Bool
    let gross: Bool
    let dunkel: Bool
    let busy: Bool
    let lang: String
    let aktion: () -> Void

    private var schrift: Font { gross ? Font.headline : Font.subheadline.weight(.semibold) }
    private var textFarbe: Color {
        if an { return Color.black }
        return dunkel ? Color.white : Color.primary
    }
    private var flaeche: Color {
        if an { return kunstCyan }
        return dunkel ? Color.white.opacity(0.15) : Color.secondary.opacity(0.18)
    }
    private var hinweis: String { voll ? Loc.t("kunst.keineHerzen", lang) : "" }

    var body: some View {
        Button(action: aktion) { inhalt }
            .buttonStyle(.borderless)
            .disabled(voll || busy)
            .opacity(voll ? 0.4 : 1)
            .accessibilityHint(hinweis)
            .accessibilityAddTraits(an ? AccessibilityTraits.isSelected : AccessibilityTraits())
    }

    private var inhalt: some View {
        HStack(spacing: 6) {
            Image(systemName: an ? "heart.fill" : "heart")
            Text(Loc.t("kunst.herz", lang))
        }
        .font(schrift)
        .foregroundStyle(textFarbe)
        .padding(.horizontal, gross ? 16 : 10)
        .padding(.vertical, gross ? 9 : 5)
        .background(flaeche, in: RoundedRectangle(cornerRadius: 10))
    }
}

/// „3 ♥" der Aufloesung.
private struct KunstHerzen: View {
    let n: Int
    var gross: Bool = false
    var hell: Bool = false
    let lang: String

    var body: some View {
        HStack(spacing: 4) {
            Text(String(n)).monospacedDigit()
            Image(systemName: "heart.fill").foregroundStyle(kunstCyan)
        }
        .font(gross ? Font.body.weight(.semibold) : Font.subheadline.weight(.semibold))
        .foregroundStyle(hell ? Color.white : Color.primary)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(teamText("kunst.herzenN", lang, ["n": String(n)]))
    }
}

/// Schliessen-Knopf oben rechts an den Vollbild-Karten.
private struct KunstSchliessen: View {
    let lang: String
    let aktion: () -> Void

    var body: some View {
        Button(action: aktion) {
            Image(systemName: "xmark")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(Color.white)
                .frame(width: 36, height: 36)
                .background(Color(red: 15 / 255, green: 23 / 255, blue: 42 / 255), in: Circle())
                .overlay(Circle().strokeBorder(kunstCyan.opacity(0.5), lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Loc.t("common.close", lang))
    }
}

/// Pfeile links/rechts ueber dem grossen Bild (blaettern).
private struct KunstPfeile: View {
    let lang: String
    let weiter: (Int) -> Void

    var body: some View {
        HStack {
            pfeil("chevron.left", -1, "kunst.zurueck")
            Spacer()
            pfeil("chevron.right", 1, "kunst.weiter")
        }
        .padding(.horizontal, 8)
    }

    private func pfeil(_ symbol: String, _ d: Int, _ key: String) -> some View {
        Button { weiter(d) } label: {
            Image(systemName: symbol)
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(Color.white)
                .frame(width: 40, height: 40)
                .background(Color.black.opacity(0.55), in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Loc.t(key, lang))
    }
}

/// Wischen nach links/rechts blaettert (zusaetzlich zu den Pfeilen).
private func kunstWischen(_ weiter: @escaping (Int) -> Void) -> some Gesture {
    DragGesture(minimumDistance: 30).onEnded { (w: DragGesture.Value) in
        if w.translation.width < -40 {
            weiter(1)
        } else if w.translation.width > 40 {
            weiter(-1)
        }
    }
}

/// Dunkle Vollbild-Karte (web: eigener Kasten mit Rahmen und Hintergrund, in beiden Farbschemata gleich).
private struct KunstVollKasten: ViewModifier {
    let lang: String
    let onZu: () -> Void

    func body(content: Content) -> some View {
        content
            .padding(14)
            .background(kunstTief, in: RoundedRectangle(cornerRadius: 24))
            .overlay(RoundedRectangle(cornerRadius: 24).strokeBorder(kunstCyan.opacity(0.35), lineWidth: 1))
            .overlay(alignment: .topTrailing) { KunstSchliessen(lang: lang, aktion: onZu).offset(x: 10, y: -10) }
            .frame(maxWidth: 520)
            .environment(\.colorScheme, .dark)
    }
}

// MARK: Bereich auf der Event-Seite

private struct KunstVollbild: Identifiable {
    let id = UUID()
    let ids: [Int]
    let start: Int
}

/// GPS-Kunst auf der Event-Seite (web KunstBereich): Runden-Auswahl mit Countdown, Info-Zeile, eigenes Bild, Galerie
/// mit Herzen bzw. die Aufloesung. `stand` zaehlt hoch, wenn die Event-Seite neu laedt (Ziehen zum Aktualisieren).
struct KunstBereich: View {
    let eventId: Int
    let stand: Int
    let lang: String
    @State private var d: KunstEventDaten?
    @State private var fehler: String?
    @State private var nr: Int?
    /// Gesamtuebersicht aller fertigen Runden (web `alle`, erst ab 2 fertigen Runden).
    @State private var alle = false
    @State private var editor = false
    @State private var voll: KunstVollbild?
    @State private var busy = false
    @State private var meldenOffen = false
    @State private var meldenZiel: Int = 0
    @State private var meldenText = ""
    @State private var gemeldet: Set<Int> = []

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let f = fehler { fehlerBox(f) }
            hauptteil
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .task(id: stand) { await laden() }
        .sheet(isPresented: $editor) { editorSheet }
        .fullScreenCover(item: $voll) { (v: KunstVollbild) in vollbild(v) }
        .alert(Loc.t("kunst.melden", lang), isPresented: $meldenOffen) { meldenKnoepfe } message: {
            Text(Loc.t("kunst.meldenFrage", lang))
        }
    }

    @ViewBuilder private var hauptteil: some View {
        if let dd = d, let r = runde(dd) {
            inhalt(dd, r)
        } else if fehler == nil {
            ProgressView().frame(maxWidth: .infinity)
        }
    }

    private func fehlerBox(_ f: String) -> some View {
        Text(f).font(.subheadline).foregroundStyle(Color.red)
            .frame(maxWidth: .infinity, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)
    }

    /// Standard-Runde: laufende Abstimmung vor laufendem Einreichen, sonst die letzte fertige.
    private func runde(_ dd: KunstEventDaten) -> KunstRundeDaten? {
        let r: [KunstRundeDaten] = dd.runden
        if let n = nr, let x = r.first(where: { $0.nr == n }) { return x }
        if let x = r.first(where: { $0.phase == "abstimmen" }) { return x }
        if let x = r.first(where: { $0.phase == "einreichen" }) { return x }
        if let x = r.last(where: { $0.phase == "fertig" }) { return x }
        return r.first
    }

    private func inhalt(_ dd: KunstEventDaten, _ r: KunstRundeDaten) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(teamText("kunst.intro", lang, ["n": String(dd.herzenJeRunde)]))
                .font(.subheadline).foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            if dd.runden.count > 1 { rundenWahl(dd.runden, r.nr) }
            if alle && fertigeRunden(dd).count >= 2 {
                KunstGesamt(runden: fertigeRunden(dd), lang: lang)
            } else {
                rundenInhalt(dd, r)
            }
        }
    }

    private func fertigeRunden(_ dd: KunstEventDaten) -> [KunstRundeDaten] {
        dd.runden.filter { $0.phase == "fertig" }
    }

    private func rundenInhalt(_ dd: KunstEventDaten, _ r: KunstRundeDaten) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(infoText(dd, r)).font(.subheadline.weight(.medium))
                .fixedSize(horizontal: false, vertical: true)
            if dd.darfTeilnehmen && (r.phase == "einreichen" || r.phase == "abstimmen") { eigenKarte(r) }
            unten(dd, r)
        }
    }

    // MARK: Runden

    private func rundenWahl(_ runden: [KunstRundeDaten], _ aktiv: Int) -> some View {
        TimelineView(.periodic(from: Date(), by: 1)) { ctx in
            rundenChips(runden, aktiv, ctx.date)
        }
    }

    private func rundenChips(_ runden: [KunstRundeDaten], _ aktiv: Int, _ jetzt: Date) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(runden, id: \.nr) { (x: KunstRundeDaten) in chip(x, !alle && x.nr == aktiv, jetzt) }
                if runden.filter({ $0.phase == "fertig" }).count >= 2 { alleChip }
            }
        }
    }

    private func chipTitel(_ x: KunstRundeDaten) -> String {
        let runde: String = teamText("kunst.runde", lang, ["n": String(x.nr)])
        let zeit: String = kunstZeitraum(x.start, x.ende, lang)
        let phase: String = Loc.t("kunst.phase." + x.phase, lang)
        return runde + " · " + zeit + " · " + phase
    }

    private func chip(_ x: KunstRundeDaten, _ an: Bool, _ jetzt: Date) -> some View {
        Button {
            nr = x.nr
            alle = false
        } label: { chipInhalt(x, an, jetzt) }
            .buttonStyle(.plain)
            .foregroundStyle(an ? Color.black : Color.primary)
            .background(an ? kunstCyan : Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
            .accessibilityAddTraits(an ? AccessibilityTraits.isSelected : AccessibilityTraits())
    }

    private var alleChip: some View {
        Button { alle = true } label: {
            Text(Loc.t("kunst.alle", lang)).font(alle ? Font.subheadline.weight(.semibold) : Font.subheadline)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
        }
        .buttonStyle(.plain)
        .foregroundStyle(alle ? Color.black : Color.primary)
        .background(alle ? kunstCyan : Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
        .accessibilityAddTraits(alle ? AccessibilityTraits.isSelected : AccessibilityTraits())
    }

    private func chipInhalt(_ x: KunstRundeDaten, _ an: Bool, _ jetzt: Date) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(chipTitel(x)).font(an ? Font.subheadline.weight(.semibold) : Font.subheadline)
            // Countdown bis zum naechsten Schritt der Runde (web: zweite Zeile).
            if let z = kunstZiel(x) {
                // Vor dem Start „startet in …", sonst „noch …" (web 18.11.2026).
                let key: String = x.phase == "kommt" ? "kunst.startetIn" : "kunst.noch"
                Text(teamText(key, lang, ["zeit": kunstRest(z, jetzt)]))
                    .font(.caption).monospacedDigit().opacity(0.8)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
    }

    private func infoText(_ dd: KunstEventDaten, _ r: KunstRundeDaten) -> String {
        switch r.phase {
        case "kommt":
            return teamText("kunst.info.kommt", lang, ["datum": kunstDatum(r.start, lang)])
        case "einreichen":
            let werte: [String: String] = ["datum": kunstDatum(r.einreichen_bis ?? r.ende, lang), "n": String(r.anzahl ?? 0)]
            return teamText("kunst.info.einreichen", lang, werte)
        case "abstimmen":
            let rest: Int = dd.herzenJeRunde - r.vergeben
            let werte: [String: String] = ["datum": kunstDatum(r.abstimmen_bis, lang), "rest": String(rest),
                                           "n": String(dd.herzenJeRunde)]
            return teamText("kunst.info.abstimmen", lang, werte)
        default:
            return teamText("kunst.info.fertig", lang, ["n": String((r.ergebnis ?? []).count)])
        }
    }

    // MARK: Eigenes Bild

    private func eigenKarte(_ r: KunstRundeDaten) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 12) {
                if let e = r.eigen {
                    KunstLinienBild(striche: e.linie.striche, saat: e.id, klein: true).frame(width: 96)
                }
                eigenText(r)
                Spacer(minLength: 0)
            }
            if r.phase == "einreichen" && r.eigen?.entfernt == nil { eigenKnoepfe(r) }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.secondary.opacity(0.35), lineWidth: 1))
    }

    private func eigenKey(_ r: KunstRundeDaten) -> String {
        if r.eigen != nil { return r.phase == "einreichen" ? "kunst.eigenDa" : "kunst.eigenAbstimmung" }
        return r.phase == "einreichen" ? "kunst.eigenNoch" : "kunst.eigenKeins"
    }

    @ViewBuilder private func eigenText(_ r: KunstRundeDaten) -> some View {
        if let grund = r.eigen?.entfernt {
            Text(teamText("kunst.eigenEntfernt", lang, ["grund": grund]))
                .font(.subheadline).foregroundStyle(Color.red)
                .fixedSize(horizontal: false, vertical: true)
        } else {
            Text(Loc.t(eigenKey(r), lang))
                .font(.subheadline).foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func eigenKnoepfe(_ r: KunstRundeDaten) -> some View {
        HStack(spacing: 8) {
            Button { editor = true } label: {
                Text(Loc.t(r.eigen == nil ? "kunst.einreichen" : "kunst.aendern", lang)).fontWeight(.semibold)
            }
            .buttonStyle(.borderedProminent)
            .tint(kunstCyan)
            .foregroundStyle(Color.black)
            if r.eigen != nil {
                Button(Loc.t("kunst.zurueckziehen", lang)) { zurueckziehen(r.nr) }
                    .buttonStyle(.bordered)
                    .disabled(busy)
            }
        }
    }

    @ViewBuilder private var editorSheet: some View {
        if let dd = d, let r = runde(dd) {
            KunstEditor(eventId: eventId, runde: r, lang: lang, onFertig: {
                editor = false
                Task { await laden() }
            })
        }
    }

    // MARK: Galerie

    @ViewBuilder private func unten(_ dd: KunstEventDaten, _ r: KunstRundeDaten) -> some View {
        if r.phase == "fertig" {
            KunstAufloesung(nr: r.nr, liste: r.ergebnis ?? [], lang: lang)
        } else if r.bilder.isEmpty {
            if r.phase != "kommt" {
                let key: String = r.phase == "einreichen" && dd.moderieren != true ? "kunst.galerieSpaeter" : "kunst.leer"
                Text(Loc.t(key, lang)).font(.subheadline).foregroundStyle(.secondary)
            }
        } else {
            galerie(dd, r)
        }
    }

    /// Eigene Herzen zuerst (web 18.11.2026), sonst die feste Mischung des Servers (stabil sortiert).
    private func sortiert(_ r: KunstRundeDaten) -> [KunstBildDaten] {
        let mit: [KunstBildDaten] = r.bilder.filter { $0.herz == true }
        let ohne: [KunstBildDaten] = r.bilder.filter { $0.herz != true }
        return mit + ohne
    }

    private func galerie(_ dd: KunstEventDaten, _ r: KunstRundeDaten) -> some View {
        let liste: [KunstBildDaten] = sortiert(r)
        let ids: [Int] = liste.map { $0.id }
        let spalten: [GridItem] = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]
        return LazyVGrid(columns: spalten, spacing: 12) {
            ForEach(liste) { (b: KunstBildDaten) in kachel(dd, r, b, ids) }
        }
    }

    private func kannHerz(_ dd: KunstEventDaten, _ r: KunstRundeDaten, _ b: KunstBildDaten) -> Bool {
        r.phase == "abstimmen" && dd.darfTeilnehmen && b.eigen != true && b.entfernt == nil
    }

    private func herzenVoll(_ dd: KunstEventDaten, _ r: KunstRundeDaten, _ b: KunstBildDaten) -> Bool {
        r.vergeben >= dd.herzenJeRunde && b.herz != true
    }

    private func kachel(_ dd: KunstEventDaten, _ r: KunstRundeDaten, _ b: KunstBildDaten, _ ids: [Int]) -> some View {
        let rand: Color = b.herz == true ? kunstCyan : Color.secondary.opacity(0.35)
        return VStack(alignment: .leading, spacing: 8) {
            Button { oeffnen(ids, b.id) } label: { KunstLinienBild(striche: b.linie.striche, saat: b.id) }
                .buttonStyle(.plain)
                .accessibilityLabel(Loc.t("kunst.gross", lang))
            kachelFuss(dd, r, b)
            if let grund = b.entfernt { Text(grund).font(.caption).foregroundStyle(.secondary) }
        }
        .padding(8)
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(rand, lineWidth: 1.5))
        .opacity(b.entfernt != nil ? 0.5 : 1)
    }

    private func kachelFuss(_ dd: KunstEventDaten, _ r: KunstRundeDaten, _ b: KunstBildDaten) -> some View {
        HStack(spacing: 6) {
            if kannHerz(dd, r, b) {
                KunstHerzKnopf(an: b.herz == true, voll: herzenVoll(dd, r, b), gross: false, dunkel: false, busy: busy,
                               lang: lang, aktion: { herz(b.id) })
            }
            if b.eigen == true {
                Text(Loc.t("kunst.deinBild", lang)).font(.caption.weight(.semibold)).foregroundStyle(kunstCyan)
            }
            Spacer(minLength: 0)
            if b.eigen != true && dd.moderieren != true { meldenKnopf(b.id) }
        }
    }

    private func meldenKnopf(_ id: Int) -> some View {
        let schon: Bool = gemeldet.contains(id)
        return Button(Loc.t(schon ? "kunst.gemeldet" : "kunst.melden", lang)) {
            meldenZiel = id
            meldenText = ""
            meldenOffen = true
        }
        .buttonStyle(.borderless)
        .font(.caption)
        .foregroundStyle(.secondary)
        .disabled(schon)
    }

    @ViewBuilder private var meldenKnoepfe: some View {
        TextField("", text: $meldenText)
        Button(Loc.t("kunst.melden", lang)) { melden() }
        Button(Loc.t("common.cancel", lang), role: .cancel) {}
    }

    private func oeffnen(_ ids: [Int], _ id: Int) {
        voll = KunstVollbild(ids: ids, start: ids.firstIndex(of: id) ?? 0)
    }

    @ViewBuilder private func vollbild(_ v: KunstVollbild) -> some View {
        if let dd = d, let r = runde(dd) {
            KunstAbstimmGalerie(ids: v.ids, start: v.start, runde: r, herzenJeRunde: dd.herzenJeRunde,
                                teilnehmen: dd.darfTeilnehmen, busy: busy, fehler: fehler, lang: lang,
                                onHerz: { (id: Int) in herz(id) }, onZu: { voll = nil })
        }
    }

    // MARK: Aktionen

    private func laden() async {
        do {
            let x: KunstEventDaten = try await Api.kunst(eventId)
            d = x
            fehler = nil
        } catch {
            fehler = kunstFehlerText(error, lang)
        }
    }

    private func herz(_ id: Int) {
        guard !busy else { return }
        busy = true
        Task {
            do {
                try await Api.kunstHerz(id)
                await laden()
            } catch {
                fehler = kunstFehlerText(error, lang)
            }
            busy = false
        }
    }

    private func zurueckziehen(_ runde: Int) {
        guard !busy else { return }
        busy = true
        Task {
            do {
                try await Api.kunstZurueckziehen(eventId, runde: runde)
                await laden()
            } catch {
                fehler = kunstFehlerText(error, lang)
            }
            busy = false
        }
    }

    private func melden() {
        let id: Int = meldenZiel
        let grund: String = meldenText.trimmingCharacters(in: .whitespacesAndNewlines)
        Task {
            do {
                try await Api.kunstMelden(id, grund: grund)
                gemeldet.insert(id)
            } catch {
                fehler = kunstFehlerText(error, lang)
            }
        }
    }
}

// MARK: Vollbild zum Abstimmen

/// Grosses Bild zum Durchblaettern mit Herz-Knopf und Restzahl (web AbstimmGalerie). Die Reihenfolge `ids` ist beim
/// Oeffnen festgehalten, damit nach einem Herz nichts wegspringt; der Herz-Stand kommt live aus der Runde.
private struct KunstAbstimmGalerie: View {
    let ids: [Int]
    let runde: KunstRundeDaten
    let herzenJeRunde: Int
    let teilnehmen: Bool
    let busy: Bool
    let fehler: String?
    let lang: String
    let onHerz: (Int) -> Void
    let onZu: () -> Void
    @State private var i: Int

    init(ids: [Int], start: Int, runde: KunstRundeDaten, herzenJeRunde: Int, teilnehmen: Bool, busy: Bool,
         fehler: String?, lang: String, onHerz: @escaping (Int) -> Void, onZu: @escaping () -> Void) {
        self.ids = ids
        self.runde = runde
        self.herzenJeRunde = herzenJeRunde
        self.teilnehmen = teilnehmen
        self.busy = busy
        self.fehler = fehler
        self.lang = lang
        self.onHerz = onHerz
        self.onZu = onZu
        _i = State(initialValue: start)
    }

    private var bild: KunstBildDaten? {
        guard ids.indices.contains(i) else { return nil }
        let id: Int = ids[i]
        return runde.bilder.first { $0.id == id }
    }

    private func weiter(_ d: Int) {
        guard !ids.isEmpty else { return }
        i = (i + d + ids.count) % ids.count
    }

    var body: some View {
        ZStack {
            Color.black.opacity(0.92).ignoresSafeArea().onTapGesture { onZu() }
            if let b = bild { kasten(b).padding(16) }
        }
    }

    private func kannHerz(_ b: KunstBildDaten) -> Bool {
        runde.phase == "abstimmen" && teilnehmen && b.eigen != true && b.entfernt == nil
    }

    private var uebrigText: String {
        let werte: [String: String] = ["rest": String(herzenJeRunde - runde.vergeben), "n": String(herzenJeRunde)]
        return teamText("kunst.uebrig", lang, werte)
    }

    private func kasten(_ b: KunstBildDaten) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            bildRahmen(b)
            leiste(b)
            if kannHerz(b) {
                KunstHerzKnopf(an: b.herz == true, voll: runde.vergeben >= herzenJeRunde && b.herz != true, gross: true,
                               dunkel: true, busy: busy, lang: lang, aktion: { onHerz(b.id) })
            }
            if let f = fehler { Text(f).font(.footnote).foregroundStyle(Color.red) }
        }
        .modifier(KunstVollKasten(lang: lang, onZu: onZu))
    }

    private func bildRahmen(_ b: KunstBildDaten) -> some View {
        KunstLinienBild(striche: b.linie.striche, saat: b.id)
            .padding(6)
            .background(b.herz == true ? kunstCyan : Color.clear, in: RoundedRectangle(cornerRadius: 16))
            .overlay { if ids.count > 1 { KunstPfeile(lang: lang, weiter: { (d: Int) in weiter(d) }) } }
            .gesture(kunstWischen { (d: Int) in weiter(d) })
    }

    private func leiste(_ b: KunstBildDaten) -> some View {
        HStack(spacing: 12) {
            Text(String(i + 1) + " / " + String(ids.count)).font(.subheadline).monospacedDigit()
            if b.eigen == true {
                Text(Loc.t("kunst.deinBild", lang)).font(.subheadline.weight(.semibold)).foregroundStyle(kunstCyan)
            }
            Spacer(minLength: 4)
            if runde.phase == "abstimmen" && teilnehmen { Text(uebrigText).font(.subheadline) }
        }
        .foregroundStyle(Color(white: 0.9))
    }
}

// MARK: Editor

/// Bild einreichen/aendern (web Editor): Session-Kacheln (nach der Wahl nur noch „andere Session waehlen"), Von/Bis
/// ueber den Track, Drehung mit Regler und ±15/±90, Live-Vorschau mit `kunstNormiere`.
private struct KunstEditor: View {
    let eventId: Int
    let runde: KunstRundeDaten
    let lang: String
    let onFertig: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var kand: [KunstKandidat]?
    @State private var sid: Int?
    @State private var spur: [[Double]]?
    @State private var laeufe: [[Double]] = []
    @State private var von: Int = 0
    @State private var bis: Int = 0
    @State private var dreh: Int
    @State private var fehler: String?
    @State private var laeuft = false

    init(eventId: Int, runde: KunstRundeDaten, lang: String, onFertig: @escaping () -> Void) {
        self.eventId = eventId
        self.runde = runde
        self.lang = lang
        self.onFertig = onFertig
        _sid = State(initialValue: runde.eigen?.session_id)
        _dreh = State(initialValue: runde.eigen?.drehung ?? 0)
    }

    var body: some View {
        NavigationStack {
            ScrollView { inhalt.padding() }
                .navigationTitle(teamText("kunst.editorTitel", lang, ["n": String(runde.nr)]))
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { leiste }
        }
        .task { await kandidatenLaden() }
        .task(id: sid) { await spurLaden() }
    }

    @ToolbarContentBuilder private var leiste: some ToolbarContent {
        ToolbarItem(placement: .cancellationAction) {
            Button(Loc.t("common.cancel", lang)) { dismiss() }
        }
    }

    private var inhalt: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(Loc.t("kunst.editorHinweis", lang)).font(.subheadline).foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            auswahl
            spurTeil
            if let f = fehler {
                Text(f).font(.subheadline).foregroundStyle(Color.red).fixedSize(horizontal: false, vertical: true)
            }
            sendenKnopf
        }
    }

    // MARK: Session-Wahl

    private var keineText: String {
        let werte: [String: String] = ["von": kunstDatum(runde.start, lang), "bis": kunstDatum(runde.ende, lang)]
        return teamText("kunst.keineSessions", lang, werte)
    }

    @ViewBuilder private var auswahl: some View {
        if let k = kand {
            if k.isEmpty {
                Text(keineText).font(.subheadline)
            } else if let s = sid {
                gewaehltZeile(k.first { $0.id == s })
            } else {
                kachelRaster(k)
            }
        } else {
            ProgressView().frame(maxWidth: .infinity)
        }
    }

    private func kandZeit(_ k: KunstKandidat) -> String {
        guard let d = teamDatum(k.started_at) else { return "" }
        return kunstFormat("EEEdMMMjmm", lang).string(from: d)
    }

    private func kandSport(_ k: KunstKandidat) -> String {
        guard let s = k.sport_class, !s.isEmpty else { return "" }
        return Loc.t("cls.sport." + s, lang)
    }

    private func kandUnterzeile(_ k: KunstKandidat) -> String {
        guard let c = k.caption, !c.isEmpty else { return kandSport(k) }
        return kandSport(k) + " · " + c
    }

    private func gewaehltText(_ k: KunstKandidat?) -> String {
        guard let k else { return "" }
        let sport: String = kandSport(k)
        return sport.isEmpty ? kandZeit(k) : kandZeit(k) + " · " + sport
    }

    private func gewaehltZeile(_ k: KunstKandidat?) -> some View {
        HStack(spacing: 8) {
            Text(gewaehltText(k)).font(.subheadline).lineLimit(1)
            Spacer(minLength: 4)
            Button(Loc.t("kunst.andereSession", lang)) {
                sid = nil
                spur = nil
            }
            .buttonStyle(.bordered)
        }
    }

    private func kachelRaster(_ k: [KunstKandidat]) -> some View {
        let spalten: [GridItem] = Array(repeating: GridItem(.flexible(), spacing: 8), count: 3)
        return LazyVGrid(columns: spalten, spacing: 8) {
            ForEach(k) { (x: KunstKandidat) in kandKachel(x) }
        }
    }

    private func kandKachel(_ x: KunstKandidat) -> some View {
        Button { sid = x.id } label: {
            VStack(alignment: .leading, spacing: 2) {
                KunstLinienBild(striche: x.vorschau.striche, saat: x.id, klein: true)
                Text(kandZeit(x)).font(.caption2).lineLimit(1)
                Text(kandUnterzeile(x)).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
            }
        }
        .buttonStyle(.plain)
    }

    // MARK: Zuschneiden und Drehen

    @ViewBuilder private var spurTeil: some View {
        if let p = spur, p.count >= 3 {
            regler(p)
        } else if sid != nil && spur == nil && fehler == nil {
            ProgressView().frame(maxWidth: .infinity)
        }
    }

    /// Gewaehltes Stueck (Indizes auf die Spur begrenzt).
    private func stueck(_ p: [[Double]]) -> [[Double]] {
        guard !p.isEmpty else { return [] }
        let a: Int = min(max(0, von), p.count - 1)
        let b: Int = min(max(a, bis), p.count - 1)
        return Array(p[a...b])
    }

    private var vorschau: [[CGPoint]] {
        guard let p = spur else { return [] }
        return kunstNormiere(stueck(p), kunstNorm360(dreh), laeufe)
    }

    private func zeitMs(_ p: [[Double]], _ i: Int) -> Double {
        guard p.indices.contains(i) else { return 0 }
        return p[i].first ?? 0
    }

    private func minute(_ p: [[Double]], _ i: Int) -> Int {
        Int(((zeitMs(p, i) - zeitMs(p, 0)) / 60000).rounded())
    }

    private var vonWert: Binding<Double> {
        Binding<Double>(get: { Double(von) }, set: { (v: Double) in
            let i: Int = Int(v.rounded())
            von = i
            if bis <= i { bis = i + 1 }
        })
    }

    private var bisWert: Binding<Double> {
        Binding<Double>(get: { Double(bis) }, set: { (v: Double) in
            let i: Int = Int(v.rounded())
            bis = i
            if von >= i { von = i - 1 }
        })
    }

    private var drehWert: Binding<Double> {
        Binding<Double>(get: { Double(kunstNorm360(dreh)) }, set: { (v: Double) in dreh = Int(v.rounded()) })
    }

    private func regler(_ p: [[Double]]) -> some View {
        let bild: [[CGPoint]] = vorschau
        let n: Int = bild.reduce(0) { (s: Int, st: [CGPoint]) -> Int in s + st.count }
        let vonMax: Double = Double(p.count - 2)
        let bisMax: Double = Double(p.count - 1)
        return VStack(alignment: .leading, spacing: 8) {
            KunstLinienBild(striche: bild, saat: sid ?? 0)
            Text(teamText("kunst.von", lang, ["min": String(minute(p, von))])).font(.subheadline)
            Slider(value: vonWert, in: 0...vonMax, step: 1)
            Text(teamText("kunst.bis", lang, ["min": String(minute(p, bis))])).font(.subheadline)
            Slider(value: bisWert, in: 1...bisMax, step: 1)
            Text(teamText("kunst.drehung", lang, ["grad": String(kunstNorm360(dreh))])).font(.subheadline)
            Slider(value: drehWert, in: 0...359, step: 1)
            drehKnoepfe
            Text(teamText("kunst.punkte", lang, ["n": String(n)])).font(.caption).foregroundStyle(.secondary)
        }
    }

    private var drehKnoepfe: some View {
        HStack(spacing: 8) {
            ForEach([-90, -15, 15, 90], id: \.self) { (g: Int) in
                Button(g > 0 ? "+" + String(g) + "°" : String(g) + "°") { dreh += g }
                    .buttonStyle(.bordered)
                    .font(.caption)
            }
        }
    }

    private var aufFoil: Int { vorschau.reduce(0) { (s: Int, st: [CGPoint]) -> Int in s + st.count } }

    private var kannSenden: Bool {
        guard let p = spur, p.count >= 3, !laeuft else { return false }
        return aufFoil >= 10
    }

    private var sendenKnopf: some View {
        Button { senden() } label: {
            Text(Loc.t(runde.eigen == nil ? "kunst.einreichen" : "kunst.speichern", lang))
                .fontWeight(.semibold)
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .tint(kunstCyan)
        .foregroundStyle(Color.black)
        .disabled(!kannSenden)
    }

    // MARK: Laden / Senden

    private func kandidatenLaden() async {
        do {
            let k: [KunstKandidat] = try await Api.kunstKandidaten(eventId, runde: runde.nr)
            kand = k
        } catch {
            kand = []
        }
    }

    private func spurLaden() async {
        guard let s = sid else { return }
        spur = nil
        fehler = nil
        do {
            let r: KunstSpur = try await Api.kunstSpur(eventId, sessionId: s)
            let p: [[Double]] = r.punkte
            var iv: Int = 0
            var ib: Int = max(0, p.count - 1)
            // Beim eigenen, schon eingereichten Bild das gewaehlte Stueck wiederherstellen, sonst die ganze Session.
            if let e = runde.eigen, e.session_id == s {
                let vonMs: Double = e.von_ms ?? 0
                let bisMs: Double = e.bis_ms ?? Double.infinity
                iv = p.firstIndex { (x: [Double]) -> Bool in (x.first ?? 0) >= vonMs } ?? 0
                ib = p.lastIndex { (x: [Double]) -> Bool in (x.first ?? 0) <= bisMs } ?? (p.count - 1)
            }
            let letzter: Int = max(1, p.count - 1)
            von = min(iv, max(0, letzter - 1))
            bis = min(max(von + 1, ib), letzter)
            laeufe = r.laeufe
            spur = p
        } catch {
            fehler = kunstFehlerText(error, lang)
        }
    }

    private func senden() {
        guard let p = spur, let s = sid, p.indices.contains(von), p.indices.contains(bis) else { return }
        laeuft = true
        fehler = nil
        let vonMs: Int = Int(zeitMs(p, von))
        let bisMs: Int = Int(zeitMs(p, bis))
        let grad: Int = kunstNorm360(dreh)
        let nr: Int = runde.nr
        Task {
            do {
                try await Api.kunstEinreichen(eventId, runde: nr, sessionId: s, vonMs: vonMs, bisMs: bisMs, drehung: grad)
                laeuft = false
                onFertig()
            } catch {
                fehler = kunstFehlerText(error, lang)
                laeuft = false
            }
        }
    }
}

// MARK: Aufloesung

private struct KunstOffen: Identifiable {
    let index: Int
    var id: Int { index }
}

/// Aufloesung (web Aufloesung): Platz 1–3 als Treppchen 2-1-3 in Gold/Silber/Bronze mit Fanfare (eigener Jingle, sonst
/// die Event-Fanfare; Stumm-Einstellung geteilt mit dem Event-Treppchen), darunter alle weiteren; Tipp -> Vollbild.
private struct KunstAufloesung: View {
    let nr: Int
    let liste: [KunstErgebnisZeile]
    let lang: String
    @AppStorage("podest-stumm") private var stumm = false
    /// Fuer welche Runde der Ton schon lief — zurueck von einer Session spielt er nicht noch einmal.
    @State private var gespielt: Int?
    @State private var offen: KunstOffen?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if liste.isEmpty {
                Text(Loc.t("kunst.leer", lang)).font(.subheadline).foregroundStyle(.secondary)
            } else {
                tonZeile
                treppe
                rest
            }
        }
        .onAppear { fanfareBeimBetreten() }
        .onChange(of: nr) { _ in fanfareBeimBetreten() }
        .onDisappear { PodestTon.shared.anhalten() }
        .fullScreenCover(item: $offen) { (o: KunstOffen) in
            KunstErgebnisGalerie(liste: liste, start: o.index, lang: lang, onZu: { offen = nil })
        }
    }

    private func fanfareBeimBetreten() {
        guard gespielt != nr, !liste.isEmpty else { return }
        gespielt = nr
        if !stumm { fanfare() }
    }

    private func fanfare() {
        PodestTon.shared.abspielen(KUNST_TON, ersatz: PODEST_TON)
    }

    private var tonZeile: some View {
        HStack(spacing: 10) {
            Spacer(minLength: 0)
            stummSchalter
            tonKnopf
        }
    }

    private var tonKnopf: some View {
        Button { fanfare() } label: {
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

    private var treppe: some View {
        let oben: [(x: KunstErgebnisZeile, platz: Int)] = podestTreppe(liste)
        return HStack(alignment: .bottom, spacing: 10) {
            ForEach(oben, id: \.platz) { e in
                KunstPodestPlatz(z: e.x, lang: lang, aktion: { offen = KunstOffen(index: e.platz - 1) })
                    .frame(maxWidth: .infinity)
            }
        }
        .padding(.top, 4)
    }

    @ViewBuilder private var rest: some View {
        if liste.count > 3 {
            let spalten: [GridItem] = Array(repeating: GridItem(.flexible(), spacing: 8), count: 3)
            let weitere: [Int] = Array(liste.indices.dropFirst(3))
            LazyVGrid(columns: spalten, spacing: 8) {
                ForEach(weitere, id: \.self) { (k: Int) in restKachel(k) }
            }
        }
    }

    private func restKachel(_ k: Int) -> some View {
        let z: KunstErgebnisZeile = liste[k]
        return Button { offen = KunstOffen(index: k) } label: {
            VStack(alignment: .leading, spacing: 4) {
                KunstLinienBild(striche: z.linie.striche, saat: z.bild_id, klein: true)
                HStack(spacing: 4) {
                    Text(String(z.platz) + ".").font(.caption.weight(.bold)).monospacedDigit()
                    Text(z.name ?? "—").font(.caption).lineLimit(1)
                    Spacer(minLength: 0)
                    KunstHerzen(n: z.herzen, lang: lang)
                }
            }
            .padding(6)
            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Color.secondary.opacity(0.35), lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

/// Ein Platz auf dem Treppchen: Bild im Metallrahmen, Platz, Name, Herzen (Gold am hoechsten).
private struct KunstPodestPlatz: View {
    let z: KunstErgebnisZeile
    let lang: String
    let aktion: () -> Void

    private var p: Int { min(max(z.platz, 1), 3) }
    private var abstandUnten: CGFloat { p == 1 ? 40 : (p == 2 ? 16 : 0) }
    private var breite: CGFloat { p == 1 ? 260 : (p == 2 ? 210 : 190) }

    var body: some View {
        Button(action: aktion) { inhalt }
            .buttonStyle(.plain)
    }

    private var inhalt: some View {
        VStack(spacing: 6) {
            KunstLinienBild(striche: z.linie.striche, saat: z.bild_id)
                .padding(5)
                .background(PodestMetall.fuer(p).fill, in: RoundedRectangle(cornerRadius: 12))
                .frame(maxWidth: breite)
            Text(String(z.platz) + ".").font(podestRangSchrift(p)).monospacedDigit()
                .foregroundStyle(PodestMetall.fuer(p).rand)
            Text(z.name ?? "—").font(podestNameSchrift(p)).lineLimit(1).truncationMode(.tail)
            KunstHerzen(n: z.herzen, gross: p == 1, lang: lang)
        }
        .padding(.bottom, abstandUnten)
    }
}

/// Gesamtuebersicht aller fertigen Runden (web Gesamt): je Platz eine Gruppe mit den Bildern aller Runden, nach Runde
/// sortiert, jedes mit seiner Runde beschriftet; Tipp -> dieselbe Vollbild-Galerie ueber die ganze Liste.
private struct KunstGesamt: View {
    let runden: [KunstRundeDaten]
    let lang: String
    @State private var offen: KunstOffen?

    /// Alle Ergebnisse mit Runde, sortiert nach Platz, Runde, Herzen (wie im Web).
    private var alle: [KunstErgebnisZeile] {
        var l: [KunstErgebnisZeile] = []
        for r in runden {
            for z in r.ergebnis ?? [] {
                var x: KunstErgebnisZeile = z
                x.runde = r.nr
                l.append(x)
            }
        }
        return l.sorted { (a: KunstErgebnisZeile, b: KunstErgebnisZeile) -> Bool in
            if a.platz != b.platz { return a.platz < b.platz }
            let ra: Int = a.runde ?? 0
            let rb: Int = b.runde ?? 0
            if ra != rb { return ra < rb }
            return a.herzen > b.herzen
        }
    }

    private func plaetze(_ l: [KunstErgebnisZeile]) -> [Int] {
        var gesehen = Set<Int>()
        return l.map { $0.platz }.filter { gesehen.insert($0).inserted }
    }

    var body: some View {
        let l: [KunstErgebnisZeile] = alle
        return VStack(alignment: .leading, spacing: 16) {
            ForEach(plaetze(l), id: \.self) { (p: Int) in gruppe(l, p) }
        }
        .fullScreenCover(item: $offen) { (o: KunstOffen) in
            KunstErgebnisGalerie(liste: alle, start: o.index, lang: lang, onZu: { offen = nil })
        }
    }

    private func titelFarbe(_ p: Int) -> Color { p <= 3 ? PodestMetall.fuer(p).rand : Color.primary }

    private func gruppe(_ l: [KunstErgebnisZeile], _ p: Int) -> some View {
        let spalten: [GridItem] = [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)]
        let idx: [Int] = l.indices.filter { l[$0].platz == p }
        return VStack(alignment: .leading, spacing: 6) {
            Text(teamText("kunst.platzN", lang, ["n": String(p)])).font(.subheadline.weight(.bold))
                .foregroundStyle(titelFarbe(p))
            LazyVGrid(columns: spalten, spacing: 8) {
                ForEach(idx, id: \.self) { (k: Int) in kachel(l[k], k) }
            }
        }
    }

    private func rahmen(_ p: Int) -> Color { p <= 3 ? PodestMetall.fuer(p).fill : Color.clear }

    private func kachel(_ z: KunstErgebnisZeile, _ k: Int) -> some View {
        let p: Int = z.platz
        let rand: Color = p <= 3 ? Color.clear : Color.secondary.opacity(0.35)
        return Button { offen = KunstOffen(index: k) } label: {
            VStack(alignment: .leading, spacing: 4) {
                KunstLinienBild(striche: z.linie.striche, saat: z.bild_id, klein: true)
                beschriftung(z)
            }
            .padding(6)
            .background(rahmen(p), in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(rand, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private func beschriftung(_ z: KunstErgebnisZeile) -> some View {
        HStack(spacing: 4) {
            Text(teamText("kunst.runde", lang, ["n": String(z.runde ?? 0)])).font(.caption.weight(.semibold))
            Text("· " + (z.name ?? "—")).font(.caption).lineLimit(1)
            Spacer(minLength: 0)
            KunstHerzen(n: z.herzen, hell: true, lang: lang)
        }
        .foregroundStyle(Color(white: 0.9))
        .padding(.horizontal, 4)
        .background(Color(red: 2 / 255, green: 6 / 255, blue: 23 / 255).opacity(0.7), in: RoundedRectangle(cornerRadius: 4))
    }
}

private struct KunstSessionZiel: Identifiable {
    let id: Int
}

/// Vollbild-Galerie der Aufloesung (web Galerie): grosses Bild mit Umschalter Bild | Karte, Platz, Name, Herzen, Spot,
/// Weg zur Session; Pfeile/Wischen blaettern.
private struct KunstErgebnisGalerie: View {
    let liste: [KunstErgebnisZeile]
    let lang: String
    let onZu: () -> Void
    @State private var i: Int
    @State private var karte = false
    @State private var session: KunstSessionZiel?

    init(liste: [KunstErgebnisZeile], start: Int, lang: String, onZu: @escaping () -> Void) {
        self.liste = liste
        self.lang = lang
        self.onZu = onZu
        _i = State(initialValue: start)
    }

    private var z: KunstErgebnisZeile? { liste.indices.contains(i) ? liste[i] : nil }

    private func weiter(_ d: Int) {
        guard !liste.isEmpty else { return }
        karte = false
        i = (i + d + liste.count) % liste.count
    }

    var body: some View {
        ZStack {
            Color.black.opacity(0.92).ignoresSafeArea().onTapGesture { onZu() }
            if let x = z { kasten(x).padding(16) }
        }
        // Ausserhalb des dunklen Kastens angehaengt: die Session-Seite erbt so nicht das erzwungene dunkle Schema.
        .sheet(item: $session) { (s: KunstSessionZiel) in
            NavigationStack { SessionDetailView(id: s.id) }
        }
    }

    private func metall(_ p: Int) -> Color { p <= 3 ? PodestMetall.fuer(p).fill : Color.clear }

    private func kasten(_ x: KunstErgebnisZeile) -> some View {
        let p: Int = min(max(x.platz, 1), 4)
        return VStack(alignment: .leading, spacing: 10) {
            bildOderKarte(x)
                .padding(6)
                .background(metall(p), in: RoundedRectangle(cornerRadius: 16))
                .overlay { if liste.count > 1 { KunstPfeile(lang: lang, weiter: { (d: Int) in weiter(d) }) } }
            kopfZeile(x, p)
            fussZeile(x)
        }
        .modifier(KunstVollKasten(lang: lang, onZu: onZu))
    }

    @ViewBuilder private func bildOderKarte(_ x: KunstErgebnisZeile) -> some View {
        if karte {
            KunstKarte(bildId: x.bild_id, lang: lang)
        } else {
            KunstLinienBild(striche: x.linie.striche, saat: x.bild_id)
                .gesture(kunstWischen { (d: Int) in weiter(d) })
        }
    }

    private func kopfZeile(_ x: KunstErgebnisZeile, _ p: Int) -> some View {
        HStack(spacing: 12) {
            Text(String(x.platz) + ".").font(.title2.weight(.heavy)).monospacedDigit()
                .foregroundStyle(p <= 3 ? PodestMetall.fuer(p).fill : Color(white: 0.9))
            Text(x.name ?? "—").font(.headline).foregroundStyle(Color.white).lineLimit(1)
            if let rn = x.runde {
                Text(teamText("kunst.runde", lang, ["n": String(rn)])).font(.subheadline).foregroundStyle(Color(white: 0.6))
                    .lineLimit(1)
            }
            Spacer(minLength: 4)
            KunstHerzen(n: x.herzen, gross: true, hell: true, lang: lang)
        }
    }

    private func fussZeile(_ x: KunstErgebnisZeile) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                if let spot = x.spot { Text(spot).lineLimit(1) }
                if let sid = x.session_id {
                    Button(Loc.t("kunst.zurSession", lang)) { session = KunstSessionZiel(id: sid) }
                        .buttonStyle(.plain)
                        .foregroundStyle(kunstCyan)
                }
            }
            .font(.subheadline)
            .foregroundStyle(Color(white: 0.8))
            if x.karte == true { ansichtWahl }
        }
    }

    private var ansichtWahl: some View {
        Picker("", selection: $karte) {
            Text(Loc.t("kunst.ansichtBild", lang)).tag(false)
            Text(Loc.t("kunst.ansichtKarte", lang)).tag(true)
        }
        .pickerStyle(.segmented)
        .fixedSize()
    }
}

// MARK: Karte der Aufloesung

/// Echter Track auf der Karte (Strasse/Luftbild wie ueberall), Norden oben, auf den Track eingepasst (web KunstKarte).
private struct KunstKarte: View {
    let bildId: Int
    let lang: String
    @AppStorage(MapTiles.schluessel) private var ebene = MapTiles.karte
    @State private var striche: [[CLLocationCoordinate2D]]?
    @State private var fehler: String?

    var body: some View {
        Color.clear
            .aspectRatio(1, contentMode: .fit)
            .overlay { inhalt }
            .background(kunstNacht)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .task(id: bildId) { await laden() }
    }

    @ViewBuilder private var inhalt: some View {
        if let f = fehler {
            Text(f).font(.subheadline).foregroundStyle(Color(white: 0.75)).multilineTextAlignment(.center).padding()
        } else if let s = striche {
            KunstKartenAnsicht(striche: s, mapType: MapTiles.typ(ebene)).mitKartenUmschalter()
        } else {
            ProgressView()
        }
    }

    private func laden() async {
        do {
            let k: KunstKarteDaten = try await Api.kunstKarte(bildId)
            striche = k.striche.map { (st: [[Double]]) -> [CLLocationCoordinate2D] in
                st.compactMap { (p: [Double]) -> CLLocationCoordinate2D? in
                    p.count >= 2 ? CLLocationCoordinate2D(latitude: p[0], longitude: p[1]) : nil
                }
            }
        } catch {
            fehler = kunstFehlerText(error, lang)
        }
    }
}

/// MKMapView mit dem Track: dunkler Rand darunter (Cyan allein verschwindet auf hellblauem Wasser), Cyan darueber.
/// Drehen aus, damit Norden oben bleibt.
private struct KunstKartenAnsicht: UIViewRepresentable {
    let striche: [[CLLocationCoordinate2D]]
    let mapType: MKMapType

    func makeCoordinator() -> Delegat { Delegat() }

    func makeUIView(context: Context) -> MKMapView {
        let map = MKMapView()
        map.delegate = context.coordinator
        map.showsCompass = false
        map.isRotateEnabled = false
        map.isPitchEnabled = false
        map.pointOfInterestFilter = .excludingAll
        map.mapType = mapType
        var rect: MKMapRect = MKMapRect.null
        for st in striche where st.count >= 2 {
            let rand = FarbLinie(coordinates: st, count: st.count)
            rand.farbe = UIColor(red: 11 / 255, green: 26 / 255, blue: 51 / 255, alpha: 0.85)
            rand.breite = 7
            let linie = FarbLinie(coordinates: st, count: st.count)
            linie.farbe = UIColor(red: 34 / 255, green: 211 / 255, blue: 238 / 255, alpha: 1)
            linie.breite = 4
            map.addOverlay(rand, level: .aboveLabels)
            map.addOverlay(linie, level: .aboveLabels)
            rect = rect.union(linie.boundingMapRect)
        }
        // Erst nach dem Layout einpassen — vorher hat die Karte keine Groesse.
        if !rect.isNull {
            DispatchQueue.main.async { [weak map] in
                map?.setVisibleMapRect(rect, edgePadding: UIEdgeInsets(top: 16, left: 16, bottom: 16, right: 16), animated: false)
            }
        }
        return map
    }

    func updateUIView(_ map: MKMapView, context: Context) {
        if map.mapType != mapType { map.mapType = mapType }
    }

    final class Delegat: NSObject, MKMapViewDelegate {
        func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
            guard let l = overlay as? FarbLinie else { return MKOverlayRenderer(overlay: overlay) }
            let r = MKPolylineRenderer(polyline: l)
            r.strokeColor = l.farbe
            r.lineWidth = l.breite
            r.lineCap = .round
            r.lineJoin = .round
            return r
        }
    }
}
