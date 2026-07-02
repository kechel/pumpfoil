import * as hmUI from "@zos/ui";
import { log as Logger, px } from "@zos/utils";
import { LocalStorage } from "@zos/storage";
import { getDeviceInfo } from "@zos/device";
import { onGesture, offGesture, GESTURE_UP, GESTURE_DOWN } from "@zos/interaction";
import { getConnectStatus } from "@zos/ble";
import { BasePage } from "@zeppos/zml/base-page";
import { Geolocation, HeartRate } from "@zos/sensor";
import { TITLE, PAGE, F0V, F0L, F1V, F1L, F2V, F2L, STATUS, BUTTON } from "zosLoader:./index.[pf].layout.js";

const logger = Logger.getLogger("pumpfoil");
const GPS_HZ = 1, ACCEL_HZ = 25, ACCEL_SCALE = 2048, GPS_CHUNK = 60;
const AUTOSTART_SPEED = 7 / 3.6, AUTOSTART_TICKS = 3;
const DEV_FAKE_GPS = true;   // Simulator hat kein GPS -> synthetische Spur (Ruhe 0, Aufnahme bewegt)
const APP_BUILD = "v1.6";    // zentriert unter dem Titel; bei jedem Push hochzählen (Ladekontrolle)
// TEST: vorgegebenes Device-Token -> Pairing überspringen, direkt beim Start EINEN Upload testen.
// "" = normaler Betrieb. (Token = echtes uz2b13-Token, User 2, aus dem 07:34-Log.)
const DEV_TOKEN = "uz2b13aF54204SnQMRF_ZoINBkDTNE_j";
// Ist das Handy/Companion per BLE verbunden? (Uhr hat kein eigenes Internet.) Fallback true, falls
// die API fehlt/anders ist — dann nicht blockieren.
const bleOk = () => { try { return getConnectStatus() !== false; } catch (e) { return true; } };
const DW = (() => { try { return getDeviceInfo().width; } catch (e) { return 480; } })();
const GREEN = 0x22c55e, GREEN_P = 0x16a34a, RED = 0xdc2626, RED_P = 0xb91c1c, BLUE = 0x2563eb, BLUE_P = 0x1d4ed8;

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
      timer: null, pollTimer: null, hbTimer: null, geo: null, hrSensor: null, w: {}, _chain: null,
      _fi: 0, _flat: null, _flon: null,
    },

    // Direkter this.request (der send()-Single-Flight-Wrapper verursachte 'code of undefined').
    // Validator ok(r) prüft echte Antwort; retry nur bei Verbindungsfehlern.
    call(payload, ok, tries) {
      tries = tries || 6;
      return this.request(payload).then((r) => {
        if (r && r.error) { const e = new Error(r.error); e.fatal = true; throw e; }
        if (ok && !ok(r)) throw new Error("no-ack");
        return r;
      }).catch((err) => {
        if (err && err.fatal) throw err;
        const m = (err && err.message) || String(err);
        if (tries > 1 && (m.indexOf("shake") >= 0 || m.indexOf("timeout") >= 0 || m.indexOf("no-ack") >= 0)) {
          return new Promise((res) => setTimeout(res, 800)).then(() => this.call(payload, ok, tries - 1));
        }
        throw err;
      });
    },

    build() {
      const s = this.state, w = s.w;
      logger.log("[build] " + APP_BUILD + " start (tok=" + (getTok() ? "ja" : "nein") + ", pending=" + loadPending().length + ")");
      w.title = hmUI.createWidget(hmUI.widget.TEXT, { ...TITLE });
      w.page = hmUI.createWidget(hmUI.widget.TEXT, { ...PAGE });
      w.f = [
        [hmUI.createWidget(hmUI.widget.TEXT, { ...F0V }), hmUI.createWidget(hmUI.widget.TEXT, { ...F0L })],
        [hmUI.createWidget(hmUI.widget.TEXT, { ...F1V }), hmUI.createWidget(hmUI.widget.TEXT, { ...F1L })],
        [hmUI.createWidget(hmUI.widget.TEXT, { ...F2V }), hmUI.createWidget(hmUI.widget.TEXT, { ...F2L })],
      ];
      w.status = hmUI.createWidget(hmUI.widget.TEXT, { ...STATUS });
      // Versionsanzeige mittig direkt unter dem Titel (Garmin-Style, Ladekontrolle).
      w.ver = hmUI.createWidget(hmUI.widget.TEXT, { x: 0, y: TITLE.y + TITLE.h, w: DW, h: px(16), color: 0x64748b, text_size: px(14), align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V, text: APP_BUILD });

      onGesture({
        callback: (e) => {
          if (e !== GESTURE_UP && e !== GESTURE_DOWN) return false;
          const dir = e === GESTURE_UP ? 1 : -1;
          logger.log("[gesture] " + e + " screen=" + s.screen + " page=" + s.page + "/" + s.idlePage);
          if (s.recording) { const n = s.views.length + 1; s.page = (s.page + dir + n) % n; this.applyButton(); this.renderRecording(); return true; }
          if (s.screen === "idle") { s.idlePage = (s.idlePage + dir + 3) % 3; this.applyButton(); this.renderIdle(); return true; }
          return false;
        },
      });

      // Absturz-Recovery: eine unbeendete Aufnahme aus dem letzten Lauf in die Queue übernehmen.
      this.recoverActive();

      try { s.geo = new Geolocation(); s.geo.start(); } catch (e) { logger.log("geo err " + e); }
      try { s.hrSensor = new HeartRate(); } catch (e) { s.hrSensor = null; }
      s.timer = setInterval(() => this.sample(), 1000 / GPS_HZ);
      s.hbTimer = setInterval(() => this.heartbeat(), 20000);   // Hintergrund-Reconnect / Nachhol-Upload

      if (DEV_TOKEN) { store.setItem("deviceToken", DEV_TOKEN); s.paired = true; }
      if (getTok()) s.paired = true;
      this.applyButton();
      this.renderIdle();
      if (DEV_TOKEN) { logger.log("[devtest] Upload-Test (erste Requests nach Spawn)"); this.devTestUpload(); }
      else this.connect();
    },

    // TEST: winziger Trigger (~wie PAIR_INIT). App-Side lädt Mini-Session komplett selbst hoch.
    devTestUpload() {
      this.state.w.status.setProperty(hmUI.prop.TEXT, "Upload-Test…");
      logger.log("[devtest] sende TESTUPLOAD (mini)");
      this.call({ method: "TESTUPLOAD" }, (r) => r && (r.ok || r.error)).then((r) => {
        logger.log("[devtest] <- " + JSON.stringify(r));
        this.state.w.status.setProperty(hmUI.prop.TEXT, (r && r.ok) ? ("Test OK http=" + r.http) : ("Test: " + (r && r.error)));
      }).catch((e) => { logger.log("[devtest] FAIL " + ((e && e.message) || e)); this.state.w.status.setProperty(hmUI.prop.TEXT, "Test: " + ((e && e.message) || "?")); });
    },

    // ---- Verbindung / Pairing (Hintergrund) ----
    connect() {
      const s = this.state;
      if (!bleOk()) { this.rerender(); return; }   // kein Handy -> nicht versuchen, Heartbeat holt es nach
      if (!getTok()) { this.beginPairing(); return; }
      this.call({ method: "CONFIG", token: getTok() }, (r) => r && typeof r.paired !== "undefined")
        .then((r) => {
          if (r.revoked) { store.setItem("deviceToken", ""); s.paired = false; this.beginPairing(); return; }
          if (Array.isArray(r.views) && r.views.length) s.views = r.views;
          if (Array.isArray(r.offFoilView) && r.offFoilView.length) s.offFoil = r.offFoilView;
          if (typeof r.autoStart !== "undefined") s.autoStart = !!r.autoStart;
          s.paired = true;
          this.applyButton(); this.rerender();
          this.flushPending();
        })
        .catch(() => { this.applyButton(); this.rerender(); this.flushPending(); });
    },
    beginPairing() {
      const s = this.state;
      logger.log("[pair] beginPairing (bleOk=" + bleOk() + ", tok=" + (getTok() ? "ja" : "nein") + ")");
      s.paired = false;
      // DIAGNOSE: direkter this.request (ohne call/Validator) + rohe Antwort/Stack loggen.
      this.request({ method: "PAIR_INIT" }).then((r) => {
        logger.log("[pair] RAW typeof=" + (typeof r) + " val=" + JSON.stringify(r));
        if (r && r.error) { logger.log("[pair] app-side error: " + r.error); this.rerender(); return; }
        if (!r || !r.code) { logger.log("[pair] keine code-property in Antwort"); this.rerender(); return; }
        s.code = r.code; store.setItem("claimToken", r.claim_token || ""); this.applyButton(); this.rerender(); this.startPoll();
      }).catch((err) => {
        logger.log("[pair] RAW err: " + ((err && err.message) || String(err)));
        logger.log("[pair] stack: " + ((err && err.stack) ? String(err.stack).slice(0, 180) : "-"));
        this.rerender();
      });
    },
    startPoll() {
      const s = this.state;
      if (s.pollTimer) { clearTimeout(s.pollTimer); s.pollTimer = null; }
      // NICHT überlappend: nächsten Poll erst planen, wenn der vorige fertig ist (zml shaked pro
      // Request; ein festes Intervall würde sich selbst abwürgen -> pair-poll käme nie durch).
      const tick = () => {
        logger.log("[poll] PAIR_POLL");
        this.call({ method: "PAIR_POLL", claimToken: getClaim() }, (r) => r && typeof r.paired !== "undefined")
          .then((r) => {
            logger.log("[poll] <- " + JSON.stringify(r));
            if (r && r.paired && r.device_token) {
              store.setItem("deviceToken", r.device_token); store.setItem("claimToken", "");
              s.pollTimer = null; s.paired = true; s.code = "";
              this.connect();
              return;
            }
            s.pollTimer = setTimeout(tick, 3000);
          })
          .catch((err) => { logger.log("[poll] !! " + ((err && err.message) || err)); s.pollTimer = setTimeout(tick, 3000); });
      };
      s.pollTimer = setTimeout(tick, 500);
    },

    // Hintergrund-Reconnect: alle 20s (außer während Aufnahme) erneut verbinden/config holen +
    // Warteschlange senden. Heilt sich selbst, sobald Bridge/Worker/Handy wieder da sind — auch
    // direkt nach dem Beenden einer Aufnahme.
    heartbeat() {
      const s = this.state;
      if (DEV_TOKEN) return;   // Test-Modus: kein Hintergrund-Reconnect dazwischenfunken
      if (s.recording) return;
      if (!bleOk()) { this.rerender(); return; }   // kein Handy -> nur Anzeige aktualisieren
      if (getTok()) this.connect();
      else if (!s.code && !s.pollTimer) this.beginPairing();
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

    // ---- Button pro Screen/Seite (nur bei Übergängen, nicht pro Sekunde) ----
    setButton(text, nc, pc, fn) { const w = this.state.w; if (w.btn) hmUI.deleteWidget(w.btn); w.btn = hmUI.createWidget(hmUI.widget.BUTTON, { ...BUTTON, text, normal_color: nc, press_color: pc, click_func: () => { logger.log("[btn-click] " + text); fn(); } }); logger.log("[ui] Button = " + text); },
    hideButton() { const w = this.state.w; if (w.btn) { hmUI.deleteWidget(w.btn); w.btn = null; } },
    applyButton() {
      const s = this.state;
      if (s.recording) {
        if (s.page === s.views.length) this.setButton("STOPP", RED, RED_P, () => this.stop());
        else this.hideButton();
      } else if (s.screen === "summary") {
        this.setButton("Fertig", BLUE, BLUE_P, () => this.done());
      } else if (s.idlePage === 0) {
        this.setButton("START", GREEN, GREEN_P, () => this.start());
      } else if (s.idlePage === 1) {
        if (s.paired) this.setButton("Neu verbinden", BLUE, BLUE_P, () => this.repair());
        else this.setButton("Neuer Code", BLUE, BLUE_P, () => this.beginPairing());
      } else if (s.idlePage === 2 && loadPending().length && getTok()) {
        this.setButton("Jetzt senden", BLUE, BLUE_P, () => this.flushPending());
      } else this.hideButton();
    },

    // ---- Rendering (nur Texte; Button separat) ----
    rerender() { const s = this.state; if (s.recording) this.renderRecording(); else if (s.screen === "summary") this.renderSummary(); else this.renderIdle(); },
    fieldPair(id) { if (!id || id === 0) return ["", ""]; return this.fieldValue(id); },
    setSlots(a, b, c) { const w = this.state.w, arr = [a, b, c]; for (let i = 0; i < 3; i++) { w.f[i][0].setProperty(hmUI.prop.TEXT, arr[i][0]); w.f[i][1].setProperty(hmUI.prop.TEXT, arr[i][1]); } },
    renderIdle() {
      const s = this.state, w = s.w;
      w.page.setProperty(hmUI.prop.TEXT, (s.idlePage + 1) + "/3");
      const gps = "GPS " + (s.fix ? "●" : "suche…");
      const conn = !bleOk() ? "kein Handy" : (s.paired ? "verbunden ✓" : "verbinde…");
      if (s.idlePage === 0) {
        this.setSlots(this.fieldPair(s.offFoil[0]), this.fieldPair(s.offFoil[1]), this.fieldPair(s.offFoil[2]));
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
      if (s.page === s.views.length) {   // Stopp-Screen
        w.page.setProperty(hmUI.prop.TEXT, "");
        const el = (Date.now() - s.startedAtMs) / 1000;
        this.setSlots([mmss(el), "Zeit"], [fmtDist(s.dist), "Distanz"], ["", ""]);
        w.status.setProperty(hmUI.prop.TEXT, "STOPP unten · ▲ zurück");
        return;
      }
      const pg = s.page;
      w.page.setProperty(hmUI.prop.TEXT, (pg + 1) + "/" + s.views.length);
      const fields = (s.views[pg] || []).filter((id) => id && id !== 0).slice(0, 3);
      for (let i = 0; i < 3; i++) {
        if (i < fields.length) { const [v, l] = this.fieldValue(fields[i]); w.f[i][0].setProperty(hmUI.prop.TEXT, v); w.f[i][1].setProperty(hmUI.prop.TEXT, l); }
        else { w.f[i][0].setProperty(hmUI.prop.TEXT, ""); w.f[i][1].setProperty(hmUI.prop.TEXT, ""); }
      }
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
          s.gps.push([Date.now() - s.startedAtMs, lat, lon, speed, hr, 0]);
          if (s.prev) s.dist += distM(s.prev[0], s.prev[1], lat, lon);
          s.prev = [lat, lon];
          if (speed > s.max) s.max = speed;
          if (s.gps.length % GPS_CHUNK === 0) this.persistActive();  // laufend sichern
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
        logger.log("recovered active session " + a.uuid + " (" + a.gps.length + " pts)");
      }
      store.setItem("active", "");
    },

    // ---- Aufnahme ----
    start() {
      logger.log("[btn] START");
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
      logger.log("[btn] STOPP");
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
    done() { logger.log("[btn] Fertig"); const s = this.state; s.screen = "idle"; s.idlePage = 0; s.upStatus = ""; this.hideBar(); this.applyButton(); this.renderIdle(); },
    repair() { logger.log("[btn] Neu verbinden"); const s = this.state; store.setItem("deviceToken", ""); store.setItem("claimToken", ""); s.paired = false; s.code = ""; this.applyButton(); this.renderIdle(); this.beginPairing(); },

    // ---- Upload / Offline-Queue ----
    uploadSession(sess, onProg) {
      const tok = getTok();
      if (!tok) return Promise.reject(new Error("not paired"));
      const meta = { session_uuid: sess.uuid, started_at_ms: sess.startedAtMs, sport: "pumpfoil", gps_hz: GPS_HZ, accel_hz: ACCEL_HZ, accel_scale: ACCEL_SCALE };
      const chunks = [];
      for (let i = 0; i < sess.gps.length; i += GPS_CHUNK) chunks.push({ index: chunks.length, data: sess.gps.slice(i, i + GPS_CHUNK) });
      const total = chunks.length + 2; let done = 0;
      const bump = () => { done++; if (onProg) onProg(Math.min(100, Math.round(done / total * 100))); };
      const req = (p) => { logger.log("[up] " + p.method + " ->"); return this.call(p, (r) => r && r.ok === true).then((r) => { logger.log("[up] " + p.method + " ok http=" + (r && r.http) + (r && r.url ? " url=" + r.url : "") + (r && r.body ? " body=" + r.body : "")); return r; }); };
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
        logger.log(">>> Upload " + sess.uuid + " (" + sess.gps.length + " pts)");
        this.uploadSession(sess, onProg)
          .then(() => { logger.log("Upload ok " + sess.uuid); removePending(sess.uuid); step(i + 1); })
          .catch((err) => { const msg = (err && err.message) || "?"; logger.log("!!! Upload-Fehler: " + msg); s.upStatus = "Upload: " + msg; this.rerender(); this.applyButton(); });
      };
      step(0);
    },

    onDestroy() {
      const s = this.state;
      if (s.timer) clearInterval(s.timer);
      if (s.pollTimer) clearInterval(s.pollTimer);
      if (s.hbTimer) clearInterval(s.hbTimer);
      try { offGesture(); } catch (e) {}
      try { s.geo && s.geo.stop && s.geo.stop(); } catch (e) {}
    },
  })
);
