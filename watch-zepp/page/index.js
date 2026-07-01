import * as hmUI from "@zos/ui";
import { log as Logger } from "@zos/utils";
import { BasePage } from "@zeppos/zml/base-page";
import { Geolocation, HeartRate } from "@zos/sensor";
import { TITLE, BIG, UNIT, SUB, STATUS, BUTTON } from "zosLoader:./index.[pf].layout.js";

const logger = Logger.getLogger("pumpfoil");
const GPS_HZ = 1;
const ACCEL_HZ = 25;       // Meta-Feld (Accel selbst noch nicht erfasst -> Server: gps_only)
const ACCEL_SCALE = 2048;
const GPS_CHUNK = 60;      // ~60 GPS-Samples je Chunk

function makeUuid(now) {
  return "zepp-" + now + "-" + Math.floor(Math.random() * 1e9).toString(36);
}

// Dünner Recorder: GPS (1 Hz) + Puls aufzeichnen, puffern; beim Stopp an den App-Side-Service
// übergeben (der lädt zu pumpfoil.org hoch). Roher 25-Hz-Accel (Pump/Gleit) ist bei Zepp OS
// für Dritt-Apps nicht gesichert -> vorerst GPS-only (Server erkennt Läufe/Distanz/Speed).
Page(
  BasePage({
    state: {
      recording: false,
      startedAtMs: 0,
      uuid: "",
      gps: [],           // [t_ms, lat, lon, speed_mps, hr, h_acc]
      timer: null,
      geo: null,
      hr: null,
      w: {},
    },

    build() {
      const w = this.state.w;
      w.title = hmUI.createWidget(hmUI.widget.TEXT, { ...TITLE });
      w.big = hmUI.createWidget(hmUI.widget.TEXT, { ...BIG });
      w.unit = hmUI.createWidget(hmUI.widget.TEXT, { ...UNIT });
      w.sub = hmUI.createWidget(hmUI.widget.TEXT, { ...SUB });
      w.status = hmUI.createWidget(hmUI.widget.TEXT, { ...STATUS });
      w.btn = hmUI.createWidget(hmUI.widget.BUTTON, {
        ...BUTTON,
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
      s.recording = true;
      s.startedAtMs = now;
      s.uuid = makeUuid(now);
      s.gps = [];
      try { s.geo = new Geolocation(); s.geo.start(); } catch (e) { logger.log("geo err", e); }
      try { s.hr = new HeartRate(); } catch (e) { s.hr = null; }
      s.w.btn.setProperty(hmUI.prop.MORE, { text: "STOPP", normal_color: 0xdc2626, press_color: 0xb91c1c });
      s.w.status.setProperty(hmUI.prop.TEXT, "GPS suchen…");
      s.timer = setInterval(() => this.sample(), 1000 / GPS_HZ);
    },

    sample() {
      const s = this.state;
      if (!s.recording || !s.geo) return;
      let status = "V", lat = null, lon = null, speed = 0;
      try {
        status = s.geo.getStatus ? s.geo.getStatus() : "A";
        lat = s.geo.getLatitude();
        lon = s.geo.getLongitude();
        speed = s.geo.getSpeed ? (s.geo.getSpeed() || 0) : 0;
      } catch (e) { /* noch kein Fix */ }
      let hr = 0;
      try { hr = s.hr ? (s.hr.getCurrent() || 0) : 0; } catch (e) {}

      const fix = status === "A" && lat != null && lon != null;
      s.w.status.setProperty(hmUI.prop.TEXT, fix ? "GPS ●" : "GPS suchen…");
      if (fix) {
        const t_ms = Date.now() - s.startedAtMs;
        s.gps.push([t_ms, lat, lon, speed, hr, 0]);
        s.w.big.setProperty(hmUI.prop.TEXT, (speed * 3.6).toFixed(1));
      }
      const dur = Math.floor((Date.now() - s.startedAtMs) / 1000);
      const mm = Math.floor(dur / 60), ss = dur % 60;
      s.w.sub.setProperty(hmUI.prop.TEXT, `${mm}:${ss < 10 ? "0" : ""}${ss}` + (hr ? `  ·  ${hr} bpm` : ""));
    },

    stop() {
      const s = this.state;
      s.recording = false;
      if (s.timer) { clearInterval(s.timer); s.timer = null; }
      try { s.geo && s.geo.stop && s.geo.stop(); } catch (e) {}
      s.w.btn.setProperty(hmUI.prop.MORE, { text: "START", normal_color: 0x22c55e, press_color: 0x16a34a });
      this.upload();
    },

    // Session an den App-Side-Service übergeben (dieser macht die HTTP-Uploads, s. app-side/index.js).
    upload() {
      const s = this.state;
      if (!s.gps.length) { s.w.status.setProperty(hmUI.prop.TEXT, "nichts aufgezeichnet"); return; }
      s.w.status.setProperty(hmUI.prop.TEXT, "lädt hoch…");

      const meta = {
        session_uuid: s.uuid,
        started_at_ms: s.startedAtMs,
        sport: "pumpfoil",
        gps_hz: GPS_HZ, accel_hz: ACCEL_HZ, accel_scale: ACCEL_SCALE,
      };
      const chunks = [];
      for (let i = 0; i < s.gps.length; i += GPS_CHUNK) {
        chunks.push({ index: chunks.length, kind: "gps", encoding: "json", data: s.gps.slice(i, i + GPS_CHUNK) });
      }

      const req = (payload) => this.request(payload).then((r) => {
        if (r && r.error) throw new Error(r.error);
        return r;
      });

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
