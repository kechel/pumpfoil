import * as hmUI from "@zos/ui";
import { log as Logger } from "@zos/utils";
import { BasePage } from "@zeppos/zml/base-page";
import { Geolocation, HeartRate } from "@zos/sensor";
import { TITLE, PAGE, F0V, F0L, F1V, F1L, F2V, F2L, STATUS, BUTTON } from "zosLoader:./index.[pf].layout.js";

const logger = Logger.getLogger("pumpfoil");
const GPS_HZ = 1, ACCEL_HZ = 25, ACCEL_SCALE = 2048, GPS_CHUNK = 60;
// DEV: der Zepp-Simulator speist kein echtes GPS ein. true = synthetische Bewegungsspur,
// damit Aufnahme/Felder/Upload im Simulator testbar sind. VOR echter Uhr/Release auf false!
const DEV_FAKE_GPS = true;

const makeUuid = (now) => "zepp-" + now + "-" + Math.floor(Math.random() * 1e9).toString(36);
const pad = (n) => (n < 10 ? "0" + n : "" + n);
const mmss = (sec) => Math.floor(sec / 60) + ":" + pad(Math.floor(sec % 60));
function distM(a, b, c, d) {
  const R = 6371000, r = Math.PI / 180, dLat = (c - a) * r, dLon = (d - b) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
// Labels für Felder, die GPS-only nicht liefert (nur Name + „–").
const LABELS = { 10: "Höhe", 13: "Aufstieg", 11: "Temp", 16: "letzt. Dauer", 17: "letzt. Strecke", 18: "letzt. Ø", 19: "letzt. max", 20: "Läufe" };

// Recorder mit KONFIGURIERTEN Datenfeldern (aus /api/devices/config, wie Garmin/Wear/Apple):
// views = Datenseiten (Feld-IDs), offFoilView = Ruhe-Screen. GPS + Puls; GPS-only zum Server.
Page(
  BasePage({
    state: {
      recording: false, startedAtMs: 0, uuid: "",
      gps: [], dist: 0, max: 0, cur: 0, hr: 0, hrSum: 0, hrN: 0, hrMax: 0, prev: null,
      views: [[1, 3, 4]], offFoil: [12, 17, 16], page: 0,
      timer: null, geo: null, hrSensor: null, w: {},
    },

    build() {
      const w = this.state.w;
      w.title = hmUI.createWidget(hmUI.widget.TEXT, { ...TITLE });
      w.page = hmUI.createWidget(hmUI.widget.TEXT, { ...PAGE });
      w.f = [
        [hmUI.createWidget(hmUI.widget.TEXT, { ...F0V }), hmUI.createWidget(hmUI.widget.TEXT, { ...F0L })],
        [hmUI.createWidget(hmUI.widget.TEXT, { ...F1V }), hmUI.createWidget(hmUI.widget.TEXT, { ...F1L })],
        [hmUI.createWidget(hmUI.widget.TEXT, { ...F2V }), hmUI.createWidget(hmUI.widget.TEXT, { ...F2L })],
      ];
      w.status = hmUI.createWidget(hmUI.widget.TEXT, { ...STATUS });
      // Titel antippen -> nächste Datenseite (bei mehreren views).
      w.title.addEventListener(hmUI.event.CLICK_UP, () => this.cyclePage());
      this.renderButton();
      this.loadConfig();
      this.renderFields();
    },

    loadConfig() {
      this.request({ method: "CONFIG" }).then((r) => {
        if (!r) return;
        if (Array.isArray(r.views) && r.views.length) this.state.views = r.views;
        if (Array.isArray(r.offFoilView) && r.offFoilView.length) this.state.offFoil = r.offFoilView;
        if (!this.state.recording) {
          this.state.w.status.setProperty(hmUI.prop.TEXT, r.paired ? "verbunden ✓" : "Code in der App eintragen");
          this.renderFields();
        }
      }).catch(() => {});
    },

    renderButton() {
      const w = this.state.w;
      if (w.btn) hmUI.deleteWidget(w.btn);
      const rec = this.state.recording;
      w.btn = hmUI.createWidget(hmUI.widget.BUTTON, {
        ...BUTTON, text: rec ? "STOPP" : "START",
        normal_color: rec ? 0xdc2626 : 0x22c55e, press_color: rec ? 0xb91c1c : 0x16a34a,
        click_func: () => this.toggle(),
      });
    },

    activeFields() {
      const s = this.state;
      const src = s.recording ? (s.views[s.page % s.views.length] || []) : s.offFoil;
      return src.filter((id) => id && id !== 0).slice(0, 3);
    },

    cyclePage() {
      const s = this.state;
      if (!s.recording || s.views.length < 2) return;
      s.page = (s.page + 1) % s.views.length;
      this.renderFields();
    },

    renderFields() {
      const s = this.state, w = this.state.w;
      const fields = this.activeFields();
      w.page.setProperty(hmUI.prop.TEXT, s.recording && s.views.length > 1 ? `${(s.page % s.views.length) + 1}/${s.views.length}` : "");
      for (let i = 0; i < 3; i++) {
        const [vw, lw] = w.f[i];
        if (i < fields.length) {
          const [val, lbl] = this.fieldValue(fields[i]);
          vw.setProperty(hmUI.prop.TEXT, val);
          lw.setProperty(hmUI.prop.TEXT, lbl);
        } else {
          vw.setProperty(hmUI.prop.TEXT, "");
          lw.setProperty(hmUI.prop.TEXT, "");
        }
      }
    },

    fieldValue(id) {
      const s = this.state;
      const el = s.recording ? (Date.now() - s.startedAtMs) / 1000 : 0;
      switch (id) {
        case 1: case 5: return [(s.cur * 3.6).toFixed(1), "km/h"];
        case 6: return [((el > 0 ? s.dist / el : 0) * 3.6).toFixed(1), "Ø km/h"];
        case 7: return [(s.max * 3.6).toFixed(1), "max km/h"];
        case 2: return [s.hr ? "" + s.hr : "–", "bpm"];
        case 8: return [s.hrN ? "" + Math.round(s.hrSum / s.hrN) : "–", "Ø bpm"];
        case 9: return [s.hrMax ? "" + s.hrMax : "–", "max bpm"];
        case 3: case 14: return [mmss(el), "Zeit"];
        case 4: case 15: return [s.dist < 1000 ? Math.round(s.dist) + " m" : (s.dist / 1000).toFixed(2) + " km", "Distanz"];
        case 12: { const d = new Date(); return [pad(d.getHours()) + ":" + pad(d.getMinutes()), "Uhr"]; }
        default: return ["–", LABELS[id] || ""];
      }
    },

    toggle() { if (this.state.recording) this.stop(); else this.start(); },

    start() {
      const s = this.state, now = Date.now();
      s.recording = true; s.startedAtMs = now; s.uuid = makeUuid(now);
      s.gps = []; s.dist = 0; s.max = 0; s.cur = 0; s.hr = 0; s.hrSum = 0; s.hrN = 0; s.hrMax = 0; s.prev = null; s.page = 0;
      try { s.geo = new Geolocation(); s.geo.start(); } catch (e) { logger.log("geo err", e); }
      try { s.hrSensor = new HeartRate(); } catch (e) { s.hrSensor = null; }
      this.renderButton();
      s.w.status.setProperty(hmUI.prop.TEXT, "GPS suchen…");
      this.renderFields();
      s.timer = setInterval(() => this.sample(), 1000 / GPS_HZ);
    },

    sample() {
      const s = this.state;
      if (!s.recording || !s.geo) return;
      let status = "V", lat = null, lon = null, speed = 0;
      if (DEV_FAKE_GPS) {
        // Synthetische Spur (Start Bodensee), Speed pendelt ~15–24 km/h.
        s._fi = (s._fi || 0) + 1;
        speed = (19 + 5 * Math.sin(s._fi / 6)) / 3.6;   // m/s
        s._flat = (s._flat != null ? s._flat : 47.66) + (speed / 111320) * 0.7;
        s._flon = (s._flon != null ? s._flon : 9.355) + (speed / (111320 * 0.673)) * 0.4;
        status = "A"; lat = s._flat; lon = s._flon;
      } else {
        try {
          status = s.geo.getStatus ? s.geo.getStatus() : "A";
          lat = s.geo.getLatitude(); lon = s.geo.getLongitude();
          speed = s.geo.getSpeed ? (s.geo.getSpeed() || 0) : 0;
        } catch (e) {}
      }
      let hr = 0;
      try { hr = s.hrSensor ? (s.hrSensor.getCurrent() || 0) : 0; } catch (e) {}
      if (hr) { s.hr = hr; s.hrSum += hr; s.hrN++; if (hr > s.hrMax) s.hrMax = hr; }

      const fix = status === "A" && lat != null && lon != null;
      s.w.status.setProperty(hmUI.prop.TEXT, fix ? "GPS ●" : "GPS suchen…");
      if (fix) {
        s.cur = speed;
        s.gps.push([Date.now() - s.startedAtMs, lat, lon, speed, hr, 0]);
        if (s.prev) s.dist += distM(s.prev[0], s.prev[1], lat, lon);
        s.prev = [lat, lon];
        if (speed > s.max) s.max = speed;
      }
      this.renderFields();
    },

    stop() {
      const s = this.state;
      s.recording = false;
      if (s.timer) { clearInterval(s.timer); s.timer = null; }
      try { s.geo && s.geo.stop && s.geo.stop(); } catch (e) {}
      this.renderButton();
      this.renderFields();
      this.upload();
    },

    upload() {
      const s = this.state;
      if (!s.gps.length) { s.w.status.setProperty(hmUI.prop.TEXT, "nichts aufgezeichnet"); return; }
      s.w.status.setProperty(hmUI.prop.TEXT, "lädt hoch…");
      const meta = { session_uuid: s.uuid, started_at_ms: s.startedAtMs, sport: "pumpfoil", gps_hz: GPS_HZ, accel_hz: ACCEL_HZ, accel_scale: ACCEL_SCALE };
      const chunks = [];
      for (let i = 0; i < s.gps.length; i += GPS_CHUNK) {
        chunks.push({ index: chunks.length, kind: "gps", encoding: "json", data: s.gps.slice(i, i + GPS_CHUNK) });
      }
      const req = (p) => this.request(p).then((r) => { if (r && r.error) throw new Error(r.error); return r; });
      req({ method: "START", meta })
        .then(() => chunks.reduce((p, c) => p.then(() => req({ method: "CHUNK", session_uuid: s.uuid, index: c.index, kind: c.kind, encoding: c.encoding, data: c.data })), Promise.resolve()))
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
