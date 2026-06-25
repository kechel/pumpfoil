package org.pumpfoil.app

import kotlin.math.PI
import kotlin.math.pow
import kotlin.math.sqrt

// Hydrofoil-Physik — 1:1-Port von web/src/lib/foilPhysics.ts (gegen die JS-Referenz
// verifiziert via FoilPhysicsTest). Einheiten: Länge cm/mm, Speed km/h, Gewicht kg,
// Leistung W, Kräfte N.
object FoilPhysics {
    const val RHO_WATER = 1000.0
    const val MU_WATER = 0.001
    const val G = 9.81
    const val MAST_CHORD_LENGTH = 0.20
    const val MAST_CD_STREAMLINED = 0.10
    private const val MEAN_TO_ROOT_CHORD = 0.70

    data class FoilDims(val spanCm: Double, val areaCm2: Double, val thicknessMm: Double)
    data class RiderParams(val riderWeight: Double = 95.0, val equipmentWeight: Double = 10.0)
    data class MastParams(val mastDiameterMm: Double = 19.0, val mastDepthM: Double = 0.40)
    data class PumpParams(val heaveAmpCm: Double = 12.0, val pumpFreqHz: Double = 1.0, val recoveryLossPct: Double = 35.0)

    val DEFAULT_RIDER = RiderParams()
    val DEFAULT_MAST = MastParams()
    val DEFAULT_PUMP = PumpParams()

    private fun totalWeightN(r: RiderParams) = (r.riderWeight + r.equipmentWeight) * G

    fun calculateAR(spanCm: Double, areaCm2: Double): Double {
        val spanM = spanCm / 100.0
        val areaM2 = areaCm2 / 10000.0
        return spanM * spanM / areaM2
    }

    fun calculateReynolds(chordM: Double, speedKmh: Double): Double {
        val v = speedKmh / 3.6
        return RHO_WATER * v * chordM / MU_WATER
    }

    fun calculateMeanChord(areaCm2: Double, ar: Double) = sqrt((areaCm2 / 10000.0) / ar)

    fun calculateThicknessRatio(thicknessMm: Double, areaCm2: Double, ar: Double): Double {
        val rootChordM = calculateMeanChord(areaCm2, ar) / MEAN_TO_ROOT_CHORD
        return (thicknessMm / 1000.0) / rootChordM
    }

    fun getCriticalReynolds(ar: Double, tr: Double): Double {
        var c = 80000.0
        if (ar > 12) c += (ar - 12) * 15000.0
        if (ar > 16) c += (ar - 16) * 20000.0
        if (tr < 0.15) c += 80000.0
        if (tr < 0.10) c += 60000.0
        return minOf(c, 400000.0)
    }

    fun calculateCLmax(ar: Double, thicknessMm: Double, areaCm2: Double, speedKmh: Double = 15.0): Double {
        val chordM = calculateMeanChord(areaCm2, ar)
        val tr = calculateThicknessRatio(thicknessMm, areaCm2, ar)
        val baseClMax = 1.4
        val arFactor = maxOf(0.8, 1.3 - ar * 0.02)
        val thicknessFactor = 0.8 + tr * 2
        val reynolds = calculateReynolds(chordM, speedKmh)
        val criticalRe = getCriticalReynolds(ar, tr)
        var reynoldsFactor = 1.0
        if (reynolds < criticalRe) reynoldsFactor = 0.3 + 0.7 * (reynolds / criticalRe)
        var profileFactor = 1.0
        if (ar > 15 && tr < 0.12) profileFactor = 0.8
        return baseClMax * arFactor * thicknessFactor * reynoldsFactor * profileFactor
    }

    fun calculateRequiredCL(areaCm2: Double, speedKmh: Double, rider: RiderParams = DEFAULT_RIDER): Double {
        val areaM2 = areaCm2 / 10000.0
        val v = speedKmh / 3.6
        return (2 * totalWeightN(rider)) / (RHO_WATER * areaM2 * v * v)
    }

    fun calculateMinViableSpeed(areaCm2: Double, clMax: Double, rider: RiderParams = DEFAULT_RIDER): Double {
        val areaM2 = areaCm2 / 10000.0
        val practicalCl = clMax * 0.8
        return sqrt((2 * totalWeightN(rider)) / (RHO_WATER * areaM2 * practicalCl)) * 3.6
    }

    fun calculateStallSpeed(areaCm2: Double, clMax: Double, rider: RiderParams = DEFAULT_RIDER): Double {
        val areaM2 = areaCm2 / 10000.0
        return sqrt((2 * totalWeightN(rider)) / (RHO_WATER * areaM2 * clMax)) * 3.6
    }

    fun calculateCd(ar: Double, thicknessMm: Double, areaCm2: Double, requiredCL: Double, speedKmh: Double = 15.0): Double {
        val tr = calculateThicknessRatio(thicknessMm, areaCm2, ar)
        val efficiency = 0.85
        val cdInduced = (requiredCL * requiredCL) / (PI * ar * efficiency)
        val chordM = calculateMeanChord(areaCm2, ar)
        val reynolds = maxOf(calculateReynolds(chordM, speedKmh), 1e5)
        val cf = 0.074 / reynolds.pow(0.2)
        val formFactor = 1 + 2 * tr + 60 * tr.pow(4)
        val cdProfile = 2 * cf * formFactor
        return cdInduced + cdProfile
    }

    fun calculateFoilDrag(areaCm2: Double, cd: Double, speedKmh: Double): Double {
        val areaM2 = areaCm2 / 10000.0
        val v = speedKmh / 3.6
        return 0.5 * RHO_WATER * areaM2 * cd * v * v
    }

    fun calculateMastDrag(speedKmh: Double, mast: MastParams = DEFAULT_MAST): Double {
        val thicknessM = mast.mastDiameterMm / 1000.0
        val frontalAreaM2 = thicknessM * mast.mastDepthM
        val v = speedKmh / 3.6
        val reynoldsMast = (RHO_WATER * v * MAST_CHORD_LENGTH) / MU_WATER
        var cdMast = MAST_CD_STREAMLINED
        if (reynoldsMast < 50000) cdMast = 0.15 else if (reynoldsMast > 500000) cdMast = 0.08
        val tr = thicknessM / MAST_CHORD_LENGTH
        val thicknessFactor = 1.0 + (tr - 0.08) * 1.5
        cdMast *= maxOf(0.7, thicknessFactor)
        return 0.5 * RHO_WATER * frontalAreaM2 * cdMast * v * v
    }

    fun calculateOptimalSpeed(stallSpeed: Double): Double = Math.round(stallSpeed * 1.75).toDouble()

    fun calculateAddedMass(foil: FoilDims, ar: Double): Double {
        val c = calculateMeanChord(foil.areaCm2, ar)
        val spanM = foil.spanCm / 100.0
        return RHO_WATER * (PI / 4) * c * c * spanM
    }

    fun calculatePumpInertiaPower(foil: FoilDims, rider: RiderParams, pump: PumpParams, ar: Double): Double {
        val a = pump.heaveAmpCm / 100.0
        val f = pump.pumpFreqHz
        val eta = pump.recoveryLossPct / 100.0
        val mEff = rider.riderWeight + rider.equipmentWeight + calculateAddedMass(foil, ar)
        val omega = 2 * PI * f
        return eta * mEff * a * a * omega * omega * f
    }

    data class PowerResult(
        val ar: Double,
        val requiredCL: Double,
        val cd: Double,
        val foilDrag: Double,
        val mastDrag: Double,
        val totalDrag: Double,
        val dragPower: Double,
        val inertiaPower: Double,
        val power: Double,
    )

    fun computeFoilPowerAtSpeed(
        foil: FoilDims,
        speedKmh: Double,
        rider: RiderParams = DEFAULT_RIDER,
        mast: MastParams = DEFAULT_MAST,
        pump: PumpParams? = null,
    ): PowerResult {
        val ar = calculateAR(foil.spanCm, foil.areaCm2)
        val requiredCL = calculateRequiredCL(foil.areaCm2, speedKmh, rider)
        val cd = calculateCd(ar, foil.thicknessMm, foil.areaCm2, requiredCL, speedKmh)
        val foilDrag = calculateFoilDrag(foil.areaCm2, cd, speedKmh)
        val mastDrag = calculateMastDrag(speedKmh, mast)
        val totalDrag = foilDrag + mastDrag
        val dragPower = totalDrag * (speedKmh / 3.6)
        val inertiaPower = if (pump != null) calculatePumpInertiaPower(foil, rider, pump, ar) else 0.0
        return PowerResult(ar, requiredCL, cd, foilDrag, mastDrag, totalDrag, dragPower, inertiaPower, dragPower + inertiaPower)
    }
}
