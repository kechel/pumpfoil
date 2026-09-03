// Schmaler API-Client. JWT im localStorage.
import { downscaleImage } from "./downscaleImage";
import { demoAnonymisieren } from "./demoNames";

const TOKEN_KEY = "foil_jwt";

// Aktive Datei-Uploads — der PWA-Updater wartet damit, bis kein Upload mehr läuft (kein
// Reload mitten im Hochladen).
let _activeUploads = 0;
export function uploadsActive(): boolean { return _activeUploads > 0; }

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string) {
  localStorage.setItem(TOKEN_KEY, t);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    // Client-Kennung: Web kann alle Video-Plattformen (IG/TikTok) anzeigen -> Server liefert sie.
    "X-Pumpfoil-Client": "web",
    ...(opts.headers as Record<string, string>),
  };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(path, { ...opts, headers });
  // Sliding-Refresh: der Server schickt bei knapper Restlaufzeit ein frisches Token mit.
  const refreshed = res.headers.get("X-Refresh-Token");
  if (refreshed) setToken(refreshed);
  if (!res.ok) {
    const text = await res.text();
    // Abgelaufene/ungültige Session: war ein Token gesetzt und der Server lehnt mit 401 ab,
    // Session verwerfen und zum Login schicken — statt stumm eine kaputte eingeloggte
    // Oberfläche zu zeigen (JWT läuft nach JWT_EXPIRE_HOURS ab).
    if (res.status === 401 && token) {
      clearToken();
      if (window.location.pathname !== "/login") window.location.assign("/login");
    }
    throw new Error(`${res.status}: ${text}`);
  }
  // DEMO-MODUS (nur Admin, nur PWA): echte Nutzernamen werden HIER abgefangen, bevor irgendeine
  // Komponente sie sieht — auch in Freitexten wie Chat-Nachrichten. Aus = unveraendert
  // durchgereicht, kostet also nur einen Vergleich. Siehe lib/demoNames.ts.
  return demoAnonymisieren((await res.json()) as T, path);
}

async function uploadFile<T>(path: string, file: File): Promise<T> {
  const fd = new FormData();
  fd.append("file", file);
  const token = getToken();
  _activeUploads++;
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return (await res.json()) as T;
  } finally {
    _activeUploads--;
  }
}

export interface ChatMsg {
  id: number; user_id: number; name: string | null; avatar_url: string | null;
  text: string; created_at: string | null; mine: boolean; hidden: boolean; report_count: number;
  author_new?: boolean;   // Konto jünger als 24 h -> "neu"-Badge
  like_count?: number; liked?: boolean;   // 👍
}

export interface ChatRoom {
  scope: string; label: string; url: string; push: boolean;
  unread: number; last_text: string; last_at: string | null;
  kind?: string;   // spot | dm | session
  other?: { id: number; name: string | null; avatar_url: string | null };  // nur bei dm
}

export interface DmUser { id: number; display_name: string | null; avatar_url: string | null; }

// Bot-Audit (nur Admin): Raeume, in denen der KI-Assistent geschrieben hat, + deren Verlauf.
// `bot_count`/`total_count` = Nachrichten des Bots / im Raum insgesamt.
export interface BotRoom {
  scope: string; kind: string; label: string; url: string;
  bot_count: number; total_count: number; last_text: string; last_at: string | null;
  other?: { id: number; name: string | null; avatar_url: string | null };   // nur bei dm
}
export interface BotMsg {
  id: number; user_id: number; name: string; avatar_url: string | null;
  text: string; hidden: boolean; is_bot: boolean; created_at: string | null;
}

export interface TransferSessionBrief { id: number; place: string | null; water: string | null; started_at: string | null; sport: string; foiling_time_s: number | null; }
export interface Transfer { id: number; status: string; created_at: string | null; other: DmUser | null; session: TransferSessionBrief | null; role?: "sender" | "recipient"; }

export interface ActiveRoom {
  scope: string; label: string; url: string;
  messages: number; last_text: string; last_at: string | null;
}

export interface Foil {
  id: number; brand: string; model: string; size: string;
  span_cm: number; area_cm2: number; thickness_mm: number; thickness_estimated?: boolean; specs_estimated?: boolean;
  aspect_ratio: number | null; mean_chord_cm: number | null; is_baseline: boolean;
  // Durchsuchbare Zweitbezeichnungen (offizielle Produktcodes), „|"-getrennt.
  // NICHT anzeigen — nur zum Filtern, s. server/app/api/foils.py.
  aliases?: string | null;
}

// Stabilizer (Rear Wing) — NUR die Bezeichnung („GONG Stab Trail L"); Maße pflegen wir nicht,
// es rechnet nichts damit. is_own = eigener, privater Eintrag (nicht im globalen Katalog).
export interface Stab {
  id: number; brand: string; model: string; size: string; is_own?: boolean;
  // Maße, sofern gepflegt (null = Hersteller/Katalog liefert keine).
  span_cm?: number | null; area_cm2?: number | null; specs_estimated?: boolean;
  aliases?: string | null;   // wie bei Foil: nur durchsuchbar, nicht anzeigen
}

// Ein frei gestaltetes Uhr-Layout (= EINE Seite). Element-Format kompakt/positionell:
// [typ, x, y, size, color, flags, extra…] — s. lib/watchLayout.ts + server/app/api/layouts.py.
// authored_* = wo das Layout entworfen wurde (Hinweis + Galerie-Filter, KEINE Schranke).
export type LayoutElement = (number | string)[];
export interface WatchLayout {
  id: number;
  name: string;
  category: "on_foil" | "off_foil" | "pause";
  shape: "round" | "rect" | "semioctagon";
  bg_color: number;
  elements: LayoutElement[];
  published: boolean;
  copied_from_id: number | null;
  authored_w: number | null;
  authored_h: number | null;
  authored_shape: string | null;
  has_freetext: boolean;
  updated_at: string | null;
  author?: string;   // nur in der Galerie
  copies?: number;   // nur in der Galerie
  // Nutzungs-Ranking (nur in der Galerie): `used_by` = verschiedene Nutzer, die dieses Layout oder
  // eine Kopie davon wirklich eingebunden haben; `unchanged_copies` = davon unverändert.
  used_by?: number;
  unchanged_copies?: number;
}
export type WatchLayoutPatch = Omit<WatchLayout,
  "id" | "published" | "copied_from_id" | "has_freetext" | "updated_at" | "author" | "copies"
  | "used_by" | "unchanged_copies">;
export interface LayoutMeta {
  palette: string[];
  categories: string[];
  shapes: string[];
  max_elements: number;
  max_layouts: number;
  max_text_len: number;
  element_types: Record<string, number>;
}

// Board — kein Katalog, sondern eigene Einträge des Nutzers.
export interface Board {
  id: number; name: string; volume_l: number | null; length_cm: number | null;
}

export interface Analysis {
  algo_version: string;
  total_distance_m: number | null;
  foiling_distance_m: number | null;
  foiling_time_s: number | null;
  max_speed_mps: number | null;
  pump_count: number | null;
  avg_cadence_hz: number | null;
  metrics: Metrics | null;
  track_geojson: any | null;
  segments: any[] | null;
  accel_windows: any[] | null;
  // Zahl der Startversuche (attempts-Preset, reines GPS: >= 2 s ueber ~8 km/h). null = keine
  // Daten -> die Kachel zeigt dann wie frueher nur die Laufzahl.
  start_attempts?: number | null;
}

export interface Metrics {
  num_segments?: number;
  avg_hr?: number | null;
  max_hr?: number | null;
  avg_speed_mps?: number | null;
  max_speed_5s_mps?: number | null;
  min_speed_5s_mps?: number | null;
  longest_segment_s?: number;
  farthest_segment_m?: number;
  avg_pump_hz?: number | null;
  max_pump_hz?: number | null;
  min_pump_hz?: number | null;
  detection?: string;   // "model" | "gps_only" | "none"
  accel_hz_effective?: number | null;   // tatsächliche Accel-Rate aus den Daten (kann < getaggt)
}

export interface SessionSummary {
  tz?: string | null;   // IANA-Zeitzone des Spots — Uhrzeiten in Spot-Ortszeit anzeigen
  id: number;
  session_uuid: string;
  sport: string;
  started_at: string;
  ended_at: string | null;
  status: string;
  trim_start_ms?: number | null;
  trim_end_ms?: number | null;
  app_version?: string | null;   // App-Version der Aufnahme (nur Besitzer/Admin sichtbar)
  // Aussortierte Läufe als Zeitfenster [[start_ms, end_ms], …] (ms ab Session-Start).
  // Nur die Auswertung ist betroffen — Rohdaten bleiben, jederzeit zurücknehmbar.
  excluded_ranges?: number[][];
  // Zurückgeholte Fremdkraft-Läufe (Erkennung v2), Zeitfenster in Session-ms. Die noch offenen
  // VORSCHLÄGE stehen in analysis.metrics.fremdkraft_laeufe (t_start_ms/t_end_ms/dauer_s/kmh/
  // puls_antwort_bpm/grund).
  fremdkraft_keep?: number[][];
  owned?: boolean;
  // Menschliche Sportart-Klassifikation (docs/sport-classification.md). ACHTUNG: `sport` oben ist
  // der Aktivitätstyp AUS DER AUFNAHME — etwas anderes.
  sport_class?: string | null;          // pumpfoil (Default) | wingfoil | foildrive | …
  data_quality?: string | null;        // ok | false_data | duplicate | test
  sport_source?: string | null;        // default | auto | owner | admin
  needs_classification?: boolean;      // 2 Melder, noch nicht zugeordnet -> in keiner Auswertung
  // Begründung der automatischen Erkennung (nur Besitzer/Admin, nur solange sie gilt). Der Text
  // wird HIER gebaut, nicht am Server: der Server schickt die Messwerte, die Sprache macht die App.
  sport_auto?: {
    hinweis?: string;                  // auto.motor | auto.unklar
    grund?: string;                    // Klartext (deutsch) — nur für Admin/Support, nicht für die UI
    merkmale?: {
      laengster_lauf_s?: number;
      tempo_median_kmh?: number;
      spitze_kmh?: number;
      puls_antwort_bpm?: number | null;
      laeufe?: number;
    };
  } | null;
  flag_count?: number;                 // nur Besitzer/Admin (Melder bleiben anonym)
  appeal_text?: string | null;         // eigener Widerspruch
  merged_count?: number;   // >0 = zusammengeführt (auflösbar)
  owner_name?: string | null;
  owner_avatar_url?: string | null;
  place_name?: string | null;
  place_water?: string | null;
  spot_id?: number | null;   // Spot-Cluster (Server liefert es; Ziel fuer den Spot-Link)
  caption?: string | null;
  youtube_url?: string | null;
  video_url?: string | null;   // erstes Video jeder Plattform (nur anzeige-fähige Clients)
  thumb_url?: string | null;
  device_label?: string | null;
  device_model?: string | null;
  // Fahrergewicht des BESITZERS (kg) — die theoretische Leistung haengt quadratisch davon ab,
  // also muss sie mit SEINEM Gewicht gerechnet werden, egal wer zuschaut. Nur in der
  // Einzel-Session-Ausgabe (Listen zeigen keine Leistung).
  owner_weight_kg?: number | null;
  share_token?: string | null;   // nur dem Besitzer geliefert (öffentlicher Teilen-Link gesetzt?)
  photos?: { id: number; url: string; thumb_url?: string | null }[];  // im öffentlichen Payload (/s/<token>)
  videos?: SessionVideo[];  // im öffentlichen Payload (/s/<token>)
  photo_count?: number;
  like_count?: number;
  liked?: boolean;
  track_preview?: string | null;
  foil_id?: number | null;
  foil?: { id: number; brand: string; model: string; size: string; span_cm?: number; area_cm2?: number; thickness_mm?: number; thickness_estimated?: boolean; aspect_ratio: number | null; is_default?: boolean } | null;
  // Aufgeloestes restliches Setup (Stab/Mast/Shim/Board) — je Komponente sagt *_is_default,
  // ob der Wert von den Nutzer-Standards geerbt ist oder fuer diese Session explizit gesetzt.
  setup?: {
    stab?: { id: number; brand: string; model: string; size: string; is_default?: boolean };
    mast_len_cm?: number; mast_is_default?: boolean;
    shim_deg?: number; shim_is_default?: boolean;
    board?: { id: number; name: string; volume_l: number | null; length_cm: number | null; is_default?: boolean };
  } | null;
  transfer_to?: string | null;   // offene Übertragung an diesen Empfänger (eigene Liste)
  analysis: Analysis | null;
}

export interface SpotNotePhoto { id: number; url: string; thumb_url: string | null }
export interface SpotNote {
  id: number; user_id: number; name: string | null; avatar_url: string | null;
  text: string; photos: SpotNotePhoto[];
  like_count: number; liked: boolean; my_report: boolean;
  updated_at: string | null; mine: boolean;
}
export interface SpotNotesOut {
  spot_id: number; notes: SpotNote[]; can_write: boolean; max_photos: number; max_text: number;
}

export interface SpotWeatherDay {
  date: string; code: number | null; tmax: number | null; tmin: number | null;
  wind_max: number | null; gust_max: number | null; dir: number | null; precip: number | null;
}
export interface SpotWeather {
  lat: number; lon: number;
  weather: {
    current: { temp: number | null; wind: number | null; dir: number | null; code: number | null };
    days: SpotWeatherDay[];
    wind_unit: string;
  } | null;
  pegel: { station: string; water: string | null; value: number | null; unit: string; timestamp: string | null; trend: number | null; km: number } | null;
  water?: { current: number | null; min: number | null; max: number | null; avg: number | null; at: string | null; source: string } | null;
}

export interface HistoryPoint {
  session_id: number;
  started_at: string;
  distance: number;
  duration: number;
  speed: number;
  glide: number;
  pump_hz: number | null;
  avg_pump_hz: number | null;
  avg_speed: number | null;
  pumps: number;
  runs: number;
  foiling_km: number;
  run_idx: Partial<Record<"distance" | "duration" | "speed" | "glide", number | null>>;
}

export interface RecordSet {
  distance: StatRecord;
  duration: StatRecord;
  speed: StatRecord;
  glide: StatRecord;
  runs: StatRecord;
  // Fun-Rekorde (Session-bezogen); optional für ältere Server-Antworten.
  session_distance?: StatRecord;
  session_time?: StatRecord;
  session_pumps?: StatRecord;
  max_hr?: StatRecord;
  early_bird?: StatRecord;   // Wert = Sekunden seit Mitternacht (Sonnenzeit)
  night_owl?: StatRecord;
  // Einziger Rekord OHNE Session: Summe der Carves > 180° eines NUTZERS im Zeitraum.
  // session_id/started_at/spot/track_preview sind hier immer null -> Kachel verlinkt nicht.
  carves180?: StatRecord;
}

export type CommunityRecords = Record<string, RecordSet>;

/** Ein Foil-Band für Rekorde/Bestenlisten (GET /api/community/foil-bands).
 *
 *  `art`: "alle" | "eigenes" | "flaeche" | "ar". Bei `eigenes` kommen zusätzlich `foil` (Name des
 *  Referenz-Foils) und `ar_von`/`ar_bis` mit — das Fenster ist ±15 % Fläche und ±2 AR um das
 *  eigene Foil. Fläche und AR sind nachweislich unabhängig (r = −0,12), deshalb beides.
 *  `sessions`/`fahrer` sind die echten Zahlen des Bandes, nicht geschätzt. */
export type FoilBand = {
  key: string;
  art: "alle" | "eigenes" | "flaeche" | "ar";
  sessions: number;
  fahrer: number;
  von: number | null;
  bis: number | null;
  foil?: string;
  ar_von?: number;
  ar_bis?: number;
};

// Carve-Erkennung (Accel-Zentripetal-g-Modell, nur Anzeige). g = Kurvenlage je Track-Punkt;
// carves = erkannte Carves mit Grad-Bucket (s=90–180 als <180 / m=180–360 / l=>360).
export interface CarveData {
  g: number[];   // Zentripetal-g je Track-Punkt (0 = keine Kurvenlage) — grobe Fallback-Färbung
  carves: { i0: number; i1: number; peak_g: number; rot: number; dir: "L" | "R"; bucket: "s" | "m" | "l" }[];
  arcs: [number, number, number][][];  // feine 25-Hz-Polylinie je Carve: [lat, lon, g] auf Catmull-Rom
  counts: { s: number; m: number; l: number };
}

// Einzel-Rekord je Spot (von einer Session/einem Lauf gewonnen -> mit Rekordhalter).
export interface SpotRecHolder {
  value: number;
  session_id: number | null;
  run_idx?: number | null;
  name?: string | null;
  started_at?: string | null;
  tz?: string | null;
}

// Kennzahlen je Spot (Spot-Vergleich unter der Karte).
export interface SpotAgg {
  spot: string;
  spot_id: number | null;
  sessions: number;
  runs: number;
  pumps: number;
  foilers: number;
  foiling_km: number;
  onfoil_s: number;
  longest_run: SpotRecHolder | null;   // weitester Einzel-Lauf (m) + Halter
  top_speed: SpotRecHolder | null;     // Topspeed (km/h) + Halter
}

export interface CommunitySession {
  sport_class?: string | null;   // null/"pumpfoil" = Pumpfoilen; sonst kennzeichnet die Karte es
  // Setup der Aufnahme (Session-Wert, sonst Standard des Besitzers). Je Teil optional —
  // fehlt es, zeigt die Karte den Chip gar nicht.
  setup?: { stab?: { brand: string; model: string; size: string }; mast_len_cm?: number;
            board?: { name: string } } | null;
  tz?: string | null;   // IANA-Zeitzone des Spots — Uhrzeiten in Spot-Ortszeit anzeigen
  session_id: number;
  started_at: string | null;
  ended_at?: string | null;
  name: string | null;
  author_new?: boolean;   // Konto jünger als 24 h -> "neu"-Badge
  avatar_url: string | null;
  spot: string | null;
  caption?: string | null;
  track_preview?: string | null;
  runs: number;
  foiling_km: number;
  max_speed_mps: number | null;
  detection: string | null;
  like_count?: number;
  liked?: boolean;
  photo_count?: number;
  thumb_url?: string | null;
  youtube_url?: string | null;
  video_url?: string | null;   // erstes Video jeder Plattform (nur anzeige-fähige Clients)
  foil?: { id: number; brand: string; model: string; size: string } | null;
  device_label?: string | null;
}

// Tages-Gruppe (ein Nutzer, ein Tag, ein Spot) aus /community/sessions-grouped.
// count===1 -> als normale Kachel rendern; count>=2 -> Akkordeon. Stats sind Tages-Summen
// (Speed = Maximum). `sessions` = die Einzel-Sessions, neueste zuerst.
export interface CommunityGroup {
  kind: "group";
  user_id: number;
  name: string | null;
  avatar_url: string | null;
  author_new?: boolean;
  date: string;            // lokaler Kalendertag (YYYY-MM-DD, Spot-Ortszeit)
  spot: string | null;
  tz?: string | null;
  count: number;
  foiling_km: number;
  foiling_time_s: number;
  pump_count: number;
  max_speed_mps: number | null;
  track_previews?: string[];   // Kombi-Minimap(s) der Läufe — je Spot eine (nur bei count>=2)
  sessions: CommunitySession[];
}

export interface SessionSocial {
  like_count: number;
  liked: boolean;
  fake_count: number;
  my_fake: boolean;
  inappropriate_count: number;
  my_inappropriate: boolean;
  photos: { id: number; url: string; thumb_url?: string | null }[];
  videos: SessionVideo[];
}

export interface SessionVideo {
  id: number;
  youtube_url: string;
}

export interface CommunityPhoto {
  tz?: string | null;   // IANA-Zeitzone des Spots — Uhrzeiten in Spot-Ortszeit anzeigen
  kind?: "photo" | "video";
  photo_id?: number;
  url: string | null;
  thumb_url?: string | null;
  youtube_url?: string | null;
  session_id: number;
  started_at: string | null;
  name: string | null;
  avatar_url: string | null;
  spot: string | null;
  caption?: string | null;
  like_count?: number;
  liked?: boolean;
  my_inappropriate?: boolean;
}

export interface LeaderRow {
  name: string;
  avatar_url: string | null;
  sessions: number;
  runs: number;
  spots: number;
  pumps: number;
}
export interface Leaders {
  sessions: LeaderRow[];
  runs: LeaderRow[];
  spots: LeaderRow[];
  pumps: LeaderRow[];
}

export interface Profile {
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  language: string;
  beta?: boolean;   // Beta-Features (z. B. Polar-BLE-Recorder) nur für Allowlist-User
  foil_sensitivity?: string;   // persönliche Erkennungs-Empfindlichkeit (normal|light|attempts)
  pump_unit?: "hz" | "ppm";    // Anzeige-Einheit der Pump-Kadenz (nur Darstellung, ppm = Hz×60)
  social_allowed?: boolean;   // false = unter 13, UGC/Feed/Chat gesperrt (Apple-Vorgabe)
  // Eigene Sessions, die auf eine Zuordnung warten (docs/sport-classification.md) + die neueste
  // davon, damit der Hinweis direkt dorthin verlinkt.
  needs_classification?: number;
  needs_classification_id?: number | null;
  // Aussortierte eigene Aufnahmen (nicht als Pumpfoilen gezählt, noch keiner Sportart zugeordnet):
  // Anzahl am Tab, und wie viele davon frisch sind (letzte 7 Tage) — nur die heben den Tab hervor.
  sorted_out?: number;
  sorted_out_new?: number;
}

export interface AdminUser {
  id: number;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  blocked: boolean;
  hidden: boolean;
  new?: boolean;            // Konto jünger als 24 h
  social_allowed?: boolean; // false = age-gated (<13) -> Feed/Chat gesperrt
  age_bracket?: string | null;   // zuletzt gemeldete Altersspanne (under13|13-15|16-17|18+)
  created_at: string | null;
  last_seen_at: string | null;   // zuletzt aktiv (Admin)
  sessions: number;
  watches?: AdminWatch[];        // gepaarte Uhren (Plattform + Modell + Version)
  oauth?: string[];              // Login-Identitäten (google|apple|strava|garmin)
  links?: string[];              // Import-Konten (polar|coros|suunto|strava)
}

/** Admin: Sportart je Nutzer (docs/sport-classification.md). */
export interface AdminUserSport {
  id: number;
  display_name: string | null;
  avatar_url: string | null;
  default_sport_class: string;    // Profil-Standard für KÜNFTIGE Sessions
  sessions: number;
  open_classifications: number;   // noch offene Aufforderungen (needs_classification)
  sessions_unjudged: number;      // ohne menschliches Urteil -> „alle setzen" würde sie ändern
  sessions_judged: number;        // von Besitzer/Admin eingeordnet -> bleiben unverändert
}

export interface AdminWatch {
  platform: string | null;       // garmin | wear | apple
  name: string;                  // Modellname (partmap) oder Label
  version: string | null;        // gemeldete App-Version
  last_seen_at: string | null;
}

export interface AdminUserActivity {
  today: number; week: number; month: number; total: number;
  new_today: number; new_week: number; new_month: number; inactive_week: number;
}

// Sortierung der Nutzerliste.
export type UserSort = "id" | "seen" | "created" | "sessions";

// Anklickbare Statistik-Kacheln = Klick-Filter der Nutzerliste.
export type StatKey = "today" | "week" | "month" | "total" | "new_today" | "new_week" | "new_month" | "inactive_week";

// Kategorie-Filter der Nutzerverwaltung (alle default true).
export interface UserFilter { normal: boolean; tester: boolean; admin: boolean; new: boolean; }
// Eigene Session im Zwischenzustand (recording/live) — Datenquelle der Live-Upload-Karte.
// upload_total ist null, bis die Clients expected_chunks senden (Phase 3) -> UI zeigt dann
// unbestimmt „lädt hoch" statt %.
export interface InProgressSession {
  id: number;
  session_uuid: string;
  started_at: string;
  tz?: string | null;
  status: string;
  device_label?: string | null;
  upload_received: number;
  upload_total: number | null;
  gps_received: number;
  accel_received: number;
  has_gps: boolean;
  last_received_at?: string | null;   // Zeitpunkt des letzten Chunks; für Stall-Erkennung (>5 min)
}

function userFilterQS(f?: UserFilter): string {
  if (!f) return "";
  // Nur explizit ausgeschaltete Klassen senden (Server-Default = true).
  return (["normal", "tester", "admin", "new"] as const)
    .filter((k) => !f[k]).map((k) => `&${k}=false`).join("");
}

export interface AdminPhoto {
  id: number;
  url: string;
  session_id: number;
  blocked: boolean;
  name: string | null;
  spot: string | null;
}

export interface AdminOverview {
  users: number; users_blocked: number; admins: number;
  sessions: number; sessions_deleted: number; pumpfoil: number;
  flagged: number; fake: number; reported: number; photos: number; photos_blocked: number; likes: number;
}

export interface AdminPending { flagged: number; fake: number; suspect?: number; chat?: number; total: number; }

export interface AdminStatsBucket {
  date: string; new_users: number; active_users: number; sessions: number; photos: number; likes: number;
}
export interface AdminStatsSeries {
  period: string;
  buckets: AdminStatsBucket[];
  totals: { new_users: number; active_users: number; sessions: number; photos: number; likes: number };
}

/** Systemzustand des Servers (Admin). Feldnamen wie im Server (`api/health.py`) — deutsch, weil
 *  der Admin-Bereich deutsch ist und eine Übersetzungsebene hier nur Fehler einbaut. */
export interface SystemHealth {
  zeit: number;
  system: { kernel: string; rechner: string; kerne: number; cpu_modell: string; uptime_s: number };
  cpu: { auslastung: number | null; last: number[] | null; last_je_kern: number | null };
  speicher: {
    total: number; verfuegbar: number; benutzt: number; prozent: number | null;
    cached: number; puffer: number; swap_total: number; swap_benutzt: number; swap_prozent: number | null;
  };
  platten: { pfad: string; geraet: string; typ: string; total: number; benutzt: number; frei: number; prozent: number | null }[];
  prozesse: {
    anzahl: number;
    nach_cpu: { pid: number; nutzer: string; cpu: number; mem: number; rss: number; laufzeit_s: number; name: string }[];
    nach_speicher: { pid: number; nutzer: string; cpu: number; mem: number; rss: number; laufzeit_s: number; name: string }[];
  };
  dienste: { name: string; zustand: string; seit: string }[];
  timer: { name: string; zustand: string; letzte: number | null; naechste: number | null }[];
  fehlerhafte_units: string[];
  postgres: {
    groesse?: number; verbindungen?: number; max_verbindungen?: number; aktive_abfragen?: number;
    laengste_abfrage_s?: number; tabellen?: { name: string; bytes: number }[]; fehler?: string;
  };
  backup: { pfad: string; stand?: number; alter_h?: number; bytes?: number; secrets_da?: boolean; fehler?: string };
  oom_24h: number | null;
  medien_bytes: number | null;
  warnungen: { stufe: "rot" | "gelb"; schluessel: string; text: string }[];
}

/** Messreihen fuer die Verlaufsdiagramme — eigener Endpunkt, damit das 10-Sekunden-Pollen der
 *  Momentaufnahme klein bleibt. Serverseitig auf <= 600 Punkte verdichtet. */
export interface SystemVerlauf {
  fenster: number;
  messungen: number;
  punkte: { t: number; cpu: number | null; speicher: number | null; swap: number | null; last1: number | null; root: number | null; tmp: number | null }[];
}

export interface NewsBanner { version: number; enabled: boolean; texts: Record<string, string>; updated_at?: string | null; }

export interface AdminBlock {
  id: number; created_at: string | null;
  blocker: { id: number; email: string | null; display_name: string | null };
  blocked: { id: number; email: string | null; display_name: string | null };
}

export interface AdminAuditEntry {
  id: number; action: string; target_type: string; target_id: number | null;
  detail: string | null; at: string | null; admin: string | null;
}

export interface AdminSession {
  session_id: number;
  started_at: string | null;
  name: string | null;
  email: string | null;
  spot: string | null;
  sport: string;
  is_pumpfoil: boolean;
  pumpfoil_override?: boolean | null;   // false = admin-aussortiert
  deleted: boolean;
  flagged: boolean;
  mod_ok: boolean;
  inappropriate: number;
  fake: number;
  gated_runs?: number;   // vom Physik-Gate verworfene Läufe (>40 km/h)
  likes: number;
  photos: number;
  reporters?: { name: string | null; kind: string; at: string | null }[];
}

export interface RawData {
  gps_t_ms: number[];
  gps_speed_mps: (number | null)[];
  gps_lat: (number | null)[];
  gps_lon: (number | null)[];
  accel_hz_effective: number;
  accel_t_ms: number[];
  accel_mag_g: number[];
  accel_band_g: number[];
}

export interface LabelItem {
  id: number;
  t_start_ms: number;
  t_end_ms: number;
  label: string;
}

export const api = {
  register: (email: string, password: string, display_name?: string, language?: string) =>
    req<{ access_token: string }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, display_name, language }),
    }),
  getProfile: () => req<Profile>("/api/auth/me"),
  polarStatus: () => req<{ available: boolean; linked: boolean; last_sync_at: string | null }>("/api/integrations/polar/status"),
  polarConnect: () => req<{ authorize_url: string }>("/api/integrations/polar/connect"),
  polarSync: () => req<{ imported: number; skipped: number; message?: string }>("/api/integrations/polar/sync", { method: "POST" }),
  polarUnlink: () => req<{ ok: boolean }>("/api/integrations/polar", { method: "DELETE" }),

  corosStatus: () => req<{ available: boolean; linked: boolean; last_sync_at: string | null }>("/api/integrations/coros/status"),
  corosConnect: () => req<{ authorize_url: string }>("/api/integrations/coros/connect"),
  corosUnlink: () => req<{ ok: boolean }>("/api/integrations/coros", { method: "DELETE" }),

  getPumpTruth: (id: number, runIdx: number | null) =>
    req<{ run_idx: number | null; takes: { take: number; times_ms: number[] }[]; next_take: number }>(
      `/api/sessions/${id}/pump-truth${runIdx != null ? `?run_idx=${runIdx}` : ""}`),
  savePumpTruth: (id: number, timesMs: number[], runIdx: number | null) =>
    req<{ ok: boolean; saved: number; take: number; n_takes: number }>(`/api/sessions/${id}/pump-truth`, {
      method: "PUT", body: JSON.stringify({ times_ms: timesMs, run_idx: runIdx }),
    }),
  deletePumpTruth: (id: number, runIdx: number | null) =>
    req<{ ok: boolean; deleted: number }>(`/api/sessions/${id}/pump-truth${runIdx != null ? `?run_idx=${runIdx}` : ""}`, { method: "DELETE" }),
  comparePumpTruth: (id: number, runIdx: number | null) =>
    req<{
      n_takes: number; ref_take?: number; consensus_n?: number; consensus_ms: number[];
      takes: { take: number; n: number; offset_ms: number; matched: number; jitter_ms: number; is_ref: boolean }[];
      verdict: "verified" | "unverified" | "implausible"; n_plausible: number; foil_s: number | null;
      quality: { take: number; n: number; cadence_hz: number; coverage: number; recall: number | null; jitter_ms: number | null; plausible: boolean }[];
    }>(`/api/sessions/${id}/pump-truth/compare${runIdx != null ? `?run_idx=${runIdx}` : ""}`),

  suuntoStatus: () => req<{ available: boolean; linked: boolean; last_sync_at: string | null }>("/api/integrations/suunto/status"),
  suuntoConnect: () => req<{ authorize_url: string }>("/api/integrations/suunto/connect"),
  suuntoSync: () => req<{ imported: number; skipped: number; message?: string }>("/api/integrations/suunto/sync", { method: "POST" }),
  suuntoUnlink: () => req<{ ok: boolean }>("/api/integrations/suunto", { method: "DELETE" }),

  stravaStatus: () => req<{ available: boolean; linked: boolean; last_sync_at: string | null }>("/api/integrations/strava/status"),
  stravaConnect: () => req<{ authorize_url: string }>("/api/integrations/strava/connect"),
  stravaSync: () => req<{ imported: number; skipped: number; message?: string }>("/api/integrations/strava/sync", { method: "POST" }),
  stravaUnlink: () => req<{ ok: boolean }>("/api/integrations/strava", { method: "DELETE" }),

  publicVideos: () => req<{ videos: { id: string; title: string; published: string }[]; channel: string }>("/api/public/videos"),

  mySpots: () => req<{ spot: string; count: number }[]>("/api/sessions/my-spots"),
  // `runs` = je Lauf eine eigene Linie (seit 31.08.); `track` = die komplette Aufnahme, bleibt
  // fuer draussen laufende App-Versionen erhalten. Neue Clients nehmen `runs`, wenn nicht leer.
  spotTracks: (spot: string) => req<{ session_id: number; started_at: string | null; foiling_km: number; track: [number, number, number | null][]; runs: [number, number, number | null][][] }[]>(
    `/api/sessions/spot-tracks?spot=${encodeURIComponent(spot)}`),

  // Als BLOB laden, nicht als JSON-Objekt: der Export traegt je Session die GPS-Spur und wird
  // dreistellig MB gross (bei 657 Sessions ~134 MB). `req` wuerde ihn parsen und die
  // Speicherfunktion ihn danach wieder serialisieren — dreimal dasselbe im Speicher, und auf
  // Android hat genau das die App zerlegt (02.09.). Hier reicht der rohe Datenstrom.
  exportMyDataBlob: async () => {
    const token = getToken();
    const res = await fetch("/api/auth/me/export", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return res.blob();
  },

  // --- Spot-Beschreibungen (je Nutzer ein Textblock + Fotos pro Spot) ---
  spotNotes: (spotId: number) => req<SpotNotesOut>(`/api/community/spot/${spotId}/notes`),
  saveSpotNote: (spotId: number, text: string) =>
    req<{ ok: boolean; id: number }>(`/api/community/spot/${spotId}/note`,
      { method: "PUT", body: JSON.stringify({ text }) }),
  deleteSpotNote: (spotId: number) =>
    req<{ ok: boolean }>(`/api/community/spot/${spotId}/note`, { method: "DELETE" }),
  // Foto-Upload geht ueber denselben Weg wie Session-Fotos (multipart, Bild vorher verkleinert).
  uploadSpotNotePhoto: async (spotId: number, file: File) =>
    uploadFile<SpotNotePhoto>(`/api/community/spot/${spotId}/note/photos`, await downscaleImage(file)),
  mySpotSessionPhotos: (spotId: number) =>
    req<{ id: number; url: string; thumb_url: string | null; started_at: string | null }[]>(
      `/api/community/spot/${spotId}/my-session-photos`),
  adoptSpotNotePhoto: (spotId: number, photoId: number) =>
    req<SpotNotePhoto>(`/api/community/spot/${spotId}/note/photos/from-session?photo_id=${photoId}`,
      { method: "POST" }),
  deleteSpotNotePhoto: (spotId: number, photoId: number) =>
    req<{ ok: boolean }>(`/api/community/spot/${spotId}/note/photos/${photoId}`, { method: "DELETE" }),
  sortSpotNotePhotos: (spotId: number, photoIds: number[]) =>
    req<{ ok: boolean }>(`/api/community/spot/${spotId}/note/photos/order`,
      { method: "PUT", body: JSON.stringify({ photo_ids: photoIds }) }),
  likeSpotNote: (noteId: number) =>
    req<{ liked: boolean; like_count: number }>(`/api/community/spot/notes/${noteId}/like`, { method: "POST" }),
  reportSpotNote: (noteId: number) =>
    req<{ reported: boolean; hidden: boolean }>(`/api/community/spot/notes/${noteId}/report`, { method: "POST" }),

  // Datei-Export EINER EIGENEN Session (GPX/FIT). Bewusst nicht als <a href> verlinkbar: der
  // Endpunkt verlangt den Token im Header, ein Link wuerde ihn in die URL zwingen (steht dann in
  // History/Server-Logs). Daher fetch + Blob; der Dateiname kommt vom Server (Content-Disposition),
  // damit Web und kuenftige Clients denselben Namen benutzen.
  sessionExport: async (id: number, kind: "gpx" | "fit"): Promise<{ blob: Blob; name: string }> => {
    const tok = getToken();
    const res = await fetch(`/api/sessions/${id}/export.${kind}`, {
      headers: tok ? { Authorization: `Bearer ${tok}` } : {},
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    const cd = res.headers.get("Content-Disposition") || "";
    const m = /filename="([^"]+)"/.exec(cd);
    return { blob: await res.blob(), name: m?.[1] || `pumpfoil-${id}.${kind}` };
  },
  spotMap: (accelOnly = true) => req<{ spot: string; spot_id: number | null; water?: string | null; lat: number; lon: number; sessions: number; notes?: number }[]>(`/api/community/spot-map?accel_only=${accelOnly}`),
  spotWeather: (spot: string) => req<SpotWeather>(`/api/community/spot/weather?spot=${encodeURIComponent(spot)}`),
  chatList: (scope: string, after = 0) => req<ChatMsg[]>(`/api/chat?scope=${encodeURIComponent(scope)}&after=${after}`),
  chatLatest: (scope: string, limit = 30) => req<ChatMsg[]>(`/api/chat?scope=${encodeURIComponent(scope)}&limit=${limit}`),
  chatBefore: (scope: string, before: number, limit = 30) => req<ChatMsg[]>(`/api/chat?scope=${encodeURIComponent(scope)}&before=${before}&limit=${limit}`),
  chatPost: (scope: string, text: string) => req<ChatMsg>(`/api/chat?scope=${encodeURIComponent(scope)}`, { method: "POST", body: JSON.stringify({ text }) }),
  chatReport: (id: number) => req<{ ok: boolean; report_count: number; hidden: boolean }>(`/api/chat/${id}/report`, { method: "POST" }),
  chatLike: (id: number) => req<{ liked: boolean; like_count: number }>(`/api/chat/${id}/like`, { method: "POST" }),
  chatEdit: (id: number, text: string) => req<{ ok: boolean; id: number; text: string }>(`/api/chat/${id}`, { method: "PATCH", body: JSON.stringify({ text }) }),
  chatDelete: (id: number) => req<{ ok: boolean; id: number }>(`/api/chat/${id}`, { method: "DELETE" }),
  chatHide: (id: number, hidden: boolean) => req<{ ok: boolean; id: number; hidden: boolean }>(`/api/chat/${id}/hide`, { method: "POST", body: JSON.stringify({ hidden }) }),
  chatReported: () => req<(ChatMsg & { scope: string })[]>(`/api/chat/reported`),
  chatDismissReports: (id: number) => req<{ ok: boolean; id: number }>(`/api/chat/${id}/dismiss-reports`, { method: "POST" }),
  chatSetReadonly: (userId: number, readonly: boolean) => req<{ ok: boolean; user_id: number; chat_readonly: boolean }>(`/api/chat/moderation/readonly`, { method: "POST", body: JSON.stringify({ user_id: userId, readonly }) }),
  chatMarkRead: (scope: string, upTo: number) => req<{ ok: boolean; last_read_id: number }>(`/api/chat/read`, { method: "POST", body: JSON.stringify({ scope, up_to: upTo }) }),
  chatLeave: (scope: string) => req<{ ok: boolean }>(`/api/chat/leave?scope=${encodeURIComponent(scope)}`, { method: "POST" }),
  chatSubscribe: (scope: string, on: boolean) => req<{ ok: boolean; push: boolean }>(`/api/chat/subscribe`, { method: "POST", body: JSON.stringify({ scope, on }) }),
  chatRoomState: (scope: string) => req<{ scope: string; push: boolean; left: boolean; last_read_id: number }>(`/api/chat/state?scope=${encodeURIComponent(scope)}`),
  chatRooms: () => req<ChatRoom[]>(`/api/chat/rooms`),
  chatDmOpen: (userId: number) => req<{ scope: string; other: { id: number; name: string | null; avatar_url: string | null }; blocked: boolean }>(`/api/chat/dm?user_id=${userId}`),
  chatSearchUsers: (q: string) => req<DmUser[]>(`/api/chat/users?q=${encodeURIComponent(q)}`),
  chatBlock: (userId: number) => req<{ ok: boolean; blocked: boolean }>(`/api/chat/block`, { method: "POST", body: JSON.stringify({ user_id: userId }) }),
  chatUnblock: (userId: number) => req<{ ok: boolean; blocked: boolean }>(`/api/chat/block/${userId}`, { method: "DELETE" }),
  chatBlocks: () => req<DmUser[]>(`/api/chat/blocks`),
  chatActive: (hours = 48, limit = 3) => req<ActiveRoom[]>(`/api/chat/active?hours=${hours}&limit=${limit}`),
  chatAllSpots: () => req<{ scope: string; label: string; url: string; messages: number }[]>(`/api/chat/all-spots`),
  // Audit-Sicht auf den KI-Assistenten (nur Admin, rein lesend): welche Raeume, welcher Verlauf.
  chatBotRooms: () => req<{ bot: { id: number; name: string | null }; rooms: BotRoom[] }>(`/api/chat/bot/rooms`),
  chatBotMessages: (scope: string) => req<BotMsg[]>(`/api/chat/bot/messages?scope=${encodeURIComponent(scope)}`),
  transferInitiate: (sessionId: number, toUserId: number) => req<Transfer>(`/api/transfers`, { method: "POST", body: JSON.stringify({ session_id: sessionId, to_user_id: toUserId }) }),
  transfersIncoming: () => req<Transfer[]>(`/api/transfers/incoming`),
  transferForSession: (sessionId: number) => req<Transfer | Record<string, never>>(`/api/transfers/for-session/${sessionId}`),
  transferAccept: (id: number) => req<{ ok: boolean; session_id: number }>(`/api/transfers/${id}/accept`, { method: "POST" }),
  transferDecline: (id: number) => req<{ ok: boolean }>(`/api/transfers/${id}/decline`, { method: "POST" }),
  transferCancel: (id: number) => req<{ ok: boolean }>(`/api/transfers/${id}`, { method: "DELETE" }),
  transferFriends: () => req<DmUser[]>(`/api/transfers/friends`),
  foils: (params?: { q?: string; brand?: string }) => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set("q", params.q);
    if (params?.brand) qs.set("brand", params.brand);
    const s = qs.toString();
    return req<Foil[]>(`/api/foils${s ? "?" + s : ""}`);
  },
  foilBrands: () => req<string[]>("/api/foils/brands"),
  stabs: (params?: { q?: string; brand?: string }) => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set("q", params.q);
    if (params?.brand) qs.set("brand", params.brand);
    const s = qs.toString();
    return req<Stab[]>(`/api/stabs${s ? "?" + s : ""}`);
  },
  stabBrands: () => req<string[]>("/api/stabs/brands"),
  // Eigene Bezeichnung anlegen (privat). Gibt es sie schon, kommt der bestehende Eintrag zurück.
  stabCreate: (s: { brand: string; model: string; size: string }) =>
    req<Stab>("/api/stabs", { method: "POST", body: JSON.stringify(s) }),
  stabDelete: (id: number) => req<void>(`/api/stabs/${id}`, { method: "DELETE" }),
  boards: () => req<Board[]>("/api/boards"),
  boardCreate: (b: { name: string; volume_l?: number | null; length_cm?: number | null }) =>
    req<Board>("/api/boards", { method: "POST", body: JSON.stringify(b) }),
  boardUpdate: (id: number, b: { name: string; volume_l?: number | null; length_cm?: number | null }) =>
    req<Board>(`/api/boards/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  boardDelete: (id: number) => req<{ ok: boolean }>(`/api/boards/${id}`, { method: "DELETE" }),
  // Advanced Uhr-Layouts
  layoutMeta: () => req<LayoutMeta>("/api/layouts/meta"),
  layouts: (category?: string) =>
    req<WatchLayout[]>(`/api/layouts${category ? `?category=${category}` : ""}`),
  layoutCommunity: (p?: { category?: string; shape?: string; w?: number; h?: number }) => {
    const qs = new URLSearchParams();
    if (p?.category) qs.set("category", p.category);
    if (p?.shape) qs.set("shape", p.shape);
    if (p?.w) qs.set("w", String(p.w));
    if (p?.h) qs.set("h", String(p.h));
    const s = qs.toString();
    return req<WatchLayout[]>(`/api/layouts/community${s ? "?" + s : ""}`);
  },
  layoutCreate: (l: WatchLayoutPatch) =>
    req<WatchLayout>("/api/layouts", { method: "POST", body: JSON.stringify(l) }),
  layoutUpdate: (id: number, l: WatchLayoutPatch) =>
    req<WatchLayout>(`/api/layouts/${id}`, { method: "PUT", body: JSON.stringify(l) }),
  layoutPublish: (id: number, published: boolean) =>
    req<WatchLayout>(`/api/layouts/${id}/publish?published=${published}`, { method: "POST" }),
  layoutCopy: (id: number) => req<WatchLayout>(`/api/layouts/${id}/copy`, { method: "POST" }),
  layoutDelete: (id: number) => req<void>(`/api/layouts/${id}`, { method: "DELETE" }),
  foilStats: () => req<{ foil_id: number; brand: string; model: string; size: string; aspect_ratio: number | null; sessions: number; users: number; avg_speed_kmh: number | null; meters_per_pump: number | null; best_distance_m: number | null; best_duration_s: number | null; avg_pump_hz: number | null }[]>("/api/community/foil-stats"),
  watchStats: () => req<{ watch: string; sessions: number; users: number; foiling_km: number; avg_speed_kmh: number | null; best_distance_m: number | null; best_speed_kmh: number | null; avg_pump_hz: number | null }[]>("/api/community/watch-stats"),
  pushKey: () => req<{ key: string }>("/api/push/key"),
  pushSubscribe: (sub: unknown) => req<{ ok: boolean }>("/api/push/subscribe", { method: "POST", body: JSON.stringify(sub) }),
  pushUnsubscribe: (endpoint: string) => req<{ ok: boolean }>("/api/push/unsubscribe", { method: "POST", body: JSON.stringify({ endpoint }) }),
  pushTest: () => req<{ sent: number }>("/api/push/test", { method: "POST" }),
  deleteMyAccount: () => req<{ ok: boolean }>("/api/auth/me", { method: "DELETE" }),
  updateProfile: (display_name: string) =>
    req<Profile>("/api/auth/me", {
      method: "PATCH",
      body: JSON.stringify({ display_name }),
    }),
  updateLanguage: (language: string) =>
    req<Profile>("/api/auth/me", {
      method: "PATCH",
      body: JSON.stringify({ language }),
    }),
  // Anzeige-Einheit der Pump-Kadenz (hz|ppm). Reine Darstellung — nichts wird neu berechnet.
  updatePumpUnit: (pump_unit: string) =>
    req<Profile>("/api/auth/me", {
      method: "PATCH",
      body: JSON.stringify({ pump_unit }),
    }),
  // Persönliche Erkennungs-Empfindlichkeit (normal|light|attempts). Server reanalysiert
  // danach die EIGENEN Sessions (kann kurz dauern); Community/Rekorde bleiben Standard.
  updateFoilSensitivity: (foil_sensitivity: string) =>
    req<Profile>("/api/auth/me", {
      method: "PATCH",
      body: JSON.stringify({ foil_sensitivity }),
    }),
  // Fortschritt der Hintergrund-Reanalyse nach Empfindlichkeits-Wechsel (für die Anzeige).
  getFoilReanalysis: () =>
    req<{ running: boolean; done: number; total: number }>("/api/auth/me/reanalysis"),
  uploadAvatar: async (file: File) => uploadFile<Profile>("/api/auth/me/avatar", await downscaleImage(file, 1024)),
  changePassword: (current_password: string, new_password: string) =>
    req<{ ok: boolean }>("/api/auth/me/password", {
      method: "PATCH",
      body: JSON.stringify({ current_password, new_password }),
    }),
  login: (email: string, password: string) =>
    req<{ access_token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  oauthProviders: () => req<{ id: string; label: string }[]>("/api/auth/oauth/providers"),
  forgotPassword: (email: string) =>
    req<{ ok: boolean }>("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (token: string, new_password: string) =>
    req<{ access_token: string }>("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, new_password }),
    }),
  pairingCode: () =>
    req<{ code: string; expires_at: string }>("/api/devices/pairing-code", {
      method: "POST",
    }),
  myDevices: (includeHidden = false) =>
    req<PairedDevice[]>(`/api/devices/list?include_hidden=${includeHidden}`),
  // Ausblenden ist rein kosmetisch — die Uhr laedt weiter hoch (s. devices.py /hide).
  hideDevice: (id: number, hidden = true) =>
    req<{ ok: boolean; hidden: boolean }>(`/api/devices/${id}/hide?hidden=${hidden}`, { method: "POST" }),
  forgetDevice: (id: number) =>
    req<{ ok: boolean; deleted: boolean }>(`/api/devices/${id}/forget`, { method: "POST" }),
  revokeDevice: (id: number) => req<{ ok: boolean }>(`/api/devices/${id}`, { method: "DELETE" }),
  // Absturz-Zähler dieser Uhr zurücksetzen -> sie bekommt wieder eigene Layouts.
  resetLayoutCanary: (id: number) =>
    req<{ ok: boolean }>(`/api/devices/${id}/layout-canary/reset`, { method: "POST" }),
  setDeviceGnssMode: (id: number, gnss_mode: string) =>
    req<{ ok: boolean; gnss_mode: string }>(`/api/devices/${id}/gnss-mode`, {
      method: "PUT", body: JSON.stringify({ gnss_mode }),
    }),
  setDeviceRecordMode: (id: number, record_mode: string) =>
    req<{ ok: boolean; record_mode: string }>(`/api/devices/${id}/record-mode`, {
      method: "PUT", body: JSON.stringify({ record_mode }),
    }),
  // Reverse-Pairing: Code von der Uhr hier eingeben.
  pairClaim: (code: string) =>
    req<{ ok: boolean; label?: string; already?: boolean; platform?: string }>("/api/devices/pair-claim", {
      method: "POST", body: JSON.stringify({ code, label: "Garmin" }),
    }),
  uploadFit: async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const token = getToken();
    _activeUploads++;
    try {
      const res = await fetch("/api/sessions/upload-fit", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return (await res.json()) as SessionSummary;
    } finally {
      _activeUploads--;
    }
  },
  sessions: (params?: { limit?: number; offset?: number; month?: string; filter?: string; accelOnly?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.limit != null) qs.set("limit", String(params.limit));
    if (params?.offset != null) qs.set("offset", String(params.offset));
    if (params?.month) qs.set("month", params.month);
    if (params?.filter) qs.set("filter", params.filter);
    if (params?.accelOnly) qs.set("accel_only", "true");
    const q = qs.toString();
    return req<SessionSummary[]>(`/api/sessions${q ? "?" + q : ""}`);
  },
  sessionMonths: (filter?: string) =>
    req<{ month: string; count: number }[]>(`/api/sessions/months${filter ? "?filter=" + filter : ""}`),
  hasAccel: () => req<{ has_accel: boolean }>("/api/sessions/has-accel"),
  // period: today|10d|30d|365d|all — dieselben Fenster wie die Community-Ranglisten (PERIODS).
  // `sport` leer lassen = der Server nimmt die haeufigste Sportart des Nutzers und sagt in der
  // Antwort (`sport`), welche das war. Die Auswahlliste kommt als `sports` gleich mit.
  hrProgress: (sport?: string) =>
    req<HrProgress>(`/api/sessions/hr-progress${sport ? `?sport=${encodeURIComponent(sport)}` : ""}`),
  // Dieselben Kennzahlen, aber einzeln je Foil (Startseite, Abschnitt unter den Rekorden).
  // Nur Foils, die im gewaehlten Zeitfenster vorkommen; `foil_id: null` = Sessions ohne Eintrag.
  statsByFoil: (accelOnly = true, period = "all", sport?: string) =>
    req<FoilStatsGroup[]>(`/api/sessions/stats-by-foil?accel_only=${accelOnly}&period=${encodeURIComponent(period)}`
      + (sport ? `&sport=${encodeURIComponent(sport)}` : "")),
  stats: (accelOnly = true, period = "all", sport?: string) =>
    req<OverallStats>(`/api/sessions/stats?accel_only=${accelOnly}&period=${encodeURIComponent(period)}`
      + (sport ? `&sport=${encodeURIComponent(sport)}` : "")),
  // `sport` = Sportart-Filter der Community-Seite (docs/sport-classification.md). Default pumpfoil,
  // damit Aufrufer ohne Filter unverändert weiterlaufen.
  communityRecords: (accelOnly = true, sport = "pumpfoil", foilBand = "all") =>
    req<CommunityRecords>(`/api/community/records?accel_only=${accelOnly}&sport=${sport}&foil_band=${foilBand}`),
  /** Die Foil-Baender fuer das Dropdown — MIT Sessionzahl und Fahrerzahl je Band, damit die
   *  Oberflaeche duenne Gruppen ausblenden kann (ein Rekord aus zwei Fahrern ist keiner). */
  foilBands: (accelOnly = true, sport = "pumpfoil") =>
    req<FoilBand[]>(`/api/community/foil-bands?accel_only=${accelOnly}&sport=${sport}`),
  communitySports: () => req<{ sport: string; runs: number }[]>("/api/community/sports"),
  startSuccess: () => req<{ threshold_m: number; windows: Record<string, { total: number; success: number; failed: number; rate: number | null }> }>("/api/community/start-success"),
  carveStats: () => req<{ windows: Record<string, { s: number; m: number; l: number }> }>("/api/community/carve-stats"),
  communitySpots: (accelOnly = true, sport = "pumpfoil") =>
    req<{ mine: string[]; all: string[] }>(`/api/community/spots?accel_only=${accelOnly}&sport=${sport}`),
  communityStats: () => req<{ foilers: number; spots: number; sessions: number; pumps: number }>(`/api/community/stats`),
  spotRecords: (spot: string, period = "all", accelOnly = true, sport = "pumpfoil") =>
    req<RecordSet>(`/api/community/spot-records?spot=${encodeURIComponent(spot)}&period=${period}&accel_only=${accelOnly}&sport=${sport}`),
  spotCompare: (period = "all", accelOnly = false) =>
    req<{ spots: SpotAgg[] }>(`/api/community/spot-compare?period=${period}&accel_only=${accelOnly}`),
  // Startversuche als Index-Bereiche fuer die Karte (nur die MISSLUNGENEN — die geglueckten sind
  // die Laeufe). Wird serverseitig frisch gerechnet, deshalb erst beim Einschalten des Schalters.
  sessionAttempts: (id: number) =>
    req<{ attempts: { points: [number, number][]; t_start_ms: number; distance_m: number; duration_s: number; avg_speed_mps: number; outside_trim: boolean }[] }>(
      `/api/sessions/${id}/attempts`),
  sessionCarves: (id: number) =>
    req<CarveData>(`/api/sessions/${id}/carves`),
  communitySessions: (limit = 20, offset = 0, opts: { name?: string; spot?: string; accelOnly?: boolean;
      // "all" = alle Sportarten (Liste "was ist neu"); sonst genau eine (Community-Ansichten).
      sport?: string } = {}) => {
    const p = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (opts.name) p.set("name", opts.name);
    if (opts.spot) p.set("spot", opts.spot);
    if (opts.accelOnly === false) p.set("accel_only", "false");
    if (opts.sport) p.set("sport", opts.sport);
    return req<CommunitySession[]>(`/api/community/sessions?${p}`);
  },
  communitySessionsGrouped: (limit = 20, offset = 0, opts: { name?: string; spot?: string; accelOnly?: boolean;
      // "all" = alle Sportarten (Liste "was ist neu"); sonst genau eine (Community-Ansichten).
      sport?: string } = {}) => {
    const p = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (opts.name) p.set("name", opts.name);
    if (opts.spot) p.set("spot", opts.spot);
    if (opts.accelOnly === false) p.set("accel_only", "false");
    if (opts.sport) p.set("sport", opts.sport);
    return req<CommunityGroup[]>(`/api/community/sessions-grouped?${p}`);
  },
  spotSessions: (spot: string, accelOnly = true) =>
    req<CommunitySession[]>(`/api/community/spot-sessions?spot=${encodeURIComponent(spot)}&accel_only=${accelOnly}`),
  leaders: (period = "all", accelOnly = true, sport = "pumpfoil", foilBand = "all") =>
    req<Leaders>(`/api/community/leaders?period=${period}&accel_only=${accelOnly}&sport=${sport}&foil_band=${foilBand}`),
  communityLatestPhotos: (limit = 5) => req<CommunityPhoto[]>(`/api/community/latest-photos?limit=${limit}`),
  topLiked: (period = "all") => req<CommunitySession[]>(`/api/community/top-liked?period=${period}`),
  toggleLike: (id: number) =>
    req<{ like_count: number; liked: boolean }>(`/api/community/sessions/${id}/like`, { method: "POST" }),
  toggleVote: (id: number, kind: "fake" | "inappropriate") =>
    req<SessionSocial>(`/api/community/sessions/${id}/vote?kind=${kind}`, { method: "POST" }),
  sessionSocial: (id: number) => req<SessionSocial>(`/api/community/sessions/${id}/social`),
  sessionPhotos: (id: number) => req<{ id: number; url: string; thumb_url?: string | null }[]>(`/api/sessions/${id}/photos`),
  uploadSessionPhoto: async (id: number, file: File) =>
    uploadFile<{ id: number; url: string; thumb_url?: string | null }>(`/api/sessions/${id}/photos`, await downscaleImage(file)),
  deleteSessionPhoto: (id: number, photoId: number) =>
    req(`/api/sessions/${id}/photos/${photoId}`, { method: "DELETE" }),
  addSessionVideo: (id: number, youtubeUrl: string) =>
    req<SessionVideo>(`/api/sessions/${id}/videos`, {
      method: "POST",
      body: JSON.stringify({ youtube_url: youtubeUrl }),
    }),
  deleteSessionVideo: (id: number, videoId: number) =>
    req(`/api/sessions/${id}/videos/${videoId}`, { method: "DELETE" }),
  history: () => req<HistoryPoint[]>("/api/sessions/history"),
  inProgress: () => req<InProgressSession[]>("/api/sessions/in-progress"),
  updateSessionMeta: (id: number, patch: { caption?: string; youtube_url?: string; foil_id?: number | null;
    stab_id?: number | null; mast_len_cm?: number | null; shim_deg?: number | null; board_id?: number | null }) =>
    req<SessionSummary>(`/api/sessions/${id}/meta`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  trimSession: (id: number, trim_start_ms: number | null, trim_end_ms: number | null) =>
    req<SessionSummary>(`/api/sessions/${id}/trim`, {
      method: "PATCH",
      body: JSON.stringify({ trim_start_ms, trim_end_ms }),
    }),
  // Lauf aussortieren / wieder aufnehmen. Der Server nimmt die Lauf-NUMMER und speichert
  // deren ZEITFENSTER (Index wäre nach der nächsten Neuanalyse ein anderer Lauf).
  excludeRun: (id: number, run_index: number) =>
    req<SessionSummary>(`/api/sessions/${id}/runs/exclude`, {
      method: "POST",
      body: JSON.stringify({ run_index }),
    }),
  // Freies Zeitfenster aussortieren (ms ab Session-Start, gleiche Basis wie der Trim). Für
  // Abschnitte, die KEIN Lauf sind — eine Autofahrt zwischen zwei Spots zählt der Detektor
  // nicht als Lauf, verfälscht aber Gesamtstrecke/Höchstgeschwindigkeit/Karte.
  excludeRange: (id: number, start_ms: number, end_ms: number) =>
    req<SessionSummary>(`/api/sessions/${id}/runs/exclude`, {
      method: "POST",
      body: JSON.stringify({ start_ms, end_ms }),
    }),
  includeRun: (id: number, range_index: number) =>
    req<SessionSummary>(`/api/sessions/${id}/runs/include`, {
      method: "POST",
      body: JSON.stringify({ range_index }),
    }),
  // Fremdkraft-Lauf (Erkennung v2) zurückholen bzw. wieder abtrennen. Zeiten in Session-ms,
  // genau wie sie in analysis.metrics.fremdkraft_laeufe stehen.
  keepPoweredRun: (id: number, start_ms: number, end_ms: number, keep: boolean) =>
    req<SessionSummary>(`/api/sessions/${id}/powered-runs/keep`, {
      method: "POST",
      body: JSON.stringify({ start_ms, end_ms, keep }),
    }),
  session: (id: number) => req<SessionSummary>(`/api/sessions/${id}`),
  // Öffentlicher Teilen-Link: erzeugen (idempotent) / widerrufen / anonym abrufen.
  createShareLink: (id: number) => req<{ token: string; path: string }>(`/api/sessions/${id}/share`, { method: "POST" }),
  revokeShareLink: (id: number) => req<{ ok: boolean }>(`/api/sessions/${id}/share`, { method: "DELETE" }),
  publicSession: (token: string) => req<SessionSummary>(`/api/public/session/${encodeURIComponent(token)}`),
  sessionNeighbors: (id: number) => req<{ older: number | null; newer: number | null }>(`/api/sessions/${id}/neighbors`),
  deleteSession: (id: number) => req<{ ok: boolean }>(`/api/sessions/${id}`, { method: "DELETE" }),
  // Alle EIGENEN AUSSORTIERTEN auf einmal (Server erzwingt owner + filter=other serverseitig).
  deleteAllOtherSessions: () => req<{ ok: boolean; deleted: number }>(`/api/sessions/other/all`, { method: "DELETE" }),
  raw: (id: number) => req<RawData>(`/api/sessions/${id}/raw`),
  labels: (id: number) => req<LabelItem[]>(`/api/sessions/${id}/labels`),
  addLabel: (id: number, t_start_ms: number, t_end_ms: number, label: string) =>
    req<LabelItem>(`/api/sessions/${id}/labels`, {
      method: "POST",
      body: JSON.stringify({ t_start_ms, t_end_ms, label }),
    }),
  deleteLabel: (id: number, labelId: number) =>
    req(`/api/sessions/${id}/labels/${labelId}`, { method: "DELETE" }),
  mergeSuggestions: () => req<{ ids: number[]; count: number; place: string | null; date: string; sessions: { id: number; start: string; end: string }[] }[]>("/api/sessions/merge-suggestions"),
  mergeSessions: (ids: number[]) =>
    req<{ id: number }>("/api/sessions/merge", { method: "POST", body: JSON.stringify({ session_ids: ids }) }),
  unmergeSession: (id: number) =>
    req<{ ids: number[] }>(`/api/sessions/${id}/unmerge`, { method: "POST" }),
  getSettings: () => req<Record<string, any>>("/api/settings"),
  // --- Sportart-Klassifikation (docs/sport-classification.md) ---
  flagNotPumpfoil: (id: number, note?: string) =>
    req<{ ok: boolean; flags?: number; needs_classification?: boolean }>(
      `/api/sessions/${id}/not-pumpfoil`, { method: "POST", body: JSON.stringify({ note: note ?? null }) }),
  setClassification: (id: number, patch: { sport?: string; data_quality?: string }) =>
    req<{ ok: boolean; sport_class: string; data_quality: string; sport_source: string }>(
      `/api/sessions/${id}/classification`, { method: "PUT", body: JSON.stringify(patch) }),
  appealClassification: (id: number, text: string) =>
    req<{ ok: boolean }>(`/api/sessions/${id}/appeal`, { method: "POST", body: JSON.stringify({ text }) }),
  adminClassificationQueue: () => req<Record<string, any>[]>("/api/admin/classification-queue"),
  adminSessionFlags: () => req<Record<string, any>[]>("/api/admin/session-flags"),
  adminFlagBlock: (uid: number, blocked: boolean) =>
    req<{ ok: boolean; flag_blocked: boolean }>(`/api/admin/users/${uid}/flag-block?blocked=${blocked}`, { method: "POST" }),
  adminKeepPumpfoil: (id: number) =>
    req<{ ok: boolean }>(`/api/admin/sessions/${id}/keep-pumpfoil`, { method: "POST" }),
  // Sportart je Nutzer (für Nutzer, die auf die Bitte nicht reagieren) — drei getrennte Aktionen.
  adminUserSport: (q?: string) =>
    req<AdminUserSport[]>(`/api/admin/user-sport${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  adminSetDefaultSport: (uid: number, sport: string) =>
    req<{ ok: boolean; default_sport_class: string }>(`/api/admin/users/${uid}/default-sport`,
      { method: "POST", body: JSON.stringify({ sport }) }),
  adminResolveClassifications: (uid: number, sport: string) =>
    req<{ ok: boolean; sport: string; resolved: number }>(`/api/admin/users/${uid}/resolve-classification`,
      { method: "POST", body: JSON.stringify({ sport }) }),
  // Alle Sessions ohne menschliches Urteil auf eine Sportart setzen (auch die ohne Aufforderung).
  adminSetAllSport: (uid: number, sport: string) =>
    req<{ ok: boolean; sport: string; changed: number; skipped: number; sessions: number }>(
      `/api/admin/users/${uid}/set-all-sport`,
      { method: "POST", body: JSON.stringify({ sport }) }),
  saveSettings: (patch: Record<string, unknown>) =>
    req<Record<string, any>>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(patch),
    }),
  mlStatus: () =>
    req<{ n_samples: number; n_sessions: number; classes: string[]; features: string[] }>(
      "/api/ml/status"
    ),
  mlTrain: () => req<any>("/api/ml/train", { method: "POST" }),
  appDevices: () => req<AppDevice[]>("/api/app/devices"),
  adminOverview: () => req<AdminOverview>("/api/admin/overview"),
  adminStatsSeries: (period: string) => req<AdminStatsSeries>(`/api/admin/stats-series?period=${period}`),
  adminPending: () => req<AdminPending>("/api/admin/pending"),
  adminBlocks: () => req<AdminBlock[]>("/api/admin/blocks"),
  newsBanner: () => req<NewsBanner>("/api/app/news"),
  adminHealth: () => req<SystemHealth>("/api/admin/health"),
  adminHealthVerlauf: (stunden: number) => req<SystemVerlauf>(`/api/admin/health/verlauf?fenster=${stunden}`),
  adminNewsGet: () => req<NewsBanner>("/api/admin/news"),
  adminNewsSet: (p: Partial<NewsBanner>) => req<NewsBanner>("/api/admin/news", { method: "PUT", body: JSON.stringify(p) }),
  adminSpots: () => req<{ id: number; name: string | null; name_source: string | null; water: string | null; lat: number | null; lon: number | null; sessions: number }[]>("/api/admin/spots"),
  adminMergeSpots: (into: number, from: number[]) => req<{ ok: boolean; into: number; merged: number }>("/api/admin/spots/merge", { method: "POST", body: JSON.stringify({ into, from }) }),
  // Moderation der Spot-Beschreibungen: eine Meldung blendet sofort aus, hier entscheidet der Admin.
  adminSpotNotes: (scope = "reported") => req<{
    id: number; spot_id: number; spot: string | null; user_id: number; name: string | null;
    text: string; photos: string[]; hidden: boolean; mod_ok: boolean; reports: number;
    updated_at: string | null;
  }[]>(`/api/admin/spot-notes?scope=${scope}`),
  adminSpotNoteOk: (id: number) => req(`/api/admin/spot-notes/${id}/ok`, { method: "POST" }),
  adminSpotNoteDelete: (id: number) => req(`/api/admin/spot-notes/${id}/delete`, { method: "POST" }),
  adminRenameSpot: (id: number, name: string) => req<{ ok: boolean; name: string }>(`/api/admin/spots/${id}/rename?name=${encodeURIComponent(name)}`, { method: "POST" }),
  adminFlagged: () => req<AdminSession[]>("/api/admin/flagged"),
  adminSessions: (scope: "all" | "flagged" | "fake" | "suspect" | "deleted" = "all",
                  opts: { limit?: number; offset?: number; q?: string; userId?: number } = {}) => {
    const p = new URLSearchParams({ scope });
    p.set("limit", String(opts.limit ?? 30));
    if (opts.offset) p.set("offset", String(opts.offset));
    if (opts.q) p.set("q", opts.q);
    if (opts.userId != null) p.set("user_id", String(opts.userId));
    return req<AdminSession[]>(`/api/admin/sessions?${p}`);
  },
  // --- Community-Feed aus den Social-Kanaelen der Nutzer -------------------------------
  socialFeed: (limit = 60, offset = 0) =>
    req<SocialItem[]>(`/api/social/feed?limit=${limit}&offset=${offset}`),
  socialMine: () => req<SocialChannelState>("/api/social/mine"),
  socialSetChannel: (url: string) =>
    req<SocialChannelState>("/api/social/mine", { method: "PUT", body: JSON.stringify({ url }) }),
  socialRemoveChannel: () => req<SocialChannelState>("/api/social/mine", { method: "DELETE" }),
  socialReport: (id: number) => req<{ ok: boolean }>(`/api/social/item/${id}/report`, { method: "POST" }),
  adminSocial: () => req<{ pending: AdminSocialChannel[]; approved: AdminSocialChannel[]; reported: AdminSocialItem[] }>("/api/admin/social"),
  adminSocialApprove: (userId: number) => req<{ ok: boolean }>(`/api/admin/social/${userId}/approve`, { method: "POST" }),
  adminSocialReject: (userId: number, reason: string) =>
    req<{ ok: boolean }>(`/api/admin/social/${userId}/reject`, { method: "POST", body: JSON.stringify({ reason }) }),
  adminSocialBlock: (userId: number, blocked: boolean) =>
    req<{ ok: boolean }>(`/api/admin/social/${userId}/block?blocked=${blocked}`, { method: "POST" }),
  // Meldung abhaken, ohne zu sperren (Video bleibt im Feed, Zaehler auf 0).
  adminSocialDismiss: (id: number) =>
    req<{ ok: boolean }>(`/api/admin/social/item/${id}/dismiss`, { method: "POST" }),
  adminSocialBlockItem: (id: number, blocked: boolean) =>
    req<{ ok: boolean }>(`/api/admin/social/item/${id}/block?blocked=${blocked}`, { method: "POST" }),

  adminUserStats: (id: number) => req<{ user: AdminUser; stats: OverallStats }>(`/api/admin/users/${id}/stats`),
  adminApprove: (id: number) => req<{ ok: boolean }>(`/api/admin/sessions/${id}/ok`, { method: "POST" }),
  adminHideSession: (id: number) => req<{ ok: boolean }>(`/api/admin/sessions/${id}/hide`, { method: "POST" }),
  // Aussortieren „wie vom Detektor" (kein Shadow-Ban); undo=true -> Override weg + Neuanalyse.
  adminSortOut: (id: number, undo = false) =>
    req<{ ok: boolean; is_pumpfoil: boolean }>(`/api/admin/sessions/${id}/sortout${undo ? "?undo=true" : ""}`, { method: "POST" }),
  adminDismiss: (id: number, kind: "fake" | "inappropriate") =>
    req<{ ok: boolean }>(`/api/admin/sessions/${id}/dismiss?kind=${kind}`, { method: "POST" }),
  adminDeleteSession: (id: number) => req<{ ok: boolean }>(`/api/admin/sessions/${id}/delete`, { method: "POST" }),
  adminRestoreSession: (id: number) => req<{ ok: boolean }>(`/api/admin/sessions/${id}/restore`, { method: "POST" }),
  adminUsers: (q = "", limit = 30, offset = 0, f?: UserFilter, sort: UserSort = "id", stat?: StatKey | null) =>
    req<AdminUser[]>(`/api/admin/users?limit=${limit}&offset=${offset}&sort=${sort}${stat ? "&stat=" + stat : ""}${q ? "&q=" + encodeURIComponent(q) : ""}${userFilterQS(f)}`),
  adminUsersCount: (q = "", f?: UserFilter, stat?: StatKey | null) =>
    req<{ total: number }>(`/api/admin/users/count?${stat ? "stat=" + stat + "&" : ""}${q ? "q=" + encodeURIComponent(q) : ""}${userFilterQS(f)}`),
  adminUsersActivity: () => req<AdminUserActivity>("/api/admin/users/activity"),
  adminBlockUser: (id: number, blocked: boolean) =>
    req<{ blocked: boolean }>(`/api/admin/users/${id}/block?blocked=${blocked}`, { method: "POST" }),
  adminHideUser: (id: number, hidden: boolean) =>
    req<{ hidden: boolean }>(`/api/admin/users/${id}/hide?hidden=${hidden}`, { method: "POST" }),
  adminSetAdmin: (id: number, isAdmin: boolean) =>
    req<{ is_admin: boolean }>(`/api/admin/users/${id}/admin?is_admin=${isAdmin}`, { method: "POST" }),
  adminResetPassword: (id: number, password?: string) =>
    req<{ temp_password?: string; set?: boolean }>(
      `/api/admin/users/${id}/reset-password${password ? "?password=" + encodeURIComponent(password) : ""}`,
      { method: "POST" }),
  adminSetUserName: (id: number, name: string) =>
    req<{ display_name: string | null }>(`/api/admin/users/${id}/display-name?name=${encodeURIComponent(name)}`, { method: "POST" }),
  adminRemoveAvatar: (id: number) => req<{ ok: boolean }>(`/api/admin/users/${id}/remove-avatar`, { method: "POST" }),
  adminDeleteUser: (id: number) => req<{ ok: boolean }>(`/api/admin/users/${id}`, { method: "DELETE" }),
  adminPhotos: (limit = 60, offset = 0) => req<AdminPhoto[]>(`/api/admin/photos?limit=${limit}&offset=${offset}`),
  adminBlockPhoto: (id: number, blocked: boolean) =>
    req<{ blocked: boolean }>(`/api/admin/photos/${id}/block?blocked=${blocked}`, { method: "POST" }),
  adminDeletePhoto: (id: number) => req<{ ok: boolean }>(`/api/admin/photos/${id}`, { method: "DELETE" }),
  adminAudit: (limit = 100) => req<AdminAuditEntry[]>(`/api/admin/audit?limit=${limit}`),
  adminFeedback: (limit = 200) => req<AdminFeedback[]>(`/api/admin/feedback?limit=${limit}`),
  // Anhang als Blob holen. Ein blosses <a href>/<img src> geht NICHT: der Bearer-Token steckt im
  // localStorage und wird nur von unseren eigenen Aufrufen mitgeschickt — der Browser bekaeme
  // „Missing bearer token" (Jan, 30.08.). Die Route ist bewusst admin-geschuetzt, also holen wir
  // die Datei hier und zeigen sie aus einer Blob-URL.
  adminFeedbackAttachment: async (id: number): Promise<Blob> => {
    const token = getToken();
    const res = await fetch(`/api/admin/feedback/attachment/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.blob();
  },
  adminDeleteFeedback: (id: number) => req<{ ok: boolean }>(`/api/admin/feedback/${id}`, { method: "DELETE" }),
  adminDeleteAllFeedback: () => req<{ ok: boolean; deleted: number }>(`/api/admin/feedback/all`, { method: "DELETE" }),
  adminStarFeedback: (id: number, starred: boolean) =>
    req<{ ok: boolean; starred: boolean }>(`/api/admin/feedback/${id}/star?starred=${starred}`, { method: "POST" }),
  submitFeedback: (text: string, url: string) =>
    req<{ ok: boolean; id: number }>("/api/feedback", { method: "POST", body: JSON.stringify({ text, url }) }),
  // Anhang an die eben abgeschickte Meldung (Screenshot oder Log). Ueber uploadFile, weil `req`
  // immer application/json setzt — damit fehlt einem multipart-Upload die Grenzmarkierung.
  feedbackAttachment: (feedbackId: number, file: File) =>
    uploadFile<{ id: number; kind: string; filename: string; bytes: number }>(
      `/api/feedback/${feedbackId}/attachment`, file),
};

export interface AdminFeedback {
  id: number;
  text: string;
  url: string | null;
  at: string | null;
  name: string | null;
  email: string | null;
  starred?: boolean;   // ⭐ Testimonial-Archiv — überlebt „Alle löschen"
  attachments?: { id: number; kind: string; filename: string | null; bytes: number }[];
}

export interface StatRecord {
  tz?: string | null;   // IANA-Zeitzone des Spots — Uhrzeiten in Spot-Ortszeit anzeigen
  session_id: number | null;
  value: number;
  started_at: string | null;
  run_idx?: number | null;
  name?: string | null;
  avatar_url?: string | null;
  spot?: string | null;
  track_preview?: string | null;
}
// Trainingskurve: je Session der Median des Hoechstpulses nach 1/2/5 Minuten Lauf.
// `hr60`/`hr120`/`hr300` = die Werte, `n60`/`n120`/`n300` = aus wievielen Laeufen sie kommen.
export interface HrProgress {
  sport: string;
  sports: { sport: string; sessions: number }[];
  marks: number[];
  series: { session_id: number; started_at: string | null; [k: string]: number | string | null }[];
}

export interface SocialItem {
  id: number;
  platform: string;
  external_id: string;
  url: string;
  title: string | null;
  thumb_url: string | null;
  published_at: string | null;
  user_id: number;
  user_name: string | null;
  user_avatar: string | null;
  channel_url: string | null;
}

export interface SocialChannelState {
  url: string | null;
  pending_url: string | null;
  status: "none" | "pending" | "approved" | "rejected" | "blocked";
  blocked: boolean;
  rejected_reason: string | null;
  approved_at?: string | null;
}

export interface AdminSocialChannel {
  user_id: number;
  user_name: string | null;
  url: string | null;
  pending_url: string | null;
  channel_id: string | null;
  blocked: boolean;
  videos: number;
  fetched_at: string | null;
}

export interface AdminSocialItem {
  id: number; url: string; title: string | null; reports: number; blocked: boolean; user_id: number;
}

export interface FoilStatsGroup {
  foil_id: number | null;
  brand: string | null;
  model: string | null;
  size: string | null;
  aspect_ratio: number | null;
  sessions: number;
  stats: OverallStats;
}

export interface OverallStats {
  // Tatsaechlich verwendete Sportart + Auswahlliste (haeufigste zuerst) — s. api.stats.
  sport?: string;
  sports?: { sport: string; sessions: number }[];
  count: number;
  foiling_km: number;
  foiling_min: number;
  pumps: number;
  runs_total: number;
  records: {
    distance: StatRecord;
    duration: StatRecord;
    speed: StatRecord;
    runs: StatRecord;
    glide: StatRecord;
  };
}

export interface PairedDevice {
  /** Wie viele Sessions haengen dran? 0 = fehlgeschlagener Pairing-Versuch, darf ganz weg. */
  sessions?: number;
  id: number;
  label: string | null;
  created_at: string | null;
  last_seen_at: string | null;
  revoked_at: string | null;
  hidden_at?: string | null;
  hidden_total?: number;
  app_version: string | null;
  platform: string | null;
  latest_version: string | null;
  update_available: boolean;
  model: string | null;       // aufgelöstes Modell (aus Part-Number), z. B. "fēnix® 7X Pro"
  model_id: string | null;    // Katalog-/Download-ID -> /api/app/download/<id>
  record_mode: string;        // Aufzeichnungsmodus dieser Uhr (full|lite|gps)
  gnss_mode?: string;         // GNSS-Stufe dieser Uhr (best|l1|two|gps), nur Garmin ab 1.0.77
  low_accel: boolean;         // FR55 & Co.: 'full' wird automatisch auf 'lite' gekappt
  // Displaymaße/Form aus dem Build-Katalog (nur Garmin; Apple/Wear melden sie noch nicht) —
  // damit die Layout-Vorschau die ECHTE Größe dieser Uhr nutzen kann.
  screen_w?: number | null;
  screen_h?: number | null;
  shape?: string | null;
  // Eigene Layouts: Speicher reicht? Und hat DIESE Uhr einen Absturz gemeldet (Canary)?
  // Ein Absturz schaltet die Layouts nur für diese Uhr ab, bis der Nutzer zurücksetzt.
  layout_capable?: boolean;
  layout_canary_count?: number;
  layout_canary_at?: string | null;
  // Warum liefert der Server dieser Uhr (keine) Layouts: on | off_user | off_memory | off_canary
  // | off_model | off_nolayout. Ohne diese Begründung bleibt bei „steht auf An, kommt aber nichts"
  // nur Raten.
  layout_state?: string;
}

export interface AppDevice {
  id: string;
  name: string;
  family: string;
  w: number;
  h: number;
  bytes: number;
  version?: string;
}
