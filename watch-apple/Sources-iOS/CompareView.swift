import SwiftUI
import MapKit
import CoreLocation
import UIKit

// Mehrere eigene Sessions nebeneinander vergleichen. Auswahl kommt AUSSCHLIESSLICH per
// Long-Press aus den Session-Listen (CompareStore/preselect) — keine eigene Auswahlliste hier.
struct CompareView: View {
    var preselect: Set<Int> = []
    @AppStorage("appLang") private var lang = "de"
    @State private var results: [SessionDetail] = []
    @State private var loading = true
    @State private var merging = false
    @State private var mergeError: String?
    @State private var mergedId: Int?
    @State private var mapMode: CompareColorMode = .track
    @State private var mapWin = 3          // Glättungsfenster für Speed-Färbung
    @State private var mapFull = false     // Vollbild-Karte

    var body: some View {
        // Kein eigener NavigationStack: View wird gepusht und nutzt den vorhandenen Stack.
        Group {
            if loading {
                ProgressView()
            } else if results.isEmpty {
                Text(Loc.t("compare.pick", lang)).foregroundStyle(.secondary).padding()
            } else {
                VStack(spacing: 0) {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 18) {
                            compareMapSection
                            compareTable
                            allRunsSection
                        }
                        .padding(.vertical)
                    }
                    // Merge-Hinweis + Button unten fixiert (nur wenn zusammenführbar).
                    if mergeable {
                        VStack(spacing: 8) {
                            Text(Loc.t("merge.compareHint", lang))
                                .font(.caption).foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            if let mergeError { Text(mergeError).font(.caption).foregroundStyle(.red) }
                            Button {
                                mergeError = nil; merging = true
                                Task {
                                    do { mergedId = try await Api.mergeSessions(Array(preselect)) }
                                    catch { mergeError = error.localizedDescription }
                                    merging = false
                                }
                            } label: { Text(Loc.t("merge.action", lang)).frame(maxWidth: .infinity) }
                            .buttonStyle(.borderedProminent)
                            .disabled(merging)
                        }
                        .padding()
                        .background(.ultraThinMaterial)
                    } else if let mergeError {
                        Text(mergeError).font(.caption).foregroundStyle(.red).padding()
                    }
                }
            }
        }
        .navigationDestination(isPresented: Binding(get: { mergedId != nil }, set: { if !$0 { mergedId = nil } })) {
            if let id = mergedId { SessionDetailView(id: id) }
        }
        .navigationTitle(Loc.t("compare.title", lang))
        .task { await load() }
    }

    private func load() async {
        var out: [SessionDetail] = []
        for id in preselect { if let d = try? await Api.session(id) { out.append(d) } }
        results = out.sorted { $0.started_at < $1.started_at }
        loading = false
    }

    // Zusammenführen nur, wenn plausibel erlaubt (Client-Spiegel; Server prüft final): alle
    // eigene Sessions, >=2, gleicher Tag UND gleicher Spot.
    private var mergeable: Bool {
        guard results.count == preselect.count, results.count >= 2, results.allSatisfy({ $0.owned == true }) else { return false }
        let days = Set(results.map { String($0.started_at.prefix(10)) })
        let spots = Set(results.map { ($0.place_name ?? "").trimmingCharacters(in: .whitespaces).lowercased() })
        return days.count == 1 && spots.count == 1
    }

    // Farbpalette je Session (wie PWA): eindeutige Zuordnung Track/Legende.
    private static let palette: [UInt32] = [0x2DD4BF, 0xF59E0B, 0xA78BFA, 0xF472B6, 0x60A5FA, 0x34D399]
    private func sessColor(_ i: Int) -> Color {
        let h = Self.palette[i % Self.palette.count]
        return Color(red: Double((h >> 16) & 0xff) / 255, green: Double((h >> 8) & 0xff) / 255, blue: Double(h & 0xff) / 255)
    }
    private func sessUIColor(_ i: Int) -> UIColor {
        let h = Self.palette[i % Self.palette.count]
        return UIColor(red: CGFloat((h >> 16) & 0xff) / 255, green: CGFloat((h >> 8) & 0xff) / 255, blue: CGFloat(h & 0xff) / 255, alpha: 1)
    }

    // Verfügbare Daten über alle Sessions (für die Modus-Auswahl).
    private var hasPumpData: Bool { results.contains { ($0.analysis?.track_geojson?.properties?.pump_hz ?? []).contains { $0 != nil } } }
    private var hasHrData: Bool { results.contains { ($0.analysis?.track_geojson?.properties?.hr ?? []).contains { ($0 ?? 0) > 0 } } }

    // CompareMap.Track je Session mit allen Punkt-Daten (windowed Speed, Pump, Puls).
    private var mapTracks: [CompareMap.Track] {
        results.enumerated().compactMap { i, s in
            guard let t = s.analysis?.track_geojson, t.geometry.coordinates.count >= 2,
                  let segs = s.analysis?.segments, !segs.isEmpty else { return nil }
            let sp = (t.properties?.speeds?[String(mapWin)] ?? t.properties?.speeds_mps ?? []).map { $0 * 3.6 }
            return CompareMap.Track(points: t.geometry.coordinates, segments: segs, color: sessUIColor(i),
                                    speedsKmh: sp, pumpHz: t.properties?.pump_hz ?? [], hr: t.properties?.hr ?? [])
        }
    }

    private var pumpRange: (Double, Double) {
        let v = results.flatMap { ($0.analysis?.track_geojson?.properties?.pump_hz ?? []).compactMap { $0 } }
        return (v.min() ?? 0, v.max() ?? 2)
    }
    private var hrRange: (Double, Double) {
        let v = results.flatMap { ($0.analysis?.track_geojson?.properties?.hr ?? []).compactMap { $0 }.filter { $0 > 0 } }
        return (Double(v.min() ?? 100), Double(v.max() ?? 170))
    }
    private var speedRange: (Double, Double) {
        var v: [Double] = []
        for tr in mapTracks where !tr.speedsKmh.isEmpty {
            for seg in tr.segments {
                let lo = max(0, seg.i_start), hi = min(seg.i_end, tr.speedsKmh.count - 1)
                if lo <= hi { for i in lo...hi where tr.speedsKmh[i] > 0 { v.append(tr.speedsKmh[i]) } }
            }
        }
        return (v.min().map { max(0, $0) } ?? 8, v.max() ?? 25)
    }

    @ViewBuilder private var compareMapSection: some View {
        let tracks = mapTracks
        if !tracks.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                mapControls
                CompareMap(tracks: tracks, mode: mapMode, pumpRange: pumpRange, hrRange: hrRange, speedRange: speedRange)
                    .frame(height: 240)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .padding(.horizontal)
                mapLegend
            }
            .fullScreenCover(isPresented: $mapFull) {
                ZStack(alignment: .topTrailing) {
                    CompareMap(tracks: tracks, mode: mapMode, pumpRange: pumpRange, hrRange: hrRange, speedRange: speedRange)
                        .ignoresSafeArea()
                    Button { mapFull = false } label: {
                        Image(systemName: "xmark.circle.fill").font(.title).foregroundStyle(.white, .black.opacity(0.5))
                    }.padding()
                }
            }
        }
    }

    // Färbungs-/Glättungs-Auswahl + Vollbild.
    @ViewBuilder private var mapControls: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Picker(Loc.t("sd.coloring", lang), selection: $mapMode) {
                    Text(Loc.t("compare.colorTrack", lang)).tag(CompareColorMode.track)
                    Text(Loc.t("sd.colorSpeed", lang)).tag(CompareColorMode.speed)
                    if hasPumpData { Text(Loc.t("sd.colorPump", lang)).tag(CompareColorMode.pump) }
                    if hasHrData { Text(Loc.t("sd.colorPuls", lang)).tag(CompareColorMode.hr) }
                }
                .pickerStyle(.segmented)
                Button { mapFull = true } label: { Image(systemName: "arrow.up.left.and.arrow.down.right") }
                    .padding(.leading, 6)
            }
            if mapMode == .speed {
                Picker(Loc.t("sd.smoothing", lang), selection: $mapWin) {
                    Text("1s").tag(1); Text("3s").tag(3); Text("5s").tag(5)
                }.pickerStyle(.segmented)
            }
        }
        .padding(.horizontal)
    }

    // Legende: Track-Modus -> Session-Farben; Wert-Modi -> Farbverlauf mit Skala.
    @ViewBuilder private var mapLegend: some View {
        if mapMode == .track {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(Array(results.enumerated()), id: \.element.id) { i, s in
                        HStack(spacing: 5) {
                            Circle().fill(sessColor(i)).frame(width: 9, height: 9)
                            Text(s.startedDate?.formatted(date: .abbreviated, time: .shortened) ?? s.started_at)
                                .font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                }.padding(.horizontal)
            }
        } else {
            let range = mapMode == .pump ? pumpRange : mapMode == .hr ? hrRange : speedRange
            let unit = mapMode == .pump ? "Hz" : mapMode == .hr ? "bpm" : "km/h"
            HStack(spacing: 8) {
                Text(mapMode == .pump ? String(format: "%.1f", range.0) : "\(Int(range.0))").font(.caption2).monospacedDigit()
                LinearGradient(colors: [Color(hue: 240/360, saturation: 0.85, brightness: 0.95),
                                        Color(hue: 120/360, saturation: 0.85, brightness: 0.95),
                                        Color(hue: 0, saturation: 0.85, brightness: 0.95)],
                               startPoint: .leading, endPoint: .trailing)
                    .frame(height: 8).clipShape(Capsule())
                Text(mapMode == .pump ? String(format: "%.1f", range.1) : "\(Int(range.1))").font(.caption2).monospacedDigit()
                Text(unit).font(.caption2).foregroundStyle(.secondary)
            }.padding(.horizontal)
        }
    }

    // Alle Foiling-Läufe aller verglichenen Sessions als flache Liste (wie PWA AllRunsTable).
    @ViewBuilder private var allRunsSection: some View {
        let runs: [(SessionDetail, Int, Segment)] = results.flatMap { s in
            (s.analysis?.segments ?? []).enumerated().map { (s, $0.offset, $0.element) }
        }
        if !runs.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                Text(Loc.t("compare.runsTitle", lang)).font(.headline).padding(.horizontal).padding(.bottom, 6)
                ForEach(Array(runs.enumerated()), id: \.offset) { _, r in
                    let (s, idx, seg) = r
                    HStack(spacing: 10) {
                        Text("\(idx + 1)").font(.caption2).bold().foregroundStyle(Color.accentColor)
                            .frame(width: 22, height: 22).background(Color.accentColor.opacity(0.12), in: Circle())
                        VStack(alignment: .leading, spacing: 1) {
                            Text(s.startedDate?.formatted(date: .abbreviated, time: .shortened) ?? s.started_at).font(.caption)
                            if let p = s.place_name, !p.isEmpty { Text(p).font(.caption2).foregroundStyle(.secondary) }
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 1) {
                            Text("\(Int(seg.distance_m ?? 0)) m · \(mmss(seg.duration_s))").font(.caption).monospacedDigit()
                            Text("\(seg.avg_speed_mps.map { String(format: "%.1f km/h", $0 * 3.6) } ?? "–") · \(seg.pumps.map { "\($0)P" } ?? "–")")
                                .font(.caption2).foregroundStyle(.secondary).monospacedDigit()
                        }
                    }
                    .padding(.horizontal).padding(.vertical, 6)
                    Divider()
                }
            }
        }
    }

    private func mmss(_ s: Double?) -> String {
        guard let s else { return "–" }
        return String(format: "%d:%02d", Int(s) / 60, Int(s) % 60)
    }

    private var compareTable: some View {
        let metrics: [(String, (SessionDetail) -> String)] = [
            (Loc.t("compare.distance", lang), { $0.analysis?.total_distance_m.map { "\(Int($0)) m" } ?? "–" }),
            (Loc.t("home.foiling", lang), { $0.analysis?.foiling_distance_m.map { "\(Int($0)) m" } ?? "–" }),
            (Loc.t("home.topSpeed", lang), { $0.analysis?.max_speed_mps.map { String(format: "%.1f km/h", $0 * 3.6) } ?? "–" }),
            (Loc.t("home.pumps", lang), { $0.analysis?.pump_count.map { "\($0)" } ?? "–" }),
            (Loc.t("compare.foilTime", lang), { s in s.analysis?.foiling_time_s.map { String(format: "%d:%02d", Int($0) / 60, Int($0) % 60) } ?? "–" }),
            (Loc.t("compare.cadence", lang), { $0.analysis?.avg_cadence_hz.map { String(format: "%.2f Hz", $0) } ?? "–" }),
        ]
        return ScrollView([.horizontal]) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("").frame(width: 90, alignment: .leading)
                    ForEach(results) { s in
                        Text(s.startedDate?.formatted(date: .abbreviated, time: .shortened) ?? s.started_at)
                            .font(.caption).bold().frame(width: 120, alignment: .leading)
                    }
                }
                Divider()
                ForEach(metrics, id: \.0) { label, fn in
                    HStack {
                        Text(label).font(.caption).foregroundStyle(.secondary).frame(width: 90, alignment: .leading)
                        ForEach(results) { s in
                            Text(fn(s)).frame(width: 120, alignment: .leading)
                        }
                    }
                }
            }
            .padding()
        }
    }
}

// Färbungs-Modi der Vergleichs-Karte.
enum CompareColorMode { case track, speed, pump, hr }

// Wert -> Farbe (blau niedrig -> rot hoch), wie SessionDetail/Web.
private func cmpRamp(_ t: Double) -> UIColor {
    let tt = min(max(t, 0), 1)
    return UIColor(hue: (1 - tt) * 240 / 360, saturation: 0.85, brightness: 0.95, alpha: 1)
}

// Gemeinsame Karte mehrerer Sessions. Färbung: je Track (Session-Farbe) oder Wert (Speed/Pump/Puls).
// MKMapView (iOS-16-tauglich), analog TrackMap.
struct CompareMap: UIViewRepresentable {
    struct Track {
        let points: [[Double]]; let segments: [Segment]; let color: UIColor
        let speedsKmh: [Double]; let pumpHz: [Double?]; let hr: [Int?]
    }
    let tracks: [Track]
    var mode: CompareColorMode = .track
    var pumpRange: (Double, Double) = (0, 2)
    var hrRange: (Double, Double) = (100, 170)
    var speedRange: (Double, Double) = (8, 25)
    private let maxGapM = 30.0

    private func colorFor(_ tr: Track, _ i: Int) -> UIColor {
        switch mode {
        case .track: return tr.color
        case .speed:
            let v = tr.speedsKmh.indices.contains(i) ? tr.speedsKmh[i] : 0
            return cmpRamp((v - speedRange.0) / max(speedRange.1 - speedRange.0, 1e-6))
        case .pump:
            guard let v = (tr.pumpHz.indices.contains(i) ? tr.pumpHz[i] : nil) else { return .systemGray }
            return cmpRamp((v - pumpRange.0) / max(pumpRange.1 - pumpRange.0, 1e-6))
        case .hr:
            guard let v = (tr.hr.indices.contains(i) ? tr.hr[i] : nil), v > 0 else { return .systemGray }
            return cmpRamp((Double(v) - hrRange.0) / max(hrRange.1 - hrRange.0, 1))
        }
    }

    func makeUIView(context: Context) -> MKMapView {
        let map = MKMapView()
        map.delegate = context.coordinator
        map.isRotateEnabled = false
        map.isPitchEnabled = false
        return map
    }

    func updateUIView(_ map: MKMapView, context: Context) {
        map.removeOverlays(map.overlays)
        let co = context.coordinator
        co.colors.removeAll()
        var all: [CLLocationCoordinate2D] = []
        for tr in tracks {
            for seg in tr.segments {
                let lo = max(0, min(seg.i_start, tr.points.count - 1))
                let hi = max(0, min(seg.i_end, tr.points.count - 1))
                var i = lo
                while i < hi {
                    let a = tr.points[i], b = tr.points[i + 1]
                    let ca = CLLocationCoordinate2D(latitude: a[1], longitude: a[0])
                    let cb = CLLocationCoordinate2D(latitude: b[1], longitude: b[0])
                    let gap = CLLocation(latitude: ca.latitude, longitude: ca.longitude)
                        .distance(from: CLLocation(latitude: cb.latitude, longitude: cb.longitude))
                    if gap <= maxGapM {
                        let pl = MKPolyline(coordinates: [ca, cb], count: 2)
                        co.colors[ObjectIdentifier(pl)] = colorFor(tr, i + 1)
                        map.addOverlay(pl)
                        all.append(ca); all.append(cb)
                    }
                    i += 1
                }
            }
        }
        if !all.isEmpty {
            let lats = all.map { $0.latitude }, lons = all.map { $0.longitude }
            let center = CLLocationCoordinate2D(latitude: (lats.min()! + lats.max()!) / 2,
                                                longitude: (lons.min()! + lons.max()!) / 2)
            let span = MKCoordinateSpan(latitudeDelta: max((lats.max()! - lats.min()!) * 1.3, 0.002),
                                        longitudeDelta: max((lons.max()! - lons.min()!) * 1.3, 0.002))
            map.setRegion(MKCoordinateRegion(center: center, span: span), animated: false)
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator: NSObject, MKMapViewDelegate {
        var colors: [ObjectIdentifier: UIColor] = [:]
        func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
            guard let pl = overlay as? MKPolyline else { return MKOverlayRenderer(overlay: overlay) }
            let r = MKPolylineRenderer(polyline: pl)
            r.strokeColor = colors[ObjectIdentifier(pl)] ?? .systemBlue
            r.lineWidth = 4
            return r
        }
    }
}
