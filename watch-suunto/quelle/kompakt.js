/*
 * Kompakte Konfiguration lesen und sicher speichern (Gegenstueck: server/app/kompakt_config.py,
 * Testvektoren test/fixtures/kompakt.json).
 *
 * Speicher: `localStorage`/`data.json` der SuuntoPlus-App ist klein (~2 KB, Jan/Google-KI, nicht
 * dokumentiert) und kennt KEINE Abfrage des belegten Platzes (Referenz: nur setItem/getItem/setObject/
 * getObject). Darum fuehrt die App selbst Buch ueber IHRE Schluessel und speichert die Konfiguration
 * nur, wenn sie ins Budget passt — sonst gekuerzt: erst Pausen-Seiten weg, dann die Seiten zwischen den
 * Laeufen, dann die Foils, dann freie Layouts als klassische Seiten, zuletzt ganz ohne Seiten.
 * Angezeigt wird trotzdem die volle Konfiguration (sie liegt im RAM), bis die App neu startet.
 */
var SPEICHER_MAX = 2000;           // Bytes, die wir dem Datenspeicher hoechstens zutrauen
var SPEICHER_RESERVE = 200;        // fuer Verwaltungsdaten der Firmware (unbekannt)
var KOMPAKT_KEY = "k";
// Schluessel, die die App selbst ablegt oder aus data.json liest (Einstellungen der Suunto-App)
var EIGENE_KEYS = ["handy", "hz", "sprache", "uhrId"];

var KOMPAKT_CODES = { v: "views", o: "offFoilView", p: "pauseView", b: "browseAll", f: "foils",
  ae: "alarmEnabled", ad: "alarmDefault", sl: "speedLow", sh: "speedHigh", hh: "hrHigh",
  ph: "alarmPatternHigh", pl: "alarmPatternLow", pr: "alarmPatternHr", ar: "alarmRepeat",
  as: "alarmRepeatS", dm: "runDistM", dd: "runDistMode", pd: "alarmPatternDist", tm: "runTimeS",
  td: "runTimeMode", pt: "alarmPatternTime", lo: "layoutsOn", lv: "latestVersion", cv: "colorByValue",
  hz: "hrZones", sz: "speedZones", P: "pages", F: "offFoilPages", Q: "pausePages", s: "spr" };

/** "1,4;1,dw,8c,…" bzw. "0,1,k,e" -> [1,4,[[…],…]] bzw. [0,1,20,14]. */
var kompaktSeite = function (t) {
  var teile = String(t).split(";"), kopf = teile[0].split(","), i, j;
  var zahl = function (x) { return x.charAt(0) === "~" ? x.substring(1) : parseInt(x, 36); };
  if (kopf[0] === "0") { var k = []; for (j = 0; j < kopf.length; j++) k.push(zahl(kopf[j])); return k; }
  var els = [];
  for (i = 1; i < teile.length; i++) {
    var e = teile[i].split(","), z = [];
    for (j = 0; j < e.length; j++) z.push(zahl(e[j]));
    els.push(z);
  }
  return [1, zahl(kopf[1] || "0"), els];
};

/** Kompakter Text -> Konfiguration mit den Namen, die lauf.js `Konfig` erwartet ("s" -> "std"). */
var kompaktLesen = function (text) {
  var k = JSON.parse(text), o = {}, c, v, i;
  for (c in k) {
    var lang = KOMPAKT_CODES[c];
    if (!lang) continue;
    v = k[c];
    if (lang === "pages" || lang === "offFoilPages" || lang === "pausePages") {
      if (v === "s") v = "std";
      else { var s = []; for (i = 0; i < v.length; i++) s.push(kompaktSeite(v[i])); v = s; }
    } else if (lang === "foils") {
      var f = [];
      for (i = 0; i < v.length; i++) f.push({ id: v[i].i, label: v[i].l, min: v[i].a, max: v[i].b });
      v = f;
    }
    o[lang] = v;
  }
  return o;
};

/** Laenge eines gespeicherten Werts (Text oder Objekt), 0 wenn nicht da. */
var speicherWert = function (key) {
  var v = null;
  try { v = localStorage.getItem(key); } catch (e) { v = null; }
  if (v === null || v === undefined) {
    try { v = localStorage.getObject(key); if (v !== null && v !== undefined) v = JSON.stringify(v); } catch (e2) { v = null; }
  }
  return v === null || v === undefined ? 0 : String(v).length;
};

/** Was die App schon belegt (ohne die Konfiguration selbst): Schluessel + Wert + ~6 Bytes JSON je Eintrag. */
var speicherBelegt = function () {
  var n = 0, i, l;
  for (i = 0; i < EIGENE_KEYS.length; i++) {
    l = speicherWert(EIGENE_KEYS[i]);
    if (l) n += EIGENE_KEYS[i].length + l + 6;
  }
  return n;
};

/** Klassische Seite aus einem freien Layout: die ersten drei Wert-Elemente von oben nach unten. */
var kompaktKlassisch = function (t) {
  var s = kompaktSeite(t), w = [], i;
  if (s[0] === 0) return t;
  for (i = 0; i < s[2].length; i++) if (s[2][i][0] === 1 && s[2][i].length > 6) w.push([s[2][i][2], s[2][i][6]]);
  w.sort(function (a, b) { return a[0] - b[0]; });
  return "0," + [0, 1, 2].map(function (j) { return w[j] ? w[j][1].toString(36) : "0"; }).join(",");
};

/**
 * Kompakten Text speichern, gekuerzt bis er ins Budget passt. Gibt den gespeicherten Text zurueck
 * (oder null, wenn nicht einmal der Rest passt / das Speichern scheitert).
 */
var kompaktSpeichern = function (text) {
  var budget = SPEICHER_MAX - SPEICHER_RESERVE - speicherBelegt() - KOMPAKT_KEY.length - 6;
  var k, schritte = ["Q", "F", "f", "P*", "P"], i, s = text;
  if (s.length > budget) {
    try { k = JSON.parse(text); } catch (e) { return null; }
    for (i = 0; i < schritte.length && s.length > budget; i++) {
      var c = schritte[i];
      if (c === "P*") {
        if (k.P && k.P !== "s") { var kl = []; for (var j = 0; j < k.P.length; j++) kl.push(kompaktKlassisch(k.P[j])); k.P = kl; }
      } else delete k[c];
      s = JSON.stringify(k);
    }
    if (s.length > budget) return null;
  }
  try { localStorage.setItem(KOMPAKT_KEY, s); } catch (e2) { return null; }
  return s;
};
