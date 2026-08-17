package org.pumpfoil.app

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

// Gepairte Uhr/Gerät (GET /api/devices/list). record_mode je Uhr getrennt.
@Serializable
data class PairedDevice(
    val id: Int,
    val label: String? = null,
    @SerialName("last_seen_at") val lastSeenAt: String? = null,
    @SerialName("revoked_at") val revokedAt: String? = null,
    @SerialName("app_version") val appVersion: String? = null,
    val platform: String? = null,
    val model: String? = null,
    @SerialName("model_id") val modelId: String? = null,
    @SerialName("update_available") val updateAvailable: Boolean = false,
    @SerialName("latest_version") val latestVersion: String? = null,
    @SerialName("record_mode") val recordMode: String = "full",   // full | lite | gps
    @SerialName("low_accel") val lowAccel: Boolean = false,        // FR55 & Co. -> Voll autom. Sparsam
    // GNSS-Stufe je Uhr (best|l1|two|gps) — NUR Garmin, ab Uhr-Version 1.0.77. null = keine
    // eigene Wahl, die Uhr faehrt die Voreinstellung "best" (alle Systeme, bestes Band).
    // Mehr Systeme finden die Position schneller und zuverlaessiger, kosten aber Akku.
    @SerialName("gnss_mode") val gnssMode: String? = null,
)

// Spiegelt die API-Schemas (snake_case JSON -> camelCase via @SerialName).
@Serializable
data class Profile(
    val email: String,
    @SerialName("display_name") val displayName: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    @SerialName("is_admin") val isAdmin: Boolean = false,
    val language: String? = null,
    @SerialName("foil_sensitivity") val foilSensitivity: String? = null,
    // Anzeige-Einheit der Pump-Kadenz: hz|ppm (nur Darstellung, siehe PumpUnit.kt).
    @SerialName("pump_unit") val pumpUnit: String? = null,
    @SerialName("social_allowed") val socialAllowed: Boolean? = null,
    val beta: Boolean = false,
    // Offene Sportart-Zuordnungen des Nutzers (Server: auth.py:_needs_classification) — Hinweis auf
    // der Startseite; bei genau einer Session verlinkt die ID direkt dorthin.
    @SerialName("needs_classification") val needsClassification: Int = 0,
    @SerialName("needs_classification_id") val needsClassificationId: Int? = null,
)

@Serializable
data class ReanalysisProgress(
    val running: Boolean = false,
    val done: Int = 0,
    val total: Int = 0,
)

// Verlauf: „Entwicklung am Spot" — Spots des Nutzers + Bulk-Tracks je Spot.
@Serializable
data class SpotCount(val spot: String, val count: Int)

@Serializable
data class SpotTrack(
    @SerialName("session_id") val sessionId: Int,
    @SerialName("started_at") val startedAt: String? = null,
    @SerialName("foiling_km") val foilingKm: Double = 0.0,
    val track: List<List<Double?>> = emptyList(),   // [[lat, lon, speed_mps?]]
)

// Eigene Session im Zwischenzustand (recording/live) — Live-Upload-Karte (Home + Sessions).
// upload_total ist null, bis die Clients expected_chunks senden -> UI zeigt dann unbestimmt.
@Serializable
data class InProgressSession(
    val id: Int,
    @SerialName("session_uuid") val sessionUuid: String = "",
    @SerialName("started_at") val startedAt: String = "",
    val tz: String? = null,
    val status: String = "",
    @SerialName("device_label") val deviceLabel: String? = null,
    @SerialName("upload_received") val uploadReceived: Int = 0,
    @SerialName("upload_total") val uploadTotal: Int? = null,
    @SerialName("gps_received") val gpsReceived: Int = 0,
    @SerialName("accel_received") val accelReceived: Int = 0,
    @SerialName("has_gps") val hasGps: Boolean = false,
    @SerialName("last_received_at") val lastReceivedAt: String? = null,
)

@Serializable
data class SessionSummary(
    val id: Int,
    val sport: String = "",
    @SerialName("started_at") val startedAt: String = "",
    @SerialName("ended_at") val endedAt: String? = null,
    @SerialName("data_version") val dataVersion: Long? = null,   // Cache-Schlüssel fürs Detail
    val status: String = "",
    @SerialName("place_name") val placeName: String? = null,
    val tz: String? = null,               // IANA-Zeitzone des Spots — Anzeige in Ortszeit
    val caption: String? = null,
    @SerialName("owner_name") val ownerName: String? = null,
    @SerialName("owner_avatar_url") val ownerAvatarUrl: String? = null,
    @SerialName("like_count") val likeCount: Int = 0,
    val liked: Boolean = false,
    @SerialName("thumb_url") val thumbUrl: String? = null,
    @SerialName("photo_count") val photoCount: Int = 0,
    @SerialName("youtube_url") val youtubeUrl: String? = null,      // verlinktes Video → Vorschau-Thumb
    @SerialName("track_preview") val trackPreview: String? = null,
    val foil: FoilBrief? = null,          // aufgelöstes Foil (Marke/Modell/Größe) für die Anzeige
    @SerialName("device_label") val deviceLabel: String? = null,   // Uhr-Bezeichnung der Aufnahme
    @SerialName("transfer_to") val transferTo: String? = null,      // offene Übertragung → Badge
    // Sportart-Klassifikation durch Menschen (docs/sport-classification.md) — NICHT `sport`, das ist
    // der Aktivitätstyp aus der Aufnahmedatei.
    @SerialName("sport_class") val sportClass: String? = null,
    @SerialName("data_quality") val dataQuality: String? = null,
    @SerialName("needs_classification") val needsClassification: Boolean = false,
    // Restliches Setup (Stab/Mast/Board) — die Liste liefert es seit 2026-07-31 mit, damit die
    // Karten dieselben Chips zeigen wie die PWA. null = für diese Session ist nichts hinterlegt.
    val setup: SessionSetup? = null,
    val analysis: Analysis? = null,        // slim: Kennzahlen für die Listenkarte
)

// Kompakte Foil-Info für Listen/Karten (Server liefert ein dict mit u.a. brand/model/size).
@Serializable
data class FoilBrief(
    val brand: String = "",
    val model: String = "",
    val size: String = "",
)

// Mini-Track-Vorschau (normalisierte Polylinien aus der Analyse), wie web TrackPreview:
// {"w","h","lines":[[[x,y],...],...]}.
@Serializable
data class TrackPreview(
    val w: Double = 100.0,
    val h: Double = 100.0,
    val lines: List<List<List<Double>>> = emptyList(),
)

// Community-/Spot-Feed liefert eine andere Shape als /api/sessions: session_id, name,
// spot, avatar_url, foiling_km, runs … (siehe server community._brief/_attach_social).
@Serializable
data class CommunityItem(
    @SerialName("session_id") val id: Int,
    @SerialName("started_at") val startedAt: String = "",
    @SerialName("ended_at") val endedAt: String? = null,
    val name: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    val spot: String? = null,
    val caption: String? = null,
    val tz: String? = null,               // IANA-Zeitzone des Spots — Anzeige in Ortszeit
    @SerialName("foiling_km") val foilingKm: Double = 0.0,
    val runs: Int = 0,
    @SerialName("max_speed_mps") val maxSpeedMps: Double? = null,
    @SerialName("track_preview") val trackPreview: String? = null,
    @SerialName("thumb_url") val thumbUrl: String? = null,
    @SerialName("youtube_url") val youtubeUrl: String? = null,      // verlinktes Video → Vorschau-Thumb
    @SerialName("like_count") val likeCount: Int = 0,
    val liked: Boolean = false,
    @SerialName("device_label") val deviceLabel: String? = null,   // Uhr-Bezeichnung der Aufnahme
    val foil: FoilBrief? = null,          // aufgelöstes Foil (Marke/Modell/Größe) für die Karte
    // Restliches Setup der Aufnahme (Session-Wert, sonst Standard des Besitzers; community.py
    // löst es im Batch auf). null = nichts hinterlegt -> Karte zeigt keinen Chip.
    val setup: SessionSetup? = null,
    // Sportart der Session. Die Liste „was ist neu" zeigt ALLE Sportarten (sport=all), deshalb
    // kennzeichnet die Karte, wenn es KEIN Pumpfoilen war. null/"pumpfoil" = kein Hinweis.
    @SerialName("sport_class") val sportClass: String? = null,
)

// Tages-Gruppe (ein Nutzer, ein Tag) aus /api/community/sessions-grouped. count==1 -> als
// normale Karte rendern; count>=2 -> Akkordeon. Stats = Tages-Summen (Speed = Maximum).
@Serializable
data class CommunityGroup(
    @SerialName("user_id") val userId: Int = 0,
    val name: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    val date: String = "",
    val spot: String? = null,
    val tz: String? = null,
    val count: Int = 0,
    @SerialName("foiling_km") val foilingKm: Double = 0.0,
    @SerialName("foiling_time_s") val foilingTimeS: Double = 0.0,
    @SerialName("pump_count") val pumpCount: Int = 0,
    @SerialName("max_speed_mps") val maxSpeedMps: Double? = null,
    @SerialName("track_previews") val trackPreviews: List<String> = emptyList(),
    val sessions: List<CommunityItem> = emptyList(),
)

// Persönliche Home-Stats: Start-Erfolgsquote + Carve-Anzahl je Zeitfenster.
@Serializable
data class StartSuccess(
    @SerialName("threshold_m") val thresholdM: Int = 20,
    val windows: Map<String, SSWindow> = emptyMap(),
)
@Serializable
data class SSWindow(val total: Int = 0, val success: Int = 0, val failed: Int = 0, val rate: Int? = null)
@Serializable
data class CarveStats(val windows: Map<String, CarveWin> = emptyMap())
@Serializable
data class CarveWin(val s: Int = 0, val m: Int = 0, val l: Int = 0)

@Serializable
data class Analysis(
    @SerialName("total_distance_m") val totalDistanceM: Double? = null,
    @SerialName("foiling_distance_m") val foilingDistanceM: Double? = null,
    @SerialName("foiling_time_s") val foilingTimeS: Double? = null,
    @SerialName("max_speed_mps") val maxSpeedMps: Double? = null,
    @SerialName("pump_count") val pumpCount: Int? = null,
    @SerialName("avg_cadence_hz") val avgCadenceHz: Double? = null,
    val metrics: Metrics? = null,
    @SerialName("track_geojson") val trackGeojson: JsonElement? = null,
    // Foiling-Läufe (Index-Bereiche in track_geojson.coordinates) — nur diese werden gezeichnet.
    // Nullable: die schlanke Listen-Analyse liefert "segments": null (nicht nur fehlend).
    val segments: List<Segment>? = null,
)

// Session-weite Kennzahlen (metrics_json) — Basis für den Stats-Block in der Liste.
@Serializable
data class Metrics(
    @SerialName("num_segments") val numSegments: Int? = null,
    @SerialName("avg_speed_mps") val avgSpeedMps: Double? = null,
    @SerialName("max_speed_mps") val maxSpeedMps: Double? = null,
    @SerialName("avg_pump_hz") val avgPumpHz: Double? = null,
    @SerialName("avg_hr") val avgHr: Int? = null,
    @SerialName("max_hr") val maxHr: Int? = null,
    @SerialName("farthest_segment_m") val farthestSegmentM: Double? = null,
    @SerialName("longest_segment_s") val longestSegmentS: Double? = null,
    // Fremdkraft-Vorschläge der Erkennung v2 (Boot/Auto/Motor-Verdacht): abgetrennte Läufe mit
    // Messwerten für die lokalisierte Begründung. `grund` (deutscher Klartext) wird bewusst NICHT
    // geparst — der Anzeigetext entsteht in der App aus den Messwerten (wie PWA RunsTable).
    @SerialName("fremdkraft_laeufe") val fremdkraftLaeufe: List<FremdkraftLauf>? = null,
)

// Ein abgetrennter Fremdkraft-Lauf (analysis.metrics.fremdkraft_laeufe); Zeiten in Session-ms
// (gleiche Basis wie trim_start_ms). puls_antwort_bpm nullable: ohne Pulsdaten fehlt es.
@Serializable
data class FremdkraftLauf(
    @SerialName("t_start_ms") val tStartMs: Long = 0,
    @SerialName("t_end_ms") val tEndMs: Long = 0,
    @SerialName("dauer_s") val dauerS: Double = 0.0,
    val kmh: Double = 0.0,
    @SerialName("puls_antwort_bpm") val pulsAntwortBpm: Double? = null,
)

@Serializable
data class Segment(
    @SerialName("i_start") val iStart: Int = 0,
    @SerialName("i_end") val iEnd: Int = 0,
    @SerialName("distance_m") val distanceM: Double = 0.0,
    @SerialName("duration_s") val durationS: Double = 0.0,
    @SerialName("avg_speed_mps") val avgSpeedMps: Double = 0.0,
    @SerialName("max_speed_mps") val maxSpeedMps: Double = 0.0,
    val pumps: Int = 0,
    @SerialName("pump_idx") val pumpIdx: List<Int> = emptyList(),
    @SerialName("avg_pump_hz") val avgPumpHz: Double? = null,
    @SerialName("longest_glide_s") val longestGlideS: Double = 0.0,
)

// Carve-Erkennung (GET /api/sessions/:id/carves) — nur Anzeige, nicht in Rekorde/Stats.
@Serializable
data class CarveData(
    val g: List<Double> = emptyList(),                  // Zentripetal-g je Track-Punkt (grobe Färbung)
    val carves: List<Carve> = emptyList(),
    val arcs: List<List<List<Double>>> = emptyList(),   // je Carve eine 25-Hz-Polylinie: Punkte [lat,lon,g]
    val counts: CarveCounts = CarveCounts(),
)
@Serializable
data class Carve(
    val i0: Int = 0, val i1: Int = 0,
    @SerialName("peak_g") val peakG: Double = 0.0,
    val rot: Double = 0.0, val dir: String = "", val bucket: String = "",
)
@Serializable
data class CarveCounts(val s: Int = 0, val m: Int = 0, val l: Int = 0)

@Serializable
data class HistoryPoint(
    @SerialName("session_id") val sessionId: Int,
    @SerialName("started_at") val startedAt: String = "",
    @SerialName("foiling_km") val foilingKm: Double = 0.0,
    val runs: Int = 0,
    val pumps: Int = 0,
    val speed: Double = 0.0,            // beste Lauf-Geschwindigkeit (m/s)
    val distance: Double = 0.0,         // bester Lauf: Distanz (m)
    val duration: Double = 0.0,         // bester Lauf: Dauer (s)
    val glide: Double = 0.0,            // längster Gleit (s)
    @SerialName("avg_speed") val avgSpeed: Double? = null,   // Ø-Speed der Session (m/s)
    @SerialName("avg_pump_hz") val avgPumpHz: Double? = null,
)

// Bestenliste (GET /api/community/leaders) — je Metrik eine Rangliste.
@Serializable
data class LeaderEntry(
    val name: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    val sessions: Int = 0, val runs: Int = 0, val spots: Int = 0, val pumps: Int = 0,
)

@Serializable
data class Leaders(
    val sessions: List<LeaderEntry> = emptyList(),
    val runs: List<LeaderEntry> = emptyList(),
    val spots: List<LeaderEntry> = emptyList(),
    val pumps: List<LeaderEntry> = emptyList(),
)

// Neueste Medien (GET /api/community/latest-photos) — Fotos + YouTube je Session.
@Serializable
data class MediaItem(
    val kind: String = "photo",
    val url: String? = null,
    @SerialName("youtube_url") val youtubeUrl: String? = null,
    @SerialName("session_id") val sessionId: Int = 0,
    val name: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    val spot: String? = null,
    val caption: String? = null,
    val tz: String? = null,               // IANA-Zeitzone des Spots — Anzeige in Ortszeit
)

// Spot-Wetter (GET /api/community/spot/weather) — aktuell + Tagesvorschau (Wind in Knoten).
@Serializable
data class SpotWeather(val weather: WeatherBlock? = null)

@Serializable
data class WeatherBlock(
    val current: WxCurrent? = null,
    val days: List<WxDay> = emptyList(),
)

@Serializable
data class WxCurrent(
    val temp: Double? = null, val wind: Double? = null, val dir: Double? = null, val code: Int? = null,
)

@Serializable
data class WxDay(
    val date: String = "", val code: Int? = null, val tmax: Double? = null, val tmin: Double? = null,
    @SerialName("wind_max") val windMax: Double? = null, val dir: Double? = null,
)

// Gesamt-Statistik + persönliche Rekorde (GET /api/sessions/stats).
@Serializable
data class RecordEntry(
    @SerialName("session_id") val sessionId: Int? = null,
    val value: Double = 0.0,
    @SerialName("started_at") val startedAt: String? = null,
    @SerialName("run_idx") val runIdx: Int? = null,
    val tz: String? = null,               // IANA-Zeitzone des Spots — Anzeige in Ortszeit
)

@Serializable
data class OverallRecords(
    val distance: RecordEntry? = null,
    val duration: RecordEntry? = null,
    val speed: RecordEntry? = null,
    val runs: RecordEntry? = null,
    val glide: RecordEntry? = null,
)

@Serializable
data class OverallStats(
    val count: Int = 0,
    @SerialName("foiling_km") val foilingKm: Double = 0.0,
    @SerialName("foiling_min") val foilingMin: Double = 0.0,
    val pumps: Int = 0,
    @SerialName("runs_total") val runsTotal: Int = 0,
    val records: OverallRecords? = null,
    // Sportart, auf die sich diese Antwort bezieht, plus die Auswahlliste (haeufigste zuerst).
    // Der Server liefert beides in EINEM Aufruf mit, damit die Startseite nicht zweimal fragen muss.
    // Voreinstellung ist die Sportart mit den meisten Sessions (Jan, 17.08.).
    val sport: String? = null,
    val sports: List<SportCount> = emptyList(),
)

// Eine Sportart des Nutzers mit Session-Zahl (fuer das Auswahlfeld der eigenen Rekorde).
@Serializable
data class SportCount(val sport: String = "", val sessions: Int = 0)

@Serializable
data class SpotsList(val mine: List<String> = emptyList(), val all: List<String> = emptyList())

// Monats-Facetten für den Sessions-Monatsfilter (GET /api/sessions/months).
@Serializable
data class MonthCount(val month: String = "", val count: Int = 0)

// Nachbar-Sessions (GET /api/sessions/{id}/neighbors) für Vor/Zurück im Detail.
@Serializable
data class Neighbors(val older: Int? = null, val newer: Int? = null)

// Chat-Raum-Zustand (GET /api/chat/state).
@Serializable
data class ChatState(
    val push: Boolean = false,
    val left: Boolean = false,
    @SerialName("last_read_id") val lastReadId: Int = 0,
)

// Community-Rekorde (GET /api/community/records): {period -> {distance/duration/speed/glide/runs}}.
@Serializable
data class CommunityRecordEntry(
    @SerialName("session_id") val sessionId: Int? = null,
    val value: Double = 0.0,
    val name: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    val spot: String? = null,
    @SerialName("started_at") val startedAt: String? = null,
    @SerialName("run_idx") val runIdx: Int? = null,
    val tz: String? = null,               // IANA-Zeitzone des Spots — Anzeige in Ortszeit
    // Mini-Track-Vorschau der Rekord-Session (dieselbe Form wie in den Session-Karten).
    // Fehlt bei Sessions ohne Vorschau in der Analyse -> dann wird nichts gezeichnet.
    @SerialName("track_preview") val trackPreview: String? = null,
)

@Serializable
data class PeriodRecords(
    val distance: CommunityRecordEntry? = null,
    val duration: CommunityRecordEntry? = null,
    val speed: CommunityRecordEntry? = null,
    val glide: CommunityRecordEntry? = null,
    val runs: CommunityRecordEntry? = null,
    // Fun-Rekorde (Session-bezogen), additiv seit 2026-07-18.
    @SerialName("session_distance") val sessionDistance: CommunityRecordEntry? = null,
    @SerialName("session_time") val sessionTime: CommunityRecordEntry? = null,
    @SerialName("session_pumps") val sessionPumps: CommunityRecordEntry? = null,
    @SerialName("max_hr") val maxHr: CommunityRecordEntry? = null,
    @SerialName("early_bird") val earlyBird: CommunityRecordEntry? = null,   // Wert = s seit Mitternacht (Spot-Ortszeit)
    @SerialName("night_owl") val nightOwl: CommunityRecordEntry? = null,     // >24h möglich -> mod 24h anzeigen
    // EINZIGER Rekord, der einem NUTZER gehoert statt einer Session: Summe der Carves > 180° im
    // Zeitraum. Deshalb ist `sessionId` hier null — die Kachel darf NICHT auf eine Session
    // verlinken und zeigt weder Datum noch Spot (server/app/api/community.py:_carve_record).
    @SerialName("carves180") val carves180: CommunityRecordEntry? = null,
)

@Serializable
data class SpotMapItem(
    val spot: String,
    @SerialName("spot_id") val spotId: Int? = null,   // additiv (neue Clients); Nav bleibt namensbasiert
    val lat: Double = 0.0,
    val lon: Double = 0.0,
    val sessions: Int = 0,
)

@Serializable
data class ChatMsg(
    val id: Int,
    @SerialName("user_id") val userId: Int = 0,
    val name: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    val text: String = "",
    @SerialName("created_at") val createdAt: String? = null,
    val mine: Boolean = false,
    val hidden: Boolean = false,
    // Daumen-hoch je Nachricht (Server: chat.py:_msg_out + POST /api/chat/{id}/like).
    @SerialName("like_count") val likeCount: Int = 0,
    val liked: Boolean = false,
)

@Serializable
data class ChatRoom(
    val scope: String,
    val label: String = "",
    val unread: Int = 0,
    @SerialName("last_text") val lastText: String = "",
    val kind: String = "",           // spot | dm | session
    val push: Boolean = false,       // abonniert (Push) → Glocke
    val other: DmOther? = null,      // nur bei dm
)

@Serializable
data class DmOther(
    val id: Int = 0,
    val name: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
)

// Ein Spot-Chat aus /api/chat/all-spots (zum Stöbern; jeder darf reinschauen).
@Serializable
data class SpotChat(
    val scope: String,
    val label: String = "",
    val messages: Int = 0,
)

@Serializable
data class DmUser(
    val id: Int,
    @SerialName("display_name") val displayName: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
)

@Serializable
data class TransferSessionBrief(
    val id: Int,
    val place: String? = null,
    val water: String? = null,
    @SerialName("started_at") val startedAt: String? = null,
    val sport: String = "",
    @SerialName("foiling_time_s") val foilingTimeS: Double? = null,
)

// Session-Übertragung an einen anderen Nutzer (role: sender|recipient in for-session).
@Serializable
data class Transfer(
    val id: Int,
    val status: String = "",
    @SerialName("created_at") val createdAt: String? = null,
    val other: DmUser? = null,
    val session: TransferSessionBrief? = null,
    val role: String? = null,
)

@Serializable
data class DmOpen(
    val scope: String,
    val other: DmOther = DmOther(),
    val blocked: Boolean = false,
)

@Serializable
data class NewsBanner(
    val version: Int = 0,
    val enabled: Boolean = false,
    val texts: Map<String, String> = emptyMap(),
)

@Serializable
data class Foil(
    val id: Int,
    val brand: String = "",
    val model: String = "",
    val size: String = "",
    @SerialName("span_cm") val spanCm: Double = 0.0,
    @SerialName("area_cm2") val areaCm2: Double = 0.0,
    @SerialName("thickness_mm") val thicknessMm: Double = 0.0,
    @SerialName("thickness_estimated") val thicknessEstimated: Boolean = false,
    // Fläche/Spannweite sind ABGELEITET (Hersteller veröffentlicht nur eines von beiden plus die
    // Streckung der Baureihe) — schwerer wiegend als „Dicke geschätzt", weil an ihnen die ganze
    // Leistungsrechnung hängt. Eigenes Kennzeichen im Katalog, wie in der PWA.
    @SerialName("specs_estimated") val specsEstimated: Boolean = false,
    @SerialName("aspect_ratio") val aspectRatio: Double? = null,
) {
    // Neu erschienene Modelle stehen mit 0 im Katalog, solange der Hersteller keine Maße
    // veröffentlicht hat (die Spalten sind NOT NULL). Auswählbar bleiben sie überall — aber
    // „0 cm² · AR –" wäre eine Falschaussage, und jede Rechnung teilt durch die Fläche.
    val hasSpecs: Boolean get() = areaCm2 > 0 && spanCm > 0
}

@Serializable
data class SessionPhoto(val id: Int, val url: String = "")

@Serializable
data class SessionVideo(val id: Int, @SerialName("youtube_url") val youtubeUrl: String = "")

@Serializable
data class Label(
    val id: Int,
    @SerialName("t_start_ms") val tStartMs: Long = 0,
    @SerialName("t_end_ms") val tEndMs: Long = 0,
    val label: String = "",   // pump | glide | not_foiling
)

@Serializable
data class FoilStat(
    @SerialName("foil_id") val foilId: Int,
    val brand: String = "",
    val model: String = "",
    val size: String = "",
    @SerialName("aspect_ratio") val aspectRatio: Double? = null,
    val sessions: Int = 0,
    val users: Int = 0,
    @SerialName("avg_speed_kmh") val avgSpeedKmh: Double? = null,
    @SerialName("meters_per_pump") val metersPerPump: Double? = null,
    @SerialName("best_distance_m") val bestDistanceM: Double? = null,
    @SerialName("avg_pump_hz") val avgPumpHz: Double? = null,
)

@Serializable
data class WatchStat(
    val watch: String = "",
    val sessions: Int = 0,
    val users: Int = 0,
    @SerialName("foiling_km") val foilingKm: Double? = null,
    @SerialName("avg_speed_kmh") val avgSpeedKmh: Double? = null,
    @SerialName("best_distance_m") val bestDistanceM: Double? = null,
    @SerialName("best_speed_kmh") val bestSpeedKmh: Double? = null,
    @SerialName("avg_pump_hz") val avgPumpHz: Double? = null,
)

// Restliches Setup einer Session (Server: sessions.py:_resolve_setup). Jedes Teil hat ein
// `*_is_default`: true = vom Nutzer-Standard geerbt, false = fuer DIESE Session gesetzt.
@Serializable
data class StabBrief(
    val id: Int,
    val brand: String = "",
    val model: String = "",
    val size: String = "",
    @SerialName("is_default") val isDefault: Boolean = true,
    @SerialName("is_own") val isOwn: Boolean = false,
    // Maße, sofern gepflegt (null = Hersteller/Katalog liefert keine). Der Server schickt 0 als
    // null, damit „nicht gepflegt" und „0 cm²" unterscheidbar bleiben (stabs.py:_out).
    @SerialName("span_cm") val spanCm: Double? = null,
    @SerialName("area_cm2") val areaCm2: Double? = null,
    @SerialName("specs_estimated") val specsEstimated: Boolean = false,
)

@Serializable
data class BoardBrief(
    val id: Int,
    val name: String = "",
    @SerialName("volume_l") val volumeL: Double? = null,
    @SerialName("length_cm") val lengthCm: Double? = null,
    @SerialName("is_default") val isDefault: Boolean = true,
)

@Serializable
data class SessionSetup(
    val stab: StabBrief? = null,
    @SerialName("mast_len_cm") val mastLenCm: Int? = null,
    @SerialName("mast_is_default") val mastIsDefault: Boolean = true,
    @SerialName("shim_deg") val shimDeg: Double? = null,
    @SerialName("shim_is_default") val shimIsDefault: Boolean = true,
    val board: BoardBrief? = null,
)

@Serializable
data class SessionDetail(
    val id: Int,
    val sport: String = "",
    @SerialName("started_at") val startedAt: String = "",
    @SerialName("ended_at") val endedAt: String? = null,
    @SerialName("data_version") val dataVersion: Long? = null,   // Cache-Schlüssel
    val status: String = "",
    @SerialName("place_name") val placeName: String? = null,
    val tz: String? = null,               // IANA-Zeitzone des Spots — Anzeige in Ortszeit
    val caption: String? = null,
    @SerialName("owner_name") val ownerName: String? = null,
    @SerialName("owner_avatar_url") val ownerAvatarUrl: String? = null,
    @SerialName("like_count") val likeCount: Int = 0,
    val liked: Boolean = false,
    val owned: Boolean = false,
    @SerialName("youtube_url") val youtubeUrl: String? = null,
    @SerialName("place_water") val placeWater: String? = null,   // Gewässer als Zusatz-Label
    @SerialName("spot_id") val spotId: Int? = null,               // additiv; Nav bleibt namensbasiert
    // Sportart-Klassifikation (docs/sport-classification.md); `appealText` gesetzt = Widerspruch läuft.
    @SerialName("sport_class") val sportClass: String? = null,
    @SerialName("data_quality") val dataQuality: String? = null,
    @SerialName("needs_classification") val needsClassification: Boolean = false,
    @SerialName("appeal_text") val appealText: String? = null,
    // Wer hat die Sportart gesetzt: default | auto | owner | admin. Bei "auto" erklärt die
    // Detailansicht das Maschinen-Urteil (sport_auto) und der Besitzer kann direkt überstimmen.
    @SerialName("sport_source") val sportSource: String? = null,
    // Begründung der automatischen Erkennung (nur Besitzer/Admin, nur solange sie gilt).
    @SerialName("sport_auto") val sportAuto: SportAuto? = null,
    // Anzahl menschlicher Meldungen (nur Besitzer/Admin) — steuert, ob der Widerspruchs-Knopf
    // erscheint: beim reinen Maschinen-Urteil (flag_count == 0) wählt man einfach „Pumpfoil".
    @SerialName("flag_count") val flagCount: Int = 0,
    // Zurückgeholte Fremdkraft-Läufe (Erkennung v2), Zeitfenster in Session-ms. Die noch offenen
    // VORSCHLÄGE stehen in analysis.metrics.fremdkraft_laeufe.
    @SerialName("fremdkraft_keep") val fremdkraftKeep: List<List<Long>>? = emptyList(),
    val setup: SessionSetup? = null,   // Stab/Mast/Shim/Board (geerbt oder je Session gesetzt)
    val foil: Foil? = null,        // aufgelöstes Foil (Maße) für die Leistungsberechnung
    val analysis: Analysis? = null,
    @SerialName("merged_count") val mergedCount: Int = 0,   // >0 -> aus N Sessions zusammengeführt
    @SerialName("device_label") val deviceLabel: String? = null,   // Uhr-Bezeichnung der Aufnahme
    // Aus der Auswertung genommene Zeitfenster [[start_ms, end_ms], …], ms ab Session-Start
    // (dieselbe Basis wie trim_start_ms). Nullable + Default leer: alte Server kennen das Feld nicht.
    @SerialName("excluded_ranges") val excludedRanges: List<List<Long>>? = emptyList(),
    // Aktueller Zuschnitt (ms ab Session-Start), null = kein Zuschnitt. Nötig, damit die Regler im
    // Zuschnitt-Dialog den gespeicherten Bereich zeigen statt immer 0…Dauer — sonst schlägt
    // "Bereich aussortieren" ungezogen die GANZE Session vor.
    @SerialName("trim_start_ms") val trimStartMs: Long? = null,
    @SerialName("trim_end_ms") val trimEndMs: Long? = null,
)

// Maschinen-Urteil der Sportart-Erkennung (docs/sport-classification.md, Stufe 1b). Der Text
// wird in der APP gebaut (cls.autoWhy/cls.autoWhyPulse aus den Merkmalen) — `grund` ist
// deutscher Admin-Klartext und wird deshalb bewusst nicht geparst.
@Serializable
data class SportAuto(
    val hinweis: String? = null,          // auto.motor | auto.unklar
    val merkmale: SportAutoMerkmale? = null,
)

@Serializable
data class SportAutoMerkmale(
    @SerialName("laengster_lauf_s") val laengsterLaufS: Double? = null,
    @SerialName("tempo_median_kmh") val tempoMedianKmh: Double? = null,
    @SerialName("spitze_kmh") val spitzeKmh: Double? = null,
    @SerialName("puls_antwort_bpm") val pulsAntwortBpm: Double? = null,
    val laeufe: Int? = null,
)

@Serializable
data class MergeSuggestion(
    val ids: List<Int> = emptyList(),
    val count: Int = 0,
    val place: String? = null,
    val date: String = "",
    val tz: String? = null,               // IANA-Zeitzone des Spots (Gruppen-Ebene)
)

// Ein eigenes Uhr-Layout (server/app/api/layouts.py:_out).
//
// GESTALTET wird ausschliesslich in der PWA (Entscheidung Jan 2026-08-17: "den Layout-Editor
// brauchen wir nativ nicht, das macht man eh nur am pc"). ANGEZEIGT wird es aber auch hier, damit
// man einen Screen an seinem BILD wiedererkennt statt am Namen — der Name allein reicht nicht, weil
// eine Kopie aus der Community den Originalnamen behaelt und mehrere Kopien gleich heissen koennen.
// Deshalb liest die App seit 17.08. auch die Zeichendaten mit; der Server lieferte sie schon immer.
@Serializable
data class WatchLayoutBrief(
    val id: Int,
    val name: String = "",
    val category: String = "on_foil",
    // Zeichendaten fuer WatchLayoutPreview (LayoutRender.kt).
    val elements: List<kotlinx.serialization.json.JsonArray> = emptyList(),
    val bg_color: Int = 0,
    val shape: String = "round",
    // Auflösung, FUER DIE das Layout gebaut wurde — bestimmt das Seitenverhaeltnis der Vorschau.
    // Kann null sein (aeltere Layouts ohne Angabe), dann faellt die Vorschau auf 240x240 zurueck.
    val authored_w: Int? = null,
    val authored_h: Int? = null,
    // Nur in der Community-Galerie gefuellt (GET /api/layouts/community): wer es gebaut hat, wie oft
    // es kopiert wurde und von wie vielen Nutzern es WIRKLICH auf der Uhr liegt. `used_by` ist die
    // ehrlichste Zahl — eine bloss gespeicherte Kopie zaehlt dort nicht mit.
    val author: String? = null,
    val copies: Int? = null,
    val used_by: Int? = null,
    val has_freetext: Boolean = false,
    val published: Boolean = false,
)
