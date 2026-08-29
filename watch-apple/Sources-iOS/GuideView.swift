import SwiftUI

// Anleitung fuer die Uhr — bisher gab es die NUR in der Web-App (Tab "Anleitung", 98
// guide.*-Schluessel); die nativen Apps hatten davon keinen einzigen. Dieser Bildschirm bringt
// die beiden Teile, an denen Nutzer wirklich haengenbleiben:
//   1. der Weg auf die Garmin (die Uhr-App kommt aus dem Connect IQ Store, nicht aus dem
//      App Store) — genau daran ist am 27.08. ein Nutzer gescheitert,
//   2. "wann laedt die Uhr eigentlich hoch?" — die haeufigste Supportfrage: Session fehlt,
//      liegt aber noch auf der Uhr und geht beim naechsten App-Start raus.
// Die Texte sind dieselben wie im Web (aus den Web-Locales uebernommen), damit ein Satz nicht an
// zwei Stellen unterschiedlich lautet.
//
// Jeder Abschnitt ist eine eigene, explizit typisierte Property: Swifts Type-Checker loest einen
// ViewBuilder als EINEN Ausdruck auf, und diese Datei ist ueberwiegend Text (s. Kommentar in
// GarminPairView).
struct GuideView: View {
    @AppStorage("appLang") private var lang = "de"

    var body: some View {
        Form {
            garminSection
            pairSection
            syncSection
        }
        .brandToolbar(Loc.t("guide.howto", lang))
        .navigationBarTitleDisplayMode(.inline)
    }

    private var garminSection: some View {
        Section {
            Text(Loc.t("guide.g.storeLead", lang)).font(.footnote)
            Link(Loc.t("guide.g.storeCta", lang), destination: URL(string: CONNECT_IQ_URL_GUIDE)!)
            schritt("guide.g.s2Title", "guide.g.s2")
            schritt("guide.g.s3Title", "guide.g.s3")
            schritt("guide.g.s5Title", "guide.g.s5")
            schritt("guide.g.s6Title", "guide.g.s6")
        } header: {
            Text(Loc.t("guide.garminSub", lang))
        }
    }

    private var pairSection: some View {
        Section {
            Text(Loc.t("guide.pair.intro", lang)).font(.footnote)
            schritt("guide.pair.autoTitle", "guide.pair.auto")
            schritt("guide.pair.codeTitle", "guide.pair.code")
            schritt("guide.pair.relinkTitle", "guide.pair.relink")
        } header: {
            Text(Loc.t("guide.pair.title", lang))
        } footer: {
            Text(Loc.t("guide.pair.note", lang))
        }
    }

    private var syncSection: some View {
        Section {
            schritt("guide.sync.nowTitle", "guide.sync.now")
            schritt("guide.sync.retryTitle", "guide.sync.retry")
            schritt("guide.sync.laterTitle", "guide.sync.later")
        } header: {
            Text(Loc.t("guide.sync.title", lang))
        } footer: {
            Text(Loc.t("guide.sync.note", lang))
        }
    }

    private func schritt(_ titelKey: String, _ textKey: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(Loc.t(titelKey, lang)).font(.subheadline).bold()
            Text(Loc.t(textKey, lang)).font(.footnote).foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }
}

/// Dieselbe URL wie in GarminPairView — dort ist sie `private`, deshalb hier unter eigenem Namen
/// statt einer geteilten Konstante quer durch die Datei-Sichtbarkeiten.
private let CONNECT_IQ_URL_GUIDE = "https://apps.garmin.com/apps/9a2a753e-b52f-4587-aee4-900caf5cb351"
