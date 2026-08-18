import SwiftUI
import MapKit
import CoreLocation
import UIKit

// Mehrere eigene Sessions nebeneinander vergleichen. Auswahl kommt AUSSCHLIESSLICH per
// Long-Press aus den Session-Listen (CompareStore/preselect) — keine eigene Auswahlliste hier.
struct CompareView: View {
    // Eintraege des Korbs in ihrer REIHENFOLGE (ganze Session oder ein einzelner Lauf) —
    // genau wie `refs` in web/src/pages/Compare.tsx. Die Reihenfolge bestimmt die Farbzuordnung,
    // und dieselbe Session darf zweimal drin sein, wenn zwei ihrer Laeufe verglichen werden.
    var preselect: [CompareRef] = []
    @AppStorage("appLang") private var lang = "de"
    // Beobachtet die Anzeige-Einheit der Pump-Kadenz -> Umschalten wirkt sofort (PumpUnit.swift).
    @AppStorage(PumpUnit.storeKey) private var pumpUnit = "hz"
    // Fahrergewicht fuer die Leistungs-Kennzahl (Profil). 0 = unbekannt -> die Karte bleibt leer,
    // genau wie in der PWA, wo powerOf() ohne Gewicht oder Foil-Masse nil liefert.
    @State private var weightKg: Double = 0
    // Je Korb-Eintrag der geladene Datensatz. `results` bleibt als abgeleitete Liste bestehen,
    // damit Karte, Legende und Farbpalette unveraendert damit arbeiten koennen.
    @State private var items: [(ref: CompareRef, s: SessionDetail)] = []
    private var results: [SessionDetail] { items.map(\.s) }
    @State private var loading = true
    @State private var merging = false
    @State private var mergeError: String?
    @State private var mergedId: Int?
    @State private var mapMode: CompareColorMode = .track
    @State private var mapWin = 3          // Glättungsfenster für Speed-Färbung
    @State private var mapFull = false     // Vollbild-Karte

    // Zerlegt, weil Swift einen ViewBuilder als EINEN Ausdruck auflöst: Ladezustand, Inhalt,
    // Merge-Fußzeile samt Task-Closure und das Binding der navigationDestination steckten in
    // einem Ausdruck. Reihenfolge, Layout und Texte sind unverändert.
    var body: some View {
        // Kein eigener NavigationStack: View wird gepusht und nutzt den vorhandenen Stack.
        Group {
            if loading {
                ProgressView()
            } else if results.isEmpty {
                Text(Loc.t("compare.pick", lang)).foregroundStyle(.secondary).padding()
            } else {
                resultsBody
            }
        }
        .navigationDestination(isPresented: mergedBinding) { mergedDestination }
        .navigationTitle(Loc.t("compare.title", lang))
        .task { await load() }
    }

    private var resultsBody: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    compareMapSection
                    compareTable
                    allRunsSection
                }
                .padding(.vertical)
            }
            mergeFooter
        }
    }

    // Merge-Hinweis + Button unten fixiert (nur wenn zusammenführbar).
    @ViewBuilder private var mergeFooter: some View {
        if mergeable {
            VStack(spacing: 8) {
                Text(Loc.t("merge.compareHint", lang))
                    .font(.caption).foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if let mergeError { Text(mergeError).font(.caption).foregroundStyle(.red) }
                mergeButton
            }
            .padding()
            .background(.ultraThinMaterial)
        } else if let mergeError {
            Text(mergeError).font(.caption).foregroundStyle(.red).padding()
        }
    }

    private var mergeButton: some View {
        Button { merge() } label: { Text(Loc.t("merge.action", lang)).frame(maxWidth: .infinity) }
            .buttonStyle(.borderedProminent)
            .disabled(merging)
    }

    private var mergedBinding: Binding<Bool> {
        Binding(get: { mergedId != nil }, set: { if !$0 { mergedId = nil } })
    }

    @ViewBuilder private var mergedDestination: some View {
        if let id = mergedId { SessionDetailView(id: id) }
    }

    // Ablauflogik aus dem Button-Closure heraus.
    private func merge() {
        mergeError = nil; merging = true
        Task {
            do { mergedId = try await Api.mergeSessions(Array(Set(preselect.map(\.sessionId)))) }
            catch { mergeError = error.localizedDescription }
            merging = false
        }
    }

    private func load() async {
        // Jede Session nur EINMAL laden, auch wenn zwei ihrer Laeufe im Korb liegen.
        var geladen: [Int: SessionDetail] = [:]
        for id in Set(preselect.map(\.sessionId)) {
            if let d = try? await Api.session(id) { geladen[id] = d }
        }
        // Reihenfolge des Korbs beibehalten (bestimmt die Farbe) — NICHT nach Datum sortieren,
        // sonst wandert die Farbe eines Eintrags, wenn ein zweiter Lauf dazukommt.
        items = preselect.compactMap { r in geladen[r.sessionId].map { (ref: r, s: $0) } }
        let einst = (try? await Api.settings()) ?? [:]
        weightKg = (einst["weight_kg"] as? Int).map(Double.init) ?? 0
        // Default-Färbung wie PWA: bei mehreren Fahrern „Je Fahrer", sonst „Je Track".
        if Set(results.compactMap { $0.owner_name }).count > 1 { mapMode = .rider }
        loading = false
    }

    // Zusammenführen nur, wenn plausibel erlaubt (Client-Spiegel; Server prüft final): alle
    // eigene Sessions, >=2, gleicher Tag UND gleicher Spot.
    private var mergeable: Bool {
        // Einzelne Laeufe lassen sich nicht zusammenfuehren (wie `mergeableIds` in der PWA:
        // `if (refs.some(r => r.runIdx != null)) return null`).
        guard preselect.allSatisfy({ $0.runIdx == nil }) else { return false }
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
    // Fahrer (in Reihenfolge des Auftretens) -> Farbe; gleicher Fahrer -> gleiche Farbe.
    private var riderList: [String] {
        var seen = Set<String>(); var out: [String] = []
        for s in results { let n = s.owner_name ?? "—"; if !seen.contains(n) { seen.insert(n); out.append(n) } }
        return out
    }
    private func riderColorC(_ name: String?) -> Color { sessColor(riderList.firstIndex(of: name ?? "—") ?? 0) }
    private func riderUIColor(_ name: String?) -> UIColor { sessUIColor(riderList.firstIndex(of: name ?? "—") ?? 0) }
    private func foilLabel(_ s: SessionDetail) -> String? {
        guard let f = s.foil else { return nil }
        return "\(f.brand) \(f.model) \(f.size)".trimmingCharacters(in: .whitespaces)
    }

    // Verfügbare Daten über alle Sessions (für die Modus-Auswahl).
    private var hasPumpData: Bool { results.contains { ($0.analysis?.track_geojson?.properties?.pump_hz ?? []).contains { $0 != nil } } }
    private var hasHrData: Bool { results.contains { ($0.analysis?.track_geojson?.properties?.hr ?? []).contains { ($0 ?? 0) > 0 } } }

    // CompareMap.Track je Session mit allen Punkt-Daten (windowed Speed, Pump, Puls).
    private var mapTracks: [CompareMap.Track] {
        items.enumerated().compactMap { i, it in
            let s = it.s
            guard let t = s.analysis?.track_geojson, t.geometry.coordinates.count >= 2,
                  let alle = s.analysis?.segments, !alle.isEmpty else { return nil }
            // Die Karte zeichnet nur innerhalb i_start..i_end je Segment — bei einem Lauf-Eintrag
            // reicht es also, genau dieses Segment mitzugeben, dann erscheint nur dieser Lauf.
            let segs = it.ref.runIdx.flatMap { alle.indices.contains($0) ? [alle[$0]] : nil } ?? alle
            if segs.isEmpty { return nil }
            let sp = (t.properties?.speeds?[String(mapWin)] ?? t.properties?.speeds_mps ?? []).map { $0 * 3.6 }
            return CompareMap.Track(points: t.geometry.coordinates, segments: segs, color: sessUIColor(i),
                                    riderColor: riderUIColor(s.owner_name),
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
                let lo: Int = max(0, seg.i_start), hi: Int = min(seg.i_end, tr.speedsKmh.count - 1)
                if lo <= hi { for i in lo...hi where tr.speedsKmh[i] > 0 { v.append(tr.speedsKmh[i]) } }
            }
        }
        return (v.min().map { max(0, $0) } ?? 8, v.max() ?? 25)
    }

    @ViewBuilder private var compareMapSection: some View {
        let tracks: [CompareMap.Track] = mapTracks
        if !tracks.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                sessionChips
                mapControls
                compareMap(tracks)
                    .frame(height: 240)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .padding(.horizontal)
                if mapMode != .rider && mapMode != .track { gradientLegend }
            }
            .fullScreenCover(isPresented: $mapFull) { fullscreenMap(tracks) }
        }
    }

    // Karte einmal typisiert bauen (Normal- und Vollbild-Ansicht teilen dieselben Parameter).
    private func compareMap(_ tracks: [CompareMap.Track]) -> CompareMap {
        CompareMap(tracks: tracks, mode: mapMode, pumpRange: pumpRange, hrRange: hrRange, speedRange: speedRange)
    }

    private func fullscreenMap(_ tracks: [CompareMap.Track]) -> some View {
        ZStack(alignment: .topTrailing) {
            compareMap(tracks)
                .ignoresSafeArea()
            Button { mapFull = false } label: {
                Image(systemName: "xmark.circle.fill").font(.title).foregroundStyle(.white, .black.opacity(0.5))
            }.padding()
        }
    }

    // Färbungs-/Glättungs-Auswahl + Vollbild.
    @ViewBuilder private var mapControls: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                colorModePicker
                Button { mapFull = true } label: { Image(systemName: "arrow.up.left.and.arrow.down.right") }
                    .padding(.leading, 6)
            }
            if mapMode == .speed { smoothingPicker }
        }
        .padding(.horizontal)
    }

    // Beide Picker bleiben als Ganzes eine Teil-View — .tag() muss direktes Kind bleiben.
    private var colorModePicker: some View {
        Picker(Loc.t("sd.coloring", lang), selection: $mapMode) {
            if riderList.count > 1 { Text(Loc.t("compare.colorRider", lang)).tag(CompareColorMode.rider) }
            Text(Loc.t("compare.colorTrack", lang)).tag(CompareColorMode.track)
            Text(Loc.t("sd.colorSpeed", lang)).tag(CompareColorMode.speed)
            if hasPumpData { Text(Loc.t("sd.colorPump", lang)).tag(CompareColorMode.pump) }
            if hasHrData { Text(Loc.t("sd.colorPuls", lang)).tag(CompareColorMode.hr) }
        }
        .pickerStyle(.segmented)
    }

    private var smoothingPicker: some View {
        Picker(Loc.t("sd.smoothing", lang), selection: $mapWin) {
            Text("1s").tag(1); Text("3s").tag(3); Text("5s").tag(5)
        }.pickerStyle(.segmented)
    }

    // Chips oben (wie PWA): je Session Farbe · Fahrer · Datum · Foil. Farbe = aktueller Modus.
    @ViewBuilder private var sessionChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                // Identitaet ueber den Korb-Eintrag, nicht die Session: dieselbe Session darf
                // zweimal vorkommen (zwei Laeufe), Session-ids waeren dann doppelt.
                ForEach(Array(items.enumerated()), id: \.element.ref.id) { i, it in
                    sessionChip(i, it.s, it.ref)
                }
            }
            .padding(.horizontal)
        }
    }

    private func sessionChip(_ i: Int, _ s: SessionDetail, _ ref: CompareRef) -> some View {
        HStack(spacing: 6) {
            Circle().fill(dotColor(i, s)).frame(width: 10, height: 10)
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 4) {
                    if let o = s.owner_name, !o.isEmpty { Text(o).font(.caption).bold() }
                    // Bei einem Lauf-Eintrag steht die Lauf-Nummer vor dem Datum (PWA: itemLabel).
                    if let ri = ref.runIdx {
                        Text(Loc.t("compare.run", lang).replacingOccurrences(of: "{n}", with: String(ri + 1)))
                            .font(.caption).bold().foregroundStyle(Color.accentColor)
                    }
                    Text(dateStr(s))
                        .font(.caption).foregroundStyle(.secondary)
                }
                if let fl = foilLabel(s) {
                    Label(fl, systemImage: "water.waves").font(.caption2).foregroundStyle(.secondary).labelStyle(.titleAndIcon)
                }
            }
        }
        .padding(.horizontal, 10).padding(.vertical, 6)
        .background(Color(.secondarySystemBackground), in: Capsule())
    }

    // Punkt-Farbe je Modus — als Helfer statt Ternary direkt im .fill()-Modifier.
    private func dotColor(_ i: Int, _ s: SessionDetail) -> Color {
        mapMode == .rider ? riderColorC(s.owner_name) : sessColor(i)
    }

    // Einheit der Karten-Legende je Modus (Pump: Hz oder Pumps/min, siehe PumpUnit.swift).
    private var unitLabel: String {
        if mapMode == .pump { return PumpUnit.unitLabel(lang) }
        return mapMode == .hr ? "bpm" : "km/h"
    }

    // Farbverlauf-Legende für Wert-Modi (Speed/Pump/Puls).
    private func rangeStr(_ v: Double) -> String {
        if mapMode == .pump { return PumpUnit.fmtLegend(v, lang, withUnit: false) }
        return "\(Int(v))"
    }
    // Wertebereich der Legende: verschachteltes Ternary raus aus dem ViewBuilder.
    private var legendRange: (Double, Double) {
        if mapMode == .pump { return pumpRange }
        if mapMode == .hr { return hrRange }
        return speedRange
    }

    private var legendGradient: LinearGradient {
        LinearGradient(colors: [Color(hue: 240 / 360, saturation: 0.85, brightness: 0.95),
                                Color(hue: 120 / 360, saturation: 0.85, brightness: 0.95),
                                Color(hue: 0, saturation: 0.85, brightness: 0.95)],
                       startPoint: .leading, endPoint: .trailing)
    }

    private var gradientLegend: some View {
        let range: (Double, Double) = legendRange
        return HStack(spacing: 8) {
            Text(rangeStr(range.0)).font(.caption2).monospacedDigit()
            legendGradient.frame(height: 8).clipShape(Capsule())
            Text(rangeStr(range.1)).font(.caption2).monospacedDigit()
            Text(unitLabel).font(.caption2).foregroundStyle(.secondary)
        }.padding(.horizontal)
    }

    // Alle Foiling-Läufe aller verglichenen Sessions als flache Liste (wie PWA AllRunsTable).
    @ViewBuilder private var allRunsSection: some View {
        // Ganze Session -> alle ihre Laeufe; Lauf-Eintrag -> genau dieser eine (wie die PWA:
        // `it.ref.runIdx != null ? [it.ref.runIdx] : segments.map((_, i) => i)`).
        let runs: [(Int, SessionDetail, Int, Segment)] = items.enumerated().flatMap { k, it -> [(Int, SessionDetail, Int, Segment)] in
            let segs = it.s.analysis?.segments ?? []
            if let ri = it.ref.runIdx {
                guard segs.indices.contains(ri) else { return [] }
                return [(k, it.s, ri, segs[ri])]
            }
            return segs.enumerated().map { (k, it.s, $0.offset, $0.element) }
        }
        if !runs.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                Text(Loc.t("compare.runsTitle", lang)).font(.headline).padding(.horizontal).padding(.bottom, 6)
                ForEach(Array(runs.enumerated()), id: \.offset) { _, r in
                    let (k, s, idx, seg) = r
                    runRow(k, s, idx, seg)
                    Divider()
                }
            }
        }
    }

    private func runRow(_ korbIdx: Int, _ s: SessionDetail, _ idx: Int, _ seg: Segment) -> some View {
        HStack(spacing: 10) {
            Text("\(idx + 1)").font(.caption2).bold().foregroundStyle(Color.accentColor)
                .frame(width: 22, height: 22).background(Color.accentColor.opacity(0.12), in: Circle())
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 5) {
                    Circle().fill(runDotColor(korbIdx, s)).frame(width: 7, height: 7)
                    if let o = s.owner_name, !o.isEmpty { Text(o).font(.caption).bold() }
                    Text(dateStr(s)).font(.caption).foregroundStyle(.secondary)
                }
                if let p = s.place_name, !p.isEmpty { Text(p).font(.caption2).foregroundStyle(.secondary) }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 1) {
                Text(runDist(seg)).font(.caption).monospacedDigit()
                Text(runStat(seg))
                    .font(.caption2).foregroundStyle(.secondary).monospacedDigit()
            }
        }
        .padding(.horizontal).padding(.vertical, 6)
    }

    // Farbe der Lauf-Zeile. Sie haengt am KORB-INDEX, nicht an der Session: liegt dieselbe
    // Session zweimal im Korb (zwei ihrer Laeufe), muessen die beiden Zeilen verschiedene Farben
    // haben — genau wie in der PWA, wo die Farbe am Eintrag haengt (`it.color`).
    private func runDotColor(_ korbIdx: Int, _ s: SessionDetail) -> Color {
        if mapMode == .rider { return riderColorC(s.owner_name) }
        return sessColor(korbIdx)
    }

    private func mmss(_ s: Double?) -> String {
        guard let s else { return "–" }
        return String(format: "%d:%02d", Int(s) / 60, Int(s) % 60)
    }
    // Explizit typisierte Helfer — entlasten den Swift-Type-Checker (Archive/Release kippt sonst
    // bei verschachtelten .map{}??-Interpolationen -> „unendliches" Kompilieren).
    private func kmh(_ mps: Double?) -> String { guard let v = mps else { return "–" }; return String(format: "%.1f km/h", v * 3.6) }
    private func pumpsStr(_ p: Int?) -> String { guard let p else { return "–" }; return "\(p)P" }
    private func runDist(_ seg: Segment) -> String { "\(Int(seg.distance_m ?? 0)) m · \(mmss(seg.duration_s))" }
    private func runStat(_ seg: Segment) -> String { "\(kmh(seg.avg_speed_mps)) · \(pumpsStr(seg.pumps))" }
    private func dateStr(_ s: SessionDetail) -> String { TimeFmt.dateTime(s.started_at, s.tz) ?? s.started_at }

    // Kennzahl-Zeilen der Tabelle: Array aus Tupeln mit Closures — vorab typisiert, nicht im
    // ViewBuilder. Spaltenbreiten explizit CGFloat.
    /// Eine Vergleichs-Kennzahl. `dir` = Richtung des Bestwerts ("max"/"min"), nil = nicht markieren.
    private struct CmpMetric {
        let label: String
        let unit: String?
        let dir: String?
        let fmt: (Double) -> String
        let wert: (CompareRef, SessionDetail) -> Double?
    }

    /// Bestwert je Segment-Kennzahl ueber alle Laeufe einer Session (PWA: `bestSeg`).
    private func bestSeg(_ segs: [Segment], _ getter: (Segment) -> Double?, _ besser: (Double, Double) -> Bool) -> Double? {
        var b: Double? = nil
        for s in segs {
            if let v = getter(s), b == nil || besser(v, b!) { b = v }
        }
        return b
    }

    /// Das referenzierte Segment, oder nil bei einem Eintrag fuer die ganze Session.
    private func lauf(_ r: CompareRef, _ s: SessionDetail) -> Segment? {
        guard let i = r.runIdx, let segs = s.analysis?.segments, segs.indices.contains(i) else { return nil }
        return segs[i]
    }

    /// Watt wie die PWA (`powerOf`): ohne Pump-Kadenz kommen pauschal 50 W Traegheitsanteil dazu.
    private func watt(_ s: SessionDetail, _ mps: Double?, _ hz: Double?) -> Double? {
        guard let fo = s.foil, fo.span_cm > 0, fo.area_cm2 > 0, fo.thickness_mm > 0,
              weightKg > 0, let mps, mps > 0 else { return nil }
        let dims = FoilPhysics.FoilDims(spanCm: fo.span_cm, areaCm2: fo.area_cm2, thicknessMm: fo.thickness_mm)
        let rider = FoilPhysics.RiderParams(riderWeight: weightKg)
        let pump: FoilPhysics.PumpParams? = (hz ?? 0) > 0 ? FoilPhysics.PumpParams(pumpFreqHz: hz!) : nil
        let r = FoilPhysics.computeFoilPowerAtSpeed(foil: dims, speedKmh: mps * 3.6, rider: rider, pump: pump)
        return (r.dragPower + (pump != nil ? r.inertiaPower : 50.0)).rounded()
    }

    /// Die 15 Kennzahlen des Vergleichs, 1:1 aus `statsFor` in web/src/pages/Compare.tsx —
    /// inklusive des Zweigs fuer einen LAUF-Eintrag: dort kommen die Werte aus dem Segment,
    /// Lauf-Anzahl und Puls bleiben leer (ein Lauf hat keine Anzahl, Puls liegt nur session-weit vor).
    ///
    /// Bewusst Schritt fuer Schritt angehaengt statt als EIN Array-Literal: fuenfzehn Eintraege mit
    /// Closures in einem Ausdruck sind fuer den Swift-Type-Checker sehr teuer — dieselbe Falle, die
    /// in Loc.swift die Uebersetzungstabellen in Bloecke zerlegt hat.
    private var cmpMetrics: [CmpMetric] {
        let w = mapWin
        func mmssF(_ v: Double) -> String { String(format: "%d:%02d", Int(v) / 60, Int(v) % 60) }
        func einF(_ v: Double) -> String { String(format: "%.1f", v) }
        func ganzF(_ v: Double) -> String { String(format: "%.0f", v) }
        func segsOf(_ s: SessionDetail) -> [Segment] { s.analysis?.segments ?? [] }
        var out: [CmpMetric] = []
        out.append(CmpMetric(label: Loc.t("stat.foiling", lang), unit: "km", dir: "max",
                             fmt: { String(format: "%.2f", $0) }, wert: { r, s in
            if let l = self.lauf(r, s) { return (l.distance_m ?? 0) / 1000 }
            return s.analysis?.foiling_distance_m.map { $0 / 1000 }
        }))
        out.append(CmpMetric(label: Loc.t("stat.foilingTime", lang), unit: "min:s", dir: "max",
                             fmt: mmssF, wert: { r, s in
            self.lauf(r, s)?.duration_s ?? s.analysis?.foiling_time_s
        }))
        out.append(CmpMetric(label: Loc.t("stat.runs", lang), unit: nil, dir: "max",
                             fmt: ganzF, wert: { r, s in
            if r.runIdx != nil { return nil }
            let n = segsOf(s).count
            return n > 0 ? Double(n) : nil
        }))
        out.append(CmpMetric(label: Loc.t("sd.avgSpeed", lang), unit: "km/h", dir: "max",
                             fmt: einF, wert: { r, s in
            (self.lauf(r, s)?.avg_speed_mps ?? s.analysis?.metrics?.avg_speed_mps).map { $0 * 3.6 }
        }))
        out.append(CmpMetric(label: Loc.t("power.title", lang), unit: "W", dir: nil,
                             fmt: ganzF, wert: { r, s in
            if let l = self.lauf(r, s) { return self.watt(s, l.avg_speed_mps, l.avg_pump_hz) }
            return self.watt(s, s.analysis?.metrics?.avg_speed_mps, s.analysis?.metrics?.avg_pump_hz)
        }))
        let maxLbl = Loc.t("sd.maxSpeed", lang).replacingOccurrences(of: "{win}", with: String(w))
        out.append(CmpMetric(label: maxLbl, unit: "km/h", dir: "max", fmt: einF, wert: { r, s in
            if let l = self.lauf(r, s) { return l.fenster(w, "max").map { $0 * 3.6 } }
            return self.bestSeg(segsOf(s), { $0.fenster(w, "max") }, { $0 > $1 }).map { $0 * 3.6 }
        }))
        let minLbl = Loc.t("sd.minSpeed", lang).replacingOccurrences(of: "{win}", with: String(w))
        out.append(CmpMetric(label: minLbl, unit: "km/h", dir: nil, fmt: einF, wert: { r, s in
            if let l = self.lauf(r, s) { return l.fenster(w, "min").map { $0 * 3.6 } }
            return self.bestSeg(segsOf(s), { $0.fenster(w, "min") }, { $0 < $1 }).map { $0 * 3.6 }
        }))
        out.append(CmpMetric(label: Loc.t("sd.maxGlide", lang), unit: "s", dir: "max",
                             fmt: einF, wert: { r, s in
            self.lauf(r, s)?.longest_glide_s ?? self.bestSeg(segsOf(s), { $0.longest_glide_s }, { $0 > $1 })
        }))
        out.append(CmpMetric(label: Loc.t("stat.pumps", lang), unit: nil, dir: nil,
                             fmt: ganzF, wert: { r, s in
            if let l = self.lauf(r, s) { return l.pumps.map(Double.init) }
            return s.analysis?.pump_count.map(Double.init)
        }))
        out.append(CmpMetric(label: Loc.t("sd.avgPump", lang), unit: PumpUnit.unitLabel(lang), dir: nil,
                             fmt: { PumpUnit.fmtValue($0) }, wert: { r, s in
            self.lauf(r, s)?.avg_pump_hz ?? s.analysis?.metrics?.avg_pump_hz
        }))
        out.append(CmpMetric(label: Loc.t("sd.avgDistPerPump", lang), unit: "m/Pump", dir: "max",
                             fmt: einF, wert: { r, s in
            if let l = self.lauf(r, s) {
                guard let n = l.pumps, n > 0, let d = l.distance_m else { return nil }
                return d / Double(n)
            }
            guard let n = s.analysis?.pump_count, n > 0, let d = s.analysis?.foiling_distance_m else { return nil }
            return d / Double(n)
        }))
        out.append(CmpMetric(label: Loc.t("sd.avgHr", lang), unit: "bpm", dir: nil,
                             fmt: ganzF, wert: { r, s in
            r.runIdx != nil ? nil : s.analysis?.metrics?.avg_hr
        }))
        out.append(CmpMetric(label: Loc.t("sd.maxHr", lang), unit: "bpm", dir: nil,
                             fmt: ganzF, wert: { r, s in
            r.runIdx != nil ? nil : s.analysis?.metrics?.max_hr
        }))
        out.append(CmpMetric(label: Loc.t("rec.longestRun", lang), unit: "min:s", dir: "max",
                             fmt: mmssF, wert: { r, s in
            self.lauf(r, s)?.duration_s ?? self.bestSeg(segsOf(s), { $0.duration_s }, { $0 > $1 })
        }))
        out.append(CmpMetric(label: Loc.t("rec.farthestRun", lang), unit: "m", dir: "max",
                             fmt: ganzF, wert: { r, s in
            self.lauf(r, s)?.distance_m ?? self.bestSeg(segsOf(s), { $0.distance_m }, { $0 > $1 })
        }))
        return out
    }

    // KARTENRASTER statt der bisherigen Sechs-Werte-Matrix — dieselbe Liste, Reihenfolge und
    // Formatierung wie in der PWA. Je Karte eine Kennzahl, darin eine Zeile je Korb-Eintrag.
    private var compareTable: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 8)], spacing: 8) {
            ForEach(Array(cmpMetrics.enumerated()), id: \.offset) { _, m in
                metricCard(m)
            }
        }
        .padding(.horizontal)
    }

    private func metricCard(_ m: CmpMetric) -> some View {
        let werte: [Double?] = items.map { m.wert($0.ref, $0.s) }
        let zahlen = werte.compactMap { $0 }
        // Bestwert nur bei gesetzter Richtung UND mindestens zwei vergleichbaren Werten — sonst
        // waere in einem Einzelvergleich alles "best" (genau die Bedingung der PWA).
        let best: Double? = (m.dir != nil && zahlen.count >= 2)
            ? (m.dir == "max" ? zahlen.max() : zahlen.min()) : nil
        return VStack(alignment: .leading, spacing: 3) {
            Text(m.label.uppercased()).font(.caption2).foregroundStyle(.secondary).lineLimit(2)
            ForEach(Array(werte.enumerated()), id: \.offset) { i, v in
                metricRow(i, v, m, best)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(8)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
    }

    private func metricRow(_ i: Int, _ v: Double?, _ m: CmpMetric, _ best: Double?) -> some View {
        let istBest: Bool = best != nil && v != nil && v == best
        let farbe: Color = items.indices.contains(i) ? dotColor(i, items[i].s) : Color.secondary
        return HStack(spacing: 5) {
            Circle().fill(farbe).frame(width: 8, height: 8)
            Text(v.map { m.fmt($0) } ?? "–")
                .font(istBest ? .subheadline.bold() : .footnote.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(istBest ? Color.accentColor : Color.primary)
            if let u = m.unit, v != nil {
                Text(u).font(.caption2).foregroundStyle(.secondary)
            }
        }
    }
}

// Färbungs-Modi der Vergleichs-Karte.
enum CompareColorMode { case rider, track, speed, pump, hr }

// Wert -> Farbe (blau niedrig -> rot hoch), wie SessionDetail/Web.
private func cmpRamp(_ t: Double) -> UIColor {
    let tt = min(max(t, 0), 1)
    return UIColor(hue: (1 - tt) * 240 / 360, saturation: 0.85, brightness: 0.95, alpha: 1)
}

// Gemeinsame Karte mehrerer Sessions. Färbung: je Track (Session-Farbe) oder Wert (Speed/Pump/Puls).
// MKMapView (iOS-16-tauglich), analog TrackMap.
struct CompareMap: UIViewRepresentable {
    struct Track {
        let points: [[Double]]; let segments: [Segment]; let color: UIColor; let riderColor: UIColor
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
        case .rider: return tr.riderColor
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
