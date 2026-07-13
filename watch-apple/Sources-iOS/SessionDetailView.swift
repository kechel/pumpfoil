import SwiftUI
import PhotosUI
import MapKit
import CoreLocation
import UIKit

// Session-Detail: Kopf + Track auf MapKit-Karte (nur Foiling-Segmente, speed-gefärbt) +
// Kennzahlen. Spiegelt web/src/pages/SessionDetail.tsx.
struct SessionDetailView: View {
    let id: Int
    var dataVersion: Int? = nil   // aus der Liste: erlaubt Cache-Treffer ohne Netz (nil -> immer laden)
    @AppStorage("appLang") private var lang = "de"
    @State private var session: SessionDetail?
    @State private var loading = true
    @State private var error: String?
    @State private var liked = false
    @State private var likeCount = 0
    @State private var photos: [SessionPhoto] = []
    @State private var lightbox: SessionPhoto?     // angetipptes Foto -> Vollbild
    @State private var pickerItem: PhotosPickerItem?
    @State private var colorMode: TrackColorMode = .speed
    @State private var win = 3
    @State private var showPumps = false   // Pump-Marker default aus
    @State private var selectedRun: Int?     // ausgewählter Lauf -> nur dieser farbig, Karte zoomt
    @State private var allFoils: [Foil] = []
    @State private var mineIds: Set<Int> = []
    @State private var selectedFoilId = 0
    @State private var showTrim = false
    @State private var showShare = false
    @State private var trimStart = 0.0
    @State private var trimEnd = 0.0
    @State private var weightKg = 0.0
    @State private var confirmDelete = false
    @State private var caption = ""
    @State private var editingCaption = false
    @State private var draftCaption = ""
    @State private var neighbors: Api.Neighbors?
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
        .navigationTitle(Loc.t("sd.title", lang))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            // Spot-Chat der Session (scope "spot:<name>") — für jede Session mit Spot.
            if let sp = session?.place_name, !sp.isEmpty {
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink { ChatRoomView(scope: "spot:\(sp)", title: sp) } label: {
                        Image(systemName: "bubble.left.and.bubble.right")
                    }
                }
            }
            if session?.owned == true {
                if session?.analysis?.track_geojson != nil {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { showShare = true } label: { Image(systemName: "square.and.arrow.up") }
                    }
                }
                // Pump-Label-Ansicht mobil vorerst ausgeblendet (Jan: „machen wir andermal").
                // Code (LabelingView) bleibt bestehen — nur der Toolbar-Button ist deaktiviert.
                if false {
                    ToolbarItem(placement: .topBarTrailing) {
                        NavigationLink { LabelingView(id: id) } label: { Image(systemName: "tag") }
                    }
                }
                // Trimmen/Löschen sind selten gebraucht -> nicht mehr oben, sondern unten im Body.
            } else if session != nil {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button { Task { try? await Api.vote(id, kind: "fake") } } label: {
                            Label(Loc.t("sd.reportFake", lang), systemImage: "flag")
                        }
                        Button(role: .destructive) { Task { try? await Api.vote(id, kind: "inappropriate") } } label: {
                            Label(Loc.t("sd.reportInappropriate", lang), systemImage: "exclamationmark.octagon")
                        }
                    } label: { Image(systemName: "flag") }
                }
            }
        }
        .confirmationDialog(Loc.t("sd.deleteTitle", lang), isPresented: $confirmDelete, titleVisibility: .visible) {
            Button(Loc.t("common.delete", lang), role: .destructive) {
                Task { try? await Api.deleteSession(id); dismiss() }
            }
            Button(Loc.t("common.cancel", lang), role: .cancel) {}
        }
        .alert(Loc.t("sd.caption", lang), isPresented: $editingCaption) {
            TextField(Loc.t("sd.caption", lang), text: $draftCaption)
            Button(Loc.t("common.save", lang)) {
                let c = String(draftCaption.prefix(30)).trimmingCharacters(in: .whitespaces)
                caption = c
                Task { try? await Api.setCaption(id, caption: c) }
            }
            Button(Loc.t("common.cancel", lang), role: .cancel) {}
        }
        .task { await load() }
        .onChange(of: selectedFoilId) { fid in
            if fid != (session?.foil?.id ?? 0) {
                Task { try? await Api.setSessionFoil(id, foilId: fid == 0 ? nil : fid); await load() }
            }
        }
        .sheet(isPresented: $showTrim) { trimSheet }
        .sheet(isPresented: $showShare) {
            if let s = session { ShareCardView(session: s, lang: lang) }
        }
        .fullScreenCover(item: $lightbox) { start in
            PhotoLightboxView(photos: photos, startId: start.id) { lightbox = nil }
        }
    }

    private var durSec: Double {
        guard let a = session?.startedDate, let b = session?.endedDate, b > a else { return 0 }
        return b.timeIntervalSince(a)
    }

    private var trimSheet: some View {
        NavigationStack {
            Form {
                Section("\(Loc.t("common.start", lang)): \(mmss(trimStart))") { Slider(value: $trimStart, in: 0...max(durSec, 1)) }
                Section("\(Loc.t("common.end", lang)): \(mmss(trimEnd))") { Slider(value: $trimEnd, in: 0...max(durSec, 1)) }
                Section {
                    Button(Loc.t("sd.apply", lang)) {
                        let a = min(trimStart, trimEnd), b = max(trimStart, trimEnd)
                        showTrim = false
                        Task { try? await Api.setTrim(id, startMs: Int(a * 1000), endMs: Int(b * 1000)); await load() }
                    }
                    Button(Loc.t("sd.trimReset", lang), role: .destructive) {
                        showTrim = false
                        Task { try? await Api.setTrim(id, startMs: nil, endMs: nil); await load() }
                    }
                }
            }
            .navigationTitle(Loc.t("sd.trim", lang))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(Loc.t("common.cancel", lang)) { showTrim = false } } }
        }
    }

    private func mmss(_ s: Double) -> String { String(format: "%d:%02d", Int(s) / 60, Int(s) % 60) }

    // In kleine, je einzeln type-gecheckte Helfer zerlegt (früher ein ~200-Zeilen-@ViewBuilder mit
    // >10 direkten Kindern -> Swift-Type-Checker/Archive lief exponentiell/„ewig"; vgl. CompareView).
    @ViewBuilder private func content(_ s: SessionDetail) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            neighborNav
            headerRow(s)
            foilPicker(s)      // Foil gehört zu den Metadaten (wie PWA) — direkt unter dem Kopf
            mediaSection(s)
            trackSection(s)
            if let a = s.analysis, let foil = s.foil, weightKg > 0 {
                PowerCard(analysis: a, foil: foil, weightKg: weightKg, lang: lang)
            }
            statsSection(s)
            unmergeRow(s)
            bottomActions(s)
        }
        .padding()
    }

    // Selten gebrauchte Aktionen ganz unten (wie PWA): Übertragen · Trimmen · Löschen.
    @ViewBuilder private func bottomActions(_ s: SessionDetail) -> some View {
        if s.owned == true {
            VStack(alignment: .leading, spacing: 10) {
                Divider()
                TransferPickerView(sessionId: s.id)
                HStack(spacing: 10) {
                    if durSec > 1 {
                        Button { trimStart = 0; trimEnd = durSec; showTrim = true } label: {
                            Label(Loc.t("sd.trim", lang), systemImage: "scissors")
                        }.buttonStyle(.bordered)
                    }
                    Spacer()
                    Button(role: .destructive) { confirmDelete = true } label: {
                        Label(Loc.t("common.delete", lang), systemImage: "trash")
                    }.buttonStyle(.bordered).tint(.red)
                }
            }
        }
    }

    // Vor/Zurück zu Nachbar-Sessions (wie Web).
    @ViewBuilder private var neighborNav: some View {
        if let nb = neighbors, nb.older != nil || nb.newer != nil {
            HStack {
                if let o = nb.older {
                    NavigationLink { SessionDetailView(id: o) } label: { Text(Loc.t("sd.older", lang)) }
                } else { Text(Loc.t("sd.older", lang)).foregroundStyle(.tertiary) }
                Spacer()
                if let n = nb.newer {
                    NavigationLink { SessionDetailView(id: n) } label: { Text(Loc.t("sd.newer", lang)) }
                } else { Text(Loc.t("sd.newer", lang)).foregroundStyle(.tertiary) }
            }
            .font(.subheadline)
        }
    }

    @ViewBuilder private func headerRow(_ s: SessionDetail) -> some View {
        HStack(alignment: .top, spacing: 10) {
            AvatarView(name: s.owner_name, url: Api.mediaURL(s.owner_avatar_url), size: 44)
            VStack(alignment: .leading, spacing: 4) {
                Text(dateText(s)).font(.title2).bold()
                if s.owned != true, let on = s.owner_name, !on.isEmpty {
                    Text(on).font(.subheadline).foregroundStyle(Color.accentColor)
                }
                if let p = s.place_name, !p.isEmpty {
                    Label(p, systemImage: "mappin.and.ellipse").font(.subheadline).foregroundStyle(.secondary)
                }
                if let w = s.place_water, !w.isEmpty, w != s.place_name {
                    Text(w).font(.caption).foregroundStyle(.secondary)
                }
                if let tr = timeRangeText(s) {
                    Text(tr).font(.caption).foregroundStyle(.secondary)
                }
                if let dl = s.device_label, !dl.isEmpty {
                    Label(dl, systemImage: "applewatch").font(.caption2).foregroundStyle(.secondary)
                }
                if !caption.isEmpty { Text(caption).foregroundStyle(.secondary) }
                if s.owned == true {
                    Button(caption.isEmpty ? Loc.t("sd.captionAdd", lang) : Loc.t("sd.captionEdit", lang)) {
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
                    .foregroundStyle(liked ? .pink : Color.accentColor)
            }
            .buttonStyle(.bordered)
        }
    }

    // Medien als EIN 2-Spalten-Grid (Video zuerst, dann Fotos) — gleich große 16:9-Kacheln, wie PWA/Android.
    @ViewBuilder private func mediaSection(_ s: SessionDetail) -> some View {
        let ytId = youtubeId(s.youtube_url)
        if ytId != nil || !photos.isEmpty {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                if let ytId, let ytUrl = URL(string: s.youtube_url ?? "") {
                    Link(destination: ytUrl) {
                        mediaTile {
                            AsyncImage(url: URL(string: "https://img.youtube.com/vi/\(ytId)/hqdefault.jpg")) { phase in
                                switch phase {
                                case .success(let img): img.resizable().scaledToFill()
                                default: Color(.secondarySystemBackground)
                                }
                            }
                        }
                        .overlay {
                            Image(systemName: "play.circle.fill")
                                .font(.system(size: 40)).foregroundStyle(.white.opacity(0.9))
                        }
                    }
                }
                ForEach(photos) { p in
                    mediaTile {
                        AsyncImage(url: Api.mediaURL(p.url)) { phase in
                            switch phase {
                            case .success(let img): img.resizable().scaledToFill()
                            default: Color(.secondarySystemBackground)
                            }
                        }
                    }
                    .onTapGesture { lightbox = p }
                    .overlay(alignment: .topTrailing) {
                        if s.owned == true {
                            Button {
                                Task {
                                    try? await Api.deleteSessionPhoto(id, photoId: p.id)
                                    photos = (try? await Api.sessionPhotos(id)) ?? []
                                }
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .font(.title3).foregroundStyle(.white, .black.opacity(0.55))
                                    .padding(6)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
        if s.owned == true {
            PhotosPicker(selection: $pickerItem, matching: .images) {
                Label(Loc.t("sd.addPhoto", lang), systemImage: "photo.badge.plus")
            }
            .onChange(of: pickerItem) { item in
                Task {
                    if let data = try? await item?.loadTransferable(type: Data.self) {
                        try? await Api.uploadSessionPhoto(id, data: downscaleJPEG(data))
                        photos = (try? await Api.sessionPhotos(id)) ?? []
                    }
                }
            }
        }
    }

    // 16:9-Kachel fester Größe (Breite = Grid-Spalte); Inhalt füllt + wird beschnitten.
    private func mediaTile<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        Color(.secondarySystemBackground)
            .aspectRatio(16.0 / 9.0, contentMode: .fit)
            .overlay { content() }
            .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // Schwerste Sektion: viele let-Bindungen/Tupel + Ternär. Als non-builder-Funktion mit guard +
    // AnyView -> der Type-Checker sieht die lets als normale Statements (nicht im Result-Builder).
    private func trackSection(_ s: SessionDetail) -> some View {
        guard let track = s.analysis?.track_geojson, track.geometry.coordinates.count >= 2,
              let segs = s.analysis?.segments, !segs.isEmpty else { return AnyView(EmptyView()) }
        let speeds3 = track.properties?.speeds_mps ?? []
        let speeds = colorMode == .speed ? (track.properties?.speeds?[String(win)] ?? speeds3) : speeds3
        let hr = track.properties?.hr ?? []
        let pumpHz = track.properties?.pump_hz ?? []
        let hasHr = hr.contains { ($0 ?? 0) > 0 }
        let hasPump = pumpHz.contains { $0 != nil }
        let hrVals = hr.compactMap { $0 }.filter { $0 > 0 }
        let pumpVals = pumpHz.compactMap { $0 }
        let hrRange = (hrVals.min() ?? 0, hrVals.max() ?? 1)
        let pumpRange = (pumpVals.min() ?? 0, pumpVals.max() ?? 1)
        return AnyView(VStack(alignment: .leading, spacing: 16) {
            // Farbmodus (Speed/Puls/Pump) + Marker-Umschalter in DERSELBEN Zeile.
            if hasHr || hasPump {
                HStack(spacing: 12) {
                    Picker(Loc.t("sd.coloring", lang), selection: $colorMode) {
                        Text(Loc.t("sd.colorSpeed", lang)).tag(TrackColorMode.speed)
                        if hasHr { Text(Loc.t("sd.colorPuls", lang)).tag(TrackColorMode.hr) }
                        if hasPump { Text(Loc.t("sd.colorPump", lang)).tag(TrackColorMode.pump) }
                    }
                    .pickerStyle(.segmented)
                    if (s.analysis?.pump_count ?? 0) > 0 {
                        Toggle(Loc.t("sd.markerShort", lang), isOn: $showPumps).font(.caption).fixedSize()
                    }
                }
            }
            // Glättung (nur Speed) in eigener Zeile darunter.
            if colorMode == .speed {
                HStack {
                    Picker("", selection: $win) {
                        Text("1s").tag(1); Text("3s").tag(3); Text("5s").tag(5)
                    }
                    .pickerStyle(.segmented).frame(maxWidth: 200)
                    Spacer()
                }
            }
            TrackMap(points: track.geometry.coordinates, speedsMps: speeds, hr: hr, pumpHz: pumpHz,
                     segments: segs, mode: colorMode, hrRange: hrRange, pumpRange: pumpRange,
                     showPumps: showPumps, selectedRun: selectedRun,
                     onSelectRun: { selectedRun = (selectedRun == $0) ? nil : $0 })
                .frame(height: 300).frame(maxWidth: .infinity)
                .clipShape(RoundedRectangle(cornerRadius: 12))
            colorLegend(mode: colorMode, hrRange: hrRange, pumpRange: pumpRange)
            if let sel = selectedRun {
                HStack {
                    Text("\(Loc.t("home.runs", lang)) #\(sel + 1)").font(.subheadline).foregroundStyle(Color.accentColor)
                    Button(Loc.t("sd.clearSelection", lang)) { selectedRun = nil }.font(.caption).buttonStyle(.borderless)
                }
            }
        })
    }

    // Farb-Legende (min→max Verlauf) für den gewählten Modus — wie PWA/Android.
    private func legendLabels(mode: TrackColorMode, hrRange: (Int, Int), pumpRange: (Double, Double)) -> (String, String) {
        switch mode {
        case .speed: return ("8 km/h", "25 km/h")
        case .hr: return ("\(hrRange.0)", "\(hrRange.1) bpm")
        case .pump: return (String(format: "%.1f", pumpRange.0), String(format: "%.1f Hz", pumpRange.1))
        }
    }

    private func colorLegend(mode: TrackColorMode, hrRange: (Int, Int), pumpRange: (Double, Double)) -> some View {
        let (lo, hi) = legendLabels(mode: mode, hrRange: hrRange, pumpRange: pumpRange)
        return VStack(spacing: 2) {
            LinearGradient(colors: [.blue, .cyan, .green, .yellow, .orange, .red], startPoint: .leading, endPoint: .trailing)
                .frame(height: 10).clipShape(Capsule())
            HStack { Text(lo); Spacer(); Text(hi) }.font(.caption2).foregroundStyle(.secondary)
        }
    }

    @ViewBuilder private func foilPicker(_ s: SessionDetail) -> some View {
        if s.owned == true && !allFoils.isEmpty {
            // Dropdown wie die PWA (<select>): Standard-Foil + Meine Foils + Alle Marken;
            // .menu zeigt nur den gewählten Foil (nicht alle auf einmal).
            Picker(Loc.t("sd.foilOfSession", lang), selection: $selectedFoilId) {
                Text(Loc.t("foil.useDefault", lang)).tag(0)
                ForEach(allFoils.filter { mineIds.contains($0.id) }) { f in
                    Text("\(f.brand) \(f.model) \(f.size)").tag(f.id)
                }
                ForEach(allFoils.filter { !mineIds.contains($0.id) }) { f in
                    Text("\(f.brand) \(f.model) \(f.size)").tag(f.id)
                }
            }
            .pickerStyle(.menu)
        }
    }

    @ViewBuilder private func statsSection(_ s: SessionDetail) -> some View {
        if let a = s.analysis {
            let stats = buildStats(a)
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                ForEach(stats) { st in
                    StatTile(item: st, selected: st.runIdx != nil && st.runIdx == selectedRun) {
                        if let r = st.runIdx { selectedRun = (selectedRun == r) ? nil : r }
                    }
                }
            }
            if let segs = a.segments, !segs.isEmpty {
                RunsTable(segments: segs, selected: selectedRun, lang: lang) {
                    selectedRun = (selectedRun == $0) ? nil : $0
                }
            }
        } else {
            Text(Loc.t("sd.analyzing", lang)).foregroundStyle(.secondary)
        }
    }

    // Zusammenführung wieder auflösen (nur Besitzer, ganz am Ende).
    @ViewBuilder private func unmergeRow(_ s: SessionDetail) -> some View {
        if s.owned == true, (s.merged_count ?? 0) > 0 {
            HStack {
                Text(Loc.t("merge.mergedFrom", lang)).font(.caption).foregroundStyle(.secondary)
                Spacer()
                Button(Loc.t("merge.unmerge", lang), role: .destructive) {
                    Task { try? await Api.unmergeSession(id); await load() }
                }.font(.caption)
            }
        }
    }

    private func dateText(_ s: SessionDetail) -> String {
        guard let d = s.startedDate else { return s.started_at }
        return d.formatted(date: .abbreviated, time: .shortened)
    }

    // Start–End-Zeit ("08:13 – 09:45 Uhr · Dauer 1:32"); Endzeit ggf. serverseitig aus GPS.
    private func timeRangeText(_ s: SessionDetail) -> String? {
        guard let a = s.startedDate else { return nil }
        let f = DateFormatter(); f.dateFormat = "HH:mm"
        let oc = Loc.t("sessions.oclock", lang)
        let ocSuffix = oc.isEmpty ? "" : " \(oc)"
        if let b = s.endedDate, b > a {
            let dur = Int(b.timeIntervalSince(a))
            let durS = dur >= 3600
                ? String(format: "%d:%02d:%02d", dur / 3600, (dur % 3600) / 60, dur % 60)
                : String(format: "%d:%02d", dur / 60, dur % 60)
            return "\(f.string(from: a)) – \(f.string(from: b))\(ocSuffix) · \(Loc.t("sd.duration", lang)) \(durS)"
        }
        return "\(f.string(from: a))\(ocSuffix)"
    }

    private func buildStats(_ a: Analysis) -> [StatItem] {
        let segs = a.segments ?? []
        let m = a.metrics
        func dist(_ x: Double) -> String { x < 1000 ? "\(Int(x)) m" : String(format: "%.2f km", x / 1000) }
        func mmssD(_ x: Double) -> String { String(format: "%d:%02d", Int(x) / 60, Int(x) % 60) }
        // Rekord-Läufe -> anklickbare Kacheln (Lauf auswählen).
        let bestSpeedIdx = segs.indices.max { (segs[$0].max_speed_mps ?? 0) < (segs[$1].max_speed_mps ?? 0) }
        let longestRunIdx = segs.indices.max { (segs[$0].duration_s ?? 0) < (segs[$1].duration_s ?? 0) }
        let farthestRunIdx = segs.indices.max { (segs[$0].distance_m ?? 0) < (segs[$1].distance_m ?? 0) }
        let bestGlideIdx = segs.indices.max { (segs[$0].longest_glide_s ?? 0) < (segs[$1].longest_glide_s ?? 0) }

        var out: [StatItem] = []
        if let v = a.total_distance_m { out.append(StatItem(Loc.t("compare.distance", lang), dist(v))) }
        if let v = a.foiling_distance_m { out.append(StatItem(Loc.t("home.foiling", lang), dist(v))) }
        if let v = a.foiling_time_s { out.append(StatItem(Loc.t("compare.foilTime", lang), mmssD(v))) }
        if !segs.isEmpty { out.append(StatItem(Loc.t("home.runs", lang), "\(segs.count)")) }
        if let v = m?.avg_speed_mps { out.append(StatItem(Loc.t("sd.avgSpeed", lang), String(format: "%.1f km/h", v * 3.6))) }
        if let v = a.max_speed_mps { out.append(StatItem(Loc.t("home.topSpeed", lang), String(format: "%.1f km/h", v * 3.6), runIdx: bestSpeedIdx)) }
        if let pc = a.pump_count {
            out.append(StatItem(Loc.t("home.pumps", lang), "\(pc)"))
            if pc > 0, let fd = a.foiling_distance_m { out.append(StatItem(Loc.t("sd.avgDistPerPump", lang), String(format: "%.1f m", fd / Double(pc)))) }
        }
        if let v = m?.avg_pump_hz ?? a.avg_cadence_hz { out.append(StatItem(Loc.t("sd.avgPump", lang), String(format: "%.2f Hz", v))) }
        if let v = m?.avg_hr, v > 0 { out.append(StatItem(Loc.t("sd.avgHr", lang), String(format: "%.0f", v))) }
        if let v = m?.max_hr, v > 0 { out.append(StatItem(Loc.t("sd.maxHr", lang), String(format: "%.0f", v))) }
        if let i = longestRunIdx, let v = segs[i].duration_s { out.append(StatItem(Loc.t("home.longestRun", lang), mmssD(v), runIdx: i)) }
        if let i = farthestRunIdx, let v = segs[i].distance_m { out.append(StatItem(Loc.t("home.farthestRun", lang), dist(v), runIdx: i)) }
        if let i = bestGlideIdx, let v = segs[i].longest_glide_s, v > 0 { out.append(StatItem(Loc.t("home.longestGlide", lang), String(format: "%.1f s", v), runIdx: i)) }
        return out
    }

    private func load() async {
        loading = true; defer { loading = false }
        // Cache-Treffer (data_version stimmt) -> Detail aus dem Disk-Cache, kein Netz-Fetch.
        let cached = session == nil ? SessionCache.load(id: id, expectedVersion: dataVersion) : nil
        do {
            let s: SessionDetail
            if let cached {
                s = cached
            } else {
                s = try await Api.session(id)
                SessionCache.store(s)
            }
            session = s
            neighbors = try? await Api.sessionNeighbors(id)
            liked = s.liked ?? false
            likeCount = s.like_count ?? 0
            caption = s.caption ?? ""
            selectedFoilId = s.foil?.id ?? 0
            photos = (try? await Api.sessionPhotos(id)) ?? []
            let settings = (try? await Api.settings()) ?? [:]
            weightKg = (settings["weight_kg"] as? Int).map(Double.init) ?? 0
            if s.owned == true {
                mineIds = Set((settings["my_foils"] as? [Any])?.compactMap { $0 as? Int } ?? [])
                allFoils = (try? await Api.foils()) ?? []
            }
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
    let selectedRun: Int?
    let onSelectRun: (Int) -> Void
    private let maxGapM = 30.0

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> MKMapView {
        let map = MKMapView()
        map.delegate = context.coordinator
        map.isRotateEnabled = false
        map.isPitchEnabled = false
        let tap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.handleTap(_:)))
        map.addGestureRecognizer(tap)
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
        let co = context.coordinator
        co.colors.removeAll(); co.widths.removeAll()
        co.points = points; co.segments = segments; co.onSelectRun = onSelectRun
        var all: [CLLocationCoordinate2D] = []
        var sel: [CLLocationCoordinate2D] = []
        for (runIdx, seg) in segments.enumerated() {
            let dim = selectedRun != nil && runIdx != selectedRun   // anderer Lauf -> ausgegraut
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
                    co.colors[ObjectIdentifier(pl)] = dim ? UIColor.systemGray.withAlphaComponent(0.5) : colorAt(i + 1)
                    co.widths[ObjectIdentifier(pl)] = dim ? 2.5 : 5
                    map.addOverlay(pl)
                    all.append(ca); all.append(cb)
                    if !dim { sel.append(ca); sel.append(cb) }
                }
                i += 1
            }
            // Pump-Marker nur für den (ggf. ausgewählten) Lauf, nicht für gedimmte.
            if showPumps && !dim {
                for idx in (seg.pump_idx ?? []) where points.indices.contains(idx) {
                    let p = points[idx]
                    map.addAnnotation(PumpDot(CLLocationCoordinate2D(latitude: p[1], longitude: p[0])))
                }
            }
        }
        // Auf den ausgewählten Lauf zoomen, sonst auf alle Foiling-Läufe.
        let fit = (selectedRun != nil && !sel.isEmpty) ? sel : all
        if !fit.isEmpty {
            let lats = fit.map { $0.latitude }, lons = fit.map { $0.longitude }
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
        var widths: [ObjectIdentifier: CGFloat] = [:]
        var points: [[Double]] = []
        var segments: [Segment] = []
        var onSelectRun: ((Int) -> Void)?

        func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
            guard let pl = overlay as? MKPolyline else { return MKOverlayRenderer(overlay: overlay) }
            let r = MKPolylineRenderer(polyline: pl)
            r.strokeColor = colors[ObjectIdentifier(pl)] ?? .systemBlue
            r.lineWidth = widths[ObjectIdentifier(pl)] ?? 4
            return r
        }
        func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
            guard annotation is PumpDot else { return nil }
            let id = "pump"
            let v = mapView.dequeueReusableAnnotationView(withIdentifier: id)
                ?? MKAnnotationView(annotation: annotation, reuseIdentifier: id)
            v.annotation = annotation
            v.frame = CGRect(x: 0, y: 0, width: 9, height: 9)   // sichtbar, aber dezent
            v.backgroundColor = .white
            v.layer.cornerRadius = 4.5
            v.layer.borderColor = UIColor(white: 0.06, alpha: 1).cgColor
            v.layer.borderWidth = 1.5
            v.isEnabled = false
            return v
        }

        // Tipp auf die Karte -> nächstgelegenen Foiling-Lauf auswählen (≤ ~40 m am Bildschirm).
        @objc func handleTap(_ g: UITapGestureRecognizer) {
            guard let map = g.view as? MKMapView, let onSel = onSelectRun else { return }
            let pt = g.location(in: map)
            let coord = map.convert(pt, toCoordinateFrom: map)
            let tapLoc = CLLocation(latitude: coord.latitude, longitude: coord.longitude)
            var best: (run: Int, d: CLLocationDistance)?
            for (runIdx, seg) in segments.enumerated() {
                let lo = max(0, min(seg.i_start, points.count - 1))
                let hi = max(0, min(seg.i_end, points.count - 1))
                guard lo <= hi else { continue }
                for i in lo...hi where points.indices.contains(i) {
                    let p = points[i]
                    let d = tapLoc.distance(from: CLLocation(latitude: p[1], longitude: p[0]))
                    if best == nil || d < best!.d { best = (runIdx, d) }
                }
            }
            // Schwelle relativ zur Zoomstufe: 5 % der sichtbaren Breite.
            let span = map.region.span.longitudeDelta
            let threshM = max(40.0, span * 111_000 * 0.05)
            if let b = best, b.d <= threshM { onSel(b.run) }
        }
    }
}

// Leistungs-Karte: theoretische Pump-Leistung (W) bei Ø- und Top-Speed.
private struct PowerCard: View {
    let analysis: Analysis
    let foil: Foil
    let weightKg: Double
    let lang: String

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
            Text("\(Loc.t("sd.power", lang)) (\(foil.brand) \(foil.model) \(foil.size))")
                .font(.caption).foregroundStyle(.secondary)
            HStack(spacing: 24) {
                VStack(alignment: .leading) {
                    Text(watt(avgKmh)).font(.title3).bold().foregroundStyle(Color.accentColor)
                    Text(Loc.t("sd.atAvg", lang)).font(.caption2).foregroundStyle(.secondary)
                }
                VStack(alignment: .leading) {
                    Text(watt(topKmh)).font(.title3).bold().foregroundStyle(Color.accentColor)
                    Text(Loc.t("sd.atTop", lang)).font(.caption2).foregroundStyle(.secondary)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

// Läufe-Tabelle: je Foiling-Lauf Distanz/Dauer/Ø-/Top-Speed/Pumps. Zeile antippen -> Lauf auswählen
// (Karte zeigt dann nur diesen farbig); ausgewählte Zeile ist hervorgehoben.
private struct RunsTable: View {
    let segments: [Segment]
    let selected: Int?
    let lang: String
    let onSelect: (Int) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("\(Loc.t("home.runs", lang)) (\(segments.count))").font(.caption).foregroundStyle(.secondary)
            HStack {
                ForEach(["#", Loc.t("sd.hDist", lang), Loc.t("field.3", lang), "Ø", "Top", Loc.t("home.pumps", lang)], id: \.self) { h in
                    Text(h).font(.caption2).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            ForEach(Array(segments.enumerated()), id: \.offset) { i, seg in
                let sel = selected == i
                HStack {
                    cell("\(i + 1)", sel)
                    cell(dist(seg.distance_m ?? 0), sel)
                    cell(dur(seg.duration_s ?? 0), sel)
                    cell(String(format: "%.0f", (seg.avg_speed_mps ?? 0) * 3.6), sel)
                    cell(String(format: "%.0f", (seg.max_speed_mps ?? 0) * 3.6), sel)
                    cell((seg.pumps ?? 0) > 0 ? "\(seg.pumps!)" : "–", sel)
                }
                .padding(.vertical, 4).padding(.horizontal, 4)
                .background(sel ? Color.accentColor.opacity(0.16) : .clear)
                .clipShape(RoundedRectangle(cornerRadius: 6))
                .contentShape(Rectangle())
                .onTapGesture { onSelect(i) }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func cell(_ s: String, _ sel: Bool) -> some View {
        Text(s).font(.caption).foregroundStyle(sel ? Color.accentColor : Color.primary)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
    private func dist(_ m: Double) -> String { m < 1000 ? "\(Int(m)) m" : String(format: "%.2f km", m / 1000) }
    private func dur(_ s: Double) -> String { String(format: "%d:%02d", Int(s) / 60, Int(s) % 60) }
}

// Eine Kennzahl-Kachel; runIdx != nil => an einen Lauf gebunden (antippen -> Lauf auswählen).
struct StatItem: Identifiable {
    let label: String
    let value: String
    let runIdx: Int?
    let id = UUID()
    init(_ label: String, _ value: String, runIdx: Int? = nil) {
        self.label = label; self.value = value; self.runIdx = runIdx
    }
}

private struct StatTile: View {
    let item: StatItem
    let selected: Bool
    let onTap: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(item.value).font(.title3).bold().foregroundStyle(Color.accentColor)
            Text(item.label).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(selected ? Color.accentColor.opacity(0.18) : Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(item.runIdx != nil ? Color.accentColor.opacity(0.35) : .clear, lineWidth: 1))
        .contentShape(Rectangle())
        .onTapGesture { if item.runIdx != nil { onTap() } }
    }
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

// Vollbild-Foto-Ansicht: tippen schließt, bei mehreren Fotos horizontal wischen.
private struct PhotoLightboxView: View {
    let photos: [SessionPhoto]
    let startId: Int
    let onClose: () -> Void
    @State private var sel: Int = 0

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            TabView(selection: $sel) {
                ForEach(photos) { p in
                    AsyncImage(url: Api.mediaURL(p.url)) { phase in
                        switch phase {
                        case .success(let img): img.resizable().scaledToFit()
                        default: ProgressView()
                        }
                    }
                    .tag(p.id)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: photos.count > 1 ? .automatic : .never))
        }
        // Sichtbares Schließen-Steuerelement (X oben rechts) — Tap aufs Bild schliesst zusätzlich.
        .overlay(alignment: .topTrailing) {
            Button { onClose() } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.title)
                    .foregroundStyle(.white.opacity(0.9))
                    .padding(12)
                    .shadow(radius: 4)
            }
        }
        .onTapGesture { onClose() }
        .onAppear { sel = startId }
    }
}
