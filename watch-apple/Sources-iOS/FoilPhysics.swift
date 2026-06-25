import Foundation

// Hydrofoil-Physik — 1:1-Port von web/src/lib/foilPhysics.ts (identisch zur
// verifizierten android/.../FoilPhysics.kt). Einheiten: Länge cm/mm, Speed km/h,
// Gewicht kg, Leistung W, Kräfte N.
enum FoilPhysics {
    static let rhoWater = 1000.0
    static let muWater = 0.001
    static let g = 9.81
    static let mastChordLength = 0.20
    static let mastCdStreamlined = 0.10
    private static let meanToRootChord = 0.70

    struct FoilDims { let spanCm: Double; let areaCm2: Double; let thicknessMm: Double }
    struct RiderParams { var riderWeight = 95.0; var equipmentWeight = 10.0 }
    struct MastParams { var mastDiameterMm = 19.0; var mastDepthM = 0.40 }
    struct PumpParams { var heaveAmpCm = 12.0; var pumpFreqHz = 1.0; var recoveryLossPct = 35.0 }

    private static func totalWeightN(_ r: RiderParams) -> Double { (r.riderWeight + r.equipmentWeight) * g }

    static func calculateAR(spanCm: Double, areaCm2: Double) -> Double {
        let spanM = spanCm / 100.0
        let areaM2 = areaCm2 / 10000.0
        return spanM * spanM / areaM2
    }

    static func calculateReynolds(chordM: Double, speedKmh: Double) -> Double {
        let v = speedKmh / 3.6
        return rhoWater * v * chordM / muWater
    }

    static func calculateMeanChord(areaCm2: Double, ar: Double) -> Double {
        (areaCm2 / 10000.0 / ar).squareRoot()
    }

    static func calculateThicknessRatio(thicknessMm: Double, areaCm2: Double, ar: Double) -> Double {
        let rootChordM = calculateMeanChord(areaCm2: areaCm2, ar: ar) / meanToRootChord
        return (thicknessMm / 1000.0) / rootChordM
    }

    static func getCriticalReynolds(ar: Double, tr: Double) -> Double {
        var c = 80000.0
        if ar > 12 { c += (ar - 12) * 15000.0 }
        if ar > 16 { c += (ar - 16) * 20000.0 }
        if tr < 0.15 { c += 80000.0 }
        if tr < 0.10 { c += 60000.0 }
        return min(c, 400000.0)
    }

    static func calculateCLmax(ar: Double, thicknessMm: Double, areaCm2: Double, speedKmh: Double = 15.0) -> Double {
        let chordM = calculateMeanChord(areaCm2: areaCm2, ar: ar)
        let tr = calculateThicknessRatio(thicknessMm: thicknessMm, areaCm2: areaCm2, ar: ar)
        let baseClMax = 1.4
        let arFactor = max(0.8, 1.3 - ar * 0.02)
        let thicknessFactor = 0.8 + tr * 2
        let reynolds = calculateReynolds(chordM: chordM, speedKmh: speedKmh)
        let criticalRe = getCriticalReynolds(ar: ar, tr: tr)
        var reynoldsFactor = 1.0
        if reynolds < criticalRe { reynoldsFactor = 0.3 + 0.7 * (reynolds / criticalRe) }
        var profileFactor = 1.0
        if ar > 15 && tr < 0.12 { profileFactor = 0.8 }
        return baseClMax * arFactor * thicknessFactor * reynoldsFactor * profileFactor
    }

    static func calculateRequiredCL(areaCm2: Double, speedKmh: Double, rider: RiderParams = RiderParams()) -> Double {
        let areaM2 = areaCm2 / 10000.0
        let v = speedKmh / 3.6
        return (2 * totalWeightN(rider)) / (rhoWater * areaM2 * v * v)
    }

    static func calculateMinViableSpeed(areaCm2: Double, clMax: Double, rider: RiderParams = RiderParams()) -> Double {
        let areaM2 = areaCm2 / 10000.0
        let practicalCl = clMax * 0.8
        return ((2 * totalWeightN(rider)) / (rhoWater * areaM2 * practicalCl)).squareRoot() * 3.6
    }

    static func calculateStallSpeed(areaCm2: Double, clMax: Double, rider: RiderParams = RiderParams()) -> Double {
        let areaM2 = areaCm2 / 10000.0
        return ((2 * totalWeightN(rider)) / (rhoWater * areaM2 * clMax)).squareRoot() * 3.6
    }

    static func calculateCd(ar: Double, thicknessMm: Double, areaCm2: Double, requiredCL: Double, speedKmh: Double = 15.0) -> Double {
        let tr = calculateThicknessRatio(thicknessMm: thicknessMm, areaCm2: areaCm2, ar: ar)
        let efficiency = 0.85
        let cdInduced = (requiredCL * requiredCL) / (Double.pi * ar * efficiency)
        let chordM = calculateMeanChord(areaCm2: areaCm2, ar: ar)
        let reynolds = max(calculateReynolds(chordM: chordM, speedKmh: speedKmh), 1e5)
        let cf = 0.074 / pow(reynolds, 0.2)
        let formFactor = 1 + 2 * tr + 60 * pow(tr, 4)
        let cdProfile = 2 * cf * formFactor
        return cdInduced + cdProfile
    }

    static func calculateFoilDrag(areaCm2: Double, cd: Double, speedKmh: Double) -> Double {
        let areaM2 = areaCm2 / 10000.0
        let v = speedKmh / 3.6
        return 0.5 * rhoWater * areaM2 * cd * v * v
    }

    static func calculateMastDrag(speedKmh: Double, mast: MastParams = MastParams()) -> Double {
        let thicknessM = mast.mastDiameterMm / 1000.0
        let frontalAreaM2 = thicknessM * mast.mastDepthM
        let v = speedKmh / 3.6
        let reynoldsMast = (rhoWater * v * mastChordLength) / muWater
        var cdMast = mastCdStreamlined
        if reynoldsMast < 50000 { cdMast = 0.15 } else if reynoldsMast > 500000 { cdMast = 0.08 }
        let tr = thicknessM / mastChordLength
        let thicknessFactor = 1.0 + (tr - 0.08) * 1.5
        cdMast *= max(0.7, thicknessFactor)
        return 0.5 * rhoWater * frontalAreaM2 * cdMast * v * v
    }

    static func calculateOptimalSpeed(stallSpeed: Double) -> Double { (stallSpeed * 1.75).rounded() }

    static func calculateAddedMass(foil: FoilDims, ar: Double) -> Double {
        let c = calculateMeanChord(areaCm2: foil.areaCm2, ar: ar)
        let spanM = foil.spanCm / 100.0
        return rhoWater * (Double.pi / 4) * c * c * spanM
    }

    static func calculatePumpInertiaPower(foil: FoilDims, rider: RiderParams, pump: PumpParams, ar: Double) -> Double {
        let a = pump.heaveAmpCm / 100.0
        let f = pump.pumpFreqHz
        let eta = pump.recoveryLossPct / 100.0
        let mEff = rider.riderWeight + rider.equipmentWeight + calculateAddedMass(foil: foil, ar: ar)
        let omega = 2 * Double.pi * f
        return eta * mEff * a * a * omega * omega * f
    }

    struct PowerResult { let ar, requiredCL, cd, foilDrag, mastDrag, totalDrag, dragPower, inertiaPower, power: Double }

    static func computeFoilPowerAtSpeed(
        foil: FoilDims, speedKmh: Double,
        rider: RiderParams = RiderParams(), mast: MastParams = MastParams(), pump: PumpParams? = nil
    ) -> PowerResult {
        let ar = calculateAR(spanCm: foil.spanCm, areaCm2: foil.areaCm2)
        let requiredCL = calculateRequiredCL(areaCm2: foil.areaCm2, speedKmh: speedKmh, rider: rider)
        let cd = calculateCd(ar: ar, thicknessMm: foil.thicknessMm, areaCm2: foil.areaCm2, requiredCL: requiredCL, speedKmh: speedKmh)
        let foilDrag = calculateFoilDrag(areaCm2: foil.areaCm2, cd: cd, speedKmh: speedKmh)
        let mastDrag = calculateMastDrag(speedKmh: speedKmh, mast: mast)
        let totalDrag = foilDrag + mastDrag
        let dragPower = totalDrag * (speedKmh / 3.6)
        let inertiaPower = pump != nil ? calculatePumpInertiaPower(foil: foil, rider: rider, pump: pump!, ar: ar) : 0.0
        return PowerResult(ar: ar, requiredCL: requiredCL, cd: cd, foilDrag: foilDrag, mastDrag: mastDrag,
                           totalDrag: totalDrag, dragPower: dragPower, inertiaPower: inertiaPower, power: dragPower + inertiaPower)
    }
}
