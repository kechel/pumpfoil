import SwiftUI

// „Rate this analysis" (Jan, 22.10.2026) — wie web/src/components/SessionBewertung.tsx und Android Bewertung.kt:
// Kachel unter den Zahlen, NUR auf eigenen Sessions; Antworten liegen an der Session (server/app/api/bewertung.py),
// sichtbar nur fuer den Besitzer und im Admin-Tab „Bewertungen". Alle Fragen optional; nochmal tippen waehlt ab.
// Bewusst kleine, explizit typisierte Teile (Memory ios-swift-typecheck-hang).

private let bewLaeufe: [String] = ["alle", "fehlen", "zuviele", "zerstueckelt"]
private let bewPumps: [String] = ["wenig", "passt", "viel", "weiss_nicht"]
private let bewProbleme: [String] = ["abbruch", "pause", "gps", "upload", "akku", "bedienung", "sonstiges"]

struct BewAntworten {
    var sterne: Int? = nil
    var laeufe: String? = nil
    var laeufeEcht: Int? = nil
    var pumps: String? = nil
    var tempoOk: Bool? = nil
    var probleme: Bool? = nil
    var problemeArt: [String] = []

    init() {}

    init(_ d: [String: Any]?) {
        guard let d else { return }
        sterne = (d["sterne"] as? NSNumber)?.intValue
        laeufe = d["laeufe"] as? String
        laeufeEcht = (d["laeufe_echt"] as? NSNumber)?.intValue
        pumps = d["pumps"] as? String
        tempoOk = d["tempo_ok"] as? Bool
        probleme = d["probleme"] as? Bool
        problemeArt = (d["probleme_art"] as? [String]) ?? []
    }

    func json() -> [String: Any] {
        var d: [String: Any] = [:]
        if let v = sterne { d["sterne"] = v }
        if let v = laeufe { d["laeufe"] = v }
        if let v = laeufeEcht { d["laeufe_echt"] = v }
        if let v = pumps { d["pumps"] = v }
        if let v = tempoOk { d["tempo_ok"] = v }
        if let v = probleme { d["probleme"] = v }
        if probleme == true && !problemeArt.isEmpty { d["probleme_art"] = problemeArt }
        return d
    }
}

struct BewertungKachel: View {
    let sessionId: Int
    let lang: String
    @State private var geladen: Bool = false
    @State private var hat: Bool = false
    @State private var antworten: BewAntworten = BewAntworten()
    @State private var kommentar: String = ""
    @State private var laeufeJetzt: Int? = nil
    @State private var offen: Bool = false

    var body: some View {
        Button { offen = true } label: { inhalt }
            .buttonStyle(.plain)
            .task(id: sessionId) { await laden() }
            .sheet(isPresented: $offen) {
                BewertungSheet(sessionId: sessionId, lang: lang, alt: antworten, altKommentar: kommentar,
                               laeufeJetzt: laeufeJetzt) { neu, k in
                    antworten = neu; kommentar = k; hat = true; offen = false
                }
            }
    }

    private var inhalt: some View {
        VStack(alignment: .leading, spacing: 4) {
            sterneZeile
            Text(Loc.t(hat ? "rate.rated" : "rate.tile", lang)).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
        .opacity(geladen ? 1 : 0.4)
    }

    @ViewBuilder private var sterneZeile: some View {
        if hat, let st = antworten.sterne {
            HStack(spacing: 2) {
                ForEach(1...5, id: \.self) { n in
                    Image(systemName: n <= st ? "star.fill" : "star").foregroundStyle(Color.accentColor)
                }
            }
        } else if hat {
            Image(systemName: "checkmark").foregroundStyle(Color.accentColor)
        } else {
            Image(systemName: "star").foregroundStyle(Color.accentColor)
        }
    }

    private func laden() async {
        guard let r = try? await Api.bewertung(sessionId) else { geladen = true; return }
        laeufeJetzt = (r["laeufe_jetzt"] as? NSNumber)?.intValue
        let b: [String: Any]? = r["bewertung"] as? [String: Any]
        hat = b != nil
        antworten = BewAntworten(b?["antworten"] as? [String: Any])
        kommentar = (b?["kommentar"] as? String) ?? ""
        geladen = true
    }
}

private struct BewertungSheet: View {
    let sessionId: Int
    let lang: String
    let alt: BewAntworten
    let altKommentar: String
    let laeufeJetzt: Int?
    let onSaved: (BewAntworten, String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var a: BewAntworten = BewAntworten()
    @State private var echt: String = ""
    @State private var kommentar: String = ""
    @State private var busy: Bool = false
    @State private var fehler: Bool = false
    @State private var bereit: Bool = false

    var body: some View {
        NavigationStack {
            Form {
                Section { Text(Loc.t("rate.intro", lang)).font(.footnote).foregroundStyle(.secondary) }
                Section(Loc.t("rate.stars", lang)) { sterneWahl }
                Section(Loc.t("rate.runs", lang)) { chips(bewLaeufe, "rate.runs.", a.laeufe) { a.laeufe = a.laeufe == $0 ? nil : $0 } }
                Section(Loc.t("rate.runsReal", lang)) { echtFeld }
                Section(Loc.t("rate.pumps", lang)) { chips(bewPumps, "rate.pumps.", a.pumps) { a.pumps = a.pumps == $0 ? nil : $0 } }
                Section(Loc.t("rate.speedOk", lang)) { jaNein(a.tempoOk) { a.tempoOk = $0 } }
                Section(Loc.t("rate.problems", lang)) { problemeTeil }
                Section(Loc.t("rate.comment", lang)) { kommentarFeld }
                if fehler { Text(Loc.t("rate.error", lang)).foregroundStyle(.red) }
            }
            .navigationTitle(Loc.t("rate.title", lang))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(Loc.t("rate.cancel", lang)) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button(Loc.t("rate.send", lang)) { Task { await senden() } }.disabled(busy) }
            }
            .onAppear(perform: vorbelegen)
        }
    }

    private func vorbelegen() {
        guard !bereit else { return }
        bereit = true
        a = alt
        kommentar = altKommentar
        if let v = alt.laeufeEcht { echt = String(v) }   // sonst leer, unsere Zahl nur als Hinweis (wie Web)
    }

    private var sterneWahl: some View {
        HStack(spacing: 10) {
            ForEach(1...5, id: \.self) { n in
                Button { a.sterne = a.sterne == n ? nil : n } label: {
                    Image(systemName: (a.sterne ?? 0) >= n ? "star.fill" : "star").font(.title2)
                }
                .buttonStyle(.plain).foregroundStyle(Color.accentColor)
            }
        }
    }

    private var echtFeld: some View {
        HStack {
            TextField(laeufeJetzt.map { String($0) } ?? "", text: $echt)
                .keyboardType(.numberPad)
                .frame(width: 70)
            if let n = laeufeJetzt {
                Text(Loc.t("rate.runsRealHint", lang).replacingOccurrences(of: "{n}", with: String(n)))
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder private var problemeTeil: some View {
        jaNein(a.probleme, neinZuerst: true) { a.probleme = $0 }
        if a.probleme == true {
            ForEach(bewProbleme, id: \.self) { k in
                Toggle(Loc.t("rate.prob." + k, lang), isOn: problemBinding(k))
            }
        }
    }

    private func problemBinding(_ k: String) -> Binding<Bool> {
        Binding<Bool>(
            get: { a.problemeArt.contains(k) },
            set: { an in
                if an { if !a.problemeArt.contains(k) { a.problemeArt.append(k) } } else { a.problemeArt.removeAll { $0 == k } }
            })
    }

    private var kommentarFeld: some View {
        TextField(Loc.t("rate.commentPh", lang), text: $kommentar, axis: .vertical)
            .lineLimit(3...8)
            .onChange(of: kommentar) { v in if v.count > 2000 { kommentar = String(v.prefix(2000)) } }
    }

    private func chips(_ keys: [String], _ prefix: String, _ wahl: String?, _ setze: @escaping (String) -> Void) -> some View {
        ForEach(keys, id: \.self) { k in
            Button { setze(k) } label: {
                HStack {
                    Text(Loc.t(prefix + k, lang))
                    Spacer()
                    if wahl == k { Image(systemName: "checkmark").foregroundStyle(Color.accentColor) }
                }
            }
            .foregroundStyle(.primary)
        }
    }

    private func jaNein(_ wert: Bool?, neinZuerst: Bool = false, _ setze: @escaping (Bool?) -> Void) -> some View {
        let reihe: [Bool] = neinZuerst ? [false, true] : [true, false]
        return ForEach(reihe, id: \.self) { v in
            Button { setze(wert == v ? nil : v) } label: {
                HStack {
                    Text(Loc.t(v ? "rate.yes" : "rate.no", lang))
                    Spacer()
                    if wert == v { Image(systemName: "checkmark").foregroundStyle(Color.accentColor) }
                }
            }
            .foregroundStyle(.primary)
        }
    }

    private func senden() async {
        var s: BewAntworten = a
        let n: Int? = Int(echt.trimmingCharacters(in: .whitespaces))
        s.laeufeEcht = n
        if s.probleme != true { s.problemeArt = [] }
        let k: String = kommentar.trimmingCharacters(in: .whitespacesAndNewlines)
        busy = true; fehler = false
        do {
            try await Api.bewertungSpeichern(sessionId, antworten: s.json(), kommentar: k)
            busy = false
            onSaved(s, k)
        } catch {
            busy = false
            fehler = true
        }
    }
}
