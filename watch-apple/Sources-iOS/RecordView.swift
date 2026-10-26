import SwiftUI
import MapKit

// „Record on Phone": das iPhone als Recorder. Gleiche Live-Werte wie die Uhr-Apps, aber
// ohne Einstellungs-Optionen (die stehen anderswo) — dafür die Session-Foil direkt wählbar.
// 2 Sekunden halten zum Stoppen (gegen versehentliches Beenden). Aufnahme läuft im Hintergrund
// (PhoneRecorder / Background-Location) weiter, auch mit Screen aus / in der Tasche.
struct RecordView: View {
    @Environment(\.dismiss) private var dismiss
    @AppStorage("appLang") private var lang = "de"
    @ObservedObject private var rec = PhoneRecorder.shared
    @State private var foils: [Foil] = []       // ganzer Katalog (für „anderes Foil")
    @State private var favFoils: [Foil] = []     // Favoriten (my_foils) — als Chips direkt wählbar
    @State private var foilId: Int?
    @State private var defaultLoaded = false
    @State private var holdProgress: CGFloat = 0

    private func foilLabel(_ id: Int?) -> String {
        guard let id, let f = foils.first(where: { $0.id == id }) else { return Loc.t("rec.foilNone", lang) }
        return "\(f.brand) \(f.model) \(f.size)".trimmingCharacters(in: .whitespaces)
    }
    private func shortLabel(_ f: Foil) -> String { "\(f.brand) \(f.model) \(f.size)".trimmingCharacters(in: .whitespaces) }
    // Chip-Titel ohne Marke (die steht klein darunter); leer -> doch die Marke.
    private func chipTitle(_ f: Foil) -> String {
        let t = "\(f.model) \(f.size)".trimmingCharacters(in: .whitespaces)
        return t.isEmpty ? f.brand : t
    }
    private func mmss(_ s: Int) -> String { String(format: "%d:%02d", s / 60, s % 60) }
    private func km(_ m: Double) -> String { m >= 1000 ? String(format: "%.2f km", m / 1000) : "\(Int(m)) m" }

    // Direkt antippbarer Foil-Chip (Favoriten + „Ohne Foil"); hervorgehoben, wenn ausgewählt.
    // Zwei Zeilen: oben Modell + Groesse (das, was die Foils UNTERSCHEIDET, darf umbrechen), darunter
    // klein die Marke. Vorher eine Zeile in drei Spalten — bei mehreren Foils derselben Marke blieb
    // nur „Code Foils R…" stehen (Feedback 06.10.2026, iOS).
    private func foilChip(_ id: Int?, _ title: String, _ brand: String? = nil) -> some View {
        let sel = foilId == id
        return Button { foilId = id } label: {
            VStack(spacing: 2) {
                Text(title).font(.subheadline.weight(.semibold)).lineLimit(2)
                    .multilineTextAlignment(.center)
                if let brand, !brand.isEmpty {
                    Text(brand).font(.caption).lineLimit(1).minimumScaleFactor(0.8).opacity(0.8)
                }
            }
                .frame(maxWidth: .infinity, minHeight: 44)
                .padding(.vertical, 8).padding(.horizontal, 8)
                .background(RoundedRectangle(cornerRadius: 10)
                    .fill(sel ? Color.accentColor : Color.secondary.opacity(0.15)))
                .foregroundStyle(sel ? Color.white : Color.primary)
        }.buttonStyle(.plain)
    }

    // Ein Abschnitt = eine eigene, explizit typisierte Property. Swifts Type-Checker loest einen
    // ViewBuilder als EINEN Ausdruck auf, und der Aufwand waechst ueberproportional mit Kindern
    // und Modifiern darin — idleBody war ~59 Zeilen. Reihenfolge, Layout und Texte sind
    // unveraendert; die Ladelogik der .task-Closure steckt jetzt in loadFoils().
    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                if rec.recording { recordingBody }
                else if rec.status == "saved" || rec.status == "saving" { savedBody }
                // Scrollbar (12.10.2026, Meldung Roman auf Android): mit vielen Foils oder auf kleinen
                // iPhones (SE, mini) laeuft der Inhalt sonst unter die Leiste und START ist weg.
                else { ScrollView { idleBody } }
            }
            .padding(20)
            .navigationTitle(Loc.t("rec.title", lang))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { doneToolbar }
            .task { await loadFoils() }
            // Idle-GPS für „GPS bereit" + Autostart, solange die Ansicht offen und nicht aufgenommen wird.
            .onAppear { rec.startIdleMonitor() }
            .onDisappear { rec.stopIdleMonitor() }
        }
    }

    @ToolbarContentBuilder private var doneToolbar: some ToolbarContent {
        if !rec.recording {
            ToolbarItem(placement: .cancellationAction) {
                Button(Loc.t("common.done", lang)) { dismiss() }
            }
        }
    }

    // Katalog + Favoriten + Default-Foil laden. Als Methode statt als .task-Closure: Ablauflogik
    // kostet den Type-Checker im ViewBuilder unnoetig viel.
    private func loadFoils() async {
        rec.refreshPending()
        await rec.drain()   // offen gebliebene Uploads gleich versuchen (falls jetzt Netz da)
        foils = (try? await Api.foils()) ?? []
        let s = (try? await Api.settings()) ?? [:]
        let favIds = (s["my_foils"] as? [Any])?.compactMap { ($0 as? NSNumber)?.intValue ?? ($0 as? Int) } ?? []
        favFoils = foils.filter { favIds.contains($0.id) }
        if !defaultLoaded {   // Default-Foil vorwählen (nur beim ersten Öffnen der Ansicht)
            let def = (s["foil_id"] as? NSNumber)?.intValue ?? (s["foil_id"] as? Int)
            foilId = rec.sessionFoilId ?? def
            defaultLoaded = true
        }
    }

    // MARK: - Startbildschirm

    private var idleBody: some View {
        VStack(spacing: 16) {
            Spacer().frame(height: 4)
            idleHeader
            gpsStatusBlock
            autoStartToggle
            foilPickerBlock
            startButton
            // Dieselbe Leiste wie ueberall sonst in der App (s. `PhoneUploadBar`) statt einer
            // kleinen grauen Textzeile ohne Zahlen — wie RecordScreen.kt. Noetig, weil dieser
            // Bildschirm als fullScreenCover UEBER der Leiste in RootView liegt und sie verdeckt.
            if rec.pendingCount > 0 || rec.uploading { PhoneUploadBar() }
            Spacer()
        }
    }

    // Seiten-Titel + fetter Hinweis ganz oben.
    private var idleHeader: some View {
        VStack(spacing: 4) {
            Text(Loc.t("rec.pageTitle", lang)).font(.title2).bold()
                .multilineTextAlignment(.center)
            Text(Loc.t("rec.waterproof", lang)).font(.callout).bold().foregroundStyle(.red)
        }
    }

    // Live-GPS-Status (wie Uhr) + Hinweis darunter.
    @ViewBuilder private var gpsStatusBlock: some View {
        Text(gpsStatusText)
            .font(.subheadline).bold()
            .foregroundStyle(gpsStatusColor)
        Text(Loc.t("rec.gpsHint", lang))
            .font(.callout).foregroundStyle(.secondary).multilineTextAlignment(.center)
    }

    private var gpsStatusText: String {
        rec.gpsReady ? Loc.t("rec.gpsReady", lang) : Loc.t("rec.gpsSearch", lang)
    }
    private var gpsStatusColor: Color {
        rec.gpsReady ? Color.accentColor : Color.secondary
    }

    // Autostart (wie Uhr): losfahren startet die Aufnahme automatisch.
    private var autoStartToggle: some View {
        Toggle(isOn: $rec.autoStart) {
            VStack(alignment: .leading, spacing: 2) {
                Text(Loc.t("rec.autostart", lang)).font(.subheadline)
                if rec.autoStart {
                    Text(Loc.t("rec.autostartHint", lang)).font(.caption).foregroundStyle(.secondary)
                }
            }
        }
    }

    private var foilPickerBlock: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(Loc.t("rec.foilLabel", lang).uppercased())
                .font(.caption).foregroundStyle(.secondary)
            favFoilGrid
            foilCatalogMenu
        }
    }

    // Favoriten (my_foils) direkt als Chips wählbar; Standard-Foil vorausgewählt.
    private var favFoilGrid: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)],
                  alignment: .leading, spacing: 8) {
            foilChip(nil, Loc.t("rec.foilNone", lang))
            ForEach(favFoils) { f in foilChip(f.id, chipTitle(f), f.brand) }
        }
    }

    // Zusätzlich: ganzer Katalog, falls ein Foil außerhalb der Favoriten gebraucht wird.
    private var foilCatalogMenu: some View {
        Menu {
            Button(Loc.t("rec.foilNone", lang)) { foilId = nil }
            ForEach(foils) { f in Button(shortLabel(f)) { foilId = f.id } }
        } label: {
            foilMenuLabel
        }
    }

    private var foilMenuLabel: some View {
        HStack {
            Text(foilMenuText)
                .foregroundStyle(.secondary).lineLimit(1)
            Spacer()
            Image(systemName: "chevron.up.chevron.down").font(.caption).foregroundStyle(.secondary)
        }
        .padding(10)
        .frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 10).stroke(Color.secondary.opacity(0.3)))
    }

    // Der Menü-Titel zeigt den gewählten Foil-Namen nur, wenn der NICHT schon als Chip oben steht.
    private var foilMenuText: String {
        let outsideFavs: Bool = foilId != nil && !favFoils.contains(where: { $0.id == foilId })
        return outsideFavs ? foilLabel(foilId) : Loc.t("rec.foilOther", lang)
    }

    private var startButton: some View {
        Button {
            rec.sessionFoilId = foilId
            rec.start()
        } label: {
            Text(Loc.t("rec.start", lang)).bold().frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent).controlSize(.large)
    }

    // MARK: - Aufnahme

    private var recordingBody: some View {
        VStack(spacing: 14) {
            Text(recordingStateText)
                .font(.title3).foregroundStyle(recordingStateColor)
            // GPS weg (PhoneRecorder.gpsWeg, 25.10.2026): deutlich, nicht nur „--" im Tempo.
            if rec.gpsWeg {
                Text(Loc.t("rec.gpsSearch", lang)).font(.headline).foregroundStyle(Color.red)
            }
            // Scrollbereich ueber dem festen STOPP: Zahlen, Uhrseiten, Laeufe und Karte (26.10.2026) passen
            // auf kleinen iPhones nicht mehr untereinander — STOPP darf nie aus dem Bild rutschen.
            ScrollView {
                VStack(spacing: 14) {
                    // Foil-Strecke (Summe aller Laeufe) statt Gesamtstrecke (Jan, 26.10.2026): „Gesamtstrecke
                    // will ich garnicht haben … darunter wuerde ich intuitiv auch on foil verstehen".
                    statRow(Loc.t("rec.time", lang), mmss(rec.elapsedSec), Loc.t("rec.foilDist", lang), km(rec.allRunsDistanceM))
                    statRow(Loc.t("rec.speed", lang), speedText, Loc.t("rec.speedMax", lang), maxSpeedText)
                    statRow(Loc.t("rec.runs", lang), runCountText, Loc.t("rec.runDur", lang), mmss(rec.runDurationMs / 1000))
                    if rec.uploading { Text(Loc.t("rec.upRunning", lang)).font(.footnote).foregroundStyle(.secondary) }
                    LiveUhrSeitenView(rec: rec, lang: lang)
                    LaeufeKarteView(laeufe: rec.laeufe, lang: lang)
                    // Live-Track des aktuellen Laufs.
                    trackCanvas.frame(maxWidth: .infinity).frame(height: 280)
                }
            }
            Text(Loc.t("rec.holdStop", lang)).font(.footnote).foregroundStyle(.secondary)
            stopHoldButton
        }
    }

    private var recordingStateText: String {
        rec.isFoiling ? Loc.t("rec.onfoil", lang) : Loc.t("rec.recording", lang)
    }
    private var recordingStateColor: Color {
        rec.isFoiling ? Color.accentColor : Color.secondary
    }
    private var speedText: String { rec.gpsWeg ? "--" : String(format: "%.1f", rec.speedKmh) }
    private var maxSpeedText: String { String(format: "%.1f", rec.maxSpeedKmh) }
    private var runCountText: String { "\(rec.runCount)" }

    // 2 Sekunden halten zum Stoppen; der halbtransparente Balken zeigt den Fortschritt.
    // Dieselben 2 s wie auf der Garmin (STOP_HOLD_MS, ab 1.0.68) — Jan 27.07.: „3 s fuehlten
    // sich am Wasser unnoetig lang an". Achtung, ein Unterschied zur Uhr bleibt: hier beendet
    // das Halten die Aufnahme direkt, es gibt kein Menue Speichern/Pausieren/Verwerfen.
    private var stopHoldButton: some View {
        let h: CGFloat = 56
        return ZStack {
            RoundedRectangle(cornerRadius: 28).fill(Color.red)
            Rectangle().fill(Color.white.opacity(0.28)).scaleEffect(x: holdProgress, anchor: .leading)
            Text(Loc.t("rec.stop", lang)).bold().foregroundStyle(.white)
        }
        .frame(height: h).clipShape(RoundedRectangle(cornerRadius: 28))
        .onLongPressGesture(minimumDuration: 2.0, maximumDistance: 60,
            perform: { rec.stop() },
            onPressingChanged: { pressing in holdChanged(pressing) })
    }

    // Ablauflogik aus der Gesten-Closure heraus (Methode statt Closure im ViewBuilder).
    private func holdChanged(_ pressing: Bool) {
        if pressing { withAnimation(.linear(duration: 2.0)) { holdProgress = 1 } }
        else { withAnimation(.linear(duration: 0.15)) { holdProgress = 0 } }
    }

    // MARK: - Gespeichert

    private var savedBody: some View {
        VStack(spacing: 14) {
            Spacer().frame(height: 30)
            Text(savedTitleText)
                .font(.title2).foregroundStyle(Color.accentColor)
            // Upload mit Prozent, x/y Bloecken und Balken (Jan, 03.10.2026: „wie bei Android") —
            // antippen = jetzt versuchen. Danach nur noch „hochgeladen".
            PhoneUploadBar()
            savedInfoLine
            Spacer()
            Button { dismiss() } label: { Text(Loc.t("common.done", lang)).frame(maxWidth: .infinity) }
                .buttonStyle(.borderedProminent).controlSize(.large)
        }
    }

    private var savedTitleText: String {
        rec.status == "saving" ? Loc.t("rec.saving", lang) : Loc.t("rec.saved", lang)
    }

    @ViewBuilder private var savedInfoLine: some View {
        if !savedInfoText.isEmpty { Text(savedInfoText).foregroundStyle(.secondary) }
    }

    // War eine dreifach verschachtelte Ternary-Kette samt `let` im ViewBuilder — der teuerste
    // Einzelposten der Datei. Gleiche Reihenfolge der Faelle, jetzt vorab typisiert.
    // Laufender/offener/fehlgeschlagener Upload steht in der `PhoneUploadBar` darueber —
    // hier nur noch der Abschluss.
    private var savedInfoText: String {
        if !rec.uploading && rec.pendingCount == 0 && rec.status == "saved" { return Loc.t("rec.upDone", lang) }
        return ""
    }

    // Live-Track auf der echten Karte (MapKit — wie Session-Detail). Folgt der aktuellen Position.
    @ViewBuilder private var trackCanvas: some View {
        if rec.track.count < 2 {
            RoundedRectangle(cornerRadius: 16).fill(Color.secondary.opacity(0.12))
                .overlay { Text(Loc.t("rec.gpsSearch", lang)).font(.footnote).foregroundStyle(.secondary) }
        } else {
            LiveTrackMap(track: rec.track, onFoil: rec.isFoiling)
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .mitKartenUmschalter()
                .schutzgebietSteuerung(lang: lang)
        }
    }

    private func statRow(_ l1: String, _ v1: String, _ l2: String, _ v2: String) -> some View {
        HStack(spacing: 12) { statCell(l1, v1); statCell(l2, v2) }
    }
    private func statCell(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(.system(size: 26, weight: .bold))
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color.secondary.opacity(0.12)))
    }
}

// Live-Track auf MKMapView (wie SessionDetailView.TrackMap). Polyline des bisherigen Laufs,
// Karte folgt der aktuellen Position. Tiles cachen; offline bleibt die Linie sichtbar.
private struct LiveTrackMap: UIViewRepresentable {
    // Karten-Ebene appweit (s. MapTiles.swift). Aenderung loest updateUIView aus.
    @AppStorage(MapTiles.schluessel) private var ebene = MapTiles.karte
    let track: [[Double]]
    let onFoil: Bool

    func makeUIView(context: Context) -> MKMapView {
        let map = MKMapView()
        map.delegate = context.coordinator
        context.coordinator.schutz = SchutzLader(map: map)   // Schutzgebiete (Schutzgebiete.swift)
        map.isRotateEnabled = false
        map.isPitchEnabled = false
        map.pointOfInterestFilter = .excludingAll
        map.showsUserLocation = false
        return map
    }

    func updateUIView(_ map: MKMapView, context: Context) {
        let typ = MapTiles.typ(ebene)
        if map.mapType != typ { map.mapType = typ }   // nur bei echtem Wechsel
        context.coordinator.onFoil = onFoil
        guard track.count >= 2 else { return }
        // Neue Linie ERST anlegen, dann die alte entfernen — sonst blinkt sie kurz weg (Jan, 18.10.2026).
        let alt = map.overlays.filter { $0 is MKPolyline && !($0 is SchutzPolygon) }
        let coords = track.map { CLLocationCoordinate2D(latitude: $0[0], longitude: $0[1]) }
        map.addOverlay(MKPolyline(coordinates: coords, count: coords.count))
        map.removeOverlays(alt)
        if let last = coords.last {
            map.setRegion(MKCoordinateRegion(center: last, latitudinalMeters: 500, longitudinalMeters: 500),
                          animated: true)
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    @MainActor final class Coordinator: NSObject, MKMapViewDelegate {

        var schutz: SchutzLader?

        func mapView(_ mapView: MKMapView, regionDidChangeAnimated animated: Bool) { schutz?.ausschnittGeaendert() }
        var onFoil = false
        func mapView(_ m: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
            if let r = schutz?.renderer(for: overlay) { return r }
            guard let pl = overlay as? MKPolyline else { return MKOverlayRenderer(overlay: overlay) }
            let r = MKPolylineRenderer(polyline: pl)
            // Brand-Cyan (#22d3ee) beim Foilen, sonst neutrales Grau.
            r.strokeColor = onFoil ? UIColor(red: 0x22/255.0, green: 0xd3/255.0, blue: 0xee/255.0, alpha: 1)
                                   : UIColor.systemGray
            r.lineWidth = 4
            r.lineCap = .round; r.lineJoin = .round
            return r
        }
    }
}

// MARK: - Live-Uhrseiten + Laeufe (26.10.2026)
// Die eigenen Uhr-Datenseiten LIVE auf dem Handy-Recorder, ueber der Karte (Jan: „vielleicht auch einfach
// die watch-faces verwenden zur anzeige live"). Anlass: 10K-Versuch u897 (#17390) — die App zeigte nur die Gesamtstrecke,
// sie hielt sie fuer die Foil-Strecke und hoerte zu frueh auf. Spiegel von Android LiveSeiten.kt.
// `pages` waehrend eines Laufs, `off_foil_pages` sonst (das Handy kennt keine manuelle Pause); mit
// „auch die anderen Seiten durchblaettern" haengen die Seiten des anderen Zustands hinten an.
// Steht hier statt in einer eigenen Datei, damit das Xcode-Projekt nicht neu erzeugt werden muss.

private enum LiveSeite {
    case klassik([Int])
    case layout(WatchLayoutBrief)
}

/// Ein Seiten-Satz aus den Einstellungen: Liste aus [a,b,c] (3 Felder) oder Zahl (Layout-ID).
private func liveSeitenAus(_ s: [String: Any], _ key: String, _ legacy: String?,
                           _ layouts: [Int: WatchLayoutBrief], _ mitLayouts: Bool) -> [LiveSeite] {
    var out: [LiveSeite] = []
    if let arr = s[key] as? [Any] {
        for el in arr {
            if let row = el as? [Any] {
                let f: [Int] = row.map { ($0 as? NSNumber)?.intValue ?? 0 }
                out.append(.klassik(Array(f.prefix(3))))
            } else if let n = el as? NSNumber, mitLayouts, let l = layouts[n.intValue] {
                out.append(.layout(l))
            }
        }
    }
    if !out.isEmpty { return out }
    if let k = legacy, let alt = s[k] as? [Any] {
        let f: [Int] = alt.map { ($0 as? NSNumber)?.intValue ?? 0 }
        if f.count >= 3 { return [.klassik(Array(f.prefix(3)))] }
    }
    return []
}

/// Werte je Feld-ID wie die Uhr sie zeigt (Config.mc / RecordView.mc). Puls, Hoehe, Temperatur kennt
/// der Handy-Recorder nicht -> fehlen (der Renderer zeigt dann „--").
@MainActor private func liveWerte(_ r: PhoneRecorder) -> [Int: String] {
    func dist(_ m: Double) -> String { m < 1000 ? "\(Int(m))" : String(format: "%.2f", m / 1000) }
    func zeit(_ ms: Int) -> String {
        let s = ms / 1000
        if s >= 3600 { return String(format: "%d:%02d:%02d", s / 3600, s / 60 % 60, s % 60) }
        return String(format: "%d:%02d", s / 60, s % 60)
    }
    func kmh(_ v: Double) -> String { String(format: "%.1f", v) }
    let f = DateFormatter(); f.dateFormat = "HH:mm"
    var w: [Int: String] = [:]
    if !r.gpsWeg { w[1] = kmh(r.speed3sKmh); w[5] = kmh(r.speedKmh) }
    w[6] = kmh(r.avgSpeedKmh); w[7] = kmh(r.maxSpeedKmh)
    w[3] = zeit(r.elapsedSec * 1000); w[4] = dist(r.distanceM); w[12] = f.string(from: Date())
    w[14] = zeit(r.runDurationMs); w[15] = dist(r.runDistanceM)
    w[16] = zeit(r.lastRunDurationMs); w[17] = dist(r.lastRunDistanceM)
    w[18] = kmh(r.lastRunAvgSpeedKmh); w[19] = kmh(r.lastRunMaxSpeedKmh)
    w[20] = "\(r.runCount)"
    w[22] = dist(r.allRunsDistanceM); w[23] = zeit(r.allRunsDurationMs)
    return w
}

struct LiveUhrSeitenView: View {
    @ObservedObject var rec: PhoneRecorder
    let lang: String
    @State private var foilSeiten: [LiveSeite] = [.klassik([1, 2, 0])]
    @State private var sonstSeiten: [LiveSeite] = [.klassik([12, 17, 16])]
    @State private var alleBlaettern = true
    @State private var seite = 0

    private var seiten: [LiveSeite] {
        let eigene: [LiveSeite] = rec.isFoiling ? foilSeiten : sonstSeiten
        let andere: [LiveSeite] = rec.isFoiling ? sonstSeiten : foilSeiten
        return alleBlaettern ? eigene + andere : eigene
    }

    var body: some View {
        let werte: [Int: String] = liveWerte(rec)
        let alle: [LiveSeite] = seiten
        TabView(selection: $seite) {
            ForEach(0..<alle.count, id: \.self) { i in
                seiteView(alle[i], i, alle.count, werte).tag(i)
            }
        }
        .tabViewStyle(.page(indexDisplayMode: alle.count > 1 ? .always : .never))
        .indexViewStyle(.page(backgroundDisplayMode: .always))
        .frame(height: 226)
        // Zustandswechsel (Lauf beginnt/endet) -> erste Seite des neuen Zustands, wie die Uhr.
        .onChange(of: rec.isFoiling) { _ in seite = 0 }
        .task { await laden() }
    }

    @ViewBuilder private func seiteView(_ s: LiveSeite, _ i: Int, _ n: Int, _ werte: [Int: String]) -> some View {
        switch s {
        case .layout(let l):
            WatchLayoutPreview(elements: l.elements ?? [], bgColor: l.bg_color ?? 0, shape: l.shape ?? "round",
                               w: l.authored_w ?? 240, h: l.authored_h ?? 240, px: 190,
                               pageCount: n, pageIndex: i, lang: lang, werte: werte)
        case .klassik(let felder):
            klassik(felder, werte)
        }
    }

    /// Klassische 3-Feld-Seite: Wert gross, Feldname klein darueber — schwarz wie auf der Uhr.
    private func klassik(_ felder: [Int], _ werte: [Int: String]) -> some View {
        VStack(spacing: 6) {
            ForEach(felder.filter { $0 != 0 }, id: \.self) { f in
                VStack(spacing: 0) {
                    Text(Loc.t("field.\(f)", lang)).font(.system(size: 10)).foregroundStyle(Color(white: 0.82)).lineLimit(1)
                    Text(werte[f] ?? "--").font(.system(size: 26, weight: .bold)).foregroundStyle(.white).lineLimit(1)
                }
            }
        }
        .frame(width: 190, height: 190)
        .background(Circle().fill(Color.black))
    }

    private func laden() async {
        guard let s = try? await Api.settings() else { return }   // offline: Standardseiten
        let zonen = (s["hr_zones"] as? [Any])?.compactMap { ($0 as? NSNumber)?.intValue }
        let spZonen = (s["speed_zones"] as? [Any])?.compactMap { ($0 as? NSNumber)?.intValue }
        LayoutScales.aus(hrZones: zonen, speedZones: spZonen)
        let mitLayouts: Bool = (s["layouts_enabled"] as? Bool) ?? true
        var layouts: [Int: WatchLayoutBrief] = [:]
        if mitLayouts, let ls = try? await Api.watchLayouts() {
            for l in ls { layouts[l.id] = l }
        }
        let a = liveSeitenAus(s, "pages", "views", layouts, mitLayouts)
        if !a.isEmpty { foilSeiten = a }
        let b = liveSeitenAus(s, "off_foil_pages", "off_foil_view", layouts, mitLayouts)
        if !b.isEmpty { sonstSeiten = b }
        alleBlaettern = (s["browse_all_pages"] as? Bool) ?? true
    }
}

/// Die fertigen Laeufe dieser Aufnahme zum Durchblaettern (startet beim neuesten).
struct LaeufeKarteView: View {
    let laeufe: [LiveLauf]
    let lang: String
    @State private var idx = -1          // -1 = immer der neueste

    private var i: Int { (idx < 0 || idx >= laeufe.count) ? laeufe.count - 1 : idx }

    var body: some View {
        VStack(spacing: 4) {
            if laeufe.isEmpty {
                Text(Loc.t("rec.noRunYet", lang)).font(.subheadline).foregroundStyle(.secondary).padding(6)
            } else {
                HStack {
                    Button { idx = max(0, i - 1) } label: { Image(systemName: "chevron.left") }
                        .disabled(i == 0)
                    Spacer()
                    laufText(laeufe[i])
                    Spacer()
                    Button { idx = (i + 1 >= laeufe.count - 1) ? -1 : i + 1 } label: { Image(systemName: "chevron.right") }
                        .disabled(i >= laeufe.count - 1)
                }
                .font(.title3)
            }
            Text(Loc.t("rec.liveHint", lang)).font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center)
        }
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 14).fill(Color.secondary.opacity(0.12)))
        // Neuer Lauf: wer gerade den letzten ansah, springt mit.
        .onChange(of: laeufe.count) { n in if idx == n - 2 { idx = -1 } }
    }

    private func laufText(_ l: LiveLauf) -> some View {
        let km: String = l.distM >= 1000 ? String(format: "%.2f km", l.distM / 1000) : "\(Int(l.distM)) m"
        let s: Int = l.durMs / 1000
        let titel: String = Loc.t("rec.runOf", lang).replacingOccurrences(of: "{n}", with: "\(i + 1)")
            .replacingOccurrences(of: "{m}", with: "\(laeufe.count)")
        return VStack(spacing: 2) {
            Text(titel).font(.footnote.weight(.semibold)).foregroundStyle(Color.accentColor)
            Text("\(km) · \(String(format: "%d:%02d", s / 60, s % 60))").font(.title3.bold()).foregroundStyle(.primary)
            Text(String(format: "Ø %.1f · max %.1f km/h", l.avgKmh, l.maxKmh)).font(.footnote).foregroundStyle(.secondary)
        }
    }
}
