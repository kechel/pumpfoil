import SwiftUI

// Ausruestung (App-Port Phase 7, docs/UX-IA.md, 04.11.2026) — frueher „Foils & Sportarten" + „Detailliertes Setup" als
// zwei lange Seiten. Wie web/src/pages/Foils.tsx (`Ausruestung`): Reiter Foils · Stabilizer · Boards · Mast & Shim.
// Sportarten sind seit 06.11.2026 ein eigener Reiter der Einstellungen zwischen Team und Ausruestung (Web 05.11., Jan:
// „verschiebe mal 'Sports' eine ebene hoeher zwischen team und equipment"). Foil- und Stab-Katalog nur ueber die Suche, Ausruestung je Sportart bei Sportarten ohne Foil nur das Board
// (beides in FoilsView/SetupView). Eingebettet in Einstellungen › Ausruestung als zweite Reiterzeile.
struct AusruestungView: View {
    @AppStorage("appLang") private var lang = "de"
    var eingebettet: Bool = false
    @State private var tab: String

    init(start: String? = nil, eingebettet: Bool = false) {
        self.eingebettet = eingebettet
        // Ein gemerkter Reiter „sport" (bis 1.1.60) gibt es hier nicht mehr -> Foils.
        let gemerkt = start ?? ReiterSpeicher.von("ausruestung", "foils")
        _tab = State(initialValue: ["foils", "stabs", "boards", "mast"].contains(gemerkt) ? gemerkt : "foils")
    }

    private var reiter: [ReiterDef] {
        [ReiterDef(id: "foils", label: "Foils"),
         ReiterDef(id: "stabs", label: Loc.t("setup.stabTitle", lang)),
         ReiterDef(id: "boards", label: Loc.t("setup.boardTitle", lang)),
         ReiterDef(id: "mast", label: Loc.t("gear.mastShim", lang))]
    }

    private var tabBindung: Binding<String> {
        Binding(get: { tab }, set: { tab = $0; ReiterSpeicher.setze("ausruestung", $0) })
    }

    var body: some View {
        VStack(spacing: 0) {
            Reiterleiste(reiter: reiter, aktiv: tabBindung, stufe: eingebettet ? 2 : 1)
                .padding(.horizontal).padding(.top, eingebettet ? 8 : 0)
            inhalt
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .brandToolbarWenn(!eingebettet, Loc.t("gear.title", lang), feedbackUrl: "/foils")
    }

    // Jeder Reiter eine eigene Ansicht (eigenes Laden), `.id` damit ein Wechsel nicht den Zustand des vorigen mitnimmt.
    @ViewBuilder private var inhalt: some View {
        switch tab {
        case "stabs": SetupView(teil: "stabs", eingebettet: true).id("stabs")
        case "boards": SetupView(teil: "boards", eingebettet: true).id("boards")
        case "mast": SetupView(teil: "mast", eingebettet: true).id("mast")
        default: FoilsView(eingebettet: true)
        }
    }
}
