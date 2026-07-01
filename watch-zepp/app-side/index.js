import { BaseSideService } from "@zeppos/zml/base-side";
import { settingsLib } from "@zos/settings";

// App-Side-Service (läuft in der Zepp-Handy-App): empfängt die Session + Chunks von der Uhr
// (this.request(...) drüben) und lädt sie zu pumpfoil.org hoch — Uhr-Pages dürfen kein freies
// HTTP. Device-Token wird aus einem Pairing-CODE eingelöst (Code kommt aus den App-Settings,
// setting/index.js), danach gecacht.
//
// VERIFY im Simulator: (1) settingsLib.getItem/setItem-Zugriff im App-Side, (2) fetch-Response
// (response.status / response.body als String/JSON). Logik/Endpoints stimmen zum ingest-Vertrag.

const BASE = "https://pumpfoil.org";

function getItem(k) { try { return settingsLib.getItem(k); } catch (e) { return null; } }
function setItem(k, v) { try { settingsLib.setItem(k, v); } catch (e) {} }
function iso(ms) { return new Date(ms).toISOString(); }

// Token holen — aus Cache, sonst Pairing-Code einlösen (POST /api/devices/pair).
async function ensureToken() {
  let token = getItem("deviceToken");
  if (token) return token;
  const code = getItem("pairCode");
  if (!code) throw new Error("not paired");
  const r = await fetch({
    url: BASE + "/api/devices/pair",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: ("" + code).toUpperCase().trim(), label: "Amazfit" }),
  });
  const b = typeof r.body === "string" ? JSON.parse(r.body) : r.body;
  if (!b || !b.device_token) throw new Error("pair failed");
  setItem("deviceToken", b.device_token);
  setItem("pairCode", "");   // Code ist verbraucht
  return b.device_token;
}

async function post(path, body) {
  const token = await ensureToken();
  const r = await fetch({
    url: BASE + path,
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Device-Token": token },
    body: JSON.stringify(body),
  });
  const code = r.status || 0;
  if (code < 200 || code >= 300) throw new Error("http " + code);
  return r;
}

async function handle(req) {
  if (req.method === "CONFIG") {
    // Löst bei Bedarf den Pairing-Code ein; lädt dann die konfigurierten Datenfelder.
    let token;
    try { token = await ensureToken(); } catch (e) { return { paired: false }; }
    try {
      const r = await fetch({
        url: BASE + "/api/devices/config?p=zepp",
        method: "GET",
        headers: { "X-Device-Token": token },
      });
      const b = typeof r.body === "string" ? JSON.parse(r.body) : r.body;
      return {
        paired: true,
        views: b && b.views, offFoilView: b && b.offFoilView,
        autoStart: b && b.autoStart, colorByValue: b && b.colorByValue,
      };
    } catch (e) { return { paired: true }; }   // Token da, aber Config-Load hakt -> Defaults nutzen
  }
  if (req.method === "START") {
    const m = req.meta;
    await post("/api/ingest/session", {
      session_uuid: m.session_uuid, started_at: iso(m.started_at_ms),
      sport: m.sport, gps_hz: m.gps_hz, accel_hz: m.accel_hz, accel_scale: m.accel_scale,
    });
    return { ok: true };
  }
  if (req.method === "CHUNK") {
    await post(`/api/ingest/session/${req.session_uuid}/chunk`, {
      index: req.index, kind: req.kind, encoding: req.encoding,
      t0_ms: req.t0_ms || 0, count: (req.data && req.data.length) || 0, data: req.data,
    });
    return { ok: true, index: req.index };
  }
  if (req.method === "COMPLETE") {
    await post(`/api/ingest/session/${req.session_uuid}/complete`, {
      ended_at: iso(req.ended_at_ms), total_chunks: req.total_chunks,
    });
    return { ok: true };
  }
  return { error: "unknown method" };
}

AppSideService(
  BaseSideService({
    onInit() {},
    onRun() {},
    onDestroy() {},

    onRequest(req, res) {
      handle(req)
        .then((out) => res(null, out))
        .catch((err) => res(null, { error: (err && err.message) || String(err) }));
    },
  })
);
