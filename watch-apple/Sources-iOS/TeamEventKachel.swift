import SwiftUI

// Event-Kachel (Native-Port Stufe 4, 01.11.2026) — UEBERALL dieselbe: Teamseite oben und unten, Community,
// „Alle Events" (web/src/components/EventKurzKachel.tsx + TeamEventKachel in pages/Team.tsx). Titel, Status
// (laufend: Teamfarbe, sanft pulsierend), Sportarten (amber, immer — auch Pumpfoil), Spots, Zeitraum mit
// Countdown in derselben Zeile, NUR die erste Zeile der Beschreibung (hoechstens zwei Zeilen, fett), Link
// rechts auf Hoehe der letzten Zeile. Keine Sieger, keine Kennzahlen — die stehen auf der Event-Seite.
// Dazu die Zeit-Helfer der Event-Anzeige (web/src/lib/teamEvents.ts).

// MARK: - Zeit

/// ISO-Zeitpunkt des Servers (mit Zone, evtl. mit Sekundenbruchteilen) -> Date.
func teamDatum(_ iso: String?) -> Date? {
    guard let iso, !iso.isEmpty else { return nil }
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let d = f.date(from: iso) { return d }
    f.formatOptions = [.withInternetDateTime]
    return f.date(from: iso)
}

/// App-Sprache -> Locale fuer Datumsformate (Mundarten auf ihr Land, pt = Brasilien).
func teamLocale(_ lang: String) -> Locale {
    switch lang {
    case "gsw": return Locale(identifier: "de_CH")
    case "de-AT": return Locale(identifier: "de_AT")
    case "pt": return Locale(identifier: "pt_BR")
    case "pt-PT": return Locale(identifier: "pt_PT")
    case "zh": return Locale(identifier: "zh_Hans")
    case "nb": return Locale(identifier: "nb_NO")
    default: return Locale(identifier: lang)
    }
}

/// Formatierer in der Zeitzone des Events (ohne Zone: Geraetezone), aus einer Vorlage wie die Intl-Optionen im Web.
private func eventFormat(_ vorlage: String, _ zeitzone: String?, _ lang: String) -> DateFormatter {
    let f = DateFormatter()
    f.locale = teamLocale(lang)
    if let z = zeitzone, let tz = TimeZone(identifier: z) { f.timeZone = tz }
    f.setLocalizedDateFormatFromTemplate(vorlage)
    return f
}

/// Liegt der Zeitpunkt in der Event-Zeitzone genau auf 0:00?
private func eventMitternacht(_ d: Date, _ zeitzone: String?) -> Bool {
    var kal = Calendar(identifier: .gregorian)
    if let z = zeitzone, let tz = TimeZone(identifier: z) { kal.timeZone = tz }
    let k = kal.dateComponents([.hour, .minute], from: d)
    return k.hour == 0 && k.minute == 0
}

private let TAG_VORLAGE = "EEEdMMMyyyy"
private let ZEIT_VORLAGE = "EEEdMMMyyyyjmm"

/// Zeitfenster mit Wochentag. Liegen beide Grenzen auf Mitternacht, stehen nur die Tage da und das Ende ist der
/// LETZTE Tag („Sa 7. Nov. – So 8. Nov.") — wie `eventZeitraum` im Web.
func eventZeitraum(_ start: String, _ ende: String, _ zeitzone: String?, _ lang: String) -> String {
    guard let a = teamDatum(start), let b = teamDatum(ende) else { return start + " – " + ende }
    if eventMitternacht(a, zeitzone) && eventMitternacht(b, zeitzone) {
        let f = eventFormat(TAG_VORLAGE, zeitzone, lang)
        let letzter = b.addingTimeInterval(-12 * 3600)   // sicher im Vortag, auch bei Zeitumstellung
        return f.string(from: a) + " – " + f.string(from: letzter)
    }
    let f = eventFormat(ZEIT_VORLAGE, zeitzone, lang)
    return f.string(from: a) + " – " + f.string(from: b)
}

/// Das Zeitfenster IMMER mit Uhrzeit (grosse Anzeige vor dem Start). Ein Ende um Mitternacht steht als „24:00"
/// am Vortag — wie `eventZeitraumGenau` im Web.
func eventZeitraumGenau(_ start: String, _ ende: String, _ zeitzone: String?, _ lang: String) -> (String, String) {
    guard let a = teamDatum(start), let b = teamDatum(ende) else { return (start, ende) }
    let f = eventFormat(ZEIT_VORLAGE, zeitzone, lang)
    if eventMitternacht(b, zeitzone) {
        let tag = eventFormat(TAG_VORLAGE, zeitzone, lang).string(from: b.addingTimeInterval(-12 * 3600))
        return (f.string(from: a), tag + ", 24:00")
    }
    return (f.string(from: a), f.string(from: b))
}

/// Ein Zeitpunkt (Upload-Frist) mittel/kurz in der Event-Zeitzone.
func eventZeit(_ iso: String, _ zeitzone: String?, _ lang: String) -> String {
    guard let d = teamDatum(iso) else { return iso }
    let f = DateFormatter()
    f.locale = teamLocale(lang)
    if let z = zeitzone, let tz = TimeZone(identifier: z) { f.timeZone = tz }
    f.dateStyle = .medium
    f.timeStyle = .short
    return f.string(from: d)
}

/// Kurzes Datum (Logbuch, Bestenlisten-Zeilen).
func teamKurzdatum(_ iso: String?, _ lang: String) -> String {
    guard let d = teamDatum(iso) else { return "" }
    let f = DateFormatter()
    f.locale = teamLocale(lang)
    f.dateStyle = .short
    f.timeStyle = .none
    return f.string(from: d)
}

/// Countdown in einer Zeile: „5 T. 12:03:45" (Tage kurz ueber die Plattform-Formatierung, wie Intl narrow im Web).
func teamCountdown(_ ziel: String, jetzt: Date, _ lang: String) -> String {
    let zielDatum: Date = teamDatum(ziel) ?? jetzt
    let rest: Int = max(0, Int(zielDatum.timeIntervalSince(jetzt)))
    let tage: Int = rest / 86400
    let uhr: String = String(format: "%02d:%02d:%02d", (rest / 3600) % 24, (rest / 60) % 60, rest % 60)
    guard tage > 0 else { return uhr }
    var kal = Calendar(identifier: .gregorian)
    kal.locale = teamLocale(lang)
    let f = DateComponentsFormatter()
    f.calendar = kal
    f.allowedUnits = [.day]
    f.unitsStyle = .abbreviated
    let tageText: String = f.string(from: DateComponents(day: tage)) ?? "\(tage)d"
    return tageText + " " + uhr
}

/// Kalenderblock der Kachel globaler Events (web eventTage, 06.11.2026): Monat, Tage („7–8"), Wochentage („Sa–So") in
/// der Zeitzone des Events. Ein Ende um Mitternacht gehoert zum Vortag; ueber einen Monatswechsel stehen beide Monate da.
struct EventTage {
    let monat: String
    let tage: String
    let wochentage: String
}

private func ohnePunkt(_ s: String) -> String {
    s.hasSuffix(".") ? String(s.dropLast()) : s
}

func eventTage(_ start: String, _ ende: String, _ zeitzone: String?, _ lang: String) -> EventTage {
    guard let a = teamDatum(start), let b0 = teamDatum(ende) else { return EventTage(monat: "", tage: "", wochentage: "") }
    let b: Date = eventMitternacht(b0, zeitzone) ? b0.addingTimeInterval(-12 * 3600) : b0
    let fm = eventFormat("MMM", zeitzone, lang)
    let ft = eventFormat("d", zeitzone, lang)
    let fw = eventFormat("EEE", zeitzone, lang)
    let ma: String = ohnePunkt(fm.string(from: a)), mb: String = ohnePunkt(fm.string(from: b))
    let ta: String = ohnePunkt(ft.string(from: a)), tb: String = ohnePunkt(ft.string(from: b))
    let wa: String = fw.string(from: a), wb: String = fw.string(from: b)
    let gleicherTag: Bool = ma == mb && ta == tb
    let monat: String = ma == mb ? ma : ma + " – " + mb
    let tage: String = gleicherTag ? ta : ta + "–" + tb
    let wochentage: String = gleicherTag ? wa : wa + "–" + wb
    return EventTage(monat: monat, tage: tage, wochentage: wochentage)
}

/// Stand einer Event-Bestenliste mit Datum („Stand 6. Nov., 14:32"; web standFuer, 06.11.2026) — im geteilten Bild muss
/// man sehen, von welchem Tag er ist. Beendet: „Endstand"; vor dem Start nichts.
func eventStandText(_ e: TeamEvent, _ tf: TeamTafel?, _ lang: String) -> String? {
    guard let tf else { return nil }
    if e.status == "beendet" { return Loc.t("team.event.endstand", lang) }
    guard e.status == "laeuft" || e.status == "auswertung", let iso = tf.stand, let d = standDatum(iso) else { return nil }
    let f = DateFormatter()
    f.locale = teamLocale(lang)
    f.setLocalizedDateFormatFromTemplate("dMMMHHmm")
    return teamText("team.event.standUm", lang, ["zeit": f.string(from: d)])
}

/// Der Server schreibt `stand` mit Mikrosekunden (Python isoformat); faellt der Formatierer darueber, ohne Bruchteile.
private func standDatum(_ iso: String) -> Date? {
    if let d = teamDatum(iso) { return d }
    guard let punkt = iso.firstIndex(of: ".") else { return nil }
    var rest = iso[iso.index(after: punkt)...]
    while let c = rest.first, c.isNumber { rest = rest.dropFirst() }
    return teamDatum(String(iso[..<punkt]) + String(rest))
}

/// Wie die Ergebnisse heissen: vorher Details, waehrenddessen aktueller Stand, danach Ergebnis.
func eventStandKey(_ status: String) -> String {
    switch status {
    case "kommend": return "team.event.details"
    case "beendet": return "team.event.ergebnis"
    default: return "team.event.stand"
    }
}

/// Erste Zeile der Beschreibung (die Leitung steuert mit dem ersten Umbruch, was in der Kachel steht).
func eventErsteZeile(_ beschreibung: String?) -> String? {
    let t: String = (beschreibung ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    guard !t.isEmpty else { return nil }
    return t.components(separatedBy: "\n").first
}

// MARK: - Abzeichen

/// Status-Abzeichen. Laufend: Teamfarbe, Deckkraft sanft 1 -> 0,7 (2 s), bei „Bewegung reduzieren" still.
struct TeamEventStatusChip: View {
    let status: String
    let farbe: String?
    let lang: String
    /// Anderer Text als der Status (Event-Hinweis auf Home: „Globales Event laeuft", 06.11.2026).
    var textKey: String? = nil
    /// Fett nur am Status-Abzeichen; der Home-Hinweis will es nicht fett (web be01239d).
    var fett: Bool = true
    /// Hoechstbreite: dann bricht der Text um statt die Zeile zu sprengen (Home-Hinweis auf dem Handy, Jan 06.11.2026).
    var maxBreite: CGFloat? = nil
    @Environment(\.accessibilityReduceMotion) private var bewegungAus
    @State private var puls = false

    private var laeuft: Bool { status == "laeuft" }
    private var text: String { Loc.t(textKey ?? ("team.event.status." + status), lang) }
    private var gewicht: Font.Weight { laeuft && fett ? .bold : .semibold }
    private var tf: TeamFarbe { TeamFarbe(farbe) }
    private var vorne: Color { laeuft ? tf.aufFlaeche : Color.secondary }
    private var hinten: Color { laeuft ? tf.flaeche : Color.secondary.opacity(0.15) }
    private var deckkraft: Double { laeuft && puls && !bewegungAus ? 0.7 : 1 }
    private var pulsAnimation: Animation? {
        guard laeuft && !bewegungAus else { return nil }
        return Animation.easeInOut(duration: 1).repeatForever(autoreverses: true)
    }

    var body: some View {
        Text(text)
            .font(.caption2.weight(gewicht))
            .lineLimit(maxBreite == nil ? 1 : 2)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: maxBreite)
            .foregroundStyle(vorne)
            .padding(.horizontal, 8).padding(.vertical, 2)
            .background(hinten, in: RoundedRectangle(cornerRadius: 10))
            .opacity(deckkraft)
            .animation(pulsAnimation, value: puls)
            .onAppear { if laeuft && !bewegungAus { puls = true } }
    }
}

/// Abzeichen „Global" (globale Events, 06.11.2026) in Pumpfoil-Cyan — hell dunkles, dunkel helles Cyan.
struct EventGlobalChip: View {
    let lang: String
    private var marke: TeamFarbe { TeamFarbe(nil) }

    var body: some View {
        Text(Loc.t("team.event.global", lang))
            .font(.caption2.weight(.semibold))
            .lineLimit(1)
            .foregroundStyle(marke.akzent)
            .padding(.horizontal, 8).padding(.vertical, 2)
            .background(marke.flaeche.opacity(0.15), in: Capsule())
    }
}

/// Abzeichen am Reiter „Teams & Events" bzw. Home › Team (web EventAbzeichen, 06.11.2026): LIVE (Status „laeuft",
/// gross geschrieben), solange ein Event laeuft, sonst die Zahl der kommenden; sonst nichts.
struct EventReiterAbzeichen: View {
    let live: Bool
    let bald: Int
    let lang: String

    var body: some View {
        if live {
            TeamEventStatusChip(status: "laeuft", farbe: nil, lang: lang).textCase(.uppercase)
        } else if bald > 0 {
            Text(String(bald)).font(.caption2.weight(.semibold)).monospacedDigit()
                .foregroundStyle(TeamFarbe(nil).akzent)
                .padding(.horizontal, 7).padding(.vertical, 2)
                .background(Color.secondary.opacity(0.15), in: Capsule())
        }
    }
}

/// Spot-Abzeichen (grau, mit Ortsmarke) — wie die Spot-Chips der Session-Kacheln.
func teamSpotChip(_ name: String) -> some View {
    Label(name, systemImage: "mappin.and.ellipse")
        .font(.caption2)
        .labelStyle(.titleAndIcon)
        .lineLimit(1)
        .foregroundStyle(Color.secondary)
        .padding(.horizontal, 6).padding(.vertical, 2)
        .background(Color.secondary.opacity(0.15), in: Capsule())
}

// MARK: - Kachel

/// Was eine Kachel braucht — aus einem vollen Event (Teamseite) oder der Kurzform (Listen).
struct EventKachelDaten {
    let id: Int
    let slug: String
    let titel: String
    let beschreibung: String?
    let start: String
    let ende: String
    let zeitzone: String?
    let status: String
    let sportarten: [String]
    let spots: [TeamSpotKurz]
    let farbe: String?
    /// Nur in Listen ueber mehrere Teams: Wappen vor dem Titel und Teamname vor dem Zeitraum.
    var team: TeamEventTeam? = nil
    /// Globales Event (06.11.2026): eigene Karte mit Kalenderblock, ohne Teamname.
    var global: Bool = false
    /// Bild unten in der Kachel (web EventKurzKachel `KachelBild`, 10.11.2026): Eventbild, sonst Teambild — der Server
    /// waehlt; auf der Teamseite nur das Eventbild.
    var banner_url: String? = nil
    var banner_fokus: String? = nil

    init(_ e: TeamEvent, slug: String, farbe: String?) {
        id = e.id; self.slug = slug; titel = e.titel; beschreibung = e.beschreibung
        start = e.start; ende = e.ende; zeitzone = e.zeitzone; status = e.status
        sportarten = e.sportarten; spots = e.spots; self.farbe = farbe; global = e.istGlobal
        // Teamseite: nur das Eventbild — das Teambild steht dort schon oben (web pages/Team.tsx, 10.11.2026).
        banner_url = e.banner_url; banner_fokus = e.banner_fokus
    }

    init(_ e: TeamEventKurz) {
        id = e.id; slug = e.team.slug; titel = e.titel; beschreibung = e.beschreibung
        start = e.start; ende = e.ende; zeitzone = e.zeitzone; status = e.status
        sportarten = e.sportarten; spots = e.spots; farbe = e.team.farbe; team = e.team; global = e.global == true
        banner_url = e.banner_url; banner_fokus = e.banner_fokus
    }
}

/// EINE Event-Kachel fuer alle Stellen (Jan 10.11.2026: „nimm doch die gleiche wie ueberall"; web EventKurzKachel):
/// die Kalenderkarte, fuer Team-Events in Teamfarbe.
struct TeamEventKachel: View {
    let d: EventKachelDaten
    let lang: String

    var body: some View { EventKalenderKachel(d: d, lang: lang) }
}

// MARK: - Kachel globaler Events

/// Kalenderkarte (web EventKurzKachel, Jan 06.11.2026: „der zeitraum sollte groesser dargestellt werden, irgendwie ist
/// alles wichtig"; seit 10.11.2026 fuer alle Events): Kalenderblock links (Monat, Tage, Wochentage), rechts Abzeichen,
/// Titel gross, Countdown und zwei Zeilen Beschreibung. Globale Events: „Global" in Pumpfoil-Cyan. Team-Events: Teamfarbe,
/// in Listen ueber mehrere Teams dazu Wappen und Teamname.
struct EventKalenderKachel: View {
    let d: EventKachelDaten
    let lang: String

    private var marke: TeamFarbe { TeamFarbe(d.global ? nil : d.farbe) }
    private var laeuft: Bool { d.status == "laeuft" }
    private var mitUhr: Bool { d.status == "kommend" || d.status == "laeuft" }
    private var tage: EventTage { eventTage(d.start, d.ende, d.zeitzone, lang) }
    private var uhrZiel: String { d.status == "kommend" ? d.start : d.ende }
    private var uhrVorsatz: String { Loc.t(d.status == "kommend" ? "team.event.startIn" : "team.event.endetIn", lang) }
    private var randFarbe: Color {
        if laeuft { return marke.akzent }
        return d.global ? marke.akzent.opacity(0.4) : Color.clear
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: 14) {
                kalender
                rechts
            }
            EventKachelBild(d: d)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(randFarbe, lineWidth: 2))
        .contentShape(RoundedRectangle(cornerRadius: 16))
    }

    private var kalender: some View {
        let t: EventTage = tage
        return VStack(spacing: 2) {
            Text(t.monat.uppercased()).font(.caption.weight(.bold)).foregroundStyle(marke.akzent)
                .lineLimit(1).minimumScaleFactor(0.7)
            Text(t.tage).font(.title.weight(.heavy)).foregroundStyle(.primary)
                .lineLimit(1).minimumScaleFactor(0.5)
            Text(t.wochentage).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                .lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(width: 80)
        .padding(.vertical, 8)
        .background(marke.flaeche.opacity(0.15), in: RoundedRectangle(cornerRadius: 12))
    }

    private var rechts: some View {
        VStack(alignment: .leading, spacing: 4) {
            abzeichen
            Text(d.titel).font(.title3.weight(.bold)).foregroundStyle(marke.akzent)
                .fixedSize(horizontal: false, vertical: true)
            if mitUhr { uhrZeile }
            if let z = eventErsteZeile(d.beschreibung) {
                Text(z).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var abzeichen: some View {
        FoilerFliessReihe(abstand: 6) {
            TeamEventStatusChip(status: d.status, farbe: d.global ? nil : d.farbe, lang: lang)
            if d.global {
                EventGlobalChip(lang: lang)
            } else if let t = d.team {
                HStack(spacing: 4) {
                    TeamWappen(name: t.name, logo: t.logo_url, farbe: t.farbe, size: 16)
                    Text(t.name).font(.caption2.weight(.semibold)).foregroundStyle(.secondary).lineLimit(1)
                }
                .padding(.leading, 2).padding(.trailing, 8).padding(.vertical, 2)
                .background(Color.secondary.opacity(0.15), in: Capsule())
            }
            ForEach(d.sportarten, id: \.self) { sp in sportClassPill(Loc.t("cls.sport." + sp, lang)) }
            ForEach(d.spots) { sp in teamSpotChip(sp.anzeige) }
        }
    }

    private var uhrZeile: some View {
        TimelineView(.periodic(from: Date(), by: 1)) { ctx in
            Text(uhrText(ctx.date)).font(.subheadline.weight(.bold)).monospacedDigit().foregroundStyle(marke.akzent)
        }
    }

    private func uhrText(_ jetzt: Date) -> String {
        uhrVorsatz + " " + teamCountdown(uhrZiel, jetzt: jetzt, lang)
    }
}

/// Bild unten in der Kachel, volle Breite, 5:2 mit Fokuspunkt wie auf der Eventseite (web EventKurzKachel `KachelBild`).
struct EventKachelBild: View {
    let d: EventKachelDaten

    var body: some View {
        if let u = Api.mediaURL(d.banner_url) {
            TeamBanner(url: u, fokus: d.banner_fokus, ecke: 12).padding(.top, 6)
        }
    }
}
