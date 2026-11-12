package org.pumpfoil.app

/**
 * GPS-Luecke am Lauf-Ende (12.11.2026, Vorlage Garmin watch/source/LaufLuecke.mc, Regel in docs/PARITY-AUDIT.md
 * Punkt 9). Anlass: nach einem Sturz war die Uhr 36 s unter Wasser, der Lauf zaehlte die Luecke mit (Garmin 1:34
 * statt 1:09). Hier lief die Lauferkennung nur bei eintreffenden Fixen — der erste langsame Fix nach der Luecke
 * beendete den Lauf, und die GANZE Luecke zaehlte mit.
 *
 * Waehrend des Laufs wird bis 15 s nie unterbrochen. Endet der Lauf und lag direkt davor eine Luecke (> 3 s ohne
 * guten Fix, danach nicht laenger als 3 s schnell), entscheidet die Luftlinie ueber die Luecke: ab 2,5 m/s
 * durchgefahren, sonst endet der Lauf am guten Fix davor. Luecke > 15 s im Lauf trennt (Server GAP_SPLIT_S).
 */
internal class LaufLuecke {
    private var gT = -1L; private var gD = 0.0; private var gHr = 0       // letzter guter Fix (Tempo >= 2,5 m/s)
    private var fT = -1L; private var fLat = 0.0; private var fLon = 0.0  // letzter guter Fix ueberhaupt
    private var aT = -1L; private var bT = -1L; private var aV = 0.0      // letzte geschlossene Luecke
    private var pT = -1L; private var pD = 0.0; private var pHr = 0       // guter Fix VOR dieser Luecke
    var trennen = false

    data class Schnitt(val t: Long, val d: Double, val hr: Int)

    fun fix(t: Long, d: Double, lat: Double, lon: Double, spd: Double, gut: Boolean, hr: Int, laeuft: Boolean) {
        if (!gut) return                                   // schlechter Fix zaehlt als Luecke
        if (fT >= 0 && t - fT > LUECKE_MS) {
            val dla = Math.toRadians(lat - fLat)
            val dlo = Math.toRadians(lon - fLon) * Math.cos(Math.toRadians((lat + fLat) / 2))
            val m = 6371000.0 * Math.sqrt(dla * dla + dlo * dlo)
            aT = fT; bT = t; aV = m / ((t - fT) / 1000.0)
            pT = gT; pD = gD; pHr = gHr
            if (laeuft && t - fT > TRENN_MS) trennen = true
        }
        fT = t; fLat = lat; fLon = lon
        if (spd >= FAHR_MPS) { gT = t; gD = d; gHr = hr }
    }

    fun schnitt(jetzt: Long, start: Long): Schnitt? {
        if (fT >= 0 && jetzt - fT > LUECKE_MS) return if (gT >= 0 && gT >= start) Schnitt(gT, gD, gHr) else null
        if (aT < 0 || gT > bT + LUECKE_MS || pT < 0 || pT < start) return null
        if (bT - aT <= TRENN_MS && aV >= FAHR_MPS) return null
        return Schnitt(pT, pD, pHr)
    }

    companion object {
        const val LUECKE_MS = 3000L
        const val TRENN_MS = 15000L
        const val FAHR_MPS = 2.5          // = Ende-Schwelle 9 km/h
    }
}
