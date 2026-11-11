import SwiftUI

// Nationalitaet (PWA lib/laender.ts + components/LandWahl.tsx + Flagge.tsx, 02./03.11.2026). Freiwillig, Feld `land` in
// /api/settings (ISO 3166-1 alpha-2, "" = nicht angegeben). Erscheint als Flagge in den Bestenlisten — nur bei denen,
// die es selbst eingestellt haben. Die Flagge ist hier das Emoji (teamFlaggenEmoji, wie bei den Teams); das Web nimmt
// eigene SVGs, weil Windows Emoji-Flaggen nur als zwei Buchstaben zeigt — auf iOS gibt es das Problem nicht.

enum Laender {
    /// Dieselbe Liste wie web LAENDER (249 Codes). Als EIN mehrzeiliger String statt Array-Literal oder
    /// verketteter Strings: billig fuer den Type-Checker.
    static let codes: [String] = """
        AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT
        BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH
        ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT
        HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS
        LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI
        NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG
        SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG
        UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW
        """.split(whereSeparator: { $0 == " " || $0 == "\n" }).map(String.init)

    /// Laendername in der Sprache der Oberflaeche (wie Intl.DisplayNames im Web).
    static func name(_ code: String, _ lang: String) -> String {
        let loc = Locale(identifier: lang == "gsw" ? "de-CH" : lang)
        return loc.localizedString(forRegionCode: code.uppercased()) ?? code
    }

    /// Hauptland je Sprache (web LAND_JE_SPRACHE).
    private static let jeSprache: [String: String] = [
        "de": "DE", "gsw": "CH", "de-AT": "AT", "en": "GB", "fr": "FR", "it": "IT", "es": "ES", "fi": "FI", "nl": "NL",
        "cs": "CZ", "pl": "PL", "pt": "BR", "pt-PT": "PT", "ja": "JP", "zh": "CN", "ru": "RU", "id": "ID", "nb": "NO",
    ]

    /// Land zur Sprache (web landZurSprache): zuerst die Region des Geraets, wenn sie zur gewaehlten Sprache passt
    /// (en-US -> US, fr-CA -> CA), sonst das Hauptland der Sprache.
    static func zurSprache(_ lang: String) -> String {
        let basis: String = lang.split(separator: "-").first.map(String.init) ?? lang
        for kennung in Locale.preferredLanguages {
            let teile: [String] = kennung.split(separator: "-").map(String.init)
            guard teile.count >= 2, teile[0] == basis else { continue }
            // Region ist der letzte zweistellige Teil (zh-Hans-CN -> CN).
            guard let region = teile.dropFirst().last(where: { $0.count == 2 })?.uppercased(), codes.contains(region) else { continue }
            if lang.contains("-") && region != jeSprache[lang] { continue }
            return region
        }
        return jeSprache[lang] ?? ""
    }

    struct Eintrag: Identifiable {
        let code: String
        let name: String
        var id: String { code }
    }

    /// Sortiert nach dem Namen in der Oberflaechensprache.
    static func sortiert(_ lang: String) -> [Eintrag] {
        let loc = Locale(identifier: lang == "gsw" ? "de-CH" : lang)
        let paare: [Eintrag] = codes.map { Eintrag(code: $0, name: name($0, lang)) }
        return paare.sorted { a, b in a.name.compare(b.name, locale: loc) == .orderedAscending }
    }
}

/// Kleine Flagge nach dem Profilbild in Bestenlisten (web Flagge.tsx). Ohne Land bleibt der Platz leer, damit die Namen
/// buendig stehen (Jan, 03.11.2026).
struct LandFlagge: View {
    let land: String?
    @AppStorage("appLang") private var lang = "de"

    var body: some View {
        if let e = teamFlaggenEmoji(land), let l = land {
            Text(e).font(.system(size: 13)).frame(width: 18)
                .accessibilityLabel(Laender.name(l, lang))
        } else {
            Color.clear.frame(width: 18, height: 12).accessibilityHidden(true)
        }
    }
}

/// Auswahl der Nationalitaet (Profil › Ich und Einrichtungs-Assistent, web LandWahl/LandKarte). Speichert sofort.
/// `assistent`: wurde die Nationalitaet noch nie gesetzt (`land_gewaehlt`), wird die zur Sprache vorgeschlagen und
/// gespeichert; jeder Sprachwechsel dort setzt sie neu. „Nicht angeben" bleibt waehlbar und haelt.
struct LandSection: View {
    let lang: String
    var assistent: Bool = false
    @State private var land: String? = nil
    @State private var letzteSprache: String? = nil

    var body: some View {
        Section {
            if let l = land {
                Picker(selection: Binding(get: { l }, set: { v in speichern(v) })) {
                    Text(Loc.t("profile.landNone", lang)).tag("")
                    ForEach(Laender.sortiert(lang)) { p in
                        Text((teamFlaggenEmoji(p.code) ?? "") + " " + p.name).tag(p.code)
                    }
                } label: {
                    HStack(spacing: 8) {
                        Text(Loc.t("profile.land", lang))
                        if let e = teamFlaggenEmoji(l) { Text(e) }
                    }
                }
                .pickerStyle(.navigationLink)
            } else {
                // Ohne sichtbaren Inhalt laeuft `.task` nie (Memory swiftui-leere-group-laedt-nicht).
                ProgressView()
            }
        } header: {
            Text(Loc.t("profile.land", lang))
        } footer: {
            Text(Loc.t("profile.landHint", lang))
        }
        .task { await laden() }
        .onChange(of: lang) { neu in sprachWechsel(neu) }
    }

    private func speichern(_ v: String) {
        land = v
        Task { try? await Api.saveSettings(["land": v]) }
    }

    private func laden() async {
        guard land == nil else { return }
        let s: [String: Any] = (try? await Api.settings()) ?? [:]
        let gesetzt: String = (s["land"] as? String) ?? ""
        letzteSprache = lang
        if assistent && (s["land_gewaehlt"] as? Bool) != true && gesetzt.isEmpty {
            speichern(Laender.zurSprache(lang))
        } else {
            land = gesetzt
        }
    }

    private func sprachWechsel(_ neu: String) {
        guard assistent, let alt = letzteSprache, alt != neu else { return }
        letzteSprache = neu
        speichern(Laender.zurSprache(neu))
    }
}

/// Wertungsklasse (web WertungsklasseWahl.tsx, 10./11.11.2026): freiwillig, selbst gewaehlt, nie geprueft — nur fuer den
/// Filter in Event-Bestenlisten. "" = keine Angabe (Standard), "w" Frauen, "m" Maenner, "nb" nicht-binaer/divers.
/// Einstellungen › Ich direkt unter der Nationalitaet und im Einrichtungs-Assistenten unter der Nationalitaet.
/// Eine Zeile je Wahl mit Haken (eine tippbare Flaeche je Listenzeile, Memory swiftui-listenzeile-mehrere-knoepfe);
/// speichert sofort (PUT /api/settings {wertungsklasse}).
struct WertungsklasseSection: View {
    let lang: String
    @State private var wert: String? = nil
    @State private var busy = false

    private struct Option: Identifiable {
        let id: String
        let key: String
    }

    private static let optionen: [Option] = [Option(id: "", key: "wk.none"), Option(id: "w", key: "wk.w"),
                                             Option(id: "m", key: "wk.m"), Option(id: "nb", key: "wk.nb")]

    var body: some View {
        Section {
            if let w = wert {
                ForEach(WertungsklasseSection.optionen) { o in zeile(o.id, o.key, an: w == o.id) }
            } else {
                // Ohne sichtbaren Inhalt laeuft `.task` nie (Memory swiftui-leere-group-laedt-nicht).
                ProgressView()
            }
        } header: {
            Text(Loc.t("wk.title", lang))
        } footer: {
            Text(Loc.t("wk.hint", lang))
        }
        .task { await laden() }
    }

    private func zeile(_ k: String, _ key: String, an: Bool) -> some View {
        Button { speichern(k) } label: {
            HStack {
                Text(Loc.t(key, lang)).foregroundStyle(Color.primary)
                Spacer(minLength: 8)
                if an { Image(systemName: "checkmark").foregroundStyle(Color.accentColor) }
            }
            .contentShape(Rectangle())
        }
        .disabled(busy)
    }

    private func speichern(_ k: String) {
        guard k != wert else { return }
        let alt: String? = wert
        wert = k
        busy = true
        Task {
            do { try await Api.saveSettings(["wertungsklasse": k]) } catch { wert = alt }
            busy = false
        }
    }

    private func laden() async {
        guard wert == nil else { return }
        let s: [String: Any] = (try? await Api.settings()) ?? [:]
        wert = (s["wertungsklasse"] as? String) ?? ""
    }
}
