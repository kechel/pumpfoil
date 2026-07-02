import { BaseSideService } from "@zeppos/zml/base-side";
import { settingsLib } from "@zos/settings";

// App-Side-Service (Zepp-Handy-App): Bindeglied Uhr <-> pumpfoil.org (Uhr darf kein freies HTTP).
// PAIRING = REVERSE (wie Garmin/alle Uhren): die Uhr zeigt einen Code (pair-init), der Nutzer
// trägt ihn auf pumpfoil.org/Konto ein, die Uhr pollt (pair-poll) und bekommt das Device-Token.
// Danach Ingest-Upload (start/chunk/complete) mit X-Device-Token.
//
// VERIFY im Simulator: settingsLib get/setItem im App-Side, fetch-Response (status/body).

const BASE = "https://pumpfoil.org";

function getItem(k) { try { return settingsLib.getItem(k); } catch (e) { return null; } }
function setItem(k, v) { try { settingsLib.setItem(k, v); } catch (e) {} }
function iso(ms) { return new Date(ms).toISOString(); }
function parse(r) { return typeof r.body === "string" ? JSON.parse(r.body) : r.body; }

async function post(path, body) {
  const token = getItem("deviceToken");
  if (!token) throw new Error("not paired");
  const r = await fetch({
    url: BASE + path, method: "POST",
    headers: { "Content-Type": "application/json", "X-Device-Token": token },
    body: JSON.stringify(body),
  });
  const code = r.status || 0;
  if (code < 200 || code >= 300) throw new Error("http " + code);
  return r;
}

async function handle(req) {
  // --- Pairing (reverse) ---
  if (req.method === "PAIR_INIT") {
    const r = await fetch({ url: BASE + "/api/devices/pair-init", method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const b = parse(r);
    if (!b || !b.code) throw new Error("init failed");
    setItem("claimToken", b.claim_token);
    return { code: b.code };
  }
  if (req.method === "PAIR_POLL") {
    const ct = getItem("claimToken");
    if (!ct) return { paired: false };
    const r = await fetch({ url: BASE + "/api/devices/pair-poll?claim_token=" + encodeURIComponent(ct), method: "GET" });
    const b = parse(r);
    if (b && b.device_token) { setItem("deviceToken", b.device_token); setItem("claimToken", ""); return { paired: true }; }
    return { paired: false };
  }
  if (req.method === "UNPAIR") { setItem("deviceToken", ""); setItem("claimToken", ""); return { ok: true }; }

  // --- Config (konfigurierte Datenfelder) ---
  if (req.method === "CONFIG") {
    const token = getItem("deviceToken");
    if (!token) return { paired: false };
    try {
      const r = await fetch({ url: BASE + "/api/devices/config?p=zepp", method: "GET", headers: { "X-Device-Token": token } });
      const b = parse(r);
      return { paired: true, views: b && b.views, offFoilView: b && b.offFoilView, autoStart: b && b.autoStart, colorByValue: b && b.colorByValue };
    } catch (e) { return { paired: true }; }
  }

  // --- Ingest-Upload ---
  if (req.method === "START") {
    const m = req.meta;
    await post("/api/ingest/session", { session_uuid: m.session_uuid, started_at: iso(m.started_at_ms), sport: m.sport, gps_hz: m.gps_hz, accel_hz: m.accel_hz, accel_scale: m.accel_scale });
    return { ok: true };
  }
  if (req.method === "CHUNK") {
    await post(`/api/ingest/session/${req.session_uuid}/chunk`, { index: req.index, kind: req.kind, encoding: req.encoding, t0_ms: req.t0_ms || 0, count: (req.data && req.data.length) || 0, data: req.data });
    return { ok: true, index: req.index };
  }
  if (req.method === "COMPLETE") {
    await post(`/api/ingest/session/${req.session_uuid}/complete`, { ended_at: iso(req.ended_at_ms), total_chunks: req.total_chunks });
    return { ok: true };
  }
  return { error: "unknown method" };
}

AppSideService(
  BaseSideService({
    onInit() {}, onRun() {}, onDestroy() {},
    onRequest(req, res) {
      handle(req).then((out) => res(null, out)).catch((err) => res(null, { error: (err && err.message) || String(err) }));
    },
  })
);
