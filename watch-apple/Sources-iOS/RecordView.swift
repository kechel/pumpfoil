import SwiftUI
import MapKit

// „Record on Phone": das iPhone als Recorder. Gleiche Live-Werte wie die Uhr-Apps, aber
// ohne Einstellungs-Optionen (die stehen anderswo) — dafür die Session-Foil direkt wählbar.
// 3 Sekunden halten zum Stoppen (gegen versehentliches Beenden). Aufnahme läuft im Hintergrund
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
    private func mmss(_ s: Int) -> String { String(format: "%d:%02d", s / 60, s % 60) }
    private func km(_ m: Double) -> String { m >= 1000 ? String(format: "%.2f km", m / 1000) : "\(Int(m)) m" }

    // Direkt antippbarer Foil-Chip (Favoriten + „Ohne Foil"); hervorgehoben, wenn ausgewählt.
    private func foilChip(_ id: Int?, _ label: String) -> some View {
        let sel = foilId == id
        return Button { foilId = id } label: {
            Text(label).font(.subheadline).lineLimit(1).minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10).padding(.horizontal, 8)
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
                else if rec.status == "gespeichert" || rec.status == "speichere…" { savedBody }
                else { idleBody }
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
            if rec.pendingCount > 0 { pendingRow }
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
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 110), spacing: 8)], alignment: .leading, spacing: 8) {
            foilChip(nil, Loc.t("rec.foilNone", lang))
            ForEach(favFoils) { f in foilChip(f.id, shortLabel(f)) }
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

    // Offene Uploads + manueller „Jetzt hochladen"-Trigger (falls beim Beenden kein Netz da war).
    @ViewBuilder private var pendingRow: some View {
        HStack(spacing: 10) {
            Text(pendingText)
                .font(.footnote).foregroundStyle(.secondary)
            if !rec.uploading {
                Button(Loc.t("rec.uploadNow", lang)) { Task { await rec.drain() } }
                    .font(.footnote.bold())
            }
        }
    }

    // Jede mehrteilige Interpolation und jedes Ternary im ViewBuilder zwingt den Checker durch
    // alle Ueberladungen -> Text vorab typisiert.
    private var pendingText: String {
        if rec.uploading { return Loc.t("rec.upRunning", lang) }
        return Loc.t("rec.pending", lang).replacingOccurrences(of: "{n}", with: "\(rec.pendingCount)")
    }

    // MARK: - Aufnahme

    private var recordingBody: some View {
        VStack(spacing: 14) {
            Text(recordingStateText)
                .font(.title3).foregroundStyle(recordingStateColor)
            statRow(Loc.t("rec.time", lang), mmss(rec.elapsedSec), Loc.t("rec.dist", lang), km(rec.distanceM))
            statRow(Loc.t("rec.speed", lang), speedText, Loc.t("rec.speedMax", lang), maxSpeedText)
            statRow(Loc.t("rec.runs", lang), runCountText, Loc.t("rec.runDur", lang), mmss(rec.runDurationMs / 1000))
            if rec.uploading { Text(Loc.t("rec.upRunning", lang)).font(.footnote).foregroundStyle(.secondary) }
            // Live-Track des aktuellen Laufs füllt den Platz bis zum fixen STOPP-Button.
            trackCanvas.frame(maxWidth: .infinity, maxHeight: .infinity)
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
    private var speedText: String { String(format: "%.1f", rec.speedKmh) }
    private var maxSpeedText: String { String(format: "%.1f", rec.maxSpeedKmh) }
    private var runCountText: String { "\(rec.runCount)" }

    // 3 Sekunden halten zum Stoppen; der halbtransparente Balken zeigt den Fortschritt.
    private var stopHoldButton: some View {
        let h: CGFloat = 56
        return ZStack {
            RoundedRectangle(cornerRadius: 28).fill(Color.red)
            Rectangle().fill(Color.white.opacity(0.28)).scaleEffect(x: holdProgress, anchor: .leading)
            Text(Loc.t("rec.stop", lang)).bold().foregroundStyle(.white)
        }
        .frame(height: h).clipShape(RoundedRectangle(cornerRadius: 28))
        .onLongPressGesture(minimumDuration: 3.0, maximumDistance: 60,
            perform: { rec.stop() },
            onPressingChanged: { pressing in holdChanged(pressing) })
    }

    // Ablauflogik aus der Gesten-Closure heraus (Methode statt Closure im ViewBuilder).
    private func holdChanged(_ pressing: Bool) {
        if pressing { withAnimation(.linear(duration: 3.0)) { holdProgress = 1 } }
        else { withAnimation(.linear(duration: 0.15)) { holdProgress = 0 } }
    }

    // MARK: - Gespeichert

    private var savedBody: some View {
        VStack(spacing: 14) {
            Spacer().frame(height: 30)
            Text(savedTitleText)
                .font(.title2).foregroundStyle(Color.accentColor)
            savedInfoLine
            if rec.pendingCount > 0 && !rec.uploading {
                Button(Loc.t("rec.uploadNow", lang)) { Task { await rec.drain() } }
                    .font(.footnote.bold())
            }
            Spacer()
            Button { dismiss() } label: { Text(Loc.t("common.done", lang)).frame(maxWidth: .infinity) }
                .buttonStyle(.borderedProminent).controlSize(.large)
        }
    }

    private var savedTitleText: String {
        rec.status == "speichere…" ? Loc.t("rec.saving", lang) : Loc.t("rec.saved", lang)
    }

    @ViewBuilder private var savedInfoLine: some View {
        if !savedInfoText.isEmpty { Text(savedInfoText).foregroundStyle(.secondary) }
    }

    // War eine dreifach verschachtelte Ternary-Kette samt `let` im ViewBuilder — der teuerste
    // Einzelposten der Datei. Gleiche Reihenfolge der Faelle, jetzt vorab typisiert.
    private var savedInfoText: String {
        if rec.uploading { return Loc.t("rec.upRunning", lang) }
        if rec.uploadError == "offline" { return Loc.t("rec.upLater", lang) }
        if rec.pendingCount == 0 && rec.status == "gespeichert" { return Loc.t("rec.upDone", lang) }
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
    let track: [[Double]]
    let onFoil: Bool

    func makeUIView(context: Context) -> MKMapView {
        let map = MKMapView()
        map.delegate = context.coordinator
        map.isRotateEnabled = false
        map.isPitchEnabled = false
        map.pointOfInterestFilter = .excludingAll
        map.showsUserLocation = false
        return map
    }

    func updateUIView(_ map: MKMapView, context: Context) {
        context.coordinator.onFoil = onFoil
        map.removeOverlays(map.overlays)
        guard track.count >= 2 else { return }
        let coords = track.map { CLLocationCoordinate2D(latitude: $0[0], longitude: $0[1]) }
        map.addOverlay(MKPolyline(coordinates: coords, count: coords.count))
        if let last = coords.last {
            map.setRegion(MKCoordinateRegion(center: last, latitudinalMeters: 500, longitudinalMeters: 500),
                          animated: true)
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator: NSObject, MKMapViewDelegate {
        var onFoil = false
        func mapView(_ m: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
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
