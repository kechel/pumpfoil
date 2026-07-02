import * as hmUI from "@zos/ui";
import { log as Logger } from "@zos/utils";
import { LocalStorage } from "@zos/storage";
import { BasePage } from "@zeppos/zml/base-page";
import { Geolocation, HeartRate } from "@zos/sensor";
import { TITLE, PAGE, F0V, F0L, F1V, F1L, F2V, F2L, STATUS, BUTTON } from "zosLoader:./index.[pf].layout.js";

const logger = Logger.getLogger("pumpfoil");
// Persistenz auf der Uhr (device:os.local_storage). Token/Claim leben hier, nicht im App-Side
// (dort ist @zos/settings nicht auflösbar). Werden pro Request an den App-Side mitgeschickt.
const store = new LocalStorage();
const getTok = () => store.getItem("deviceToken", "") || "";
const getClaim = () => store.getItem("claimToken", "") || "";
const GPS_HZ = 1, ACCEL_HZ = 25, ACCEL_SCALE = 2048, GPS_CHUNK = 60;
// DEV: der Zepp-Simulator speist kein echtes GPS ein. true = synthetische Bewegungsspur.
// Vor echter Uhr/Release auf false!
const DEV_FAKE_GPS = true;

const makeUuid = (now) => "zepp-" + now + "-" + Math.floor(Math.random() * 1e9).toString(36);
const pad = (n) => (n < 10 ? "0" + n : "" + n);
const mmss = (sec) => Math.floor(sec / 60) + ":" + pad(Math.floor(sec % 60));
function distM(a, b, c, d) {
  const R = 6371000, r = Math.PI / 180, dLat = (c - a) * r, dLon = (d - b) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
const LABELS = { 10: "Höhe", 13: "Aufstieg", 11: "Temp", 16: "letzt. Dauer", 17: "letzt. Strecke", 18: "letzt. Ø", 19: "letzt. max", 20: "Läufe" };

// Recorder mit Reverse-Pairing (Uhr zeigt Code -> pumpfoil.org/Konto -> Uhr pollt Token) und
// KONFIGURIERTEN Datenfeldern (aus /api/devices/config). GPS + Puls; GPS-only zum Server.
Page(
  BasePage({
    state: {
      paired: false, code: "", pollTimer: null,
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
      w.title.addEventListener(hmUI.event.CLICK_UP, () => this.onTitle());
      // Gibt es schon ein Token, optimistisch als "verbunden" starten (kein "Neuer Code"-Flash).
      if (getTok()) { this.state.paired = true; }
      this.renderButton();
      if (!getTok()) { this.beginPairing(); return; }
      this.showReady("lädt…");
      // Config laden. (Ein direkter Request; bei "shake timeout" bleibt es beim Ruhe-Screen,
      // Datenfelder ggf. Default, bis der nächste CONFIG durchgeht.)
      this.request({ method: "CONFIG", token: getTok() }).then((r) => {
        if (r && r.revoked) { store.setItem("deviceToken", ""); this.beginPairing(); return; }
        if (r && Array.isArray(r.views) && r.views.length) this.state.views = r.views;
        if (r && Array.isArray(r.offFoilView) && r.offFoilView.length) this.state.offFoil = r.offFoilView;
        if (r && r.paired) this.showReady("verbunden ✓");
        else this.beginPairing();
      }).catch(() => this.showReady("verbunden ✓"));
    },

    // ---- Pairing (reverse: Uhr zeigt Code) ----
    beginPairing() {
      const s = this.state;
      s.paired = false;
      s.w.status.setProperty(hmUI.prop.TEXT, "verbinde…");
      this.setFields3(["…", ""], null, null);
      this.renderButton();
      logger.log(">>> PAIR_INIT wird gesendet");
      this.request({ method: "PAIR_INIT" }).then((r) => {
        logger.log("<<< PAIR_INIT Antwort: " + JSON.stringify(r));
        if (r && r.error) throw new Error(r.error);
        if (!r || !r.code) throw new Error("keine Antwort");
        s.code = r.code;
        store.setItem("claimToken", r.claim_token || "");
        this.setFields3([r.code, "Code"], ["pumpfoil.org", ""], ["Konto → Uhr verbinden", ""]);
        s.w.status.setProperty(hmUI.prop.TEXT, "warte auf Freigabe…");
        this.startPoll();
      }).catch((err) => {
        logger.log("!!! PAIR_INIT Fehler: " + ((err && err.message) || "?"));
        s.w.status.setProperty(hmUI.prop.TEXT, "Fehler: " + ((err && err.message) || "?"));
      });
    },
    startPoll() {
      const s = this.state;
      if (s.pollTimer) clearInterval(s.pollTimer);
      s.pollTimer = setInterval(() => {
        this.request({ method: "PAIR_POLL", claimToken: getClaim() }).then((r) => {
          if (r && r.paired && r.device_token) {
            store.setItem("deviceToken", r.device_token); store.setItem("claimToken", "");
            clearInterval(s.pollTimer); s.pollTimer = null;
            this.request({ method: "CONFIG", token: getTok() }).then((c) => {
              if (c && Array.isArray(c.views) && c.views.length) s.views = c.views;
              if (c && Array.isArray(c.offFoilView) && c.offFoilView.length) s.offFoil = c.offFoilView;
              this.showReady("verbunden ✓");
            }).catch(() => this.showReady("verbunden ✓"));
          }
        }).catch(() => {});
      }, 3000);
    },

    showReady(msg) {
      const s = this.state;
      s.paired = true; s.code = "";
      this.renderButton();
      this.renderFields();
      s.w.status.setProperty(hmUI.prop.TEXT, msg || "");
    },

    // 3 Slots direkt setzen (val,label) — für Pairing-Anzeige.
    setFields3(a, b, c) {
      const w = this.state.w, arr = [a, b, c];
      for (let i = 0; i < 3; i++) {
        w.f[i][0].setProperty(hmUI.prop.TEXT, (arr[i] && arr[i][0]) || "");
        w.f[i][1].setProperty(hmUI.prop.TEXT, (arr[i] && arr[i][1]) || "");
      }
      w.page.setProperty(hmUI.prop.TEXT, "");
    },

    renderButton() {
      const w = this.state.w, s = this.state;
      if (w.btn) hmUI.deleteWidget(w.btn);
      let text, nc, pc, fn;
      if (!s.paired) { text = "Neuer Code"; nc = 0x2563eb; pc = 0x1d4ed8; fn = () => this.beginPairing(); }
      else if (s.recording) { text = "STOPP"; nc = 0xdc2626; pc = 0xb91c1c; fn = () => this.stop(); }
      else { text = "START"; nc = 0x22c55e; pc = 0x16a34a; fn = () => this.start(); }
      w.btn = hmUI.createWidget(hmUI.widget.BUTTON, { ...BUTTON, text, normal_color: nc, press_color: pc, click_func: fn });
    },

    onTitle() {
      const s = this.state;
      if (s.recording && s.views.length > 1) { s.page = (s.page + 1) % s.views.length; this.renderFields(); }
      else if (s.paired && !s.recording) { store.setItem("deviceToken", ""); store.setItem("claimToken", ""); this.beginPairing(); }
    },

    // ---- Datenfelder ----
    activeFields() {
      const s = this.state;
      return (s.recording ? (s.views[s.page % s.views.length] || []) : s.offFoil).filter((id) => id && id !== 0).slice(0, 3);
    },
    renderFields() {
      const s = this.state, w = this.state.w;
      const fields = this.activeFields();
      w.page.setProperty(hmUI.prop.TEXT, s.recording && s.views.length > 1 ? `${(s.page % s.views.length) + 1}/${s.views.length}` : "");
      for (let i = 0; i < 3; i++) {
        if (i < fields.length) { const [v, l] = this.fieldValue(fields[i]); w.f[i][0].setProperty(hmUI.prop.TEXT, v); w.f[i][1].setProperty(hmUI.prop.TEXT, l); }
        else { w.f[i][0].setProperty(hmUI.prop.TEXT, ""); w.f[i][1].setProperty(hmUI.prop.TEXT, ""); }
      }
    },
    fieldValue(id) {
      const s = this.state, el = s.recording ? (Date.now() - s.startedAtMs) / 1000 : 0;
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

    // ---- Aufnahme ----
    start() {
      const s = this.state, now = Date.now();
      if (!s.paired) return;
      s.recording = true; s.startedAtMs = now; s.uuid = makeUuid(now);
      s.gps = []; s.dist = 0; s.max = 0; s.cur = 0; s.hr = 0; s.hrSum = 0; s.hrN = 0; s.hrMax = 0; s.prev = null; s.page = 0;
      s._fi = 0; s._flat = null; s._flon = null;
      try { s.geo = new Geolocation(); s.geo.start(); } catch (e) { logger.log("geo err", e); }
      try { s.hrSensor = new HeartRate(); } catch (e) { s.hrSensor = null; }
      this.renderButton();
      s.w.status.setProperty(hmUI.prop.TEXT, "GPS suchen…");
      this.renderFields();
      s.timer = setInterval(() => this.sample(), 1000 / GPS_HZ);
    },
    sample() {
      const s = this.state;
      if (!s.recording) return;
      let status = "V", lat = null, lon = null, speed = 0;
      if (DEV_FAKE_GPS) {
        s._fi = (s._fi || 0) + 1;
        speed = (19 + 5 * Math.sin(s._fi / 6)) / 3.6;
        s._flat = (s._flat != null ? s._flat : 47.66) + (speed / 111320) * 0.7;
        s._flon = (s._flon != null ? s._flon : 9.355) + (speed / (111320 * 0.673)) * 0.4;
        status = "A"; lat = s._flat; lon = s._flon;
      } else if (s.geo) {
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
      for (let i = 0; i < s.gps.length; i += GPS_CHUNK) chunks.push({ index: chunks.length, kind: "gps", encoding: "json", data: s.gps.slice(i, i + GPS_CHUNK) });
      const tok = getTok();
      logger.log(">>> Upload: START (" + chunks.length + " chunks, " + s.gps.length + " pts)");
      const req = (p) => this.request(p).then((r) => { if (r && r.error) throw new Error(r.error); return r; });
      req({ method: "START", token: tok, meta })
        .then(() => { logger.log("Upload: START ok, sende chunks"); return chunks.reduce((p, c) => p.then(() => req({ method: "CHUNK", token: tok, session_uuid: s.uuid, index: c.index, kind: c.kind, encoding: c.encoding, data: c.data })), Promise.resolve()); })
        .then(() => { logger.log("Upload: chunks ok, COMPLETE"); return req({ method: "COMPLETE", token: tok, session_uuid: s.uuid, ended_at_ms: Date.now(), total_chunks: chunks.length }); })
        .then(() => { logger.log("Upload: fertig ✓"); s.w.status.setProperty(hmUI.prop.TEXT, "hochgeladen ✓"); })
        .catch((err) => {
          const msg = (err && err.message) || "Fehler";
          logger.log("!!! Upload-Fehler: " + msg);
          s.w.status.setProperty(hmUI.prop.TEXT, "Upload: " + msg);
        });
    },
    onDestroy() {
      const s = this.state;
      if (s.timer) clearInterval(s.timer);
      if (s.pollTimer) clearInterval(s.pollTimer);
      try { s.geo && s.geo.stop && s.geo.stop(); } catch (e) {}
    },
  })
);
