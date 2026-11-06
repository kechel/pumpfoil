package org.pumpfoil.app

import android.animation.ValueAnimator
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.BiasAlignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import kotlinx.coroutines.delay
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale
import kotlin.math.roundToInt
import kotlin.math.roundToLong

/*
 * Teams & Events — gemeinsame Bausteine (01.11.2026, docs/TEAMS.md „Native-Port (Stufe 4)"). Vorlage ist das Web:
 * Datenformen aus web/src/lib/api.ts, Teamfarben aus lib/teamFarben.ts, Kennzahlen aus lib/teamKennzahlen.ts,
 * Datumsanzeige aus lib/teamEvents.ts, die Event-Kachel aus components/EventKurzKachel.tsx + Team.tsx.
 * Regeln rechnet die App nicht nach: was der Server liefert, wird gezeigt.
 */

// ---------------------------------------------------------------------------------- Daten ----

@Serializable
data class TeamSpotKurz(val id: Int = 0, val name: String? = null)

/** GET /api/teams/mine — eigene Teams; `anfragen` > 0 nur fuer Leitung/Moderatoren. */
@Serializable
data class TeamKurz(
    val id: Int = 0,
    val name: String = "",
    val slug: String = "",
    @SerialName("logo_url") val logoUrl: String? = null,
    val farbe: String? = null,
    val sportarten: List<String> = emptyList(),
    val rolle: String = "mitglied",
    val status: String = "aktiv",   // aktiv | angefragt
    val anfragen: Int = 0,
    val land: String? = null,       // Herkunft: ISO-Code oder "k:<kontinent>"
    val freigabe: String? = null,   // keine | wartet | frei | abgelehnt (nur fuer die Leitung)
)

/** GET /api/teams/liste — freigegebene Teams in ihrer freigegebenen Fassung. */
@Serializable
data class TeamListenEintrag(
    val id: Int = 0,
    val name: String = "",
    val slug: String = "",
    val beschreibung: String? = null,
    @SerialName("logo_url") val logoUrl: String? = null,
    val farbe: String? = null,
    val sportarten: List<String> = emptyList(),
    @SerialName("mitglieder_anzahl") val mitgliederAnzahl: Int = 0,
    val land: String? = null,
    // Sessions der Mitglieder in 30 Tagen (fuer „Die aktivsten Teams", Community › Teams & Events)
    @SerialName("sessions_30d") val sessions30d: Int = 0,
)

/** GET /api/teams/{slug} (server teams._team_out). Leitungs-Felder (Freigabe …) braucht die App nicht. */
@Serializable
data class TeamInfo(
    val id: Int = 0,
    val name: String = "",
    val slug: String = "",
    val beschreibung: String? = null,
    @SerialName("logo_url") val logoUrl: String? = null,
    val farbe: String? = null,
    @SerialName("banner_url") val bannerUrl: String? = null,
    @SerialName("banner_fokus") val bannerFokus: String? = null,
    val sportarten: List<String> = emptyList(),
    @SerialName("mitglieder_anzahl") val mitgliederAnzahl: Int = 0,
    val oeffentlich: Boolean = false,
    @SerialName("bestenlisten_oeffentlich") val bestenlistenOeffentlich: Boolean = false,
    @SerialName("anmeldungen_zulassen") val anmeldungenZulassen: Boolean = false,
    @SerialName("automatisch_akzeptieren") val automatischAkzeptieren: Boolean = false,
    @SerialName("meine_rolle") val meineRolle: String? = null,   // leiter | moderator | mitglied, nur aktiv
    @SerialName("mein_status") val meinStatus: String? = null,   // aktiv | angefragt | null
    @SerialName("darf_bestenlisten") val darfBestenlisten: Boolean = false,
    @SerialName("darf_mitglieder") val darfMitglieder: Boolean = false,
    @SerialName("chat_scope") val chatScope: String? = null,     // nur fuer aktive Mitglieder
    @SerialName("anfragen_offen") val anfragenOffen: Int = 0,
    val land: String? = null,
    @SerialName("mitglieder_sichtbar") val mitgliederSichtbar: String = "mitglieder",   // mitglieder | angemeldete
    val spots: List<TeamSpotKurz> = emptyList(),
    // Nur fuer die Leitung (Verwaltung, 04.11.2026): Stand der Freigabe des Auftritts.
    val freigabe: String? = null,   // keine | wartet | frei | abgelehnt
    @SerialName("freigabe_notiz") val freigabeNotiz: String? = null,
    @SerialName("auftritt_geaendert") val auftrittGeaendert: Boolean = false,
    val frei: kotlinx.serialization.json.JsonObject? = null,   // freigegebene Fassung (nur ob es sie gibt, zaehlt)
    // Offizielles Team (server TEAM_GLOBAL, 06.11.2026): nur hier gibt es globale Events.
    val offiziell: Boolean = false,
) {
    val verwalter: Boolean get() = meineRolle == "leiter" || meineRolle == "moderator"
}

@Serializable
data class TeamZeile(
    val rang: Int = 0,
    val name: String? = null,
    val initialen: String = "",
    val value: Double = 0.0,
    @SerialName("user_id") val userId: Int? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    @SerialName("session_id") val sessionId: Int? = null,
    @SerialName("started_at") val startedAt: String? = null,
    val spot: String? = null,
    val land: String? = null,   // Nationalitaet, nur wenn im Profil eingestellt (Server additiv seit 02.11.2026)
)

/** Eine Bestenliste samt Zeilen (Team und Event). */
@Serializable
data class TeamTafel(
    val id: Int? = null,
    val kennzahl: String = "",
    val sportart: String = "pumpfoil",
    @SerialName("accel_only") val accelOnly: Boolean = false,
    @SerialName("nur_brett") val nurBrett: Boolean = false,
    @SerialName("nur_teamspots") val nurTeamspots: Boolean = false,
    @SerialName("foil_band") val foilBand: String = "all",
    val zeilen: List<TeamZeile> = emptyList(),
    // Nur bei Events (06.11.2026): Team-Rangliste eines globalen Events, die eigene Zeile (auch hinter Platz 10) und
    // wann die Liste gerechnet wurde (ISO, UTC).
    val teams: List<TeamWertungZeile>? = null,
    val eigene: TeamZeile? = null,
    val stand: String? = null,
)

/** Team-Rangliste eines globalen Events (server teams.team_wertung): Summe der besten N Mitglieder, `fahrer` davon
 *  gezaehlt, `teilnehmer` im Event. */
@Serializable
data class TeamWertungZeile(
    val rang: Int = 0,
    val name: String = "",
    val slug: String = "",
    @SerialName("logo_url") val logoUrl: String? = null,
    val farbe: String? = null,
    val land: String? = null,
    val value: Double = 0.0,
    val fahrer: Int = 0,
    val teilnehmer: Int = 0,
)

@Serializable
data class TeamBestenlisten(val period: String = "", val tafeln: List<TeamTafel> = emptyList())

@Serializable
data class TeamStatistik(
    val sessions: Int = 0,
    val runs: Int = 0,
    val pumps: Long = 0,
    @SerialName("distance_m") val distanceM: Double = 0.0,
    @SerialName("time_s") val timeS: Double = 0.0,
    val spots: Int = 0,
    val aktive: Int = 0,
    val mitglieder: Int = 0,
)

@Serializable
data class TeamLogbuchEintrag(
    val kennzahl: String = "",
    val sportart: String = "pumpfoil",
    @SerialName("user_id") val userId: Int? = null,
    val name: String? = null,
    @SerialName("session_id") val sessionId: Int? = null,
    val wert: Double = 0.0,
    @SerialName("vorher_name") val vorherName: String? = null,
    @SerialName("vorher_wert") val vorherWert: Double? = null,
    @SerialName("gefahren_am") val gefahrenAm: String? = null,
    @SerialName("erfasst_am") val erfasstAm: String? = null,
)

@Serializable
data class TeamMitglied(
    @SerialName("user_id") val userId: Int = 0,
    val name: String = "",
    @SerialName("avatar_url") val avatarUrl: String? = null,
    val rolle: String = "mitglied",
    val seit: String? = null,
    val profil: TeamAnfrageProfil? = null,   // nur bei Anfragen, fuer Leitung/Moderatoren
)

/** Bei einer Beitrittsanfrage: Sessions je Sportart und je Spot (meistgefahrene zuerst), Web `AnfrageProfil`. */
@Serializable
data class TeamAnfrageProfil(
    val sessions: Int = 0,
    val sportarten: List<TeamAnfrageZahl> = emptyList(),
    val spots: List<TeamAnfrageZahl> = emptyList(),
)

@Serializable
data class TeamAnfrageZahl(val sport: String? = null, val name: String? = null, val n: Int = 0)

@Serializable
data class TeamMitgliederAntwort(val mitglieder: List<TeamMitglied> = emptyList())

/** GET /api/teams/{slug}/mitglieder fuer die Verwaltung: Mitglieder und offene Anfragen. */
@Serializable
data class TeamMitgliederVoll(val mitglieder: List<TeamMitglied> = emptyList(), val anfragen: List<TeamMitglied> = emptyList())

/** GET /api/teams/slug: Vorschlag bzw. Pruefung einer Adresse; `fehler` = team.err.<code>. */
@Serializable
data class TeamSlugAntwort(val slug: String = "", val frei: Boolean = true, val fehler: String? = null)

/** Ein Event mit Bestenlisten (server teams.event_out). `tafeln` darf leer sein (dann nur Summen). */
@Serializable
data class TeamEvent(
    val id: Int = 0,
    val titel: String = "",
    val beschreibung: String? = null,
    val start: String = "",
    val ende: String = "",
    val zeitzone: String? = null,
    val status: String = "kommend",   // kommend | laeuft | auswertung | beendet
    val spots: List<TeamSpotKurz> = emptyList(),
    @SerialName("einfrieren_am") val einfrierenAm: String = "",
    val tafeln: List<TeamTafel> = emptyList(),
    @SerialName("ohne_dateien") val ohneDateien: Boolean = false,
    @SerialName("teambild_zeigen") val teambildZeigen: Boolean = true,
    @SerialName("summen_auswahl") val summenAuswahl: List<String> = emptyList(),
    val summen: Map<String, Double?> = emptyMap(),
    @SerialName("summen_sportart") val summenSportart: String = "pumpfoil",
    @SerialName("summen_accel_only") val summenAccelOnly: Boolean = false,
    @SerialName("spot_ids") val spotIds: List<Int> = emptyList(),
    val vorlage: String? = null,
    @SerialName("banner_url") val bannerUrl: String? = null,
    @SerialName("banner_fokus") val bannerFokus: String? = null,
    // Globales Event (06.11.2026): jeder nimmt automatisch teil; Teamwertung = Summe der besten N (0 = alle).
    val global: Boolean = false,
    @SerialName("team_wertung_n") val teamWertungN: Int? = null,
) {
    /** Sportarten: die der Bestenlisten, ohne Bestenliste die der Gesamtsummen (wie Web eventSportarten). */
    val sportarten: List<String> get() = (if (tafeln.isNotEmpty()) tafeln.map { it.sportart } else listOf(summenSportart)).distinct()
}

@Serializable
data class TeamEventTeam(
    val slug: String = "",
    val name: String = "",
    @SerialName("logo_url") val logoUrl: String? = null,
    val farbe: String? = null,
)

/** Kurzform fuer Listen (server api/teams._event_kurz): ohne Bestenlisten, mit Sportarten und Team. */
@Serializable
data class TeamEventKurz(
    val id: Int = 0,
    val titel: String = "",
    val beschreibung: String? = null,
    val start: String = "",
    val ende: String = "",
    val zeitzone: String? = null,
    val status: String = "kommend",
    val sportarten: List<String> = emptyList(),
    val spots: List<TeamSpotKurz> = emptyList(),
    val team: TeamEventTeam = TeamEventTeam(),
    val global: Boolean = false,   // globales Event (06.11.2026): eigene Karte mit Kalenderblock
)

@Serializable
data class TeamBeitritt(val status: String = "", val slug: String = "")

@Serializable
data class TeamEinladungInfo(
    val id: Int = 0,
    val name: String = "",
    val slug: String = "",
    @SerialName("logo_url") val logoUrl: String? = null,
    val farbe: String? = null,
    val art: String = "join",   // join | apply
    val oeffentlich: Boolean = false,
    @SerialName("mein_status") val meinStatus: String? = null,
)

/** Fehlertext zu einer Team-Antwort: `detail`-Code -> team.err.<code> (wie Web fehlerCode), sonst die Meldung. */
fun teamFehlerText(e: Throwable): String {
    val code = (e as? ApiFehler)?.detail ?: return e.message ?: I18n.t("team.err.unbekannt")
    val k = "team.err.$code"
    val t = I18n.t(k)
    return if (t == k) I18n.t("team.err.unbekannt") else t
}

// ----------------------------------------------------------------------------- Teamfarben ----
// 36 Schluessel wie web/src/lib/teamFarben.ts (und server/app/teams.py FARBEN). `dunkel`/`hell` sind die TEXTfarben
// im dunklen bzw. hellen Modus (halten 4,5:1); die FLAECHEN (Knoepfe, Wappen, Status „laeuft") tragen den sichtbaren
// Unterschied: `-hell` dort Tailwind 200 (dunkel) / 300 (hell) mit dunkler Schrift, `-dunkel` 700 / 900 mit weisser.

private class TeamFarbWerte(
    val dunkel: Long, val hell: Long,
    val dunkelFlaeche: Long? = null, val hellFlaeche: Long? = null,
    val dunkelAuf: Long? = null, val hellAuf: Long? = null,
)

private fun hellStufe(d: Long, h: Long, df: Long, hf: Long) = TeamFarbWerte(d, h, df, hf, hellAuf = 0xFF020617)
private fun dunkelStufe(d: Long, h: Long, df: Long, hf: Long) = TeamFarbWerte(d, h, df, hf, dunkelAuf = 0xFFFFFFFF)

private val TEAM_FARBEN: Map<String, TeamFarbWerte> = mapOf(
    "cyan-hell" to hellStufe(0xFF67E8F9, 0xFF0E7490, 0xFFA5F3FC, 0xFF67E8F9),
    "cyan" to TeamFarbWerte(0xFF22D3EE, 0xFF0E7490),
    "cyan-dunkel" to dunkelStufe(0xFF06B6D4, 0xFF155E75, 0xFF0E7490, 0xFF164E63),
    "blau-hell" to hellStufe(0xFF93C5FD, 0xFF1D4ED8, 0xFFBFDBFE, 0xFF93C5FD),
    "blau" to TeamFarbWerte(0xFF60A5FA, 0xFF1D4ED8),
    "blau-dunkel" to dunkelStufe(0xFF3B82F6, 0xFF1E40AF, 0xFF1D4ED8, 0xFF1E3A8A),
    "indigo-hell" to hellStufe(0xFFA5B4FC, 0xFF4338CA, 0xFFC7D2FE, 0xFFA5B4FC),
    "indigo" to TeamFarbWerte(0xFF818CF8, 0xFF4338CA),
    "indigo-dunkel" to dunkelStufe(0xFF6E74F4, 0xFF3730A3, 0xFF4338CA, 0xFF312E81),
    "violett-hell" to hellStufe(0xFFC4B5FD, 0xFF6D28D9, 0xFFDDD6FE, 0xFFC4B5FD),
    "violett" to TeamFarbWerte(0xFFA78BFA, 0xFF6D28D9),
    "violett-dunkel" to dunkelStufe(0xFF9166F7, 0xFF5B21B6, 0xFF6D28D9, 0xFF4C1D95),
    "pink-hell" to hellStufe(0xFFF9A8D4, 0xFFBE185D, 0xFFFBCFE8, 0xFFF9A8D4),
    "pink" to TeamFarbWerte(0xFFF472B6, 0xFFBE185D),
    "pink-dunkel" to dunkelStufe(0xFFEC4899, 0xFF9D174D, 0xFFBE185D, 0xFF831843),
    "rot-hell" to hellStufe(0xFFFCA5A5, 0xFFB91C1C, 0xFFFECACA, 0xFFFCA5A5),
    "rot" to TeamFarbWerte(0xFFF87171, 0xFFB91C1C),
    "rot-dunkel" to dunkelStufe(0xFFEF4444, 0xFF991B1B, 0xFFB91C1C, 0xFF7F1D1D),
    "orange-hell" to hellStufe(0xFFFDBA74, 0xFFC2410C, 0xFFFED7AA, 0xFFFDBA74),
    "orange" to TeamFarbWerte(0xFFFB923C, 0xFFC2410C),
    "orange-dunkel" to dunkelStufe(0xFFF97316, 0xFF9A3412, 0xFFC2410C, 0xFF7C2D12),
    "amber-hell" to hellStufe(0xFFFCD34D, 0xFFB45309, 0xFFFDE68A, 0xFFFCD34D),
    "amber" to TeamFarbWerte(0xFFFBBF24, 0xFFB45309),
    "amber-dunkel" to dunkelStufe(0xFFF59E0B, 0xFF92400E, 0xFFB45309, 0xFF78350F),
    "gelb-hell" to hellStufe(0xFFFDE047, 0xFFA16207, 0xFFFEF08A, 0xFFFDE047),
    "gelb" to TeamFarbWerte(0xFFFACC15, 0xFFA16207),
    "gelb-dunkel" to dunkelStufe(0xFFEAB308, 0xFF854D0E, 0xFFA16207, 0xFF713F12),
    "limette-hell" to hellStufe(0xFFBEF264, 0xFF4D7C0F, 0xFFD9F99D, 0xFFBEF264),
    "limette" to TeamFarbWerte(0xFFA3E635, 0xFF4D7C0F),
    "limette-dunkel" to dunkelStufe(0xFF84CC16, 0xFF3F6212, 0xFF4D7C0F, 0xFF365314),
    "gruen-hell" to hellStufe(0xFF86EFAC, 0xFF15803D, 0xFFBBF7D0, 0xFF86EFAC),
    "gruen" to TeamFarbWerte(0xFF4ADE80, 0xFF15803D),
    "gruen-dunkel" to dunkelStufe(0xFF22C55E, 0xFF166534, 0xFF15803D, 0xFF14532D),
    "petrol-hell" to hellStufe(0xFF5EEAD4, 0xFF0F766E, 0xFF99F6E4, 0xFF5EEAD4),
    "petrol" to TeamFarbWerte(0xFF2DD4BF, 0xFF0F766E),
    "petrol-dunkel" to dunkelStufe(0xFF14B8A6, 0xFF115E59, 0xFF0F766E, 0xFF134E4A),
)

/** Aufgeloeste Teamfarbe fuer den aktuellen Modus: Text/Rahmen, Flaeche + Schrift darauf, leichte Flaeche (14 %). */
data class TeamFarbe(val akzent: Color, val flaeche: Color, val aufFlaeche: Color) {
    val leicht: Color get() = akzent.copy(alpha = 0.14f)
}

@Composable
internal fun teamDunkel(): Boolean = MaterialTheme.colorScheme.background.luminance() < 0.5f

@Composable
fun teamFarbe(farbe: String?): TeamFarbe {
    val f = TEAM_FARBEN[farbe ?: "cyan"] ?: TEAM_FARBEN.getValue("cyan")
    return if (teamDunkel()) TeamFarbe(Color(f.dunkel), Color(f.dunkelFlaeche ?: f.dunkel), Color(f.dunkelAuf ?: 0xFF020617))
    else TeamFarbe(Color(f.hell), Color(f.hellFlaeche ?: f.hell), Color(f.hellAuf ?: 0xFFFFFFFF))
}

/** Teamfarbe der DUNKLEN Fassung, ohne Compose — fuer gezeichnete Bilder (Team-Bestenliste als Bild, dunkle Fassung). */
internal fun teamFarbeDunkel(farbe: String?): TeamFarbe {
    val f = TEAM_FARBEN[farbe ?: "cyan"] ?: TEAM_FARBEN.getValue("cyan")
    return TeamFarbe(Color(f.dunkel), Color(f.dunkelFlaeche ?: f.dunkel), Color(f.dunkelAuf ?: 0xFF020617))
}

/** Teamfarbe der HELLEN Fassung, ohne Compose — fuer die helle Fassung der Team-Bestenliste als Bild. */
internal fun teamFarbeHell(farbe: String?): TeamFarbe {
    val f = TEAM_FARBEN[farbe ?: "cyan"] ?: TEAM_FARBEN.getValue("cyan")
    return TeamFarbe(Color(f.hell), Color(f.hellFlaeche ?: f.hell), Color(f.hellAuf ?: 0xFFFFFFFF))
}

/** Alle Schluessel der Teamfarben in der Reihenfolge des Webs (TEAM_FARBEN, je Farbton hell · mittel · dunkel). */
internal val TEAM_FARB_SCHLUESSEL: List<String> get() = TEAM_FARBEN.keys.toList()

// ---------------------------------------------------------------------------- Kennzahlen ----
// Wie web/src/lib/teamKennzahlen.ts: Beschriftung und Format an EINER Stelle (Schluessel = server teams.KENNZAHLEN).

private fun sprachLocale(): Locale = when (I18n.lang) {
    "gsw" -> Locale.forLanguageTag("de-CH")
    else -> Locale.forLanguageTag(I18n.lang)
}

internal fun ganzZahl(v: Number): String = java.text.NumberFormat.getIntegerInstance(sprachLocale()).format(v.toDouble().roundToLong())
private fun kmGesamt(m: Double) = if (m < 1000) "${m.roundToInt()} m" else if (m < 100000) "%.1f km".format(m / 1000) else "${(m / 1000).roundToInt()} km"
private fun zeitGesamt(s: Double) = if (s < 3600) "${(s / 60).roundToInt()} min" else "%.1f h".format(s / 3600)

internal fun kennzahlLabel(key: String): String = I18n.t(when (key) {
    "session_pumps" -> "rec.sessionPumps"
    "distance" -> "rec.farthestRun"
    "duration" -> "rec.longestRun"
    "speed" -> "rec.topSpeed"
    "glide" -> "rec.longestGlide"
    "runs" -> "rec.mostRuns"
    "session_distance" -> "rec.sessionDistance"
    "session_time" -> "rec.sessionTime"
    else -> "team.k.$key"   // sum_pumps, sum_runs, sum_sessions, sum_distance, sum_time, sum_spots
})

internal fun kennzahlWert(key: String, v: Double): String = when (key) {
    "distance" -> if (v < 1000) "${v.roundToInt()} m" else "%.2f km".format(v / 1000)
    "duration" -> fmtLaufDauer(v)
    "speed" -> "%.1f km/h".format(v * 3.6)
    "glide" -> "%.1f s".format(v)
    "session_distance" -> "%.1f km".format(v / 1000)
    "session_time" -> "${(v / 60).roundToInt()} min"
    "sum_distance" -> kmGesamt(v)
    "sum_time" -> zeitGesamt(v)
    else -> ganzZahl(v)
}

/** Kennzahl, dahinter die Sportart, wenn es nicht Pumpfoil ist (Web tafelKurz). */
internal fun tafelKurz(kennzahl: String, sportart: String): String =
    kennzahlLabel(kennzahl) + if (sportart != "pumpfoil") " (${I18n.t("cls.sport.$sportart")})" else ""

internal fun sportartenText(sp: List<String>): String = sp.joinToString(" · ") { I18n.t("cls.sport.$it") }

/** Gesamtsummen eines Events — Schluessel und Reihenfolge wie server teams.EVENT_SUMMEN. */
internal val EVENT_SUMMEN: List<Triple<String, String, (Double) -> String>> = listOf(
    Triple("pumps", "team.stat.pumps") { v -> ganzZahl(v) },
    Triple("distance_m", "team.stat.strecke", ::kmGesamt),
    Triple("time_s", "team.stat.zeit", ::zeitGesamt),
    Triple("sessions", "team.stat.sessions") { v -> ganzZahl(v) },
    Triple("runs", "team.stat.laeufe") { v -> ganzZahl(v) },
    Triple("spots", "team.k.sum_spots") { v -> ganzZahl(v) },
    Triple("aktive", "team.event.teilnehmer") { v -> ganzZahl(v) },
)

/** „Längster Lauf · Event gesamt: Pumps, On-Foil-Strecke" (Web eventGemessen). */
internal fun eventGemessen(e: TeamEvent): String {
    val teile = e.tafeln.map { tafelKurz(it.kennzahl, it.sportart) }.toMutableList()
    val summen = EVENT_SUMMEN.filter { it.first in e.summenAuswahl }
    if (summen.isNotEmpty()) teile.add("${I18n.t("team.event.teamGesamt")}: " + summen.joinToString(", ") { I18n.t(it.second) })
    return teile.joinToString(" · ")
}

/** Wie die Ergebnisse heissen: vorher Details, waehrenddessen aktueller Stand, danach Ergebnis. */
internal fun eventStandKey(status: String): String = when (status) {
    "kommend" -> "team.event.details"
    "beendet" -> "team.event.ergebnis"
    else -> "team.event.stand"
}

// ------------------------------------------------------------------------------ Zeitangaben ----
// Wie web/src/lib/teamEvents.ts — immer in der Zeitzone des Events. Wochentag, Tag, Monat kurz, Jahr ueber ICU-Skelette,
// damit Reihenfolge und Schreibweise der Sprache folgen (wie Intl.DateTimeFormat im Web).

internal fun isoInstant(s: String?): Instant? {
    if (s.isNullOrBlank()) return null
    return runCatching { OffsetDateTime.parse(s).toInstant() }.getOrNull()
        ?: runCatching { Instant.parse(s) }.getOrNull()
        ?: runCatching { java.time.LocalDateTime.parse(s).atZone(ZoneId.systemDefault()).toInstant() }.getOrNull()
}

private fun eventZone(z: String?): ZoneId = z?.let { runCatching { ZoneId.of(it) }.getOrNull() } ?: ZoneId.systemDefault()

private fun icuFormat(skelett: String, zeitzone: String?, i: Instant): String {
    val f = android.icu.text.DateFormat.getInstanceForSkeleton(skelett, sprachLocale())
    f.timeZone = android.icu.util.TimeZone.getTimeZone(eventZone(zeitzone).id)
    return f.format(java.util.Date(i.toEpochMilli()))
}

private fun mitternacht(i: Instant, zeitzone: String?): Boolean =
    i.atZone(eventZone(zeitzone)).let { it.hour == 0 && it.minute == 0 }

private const val TAG = "EEEdMMMyyyy"
private const val TAG_ZEIT = "EEEdMMMyyyyjjmm"

/** Zeitfenster mit Wochentag; liegen beide Grenzen auf Mitternacht, nur die Tage, das Ende als LETZTER Tag. */
internal fun eventZeitraum(start: String, ende: String, zeitzone: String?): String {
    val a = isoInstant(start) ?: return ""
    val b = isoInstant(ende) ?: return ""
    return runCatching {
        if (mitternacht(a, zeitzone) && mitternacht(b, zeitzone))
            "${icuFormat(TAG, zeitzone, a)} – ${icuFormat(TAG, zeitzone, b.minusSeconds(12 * 3600))}"
        else "${icuFormat(TAG_ZEIT, zeitzone, a)} – ${icuFormat(TAG_ZEIT, zeitzone, b)}"
    }.getOrElse { "$start – $ende" }
}

/** Zeitfenster IMMER mit Uhrzeit (grosse Anzeige vor dem Start); ein Ende um Mitternacht als „24:00" am Vortag. */
internal fun eventZeitraumGenau(start: String, ende: String, zeitzone: String?): Pair<String, String> {
    val a = isoInstant(start) ?: return start to ende
    val b = isoInstant(ende) ?: return start to ende
    return runCatching {
        val bis = if (mitternacht(b, zeitzone)) "${icuFormat(TAG, zeitzone, b.minusSeconds(12 * 3600))}, 24:00"
                  else icuFormat(TAG_ZEIT, zeitzone, b)
        icuFormat(TAG_ZEIT, zeitzone, a) to bis
    }.getOrElse { start to ende }
}

/** Kalenderblock der Karte globaler Events (Web eventTage, 06.11.2026): Monat, Tage („7–8"), Wochentage („Sa–So") in
 *  der Zeitzone des Events. Ein Ende um Mitternacht gehoert zum Vortag; ueber einen Monatswechsel stehen beide Monate da. */
internal data class EventTage(val monat: String, val tage: String, val wochentage: String)

internal fun eventTage(start: String, ende: String, zeitzone: String?): EventTage {
    val a = isoInstant(start) ?: return EventTage("", "", "")
    val b0 = isoInstant(ende) ?: return EventTage("", "", "")
    val b = if (mitternacht(b0, zeitzone)) b0.minusSeconds(12 * 3600) else b0
    return runCatching {
        val ma = icuFormat("MMM", zeitzone, a).removeSuffix("."); val mb = icuFormat("MMM", zeitzone, b).removeSuffix(".")
        val ta = icuFormat("d", zeitzone, a).removeSuffix("."); val tb = icuFormat("d", zeitzone, b).removeSuffix(".")
        val wa = icuFormat("EEE", zeitzone, a); val wb = icuFormat("EEE", zeitzone, b)
        val gleicherTag = ma == mb && ta == tb
        EventTage(if (ma == mb) ma else "$ma – $mb", if (gleicherTag) ta else "$ta–$tb", if (gleicherTag) wa else "$wa–$wb")
    }.getOrElse { EventTage("", "", "") }
}

/** Ein Zeitpunkt (Upload-Frist) mittel lang, in der Zeitzone des Events. */
internal fun eventZeit(iso: String, zeitzone: String?): String {
    val i = isoInstant(iso) ?: return iso
    return runCatching {
        DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM, FormatStyle.SHORT).withLocale(sprachLocale())
            .format(i.atZone(eventZone(zeitzone)))
    }.getOrElse { iso }
}

/** Datum kurz in der Geraetezone (Bestenliste, Logbuch). */
internal fun kurzDatum(iso: String?): String {
    val i = isoInstant(iso) ?: return ""
    return DateTimeFormatter.ofLocalizedDate(FormatStyle.SHORT).withLocale(sprachLocale()).format(i.atZone(ZoneId.systemDefault()))
}

/** „5 T" — Tage kurz ueber ICU (narrow), in jeder Sprache richtig ohne eigene Pluralformen (Web KachelUhr). */
private fun tageKurz(d: Long): String = runCatching {
    android.icu.text.MeasureFormat.getInstance(android.icu.util.ULocale.forLocale(sprachLocale()),
        android.icu.text.MeasureFormat.FormatWidth.NARROW)
        .format(android.icu.util.Measure(d, android.icu.util.MeasureUnit.DAY))
}.getOrElse { "${d}d" }

/** Sekundengenaue Uhr fuer Countdowns. */
@Composable
internal fun rememberJetzt(): Long {
    var jetzt by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) { delay(1000); jetzt = System.currentTimeMillis() }
    }
    return jetzt
}

/** Restzeit bis `ziel` in Sekunden (nie negativ). */
internal fun restSekunden(ziel: String, jetzt: Long): Long =
    maxOf(0L, ((isoInstant(ziel)?.toEpochMilli() ?: jetzt) - jetzt) / 1000)

/** Countdown in einer Zeile: „Startet in 5 T 12:03:45". */
internal fun countdownText(rest: Long): String {
    val d = rest / 86400
    val zz = { n: Long -> n.toString().padStart(2, '0') }
    return (if (d > 0) tageKurz(d) + " " else "") + "${zz(rest / 3600 % 24)}:${zz(rest / 60 % 60)}:${zz(rest % 60)}"
}

// --------------------------------------------------------------------------------- Bausteine ----

internal fun teamInitialen(name: String?): String {
    val teile = (name ?: "").trim().split(Regex("[\\s._-]+")).filter { it.isNotEmpty() }
    if (teile.isEmpty()) return "?"
    return if (teile.size == 1) teile[0].take(2).uppercase() else (teile[0].take(1) + teile.last().take(1)).uppercase()
}

/** Team-Wappen: Logo, sonst die Initialen in der Teamfarbe (Web TeamWappen). */
@Composable
fun TeamWappen(name: String?, logo: String?, farbe: String?, size: Dp = 40.dp) {
    val url = Api.mediaUrl(logo)
    if (url != null) {
        AsyncImage(model = url, contentDescription = null, contentScale = ContentScale.Fit,
            modifier = Modifier.size(size).clip(RoundedCornerShape(8.dp)))
    } else {
        val f = teamFarbe(farbe)
        Box(Modifier.size(size).clip(RoundedCornerShape(8.dp)).background(f.flaeche), contentAlignment = Alignment.Center) {
            Text(teamInitialen(name), color = f.aufFlaeche, fontWeight = FontWeight.Bold,
                fontSize = (size.value * 0.38f).sp, maxLines = 1)
        }
    }
}

/** Team- bzw. Eventbild: nie zugeschnitten gespeichert; Anzeige 2,5:1 mit dem Fokuspunkt „x,y" (Prozent). */
@Composable
fun TeamBanner(url: String, fokus: String?, modifier: Modifier = Modifier) {
    val (x, y) = (fokus ?: "50,50").split(",").map { (it.trim().toFloatOrNull() ?: 50f).coerceIn(0f, 100f) }
        .let { if (it.size == 2) it[0] to it[1] else 50f to 50f }
    AsyncImage(
        model = Api.mediaUrl(url), contentDescription = null, contentScale = ContentScale.Crop,
        alignment = BiasAlignment(x / 50f - 1f, y / 50f - 1f),
        modifier = modifier.fillMaxWidth().aspectRatio(2.5f).clip(RoundedCornerShape(16.dp)),
    )
}

/** Sanftes Pulsieren 1 -> 0,7 fuer „laeuft"; still, wenn das System Animationen abgeschaltet hat. */
@Composable
private fun pulsAlpha(an: Boolean): Float {
    if (!an || !ValueAnimator.areAnimatorsEnabled()) return 1f
    val t = rememberInfiniteTransition(label = "eventPuls")
    val a by t.animateFloat(1f, 0.7f, infiniteRepeatable(tween(1000, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "eventPulsAlpha")
    return a
}

/** Status-Abzeichen eines Events: „laeuft" in Teamfarbe und pulsierend, sonst neutral. */
@Composable
fun EventStatusChip(status: String, farbe: TeamFarbe) {
    val laeuft = status == "laeuft"
    Text(
        I18n.t("team.event.status.$status"),
        style = MaterialTheme.typography.labelMedium,
        fontWeight = if (laeuft) FontWeight.Bold else FontWeight.SemiBold,
        color = if (laeuft) farbe.aufFlaeche else MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.alpha(pulsAlpha(laeuft)).clip(CircleShape)
            .background(if (laeuft) farbe.flaeche else MaterialTheme.colorScheme.surfaceVariant)
            .padding(horizontal = 8.dp, vertical = 2.dp),
    )
}

/** Sportart-Abzeichen (gelb, immer — auch Pumpfoil). */
@Composable
fun SportChip(sport: String) {
    val dunkel = teamDunkel()
    Text(
        I18n.t("cls.sport.$sport"), style = MaterialTheme.typography.labelMedium,
        color = if (dunkel) Color(0xFFFCD34D) else Color(0xFFB45309),
        modifier = Modifier.clip(RoundedCornerShape(4.dp)).background(Color(0xFFF59E0B).copy(alpha = 0.15f))
            .padding(horizontal = 6.dp, vertical = 2.dp),
    )
}

@Composable
fun SpotChip(name: String) {
    Row(
        Modifier.clip(RoundedCornerShape(4.dp)).background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(horizontal = 6.dp, vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.Place, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(14.dp))
        Spacer(Modifier.width(3.dp))
        Text(name, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/**
 * Die Event-Kachel — ueberall dieselbe (Teamseite oben und unten, Community, Alle Events; Jan 01.11.2026): Titel,
 * Status, Sportarten, Spots, Zeitraum + Countdown in derselben Zeile, NUR die erste Zeile der Beschreibung (hoechstens
 * zwei Zeilen hoch, fett), der Link rechts auf Hoehe der letzten Zeile. Keine Sieger, keine Kennzahlen.
 * `team` gesetzt (Listen ueber mehrere Teams): Wappen vor dem Titel und der Teamname vor dem Zeitraum.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun EventKachel(
    titel: String, beschreibung: String?, status: String, start: String, ende: String, zeitzone: String?,
    sportarten: List<String>, spots: List<TeamSpotKurz>, farbe: String?, onClick: () -> Unit,
    modifier: Modifier = Modifier, team: TeamEventTeam? = null,
) {
    val f = teamFarbe(farbe)
    val laeuft = status == "laeuft"
    Card(
        modifier.fillMaxWidth().clip(CardDefaults.shape).clickable(onClick = onClick),
        border = if (laeuft) BorderStroke(2.dp, f.akzent) else null,
    ) {
        Column(Modifier.padding(12.dp)) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                if (team != null) Box(Modifier.align(Alignment.CenterVertically)) { TeamWappen(team.name, team.logoUrl, team.farbe, 20.dp) }
                Text(titel, color = f.akzent, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold,
                    modifier = Modifier.align(Alignment.CenterVertically))
                Box(Modifier.align(Alignment.CenterVertically)) { EventStatusChip(status, f) }
                sportarten.forEach { Box(Modifier.align(Alignment.CenterVertically)) { SportChip(it) } }
                spots.forEach { Box(Modifier.align(Alignment.CenterVertically)) { SpotChip(it.name ?: "#${it.id}") } }
            }
            Spacer(Modifier.size(4.dp))
            Row(verticalAlignment = Alignment.Bottom) {
                Column(Modifier.weight(1f)) {
                    val zaehlt = status == "kommend" || laeuft
                    val jetzt = if (zaehlt) rememberJetzt() else 0L
                    Text(buildAnnotatedString {
                        if (team != null) append(team.name + " · ")
                        append(eventZeitraum(start, ende, zeitzone))
                        if (zaehlt) {
                            append(" · ")
                            withStyle(SpanStyle(color = f.akzent, fontWeight = FontWeight.SemiBold)) {
                                append(I18n.t(if (laeuft) "team.event.endetIn" else "team.event.startIn") + " " +
                                    countdownText(restSekunden(if (laeuft) ende else start, jetzt)))
                            }
                        }
                    }, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    beschreibung?.trim()?.takeIf { it.isNotEmpty() }?.let { b ->
                        Text(b.lineSequence().first(), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold,
                            maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 2.dp))
                    }
                }
                Spacer(Modifier.width(10.dp))
                Text(I18n.t(eventStandKey(status)) + " →", color = f.akzent, style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

@Composable
fun EventKachel(e: TeamEvent, farbe: String?, onClick: () -> Unit, modifier: Modifier = Modifier) =
    EventKachel(e.titel, e.beschreibung, e.status, e.start, e.ende, e.zeitzone, e.sportarten, e.spots, farbe, onClick, modifier)

@Composable
fun EventKachel(e: TeamEventKurz, onClick: () -> Unit, modifier: Modifier = Modifier) {
    if (e.global) { GlobalEventKachel(e, onClick, modifier); return }
    EventKachel(e.titel, e.beschreibung, e.status, e.start, e.ende, e.zeitzone, e.sportarten, e.spots, e.team.farbe, onClick,
        modifier, team = e.team)
}

/** Abzeichen „Global" (Karten, Event-Seite): Pumpfoil-Cyan, hell dunkler (Web brand-700 / dark brand-300). */
@Composable
fun GlobalChip() {
    val dunkel = teamDunkel()
    Text(
        I18n.t("team.event.global"), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold,
        color = if (dunkel) Color(0xFF67E8F9) else Color(0xFF0E7490),
        modifier = Modifier.clip(CircleShape).background(Color(0xFF06B6D4).copy(alpha = 0.15f))
            .padding(horizontal = 8.dp, vertical = 2.dp),
    )
}

/** Pumpfoil-Cyan fuer Text/Symbole auf neutralem Grund (Web brand-700 hell, brand-300 dunkel). */
@Composable
internal fun markenAkzent(): Color = if (teamDunkel()) Color(0xFF67E8F9) else Color(0xFF0E7490)

/**
 * Karte globaler Events (Web EventKurzKachel GlobalKachel, Jan 06.11.2026: „der zeitraum sollte groesser dargestellt
 * werden, irgendwie ist alles wichtig"): Kalenderblock links (Monat, Tage, Wochentage), rechts Status, „Global",
 * Sportarten/Spots, Titel gross, Countdown und die erste Zeile der Beschreibung. Ohne Teamname — „Global" sagt, woher es kommt.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun GlobalEventKachel(e: TeamEventKurz, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val laeuft = e.status == "laeuft"
    val marke = MaterialTheme.colorScheme.primary
    val akzent = markenAkzent()
    val d = eventTage(e.start, e.ende, e.zeitzone)
    Card(
        modifier.fillMaxWidth().clip(CardDefaults.shape).clickable(onClick = onClick),
        border = BorderStroke(2.dp, if (laeuft) marke else marke.copy(alpha = 0.4f)),
    ) {
        Row(Modifier.padding(14.dp)) {
            Column(Modifier.width(84.dp).clip(RoundedCornerShape(12.dp)).background(marke.copy(alpha = 0.15f))
                .padding(horizontal = 4.dp, vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(d.monat.uppercase(), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold, color = akzent,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                Text(d.tage, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.ExtraBold, maxLines = 1,
                    color = MaterialTheme.colorScheme.onSurface, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                Text(d.wochentage, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    // „laeuft" in Pumpfoil-Cyan statt Teamfarbe (die Karte gehoert keinem Team).
                    EventStatusChip(e.status, TeamFarbe(akzent = marke, flaeche = marke, aufFlaeche = MaterialTheme.colorScheme.onPrimary))
                    GlobalChip()
                    e.sportarten.forEach { SportChip(it) }
                    e.spots.forEach { SpotChip(it.name ?: "#${it.id}") }
                }
                // Titel in unserem Cyan wie die Titel der Team-Events (Jan, 06.11.2026: „ist das nicht eigentlich unser cyan?");
                // ohne ausdrueckliche Farbe erbte er die gedaempfte Textfarbe der Card und wirkte im Dunkeln grau.
                Text(e.titel, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold,
                    color = akzent, modifier = Modifier.padding(top = 4.dp))
                if (e.status == "kommend" || laeuft) {
                    val jetzt = rememberJetzt()
                    Text(I18n.t(if (laeuft) "team.event.endetIn" else "team.event.startIn") + " " +
                            countdownText(restSekunden(if (laeuft) e.ende else e.start, jetzt)),
                        style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = akzent,
                        modifier = Modifier.padding(top = 2.dp))
                }
                e.beschreibung?.trim()?.takeIf { it.isNotEmpty() }?.let { b ->
                    Text(b.lineSequence().first(), style = MaterialTheme.typography.bodyMedium, maxLines = 2, overflow = TextOverflow.Ellipsis,
                        color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
                }
            }
        }
    }
}

/**
 * Abzeichen am Reiter (Community „Teams & Events", Home „Team"; Web EventAbzeichen, 06.11.2026): LIVE pulsierend, solange
 * ein Event laeuft, sonst die Zahl der kommenden. Nichts, wenn beides nicht zutrifft.
 */
@Composable
fun EventAbzeichen(live: Boolean, bald: Int) {
    val marke = MaterialTheme.colorScheme.primary
    if (live) {
        Text(I18n.t("team.event.status.laeuft").uppercase(), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onPrimary, maxLines = 1,
            modifier = Modifier.alpha(pulsAlpha(true)).clip(CircleShape).background(marke).padding(horizontal = 6.dp, vertical = 1.dp))
    } else if (bald > 0) {
        Text(bald.toString(), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, color = markenAkzent(),
            modifier = Modifier.clip(CircleShape).background(MaterialTheme.colorScheme.surfaceVariant).padding(horizontal = 6.dp, vertical = 1.dp))
    }
}

// ------------------------------------------------------------------------------- Symbole ----
// Wie web/src/components/Icons.tsx (fefda447, Jan 06.11.2026: „ueberall wo wir auf events verweisen auch das
// event-zeichen"): Events = Fahne, Teams = drei Personen (Mitte vorn); Strich 2, runde Enden, keine Fuellung.

private fun strichSymbol(name: String, vararg pfade: String): androidx.compose.ui.graphics.vector.ImageVector =
    androidx.compose.ui.graphics.vector.ImageVector.Builder(name, 24.dp, 24.dp, 24f, 24f).apply {
        pfade.forEach { d ->
            addPath(androidx.compose.ui.graphics.vector.addPathNodes(d), fill = null,
                stroke = androidx.compose.ui.graphics.SolidColor(Color.Black), strokeLineWidth = 2f,
                strokeLineCap = androidx.compose.ui.graphics.StrokeCap.Round,
                strokeLineJoin = androidx.compose.ui.graphics.StrokeJoin.Round)
        }
    }.build()

/** Events: die Fahne (Web EventIcon = FlagIcon). Mit `Icon(tint = …)` einfaerben. */
val EventSymbol: androidx.compose.ui.graphics.vector.ImageVector by lazy {
    strichSymbol("event", "M5 21V4", "M5 4h11l-2 3 2 3H5")
}

/** Teams: drei Personen (Web TeamIcon); Community bleibt bei zweien (Material Groups). Kreise als zwei Boegen. */
val TeamSymbol: androidx.compose.ui.graphics.vector.ImageVector by lazy {
    strichSymbol("team",
        "M12 4a3 3 0 1 0 0 6a3 3 0 1 0 0-6z", "M6.5 20v-1.5a5.5 5.5 0 0 1 11 0V20",
        "M5 6.8a2.2 2.2 0 1 0 0 4.4a2.2 2.2 0 1 0 0-4.4z", "M1.5 19v-1a3.5 3.5 0 0 1 4.2-3.4",
        "M19 6.8a2.2 2.2 0 1 0 0 4.4a2.2 2.2 0 1 0 0-4.4z", "M22.5 19v-1a3.5 3.5 0 0 0-4.2-3.4")
}

/**
 * Beitritts-Dialog (Web BeitrittDialog). Das Kleingedruckte steht IMMER da (Jan, 31.10.2026): wer beitritt, stimmt zu,
 * dass die Bestenlisten oeffentlich sein KOENNEN.
 */
@Composable
fun TeamBeitrittDialog(name: String, oeffentlich: Boolean, freigabeNoetig: Boolean, busy: Boolean, farbe: String?,
                       onJa: () -> Unit, onNein: () -> Unit) {
    val f = teamFarbe(farbe)
    AlertDialog(
        onDismissRequest = onNein,
        title = { Text(I18n.t("team.join.title").replace("{name}", name)) },
        text = {
            Column {
                Text(if (freigabeNoetig) "${I18n.t("team.join.anfrage")} ${I18n.t("team.join.anfrageProfil")}" else I18n.t("team.join.direkt"),
                    style = MaterialTheme.typography.bodyMedium)
                Spacer(Modifier.size(10.dp))
                Text("${I18n.t(if (oeffentlich) "team.join.kleinOeffentlich" else "team.join.kleinIntern")} ${I18n.t("team.join.kleinAenderbar")}",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
        confirmButton = {
            Button(onClick = onJa, enabled = !busy,
                colors = ButtonDefaults.buttonColors(containerColor = f.flaeche, contentColor = f.aufFlaeche)) {
                Text(I18n.t(if (freigabeNoetig) "team.join.anfragen" else "team.join.beitreten"))
            }
        },
        dismissButton = { TextButton(onClick = onNein) { Text(I18n.t("common.cancel")) } },
    )
}

/** Knopf in Teamfarbe (Beitreten …). */
@Composable
fun TeamKnopf(text: String, farbe: TeamFarbe, onClick: () -> Unit, enabled: Boolean = true) {
    Button(onClick = onClick, enabled = enabled,
        colors = ButtonDefaults.buttonColors(containerColor = farbe.flaeche, contentColor = farbe.aufFlaeche)) {
        Text(text, fontWeight = FontWeight.SemiBold)
    }
}

/**
 * Eine Bestenliste (Web Tafel). Name -> Profilseite (LocalOpenFoiler), Wert -> Session. Ohne `user_id` (Gastform)
 * nur Initialen und kein Link. `ohneFilter`: die Filterzeile weglassen (Event-Seite).
 */
@Composable
fun TeamTafelKarte(tf: TeamTafel, farbe: TeamFarbe, onOpenSession: (Int) -> Unit, ohneFilter: Boolean = false,
                   /** Sportart als Marke neben der Ueberschrift, wenn die Listen verschiedene Sportarten haben (Web 831f6406). */
                   sportZeigen: Boolean = false,
                   /** „Stand 6. Nov., 14:32" bzw. „Endstand" unter der Ueberschrift (Event-Seite, Web 06.11.2026). */
                   standText: String? = null,
                   /** Als Bild teilen: Knopf „Teilen" rechts neben der Ueberschrift (Web 6b9a6f0d). */
                   onBild: (() -> Unit)? = null) {
    val oeffneFoiler = LocalOpenFoiler.current
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                    Text(kennzahlLabel(tf.kennzahl), color = farbe.akzent, style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f, fill = false))
                    if (sportZeigen) {
                        Spacer(Modifier.width(8.dp))
                        Text(I18n.t("cls.sport.${tf.sportart}"), style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.clip(RoundedCornerShape(50)).background(MaterialTheme.colorScheme.surfaceVariant)
                                .padding(horizontal = 8.dp, vertical = 2.dp))
                    }
                }
                if (onBild != null && tf.zeilen.isNotEmpty()) TeilenKnopf(onBild)
            }
            val filter = listOfNotNull(
                if (tf.sportart != "pumpfoil" && !sportZeigen) I18n.t("cls.sport.${tf.sportart}") else null,
                if (tf.nurTeamspots) I18n.t("team.tafel.nurTeamspots") else null,
                if (tf.nurBrett) I18n.t("team.tafel.nurBrett") else null,
            ).joinToString(" · ")
            if (filter.isNotEmpty() && !ohneFilter) Text(filter, style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            standText?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            if (tf.zeilen.isEmpty()) {
                Text(I18n.t("team.tafel.leer"), style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
            }
            tf.zeilen.forEachIndexed { i, z ->
                if (i > 0) HorizontalDivider()
                Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("${z.rang}", Modifier.width(32.dp), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold, maxLines = 1, softWrap = false,
                        color = if (z.rang <= 3) farbe.akzent else MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = androidx.compose.ui.text.style.TextAlign.End)
                    Spacer(Modifier.width(8.dp))
                    val uid = z.userId
                    val av = Api.mediaUrl(z.avatarUrl)
                    if (uid != null && av != null) {
                        ProfilbildRahmen(uid, 28.dp) {
                            AsyncImage(model = av, contentDescription = null, contentScale = ContentScale.Crop,
                                modifier = Modifier.size(28.dp).clip(CircleShape))
                        }
                    } else {
                        Box(Modifier.size(28.dp).clip(CircleShape).background(farbe.leicht), contentAlignment = Alignment.Center) {
                            Text(z.initialen, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
                        }
                    }
                    Spacer(Modifier.width(6.dp))
                    LandFlagge(z.land)   // nach dem Profilbild, Platz bleibt auch ohne Land (Web Flagge)
                    Spacer(Modifier.width(6.dp))
                    Column(Modifier.weight(1f)) {
                        Text(z.name ?: "—", style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis,
                            modifier = if (uid != null && oeffneFoiler != null) Modifier.clickable { oeffneFoiler(uid) } else Modifier)
                        if (z.startedAt != null) Text(kurzDatum(z.startedAt) + (z.spot?.let { " · $it" } ?: ""),
                            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    Spacer(Modifier.width(8.dp))
                    val sid = z.sessionId
                    Text(kennzahlWert(tf.kennzahl, z.value), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold,
                        modifier = if (sid != null) Modifier.clickable { onOpenSession(sid) }.padding(vertical = 4.dp) else Modifier)
                }
            }
        }
    }
}

/** Knopf „Teilen" mit Symbol (Bestenliste als Bild; Web: Symbol und Text, 06.11.2026). */
@Composable
internal fun TeilenKnopf(onClick: () -> Unit) {
    TextButton(onClick = onClick, contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 8.dp)) {
        Icon(androidx.compose.material.icons.Icons.Filled.Share, contentDescription = null, modifier = Modifier.size(16.dp))
        Spacer(Modifier.width(6.dp))
        Text(I18n.t("team.teilen"), style = MaterialTheme.typography.bodyMedium)
    }
}

/** Kennzahl-Kachel (Teamstatistik, Event gesamt): Wert gross in Teamfarbe, Beschriftung darunter. */
@Composable
fun TeamZahlKachel(wert: String, label: String, farbe: TeamFarbe, modifier: Modifier = Modifier, rand: Boolean = false) {
    Card(modifier, border = if (rand) BorderStroke(2.dp, farbe.akzent) else null) {
        Column(Modifier.fillMaxWidth().padding(vertical = 10.dp, horizontal = 6.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(wert, color = farbe.akzent, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, maxLines = 1)
            Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        }
    }
}

/** Kacheln in Reihen zu `spalten` (Teamstatistik 3 je Reihe, Event gesamt 2). */
@Composable
fun TeamZahlRaster(kacheln: List<Pair<String, String>>, farbe: TeamFarbe, spalten: Int, rand: Boolean = false) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        kacheln.chunked(spalten).forEach { reihe ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                reihe.forEach { (w, l) -> TeamZahlKachel(w, l, farbe, Modifier.weight(1f), rand) }
                repeat(spalten - reihe.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

/** Teamseite bzw. Event als Web-Adresse (Teilen, Verwaltung im Browser). */
internal fun teamWebUrl(pfad: String): String = "https://pumpfoil.org$pfad"

/** System-Teilen einer Adresse. */
internal fun teilenUrl(ctx: android.content.Context, url: String, titel: String) {
    val i = android.content.Intent(android.content.Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(android.content.Intent.EXTRA_TEXT, url)
        putExtra(android.content.Intent.EXTRA_SUBJECT, titel)
    }
    runCatching { ctx.startActivity(android.content.Intent.createChooser(i, titel)) }
}
