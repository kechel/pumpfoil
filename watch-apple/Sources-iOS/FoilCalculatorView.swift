import SwiftUI

// Nativer Foil-Rechner (spiegelt web/src/pages/FoilCalculator.tsx) auf Basis von
// FoilPhysics.swift. iOS-typisch: Form mit Parametern (Stepper/Picker), Foil-Auswahl
// und Ergebnis-Sektionen je Foil (Kennwerte + Pump-Leistung je km/h).
struct FoilCalculatorView: View {
    @AppStorage("appLang") private var lang = "de"
    private let speeds: [Double] = [10, 12, 14, 16, 18, 20]

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

    var body: some View {
        Form {
            if let error { Text(error).foregroundStyle(.secondary) }

            Section(Loc.t("calc.params", lang)) {
                Stepper("\(Loc.t("settings.weight", lang)): \(Int(riderWeight)) kg", value: $riderWeight, in: 30...200, step: 1)
                Stepper("\(Loc.t("calc.equipment", lang)): \(Int(equipWeight)) kg", value: $equipWeight, in: 0...40, step: 1)
                Picker(Loc.t("calc.mastDiameter", lang), selection: $mastDiameter) {
                    Text("19 mm").tag(19.0); Text("17 mm").tag(17.0)
                }
                Picker(Loc.t("calc.mastDepth", lang), selection: $mastDepth) {
                    ForEach([0.2, 0.3, 0.4, 0.5], id: \.self) { d in Text("\(Int(d * 100)) cm").tag(d) }
                }
                Toggle(Loc.t("calc.withPump", lang), isOn: $withPump)
                if withPump {
                    Stepper("\(Loc.t("calc.frequency", lang)): \(pumpFreq, specifier: "%.1f") Hz", value: $pumpFreq, in: 0.3...3, step: 0.1)
                    Stepper("\(Loc.t("calc.heaveWord", lang)): \(Int(heaveAmp)) cm", value: $heaveAmp, in: 1...40, step: 1)
                    Stepper("\(Loc.t("calc.lossWord", lang)): \(Int(recoveryLoss)) %", value: $recoveryLoss, in: 0...100, step: 5)
                }
            }

            Section(Loc.t("profile.foils", lang)) {
                TextField(Loc.t("foils.search", lang), text: $query)
                if !brands.isEmpty {
                    Picker(Loc.t("foils.brand", lang), selection: $brand) {
                        Text(Loc.t("sessions.all", lang)).tag("")
                        ForEach(brands, id: \.self) { b in Text(b).tag(b) }
                    }
                }
                if loading {
                    HStack { Spacer(); ProgressView(); Spacer() }
                } else {
                    ForEach(filtered) { f in
                        Button { toggle(f.id) } label: {
                            HStack {
                                Image(systemName: selected.contains(f.id) ? "checkmark.circle.fill" : "circle")
                                    .foregroundStyle(selected.contains(f.id) ? Color.accentColor : .secondary)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("\(f.brand) \(f.model) \(f.size)").foregroundStyle(.primary)
                                    Text("\(Int(f.area_cm2)) cm²  ·  AR \(f.aspect_ratio.map { String(format: "%.1f", $0) } ?? "–")")
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
            }

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
        .navigationTitle(Loc.t("profile.calc", lang))
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    @ViewBuilder private func resultSection(_ f: Foil) -> some View {
        let dims = FoilPhysics.FoilDims(spanCm: f.span_cm, areaCm2: f.area_cm2, thicknessMm: f.thickness_mm)
        let ar = FoilPhysics.calculateAR(spanCm: f.span_cm, areaCm2: f.area_cm2)
        let chordCm = FoilPhysics.calculateMeanChord(areaCm2: f.area_cm2, ar: ar) * 100
        let tc = FoilPhysics.calculateThicknessRatio(thicknessMm: f.thickness_mm, areaCm2: f.area_cm2, ar: ar)
        let clmax = FoilPhysics.calculateCLmax(ar: ar, thicknessMm: f.thickness_mm, areaCm2: f.area_cm2, speedKmh: 15)
        let stall = FoilPhysics.calculateStallSpeed(areaCm2: f.area_cm2, clMax: clmax, rider: rider)
        let minV = max(stall, FoilPhysics.calculateMinViableSpeed(areaCm2: f.area_cm2, clMax: clmax, rider: rider))
        let opt = FoilPhysics.calculateOptimalSpeed(stallSpeed: stall)

        Section("\(f.brand) \(f.model) \(f.size)") {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 16) {
                    metric("AR", String(format: "%.1f", ar))
                    metric(Loc.t("calc.chord", lang), "\(String(format: "%.1f", chordCm)) cm")
                    metric("t/c", "\(f.thickness_estimated == true ? "≈" : "")\(String(format: "%.1f", tc * 100))%")
                    metric("CLmax", String(format: "%.2f", clmax))
                    metric(Loc.t("calc.stall", lang), String(format: "%.1f", stall))
                    metric(Loc.t("calc.minViable", lang), String(format: "%.1f", minV))
                    metric(Loc.t("calc.optimal", lang), "\(Int(opt))")
                }
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(Loc.t("calc.powerRow", lang)).font(.caption).foregroundStyle(.secondary)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 14) {
                        ForEach(speeds, id: \.self) { sp in
                            let w: Int? = sp + 0.001 < minV ? nil
                                : Int(FoilPhysics.computeFoilPowerAtSpeed(foil: dims, speedKmh: sp, rider: rider, mast: mast, pump: pump).power.rounded())
                            VStack(spacing: 2) {
                                Text("\(Int(sp))").font(.caption2).foregroundStyle(.secondary)
                                Text(w.map(String.init) ?? "–")
                                    .fontWeight(.medium)
                                    .foregroundStyle(w == nil ? Color.secondary : .primary)
                            }
                        }
                    }
                }
            }
        }
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
