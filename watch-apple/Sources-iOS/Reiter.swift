import SwiftUI

/// Reiter oben auf einer Seite — dieselbe Leiste wie im Web (web/src/components/Reiter.tsx) und auf Android (Reiter.kt),
/// Plan docs/UX-IA.md: wischbar, wenn sie nicht in die Breite passt; der gewaehlte Reiter rollt ins Bild.
/// `stufe == 2`: zweite Zeile als Flaeche, der aktive Reiter als helle Pille. `unter`: der aktive Reiter der Hauptzeile
/// wird in der Farbe der zweiten Zeile hinterlegt, damit man sieht, was zusammengehoert.
struct ReiterDef: Identifiable, Hashable {
    let id: String
    let label: String
    /// Abzeichen hinter dem Namen (web ReiterDef.badge, 06.11.2026): Events — LIVE bzw. Zahl der kommenden.
    var abzeichen: ReiterAbzeichen? = nil
}

/// Event-Abzeichen eines Reiters: `live` = ein Event laeuft, sonst `bald` kommende (0 = nichts zeigen).
struct ReiterAbzeichen: Hashable {
    let live: Bool
    let bald: Int
}

struct Reiterleiste: View {
    let reiter: [ReiterDef]
    @Binding var aktiv: String
    var stufe: Int = 1
    var unter: Bool = false

    /// Lage jedes Reiters im sichtbaren Bereich der Leiste (fuer die Rand-Pfeile).
    @State private var lagen: [String: CGRect] = [:]
    @State private var breite: CGFloat = 0

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: stufe == 2 ? 4 : 0) {
                    ForEach(reiter) { r in
                        knopf(r).background(GeometryReader { g in
                            Color.clear.preference(key: ReiterLagen.self, value: [r.id: g.frame(in: .named("reiterleiste"))])
                        })
                    }
                }
                .padding(stufe == 2 ? 6 : 0)
            }
            .coordinateSpace(name: "reiterleiste")
            .background(GeometryReader { g in Color.clear.onAppear { breite = g.size.width }
                .onChange(of: g.size.width) { breite = $0 } })
            .onPreferenceChange(ReiterLagen.self) { lagen = $0 }
            .background(stufe == 2 ? AnyView(RoundedRectangle(cornerRadius: 12)
                .fill(Color(.secondarySystemBackground))) : AnyView(Color.clear))
            .overlay(alignment: .leading) { if kannLinks { pfeil(rechts: false, proxy) } }
            .overlay(alignment: .trailing) { if kannRechts { pfeil(rechts: true, proxy) } }
            .onChange(of: aktiv) { neu in withAnimation { proxy.scrollTo(neu, anchor: .center) } }
            .onAppear { proxy.scrollTo(aktiv, anchor: .center) }
        }
        .overlay(alignment: .bottom) { if stufe == 1 { Divider() } }
    }

    // Pfeile am Rand, solange die Leiste in diese Richtung weitergeht (wie Web `useWischleiste` und Android
    // `RandPfeile`, Jan 13.11.2026: „mir fehlen diese pfeil-indicatoren in den tabs-zeilen wenn man scrollen kann").
    // iOS 16 kennt kein scrollBy: Tippen rollt den ersten halb verdeckten Reiter an den Rand.
    private var kannLinks: Bool { lagen.values.contains { $0.minX < -2 } }
    private var kannRechts: Bool { breite > 0 && lagen.values.contains { $0.maxX > breite + 2 } }

    private func pfeil(rechts: Bool, _ proxy: ScrollViewProxy) -> some View {
        Button {
            let ziel: String?
            if rechts {
                ziel = reiter.first { (lagen[$0.id]?.maxX ?? 0) > breite + 2 }?.id
            } else {
                ziel = reiter.last { (lagen[$0.id]?.minX ?? 0) < -2 }?.id
            }
            if let ziel { withAnimation { proxy.scrollTo(ziel, anchor: rechts ? .leading : .trailing) } }
        } label: {
            Image(systemName: rechts ? "chevron.right" : "chevron.left")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Color.secondary)
                .frame(width: 28, height: 28)
                .background(Circle().fill(Color(.systemBackground)))
                .overlay(Circle().stroke(Color(.separator), lineWidth: 1))
                .shadow(color: .black.opacity(0.15), radius: 2, y: 1)
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 4)
        .accessibilityHidden(true)
    }

    @ViewBuilder private func knopf(_ r: ReiterDef) -> some View {
        let an = r.id == aktiv
        Button { aktiv = r.id } label: {
            if stufe == 2 {
                beschriftung(r, an)
                    .padding(.horizontal, 12).padding(.vertical, 6)
                    .background(RoundedRectangle(cornerRadius: 8).fill(an ? Color(.systemBackground) : Color.clear))
            } else {
                VStack(spacing: 0) {
                    beschriftung(r, an)
                        .padding(.horizontal, 12).padding(.vertical, 10)
                    Rectangle().fill(an && !unter ? Color.accentColor : Color.clear).frame(height: 2)
                }
                .background(RoundedRectangle(cornerRadius: 12)   // UnevenRoundedRectangle erst ab iOS 17, die App laeuft ab 16
                    .fill(an && unter ? Color(.secondarySystemBackground) : Color.clear))
            }
        }
        .buttonStyle(.plain)
        .id(r.id)
    }

    private func beschriftung(_ r: ReiterDef, _ an: Bool) -> some View {
        HStack(spacing: 6) {
            Text(r.label).font(.subheadline).fontWeight(an ? .semibold : .regular).lineLimit(1)
                .foregroundStyle(an ? Color.primary : Color.secondary)
            if let a = r.abzeichen { EventReiterAbzeichen(live: a.live, bald: a.bald, lang: Api.uiLang) }
        }
    }
}

private struct ReiterLagen: PreferenceKey {
    static var defaultValue: [String: CGRect] = [:]
    static func reduce(value: inout [String: CGRect], nextValue: () -> [String: CGRect]) {
        value.merge(nextValue(), uniquingKeysWith: { $1 })
    }
}

/// Abzeichen-Werte aus einer Event-Liste (web useEventAbzeichen / useTeamEventAbzeichen): laeuft eins -> LIVE, sonst die
/// Zahl der kommenden.
func reiterAbzeichen(_ events: [TeamEventKurz]) -> ReiterAbzeichen {
    ReiterAbzeichen(live: events.contains { $0.status == "laeuft" }, bald: events.filter { $0.status == "kommend" }.count)
}

/// Gewaehlter Reiter je Bereich fuer die Dauer der App-Sitzung (wie im Web: jeder Bereich kehrt dorthin zurueck, wo man
/// war). Neuer App-Start = Startreiter. Nicht auf Platte gespeichert.
enum ReiterSpeicher {
    static var zustand: [String: String] = [:]
    static func von(_ bereich: String, _ start: String) -> String { zustand[bereich] ?? start }
    static func setze(_ bereich: String, _ wert: String) { zustand[bereich] = wert }
}
