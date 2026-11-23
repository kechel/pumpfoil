/*
 * Einstellungsseite der Uhr (wie Zepp-Seite 4/4): Alarm an/aus, Grenzen vom Foil oder fest, Foil,
 * eigene Layouts und Touch-Sperre (Auto = wie im Profil). Der Zustand liegt im Recorder (app.js-Buendel,
 * R.auswahl) und wird dort gespeichert; diese Seite zeigt und schaltet nur.
 */
import router from "@system.router";
import file from "@system.file";

var R = null;

function holeRecorder() {
  try { var a = getApp(); return (a && a.data && a.data.R) || (a && a.R) || null; }
  catch (e) { console.error("Pumpfoil getApp: " + e); return null; }
}

export default {
  // eintraege: [{b: Begriff, z: Wert, n: "2/7", a: Aktion}] — eine Swiper-Seite je Eintrag, davor Seite 0 = zurueck.
  data: { eintraege: [], seite: 1, kroneWerte: ["0", "1", "2", "3", "4", "5", "6", "7", "8"], kroneStand: 4 },
  onInit() {
    R = holeRecorder();
    var keys = ["alarm", "thresholds", "autoFoil", "manual", "layoutsShort", "lock", "autoStart", "connect", "connected", "disconnect", "pairHint", "pairNoNet", "on", "off", "auto", "sport"];
    this.tx = {};
    for (var i = 0; i < keys.length; i++) this.tx[keys[i]] = this.$t("strings." + keys[i]);
    this.sports = [];
    this.zeigen();
    // Sportarten (Server ?sp=1, Standard vorn) liest die Seite selbst aus der Konfiguration: im app.js-Buendel ist
    // kein Platz mehr (s. recorder.js start). Eine Wahl gibt es erst ab zwei.
    var that0 = this;
    file.readText({ uri: "internal://app/konfig.json", success: function (d) {
      try { var l = JSON.parse(d.text).sports; if (l && l.length > 1) { that0.sports = l; that0.zeigen(); } } catch (e) { /* ohne */ }
    } });
    // Watch 3/4: waehrend die Seite offen ist, nachfragen, ob der Code eingeloest wurde
    if (R && R.direkt) {
      var that = this;
      this.dTakt = setInterval(function () { R.direkt.koppelnTakt(); that.zeigen(); }, 2000);
    }
  },
  onDestroy() { clearInterval(this.dTakt); },
  anAus(v) { return v ? this.tx.on : this.tx.off; },
  /** „Auto (An)" zeigt, was das Profil gerade ergibt — wie Zepp. */
  stufe(v, profil) { return v === null ? this.tx.auto + " (" + this.anAus(profil) + ")" : this.anAus(v); },
  zeigen() {
    if (!R) { this.eintraege = [{ b: "Kein Recorder (getApp)", z: "", n: "", a: "" }]; return; }
    var a = R.auswahl, k = R.konfig, f = a.foil(k), tx = this.tx, l = this.sports || [];
    var e = [];
    if (l.length > 1) e.push({ b: tx.sport, z: l[this.sportNr(l)].name, a: "sport" });
    e.push({ b: tx.alarm, z: this.anAus(a.alarm), a: "alarm" });
    e.push({ b: tx.thresholds, z: a.quelle === "foil" ? tx.autoFoil : tx.manual, a: "quelle" });
    e.push({ b: "Foil", z: f ? f.label : "–", a: "foil" });
    e.push({ b: tx.layoutsShort, z: this.stufe(a.layouts, k.layoutsServer !== undefined ? k.layoutsServer : k.layoutsOn), a: "layouts" });
    e.push({ b: tx.lock, z: this.stufe(a.sperre, k.waterLock === "on"), a: "sperre" });
    e.push({ b: tx.autoStart, z: this.stufe(a.start, k.autoStart), a: "start" });
    if (R.direkt) e.push({ b: "pumpfoil.org", z: R.direkt.text(tx), a: "direkt" });
    for (var i = 0; i < e.length; i++) e[i].n = (i + 1) + "/" + e.length;
    // Gleiche Anzahl: nur die Werte tauschen, damit der Swiper beim Tippen nicht neu aufgebaut wird.
    var alt = this.eintraege;
    if (alt.length !== e.length) { this.eintraege = e; return; }
    for (var j = 0; j < e.length; j++) { alt[j].b = e[j].b; alt[j].z = e[j].z; alt[j].n = e[j].n; alt[j].a = e[j].a; }
  },
  /** Stelle der gewaehlten Sportart; nicht (mehr) in der Liste = der Standard vorn. */
  sportNr(l) { for (var i = 0; i < l.length; i++) if (l[i].id === R.auswahl.sport) return i; return 0; },
  /** Weiterschalten im Kreis wie Watch 5; beim Standard wird die Wahl geloescht (gilt bis die App schliesst, nicht gespeichert). */
  sport() {
    var l = this.sports, n = (this.sportNr(l) + 1) % l.length;
    R.auswahl.sport = n ? l[n].id : null; this.zeigen();
  },
  // Krone: Fokus auf den unsichtbaren picker-view (s. auswahl.hml), jeder Rastschritt = eine Seite.
  onShow() { try { this.$refs.krone.rotation({ focus: true }); } catch (e) { console.error("Pumpfoil Krone: " + e); } },
  onHide() { try { this.$refs.krone.rotation({ focus: false }); } catch (e) { /* ohne */ } },
  krone(e) {
    var neu = e ? e.newSelected : 4, d = neu - this.kroneStand;
    // Nah am Rand des Pickers zurueck in die Mitte, damit die Krone nie anschlaegt.
    this.kroneStand = neu <= 1 || neu >= 7 ? 4 : neu;
    if (d) this.geheZu(this.seite + (d > 0 ? 1 : -1));
  },
  geheZu(n) {
    if (n > this.eintraege.length) n = this.eintraege.length;
    if (n <= 0) { this.zurueck(); return; }
    this.seite = n;
  },
  blatt(e) { if (e && e.index === 0) this.zurueck(); else if (e) this.seite = e.index; },
  zurueck() {
    if (this.weg) return;
    this.weg = true;
    router.replace({ uri: "pages/index/index" });
  },
  // Getippt wird immer die sichtbare Seite (ohne Parameter aus dem for — auf Lite ungeprueft).
  tippen() { var x = this.eintraege[this.seite - 1]; if (x && x.a && this[x.a]) this[x.a](); },
  aendern(fn) { fn(R.auswahl); R.auswahlAnwenden(); this.zeigen(); },
  alarm() { this.aendern(function (a) { a.alarm = !a.alarm; }); },
  quelle() { this.aendern(function (a) { a.quelle = a.quelle === "foil" ? "manual" : "foil"; }); },
  foil() { this.aendern(function (a) { a.naechstesFoil(R.konfig); }); },
  layouts() { this.aendern(function (a) { a.layouts = R.dreistufig(a.layouts); }); },
  sperre() { this.aendern(function (a) { a.sperre = R.dreistufig(a.sperre); }); },
  start() { this.aendern(function (a) { a.start = R.dreistufig(a.start); }); },
  direkt() { if (R && R.direkt) { R.direkt.tippen(); this.zeigen(); } },
  wischen(e) {
    // Rechts wischen = zurueck (AppGallery-Pflicht); hoch/runter blaettert der Swiper selbst.
    if (e && e.direction === "right") this.zurueck();
  }
};
