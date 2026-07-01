import * as hmUI from "@zos/ui";
import { log as Logger } from "@zos/utils";
import { BasePage } from "@zeppos/zml/base-page";
import { Geolocation, HeartRate } from "@zos/sensor";
import { TITLE, BIG, UNIT, DUR, STATS, STATUS, BUTTON } from "zosLoader:./index.[pf].layout.js";

const logger = Logger.getLogger("pumpfoil");
const GPS_HZ = 1;
const ACCEL_HZ = 25;
const ACCEL_SCALE = 2048;
const GPS_CHUNK = 60;

function makeUuid(now) {
  return "zepp-" + now + "-" + Math.floor(Math.random() * 1e9).toString(36);
}
// Haversine (m) — für die Live-Distanz.
function distM(a, b, c, d) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (c - a) * r, dLon = (d - b) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

// Dünner Recorder: GPS (1 Hz) + Puls aufzeichnen, puffern; beim Stopp an den App-Side-Service
// übergeben (der lädt zu pumpfoil.org hoch). GPS-only (Server: detection=gps_only).
Page(
  BasePage({
    state: {
      recording: false, startedAtMs: 0, uuid: "",
      gps: [], dist: 0, maxSpeed: 0, prev: null,
      timer: null, geo: null, hr: null, w: {},
    },

    build() {
      const w = this.state.w;
      w.title = hmUI.createWidget(hmUI.widget.TEXT, { ...TITLE });
      w.big = hmUI.createWidget(hmUI.widget.TEXT, { ...BIG });
      w.unit = hmUI.createWidget(hmUI.widget.TEXT, { ...UNIT });
      w.dur = hmUI.createWidget(hmUI.widget.TEXT, { ...DUR });
      w.stats = hmUI.createWidget(hmUI.widget.TEXT, { ...STATS });
      w.status = hmUI.createWidget(hmUI.widget.TEXT, { ...STATUS });
      this.renderButton();
      // Pairing-Status im Ruhezustand anzeigen.
      this.request({ method: "STATUS" })
        .then((r) => { if (!this.state.recording) w.status.setProperty(hmUI.prop.TEXT, r && r.paired ? "verbunden ✓" : "Code in der App eintragen"); })
        .catch(() => {});
    },

    // Button zuverlässig umschalten: Widget neu erzeugen (setProperty(MORE) greift bei BUTTON nicht robust).
    renderButton() {
      const w = this.state.w;
      if (w.btn) hmUI.deleteWidget(w.btn);
      const rec = this.state.recording;
      w.btn = hmUI.createWidget(hmUI.widget.BUTTON, {
        ...BUTTON,
        text: rec ? "STOPP" : "START",
        normal_color: rec ? 0xdc2626 : 0x22c55e,
        press_color: rec ? 0xb91c1c : 0x16a34a,
        click_func: () => this.toggle(),
      });
    },

    toggle() {
      if (this.state.recording) this.stop();
      else this.start();
    },

    start() {
      const s = this.state;
      const now = Date.now();
      s.recording = true; s.startedAtMs = now; s.uuid = makeUuid(now);
      s.gps = []; s.dist = 0; s.maxSpeed = 0; s.prev = null;
      try { s.geo = new Geolocation(); s.geo.start(); } catch (e) { logger.log("geo err", e); }
      try { s.hr = new HeartRate(); } catch (e) { s.hr = null; }
      this.renderButton();
      s.w.status.setProperty(hmUI.prop.TEXT, "GPS suchen…");
      s.w.big.setProperty(hmUI.prop.TEXT, "0.0");
      s.timer = setInterval(() => this.sample(), 1000 / GPS_HZ);
    },

    sample() {
      const s = this.state;
      if (!s.recording || !s.geo) return;
      let status = "V", lat = null, lon = null, speed = 0;
      try {
        status = s.geo.getStatus ? s.geo.getStatus() : "A";
        lat = s.geo.getLatitude(); lon = s.geo.getLongitude();
        speed = s.geo.getSpeed ? (s.geo.getSpeed() || 0) : 0;
      } catch (e) {}
      let hr = 0;
      try { hr = s.hr ? (s.hr.getCurrent() || 0) : 0; } catch (e) {}

      const fix = status === "A" && lat != null && lon != null;
      s.w.status.setProperty(hmUI.prop.TEXT, fix ? "GPS ●" : "GPS suchen…");
      if (fix) {
        const t_ms = Date.now() - s.startedAtMs;
        s.gps.push([t_ms, lat, lon, speed, hr, 0]);
        if (s.prev) s.dist += distM(s.prev[0], s.prev[1], lat, lon);
        s.prev = [lat, lon];
        if (speed > s.maxSpeed) s.maxSpeed = speed;
        s.w.big.setProperty(hmUI.prop.TEXT, (speed * 3.6).toFixed(1));
        const km = s.dist < 1000 ? `${Math.round(s.dist)} m` : `${(s.dist / 1000).toFixed(2)} km`;
        s.w.stats.setProperty(hmUI.prop.TEXT, `${km} · max ${(s.maxSpeed * 3.6).toFixed(0)}` + (hr ? ` · ${hr} bpm` : ""));
      }
      const dur = Math.floor((Date.now() - s.startedAtMs) / 1000);
      const mm = Math.floor(dur / 60), ss = dur % 60;
      s.w.dur.setProperty(hmUI.prop.TEXT, `${mm}:${ss < 10 ? "0" : ""}${ss}`);
    },

    stop() {
      const s = this.state;
      s.recording = false;
      if (s.timer) { clearInterval(s.timer); s.timer = null; }
      try { s.geo && s.geo.stop && s.geo.stop(); } catch (e) {}
      this.renderButton();
      this.upload();
    },

    // Session an den App-Side-Service übergeben (macht die HTTP-Uploads).
    upload() {
      const s = this.state;
      if (!s.gps.length) { s.w.status.setProperty(hmUI.prop.TEXT, "nichts aufgezeichnet"); return; }
      s.w.status.setProperty(hmUI.prop.TEXT, "lädt hoch…");

      const meta = {
        session_uuid: s.uuid, started_at_ms: s.startedAtMs, sport: "pumpfoil",
        gps_hz: GPS_HZ, accel_hz: ACCEL_HZ, accel_scale: ACCEL_SCALE,
      };
      const chunks = [];
      for (let i = 0; i < s.gps.length; i += GPS_CHUNK) {
        chunks.push({ index: chunks.length, kind: "gps", encoding: "json", data: s.gps.slice(i, i + GPS_CHUNK) });
      }
      const req = (p) => this.request(p).then((r) => { if (r && r.error) throw new Error(r.error); return r; });

      req({ method: "START", meta })
        .then(() => chunks.reduce(
          (p, c) => p.then(() => req({ method: "CHUNK", session_uuid: s.uuid, index: c.index, kind: c.kind, encoding: c.encoding, data: c.data })),
          Promise.resolve(),
        ))
        .then(() => req({ method: "COMPLETE", session_uuid: s.uuid, ended_at_ms: Date.now(), total_chunks: chunks.length }))
        .then(() => s.w.status.setProperty(hmUI.prop.TEXT, "hochgeladen ✓"))
        .catch((err) => {
          const msg = (err && err.message) || "Fehler";
          s.w.status.setProperty(hmUI.prop.TEXT, msg.indexOf("pair") >= 0 ? "nicht verbunden — Code in der App" : "Upload-Fehler");
        });
    },

    onDestroy() {
      const s = this.state;
      if (s.timer) clearInterval(s.timer);
      try { s.geo && s.geo.stop && s.geo.stop(); } catch (e) {}
    },
  })
);
