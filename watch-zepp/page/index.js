import * as hmUI from "@zos/ui";
import { log as Logger } from "@zos/utils";
import { LocalStorage } from "@zos/storage";
import { BasePage } from "@zeppos/zml/base-page";
import { Geolocation, HeartRate } from "@zos/sensor";
import { TITLE, PAGE, F0V, F0L, F1V, F1L, F2V, F2L, STATUS, BUTTON } from "zosLoader:./index.[pf].layout.js";

const logger = Logger.getLogger("pumpfoil");
const GPS_HZ = 1, ACCEL_HZ = 25, ACCEL_SCALE = 2048, GPS_CHUNK = 60;
const AUTOSTART_SPEED = 7 / 3.6;   // m/s (~7 km/h) — ab hier zählt Auto-Start
const AUTOSTART_TICKS = 3;         // aufeinanderfolgende Samples über der Schwelle
// DEV: der Zepp-Simulator speist kein echtes GPS ein. true = synthetische Spur (Ruhe: 0, Aufnahme: bewegt).
const DEV_FAKE_GPS = true;

// Persistenz auf der Uhr (device:os.local_storage): Token/Claim + Offline-Queue nicht-gesendeter Sessions.
const store = new LocalStorage();
const getTok = () => store.getItem("deviceToken", "") || "";
const getClaim = () => store.getItem("claimToken", "") || "";
const loadPending = () => { try { return JSON.parse(store.getItem("pending", "[]")) || []; } catch (e) { return []; } };
const savePending = (a) => { try { store.setItem("pending", JSON.stringify(a)); } catch (e) {} };
const removePending = (uuid) => savePending(loadPending().filter((s) => s.uuid !== uuid));

const makeUuid = (now) => "zepp-" + now + "-" + Math.floor(Math.random() * 1e9).toString(36);
const pad = (n) => (n < 10 ? "0" + n : "" + n);
const mmss = (sec) => Math.floor(sec / 60) + ":" + pad(Math.floor(sec % 60));
const fmtDist = (m) => (m < 1000 ? Math.round(m) + " m" : (m / 1000).toFixed(2) + " km");
function distM(a, b, c, d) {
  const R = 6371000, r = Math.PI / 180, dLat = (c - a) * r, dLon = (d - b) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

// Recorder wie Garmin: GPS läuft ab dem Ruhe-Screen, Auto-Start, Aufnahme offline-fähig; Pairing +
// Upload laufen im Hintergrund. Nicht-gesendete Sessions werden gepuffert und später nachgeschickt.
Page(
  BasePage({
    state: {
      recording: false, startedAtMs: 0, uuid: "",
      paired: false, code: "",
      fix: false, autoTicks: 0,
      gps: [], dist: 0, max: 0, cur: 0, hr: 0, hrSum: 0, hrN: 0, hrMax: 0, prev: null,
      last: null,                 // Zusammenfassung der letzten Session {dur,dist,avg,max}
      upStatus: "",               // Upload-Statuszeile (nach Stopp / beim Nachschicken)
      views: [[1, 3, 4]], offFoil: [12, 17, 16], autoStart: false, page: 0,
      timer: null, pollTimer: null, geo: null, hrSensor: null, w: {},
      _fi: 0, _flat: null, _flon: null,
    },

    // this.request + Retry. ok(r) validiert eine "echte" Antwort; leere/verschluckte Antworten
    // (Worker nach Spawn noch nicht dispatch-bereit -> nur Shake-ACK) gelten als retrybar.
    // Echte Server-Fehler ({error:...}) sind fatal.
    call(payload, ok, tries) {
      tries = tries || 8;
      return this.request(payload).then((r) => {
        if (r && r.error) { const e = new Error(r.error); e.fatal = true; throw e; }
        if (ok && !ok(r)) throw new Error("no-ack");
        return r;
      }).catch((err) => {
        if (err && err.fatal) throw err;
        const m = (err && err.message) || "";
        if (tries > 1 && (m.indexOf("shake") >= 0 || m.indexOf("timeout") >= 0 || m === "no-ack")) {
          return new Promise((res) => setTimeout(res, 600)).then(() => this.call(payload, ok, tries - 1));
        }
        throw err;
      });
    },

    build() {
      const s = this.state, w = s.w;
      w.title = hmUI.createWidget(hmUI.widget.TEXT, { ...TITLE });
      w.page = hmUI.createWidget(hmUI.widget.TEXT, { ...PAGE });
      w.f = [
        [hmUI.createWidget(hmUI.widget.TEXT, { ...F0V }), hmUI.createWidget(hmUI.widget.TEXT, { ...F0L })],
        [hmUI.createWidget(hmUI.widget.TEXT, { ...F1V }), hmUI.createWidget(hmUI.widget.TEXT, { ...F1L })],
        [hmUI.createWidget(hmUI.widget.TEXT, { ...F2V }), hmUI.createWidget(hmUI.widget.TEXT, { ...F2L })],
      ];
      w.status = hmUI.createWidget(hmUI.widget.TEXT, { ...STATUS });
      w.title.addEventListener(hmUI.event.CLICK_UP, () => this.onTitle());

      // GPS + Puls sofort starten (Ruhe-Screen zeigt Suche/Fix), Sample-Timer läuft durchgehend.
      try { s.geo = new Geolocation(); s.geo.start(); } catch (e) { logger.log("geo err " + e); }
      try { s.hrSensor = new HeartRate(); } catch (e) { s.hrSensor = null; }
      s.timer = setInterval(() => this.sample(), 1000 / GPS_HZ);

      if (getTok()) s.paired = true;   // optimistisch, bis CONFIG/Revoke Klarheit bringt
      this.renderButton();
      this.renderIdle();
      this.connect();                  // Verbindung + Config + Nachhol-Upload im Hintergrund
    },

    // ---- Verbindung / Pairing (Hintergrund, blockiert nie die Aufnahme) ----
    connect() {
      const s = this.state;
      if (!getTok()) { this.beginPairing(); return; }
      this.call({ method: "CONFIG", token: getTok() }, (r) => r && typeof r.paired !== "undefined")
        .then((r) => {
          if (r.revoked) { store.setItem("deviceToken", ""); s.paired = false; this.beginPairing(); return; }
          if (Array.isArray(r.views) && r.views.length) s.views = r.views;
          if (Array.isArray(r.offFoilView) && r.offFoilView.length) s.offFoil = r.offFoilView;
          if (typeof r.autoStart !== "undefined") s.autoStart = !!r.autoStart;
          s.paired = true;
          this.renderIdle();
          this.flushPending();
        })
        .catch(() => { this.renderIdle(); this.flushPending(); });  // offline: bleibt verbunden, Queue später
    },
    beginPairing() {
      const s = this.state;
      s.paired = false;
      logger.log(">>> PAIR_INIT");
      this.call({ method: "PAIR_INIT" }, (r) => r && r.code)
        .then((r) => { s.code = r.code; store.setItem("claimToken", r.claim_token || ""); this.renderIdle(); this.startPoll(); })
        .catch((err) => { logger.log("PAIR_INIT: " + ((err && err.message) || "?")); this.renderIdle(); });
    },
    startPoll() {
      const s = this.state;
      if (s.pollTimer) clearInterval(s.pollTimer);
      s.pollTimer = setInterval(() => {
        this.call({ method: "PAIR_POLL", claimToken: getClaim() }, (r) => r && typeof r.paired !== "undefined")
          .then((r) => {
            if (r.paired && r.device_token) {
              store.setItem("deviceToken", r.device_token); store.setItem("claimToken", "");
              clearInterval(s.pollTimer); s.pollTimer = null;
              s.paired = true; s.code = "";
              this.connect();
            }
          }).catch(() => {});
      }, 3000);
    },

    onTitle() {
      const s = this.state;
      if (s.recording) { if (s.views.length > 1) { s.page = (s.page + 1) % s.views.length; this.renderRecording(); } }
      else if (!s.paired) this.beginPairing();     // neuen Code holen
      else this.flushPending();                    // manuell nachschicken
    },

    // ---- Rendering ----
    fieldPair(id) { if (!id || id === 0) return ["", ""]; return this.fieldValue(id); },
    renderIdle() {
      const s = this.state, w = s.w;
      w.page.setProperty(hmUI.prop.TEXT, "");
      let slots, line;
      const gps = "GPS " + (s.fix ? "●" : "suche…");
      if (!s.paired && s.code) {
        slots = [[s.code, "Code → pumpfoil.org"], this.fieldPair(s.offFoil[1]), this.fieldPair(s.offFoil[2])];
        line = gps + " · Code eintragen";
      } else {
        slots = [this.fieldPair(s.offFoil[0]), this.fieldPair(s.offFoil[1]), this.fieldPair(s.offFoil[2])];
        const conn = s.paired ? "verbunden ✓" : "verbinde…";
        line = (s.upStatus ? s.upStatus : gps) + " · " + conn;
      }
      for (let i = 0; i < 3; i++) { w.f[i][0].setProperty(hmUI.prop.TEXT, slots[i][0]); w.f[i][1].setProperty(hmUI.prop.TEXT, slots[i][1]); }
      w.status.setProperty(hmUI.prop.TEXT, line);
    },
    renderRecording() {
      const s = this.state, w = s.w;
      const pg = s.page % s.views.length;
      w.page.setProperty(hmUI.prop.TEXT, s.views.length > 1 ? (pg + 1) + "/" + s.views.length : "");
      const fields = (s.views[pg] || []).filter((id) => id && id !== 0).slice(0, 3);
      for (let i = 0; i < 3; i++) {
        if (i < fields.length) { const [v, l] = this.fieldValue(fields[i]); w.f[i][0].setProperty(hmUI.prop.TEXT, v); w.f[i][1].setProperty(hmUI.prop.TEXT, l); }
        else { w.f[i][0].setProperty(hmUI.prop.TEXT, ""); w.f[i][1].setProperty(hmUI.prop.TEXT, ""); }
      }
      w.status.setProperty(hmUI.prop.TEXT, s.fix ? "GPS ● · Aufnahme" : "GPS suche…");
    },
    renderButton() {
      const s = this.state, w = s.w;
      if (w.btn) hmUI.deleteWidget(w.btn);
      const rec = s.recording;
      w.btn = hmUI.createWidget(hmUI.widget.BUTTON, {
        ...BUTTON, text: rec ? "STOPP" : "START",
        normal_color: rec ? 0xdc2626 : 0x22c55e, press_color: rec ? 0xb91c1c : 0x16a34a,
        click_func: () => (rec ? this.stop() : this.start()),
      });
    },
    fieldValue(id) {
      const s = this.state, last = s.last;
      const el = s.recording ? (Date.now() - s.startedAtMs) / 1000 : 0;
      switch (id) {
        case 1: case 5: return [(s.cur * 3.6).toFixed(1), "km/h"];
        case 6: return [(s.recording ? (el > 0 ? s.dist / el * 3.6 : 0) : (last ? last.avg : 0)).toFixed(1), "Ø km/h"];
        case 7: return [(s.recording ? s.max * 3.6 : (last ? last.max : 0)).toFixed(1), "max km/h"];
        case 2: return [s.hr ? "" + s.hr : "–", "bpm"];
        case 8: return [s.hrN ? "" + Math.round(s.hrSum / s.hrN) : "–", "Ø bpm"];
        case 9: return [s.hrMax ? "" + s.hrMax : "–", "max bpm"];
        case 3: case 14: return [mmss(el), "Zeit"];
        case 4: case 15: return [fmtDist(s.dist), "Distanz"];
        case 12: { const d = new Date(); return [pad(d.getHours()) + ":" + pad(d.getMinutes()), "Uhr"]; }
        case 16: return [last ? mmss(last.dur) : "–", "letzt. Dauer"];
        case 17: return [last ? fmtDist(last.dist) : "–", "letzt. Strecke"];
        case 18: return [last ? last.avg.toFixed(1) : "–", "letzt. Ø"];
        case 19: return [last ? last.max.toFixed(1) : "–", "letzt. max"];
        case 20: return ["–", "Läufe"];
        default: return ["–", ""];
      }
    },

    // ---- Sampling (durchgehend: Ruhe = GPS-Warmup + Auto-Start, Aufnahme = aufzeichnen) ----
    sample() {
      const s = this.state;
      let fix = false, lat = null, lon = null, speed = 0;
      if (DEV_FAKE_GPS) {
        fix = true;
        if (s._flat == null) { s._flat = 47.66; s._flon = 9.355; }
        if (s.recording) { s._fi = (s._fi || 0) + 1; speed = (19 + 5 * Math.sin(s._fi / 6)) / 3.6; s._flat += (speed / 111320) * 0.7; s._flon += (speed / (111320 * 0.673)) * 0.4; }
        lat = s._flat; lon = s._flon;
      } else if (s.geo) {
        try {
          const st = s.geo.getStatus ? s.geo.getStatus() : "A";
          lat = s.geo.getLatitude(); lon = s.geo.getLongitude();
          speed = s.geo.getSpeed ? (s.geo.getSpeed() || 0) : 0;
          fix = st === "A" && lat != null && lon != null;
        } catch (e) {}
      }
      let hr = 0;
      try { hr = s.hrSensor ? (s.hrSensor.getCurrent() || 0) : 0; } catch (e) {}
      if (hr) { s.hr = hr; if (s.recording) { s.hrSum += hr; s.hrN++; if (hr > s.hrMax) s.hrMax = hr; } }
      s.fix = fix;
      if (fix) s.cur = speed;

      if (s.recording) {
        if (fix) {
          s.gps.push([Date.now() - s.startedAtMs, lat, lon, speed, hr, 0]);
          if (s.prev) s.dist += distM(s.prev[0], s.prev[1], lat, lon);
          s.prev = [lat, lon];
          if (speed > s.max) s.max = speed;
        }
        this.renderRecording();
      } else {
        if (s.autoStart && fix && speed > AUTOSTART_SPEED) { s.autoTicks++; if (s.autoTicks >= AUTOSTART_TICKS) { this.start(); return; } }
        else s.autoTicks = 0;
        this.renderIdle();
      }
    },

    // ---- Aufnahme ----
    start() {
      const s = this.state, now = Date.now();
      s.recording = true; s.startedAtMs = now; s.uuid = makeUuid(now);
      s.gps = []; s.dist = 0; s.max = 0; s.hrSum = 0; s.hrN = 0; s.hrMax = 0; s.prev = null; s.page = 0; s.autoTicks = 0; s.upStatus = "";
      s._fi = 0;
      this.renderButton();
      this.renderRecording();
    },
    stop() {
      const s = this.state, now = Date.now();
      s.recording = false;
      const el = (now - s.startedAtMs) / 1000;
      s.last = { dur: el, dist: s.dist, avg: el > 0 ? s.dist / el * 3.6 : 0, max: s.max * 3.6 };
      this.renderButton();
      if (s.gps.length) {
        const sess = { uuid: s.uuid, startedAtMs: s.startedAtMs, endedAtMs: now, gps: s.gps.slice() };
        const list = loadPending(); list.push(sess); savePending(list);
        s.upStatus = "";
        this.renderIdle();
        this.flushPending();
      } else {
        s.upStatus = "nichts aufgezeichnet";
        this.renderIdle();
      }
    },

    // ---- Upload / Offline-Queue ----
    uploadSession(sess) {
      const tok = getTok();
      if (!tok) return Promise.reject(new Error("not paired"));
      const meta = { session_uuid: sess.uuid, started_at_ms: sess.startedAtMs, sport: "pumpfoil", gps_hz: GPS_HZ, accel_hz: ACCEL_HZ, accel_scale: ACCEL_SCALE };
      const chunks = [];
      for (let i = 0; i < sess.gps.length; i += GPS_CHUNK) chunks.push({ index: chunks.length, data: sess.gps.slice(i, i + GPS_CHUNK) });
      const req = (p) => this.call(p, (r) => r && r.ok === true);
      return req({ method: "START", token: tok, meta })
        .then(() => chunks.reduce((p, c) => p.then(() => req({ method: "CHUNK", token: tok, session_uuid: sess.uuid, index: c.index, kind: "gps", encoding: "json", data: c.data })), Promise.resolve()))
        .then(() => req({ method: "COMPLETE", token: tok, session_uuid: sess.uuid, ended_at_ms: sess.endedAtMs, total_chunks: chunks.length }));
    },
    flushPending() {
      const s = this.state;
      if (!getTok()) { if (loadPending().length) { s.upStatus = "Upload später"; this.renderIdle(); } return; }
      const list = loadPending();
      if (!list.length) return;
      s.upStatus = "lädt hoch… (" + list.length + ")"; this.renderIdle();
      const step = (i) => {
        if (i >= list.length) { s.upStatus = "hochgeladen ✓"; this.renderIdle(); return; }
        const sess = list[i];
        logger.log(">>> Upload " + sess.uuid + " (" + sess.gps.length + " pts)");
        this.uploadSession(sess)
          .then(() => { logger.log("Upload ok " + sess.uuid); removePending(sess.uuid); step(i + 1); })
          .catch((err) => { logger.log("!!! Upload-Fehler: " + ((err && err.message) || "?")); s.upStatus = "Upload später (" + loadPending().length + ")"; this.renderIdle(); });
      };
      step(0);
    },

    onDestroy() {
      const s = this.state;
      if (s.timer) clearInterval(s.timer);
      if (s.pollTimer) clearInterval(s.pollTimer);
      try { s.geo && s.geo.stop && s.geo.stop(); } catch (e) {}
    },
  })
);
