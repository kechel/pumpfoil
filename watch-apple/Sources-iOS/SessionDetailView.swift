import SwiftUI
import PhotosUI
import MapKit
import CoreLocation
import UIKit

// Session-Detail: Kopf + Track auf MapKit-Karte (nur Foiling-Segmente, speed-gefärbt) +
// Kennzahlen. Spiegelt web/src/pages/SessionDetail.tsx.
struct SessionDetailView: View {
    let id: Int
    @State private var session: SessionDetail?
    @State private var loading = true
    @State private var error: String?
    @State private var liked = false
    @State private var likeCount = 0
    @State private var photos: [SessionPhoto] = []
    @State private var pickerItem: PhotosPickerItem?
    @State private var colorMode: TrackColorMode = .speed
    @State private var showPumps = true
    @State private var weightKg = 0.0
    @State private var confirmDelete = false
    @State private var caption = ""
    @State private var editingCaption = false
    @State private var draftCaption = ""
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            if loading {
                ProgressView().padding(40)
            } else if let error {
                Text(error).foregroundStyle(.secondary).padding()
            } else if let s = session {
                content(s)
            }
        }
        .navigationTitle("Session")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if session?.owned == true {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(role: .destructive) { confirmDelete = true } label: { Image(systemName: "trash") }
                }
            }
        }
        .confirmationDialog("Session löschen?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Löschen", role: .destructive) {
                Task { try? await Api.deleteSession(id); dismiss() }
            }
            Button("Abbrechen", role: .cancel) {}
        }
        .alert("Beschriftung", isPresented: $editingCaption) {
            TextField("Beschriftung", text: $draftCaption)
            Button("Speichern") {
                let c = String(draftCaption.prefix(30)).trimmingCharacters(in: .whitespaces)
                caption = c
                Task { try? await Api.setCaption(id, caption: c) }
            }
            Button("Abbrechen", role: .cancel) {}
        }
        .task { await load() }
    }

    @ViewBuilder private func content(_ s: SessionDetail) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(dateText(s)).font(.title2).bold()
                    if let p = s.place_name, !p.isEmpty {
                        Label(p, systemImage: "mappin.and.ellipse").font(.subheadline).foregroundStyle(.secondary)
                    }
                    if !caption.isEmpty { Text(caption).foregroundStyle(.secondary) }
                    if s.owned == true {
                        Button(caption.isEmpty ? "Beschriftung hinzufügen" : "Beschriftung bearbeiten") {
                            draftCaption = caption; editingCaption = true
                        }
                        .font(.caption).buttonStyle(.borderless)
                    }
                }
                Spacer()
                Button {
                    let prev = liked; liked.toggle(); likeCount += liked ? 1 : -1
                    Task {
                        do { let st = try await Api.toggleLike(s.id); liked = st.liked; likeCount = st.like_count }
                        catch { liked = prev; likeCount += liked ? 1 : -1 }
                    }
                } label: {
                    Label("\(likeCount)", systemImage: liked ? "heart.fill" : "heart")
                        .foregroundStyle(liked ? .pink : .secondary)
                }
                .buttonStyle(.bordered)
            }

            if let ytId = youtubeId(s.youtube_url),
               let ytUrl = URL(string: s.youtube_url ?? "") {
                Link(destination: ytUrl) {
                    ZStack {
                        AsyncImage(url: URL(string: "https://img.youtube.com/vi/\(ytId)/hqdefault.jpg")) { phase in
                            switch phase {
                            case .success(let img): img.resizable().scaledToFill()
                            default: Color(.secondarySystemBackground)
                            }
                        }
                        .frame(maxWidth: .infinity).aspectRatio(16.0 / 9.0, contentMode: .fit)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        Image(systemName: "play.circle.fill")
                            .font(.system(size: 52)).foregroundStyle(.white.opacity(0.9))
                    }
                }
            }

            if !photos.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(photos) { p in
                            AsyncImage(url: Api.mediaURL(p.url)) { phase in
                                switch phase {
                                case .success(let img): img.resizable().scaledToFill()
                                default: Color(.secondarySystemBackground)
                                }
                            }
                            .frame(width: 200, height: 140)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                        }
                    }
                }
            }
            if s.owned == true {
                PhotosPicker(selection: $pickerItem, matching: .images) {
                    Label("Foto hinzufügen", systemImage: "photo.badge.plus")
                }
                .onChange(of: pickerItem) { item in
                    Task {
                        if let data = try? await item?.loadTransferable(type: Data.self) {
                            try? await Api.uploadSessionPhoto(id, data: data)
                            photos = (try? await Api.sessionPhotos(id)) ?? []
                        }
                    }
                }
            }

            if let track = s.analysis?.track_geojson, track.geometry.coordinates.count >= 2,
               let segs = s.analysis?.segments, !segs.isEmpty {
                let speeds = track.properties?.speeds_mps ?? []
                let hr = track.properties?.hr ?? []
                let pumpHz = track.properties?.pump_hz ?? []
                let hasHr = hr.contains { ($0 ?? 0) > 0 }
                let hasPump = pumpHz.contains { $0 != nil }
                let hrVals = hr.compactMap { $0 }.filter { $0 > 0 }
                let pumpVals = pumpHz.compactMap { $0 }
                let hrRange = (hrVals.min() ?? 0, hrVals.max() ?? 1)
                let pumpRange = (pumpVals.min() ?? 0, pumpVals.max() ?? 1)

                if hasHr || hasPump {
                    Picker("Färbung", selection: $colorMode) {
                        Text("Speed").tag(TrackColorMode.speed)
                        if hasHr { Text("Puls").tag(TrackColorMode.hr) }
                        if hasPump { Text("Pump").tag(TrackColorMode.pump) }
                    }
                    .pickerStyle(.segmented)
                }
                TrackMap(points: track.geometry.coordinates, speedsMps: speeds, hr: hr, pumpHz: pumpHz,
                         segments: segs, mode: colorMode, hrRange: hrRange, pumpRange: pumpRange, showPumps: showPumps)
                    .frame(height: 300).frame(maxWidth: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                if (s.analysis?.pump_count ?? 0) > 0 {
                    Toggle("Pump-Marker", isOn: $showPumps).font(.subheadline)
                }
            }
            if let a = s.analysis, let foil = s.foil, weightKg > 0 {
                PowerCard(analysis: a, foil: foil, weightKg: weightKg)
            }

            if let a = s.analysis {
                let stats = buildStats(a)
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                    ForEach(stats, id: \.0) { label, value in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(value).font(.title3).bold().foregroundStyle(Color.accentColor)
                            Text(label).font(.caption).foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                        .background(Color(.secondarySystemBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                }
                if let segs = a.segments, !segs.isEmpty { RunsTable(segments: segs) }
            } else {
                Text("Auswertung läuft noch …").foregroundStyle(.secondary)
            }
        }
        .padding()
    }

    private func dateText(_ s: SessionDetail) -> String {
        guard let d = s.startedDate else { return s.started_at }
        return d.formatted(date: .abbreviated, time: .shortened)
    }

    private func buildStats(_ a: Analysis) -> [(String, String)] {
        var out: [(String, String)] = []
        if let v = a.total_distance_m { out.append(("Strecke", "\(Int(v)) m")) }
        if let v = a.foiling_distance_m { out.append(("Foiling", "\(Int(v)) m")) }
        if let v = a.max_speed_mps { out.append(("Top-Speed", String(format: "%.1f km/h", v * 3.6))) }
        if let v = a.pump_count { out.append(("Pumps", "\(v)")) }
        if let v = a.foiling_time_s { out.append(("Foil-Zeit", String(format: "%d:%02d", Int(v) / 60, Int(v) % 60))) }
        if let v = a.avg_cadence_hz { out.append(("Cadence", String(format: "%.2f Hz", v))) }
        return out
    }

    private func load() async {
        loading = true; defer { loading = false }
        do {
            let s = try await Api.session(id)
            session = s
            liked = s.liked ?? false
            likeCount = s.like_count ?? 0
            caption = s.caption ?? ""
            photos = (try? await Api.sessionPhotos(id)) ?? []
            weightKg = ((try? await Api.settings())?["weight_kg"] as? Int).map(Double.init) ?? 0
            error = nil
        } catch { self.error = error.localizedDescription }
    }
}

enum TrackColorMode { case speed, hr, pump }

// Wert -> Farbe (blau niedrig -> rot hoch).
private func uiRampColor(_ t: Double) -> UIColor {
    let tt = min(max(t, 0), 1)
    return UIColor(hue: (1 - tt) * 240 / 360, saturation: 0.85, brightness: 0.95, alpha: 1)
}
// Speed -> Farbe (8..25 km/h), wie Web/Wear/Android.
private func uiSpeedColor(_ kmh: Double) -> UIColor { uiRampColor((kmh - 8) / (25 - 8)) }

// Annotation für einen Pump-Stoß (weißer Punkt auf dem Track).
private class PumpDot: NSObject, MKAnnotation { let coordinate: CLLocationCoordinate2D
    init(_ c: CLLocationCoordinate2D) { coordinate = c } }

// Track auf MapKit-Karte: nur die Foiling-Läufe (segments[].i_start..i_end), je Punktpaar
// nach Modus (Speed/Puls/Pump) gefärbt; Nicht-Foiling unsichtbar; optional weiße Pump-Marker.
// iOS-16-tauglich über MKMapView (neue SwiftUI-Map-Polyline-API erst ab iOS 17).
struct TrackMap: UIViewRepresentable {
    let points: [[Double]]      // [lon,lat]
    let speedsMps: [Double]
    let hr: [Int?]
    let pumpHz: [Double?]
    let segments: [Segment]
    let mode: TrackColorMode
    let hrRange: (Int, Int)
    let pumpRange: (Double, Double)
    let showPumps: Bool
    private let maxGapM = 30.0

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> MKMapView {
        let map = MKMapView()
        map.delegate = context.coordinator
        map.isRotateEnabled = false
        map.isPitchEnabled = false
        return map
    }

    private func colorAt(_ i: Int) -> UIColor {
        switch mode {
        case .speed:
            return uiSpeedColor((speedsMps.indices.contains(i) ? speedsMps[i] : 0) * 3.6)
        case .hr:
            guard let v = (hr.indices.contains(i) ? hr[i] : nil), v > 0 else { return .systemGray }
            return uiRampColor(Double(v - hrRange.0) / Double(max(hrRange.1 - hrRange.0, 1)))
        case .pump:
            guard let v = (pumpHz.indices.contains(i) ? pumpHz[i] : nil) else { return .systemGray }
            return uiRampColor((v - pumpRange.0) / max(pumpRange.1 - pumpRange.0, 1e-6))
        }
    }

    func updateUIView(_ map: MKMapView, context: Context) {
        map.removeOverlays(map.overlays)
        map.removeAnnotations(map.annotations)
        context.coordinator.colors.removeAll()
        var all: [CLLocationCoordinate2D] = []
        for seg in segments {
            let lo = max(0, min(seg.i_start, points.count - 1))
            let hi = max(0, min(seg.i_end, points.count - 1))
            var i = lo
            while i < hi {
                let a = points[i], b = points[i + 1]
                let ca = CLLocationCoordinate2D(latitude: a[1], longitude: a[0])
                let cb = CLLocationCoordinate2D(latitude: b[1], longitude: b[0])
                let gap = CLLocation(latitude: ca.latitude, longitude: ca.longitude)
                    .distance(from: CLLocation(latitude: cb.latitude, longitude: cb.longitude))
                if gap <= maxGapM {
                    let pl = MKPolyline(coordinates: [ca, cb], count: 2)
                    context.coordinator.colors[ObjectIdentifier(pl)] = colorAt(i + 1)
                    map.addOverlay(pl)
                    all.append(ca); all.append(cb)
                }
                i += 1
            }
        }
        if showPumps {
            for seg in segments {
                for idx in (seg.pump_idx ?? []) where points.indices.contains(idx) {
                    let p = points[idx]
                    map.addAnnotation(PumpDot(CLLocationCoordinate2D(latitude: p[1], longitude: p[0])))
                }
            }
        }
        if !all.isEmpty {
            let lats = all.map { $0.latitude }, lons = all.map { $0.longitude }
            let center = CLLocationCoordinate2D(
                latitude: (lats.min()! + lats.max()!) / 2,
                longitude: (lons.min()! + lons.max()!) / 2)
            let span = MKCoordinateSpan(
                latitudeDelta: max((lats.max()! - lats.min()!) * 1.3, 0.002),
                longitudeDelta: max((lons.max()! - lons.min()!) * 1.3, 0.002))
            map.setRegion(MKCoordinateRegion(center: center, span: span), animated: false)
        }
    }

    final class Coordinator: NSObject, MKMapViewDelegate {
        var colors: [ObjectIdentifier: UIColor] = [:]
        func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
            guard let pl = overlay as? MKPolyline else { return MKOverlayRenderer(overlay: overlay) }
            let r = MKPolylineRenderer(polyline: pl)
            r.strokeColor = colors[ObjectIdentifier(pl)] ?? .systemBlue
            r.lineWidth = 4
            return r
        }
        func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
            guard annotation is PumpDot else { return nil }
            let id = "pump"
            let v = mapView.dequeueReusableAnnotationView(withIdentifier: id)
                ?? MKAnnotationView(annotation: annotation, reuseIdentifier: id)
            v.annotation = annotation
            v.frame = CGRect(x: 0, y: 0, width: 7, height: 7)
            v.backgroundColor = .white
            v.layer.cornerRadius = 3.5
            v.layer.borderColor = UIColor(white: 0.06, alpha: 1).cgColor
            v.layer.borderWidth = 1
            v.isEnabled = false
            return v
        }
    }
}

// Leistungs-Karte: theoretische Pump-Leistung (W) bei Ø- und Top-Speed.
private struct PowerCard: View {
    let analysis: Analysis
    let foil: Foil
    let weightKg: Double

    var body: some View {
        let dims = FoilPhysics.FoilDims(spanCm: foil.span_cm, areaCm2: foil.area_cm2, thicknessMm: foil.thickness_mm)
        let rider = FoilPhysics.RiderParams(riderWeight: weightKg)
        let pump = analysis.avg_cadence_hz.map { FoilPhysics.PumpParams(pumpFreqHz: $0) }
        let avgKmh: Double? = (analysis.foiling_time_s ?? 0) > 0 && analysis.foiling_distance_m != nil
            ? analysis.foiling_distance_m! / analysis.foiling_time_s! * 3.6 : nil
        let topKmh = analysis.max_speed_mps.map { $0 * 3.6 }
        func watt(_ kmh: Double?) -> String {
            guard let kmh else { return "–" }
            return "\(Int(FoilPhysics.computeFoilPowerAtSpeed(foil: dims, speedKmh: kmh, rider: rider, pump: pump).power.rounded())) W"
        }
        return VStack(alignment: .leading, spacing: 6) {
            Text("Leistung (\(foil.brand) \(foil.model) \(foil.size))")
                .font(.caption).foregroundStyle(.secondary)
            HStack(spacing: 24) {
                VStack(alignment: .leading) {
                    Text(watt(avgKmh)).font(.title3).bold().foregroundStyle(Color.accentColor)
                    Text("bei Ø-Speed").font(.caption2).foregroundStyle(.secondary)
                }
                VStack(alignment: .leading) {
                    Text(watt(topKmh)).font(.title3).bold().foregroundStyle(Color.accentColor)
                    Text("bei Top-Speed").font(.caption2).foregroundStyle(.secondary)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

// Läufe-Tabelle: je Foiling-Lauf Distanz/Dauer/Ø-/Top-Speed/Pumps.
private struct RunsTable: View {
    let segments: [Segment]

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Läufe (\(segments.count))").font(.caption).foregroundStyle(.secondary)
            HStack {
                ForEach(["#", "Dist", "Zeit", "Ø", "Top", "Pumps"], id: \.self) { h in
                    Text(h).font(.caption2).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            ForEach(Array(segments.enumerated()), id: \.offset) { i, seg in
                HStack {
                    cell("\(i + 1)")
                    cell(dist(seg.distance_m ?? 0))
                    cell(dur(seg.duration_s ?? 0))
                    cell(String(format: "%.0f", (seg.avg_speed_mps ?? 0) * 3.6))
                    cell(String(format: "%.0f", (seg.max_speed_mps ?? 0) * 3.6))
                    cell((seg.pumps ?? 0) > 0 ? "\(seg.pumps!)" : "–")
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func cell(_ s: String) -> some View {
        Text(s).font(.caption).frame(maxWidth: .infinity, alignment: .leading)
    }
    private func dist(_ m: Double) -> String { m < 1000 ? "\(Int(m)) m" : String(format: "%.2f km", m / 1000) }
    private func dur(_ s: Double) -> String { String(format: "%d:%02d", Int(s) / 60, Int(s) % 60) }
}

// YouTube-Video-ID aus watch?v=, youtu.be/, shorts/, embed/ ziehen (wie web/Android).
func youtubeId(_ url: String?) -> String? {
    guard let url = url, !url.isEmpty else { return nil }
    let patterns = ["[?&]v=([\\w-]{11})", "youtu\\.be/([\\w-]{11})", "shorts/([\\w-]{11})", "embed/([\\w-]{11})"]
    for p in patterns {
        if let r = url.range(of: p, options: .regularExpression) {
            let match = String(url[r])
            if let idr = match.range(of: "[\\w-]{11}$", options: .regularExpression) {
                return String(match[idr])
            }
        }
    }
    return nil
}
