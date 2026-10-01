import SwiftUI

// Gruener Online-Punkt am Profilbild + Tipp aufs Profilbild -> Foiler-Seite.
// Portiert aus der PWA (web/src/lib/online.ts, Avatar in web/src/components/ui.tsx; c27b7aa5 +
// 5272d67a). Jan, 01.10.2026: „ueberall wo das profilbild angezeigt wird", „egal ob app oder web",
// „das profilbild ueberall als link zur jeweiligen profil-seite".
//
// Warum EIN Speicher fuer alle Profilbilder: jedes sichtbare Profilbild meldet hier seine User-ID
// an, und EIN Aufruf (GET /api/chat/online?ids=…) fragt alle gemeinsam ab — gebuendelt ~400 ms
// nach neuen IDs, danach minuetlich, und nur solange die App im Vordergrund ist. So bekommt keine
// der vielen Listen-Antworten ein eigenes Feld, und eine Liste mit 30 Profilbildern kostet einen
// Aufruf statt dreissig. Wen der Server NICHT meldet (Punkt abgeschaltet, unter 13, Testkonten,
// Blockierte, KI-Account), entscheidet allein der Server.

/// Ob die App gerade im Vordergrund ist. Liest `Api.request` (nicht an den MainActor gebunden),
/// um im Hintergrund `X-Foil-Sichtbar: 0` mitzuschicken — dieselbe Regel wie die PWA bei
/// verstecktem Tab (server/app/api/deps.py): eine Hintergrund-Anfrage (z. B. ein Upload von der
/// Uhr) soll niemanden als „online" markieren. Ein einfaches Bool; geschrieben nur vom MainActor.
enum Vordergrund {
    static var aktiv = true
}

@MainActor
final class OnlineStore: ObservableObject {
    static let shared = OnlineStore()

    /// IDs, die der letzte Abruf als online gemeldet hat.
    @Published private(set) var online: Set<Int> = []

    private var angemeldet: [Int: Int] = [:]   // id -> Zahl der sichtbaren Profilbilder
    private var gefragt: Set<Int> = []          // was der letzte Abruf schon enthielt
    private var bald: Task<Void, Never>?
    private var takt: Task<Void, Never>?
    private var aktiv = true

    private static let taktNs: UInt64 = 60_000_000_000
    private static let buendelNs: UInt64 = 400_000_000

    func istOnline(_ id: Int?) -> Bool {
        guard let id, id > 0 else { return false }
        return online.contains(id)
    }

    func anmelden(_ id: Int) {
        angemeldet[id, default: 0] += 1
        // Neue ID -> bald fragen; eine schon bekannte wartet auf den naechsten Takt.
        if !gefragt.contains(id) { planen(sofort: false) }
    }

    func abmelden(_ id: Int) {
        let n: Int = (angemeldet[id] ?? 1) - 1
        if n <= 0 { angemeldet[id] = nil } else { angemeldet[id] = n }
    }

    /// Von RootView bei jedem Wechsel der scenePhase. Nur `.active` fragt; im Hintergrund steht
    /// der Takt, und die Rueckkehr fragt sofort (die Punkte sind dann bis zu Minuten alt).
    func szenenWechsel(_ phase: ScenePhase) {
        aktiv = phase == .active
        Vordergrund.aktiv = aktiv
        if aktiv {
            planen(sofort: true)
        } else {
            bald?.cancel(); bald = nil
            takt?.cancel(); takt = nil
        }
    }

    private func planen(sofort: Bool) {
        guard aktiv else { return }
        bald?.cancel()
        let warte: UInt64 = sofort ? 0 : Self.buendelNs
        bald = Task { [weak self] in
            if warte > 0 { try? await Task.sleep(nanoseconds: warte) }
            if Task.isCancelled { return }
            await self?.abfragen()
        }
        taktStarten()
    }

    private func taktStarten() {
        guard aktiv, takt == nil else { return }
        takt = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: Self.taktNs)
                if Task.isCancelled { break }
                await self?.abfragen()
            }
        }
    }

    private func abfragen() async {
        guard aktiv, Api.token != nil, !angemeldet.isEmpty else { return }
        let ids: [Int] = Array(angemeldet.keys.sorted().prefix(200))   // Server nimmt hoechstens 200
        do {
            let r: [Int] = try await Api.chatOnline(ids: ids)
            gefragt = Set(ids)
            let neu = Set(r)
            if neu != online { online = neu }
        } catch {
            // Netz weg oder abgemeldet: die Punkte bleiben, wie sie sind (wie die PWA). Der naechste
            // Takt fragt wieder — ein fehlender gruener Punkt ist kein Datenverlust.
        }
    }
}

// MARK: - Sichtbarkeit des Tabs

/// Ist der Tab, in dem diese Ansicht liegt, gerade der sichtbare? MainTabView laesst besuchte Tabs
/// unsichtbar im ZStack liegen (opacity 0) — dort feuert kein onDisappear. Ohne diesen Wert
/// zaehlte ein Chat in einem verdeckten Tab als „gelesen" und Profilbilder dort als sichtbar.
/// Vorgabe `true`: ausserhalb der Tab-Leiste (Sheets, Login) ist eine Ansicht sichtbar.
private struct TabSichtbarKey: EnvironmentKey {
    static let defaultValue: Bool = true
}

/// Die User-ID der Foiler-Seite, auf der man gerade steht — dort fuehrt ihr Profilbild nicht noch
/// einmal auf dieselbe Seite (PWA: `pathname !== ziel`).
private struct FoilerSeiteKey: EnvironmentKey {
    static let defaultValue: Int? = nil
}

extension EnvironmentValues {
    var tabSichtbar: Bool {
        get { self[TabSichtbarKey.self] }
        set { self[TabSichtbarKey.self] = newValue }
    }

    var foilerSeite: Int? {
        get { self[FoilerSeiteKey.self] }
        set { self[FoilerSeiteKey.self] = newValue }
    }
}

// MARK: - Punkt + Tipp am Profilbild

extension View {
    /// Online-Punkt und Tipp auf die Foiler-Seite fuer ein beliebiges Profilbild der Groesse `size`.
    /// Ohne `userId` geschieht beides nicht. `link: false` dort, wo der Tipp schon etwas anderes
    /// tut (Empfaenger-Auswahl beim Uebertragen, DM-Liste, Personensuche — die oeffnen den Chat).
    func profilbild(userId: Int?, size: CGFloat, link: Bool = true) -> some View {
        modifier(ProfilbildExtras(userId: userId, size: size, link: link))
    }
}

struct ProfilbildExtras: ViewModifier {
    let userId: Int?
    let size: CGFloat
    let link: Bool

    @ObservedObject private var store = OnlineStore.shared
    @Environment(\.tabSichtbar) private var tabSichtbar
    @Environment(\.foilerSeite) private var foilerSeite
    @AppStorage("appLang") private var lang = "de"
    @State private var erschienen = false
    @State private var gemeldet: Int?          // die ID, die gerade beim Speicher angemeldet ist
    @State private var zeigeProfil = false

    init(userId: Int?, size: CGFloat, link: Bool) {
        self.userId = userId
        self.size = size
        self.link = link
    }

    private var id: Int? {
        guard let u = userId, u > 0 else { return nil }
        return u
    }

    private var verlinkt: Bool { link && id != nil && id != foilerSeite }

    // Web: Math.max(8, round(size * 0.28)).
    private var punktGroesse: CGFloat { max(8, (size * 0.28).rounded()) }

    func body(content: Content) -> some View {
        mitLink(content.overlay(alignment: .bottomTrailing) { punkt })
            .onAppear { erschienen = true; abgleichen() }
            .onDisappear { erschienen = false; abgleichen() }
            .onChange(of: userId) { _ in abgleichen() }
            .onChange(of: tabSichtbar) { _ in abgleichen() }
    }

    // Gruen mit Rand in Hintergrundfarbe (Web: bg-emerald-500 + ring-2 in Seitenfarbe). Der Rand
    // liegt AUSSERHALB des Punkts, damit ein 8-pt-Punkt nicht zu einem 4-pt-Kruemel schrumpft.
    @ViewBuilder private var punkt: some View {
        if store.istOnline(id) {
            let p: CGFloat = punktGroesse
            Circle()
                .fill(Color(red: 0x10 / 255, green: 0xb9 / 255, blue: 0x81 / 255))
                .frame(width: p, height: p)
                .padding(2)
                .background(Circle().fill(Color(.systemBackground)))
                .offset(x: 2, y: 2)
                .accessibilityElement()
                .accessibilityLabel(Loc.t("presence.online", lang))
                .allowsHitTesting(false)
        }
    }

    // Als Sheet mit eigenem NavigationStack statt als Push: Profilbilder sitzen in Listenzeilen,
    // die selbst schon eine Session oeffnen, in Sheets (Spot-Beschreibungen) und in Stapeln ohne
    // Wert-Navigation. Ein Sheet funktioniert an jeder dieser Stellen gleich, ohne dass jeder der
    // sieben Tab-Stapel ein Ziel registrieren muss. `.borderless`, damit der Tipp in einer
    // Listenzeile nur das Profilbild trifft und nicht die Zeile (Memory
    // swiftui-listenzeile-mehrere-knoepfe).
    @ViewBuilder private func mitLink<V: View>(_ v: V) -> some View {
        if verlinkt, let id {
            Button { zeigeProfil = true } label: { v }
                .buttonStyle(.borderless)
                .sheet(isPresented: $zeigeProfil) { FoilerSheet(userId: id) }
        } else {
            v
        }
    }

    /// Anmeldung beim Speicher genau dann, wenn das Bild erschienen ist UND sein Tab sichtbar ist.
    /// Merkt sich die angemeldete ID, damit ein wiederverwendetes Listenelement mit neuer ID die
    /// alte sauber abmeldet.
    private func abgleichen() {
        let soll: Int? = (erschienen && tabSichtbar) ? id : nil
        if soll == gemeldet { return }
        if let alt = gemeldet { store.abmelden(alt) }
        if let neu = soll { store.anmelden(neu) }
        gemeldet = soll
    }
}
