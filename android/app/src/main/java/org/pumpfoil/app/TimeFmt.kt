package org.pumpfoil.app

import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

// Uhrzeiten/Daten in der ORTSZEIT DES SPOTS anzeigen — der Server liefert je Session die
// IANA-Zeitzone (`tz`, aus den Spot-Koordinaten). Eine 12:17-Session in Helsinki erscheint
// damit überall als 12:17, egal wo das Gerät steht. Fallback (tz fehlt/ungültig): wie bisher
// der Offset aus dem ISO-String. Spiegelt web/src/lib/time.ts.

private val FMT_PRETTY = DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm")
private val FMT_HHMM = DateTimeFormatter.ofPattern("HH:mm")

private fun zoned(iso: String, tz: String?): ZonedDateTime? = try {
    val odt = OffsetDateTime.parse(iso)
    if (tz != null) {
        try { odt.atZoneSameInstant(ZoneId.of(tz)) } catch (_: Exception) { odt.toZonedDateTime() }
    } else odt.toZonedDateTime()
} catch (_: Exception) { null }

// "dd.MM.yyyy HH:mm" — Listen-/Detail-Kopfzeilen (früher SessionsScreen.prettyDate).
fun prettyDate(iso: String, tz: String? = null): String =
    zoned(iso, tz)?.format(FMT_PRETTY) ?: try {
        LocalDateTime.parse(iso).format(FMT_PRETTY)
    } catch (_: Exception) { iso }

// Nur "HH:mm" (Bis-Zeit, Start–Ende-Zeile).
fun hhmm(iso: String?, tz: String? = null): String? =
    iso?.let { zoned(it, tz)?.format(FMT_HHMM) }

// Datum + Start[–Ende] + „Uhr" (nur wo üblich, via sessions.oclock). Für die Listen-Zeilen.
fun dateTimeRange(startIso: String, endIso: String?, tz: String? = null): String {
    val oc = I18n.t("sessions.oclock")
    val end = hhmm(endIso, tz)
    return prettyDate(startIso, tz) + (if (end != null) " – $end" else "") + (if (oc.isNotEmpty()) " $oc" else "")
}

// Kurzes Datum "dd.MM.yy" — Community-Rekord-Kacheln (früher CommunityScreen.shortDateC).
fun shortDate(iso: String?, tz: String? = null): String? = shortDateImpl(iso, tz, twoDigitYear = true)

// Kurzes Datum "dd.MM.yyyy" — Home-Rekord-Kacheln (früher HomeScreen.shortDate).
fun shortDateFull(iso: String?, tz: String? = null): String? = shortDateImpl(iso, tz, twoDigitYear = false)

private fun shortDateImpl(iso: String?, tz: String?, twoDigitYear: Boolean): String? {
    if (iso.isNullOrBlank()) return null
    val d = zoned(iso, tz)?.toLocalDate() ?: try {
        LocalDate.parse(iso.take(10))
    } catch (_: Exception) { return null }
    val year = if (twoDigitYear) "%02d".format(d.year % 100) else "%d".format(d.year)
    return "%02d.%02d.".format(d.dayOfMonth, d.monthValue) + year
}
