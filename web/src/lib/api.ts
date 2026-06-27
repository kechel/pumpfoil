// Schmaler API-Client. JWT im localStorage.

const TOKEN_KEY = "foil_jwt";

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
    ...(opts.headers as Record<string, string>),
  };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(path, { ...opts, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

async function uploadFile<T>(path: string, file: File): Promise<T> {
  const fd = new FormData();
  fd.append("file", file);
  const token = getToken();
  const res = await fetch(path, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

export interface ChatMsg {
  id: number; user_id: number; name: string | null; avatar_url: string | null;
  text: string; created_at: string | null; mine: boolean; hidden: boolean; report_count: number;
  author_new?: boolean;   // Konto jünger als 24 h -> "neu"-Badge
}

export interface ChatRoom {
  scope: string; label: string; url: string; push: boolean;
  unread: number; last_text: string; last_at: string | null;
}

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
}

export interface SessionSummary {
  id: number;
  session_uuid: string;
  sport: string;
  started_at: string;
  ended_at: string | null;
  status: string;
  trim_start_ms?: number | null;
  trim_end_ms?: number | null;
  owned?: boolean;
  owner_name?: string | null;
  owner_avatar_url?: string | null;
  place_name?: string | null;
  caption?: string | null;
  youtube_url?: string | null;
  thumb_url?: string | null;
  photo_count?: number;
  like_count?: number;
  liked?: boolean;
  track_preview?: string | null;
  foil_id?: number | null;
  foil?: { id: number; brand: string; model: string; size: string; span_cm?: number; area_cm2?: number; thickness_mm?: number; thickness_estimated?: boolean; aspect_ratio: number | null; is_default?: boolean } | null;
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
}

export type CommunityRecords = Record<string, RecordSet>;

export interface CommunitySession {
  session_id: number;
  started_at: string | null;
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
  foil?: { id: number; brand: string; model: string; size: string } | null;
}

export interface SessionSocial {
  like_count: number;
  liked: boolean;
  fake_count: number;
  my_fake: boolean;
  inappropriate_count: number;
  my_inappropriate: boolean;
  photos: { id: number; url: string }[];
}

export interface CommunityPhoto {
  kind?: "photo" | "video";
  photo_id?: number;
  url: string | null;
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
  created_at: string | null;
  sessions: number;
}

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
  flagged: number; reported: number; photos: number; photos_blocked: number; likes: number;
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
  deleted: boolean;
  flagged: boolean;
  mod_ok: boolean;
  inappropriate: number;
  fake: number;
  likes: number;
  photos: number;
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
  exportMyData: () => req<Record<string, unknown>>("/api/auth/me/export"),
  spotMap: () => req<{ spot: string; lat: number; lon: number; sessions: number }[]>("/api/community/spot-map"),
  spotWeather: (spot: string) => req<SpotWeather>(`/api/community/spot/weather?spot=${encodeURIComponent(spot)}`),
  chatList: (scope: string, after = 0) => req<ChatMsg[]>(`/api/chat?scope=${encodeURIComponent(scope)}&after=${after}`),
  chatLatest: (scope: string, limit = 30) => req<ChatMsg[]>(`/api/chat?scope=${encodeURIComponent(scope)}&limit=${limit}`),
  chatBefore: (scope: string, before: number, limit = 30) => req<ChatMsg[]>(`/api/chat?scope=${encodeURIComponent(scope)}&before=${before}&limit=${limit}`),
  chatPost: (scope: string, text: string) => req<ChatMsg>(`/api/chat?scope=${encodeURIComponent(scope)}`, { method: "POST", body: JSON.stringify({ text }) }),
  chatReport: (id: number) => req<{ ok: boolean; report_count: number; hidden: boolean }>(`/api/chat/${id}/report`, { method: "POST" }),
  chatHide: (id: number, hidden: boolean) => req<{ ok: boolean; id: number; hidden: boolean }>(`/api/chat/${id}/hide`, { method: "POST", body: JSON.stringify({ hidden }) }),
  chatReported: () => req<(ChatMsg & { scope: string })[]>(`/api/chat/reported`),
  chatSetReadonly: (userId: number, readonly: boolean) => req<{ ok: boolean; user_id: number; chat_readonly: boolean }>(`/api/chat/moderation/readonly`, { method: "POST", body: JSON.stringify({ user_id: userId, readonly }) }),
  chatMarkRead: (scope: string, upTo: number) => req<{ ok: boolean; last_read_id: number }>(`/api/chat/read`, { method: "POST", body: JSON.stringify({ scope, up_to: upTo }) }),
  chatLeave: (scope: string) => req<{ ok: boolean }>(`/api/chat/leave?scope=${encodeURIComponent(scope)}`, { method: "POST" }),
  chatSubscribe: (scope: string, on: boolean) => req<{ ok: boolean; push: boolean }>(`/api/chat/subscribe`, { method: "POST", body: JSON.stringify({ scope, on }) }),
  chatRoomState: (scope: string) => req<{ scope: string; push: boolean; left: boolean; last_read_id: number }>(`/api/chat/state?scope=${encodeURIComponent(scope)}`),
  chatRooms: () => req<ChatRoom[]>(`/api/chat/rooms`),
  chatActive: (hours = 48, limit = 3) => req<ActiveRoom[]>(`/api/chat/active?hours=${hours}&limit=${limit}`),
  foils: (params?: { q?: string; brand?: string }) => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set("q", params.q);
    if (params?.brand) qs.set("brand", params.brand);
    const s = qs.toString();
    return req<Foil[]>(`/api/foils${s ? "?" + s : ""}`);
  },
  foilBrands: () => req<string[]>("/api/foils/brands"),
  foilStats: () => req<{ foil_id: number; brand: string; model: string; size: string; aspect_ratio: number | null; sessions: number; users: number; avg_speed_kmh: number | null; meters_per_pump: number | null; best_distance_m: number | null; avg_pump_hz: number | null }[]>("/api/community/foil-stats"),
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
  uploadAvatar: (file: File) => uploadFile<Profile>("/api/auth/me/avatar", file),
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
  // Reverse-Pairing: Code von der Uhr hier eingeben.
  pairClaim: (code: string) =>
    req<{ ok: boolean; label?: string; already?: boolean }>("/api/devices/pair-claim", {
      method: "POST", body: JSON.stringify({ code, label: "Garmin" }),
    }),
  uploadFit: async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const token = getToken();
    const res = await fetch("/api/sessions/upload-fit", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return (await res.json()) as SessionSummary;
  },
  sessions: (params?: { limit?: number; offset?: number; month?: string; filter?: string }) => {
    const qs = new URLSearchParams();
    if (params?.limit != null) qs.set("limit", String(params.limit));
    if (params?.offset != null) qs.set("offset", String(params.offset));
    if (params?.month) qs.set("month", params.month);
    if (params?.filter) qs.set("filter", params.filter);
    const q = qs.toString();
    return req<SessionSummary[]>(`/api/sessions${q ? "?" + q : ""}`);
  },
  sessionMonths: (filter?: string) =>
    req<{ month: string; count: number }[]>(`/api/sessions/months${filter ? "?filter=" + filter : ""}`),
  stats: (accelOnly = true) => req<OverallStats>(`/api/sessions/stats?accel_only=${accelOnly}`),
  communityRecords: () => req<CommunityRecords>("/api/community/records"),
  communitySpots: () => req<{ mine: string[]; all: string[] }>("/api/community/spots"),
  spotRecords: (spot: string, period = "all") =>
    req<RecordSet>(`/api/community/spot-records?spot=${encodeURIComponent(spot)}&period=${period}`),
  communitySessions: (limit = 20, offset = 0, opts: { name?: string; spot?: string } = {}) => {
    const p = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (opts.name) p.set("name", opts.name);
    if (opts.spot) p.set("spot", opts.spot);
    return req<CommunitySession[]>(`/api/community/sessions?${p}`);
  },
  spotSessions: (spot: string) =>
    req<CommunitySession[]>(`/api/community/spot-sessions?spot=${encodeURIComponent(spot)}`),
  leaders: (period = "all") => req<Leaders>(`/api/community/leaders?period=${period}`),
  communityLatestPhotos: (limit = 5) => req<CommunityPhoto[]>(`/api/community/latest-photos?limit=${limit}`),
  topLiked: (period = "all") => req<CommunitySession[]>(`/api/community/top-liked?period=${period}`),
  toggleLike: (id: number) =>
    req<{ like_count: number; liked: boolean }>(`/api/community/sessions/${id}/like`, { method: "POST" }),
  toggleVote: (id: number, kind: "fake" | "inappropriate") =>
    req<SessionSocial>(`/api/community/sessions/${id}/vote?kind=${kind}`, { method: "POST" }),
  sessionSocial: (id: number) => req<SessionSocial>(`/api/community/sessions/${id}/social`),
  sessionPhotos: (id: number) => req<{ id: number; url: string }[]>(`/api/sessions/${id}/photos`),
  uploadSessionPhoto: (id: number, file: File) =>
    uploadFile<{ id: number; url: string }>(`/api/sessions/${id}/photos`, file),
  deleteSessionPhoto: (id: number, photoId: number) =>
    req(`/api/sessions/${id}/photos/${photoId}`, { method: "DELETE" }),
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
  sessionNeighbors: (id: number) => req<{ older: number | null; newer: number | null }>(`/api/sessions/${id}/neighbors`),
  deleteSession: (id: number) => req<{ ok: boolean }>(`/api/sessions/${id}`, { method: "DELETE" }),
  raw: (id: number) => req<RawData>(`/api/sessions/${id}/raw`),
  labels: (id: number) => req<LabelItem[]>(`/api/sessions/${id}/labels`),
  addLabel: (id: number, t_start_ms: number, t_end_ms: number, label: string) =>
    req<LabelItem>(`/api/sessions/${id}/labels`, {
      method: "POST",
      body: JSON.stringify({ t_start_ms, t_end_ms, label }),
    }),
  deleteLabel: (id: number, labelId: number) =>
    req(`/api/sessions/${id}/labels/${labelId}`, { method: "DELETE" }),
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
  adminFlagged: () => req<AdminSession[]>("/api/admin/flagged"),
  adminSessions: (scope: "all" | "flagged" | "fake" | "deleted" = "all",
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
  adminDismiss: (id: number, kind: "fake" | "inappropriate") =>
    req<{ ok: boolean }>(`/api/admin/sessions/${id}/dismiss?kind=${kind}`, { method: "POST" }),
  adminDeleteSession: (id: number) => req<{ ok: boolean }>(`/api/admin/sessions/${id}/delete`, { method: "POST" }),
  adminRestoreSession: (id: number) => req<{ ok: boolean }>(`/api/admin/sessions/${id}/restore`, { method: "POST" }),
  adminUsers: (q = "", limit = 30, offset = 0, f?: UserFilter) =>
    req<AdminUser[]>(`/api/admin/users?limit=${limit}&offset=${offset}${q ? "&q=" + encodeURIComponent(q) : ""}${userFilterQS(f)}`),
  adminUsersCount: (q = "", f?: UserFilter) =>
    req<{ total: number }>(`/api/admin/users/count?${q ? "q=" + encodeURIComponent(q) : ""}${userFilterQS(f)}`),
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
}

export interface StatRecord {
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
