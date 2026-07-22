// Schmaler API-Client. JWT im localStorage.
import { downscaleImage } from "./downscaleImage";

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
  return (await res.json()) as T;
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

export interface TransferSessionBrief { id: number; place: string | null; water: string | null; started_at: string | null; sport: string; foiling_time_s: number | null; }
export interface Transfer { id: number; status: string; created_at: string | null; other: DmUser | null; session: TransferSessionBrief | null; role?: "sender" | "recipient"; }

export interface ActiveRoom {
  scope: string; label: string; url: string;
  messages: number; last_text: string; last_at: string | null;
}

export interface Foil {
  id: number; brand: string; model: string; size: string;
  span_cm: number; area_cm2: number; thickness_mm: number; thickness_estimated?: boolean;
  aspect_ratio: number | null; mean_chord_cm: number | null; is_baseline: boolean;
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
  owned?: boolean;
  merged_count?: number;   // >0 = zusammengeführt (auflösbar)
  owner_name?: string | null;
  owner_avatar_url?: string | null;
  place_name?: string | null;
  place_water?: string | null;
  caption?: string | null;
  youtube_url?: string | null;
  video_url?: string | null;   // erstes Video jeder Plattform (nur anzeige-fähige Clients)
  thumb_url?: string | null;
  device_label?: string | null;
  device_model?: string | null;
  share_token?: string | null;   // nur dem Besitzer geliefert (öffentlicher Teilen-Link gesetzt?)
  photos?: { id: number; url: string; thumb_url?: string | null }[];  // im öffentlichen Payload (/s/<token>)
  videos?: SessionVideo[];  // im öffentlichen Payload (/s/<token>)
  photo_count?: number;
  like_count?: number;
  liked?: boolean;
  track_preview?: string | null;
  foil_id?: number | null;
  foil?: { id: number; brand: string; model: string; size: string; span_cm?: number; area_cm2?: number; thickness_mm?: number; thickness_estimated?: boolean; aspect_ratio: number | null; is_default?: boolean } | null;
  transfer_to?: string | null;   // offene Übertragung an diesen Empfänger (eigene Liste)
  analysis: Analysis | null;
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
}

export type CommunityRecords = Record<string, RecordSet>;

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
  social_allowed?: boolean;   // false = unter 13, UGC/Feed/Chat gesperrt (Apple-Vorgabe)
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

export interface AdminPending { flagged: number; fake: number; suspect?: number; total: number; }

export interface AdminStatsBucket {
  date: string; new_users: number; active_users: number; sessions: number; photos: number; likes: number;
}
export interface AdminStatsSeries {
  period: string;
  buckets: AdminStatsBucket[];
  totals: { new_users: number; active_users: number; sessions: number; photos: number; likes: number };
}

export interface NewsBanner { version: number; enabled: boolean; texts: Record<string, string>; }

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
  spotTracks: (spot: string) => req<{ session_id: number; started_at: string | null; foiling_km: number; track: [number, number, number | null][] }[]>(
    `/api/sessions/spot-tracks?spot=${encodeURIComponent(spot)}`),

  exportMyData: () => req<Record<string, unknown>>("/api/auth/me/export"),
  spotMap: (accelOnly = true) => req<{ spot: string; spot_id: number | null; lat: number; lon: number; sessions: number }[]>(`/api/community/spot-map?accel_only=${accelOnly}`),
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
  foilStats: () => req<{ foil_id: number; brand: string; model: string; size: string; aspect_ratio: number | null; sessions: number; users: number; avg_speed_kmh: number | null; meters_per_pump: number | null; best_distance_m: number | null; avg_pump_hz: number | null }[]>("/api/community/foil-stats"),
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
  myDevices: () => req<PairedDevice[]>("/api/devices/list"),
  revokeDevice: (id: number) => req<{ ok: boolean }>(`/api/devices/${id}`, { method: "DELETE" }),
  setDeviceRecordMode: (id: number, record_mode: string) =>
    req<{ ok: boolean; record_mode: string }>(`/api/devices/${id}/record-mode`, {
      method: "PUT", body: JSON.stringify({ record_mode }),
    }),
  // Reverse-Pairing: Code von der Uhr hier eingeben.
  pairClaim: (code: string) =>
    req<{ ok: boolean; label?: string; already?: boolean }>("/api/devices/pair-claim", {
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
  stats: (accelOnly = true) => req<OverallStats>(`/api/sessions/stats?accel_only=${accelOnly}`),
  communityRecords: (accelOnly = true) => req<CommunityRecords>(`/api/community/records?accel_only=${accelOnly}`),
  startSuccess: () => req<{ threshold_m: number; windows: Record<string, { total: number; success: number; failed: number; rate: number | null }> }>("/api/community/start-success"),
  communitySpots: (accelOnly = true) => req<{ mine: string[]; all: string[] }>(`/api/community/spots?accel_only=${accelOnly}`),
  communityStats: () => req<{ foilers: number; spots: number; sessions: number; pumps: number }>(`/api/community/stats`),
  spotRecords: (spot: string, period = "all", accelOnly = true) =>
    req<RecordSet>(`/api/community/spot-records?spot=${encodeURIComponent(spot)}&period=${period}&accel_only=${accelOnly}`),
  spotCompare: (period = "all", accelOnly = false) =>
    req<{ spots: SpotAgg[] }>(`/api/community/spot-compare?period=${period}&accel_only=${accelOnly}`),
  sessionCarves: (id: number) =>
    req<CarveData>(`/api/sessions/${id}/carves`),
  communitySessions: (limit = 20, offset = 0, opts: { name?: string; spot?: string; accelOnly?: boolean } = {}) => {
    const p = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (opts.name) p.set("name", opts.name);
    if (opts.spot) p.set("spot", opts.spot);
    if (opts.accelOnly === false) p.set("accel_only", "false");
    return req<CommunitySession[]>(`/api/community/sessions?${p}`);
  },
  spotSessions: (spot: string, accelOnly = true) =>
    req<CommunitySession[]>(`/api/community/spot-sessions?spot=${encodeURIComponent(spot)}&accel_only=${accelOnly}`),
  leaders: (period = "all", accelOnly = true) => req<Leaders>(`/api/community/leaders?period=${period}&accel_only=${accelOnly}`),
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
  updateSessionMeta: (id: number, patch: { caption?: string; youtube_url?: string; foil_id?: number | null }) =>
    req<SessionSummary>(`/api/sessions/${id}/meta`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  trimSession: (id: number, trim_start_ms: number | null, trim_end_ms: number | null) =>
    req<SessionSummary>(`/api/sessions/${id}/trim`, {
      method: "PATCH",
      body: JSON.stringify({ trim_start_ms, trim_end_ms }),
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
  adminNewsGet: () => req<NewsBanner>("/api/admin/news"),
  adminNewsSet: (p: Partial<NewsBanner>) => req<NewsBanner>("/api/admin/news", { method: "PUT", body: JSON.stringify(p) }),
  adminSpots: () => req<{ id: number; name: string | null; name_source: string | null; water: string | null; lat: number | null; lon: number | null; sessions: number }[]>("/api/admin/spots"),
  adminMergeSpots: (into: number, from: number[]) => req<{ ok: boolean; into: number; merged: number }>("/api/admin/spots/merge", { method: "POST", body: JSON.stringify({ into, from }) }),
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
  adminDeleteFeedback: (id: number) => req<{ ok: boolean }>(`/api/admin/feedback/${id}`, { method: "DELETE" }),
  adminDeleteAllFeedback: () => req<{ ok: boolean; deleted: number }>(`/api/admin/feedback/all`, { method: "DELETE" }),
  adminStarFeedback: (id: number, starred: boolean) =>
    req<{ ok: boolean; starred: boolean }>(`/api/admin/feedback/${id}/star?starred=${starred}`, { method: "POST" }),
  submitFeedback: (text: string, url: string) =>
    req<{ ok: boolean }>("/api/feedback", { method: "POST", body: JSON.stringify({ text, url }) }),
};

export interface AdminFeedback {
  id: number;
  text: string;
  url: string | null;
  at: string | null;
  name: string | null;
  email: string | null;
  starred?: boolean;   // ⭐ Testimonial-Archiv — überlebt „Alle löschen"
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
export interface OverallStats {
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
  id: number;
  label: string | null;
  created_at: string | null;
  last_seen_at: string | null;
  revoked_at: string | null;
  app_version: string | null;
  platform: string | null;
  latest_version: string | null;
  update_available: boolean;
  model: string | null;       // aufgelöstes Modell (aus Part-Number), z. B. "fēnix® 7X Pro"
  model_id: string | null;    // Katalog-/Download-ID -> /api/app/download/<id>
  record_mode: string;        // Aufzeichnungsmodus dieser Uhr (full|lite|gps)
  low_accel: boolean;         // FR55 & Co.: 'full' wird automatisch auf 'lite' gekappt
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
