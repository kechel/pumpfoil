// Nur fuer Tests: Konfiguration -> kompakter Text wie server/app/kompakt_config.py (die echte Kodierung
// macht der Server; test/kompakt.test.mjs prueft die Uhr gegen dessen Testvektoren).
const CODES = { views: "v", offFoilView: "o", pauseView: "p", browseAll: "b", foils: "f", alarmEnabled: "ae",
  speedHigh: "sh", layoutsOn: "lo", latestVersion: "lv", colorByValue: "cv", hrZones: "hz", speedZones: "sz",
  pages: "P", offFoilPages: "F", pausePages: "Q", spr: "s" };
const b36 = (n) => Math.round(n).toString(36);
function seite(s) {
  if (s[0] === 0) return s.map(b36).join(",");
  return ["1," + b36(s[1])].concat(s[2].map((e) => e.map((x) => (typeof x === "string" ? "~" + x : b36(x))).join(","))).join(";");
}
export function kompaktVon(k) {
  const o = {};
  for (const [lang, v] of Object.entries(k)) {
    const c = CODES[lang];
    if (!c) throw new Error("Testhilfe kennt " + lang + " nicht");
    if (["pages", "offFoilPages", "pausePages"].includes(lang)) o[c] = v === "std" ? "s" : v.map(seite);
    else if (lang === "foils") o[c] = v.map((f) => ({ i: f.id, l: f.label, a: f.min, b: f.max }));
    else o[c] = v;
  }
  return JSON.stringify(o);
}
