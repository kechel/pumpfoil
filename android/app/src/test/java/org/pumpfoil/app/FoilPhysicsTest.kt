package org.pumpfoil.app

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertTrue
import org.junit.Test

// Verifiziert den Kotlin-Port FoilPhysics gegen die JS-Referenz (foil-ref.json,
// erzeugt aus web/src/lib/foilPhysics.ts via web/scripts/dump-foil-ref.mjs).
class FoilPhysicsTest {

    private fun near(a: Double, b: Double): Boolean =
        Math.abs(a - b) <= 1e-9 * maxOf(1.0, Math.abs(a), Math.abs(b))

    @Test
    fun matchesJsReference() {
        val text = javaClass.getResourceAsStream("/foil-ref.json")!!.bufferedReader().readText()
        val rows = Json.parseToJsonElement(text).jsonArray
        assertTrue("Referenzdaten leer", rows.isNotEmpty())

        var checks = 0
        for (row in rows) {
            val o = row.jsonObject
            fun d(k: String) = o[k]!!.jsonPrimitive.double
            val foil = FoilPhysics.FoilDims(d("span_cm"), d("area_cm2"), d("thickness_mm"))
            val r = FoilPhysics.computeFoilPowerAtSpeed(foil, d("speed"), pump = FoilPhysics.DEFAULT_PUMP)
            val pairs = listOf(
                "ar" to r.ar, "requiredCL" to r.requiredCL, "cd" to r.cd,
                "foilDrag" to r.foilDrag, "mastDrag" to r.mastDrag, "totalDrag" to r.totalDrag,
                "dragPower" to r.dragPower, "inertiaPower" to r.inertiaPower, "power" to r.power,
            )
            for ((k, got) in pairs) {
                val ref = d(k)
                checks++
                assertTrue(
                    "Abweichung bei $k (Speed ${d("speed")}): ref=$ref got=$got",
                    near(ref, got),
                )
            }
        }
        assertTrue("Erwartete Prüfungen", checks == rows.size * 9)
    }
}
