import SwiftUI
import MapKit

// „Heatmap & Routen" auf der Spot-Seite — nach web/src/components/SpotHeatmap.tsx (Jan, 16.10.2026),
// wie SpotHeatmapPanel.kt in der Android-App.
//
//  - Karte, eingepasst auf die gefahrenen Zellen des letzten Jahres um den Spot (keine Pins).
//  - Heatmap: „Auf dem Foil" / „Startpunkte" und 1 Jahr (Vorgabe) / 30 Tage / Aus; „Aus" nimmt nur
//    die Heatmap weg, die Karte bleibt. Beide Wahlen gelten fuer alle Spots weiter.
//  - Gemerkte Routen als Kaertchen unter der Karte (im Planungsmodus ganz unten ueber der Legende).
//  - „Route planen": die Planung (RoutenPlanung.swift) unter der Karte.
// Ohne Zellen am Spot bleibt das Panel ganz weg (wie im Web).

private let cyan = Color(red: 34 / 255, green: 211 / 255, blue: 238 / 255)
private let cyanUI = UIColor(red: 34 / 255, green: 211 / 255, blue: 238 / 255, alpha: 1)
private let gruenUI = UIColor(red: 74 / 255, green: 222 / 255, blue: 128 / 255, alpha: 1)
private let dunkel = Color(red: 15 / 255, green: 23 / 255, blue: 42 / 255)

/// Zustand des Panels in der umgebenden Ansicht (StateObject dort): eine Listenzeile kann beim
/// Scrollen neu gebaut werden — Planung, gewaehlte Route und Ergebnis bleiben hier.
@MainActor
final class SpotPanelZustand: ObservableObject {
    let spotId: Int
    let plan: RoutenPlanung
    @Published var planen = false
    @Published var gemerktWahl: String? = nil
    var linkErledigt = false
    init(spotId: Int) { self.spotId = spotId; plan = RoutenPlanung(spotId: spotId) }
}

/// Panel-Zustaende je Spot fuer Ansichten, die mehrere Spots zeigen koennen (SessionsView im
/// Spot-Modus): legt den Zustand erst beim ersten Zeigen an. Referenztyp in einem @State, damit das
/// Anlegen waehrend `body` keine Zustandsaenderung ausloest.
@MainActor
final class SpotPanelSpeicher {
    private var je: [Int: SpotPanelZustand] = [:]
    func zustand(_ spotId: Int) -> SpotPanelZustand {
        if let z = je[spotId] { return z }
        let z = SpotPanelZustand(spotId: spotId)
        je[spotId] = z
        return z
    }
}

@MainActor
struct SpotHeatmapPanel: View {
    @ObservedObject var z: SpotPanelZustand
    @ObservedObject var plan: RoutenPlanung
    let lat: Double
    let lon: Double
    let sport: String
    let lang: String
    var routeAusLink: Int? = nil

    @AppStorage("spot_heatmap") private var wahl = "365d"
    @AppStorage("spot_heatmap_art") private var art = "foil"
    @AppStorage(MapTiles.schluessel) private var ebene = MapTiles.karte
    @State private var leer = false
    @State private var bereit = false
    @State private var einpassen: (MKMapRect, Int)? = nil
    @State private var heat: HeatAntwort? = nil
    @State private var region: (MKCoordinateRegion, Double)? = nil
    @State private var heatAufgabe: Task<Void, Never>? = nil
    @State private var gemerkt: [GemerkteRoute] = []
    @State private var meineStarts: [[Double]] = []
    @State private var loeschen: GemerkteRoute? = nil

    init(z: SpotPanelZustand, lat: Double, lon: Double, sport: String, lang: String, routeAusLink: Int? = nil) {
        self._z = ObservedObject(wrappedValue: z); self._plan = ObservedObject(wrappedValue: z.plan)
        self.lat = lat; self.lon = lon; self.sport = sport; self.lang = lang
        self.routeAusLink = routeAusLink
    }

    var body: some View {
        Group {
            if !leer { inhalt }
        }
        .task(id: z.spotId) { await einpassenAufSpot() }
        .task(id: z.spotId) { await gemerktLaden() }
        .task(id: "\(z.spotId)-\(sport)") { meineStarts = (try? await Api.spotMeineStarts(z.spotId, sport: sport)) ?? [] }
        .task(id: "\(z.planen)-\(plan.minStarts)-\(plan.minFahrer)-\(plan.umkreis)-\(sport)") {
            if z.planen { await plan.ladePositionen(sport: sport) } else { plan.fremdeEntfernen() }
        }
        .onChange(of: plan.serverPos?.count ?? -1) { _ in umkreisEinpassen() }
        .onChange(of: "\(wahl)-\(art)-\(sport)") { _ in heatLaden() }
        .onChange(of: "\(plan.gewaehlt ?? "")|\(plan.gerechnetMit)|\(plan.einstellungsSchluessel)|\(plan.ueberlagert?.schluessel ?? "")") { _ in abweichung() }
        .onChange(of: "\(bereit)-\(gemerkt.count)") { _ in linkAufrufen() }
        .confirmationDialog(Loc.t("routes.deleteConfirm", lang), isPresented: Binding(get: { loeschen != nil }, set: { if !$0 { loeschen = nil } }),
                            titleVisibility: .visible) {
            Button(Loc.t("routes.delete", lang), role: .destructive) {
                if let g = loeschen, let id = g.eigeneId {
                    Task { @MainActor in try? await Api.spotRouteVergessen(z.spotId, id: id); plan.merkStatus = nil; await gemerktLaden() }
                }
                loeschen = nil
            }
        }
    }

    // MARK: Aufbau
    private var inhalt: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(Loc.t("spots.heatmapRoutes", lang)).font(.headline)
            knoepfe
            karte
            if !z.planen { leiste }
            if z.planen {
                PlanungsBereich(plan: plan, lat: lat, lon: lon, lang: lang, meineStarts: meineStarts, gemerkt: gemerkt,
                                onGemerkt: { Task { await gemerktLaden() } }, onLoeschen: { loeschen = $0 }, leiste: AnyView(leiste))
            }
        }
        .padding(.vertical, 4)
    }

    private var knoepfe: some View {
        FoilerFliessReihe(abstand: 6) {
            Pille(text: Loc.t("heat.chipFoil", lang), aktiv: art == "foil") { art = "foil" }
            Pille(text: Loc.t("heat.chipStart", lang), aktiv: art == "start") { art = "start" }
            Pille(text: Loc.t("heat.chip1y", lang), aktiv: wahl == "365d") { wahl = "365d" }
            Pille(text: Loc.t("heat.chip30d", lang), aktiv: wahl == "30d") { wahl = "30d" }
            Pille(text: Loc.t("heat.chipOff", lang), aktiv: wahl == "off") { wahl = "off" }
            // Routen planen: hervorgehoben (Jan)
            Pille(text: Loc.t("heat.chipRoute", lang), aktiv: z.planen, betont: true) { z.planen.toggle() }
        }
    }

    private var karte: some View {
        RoutenKarte(mapType: MapTiles.typ(ebene), heat: wahl == "off" ? nil : heat, inhalt: kartenInhalt, setzen: plan.setzen,
                    einpassen: einpassen,
                    onRegion: { r, b in region = (r, b); heatLaden() },
                    onPlatz: { i in plan.start = i },
                    onSetzen: { la, lo in plan.eigenenSetzen(la, lo) },
                    onZiehen: { i, la, lo in plan.eigenenVerschieben(i - plan.nServer, la, lo) })
            .frame(height: 280)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .mitKartenUmschalter()
            .schutzgebietSteuerung(lang: lang, legende: true)
            .overlay(alignment: .topTrailing) {
                if z.planen {
                    // „+" fuer eigene Punkte (nur in der Planung)
                    Button { plan.setzen.toggle() } label: {
                        Image(systemName: "mappin.and.ellipse").font(.body.weight(.semibold))
                            .foregroundStyle(plan.setzen ? dunkel : Color.primary)
                            .padding(8).background(plan.setzen ? AnyShapeStyle(cyan) : AnyShapeStyle(.thinMaterial))
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                    }
                    .buttonStyle(.plain).padding(8)
                    .accessibilityLabel(Loc.t("routes.addPoint", lang))
                }
            }
    }

    @ViewBuilder private var leiste: some View {
        if !gemerkt.isEmpty {
            FoilerFliessReihe(abstand: 6) {
                Text(Loc.t("routes.savedTitle", lang)).font(.caption).foregroundStyle(.secondary)
                ForEach(gemerkt) { r in
                    Pille(text: chipText(r), aktiv: z.gemerktWahl == r.schluessel, klein: true) { gemerktKlick(r) }
                }
            }
        }
    }

    private func chipText(_ r: GemerkteRoute) -> String {
        let k = r.kurz
        var s: String = r.eigeneId != nil ? "● " : ""
        s += Loc.t("routes.savedChip", lang).replacingOccurrences(of: "{n}", with: "\(k.starts)")
            .replacingOccurrences(of: "{max}", with: "\(k.maxM)").replacingOccurrences(of: "{total}", with: "\(r.meter)")
            .replacingOccurrences(of: "{datum}", with: r.datum(lang))
        if r.mitEigenen { s += " · " + Loc.t("routes.manualTag", lang) }
        return s
    }

    // MARK: Karte: Inhalt
    private var kartenInhalt: KartenInhalt {
        var i = KartenInhalt()
        if z.planen, let p = plan.pos {
            if plan.umkreis > 0 { i.umkreis = (CLLocationCoordinate2D(latitude: lat, longitude: lon), Double(plan.umkreis) * 1000) }
            let r: Route? = plan.gewaehlteRoute
            if let r { i.linie = r.punkte.map { CLLocationCoordinate2D(latitude: p[$0].lat, longitude: p[$0].lon) } }
            else if let u = plan.ueberlagert, !plan.veraltet { i.linie = u.punkte.map { CLLocationCoordinate2D(latitude: $0[0], longitude: $0[1]) } }
            for (k, q) in p.enumerated() {
                let raus: Bool = plan.aus.contains(k)
                let aktiv: Bool = !raus && (r?.punkte.contains(k) ?? true)
                let farbe: UIColor = !aktiv ? UIColor(red: 148 / 255, green: 163 / 255, blue: 184 / 255, alpha: 1)
                    : (plan.schonGestartet(meineStarts, q) ? gruenUI : cyanUI)
                i.plaetze.append(KartenPlatz(index: k, lat: q.lat, lon: q.lon, name: Routen.platzName(k), farbe: farbe,
                                             istStart: k == plan.start, eigen: q.eigen, raus: raus))
            }
        } else if !z.planen, let g = gemerkt.first(where: { $0.schluessel == z.gemerktWahl }) {
            let pts = g.punkte.map { CLLocationCoordinate2D(latitude: $0[0], longitude: $0[1]) }
            i.linie = pts
            for (k, c) in pts.enumerated() {
                if k > 0 && k == pts.count - 1 && Routen.abstandM(c.latitude, c.longitude, pts[0].latitude, pts[0].longitude) < 1 { continue }
                let mein: Bool = meineStarts.contains { $0.count == 2 && Routen.abstandM($0[0], $0[1], c.latitude, c.longitude) < RoutenPlanung.meinM }
                i.routenPunkte.append((c, k == 0 ? .white : (mein ? gruenUI : cyanUI), k == 0))
            }
        }
        return i
    }

    // MARK: Ablaeufe
    private func einpassenAufSpot() async {
        let u: Double = 0.02
        guard let r = try? await Api.heatmap(period: "365d", z: 15, w: lon - u * 1.5, s: lat - u, e: lon + u * 1.5, n: lat + u),
              let zz = r.z, !r.cells.isEmpty else { leer = true; return }
        let welt: Double = MKMapRect.world.size.width
        let zelle: Double = welt / pow(2.0, Double(zz))
        let xs = r.cells.map { $0[0] }, ys = r.cells.map { $0[1] }
        let rect = MKMapRect(x: Double(xs.min() ?? 0) * zelle, y: Double(ys.min() ?? 0) * zelle,
                             width: Double((xs.max() ?? 0) - (xs.min() ?? 0) + 1) * zelle,
                             height: Double((ys.max() ?? 0) - (ys.min() ?? 0) + 1) * zelle)
        einpassen = (rect, 1)
        bereit = true
    }

    private func heatLaden() {
        heatAufgabe?.cancel()
        guard wahl != "off", let reg = region else { return }
        let (r, breite) = reg
        let w = wahl, a = art, sp = sport
        heatAufgabe = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 250_000_000)
            if Task.isCancelled { return }
            let zoom: Int = kartenZoom(r, breite: breite)
            let ww = r.center.longitude - r.span.longitudeDelta / 2, ee = r.center.longitude + r.span.longitudeDelta / 2
            let ss = r.center.latitude - r.span.latitudeDelta / 2, nn = r.center.latitude + r.span.latitudeDelta / 2
            if let h = try? await Api.heatmap(period: w, z: zoom, w: ww, s: ss, e: ee, n: nn, art: a, sport: sp), !Task.isCancelled {
                heat = h
            }
        }
    }

    private func umkreisEinpassen() {
        guard plan.einpassen, let p = plan.pos, !p.isEmpty else { return }
        plan.einpassen = false
        var rect = MKMapRect.null
        for q in p { let m = MKMapPoint(CLLocationCoordinate2D(latitude: q.lat, longitude: q.lon)); rect = rect.union(MKMapRect(x: m.x, y: m.y, width: 1, height: 1)) }
        einpassen = (rect.insetBy(dx: -rect.size.width * 0.1, dy: -rect.size.height * 0.1), (einpassen?.1 ?? 1) + 1)
    }

    private func gemerktLaden() async { gemerkt = (try? await Api.spotRouten(z.spotId)) ?? [] }

    private func gemerktKlick(_ r: GemerkteRoute) {
        if z.planen && z.gemerktWahl == r.schluessel { z.gemerktWahl = nil; z.planen = false; return }
        z.gemerktWahl = r.schluessel
        let warOffen: Bool = z.planen
        z.planen = true
        if warOffen || plan.serverPos != nil {
            if plan.aufrufen(r) { Task { await plan.rechnen() } }
        } else {
            _ = plan.aufrufen(r)     // die Startplaetze laedt das Oeffnen und rechnet dann mit `wieder`
        }
    }

    /// Weicht die Planung von der aufgerufenen gemerkten Route ab, ist es nicht mehr sie.
    private func abweichung() {
        guard z.planen, plan.wieder == nil, let g = gemerkt.first(where: { $0.schluessel == z.gemerktWahl }) else { return }
        if !plan.istNoch(g) { z.gemerktWahl = nil }
    }

    /// Aus der Community-Liste verlinkt: die Route einmal aufrufen wie per Klick.
    private func linkAufrufen() {
        guard let id = routeAusLink, !z.linkErledigt, bereit, !gemerkt.isEmpty else { return }
        z.linkErledigt = true
        if let r = gemerkt.first(where: { $0.id == id }) { gemerktKlick(r) }
    }
}

// MARK: - Planung unter der Karte

@MainActor
private struct PlanungsBereich: View {
    @ObservedObject var plan: RoutenPlanung
    let lat: Double
    let lon: Double
    let lang: String
    let meineStarts: [[Double]]
    let gemerkt: [GemerkteRoute]
    let onGemerkt: () -> Void
    let onLoeschen: (GemerkteRoute) -> Void
    let leiste: AnyView

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            anforderungen
            if plan.setzen { setzHinweis }
            if let pos = plan.pos {
                konfiguration(pos)
                ergebnisTeil(pos)
                leiste
                legende(pos)
            } else {
                Text("…").foregroundStyle(.secondary)
                leiste
            }
        }
    }

    private var anforderungen: some View {
        Kasten(titel: Loc.t("routes.startReq", lang)) {
            FoilerFliessReihe(abstand: 6) {
                Klein(Loc.t("routes.reliability", lang))
                ForEach(RoutenPlanung.zuverlaessig, id: \.self) { n in Pille(text: "≥ \(n)×", aktiv: plan.minStarts == n, klein: true) { plan.minStarts = n } }
            }
            FoilerFliessReihe(abstand: 6) {
                Klein(Loc.t("routes.riders", lang))
                ForEach(RoutenPlanung.fahrerStufen, id: \.self) { n in Pille(text: "≥ \(n)", aktiv: plan.minFahrer == n, klein: true) { plan.minFahrer = n } }
            }
            FoilerFliessReihe(abstand: 6) {
                Klein(Loc.t("routes.radius", lang))
                ForEach(RoutenPlanung.umkreisStufen, id: \.self) { km in Pille(text: "\(km) km", aktiv: plan.umkreis == km, klein: true) { plan.umkreisSetzen(km) } }
            }
        }
    }

    private var setzHinweis: some View {
        let voll: Bool = plan.eigene.count >= RoutenPlanung.eigeneMax
        let text: String = voll ? Loc.t("routes.addPointLimit", lang).replacingOccurrences(of: "{n}", with: "\(RoutenPlanung.eigeneMax)")
            : Loc.t("routes.addPointHint", lang)
        return Text(text).font(.subheadline).padding(8).frame(maxWidth: .infinity, alignment: .leading)
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(cyan, lineWidth: 1))
    }

    private func konfiguration(_ pos: [Startposition]) -> some View {
        Kasten(titel: Loc.t("routes.config", lang)) {
            FoilerFliessReihe(abstand: 6) {
                Klein(Loc.t("routes.startPoints", lang))
                ForEach(Array(pos.enumerated()), id: \.offset) { i, p in
                    StartplatzPille(plan: plan, i: i, p: p, lage: lage(p), mein: plan.schonGestartet(meineStarts, p))
                    if i == plan.start && !plan.richtungsWahl.isEmpty { richtungen }
                }
            }
            if !plan.rundkurs {
                FoilerFliessReihe(abstand: 6) {
                    Klein(Loc.t("routes.target", lang))
                    Pille(text: Loc.t("routes.anyDirection", lang), aktiv: plan.zielAktiv == nil, klein: true) { plan.zielPlatz = nil }
                    ForEach(pos.indices.filter { $0 != plan.start && !plan.aus.contains($0) }, id: \.self) { i in
                        Pille(text: Routen.platzName(i), aktiv: plan.zielAktiv == i, klein: true) { plan.zielPlatz = i }
                    }
                }
            }
            Regler(label: Loc.t("routes.minDist", lang), wert: plan.minM, von: 0, bis: 1000, schritt: 10, einheit: " m") { plan.minM = Swift.min($0, plan.maxM) }
            Regler(label: Loc.t("routes.maxDist", lang), wert: plan.maxM, von: 50, bis: plan.umkreis > 0 ? 10000 : 2000,
                   schritt: plan.umkreis > 0 ? 50 : 10, einheit: " m") { plan.maxM = Swift.max($0, plan.minM) }
            if pos.count >= 2 {
                Regler(label: Loc.t("routes.count", lang), wert: Swift.min(plan.anzahl, pos.count), von: 2, bis: pos.count, schritt: 1, einheit: "") { plan.anzahl = $0 }
            }
            HStack(spacing: 16) {
                Toggle(Loc.t("routes.noCrossing", lang), isOn: $plan.ohneKreuzung).toggleStyle(HakenStil())
                Toggle(Loc.t("routes.roundtrip", lang), isOn: $plan.rundkurs).toggleStyle(HakenStil())
            }
        }
    }

    @ViewBuilder private var richtungen: some View {
        Klein(Loc.t("routes.direction", lang))
        Pille(text: Loc.t("routes.anyDirection", lang), aktiv: plan.richtung == nil, klein: true) { richtungWaehlen(nil) }
        ForEach(plan.richtungsWahl, id: \.self) { r in
            Pille(text: Routen.platzName(r), aktiv: plan.richtung == r, klein: true) { richtungWaehlen(r) }
        }
    }

    private func richtungWaehlen(_ r: Int?) {
        plan.richtung = r
        plan.gewaehlt = plan.liste(r).first?.schluessel
    }

    private func lage(_ p: Startposition) -> String {
        let r: [String] = Loc.t("map.compass", lang).split(separator: ",").map(String.init)
        return Routen.lageText(p.lat, p.lon, lat, lon, richtungen: r.count == 8 ? r : ["N", "NE", "E", "SE", "S", "SW", "W", "NW"], sprache: lang)
    }

    @ViewBuilder private func ergebnisTeil(_ pos: [Startposition]) -> some View {
        if plan.veraltet {
            Button {
                plan.ueberlagert = nil
                plan.fremdeEntfernen()
                Task { await plan.rechnen() }
            } label: {
                Text(Loc.t("routes.compute", lang)).fontWeight(.semibold).foregroundStyle(dunkel)
                    .padding(.horizontal, 16).padding(.vertical, 9).background(cyan).clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .buttonStyle(.plain)
        } else {
            if let u = plan.ueberlagert {
                VStack(alignment: .leading, spacing: 6) {
                    Text(Loc.t("routes.changed", lang)).font(.subheadline)
                    AbschnittChips(pts: u.punkte.map { ($0[0], $0[1]) },
                                   namen: u.punkte.map { k in let i = plan.naechster(pos, k[0], k[1]); return i >= 0 ? Routen.platzName(i) : "·" })
                }
                .padding(8).overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.secondary.opacity(0.4)))
            }
            if plan.routen.isEmpty {
                if let e = plan.ergebnis { Hinweis(text: warumText(e, pos.count)) }
            } else {
                RoutenTabelle(plan: plan, pos: pos, lang: lang, gemerkt: gemerkt, onGemerkt: onGemerkt, onLoeschen: onLoeschen)
            }
            if plan.ergebnis?.gekuerzt == true {
                Text(Loc.t("routes.cut", lang)).font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private func warumText(_ e: RoutenErgebnis, _ n: Int) -> String {
        if let r = plan.richtung, !e.routen.isEmpty {
            return Loc.t("routes.whyDirection", lang).replacingOccurrences(of: "{name}", with: Routen.platzName(r))
        }
        switch plan.grund {
        case .nachbar(let m)?:
            if let m {
                return Loc.t("routes.whyNeighbour", lang).replacingOccurrences(of: "{m}", with: "\(m)")
                    .replacingOccurrences(of: "{min}", with: "\(plan.minM)").replacingOccurrences(of: "{max}", with: "\(plan.maxM)")
            }
            return Loc.t("routes.whyNoOther", lang)
        case .zuWenig(let v)?:
            return Loc.t("routes.whyTooFew", lang).replacingOccurrences(of: "{n}", with: "\(v)")
                .replacingOccurrences(of: "{soll}", with: "\(Swift.min(plan.anzahl, n))")
        case .rundkurs?: return Loc.t("routes.whyRoundtrip", lang)
        case .kreuzung?: return Loc.t("routes.whyCrossing", lang)
        case .punkte(let h)?: return Loc.t("routes.whyPoints", lang).replacingOccurrences(of: "{n}", with: "\(h)")
        case .ziel?: return Loc.t("routes.whyTarget", lang)
        default: return Loc.t("routes.none", lang).replacingOccurrences(of: "{n}", with: "\(n)")
        }
    }

    @ViewBuilder private func legende(_ pos: [Startposition]) -> some View {
        let gruen: Bool = pos.contains { plan.schonGestartet(meineStarts, $0) }
        if gruen || !plan.eigene.isEmpty {
            HStack(spacing: 14) {
                if gruen {
                    HStack(spacing: 6) { Circle().fill(Color(gruenUI)).frame(width: 12, height: 12); Text(Loc.t("routes.myStart", lang)).font(.subheadline).foregroundStyle(.secondary) }
                }
                if !plan.eigene.isEmpty {
                    HStack(spacing: 6) {
                        Circle().fill(cyan).frame(width: 12, height: 12).overlay(Circle().stroke(dunkel, style: StrokeStyle(lineWidth: 1.5, dash: [2, 2])))
                        Text(Loc.t("routes.ownPoint", lang)).font(.subheadline).foregroundStyle(.secondary)
                    }
                }
            }
        }
    }
}

@MainActor
private struct StartplatzPille: View {
    @ObservedObject var plan: RoutenPlanung
    let i: Int
    let p: Startposition
    let lage: String
    let mein: Bool

    var body: some View {
        let raus: Bool = plan.aus.contains(i)
        let istStart: Bool = plan.start == i
        let vorder: Color = istStart ? dunkel : Color.primary.opacity(raus ? 0.5 : 1)
        return HStack(spacing: 4) {
            // Haken = wird angefahren; abhaken schliesst aus. Der Start ist immer dabei.
            Button {
                if raus { plan.aus.remove(i) } else { plan.aus.insert(i) }
            } label: { Text(raus ? "○" : "✓").frame(width: 26, height: 26) }
                .buttonStyle(.plain).disabled(istStart)
            Button { if !raus { plan.start = i } } label: {
                HStack(spacing: 4) {
                    if mein { Circle().fill(Color(gruenUI)).frame(width: 9, height: 9) }
                    Text(Routen.platzName(i)).fontWeight(.bold).strikethrough(raus).underline(p.eigen && !raus)
                    if !lage.isEmpty { Text("· \(lage)") }
                }
            }
            .buttonStyle(.plain)
            if p.eigen {
                Button { plan.eigenenEntfernen(i - plan.nServer) } label: { Image(systemName: "xmark").font(.caption).frame(width: 24, height: 24) }
                    .buttonStyle(.plain)
            }
        }
        .font(.subheadline)
        .foregroundStyle(vorder)
        .padding(.trailing, 8).padding(.vertical, 2)
        .background(Capsule().fill(istStart ? cyan : Color(.secondarySystemBackground)))
        .overlay(Capsule().stroke(istStart ? cyan : Color.secondary.opacity(0.35)))
    }
}

@MainActor
private struct RoutenTabelle: View {
    @ObservedObject var plan: RoutenPlanung
    let pos: [Startposition]
    let lang: String
    let gemerkt: [GemerkteRoute]
    let onGemerkt: () -> Void
    let onLoeschen: (GemerkteRoute) -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 4) {
                kopf("#", .empf).frame(width: 26)
                Text(Loc.t("routes.colRoute", lang)).font(.caption2).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading)
                kopf(Loc.t("routes.colDistance", lang), .meter).frame(width: 62)
                kopf(Loc.t("routes.colLegs", lang), .legs).frame(width: 44)
                kopf(Loc.t("routes.colCrossings", lang), .kreuz).frame(width: 44)
                kopf(Loc.t("routes.colDuplicates", lang), .doppelt).frame(width: 44)
            }
            .padding(.horizontal, 6).padding(.vertical, 4)
            ScrollView {
                VStack(spacing: 0) {
                    ForEach(Array(plan.routen.enumerated()), id: \.element.schluessel) { idx, r in zeile(idx, r) }
                }
            }
            .frame(maxHeight: 300)
        }
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.secondary.opacity(0.3)))
    }

    private func kopf(_ text: String, _ sp: RoutenSpalte) -> some View {
        let an: Bool = plan.sortierung.0 == sp
        let pfeil: String = an ? (plan.sortierung.1 ? " ▼" : " ▲") : ""
        return Button { plan.sortierung = (sp, an ? !plan.sortierung.1 : false) } label: {
            Text(text + pfeil).font(.caption2).lineLimit(2).multilineTextAlignment(.center)
                .foregroundStyle(an ? Color.primary : Color.secondary)
        }
        .buttonStyle(.plain)
    }

    private func zeile(_ idx: Int, _ r: Route) -> some View {
        let an: Bool = plan.gewaehlt == r.schluessel
        return VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                Text("\(idx + 1)").font(.caption).foregroundStyle(.secondary).frame(width: 26)
                Text(r.punkte.map { Routen.platzName($0) }.joined(separator: " → ")).font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text("\(Int(r.meter.rounded())) m").font(.caption).frame(width: 62, alignment: .trailing)
                Text("\(r.punkte.count - 1)").font(.caption).frame(width: 44)
                Text("\(r.kreuzungen)").font(.caption).frame(width: 44)
                Text("\(r.doppelt)").font(.caption).frame(width: 44)
            }
            if an { details(r) }
        }
        .padding(.horizontal, 6).padding(.vertical, 6)
        .background(an ? cyan.opacity(0.12) : Color.clear)
        .contentShape(Rectangle())
        .onTapGesture { plan.gewaehlt = an ? nil : r.schluessel; plan.merkStatus = nil; plan.ueberlagert = nil }
    }

    private func details(_ r: Route) -> some View {
        let meine: GemerkteRoute? = gemerkt.first { g in g.eigeneId != nil && gleich(g, r.punkte.map { pos[$0] }) }
        return VStack(alignment: .leading, spacing: 6) {
            AbschnittChips(pts: r.punkte.map { (pos[$0].lat, pos[$0].lon) }, namen: r.punkte.map { Routen.platzName($0) })
            HStack(spacing: 12) {
                if meine != nil || plan.merkStatus == "ok" {
                    Text(Loc.t("routes.saved", lang)).font(.subheadline.weight(.semibold)).foregroundStyle(cyan)
                    // Loeschen nur hier, mit Rueckfrage (Jan) — nur der eigene Eintrag
                    if let m = meine { Button(Loc.t("routes.delete", lang)) { onLoeschen(m) }.font(.subheadline) }
                } else {
                    Pille(text: Loc.t("routes.save", lang), aktiv: false, betont: true, klein: true) {
                        if plan.merkStatus != "…" { Task { if await plan.merken(r) { onGemerkt() } } }
                    }
                }
            }
            if plan.merkStatus == "limit" { Text(Loc.t("routes.limit", lang)).font(.caption).foregroundStyle(.secondary) }
        }
        .padding(.leading, 30)
    }

    /// Gleiche Route (richtungsunabhaengig, ~11 m wie der Server-Schluessel)?
    private func gleich(_ g: GemerkteRoute, _ pts: [Startposition]) -> Bool {
        guard g.punkte.count == pts.count else { return false }
        func nah(_ rev: Bool) -> Bool {
            pts.indices.allSatisfy { k in
                let q = g.punkte[rev ? pts.count - 1 - k : k]
                return Routen.abstandM(q[0], q[1], pts[k].lat, pts[k].lon) < 12
            }
        }
        return nah(false) || nah(true)
    }
}

private struct AbschnittChips: View {
    let pts: [(Double, Double)]
    let namen: [String]
    var body: some View {
        let m: [Double] = pts.count < 2 ? [] : (1..<pts.count).map { Routen.abstandM(pts[$0 - 1].0, pts[$0 - 1].1, pts[$0].0, pts[$0].1) }
        let lo: Double = m.min() ?? 0, hi: Double = m.max() ?? 0
        return FoilerFliessReihe(abstand: 5) {
            ForEach(Array(m.enumerated()), id: \.offset) { k, meter in
                HStack(spacing: 5) {
                    Circle().fill(Color(rampeFarbe(hi > lo ? (meter - lo) / (hi - lo) : 0.5))).frame(width: 8, height: 8)
                    Text("\(k + 1) · \(namen[k])→\(namen[k + 1]) · \(Int(meter.rounded())) m").font(.caption)
                }
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Capsule().fill(Color(.secondarySystemBackground)))
            }
        }
    }
}

// MARK: - kleine Bausteine

struct Pille: View {
    let text: String
    let aktiv: Bool
    var betont: Bool = false
    var klein: Bool = false
    let aktion: () -> Void

    init(text: String, aktiv: Bool, betont: Bool = false, klein: Bool = false, aktion: @escaping () -> Void) {
        self.text = text; self.aktiv = aktiv; self.betont = betont; self.klein = klein; self.aktion = aktion
    }

    var body: some View {
        let hinter: Color = aktiv ? cyan : (betont ? cyan.opacity(0.15) : Color(.secondarySystemBackground))
        let rand: Color = (aktiv || betont) ? cyan : Color.secondary.opacity(0.35)
        return Button(action: aktion) {
            Text(text).font(klein ? .subheadline : .body).fontWeight((aktiv || betont) ? .semibold : .regular)
                .foregroundStyle(aktiv ? dunkel : Color.primary)
                .padding(.horizontal, klein ? 10 : 12).padding(.vertical, klein ? 5 : 6)
                .background(Capsule().fill(hinter))
                .overlay(Capsule().stroke(rand))
        }
        .buttonStyle(.plain)
    }
}

private struct Klein: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View { Text(text).font(.caption).foregroundStyle(.secondary).padding(.top, 6) }
}

private struct Kasten<Inhalt: View>: View {
    let titel: String
    @ViewBuilder let inhalt: () -> Inhalt
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(titel).font(.caption.weight(.medium))
            inhalt()
        }
        .padding(10).frame(maxWidth: .infinity, alignment: .leading)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.secondary.opacity(0.4)))
    }
}

private struct Regler: View {
    let label: String
    let wert: Int
    let von: Int
    let bis: Int
    let schritt: Int
    let einheit: String
    let setz: (Int) -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("\(label): \(wert)\(einheit)").font(.caption).foregroundStyle(.secondary)
            Slider(value: Binding(get: { Double(Swift.max(von, Swift.min(bis, wert))) },
                                  set: { v in setz(Swift.max(von, Swift.min(bis, Int(((v - Double(von)) / Double(schritt)).rounded()) * schritt + von))) }),
                   in: Double(von)...Double(Swift.max(bis, von + 1)))
                .tint(cyan)
        }
    }
}

private struct Hinweis: View {
    let text: String
    var body: some View {
        Text(text).font(.subheadline).padding(8).frame(maxWidth: .infinity, alignment: .leading)
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.secondary.opacity(0.4)))
    }
}

private struct HakenStil: ToggleStyle {
    func makeBody(configuration: Configuration) -> some View {
        Button { configuration.isOn.toggle() } label: {
            HStack(spacing: 6) {
                Image(systemName: configuration.isOn ? "checkmark.square.fill" : "square").foregroundStyle(cyan)
                configuration.label.font(.subheadline)
            }
        }
        .buttonStyle(.plain)
    }
}
