import SwiftUI

// Nativer Foil-Rechner (spiegelt web/src/pages/FoilCalculator.tsx) auf Basis von
// FoilPhysics.swift. iOS-typisch: Form mit Parametern (Stepper/Picker), Foil-Auswahl
// und Ergebnis-Sektionen je Foil (Kennwerte + Pump-Leistung je km/h).
struct FoilCalculatorView: View {
    @AppStorage("appLang") private var lang = "de"
    private let speeds: [Double] = [10, 12, 14, 16, 18, 20]
    // Explizit typisiert: als Literal-Array direkt im Picker musste der Type-Checker den Element-Typ
    // erst aus dem Tag ableiten.
    private let depths: [Double] = [0.2, 0.3, 0.4, 0.5]

    @State private var foils: [Foil] = []
    @State private var brands: [String] = []
    @State private var brand = ""
    @State private var query = ""
    @State private var selected: Set<Int> = []
    @State private var loading = true
    @State private var error: String?

    @State private var riderWeight = 95.0
    @State private var equipWeight = 10.0
    @State private var mastDiameter = 19.0
    @State private var mastDepth = 0.40
    @State private var withPump = false
    @State private var pumpFreq = 1.0
    @State private var heaveAmp = 12.0
    @State private var recoveryLoss = 35.0

    private var rider: FoilPhysics.RiderParams { .init(riderWeight: riderWeight, equipmentWeight: equipWeight) }
    private var mast: FoilPhysics.MastParams { .init(mastDiameterMm: mastDiameter, mastDepthM: mastDepth) }
    private var pump: FoilPhysics.PumpParams? {
        withPump ? .init(heaveAmpCm: heaveAmp, pumpFreqHz: pumpFreq, recoveryLossPct: recoveryLoss) : nil
    }

    private var filtered: [Foil] {
        foils.filter { f in
            (brand.isEmpty || f.brand == brand) &&
            (query.isEmpty || "\(f.brand) \(f.model) \(f.size)".lowercased().contains(query.lowercased()))
        }
    }
    private var selectedFoils: [Foil] { foils.filter { selected.contains($0.id) } }

    // Der Body war EIN Ausdruck (Form mit ~20 Kindern) und stand mit >500 ms im Build-Log — Swifts
    // Type-Checker loest einen ViewBuilder als einen einzigen Ausdruck auf, und der Aufwand waechst
    // ueberproportional mit Kindern/Modifiern. Jede Sektion unten ist ein eigener, typisierter Teil.
    var body: some View {
        Form {
            if let error { Text(error).foregroundStyle(.secondary) }
            paramsSection
            foilsSection
            resultsSection
        }
        .brandToolbar(Loc.t("profile.calc", lang))
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private var paramsSection: some View {
        Section(Loc.t("calc.params", lang)) {
            Stepper("\(Loc.t("settings.weight", lang)): \(Int(riderWeight)) kg", value: $riderWeight, in: 30...200, step: 1)
            Stepper("\(Loc.t("calc.equipment", lang)): \(Int(equipWeight)) kg", value: $equipWeight, in: 0...40, step: 1)
            Picker(Loc.t("calc.mastDiameter", lang), selection: $mastDiameter) {
                Text("19 mm").tag(19.0); Text("17 mm").tag(17.0)
            }
            Picker(Loc.t("calc.mastDepth", lang), selection: $mastDepth) {
                ForEach(depths, id: \.self) { d in Text("\(Int(d * 100)) cm").tag(d) }
            }
            Toggle(Loc.t("calc.withPump", lang), isOn: $withPump)
            pumpSteppers
        }
    }

    // Die Beschriftungen bleiben WORTGLEICH als LocalizedStringKey-Interpolation (der specifier
    // formatiert die Zahl anders als ein vorab gebautes String) — nur der Block wird kleiner.
    @ViewBuilder private var pumpSteppers: some View {
        if withPump {
            Stepper("\(Loc.t("calc.frequency", lang)): \(pumpFreq, specifier: "%.1f") Hz", value: $pumpFreq, in: 0.3...3, step: 0.1)
            Stepper("\(Loc.t("calc.heaveWord", lang)): \(Int(heaveAmp)) cm", value: $heaveAmp, in: 1...40, step: 1)
            Stepper("\(Loc.t("calc.lossWord", lang)): \(Int(recoveryLoss)) %", value: $recoveryLoss, in: 0...100, step: 5)
        }
    }

    private var foilsSection: some View {
        Section(Loc.t("profile.foils", lang)) {
            TextField(Loc.t("foils.search", lang), text: $query)
            brandPicker
            foilList
        }
    }

    @ViewBuilder private var brandPicker: some View {
        if !brands.isEmpty {
            Picker(Loc.t("foils.brand", lang), selection: $brand) {
                Text(Loc.t("sessions.all", lang)).tag("")
                ForEach(brands, id: \.self) { b in Text(b).tag(b) }
            }
        }
    }

    @ViewBuilder private var foilList: some View {
        if loading {
            HStack { Spacer(); ProgressView(); Spacer() }
        } else {
            ForEach(filtered) { f in
                Button { toggle(f.id) } label: { foilRowLabel(f) }
            }
        }
    }

    private func foilRowLabel(_ f: Foil) -> some View {
        let on: Bool = selected.contains(f.id)
        return HStack {
            Image(systemName: on ? "checkmark.circle.fill" : "circle")
                .foregroundStyle(on ? Color.accentColor : Color.secondary)
            VStack(alignment: .leading, spacing: 2) {
                Text("\(f.brand) \(f.model) \(f.size)").foregroundStyle(.primary)
                Text(foilSubline(f)).font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private func foilSubline(_ f: Foil) -> String {
        let ar: String = f.aspect_ratio.map { String(format: "%.1f", $0) } ?? "–"
        return "\(Int(f.area_cm2)) cm²  ·  AR \(ar)"
    }

    @ViewBuilder private var resultsSection: some View {
        if selectedFoils.isEmpty {
            Section { Text(Loc.t("calc.pickHint", lang)).foregroundStyle(.secondary) }
        } else {
            ForEach(selectedFoils) { f in resultSection(f) }
            Section {
                Text(Loc.t("calc.disclaimer", lang))
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    // Alle abgeleiteten Kennwerte in EINEM typisierten Wert: als lokale let-Kette im ViewBuilder
    // musste der Type-Checker sie im selben Riesenausdruck mitloesen.
    private struct CalcVals {
        let dims: FoilPhysics.FoilDims
        let ar: Double
        let chordCm: Double
        let tc: Double
        let clmax: Double
        let stall: Double
        let minV: Double
        let opt: Double
    }

    private func calcVals(_ f: Foil) -> CalcVals {
        let dims = FoilPhysics.FoilDims(spanCm: f.span_cm, areaCm2: f.area_cm2, thicknessMm: f.thickness_mm)
        let ar: Double = FoilPhysics.calculateAR(spanCm: f.span_cm, areaCm2: f.area_cm2)
        let chordCm: Double = FoilPhysics.calculateMeanChord(areaCm2: f.area_cm2, ar: ar) * 100
        let tc: Double = FoilPhysics.calculateThicknessRatio(thicknessMm: f.thickness_mm, areaCm2: f.area_cm2, ar: ar)
        let clmax: Double = FoilPhysics.calculateCLmax(ar: ar, thicknessMm: f.thickness_mm, areaCm2: f.area_cm2, speedKmh: 15)
        let stall: Double = FoilPhysics.calculateStallSpeed(areaCm2: f.area_cm2, clMax: clmax, rider: rider)
        let minV: Double = max(stall, FoilPhysics.calculateMinViableSpeed(areaCm2: f.area_cm2, clMax: clmax, rider: rider))
        let opt: Double = FoilPhysics.calculateOptimalSpeed(stallSpeed: stall)
        return CalcVals(dims: dims, ar: ar, chordCm: chordCm, tc: tc, clmax: clmax, stall: stall, minV: minV, opt: opt)
    }

    private func resultSection(_ f: Foil) -> some View {
        let v = calcVals(f)
        return Section("\(f.brand) \(f.model) \(f.size)") {
            metricsRow(f, v)
            powerRow(v)
        }
    }

    private func metricsRow(_ f: Foil, _ v: CalcVals) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 16) {
                metric("AR", String(format: "%.1f", v.ar))
                metric(Loc.t("calc.chord", lang), chordText(v.chordCm))
                metric("t/c", tcText(f, v.tc))
                metric("CLmax", String(format: "%.2f", v.clmax))
                metric(Loc.t("calc.stall", lang), String(format: "%.1f", v.stall))
                metric(Loc.t("calc.minViable", lang), String(format: "%.1f", v.minV))
                metric(Loc.t("calc.optimal", lang), "\(Int(v.opt))")
            }
        }
    }

    private func chordText(_ chordCm: Double) -> String {
        "\(String(format: "%.1f", chordCm)) cm"
    }

    // "≈" nur bei geschaetzter Dicke (Katalog-Luecke) — vorher ein Ternaer mitten in der Interpolation.
    private func tcText(_ f: Foil, _ tc: Double) -> String {
        let prefix: String = f.thickness_estimated == true ? "≈" : ""
        return prefix + String(format: "%.1f", tc * 100) + "%"
    }

    private func powerRow(_ v: CalcVals) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(Loc.t("calc.powerRow", lang)).font(.caption).foregroundStyle(.secondary)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 14) {
                    ForEach(speeds, id: \.self) { sp in powerCell(sp, v) }
                }
            }
        }
    }

    private func powerCell(_ sp: Double, _ v: CalcVals) -> some View {
        let w: Int? = wattAt(sp, v)
        return VStack(spacing: 2) {
            Text("\(Int(sp))").font(.caption2).foregroundStyle(.secondary)
            Text(w.map(String.init) ?? "–")
                .fontWeight(.medium)
                .foregroundStyle(w == nil ? Color.secondary : .primary)
        }
    }

    // Unter der Mindest-Geschwindigkeit gibt es keinen sinnvollen Wert -> nil ("–").
    private func wattAt(_ sp: Double, _ v: CalcVals) -> Int? {
        guard sp + 0.001 >= v.minV else { return nil }
        let res = FoilPhysics.computeFoilPowerAtSpeed(foil: v.dims, speedKmh: sp, rider: rider, mast: mast, pump: pump)
        return Int(res.power.rounded())
    }

    private func metric(_ label: String, _ value: String) -> some View {
        VStack(spacing: 2) {
            Text(label).font(.caption2).foregroundStyle(.secondary)
            Text(value).fontWeight(.medium)
        }
    }

    private func toggle(_ id: Int) {
        if selected.contains(id) { selected.remove(id) } else { selected.insert(id) }
    }

    private func load() async {
        loading = true; defer { loading = false }
        do {
            foils = try await Api.foils()
            brands = (try? await Api.foilBrands()) ?? []
            if let s = try? await Api.settings() {
                if let w = (s["weight_kg"] as? Double) ?? (s["weight_kg"] as? NSNumber)?.doubleValue
                    ?? Double(s["weight_kg"] as? String ?? ""), w > 0 { riderWeight = w }
                if let mf = s["my_foils"] as? [Int] { selected = Set(mf) }
                else if let mf = s["my_foils"] as? [NSNumber] { selected = Set(mf.map(\.intValue)) }
            }
            error = nil
        } catch { self.error = error.localizedDescription }
    }
}
