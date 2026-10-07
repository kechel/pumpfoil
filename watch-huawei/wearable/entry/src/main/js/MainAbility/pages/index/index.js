/*
 * Die eine Seite des Recorders. Logik in common/recorder.js + common/kern.js; hier nur
 * Anzeige und die 2-s-Halten-Gesten (wie auf allen Pumpfoil-Uhren: ein nasser Aermel soll
 * nichts beenden oder pausieren).
 */
import app from "@system.app";
import vibrator from "@system.vibrator";
import R from "../../common/recorder.js";

var HALTEN_MS = 2000;

function zeitText(ms) {
  var s = Math.floor(ms / 1000);
  var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return (h > 0 ? h + ":" + (m < 10 ? "0" : "") : "") + m + ":" + (r < 10 ? "0" : "") + r;
}

export default {
  data: {
    modus: "bereit", zeit: "0:00", tempo: "0.0", strecke: "0.00", puls: "--", info: "",
    knopfStart: "", knopfPause: "", knopfWeiter: "", knopfStopp: "", textPause: ""
  },
  onInit() {
    this.knopfStart = this.$t("strings.start");
    this.knopfPause = this.$t("strings.pause");
    this.knopfWeiter = this.$t("strings.resume");
    this.knopfStopp = this.$t("strings.stop");
    this.textPause = this.$t("strings.paused");
    R.init();
    var that = this;
    this.takt = setInterval(function () { that.zeigen(); }, 1000);
    this.zeigen();
  },
  onDestroy() {
    clearInterval(this.takt);
    R.ende();
  },
  zeigen() {
    var z = R.zustand();
    this.modus = z.modus;
    this.zeit = zeitText(z.ms);
    this.tempo = z.kmh.toFixed(1);
    this.strecke = (z.m / 1000).toFixed(2);
    this.puls = z.puls > 0 ? z.puls + " bpm" : "-- bpm";
    // Eine Zeile Zustand: Halten-Fortschritt > Fehler > GPS > Uebertragung. Fehler bleiben
    // stehen, solange es sie gibt (nie nur einmal melden).
    var info = "";
    if (this.haltText) info = this.haltText;
    else if (z.fehler > 0) info = this.$t("strings.errors") + " " + z.fehler + ": " + z.letzterFehler;
    else if (z.modus === "laeuft" && !z.gpsOk) info = this.$t("strings.gpsWait");
    else if (z.offen > 0) {
      info = this.$t("strings.toPhone") + " " + z.offen;
      if (z.sendeFehler > 0) info += " · " + this.$t("strings.openPhone") + " (" + z.sendeCode + ")";
    } else if (z.modus === "bereit") info = this.$t("strings.allSent");
    this.info = info;
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
    // Nach rechts wischen beendet die App (AppGallery verlangt das) — aber nie mitten in einer
    // Aufnahme: dann waere sie weg. Erst stoppen.
    if (e.direction !== "right") return;
    if (R.modus === "bereit") app.terminate();
    else { this.haltText = this.$t("strings.stopFirst"); this.zeigen(); var that = this;
      setTimeout(function () { that.haltText = ""; }, 2500); }
  }
};
