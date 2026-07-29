package org.pumpfoil.app

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

// Anzeige-Einheit der Pump-Kadenz. „Hz" ist für viele schwer vorstellbar (was sind 1,43 Hz?),
// deshalb kann man auf Pumps pro Minute umstellen: ppm = Hz × 60.
// REINE DARSTELLUNG — es wird nichts neu analysiert, Analyse- und Rekordwerte bleiben unberührt.
//
// Quelle der Wahrheit ist das Profil (users.pump_unit, GET/PUT /api/auth/me). Lokal gespiegelt in
// SharedPreferences, damit jeder Screen ohne eigenen Netz-Aufruf formatieren kann; weil `unit`
// ein Compose-State ist, wirkt eine Änderung sofort in allen Ansichten.
object PumpUnit {
    var unit by mutableStateOf("hz")   // "hz" | "ppm"
        private set
    val ppm: Boolean get() = unit == "ppm"

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("pumpfoil", Context.MODE_PRIVATE)
    fun load(ctx: Context) { unit = prefs(ctx).getString("pump_unit", "hz") ?: "hz" }
    fun set(ctx: Context, v: String) {
        val u = if (v == "ppm") "ppm" else "hz"
        if (u == unit) return
        unit = u
        prefs(ctx).edit().putString("pump_unit", u).apply()
    }

    // Kürzel für Spaltenköpfe/Sortier-Chips: „Hz" bzw. „Pumps/min".
    fun unitLabel(): String = if (ppm) I18n.t("unit.pumpsPerMin") else "Hz"

    // Wert MIT Einheit — die eine Stelle, die aus einem Hz-Wert Text macht (1.43 -> „86/min").
    fun fmt(hz: Double?, dash: String = "–"): String {
        val v = hz ?: return dash
        return if (ppm) "%.0f%s".format(v * 60.0, I18n.t("unit.pumpPerMin")) else "%.2f Hz".format(v)
    }

    // Wert OHNE Einheit — für Tabellen/Kacheln, deren Kopf schon unitLabel() zeigt.
    fun fmtValue(hz: Double?, dash: String = "–"): String {
        val v = hz ?: return dash
        return if (ppm) "%.0f".format(v * 60.0) else "%.2f".format(v)
    }

    // Farb-Legende (min→max): grob gerundet, Einheit nur am oberen Ende.
    fun fmtLegend(hz: Double, withUnit: Boolean): String {
        if (ppm) return "%.0f".format(hz * 60.0) + (if (withUnit) I18n.t("unit.pumpPerMin") else "")
        return "%.1f".format(hz) + (if (withUnit) " Hz" else "")
    }
}
