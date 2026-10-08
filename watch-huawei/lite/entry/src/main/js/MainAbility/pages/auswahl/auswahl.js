/*
 * Einstellungsseite der Uhr (wie Zepp-Seite 4/4): Alarm an/aus, Grenzen vom Foil oder fest, Foil,
 * eigene Layouts und Touch-Sperre (Auto = wie im Profil). Der Zustand liegt im Recorder (app.js-Buendel,
 * R.auswahl) und wird dort gespeichert; diese Seite zeigt und schaltet nur.
 */
import router from "@system.router";

var R = null;

function holeRecorder() {
  try { var a = getApp(); return (a && a.data && a.data.R) || (a && a.R) || null; }
  catch (e) { console.error("Pumpfoil getApp: " + e); return null; }
}

export default {
  data: { zAlarm: "", zQuelle: "", zFoil: "", zLayouts: "", zSperre: "" },
  onInit() {
    R = holeRecorder();
    var keys = ["alarm", "thresholds", "autoFoil", "manual", "layoutsShort", "lock", "on", "off", "auto"];
    this.tx = {};
    for (var i = 0; i < keys.length; i++) this.tx[keys[i]] = this.$t("strings." + keys[i]);
    this.zeigen();
  },
  anAus(v) { return v ? this.tx.on : this.tx.off; },
  /** „Auto (An)" zeigt, was das Profil gerade ergibt — wie Zepp. */
  stufe(v, profil) { return v === null ? this.tx.auto + " (" + this.anAus(profil) + ")" : this.anAus(v); },
  zeigen() {
    if (!R) { this.zAlarm = "Kein Recorder (getApp)"; return; }
    var a = R.auswahl, k = R.konfig, f = a.foil(k);
    this.zAlarm = this.tx.alarm + ": " + this.anAus(a.alarm);
    this.zQuelle = this.tx.thresholds + ": " + (a.quelle === "foil" ? this.tx.autoFoil : this.tx.manual);
    this.zFoil = "Foil: " + (f ? f.label : "–");
    this.zLayouts = this.tx.layoutsShort + ": " + this.stufe(a.layouts, k.layoutsServer !== undefined ? k.layoutsServer : k.layoutsOn);
    this.zSperre = this.tx.lock + ": " + this.stufe(a.sperre, k.waterLock === "on");
  },
  aendern(fn) { fn(R.auswahl); R.auswahlAnwenden(); this.zeigen(); },
  alarm() { this.aendern(function (a) { a.alarm = !a.alarm; }); },
  quelle() { this.aendern(function (a) { a.quelle = a.quelle === "foil" ? "manual" : "foil"; }); },
  foil() { this.aendern(function (a) { a.naechstesFoil(R.konfig); }); },
  layouts() { this.aendern(function (a) { a.layouts = R.dreistufig(a.layouts); }); },
  sperre() { this.aendern(function (a) { a.sperre = R.dreistufig(a.sperre); }); },
  wischen(e) {
    var d = e && e.direction;
    if (d === "down" || d === "right") router.replace({ uri: "pages/index/index" });
  }
};
