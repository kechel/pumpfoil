import { BaseSideService } from "@zeppos/zml/base-side";

// App-Side-Service (Zepp-Handy-App): Bindeglied Uhr <-> pumpfoil.org (Uhr darf kein freies HTTP).
// STATELESS: kein @zos/settings hier (im Side-Service nicht auflösbar -> crasht beim Laden).
// Die Uhr (page) hält Token/Claim in @zos/storage LocalStorage und schickt sie pro Request mit.
//
// PAIRING = REVERSE (wie Garmin/alle Uhren): die Uhr zeigt einen Code (pair-init), der Nutzer
// trägt ihn auf pumpfoil.org/Konto ein, die Uhr pollt (pair-poll) und bekommt das Device-Token.

const BASE = "https://pumpfoil.org";

// Device -> phone and phone -> server are two independent transports.  The old implementation
// awaited the server response before acknowledging every BLE chunk, which serialized hundreds of
// BLE + HTTP round trips for a long session.  Keep a small bounded queue on the phone instead:
// acknowledge a chunk once it has entered this queue, upload several chunks in parallel using the
// phone network, and only acknowledge COMPLETE after every server request has succeeded.
//
// The watch deliberately keeps its persistent copy until COMPLETE succeeds.  If the Side Service,
// Zepp or the network disappears, the attempt fails and the whole idempotent session is retried.
const UPLOAD_PARALLEL = 4;
const UPLOAD_BUFFER = 16;
const uploadSessions = Object.create(null);

function newUploadState(uuid) {
  return uploadSessions[uuid] = {
    uuid, queue: [], running: 0, failure: null, capacityWaiters: [], drainWaiters: [],
    accepted: 0, uploaded: 0, maxOutstanding: 0, startedAt: Date.now(),
  };
}

function outstanding(s) { return s.queue.length + s.running; }

function wakeUploadWaiters(s) {
  if (outstanding(s) < UPLOAD_BUFFER && s.capacityWaiters.length) {
    const waiters = s.capacityWaiters.splice(0);
    waiters.forEach((w) => w());
  }
  if (outstanding(s) === 0 && s.drainWaiters.length) {
    const waiters = s.drainWaiters.splice(0);
    waiters.forEach(({ resolve, reject }) => s.failure ? reject(s.failure) : resolve());
  }
}

function pumpUpload(s) {
  while (s.running < UPLOAD_PARALLEL && s.queue.length) {
    const item = s.queue.shift();
    s.running++;
    authPost(item.token, `/api/ingest/session/${s.uuid}/chunk`, item.body)
      .then(() => { s.uploaded++; })
      .catch((err) => { if (!s.failure) s.failure = err; })
      .then(() => {
        s.running--;
        wakeUploadWaiters(s);
        pumpUpload(s);
      });
  }
  wakeUploadWaiters(s);
}

function enqueueUpload(req) {
  const s = uploadSessions[req.session_uuid] || newUploadState(req.session_uuid);
  if (s.failure) return Promise.reject(s.failure);
  s.queue.push({
    token: req.token,
    body: { index: req.index, kind: req.kind, encoding: req.encoding,
      t0_ms: req.t0_ms || 0,
      count: req.count != null ? req.count : ((req.data && req.data.length) || 0),
      data: req.data },
  });
  s.accepted++;
  s.maxOutstanding = Math.max(s.maxOutstanding, outstanding(s));
  pumpUpload(s);
  if (outstanding(s) < UPLOAD_BUFFER) return Promise.resolve();
  // Back-pressure: do not let a fast BLE transfer retain an unbounded number of base64 payloads.
  return new Promise((resolve) => s.capacityWaiters.push(resolve));
}

function drainUpload(uuid) {
  const s = uploadSessions[uuid];
  if (!s) return Promise.resolve();
  if (outstanding(s) === 0) return s.failure ? Promise.reject(s.failure) : Promise.resolve();
  return new Promise((resolve, reject) => s.drainWaiters.push({ resolve, reject }));
}

async function resetUpload(uuid) {
  const previous = uploadSessions[uuid];
  if (previous) {
    try { await drainUpload(uuid); } catch (e) {}
    delete uploadSessions[uuid];
  }
  newUploadState(uuid);
}

function iso(ms) { return new Date(ms).toISOString(); }
function parse(r) { return typeof r.body === "string" ? JSON.parse(r.body) : r.body; }

async function authPost(token, path, body) {
  if (!token) throw new Error("not paired");
  console.log("[pumpfoil] POST " + path + " tok=" + (token ? token.slice(0, 6) : "-"));
  const r = await fetch({
    url: BASE + path, method: "POST",
    headers: { "Content-Type": "application/json", "X-Device-Token": token },
    body: JSON.stringify(body),
  });
  const code = r.status || 0;
  console.log("[pumpfoil] POST " + path + " -> status=" + code + " body=" + (typeof r.body === "string" ? r.body.slice(0, 120) : JSON.stringify(r.body).slice(0, 120)));
  if (code < 200 || code >= 300) throw new Error("http " + code);
  return r;
}

async function handle(req) {
  console.log("[pumpfoil] handle: " + (req && req.method));
  // --- Pairing (reverse) ---
  if (req.method === "PAIR_INIT") {
    console.log("[pumpfoil] PAIR_INIT -> fetch " + BASE + "/api/devices/pair-init");
    const r = await fetch({ url: BASE + "/api/devices/pair-init", method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: (req.model || "Amazfit").slice(0, 60), platform: "zepp" }) });
    console.log("[pumpfoil] PAIR_INIT fetch status=" + (r && r.status));
    const b = parse(r);
    if (!b || !b.code) throw new Error("init failed");
    return { code: b.code, claim_token: b.claim_token };
  }
  if (req.method === "PAIR_POLL") {
    if (!req.claimToken) return { paired: false };
    const r = await fetch({ url: BASE + "/api/devices/pair-poll?claim_token=" + encodeURIComponent(req.claimToken), method: "GET" });
    const b = parse(r);
    if (b && b.device_token) return { paired: true, device_token: b.device_token };
    return { paired: false };
  }

  // --- Config (konfigurierte Datenfelder) ---
  if (req.method === "CONFIG") {
    if (!req.token) return { paired: false };
    // Die Uhr darf kein HTTP -- alles laeuft hier durch. Diese Whitelist war der Grund, warum die
    // Uhr Sprache, Update-Hinweis und Layouts nie sah: sie kamen vom Server, wurden aber hier
    // weggefiltert. `v` (gemeldete App-Version) und `lay` (Uhr will Layouts) gehen jetzt mit raus.
    const qv = req.version ? "&v=" + encodeURIComponent(req.version) : "";
    const ql = req.wantLayouts ? "&lay=1" : "";
    // Modellname als `pn` — dieselbe Stelle, an der Garmin seine Part-Number meldet. Der Server
    // ersetzt damit das generische "Amazfit" durch die echte Uhr (s. devices.py).
    const qm = req.model ? "&pn=" + encodeURIComponent(req.model) : "";
    const r = await fetch({ url: BASE + "/api/devices/config?p=zepp" + qv + ql + qm, method: "GET", headers: { "X-Device-Token": req.token } });
    const code = r.status || 0;
    if (code === 401) return { paired: false, revoked: true };
    if (code < 200 || code >= 300) return { paired: true };
    const b = parse(r);
    return { paired: true, views: b && b.views, offFoilView: b && b.offFoilView, autoStart: b && b.autoStart, colorByValue: b && b.colorByValue,
      foils: b && b.foils, alarmEnabled: b && b.alarmEnabled, alarmDefault: b && b.alarmDefault, speedHigh: b && b.speedHigh, speedLow: b && b.speedLow,
      // Neu durchgelassen: Profil-Sprache (i18n), Update-Hinweis, Pausen-Screen und das
      // Layout-Paket (gemischte Seiten-Saetze + Definitionen + Voreinstellung des Schalters).
      language: b && b.language, latestVersion: b && b.latestVersion, pauseView: b && b.pauseView,
      layoutsOn: b && b.layoutsOn, layouts: b && b.layouts, pages: b && b.pages,
      offFoilPages: b && b.offFoilPages, pausePages: b && b.pausePages, browseAll: b && b.browseAll };
  }

  // --- TEST: winziger Trigger, App-Side lädt Mini-Session komplett selbst hoch (kein Daten-Transfer) ---
  if (req.method === "TESTUPLOAD") {
    const TOK = "uz2b13aF54204SnQMRF_ZoINBkDTNE_j";
    const now = Date.now();
    const uuid = "zepp-mini-" + now;
    console.log("[pumpfoil] TESTUPLOAD " + uuid);
    const s = await authPost(TOK, "/api/ingest/session", { session_uuid: uuid, started_at: iso(now - 60000), sport: "pumpfoil", gps_hz: 1, accel_hz: 0, accel_scale: 0 });
    await authPost(TOK, `/api/ingest/session/${uuid}/chunk`, { index: 0, kind: "gps", encoding: "json", t0_ms: 0, count: 3, data: [[0, 47.66, 9.355, 5, 0, 0], [1000, 47.6601, 9.3551, 5, 0, 0], [2000, 47.6602, 9.3552, 5, 0, 0]] });
    await authPost(TOK, `/api/ingest/session/${uuid}/complete`, { ended_at: iso(now), total_chunks: 1 });
    return { ok: true, http: s.status, uuid: uuid };
  }

  // --- Ingest-Upload (Token pro Request) ---
  if (req.method === "START") {
    const m = req.meta;
    await resetUpload(m.session_uuid);
    // Diese Whitelist ist die einzige Stelle, die den Body baut -> neue Felder muessen hier
    // durchgelassen werden, sonst kommen sie beim Server nie an (app_version = App-Version
    // der Uhr-App, foil_id = gewaehltes Foil).
    const body = { session_uuid: m.session_uuid, started_at: iso(m.started_at_ms), sport: m.sport, gps_hz: m.gps_hz, accel_hz: m.accel_hz, accel_scale: m.accel_scale };
    if (m.app_version) body.app_version = m.app_version;
    if (m.foil_id != null) body.foil_id = m.foil_id;
    if (m.expected_chunks != null) body.expected_chunks = m.expected_chunks;
    const r = await authPost(req.token, "/api/ingest/session", body);
    const parsed = parse(r) || {};
    return { ok: true, http: r.status, received_chunks: parsed.received_chunks || [] };
  }
  if (req.method === "CHUNK") {
    await enqueueUpload(req);
    return { ok: true, index: req.index, queued: true };
  }
  if (req.method === "COMPLETE") {
    try {
      await drainUpload(req.session_uuid);
      const stats = uploadSessions[req.session_uuid];
      const r = await authPost(req.token, `/api/ingest/session/${req.session_uuid}/complete`, { ended_at: iso(req.ended_at_ms), total_chunks: req.total_chunks });
      if (stats) console.log("[pumpfoil] upload pipeline complete chunks=" + stats.accepted
        + " max_buffer=" + stats.maxOutstanding + " ms=" + (Date.now() - stats.startedAt));
      delete uploadSessions[req.session_uuid];
      return { ok: true, http: r.status };
    } catch (err) {
      delete uploadSessions[req.session_uuid];
      throw err;
    }
  }
  return { error: "unknown method" };
}

AppSideService(
  BaseSideService({
    onInit() { console.log("[pumpfoil] app-side onInit"); },
    onRun() { console.log("[pumpfoil] app-side onRun"); },
    onDestroy() {},
    onRequest(req, res) {
      // Never stringify upload payloads here: acceleration chunks contain large base64 strings and
      // logging them needlessly costs CPU and memory in the Zepp phone process.
      console.log("[pumpfoil] onRequest method=" + (req && req.method));
      handle(req).then((out) => {
        console.log("[pumpfoil] -> res " + JSON.stringify(out));
        res(null, out);
      }).catch((err) => {
        console.log("[pumpfoil] onRequest ERROR: " + ((err && err.message) || String(err)));
        res(null, { error: (err && err.message) || String(err) });
      });
    },
  })
);
