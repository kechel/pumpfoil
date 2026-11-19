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
    /// Beobachtet beim Ton mit Ersatz, ob die Datei laedt (GPS-Kunst, 18.11.2026).
    private var beobachter: NSKeyValueObservation?
    /// Wiederholung am Ende (GPS-Kunst-Enthuellung: Jingle zweimal, web 735a84a1).
    private var endeBeobachter: NSObjectProtocol?

    private func endeLoesen() {
        if let e = endeBeobachter { NotificationCenter.default.removeObserver(e) }
        endeBeobachter = nil
    }

    /// Eigener Ton mit Ersatz (GPS-Kunst, 18.11.2026, web KunstBereich `spiel(TON_KUNST, TON)`): fehlt die Datei auf dem
    /// Server (Status `failed`), spielt `ersatz`. `zweimal`: direkt danach noch einmal (web 19.11.2026: „sonst zu kurz").
    func abspielen(_ pfad: String, ersatz: String?, zweimal: Bool = false) {
        guard let url = Api.mediaURL(pfad) else { return }
        try? AVAudioSession.sharedInstance().setCategory(.ambient, mode: .default, options: [.mixWithOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
        player?.pause()
        beobachter = nil
        endeLoesen()
        let item = AVPlayerItem(url: url)
        let p = AVPlayer(playerItem: item)
        p.volume = 0.6
        player = p
        if let ersatz {
            beobachter = item.observe(\.status, options: [.new]) { [weak self] (it: AVPlayerItem, _: NSKeyValueObservedChange<AVPlayerItem.Status>) in
                guard it.status == .failed else { return }
                DispatchQueue.main.async { self?.abspielen(ersatz, ersatz: nil, zweimal: zweimal) }
            }
        }
        if zweimal {
            endeBeobachter = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item,
                                                                    queue: .main) { [weak self, weak p] (_: Notification) in
                guard let self, let p, self.player === p else { return }
                self.endeLoesen()
                p.seek(to: CMTime.zero)
                p.play()
            }
        }
        p.play()
    }

    func abspielen() {
        beobachter = nil
        endeLoesen()
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
        endeLoesen()
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
    /// nur fuer Admins: Ort sichtbar -> Kartenansicht schon vor der Aufloesung (web 93472df1)
    var karte: Bool? = nil
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
    /// Erstes sichtbares Foto der Session (relativ `/media/...`), fuer die Enthuellung
    var foto: String? = nil
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
    var admin: Bool? = nil
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

    /// Echter Track als fertiges Bild (Satellit, Norden oben, Quellennennung eingebrannt; web 51ff59e0) — PNG-Bytes.
    static func kunstKartenBild(_ bildId: Int) async throws -> Data {
        guard let url = URL(string: baseURL + "/api/kunst/bild/" + String(bildId) + "/karte.png") else { throw ApiError.badURL }
        var req = URLRequest(url: url)
        req.timeoutInterval = 30
        req.setValue(clientId, forHTTPHeaderField: "X-Pumpfoil-Client")
        if let t = token { req.setValue("Bearer " + t, forHTTPHeaderField: "Authorization") }
        let (data, resp) = try await URLSession.shared.data(for: req)
        let code: Int = (resp as? HTTPURLResponse)?.statusCode ?? -1
        guard (200..<300).contains(code) else { throw ApiError.http(code, String(data: data, encoding: .utf8) ?? "") }
        return data
    }
}

/// Kartenbilder je App-Sitzung im Speicher (web `kartenSpeicher`): die Enthuellung laedt die drei Plaetze beim Oeffnen
/// vor, Galerie und Blaettern nutzen denselben Speicher. Fehler werden nicht gemerkt (naechstes Mal neu versuchen).
@MainActor
final class KunstKartenSpeicher {
    static let shared = KunstKartenSpeicher()
    private var bilder: [Int: UIImage] = [:]
    private var laufend: [Int: Task<UIImage, Error>] = [:]

    func fertig(_ id: Int) -> UIImage? { bilder[id] }

    func laden(_ id: Int) async throws -> UIImage {
        if let b = bilder[id] { return b }
        let t: Task<UIImage, Error>
        if let l = laufend[id] {
            t = l
        } else {
            t = Task<UIImage, Error> { () async throws -> UIImage in
                let daten: Data = try await Api.kunstKartenBild(id)
                guard let b = UIImage(data: daten) else { throw ApiError.http(-1, "") }
                return b
            }
            laufend[id] = t
        }
        do {
            let b: UIImage = try await t.value
            bilder[id] = b
            laufend[id] = nil
            return b
        } catch {
            laufend[id] = nil
            throw error
        }
    }

    func vorladen(_ id: Int) {
        Task { _ = try? await self.laden(id) }
    }
}

/// Session-Foto vorladen (landet in `BildCache`, das spaetere `NetzBild` ist dann sofort da).
@MainActor
func kunstFotoVorladen(_ pfad: String?) {
    guard let url = Api.mediaURL(pfad), BildCache.shared.bild(url) == nil else { return }
    Task {
        guard let r = try? await URLSession.shared.data(from: url),
              let http = r.1 as? HTTPURLResponse, (200..<300).contains(http.statusCode),
              let b = UIImage(data: r.0) else { return }
        BildCache.shared.merken(url, b)
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

/// `anteile`: je Strich, wie viel davon schon gefahren ist (0…1; nil = alles). Striche mit 0 bleiben unsichtbar
/// (web dc67a1ce: kein vorzeitiger Startpunkt eines spaeteren Laufs).
private func kunstZeichnen(_ ctx: inout GraphicsContext, _ size: CGSize, _ flocken: [KunstFlocke], _ striche: [[CGPoint]],
                           _ dick: CGFloat, _ anteile: [CGFloat]? = nil) {
    let s: CGFloat = size.width / CGFloat(KUNST_BOX)
    for f in flocken {
        let r = CGRect(x: (f.x - f.r) * s, y: (f.y - f.r) * s, width: 2 * f.r * s, height: 2 * f.r * s)
        ctx.fill(Path(ellipseIn: r), with: .color(Color.white.opacity(f.o)))
    }
    var pfade: [Path] = []
    for (i, st) in striche.enumerated() {
        let a: CGFloat = anteile.map { (l: [CGFloat]) -> CGFloat in i < l.count ? l[i] : 1 } ?? 1
        if a <= 0 { continue }
        let p: Path = kunstPfad(st, s)
        pfade.append(a >= 1 ? p : p.trimmedPath(from: 0, to: a))
    }
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

/// Laenge je Strich in Box-Einheiten (0 -> 1, damit jeder Strich einen Zeitanteil bekommt).
private func kunstLaengen(_ striche: [[CGPoint]]) -> [Double] {
    striche.map { (st: [CGPoint]) -> Double in
        var l: Double = 0
        for i in st.indices.dropFirst() {
            l += hypot(Double(st[i].x - st[i - 1].x), Double(st[i].y - st[i - 1].y))
        }
        return l > 0 ? l : 1
    }
}

/// Fortschritt `f` (0…1 der Gesamtzeit) -> Anteil je Strich: Strich k startet, wenn k-1 fertig ist, Zeit nach Laenge.
private func kunstAnteile(_ laengen: [Double], _ f: Double) -> [CGFloat] {
    let summe: Double = laengen.reduce(0, +)
    guard summe > 0 else { return laengen.map { (_: Double) -> CGFloat in 1 } }
    var v: Double = 0
    var aus: [CGFloat] = []
    for l in laengen {
        let d: Double = l / summe
        let a: Double = d > 0 ? (f - v) / d : 1
        aus.append(CGFloat(min(1, max(0, a))))
        v += d
    }
    return aus
}

/// Dauer, in der die Linie in Enthuellung und „Abspielen" gefahren wird (web ZIEHEN, 5 s).
private let KUNST_ZIEHEN: Double = 5

/// Bild, dessen Linie ueber `dauer` s „gefahren" wird (web `KunstLinie zeichnen=…`). Neustart ueber `.id(...)`.
private struct KunstLinieGefahren: View {
    let striche: [[CGPoint]]
    var saat: Int = 0
    var dauer: Double = KUNST_ZIEHEN
    @State private var start = Date()
    @State private var fertig = false

    var body: some View {
        TimelineView(.animation(minimumInterval: nil, paused: fertig)) { ctx in
            leinwand(ctx.date)
        }
        .aspectRatio(1, contentMode: .fit)
        .background(kunstNacht)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .accessibilityHidden(true)
        .task {
            start = Date()
            fertig = false
            try? await Task.sleep(nanoseconds: UInt64((dauer + 0.1) * 1_000_000_000))
            if !Task.isCancelled { fertig = true }
        }
    }

    private func leinwand(_ jetzt: Date) -> some View {
        let flocken: [KunstFlocke] = kunstSchnee(saat)
        let linien: [[CGPoint]] = striche
        let f: Double = fertig ? 1 : min(1, max(0, jetzt.timeIntervalSince(start) / max(dauer, 0.1)))
        let anteile: [CGFloat] = kunstAnteile(kunstLaengen(striche), f)
        return Canvas { (c: inout GraphicsContext, size: CGSize) in
            kunstZeichnen(&c, size, flocken, linien, 22, anteile)
        }
    }
}

/// Kurz aufleuchtendes grosses Herz in der Bildmitte nach einem Doppeltipp (web HerzPuls): gefuellt beim Vergeben,
/// Umriss beim Wegnehmen. Neustart ueber `.id(...)`.
private struct KunstHerzPuls: View {
    let voll: Bool
    @State private var groesse: CGFloat = 0.4
    @State private var sicht: Double = 0

    var body: some View {
        GeometryReader { (g: GeometryProxy) in
            herz(g.size)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .task {
            withAnimation(.easeOut(duration: 0.18)) {
                groesse = 1.1
                sicht = 0.95
            }
            try? await Task.sleep(nanoseconds: 300_000_000)
            withAnimation(.easeIn(duration: 0.4)) {
                groesse = 1.15
                sicht = 0
            }
        }
    }

    private func herz(_ size: CGSize) -> some View {
        let seite: CGFloat = min(size.width, size.height) / 3
        return Image(systemName: voll ? "heart.fill" : "heart")
            .resizable()
            .scaledToFit()
            .foregroundStyle(kunstCyan)
            .shadow(color: Color.black.opacity(0.5), radius: 6)
            .frame(width: seite, height: seite)
            .scaleEffect(groesse)
            .opacity(sicht)
            .position(x: size.width / 2, y: size.height / 2)
    }
}

/// Umschalter Bild | Karte mit festen dunklen Farben (web: Kasten immer dunkel, gewaehlt in Cyan).
private struct KunstAnsichtWahl: View {
    let karte: Bool
    let lang: String
    let setzen: (Bool) -> Void

    var body: some View {
        HStack(spacing: 2) {
            teil(false, "kunst.ansichtBild")
            teil(true, "kunst.ansichtKarte")
        }
        .padding(2)
        .background(Color(red: 30 / 255, green: 41 / 255, blue: 59 / 255), in: RoundedRectangle(cornerRadius: 8))
    }

    private func teil(_ k: Bool, _ key: String) -> some View {
        let an: Bool = karte == k
        return Button { setzen(k) } label: {
            Text(Loc.t(key, lang))
                .font(an ? Font.caption.weight(.semibold) : Font.caption)
                .foregroundStyle(an ? kunstTief : Color(red: 203 / 255, green: 213 / 255, blue: 225 / 255))
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(an ? kunstCyan : Color.clear, in: RoundedRectangle(cornerRadius: 6))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(an ? AccessibilityTraits.isSelected : AccessibilityTraits())
    }
}

/// Merk-Schluessel der Galerie-Ansicht (web ANSICHT): "karte" oder leer (= Bild).
private let KUNST_ANSICHT = "kunst-ansicht"

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
    /// Herz-Puls nach Doppeltipp auf eine Kachel: welches Bild, Zaehler (Neustart), gefuellt oder Umriss.
    @State private var pulsBild: Int?
    @State private var pulsNr = 0
    @State private var pulsVoll = true

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
            KunstAufloesung(eventId: eventId, nr: r.nr, liste: r.ergebnis ?? [], lang: lang)
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
            kachelBild(dd, r, b, ids)
            kachelFuss(dd, r, b)
            if let grund = b.entfernt { Text(grund).font(.caption).foregroundStyle(.secondary) }
        }
        .padding(8)
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(rand, lineWidth: 1.5))
        .opacity(b.entfernt != nil ? 0.5 : 1)
    }

    /// Tipp oeffnet das Vollbild, Doppeltipp vergibt bzw. nimmt ein Herz (web bccb5b86) — Doppeltipp zuerst angehaengt,
    /// damit der einfache Tipp auf ihn wartet (plattformueblich).
    private func kachelBild(_ dd: KunstEventDaten, _ r: KunstRundeDaten, _ b: KunstBildDaten, _ ids: [Int]) -> some View {
        KunstLinienBild(striche: b.linie.striche, saat: b.id)
            .overlay { kachelPuls(b.id) }
            .contentShape(Rectangle())
            .onTapGesture(count: 2) { doppelHerz(dd, r, b) }
            .onTapGesture { oeffnen(ids, b.id) }
            .accessibilityElement(children: .ignore)
            .accessibilityAddTraits(AccessibilityTraits.isButton)
            .accessibilityLabel(Loc.t("kunst.gross", lang))
            .accessibilityAction { oeffnen(ids, b.id) }
    }

    @ViewBuilder private func kachelPuls(_ id: Int) -> some View {
        if pulsBild == id { KunstHerzPuls(voll: pulsVoll).id(pulsNr) }
    }

    private func doppelHerz(_ dd: KunstEventDaten, _ r: KunstRundeDaten, _ b: KunstBildDaten) {
        guard kannHerz(dd, r, b), !herzenVoll(dd, r, b), !busy else { return }
        pulsVoll = b.herz != true
        pulsBild = b.id
        pulsNr += 1
        herz(b.id)
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
                                teilnehmen: dd.darfTeilnehmen, admin: dd.admin == true, busy: busy, fehler: fehler, lang: lang,
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
    /// Admins duerfen schon vor der Aufloesung auf die Karte schalten (web 93472df1).
    let admin: Bool
    let busy: Bool
    let fehler: String?
    let lang: String
    let onHerz: (Int) -> Void
    let onZu: () -> Void
    @State private var i: Int
    @AppStorage(KUNST_ANSICHT) private var ansicht = ""
    @State private var pulsNr = 0
    @State private var pulsVoll = true

    init(ids: [Int], start: Int, runde: KunstRundeDaten, herzenJeRunde: Int, teilnehmen: Bool, admin: Bool, busy: Bool,
         fehler: String?, lang: String, onHerz: @escaping (Int) -> Void, onZu: @escaping () -> Void) {
        self.ids = ids
        self.runde = runde
        self.herzenJeRunde = herzenJeRunde
        self.teilnehmen = teilnehmen
        self.admin = admin
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

    private func karteErlaubt(_ b: KunstBildDaten) -> Bool { admin && b.karte == true }
    private func zeigeKarte(_ b: KunstBildDaten) -> Bool { karteErlaubt(b) && ansicht == "karte" }

    @ViewBuilder private func bildInhalt(_ b: KunstBildDaten) -> some View {
        if zeigeKarte(b) {
            KunstKarte(bildId: b.id, lang: lang)
        } else {
            KunstLinienBild(striche: b.linie.striche, saat: b.id)
        }
    }

    /// Doppeltipp aufs Bild = Herz vergeben/wegnehmen (web bccb5b86), mit Herz-Puls.
    private func doppel(_ b: KunstBildDaten) {
        guard kannHerz(b), !(runde.vergeben >= herzenJeRunde && b.herz != true), !busy else { return }
        pulsVoll = b.herz != true
        pulsNr += 1
        onHerz(b.id)
    }

    private func bildRahmen(_ b: KunstBildDaten) -> some View {
        bildInhalt(b)
            .overlay { if pulsNr > 0 { KunstHerzPuls(voll: pulsVoll).id(pulsNr) } }
            .contentShape(Rectangle())
            .onTapGesture(count: 2) { doppel(b) }
            .padding(6)
            .background(b.herz == true ? kunstCyan : Color.clear, in: RoundedRectangle(cornerRadius: 16))
            .overlay { if ids.count > 1 { KunstPfeile(lang: lang, weiter: { (d: Int) in weiter(d) }) } }
            .gesture(kunstWischen { (d: Int) in weiter(d) })
    }

    private func leiste(_ b: KunstBildDaten) -> some View {
        HStack(spacing: 12) {
            Text(String(i + 1) + " / " + String(ids.count)).font(.subheadline).monospacedDigit()
            if karteErlaubt(b) {
                KunstAnsichtWahl(karte: zeigeKarte(b), lang: lang, setzen: { (k: Bool) in ansicht = k ? "karte" : "" })
            }
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

/// Aufloesung (web Aufloesung): Platz 1–3 als Treppchen 2-1-3 in Gold/Silber/Bronze, darunter alle weiteren (statisch);
/// Tipp -> Vollbild. Die Enthuellung im Vollbild (mit Jingle, Stumm-Einstellung geteilt mit dem Event-Treppchen) startet
/// beim ersten Ansehen der Runde von selbst (gemerkt je Event und Runde), sonst per Knopf ueber Platz 1.
private struct KunstAufloesung: View {
    let eventId: Int
    let nr: Int
    let liste: [KunstErgebnisZeile]
    let lang: String
    @AppStorage("podest-stumm") private var stumm = false
    @Environment(\.accessibilityReduceMotion) private var bewegungAus
    @State private var offen: KunstOffen?
    @State private var zeigen = false

    private var gesehenKey: String { "kunst-gesehen-" + String(eventId) + "-" + String(nr) }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if liste.isEmpty {
                Text(Loc.t("kunst.leer", lang)).font(.subheadline).foregroundStyle(.secondary)
            } else {
                knopfZeile
                treppe
                rest
            }
        }
        .task(id: nr) { automatisch() }
        // Waehrend die Enthuellung offen ist, meldet die Seite unter dem Vollbild ein onDisappear — den Jingle dann laufen lassen.
        .onDisappear { if !zeigen { PodestTon.shared.anhalten() } }
        .fullScreenCover(item: $offen) { (o: KunstOffen) in
            KunstErgebnisGalerie(liste: liste, start: o.index, lang: lang, onZu: { offen = nil })
        }
    }

    /// Beim ersten Ansehen einer fertigen Runde von selbst — nicht bei „Bewegung reduzieren".
    private func automatisch() {
        guard !liste.isEmpty, !bewegungAus, !UserDefaults.standard.bool(forKey: gesehenKey) else { return }
        enthuellen()
    }

    private func enthuellen() {
        UserDefaults.standard.set(true, forKey: gesehenKey)
        zeigen = true
        if !stumm { PodestTon.shared.abspielen(KUNST_TON, ersatz: PODEST_TON, zweimal: true) }
    }

    /// Knopf zentriert ueber Platz 1 und primaer, „Stumm" rechts daneben (web 178ffc3d).
    private var knopfZeile: some View {
        HStack(spacing: 8) {
            Color.clear.frame(maxWidth: .infinity, maxHeight: 1)
            nochmalKnopf.layoutPriority(1)
            stummSchalter.frame(maxWidth: .infinity, alignment: .trailing)
        }
        .fullScreenCover(isPresented: $zeigen) {
            KunstEnthuellung(liste: liste, rundeNr: nr, lang: lang, onZu: { zeigen = false })
        }
    }

    private var nochmalKnopf: some View {
        Button { enthuellen() } label: {
            HStack(spacing: 6) {
                Image(systemName: "play.fill").font(.system(size: 13))
                Text(Loc.t("kunst.enth.nochmal", lang)).font(.subheadline.weight(.semibold)).lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .foregroundStyle(kunstTief)
            .padding(.horizontal, 14)
            .frame(height: 36)
            .background(kunstCyan, in: RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
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

    /// Treppchen nach Platz gruppiert (web 19.11.2026): Gleichstand -> mehrere Bilder je Stufe, leere Stufen fallen weg
    /// (z. B. 1., 1., 3. -> Gold mit zwei Bildern, Bronze). Stufen 2 - 1 - 3.
    private var stufen: [(p: Int, idx: [Int])] {
        [2, 1, 3].map { p in (p: p, idx: liste.indices.filter { liste[$0].platz == p }) }.filter { !$0.idx.isEmpty }
    }
    private var n3: Int { liste.filter { $0.platz <= 3 }.count }

    private var treppe: some View {
        HStack(alignment: .bottom, spacing: 10) {
            ForEach(stufen, id: \.p) { st in stufe(st.idx) }
        }
        .padding(.top, 4)
    }

    private func stufe(_ idx: [Int]) -> some View {
        HStack(alignment: .bottom, spacing: 6) {
            ForEach(idx, id: \.self) { (i: Int) in
                KunstPodestPlatz(z: liste[i], lang: lang, mehrere: idx.count > 1, aktion: { offen = KunstOffen(index: i) })
                    .frame(maxWidth: .infinity)
            }
        }
        .frame(maxWidth: .infinity)
        .layoutPriority(Double(min(idx.count, 2)))
    }

    @ViewBuilder private var rest: some View {
        if liste.count > n3 {
            let spalten: [GridItem] = Array(repeating: GridItem(.flexible(), spacing: 8), count: 3)
            let weitere: [Int] = Array(liste.indices.dropFirst(n3))
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

// MARK: Enthuellung

private enum KunstEnthPhase {
    case ziehen, blinken, stehen, karte, foto, ende
}

private let KUNST_BLINK: Double = 0.4    // s je Blinken (zweimal)
private let KUNST_STEHEN: Double = 2     // s steht das fertige Bild mit Name
private let KUNST_EXTRA: Double = 2      // s danach das Kartenbild (wenn der Ort gezeigt wird)
private let KUNST_FOTO: Double = 4       // s danach das Session-Foto (web 6ceaf56c)

/// Vollbild-Enthuellung (web Enthuellung): alle Eintraege mit Platz <= 3 in umgekehrter Listenreihenfolge (bei
/// Gleichstand mehrere je Platz) — je Bild wird die Linie in 5 s gefahren, der Rahmen blinkt zweimal, dann Name und
/// Herzen, 2 s stehen, dann Ueberblendung aufs Kartenbild (2 s, nur wenn erlaubt) und aufs Session-Foto (4 s, falls da).
/// In der letzten dieser Ansichten laeuft der Countdown zum naechsten Platz. Am Ende „Alle Plaetze ansehen".
private struct KunstEnthuellung: View {
    let liste: [KunstErgebnisZeile]
    let rundeNr: Int
    let lang: String
    let onZu: () -> Void
    @State private var k = 0
    @State private var phase: KunstEnthPhase = .ziehen
    @State private var rest = 0
    @State private var blinkAus = false
    /// Zaehlt je Platz bzw. Sprung hoch: startet den Ablauf neu.
    @State private var lauf = 0

    /// Indizes in `liste` mit Platz <= 3, letzter zuerst (web `reihe`).
    private var reihe: [Int] { Array(liste.indices.filter { liste[$0].platz <= 3 }.reversed()) }
    private var letzter: Bool { k + 1 >= reihe.count }
    private var akt: KunstErgebnisZeile? { reihe.indices.contains(k) ? liste[reihe[k]] : nil }

    var body: some View {
        ZStack {
            Color.black.opacity(0.92).ignoresSafeArea()
            if let z = akt { kasten(z).padding(16) }
        }
        .onAppear { vorladen() }
        .task(id: lauf) { await ablauf() }
    }

    /// Kartenbilder und Fotos aller Treppchen-Bilder sofort vorladen (web 6cbaa761).
    @MainActor private func vorladen() {
        for z in liste where z.platz <= 3 {
            if z.karte == true { KunstKartenSpeicher.shared.vorladen(z.bild_id) }
            if z.foto != nil { kunstFotoVorladen(z.foto) }
        }
    }

    /// Nach dem Namen: Karte (wenn erlaubt), dann Foto (wenn da), jeweils mit Dauer.
    private func extras(_ z: KunstErgebnisZeile) -> [(phase: KunstEnthPhase, dauer: Double)] {
        var l: [(phase: KunstEnthPhase, dauer: Double)] = []
        if z.karte == true { l.append((phase: .karte, dauer: KUNST_EXTRA)) }
        if z.foto != nil { l.append((phase: .foto, dauer: KUNST_FOTO)) }
        return l
    }

    private func warte(_ s: Double) async -> Bool {
        try? await Task.sleep(nanoseconds: UInt64(s * 1_000_000_000))
        return !Task.isCancelled
    }

    @MainActor private func ablauf() async {
        guard phase != .ende, let z = akt else { return }
        phase = .ziehen
        rest = 0
        blinkAus = false
        guard await warte(KUNST_ZIEHEN) else { return }
        phase = .blinken
        for _ in 0..<2 {
            withAnimation(.easeInOut(duration: KUNST_BLINK / 2)) { blinkAus = true }
            guard await warte(KUNST_BLINK / 2) else { return }
            withAnimation(.easeInOut(duration: KUNST_BLINK / 2)) { blinkAus = false }
            guard await warte(KUNST_BLINK / 2) else { return }
        }
        let schritte: [(phase: KunstEnthPhase, dauer: Double)] = [(phase: .stehen, dauer: KUNST_STEHEN)] + extras(z)
        for (n, sch) in schritte.enumerated() {
            phase = sch.phase
            if n < schritte.count - 1 {
                guard await warte(sch.dauer) else { return }
                continue
            }
            // Letzte Ansicht: Countdown zum naechsten Platz.
            var r: Int = Int(sch.dauer.rounded())
            while r > 0 {
                rest = r
                guard await warte(1) else { return }
                r -= 1
            }
            rest = 0
        }
        naechster()
    }

    /// Naechster Platz, beim letzten ans Ende (schliesst nicht; web ef3665ad).
    private func naechster() {
        rest = 0
        blinkAus = false
        if letzter {
            phase = .ende
        } else {
            k += 1
            phase = .ziehen
        }
        lauf += 1
    }

    private func kasten(_ z: KunstErgebnisZeile) -> some View {
        let p: Int = min(max(z.platz, 1), 3)
        return VStack(alignment: .leading, spacing: 12) {
            kopf(z, p)
            bild(z, p)
            nameZeile(z)
            fuss
        }
        .modifier(KunstVollKasten(lang: lang, onZu: onZu))
    }

    private func kopf(_ z: KunstErgebnisZeile, _ p: Int) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(teamText("kunst.enth.titel", lang, ["n": String(rundeNr)]).uppercased())
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color(red: 148 / 255, green: 163 / 255, blue: 184 / 255))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Spacer(minLength: 4)
            Text(teamText("kunst.platzN", lang, ["n": String(z.platz)]))
                .font(.system(size: 30, weight: .heavy)).monospacedDigit()
                .foregroundStyle(PodestMetall.fuer(p).fill)
        }
    }

    private var mitExtras: Bool { phase == .stehen || phase == .karte || phase == .foto }

    private func bild(_ z: KunstErgebnisZeile, _ p: Int) -> some View {
        KunstLinieGefahren(striche: z.linie.striche, saat: z.bild_id)
            .id(k)
            .overlay { karteSchicht(z) }
            .overlay { fotoSchicht(z) }
            .padding(6)
            .background(PodestMetall.fuer(p).fill, in: RoundedRectangle(cornerRadius: 16))
            .opacity(blinkAus ? 0.12 : 1)
    }

    /// Karte und Foto schon in „stehen" unsichtbar aufbauen, damit sie beim Ueberblenden da sind.
    @ViewBuilder private func karteSchicht(_ z: KunstErgebnisZeile) -> some View {
        if z.karte == true && mitExtras {
            KunstKarte(bildId: z.bild_id, lang: lang)
                .opacity(phase == .karte ? 1 : 0)
                .animation(.easeInOut(duration: 0.7), value: phase)
        }
    }

    @ViewBuilder private func fotoSchicht(_ z: KunstErgebnisZeile) -> some View {
        if z.foto != nil && mitExtras {
            KunstFoto(pfad: z.foto)
                .opacity(phase == .foto ? 1 : 0)
                .animation(.easeInOut(duration: 0.7), value: phase)
        }
    }

    private var nameDa: Bool { mitExtras || phase == .ende }

    private func nameZeile(_ z: KunstErgebnisZeile) -> some View {
        HStack(spacing: 12) {
            Text(z.name ?? "—").font(.title3.weight(.heavy)).foregroundStyle(Color.white).lineLimit(1)
            Spacer(minLength: 4)
            KunstHerzen(n: z.herzen, gross: true, hell: true, lang: lang)
        }
        .frame(minHeight: 36)
        .opacity(nameDa ? 1 : 0)
        .animation(.easeInOut(duration: 0.5), value: nameDa)
    }

    private var fuss: some View {
        HStack(spacing: 8) {
            if rest > 0 && !letzter && phase != .ende {
                Text(teamText("kunst.enth.naechster", lang, ["n": String(rest)]))
                    .font(.subheadline).monospacedDigit()
                    .foregroundStyle(Color(red: 148 / 255, green: 163 / 255, blue: 184 / 255))
            }
            Spacer(minLength: 4)
            if phase == .ende { alleKnopf } else { skipKnopf }
        }
    }

    private var alleKnopf: some View {
        Button(action: onZu) {
            Text(Loc.t("kunst.enth.alle", lang)).font(.subheadline.weight(.semibold))
                .foregroundStyle(kunstTief)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(kunstCyan, in: RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
    }

    private var skipKnopf: some View {
        Button { naechster() } label: {
            Text(Loc.t("kunst.enth.skip", lang)).font(.subheadline)
                .foregroundStyle(Color(red: 203 / 255, green: 213 / 255, blue: 225 / 255))
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
        }
        .buttonStyle(.plain)
    }
}

/// Session-Foto quadratisch zugeschnitten (Enthuellung).
private struct KunstFoto: View {
    let pfad: String?

    var body: some View {
        Color.clear
            .aspectRatio(1, contentMode: .fit)
            .overlay {
                NetzBild(url: Api.mediaURL(pfad)) { (stand: BildStand) in fotoInhalt(stand) }
            }
            .background(kunstNacht)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .accessibilityHidden(true)
    }

    @ViewBuilder private func fotoInhalt(_ stand: BildStand) -> some View {
        switch stand {
        case .da(let img):
            img.resizable().scaledToFill()
        default:
            Color.clear
        }
    }
}

/// Ein Platz auf dem Treppchen: Bild im Metallrahmen, Platz, Name, Herzen (Gold am hoechsten).
private struct KunstPodestPlatz: View {
    let z: KunstErgebnisZeile
    let lang: String
    var mehrere: Bool = false     // Gleichstand: mehrere Bilder auf dieser Stufe -> kleinere Schrift
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
            KunstLinienBild(striche: z.linie.striche, saat: z.bild_id, klein: mehrere)
                .padding(5)
                .background(PodestMetall.fuer(p).fill, in: RoundedRectangle(cornerRadius: 12))
                .frame(maxWidth: breite)
            Text(String(z.platz) + ".").font(podestRangSchrift(p)).monospacedDigit()
                .foregroundStyle(PodestMetall.fuer(p).rand)
            Text(z.name ?? "—").font(podestNameSchrift(mehrere ? 3 : p)).lineLimit(1).truncationMode(.tail)
            KunstHerzen(n: z.herzen, gross: p == 1 && !mehrere, lang: lang)
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

/// Vollbild-Galerie der Aufloesung (web Galerie): grosses Bild mit Umschalter Bild | Karte (gemerkt, gilt beim Blaettern;
/// Bilder ohne freigegebenen Ort zeigen das Bild, ohne die Wahl zu aendern), Platz, Name, Herzen, Spot, „Abspielen"
/// (Linie nochmal fahren) und Knopf zur Session; Pfeile/Wischen blaettern.
private struct KunstErgebnisGalerie: View {
    let liste: [KunstErgebnisZeile]
    let lang: String
    let onZu: () -> Void
    @State private var i: Int
    @AppStorage(KUNST_ANSICHT) private var ansicht = ""
    /// „Abspielen" (web 51ff59e0): > 0 zeigt bis zum Blaettern das gefahrene Bild, Zaehler startet neu.
    @State private var spiel = 0
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
        spiel = 0
        i = (i + d + liste.count) % liste.count
    }

    private func zeigeKarte(_ x: KunstErgebnisZeile) -> Bool { ansicht == "karte" && x.karte == true && spiel == 0 }

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
                .gesture(kunstWischen { (d: Int) in weiter(d) })
            kopfZeile(x, p)
            fussZeile(x)
        }
        .modifier(KunstVollKasten(lang: lang, onZu: onZu))
    }

    @ViewBuilder private func bildOderKarte(_ x: KunstErgebnisZeile) -> some View {
        if zeigeKarte(x) {
            KunstKarte(bildId: x.bild_id, lang: lang)
        } else if spiel > 0 {
            KunstLinieGefahren(striche: x.linie.striche, saat: x.bild_id)
                .id(String(i) + "-" + String(spiel))
        } else {
            KunstLinienBild(striche: x.linie.striche, saat: x.bild_id)
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
            if let spot = x.spot {
                Text(spot).font(.subheadline).foregroundStyle(Color(white: 0.8)).lineLimit(1)
            }
            HStack(spacing: 10) {
                abspielenKnopf
                if let sid = x.session_id { sessionKnopf(sid) }
                Spacer(minLength: 0)
                if x.karte == true {
                    KunstAnsichtWahl(karte: zeigeKarte(x), lang: lang, setzen: { (k: Bool) in
                        ansicht = k ? "karte" : ""
                        spiel = 0
                    })
                }
            }
        }
    }

    private var abspielenKnopf: some View {
        Button { spiel += 1 } label: {
            HStack(spacing: 4) {
                Image(systemName: "play.fill").font(.system(size: 11))
                Text(Loc.t("kunst.abspielen", lang)).font(.caption.weight(.semibold))
            }
            .foregroundStyle(Color(red: 241 / 255, green: 245 / 255, blue: 249 / 255))
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Color(red: 30 / 255, green: 41 / 255, blue: 59 / 255), in: RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
    }

    /// „zur Session" als gefuellter Cyan-Knopf mit Chevron (web 2bef12af).
    private func sessionKnopf(_ sid: Int) -> some View {
        Button { session = KunstSessionZiel(id: sid) } label: {
            HStack(spacing: 4) {
                Text(Loc.t("kunst.zurSession", lang)).font(.caption.weight(.semibold))
                Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold))
            }
            .foregroundStyle(kunstTief)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(kunstCyan, in: RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
    }
}

// MARK: Kartenbild

/// Echter Track als Satellitenbild vom Server (web KunstKarte, 19.11.2026: keine interaktive Karte im Event — zoomen
/// geht in den Session-Details). Norden oben, Quellennennung eingebrannt; Speicher je App-Sitzung.
private struct KunstKarte: View {
    let bildId: Int
    let lang: String
    @State private var bild: UIImage?
    @State private var fehler: String?

    var body: some View {
        Color.clear
            .aspectRatio(1, contentMode: .fit)
            .overlay { inhalt }
            .background(kunstNacht)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .accessibilityHidden(true)
            .task(id: bildId) { await laden() }
    }

    @ViewBuilder private var inhalt: some View {
        if let b = bild {
            Image(uiImage: b).resizable().scaledToFill()
        } else if let f = fehler {
            Text(f).font(.subheadline).foregroundStyle(Color(white: 0.75)).multilineTextAlignment(.center).padding()
        } else {
            ProgressView().tint(Color.white)
        }
    }

    @MainActor private func laden() async {
        fehler = nil
        bild = KunstKartenSpeicher.shared.fertig(bildId)
        if bild != nil { return }
        do {
            let b: UIImage = try await KunstKartenSpeicher.shared.laden(bildId)
            bild = b
        } catch {
            fehler = kunstFehlerText(error, lang)
        }
    }
}
