import SwiftUI

/// Reiter oben auf einer Seite — dieselbe Leiste wie im Web (web/src/components/Reiter.tsx) und auf Android (Reiter.kt),
/// Plan docs/UX-IA.md: wischbar, wenn sie nicht in die Breite passt; der gewaehlte Reiter rollt ins Bild.
/// `stufe == 2`: zweite Zeile als Flaeche, der aktive Reiter als helle Pille. `unter`: der aktive Reiter der Hauptzeile
/// wird in der Farbe der zweiten Zeile hinterlegt, damit man sieht, was zusammengehoert.
struct ReiterDef: Identifiable, Hashable {
    let id: String
    let label: String
}

struct Reiterleiste: View {
    let reiter: [ReiterDef]
    @Binding var aktiv: String
    var stufe: Int = 1
    var unter: Bool = false

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: stufe == 2 ? 4 : 0) {
                    ForEach(reiter) { r in knopf(r) }
                }
                .padding(stufe == 2 ? 6 : 0)
            }
            .background(stufe == 2 ? AnyView(RoundedRectangle(cornerRadius: 12)
                .fill(Color(.secondarySystemBackground))) : AnyView(Color.clear))
            .onChange(of: aktiv) { neu in withAnimation { proxy.scrollTo(neu, anchor: .center) } }
            .onAppear { proxy.scrollTo(aktiv, anchor: .center) }
        }
        .overlay(alignment: .bottom) { if stufe == 1 { Divider() } }
    }

    @ViewBuilder private func knopf(_ r: ReiterDef) -> some View {
        let an = r.id == aktiv
        Button { aktiv = r.id } label: {
            if stufe == 2 {
                Text(r.label).font(.subheadline).fontWeight(an ? .semibold : .regular).lineLimit(1)
                    .foregroundStyle(an ? Color.primary : Color.secondary)
                    .padding(.horizontal, 12).padding(.vertical, 6)
                    .background(RoundedRectangle(cornerRadius: 8).fill(an ? Color(.systemBackground) : Color.clear))
            } else {
                VStack(spacing: 0) {
                    Text(r.label).font(.subheadline).fontWeight(an ? .semibold : .regular).lineLimit(1)
                        .foregroundStyle(an ? Color.primary : Color.secondary)
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
}

/// Gewaehlter Reiter je Bereich fuer die Dauer der App-Sitzung (wie im Web: jeder Bereich kehrt dorthin zurueck, wo man
/// war). Neuer App-Start = Startreiter. Nicht auf Platte gespeichert.
enum ReiterSpeicher {
    static var zustand: [String: String] = [:]
    static func von(_ bereich: String, _ start: String) -> String { zustand[bereich] ?? start }
    static func setze(_ bereich: String, _ wert: String) { zustand[bereich] = wert }
}
