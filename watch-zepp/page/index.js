import * as hmUI from "@zos/ui";
import { px } from "@zos/utils";
import { LocalStorage } from "@zos/storage";
import { getDeviceInfo } from "@zos/device";
import { onGesture, offGesture, GESTURE_UP, GESTURE_DOWN } from "@zos/interaction";
import { getConnectStatus } from "@zos/ble";
import { BasePage } from "@zeppos/zml/base-page";
import { Geolocation, HeartRate } from "@zos/sensor";
import { TITLE, PAGE, F0V, F0L, F1V, F1L, F2V, F2L, STATUS, BUTTON } from "zosLoader:./index.[pf].layout.js";

const GPS_HZ = 1, ACCEL_HZ = 25, ACCEL_SCALE = 2048;
// Kleine CHUNKs: 10 Punkte/Nachricht (~500 B) statt 60 (~3,3 KB) -> passt zuverlässig durch BLE
// (weniger Frame-Splitting; Sim-Reassemblierung + echte Hardware robuster).
const GPS_CHUNK = 10;
const AUTOSTART_SPEED = 7 / 3.6, AUTOSTART_TICKS = 3;
const DEV_FAKE_GPS = false;  // true = synthetische GPS-Spur (nur Simulator-UI-Demo; echte Uhr: false)
const APP_VERSION = "1.0.0";
const DW = (() => { try { return getDeviceInfo().width; } catch (e) { return 480; } })();
const DH = (() => { try { return getDeviceInfo().height; } catch (e) { return 480; } })();
// Marken-Palette (docs/BRAND.md): Cyan = primäre Aktion, Rot = Stop/destruktiv, Ink = dunkler Text auf Cyan.
const CYAN = 0x22d3ee, CYAN_P = 0x0891b2, INK = 0x083344, RED = 0xdc2626, RED_P = 0xb91c1c, WHITE = 0xffffff;

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
// Handy/Companion per BLE verbunden? (Uhr hat kein eigenes Internet.) Fallback true, falls API fehlt.
const bleOk = () => { try { return getConnectStatus() !== false; } catch (e) { return true; } };

// Recorder wie Garmin. Wischbare Seiten:
//   Ruhe:     0 Daten(+START) · 1 Verbindung/Code · 2 Upload-Queue
//   Aufnahme: 0..N-1 Datenseiten (kein Button) · N Stopp-Screen(+STOPP)
// GPS ab Ruhe-Screen, Auto-Start, Pairing+Upload im Hintergrund. Aufnahme wird laufend persistent
// gepuffert (Absturz-sicher); nach Stopp Summary mit Upload-Fortschritt; offline -> später senden.
Page(
  BasePage({
    state: {
      screen: "idle", idlePage: 0, page: 0,
      recording: false, startedAtMs: 0, uuid: "",
      paired: false, code: "",
      fix: false, autoTicks: 0,
      gps: [], dist: 0, max: 0, cur: 0, hr: 0, hrSum: 0, hrN: 0, hrMax: 0, prev: null,
      last: null, upStatus: "", upPct: 0,
      views: [[1, 3, 4]], offFoil: [12, 17, 16], autoStart: false,
      timer: null, pollTimer: null, hbTimer: null, geo: null, hrSensor: null, w: {},
      _fi: 0, _flat: null, _flon: null,
    },

    // WICHTIG: zml macht pro Request einen BLE-Shake; PARALLELE Requests würgen sich gegenseitig ab
    // (undefined/shake timeout). Daher ALLE Requests hier serialisieren — immer nur EINER gleichzeitig
    // (FIFO), KEIN Retry. So kollidiert z.B. der Heartbeat-CONFIG nie mit einem laufenden Upload.
    reqQ(payload) {
      const prev = this._chain || Promise.resolve();
      const p = prev.catch(() => {}).then(() => this.request(payload));
      this._chain = p.catch(() => {});
      return p;
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
      w.ver = hmUI.createWidget(hmUI.widget.TEXT, { x: 0, y: TITLE.y + TITLE.h, w: DW, h: px(16), color: 0x64748b, text_size: px(14), align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V, text: "v" + APP_VERSION });

      onGesture({
        callback: (e) => {
          if (e !== GESTURE_UP && e !== GESTURE_DOWN) return false;
          const dir = e === GESTURE_UP ? 1 : -1;
          if (s.recording) { const n = s.views.length + 1; s.page = (s.page + dir + n) % n; this.applyButton(); this.renderRecording(); return true; }
          if (s.screen === "idle") {
            s.idlePage = (s.idlePage + dir + 3) % 3;
            this.applyButton(); this.renderIdle();
            // Beim Verlassen der Verbindungs-Seite den Poll stoppen. Start passiert NUR per "Neuer Code".
            if (s.idlePage !== 1 && s.pollTimer) { clearTimeout(s.pollTimer); s.pollTimer = null; }
            return true;
          }
          return false;
        },
      });

      this.recoverActive();   // unbeendete Aufnahme aus letztem Lauf in die Queue übernehmen

      try { s.geo = new Geolocation(); s.geo.start(); } catch (e) {}
      try { s.hrSensor = new HeartRate(); } catch (e) { s.hrSensor = null; }
      s.timer = setInterval(() => this.sample(), 1000 / GPS_HZ);
      s.hbTimer = setInterval(() => this.heartbeat(), 20000);

      if (getTok()) s.paired = true;
      this.applyButton();
      this.renderIdle();
      this.connect();
    },

    // ---- Verbindung / Pairing (Hintergrund) ----
    connect() {
      const s = this.state;
      if (!bleOk()) { this.rerender(); return; }
      if (!getTok()) { this.rerender(); return; }   // kein Auto-Pairing — nur per "Neuer Code"
      this.reqQ({ method: "CONFIG", token: getTok() }).then((r) => {
        if (r && r.revoked) { store.setItem("deviceToken", ""); s.paired = false; this.beginPairing(); return; }
        if (r && Array.isArray(r.views) && r.views.length) s.views = r.views;
        if (r && Array.isArray(r.offFoilView) && r.offFoilView.length) s.offFoil = r.offFoilView;
        if (r && typeof r.autoStart !== "undefined") s.autoStart = !!r.autoStart;
        s.paired = true;
        this.applyButton(); this.rerender();
        this.flushPending();
      }).catch(() => { this.applyButton(); this.rerender(); this.flushPending(); });
    },
    // Pairing/Poll: DIREKTER this.request (ein Request pro Aufruf). Kein call()-Retry — der würde
    // Folge-Requests feuern, die im Sim keine Antwort bekommen; der einzelne Request lief zuverlässig.
    beginPairing() {
      const s = this.state;
      s.paired = false;
      this.reqQ({ method: "PAIR_INIT" }).then((r) => {
        if (!r || !r.code) { this.rerender(); return; }
        s.code = r.code; store.setItem("claimToken", r.claim_token || ""); this.applyButton(); this.rerender(); this.startPoll();
      }).catch(() => this.rerender());
    },
    startPoll() {
      const s = this.state;
      if (s.pollTimer) { clearTimeout(s.pollTimer); s.pollTimer = null; }
      const tick = () => {
        // Nur pollen, solange die Verbindungs-Seite offen ist (nicht gepairt, keine Aufnahme).
        if (s.paired || s.recording || s.idlePage !== 1) { s.pollTimer = null; return; }
        this.reqQ({ method: "PAIR_POLL", claimToken: getClaim() }).then((r) => {
          if (r && r.paired && r.device_token) {
            store.setItem("deviceToken", r.device_token); store.setItem("claimToken", "");
            s.pollTimer = null; s.paired = true; s.code = "";
            this.connect();
            return;
          }
          s.pollTimer = setTimeout(tick, 3000);
        }).catch(() => { s.pollTimer = setTimeout(tick, 3000); });
      };
      s.pollTimer = setTimeout(tick, 500);
    },
    // Hintergrund-Reconnect: alle 20s (außer Aufnahme) neu verbinden/Config holen + Queue senden.
    heartbeat() {
      const s = this.state;
      if (s.recording) return;
      if (!bleOk()) { this.rerender(); return; }
      if (getTok()) this.connect();
      // Kein Auto-Pairing im Hintergrund — Pairing/Poll passiert nur auf der Verbindungs-Seite.
    },

    // ---- Fortschrittsbalken (oben) ----
    showBar(pct) {
      const w = this.state.w;
      if (!w.barBg) w.barBg = hmUI.createWidget(hmUI.widget.FILL_RECT, { x: 0, y: px(2), w: DW, h: px(6), color: 0x334155 });
      const width = Math.max(px(2), Math.round(DW * Math.min(100, Math.max(0, pct)) / 100));
      if (!w.barFill) w.barFill = hmUI.createWidget(hmUI.widget.FILL_RECT, { x: 0, y: px(2), w: width, h: px(6), color: 0x22d3ee });
      else w.barFill.setProperty(hmUI.prop.MORE, { x: 0, y: px(2), w: width, h: px(6), color: 0x22d3ee });
    },
    hideBar() {
      const w = this.state.w;
      if (w.barFill) { hmUI.deleteWidget(w.barFill); w.barFill = null; }
      if (w.barBg) { hmUI.deleteWidget(w.barBg); w.barBg = null; }
    },

    // ---- Button pro Screen/Seite ----
    setButton(text, nc, pc, ink, fn) { const w = this.state.w; if (w.btn) hmUI.deleteWidget(w.btn); w.btn = hmUI.createWidget(hmUI.widget.BUTTON, { ...BUTTON, text, normal_color: nc, press_color: pc, color: ink, click_func: fn }); },
    hideButton() { const w = this.state.w; if (w.btn) { hmUI.deleteWidget(w.btn); w.btn = null; } },
    applyButton() {
      const s = this.state;
      if (s.recording) {
        if (s.page === s.views.length) this.setButton("STOPP", RED, RED_P, WHITE, () => this.stop());
        else this.hideButton();
      } else if (s.screen === "summary") {
        this.setButton("Fertig", CYAN, CYAN_P, INK, () => this.done());
      } else if (s.idlePage === 0) {
        this.setButton("START", CYAN, CYAN_P, INK, () => this.start());
      } else if (s.idlePage === 1) {
        if (s.paired) this.setButton("Neu verbinden", CYAN, CYAN_P, INK, () => this.repair());
        else this.setButton("Neuer Code", CYAN, CYAN_P, INK, () => this.beginPairing());
      } else if (s.idlePage === 2 && loadPending().length && getTok()) {
        this.setButton("Jetzt senden", CYAN, CYAN_P, INK, () => this.flushPending());
      } else this.hideButton();
    },

    // ---- Rendering ----
    rerender() { const s = this.state; if (s.recording) this.renderRecording(); else if (s.screen === "summary") this.renderSummary(); else this.renderIdle(); },
    fieldPair(id) { if (!id || id === 0) return ["", ""]; return this.fieldValue(id); },
    setSlots(a, b, c) { this.hideBig(); const w = this.state.w, arr = [a, b, c]; for (let i = 0; i < 3; i++) { w.f[i][0].setProperty(hmUI.prop.TEXT, arr[i][0]); w.f[i][1].setProperty(hmUI.prop.TEXT, arr[i][1]); } },
    // Großes, zentriertes Einzelfeld (wenn eine Datenseite nur 1 Feld hat).
    showBig(v, l) {
      const w = this.state.w;
      if (!w.bigV) w.bigV = hmUI.createWidget(hmUI.widget.TEXT, { x: 0, y: Math.round(DH * 0.30), w: DW, h: Math.round(DH * 0.26), color: 0x22d3ee, text_size: Math.round(DH * 0.19), align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V, text: "" });
      if (!w.bigL) w.bigL = hmUI.createWidget(hmUI.widget.TEXT, { x: 0, y: Math.round(DH * 0.57), w: DW, h: Math.round(DH * 0.08), color: 0x9aa4b2, text_size: Math.round(DH * 0.045), align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V, text: "" });
      w.bigV.setProperty(hmUI.prop.TEXT, v); w.bigL.setProperty(hmUI.prop.TEXT, l);
    },
    hideBig() { const w = this.state.w; if (w.bigV) { hmUI.deleteWidget(w.bigV); w.bigV = null; } if (w.bigL) { hmUI.deleteWidget(w.bigL); w.bigL = null; } },
    // Datenseite rendern: 1 Feld -> groß & mittig; sonst bis zu 3 Slots.
    renderFields(ids) {
      const w = this.state.w;
      const f = (ids || []).filter((id) => id && id !== 0).slice(0, 3);
      if (f.length === 1) {
        for (let i = 0; i < 3; i++) { w.f[i][0].setProperty(hmUI.prop.TEXT, ""); w.f[i][1].setProperty(hmUI.prop.TEXT, ""); }
        const [v, l] = this.fieldValue(f[0]); this.showBig(v, l); return;
      }
      this.hideBig();
      for (let i = 0; i < 3; i++) {
        if (i < f.length) { const [v, l] = this.fieldValue(f[i]); w.f[i][0].setProperty(hmUI.prop.TEXT, v); w.f[i][1].setProperty(hmUI.prop.TEXT, l); }
        else { w.f[i][0].setProperty(hmUI.prop.TEXT, ""); w.f[i][1].setProperty(hmUI.prop.TEXT, ""); }
      }
    },
    renderIdle() {
      const s = this.state, w = s.w;
      w.page.setProperty(hmUI.prop.TEXT, (s.idlePage + 1) + "/3");
      const gps = "GPS " + (s.fix ? "●" : "suche…");
      const conn = !bleOk() ? "kein Handy" : (s.paired ? "verbunden ✓" : "verbinde…");
      if (s.idlePage === 0) {
        this.renderFields(s.offFoil);
        w.status.setProperty(hmUI.prop.TEXT, (s.upStatus || gps) + " · " + conn);
      } else if (s.idlePage === 1) {
        if (!bleOk()) { this.setSlots(["—", "kein Handy"], ["", ""], ["", ""]); w.status.setProperty(hmUI.prop.TEXT, "Handy/Zepp-App nötig"); }
        else if (s.paired) { this.setSlots(["✓", "verbunden"], ["", ""], ["", ""]); w.status.setProperty(hmUI.prop.TEXT, "Uhr verbunden"); }
        else { this.setSlots([s.code || "—", "Pairing-Code"], ["", ""], ["", ""]); w.status.setProperty(hmUI.prop.TEXT, "auf pumpfoil.org eintragen"); }
      } else {
        const n = loadPending().length;
        this.setSlots(["" + n, "in Warteschlange"], ["", ""], ["", ""]);
        w.status.setProperty(hmUI.prop.TEXT, s.upStatus || (n ? "warten auf Verbindung" : "nichts offen"));
      }
    },
    renderRecording() {
      const s = this.state, w = s.w;
      if (s.page === s.views.length) {
        w.page.setProperty(hmUI.prop.TEXT, "");
        const el = (Date.now() - s.startedAtMs) / 1000;
        this.setSlots([mmss(el), "Zeit"], [fmtDist(s.dist), "Distanz"], ["", ""]);
        w.status.setProperty(hmUI.prop.TEXT, "STOPP unten · ▲ zurück");
        return;
      }
      const pg = s.page;
      w.page.setProperty(hmUI.prop.TEXT, (pg + 1) + "/" + s.views.length);
      this.renderFields(s.views[pg]);
      w.status.setProperty(hmUI.prop.TEXT, (s.fix ? "GPS ●" : "GPS suche…") + " · wischen: Stopp");
    },
    renderSummary() {
      const s = this.state, w = s.w, last = s.last || { dist: 0, dur: 0, avg: 0, max: 0 };
      w.page.setProperty(hmUI.prop.TEXT, "");
      this.setSlots([fmtDist(last.dist), "Distanz"], [mmss(last.dur), "Dauer"], [last.avg.toFixed(1), "Ø km/h"]);
      w.status.setProperty(hmUI.prop.TEXT, s.upStatus);
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

    // ---- Sampling ----
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
          s.gps.push([Date.now() - s.startedAtMs, Math.round(lat * 1e6) / 1e6, Math.round(lon * 1e6) / 1e6, Math.round(speed * 100) / 100, hr, 0]);
          if (s.prev) s.dist += distM(s.prev[0], s.prev[1], lat, lon);
          s.prev = [lat, lon];
          if (speed > s.max) s.max = speed;
          if (s.gps.length % GPS_CHUNK === 0) this.persistActive();
        }
        this.renderRecording();
      } else if (s.screen === "idle") {
        if (s.autoStart && fix && speed > AUTOSTART_SPEED) { s.autoTicks++; if (s.autoTicks >= AUTOSTART_TICKS) { this.start(); return; } }
        else s.autoTicks = 0;
        this.renderIdle();
      }
    },

    // ---- Persistente Aufnahme (Absturz-sicher) ----
    persistActive() { const s = this.state; try { store.setItem("active", JSON.stringify({ uuid: s.uuid, startedAtMs: s.startedAtMs, gps: s.gps })); } catch (e) {} },
    recoverActive() {
      let a = null; try { a = JSON.parse(store.getItem("active", "null")); } catch (e) {}
      if (a && a.gps && a.gps.length) {
        const end = a.startedAtMs + (a.gps[a.gps.length - 1][0] || 0);
        const list = loadPending(); list.push({ uuid: a.uuid, startedAtMs: a.startedAtMs, endedAtMs: end, gps: a.gps }); savePending(list);
      }
      store.setItem("active", "");
    },

    // ---- Aufnahme ----
    start() {
      const s = this.state, now = Date.now();
      s.recording = true; s.screen = "recording"; s.startedAtMs = now; s.uuid = makeUuid(now);
      s.gps = []; s.dist = 0; s.max = 0; s.hrSum = 0; s.hrN = 0; s.hrMax = 0; s.prev = null; s.page = 0; s.autoTicks = 0; s.upStatus = "";
      s._fi = 0;
      this.persistActive();
      this.hideBar();
      this.applyButton();
      this.renderRecording();
    },
    stop() {
      const s = this.state, now = Date.now();
      s.recording = false;
      const el = (now - s.startedAtMs) / 1000;
      s.last = { dur: el, dist: s.dist, avg: el > 0 ? s.dist / el * 3.6 : 0, max: s.max * 3.6 };
      if (s.gps.length) {
        s.screen = "summary"; s.upPct = 0; s.upStatus = "Lädt hoch… 0%";
        const list = loadPending(); list.push({ uuid: s.uuid, startedAtMs: s.startedAtMs, endedAtMs: now, gps: s.gps.slice() }); savePending(list);
        store.setItem("active", "");
        this.applyButton(); this.renderSummary(); this.showBar(0);
        this.flushPending();
      } else {
        s.screen = "idle"; s.idlePage = 0; s.upStatus = "nichts aufgezeichnet";
        store.setItem("active", "");
        this.applyButton(); this.renderIdle();
      }
    },
    done() { const s = this.state; s.screen = "idle"; s.idlePage = 0; s.upStatus = ""; this.hideBar(); this.applyButton(); this.renderIdle(); },
    repair() { const s = this.state; store.setItem("deviceToken", ""); store.setItem("claimToken", ""); s.paired = false; s.code = ""; this.applyButton(); this.renderIdle(); this.beginPairing(); },

    // ---- Upload / Offline-Queue ----
    uploadSession(sess, onProg) {
      const tok = getTok();
      if (!tok) return Promise.reject(new Error("not paired"));
      const meta = { session_uuid: sess.uuid, started_at_ms: sess.startedAtMs, sport: "pumpfoil", gps_hz: GPS_HZ, accel_hz: ACCEL_HZ, accel_scale: ACCEL_SCALE };
      const chunks = [];
      for (let i = 0; i < sess.gps.length; i += GPS_CHUNK) chunks.push({ index: chunks.length, data: sess.gps.slice(i, i + GPS_CHUNK) });
      const total = chunks.length + 2; let done = 0;
      const bump = () => { done++; if (onProg) onProg(Math.min(100, Math.round(done / total * 100))); };
      // Direkter this.request (wie Pairing) — kein Retry (der würde Folge-Requests feuern);
      // r.ok muss echt kommen, sonst Fehler (kein Schein-Erfolg).
      const req = (p) => this.reqQ(p).then((r) => {
        if (r && r.error) throw new Error(r.error);
        if (!r || r.ok !== true) throw new Error("keine Antwort");
        return r;
      });
      return req({ method: "START", token: tok, meta }).then(bump)
        .then(() => chunks.reduce((p, c) => p.then(() => req({ method: "CHUNK", token: tok, session_uuid: sess.uuid, index: c.index, kind: "gps", encoding: "json", data: c.data })).then(bump), Promise.resolve()))
        .then(() => req({ method: "COMPLETE", token: tok, session_uuid: sess.uuid, ended_at_ms: sess.endedAtMs, total_chunks: chunks.length })).then(bump);
    },
    flushPending() {
      const s = this.state;
      const inSummary = s.screen === "summary";
      const list = loadPending();
      if (!getTok()) { if (list.length) { s.upStatus = "Upload später (" + list.length + ")"; this.rerender(); } return; }
      if (!list.length) { if (inSummary) { s.upStatus = "Hochgeladen ✓"; this.showBar(100); this.renderSummary(); } this.applyButton(); return; }
      const onProg = (pct) => { s.upPct = pct; s.upStatus = "Lädt hoch… " + pct + "%"; if (inSummary) { this.showBar(pct); this.renderSummary(); } else this.renderIdle(); };
      const step = (i) => {
        if (i >= list.length) { s.upStatus = "Hochgeladen ✓"; if (inSummary) { this.showBar(100); this.renderSummary(); } else this.renderIdle(); this.applyButton(); return; }
        const sess = list[i];
        this.uploadSession(sess, onProg)
          .then(() => { removePending(sess.uuid); step(i + 1); })
          .catch((err) => { s.upStatus = "Upload: " + ((err && err.message) || "?"); this.rerender(); this.applyButton(); });
      };
      step(0);
    },

    onDestroy() {
      const s = this.state;
      if (s.timer) clearInterval(s.timer);
      if (s.pollTimer) clearTimeout(s.pollTimer);
      if (s.hbTimer) clearInterval(s.hbTimer);
      try { offGesture(); } catch (e) {}
      try { s.geo && s.geo.stop && s.geo.stop(); } catch (e) {}
    },
  })
);
