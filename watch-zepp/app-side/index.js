import { BaseSideService } from "@zeppos/zml/base-side";

// App-Side-Service (Zepp-Handy-App): Bindeglied Uhr <-> pumpfoil.org (Uhr darf kein freies HTTP).
// STATELESS: kein @zos/settings hier (im Side-Service nicht auflösbar -> crasht beim Laden).
// Die Uhr (page) hält Token/Claim in @zos/storage LocalStorage und schickt sie pro Request mit.
//
// PAIRING = REVERSE (wie Garmin/alle Uhren): die Uhr zeigt einen Code (pair-init), der Nutzer
// trägt ihn auf pumpfoil.org/Konto ein, die Uhr pollt (pair-poll) und bekommt das Device-Token.

const BASE = "https://pumpfoil.org";

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
    const r = await fetch({ url: BASE + "/api/devices/pair-init", method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
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
    const r = await fetch({ url: BASE + "/api/devices/config?p=zepp", method: "GET", headers: { "X-Device-Token": req.token } });
    const code = r.status || 0;
    if (code === 401) return { paired: false, revoked: true };
    if (code < 200 || code >= 300) return { paired: true };
    const b = parse(r);
    return { paired: true, views: b && b.views, offFoilView: b && b.offFoilView, autoStart: b && b.autoStart, colorByValue: b && b.colorByValue };
  }

  // --- Ingest-Upload (Token pro Request) ---
  if (req.method === "START") {
    const m = req.meta;
    await authPost(req.token, "/api/ingest/session", { session_uuid: m.session_uuid, started_at: iso(m.started_at_ms), sport: m.sport, gps_hz: m.gps_hz, accel_hz: m.accel_hz, accel_scale: m.accel_scale });
    return { ok: true };
  }
  if (req.method === "CHUNK") {
    await authPost(req.token, `/api/ingest/session/${req.session_uuid}/chunk`, { index: req.index, kind: req.kind, encoding: req.encoding, t0_ms: req.t0_ms || 0, count: (req.data && req.data.length) || 0, data: req.data });
    return { ok: true, index: req.index };
  }
  if (req.method === "COMPLETE") {
    await authPost(req.token, `/api/ingest/session/${req.session_uuid}/complete`, { ended_at: iso(req.ended_at_ms), total_chunks: req.total_chunks });
    return { ok: true };
  }
  return { error: "unknown method" };
}

AppSideService(
  BaseSideService({
    onInit() { console.log("[pumpfoil] app-side onInit"); },
    onRun() { console.log("[pumpfoil] app-side onRun"); },
    onDestroy() {},
    onRequest(req, res) {
      console.log("[pumpfoil] onRequest: " + JSON.stringify(req && req.method));
      handle(req).then((out) => res(null, out)).catch((err) => {
        console.log("[pumpfoil] onRequest ERROR: " + ((err && err.message) || String(err)));
        res(null, { error: (err && err.message) || String(err) });
      });
    },
  })
);
