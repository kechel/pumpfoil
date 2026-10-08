/*
 * Die eine Seite des Recorders. Logik in common/recorder.js + common/kern.js; hier nur
 * Anzeige und die 2-s-Halten-Gesten (wie auf allen Pumpfoil-Uhren: ein nasser Aermel soll
 * nichts beenden oder pausieren).
 */
import app from "@system.app";
import vibrator from "@system.vibrator";
import device from "@system.device";
import S from "../../common/seiten.js";
// Wear Engine im Seiten-Buendel, an den Recorder durchgereicht (s. recorder.js WE). sim.sh tauscht diese
// Zeile im Simulator gegen die Attrappe.
import { P2pClient, Message, Builder } from "../../wearengine/wearengine.js";

// Der Recorder steckt im app.js-Buendel (s. dort, Grund: 48 KB Uebersetzungs-Heap je Buendel).
// Gesetzt in onInit (dann steht das App-Objekt sicher).
var R = null;

// Feldbeschriftungen (Schluessel wie seiten.js feld) aus den i18n-Dateien.
var FELDTEXTE = ["kmh3s", "kmhAvg", "kmhMax", "bpmAvg", "bpmMax", "time", "dist", "clock", "runActive",
  "runTime", "runDist", "lastRunTime", "lastRunDist", "lastRunAvg", "lastRunMax", "runs", "lastRunMaxHr",
  "allRunsDist", "allRunsTime", "paused"];

var HALTEN_MS = 2000;

/** Recorder aus dem app.js-Buendel holen — mit Log, was wirklich ankommt (getApp ist erst ab API 10 da). */
function holeRecorder(vm) {
  try {
    if (typeof getApp !== "function") { vm.appInfo = "getApp " + typeof getApp; console.error("Pumpfoil getApp fehlt (" + typeof getApp + ")"); }
    else {
      var a = getApp();
      if (a && a.R) return a.R;
      if (a && a.data && a.data.R) return a.data.R;
      var k = [];
      for (var x in a) k.push(x);
      vm.appInfo = typeof a + "[" + k.join(",") + "]" + (a && a.data ? " d[" + Object.keys(a.data).join(",") + "]" : "");
      console.error("Pumpfoil getApp ohne R: " + vm.appInfo);
    }
  } catch (e) { console.error("Pumpfoil getApp: " + e); }
  try { if (vm.$app && vm.$app.$def && vm.$app.$def.R) return vm.$app.$def.R; } catch (e) { /* weiter */ }
  return null;
}

function zeitText(ms) {
  var s = Math.floor(ms / 1000);
  var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return (h > 0 ? h + ":" + (m < 10 ? "0" : "") : "") + m + ":" + (r < 10 ? "0" : "") + r;
}

export default {
  data: {
    modus: "bereit", zeit: "0:00", tempo: "0.0", strecke: "0.00", puls: "--", info: "",
    balken: 0, balkenZeigen: false, datenseite: false,
    // VORLAEUFIG (Fehlersuche Simulator, 08.10.2026): die Ueberschrift zeigt, wie weit der Start kam —
    // a = Daten geladen, b = onInit, c = Recorder da (x = fehlt), d = R.init durch, e = erste Anzeige.
    // Ziffer = Build-Stand, damit ein alter Build sofort auffaellt. Danach wieder „PUMPFOIL".
    marke: "PUMPFOIL 4a",
    knopfStart: "", knopfPause: "", knopfWeiter: "", knopfStopp: "", textPause: ""
  },
  onInit() {
    console.info("Pumpfoil Seite onInit, Text start=" + this.$t("strings.start"));
    this.marke = "PUMPFOIL 4b";
    R = holeRecorder(this);
    this.marke = R ? "PUMPFOIL 4c" : "4x " + (this.appInfo || "?") + " m=" + this.modus;
    if (!R) {
      // Ohne Recorder nichts weiter starten, aber SAGEN warum (Infozeile + Log), statt still leer zu bleiben.
      this.info = "Kein Recorder (getApp)";
      return;
    }
    this.knopfStart = this.$t("strings.start");
    this.knopfPause = this.$t("strings.pause");
    this.knopfWeiter = this.$t("strings.resume");
    this.knopfStopp = this.$t("strings.stop");
    this.textPause = this.$t("strings.paused");
    // Texte einmal holen (jedes $t kostet auf der Uhr), Displaygroesse fuer die Promille-Koordinaten.
    this.texte = {};
    for (var i = 0; i < FELDTEXTE.length; i++) this.texte[FELDTEXTE[i]] = this.$t("strings.f_" + FELDTEXTE[i]);
    this.texte.paused = this.textPause;
    this.dw = 466; this.dh = 466; this.lite = true;
    this.seite = 1; this.zustandVorher = "";
    var that0 = this;
    device.getInfo({ success: function (d) {
      if (d.windowWidth > 0) { that0.dw = d.windowWidth; that0.dh = d.windowHeight; }
      that0.lite = d.deviceType !== "wearable";
    } });
    // Scheitert der Start (z. B. ein Systemmodul fehlt), die Meldung auf die Uhr statt einer schwarzen Seite.
    try { R.init({ P2pClient: P2pClient, Message: Message, Builder: Builder }); } catch (e) { console.error("Pumpfoil init: " + e); this.startFehler = "init: " + e; }
    if (!this.startFehler) this.marke = "PUMPFOIL 4d";
    var that = this;
    this.takt = setInterval(function () { that.zeigen(); }, 1000);
    this.zeigen();
    if (!this.startFehler && this.marke === "PUMPFOIL 4d") this.marke = "PUMPFOIL 4e";
  },
  onDestroy() {
    clearInterval(this.takt);
    if (R) R.ende();
  },
  // Fehler beim Anzeigen sichtbar machen (Infozeile + Log), jede Sekunde neu — nie stumm.
  zeigen() {
    try { this.zeigenRoh(); } catch (e) { console.error("Pumpfoil zeigen: " + e); this.info = "zeigen: " + e; }
  },
  zeigenRoh() {
    if (R.takt()) this.seite = 1;   // Lauf begonnen/beendet -> erste Datenseite (wie Zepp)
    var z = R.zustand();
    this.modus = z.modus;
    this.zeit = zeitText(z.ms);
    this.tempo = z.kmh.toFixed(1);
    this.strecke = (z.m / 1000).toFixed(2);
    this.puls = z.puls > 0 ? z.puls + " bpm" : "-- bpm";
    // Eine Zeile Zustand: Halten-Fortschritt > Fehler > GPS > Uebertragung. Fehler bleiben
    // stehen, solange es sie gibt (nie nur einmal melden).
    var info = "";
    if (this.startFehler) info = this.startFehler;
    else if (this.haltText) info = this.haltText;
    else if (z.fehler > 0) info = this.$t("strings.errors") + " " + z.fehler + ": " + z.letzterFehler;
    else if (z.modus === "laeuft" && !z.gpsOk) info = this.$t("strings.gpsWait");
    else if (z.offen > 0) {
      // „Zum Handy: 34/120" — gezaehlt in Dateien (je ~5 s Aufnahme), dieselbe Zahl, die das
      // Handy im Balken zeigt. Das Ziel ist das HANDY, nicht der Server.
      info = this.$t("strings.toPhone") + " " + z.plan.fertig + "/" + z.plan.gesamt;
      if (z.sendeFehler > 0) info += " · " + this.$t("strings.openPhone") + " (" + z.sendeCode + ")";
    } else if (z.modus === "bereit") info = this.$t("strings.allSent");
    this.info = info;
    // Balken nur ausserhalb der Aufnahme: waehrend der Fahrt gehen die Chunks laufend raus und
    // der Balken zappelte zwischen 1/2 und 2/2 — die Zahl in der Zeile reicht dort.
    this.balkenZeigen = z.modus === "bereit" && z.offen > 0 && z.plan.gesamt > 0;
    this.balken = z.plan.gesamt > 0 ? Math.floor(100 * z.plan.fertig / z.plan.gesamt) : 0;
    this.datenseiten();
  },
  /** Seite 0 = Bedienung (Pause/Weiter/Stopp), 1 … n = Datenseiten des aktuellen Zustands. */
  datenseiten() {
    if (R.modus === "bereit") { this.datenseite = false; this.seite = 1; return; }
    var c = R.seitenKontext();
    if (c.zustand !== this.zustandVorher) { this.zustandVorher = c.zustand; this.seite = 1; }
    var ring = S.ring(c.k, c.zustand);
    if (this.seite > ring.length) this.seite = ring.length;
    this.datenseite = this.seite > 0 && this.haltText === "";
    if (!this.datenseite) return;
    var that = this;
    var ctx = { dw: this.dw, dh: this.dh, s: c.s, el: c.el, k: c.k, jetzt: new Date(), pausiert: c.pausiert,
      idx: this.seite - 1, anzahl: ring.length, t: function (k) { return that.texte[k] || k; } };
    this.malen(S.zeichne(ring[this.seite - 1], ctx));
  },
  /**
   * Zeichenbefehle ausfuehren. Lite kennt laut Doku nur die System-Schriftgroessen 30/38 px; Watch 3/4
   * (deviceType wearable) zeichnet die echte Groesse. UNGEPRUEFT auf Hardware: Grundlinie von fillText
   * (hier mittig angenommen ueber +0,35 × Groesse) und welche Canvas-Aufrufe Lite wirklich kann.
   */
  malen(befehle) {
    var el = this.$refs.leinwand;
    if (!el) return;
    var c = el.getContext("2d");
    for (var i = 0; i < befehle.length; i++) {
      var b = befehle[i];
      try {
        if (b.k === "r") { c.fillStyle = b.c; c.fillRect(b.x, b.y, b.w, b.h); }
        else if (b.k === "t") {
          var px = this.lite ? (b.s >= 34 ? 38 : 30) : b.s;
          c.fillStyle = b.c; c.font = px + "px";
          c.textAlign = b.a === "l" ? "left" : (b.a === "r" ? "right" : "center");
          c.fillText(b.txt, b.x, b.y + Math.round(px * 0.35));
        } else if (b.k === "l") {
          c.strokeStyle = b.c; c.lineWidth = b.w; c.beginPath(); c.moveTo(b.x1, b.y1); c.lineTo(b.x2, b.y2); c.stroke();
        } else if (b.k === "a") {
          c.strokeStyle = b.c; c.lineWidth = b.w; c.beginPath();
          c.arc(b.cx, b.cy, b.r, b.a0 * Math.PI / 180, b.a1 * Math.PI / 180); c.stroke();
        }
      } catch (e) { /* ein Befehl, den die Uhr nicht kann, darf die Seite nicht abbrechen */ }
    }
  },
  halten(aktion, text) {
    var that = this;
    clearTimeout(this.haltUhr);
    this.haltText = text;
    this.zeigen();
    this.haltUhr = setTimeout(function () {
      that.haltText = "";
      vibrator.vibrate({ mode: "short" });
      R[aktion]();
      that.zeigen();
    }, HALTEN_MS);
  },
  startHalten() { this.halten("start", this.$t("strings.holdStart")); },
  pauseHalten() { this.halten("pause", this.$t("strings.holdPause")); },
  weiterHalten() { this.halten("weiter", this.$t("strings.holdResume")); },
  stoppHalten() { this.halten("stopp", this.$t("strings.holdStop")); },
  loslassen() {
    clearTimeout(this.haltUhr);
    this.haltText = "";
    this.zeigen();
  },
  wischen(e) {
    // Hoch/runter blaettert waehrend der Aufnahme durch Bedienseite (0) und Datenseiten.
    if (R.modus !== "bereit" && (e.direction === "up" || e.direction === "down")) {
      var n = S.ring(R.konfig, R.seitenKontext().zustand).length;
      this.seite = e.direction === "up" ? Math.min(n, this.seite + 1) : Math.max(0, this.seite - 1);
      this.datenseiten();
      return;
    }
    // Nach rechts wischen beendet die App (AppGallery verlangt das) — aber nie mitten in einer
    // Aufnahme: dann waere sie weg. Erst stoppen.
    if (e.direction !== "right") return;
    if (R.modus === "bereit") app.terminate();
    else { this.haltText = this.$t("strings.stopFirst"); this.zeigen(); var that = this;
      setTimeout(function () { that.haltText = ""; }, 2500); }
  }
};
