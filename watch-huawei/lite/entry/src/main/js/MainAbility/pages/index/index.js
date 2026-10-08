/*
 * Die eine Seite des Recorders. Logik in common/recorder.js + common/kern.js; hier nur Anzeige und
 * Bedienung — im Ablauf wie Zepp/Wear/Apple (Jan, 08.10.2026): START tippen; Pause/Fortsetzen und
 * STOPP 2 s halten (Profil stopMode „press": tippen); Verwerfen zweimal tippen.
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

/** Recorder aus dem app.js-Buendel: Lite gibt per getApp() nur dessen `data` heraus (Simulator 08.10.2026). */
function holeRecorder() {
  try { var a = getApp(); return (a && a.data && a.data.R) || (a && a.R) || null; }
  catch (e) { console.error("Pumpfoil getApp: " + e); return null; }
}

function zeitText(ms) {
  var s = Math.floor(ms / 1000);
  var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return (h > 0 ? h + ":" + (m < 10 ? "0" : "") : "") + m + ":" + (r < 10 ? "0" : "") + r;
}

// Seitenfolge waehrend der Aufnahme (wie Zepp): 0 Aktion, 1 STOPP, 2 … n+1 Daten, n+2 STOPP, n+3 Aktion.
function art(p, gesamt) {
  if (p === 0 || p === gesamt - 1) return "aktion";
  if (p === 1 || p === gesamt - 2) return "stopp";
  return "daten";
}

export default {
  data: {
    ansicht: "bereit", zeit: "0:00", strecke: "0.00 km", info: "", balken: 0, balkenZeigen: false,
    halten: true, tStart: "", tPause: "", tWeg: "", tStopp: "", tFertig: "", fZeit: "", fStrecke: "", fLaeufe: ""
  },
  onInit() {
    console.info("Pumpfoil Seite onInit");
    R = holeRecorder();
    if (!R) {
      // Ohne Recorder nichts weiter starten, aber SAGEN warum (Infozeile + Log), statt still leer zu bleiben.
      this.info = "Kein Recorder (getApp)";
      return;
    }
    // Texte einmal holen (jedes $t kostet auf der Uhr), Displaygroesse fuer die Promille-Koordinaten.
    var keys = ["start", "pause", "resume", "stop", "holding", "discard", "discarded", "paused", "errors",
      "gpsWait", "openPhone", "allSent", "noAccel", "done", "lock", "lockHold"];
    this.tx = {};
    for (var j = 0; j < keys.length; j++) this.tx[keys[j]] = this.$t("strings." + keys[j]);
    this.texte = {};
    for (var i = 0; i < FELDTEXTE.length; i++) this.texte[FELDTEXTE[i]] = this.$t("strings.f_" + FELDTEXTE[i]);
    this.texte.paused = this.tx.paused;
    this.tStart = this.tx.start;
    this.tFertig = this.tx.done;
    this.dw = 466; this.dh = 466; this.lite = true;
    this.seite = 2; this.zustandVorher = ""; this.haltAktion = ""; this.wegScharf = false;
    var that0 = this;
    device.getInfo({ success: function (d) {
      if (d.windowWidth > 0) { that0.dw = d.windowWidth; that0.dh = d.windowHeight; }
      that0.lite = d.deviceType !== "wearable";
      // Form fuer die Rand-Grafik: screenShape (rect|circle), sonst aus dem Seitenverhaeltnis
      that0.rund = d.screenShape ? d.screenShape !== "rect" : d.windowWidth === d.windowHeight;
      console.info("Pumpfoil Geraet " + d.deviceType + " " + d.windowWidth + "x" + d.windowHeight + " lite=" + that0.lite);
    } });
    // Scheitert der Start (z. B. ein Systemmodul fehlt), die Meldung auf die Uhr statt einer schwarzen Seite.
    try { R.init({ P2pClient: P2pClient, Message: Message, Builder: Builder }); } catch (e) { console.error("Pumpfoil init: " + e); this.startFehler = "init: " + e; }
    var that = this;
    this.takt = setInterval(function () { that.zeigen(); }, 1000);
    this.zeigen();
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
    if (R.takt()) this.seite = 2;   // Lauf begonnen/beendet -> erste Datenseite (wie Zepp)
    if (R.leerlauf()) {   // Auto-Start (Profil), wie Zepp
      this.seite = 2; this.zeigeFertig = false;
      if (R.konfig.waterLock === "on") this.gesperrt = true;
    }
    var z = R.zustand(), tx = this.tx;
    var pausiert = z.modus === "pause";
    this.zeit = (pausiert ? tx.paused + " " : "") + zeitText(z.ms);
    this.strecke = (z.m / 1000).toFixed(2) + " km";
    this.halten = R.konfig.stopMode !== "press";
    var zwei = this.halten ? " · 2 s" : "";
    var pa = this.haltAktion;
    this.tPause = pa === "pause" || pa === "weiter" ? tx.holding : (pausiert ? tx.resume : tx.pause) + zwei;
    this.tStopp = pa === "stopp" ? tx.holding : tx.stop + zwei;
    this.tWeg = this.wegScharf ? tx.discard + "?" : tx.discard;
    // Infozeile baut der Recorder (app.js-Buendel — die Seite liegt nah an 48 KB).
    this.info = this.startFehler || (this.sperrHinweis ? tx.lock + " · " + tx.lockHold : R.infoZeile(z, tx));
    this.sperreTakt(z.modus);
    // Balken nur ausserhalb der Aufnahme: waehrend der Fahrt gehen die Chunks laufend raus und
    // der Balken zappelte zwischen 1/2 und 2/2 — die Zahl in der Zeile reicht dort.
    this.balkenZeigen = z.modus === "bereit" && z.offen > 0 && z.plan.gesamt > 0;
    this.balken = z.plan.gesamt > 0 ? Math.floor(100 * z.plan.fertig / z.plan.gesamt) : 0;
    this.seiten();
  },
  /** Welche Seite der Folge gerade steht; Datenseiten zeichnen. */
  seiten() {
    if (R.modus === "bereit") {
      this.ansicht = this.zeigeFertig && R.letzte ? "fertig" : "bereit";
      if (this.ansicht === "fertig") {
        var l = R.letzte;
        // Strecke gross, Schnitt + Laeufe klein darunter (zusammen war die Zeile zu breit, 08.10.2026)
        this.fZeit = zeitText(l.ms); this.fStrecke = l.km; this.fLaeufe = l.kmh + " · " + l.laeufe + " " + this.texte.runs;
      }
      this.seite = 2; this.zustandVorher = "";
      return;
    }
    var c = R.seitenKontext();
    // Pause <-> Fahrt: auf die erste Datenseite des neuen Zustands (wie Zepp/Wear).
    if (c.zustand !== this.zustandVorher) {
      if (this.zustandVorher === "p" || c.zustand === "p") this.seite = 2;
      this.zustandVorher = c.zustand;
    }
    var ring = S.ring(c.k, c.zustand);
    var gesamt = ring.length + 4;
    if (this.seite > gesamt - 1) this.seite = gesamt - 1;
    if (this.seite < 0) this.seite = 0;
    this.ansicht = art(this.seite, gesamt);
    if (this.ansicht !== "daten") return;
    var that = this;
    var ctx = { dw: this.dw, dh: this.dh, rund: this.rund !== false, s: c.s, el: c.el, k: c.k, jetzt: new Date(), pausiert: c.pausiert,
      idx: this.seite - 2, anzahl: ring.length, t: function (k) { return that.texte[k] || k; } };
    var b = S.zeichne(ring[this.seite - 2], ctx);
    // Touch-Sperre auf den Datenseiten sichtbar (wie Zepps Zeile unten), beim Antippen mit Anleitung
    if (this.gesperrt) b.push({ k: "t", x: this.dw / 2, y: Math.round(this.dh * 0.86), s: 30, c: "#fbbf24", a: "c",
      txt: this.sperrHinweis ? this.tx.lockHold : this.tx.lock, b: false });
    this.malen(b);
  },
  /** Zeichenbefehle ausfuehren — der Zeichner liegt im app.js-Buendel (common/maler.js), die Seite ist knapp. */
  malen(befehle) {
    var el = this.$refs.leinwand;
    if (el) R.malen(el.getContext("2d"), befehle, this.lite);
  },
  // --- Bedienung -----------------------------------------------------------------------------
  /** Zusammenfassung schliessen (FERTIG tippen oder rechts wischen, wie Wear SavedScreen). */
  fertig() { this.zeigeFertig = false; this.zeigen(); },
  // --- Touch-Sperre wie Zepp (Profil waterLock „on"): bei Start gesperrt, nach 10 s ohne Bedienung wieder.
  // Gesperrt tut Tippen/Wischen nichts ausser einem Hinweis; langes Halten (irgendwo) entsperrt.
  sperreTakt(modus) {
    if (modus === "bereit") { this.gesperrt = false; this.sperrHinweis = false; return; }
    if (R.konfig.waterLock !== "on" || this.gesperrt) return;
    if (Date.now() - (this.letzteBedienung || 0) > 10000) { this.gesperrt = true; console.info("Pumpfoil Touch-Sperre"); }
  },
  /** true = gesperrt, die Bedienung wird geschluckt (und erklaert). */
  sperre() {
    if (!this.gesperrt) { this.letzteBedienung = Date.now(); return false; }
    var that = this;
    this.sperrHinweis = true;
    clearTimeout(this.hinweisUhr);
    this.hinweisUhr = setTimeout(function () { that.sperrHinweis = false; that.zeigen(); }, 3000);
    this.zeigen();
    return true;
  },
  entsperren() {
    if (!this.gesperrt) return;
    this.gesperrt = false; this.sperrHinweis = false; this.letzteBedienung = Date.now();
    try { vibrator.vibrate({ mode: "short" }); } catch (e) { /* ohne Vibrator */ }
    console.info("Pumpfoil entsperrt");
    this.zeigen();
  },
  seiteTipp() { this.sperre(); },
  starten() {
    if (R.modus !== "bereit") return;
    this.zeigeFertig = false;
    this.seite = 2;
    this.ausfuehren("start");
    if (R.konfig.waterLock === "on") this.gesperrt = true;   // wie Zepp: sperrt gleich beim Start
  },
  /** 2 s halten (Pause/Fortsetzen, STOPP). Der Knopf zeigt „Halten …", bis es ausloest. */
  halteStart(aktion) {
    var that = this;
    console.info("Pumpfoil halten " + aktion);
    clearTimeout(this.haltUhr);
    this.haltAktion = aktion;
    this.zeigen();
    this.haltUhr = setTimeout(function () { that.haltAktion = ""; that.ausfuehren(aktion); }, HALTEN_MS);
  },
  pauseAktion() { return R.modus === "pause" ? "weiter" : "pause"; },
  pauseHalten() { if (!this.sperre()) this.halteStart(this.pauseAktion()); },
  stoppHalten() { if (!this.sperre()) this.halteStart("stopp"); },
  loslassen() {
    if (this.haltAktion) console.info("Pumpfoil losgelassen");
    clearTimeout(this.haltUhr);
    this.haltAktion = "";
    this.zeigen();
  },
  // LONGPRESS ALS ERSATZ (08.10.2026, Simulator): touchstart/touchend kamen dort unzuverlaessig an
  // (touchend sofort), longpress dagegen sicher. Laeuft das 2-s-Halten (Touch kam an), zaehlt nur das;
  // sonst loest das System-longpress (~1 s) die Aktion aus. Ein Aermelstreifer loest nichts aus.
  lang(aktion) {
    if (this.gesperrt) { this.entsperren(); return; }   // gesperrt: langes Halten heisst entsperren
    console.info("Pumpfoil longpress " + aktion + (this.haltAktion ? " (Halten laeuft, ignoriert)" : ""));
    if (this.haltAktion) return;
    this.ausfuehren(aktion);
  },
  pauseLang() { this.lang(this.pauseAktion()); },
  stoppLang() { this.lang("stopp"); },
  // Profil stopMode „press": ein Tipp genuegt (wie die anderen Uhren).
  pauseTipp() { if (!this.sperre()) this.ausfuehren(this.pauseAktion()); },
  stoppTipp() { if (!this.sperre()) this.ausfuehren("stopp"); },
  /** Verwerfen wie Zepp: erster Tipp macht scharf („Verwerfen?"), zweiter binnen 4 s verwirft. */
  verwerfenTipp() {
    if (this.sperre()) return;
    var that = this;
    clearTimeout(this.wegUhr);
    if (this.wegScharf) { this.wegScharf = false; this.ausfuehren("verwerfen"); return; }
    this.wegScharf = true;
    this.wegUhr = setTimeout(function () { that.wegScharf = false; that.zeigen(); }, 4000);
    this.zeigen();
  },
  ausfuehren(aktion) {
    // Rumpeln darf die Aktion nie verhindern (im Simulator/auf manchen Uhren evtl. ohne Vibrator).
    try { vibrator.vibrate({ mode: "short" }); } catch (e) { console.error("Pumpfoil vibrate: " + e); }
    console.info("Pumpfoil Aktion " + aktion);
    try { R[aktion](); } catch (e) { console.error("Pumpfoil " + aktion + ": " + e); this.startFehler = aktion + ": " + e; }
    if (aktion === "stopp") this.zeigeFertig = true;   // Verwerfen: keine Zusammenfassung (wie Zepp/Wear)
    this.zeigen();
  },
  wischen(e) {
    var d = e && e.direction;
    console.info("Pumpfoil wischen " + d);
    if (R.modus === "bereit") {
      // Nach rechts wischen beendet die App (AppGallery verlangt das) — nur ausserhalb einer Aufnahme.
      // Steht die Zusammenfassung, schliesst es erst diese.
      if (d === "right") { if (this.zeigeFertig) this.fertig(); else app.terminate(); }
      return;
    }
    if (this.sperre()) return;
    // Hoch = weiter, runter = zurueck, ohne Umlauf (wie Zepp). Rechts = zur STOPP-Seite (wie Zepp BACK).
    if (d === "up") this.seite++;
    else if (d === "down") this.seite--;
    else if (d === "right") this.seite = 1;
    else return;
    this.zeigen();
  }
};
