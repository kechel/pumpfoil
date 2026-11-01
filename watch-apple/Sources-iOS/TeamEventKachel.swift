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
    @Environment(\.accessibilityReduceMotion) private var bewegungAus
    @State private var puls = false

    private var laeuft: Bool { status == "laeuft" }
    private var text: String { Loc.t("team.event.status." + status, lang) }
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
            .font(.caption2.weight(laeuft ? .bold : .semibold))
            .lineLimit(1)
            .foregroundStyle(vorne)
            .padding(.horizontal, 8).padding(.vertical, 2)
            .background(hinten, in: Capsule())
            .opacity(deckkraft)
            .animation(pulsAnimation, value: puls)
            .onAppear { if laeuft && !bewegungAus { puls = true } }
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

    init(_ e: TeamEvent, slug: String, farbe: String?) {
        id = e.id; self.slug = slug; titel = e.titel; beschreibung = e.beschreibung
        start = e.start; ende = e.ende; zeitzone = e.zeitzone; status = e.status
        sportarten = e.sportarten; spots = e.spots; self.farbe = farbe
    }

    init(_ e: TeamEventKurz) {
        id = e.id; slug = e.team.slug; titel = e.titel; beschreibung = e.beschreibung
        start = e.start; ende = e.ende; zeitzone = e.zeitzone; status = e.status
        sportarten = e.sportarten; spots = e.spots; farbe = e.team.farbe; team = e.team
    }
}

struct TeamEventKachel: View {
    let d: EventKachelDaten
    let lang: String

    private var tf: TeamFarbe { TeamFarbe(d.farbe) }
    private var laeuft: Bool { d.status == "laeuft" }
    private var mitUhr: Bool { d.status == "kommend" || d.status == "laeuft" }
    private var zeitraum: String { eventZeitraum(d.start, d.ende, d.zeitzone, lang) }
    private var linkText: String { Loc.t(eventStandKey(d.status), lang) + " →" }
    private var uhrZiel: String { d.status == "kommend" ? d.start : d.ende }
    private var uhrVorsatz: String { Loc.t(d.status == "kommend" ? "team.event.startIn" : "team.event.endetIn", lang) }
    private var vorZeitraum: String {
        guard let t = d.team else { return zeitraum }
        return t.name + " · " + zeitraum
    }
    private var randFarbe: Color { laeuft ? tf.akzent : Color.clear }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            kopf
            HStack(alignment: .lastTextBaseline, spacing: 8) {
                unten
                Spacer(minLength: 4)
                Text(linkText).font(.subheadline.weight(.semibold)).foregroundStyle(tf.akzent).lineLimit(1)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(randFarbe, lineWidth: 2))
        .contentShape(RoundedRectangle(cornerRadius: 16))
    }

    private var kopf: some View {
        FoilerFliessReihe(abstand: 6) {
            if let t = d.team { TeamWappen(name: t.name, logo: t.logo_url, farbe: t.farbe, size: 20) }
            Text(d.titel).font(.headline).foregroundStyle(tf.akzent)
            TeamEventStatusChip(status: d.status, farbe: d.farbe, lang: lang)
            ForEach(d.sportarten, id: \.self) { sp in sportClassPill(Loc.t("cls.sport." + sp, lang)) }
            ForEach(d.spots) { sp in teamSpotChip(sp.anzeige) }
        }
    }

    private var unten: some View {
        VStack(alignment: .leading, spacing: 2) {
            zeitZeileMitUhr
            if let z = eventErsteZeile(d.beschreibung) {
                Text(z).font(.subheadline.weight(.semibold)).lineLimit(2)
            }
        }
    }

    @ViewBuilder private var zeitZeileMitUhr: some View {
        if mitUhr {
            TimelineView(.periodic(from: Date(), by: 1)) { ctx in
                zeitZeile(ctx.date).font(.caption).foregroundColor(.secondary)
            }
        } else {
            Text(vorZeitraum).font(.caption).foregroundStyle(.secondary)
        }
    }

    /// „Team · Zeitraum · Startet in 5 T. 12:03:45" — der Countdown in Teamfarbe und fett.
    private func zeitZeile(_ jetzt: Date) -> Text {
        let uhr: String = uhrVorsatz + " " + teamCountdown(uhrZiel, jetzt: jetzt, lang)
        let vorn: Text = Text(vorZeitraum + " · ")
        let hinten: Text = Text(uhr).bold().monospacedDigit().foregroundColor(tf.akzent)
        return vorn + hinten
    }
}
