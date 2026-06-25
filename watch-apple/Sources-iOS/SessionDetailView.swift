import SwiftUI

// Session-Detail: Kopf + Track-Polyline (speed-gefärbt, ohne Kartenkacheln) +
// Speed-Verlauf-Chart + Kennzahlen. Spiegelt web/src/pages/SessionDetail.tsx.
struct SessionDetailView: View {
    let id: Int
    @State private var session: SessionDetail?
    @State private var loading = true
    @State private var error: String?
    @State private var liked = false
    @State private var likeCount = 0

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
                    if let c = s.caption, !c.isEmpty { Text(c).foregroundStyle(.secondary) }
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

            if let track = s.analysis?.track_geojson, track.geometry.coordinates.count >= 2 {
                let pts = track.geometry.coordinates
                let speedsKmh = (track.properties?.speeds_mps ?? []).map { $0 * 3.6 }
                TrackMap(points: pts, speedsKmh: speedsKmh)
                    .aspectRatio(1.3, contentMode: .fit)
                    .frame(maxWidth: .infinity)
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                if speedsKmh.count >= 2 {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Geschwindigkeit (km/h)").font(.caption).foregroundStyle(.secondary)
                        SpeedChart(speedsKmh: speedsKmh)
                            .frame(height: 120).frame(maxWidth: .infinity)
                    }
                    .padding(12)
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
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
            error = nil
        } catch { self.error = error.localizedDescription }
    }
}

// Speed -> Farbe (blau langsam -> rot schnell), wie Web/Wear/Android (8..25 km/h).
func speedColor(_ kmh: Double) -> Color {
    let t = min(max((kmh - 8) / (25 - 8), 0), 1)
    return Color(hue: (1 - t) * 240 / 360, saturation: 0.85, brightness: 0.95)
}

// Track-Polyline: BoundingBox-normiert mit cos(lat)-Längenkorrektur, speed-gefärbt.
struct TrackMap: View {
    let points: [[Double]]   // [lon,lat]
    let speedsKmh: [Double]

    var body: some View {
        Canvas { ctx, size in
            let lats = points.map { $0[1] }, lons = points.map { $0[0] }
            guard let latMin = lats.min(), let latMax = lats.max(),
                  let lonMin = lons.min(), let lonMax = lons.max() else { return }
            let latMid = (latMin + latMax) / 2
            let lonScale = cos(latMid * .pi / 180)
            let w = max((lonMax - lonMin) * lonScale, 1e-9)
            let h = max(latMax - latMin, 1e-9)
            let pad = 12.0
            let availW = size.width - 2 * pad, availH = size.height - 2 * pad
            let scale = min(availW / w, availH / h)
            let offX = pad + (availW - w * scale) / 2
            let offY = pad + (availH - h * scale) / 2
            func project(_ p: [Double]) -> CGPoint {
                CGPoint(x: (p[0] - lonMin) * lonScale * scale + offX,
                        y: (latMax - p[1]) * scale + offY)   // lat invertiert (Norden oben)
            }
            for i in 0..<(points.count - 1) {
                var path = Path()
                path.move(to: project(points[i])); path.addLine(to: project(points[i + 1]))
                let sp = speedsKmh.indices.contains(i) ? speedsKmh[i] : 0
                ctx.stroke(path, with: .color(speedsKmh.isEmpty ? .gray : speedColor(sp)),
                           style: StrokeStyle(lineWidth: 3, lineCap: .round))
            }
        }
    }
}

// Speed-Verlauf als Liniendiagramm (speed-gefärbt), Baseline 0, Top = Maxwert.
struct SpeedChart: View {
    let speedsKmh: [Double]

    var body: some View {
        Canvas { ctx, size in
            let maxV = max(speedsKmh.max() ?? 1, 1)
            let pad = 6.0
            let availW = size.width - 2 * pad, availH = size.height - 2 * pad
            var base = Path()
            base.move(to: CGPoint(x: pad, y: pad + availH)); base.addLine(to: CGPoint(x: pad + availW, y: pad + availH))
            ctx.stroke(base, with: .color(.gray.opacity(0.4)), lineWidth: 1)
            let n = speedsKmh.count
            func project(_ i: Int, _ v: Double) -> CGPoint {
                CGPoint(x: pad + availW * (n > 1 ? Double(i) / Double(n - 1) : 0),
                        y: pad + availH * (1 - v / maxV))
            }
            for i in 0..<(n - 1) {
                var path = Path()
                path.move(to: project(i, speedsKmh[i])); path.addLine(to: project(i + 1, speedsKmh[i + 1]))
                ctx.stroke(path, with: .color(speedColor((speedsKmh[i] + speedsKmh[i + 1]) / 2)),
                           style: StrokeStyle(lineWidth: 2, lineCap: .round))
            }
        }
    }
}
