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
  data: { bAlarm: "", bQuelle: "", bLayouts: "", bSperre: "", bStart: "", zStart: "", direktDa: false, zDirekt: "", zAlarm: "", zQuelle: "", zFoil: "", zLayouts: "", zSperre: "" },
  onInit() {
    R = holeRecorder();
    var keys = ["alarm", "thresholds", "autoFoil", "manual", "layoutsShort", "lock", "autoStart", "connect", "connected", "disconnect", "pairHint", "pairNoNet", "on", "off", "auto"];
    this.tx = {};
    for (var i = 0; i < keys.length; i++) this.tx[keys[i]] = this.$t("strings." + keys[i]);
    this.zeigen();
    // Watch 3/4: waehrend die Seite offen ist, nachfragen, ob der Code eingeloest wurde
    if (R && R.direkt) {
      this.direktDa = true;
      var that = this;
      this.dTakt = setInterval(function () { R.direkt.koppelnTakt(); that.zeigen(); }, 2000);
    }
  },
  onDestroy() { clearInterval(this.dTakt); },
  anAus(v) { return v ? this.tx.on : this.tx.off; },
  /** „Auto (An)" zeigt, was das Profil gerade ergibt — wie Zepp. */
  stufe(v, profil) { return v === null ? this.tx.auto + " (" + this.anAus(profil) + ")" : this.anAus(v); },
  zeigen() {
    if (!R) { this.zAlarm = "Kein Recorder (getApp)"; return; }
    var a = R.auswahl, k = R.konfig, f = a.foil(k);
    this.bAlarm = this.tx.alarm; this.bQuelle = this.tx.thresholds; this.bLayouts = this.tx.layoutsShort; this.bSperre = this.tx.lock; this.bStart = this.tx.autoStart;
    this.zAlarm = this.anAus(a.alarm);
    this.zQuelle = a.quelle === "foil" ? this.tx.autoFoil : this.tx.manual;
    this.zFoil = f ? f.label : "–";
    this.zLayouts = this.stufe(a.layouts, k.layoutsServer !== undefined ? k.layoutsServer : k.layoutsOn);
    this.zSperre = this.stufe(a.sperre, k.waterLock === "on");
    this.zStart = this.stufe(a.start, k.autoStart);
    if (R.direkt) this.zDirekt = R.direkt.text(this.tx);
  },
  aendern(fn) { fn(R.auswahl); R.auswahlAnwenden(); this.zeigen(); },
  alarm() { this.aendern(function (a) { a.alarm = !a.alarm; }); },
  quelle() { this.aendern(function (a) { a.quelle = a.quelle === "foil" ? "manual" : "foil"; }); },
  foil() { this.aendern(function (a) { a.naechstesFoil(R.konfig); }); },
  layouts() { this.aendern(function (a) { a.layouts = R.dreistufig(a.layouts); }); },
  sperre() { this.aendern(function (a) { a.sperre = R.dreistufig(a.sperre); }); },
  start() { this.aendern(function (a) { a.start = R.dreistufig(a.start); }); },
  direkt() { if (R && R.direkt) { R.direkt.tippen(); this.zeigen(); } },
  wischen(e) {
    var d = e && e.direction;
    // In der Liste ist hoch/runter Scrollen — zurueck nur noch mit rechts wischen.
    if (d === "right") router.replace({ uri: "pages/index/index" });
  }
};
