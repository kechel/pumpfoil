// Seiten-Ring je Zustand — aus der QUELLE geschnitten, nicht abgetippt.
//
//     node tests/ring.test.mjs
//
// WOZU: bis 25.09.2026 kannte der Ring nur zwei Zustaende (auf dem Foil / zwischen den Laeufen).
// In der manuellen Pause blaetterte man deshalb durch die normalen Datenseiten und sah keine
// Pausen-Seite (Jan am Emulator). Vorlage ist Garmin (watch/source/RecordView.mc:_state/_ring):
// pausiert sticht alles, und bei „alle Seiten" haengen die uebrigen Saetze hinten dran.
import { readFileSync } from "node:fs";

const quelle = readFileSync(new URL("../page/index.js", import.meta.url), "utf8");
function schneide(name) {
  const start = quelle.indexOf(`    ${name}(`);
  if (start < 0) throw new Error(name + " nicht gefunden");
  let tiefe = 0;
  for (let j = quelle.indexOf("{", start); j < quelle.length; j++) {
    if (quelle[j] === "{") tiefe++;
    else if (quelle[j] === "}" && --tiefe === 0) return quelle.slice(start, j + 1);
  }
  throw new Error(name + " nicht abgeschlossen");
}
const teile = ["_useLayouts", "_zustand", "_setFor", "_ring"].map(schneide).join(",\n");
const bauen = new Function(`return { ${teile} };`);

const ON = [1, 10, [[1, 500, 500, 2, 0, 0, 1]]];
const OFF = [1, 20, [[1, 500, 500, 2, 0, 0, 16]]];
const PAUSE = [1, 30, [[7, 500, 100, 1, 0, 0], [1, 500, 500, 2, 0, 0, 12]]];

function uhr(z) {
  const o = bauen();
  o.state = Object.assign({
    layoutsPref: null, layoutsServerDefault: true,
    views: [[1, 3, 4]], offFoil: [12, 17, 16], pauseView: [12, 20, 2],
    pages: [ON], offFoilPages: [OFF], pausePages: [PAUSE],
    browseAll: true, paused: false, foiling: false, _ringCache: null, _ringKey: null,
  }, z);
  return o;
}
let fehler = 0;
const pruefe = (n, ok) => { if (!ok) fehler++; console.log(`${ok ? "  ok  " : "  FEHL"} ${n}`); };
const bg = (ring) => ring.map((e) => (e[0] === 1 ? e[1] : "k")).join(",");

pruefe("auf dem Foil: nur die On-Foil-Seiten", bg(uhr({ foiling: true })._ring()) === "10");
pruefe("zwischen den Laeufen + alle Seiten: Off, dann On", bg(uhr({})._ring()) === "20,10");
pruefe("PAUSIERT + alle Seiten: Pause, On, Off", bg(uhr({ paused: true })._ring()) === "30,10,20");
pruefe("pausiert sticht das Foil", bg(uhr({ paused: true, foiling: true })._ring()) === "30,10,20");
pruefe("pausiert ohne alle Seiten: nur Pause",
  bg(uhr({ paused: true, browseAll: false })._ring()) === "30");

const klassisch = uhr({ paused: true, browseAll: false, layoutsPref: false })._ring();
pruefe("Layouts aus: klassische Pausen-Ansicht aus pauseView",
  klassisch.length === 1 && klassisch[0].join(",") === "0,12,20,2");
const ohne = uhr({ paused: true, browseAll: false, pausePages: [] })._ring();
pruefe("keine Pausen-Layouts geliefert: klassische Pausen-Ansicht",
  ohne.length === 1 && ohne[0].join(",") === "0,12,20,2");

// Der Cache darf den Zustandswechsel nicht verschlucken: derselbe Ring-Schluessel fuer
// „pausiert" und „laeuft" haette nach dem Pausieren die alten Seiten stehen lassen.
const u = uhr({});
const vorher = bg(u._ring());
u.state.paused = true;
pruefe("Cache folgt dem Pausieren", vorher === "20,10" && bg(u._ring()) === "30,10,20");
u.state.paused = false;
pruefe("Cache folgt dem Fortsetzen", bg(u._ring()) === "20,10");

console.log(fehler ? `\n${fehler} FEHLER` : "\nalle Faelle gruen");
process.exit(fehler ? 1 : 0);
