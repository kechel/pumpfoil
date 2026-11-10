import SwiftUI
import UIKit

// Event-Uebersicht als Teilen-Bild (Port von web c0d044a2, TeamEventSeite.tsx EventUebersichtBild + bestenlisteBild.ts
// `gruppen`/`summen`/uebersichtHoehe, 07.11.2026): die Gesamtsummen des Events als Kacheln, darunter je Kategorie die
// ersten 3 Plaetze. Kategorien = die Bestenlisten der Fahrer, bei globalen Events auch ihre Team-Wertungen; welche ins
// Bild kommen, waehlt man im Dialog (Standard: die ersten 4 Fahrer-Bestenlisten, Team-Wertungen abgewaehlt). Kopf, Fuss,
// Plattform-Zeile und Zeilen wie die uebrigen Teilen-Bilder (TeamBestenlisten.swift); 1080 breit, Hoehe waechst mit.

struct TeamUebersichtKategorie: Identifiable {
    let key: String          // p<i> = Fahrer-Bestenliste, t<i> = Team-Wertung (wie im Web)
    let titel: String
    let zeilen: [TeamBildZeile]
    let team: Bool
    var id: String { key }
}

struct TeamUebersichtDaten {
    let titel: String
    let unterzeile: String
    /// Kleinere Zeilen darunter (Zeitraum, Stand), wie web `unterzeile2`.
    let unterzeile2: [String]
    let summen: [TeamZahlKachel]
    let kategorien: [TeamUebersichtKategorie]
    let logos: [String: UIImage]
    let flaggen: [String: UIImage]
    var abzeichen: String? = nil
}

/// Hoehe wie web uebersichtHoehe: Kopf, Summen, je Kategorie Titel + 3 Zeilen, Fuss — zwischen quadratisch und 9:16.
func teamUebersichtHoehe(_ summen: Int, _ gruppen: Int) -> CGFloat {
    let roh: Int = 360 + (summen > 0 ? 190 : 0) + gruppen * 262 + 200
    return CGFloat(max(1080, min(1920, roh)))
}

/// Vorschau, Kategorien, Hell/Dunkel, Teilen (web BestenlisteBildDialog mit der Kategorie-Auswahl als `children`).
struct TeamUebersichtDialog: View {
    let daten: TeamUebersichtDaten
    let lang: String
    let schliessen: () -> Void
    let teilen: (UIImage) -> Void
    @AppStorage("foil_bild_hell") private var hell = false
    @State private var wahl: Set<String>
    @State private var bild: UIImage?

    init(daten: TeamUebersichtDaten, lang: String, schliessen: @escaping () -> Void, teilen: @escaping (UIImage) -> Void) {
        self.daten = daten
        self.lang = lang
        self.schliessen = schliessen
        self.teilen = teilen
        let start: [String] = daten.kategorien.filter { !$0.team }.prefix(4).map { $0.key }
        _wahl = State(initialValue: Set(start))
    }

    @MainActor static func zeigen(_ daten: TeamUebersichtDaten, lang: String) {
        TeamBildDialog.praesentieren { schliessen, teilen in
            AnyView(TeamUebersichtDialog(daten: daten, lang: lang, schliessen: schliessen, teilen: teilen))
        }
    }

    private var schluessel: String { String(hell) + "|" + wahl.sorted().joined(separator: ",") }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    vorschau
                    auswahl
                    Picker("", selection: $hell) {
                        Text(Loc.t("theme.dark", lang)).tag(false)
                        Text(Loc.t("theme.light", lang)).tag(true)
                    }
                    .pickerStyle(.segmented)
                    teilenKnopf
                }
                .padding()
            }
            .navigationTitle(Loc.t("team.event.uebersichtTeilen", lang))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(Loc.t("common.cancel", lang)) { schliessen() } }
            }
        }
        .task(id: schluessel) { await zeichnen() }
    }

    @ViewBuilder private var vorschau: some View {
        if let b = bild {
            Image(uiImage: b).resizable().scaledToFit()
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.secondary.opacity(0.4), lineWidth: 1))
        } else {
            ProgressView().frame(maxWidth: .infinity, minHeight: 300)
        }
    }

    @ViewBuilder private var auswahl: some View {
        if !daten.kategorien.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                Text(Loc.t("team.event.uebersichtWahl", lang)).font(.caption).foregroundStyle(.secondary)
                ForEach(daten.kategorien) { k in kategorieZeile(k) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func kategorieZeile(_ k: TeamUebersichtKategorie) -> some View {
        let an: Bool = wahl.contains(k.key)
        return Button { umschalten(k.key) } label: {
            HStack(spacing: 8) {
                Image(systemName: an ? "checkmark.square.fill" : "square")
                    .foregroundStyle(an ? Color.accentColor : Color.secondary)
                Text(k.titel).font(.subheadline).foregroundStyle(.primary).multilineTextAlignment(.leading)
            }
        }
        .buttonStyle(.plain)
    }

    private func umschalten(_ key: String) {
        if wahl.contains(key) { wahl.remove(key) } else { wahl.insert(key) }
    }

    private var teilenKnopf: some View {
        Button { if let b = bild { teilen(b) } } label: {
            Label(Loc.t("team.teilen", lang), systemImage: "square.and.arrow.up").frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .disabled(bild == nil)
    }

    @MainActor private func zeichnen() {
        let gruppen: [TeamUebersichtKategorie] = daten.kategorien.filter { wahl.contains($0.key) }
        let inhalt = TeamUebersichtBild(daten: daten, gruppen: gruppen, quelle: plattformZeile(lang), hell: hell)
            .environment(\.colorScheme, hell ? .light : .dark)
        let r = ImageRenderer(content: inhalt)
        r.scale = 1
        bild = r.uiImage
    }
}

/// Das Bild: Kopf (Eventname, Teamname in Akzentfarbe, Zeitraum/Stand klein, Abzeichen neben der ersten kleinen Zeile),
/// Summen-Kacheln nebeneinander, je Kategorie Titel + die ersten 3 Plaetze (Zeilen 62 px), Plattform-Zeile, Fuss.
struct TeamUebersichtBild: View {
    let daten: TeamUebersichtDaten
    let gruppen: [TeamUebersichtKategorie]
    let quelle: String
    let hell: Bool

    private var f: TeamBildFarben { hell ? .hell : .dunkel }
    private let rand: CGFloat = 90
    private let zh: CGFloat = 62
    private var hoehe: CGFloat { teamUebersichtHoehe(daten.summen.count, gruppen.count) }
    /// Oberkante der Inhalte wie im Web (215 + 34 je kleiner Unterzeile) — nur fuer die Platzrechnung.
    private var oben: CGFloat { 215 + 34 * CGFloat(daten.unterzeile2.count) }

    /// Nur so viele Kategorien, wie ueber dem Fuss Platz haben (web: Abbruch bei y + 44 + 3 * zh > H - 170).
    private var passende: [TeamUebersichtKategorie] {
        var y: CGFloat = oben + (daten.summen.isEmpty ? 0 : 190)
        var out: [TeamUebersichtKategorie] = []
        for g in gruppen {
            if y + 44 + 3 * zh > hoehe - 170 { break }
            out.append(g)
            y += 44 + CGFloat(max(1, min(3, g.zeilen.count))) * zh + 30
        }
        return out
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            f.grund
            // Kopf und Inhalt fliessen untereinander: braucht der Eventname zwei Zeilen, rutscht alles nach unten (web `dy`).
            VStack(alignment: .leading, spacing: 40) {
                kopf
                inhalt
            }
            .offset(x: rand, y: 60)
            Text(quelle).font(.system(size: 20)).foregroundStyle(f.leise).lineLimit(1).minimumScaleFactor(0.75)
                .frame(width: 900, alignment: .leading).offset(x: rand, y: hoehe - 135)
            TeamBildFuss(hell: hell).offset(x: rand, y: hoehe - 90)
        }
        .frame(width: 1080, height: hoehe, alignment: .topLeading)
    }

    // Eventname in Text- statt Akzentfarbe, eine Zeile bis 46 px, sonst zwei Zeilen (web titelAnpassen).
    private var kopf: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(daten.titel).font(.system(size: 58, weight: .bold)).foregroundStyle(f.text)
                .lineLimit(2).minimumScaleFactor(0.62).fixedSize(horizontal: false, vertical: true)
            Text(daten.unterzeile).font(.system(size: 30, weight: .bold)).foregroundStyle(f.akzent).lineLimit(1)
            ForEach(Array(daten.unterzeile2.enumerated()), id: \.offset) { i, z in kleineZeile(z, erste: i == 0) }
        }
        .frame(width: 900, alignment: .leading)
    }

    private func kleineZeile(_ z: String, erste: Bool) -> some View {
        HStack(spacing: 20) {
            Text(z).font(.system(size: 26, weight: .semibold)).foregroundStyle(f.sek)
                .lineLimit(1).minimumScaleFactor(0.77)
                .frame(maxWidth: .infinity, alignment: .leading)
            if erste, let a = daten.abzeichen { TeamBildPille(text: a, hell: hell, schrift: 22, hoehe: 40) }
        }
    }

    private var inhalt: some View {
        VStack(alignment: .leading, spacing: 0) {
            if !daten.summen.isEmpty { summenReihe.padding(.bottom, 40) }
            ForEach(passende) { g in gruppe(g).padding(.bottom, 30) }
        }
        .frame(width: 900, alignment: .leading)
    }

    private var summenReihe: some View {
        HStack(spacing: 18) {
            ForEach(daten.summen) { k in summenKachel(k) }
        }
        .frame(width: 900)
    }

    private func summenKachel(_ k: TeamZahlKachel) -> some View {
        let viele: Bool = daten.summen.count > 3
        return VStack(spacing: 8) {
            Text(k.wert).font(.system(size: viele ? 46 : 56, weight: .heavy)).foregroundStyle(f.akzent)
                .lineLimit(1).minimumScaleFactor(0.5)
            Text(k.label).font(.system(size: viele ? 20 : 24, weight: .semibold)).foregroundStyle(f.sek).lineLimit(1)
        }
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity)
        .frame(height: 150)
        .background(RoundedRectangle(cornerRadius: 22).fill(f.flaeche))
        .overlay(RoundedRectangle(cornerRadius: 22).strokeBorder(f.akzent, lineWidth: 3))
    }

    private func gruppe(_ g: TeamUebersichtKategorie) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(g.titel).font(.system(size: 30, weight: .bold)).foregroundStyle(f.text).lineLimit(1)
                .frame(height: 44, alignment: .topLeading)
            if g.zeilen.isEmpty {
                Text("—").font(.system(size: 26)).foregroundStyle(f.sek).frame(height: zh)
            }
            ForEach(Array(g.zeilen.prefix(3).enumerated()), id: \.offset) { i, z in
                zeile(z).overlay(alignment: .top) {
                    if i > 0 { Rectangle().fill(f.linie).frame(height: 2) }
                }
            }
        }
    }

    private func zeile(_ z: TeamBildZeile) -> some View {
        TeamBildZeilenAnsicht(z: z, zh: zh, gross: 31, hell: hell, logos: daten.logos, flaggen: daten.flaggen)
    }
}
